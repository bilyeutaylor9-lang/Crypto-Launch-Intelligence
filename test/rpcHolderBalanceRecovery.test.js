import test from "node:test";
import assert from "node:assert/strict";
import { getRpcWalletEvidence } from "../src/data/rpcWalletEvidenceConnector.js";
import { createActiveEvidenceExecutionState, executeActiveEvidenceProviderRequests } from "../src/data/activeEvidenceProviderExecutor.js";
import { analyzeActiveEvidenceRecoveryBatch } from "../src/engines/activeEvidenceRecoveryEngine.js";
import { encodeAddressWord } from "../src/sensors/evmAbi.js";
import { analyzeWalletCluster } from "../src/engines/walletClusterEngine.js";
import { analyzeSmartWallets } from "../src/engines/smartWalletEngine.js";

const TOKEN = "0x1111111111111111111111111111111111111111";
const POOL = "0x2222222222222222222222222222222222222222";
const ACCOUNT = "0x3333333333333333333333333333333333333333";
const OTHER = "0x4444444444444444444444444444444444444444";
const HASH = `0x${"a".repeat(64)}`;
const TIMESTAMP = 1792288800;
const BLOCK = { number: "0x100", timestamp: `0x${TIMESTAMP.toString(16)}`, hash: HASH };
const BALANCE = 2n ** 240n + 123n;
const WORD = (number) => `0x${BigInt(number).toString(16).padStart(64, "0")}`;
const candidate = { chain: "base", tokenAddress: TOKEN, poolAddress: POOL, deployerAddress: ACCOUNT };

function transport(overrides = {}, calls = []) {
  return async (url, method, params, options) => {
    calls.push({ url, method, params, options });
    const value = Object.hasOwn(overrides, method) ? overrides[method]
      : { eth_chainId: "0x2105", eth_getBlockByNumber: BLOCK, eth_getLogs: [], eth_call: WORD(BALANCE) }[method];
    if (value instanceof Error) throw value;
    return typeof value === "function" ? value(params) : value;
  };
}

function rpcOptions(overrides = {}, calls = [], extra = {}) {
  return { rpcUrl: "https://rpc.invalid", jsonRpc: transport(overrides, calls), ...extra };
}

function activeOptions(overrides = {}, calls = [], extra = {}) {
  return { ...rpcOptions(overrides, calls), useRpcWalletFallback: true, walletHistory: false, useCache: false,
    providers: { getBlockscoutWalletEvidence: async () => ({ status: "UNKNOWN" }) }, ...extra };
}

test("quiet-token fallback proves a positive account balance at the pinned block without inventing activity", async () => {
  const calls = [];
  const result = await getRpcWalletEvidence(candidate, rpcOptions({}, calls));
  assert.deepEqual(calls.map((call) => call.method), ["eth_chainId", "eth_getBlockByNumber", "eth_getLogs", "eth_call"]);
  assert.deepEqual(calls[3].params, [{ to: TOKEN, data: "0x70a08231" + encodeAddressWord(ACCOUNT) },
    { blockHash: HASH, requireCanonical: true }]);
  assert.equal(result.status, "EVIDENCE_AVAILABLE");
  assert.deepEqual(result.holderAddresses, [ACCOUNT]);
  assert.deepEqual(result.wallets, [ACCOUNT]);
  assert.equal(result.holderBalanceEvidence[0].balanceRaw, BALANCE.toString());
  assert.equal(result.holderBalanceEvidence[0].accountType, "UNKNOWN");
  assert.equal(result.holderBalanceEvidence[0].role, "UNKNOWN");
  assert.equal(result.holderBalanceEvidence[0].blockHash, HASH);
  assert.equal(result.sourceTimestamp, new Date(TIMESTAMP * 1000).toISOString());
  assert.equal(result.holderCoverage.complete, false);
  assert.equal(result.holderCount, null);
  for (const field of ["uniqueBuyers24h", "buyTransactions24h", "sellTransactions24h", "smartWallets", "trackedWallets"]) {
    assert.equal(result[field], null, field);
  }
  assert.deepEqual(result.walletTransactions, []);
  assert.deepEqual(result.walletParticipationHistory, []);
});

for (const value of [WORD(0), "0x", "0x1", null, new Error("execution reverted")]) {
  test(`seed labels cannot replace positive balance proof: ${String(value)}`, async () => {
    const result = await getRpcWalletEvidence(candidate, rpcOptions({ eth_call: value }));
    assert.equal(result.status, "UNKNOWN");
    assert.deepEqual(result.wallets, []);
    assert.deepEqual(result.holderAddresses, []);
    assert.equal(result.holderCount, null);
  });
}

