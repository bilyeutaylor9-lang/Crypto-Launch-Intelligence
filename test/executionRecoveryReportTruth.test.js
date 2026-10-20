import test from "node:test";
import assert from "node:assert/strict";
import { summarizeExecutionProofRecovery } from "../src/reports/executionProofRecoveryReportEngine.js";

const NOW = Date.parse("2026-10-17T12:00:00.000Z");
const timestamp = (age = 0) => new Date(NOW - age * 1000).toISOString();

function candidate(overrides = {}) {
  return {
    symbol: "TRUTH",
    executionProofRecovery: { status: "DEFERRED_TO_WAVE3", attempted: false },
    activeEvidenceRecovery: { waves: ["WAVE3"], attempts: [{ family: "EXECUTION" }], providerAttempts: [] },
    ...overrides,
  };
}

function rawRoute(overrides = {}) {
  return {
    source: "lifi", venue: "Aerodrome", routeType: "DEX_AGGREGATOR",
    verificationStatus: "VERIFIED_PROVIDER_OBSERVATION", recoveryRun: true,
    exactIdentityVerified: true, buyQuoteVerified: true, sellQuoteVerified: true,
    quoteTimestamp: timestamp(), quoteAgeSeconds: 0,
    executableDepthUsd: 25, estimatedRoundTripSlippagePct: 1, slippageIsHeuristic: false,
    ...overrides,
  };
}

function readyCandidate(overrides = {}) {
  return candidate({
    executionProofRecoveryRoute: rawRoute(),
    executionProofState: "LIVE_EXECUTION_READY",
    executionReadinessState: "READY",
    finalSelectionQualified: true,
    executionProof: {
      executionProofState: "LIVE_EXECUTION_READY", liveExecutionReady: true,
      exactIdentityVerified: true, buyQuoteVerified: true, sellQuoteVerified: true,
      quoteTimestamp: timestamp(), quoteFreshnessSeconds: 0,
      executableDepthUsd: 25, estimatedRoundTripSlippagePct: 1,
      slippageIsHeuristic: false, safetyVerified: true,
    },
    ...overrides,
  });
}

function withAdapters(results, overrides = {}) {
  const project = candidate(overrides);
  project.activeEvidenceRecovery.executionAdapterResults = results;
  return project;
}

test("legacy Wave3 report excludes wallet, deployer, security and non-execution quote attempts", () => {
  const project = candidate();
  project.activeEvidenceRecovery.providerAttempts = [
    ...["goplus", "blockscout-wallets", "blockscout-deployer", "sourcify", "rpc-wallets", "unknown"]
      .map((provider) => ({ family: "EXECUTION", provider, status: "FAILED" })),
    { family: "WALLET", provider: "lifi", status: "FAILED" },
    { family: "SECURITY", provider: "lifi", status: "FAILED" },
    { family: "EXECUTION", provider: "lifi", status: "SUCCESS" },
    { family: "EXECUTION", provider: "coinbase", status: "NO_CANDIDATE_EVIDENCE", httpStatus: 404 },
  ];
  const original = structuredClone(project);
  const report = summarizeExecutionProofRecovery([project]);
  assert.equal(report.candidatesAttempted, 1);
  assert.equal(report.routesRecovered, 0);
  assert.equal(report.providerFailures, 0);
  assert.deepEqual(report.adapterHealth.map((item) => item.adapter), ["lifi", "coinbase"]);
  assert.equal(report.adapterHealth[0].httpSuccesses, 1);
  assert.equal(report.adapterHealth[0].recovered, 0);
  assert.equal(report.adapterHealth[0].outcomes[0].resultType, "HTTP");
  assert.equal(report.executionProviderAttempts.length, 2);
  assert.deepEqual(project, original);
});

