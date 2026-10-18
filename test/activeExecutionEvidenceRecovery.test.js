import test from "node:test";
import assert from "node:assert/strict";
import {
  createActiveEvidenceExecutionState,
  executeActiveEvidenceProviderRequests,
  recoverExecutionEvidence,
  summarizeActiveEvidenceExecutionState,
} from "../src/data/activeEvidenceProviderExecutor.js";
import { analyzeCanonicalExecutionRoute } from "../src/engines/canonicalExecutionRouteEngine.js";
import { analyzeExecutionProof } from "../src/engines/executionProofEngine.js";
import { summarizeExecutionProofRecovery } from "../src/reports/executionProofRecoveryReportEngine.js";

const NOW = new Date("2026-10-17T12:00:00.000Z");
const TOKEN = "0x1111111111111111111111111111111111111111";
const POOL = "0x2222222222222222222222222222222222222222";
const OTHER = "0x3333333333333333333333333333333333333333";
const USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
const FIELDS = ["purchaseRouteConfirmed", "sellRouteAvailable", "quoteTimestamp", "slippagePct"];

function project(overrides = {}) {
  return { name: "Execution Utility", symbol: "EXU", chain: "base",
    tokenAddress: TOKEN, contractAddress: TOKEN, poolAddress: POOL,
    priceUsd: 0.006, liquidityUsd: 260_000, identityVerified: true,
    contractVerified: true, instantSafetyStatus: "PASS",
    executionProof: { buyQuoteVerified: false, sellQuoteVerified: false, slippageVerified: false },
    ...overrides };
}

// Same action/estimate/pool shape as the LI.FI execution recovery and integrity fixtures.
function lifiQuote(url) {
  const params = new URL(url).searchParams;
  const buy = params.get("toToken").toLowerCase() === TOKEN;
  const chainId = Number(params.get("fromChain"));
  return { tool: "aerodrome", toolDetails: { name: "Aerodrome" },
    action: { fromChainId: chainId, toChainId: chainId, fromAmount: params.get("fromAmount"),
      fromToken: { chainId, address: params.get("fromToken"), decimals: buy ? 6 : 18 },
      toToken: { chainId, address: params.get("toToken"), decimals: buy ? 18 : 6 } },
    estimate: { tool: "aerodrome", toAmount: buy ? "5000000000000000000" : "24750000",
      data: { protocols: [{ poolAddress: POOL }] } } };
}

function options(fetchJson, overrides = {}) {
  return { now: () => NOW.getTime(), maxRequests: 10, providerTimeoutMs: 500,
    executionRecovery: { enabled: true, env: {}, lifiEnabled: true, lifiApiKey: "",
      jupiterApiKey: "", zeroxApiKey: "", tradeSizesUsd: [25],
      lifiRateBudget: { windowStartedAtMs: NOW.getTime(), requests: 0 },
      fetchJson, ...overrides.executionRecovery },
    ...Object.fromEntries(Object.entries(overrides).filter(([key]) => key !== "executionRecovery")) };
}

async function execute(candidate, opts, state = createActiveEvidenceExecutionState(opts), fields = FIELDS, source = "LI.FI keyless quote") {
  const result = await executeActiveEvidenceProviderRequests(candidate, fields.map((field) => ({ field,
    item: { canonicalField: field, requiresFreshObservation: true, targetSources: [{ source }] } })), opts, state);
  return { ...result, state };
}

function unresolved(result) {
  assert.deepEqual(result.observations, []);
  assert.deepEqual(result.projectPatch, {});
}

