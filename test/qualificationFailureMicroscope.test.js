import test from "node:test";
import assert from "node:assert/strict";

import {
  buildQualificationFailureMicroscope,
  traceQualificationCandidate,
} from "../src/diagnostics/qualificationFailureMicroscope.js";

function baseProject(overrides = {}) {
  return {
    symbol: "EDGE",
    chain: "base",
    tokenAddress: "0x0000000000000000000000000000000000000001",
    poolAddress: "0x0000000000000000000000000000000000000101",
    deepEvaluationState: "DEEP_EVALUATED",
    coreEvidenceState: "CORE_EVIDENCE_READY",
    candidateProofState: {
      identity: {
        status: "VERIFIED",
        exactIdentityVerified: true,
        chain: "base",
        tokenAddress: "0x0000000000000000000000000000000000000001",
        poolAddress: "0x0000000000000000000000000000000000000101",
      },
      safety: {
        status: "VERIFIED_SAFE",
        deterministicBlocks: [],
      },
      globalRoute: {
        status: "ROUTE_VERIFIED",
        buyQuoteVerified: true,
        sellQuoteVerified: true,
        depthVerified: true,
        slippageVerified: true,
        quoteFresh: true,
        quoteAgeSeconds: 20,
      },
      userAccess: {
        status: "CONFIRMED_AVAILABLE",
      },
    },
    canonicalThreeClockEdge: {
      qualifying: true,
      sequence: { state: "THREE_CLOCK_PRE_CONSENSUS" },
      priceMateriallyExtended: false,
    },
    capitalArrivalIntelligence: {
      state: "COMMITTED_LOADED_VACUUM_SHADOW",
      supplyVacuumSupported: true,
      expectedArrivalToIgnitionCapitalRatio6h: 1.4,
    },
    sellerInventoryState: "THINNING",
    sellerExhaustionScore: 72,
    finalSelectionState: "QUALIFIED",
    finalSelectionQualified: true,
    finalBlockingReasons: [],
    finalWarningReasons: [],
    ...overrides,
  };
}

test("fully proven candidate passes both lanes", () => {
  const row = traceQualificationCandidate(baseProject());
  assert.equal(row.finalSelectionQualified, true);
  assert.equal(row.productionGates.USER_ACCESS.status, "PASS");
  assert.equal(row.mechanismGates.CAPITAL_ARRIVAL.status, "PASS");
  assert.equal(row.mechanismGates.SUPPLY_SELLER.status, "PASS");
});

test("unknown access remains UNKNOWN and never becomes pass", () => {
  const p = baseProject({
    finalSelectionState: "INSUFFICIENT_DATA",
    finalSelectionQualified: false,
    candidateProofState: {
      ...baseProject().candidateProofState,
      userAccess: { status: "UNKNOWN" },
    },
  });
  const row = traceQualificationCandidate(p);
  assert.equal(row.productionGates.USER_ACCESS.status, "UNKNOWN");
  assert.equal(row.firstUnknown, "USER_ACCESS");
});

test("confirmed restricted access is a known failure", () => {
  const p = baseProject({
    finalSelectionState: "BLOCKED",
    finalSelectionQualified: false,
    candidateProofState: {
      ...baseProject().candidateProofState,
      userAccess: { status: "CONFIRMED_RESTRICTED" },
    },
  });
  const row = traceQualificationCandidate(p);
  assert.equal(row.productionGates.USER_ACCESS.status, "FAIL");
});

test("missing safety remains UNKNOWN", () => {
  const p = baseProject({
    finalSelectionState: "INSUFFICIENT_DATA",
    finalSelectionQualified: false,
    candidateProofState: {
      ...baseProject().candidateProofState,
      safety: { status: "PARTIAL", deterministicBlocks: [] },
    },
  });
  const row = traceQualificationCandidate(p);
  assert.equal(row.productionGates.SAFETY.status, "UNKNOWN");
});

test("honeypot is a hard known safety failure", () => {
  const p = baseProject({
    honeypotDetected: true,
    finalSelectionState: "BLOCKED",
    finalSelectionQualified: false,
  });
  const row = traceQualificationCandidate(p);
  assert.equal(row.productionGates.SAFETY.status, "FAIL");
});