test("legacy untagged known quote providers remain HTTP evidence only in the fallback path", () => {
  const project = candidate();
  project.activeEvidenceRecovery.providerAttempts = [
    { provider: "lifi", status: "SUCCESS" },
    { provider: "0x", status: "FAILED", httpStatus: 503, reason: "HTTP 503" },
    { provider: "coinbase", status: "NO_CANDIDATE_EVIDENCE", httpStatus: 404 },
    ...["goplus", "blockscout-wallets", "blockscout-deployer", "sourcify", "rpc-wallets"]
      .map((provider) => ({ provider, status: "FAILED" })),
  ];
  const report = summarizeExecutionProofRecovery([project]);
  assert.deepEqual(report.adapterHealth.map((item) => item.adapter), ["lifi", "0x", "coinbase"]);
  assert.equal(report.executionProviderRequestsUsed, 3);
  assert.equal(report.candidatesWithProviderRequests, 1);
  assert.equal(report.providerFailures, 1);
  assert.equal(report.routesRecovered, 0);
  assert.equal(report.adapterHealth[0].httpSuccesses, 1);
  assert.equal(report.adapterHealth[0].recovered, 0);
  project.activeEvidenceRecovery.executionAdapterResults = [];
  const explicit = summarizeExecutionProofRecovery([project]);
  assert.deepEqual(explicit.adapterHealth, []);
  assert.equal(explicit.executionProviderRequestsUsed, 0);
  assert.equal(explicit.candidatesWithProviderRequests, 0);
});

test("explicit adapter results preserve non-HTTP key, budget, rate and no-route metadata", () => {
  const results = [
    { adapter: "0x", status: "OPTIONAL_KEY_MISSING", missingKey: "ZEROX_API_KEY", reason: "Optional key absent." },
    { adapter: "jupiter", status: "OPTIONAL_KEY_MISSING", missingKey: "JUPITER_API_KEY", reason: "Optional key absent." },
    { adapter: "lifi", status: "PROVIDER_FAILED", reason: "Keyless quota reserved.",
      failures: ["Window exhausted."], providerFailureCode: "LIFI_KEYLESS_BUDGET_EXHAUSTED", retryAt: timestamp(-60) },
    { adapter: "lifi", status: "PROVIDER_FAILED", reason: "Cooldown.", providerFailureCode: "RATE_LIMITED", retryAt: timestamp(-120) },
    { adapter: "lifi", status: "NO_SELL_QUOTE", reason: "No exact sell route." },
  ];
  const project = withAdapters(results);
  project.activeEvidenceRecovery.providerAttempts = [{ family: "EXECUTION", provider: "lifi", status: "SUCCESS" }];
  const report = summarizeExecutionProofRecovery([project]);
  const lifi = report.adapterHealth.find((item) => item.adapter === "lifi");
  assert.equal(lifi.attempts, 3);
  assert.equal(lifi.httpRequests, 1);
  assert.equal(lifi.httpSuccesses, 1);
  assert.equal(lifi.budgetExhausted, 1);
  assert.equal(lifi.rateLimited, 1);
  assert.equal(lifi.providerFailures, 1);
  assert.equal(lifi.buyOnly, 0);
  assert.equal(lifi.noRoute, 1);
  assert.equal(report.buyOnlyRoutes, 0);
  assert.equal(report.sellProofFailures, 0);
  assert.equal(report.routesRecovered, 0);
  assert.equal(report.optionalSourceGaps.length, 2);
  assert.deepEqual(report.optionalSourceGaps.map((gap) => gap.missingKey), ["ZEROX_API_KEY", "JUPITER_API_KEY"]);
  for (const result of results) {
    assert.ok(report.adapterHealth.find((item) => item.adapter === result.adapter).outcomes
      .some((outcome) => Object.entries(result).every(([key, value]) =>
        JSON.stringify(outcome[key]) === JSON.stringify(value))));
  }
  assert.ok(report.remainingActions.some((action) => action.includes("JUPITER_API_KEY")));
  assert.equal(report.executionProviderAttempts.length, 1);
});

