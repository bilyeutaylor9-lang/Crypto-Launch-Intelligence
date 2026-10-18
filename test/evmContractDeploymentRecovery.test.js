import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
  EvmContractDeploymentAdapter,
  fetchEvmContractDeployments,
  nativeContractDeployerEvidence,
} from "../src/data/native/evm/evmContractDeploymentConnector.js";
import {
  createEvmFactoryAdapters,
  EvmFactoryEventAdapter,
  getEvmFactoryEventCandidates,
} from "../src/data/native/evm/evmFactoryEventConnector.js";
import { buildNativeLifecycle, nativeCandidateFromLifecycle, runNativeDiscoveryMesh } from "../src/data/native/nativeDiscoveryMesh.js";
import { NATIVE_EVENT_TYPES, normalizeNativeEvent } from "../src/data/native/NativePoolAdapter.js";

const RPC = "https://deployment.invalid";
const SENDER = `0x${"11".repeat(20)}`;
const CONTRACT = `0x${"22".repeat(20)}`;
const OTHER = `0x${"33".repeat(20)}`;
const config = { id: "evm-contract-deployments", chain: "multi-evm", family: "evm-deployment", rpcUrl: RPC };
const hex = (value) => `0x${value.toString(16)}`;
const hash = (value) => `0x${value.toString(16).padStart(64, "0")}`;

function transaction(number = 10, index = 0, overrides = {}) {
  return {
    hash: hash(number * 100 + index), blockNumber: hex(number), blockHash: hash(number),
    transactionIndex: hex(index), chainId: "0x2105", from: SENDER, to: null,
    ...overrides,
  };
}

function block(number = 10, transactions = [transaction(number)]) {
  return { number: hex(number), hash: hash(number), parentHash: hash(number - 1),
    timestamp: hex(1_700_000_000 + number), transactions };
}

function receipt(tx = transaction(), overrides = {}) {
  return {
    transactionHash: tx.hash, blockNumber: tx.blockNumber, blockHash: tx.blockHash,
    transactionIndex: tx.transactionIndex, chainId: tx.chainId,
    from: tx.from, to: null, status: "0x1", contractAddress: CONTRACT,
    ...overrides,
  };
}

function fixture({ blocks = { 10: block() }, receipts = {}, overrides = {}, head = 10 } = {}) {
  const calls = [];
  const rpc = async (url, method, params, options) => {
    calls.push({ url, method, params, options });
    if (Object.hasOwn(overrides, method)) {
      return typeof overrides[method] === "function" ? overrides[method](params) : structuredClone(overrides[method]);
    }
    if (method === "eth_chainId") return "0x2105";
    if (method === "eth_blockNumber") return hex(head);
    if (method === "eth_getBlockByNumber") return structuredClone(blocks[Number(params[0])] || block(Number(params[0]), []));
    if (method === "eth_getTransactionReceipt") {
      if (Object.hasOwn(receipts, params[0])) return structuredClone(receipts[params[0]]);
      const tx = Object.values(blocks).flatMap((item) => item.transactions).find((item) => item.hash === params[0]);
      return tx ? receipt(tx) : null;
    }
    if (method === "eth_getCode") return "0x6000";
    throw new Error(`Unexpected RPC method ${method}`);
  };
  return { calls, rpc };
}

async function collect(options = {}, data = {}, lane = config) {
  const f = fixture(data);
  const result = await fetchEvmContractDeployments(lane, { fromBlock: 10, persist: false, ...options, jsonRpc: f.rpc });
  return { ...f, result };
}

