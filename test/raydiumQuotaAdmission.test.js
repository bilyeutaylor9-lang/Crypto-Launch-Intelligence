import test from "node:test";
import assert from "node:assert/strict";
import { createActiveEvidenceExecutionState, recoverExecutionEvidence } from "../src/data/activeEvidenceProviderExecutor.js";
import { recoverSolanaRaydiumRoute } from "../src/execution/raydiumExecutableQuoteProvider.js";
import { PROVIDER_REQUEST_ADMISSION } from "../src/execution/providerRequestAdmission.js";

const NOW = Date.parse("2026-10-18T15:30:00Z");
const TOKEN = "66wLt8u1BmvqWb2Wks7NiVeuvNC9NsmrDUVu777YuHzW";
const POOL = "GJ2uhUVnzBj96uxp5b2hX9oJ9k6jX5DnwxYxPneNHfNe";
const project = { name: "Raydium quota utility", symbol: "RQUOTA", chain: "solana",
  tokenAddress: TOKEN, contractAddress: TOKEN, poolAddress: POOL, priceUsd: 1, liquidityUsd: 200_000 };
const fields = ["purchaseRouteConfirmed", "sellRouteAvailable"];

function buyQuote(url) {
  const params = new URL(url).searchParams;
  const inputMint = params.get("inputMint");
  const outputMint = params.get("outputMint");
  return { id: "quota-fixture", success: true, data: { swapType: "BaseIn", inputMint, outputMint,
    inputAmount: params.get("amount"), outputAmount: "1500000000", otherAmountThreshold: "1485000000",
    slippageBps: 100, priceImpactPct: 0.01,
    routePlan: [{ poolId: POOL, inputMint, outputMint }] } };
}

function fixture(t, transport, extra = {}) {
  t.mock.method(globalThis, "fetch", async () => assert.fail("Real network is forbidden"));
  const budget = { startedAt: NOW, requests: 3, retryAt: 0 };
  const options = { now: () => NOW, maxRequests: 10, providerTimeoutMs: 250,
    executionRecovery: { env: {}, lifiEnabled: false, zeroxApiKey: "", jupiterApiKey: "",
      raydiumEnabled: true, tradeSizesUsd: [25], raydiumRateBudget: budget, fetchJson: transport }, ...extra };
  return { budget, options, state: createActiveEvidenceExecutionState(options) };
}

for (const rejection of ["REQUEST_BUDGET_EXHAUSTED", "CIRCUIT_OPEN", "TIME_BUDGET_EXHAUSTED"]) {
  test(`Raydium quota is unchanged when ${rejection} proves no HTTP dispatch`, async (t) => {
    let calls = 0;
    const f = fixture(t, async () => { calls++; return {}; });
    if (rejection === "REQUEST_BUDGET_EXHAUSTED") f.state.requestsUsed = f.state.maxRequests;
    if (rejection === "TIME_BUDGET_EXHAUSTED") f.state.deadlineAt = NOW;
    if (rejection === "CIRCUIT_OPEN") f.state.providers.set("raydium:solana", {
      provider: "raydium", circuitScope: "solana", circuitOpen: true, attempts: 3, failures: 3,
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

test("real failed Raydium HTTP stays charged regardless of generic admission-like error codes", async (t) => {
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
      assert.equal(f.budget.retryAt, NOW + 120_000);
      await recoverExecutionEvidence(project, fields, {}, f.options, f.state);
      assert.equal(calls, 1);
      assert.equal(f.budget.requests, 4);
      assert.equal(f.state.requestsUsed, 1);
    }
  }
});

test("an admitted Raydium BUY stays charged while a rejected SELL costs no provider quota", async (t) => {
  let calls = 0;
  const f = fixture(t, async (url) => { calls++; return buyQuote(url); }, { maxRequests: 1 });
  const result = await recoverExecutionEvidence(project, fields, {}, f.options, f.state);
  assert.equal(calls, 1);
  assert.equal(f.state.requestsUsed, 1);
  assert.equal(f.budget.requests, 4);
  assert.deepEqual(result.observations, []);
});

test("real timed-out Raydium HTTP keeps its provider reservation", async (t) => {
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

test("a real Raydium failure stays charged while a later open circuit consumes no quota", async (t) => {
  let calls = 0;
  const f = fixture(t, async () => { calls++; throw new Error("HTTP 503"); }, { circuitFailureThreshold: 1 });
  await recoverExecutionEvidence(project, fields, {}, f.options, f.state);
  assert.equal(f.state.providers.get("raydium:solana").circuitOpen, true);
  await recoverExecutionEvidence(project, fields, {}, f.options, f.state);
  assert.equal(calls, 1);
  assert.equal(f.state.requestsUsed, 1);
  assert.equal(f.budget.requests, 4);
});

test("concurrent Raydium calls reserve the unchanged cap before dispatch without refunding real failures", async () => {
  const budget = { startedAt: NOW, requests: 98, retryAt: 0 };
  let calls = 0;
  const options = { now: () => new Date(NOW), tradeSizesUsd: [25], raydiumRateBudget: budget,
    fetchJson: async () => { calls++; await Promise.resolve(); throw new Error("HTTP failed"); } };
  const results = await Promise.all(Array.from({ length: 5 }, () => recoverSolanaRaydiumRoute(project, options)));
  assert.equal(calls, 2);
  assert.equal(budget.requests, 100);
  assert.equal(results.filter((item) => item.providerFailureCode === "RATE_BUDGET_EXHAUSTED").length, 3);
});

test("late Raydium cancellation is one-shot and cannot debit a newer rate window", async () => {
  let now = NOW;
  const budget = { startedAt: NOW, requests: 0, retryAt: 0 };
  let rejectOld;
  let oldAdmission;
  const options = { now: () => new Date(now), tradeSizesUsd: [25], raydiumRateBudget: budget,
    fetchJson: async (_url, init) => {
      if (now !== NOW) return { success: false, msg: "ROUTE_NOT_FOUND" };
      oldAdmission = init[PROVIDER_REQUEST_ADMISSION];
      return new Promise((resolve, reject) => { rejectOld = reject; });
    } };
  const old = recoverSolanaRaydiumRoute(project, options);
  assert.equal(budget.requests, 1);
  now += 60_000;
  await recoverSolanaRaydiumRoute(project, options);
  assert.equal(budget.startedAt, now);
  oldAdmission.rejectBeforeDispatch();
  oldAdmission.rejectBeforeDispatch();
  assert.throws(() => oldAdmission.markDispatched(), /no longer available/);
  rejectOld(new Error("explicitly rejected before dispatch"));
  await old;
  assert.equal(budget.requests, 1);
});
