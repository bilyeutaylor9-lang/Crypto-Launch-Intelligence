import test from "node:test";
import assert from "node:assert/strict";
import { analyzeExecutionProofRecoveryBatch, recoverZeroXRoute } from "../src/engines/executionProofRecoveryEngine.js";
import { createActiveEvidenceExecutionState, recoverExecutionEvidence } from "../src/data/activeEvidenceProviderExecutor.js";

const NOW = new Date("2026-10-18T06:00:00.000Z");
const TOKEN = "0x1111111111111111111111111111111111111111";
const POOL = "0x2222222222222222222222222222222222222222";
const OTHER = "0x3333333333333333333333333333333333333333";
const USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
const PROJECT = { name: "Exact utility", symbol: "EXU", chain: "base", tokenAddress: TOKEN,
  contractAddress: TOKEN, poolAddress: POOL, priceUsd: 1, liquidityUsd: 200000,
  identityVerified: true, contractVerified: true, instantSafetyStatus: "PASS" };

function quote(url, adapter, pool) {
  const params = new URL(url).searchParams;
  if (adapter === "lifi") {
    const buy = params.get("toToken").toLowerCase() === TOKEN;
    return { tool: "aerodrome", action: { fromChainId: 8453, toChainId: 8453,
      fromAmount: params.get("fromAmount"),
      fromToken: { chainId: 8453, address: params.get("fromToken"), decimals: buy ? 6 : 18 },
      toToken: { chainId: 8453, address: params.get("toToken"), decimals: buy ? 18 : 6 } },
    estimate: { toAmount: buy ? "1000000000000000000" : "24750000",
      ...(pool ? { data: { protocols: [{ poolAddress: pool }] } } : {}) } };
  }
  return { chainId: 8453, sellToken: params.get("sellToken"), buyToken: params.get("buyToken"),
    sellAmount: params.get("sellAmount"), buyAmount: "25000000", priceImpactPct: 0.2,
    ...(pool ? { route: { fills: [{ poolAddress: pool }] } } : {}) };
}

function options(fetchJson, extra = {}) {
  return { enabled: true, maxCandidates: 1, concurrency: 1, tradeSizesUsd: [25],
    lifiEnabled: true, lifiApiKey: "", zeroxApiKey: "fixture-key", jupiterApiKey: "",
    lifiRateBudget: { windowStartedAtMs: NOW.getTime(), requests: 0 },
    now: () => NOW, fetchJson, ...extra };
}

test("unattested LI.FI quotes do not suppress an exactly attested fallback", async () => {
  for (const firstPool of [undefined, OTHER]) {
    const adapters = [];
    const opts = options(async (url, { adapter }) => {
      adapters.push(adapter);
      return quote(url, adapter, adapter === "lifi" ? firstPool : POOL);
    });
    const [result] = await analyzeExecutionProofRecoveryBatch([PROJECT], opts);
    assert.deepEqual(adapters, ["lifi", "0x", "0x"]);
    assert.equal(opts.lifiRateBudget.requests, 1);
    assert.equal(result.executionProofRecoveryRoute.source, "0x");
    assert.equal(result.executionProofRecoveryRoute.poolAddress, POOL);
    assert.equal(result.executionProofRecoveryRoute.exactIdentityVerified, true);
    assert.equal(result.executionProofRecovery.adapterResults[0].status, "IDENTITY_OR_POOL_UNATTESTED");
  }
});

test("fully attested first adapter still avoids unnecessary fallback calls", async () => {
  const adapters = [];
  const [result] = await analyzeExecutionProofRecoveryBatch([PROJECT], options(async (url, { adapter }) => {
    adapters.push(adapter);
    return quote(url, adapter, POOL);
  }));
  assert.deepEqual(adapters, ["lifi", "lifi"]);
  assert.equal(result.executionProofRecoveryRoute.source, "lifi");
});