test("seed probes are bounded, deduplicated and exclude token, pool, null and zero addresses", async () => {
  const calls = [];
  const seeds = [null, TOKEN, POOL, `0x${"0".repeat(40)}`, "SOLANA", ACCOUNT, ACCOUNT, OTHER,
    "0x5555555555555555555555555555555555555555", "0x6666666666666666666666666666666666666666"];
  const result = await getRpcWalletEvidence(candidate, rpcOptions({}, calls,
    { walletRpcHolderSeeds: seeds, walletRpcMaxBalanceProbes: 1000 }));
  assert.equal(calls.filter((call) => call.method === "eth_call").length, 3);
  assert.equal(result.holderAddresses.length, 3);
  assert.equal(result.holderCount, null);
  assert.equal(result.holderCoverage.balanceProbeAttempts, 3);
});

test("no known accounts or disabled probes cannot create a wallet from a quiet token", async () => {
  for (const [project, extra] of [[{ ...candidate, deployerAddress: null }, {}], [candidate, { walletRpcMaxBalanceProbes: 0 }]]) {
    const calls = [];
    const result = await getRpcWalletEvidence(project, rpcOptions({}, calls, extra));
    assert.equal(calls.length, 3);
    assert.equal(result.status, "UNKNOWN");
    assert.deepEqual(result.wallets, []);
  }
});

test("invalid lookback configuration cannot turn a bounded query into a genesis-to-head scan", async () => {
  for (const value of [0, -1, 1.5, "bad", Infinity, NaN]) {
    const calls = [];
    const result = await getRpcWalletEvidence(candidate, rpcOptions({}, calls, { walletRpcLookbackBlocks: value }));
    assert.equal(result.status, "UNKNOWN");
    assert.equal(calls.length, 0);
  }
});

test("missing or invalid block hash cannot attach a balance to an unpinned snapshot", async () => {
  for (const hash of [undefined, "0x1", `0x${"0".repeat(64)}`]) {
    const calls = [];
    const result = await getRpcWalletEvidence(candidate, rpcOptions({ eth_getBlockByNumber: { ...BLOCK, hash } }, calls));
    assert.equal(result.status, "UNKNOWN");
    assert.deepEqual(result.holderAddresses, []);
    assert.equal(calls.some((call) => call.method === "eth_call"), false);
  }
});

test("wrong-chain, invalid log and future-block responses cannot reach balance proof", async () => {
  for (const overrides of [{ eth_chainId: "0x38" }, { eth_getLogs: [{}] },
    { eth_getBlockByNumber: { ...BLOCK, timestamp: `0x${(Math.floor(Date.now() / 1000) + 10000).toString(16)}` } }]) {
    const calls = [];
    const result = await getRpcWalletEvidence(candidate, rpcOptions(overrides, calls));
    assert.equal(result.status, "UNKNOWN");
    assert.equal(calls.some((call) => call.method === "eth_call"), false);
    assert.equal(result.holderAddresses?.length || 0, 0);
  }
});

test("default RPC hydration accounts for every actual method and promotes only proven raw fields", async () => {
  const calls = [];
  const options = activeOptions({}, calls);
  const state = createActiveEvidenceExecutionState({ maxProviderRequests: 7 });
  const result = await executeActiveEvidenceProviderRequests(candidate, [{ field: "wallets" }], options, state);
  assert.equal(state.requestsUsed, 7);
  assert.equal(calls.length, 4);
  assert.deepEqual(result.observations.map((item) => item.field).sort(), ["holderAddresses", "wallets"]);
  for (const observation of result.observations) {
    assert.equal(observation.source, "rpc-wallets");
    assert.equal(observation.sourceTimestamp, new Date(TIMESTAMP * 1000).toISOString());
    assert.equal(observation.verificationStatus, "VERIFIED_PROVIDER_OBSERVATION");
    assert.equal(observation.recoveryRun, true);
    assert.equal(observation.tokenAddress, TOKEN);
    assert.equal(observation.holderSampleOnly, true);
    assert.equal(observation.completeHolderCoverage, false);
    assert.equal(observation.buyerClassificationAvailable, false);
    assert.equal(observation.holderBalanceEvidence[0].balanceRaw, BALANCE.toString());
  }
  assert.equal(result.attempts.filter((attempt) => attempt.rpcMethod).length, 4);
  assert.equal(result.attempts.find((attempt) => attempt.resultType === "EVIDENCE").requestCost, 0);
  assert.equal(result.projectPatch.liveExecutionReady, undefined);
  assert.equal(result.projectPatch.creatorAddress, undefined);
});