test("stale quote is a known failure", () => {
  const p = baseProject({
    finalSelectionState: "BLOCKED",
    finalSelectionQualified: false,
    candidateProofState: {
      ...baseProject().candidateProofState,
      globalRoute: {
        ...baseProject().candidateProofState.globalRoute,
        quoteFresh: false,
        quoteAgeSeconds: 1200,
      },
    },
  });
  const row = traceQualificationCandidate(p, { maxQuoteAgeSeconds: 900 });
  assert.equal(row.productionGates.QUOTE_FRESHNESS.status, "FAIL");
});

test("missing quote verification stays UNKNOWN", () => {
  const p = baseProject({
    finalSelectionState: "INSUFFICIENT_DATA",
    finalSelectionQualified: false,
    candidateProofState: {
      ...baseProject().candidateProofState,
      globalRoute: {
        ...baseProject().candidateProofState.globalRoute,
        sellQuoteVerified: false,
      },
    },
  });
  const row = traceQualificationCandidate(p);
  assert.equal(row.productionGates.SELL_QUOTE.status, "UNKNOWN");
});

test("nested execution proof overrides stale top-level readiness and supplies verified proof", () => {
  const p = baseProject({
    liveExecutionReady: true,
    executionProofState: "TRANSFER_TAX_EVIDENCE_REQUIRED",
    executionProof: {
      executionProofState: "TRANSFER_TAX_EVIDENCE_REQUIRED",
      liveExecutionReady: false,
      buyQuoteVerified: true,
      sellQuoteVerified: true,
      safetyVerified: true,
      quoteFreshnessSeconds: 10,
      liquidityUsd: 100_000,
      observedSlippagePct: 0.2,
      slippageIsHeuristic: false,
      userAccessEvidenceRequired: false,
      userAccessVerified: true,
    },
  });
  const row = traceQualificationCandidate(p);
  assert.equal(row.routeVerified, false);
  assert.equal(row.productionGates.BUY_QUOTE.status, "PASS");
  assert.equal(row.productionGates.SELL_QUOTE.status, "PASS");
  assert.equal(row.productionGates.SAFETY.status, "PASS");
  assert.equal(row.productionGates.USER_ACCESS.status, "PASS");
});

test("insufficient Three-Clock history stays UNKNOWN", () => {
  const p = baseProject({
    finalSelectionState: "RESEARCH_ONLY",
    finalSelectionQualified: false,
    canonicalThreeClockEdge: {
      qualifying: false,
      sequence: { state: "INSUFFICIENT_HISTORY" },
      priceMateriallyExtended: false,
    },
  });
  const row = traceQualificationCandidate(p);
  assert.equal(row.mechanismGates.THREE_CLOCK_PRE_CONSENSUS.status, "UNKNOWN");
});

test("observed non-preconsensus Three-Clock state is mechanism failure", () => {
  const p = baseProject({
    finalSelectionState: "RESEARCH_ONLY",
    finalSelectionQualified: false,
    canonicalThreeClockEdge: {
      qualifying: false,
      sequence: { state: "ATTENTION_CATCHING_UP" },
      priceMateriallyExtended: false,
    },
  });
  const row = traceQualificationCandidate(p);
  assert.equal(row.mechanismGates.THREE_CLOCK_PRE_CONSENSUS.status, "FAIL");
});

test("no calibrated capital arrival evidence stays UNKNOWN", () => {
  const p = baseProject({
    finalSelectionState: "RESEARCH_ONLY",
    finalSelectionQualified: false,
    capitalArrivalIntelligence: {
      state: "NO_CALIBRATED_ARRIVAL_EVIDENCE",
      supplyVacuumSupported: null,
    },
  });
  const row = traceQualificationCandidate(p);
  assert.equal(row.mechanismGates.CAPITAL_ARRIVAL.status, "UNKNOWN");
});

