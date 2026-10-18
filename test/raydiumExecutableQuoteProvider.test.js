import test from "node:test";
import assert from "node:assert/strict";
import { recoverSolanaRaydiumRoute, verifyRaydiumQuote } from "../src/execution/raydiumExecutableQuoteProvider.js";
import { createActiveEvidenceExecutionState, executeActiveEvidenceProviderRequests, recoverExecutionEvidence } from "../src/data/activeEvidenceProviderExecutor.js";
import { sourcesForField } from "../src/data/enrichmentSourceRegistry.js";
import { analyzeExecutionProofRecoveryBatch } from "../src/engines/executionProofRecoveryEngine.js";
import { analyzeActiveEvidenceRecoveryBatch, buildActiveEvidenceRecoveryWaves } from "../src/engines/activeEvidenceRecoveryEngine.js";
import { analyzeCanonicalExecutionRoute } from "../src/engines/canonicalExecutionRouteEngine.js";
import { analyzeExecutionProof } from "../src/engines/executionProofEngine.js";
import { routeQuoteFresh } from "../src/execution/routeTruthV2.js";
import { summarizeExecutionProofRecovery } from "../src/reports/executionProofRecoveryReportEngine.js";

const NOW = new Date("2026-10-18T09:45:00Z");
const TOKEN = "66wLt8u1BmvqWb2Wks7NiVeuvNC9NsmrDUVu777YuHzW";
const POOL = "GJ2uhUVnzBj96uxp5b2hX9oJ9k6jX5DnwxYxPneNHfNe";
const OTHER = "So11111111111111111111111111111111111111112";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const FIELDS = ["purchaseRouteConfirmed", "sellRouteAvailable", "quoteTimestamp", "slippagePct"];

function candidate(overrides = {}) {
  return { name: "Raydium utility fixture", symbol: "FIXTURE", chain: "solana", tokenAddress: TOKEN,
    contractAddress: TOKEN, poolAddress: POOL, identityVerified: true, priceUsd: 0.01,
    liquidityUsd: 200_000, instantSafetyStatus: "PASS", ...overrides };
}

function quote(url) {
  const params = new URL(url).searchParams;
  const inputMint = params.get("inputMint");
  const outputMint = params.get("outputMint");
  return { id: "documented-quote-handle", success: true, version: "V1", data: {
    swapType: "BaseIn", inputMint, outputMint, inputAmount: params.get("amount"),
    outputAmount: inputMint === USDC ? "1500000000" : "24750000",
    otherAmountThreshold: inputMint === USDC ? "1485000000" : "24502500",
    slippageBps: 100, priceImpactPct: 0.01,
    routePlan: [{ poolId: POOL, inputMint, outputMint, feeMint: inputMint, feeAmount: "2500" }],
  } };
}

function options(fetchJson, overrides = {}) {
  return { now: () => NOW, fetchJson, tradeSizesUsd: [25], requestTimeoutMs: 500,
    raydiumEnabled: true, raydiumRateBudget: { startedAt: null, requests: 0, retryAt: 0 }, ...overrides };
}

function activeOptions(fetchJson, overrides = {}) {
  return { maxRequests: 10, now: () => NOW.getTime(), providerTimeoutMs: 500,
    executionRecovery: { env: {}, lifiEnabled: false, jupiterApiKey: "", zeroxApiKey: "",
      ...options(fetchJson), now: undefined }, ...overrides };
}