test("unattested quotes do not become recovered routes in the standalone batch", async () => {
  const [result] = await analyzeExecutionProofRecoveryBatch([PROJECT], options(async (url, { adapter }) => quote(url, adapter),
    { zeroxApiKey: "" }));
  assert.equal(result.executionProofRecoveryStage.recoveredRoutes, 0);
  assert.equal(result.executionProofRecoveryRoute, undefined);
  assert.equal(result.canonicalExecutionRoute, undefined);
  assert.notEqual(result.buyQuoteVerified, true);
  assert.notEqual(result.sellQuoteVerified, true);
  assert.ok(result.executionProofRecovery.adapterResults.some(x => x.status === "IDENTITY_OR_POOL_UNATTESTED"));
  assert.ok(result.executionProofRecovery.optionalSourceGaps.some(x => x.missingKey === "ZEROX_API_KEY"));
});

test("0x requested pool is not provider attestation on either leg", async () => {
  for (const pool of [undefined, OTHER]) {
    const calls = [];
    const result = await recoverZeroXRoute(PROJECT, options(async (url, { adapter }) => {
      calls.push(adapter);
      return quote(url, adapter, pool);
    }));
    assert.deepEqual(calls, ["0x"]);
    assert.equal(result.status, "IDENTITY_OR_POOL_UNATTESTED");
    assert.equal(result.route, undefined);
    assert.equal(result.buyQuoteVerified, false);
    assert.equal(result.sellQuoteVerified, false);
  }
});

test("fallback HTTP calls remain inside the shared active request budget", async () => {
  for (const maximum of [2, 3, 4]) {
    const adapters = [];
    const opts = { maxRequests: maximum, providerTimeoutMs: 500, now: () => NOW.getTime(),
      executionRecovery: options(async (url, { adapter }) => {
        adapters.push(adapter);
        return quote(url, adapter, adapter === "0x" ? POOL : undefined);
      }) };
    const state = createActiveEvidenceExecutionState(opts);
    const result = await recoverExecutionEvidence(PROJECT,
      ["purchaseRouteConfirmed", "sellRouteAvailable", "quoteTimestamp"], {}, opts, state);
    assert.deepEqual(adapters, ["lifi", "0x", "0x"].slice(0, maximum));
    assert.equal(state.requestsUsed, Math.min(maximum, 3));
    assert.equal(opts.executionRecovery.lifiRateBudget.requests, 1);
    assert.equal(result.attempts.filter(attempt => attempt.status === "SUCCESS").length, adapters.length);
    assert.equal(result.attempts.filter(attempt => attempt.status === "REQUEST_BUDGET_EXHAUSTED").length,
      maximum < 3 ? 1 : 0);
    if (maximum >= 3) assert.equal(result.projectPatch.executionProofRecoveryRoute.source, "0x");
    else assert.deepEqual(result.projectPatch, {});
  }
});

test("fallback cannot attest a foreign token, chain, input amount or invalid output", async () => {
  const mutations = [
    q => { q.buyToken = OTHER; }, q => { q.chainId = 1; }, q => { q.sellAmount = "1"; },
    q => { q.buyAmount = true; }, q => { q.buyAmount = "0x10"; }, q => { q.buyAmount = "-1"; },
  ];
  for (const mutate of mutations) {
    const [result] = await analyzeExecutionProofRecoveryBatch([PROJECT], options(async (url, { adapter }) => {
      const response = quote(url, adapter, POOL);
      if (adapter === "0x") mutate(response);
      return response;
    }, { lifiEnabled: false }));
    assert.equal(result.executionProofRecoveryRoute, undefined);
    assert.equal(result.executionProofRecoveryStage.recoveredRoutes, 0);
  }
});

test("missing or malformed 0x impact is unknown even in standalone recovery", async () => {
  for (const impact of [undefined, null, false, [], " ", "0x10", "1e-999", -1]) {
    const result = await recoverZeroXRoute(PROJECT, options(async (url, { adapter }) => ({
      ...quote(url, adapter, POOL), priceImpactPct: impact,
    })));
    assert.equal(result.route.slippagePct, null);
    assert.notEqual(result.route.slippageIsHeuristic, false);
  }
});

test("0x round-trip impact includes both measured legs rather than only their maximum", async () => {
  const result = await recoverZeroXRoute(PROJECT, options(async (url, { adapter }) => ({
    ...quote(url, adapter, POOL),
    priceImpactPct: new URL(url).searchParams.get("sellToken").toLowerCase() === USDC ? "0.2" : "0.4",
  })));
  assert.equal(result.route.estimatedRoundTripSlippagePct, 0.6);
});
