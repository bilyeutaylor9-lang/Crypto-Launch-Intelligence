import test from "node:test";
import assert from "node:assert/strict";
import { analyzeCanonicalExecutionRoute } from "../src/engines/canonicalExecutionRouteEngine.js";
import { analyzeExecutionProof } from "../src/engines/executionProofEngine.js";
import { analyzeRouteAccessibility } from "../src/engines/routeAccessibilityEngine.js";
import { isLiveExecutionReady, routeQuoteFresh } from "../src/execution/routeTruthV2.js";
import { decisionProofAssessment } from "../src/kernel/evidenceFunnelSummary.js";

const START = Date.parse("2026-10-18T10:00:00.000Z");
const MINT = "3HLhtXNCVh1VbCrpwACoZWwHoNeoCB7hRAPcYN2jjUiL";
const POOL = "DN5Eq6ELcvUcC69VNbNW5pNbnt3bvtVGfHpBWb8pAcoF";
const stamp = (offset = 0) => new Date(START + offset).toISOString();

function route(overrides = {}) {
  return {
    venue: "Raydium", routeType: "DEX", chain: "solana", tokenAddress: MINT, poolAddress: POOL,
    status: "VERIFIED", routeTruthStatus: "LIVE_EXECUTION_READY", exactIdentityVerified: true,
    buyQuoteVerified: true, sellQuoteVerified: true, liquidityUsd: 250_000,
    estimatedRoundTripSlippagePct: 1, regionStatus: "CONFIRMED_AVAILABLE",
    quoteTimestamp: stamp(), quoteExpiresAt: stamp(30_000), quoteAgeSeconds: 0,
    buyQuote: { verified: true, timestamp: stamp(), expiresAt: stamp(30_000) },
    sellQuote: { verified: true, timestamp: stamp(1000), expiresAt: stamp(31_000) },
    ...overrides,
  };
}

function project(rawRoute = route(), overrides = {}) {
  return {
    name: "Expiry Test", symbol: "EXP", chain: "solana", tokenAddress: MINT, poolAddress: POOL,
    strictIdentityVerified: true, identityVerified: true, safetyProofStatus: "VERIFIED_SAFE",
    instantSafetyStatus: "PASS", regionStatus: "CONFIRMED_AVAILABLE", priceUsd: 1,
    liquidityUsd: 250_000, estimatedRoundTripSlippagePct: 1, quoteAgeSeconds: 0,
    executionProofRecoveryRoute: rawRoute,
    mintAuthorityEnabled: false, freezeAuthorityEnabled: false,
    securityEvidence: [{ provider: "in-memory-solana-proof", status: "EVIDENCE_AVAILABLE",
      chain: "solana", address: MINT, responseIdentityVerified: true, identityVerifiedOnChain: true,
      snapshotTimestampVerified: true, sourceTimestamp: stamp(), mintRisk: false, freezeRisk: false,
      testedChecks: ["mint authority", "freeze authority"] }],
    ...overrides,
  };
}

function pipeline(raw = project()) {
  return analyzeExecutionProof(analyzeRouteAccessibility(analyzeCanonicalExecutionRoute(raw)));
}

function assertRejected(candidate, label = "") {
  assert.equal(routeQuoteFresh(candidate), false, label);
  assert.equal(isLiveExecutionReady(candidate), false, label);
  assert.ok(decisionProofAssessment(candidate).missingFields.includes("QUOTE_FRESHNESS"), label);
}

function assertProducerRejected(raw, label = "") {
  const canonical = analyzeCanonicalExecutionRoute(raw);
  assert.notEqual(canonical.canonicalExecutionRoute.status, "VERIFIED", label);
  assert.notEqual(canonical.canonicalExecutionRoute.routeTruthStatus, "LIVE_EXECUTION_READY", label);
  const accessible = analyzeRouteAccessibility(canonical);
  assert.equal(accessible.executionReady, false, label);
  assert.equal(accessible.userAccessible, false, label);
  assert.ok(accessible.canonicalRoutes.every((item) => item.verificationStatus !== "VERIFIED"), label);
  const produced = analyzeExecutionProof(accessible);
  assert.equal(produced.executionProof.quoteVerified, false, label);
  assert.notEqual(produced.executionStatus, "VERIFIED", label);
  assert.equal(produced.liveExecutionReady, false, label);
  assert.notEqual(produced.moneyEvidence.quoteFreshness.status, "VERIFIED", label);
  assertRejected(produced, label);
  return produced;
}