test("configured RPC-only deployment lane selects the real adapter and emits raw exact contract metadata", async () => {
  const env = { EVM_DEPLOYMENT_RADAR_RPC_URL: RPC, NATIVE_PUBLIC_RPC_FALLBACKS: "false" };
  const options = { env, chains: "base", usePublicRpcFallbacks: false };
  const adapters = createEvmFactoryAdapters(options);
  const adapter = adapters.find((item) => item.config.id === config.id);
  assert.ok(adapter instanceof EvmContractDeploymentAdapter);
  assert.equal(adapter.config.configured, true);
  assert.equal(adapter.config.factoryAddress, null);
  assert.equal(adapter.config.eventTopic0, null);
  assert.ok(adapters.filter((item) => item.config.family === "evm-factory").every((item) => item instanceof EvmFactoryEventAdapter));
  const f = fixture();
  const result = await getEvmFactoryEventCandidates({
    ...options, jsonRpc: f.rpc, fromBlock: 10, persist: false, checkpoints: {},
    fetchImpl: async () => { throw new Error("Factory log collector must not run for the RPC-only lane"); },
  });
  const report = result.report.adapters.find((item) => item.source === config.id);
  assert.equal(report.status, "OK");
  assert.equal(report.chain, "base");
  assert.equal(report.toBlock, 10);
  assert.equal(report.requests, 4);
  assert.equal(result.events.length, 1);
  const event = result.events[0];
  assert.equal(event.eventType, "CONTRACT_DEPLOYED");
  assert.equal(event.raw.contractAddress, CONTRACT);
  assert.equal(event.raw.deployer, SENDER);
  assert.equal(event.creator, SENDER);
  assert.equal(event.deployer, SENDER);
  assert.equal(event.chain, "base");
  assert.equal(event.chainId, 8453);
  assert.equal(event.transactionHash, transaction().hash);
  assert.equal(event.blockNumber, 10);
  assert.equal(event.exactIdentityEvidence.blockHash, hash(10));
  assert.equal(event.timestamp, new Date(1_700_000_010_000).toISOString());
  assert.deepEqual(f.calls.map((item) => item.method), ["eth_chainId", "eth_blockNumber", "eth_getBlockByNumber", "eth_getTransactionReceipt"]);
  assert.deepEqual(f.calls[2].params, ["0xa", true]);
  assert.ok(f.calls.every((item) => item.options.retries === 0 && item.options.timeoutMs <= 5_000));
});

test("generic receipt proof never invents token, pool, safety, or trading evidence", async () => {
  const { result } = await collect();
  const event = result.events[0];
  for (const field of ["tokenAddress", "baseToken", "poolAddress", "quoteToken", "factoryAddress"]) assert.equal(event[field], "");
  for (const field of ["name", "symbol", "decimals", "verifiedERC20", "verifiedSource", "nativeDiscoveryScore", "bullishScore"]) {
    assert.equal(event[field], undefined);
    assert.equal(event.raw[field], undefined);
  }
  assert.equal(event.finalized, false);
  assert.equal(event.raw.tokenKind, "UNKNOWN");
  assert.equal(event.raw.tradabilityStatus, "UNKNOWN");
  assert.equal(event.raw.safetyStatus, "UNKNOWN");
  assert.equal(event.raw.quarantined, true);
  assert.equal(event.raw.quarantineReason, "TOKEN_KIND_UNVERIFIED");
  assert.equal(event.raw.codeStatus, "NOT_CHECKED");
  assert.equal(buildNativeLifecycle(result.events), null);
  assert.equal(nativeCandidateFromLifecycle({ projectId: event.projectId }), null);
  assert.equal(nativeCandidateFromLifecycle({ ...event, tokenAddress: CONTRACT }), null);
});

test("only generic contract observations preserve absent market, buyer and liquidity fields as null", async () => {
  const event = (await collect()).result.events[0];
  const repeated = normalizeNativeEvent(normalizeNativeEvent(event));
  for (const field of ["initialLiquidityUsd", "activeLiquidityUsd", "displayedLiquidityUsd", "stableExitLiquidityUsd",
    "uniqueBuyers", "uniqueSellers", "independentBuyers", "sameFunderBuyers", "sniperBuyers", "buyVolumeUsd", "sellVolumeUsd",
    "deployerNetFlow", "liquidityChange"]) {
    assert.equal(event[field], null, field);
    assert.equal(repeated[field], null, field);
    assert.equal(normalizeNativeEvent({ eventType: "POOL_CREATED" })[field], 0, field);
  }
  assert.equal(NATIVE_EVENT_TYPES.CONTRACT_DEPLOYED, "CONTRACT_DEPLOYED");
  assert.equal(normalizeNativeEvent({ ...event, uniqueBuyers: 0 }).uniqueBuyers, 0);
});