test("Raydium returns exact two-way quote evidence without a Jupiter key, using all bought units on SELL", async () => {
  const calls = [];
  const result = await recoverSolanaRaydiumRoute(candidate(), options(async (url, init) => {
    calls.push({url, init}); return quote(url);
  }));
  assert.equal(result.status, "ROUTE_RECOVERED");
  assert.equal(calls.length, 2);
  assert.equal(calls.every(call => new URL(call.url).hostname === "transaction-v1.raydium.io"), true);
  assert.equal(calls.every(call => call.init.method === "GET" && call.init.adapter === "raydium"), true);
  assert.equal(new URL(calls[1].url).searchParams.get("amount"), "1500000000");
  const route = result.route;
  assert.equal(route.poolAddress, POOL);
  assert.equal(route.slippagePct, 1);
  assert.equal(route.slippageIsHeuristic, false);
  assert.equal(route.quoteExpiresAt, "2026-10-18T09:45:30.000Z");
  assert.equal(route.quoteCostIncludesNetworkFees, false);
  assert.equal(route.buyQuote.inputMint, USDC);
  assert.equal(route.sellQuote.outputMint, USDC);
  assert.equal("liveExecutionReady" in route, false);
  assert.equal("safetyVerified" in route, false);
  assert.equal("finalSelectionQualified" in route, false);
});

test("free Solana source registry and EXECUTION dispatch actually invoke budgeted Raydium recovery", async () => {
  assert.ok(sourcesForField("purchaseRouteConfirmed", {chain: "solana", routeType: "DEX"}).some(s => s.source === "Raydium Trade API" && s.free));
  const opts = activeOptions(async url => quote(url));
  const state = createActiveEvidenceExecutionState(opts);
  const result = await executeActiveEvidenceProviderRequests(candidate(), FIELDS.map(field => ({field,
    item: {canonicalField: field, requiresFreshObservation: true, targetSources: [{source: "Raydium Trade API"}]}})), opts, state);
  assert.equal(state.requestsUsed, 2);
  assert.equal(state.providers.get("raydium:solana").attempts, 2);
  assert.equal(result.projectPatch.executionProofRecoveryRoute.source, "raydium");
  assert.equal(result.projectPatch.executionProofRecoveryRoute.quoteExpiresAt, "2026-10-18T09:45:30.000Z");
  for (const observation of result.observations) {
    assert.equal(observation.source, "raydium");
    assert.equal(observation.sourceTimestamp, NOW.toISOString());
    assert.equal(observation.verificationStatus, "VERIFIED_PROVIDER_OBSERVATION");
    assert.equal(observation.poolAddress, POOL);
    assert.equal(observation.recoveryRun, true);
  }
});

test("standalone recovery selects the free Raydium adapter when Jupiter is unavailable", async () => {
  const [result] = await analyzeExecutionProofRecoveryBatch([candidate()], {env: {}, jupiterApiKey: "",
    ...options(async url => quote(url))});
  assert.equal(result.executionProofRecovery.status, "ROUTE_RECOVERED");
  assert.equal(result.executionProofRecoveryRoute.source, "raydium");
  assert.equal(result.canonicalExecutionRoute.quoteExpiresAt, "2026-10-18T09:45:30.000Z");
});

test("standalone refresh replaces old provider bounds, including when the new provider has no explicit expiry", async (t) => {
  let now = NOW.getTime();
  t.mock.method(Date, "now", () => now);
  for (const provider of ["raydium", "jupiter"]) {
    now = NOW.getTime();
    const [first] = await analyzeExecutionProofRecoveryBatch([candidate()], {env: {}, jupiterApiKey: "",
      ...options(async url => quote(url), {now: () => new Date(now)})});
    assert.equal(first.canonicalExecutionRoute.quoteExpiresAt, "2026-10-18T09:45:30.000Z");
    now += 45_000;
    assert.equal(routeQuoteFresh(first), false);
    const [fresh] = await analyzeExecutionProofRecoveryBatch([first], {env: {},
      ...options(async url => {
        if (provider === "raydium") return quote(url);
        const params = new URL(url).searchParams;
        return {inputMint: params.get("inputMint"), outputMint: params.get("outputMint"),
          inAmount: params.get("amount"), outAmount: "25000000", priceImpactPct: "0.2",
          routePlan: [{swapInfo: {ammKey: POOL}}]};
      }, {now: () => new Date(now)}), jupiterApiKey: provider === "jupiter" ? "fixture-key" : "" });
    assert.equal(fresh.executionProofRecovery.status, "ROUTE_RECOVERED");
    assert.equal(fresh.executionProofRecoveryRoute.source, provider);
    assert.equal(routeQuoteFresh(fresh), true);
    assert.equal(Object.hasOwn(fresh.canonicalExecutionRoute, "quoteExpiresAt"), provider === "raydium");
    assert.equal(Object.hasOwn(fresh, "quoteExpiresAt"), provider === "raydium");
    if (provider === "raydium") assert.equal(fresh.quoteExpiresAt, "2026-10-18T09:46:15.000Z");
  }
});