test("fresh provider-bounded Raydium evidence survives all normalizers and consumers", (t) => {
  t.mock.method(Date, "now", () => START + 5000);
  const result = pipeline();
  assert.equal(result.canonicalExecutionRoute.status, "VERIFIED");
  assert.equal(result.executionReady, true);
  assert.equal(result.userAccessible, true);
  assert.equal(result.executionProof.quoteVerified, true);
  assert.equal(result.executionProofState, "LIVE_EXECUTION_READY");
  assert.equal(routeQuoteFresh(result), true);
  assert.equal(isLiveExecutionReady(result), true);
  assert.deepEqual(decisionProofAssessment(result).missingFields, []);
  for (const normalized of [result.canonicalExecutionRoute, ...result.canonicalRoutes, result.executionProof]) {
    assert.equal(normalized.quoteTimestamp, stamp());
    assert.equal(normalized.quoteExpiresAt, stamp(30_000));
    assert.equal(normalized.buyQuote.expiresAt, stamp(30_000));
    assert.equal(normalized.sellQuote.expiresAt, stamp(31_000));
  }
});

test("elapsed provider expiry dynamically defeats retained positive flags in every consumer", (t) => {
  let now = START + 5000;
  t.mock.method(Date, "now", () => now);
  const ready = pipeline();
  now = START + 29_999;
  assert.equal(isLiveExecutionReady(ready), true);
  now = START + 30_000;
  assert.equal(ready.executionProof.liveExecutionReady, true);
  assertRejected(ready);
  assert.equal(analyzeRouteAccessibility(ready).executionReady, false);
  const rerun = assertProducerRejected(ready);
  assert.equal(rerun.executionProof.quoteExpiresAt, stamp(30_000));
  assert.equal(rerun.executionProof.quoteTimestamp, stamp());
});

test("age zero and later derived timestamps cannot extend the raw provider deadline on rerun", (t) => {
  let now = START + 5000;
  t.mock.method(Date, "now", () => now);
  const ready = pipeline();
  now = START + 45_000;
  const refreshedScalars = { ...ready, quoteAgeSeconds: 0, executionQuoteAgeSeconds: 0,
    quoteTimestamp: stamp(45_000), updatedAt: stamp(45_000),
    executionProof: { ...ready.executionProof, quoteFreshnessSeconds: 0, quoteTimestamp: stamp(45_000) },
    canonicalExecutionRoute: { ...ready.canonicalExecutionRoute, quoteAgeSeconds: 0 } };
  assertRejected(refreshedScalars);
  const rerun = assertProducerRejected(refreshedScalars);
  assert.equal(rerun.canonicalExecutionRoute.quoteTimestamp, stamp());
  assert.equal(rerun.canonicalExecutionRoute.quoteExpiresAt, stamp(30_000));
  assert.equal(rerun.executionProof.quoteTimestamp, stamp());
  assert.equal(rerun.executionProof.quoteExpiresAt, stamp(30_000));
  assert.equal(analyzeExecutionProof(rerun).executionProof.quoteExpiresAt, stamp(30_000));
});

test("malformed explicit expiry cannot fall back to scalar freshness or valid leg expiries", (t) => {
  t.mock.method(Date, "now", () => START + 5000);
  const ready = pipeline();
  for (const quoteExpiresAt of [undefined, null, "", "invalid", "2026-10-18", "2026-02-30T10:00:00.000Z",
    false, 123, [], {}, new Date(START + 30_000)]) {
    const label = String(quoteExpiresAt);
    assertRejected({ ...ready, executionProof: { ...ready.executionProof, quoteExpiresAt } }, label);
    const rerun = assertProducerRejected(project(route({ quoteExpiresAt })), label);
    assert.equal(rerun.executionProof.quoteExpiresAt, typeof quoteExpiresAt === "string" ? quoteExpiresAt : null, label);
    assertRejected(JSON.parse(JSON.stringify(rerun)), label);
  }
});

test("missing, malformed and future issue times or contradictory expiry fail closed", (t) => {
  t.mock.method(Date, "now", () => START + 5000);
  const missing = route();
  delete missing.quoteTimestamp;
  delete missing.buyQuote.timestamp;
  delete missing.sellQuote.timestamp;
  const cases = [missing,
    ...[null, "invalid", stamp(10_000)].map((quoteTimestamp) => route({ quoteTimestamp })),
    route({ quoteExpiresAt: stamp(-1) }),
    route({ buyQuote: { verified: true, timestamp: stamp(10_000), expiresAt: stamp(40_000) } }),
    route({ sellQuote: { verified: true, timestamp: "invalid", expiresAt: stamp(31_000) } }),
    route({ sellQuote: { verified: true, timestamp: stamp(1000), expiresAt: null } }),
    route({ buyQuote: { verified: true, timestamp: stamp(), expiresAt: stamp(4000) } }),
  ];
  for (const [index, raw] of cases.entries()) {
    assert.equal(routeQuoteFresh(raw), false, String(index));
    assertProducerRejected(project(raw), String(index));
  }
});

