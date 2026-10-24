import test from "node:test";
import assert from "node:assert/strict";

import {
  auditForwardPredictionContracts,
  buildForwardAlphaValidationOS,
  buildFrozenBenchmarkComparison,
  evaluateCli15PromotionGate,
  evaluateForwardHorizon,
  __forwardAlphaValidationHooks,
} from "../src/production/forwardAlphaValidationOS.js";
import { buildExactMarketObservation } from "../src/production/exactMarketObservationLedger.js";
import { gradeIntegrityScopedProspectiveEdgeCohorts } from "../src/production/integrityScopedProspectiveEdgeGrader.js";
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

function promotionInputs() {
  const fingerprint = "a".repeat(64);
  const asOf = "2026-05-01T00:00:00.000Z";
  return {
    contractAudit: { currentContracts: 250, pass: true, latestStrategyFingerprint: fingerprint, asOf },
    certificate: {
      generatedAt: asOf,
      edgeState: "VERIFIED_FORWARD_EDGE",
      certificateEligible: true,
      latestStrategyFingerprint: fingerprint,
      current: {
        generatedAt: asOf,
        edgeState: "VERIFIED_FORWARD_EDGE",
        strategyFingerprint: fingerprint,
        interimSafety: { observations: 250, pass: true },
        missingnessSensitivity: { pass: true },
        capture: { pass: true },
        executionCosts: { pass: true },
        matchQuality: { pass: true },
        replication: { pass: true },
        gates: {
          enoughData: true,
          capturePass: true,
          executionCostPass: true,
          matchQualityPass: true,
          replicationPass: true,
          returnVerified: true,
          hitVerified: true,
          catastropheSafe: true,
          missingnessSensitivityPass: true,
        },
        blockers: [],
      },
      inputAudit: {
        episodeInputValid: true,
        observationInputValid: true,
        currentStrategyLedgerIntegrityPass: true,
        currentStrategyPartitionIntegrityPass: true,
        scopedProspectiveLedgerIntegrityPass: true,
        exactMarketObservationLedgerIntegrityRequired: true,
        exactMarketObservationLedgerIntegrityPass: true,
        duplicateEpisodeIds: [],
        topologyFailureEpisodeIds: [],
        duplicateObservationKeys: [],
        observationsRejected: 0,
        nonLegacyInvalidRowsObserved: 0,
      },
      automaticTrading: false,
      automaticPromotion: false,
    },
    primaryHorizon: { calibration: { state: "CALIBRATED" } },
    canary: { state: "PAPER_CANARY_EDGE_SUPPORTED" },
    sourceReadiness: { liveReady: true },
    championChallenger: { state: "CHAMPION_ELIGIBLE", rollbackRequired: false, champion: { fingerprint: "champion-v1" } },
    edgeDecay: { state: "HEALTHY" },
    horizons: { 24: { state: "HORIZON_EDGE_POSITIVE" } },
  };
}

function setProof(inputs, path, value) {
  const keys = path.split(".");
  const parent = keys.slice(0, -1).reduce((row, key) => row[key], inputs);
  parent[keys.at(-1)] = value;
}

function assertPromotionBlocked(inputs, blocker) {
  const original = structuredClone(inputs);
  const gate = evaluateCli15PromotionGate(inputs);
  assert.equal(gate.promotion.eligibleForHumanReview, false);
  assert.notEqual(gate.edgeVerdict, "PROVEN");
  assert.ok(gate.blockers.includes(blocker), JSON.stringify(gate.blockers));
  assert.equal(gate.promotion.automaticPromotion, false);
  assert.equal(gate.promotion.realMoneyTradingAuthorized, false);
  assert.equal(gate.rollback.realMoneyAction, false);
  assert.deepEqual(inputs, original, "Promotion evaluation must not rewrite evidence or history");
}