test("only selected Solana Wave3 candidates acquire quotes; dependent recomputation preserves expiry and missing authority", async (t) => {
  let now = NOW.getTime();
  t.mock.method(Date, "now", () => now);
  const projects = [10, 80].map(score => candidate({ preliminaryOpportunityScore: score,
    deepEvaluationState: "DEEP_EVALUATED", finalSelectionQualified: false,
    executionProof: {routeType: "DEX", buyQuoteVerified: false, sellQuoteVerified: false, liveExecutionReady: false} }));
  const planned = buildActiveEvidenceRecoveryWaves(projects, {wave3Max: 1, freeOnly: true});
  assert.equal(planned.waves.WAVE3.length, 1);
  assert.equal(planned.waves.WAVE3[0].projectIndex, 1);
  let calls = 0;
  const opts = activeOptions(async url => {calls++; return quote(url);});
  const results = await analyzeActiveEvidenceRecoveryBatch(projects, { ...opts, wave1Max: 0, wave2Max: 0,
    wave3Max: 1, maxProviderRequests: 2, useCache: false, walletHistory: false, freeOnly: true });
  assert.equal(calls, 2);
  assert.equal(results[0].executionProofRecoveryRoute, undefined);
  assert.equal(results[1].executionProofRecoveryRoute.poolAddress, POOL);
  assert.ok(results[1].activeEvidenceRecovery.changedEvidenceFamilies.includes("EXECUTION"));
  const produced = analyzeExecutionProof(analyzeCanonicalExecutionRoute(results[1]));
  assert.equal(produced.executionProof.buyQuoteVerified, true);
  assert.equal(produced.executionProof.sellQuoteVerified, true);
  assert.equal(produced.executionProof.observedSlippagePct, 1);
  assert.equal(produced.executionProof.quoteExpiresAt, "2026-10-18T09:45:30.000Z");
  assert.equal(produced.executionProof.authorityEvidenceVerified, false);
  assert.equal(produced.liveExecutionReady, false);
  assert.equal(produced.finalSelectionQualified, false);
  now += 30_000;
  assert.equal(routeQuoteFresh(produced), false);
});

test("known identity conflicts, no pool, EVM identity and symbol-only requests issue no Raydium calls", async () => {
  for (const project of [candidate({contractAddress: OTHER}), candidate({poolAddress: undefined}),
    candidate({chain: "base"}), {symbol: "FIXTURE"}, candidate({chainId: "base"})]) {
    let calls = 0;
    const result = await recoverSolanaRaydiumRoute(project, options(async url => {calls++; return quote(url);}));
    assert.equal(calls, 0);
    assert.equal(result.route, undefined);
  }
});

test("both independently returned quote legs must attest the exact expected pool", async () => {
  for (const side of ["BUY", "SELL"]) {
    const result = await recoverSolanaRaydiumRoute(candidate(), options(async url => {
      const result = quote(url);
      const buy = new URL(url).searchParams.get("inputMint") === USDC;
      if ((side === "BUY") === buy) result.data.routePlan[0].poolId = OTHER;
      return result;
    }));
    assert.equal(result.route, undefined);
    assert.equal(result.status, "IDENTITY_OR_POOL_UNATTESTED");
  }
});