test("EXECUTION dispatch performs two actual LI.FI quote HTTP calls and returns only raw proof with provenance", async () => {
  const calls = [];
  const candidate = project({ liveExecutionReady: false, finalQualification: "BLOCKED", buyTaxPct: null });
  const original = structuredClone(candidate);
  const opts = options(async (url, init) => {
    calls.push({ url, init });
    assert.equal(init.adapter, "lifi");
    assert.equal(new URL(url).hostname, "li.quest");
    assert.equal(init.signal.aborted, false);
    assert.ok(init.timeoutMs <= 500);
    return lifiQuote(url);
  });
  const result = await execute(candidate, opts);
  assert.equal(calls.length, 2);
  assert.equal(new URL(calls[0].url).searchParams.get("fromToken").toLowerCase(), USDC);
  assert.equal(new URL(calls[1].url).searchParams.get("fromToken"), TOKEN);
  assert.equal(new URL(calls[1].url).searchParams.get("fromAmount"), "5000000000000000000");
  assert.equal(result.state.requestsUsed, 2);
  assert.equal(result.state.providers.get("lifi:base").attempts, 2);
  const values = Object.fromEntries(result.observations.map((item) => [item.field, item.value]));
  assert.equal(values.purchaseRouteConfirmed, true);
  assert.equal(values.sellRouteAvailable, true);
  assert.equal(values.quoteTimestamp, NOW.toISOString());
  assert.equal(values.slippagePct, 1);
  assert.equal(values.priceImpactPct, 1);
  assert.equal(values.executableDepthUsd, 25);
  assert.equal(values.verifiedTradeSizeUsd, 25);
  for (const item of result.observations) {
    assert.equal(item.source, "lifi");
    assert.equal(item.sourceTimestamp, NOW.toISOString());
    assert.equal(item.verificationStatus, "VERIFIED_PROVIDER_OBSERVATION");
    assert.equal(item.recoveryRun, true);
    assert.equal(item.confidence, 0.9);
    assert.equal(item.chain, "base");
    assert.equal(item.tokenAddress, TOKEN);
    assert.equal(item.poolAddress, POOL);
    assert.equal(item.identityMatchMode, "exact-chain-contract-pool");
  }
  assert.deepEqual(Object.keys(result.projectPatch), ["executionProofRecoveryRoute"]);
  const route = result.projectPatch.executionProofRecoveryRoute;
  assert.equal(route.exactIdentityVerified, true);
  assert.equal(route.buyQuoteVerified, true);
  assert.equal(route.sellQuoteVerified, true);
  assert.equal(route.poolAddress, POOL);
  assert.equal(route.sourceTimestamp, NOW.toISOString());
  assert.equal(route.recoveryRun, true);
  for (const field of ["liveExecutionReady", "finalQualification", "strictRankEligible", "routeTruthStatus",
    "executionProofState", "safetyVerified", "taxesVerified", "liquidityUsd", "priceUsd"]) assert.equal(field in route, false, field);
  assert.deepEqual(candidate, original);
});

test("budget zero makes no HTTP call; budget one cannot send SELL or promote a two-way route", async () => {
  for (const maxRequests of [0, 1]) {
    let calls = 0;
    const result = await execute(project(), options(async (url) => { calls++; return lifiQuote(url); }, { maxRequests }));
    assert.equal(calls, maxRequests);
    assert.equal(result.state.requestsUsed, maxRequests);
    assert.ok(result.attempts.some((item) => item.status === "REQUEST_BUDGET_EXHAUSTED"));
    unresolved(result);
  }
});

test("execution recovery reporting reconciles budgeted Wave3 work without changing producer history", async (t) => {
  t.mock.method(Date, "now", () => NOW.getTime());
  const result = await execute(project(), options(async (url) => lifiQuote(url)));
  const candidate = { ...project(), ...result.projectPatch,
    executionProofRecovery: { status: "DEFERRED_TO_WAVE3", attempted: false },
    activeEvidenceRecovery: { waves: ["WAVE3"], attempts: [{ family: "EXECUTION" }], providerAttempts: result.attempts } };
  const report = summarizeExecutionProofRecovery([candidate]);
  assert.equal(report.candidatesAttempted, 1);
  assert.equal(report.routesRecovered, 1);
  assert.equal(candidate.executionProofRecovery.status, "DEFERRED_TO_WAVE3");
  const unmatched = summarizeExecutionProofRecovery([{ ...candidate, executionProofRecoveryRoute: {} }]);
  assert.equal(unmatched.candidatesAttempted, 1);
  assert.equal(unmatched.routesRecovered, 0);
});

