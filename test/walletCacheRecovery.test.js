import test from "node:test";
import assert from "node:assert/strict";
import { createActiveEvidenceExecutionState, executeActiveEvidenceProviderRequests } from "../src/data/activeEvidenceProviderExecutor.js";
import { evaluateEvidenceFreshness } from "../src/data/evidenceFreshnessPolicy.js";
import { encodeAddressWord } from "../src/sensors/evmAbi.js";
import { analyzeWalletCluster } from "../src/engines/walletClusterEngine.js";

const NOW = Date.parse("2026-10-18T14:15:00Z");
const TOKEN = `0x${"11".repeat(20)}`;
const POOL = `0x${"22".repeat(20)}`;
const HOLDERS = ["33", "44", "55", "66"].map((part) => `0x${part.repeat(20)}`);
const HASH = `0x${"a".repeat(64)}`;
const BLOCK = { number: "0x1000", timestamp: `0x${(NOW / 1000).toString(16)}`, hash: HASH };
const project = { chain: "base", tokenAddress: TOKEN, poolAddress: POOL };
const requests = ["wallets", "holderAddresses"].map((field) => ({ field, targetSources: [{ source: "GoPlus" }] }));
const word = (value) => `0x${BigInt(value).toString(16).padStart(64, "0")}`;

function sample(ageMs = 164 * 60_000, overrides = {}) {
  return { provider: "goplus", status: "EVIDENCE_AVAILABLE", responseIdentityVerified: true,
    chain: "base", address: TOKEN, confidence: 0.9, observedAt: new Date(NOW - ageMs).toISOString(),
    raw: { holders: HOLDERS.map((address) => ({ address, balance: "1" })) }, ...overrides };
}

function fixture(t, cached = sample(), extra = {}, rpcOverrides = {}) {
  t.mock.method(globalThis, "fetch", async () => assert.fail("External HTTP is forbidden"));
  const calls = [];
  const counts = { cache: 0, limiter: 0, explorer: 0 };
  const options = { now: () => NOW, useCache: true, walletHistory: false,
    useGoPlusWalletFallback: true, useRpcWalletFallback: true, maxProviderRequests: 8,
    rpcUrl: "https://rpc.invalid", readCachedSecurityEvidence: (provider, chain, address) => {
      counts.cache++;
      assert.deepEqual([provider, chain, address], ["goplus", "base", TOKEN]);
      return cached;
    }, goPlusRateLimiter: async () => { counts.limiter++; return false; },
    providers: { getBlockscoutWalletEvidence: async () => { counts.explorer++; return { status: "UNKNOWN" }; } },
    jsonRpc: async (_url, method, params) => {
      calls.push({ method, params });
      const value = Object.hasOwn(rpcOverrides, method) ? rpcOverrides[method]
        : { eth_chainId: "0x2105", eth_getBlockByNumber: BLOCK, eth_getLogs: [], eth_call: word(1) }[method];
      if (value instanceof Error) throw value;
      return typeof value === "function" ? value(params) : value;
    }, ...extra };
  const state = createActiveEvidenceExecutionState(options);
  return { options, state, calls, counts };
}

test("fresh exact holder cache is read before cooldown and keeps its original timestamp without spending requests", async (t) => {
  const cached = sample(60_000);
  const snapshot = structuredClone(cached);
  const f = fixture(t, cached, { maxProviderRequests: 0 });
  const result = await executeActiveEvidenceProviderRequests(project, requests, f.options, f.state);
  assert.deepEqual(f.counts, { cache: 1, limiter: 0, explorer: 0 });
  assert.equal(f.calls.length, 0);
  assert.equal(f.state.requestsUsed, 0);
  assert.deepEqual(result.observations.map((item) => item.field).sort(), ["holderAddresses", "wallets"]);
  for (const item of result.observations) {
    assert.deepEqual(item.value, HOLDERS);
    assert.equal(item.sourceTimestamp, cached.observedAt);
    assert.equal(item.identityVerifiedOnChain, false);
    assert.equal(item.snapshotTimestampVerified, false);
    assert.equal(item.buyerClassificationAvailable, false);
  }
  assert.equal(result.attempts[0].status, "LOCAL_EVIDENCE_AVAILABLE");
  assert.equal(result.attempts[0].requestCost, 0);
  assert.deepEqual(cached, snapshot);
});

