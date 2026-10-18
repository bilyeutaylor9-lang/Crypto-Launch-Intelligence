import test from "node:test";
import assert from "node:assert/strict";
import { getRpcWalletEvidence } from "../src/data/rpcWalletEvidenceConnector.js";
import { createActiveEvidenceExecutionState, executeActiveEvidenceProviderRequests } from "../src/data/activeEvidenceProviderExecutor.js";
import { ERC20_TRANSFER_TOPIC, encodeAddressWord } from "../src/sensors/evmAbi.js";

const TOKEN = "0x1111111111111111111111111111111111111111";
const POOL = "0x2222222222222222222222222222222222222222";
const WALLET = "0x3333333333333333333333333333333333333333";
const PRIMARY = "https://primary.invalid/private-key";
const SECONDARY = "https://secondary.invalid";
const HASH = `0x${"a".repeat(64)}`;
const project = { chain: "base", tokenAddress: TOKEN, poolAddress: POOL };
const block = { number: "0x100", timestamp: `0x${Math.floor(Date.now() / 1000).toString(16)}`, hash: HASH };
const log = { address: TOKEN, transactionHash: `0x${"b".repeat(64)}`, blockNumber: "0x100",
  logIndex: "0x0", data: `0x${"0".repeat(63)}5`, topics: [ERC20_TRANSFER_TOPIC,
    `0x${encodeAddressWord(POOL)}`, `0x${encodeAddressWord(WALLET)}`] };

function transport(calls, overrides = {}) {
  return async (url, method, params) => {
    calls.push({ url, method, params });
    const override = overrides[`${url}:${method}`];
    if (override instanceof Error) throw override;
    return override ?? { eth_chainId: "0x2105", eth_getBlockByNumber: block, eth_getLogs: [log] }[method];
  };
}

test("wallet RPC restarts chain and observation proof on a configured healthy fallback", async () => {
  const calls = [];
  const result = await getRpcWalletEvidence(project, { rpcUrls: [PRIMARY, SECONDARY],
    jsonRpc: transport(calls, { [`${PRIMARY}:eth_getLogs`]: new Error("primary timeout") }) });
  assert.equal(result.status, "EVIDENCE_AVAILABLE");
  assert.deepEqual(result.wallets, [WALLET]);
  assert.deepEqual(calls.map(({ url, method }) => [url, method]), [
    [PRIMARY, "eth_chainId"], [PRIMARY, "eth_getBlockByNumber"], [PRIMARY, "eth_getLogs"],
    [SECONDARY, "eth_chainId"], [SECONDARY, "eth_getBlockByNumber"], [SECONDARY, "eth_getLogs"],
  ]);
  assert.equal(result.rpcEndpointAttempts.length, 2);
  assert.equal(result.rpcEndpointAttempts[0].providerFailure, true);
  assert.equal(result.rpcEndpointAttempts[1].providerFailure, false);
  assert.equal(JSON.stringify(result).includes("private-key"), false);
  assert.equal(JSON.stringify(result).includes("primary.invalid"), false);
  assert.equal(result.uniqueBuyers24h, null);
  assert.equal(result.smartWallets, null);
});

test("existing public Base fallback is used without adding a new endpoint catalog", async () => {
  const calls = [];
  const primary = "https://base-rpc.publicnode.com";
  const result = await getRpcWalletEvidence(project, { env: {}, jsonRpc: transport(calls,
    { [`${primary}:eth_chainId`]: new Error("unavailable") }) });
  assert.equal(result.status, "EVIDENCE_AVAILABLE");
  assert.deepEqual([...new Set(calls.map((call) => call.url))], [primary, "https://mainnet.base.org"]);
});

test("empty or malformed observations do not cause opportunistic fallback sampling", async () => {
  for (const value of [[], [{}]]) {
    const calls = [];
    const result = await getRpcWalletEvidence(project, { rpcUrls: [PRIMARY, SECONDARY],
      jsonRpc: transport(calls, { [`${PRIMARY}:eth_getLogs`]: value }) });
    assert.equal(result.status, "UNKNOWN");
    assert.ok(calls.every((call) => call.url === PRIMARY));
    assert.equal(result.rpcEndpointAttempts.length, 1);
  }
});