test("candidate-specific no-quote responses cannot open the provider circuit for unrelated candidates", async () => {
  for (const status of [400, 404, 422]) {
    let unavailable = true;
    const opts = options(async (url) => {
      if (unavailable) { const error = new Error(`HTTP ${status}`); error.status = status; throw error; }
      return lifiQuote(url);
    }, { circuitFailureThreshold: 1 });
    const state = createActiveEvidenceExecutionState(opts);
    const missing = await execute(project(), opts, state);
    unresolved(missing);
    assert.ok(missing.attempts.some((attempt) => attempt.status === "NO_CANDIDATE_EVIDENCE" && attempt.httpStatus === status));
    assert.equal(state.providers.get("lifi:base").circuitOpen, false);
    assert.equal(state.providers.get("lifi:base").failures, 0);
    unavailable = false;
    const recovered = await execute(project(), opts, state);
    assert.equal(recovered.observations.some((item) => item.field === "purchaseRouteConfirmed"), true);
    assert.equal(state.requestsUsed, 3);
  }
});

test("raw patch feeds offline canonical/proof recomputation without relaxing missing tax evidence", async (t) => {
  t.mock.method(Date, "now", () => NOW.getTime());
  let calls = 0;
  const candidate = project();
  const result = await execute(candidate, options(async (url) => { calls++; return lifiQuote(url); }));
  const patched = { ...candidate, ...result.projectPatch,
    ...Object.fromEntries(result.observations.map((item) => [item.field, item.value])) };
  const canonical = analyzeCanonicalExecutionRoute(patched);
  assert.equal(canonical.canonicalExecutionRoute.venue, "Aerodrome");
  assert.equal(canonical.canonicalExecutionRoute.contractAddress, TOKEN);
  assert.equal(canonical.canonicalExecutionRoute.poolAddress, POOL);
  assert.equal(canonical.canonicalExecutionRoute.buyQuoteVerified, true);
  assert.equal(canonical.canonicalExecutionRoute.sellQuoteVerified, true);
  const proof = analyzeExecutionProof(canonical);
  assert.equal(proof.executionProof.buyQuoteVerified, true);
  assert.equal(proof.executionProof.sellQuoteVerified, true);
  assert.equal(proof.executionProof.estimatedSlippage100, 1);
  assert.equal(proof.executableDepthUsd, 25);
  assert.equal(proof.executionProof.transferTaxEvidenceVerified, false);
  assert.equal(proof.liveExecutionReady, false);
  assert.equal(calls, 2);
});

test("LI.FI quote-token discovery, BUY and SELL each reserve a shared HTTP slot", async () => {
  for (const maxRequests of [1, 2, 3]) {
    const adapters = [];
    const opts = options(async (url, init) => {
      adapters.push(init.adapter);
      if (init.adapter === "lifi-token") return { chainId: 324, address: USDC, decimals: 6, symbol: "USDC" };
      return lifiQuote(url);
    }, { maxRequests });
    const result = await execute(project({ chain: "zksync" }), opts);
    assert.deepEqual(adapters, ["lifi-token", "lifi", "lifi"].slice(0, maxRequests));
    assert.equal(result.state.requestsUsed, maxRequests);
    assert.equal(result.state.providers.get("lifi:zksync").attempts, maxRequests);
    if (maxRequests < 3) unresolved(result);
    else assert.equal(result.projectPatch.executionProofRecoveryRoute.exactIdentityVerified, true);
  }
});

test("each LI.FI side must attest exact chain, contract and amount even with the correct pool", async () => {
  const mutations = [
    (quote) => { quote.action.fromToken.chainId = 1; },
    (quote) => { quote.action.toToken.address = OTHER; },
    (quote) => { delete quote.action.toToken; },
    (quote) => { quote.action.fromAmount = "1"; },
  ];
  for (const side of [1, 2]) {
    for (const mutate of mutations) {
      let calls = 0;
      const result = await execute(project(), options(async (url) => {
        const quote = lifiQuote(url);
        if (++calls === side) mutate(quote);
        return quote;
      }));
      assert.equal(calls, side);
      unresolved(result);
    }
  }
});