test("generic observations never enter candidate conversion or contaminate independently observed pool lifecycle", async () => {
  const event = (await collect()).result.events[0];
  const injectedToken = { ...event, tokenAddress: CONTRACT, poolAddress: OTHER };
  const rawOnly = await runNativeDiscoveryMesh({ events: [injectedToken], persist: false, skipStore: true });
  assert.deepEqual(rawOnly.candidates, []);
  assert.deepEqual(rawOnly.lifecycles, []);
  assert.equal(rawOnly.contractEvents.length, 1);
  assert.equal(rawOnly.report.genericContractEventCount, 1);
  assert.equal(rawOnly.report.lifecycleEventCount, 0);
  assert.equal(rawOnly.contractEvents[0].uniqueBuyers, null);
  const pool = { eventType: "POOL_CREATED", chain: "base", protocol: "test-dex", tokenAddress: CONTRACT,
    poolAddress: OTHER, projectId: event.projectId, uniqueBuyers: 7, independentBuyers: 7 };
  const lifecycle = buildNativeLifecycle([event, pool]);
  assert.equal(lifecycle.eventCount, 1);
  assert.equal(lifecycle.deployer, "");
  assert.equal(lifecycle.buyerState.uniqueBuyers, 7);
  assert.ok(nativeCandidateFromLifecycle(lifecycle));
  const mixed = await runNativeDiscoveryMesh({ events: [event, pool], persist: false, skipStore: true });
  assert.equal(mixed.candidates.length, 1);
  assert.equal(mixed.report.genericContractEventCount, 1);
  assert.equal(mixed.report.lifecycleEventCount, 1);
  assert.equal(mixed.candidates[0].uniqueBuyers24h, 7);
});

test("pure native creator evidence preserves exact provenance and unfinalized status without token certification", async () => {
  const events = (await collect()).result.events;
  const before = structuredClone(events);
  const project = { chain: "base", tokenAddress: CONTRACT };
  const evidence = nativeContractDeployerEvidence(project, events);
  assert.equal(evidence.provider, "native-contract-deployment");
  assert.equal(evidence.responseIdentityVerified, true);
  assert.equal(evidence.creatorAddress, SENDER);
  assert.equal(evidence.address, CONTRACT);
  assert.equal(evidence.deploymentTransactionHash, transaction().hash);
  assert.equal(evidence.creationBlockNumber, 10);
  assert.equal(evidence.contractCreationTimestamp, events[0].timestamp);
  assert.equal(evidence.observedAt, events[0].observedAt);
  assert.equal(evidence.finalized, false);
  assert.equal(evidence.provenance.finalityStatus, "UNFINALIZED");
  assert.equal(evidence.provenance.blockHash, hash(10));
  assert.equal(evidence.provenance.receiptStatus, "0x1");
  assert.equal(evidence.tokenKind, "UNKNOWN");
  assert.equal(evidence.safetyStatus, "UNKNOWN");
  assert.equal(evidence.verifiedERC20, undefined);
  assert.equal(evidence.verifiedSource, undefined);
  assert.equal(evidence.nativeLifecycle, undefined);
  assert.deepEqual(nativeContractDeployerEvidence(project, events), evidence);
  assert.deepEqual(events, before);
});

test("creator evidence rejects every inconsistent normalized, raw and exact proof identity without sender fallbacks", async () => {
  const event = (await collect()).result.events[0];
  const project = { chain: "base", tokenAddress: CONTRACT };
  const fields = [
    ["chain", "bsc"], ["chainId", 56], ["contractAddress", OTHER], ["from", OTHER],
    ["blockHash", hash(999)], ["transactionHash", hash(999)], ["to", OTHER],
    ["receiptStatus", "0x0"], ["creationKind", "INTERNAL_CREATE"],
  ];
  for (const layer of [null, "raw", "exactIdentityEvidence"]) {
    const mismatches = [...fields, [layer ? "creationBlockNumber" : "blockNumber", 11],
      [layer ? "transactionIndex" : "eventIndex", 1],
      [layer ? "contractCreationTimestamp" : "timestamp", "2020-01-01T00:00:00Z"],
      ["deployer", OTHER], ["finalized", layer ? true : "true"]];
    for (const [field, value] of mismatches) {
      const mutated = structuredClone(event);
      (layer ? mutated[layer] : mutated)[field] = value;
      assert.equal(nativeContractDeployerEvidence(project, [mutated]), null, `${layer || "normalized"}.${field}`);
      const missing = structuredClone(event);
      delete (layer ? missing[layer] : missing)[field];
      assert.equal(nativeContractDeployerEvidence(project, [missing]), null, `missing ${layer || "normalized"}.${field}`);
    }
  }
  for (const patch of [
    { creator: OTHER }, { projectId: `base:contract:${OTHER}` }, { protocol: "factory-events" },
    { factoryAddress: OTHER }, { raw: null }, { exactIdentityEvidence: null }, { observedAt: "unknown" },
    { from: undefined, owner: SENDER }, { from: undefined, sender: SENDER },
  ]) assert.equal(nativeContractDeployerEvidence(project, [{ ...event, ...patch }]), null);
  for (const invalid of [{ chain: "bsc", tokenAddress: CONTRACT }, { ...project, contractAddress: OTHER },
    { ...project, chainId: 56 }, { ...project, network: "bsc" }, { chain: "base" }]) {
    assert.equal(nativeContractDeployerEvidence(invalid, [event]), null);
  }
  assert.equal(nativeContractDeployerEvidence(project, null), null);
  const conflicting = structuredClone(event);
  conflicting.blockHash = conflicting.raw.blockHash = conflicting.exactIdentityEvidence.blockHash = hash(999);
  assert.equal(nativeContractDeployerEvidence(project, [event, conflicting]), null);
});