test("poolless price spikes cannot inflate a frozen-pool outcome or its excursion metrics", () => {
  const episode = frozenCohort().episodes.find(row => row.role === "TREATMENT");
  const targetAt = "2026-01-02T00:10:00.000Z";
  const missingPool = exactObservation({ ...episode, poolAddress: null }, targetAt, 100);
  const wrongPool = exactObservation({ ...episode, poolAddress: address(999_999) }, targetAt, 100);
  const matchingPool = exactObservation(episode, targetAt, 1.1);
  const rows = [missingPool, wrongPool];
  assert.equal(__forwardAlphaValidationHooks.pathExcursions(episode, rows, 24, 1), null);
  const excursion = __forwardAlphaValidationHooks.pathExcursions(episode, [...rows, matchingPool], 24, 1);
  assert.equal(excursion.observations, 1);
  assert.equal(excursion.maximumFavorableExcursionPct, 10);
  const report = evaluateForwardHorizon([episode], rows, { asOf: targetAt, horizonHours: 24 });
  assert.equal(report.sample.resolvedEpisodes, 0);
  const mixedReport = evaluateForwardHorizon([episode], [...rows, matchingPool], { asOf: targetAt, horizonHours: 24 });
  assert.equal(mixedReport.sample.resolvedEpisodes, 1);
  assert.equal(mixedReport.outcomes[0].endPriceUsd, 1.1);
  assert.equal(mixedReport.outcomes[0].path.observations, 1);
});

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
  const gate = evaluateCli15PromotionGate(promotionInputs());
  assert.equal(gate.state, "CLI15_HUMAN_PROMOTION_REVIEW_ELIGIBLE");
  assert.equal(gate.edgeVerdict, "PROVEN");
  assert.equal(gate.promotion.eligibleForHumanReview, true);
  assert.equal(gate.promotion.automaticPromotion, false);
  assert.equal(gate.promotion.realMoneyTradingAuthorized, false);
});

const requiredCertificateProofs = [
  ["certificateEligible", "FORWARD_EDGE_CERTIFICATE_NOT_VERIFIED"],
  ...[
    "episodeInputValid", "observationInputValid", "currentStrategyLedgerIntegrityPass",
    "currentStrategyPartitionIntegrityPass", "scopedProspectiveLedgerIntegrityPass",
    "exactMarketObservationLedgerIntegrityRequired", "exactMarketObservationLedgerIntegrityPass",
  ].map((field) => [`inputAudit.${field}`, "FORWARD_EVIDENCE_INTEGRITY_NOT_VERIFIED"]),
  ["current.interimSafety.pass", "FORWARD_CERTIFICATE_SAFETY_NOT_VERIFIED"],
  ["current.missingnessSensitivity.pass", "FORWARD_CERTIFICATE_SAFETY_NOT_VERIFIED"],
  ...[
    "enoughData", "capturePass", "executionCostPass", "matchQualityPass", "replicationPass",
    "returnVerified", "hitVerified", "catastropheSafe", "missingnessSensitivityPass",
  ].map((field) => [`current.gates.${field}`, "FORWARD_CERTIFICATE_PROOF_GATES_NOT_VERIFIED"]),
  ...["capture", "executionCosts", "matchQuality", "replication"]
    .map((field) => [`current.${field}.pass`, "FORWARD_CERTIFICATE_PROOF_GATES_NOT_VERIFIED"]),
];

for (const [path, blocker] of requiredCertificateProofs) {
  test(`promotion requires affirmative certificate.${path}`, () => {
    for (const value of [undefined, null, false, 0, 1, "true", "false", "UNKNOWN", {}, []]) {
      const inputs = promotionInputs();
      setProof(inputs, `certificate.${path}`, value);
      assertPromotionBlocked(inputs, blocker);
    }
  });
}

test("promotion rejects the original verified-string-only fail-open claim", () => {
  const inputs = promotionInputs();
  inputs.certificate = {
    edgeState: "VERIFIED_FORWARD_EDGE",
    certificateEligible: false,
    current: {},
    inputAudit: {},
  };
  assertPromotionBlocked(inputs, "FORWARD_EDGE_CERTIFICATE_NOT_VERIFIED");
  const gate = evaluateCli15PromotionGate(inputs, { policy: { requireVerifiedForwardCertificate: false } });
  assert.equal(gate.promotion.eligibleForHumanReview, false);
});

