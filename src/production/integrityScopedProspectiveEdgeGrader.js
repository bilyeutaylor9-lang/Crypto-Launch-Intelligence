import {
  __prospectiveEdgeGraderHooks,
  gradeProspectiveEdgeCohorts,
} from "./prospectiveEdgeCohortGrader.js";
import { timestamp } from "./productionMath.js";

export const INTEGRITY_SCOPE_POLICY = "CURRENT_STRATEGY_PARTITION_FAIL_CLOSED_V2";

const LEGACY_ORDER_SENSITIVE_FAILURES = new Set([
  "STRATEGY_FINGERPRINT_MISMATCH",
  "FROZEN_EPISODE_CONTENT_HASH_MISMATCH",
  "CLI15_PREDICTION_CONTRACT_HASH_MISMATCH",
  "CLI15_FEATURE_SNAPSHOT_HASH_MISMATCH",
]);

function currentStrategyRows(episodes = [], asOfMs) {
  const eligible = (Array.isArray(episodes) ? episodes : [])
    .filter((row) => row?.strategyFingerprint && timestamp(row.decisionAt) !== null && timestamp(row.decisionAt) <= asOfMs)
    .sort((left, right) => timestamp(right.decisionAt) - timestamp(left.decisionAt));
  const fingerprint = eligible[0]?.strategyFingerprint || null;
  return {
    fingerprint,
    rows: fingerprint ? eligible.filter((row) => row.strategyFingerprint === fingerprint) : [],
  };
}

function currentPartitionIntegrity(episodes = [], asOfMs, options = {}) {
  const current = currentStrategyRows(episodes, asOfMs);
  const audit = current.rows.map((row) => ({
    row,
    failures: __prospectiveEdgeGraderHooks.episodeIntegrityFailures(row, asOfMs, options),
  }));
  const seen = new Set();
  const duplicateEpisodeIds = new Set();
  for (const { row } of audit) {
    const episodeId = row?.episodeId || "MISSING_EPISODE_ID";
    if (!row?.episodeId || seen.has(episodeId)) duplicateEpisodeIds.add(episodeId);
    seen.add(episodeId);
  }
  const individuallyValid = audit.filter((entry) => !entry.failures.length).map((entry) => entry.row);
  const topologyFailures = __prospectiveEdgeGraderHooks.cohortTopologyFailures(individuallyValid);
  return {
    ...current,
    audit,
    duplicateEpisodeIds,
    topologyFailures,
    pass: Boolean(current.fingerprint) &&
      audit.every((entry) => !entry.failures.length) &&
      duplicateEpisodeIds.size === 0 &&
      topologyFailures.size === 0,
  };
}

function legacyHashOnly(entry = {}) {
  const failures = Array.isArray(entry.failures) ? entry.failures : [];
  return failures.includes("STRATEGY_FINGERPRINT_MISMATCH") &&
    failures.length > 0 &&
    failures.every((failure) => LEGACY_ORDER_SENSITIVE_FAILURES.has(failure));
}

// This deliberately consumes only the base grader's already-computed metrics
// and gates. It never adds quarantined rows to the statistical sample.
function recomputeEdgeState(current = {}) {
  if (!current?.sample?.frozenEpisodes) return "UNVERIFIED_NO_FROZEN_COHORTS";
  const gates = current.gates || {};
  if (gates.enoughData !== true) return "UNVERIFIED_INSUFFICIENT_FORWARD_EVIDENCE";
  const evidenceQuality = gates.capturePass === true &&
    gates.executionCostPass === true &&
    gates.matchQualityPass === true &&
    gates.replicationPass === true &&
    current.interimSafety?.pass === true &&
    current.missingnessSensitivity?.pass === true;
  if (!evidenceQuality) return "UNVERIFIED_EVIDENCE_QUALITY_GATES";
  if (gates.returnVerified === true && gates.hitVerified === true && gates.catastropheSafe === true) {
    return "VERIFIED_FORWARD_EDGE";
  }
  const returnEstimate = Number(current.performance?.averageNetReturnEdgePct?.estimate ?? 0);
  const hitEstimate = Number(current.performance?.hitRateEdge?.estimate ?? 0);
  if (returnEstimate > 0 && hitEstimate > 0 && gates.catastropheSafe === true) {
    return "EMERGING_FORWARD_EDGE";
  }
  return "NO_VERIFIED_EDGE";
}

function scopeAudit(base = {}, currentPartition = {}, allEpisodeAudit = []) {
  const historicalInvalid = allEpisodeAudit.filter((entry) =>
    entry.row?.strategyFingerprint !== currentPartition.fingerprint && entry.failures.length,
  );
  const legacyHashQuarantine = historicalInvalid.filter(legacyHashOnly);
  const nonLegacyInvalid = historicalInvalid.filter((entry) => !legacyHashOnly(entry));
  const observationIntegrityRowsQuarantined = Number(
    base.inputAudit?.rejectionReasons?.integrityFailure || 0,
  );
  return {
    legacyHashQuarantine,
    nonLegacyInvalid,
    observationIntegrityRowsQuarantined,
    globalHistoricalProspectiveLedgerIntegrityPass:
      base.inputAudit?.prospectiveCohortLedgerIntegrityPass === true,
    historicalObservationLedgerIntegrityPass:
      base.inputAudit?.exactMarketObservationLedgerIntegrityPass === true,
  };
}