test("operator-confirmed outer flags preserve reusable creation identity without upgrading chain finality", async () => {
  const event = normalizeNativeEvent({ ...(await collect()).result.events[0], finalized: true });
  assert.equal(event.finalized, true);
  assert.equal(event.raw.finalized, false);
  assert.equal(event.exactIdentityEvidence.finalized, false);
  const evidence = nativeContractDeployerEvidence({ chain: "base", tokenAddress: CONTRACT }, [event]);
  assert.equal(evidence.creatorAddress, SENDER);
  assert.equal(evidence.finalized, false);
  assert.equal(evidence.provenance.finalized, false);
  assert.equal(evidence.provenance.finalityStatus, "UNFINALIZED");
  assert.equal(evidence.provenance.storedEventFinalized, true);
});

test("stored future observation timestamps fail closed independently of consistent creation receipt metadata", async () => {
  const event = (await collect()).result.events[0];
  const project = { chain: "base", tokenAddress: CONTRACT };
  const cutoff = Date.parse(event.observedAt);
  assert.ok(nativeContractDeployerEvidence(project, [event], cutoff));
  assert.equal(nativeContractDeployerEvidence(project, [event], cutoff - 1), null);
  const futureObservation = { ...event, observedAt: new Date(Date.now() + 60_000).toISOString() };
  assert.equal(nativeContractDeployerEvidence(project, [futureObservation]), null);
  assert.equal(nativeContractDeployerEvidence(project, [{ ...futureObservation, finalized: true }]), null);
  const coherentFuture = structuredClone(event);
  const future = new Date(Date.now() + 3_600_000).toISOString();
  coherentFuture.observedAt = coherentFuture.timestamp = future;
  coherentFuture.raw.contractCreationTimestamp = coherentFuture.exactIdentityEvidence.contractCreationTimestamp = future;
  assert.equal(nativeContractDeployerEvidence(project, [coherentFuture]), null);
  for (const invalid of [NaN, Infinity, -1, null, "2099-01-01T00:00:00Z"]) {
    assert.equal(nativeContractDeployerEvidence(project, [event], invalid), null);
  }
});

test("collection disabled or unconfigured makes no RPC calls, even with supplied factory logs", async () => {
  const { result, calls } = await collect({ collect: false, logs: [{ tokenAddress: CONTRACT }] });
  assert.equal(result.status, "COLLECTION_DISABLED");
  assert.equal(calls.length, 0);
  assert.equal(result.events.length, 0);
  const unconfigured = await collect({}, {}, { ...config, rpcUrl: null });
  assert.equal(unconfigured.result.status, "NOT_CONFIGURED");
  assert.equal(unconfigured.calls.length, 0);
  const f = fixture();
  const integration = await getEvmFactoryEventCandidates({
    env: { EVM_DEPLOYMENT_RADAR_RPC_URL: RPC }, chains: "base", usePublicRpcFallbacks: false,
    jsonRpc: f.rpc, collect: false, persist: false,
    fetchImpl: async () => { throw new Error("Unexpected disabled factory collection"); },
  });
  assert.equal(f.calls.length, 0);
  assert.equal(integration.report.adapters.find((item) => item.source === config.id).status, "COLLECTION_DISABLED");
});

test("wrong or unsupported RPC chains fail closed before requesting blocks", async () => {
  for (const [options, overrides, lane] of [
    [{ chain: "base" }, { eth_chainId: "0x38" }, config],
    [{ chains: "bsc" }, {}, config],
    [{}, { eth_chainId: "0x999999" }, config],
    [{}, { eth_chainId: "8453" }, config],
    [{}, { eth_chainId: "0x38" }, { ...config, chain: "base" }],
    [{}, {}, { ...config, chainId: 56 }],
  ]) {
    const { result, calls } = await collect(options, { overrides }, lane);
    assert.equal(result.status, "IDENTITY_MISMATCH");
    assert.equal(result.events.length, 0);
    assert.equal(result.toBlock, null);
    assert.equal(calls.length, 1);
  }
});