test("budget exhaustion alone is not a provider outage and empty explicit results prevent legacy fallback", () => {
  const report = summarizeExecutionProofRecovery([withAdapters([
    { adapter: "lifi", status: "PROVIDER_FAILED", providerFailureCode: "LIFI_KEYLESS_BUDGET_EXHAUSTED" },
    { adapter: "lifi", status: "REQUEST_BUDGET_EXHAUSTED" },
    { adapter: "lifi", status: "TIME_BUDGET_EXHAUSTED" },
  ])]);
  assert.equal(report.providerFailures, 0);
  assert.equal(report.status, "NO_ROUTES_RECOVERED");
  assert.equal(report.adapterHealth[0].budgetExhausted, 3);
  const empty = withAdapters([]);
  empty.activeEvidenceRecovery.providerAttempts = [{ family: "EXECUTION", provider: "lifi", status: "FAILED" }];
  assert.deepEqual(summarizeExecutionProofRecovery([empty]).adapterHealth, []);
});

test("candidate no-evidence failure codes are not provider outages or positive buy proof", () => {
  const report = summarizeExecutionProofRecovery([withAdapters([
    { adapter: "lifi", status: "PROVIDER_FAILED", providerFailureCode: "NO_CANDIDATE_EVIDENCE", reason: "HTTP 404" },
    { adapter: "lifi", status: "PROVIDER_FAILED", providerFailureCode: "HTTP_422" },
    { adapter: "lifi", status: "NO_BUY_QUOTE" },
    { adapter: "lifi", status: "NO_SELL_QUOTE" },
  ])]);
  assert.equal(report.providerFailures, 0);
  assert.equal(report.adapterHealth[0].providerFailures, 0);
  assert.equal(report.adapterHealth[0].noRoute, 4);
  assert.equal(report.adapterHealth[0].buyOnly, 0);
  assert.equal(report.buyOnlyRoutes, 0);
  assert.equal(report.routesRecovered, 0);
});

test("Wave3 candidates and actual execution HTTP calls have distinct counters", () => {
  const providers = withAdapters([]);
  providers.activeEvidenceRecovery.providerAttempts = [
    { family: "EXECUTION", provider: "lifi", status: "SUCCESS" },
    { family: "EXECUTION", provider: "lifi", status: "FAILED", httpStatus: 429 },
    { family: "EXECUTION", provider: "coinbase", status: "NO_CANDIDATE_EVIDENCE", httpStatus: 404 },
    ...["CIRCUIT_OPEN", "REQUEST_BUDGET_EXHAUSTED", "TIME_BUDGET_EXHAUSTED", "NO_VERIFIED_ROUTE"]
      .map((status) => ({ family: "EXECUTION", provider: "lifi", status })),
    { family: "WALLETS", provider: "blockscout-wallets", status: "SUCCESS" },
    { provider: "lifi", status: "SUCCESS" },
  ];
  const report = summarizeExecutionProofRecovery([providers, withAdapters([
    { adapter: "0x", status: "OPTIONAL_KEY_MISSING", missingKey: "ZEROX_API_KEY" },
    { adapter: "lifi", status: "PROVIDER_FAILED", providerFailureCode: "LIFI_KEYLESS_BUDGET_EXHAUSTED" },
  ]), candidate()]);
  assert.equal(report.candidatesAttempted, 3);
  assert.equal(report.candidatesWithProviderRequests, 1);
  assert.equal(report.executionProviderRequestsUsed, 3);
  assert.equal(report.executionProviderAttempts.length, 3);
  assert.equal(report.routesRecovered, 0);
});

test("boundary-rejected adapter successes never count as recovered routes", () => {
  const project = withAdapters([{
    adapter: "lifi", status: "IDENTITY_OR_POOL_UNATTESTED", providerStatus: "ROUTE_RECOVERED",
    reason: "Known pool was not independently attested.",
  }]);
  project.activeEvidenceRecovery.providerAttempts = [
    { family: "EXECUTION", provider: "lifi", status: "SUCCESS" },
    { family: "EXECUTION", provider: "lifi", status: "SUCCESS" },
  ];
  const report = summarizeExecutionProofRecovery([project]);
  assert.equal(report.executionProviderRequestsUsed, 2);
  assert.equal(report.routesRecovered, 0);
  assert.equal(report.adapterHealth[0].recovered, 0);
  assert.equal(report.adapterHealth[0].httpSuccesses, 2);
  assert.equal(report.adapterHealth[0].noRoute, 1);
  assert.equal(report.adapterHealth[0].outcomes[0].providerStatus, "ROUTE_RECOVERED");
});