test("failed balance transport restarts proof at the fallback block without merging snapshots", async () => {
  const calls = [];
  const secondHash = `0x${"c".repeat(64)}`;
  const result = await getRpcWalletEvidence({ ...project, deployerAddress: WALLET }, {
    rpcUrls: [PRIMARY, SECONDARY], jsonRpc: transport(calls, {
      [`${PRIMARY}:eth_getLogs`]: [], [`${SECONDARY}:eth_getLogs`]: [],
      [`${PRIMARY}:eth_call`]: new Error("balance timeout"),
      [`${SECONDARY}:eth_getBlockByNumber`]: { ...block, hash: secondHash },
      [`${SECONDARY}:eth_call`]: `0x${"0".repeat(63)}1`,
    }) });
  assert.equal(result.status, "EVIDENCE_AVAILABLE");
  assert.equal(result.rpcEndpointAttempts.length, 2);
  assert.deepEqual(result.holderAddresses, [WALLET]);
  assert.equal(result.holderBalanceEvidence[0].blockHash, secondHash);
  assert.equal(result.holderBalanceEvidence[0].accountType, "UNKNOWN");
  assert.deepEqual(calls.filter((call) => call.method === "eth_call").map((call) => call.params[1]), [
    { blockHash: HASH, requireCanonical: true }, { blockHash: secondHash, requireCanonical: true },
  ]);
});

test("proven zero holder balances are not transport failures and do not trigger failover", async () => {
  const calls = [];
  const result = await getRpcWalletEvidence({ ...project, deployerAddress: WALLET }, {
    rpcUrls: [PRIMARY, SECONDARY], jsonRpc: transport(calls, {
      [`${PRIMARY}:eth_getLogs`]: [], [`${PRIMARY}:eth_call`]: `0x${"0".repeat(64)}`,
    }) });
  assert.equal(result.status, "UNKNOWN");
  assert.equal(result.providerFailure, false);
  assert.deepEqual(result.holderAddresses, []);
  assert.ok(calls.every((call) => call.url === PRIMARY));
});

test("fallback must independently prove the requested chain before collecting evidence", async () => {
  const calls = [];
  const result = await getRpcWalletEvidence(project, { rpcUrls: [PRIMARY, SECONDARY],
    jsonRpc: transport(calls, { [`${PRIMARY}:eth_chainId`]: new Error("unavailable"),
      [`${SECONDARY}:eth_chainId`]: "0x1" }) });
  assert.equal(result.status, "UNKNOWN");
  assert.equal(result.wallets?.length || 0, 0);
  assert.deepEqual(calls.map((call) => call.method), ["eth_chainId", "eth_chainId"]);
});

test("explicit endpoints and public-fallback opt-out are respected", async () => {
  for (const config of [{ rpcUrl: PRIMARY }, { env: { BASE_RPC_URL: PRIMARY }, usePublicRpcFallbacks: false }]) {
    const calls = [];
    const result = await getRpcWalletEvidence(project, { ...config,
      jsonRpc: transport(calls, { [`${PRIMARY}:eth_chainId`]: new Error("unavailable") }) });
    assert.equal(result.status, "UNKNOWN");
    assert.deepEqual(calls.map((call) => call.url), [PRIMARY]);
  }
});

test("failover is deduplicated and capped at two existing endpoint attempts", async () => {
  const calls = [];
  const result = await getRpcWalletEvidence(project, { rpcUrls: [PRIMARY, PRIMARY, SECONDARY, "https://third.invalid"],
    walletRpcMaxEndpoints: 999, jsonRpc: async (url) => { calls.push(url); throw new Error("unavailable"); } });
  assert.equal(result.status, "UNKNOWN");
  assert.deepEqual(calls, [PRIMARY, SECONDARY]);
  assert.equal(result.rpcEndpointAttempts.length, 2);
});

test("fallback RPC methods share the hard global request budget", async () => {
  const calls = [];
  const options = { rpcUrls: [PRIMARY, SECONDARY], walletHistory: false, useRpcWalletFallback: true,
    jsonRpc: transport(calls, { [`${PRIMARY}:eth_chainId`]: new Error("unavailable") }),
    providers: { getBlockscoutWalletEvidence: async () => ({ status: "UNKNOWN" }) } };
  const state = createActiveEvidenceExecutionState({ maxProviderRequests: 6 });
  const result = await executeActiveEvidenceProviderRequests(project, [{ field: "wallets" }], options, state);
  assert.equal(state.requestsUsed, 6);
  assert.equal(calls.length, 3);
  assert.ok(result.attempts.some((item) => item.status === "REQUEST_BUDGET_EXHAUSTED"));
  assert.deepEqual(result.observations, []);
});