test("unknown, fabricated, pool-unattested and different-pool routes remain unresolved", async () => {
  const fixtures = [
    () => ({ buyQuoteVerified: true, sellQuoteVerified: true, liveExecutionReady: true }),
    (url) => ({ ...lifiQuote(url), tool: null, toolDetails: null, estimate: { toAmount: "0" } }),
    (url) => { const quote = lifiQuote(url); delete quote.estimate.data; return quote; },
    (url) => { const quote = lifiQuote(url); quote.estimate.data.protocols[0].poolAddress = OTHER; return quote; },
    (url) => { const quote = lifiQuote(url); if (quote.action.fromToken.address === TOKEN) delete quote.estimate.data; return quote; },
  ];
  for (const fetchJson of fixtures) {
    const result = await execute(project(), options(fetchJson));
    unresolved(result);
    assert.equal(result.executionAdapterResults.some((item) => item.status === "ROUTE_RECOVERED"), false);
    assert.ok(result.attempts.some((attempt) => ["NO_VERIFIED_ROUTE", "IDENTITY_OR_POOL_UNATTESTED"].includes(attempt.status)));
  }
});

test("conflicting fixed identity, missing known pool and symbol-only candidates never probe", async () => {
  const candidates = [
    project({ poolAddress: null }), project({ tokenAddress: null, contractAddress: null }),
    project({ canonicalChain: "ethereum" }), project({ finalContractAddress: OTHER }),
    project({ poolAddress: TOKEN }), project({ poolAddress: `0x${"0".repeat(40)}` }),
    project({ canonicalExecutionRoute: { chain: "base", tokenAddress: TOKEN, poolAddress: OTHER } }),
    { name: "Execution Utility", symbol: "EXU" },
  ];
  for (const candidate of candidates) {
    let calls = 0;
    const result = await execute(candidate, options(async () => { calls++; return {}; }));
    assert.equal(calls, 0);
    assert.equal(result.state.requestsUsed, 0);
    unresolved(result);
  }
});

test("DERIVED execution/qualification fields are never sent to the recovery batch", async () => {
  let calls = 0;
  const opts = options(async () => { calls++; return {}; });
  const fields = ["executionStatus", "executionProofState", "liveExecutionReady", "finalQualification", "strictRankEligible"];
  const result = await execute(project(), opts, undefined, fields);
  assert.equal(calls, 0);
  assert.equal(result.state.requestsUsed, 0);
  unresolved(result);
  assert.deepEqual(await recoverExecutionEvidence(project(), fields, {}, opts), {
    observations: [], projectPatch: {}, attempts: [], executionAdapterResults: [],
  });
});

test("execution diagnostics retain missing-key and keyless-budget outcomes without HTTP or positive evidence", async () => {
  const opts = options(async () => { throw new Error("No HTTP should be attempted"); }, {
    executionRecovery: { lifiRateBudget: { windowStartedAtMs: NOW.getTime(), requests: 70 } },
  });
  const result = await execute(project(), opts);
  unresolved(result);
  assert.equal(result.state.requestsUsed, 0);
  assert.equal(result.executionAdapterResults.find((item) => item.adapter === "lifi").providerFailureCode,
    "LIFI_KEYLESS_BUDGET_EXHAUSTED");
  assert.equal(result.executionAdapterResults.find((item) => item.adapter === "0x").missingKey, "ZEROX_API_KEY");
  assert.ok(result.executionAdapterResults.find((item) => item.adapter === "lifi").retryAt);
});

test("the same request state is shared between executor invocations and cannot replay an old recovered route", async () => {
  let calls = 0;
  const opts = options(async (url) => { calls++; return lifiQuote(url); }, { maxRequests: 2 });
  const state = createActiveEvidenceExecutionState(opts);
  const first = await execute(project(), opts, state);
  assert.ok(first.projectPatch.executionProofRecoveryRoute);
  const second = await execute(project(first.projectPatch), opts, state);
  assert.equal(calls, 2);
  assert.equal(state.requestsUsed, 2);
  unresolved(second);
});

