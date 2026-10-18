import test from "node:test";
import assert from "node:assert/strict";
import { createActiveEvidenceExecutionState, recoverExecutionEvidence } from "../src/data/activeEvidenceProviderExecutor.js";
import { fetchLiFiJson } from "../src/execution/lifiExecutableQuoteProvider.js";
import { PROVIDER_REQUEST_ADMISSION } from "../src/execution/providerRequestAdmission.js";

const NOW = Date.parse("2026-10-18T15:30:00Z");
const TOKEN = `0x${"11".repeat(20)}`;
const POOL = `0x${"22".repeat(20)}`;
const project = { name: "Quota admission utility", symbol: "QUOTA", chain: "base",
  tokenAddress: TOKEN, contractAddress: TOKEN, poolAddress: POOL, priceUsd: 1, liquidityUsd: 200_000 };
const fields = ["purchaseRouteConfirmed", "sellRouteAvailable"];

function buyQuote(url) {
  const params = new URL(url).searchParams;
  const chainId = Number(params.get("fromChain"));
  return { tool: "aerodrome", action: { fromChainId: chainId, toChainId: chainId,
    fromAmount: params.get("fromAmount"), fromToken: { chainId, address: params.get("fromToken"), decimals: 6 },
    toToken: { chainId, address: TOKEN, decimals: 18 } },
    estimate: { toAmount: "1000000000000000000", data: { protocols: [{ poolAddress: POOL }] } } };
}

function fixture(t, transport, extra = {}) {
  t.mock.method(globalThis, "fetch", async () => assert.fail("Real network is forbidden"));
  const budget = { windowStartedAtMs: NOW, requests: 3 };
  const options = { now: () => NOW, maxRequests: 10, providerTimeoutMs: 250,
    executionRecovery: { env: {}, lifiEnabled: true, lifiApiKey: "", zeroxApiKey: "", jupiterApiKey: "",
      tradeSizesUsd: [25], lifiRateBudget: budget, fetchJson: transport }, ...extra };
  return { budget, options, state: createActiveEvidenceExecutionState(options) };
}

for (const rejection of ["REQUEST_BUDGET_EXHAUSTED", "CIRCUIT_OPEN", "TIME_BUDGET_EXHAUSTED"]) {
  test(`LI.FI quota is unchanged when ${rejection} proves no HTTP dispatch`, async (t) => {
    let calls = 0;
    const f = fixture(t, async () => { calls++; return {}; });
    if (rejection === "REQUEST_BUDGET_EXHAUSTED") f.state.requestsUsed = f.state.maxRequests;
    if (rejection === "TIME_BUDGET_EXHAUSTED") f.state.deadlineAt = NOW;
    if (rejection === "CIRCUIT_OPEN") f.state.providers.set("lifi:base", {
      provider: "lifi", circuitScope: "base", circuitOpen: true, attempts: 3, failures: 3,
      successes: 0, skipped: 0, lastError: "already open" });
    const before = structuredClone(f.budget);
    const used = f.state.requestsUsed;
    const result = await recoverExecutionEvidence(project, fields, {}, f.options, f.state);
    assert.equal(calls, 0);
    assert.equal(f.state.requestsUsed, used);
    assert.ok(result.attempts.some((item) => item.status === rejection));
    assert.deepEqual(result.observations, []);
    assert.deepEqual(f.budget, before);
  });
}

test("real failed HTTP consumes LI.FI quota even when its error resembles an admission rejection", async (t) => {
  for (const status of [400, 404, 429, 500, undefined]) {
    let calls = 0;
    const f = fixture(t, async (_url, init) => {
      calls++;
      assert.equal(init[PROVIDER_REQUEST_ADMISSION], undefined);
      const error = new Error("REQUEST_BUDGET_EXHAUSTED after dispatch");
      error.status = status;
      error.code = "REQUEST_BUDGET_EXHAUSTED";
      if (status === 429) error.retryAfter = "120";
      throw error;
    });
    const result = await recoverExecutionEvidence(project, fields, {}, f.options, f.state);
    assert.equal(calls, 1);
    assert.equal(f.state.requestsUsed, 1);
    assert.equal(f.budget.requests, 4);
    assert.deepEqual(result.observations, []);
    if (status === 429) {
      assert.equal(f.budget.cooldownUntilMs, NOW + 120_000);
      await recoverExecutionEvidence(project, fields, {}, f.options, f.state);
      assert.equal(calls, 1);
      assert.equal(f.budget.requests, 4);
      assert.equal(f.state.requestsUsed, 1);
    }
  }
});

test("a dispatched BUY stays charged while an exhausted SELL allowance cancels only its unused reservation", async (t) => {
  let calls = 0;
  const f = fixture(t, async (url) => { calls++; return buyQuote(url); }, { maxRequests: 1 });
  const result = await recoverExecutionEvidence(project, fields, {}, f.options, f.state);
  assert.equal(calls, 1);
  assert.equal(f.state.requestsUsed, 1);
  assert.equal(f.budget.requests, 4);
  assert.ok(result.attempts.some((item) => item.status === "REQUEST_BUDGET_EXHAUSTED"));
  assert.deepEqual(result.observations, []);
});