test("leg-only expiry preserves the earliest deadline rather than the latest response time", (t) => {
  let now = START + 5000;
  t.mock.method(Date, "now", () => now);
  const raw = route({ buyQuote: { verified: true, timestamp: stamp(), expiresAt: stamp(15_000) } });
  delete raw.quoteExpiresAt;
  const ready = pipeline(project(raw, { quoteTimestamp: stamp(5000) }));
  assert.equal(isLiveExecutionReady(ready), true);
  assert.equal(ready.executionProof.quoteTimestamp, stamp());
  assert.equal(ready.executionProof.quoteExpiresAt, stamp(15_000));
  now = START + 15_000;
  assertRejected(ready);
  assertProducerRejected(ready);
});

test("current proof owns its quote instead of borrowing unrelated old route expirations", (t) => {
  t.mock.method(Date, "now", () => START + 5000);
  const ready = pipeline();
  const unrelated = route({ venue: "Orca", quoteTimestamp: stamp(-60_000), quoteExpiresAt: stamp(-30_000),
    buyQuote: undefined, sellQuote: undefined });
  const candidate = { ...ready, canonicalExecutionRoute: unrelated, executionProofRecoveryRoute: unrelated };
  assert.equal(routeQuoteFresh(candidate), true);
  assert.equal(isLiveExecutionReady(candidate), true);
  assert.deepEqual(decisionProofAssessment(candidate).missingFields, []);
  assert.equal(routeQuoteFresh({ ...candidate,
    canonicalExecutionRoute: { ...unrelated, venue: "Raydium" },
    executionProofRecoveryRoute: { ...unrelated, venue: "Raydium" } }), true);
  const { quoteExpiresAt, buyQuote, sellQuote, ...legacyProof } = ready.executionProof;
  assert.equal(routeQuoteFresh({ ...candidate, executionProof: legacyProof }), true);
  const expiredProof = { ...ready.executionProof, quoteTimestamp: stamp(-60_000), quoteExpiresAt: stamp(-30_000),
    buyQuote: undefined, sellQuote: undefined, quoteFreshnessSeconds: 0 };
  assertRejected({ ...ready, executionProof: expiredProof });
});

test("a current proof missing its copied deadline still honors matching original quote evidence", (t) => {
  t.mock.method(Date, "now", () => START + 30_000);
  const raw = project();
  const proof = { ...route(), quoteFreshnessSeconds: 0, liveExecutionReady: true, safetyVerified: true };
  delete proof.quoteExpiresAt;
  delete proof.buyQuote;
  delete proof.sellQuote;
  assertRejected({ ...raw, executionProof: proof });
  assertRejected({ ...raw, executionProof: { ...proof, quoteTimestamp: stamp(30_000) } });
});

test("parent-only declared expiry cannot disappear in accessibility normalization", (t) => {
  t.mock.method(Date, "now", () => START + 30_000);
  const raw = route();
  delete raw.quoteExpiresAt;
  delete raw.buyQuote.expiresAt;
  delete raw.sellQuote.expiresAt;
  const candidate = project(raw, { quoteTimestamp: stamp(), quoteExpiresAt: stamp(30_000) });
  const result = analyzeRouteAccessibility(candidate);
  assert.equal(result.executionReady, false);
  assert.equal(result.userAccessible, false);
  assert.equal(result.canonicalRoutes[0].quoteExpiresAt, stamp(30_000));
  assertProducerRejected(candidate);
});

test("contradictory current positive proof cannot promote an expired canonical route", (t) => {
  let now = START + 5000;
  t.mock.method(Date, "now", () => now);
  const ready = pipeline();
  now = START + 30_000;
  const currentProof = { ...ready.executionProof, quoteTimestamp: stamp(29_000), quoteExpiresAt: stamp(59_000),
    buyQuote: undefined, sellQuote: undefined };
  const normalized = analyzeCanonicalExecutionRoute({ ...ready, executionProof: currentProof });
  assert.equal(normalized.strictRouteVerified, false);
  assert.notEqual(normalized.canonicalExecutionRoute.routeVerificationStatus, "LIVE_EXECUTION_READY");
});