test("malformed success, amounts, mint identity, request semantics or pool paths stay unverified", () => {
  const url = `https://fixture.invalid/?inputMint=${USDC}&outputMint=${TOKEN}&amount=25000000`;
  const expected = {fromToken: USDC, toToken: TOKEN, fromAmount: "25000000", poolAddress: POOL};
  const mutations = [
    q => {q.success = "true";}, q => {q.id = "";}, q => {q.data.swapType = "BaseOut";},
    q => {q.data.inputAmount = "24999999";}, q => {q.data.outputAmount = "0";},
    q => {q.data.outputAmount = 1000;}, q => {q.data.outputAmount = "18446744073709551616";},
    q => {q.data.outputMint = OTHER;}, q => {q.data.chainId = 1;},
    q => {q.data.slippageBps = 500;}, q => {q.data.otherAmountThreshold = "1500000001";},
    q => {q.data.routePlan = [];}, q => {q.data.routePlan[0].inputMint = OTHER;},
    q => {q.data.routePlan[0].poolId = "not-a-pool";},
  ];
  for (const mutate of mutations) {
    const value = quote(url); mutate(value);
    assert.throws(() => verifyRaydiumQuote(value, expected));
  }
});

test("contiguous multi-hop quotes are accepted only when the expected pool touches the target mint", () => {
  const value = quote(`https://fixture.invalid/?inputMint=${USDC}&outputMint=${TOKEN}&amount=25000000`);
  value.data.routePlan = [{poolId: USDC, inputMint: USDC, outputMint: OTHER},
    {poolId: POOL, inputMint: OTHER, outputMint: TOKEN}];
  const expected = {fromToken: USDC, toToken: TOKEN, fromAmount: "25000000", poolAddress: POOL};
  assert.equal(verifyRaydiumQuote(value, expected).pools.includes(POOL), true);
  assert.throws(() => verifyRaydiumQuote(value, {...expected, poolAddress: USDC}));
  value.data.routePlan[1].inputMint = USDC;
  assert.throws(() => verifyRaydiumQuote(value, expected));
});

test("no sell quote remains unknown; a missing price impact is not fabricated as zero", async () => {
  const missing = await recoverSolanaRaydiumRoute(candidate(), options(async url =>
    new URL(url).searchParams.get("inputMint") === USDC ? quote(url) : {success: false, msg: "No route found"}));
  assert.equal(missing.status, "NO_SELL_QUOTE");
  assert.equal(missing.route, undefined);
  const raw = await recoverSolanaRaydiumRoute(candidate(), options(async url => {
    const result = quote(url); delete result.data.priceImpactPct; return result;
  }));
  assert.equal("priceImpactPct" in raw.route, false);
  assert.equal(raw.route.slippagePct, 1);
});

test("expiry is anchored before BUY and slow response or SELL cannot refresh it", async () => {
  let time = NOW.getTime();
  const result = await recoverSolanaRaydiumRoute(candidate(), options(async url => {
    time += 16_000; return quote(url);
  }, {now: () => new Date(time)}));
  assert.equal(result.status, "STALE_QUOTES");
  assert.equal(result.route, undefined);
  time = NOW.getTime();
  const slow = await recoverSolanaRaydiumRoute(candidate(), options(async url => {
    time += 30_000; return quote(url);
  }, {now: () => new Date(time)}));
  assert.equal(slow.status, "PROVIDER_FAILED");
  assert.equal(slow.route, undefined);
});

test("shared provider request budget zero or one cannot promote a two-way quote", async () => {
  for (const maxRequests of [0, 1]) {
    let calls = 0;
    const opts = activeOptions(async url => {calls++; return quote(url);}, {maxRequests});
    const state = createActiveEvidenceExecutionState(opts);
    const result = await recoverExecutionEvidence(candidate(), FIELDS, {}, opts, state);
    assert.equal(calls, maxRequests);
    assert.equal(state.requestsUsed, maxRequests);
    assert.deepEqual(result.projectPatch, {});
    assert.deepEqual(result.observations, []);
  }
});