test("HTTP failures open a shared source/chain circuit without exposing key material", async () => {
  let calls = 0;
  const key = "secret-test-lifi-key";
  const opts = options(async () => {
    calls++;
    const error = new Error(`HTTP 503 ${key}`);
    error.status = 503;
    throw error;
  }, { circuitFailureThreshold: 1, executionRecovery: { lifiApiKey: key } });
  const state = createActiveEvidenceExecutionState(opts);
  const first = await execute(project(), opts, state);
  const second = await execute(project(), opts, state);
  assert.equal(calls, 1);
  assert.equal(state.requestsUsed, 1);
  assert.equal(state.providers.get("lifi:base").circuitOpen, true);
  assert.ok(second.attempts.some((item) => item.status === "CIRCUIT_OPEN"));
  assert.equal(first.attempts.find((item) => item.status === "FAILED").httpStatus, 503);
  assert.equal(JSON.stringify([first.attempts, second.attempts, summarizeActiveEvidenceExecutionState(state)]).includes(key), false);
  unresolved(first);
  unresolved(second);
});

test("provider circuit scopes isolate chains and share LI.FI discovery/quotes", async () => {
  let calls = 0;
  const opts = options(async (url, init) => {
    calls++;
    if (init.adapter === "lifi-token") throw new Error("discovery failed");
    return lifiQuote(url);
  }, { circuitFailureThreshold: 1 });
  const state = createActiveEvidenceExecutionState(opts);
  await execute(project({ chain: "zksync" }), opts, state);
  const next = await execute(project({ chain: "zksync" }), opts, state);
  const independent = await execute(project(), opts, state);
  assert.equal(calls, 3);
  assert.ok(next.attempts.some((item) => item.status === "CIRCUIT_OPEN"));
  assert.equal(state.providers.get("lifi:zksync").attempts, 1);
  assert.equal(state.providers.get("lifi:base").successes, 2);
  assert.ok(independent.projectPatch.executionProofRecoveryRoute);
});

test("shared deadlines block all network or block SELL after an actual BUY", async () => {
  for (const expiredInitially of [true, false]) {
    let now = NOW.getTime();
    let calls = 0;
    const opts = options(async (url) => { calls++; return lifiQuote(url); }, {
      now: () => now, deadlineAt: now + (expiredInitially ? 0 : 100),
    });
    const state = createActiveEvidenceExecutionState(opts);
    // Expire only after executeProviderCall has accepted the completed BUY.
    if (!expiredInitially) {
      state.now = () => state.providers.get("lifi:base")?.successes ? state.deadlineAt : now;
    }
    const result = await execute(project(), opts, state);
    assert.equal(calls, expiredInitially ? 0 : 1);
    assert.equal(state.timeBudgetExceeded, true);
    assert.ok(result.attempts.some((item) => item.status === "TIME_BUDGET_EXHAUSTED"));
    unresolved(result);
  }
});

test("a response arriving after the shared deadline cannot become positive evidence", async () => {
  let now = NOW.getTime();
  let calls = 0;
  const opts = options(async (url) => { calls++; now += 100; return lifiQuote(url); }, {
    now: () => now, deadlineAt: now + 50,
  });
  const result = await execute(project(), opts);
  assert.equal(calls, 1);
  assert.equal(result.state.timeBudgetExceeded, true);
  unresolved(result);
});

test("an in-flight shared deadline aborts HTTP even when the provider timeout is longer", async () => {
  let calls = 0;
  let signal;
  const opts = options(async (_url, init) => {
    calls++;
    signal = init.signal;
    return new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("deadline abort")), { once: true }));
  }, { now: Date.now, timeBudgetMs: 80, providerTimeoutMs: 500 });
  const result = await execute(project(), opts);
  assert.equal(calls, 1);
  assert.equal(signal.aborted, true);
  assert.equal(result.state.timeBudgetExceeded, true);
  unresolved(result);
});