test("the global request budget cannot pay for a balance probe with only the initial three RPC slots", async () => {
  const calls = [];
  const state = createActiveEvidenceExecutionState({ maxProviderRequests: 6 });
  const result = await executeActiveEvidenceProviderRequests(candidate, [{ field: "wallets" }], activeOptions({}, calls), state);
  assert.equal(state.requestsUsed, 6);
  assert.equal(calls.length, 3);
  assert.equal(calls.some((call) => call.method === "eth_call"), false);
  assert.deepEqual(result.observations, []);
  assert.ok(result.attempts.some((attempt) => attempt.status === "REQUEST_BUDGET_EXHAUSTED"));
});

test("explicitly injecting the real RPC connector cannot bypass per-method budgeting", async () => {
  const calls = [];
  const options = activeOptions({}, calls);
  options.providers.getRpcWalletEvidence = getRpcWalletEvidence;
  const state = createActiveEvidenceExecutionState({ maxProviderRequests: 6 });
  const result = await executeActiveEvidenceProviderRequests(candidate, [{ field: "wallets" }], options, state);
  assert.equal(calls.length, 3);
  assert.equal(state.requestsUsed, 6);
  assert.deepEqual(result.observations, []);
});

test("RPC recovery does not start when the shared budget cannot pin chain and block plus collect evidence", async () => {
  const calls = [];
  const state = createActiveEvidenceExecutionState({ maxProviderRequests: 5 });
  await executeActiveEvidenceProviderRequests(candidate, [{ field: "wallets" }], activeOptions({}, calls), state);
  assert.equal(calls.length, 0);
  assert.equal(state.requestsUsed, 3);
});

test("default RPC requests share the chain circuit and cannot promote deadline-late balances", async () => {
  const calls = [];
  const options = activeOptions({ eth_chainId: new Error("RPC down") }, calls);
  const state = createActiveEvidenceExecutionState({ maxProviderRequests: 30, circuitFailureThreshold: 1 });
  for (let i = 0; i < 2; i++) {
    const result = await executeActiveEvidenceProviderRequests(candidate, [{ field: "wallets" }], options, state);
    assert.deepEqual(result.observations, []);
  }
  assert.equal(calls.length, 1);
  assert.equal(state.providers.get("rpc-wallets:base").circuitOpen, true);
  let now = Date.now();
  const lateOptions = activeOptions({ eth_call: () => { now += 1000; return WORD(BALANCE); } }, [], { now: () => now });
  const lateState = createActiveEvidenceExecutionState({ ...lateOptions, maxProviderRequests: 10, deadlineAt: now + 100 });
  const late = await executeActiveEvidenceProviderRequests(candidate, [{ field: "wallets" }], lateOptions, lateState);
  assert.equal(lateState.timeBudgetExceeded, true);
  assert.deepEqual(late.observations, []);
});

test("holder acquisition records changed wallet inputs without qualifying the candidate", async () => {
  const options = activeOptions();
  const [result] = await analyzeActiveEvidenceRecoveryBatch([{ ...candidate, deepEvaluationState: "DEEP_EVALUATED",
    targetedEnrichmentPlan: { items: [{ canonicalField: "wallets", recoverable: true,
      evidenceClass: "CORE", targetSources: [{ source: "block explorers" }] }] } }],
  { ...options, wave1Max: 0, wave2Max: 1, wave3Max: 0, maxProviderRequests: 7 });
  assert.deepEqual(result.wallets, [ACCOUNT]);
  assert.deepEqual(result.activeEvidenceRecovery.changedEvidenceFamilies, ["WALLETS"]);
  assert.equal(result.finalSelectionQualified, undefined);
  assert.equal(result.liveExecutionReady, undefined);
  assert.equal(result.smartWalletScore, undefined);
  const analyzed = analyzeSmartWallets(analyzeWalletCluster(result));
  assert.equal(analyzed.walletClusterScore, null);
  assert.equal(analyzed.walletClusterRiskScore, null);
  assert.equal(analyzed.smartWalletScore, null);
  assert.equal(analyzed.smartWalletCoverage.coveragePct, 0);
});