test("a failed primary circuit cannot suppress a different healthy endpoint", async () => {
  const calls = [];
  const options = { rpcUrls: [PRIMARY, SECONDARY], walletHistory: false, useRpcWalletFallback: true,
    jsonRpc: transport(calls, { [`${PRIMARY}:eth_chainId`]: new Error("unavailable") }),
    providers: { getBlockscoutWalletEvidence: async () => ({ status: "UNKNOWN" }) } };
  const state = createActiveEvidenceExecutionState({ maxProviderRequests: 20, circuitFailureThreshold: 1 });
  for (let i = 0; i < 2; i++) {
    const result = await executeActiveEvidenceProviderRequests(project, [{ field: "wallets" }], options, state);
    assert.deepEqual(result.observations.find((item) => item.field === "wallets").value, [WALLET]);
  }
  assert.equal(calls.filter((call) => call.url === PRIMARY).length, 1);
  assert.equal(calls.filter((call) => call.url === SECONDARY).length, 6);
  assert.equal(state.requestsUsed, 13);
  const circuits = [...state.providers.values()].filter((item) => item.provider === "rpc-wallets");
  assert.equal(circuits.length, 2);
  assert.equal(circuits.filter((item) => item.circuitOpen).length, 1);
  assert.equal(JSON.stringify(circuits).includes("private-key"), false);
});

test("an expired shared deadline prevents fallback transport", async () => {
  let now = 0;
  const calls = [];
  const options = { rpcUrls: [PRIMARY, SECONDARY], walletHistory: false, useRpcWalletFallback: true,
    jsonRpc: async (url) => { calls.push(url); now = 100; throw new Error("timeout"); },
    providers: { getBlockscoutWalletEvidence: async () => ({ status: "UNKNOWN" }) } };
  const state = createActiveEvidenceExecutionState({ maxProviderRequests: 20, deadlineAt: 50, now: () => now });
  const result = await executeActiveEvidenceProviderRequests(project, [{ field: "wallets" }], options, state);
  assert.equal(state.timeBudgetExceeded, true);
  assert.deepEqual(calls, [PRIMARY]);
  assert.deepEqual(result.observations, []);
});

test("a stale RPC head cannot establish current wallet evidence and can use a fresh fallback", async () => {
  const calls = [];
  const now = 1_800_000_000_000;
  const old = { ...block, timestamp: `0x${(now / 1000 - 3600).toString(16)}` };
  const fresh = { ...block, timestamp: `0x${(now / 1000 - 10).toString(16)}` };
  const result = await getRpcWalletEvidence(project, { rpcUrls: [PRIMARY, SECONDARY], now: () => now,
    jsonRpc: transport(calls, { [`${PRIMARY}:eth_getBlockByNumber`]: old,
      [`${SECONDARY}:eth_getBlockByNumber`]: fresh }) });
  assert.equal(result.status, "EVIDENCE_AVAILABLE");
  assert.equal(result.rpcEndpointAttempts[0].providerFailureCode, "STALE_RPC_HEAD");
  assert.equal(calls.some((call) => call.url === PRIMARY && call.method === "eth_getLogs"), false);
  assert.equal(result.sourceTimestamp, new Date(now - 10_000).toISOString());
  const unavailable = await getRpcWalletEvidence(project, { rpcUrl: PRIMARY, now: () => now,
    jsonRpc: transport([], { [`${PRIMARY}:eth_getBlockByNumber`]: old }) });
  assert.equal(unavailable.status, "UNKNOWN");
  assert.equal(unavailable.providerFailureCode, "STALE_RPC_HEAD");
  assert.equal(unavailable.wallets, undefined);
});

test("invalid head-age settings or clocks cannot create current observations", async () => {
  for (const limit of [0, -1, 1.5, NaN, Infinity, "bad"]) {
    const calls = [];
    const result = await getRpcWalletEvidence(project, { rpcUrl: PRIMARY, walletRpcMaxHeadAgeSeconds: limit,
      jsonRpc: transport(calls) });
    assert.equal(result.status, "UNKNOWN");
    assert.equal(calls.length, 0);
  }
  const result = await getRpcWalletEvidence(project, { rpcUrl: PRIMARY, now: () => NaN,
    jsonRpc: transport([]) });
  assert.equal(result.status, "UNKNOWN");
  assert.equal(result.wallets, undefined);
});