test("aged exact cache only seeds bounded positive balances at the fresh canonical block", async (t) => {
  const cached = sample();
  const snapshot = structuredClone(cached);
  assert.equal(evaluateEvidenceFreshness(cached.observedAt, "wallets", new Date(NOW)).stale, true);
  const f = fixture(t, cached);
  const result = await executeActiveEvidenceProviderRequests(project, requests, f.options, f.state);
  assert.deepEqual(f.counts, { cache: 1, limiter: 1, explorer: 1 });
  assert.deepEqual(f.calls.map((call) => call.method), ["eth_chainId", "eth_getBlockByNumber", "eth_getLogs", "eth_call", "eth_call"]);
  assert.equal(f.state.requestsUsed, 8);
  assert.equal(result.attempts[0].status, "HOLDER_QUERY_SEEDS_AVAILABLE");
  assert.equal(result.attempts[0].holderSampleFieldsRecovered, 0);
  assert.ok(result.attempts.some((item) => item.status === "PROVIDER_COOLDOWN"));
  for (const [index, call] of f.calls.slice(3).entries()) {
    assert.deepEqual(call.params, [{ to: TOKEN, data: "0x70a08231" + encodeAddressWord(HOLDERS[index]) },
      { blockHash: HASH, requireCanonical: true }]);
  }
  for (const item of result.observations) {
    assert.equal(item.source, "rpc-wallets");
    assert.equal(item.sourceTimestamp, new Date(NOW).toISOString());
    assert.deepEqual(item.value, HOLDERS.slice(0, 2));
    assert.equal(item.holderSampleOnly, true);
    assert.equal(item.completeHolderCoverage, false);
    assert.equal(item.buyerClassificationAvailable, false);
  }
  assert.equal(result.observations.length, 2);
  assert.equal(result.projectPatch.goplusWalletEvidence, undefined);
  const analyzed = analyzeWalletCluster({ ...project, ...Object.fromEntries(result.observations.map((item) => [item.field, item.value])) });
  assert.equal(analyzed.walletClusterScore, null);
  assert.equal(analyzed.walletClusterRiskScore, null);
  assert.equal(result.projectPatch.liveExecutionReady, undefined);
  assert.deepEqual(cached, snapshot);
});

test("an allowed GoPlus refresh cannot return the aged cache as a newly acquired holder sample", async (t) => {
  const cached = sample(0, { observedAt: new Date(Date.now() - 164 * 60_000).toISOString() });
  const f = fixture(t, cached, { now: Date.now });
  f.options.goPlusRateLimiter = async () => { f.counts.limiter++; return true; };
  let httpCalls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    httpCalls++;
    return { ok: true, json: async () => ({ result: { [TOKEN]: cached.raw } }) };
  });
  const result = await executeActiveEvidenceProviderRequests(project, requests, f.options, f.state);
  assert.equal(httpCalls, 1);
  assert.deepEqual(f.counts, { cache: 1, limiter: 1, explorer: 0 });
  assert.equal(f.state.requestsUsed, 1);
  assert.equal(f.calls.length, 0);
  for (const item of result.observations.filter((item) => ["wallets", "holderAddresses"].includes(item.field))) {
    assert.equal(item.source, "goplus");
    assert.notEqual(item.sourceTimestamp, cached.observedAt);
    assert.equal(evaluateEvidenceFreshness(item.sourceTimestamp, item.field).stale, false);
    assert.equal(item.snapshotTimestampVerified, false);
  }
  assert.notEqual(result.projectPatch.goplusWalletEvidence.observedAt, cached.observedAt);
});

test("aged cached holder labels cannot replace zero, malformed or failed balance proof", async (t) => {
  for (const balance of [word(0), "0x1", null, new Error("reverted")]) {
    const f = fixture(t, sample(), {}, { eth_call: balance });
    const result = await executeActiveEvidenceProviderRequests(project, requests, f.options, f.state);
    assert.deepEqual(result.observations, []);
    assert.equal(f.calls.filter((call) => call.method === "eth_call").length, 2);
    assert.equal(f.state.requestsUsed, 8);
    assert.equal(result.projectPatch.goplusWalletEvidence, undefined);
  }
});

test("wrong-identity, future, unknown and ineligible cached payloads cannot even supply query seeds", async (t) => {
  for (const patch of [{ chain: "bsc" }, { address: HOLDERS[0] }, { responseIdentityVerified: false },
    { status: "UNKNOWN" }, { confidence: 0.1 }, { observedAt: new Date(NOW + 1).toISOString() },
    { observedAt: new Date(NOW - 7 * 3600_000).toISOString() },
    { raw: { holders: [{ address: HOLDERS[0], balance: "0" }] } }]) {
    const f = fixture(t, sample(undefined, patch));
    const result = await executeActiveEvidenceProviderRequests(project, requests, f.options, f.state);
    assert.deepEqual(result.observations, []);
    assert.equal(f.calls.some((call) => call.method === "eth_call"), false);
    assert.equal(f.state.requestsUsed, 6);
  }
});