test("legacy transactions may omit chainId but any supplied transaction chain must match RPC", async () => {
  const tx = transaction();
  delete tx.chainId;
  assert.equal((await collect({}, { blocks: { 10: block(10, [tx]) } })).result.events.length, 1);
  const mismatched = transaction(10, 0, { chainId: "0x38" });
  const { result, calls } = await collect({}, { blocks: { 10: block(10, [mismatched]) } });
  assert.equal(result.status, "IDENTITY_MISMATCH");
  assert.equal(result.toBlock, null);
  assert.equal(calls.some((item) => item.method === "eth_getTransactionReceipt"), false);
});

test("receipt identity mismatches and unavailable receipts leave the block incomplete", async () => {
  for (const patch of [
    { transactionHash: hash(999) }, { blockHash: hash(999) }, { blockNumber: "0xb" },
    { transactionIndex: "0x1" }, { from: OTHER }, { to: CONTRACT }, { to: undefined },
    { chainId: "0x38" }, { contractAddress: null }, { contractAddress: `0x${"00".repeat(20)}` },
    { status: undefined }, { status: "0x2" },
  ]) {
    const { result } = await collect({}, { receipts: { [transaction().hash]: receipt(transaction(), patch) } });
    assert.equal(result.status, "IDENTITY_MISMATCH", JSON.stringify(patch));
    assert.equal(result.events.length, 0);
    assert.equal(result.toBlock, null);
    assert.equal(result.incompleteBlock, 10);
    assert.equal(result.partial, true);
  }
  assert.equal((await collect({}, { receipts: { [transaction().hash]: null } })).result.toBlock, null);
});

test("malformed or hash-only full blocks and inconsistent transactions cannot advance checkpoints", async () => {
  for (const invalid of [
    null, { ...block(), number: "0xb" }, { ...block(), hash: "0x" },
    { ...block(), timestamp: undefined }, { ...block(), transactions: [transaction().hash] },
    block(10, [transaction(10, 0, { blockHash: hash(999) })]),
    block(10, [transaction(10, 0, { blockNumber: "0xb" })]),
    block(10, [transaction(10, 0, { transactionIndex: "0x1" })]),
    block(10, [transaction(10, 0, { from: "0x" })]),
    block(10, [transaction(10, 0, { to: undefined })]),
  ]) {
    const { result } = await collect({}, { overrides: { eth_getBlockByNumber: invalid } });
    assert.equal(result.status, "IDENTITY_MISMATCH");
    assert.equal(result.events.length, 0);
    assert.equal(result.toBlock, null);
  }
});

test("failed creations are skipped and ordinary calls never produce factory/internal CREATE deployers", async () => {
  const tx = transaction();
  const call = transaction(10, 1, { to: OTHER });
  const zeroAddressCall = transaction(10, 2, { to: `0x${"00".repeat(20)}` });
  const { result, calls } = await collect({}, {
    blocks: { 10: block(10, [tx, call, zeroAddressCall]) }, receipts: { [tx.hash]: receipt(tx, { status: "0x0", contractAddress: null }) },
  });
  assert.equal(result.status, "OK");
  assert.equal(result.failedCreations, 1);
  assert.equal(result.events.length, 0);
  assert.equal(result.toBlock, 10);
  assert.deepEqual(calls.filter((item) => item.method === "eth_getTransactionReceipt").map((item) => item.params), [[tx.hash]]);
});

test("optional code checks require nonempty code without promoting token kind or safety", async () => {
  const empty = await collect({ verifyCode: true }, { overrides: { eth_getCode: "0x" } });
  assert.equal(empty.result.status, "OK");
  assert.equal(empty.result.events.length, 0);
  assert.equal(empty.result.emptyCodeCreations, 1);
  assert.equal(empty.result.toBlock, 10);
  const checked = await collect({ verifyCode: true });
  assert.equal(checked.result.events[0].raw.codeStatus, "NONEMPTY_AT_CREATION_BLOCK");
  assert.equal(checked.result.events[0].raw.tokenKind, "UNKNOWN");
  assert.equal(checked.result.events[0].raw.safetyStatus, "UNKNOWN");
  assert.deepEqual(checked.calls.at(-1).params, [CONTRACT, { blockHash: hash(10), requireCanonical: true }]);
  const malformed = await collect({ verifyCode: true }, { overrides: { eth_getCode: "0x0" } });
  assert.equal(malformed.result.events.length, 0);
  assert.equal(malformed.result.toBlock, null);
});