test("promotion rejects missing proof sections and contradictory current state", () => {
  for (const path of ["current", "inputAudit", "current.gates", "current.interimSafety", "current.missingnessSensitivity"]) {
    const inputs = promotionInputs();
    setProof(inputs, `certificate.${path}`, undefined);
    assert.equal(evaluateCli15PromotionGate(inputs).promotion.eligibleForHumanReview, false, path);
  }
  for (const path of ["edgeState", "current.edgeState"]) {
    for (const value of [undefined, null, "UNKNOWN", "UNVERIFIED_EVIDENCE_QUALITY_GATES"]) {
      const inputs = promotionInputs();
      setProof(inputs, `certificate.${path}`, value);
      assertPromotionBlocked(inputs, "FORWARD_EDGE_CERTIFICATE_NOT_VERIFIED");
    }
  }
  const inputs = promotionInputs();
  inputs.certificate.verified = false;
  assertPromotionBlocked(inputs, "FORWARD_EDGE_CERTIFICATE_NOT_VERIFIED");
});

test("promotion binds certificate proofs to the current prediction-contract fingerprint", () => {
  for (const path of ["certificate.latestStrategyFingerprint", "certificate.current.strategyFingerprint", "contractAudit.latestStrategyFingerprint"]) {
    for (const value of [undefined, null, "", " ", true, "b".repeat(64)]) {
      const inputs = promotionInputs();
      setProof(inputs, path, value);
      assertPromotionBlocked(inputs, "CURRENT_FORWARD_CERTIFICATE_BINDING_NOT_VERIFIED");
    }
  }
});

test("promotion rejects stale or unknown certificate and audit as-of times", () => {
  for (const path of ["certificate.generatedAt", "certificate.current.generatedAt", "contractAudit.asOf"]) {
    for (const value of [undefined, null, "invalid-time", "2026-04-30T00:00:00.000Z"]) {
      const inputs = promotionInputs();
      setProof(inputs, path, value);
      assertPromotionBlocked(inputs, "CURRENT_FORWARD_CERTIFICATE_BINDING_NOT_VERIFIED");
    }
  }
  const inputs = promotionInputs();
  inputs.certificate.generatedAt = "2026-04-30T17:00:00.000-07:00";
  assert.equal(evaluateCli15PromotionGate(inputs).promotion.eligibleForHumanReview, true);
});

test("promotion requires non-vacuous interim safety evidence", () => {
  for (const value of [undefined, null, 0, -1, 1.5, "250", NaN, Infinity]) {
    const inputs = promotionInputs();
    inputs.certificate.current.interimSafety.observations = value;
    assertPromotionBlocked(inputs, "FORWARD_CERTIFICATE_SAFETY_NOT_VERIFIED");
  }
});

test("promotion rejects contradictory clean-integrity claims and outstanding blockers", () => {
  for (const path of ["duplicateEpisodeIds", "topologyFailureEpisodeIds", "duplicateObservationKeys"]) {
    for (const value of [undefined, null, "[]", ["unresolved-defect"]]) {
      const inputs = promotionInputs();
      inputs.certificate.inputAudit[path] = value;
      assertPromotionBlocked(inputs, "FORWARD_EVIDENCE_INTEGRITY_NOT_VERIFIED");
    }
  }
  for (const path of ["observationsRejected", "nonLegacyInvalidRowsObserved"]) {
    for (const value of [undefined, null, -1, 1, "0"]) {
      const inputs = promotionInputs();
      inputs.certificate.inputAudit[path] = value;
      assertPromotionBlocked(inputs, "FORWARD_EVIDENCE_INTEGRITY_NOT_VERIFIED");
    }
  }
  for (const value of [undefined, null, "", ["INTERIM_FORWARD_SAFETY_REVOCATION"], ["UNKNOWN_BLOCKER"]]) {
    const inputs = promotionInputs();
    inputs.certificate.current.blockers = value;
    assertPromotionBlocked(inputs, "FORWARD_CERTIFICATE_BLOCKERS_NOT_CLEARED");
  }
});