test("HTTP successes and adapter success labels cannot replace raw exact two-way route proof", (t) => {
  t.mock.method(Date, "now", () => NOW);
  for (const route of [undefined, rawRoute({ exactIdentityVerified: false }),
    rawRoute({ buyQuoteVerified: false }), rawRoute({ sellQuoteVerified: false }),
    rawRoute({ verificationStatus: "UNVERIFIED" }), rawRoute({ recoveryRun: false })]) {
    const project = withAdapters([{ adapter: "lifi", status: "ROUTE_RECOVERED" }], { executionProofRecoveryRoute: route });
    const report = summarizeExecutionProofRecovery([project]);
    assert.equal(report.routesRecovered, 0);
    assert.equal(report.adapterHealth[0].recovered, 0);
    assert.equal(report.newlyExecutionReady, 0);
  }
});

test("raw route recovery is independent of execution qualification and final selection", (t) => {
  t.mock.method(Date, "now", () => NOW);
  const raw = summarizeExecutionProofRecovery([candidate({ executionProofRecoveryRoute: rawRoute() })]);
  assert.equal(raw.routesRecovered, 1);
  assert.equal(raw.newlyRouteExecutionReady, 0);
  assert.equal(raw.newlyExecutionReady, 0);
  assert.equal(raw.topRecoveredRoutes[0].executionReady, false);
  const routeOnly = summarizeExecutionProofRecovery([readyCandidate({ finalSelectionQualified: false })]);
  assert.equal(routeOnly.routesRecovered, 1);
  assert.equal(routeOnly.newlyRouteExecutionReady, 1);
  assert.equal(routeOnly.newlyExecutionReady, 0);
  assert.equal(routeOnly.topRecoveredRoutes[0].routeExecutionReadiness, "ROUTE_EXECUTION_READY");
  assert.equal(routeOnly.topRecoveredRoutes[0].finalProjectExecutionReadiness, "FINAL_PROJECT_NOT_READY");
  const qualified = summarizeExecutionProofRecovery([readyCandidate()]);
  assert.equal(qualified.newlyExecutionReady, 1);
  assert.equal(qualified.topRecoveredRoutes[0].executionReady, true);
  const statusOnly = readyCandidate({ executionProofState: "NO_VERIFIED_ROUTE" });
  delete statusOnly.executionProof.executionProofState;
  statusOnly.routeTruthStatus = "LIVE_EXECUTION_READY";
  assert.equal(summarizeExecutionProofRecovery([statusOnly]).newlyRouteExecutionReady, 0);
});

test("exact CEX market proof is recoverable but does not bypass access requirements", (t) => {
  t.mock.method(Date, "now", () => NOW);
  const project = readyCandidate({ executionProofRecoveryRoute: rawRoute({
    source: "coinbase", routeType: "CEX", marketPair: "TRUTH-USD", venue: "Coinbase",
    exactIdentityVerified: false, marketIdentityVerified: true,
  }) });
  Object.assign(project.executionProof, { routeType: "CEX", userAccessEvidenceRequired: true, userAccessVerified: false });
  const report = summarizeExecutionProofRecovery([project]);
  assert.equal(report.routesRecovered, 1);
  assert.equal(report.newlyRouteExecutionReady, 0);
  assert.equal(report.newlyExecutionReady, 0);
});