test("request, block, and receipt budgets bound collection and expose partial progress", async () => {
  for (const options of [{ maxRequests: 0 }, { maxBlocks: 0 }, { timeBudgetMs: 0 }]) {
    const { result, calls } = await collect(options);
    assert.equal(result.status, "PARTIAL");
    assert.equal(result.partial, true);
    assert.equal(calls.length, 0);
  }
  const noReceipt = await collect({ maxReceipts: 0 });
  assert.equal(noReceipt.result.limitReason, "MAX_RECEIPTS");
  assert.equal(noReceipt.result.receiptsRead, 0);
  assert.equal(noReceipt.result.toBlock, null);
  const requestLimit = await collect({ maxRequests: 3 });
  assert.equal(requestLimit.result.requests, 3);
  assert.equal(requestLimit.result.limitReason, "MAX_REQUESTS");
  assert.equal(requestLimit.result.toBlock, null);
  const blocks = await collect({ maxBlocks: 1 }, { head: 12 });
  assert.equal(blocks.result.status, "PARTIAL");
  assert.equal(blocks.result.limitReason, "MAX_BLOCKS");
  assert.equal(blocks.result.blocksRead, 1);
  assert.equal(blocks.result.toBlock, 10);
  assert.equal(blocks.result.targetToBlock, 12);
  const txs = [transaction(), transaction(10, 1)];
  const receipts = await collect({ maxReceipts: 1 }, { blocks: { 10: block(10, txs) } });
  assert.equal(receipts.result.events.length, 1);
  assert.equal(receipts.result.toBlock, null);
  assert.equal(receipts.result.incompleteBlock, 10);
  assert.equal(receipts.result.receiptsRead, 1);
  assert.equal(receipts.calls.length, 4);
});

test("budgets reject invalid limits and clamp large finite limits", async () => {
  for (const value of [NaN, Infinity, -1, "", "invalid", 1.5, null]) {
    const { result, calls } = await collect({ maxRequests: value });
    assert.equal(result.status, "INVALID_LIMITS");
    assert.equal(calls.length, 0);
  }
  const { result } = await collect({ maxBlocks: 100, maxReceipts: 1_000, maxRequests: 1_000, maxTransactionsPerBlock: 100_000, timeBudgetMs: 100_000, rpcTimeoutMs: 10_000 });
  assert.deepEqual(result.limits, { maxBlocks: 32, maxReceipts: 128, maxRequests: 256, maxTransactionsPerBlock: 10_000, timeBudgetMs: 30_000, rpcTimeoutMs: 5_000 });
});

test("default discovery uses only a bounded recent window and explicit checkpoints use decimal blocks", async () => {
  const recent = await collect({ fromBlock: undefined, maxBlocks: 2 }, { head: 12 });
  assert.equal(recent.result.fromBlock, 11);
  assert.deepEqual(recent.calls.filter((item) => item.method === "eth_getBlockByNumber").map((item) => item.params[0]), ["0xb", "0xc"]);
  const checkpoint = { chain: "base", chainId: 8453, blockNumber: 9, blockHash: hash(9) };
  const resumed = await collect({ fromBlock: undefined, checkpoint });
  assert.equal(resumed.result.status, "OK");
  assert.equal(resumed.result.fromBlock, 10);
  for (const invalid of [{ ...checkpoint, chain: "bsc" }, { blockNumber: 9 }, { ...checkpoint, blockHash: hash(8) }]) {
    const rejected = await collect({ fromBlock: undefined, checkpoint: invalid });
    assert.equal(rejected.result.events.length, 0);
    assert.equal(rejected.result.toBlock, null);
    assert.ok(["INVALID_CHECKPOINT", "IDENTITY_MISMATCH"].includes(rejected.result.status));
  }
});