test("promotion requires disabled certificate trading and automatic promotion", () => {
  for (const field of ["automaticTrading", "automaticPromotion"]) {
    for (const value of [undefined, null, true, 0, "false"]) {
      const inputs = promotionInputs();
      inputs.certificate[field] = value;
      assertPromotionBlocked(inputs, "FORWARD_CERTIFICATE_GOVERNANCE_NOT_VERIFIED");
    }
  }
});

test("current promotion checks preserve revoked history and the existing legacy-quarantine scope", () => {
  const inputs = promotionInputs();
  inputs.certificate.strategies = {
    "55125b7454cf": { interimSafety: { pass: false }, blockers: ["INTERIM_FORWARD_SAFETY_REVOCATION"] },
    "bd936b721888": { interimSafety: { pass: false }, blockers: ["INTERIM_FORWARD_SAFETY_REVOCATION"] },
  };
  inputs.certificate.inputAudit.globalHistoricalProspectiveLedgerIntegrityPass = false;
  inputs.certificate.inputAudit.prospectiveCohortLedgerIntegrityPass = false;
  inputs.certificate.inputAudit.legacyHashOrderRowsQuarantined = 2;
  const original = structuredClone(inputs);
  assert.equal(evaluateCli15PromotionGate(inputs).promotion.eligibleForHumanReview, true);
  assert.deepEqual(inputs, original);
  inputs.certificate.current.interimSafety.pass = false;
  assertPromotionBlocked(inputs, "INTERIM_FORWARD_EDGE_REVOCATION");
});

test("promotion accepts the existing grader's affirmative certificate without changing thresholds", () => {
  const episodes = [], observations = [];
  const asOf = "2026-05-01T00:00:00.000Z";
  for (let cohort = 0; cohort < 36; cohort += 1) {
    const now = new Date(Date.UTC(2026, 0, 1 + cohort * 2)).toISOString();
    const sourceObservedAt = new Date(Date.parse(now) - 600_000).toISOString();
    const treatments = Array.from({ length: 7 }, (_, index) => candidate(cohort * 7 + index + 1, { sourceObservedAt }));
    const controls = treatments.map((_, index) => candidate(cohort * 7 + index + 50_001, { sourceObservedAt }));
    const frozen = freezeProspectiveEdgeCohort(treatments, controls, {
      now, sourceObservedAt, existingEpisodes: [], requireRowSourceObservedAt: true,
      maxControls: 1, maximumSelections: 7,
      codeCommitSha: "0123456789abcdef0123456789abcdef01234567",
      configFingerprint: "fixed-promotion-boundary-fixture",
    });
    assert.equal(frozen.episodes.length, 14);
    episodes.push(...frozen.episodes);
    for (const episode of frozen.episodes) {
      observations.push(exactObservation(episode, new Date(Date.parse(now) + 86_400_000).toISOString(),
        episode.role === "TREATMENT" ? 1.41 : 1.06));
    }
  }
  const inputs = promotionInputs();
  inputs.certificate = gradeIntegrityScopedProspectiveEdgeCohorts(episodes, observations, { asOf });
  inputs.contractAudit = auditForwardPredictionContracts(episodes, { asOf });
  assert.equal(inputs.certificate.certificateEligible, true);
  assert.equal(inputs.certificate.current.gates.minimumResolvedPairs, 250);
  assert.equal(inputs.certificate.current.sequentialInference.checkpointPairCount, 250);
  const original = structuredClone(inputs);
  assert.equal(evaluateCli15PromotionGate(inputs).promotion.eligibleForHumanReview, true);
  assert.deepEqual(inputs, original);
});

test("decaying forward performance triggers the shadow rollback kill switch", () => {
  const inputs = promotionInputs();
  inputs.edgeDecay.state = "DECAYING";
  const gate = evaluateCli15PromotionGate(inputs);
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