test("a deadline-owned timer closes the shared budget even before the wall clock advances", async () => {
  let calls = 0;
  let signal;
  const opts = options(async (_url, init) => {
    calls++;
    signal = init.signal;
    return new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("deadline abort")), { once: true }));
  }, { timeBudgetMs: 10, providerTimeoutMs: 500 });
  const state = createActiveEvidenceExecutionState(opts);
  const first = await execute(project(), opts, state);
  assert.equal(signal.aborted, true);
  assert.equal(state.timeBudgetExceeded, true);
  unresolved(first);
  const second = await execute(project(), opts, state);
  assert.equal(calls, 1);
  assert.equal(state.requestsUsed, 1);
  assert.ok(second.attempts.some((attempt) => attempt.status === "TIME_BUDGET_EXHAUSTED"));
  unresolved(second);
});

test("an in-flight quote cannot promote proof after another request closes the shared budget", async () => {
  let calls = 0;
  let state;
  const opts = options(async (url) => {
    calls++;
    state.timeBudgetExceeded = true;
    return lifiQuote(url);
  });
  state = createActiveEvidenceExecutionState(opts);
  const result = await execute(project(), opts, state);
  assert.equal(calls, 1);
  assert.equal(state.requestsUsed, 1);
  unresolved(result);
});

test("provider timeout aborts the underlying HTTP signal without promoting late proof", async () => {
  let signal;
  let calls = 0;
  const opts = options(async (_url, init) => {
    calls++;
    signal = init.signal;
    return new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("transport aborted")), { once: true }));
  }, { providerTimeoutMs: 250, circuitFailureThreshold: 1 });
  const result = await execute(project(), opts);
  // The shared call timeout and transport-abort timer expire in the same turn.
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(calls, 1);
  assert.equal(signal.aborted, true);
  unresolved(result);
});

test("HTTP status and Retry-After survive wrapping and LI.FI cooldown prevents further HTTP", async () => {
  let calls = 0;
  const budget = { windowStartedAtMs: NOW.getTime(), requests: 0 };
  const opts = options(async () => {
    calls++;
    const error = new Error("HTTP 429");
    error.status = 429;
    error.retryAfter = "120";
    throw error;
  }, { executionRecovery: { lifiRateBudget: budget } });
  const state = createActiveEvidenceExecutionState(opts);
  const first = await execute(project(), opts, state);
  const failed = first.attempts.find((attempt) => attempt.httpStatus === 429);
  assert.equal(failed.retryAfter, "120");
  assert.equal(failed.code, "RATE_LIMITED");
  assert.equal(failed.retryAt, new Date(NOW.getTime() + 120_000).toISOString());
  const second = await execute(project(), opts, state);
  assert.equal(calls, 1);
  assert.equal(state.requestsUsed, 1);
  unresolved(first);
  unresolved(second);
});

test("default HTTP transport preserves failure metadata and uses the same request budget", async () => {
  let calls = 0;
  const opts = options(undefined, { providers: { fetch: async (_url, init) => {
    calls++;
    assert.ok(init.signal);
    return { ok: false, status: 429, headers: new Headers({ "retry-after": "60" }),
      json: async () => ({ message: "Rate limit exceeded" }) };
  } } });
  const result = await execute(project(), opts);
  assert.equal(calls, 1);
  assert.equal(result.state.requestsUsed, 1);
  assert.equal(result.attempts[0].httpStatus, 429);
  assert.equal(result.attempts[0].retryAfter, "60");
  unresolved(result);
});