test("a skipped chain circuit cannot spend the last LI.FI slot needed by another chain", async (t) => {
  let calls = 0;
  const f = fixture(t, async () => { calls++; return {}; });
  f.budget.requests = 69;
  f.state.providers.set("lifi:base", { provider: "lifi", circuitScope: "base", circuitOpen: true,
    attempts: 3, failures: 3, successes: 0, skipped: 0, lastError: "already open" });
  await recoverExecutionEvidence(project, fields, {}, f.options, f.state);
  assert.equal(f.budget.requests, 69);
  await recoverExecutionEvidence({ ...project, chain: "ethereum" }, fields, {}, f.options, f.state);
  assert.equal(calls, 1);
  assert.equal(f.budget.requests, 70);
  assert.equal(f.state.requestsUsed, 1);
});

test("dynamic LI.FI token lookups also preserve quota when the executor cannot admit HTTP", async (t) => {
  let calls = 0;
  const f = fixture(t, async () => { calls++; return {}; }, { maxRequests: 0 });
  const before = structuredClone(f.budget);
  const result = await recoverExecutionEvidence({ ...project, chain: "zksync" }, fields, {}, f.options, f.state);
  assert.equal(calls, 0);
  assert.deepEqual(f.budget, before);
  assert.deepEqual(result.observations, []);
});

test("real timed-out HTTP keeps its LI.FI reservation", async (t) => {
  let calls = 0;
  let signal;
  const f = fixture(t, async (_url, init) => {
    calls++;
    signal = init.signal;
    return new Promise((resolve, reject) => signal.addEventListener("abort", () => reject(new Error("transport aborted")), { once: true }));
  });
  const result = await recoverExecutionEvidence(project, fields, {}, f.options, f.state);
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(calls, 1);
  assert.equal(signal.aborted, true);
  assert.equal(f.budget.requests, 4);
  assert.equal(f.state.requestsUsed, 1);
  assert.deepEqual(result.observations, []);
});

test("a real HTTP failure stays charged while a subsequent circuit rejection costs no quota", async (t) => {
  let calls = 0;
  const f = fixture(t, async () => { calls++; throw new Error("HTTP 503"); }, { circuitFailureThreshold: 1 });
  await recoverExecutionEvidence(project, fields, {}, f.options, f.state);
  assert.equal(f.budget.requests, 4);
  assert.equal(f.state.providers.get("lifi:base").circuitOpen, true);
  await recoverExecutionEvidence(project, fields, {}, f.options, f.state);
  assert.equal(calls, 1);
  assert.equal(f.state.requestsUsed, 1);
  assert.equal(f.budget.requests, 4);
});

test("concurrent LI.FI calls reserve the cap before dispatch and do not refund transport failures", async () => {
  const budget = { windowStartedAtMs: NOW, requests: 0 };
  let calls = 0;
  const options = { now: () => new Date(NOW), apiKey: "", rateBudget: budget, keylessRequestBudget: 2,
    fetchJson: async () => { calls++; await Promise.resolve(); throw new Error("HTTP failed"); } };
  const results = await Promise.allSettled(Array.from({ length: 5 }, () => fetchLiFiJson("https://offline.invalid/quote", options)));
  assert.equal(calls, 2);
  assert.equal(budget.requests, 2);
  assert.equal(results.filter((item) => item.reason?.code === "LIFI_KEYLESS_BUDGET_EXHAUSTED").length, 3);
});

test("late explicit cancellation is one-shot and cannot debit a newer LI.FI rate window", async () => {
  let now = NOW;
  const budget = { windowStartedAtMs: NOW, requests: 0 };
  let rejectOld;
  let oldAdmission;
  const options = { now: () => new Date(now), apiKey: "", rateBudget: budget,
    fetchJson: async (_url, init) => {
      if (now !== NOW) return {};
      oldAdmission = init[PROVIDER_REQUEST_ADMISSION];
      return new Promise((resolve, reject) => { rejectOld = reject; });
    } };
  const old = fetchLiFiJson("https://offline.invalid/quote", options);
  assert.equal(budget.requests, 1);
  now += 2 * 3600_000;
  await fetchLiFiJson("https://offline.invalid/quote", options);
  assert.equal(budget.windowStartedAtMs, now);
  oldAdmission.rejectBeforeDispatch();
  oldAdmission.rejectBeforeDispatch();
  assert.throws(() => oldAdmission.markDispatched(), /no longer available/);
  rejectOld(new Error("explicitly rejected before dispatch"));
  await assert.rejects(old, /explicitly rejected/);
  assert.equal(budget.requests, 1);
});