test("RPC failures, timeout, time-budget exhaustion and parent changes never skip incomplete blocks", async () => {
  const failed = await collect({}, { overrides: { eth_getTransactionReceipt: () => { throw new Error("RPC failed"); } } });
  assert.equal(failed.result.status, "RPC_FAILED");
  assert.equal(failed.result.toBlock, null);
  assert.equal(failed.result.incompleteBlock, 10);
  let now = 1_700_000_100_000;
  const timed = await collect({ now: () => now, timeBudgetMs: 1_000 }, { overrides: {
    eth_getBlockByNumber: () => { now += 600; return block(); },
  } });
  assert.equal(timed.result.limitReason, "TIME_BUDGET");
  assert.equal(timed.result.requests, 3);
  assert.equal(timed.result.toBlock, null);
  const emptyExpired = await collect({ now: () => now, timeBudgetMs: 1_000 }, { overrides: {
    eth_getBlockByNumber: () => { now += 1_001; return block(10, []); },
  } });
  assert.equal(emptyExpired.result.limitReason, "TIME_BUDGET");
  assert.equal(emptyExpired.result.toBlock, null);
  const timeout = await collect({ rpcTimeoutMs: 500 }, { overrides: { eth_getTransactionReceipt: () => new Promise(() => {}) } });
  assert.equal(timeout.result.limitReason, "RPC_TIMEOUT");
  assert.equal(timeout.result.toBlock, null);
  const parent = await collect({}, { head: 11, blocks: { 10: block(), 11: { ...block(11, []), parentHash: hash(999) } } });
  assert.equal(parent.result.status, "IDENTITY_MISMATCH");
  assert.equal(parent.result.toBlock, 10);
  assert.equal(parent.result.incompleteBlock, 11);
});

test("future block timestamps use injected now with at most 120 seconds of skew", async () => {
  const now = 1_700_000_100_000;
  for (const [ahead, accepted] of [[120, true], [121, false]]) {
    const future = { ...block(), timestamp: hex(now / 1000 + ahead) };
    const { result } = await collect({ now: () => now }, { blocks: { 10: future } });
    assert.equal(result.events.length, accepted ? 1 : 0);
    assert.equal(result.toBlock, accepted ? 10 : null);
    assert.equal(result.status, accepted ? "OK" : "IDENTITY_MISMATCH");
  }
});

test("deadline-late receipt results are rejected before event acceptance or checkpointing", async () => {
  let now = 1_700_000_100_000;
  const { result } = await collect({ now: () => now, timeBudgetMs: 1_000 }, { overrides: {
    eth_getTransactionReceipt: () => { now += 1_001; return receipt(); },
  } });
  assert.equal(result.status, "PARTIAL");
  assert.equal(result.limitReason, "TIME_BUDGET");
  assert.equal(result.events.length, 0);
  assert.equal(result.toBlock, null);
  assert.equal(result.incompleteBlock, 10);
});

test("oversized full blocks stop explicitly without examining receipts or checkpointing the block", async () => {
  const oversized = block(11, [transaction(11), transaction(11, 1)]);
  const { result, calls } = await collect({ maxTransactionsPerBlock: 1 }, {
    head: 11, blocks: { 10: block(10, []), 11: oversized },
  });
  assert.equal(result.status, "PARTIAL");
  assert.equal(result.limitReason, "MAX_TRANSACTIONS_PER_BLOCK");
  assert.equal(result.toBlock, 10);
  assert.equal(result.incompleteBlock, 11);
  assert.equal(result.events.length, 0);
  assert.equal(calls.some(item => item.method === "eth_getTransactionReceipt"), false);
});

test("default RPC transport uses the shared jsonRpc client without hidden retries", async (t) => {
  const f = fixture();
  t.mock.method(globalThis, "fetch", async (url, init) => {
    const request = JSON.parse(init.body);
    const result = await f.rpc(url, request.method, request.params, {});
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: request.id, result }));
  });
  const result = await fetchEvmContractDeployments(config, { fromBlock: 10 });
  assert.equal(result.status, "OK");
  assert.equal(result.events.length, 1);
  assert.equal(f.calls.length, 4);
  let calls = 0;
  globalThis.fetch.mock.mockImplementation(async () => { calls++; throw new Error("transport failure"); });
  const failed = await fetchEvmContractDeployments(config, { fromBlock: 10 });
  assert.equal(failed.status, "RPC_FAILED");
  assert.equal(failed.requests, 1);
  assert.equal(calls, 1);
});

