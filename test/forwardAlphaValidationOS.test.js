import test from "node:test";
import assert from "node:assert/strict";

import {
  auditForwardPredictionContracts,
  buildForwardAlphaValidationOS,
  buildFrozenBenchmarkComparison,
  evaluateCli15PromotionGate,
  evaluateForwardHorizon,
} from "../src/production/forwardAlphaValidationOS.js";
import { buildExactMarketObservation } from "../src/production/exactMarketObservationLedger.js";
import {
  CLI15_PREDICTION_CONTRACT_VERSION,
  freezeProspectiveEdgeCohort,
  predictionContractIntegrityHash,
  sealProspectiveEdgeEpisode,
} from "../src/production/prospectiveEdgeCohortLedger.js";

function address(value) {
  return `0x${Number(value).toString(16).padStart(40, "0")}`;
}

function candidate(index, overrides = {}) {
  return {
    chain: "base",
    tokenAddress: address(index),
    poolAddress: address(index + 100_000),
    symbol: `T${index}`,
    sourceObservedAt: "2026-01-01T00:00:00.000Z",
    priceUsd: 1,
    marketCapUsd: 10_000_000,
    liquidityUsd: 500_000,
    volume24hUsd: 1_000_000,
    evidenceCoveragePct: 80,
    riskScore: 20,
    priceChange24hPct: 3,
    roundTripExecutionCostBps: 100,
    executionReferenceSizeUsd: 1_000,
    executionCostProvenance: "EXECUTABLE_QUOTE_CURVE_V1",
    portfolioResearchScore: 85,
    probability25Pct: 70,
    probability50Pct: 45,
    probability100Pct: 15,
    probabilityLoss20Pct: 12,
    verifiedSignals: ["EXACT_ROUTE", "FRESH_LIQUIDITY"],
    globalMarketRegimeState: "RISK_ON",
    narrative: "DeFi",
    ...overrides,
  };
}

function frozenCohort(overrides = {}) {
  return freezeProspectiveEdgeCohort(
    [candidate(1, overrides.treatment)],
    [candidate(2, overrides.control)],
    {
      now: "2026-01-01T00:10:00.000Z",
      sourceObservedAt: "2026-01-01T00:00:00.000Z",
      existingEpisodes: [],
      requireRowSourceObservedAt: true,
      maximumSourceAgeMinutes: 30,
      maxControls: 1,
      codeCommitSha: "0123456789abcdef0123456789abcdef01234567",
      modelVersion: "cli15-test-model",
      featureSchemaVersion: "cli15-test-features-v1",
      configFingerprint: "cli15-test-config",
    },
  );
}

function exactObservation(row, observedAt, priceUsd) {
  return buildExactMarketObservation({
    chain: row.chain,
    tokenAddress: row.tokenAddress,
    poolAddress: row.poolAddress,
    observedAt,
    priceUsd,
    source: "test-exact-market-source",
  }, { asOf: observedAt });
}

test("prospective freeze creates an immutable CLI 15 prediction contract", () => {
  const cohort = frozenCohort();
  assert.equal(cohort.state, "PROSPECTIVE_EDGE_COHORT_FROZEN");
  const treatment = cohort.episodes.find((row) => row.role === "TREATMENT");
  const contract = treatment.frozenPrediction;
  assert.equal(contract.contractVersion, CLI15_PREDICTION_CONTRACT_VERSION);
  assert.deepEqual(contract.targetHorizonsHours, [1, 6, 24, 168, 720]);
  assert.equal(contract.probabilitiesPct.plus25, 70);
  assert.equal(contract.featureSnapshotHash, treatment.frozenPrediction.featureSnapshotHash);
  assert.equal(contract.contractIntegrityHash, predictionContractIntegrityHash(contract));
  assert.equal(contract.outcomeKnownAtFreeze, false);
  assert.equal(contract.automaticTrading, false);
});

test("prediction contract audit detects tampering even when the outer episode is resealed", () => {
  const cohort = frozenCohort();
  const treatment = cohort.episodes.find((row) => row.role === "TREATMENT");
  const tampered = structuredClone(treatment);
  tampered.frozenPrediction.probabilitiesPct.plus25 = 99;
  const resealed = sealProspectiveEdgeEpisode(tampered);
  const audit = auditForwardPredictionContracts(
    cohort.episodes.map((row) => row.episodeId === resealed.episodeId ? resealed : row),
    { asOf: "2026-01-02T00:10:00.000Z" },
  );
  assert.equal(audit.pass, false);
  assert.equal(audit.failureCounts.PREDICTION_CONTRACT_INTEGRITY_HASH_FAILURE, 1);
});

test("multi-horizon evaluator uses exact observations and subtracts frozen execution cost", () => {
  const cohort = frozenCohort();
  const treatment = cohort.episodes.find((row) => row.role === "TREATMENT");
  const control = cohort.episodes.find((row) => row.role === "CONTROL_MATCHED");
  const observations = [
    exactObservation(treatment, "2026-01-01T12:10:00.000Z", 0.8),
    exactObservation(treatment, "2026-01-02T00:10:00.000Z", 1.5),
    exactObservation(control, "2026-01-02T00:10:00.000Z", 1.1),
  ];
  const report = evaluateForwardHorizon(cohort.episodes, observations, {
    asOf: "2026-01-02T01:00:00.000Z",
    horizonHours: 24,
  });
  assert.equal(report.state, "HORIZON_EDGE_POSITIVE");
  assert.equal(report.sample.fullyResolvedMatchedPairs, 1);
  assert.equal(Number(report.performance.treatmentMeanNetReturnPct.toFixed(2)), 49);
  assert.equal(Number(report.performance.matchedControlMeanNetReturnPct.toFixed(2)), 9);
  assert.equal(Number(report.performance.averageNetReturnEdgePct.toFixed(2)), 40);
  assert.equal(report.performance.medianMaximumAdverseExcursionPct, -20);
  assert.equal(report.calibration.state, "INSUFFICIENT_CALIBRATION_SAMPLE");
});

