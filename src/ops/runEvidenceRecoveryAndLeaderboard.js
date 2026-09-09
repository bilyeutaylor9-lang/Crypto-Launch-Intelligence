import { writeAtomicJson } from "../production/atomicArtifactStore.js";
import { loadLeadTimeOutcomeLab } from "../learning/leadTimeOutcomeLab.js";
import {
  buildDatasetEvidenceCoverageMatrix,
  buildEvidenceRecoveryPlan,
  persistEvidenceRecoveryReports,
} from "../learning/evidenceRecoveryBrain.js";
import {
  buildAlphaFeatureLeaderboard,
  persistAlphaFeatureLeaderboard,
} from "../learning/alphaFeatureLeaderboard.js";
import { rankMissingEvidenceValue } from "../learning/missingEvidenceValueOfInformation.js";

export const FEATURES = Object.freeze([
  "productionScore",
  "projectClockScore",
  "capitalClockScore",
  "attentionClockScore",
  "divergenceScore",
  "leadStage",
  "structuralBreakScore",
  "fakeMomentumRiskScore",
  "sequenceSimilarity",
  "residualBlindspotSimilarity",
]);

function inferEvidence(row, feature) {
  const explicit = row?.evidence?.[feature];
  if (explicit) return explicit;
  const value = row?.[feature];
  return {
    value: value ?? null,
    state: value === null || value === undefined ? "MISSING" : "DERIVED",
    observedAt: row?.observedAt || null,
    source: "asymmetric-edge-observation",
    producingEngine: "asymmetricEdgeSuite",
    reason: value === null || value === undefined ? "PIPELINE_OUTPUT_MISSING" : "FROZEN_COMPUTED_FEATURE",
  };
}

export function runEvidenceRecoveryAndLeaderboard(options = {}) {
  const lab = options.lab || loadLeadTimeOutcomeLab(options);
  const rows = Array.isArray(lab.records) ? lab.records.map((row) => ({
    ...row,
    evidence: Object.fromEntries(FEATURES.map((feature) => [feature, inferEvidence(row, feature)])),
  })) : [];
  const now = options.now ?? Date.now();
  const reportsDir = options.reportsDir || "reports";
  const matrix = buildDatasetEvidenceCoverageMatrix(rows, FEATURES, { now });
  const recoveryPlan = buildEvidenceRecoveryPlan(matrix);
  persistEvidenceRecoveryReports(matrix, recoveryPlan, { reportsDir });

  const leaderboard = buildAlphaFeatureLeaderboard(rows, {
    now,
    eligibleStates: ["OBSERVED", "DERIVED"],
    minObserved: Number(process.env.ALPHA_FEATURE_MIN_OBSERVED || 30),
    minCoveragePct: Number(process.env.ALPHA_FEATURE_MIN_COVERAGE_PCT || 60),
    minDistinctValues: Number(process.env.ALPHA_FEATURE_MIN_DISTINCT || 3),
    minBucketN: Number(process.env.ALPHA_FEATURE_MIN_BUCKET_N || 10),
    minComboN: Number(process.env.ALPHA_FEATURE_MIN_COMBO_N || 20),
  });
  persistAlphaFeatureLeaderboard(leaderboard, {
    filePath: `${reportsDir}/alpha-feature-leaderboard.json`,
  });

  const priorities = rankMissingEvidenceValue(rows, FEATURES, options.voi || {});
  const voi = {
    schemaVersion: 1,
    generatedAt: new Date(now).toISOString(),
    rows: rows.length,
    features: priorities,
    policy: { researchOnly: true, automaticPromotion: false },
  };
  writeAtomicJson(`${reportsDir}/missing-evidence-value-of-information.json`, voi);
  return { rows: rows.length, matrix, recoveryPlan, leaderboard, voi };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const result = runEvidenceRecoveryAndLeaderboard();
    console.log(JSON.stringify({
      rows: result.rows,
      leaderboardStatus: result.leaderboard.status,
      unresolvedEvidenceFeatures: result.recoveryPlan.unresolved,
      missingEvidencePriorities: result.voi.features.slice(0, 5),
    }, null, 2));
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