test("weaker observed capital state fails the current mechanism without weakening it", () => {
  const p = baseProject({
    finalSelectionState: "RESEARCH_ONLY",
    finalSelectionQualified: false,
    capitalArrivalIntelligence: {
      state: "ARRIVAL_PRESSURE_BUILDING_SHADOW",
      supplyVacuumSupported: true,
    },
  });
  const row = traceQualificationCandidate(p);
  assert.equal(row.mechanismGates.CAPITAL_ARRIVAL.status, "FAIL");
});

test("seller replenishment explicitly fails supply/seller mechanism", () => {
  const p = baseProject({
    finalSelectionState: "RESEARCH_ONLY",
    finalSelectionQualified: false,
    sellerInventoryState: "REPLENISHING",
  });
  const row = traceQualificationCandidate(p);
  assert.equal(row.mechanismGates.SUPPLY_SELLER.status, "FAIL");
});

test("verified-route access gaps produce post-route proof bottleneck", () => {
  const projects = Array.from({ length: 6 }, (_, index) =>
    baseProject({
      symbol: `E${index}`,
      finalSelectionState: "INSUFFICIENT_DATA",
      finalSelectionQualified: false,
      candidateProofState: {
        ...baseProject().candidateProofState,
        userAccess: { status: index < 5 ? "UNKNOWN" : "CONFIRMED_AVAILABLE" },
      },
      finalWarningReasons: index < 5 ? ["Region access remains unknown."] : [],
    })
  );
  const report = buildQualificationFailureMicroscope(projects);
  assert.equal(report.verifiedRouteCandidates, 6);
  assert.equal(report.fullyQualified, 0);
  assert.equal(report.diagnostic, "POST_ROUTE_PROOF_ACQUISITION_BOTTLENECK");
  assert.equal(report.verifiedRouteDeathMap["UNKNOWN:USER_ACCESS"], 5);
});

test("mechanism failures are separated from proof acquisition", () => {
  const projects = Array.from({ length: 4 }, (_, index) =>
    baseProject({
      symbol: `M${index}`,
      finalSelectionState: "RESEARCH_ONLY",
      finalSelectionQualified: false,
      finalBlockingReasons: [],
      capitalArrivalIntelligence: {
        state: "ARRIVAL_PRESSURE_BUILDING_SHADOW",
        supplyVacuumSupported: true,
      },
      // final policy remains unknown, but the mechanism report still records the actual failure.
    })
  );
  const report = buildQualificationFailureMicroscope(projects);
  assert.equal(report.firstMechanismFailureCounts.CAPITAL_ARRIVAL, 4);
  assert.equal(report.mechanismGateCounts.CAPITAL_ARRIVAL.fail, 4);
});

test("deferred candidates are excluded when progressive scan states exist", () => {
  const projects = [
    baseProject({ symbol: "D1", deepEvaluationState: "DEFERRED_BEFORE_DEEP" }),
    baseProject({ symbol: "D2", deepEvaluationState: "DEEP_EVALUATED" }),
  ];
  const report = buildQualificationFailureMicroscope(projects);
  assert.equal(report.sourceCandidates, 2);
  assert.equal(report.deepEvaluated, 1);
});

test("final blocking reasons are preserved and aggregated", () => {
  const projects = [
    baseProject({
      finalSelectionState: "BLOCKED",
      finalSelectionQualified: false,
      finalBlockingReasons: ["Risk score exceeds final-selection maximum."],
    }),
    baseProject({
      finalSelectionState: "BLOCKED",
      finalSelectionQualified: false,
      finalBlockingReasons: ["Risk score exceeds final-selection maximum."],
    }),
  ];
  const report = buildQualificationFailureMicroscope(projects);
  assert.equal(report.finalBlockingReasonCounts["Risk score exceeds final-selection maximum."], 2);
});

test("report explicitly preserves no-ranking/no-trading invariants", () => {
  const report = buildQualificationFailureMicroscope([baseProject()]);
  assert.equal(report.invariants.rankingInfluence, false);
  assert.equal(report.invariants.automaticTrading, false);
  assert.equal(report.invariants.missingEvidenceRemainsUnknown, true);
});