test("frozen benchmark comparison derives deterministic random and momentum controls without post-outcome selection", () => {
  const certificate = {
    current: {
      performance: { averageNetReturnEdgePct: { estimate: 12, lower: 4 } },
      pairs: [{
        pairId: "p1",
        treatmentNetReturnPct: 30,
        controls: [
          { episode: { routeKey: "base:a:p", frozenFeatures: { priceChange24hPct: 2 } }, outcome: { netReturnPct: 5 } },
          { episode: { routeKey: "base:b:p", frozenFeatures: { priceChange24hPct: 9 } }, outcome: { netReturnPct: 15 } },
        ],
      }],
    },
  };
  const report = buildFrozenBenchmarkComparison(certificate);
  assert.equal(report.matchedEligibleUnselected.state, "AVAILABLE");
  assert.equal(report.deterministicRandomEligibleControl.samples, 1);
  assert.equal(report.frozenMomentumControl.averageNetReturnEdgePct, 15);
  assert.equal(report.marketIndex.fabricatedFallbackAllowed, false);
});

test("promotion gate fails closed while evidence is incomplete", () => {
  const gate = evaluateCli15PromotionGate({
    contractAudit: { currentContracts: 0, pass: false },
    certificate: { edgeState: "UNVERIFIED_NO_FROZEN_COHORTS", current: {}, inputAudit: {} },
    primaryHorizon: { calibration: { state: "INSUFFICIENT_CALIBRATION_SAMPLE" } },
    canary: { state: "PAPER_CANARY_COLLECTING" },
    sourceReadiness: { liveReady: false },
    championChallenger: { state: "NO_VERIFIED_CHAMPION_BASELINE" },
    edgeDecay: { state: "INSUFFICIENT_HISTORY" },
    horizons: {},
  });
  assert.equal(gate.state, "CLI15_COLLECTING_FORWARD_EVIDENCE");
  assert.equal(gate.edgeVerdict, "UNPROVEN");
  assert.equal(gate.promotion.automaticPromotion, false);
  assert.equal(gate.promotion.realMoneyTradingAuthorized, false);
});

test("promotion gate exposes human review only when every proof gate passes", () => {
  const gate = evaluateCli15PromotionGate({
    contractAudit: { currentContracts: 250, pass: true },
    certificate: {
      edgeState: "VERIFIED_FORWARD_EDGE",
      current: { interimSafety: { pass: true }, gates: { enoughData: true } },
      inputAudit: { currentStrategyLedgerIntegrityPass: true },
    },
    primaryHorizon: { calibration: { state: "CALIBRATED" } },
    canary: { state: "PAPER_CANARY_EDGE_SUPPORTED" },
    sourceReadiness: { liveReady: true },
    championChallenger: { state: "CHAMPION_ELIGIBLE", rollbackRequired: false, champion: { fingerprint: "champion-v1" } },
    edgeDecay: { state: "HEALTHY" },
    horizons: { 24: { state: "HORIZON_EDGE_POSITIVE" } },
  });
  assert.equal(gate.state, "CLI15_HUMAN_PROMOTION_REVIEW_ELIGIBLE");
  assert.equal(gate.edgeVerdict, "PROVEN");
  assert.equal(gate.promotion.eligibleForHumanReview, true);
  assert.equal(gate.promotion.automaticPromotion, false);
});

test("decaying forward performance triggers the shadow rollback kill switch", () => {
  const gate = evaluateCli15PromotionGate({
    contractAudit: { currentContracts: 250, pass: true },
    certificate: {
      edgeState: "VERIFIED_FORWARD_EDGE",
      current: { interimSafety: { pass: true }, gates: { enoughData: true } },
      inputAudit: { currentStrategyLedgerIntegrityPass: true },
    },
    primaryHorizon: { calibration: { state: "CALIBRATED" } },
    canary: { state: "PAPER_CANARY_EDGE_SUPPORTED" },
    sourceReadiness: { liveReady: true },
    championChallenger: { state: "CHAMPION_ELIGIBLE", rollbackRequired: false, champion: { fingerprint: "champion-v1" } },
    edgeDecay: { state: "DECAYING" },
    horizons: { 24: { state: "HORIZON_EDGE_POSITIVE" } },
  });
  assert.equal(gate.state, "CLI15_EDGE_DEGRADED");
  assert.equal(gate.killSwitch.triggered, true);
  assert.equal(gate.rollback.required, true);
  assert.equal(gate.rollback.target, "champion-v1");
  assert.equal(gate.rollback.realMoneyAction, false);
});

test("CLI 15 control plane remains research-only on a cold start", () => {
  const report = buildForwardAlphaValidationOS({
    episodes: [],
    observations: [],
    sourceReadiness: { state: "CODE_COMPLETE_LIVE_HEALTH_UNVERIFIED", liveReady: false },
  }, {
    asOf: "2026-01-02T00:00:00.000Z",
    requireObservationLedgerIntegrity: false,
  });
  assert.equal(report.state, "CLI15_COLLECTING_FORWARD_EVIDENCE");
  assert.equal(report.edgeVerdict, "UNPROVEN");
  assert.equal(report.predictionContracts.state, "CLI15_NO_FROZEN_PREDICTIONS");
  assert.equal(report.policy.automaticTrading, false);
  assert.equal(report.policy.automaticPromotion, false);
});