test("Jupiter requires exact returned mints and known pools, not adapter-synthesized identity", async () => {
  const mint = "So11111111111111111111111111111111111111112";
  const pool = "11111111111111111111111111111111";
  for (const mismatch of [false, true]) {
    let calls = 0;
    const opts = options(async (url, init) => {
      calls++;
      assert.equal(init.adapter, "jupiter");
      const params = new URL(url).searchParams;
      return { inputMint: mismatch ? "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" : params.get("inputMint"),
        outputMint: params.get("outputMint"), inAmount: params.get("amount"), outAmount: "24900000",
        priceImpactPct: "0.2", routePlan: [{ swapInfo: { ammKey: pool } }] };
    }, { executionRecovery: { jupiterApiKey: "fixture-key" } });
    const result = await execute(project({ chain: "solana", tokenAddress: mint, contractAddress: mint, poolAddress: pool }),
      opts, undefined, FIELDS, "Jupiter (API key required)");
    assert.equal(calls, 2);
    assert.equal(result.state.requestsUsed, 2);
    if (mismatch) unresolved(result);
    else assert.equal(result.projectPatch.executionProofRecoveryRoute.exactIdentityVerified, true);
  }
});

test("0x must return independently attested token and pool metadata on both HTTP responses", async () => {
  for (const attestPool of [false, true]) {
    let calls = 0;
    const opts = options(async (url, init) => {
      calls++;
      assert.equal(init.adapter, "0x");
      const params = new URL(url).searchParams;
      return { sellToken: params.get("sellToken"), buyToken: params.get("buyToken"),
        sellAmount: params.get("sellAmount"), buyAmount: "25000000", priceImpactPct: "0.2",
        ...(attestPool ? { route: { fills: [{ poolAddress: POOL }] } } : {}) };
    }, { executionRecovery: { lifiEnabled: false, zeroxApiKey: "fixture-key" } });
    const result = await execute(project(), opts, undefined, FIELDS, "0x Swap API");
    assert.equal(calls, 2);
    assert.equal(result.state.requestsUsed, 2);
    if (!attestPool) unresolved(result);
    else assert.equal(result.projectPatch.executionProofRecoveryRoute.exactIdentityVerified, true);
  }
});

test("missing or malformed measured 0x slippage stays unknown despite exact returned route identity", async () => {
  for (const impact of [undefined, null, " ", false, -1]) {
    const opts = options(async (url) => {
      const params = new URL(url).searchParams;
      return { sellToken: params.get("sellToken"), buyToken: params.get("buyToken"),
        sellAmount: params.get("sellAmount"), buyAmount: "25000000", priceImpactPct: impact,
        route: { fills: [{ poolAddress: POOL }] } };
    }, { executionRecovery: { lifiEnabled: false, zeroxApiKey: "fixture-key" } });
    const result = await execute(project(), opts, undefined, FIELDS, "0x Swap API");
    assert.equal(result.projectPatch.executionProofRecoveryRoute.buyQuoteVerified, true);
    assert.equal(result.projectPatch.executionProofRecoveryRoute.sellQuoteVerified, true);
    assert.equal("slippagePct" in result.projectPatch.executionProofRecoveryRoute, false);
    assert.equal("priceImpactPct" in result.projectPatch.executionProofRecoveryRoute, false);
    assert.equal(result.observations.some((item) => ["slippagePct", "priceImpactPct"].includes(item.field)), false);
  }
});

test("adapter fallback keeps source-specific circuits but shares every HTTP budget reservation", async () => {
  for (const maxRequests of [2, 3]) {
    const adapters = [];
    const opts = options(async (url, init) => {
      adapters.push(init.adapter);
      if (init.adapter === "lifi") throw new Error("LI.FI unavailable");
      const params = new URL(url).searchParams;
      return { sellToken: params.get("sellToken"), buyToken: params.get("buyToken"),
        sellAmount: params.get("sellAmount"), buyAmount: "25000000", priceImpactPct: 0.2,
        route: { fills: [{ poolAddress: POOL }] } };
    }, { maxRequests, circuitFailureThreshold: 1, executionRecovery: { zeroxApiKey: "fixture-key" } });
    const result = await execute(project(), opts);
    assert.deepEqual(adapters, ["lifi", "0x", "0x"].slice(0, maxRequests));
    assert.equal(result.state.requestsUsed, maxRequests);
    assert.equal(result.state.providers.get("lifi:base").circuitOpen, true);
    assert.equal(result.state.providers.get("0x:base").circuitOpen, false);
    if (maxRequests < 3) unresolved(result);
    else assert.equal(result.projectPatch.executionProofRecoveryRoute.source, "0x");
  }
});