test("nested negative current proof always defeats stale top-level LIVE labels", (t) => {
  t.mock.method(Date, "now", () => NOW);
  const negatives = [
    { executionProofState: "NO_VERIFIED_ROUTE" }, { routeTruthStatus: "SELL_QUOTE_REQUIRED" },
    { liveExecutionReady: false }, { exactIdentityVerified: false },
    { buyQuoteVerified: false }, { sellQuoteVerified: false }, { safetyVerified: false },
    { depthVerified: false }, { slippageIsHeuristic: true }, { slippageVerified: false },
    { transferTaxEvidenceRequired: true, transferTaxEvidenceVerified: false },
    { authorityEvidenceRequired: true, authorityEvidenceVerified: false },
    { authorityEvidenceRequired: true, authorityEvidenceVerified: true, authoritySafetyClean: false },
    { userAccessEvidenceRequired: true, userAccessVerified: false },
  ];
  for (const negative of negatives) {
    const project = readyCandidate();
    Object.assign(project.executionProof, negative);
    const report = summarizeExecutionProofRecovery([project]);
    assert.equal(report.routesRecovered, 1);
    assert.equal(report.newlyRouteExecutionReady, 0, JSON.stringify(negative));
    assert.equal(report.newlyExecutionReady, 0);
    assert.equal(report.topRecoveredRoutes[0].routeExecutionReadiness, "ROUTE_NOT_READY");
    assert.equal(report.topRecoveredRoutes[0].executionReady, false);
  }
  const deniedBuy = readyCandidate();
  deniedBuy.executionProof.buyQuoteVerified = false;
  assert.equal(summarizeExecutionProofRecovery([deniedBuy]).topRecoveredRoutes[0].nextSingleProofToPromote, "fresh buy quote");
});

test("stale, missing, invalid and future quote timestamps cannot recover fresh Wave3 proof", (t) => {
  t.mock.method(Date, "now", () => NOW);
  for (const quoteTimestamp of [timestamp(3601), null, "invalid", timestamp(-1)]) {
    const report = summarizeExecutionProofRecovery([candidate({ executionProofRecoveryRoute: rawRoute({ quoteTimestamp }) })]);
    assert.equal(report.routesRecovered, 0, String(quoteTimestamp));
    assert.equal(report.newlyExecutionReady, 0);
    assert.equal(report.staleQuotes, quoteTimestamp === timestamp(3601) ? 1 : 0);
  }
  assert.equal(summarizeExecutionProofRecovery([candidate({
    executionProofRecoveryRoute: rawRoute({ quoteTimestamp: timestamp(3600) }),
  })]).routesRecovered, 1);
});

test("fresh recovered route cannot override stale, missing or invalid current proof freshness", (t) => {
  t.mock.method(Date, "now", () => NOW);
  for (const freshness of [
    { quoteTimestamp: timestamp(3601), quoteFreshnessSeconds: 0 },
    { quoteTimestamp: timestamp(), quoteFreshnessSeconds: 3601 },
    { quoteTimestamp: null }, { quoteTimestamp: "invalid" }, { quoteTimestamp: timestamp(-1) },
    { quoteFreshnessSeconds: -1 },
  ]) {
    const project = readyCandidate();
    Object.assign(project.executionProof, freshness);
    const report = summarizeExecutionProofRecovery([project]);
    assert.equal(report.routesRecovered, 1);
    assert.equal(report.newlyRouteExecutionReady, 0, JSON.stringify(freshness));
    assert.equal(report.topRecoveredRoutes[0].executionReady, false);
    assert.equal(report.topRecoveredRoutes[0].nextSingleProofToPromote, "fresh buy and sell quotes");
  }
});

test("Wave3 report does not reinterpret deferred candidates without an execution attempt", () => {
  for (const active of [
    { waves: ["WAVE2"], attempts: [{ family: "EXECUTION" }] },
    { waves: ["WAVE3"], attempts: [{ family: "WALLETS" }] },
  ]) {
    const report = summarizeExecutionProofRecovery([candidate({ activeEvidenceRecovery: active })]);
    assert.equal(report.candidatesAttempted, 0);
    assert.equal(report.routesRecovered, 0);
    assert.deepEqual(report.adapterHealth, []);
  }
});