test("cached seeds cannot bypass RPC chain, head or response validation", async (t) => {
  for (const rpc of [{ eth_chainId: "0x38" }, { eth_getLogs: [{}] },
    { eth_getBlockByNumber: { ...BLOCK, timestamp: `0x${(NOW / 1000 + 10_000).toString(16)}` } },
    { eth_getBlockByNumber: { ...BLOCK, hash: undefined } }]) {
    const f = fixture(t, sample(), {}, rpc);
    const result = await executeActiveEvidenceProviderRequests(project, requests, f.options, f.state);
    assert.deepEqual(result.observations, []);
    assert.equal(f.calls.some((call) => call.method === "eth_call"), false);
  }
});

test("cache seeding honors disabled reads, shared request limits and the existing probe cap", async (t) => {
  for (const [extra, expectedProbes, expectedUsed] of [[{ useCache: false }, 0, 6],
    [{ maxProviderRequests: 6 }, 0, 6], [{ maxProviderRequests: 7 }, 1, 7],
    [{ walletRpcMaxBalanceProbes: 100, maxProviderRequests: 9 }, 3, 9],
    [{ walletRpcMaxBalanceProbes: 0 }, 0, 6]]) {
    const f = fixture(t, sample(), extra);
    const result = await executeActiveEvidenceProviderRequests(project, requests, f.options, f.state);
    assert.equal(f.counts.cache, extra.useCache === false ? 0 : 1);
    assert.equal(f.calls.filter((call) => call.method === "eth_call").length, expectedProbes);
    assert.equal(f.state.requestsUsed, expectedUsed);
    assert.equal(result.observations.length, expectedProbes ? 2 : 0);
    if (expectedProbes) assert.equal(result.observations[0].value.length, expectedProbes);
  }
});

test("aged cache seeds cannot reset an RPC circuit or promote a deadline-late balance", async (t) => {
  const f = fixture(t);
  f.state.providers.set("rpc-wallets:base", { provider: "rpc-wallets", circuitOpen: true,
    attempts: 0, successes: 0, failures: 1, skipped: 0, lastError: "offline circuit fixture" });
  const result = await executeActiveEvidenceProviderRequests(project, requests, f.options, f.state);
  assert.equal(f.calls.length, 0);
  assert.deepEqual(result.observations, []);
  assert.ok(result.attempts.some((item) => item.status === "CIRCUIT_OPEN"));

  let now = NOW;
  const late = fixture(t, sample(), { now: () => now, deadlineAt: NOW + 100 },
    { eth_call: () => { now += 1000; return word(1); } });
  const lateResult = await executeActiveEvidenceProviderRequests(project, requests, late.options, late.state);
  assert.equal(late.state.timeBudgetExceeded, true);
  assert.deepEqual(lateResult.observations, []);
});

test("initial existing security companions fill only missing arrays unless explicitly requested", async (t) => {
  const cached = sample(60_000);
  const f = fixture(t, cached, { maxProviderRequests: 0 });
  const known = { ...project, securityEvidence: [cached], wallets: [HOLDERS[3]], holderAddresses: [HOLDERS[3]] };
  const explicit = await executeActiveEvidenceProviderRequests(known, [requests[0]], f.options, f.state);
  assert.deepEqual(explicit.observations.map((item) => item.field), ["wallets"]);
  assert.deepEqual(explicit.observations[0].value, HOLDERS);
  for (const invalid of [undefined, null, [], "invalid"]) {
    const result = await executeActiveEvidenceProviderRequests({ ...known, wallets: invalid }, [], f.options, f.state);
    assert.deepEqual(result.observations.map((item) => item.field), ["wallets"]);
    assert.deepEqual(result.observations[0].value, HOLDERS);
  }
  const aged = await executeActiveEvidenceProviderRequests({ ...project, securityEvidence: [sample()] }, [], f.options, f.state);
  assert.deepEqual(aged.observations, []);
  assert.deepEqual(f.counts, { cache: 0, limiter: 0, explorer: 0 });
  assert.equal(f.calls.length, 0);
});