test("exact public CEX books recover only venue-market raw observations without symbol fallback", async () => {
  let calls = 0;
  const opts = options(async (url, init) => {
    calls++;
    assert.equal(init.adapter, "coinbase");
    assert.equal(url, "https://api.exchange.coinbase.com/products/BOOK-USD/book?level=2");
    return { bids: [["0.99", "1000"]], asks: [["1.01", "1000"]] };
  });
  const candidate = { name: "Book Market", symbol: "BOOK", source: "coinbase", marketPair: "BOOK-USD", routeType: "CEX" };
  const result = await execute(candidate, opts, undefined, FIELDS, "CEX public order books");
  assert.equal(calls, 1);
  assert.equal(result.state.requestsUsed, 1);
  assert.equal(result.projectPatch.executionProofRecoveryRoute.marketIdentityVerified, true);
  assert.equal(result.projectPatch.executionProofRecoveryRoute.exactIdentityVerified, false);
  assert.equal(result.observations.find((item) => item.field === "orderBookDepthUsd").value, 990);
  assert.ok(result.observations.every((item) => item.identityMatchMode === "exact-venue-market" && item.poolAddress === null));
  const missingMarket = await execute({ name: "Book Market", symbol: "BOOK", source: "coinbase", routeType: "CEX" },
    opts, undefined, FIELDS, "CEX public order books");
  assert.equal(calls, 1);
  unresolved(missingMarket);
});

test("explicit CEX recovery never spends DEX quote budget on retained on-chain aliases", async () => {
  const adapters = [];
  const opts = options(async (_url, init) => {
    adapters.push(init.adapter);
    if (init.adapter !== "coinbase") throw new Error("A CEX request must not probe a DEX adapter");
    return { bids: [["0.99", "1000"]], asks: [["1.01", "1000"]] };
  });
  const candidate = project({ routeType: "CEX", source: "coinbase", marketPair: "BOOK-USD",
    executionProof: { routeType: "CEX", buyQuoteVerified: false, sellQuoteVerified: false } });
  const result = await execute(candidate, opts, undefined, FIELDS, "CEX public order books");
  assert.deepEqual(adapters, ["coinbase"]);
  assert.equal(result.state.requestsUsed, 1);
  assert.equal(result.projectPatch.executionProofRecoveryRoute.marketIdentityVerified, true);
  unresolved(await execute({ ...candidate, marketPair: null }, opts, undefined, FIELDS, "CEX public order books"));
  assert.deepEqual(adapters, ["coinbase"]);
});

test("existing batch safety, identity, disabled and audit gates remain intact", async () => {
  let calls = 0;
  const opts = options(async () => { calls++; return {}; });
  for (const overrides of [{ honeypotDetected: true }, { sellRestricted: true },
    { canonicalIdentityHardBlock: true }, { instantSafetyStatus: "CRITICAL" }]) {
    unresolved(await execute(project(overrides), opts));
  }
  unresolved(await execute(project(), { ...opts, auditMode: true }));
  unresolved(await execute(project(), { ...opts, executionRecovery: { ...opts.executionRecovery, auditMode: true } }));
  unresolved(await execute(project(), { ...opts, executionRecovery: { ...opts.executionRecovery, enabled: false } }));
  unresolved(await execute(project(), { ...opts, signal: AbortSignal.abort() }));
  assert.equal(calls, 0);
});

test("executionProofRecovery alias and injected provider fetchJson use the same bounded executor", async () => {
  let calls = 0;
  const opts = options(undefined);
  opts.executionRecovery.deferToActiveEvidence = true;
  opts.executionProofRecovery = opts.executionRecovery;
  delete opts.executionRecovery;
  opts.providers = { fetchJson: async (url) => { calls++; return lifiQuote(url); } };
  const result = await execute(project(), opts);
  assert.equal(calls, 2);
  assert.equal(result.state.requestsUsed, 2);
  assert.equal(result.projectPatch.executionProofRecoveryRoute.source, "lifi");
});