test("proof-only expiry is preserved when the producer is rerun without a raw deadline copy", (t) => {
  let now = START + 5000;
  t.mock.method(Date, "now", () => now);
  const ready = pipeline();
  const noRawCopy = { ...ready, executionProofRecoveryRoute: undefined, canonicalExecutionRoute: undefined };
  now = START + 40_000;
  const rerun = analyzeExecutionProof({ ...noRawCopy, quoteTimestamp: stamp(40_000), quoteAgeSeconds: 0 });
  assert.equal(rerun.executionProof.quoteExpiresAt, stamp(30_000));
  assertRejected(rerun);
});

test("genuinely new provider timing can recover a previously expired proof", (t) => {
  let now = START + 5000;
  t.mock.method(Date, "now", () => now);
  const old = pipeline();
  now = START + 45_000;
  assertRejected(old);
  const newRoute = route({ quoteTimestamp: stamp(40_000), quoteExpiresAt: stamp(70_000),
    buyQuote: { verified: true, timestamp: stamp(40_000), expiresAt: stamp(70_000) },
    sellQuote: { verified: true, timestamp: stamp(41_000), expiresAt: stamp(71_000) } });
  const recovered = pipeline({ ...old, executionProofRecoveryRoute: newRoute });
  assert.equal(recovered.executionProof.quoteTimestamp, stamp(40_000));
  assert.equal(recovered.executionProof.quoteExpiresAt, stamp(70_000));
  assert.equal(isLiveExecutionReady(recovered), true);
  assert.deepEqual(decisionProofAssessment(recovered).missingFields, []);
});

test("routes without declared expiry retain the existing consumer max-age policies", (t) => {
  t.mock.method(Date, "now", () => START + 5000);
  const raw = route();
  delete raw.quoteExpiresAt;
  delete raw.buyQuote.expiresAt;
  delete raw.sellQuote.expiresAt;
  const ready = pipeline(project(raw));
  assert.equal(isLiveExecutionReady(ready), true);
  assert.equal(Object.hasOwn(ready.executionProof, "quoteExpiresAt"), false);
  assert.equal(routeQuoteFresh({ quoteAgeSeconds: 3600 }), true);
  assert.equal(routeQuoteFresh({ quoteAgeSeconds: 3601 }), false);
  assert.equal(routeQuoteFresh({ quoteAgeSeconds: 21_600 }, 21_600), true);
  assert.equal(routeQuoteFresh({ quoteAgeSeconds: 21_601 }, 21_600), false);
  const older = { ...raw, quoteAgeSeconds: 4000 };
  assert.equal(analyzeCanonicalExecutionRoute(project(older, { quoteAgeSeconds: 4000 })).canonicalExecutionRoute.status, "PARTIALLY_VERIFIED");
  assert.equal(analyzeRouteAccessibility(project(older, { quoteAgeSeconds: 4000 })).executionReady, true);
});

test("case-only EVM and venue differences or canonical chain aliases cannot drop an original deadline", (t) => {
  t.mock.method(Date, "now", () => START + 30_000);
  const token = `0x${"ab".repeat(20)}`;
  const pool = `0x${"cd".repeat(20)}`;
  const subject = {executionProof: {venue: "AERODROME", chainId: 8453,
    tokenAddress: `0x${"AB".repeat(20)}`, poolAddress: `0x${"CD".repeat(20)}`,
    quoteTimestamp: stamp(30_000), quoteFreshnessSeconds: 0},
  executionProofRecoveryRoute: {venue: "Aerodrome", chain: "base", contractAddress: token,
    pairAddress: pool, quoteTimestamp: stamp(), quoteExpiresAt: stamp(30_000)}};
  assert.equal(routeQuoteFresh(subject), false);
});

test("Solana mint case remains significant when associating an original provider deadline", (t) => {
  t.mock.method(Date, "now", () => START + 30_000);
  const changedCase = `3h${MINT.slice(2)}`;
  const subject = {executionProof: {chain: "solana", tokenAddress: MINT,
    quoteTimestamp: stamp(30_000), quoteFreshnessSeconds: 0},
  executionProofRecoveryRoute: {chain: "solana", tokenAddress: changedCase,
    quoteTimestamp: stamp(), quoteExpiresAt: stamp(30_000)}};
  assert.equal(routeQuoteFresh(subject), true);
});