/**
 * Preserves the base grader's immutable evidence/sample construction while
 * preventing old, JSONB-order-damaged rows from poisoning a newer canonical
 * strategy. Any defect in the current strategy remains fail-closed.
 */
export function gradeIntegrityScopedProspectiveEdgeCohorts(episodes = [], observations = [], options = {}) {
  const asOf = options.asOf || options.now || new Date().toISOString();
  const asOfMs = timestamp(asOf);
  if (asOfMs === null) throw new Error("A valid as-of timestamp is required to grade integrity-scoped cohorts");

  const base = gradeProspectiveEdgeCohorts(episodes, observations, options);
  const currentPartition = currentPartitionIntegrity(episodes, asOfMs, options);
  const allEpisodeAudit = (Array.isArray(episodes) ? episodes : []).map((row) => ({
    row,
    failures: __prospectiveEdgeGraderHooks.episodeIntegrityFailures(row, asOfMs, options),
  }));
  const audit = scopeAudit(base, currentPartition, allEpisodeAudit);
  const hasCurrentStrategy = Boolean(currentPartition.fingerprint || base.latestStrategyFingerprint);
  const currentStrategyPartitionIntegrityPass = hasCurrentStrategy
    ? currentPartition.fingerprint === base.latestStrategyFingerprint && currentPartition.pass
    : null;
  const integrityScope = {
    policy: INTEGRITY_SCOPE_POLICY,
    rationale: "Historical rows with only legacy order-sensitive hash failures stay excluded and quarantined. Current-strategy defects, non-hash corruption, and invalid observations remain fail-closed.",
    currentStrategyPartitionIntegrityPass,
    currentStrategyFingerprint: currentPartition.fingerprint,
    currentStrategyEpisodes: currentPartition.rows.length,
    currentDuplicateEpisodeIds: [...currentPartition.duplicateEpisodeIds],
    currentTopologyFailureEpisodeIds: [...currentPartition.topologyFailures.keys()],
    globalHistoricalProspectiveLedgerIntegrityPass: audit.globalHistoricalProspectiveLedgerIntegrityPass,
    historicalObservationLedgerIntegrityPass: audit.historicalObservationLedgerIntegrityPass,
    legacyHashOrderRowsQuarantined: audit.legacyHashQuarantine.length,
    nonLegacyInvalidRowsObserved: audit.nonLegacyInvalid.length,
    observationIntegrityRowsQuarantined: audit.observationIntegrityRowsQuarantined,
    automaticTrading: false,
    automaticPromotion: false,
  };
  const inputAudit = {
    ...base.inputAudit,
    // An empty ledger is an honest collection state, not an integrity defect.
    // Once a strategy exists, every defect in that partition is fail-closed.
    currentStrategyLedgerIntegrityPass: hasCurrentStrategy
      ? currentStrategyPartitionIntegrityPass
      : base.inputAudit?.currentStrategyLedgerIntegrityPass === true,
    currentStrategyPartitionIntegrityPass,
    globalHistoricalProspectiveLedgerIntegrityPass: audit.globalHistoricalProspectiveLedgerIntegrityPass,
    historicalObservationLedgerIntegrityPass: audit.historicalObservationLedgerIntegrityPass,
    legacyHashOrderRowsQuarantined: audit.legacyHashQuarantine.length,
    nonLegacyInvalidRowsObserved: audit.nonLegacyInvalid.length,
    observationIntegrityRowsQuarantined: audit.observationIntegrityRowsQuarantined,
  };
  if (hasCurrentStrategy && !currentStrategyPartitionIntegrityPass) {
    return {
      ...base,
      inputAudit,
      integrityScope,
      certificateEligible: false,
      automaticTrading: false,
      automaticPromotion: false,
    };
  }

  const current = {
    ...base.current,
    edgeState: recomputeEdgeState(base.current),
    blockers: (base.current?.blockers || []).filter((blocker) =>
      blocker !== "PROSPECTIVE_COHORT_LEDGER_INTEGRITY_FAILURE" &&
      blocker !== "EXACT_MARKET_OBSERVATION_LEDGER_INTEGRITY_FAILURE",
    ),
  };
  const certificateEligible = current.edgeState === "VERIFIED_FORWARD_EDGE";
  return {
    ...base,
    edgeState: current.edgeState,
    current,
    strategies: base.latestStrategyFingerprint
      ? { ...base.strategies, [base.latestStrategyFingerprint]: current }
      : base.strategies,
    inputAudit,
    integrityScope,
    certificateEligible,
    automaticTrading: false,
    automaticPromotion: false,
  };
}

export const __integrityScopedProspectiveEdgeGraderHooks = {
  currentStrategyRows,
  currentPartitionIntegrity,
  legacyHashOnly,
  recomputeEdgeState,
};