test("Raydium circuit breaker stops unrelated repeat HTTP failures without poisoning other providers", async () => {
  let calls = 0;
  const opts = activeOptions(async () => {calls++; throw new Error("Unavailable");}, {circuitFailureThreshold: 1});
  const state = createActiveEvidenceExecutionState(opts);
  for (let i = 0; i < 2; i++) await recoverExecutionEvidence(candidate(), FIELDS, {}, opts, state);
  assert.equal(calls, 1);
  assert.equal(state.providers.get("raydium:solana").circuitOpen, true);
});

test("hard quote allowance, Retry-After and explicit disable send no excess HTTP calls", async () => {
  let calls = 0;
  const fetchJson = async url => {calls++; return quote(url);};
  const result = await recoverSolanaRaydiumRoute(candidate(), options(fetchJson, {
    raydiumRateBudget: {startedAt: NOW.getTime(), requests: 100, retryAt: 0}}));
  assert.equal(result.providerFailureCode, "RATE_BUDGET_EXHAUSTED");
  assert.equal(calls, 0);
  const disabled = await recoverSolanaRaydiumRoute(candidate(), options(fetchJson, {raydiumEnabled: false}));
  assert.equal(disabled.status, "DISABLED");
  assert.equal(calls, 0);
  const budget = {startedAt: null, requests: 0, retryAt: 0};
  const opts = options(async () => {calls++; const error = new Error("HTTP 429"); error.status = 429; error.retryAfter = "120"; throw error;}, {raydiumRateBudget: budget});
  await recoverSolanaRaydiumRoute(candidate(), opts);
  await recoverSolanaRaydiumRoute(candidate(), opts);
  assert.equal(calls, 1);
  assert.equal(budget.retryAt, NOW.getTime() + 120_000);
});

test("invalid observation clocks and underflowed trade amounts cannot consume provider requests", async () => {
  let calls = 0;
  const fetchJson = async url => {calls++; return quote(url);};
  const invalidClock = await recoverSolanaRaydiumRoute(candidate(), options(fetchJson, {now: () => new Date(NaN)}));
  const invalidSize = await recoverSolanaRaydiumRoute(candidate(), options(fetchJson, {tradeSizesUsd: [1e-300]}));
  assert.equal(invalidClock.route, undefined);
  assert.equal(invalidSize.status, "INVALID_TRADE_SIZE");
  assert.equal(calls, 0);
});

test("recovery reporting counts Raydium HTTP requests and expires recovered routes at the provider deadline", async (t) => {
  let now = NOW.getTime();
  t.mock.method(Date, "now", () => now);
  const opts = activeOptions(async url => quote(url));
  const result = await recoverExecutionEvidence(candidate(), FIELDS, {}, opts, createActiveEvidenceExecutionState(opts));
  const project = { ...candidate(), ...result.projectPatch,
    executionProofRecovery: {status: "DEFERRED_TO_WAVE3", attempted: false},
    activeEvidenceRecovery: {waves: ["WAVE3"], attempts: [{family: "EXECUTION"}],
      providerAttempts: result.attempts, executionAdapterResults: result.executionAdapterResults} };
  const fresh = summarizeExecutionProofRecovery([project]);
  assert.equal(fresh.executionProviderRequestsUsed, 2);
  assert.equal(fresh.adapterHealth.find(adapter => adapter.adapter === "raydium").httpSuccesses, 2);
  assert.equal(fresh.routesRecovered, 1);
  assert.equal(fresh.staleQuotes, 0);
  now += 30_000;
  const expired = summarizeExecutionProofRecovery([project]);
  assert.equal(expired.executionProviderRequestsUsed, 2);
  assert.equal(expired.routesRecovered, 0);
  assert.equal(expired.staleQuotes, 1);
});