test("isolated persistence checkpoints only completed blocks, resumes safely, and preserves raw quarantine", () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "evm-deployment-recovery-"));
  const connectorUrl = new URL("../src/data/native/evm/evmContractDeploymentConnector.js", import.meta.url).href;
  const integrationUrl = new URL("../src/data/native/evm/evmFactoryEventConnector.js", import.meta.url).href;
  const txs = [transaction(11), transaction(11, 1)];
  const blocks = { 10: block(10, []), 11: block(11, txs), 12: block(12, []) };
  const receipts = Object.fromEntries(txs.map((tx, index) => [tx.hash, receipt(tx, { contractAddress: index ? OTHER : CONTRACT })]));
  try {
    const output = execFileSync(process.execPath, ["--input-type=module", "-e", `
      import fs from "node:fs";
      import assert from "node:assert/strict";
      import { EvmContractDeploymentAdapter, nativeContractDeployerEvidence } from ${JSON.stringify(connectorUrl)};
      import { getEvmFactoryEventCandidates } from ${JSON.stringify(integrationUrl)};
      import { runNativeDiscoveryMesh } from ${JSON.stringify(new URL("../src/data/native/nativeDiscoveryMesh.js", import.meta.url).href)};
      import { confirmNativeEvents } from ${JSON.stringify(new URL("../src/data/native/nativeEventStore.js", import.meta.url).href)};
      const blocks = ${JSON.stringify(blocks)};
      const receipts = ${JSON.stringify(receipts)};
      const jsonRpc = async (_url, method, params) => {
        if (method === "eth_chainId") return "0x2105";
        if (method === "eth_blockNumber") return "0xc";
        if (method === "eth_getBlockByNumber") return blocks[Number(params[0])];
        if (method === "eth_getTransactionReceipt") return receipts[params[0]];
        throw new Error("Unexpected RPC");
      };
      const options = { env: { EVM_DEPLOYMENT_RADAR_RPC_URL: "https://deployment.invalid" },
        chains: "base", usePublicRpcFallbacks: false, jsonRpc, fromBlock: 10, maxReceipts: 1 };
      await getEvmFactoryEventCandidates({ ...options, persist: false });
      assert.equal(fs.existsSync("data"), false);
      const adapter = new EvmContractDeploymentAdapter(${JSON.stringify(config)});
      const first = await adapter.backfill({ ...options, confirmed: true });
      assert.equal(first.status, "PARTIAL");
      assert.equal(first.toBlock, 10);
      assert.equal(first.incompleteBlock, 11);
      const file = "data/native-discovery/checkpoints.json";
      const checkpoint = JSON.parse(fs.readFileSync(file, "utf8"))["evm-contract-deployments"];
      assert.equal(checkpoint.blockNumber, 10);
      assert.equal(checkpoint.blockHash, blocks[10].hash);
      const second = await getEvmFactoryEventCandidates({ ...options, fromBlock: undefined, maxReceipts: 3 });
      const report = second.report.adapters.find(item => item.source === "evm-contract-deployments");
      assert.equal(report.fromBlock, 11);
      assert.equal(report.status, "OK");
      assert.equal(JSON.parse(fs.readFileSync(file, "utf8"))["evm-contract-deployments"].blockNumber, 12);
      const events = JSON.parse(fs.readFileSync("data/native-discovery/raw-events.json", "utf8"));
      assert.equal(events.length, 2);
      assert.ok(events.every(event => event.raw.tokenKind === "UNKNOWN" && event.raw.quarantined && !event.tokenAddress && !event.finalized));
      assert.equal(fs.existsSync("data/native-discovery/confirmed-events.json"), false);
      const mesh = await runNativeDiscoveryMesh({ events, skipStore: true, confirmed: true });
      assert.equal(mesh.candidates.length, 0);
      assert.equal(mesh.lifecycles.length, 0);
      assert.equal(mesh.report.genericContractEventCount, 2);
      assert.ok(mesh.contractEvents.every(event => event.uniqueBuyers === null && event.displayedLiquidityUsd === null));
      assert.equal(fs.existsSync("data/native-discovery/confirmed-events.json"), false);
      assert.ok(JSON.parse(fs.readFileSync("data/native-discovery/raw-events.json", "utf8")).every(event => event.uniqueBuyers === null));
      confirmNativeEvents(events);
      const confirmed = JSON.parse(fs.readFileSync("data/native-discovery/confirmed-events.json", "utf8"));
      assert.ok(confirmed.every(event => event.finalized === true && event.uniqueBuyers === null));
      const evidence = nativeContractDeployerEvidence({ chain: "base", tokenAddress: ${JSON.stringify(CONTRACT)} }, confirmed);
      assert.equal(evidence.creatorAddress, ${JSON.stringify(SENDER)});
      assert.equal(evidence.finalized, false);
      assert.equal(evidence.provenance.finalityStatus, "UNFINALIZED");
      assert.equal(evidence.provenance.storedEventFinalized, true);
      console.log("isolated checkpoint and raw-event persistence verified");
    `], { cwd: temporary, encoding: "utf8", timeout: 10_000 });
    assert.match(output, /isolated checkpoint and raw-event persistence verified/);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});
