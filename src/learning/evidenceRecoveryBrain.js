import { num } from "../edge/edgeMath.js";
import { writeAtomicJson } from "../production/atomicArtifactStore.js";
import {
  normalizeEvidenceState,
  VALID_EVIDENCE_STATES,
} from "./featureEvidencePolicy.js";

export const EvidenceState = Object.freeze(
  Object.fromEntries(VALID_EVIDENCE_STATES.map((state) => [state, state]))
);

const DEFAULT_STALE_HOURS = 6;

function nowMs(value) {
  const parsed = value instanceof Date ? value.getTime() : new Date(value ?? Date.now()).getTime();
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function hoursOld(timestamp, now = Date.now()) {
  if (!timestamp) return null;
  const observed = new Date(timestamp).getTime();
  if (!Number.isFinite(observed)) return null;
  return (nowMs(now) - observed) / 3_600_000;
}

function inferState(entry = {}, options = {}) {
  if (entry.notApplicable === true) return EvidenceState.NOT_APPLICABLE;
  if (entry.conflicted === true) return EvidenceState.CONFLICTED;
  if (entry.value === null || entry.value === undefined || entry.value === "") {
    return EvidenceState.MISSING;
  }
  if (entry.derived === true) return EvidenceState.DERIVED;
  const age = hoursOld(entry.observedAt || entry.timestamp, options.now);
  if (age !== null && age > Number(options.staleHours ?? DEFAULT_STALE_HOURS)) {
    return EvidenceState.STALE;
  }
  return EvidenceState.OBSERVED;
}

export function normalizeEvidenceEntry(name, entry = {}, options = {}) {
  const explicitState = entry?.state
    ? normalizeEvidenceState(entry.state)
    : inferState(entry, options);
  const invalidExplicitState = Boolean(entry?.state) &&
    !VALID_EVIDENCE_STATES.includes(String(entry.state).trim().toUpperCase());
  return {
    feature: name,
    value: entry?.value ?? null,
    state: invalidExplicitState ? EvidenceState.MISSING : explicitState,
    source: entry?.source || null,
    provider: entry?.provider || null,
    producingEngine: entry?.producingEngine || null,
    observedAt: entry?.observedAt || entry?.timestamp || null,
    ageHours: hoursOld(entry?.observedAt || entry?.timestamp, options.now),
    confidence: num(entry?.confidence),
    reason: invalidExplicitState
      ? `INVALID_EVIDENCE_STATE:${entry.state}`
      : entry?.reason || null,
  };
}

function countStates(rows = []) {
  return Object.fromEntries(
    VALID_EVIDENCE_STATES.map((state) => [state, rows.filter((row) => row.state === state).length])
  );
}

function aggregateFeatureState(totals = {}) {
  if (totals.CONFLICTED > 0) return EvidenceState.CONFLICTED;
  if (totals.MISSING > 0) return EvidenceState.MISSING;
  if (totals.STALE > 0) return EvidenceState.STALE;
  if (totals.DERIVED > 0) return EvidenceState.DERIVED;
  if (totals.OBSERVED > 0) return EvidenceState.OBSERVED;
  return EvidenceState.NOT_APPLICABLE;
}

export function buildEvidenceCoverageMatrix(features = {}, options = {}) {
  const rows = Object.entries(features).map(([name, entry]) =>
    normalizeEvidenceEntry(name, entry, options)
  );
  const totals = countStates(rows);
  const applicable = rows.filter((row) => row.state !== EvidenceState.NOT_APPLICABLE);
  const observed = applicable.filter((row) => row.state === EvidenceState.OBSERVED);
  return {
    schemaVersion: 1,
    generatedAt: new Date(options.now ?? Date.now()).toISOString(),
    rows: 1,
    features: rows,
    totals,
    applicableFeatures: applicable.length,
    observedFeatures: observed.length,
    observedCoveragePct: applicable.length ? (observed.length / applicable.length) * 100 : null,
  };
}

export function buildDatasetEvidenceCoverageMatrix(rows = [], featureNames = [], options = {}) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const features = featureNames.map((feature) => {
    const entries = safeRows.map((row) =>
      normalizeEvidenceEntry(feature, row?.evidence?.[feature] || {}, options)
    );
    const totals = countStates(entries);
    const applicable = entries.filter((entry) => entry.state !== EvidenceState.NOT_APPLICABLE);
    const observed = totals.OBSERVED;
    const sources = [...new Set(entries.map((entry) => entry.source).filter(Boolean))];
    const reasons = [...new Set(entries.map((entry) => entry.reason).filter(Boolean))];
    return {
      feature,
      value: null,
      state: aggregateFeatureState(totals),
      totals,
      applicable: applicable.length,
      observed,
      observedCoveragePct: applicable.length ? (observed / applicable.length) * 100 : null,
      sources,
      reasons: reasons.slice(0, 12),
      reason: reasons.join(" | ") || null,
    };
  });
  const entries = safeRows.flatMap((row) =>
    featureNames.map((feature) => normalizeEvidenceEntry(feature, row?.evidence?.[feature] || {}, options))
  );
  const totals = countStates(entries);
  const applicableCells = entries.filter((entry) => entry.state !== EvidenceState.NOT_APPLICABLE).length;
  return {
    schemaVersion: 1,
    generatedAt: new Date(options.now ?? Date.now()).toISOString(),
    rows: safeRows.length,
    featureCount: featureNames.length,
    totalEvidenceCells: entries.length,
    applicableEvidenceCells: applicableCells,
    observedEvidenceCells: totals.OBSERVED,
    observedCoveragePct: applicableCells ? (totals.OBSERVED / applicableCells) * 100 : null,
    totals,
    features,
  };
}

export function classifyRecoveryAction(evidence = {}) {
  const totals = evidence.totals || {};
  const state = evidence.state;
  const reasons = [evidence.reason, ...(evidence.reasons || [])].filter(Boolean).join(" ");
  if (state === EvidenceState.CONFLICTED || Number(totals.CONFLICTED || 0) > 0) {
    return "QUARANTINE_AND_RECONCILE";
  }
  if (state === EvidenceState.STALE || Number(totals.STALE || 0) > 0) {
    return "REFRESH_PRIMARY_THEN_FALLBACK";
  }
  if (state === EvidenceState.MISSING || Number(totals.MISSING || 0) > 0) {
    if (/ALIAS/i.test(reasons)) return "REPAIR_ALIAS_MAPPING";
    if (/RATE_LIMIT/i.test(reasons)) return "RETRY_ALTERNATE_PROVIDER";
    if (/REGION/i.test(reasons)) return "ROUTE_REGION_COMPATIBLE_PROVIDER";
    if (/PIPELINE_OUTPUT/i.test(reasons)) return "REPLAY_PRODUCING_ENGINE";
    if (/ENRICHMENT_DEFERRED/i.test(reasons)) return "REQUEUE_ENRICHMENT";
    return "TRY_ALTERNATE_SOURCE_OR_DEFER";
  }
  if (state === EvidenceState.DERIVED || Number(totals.DERIVED || 0) > 0) {
    return "SEEK_PRIMARY_OBSERVATION";
  }
  return "NONE";
}

export function buildEvidenceRecoveryPlan(matrix = {}) {
  const priority = {
    QUARANTINE_AND_RECONCILE: 100,
    REPAIR_ALIAS_MAPPING: 90,
    REPLAY_PRODUCING_ENGINE: 85,
    RETRY_ALTERNATE_PROVIDER: 80,
    ROUTE_REGION_COMPATIBLE_PROVIDER: 75,
    REFRESH_PRIMARY_THEN_FALLBACK: 70,
    REQUEUE_ENRICHMENT: 60,
    SEEK_PRIMARY_OBSERVATION: 50,
    TRY_ALTERNATE_SOURCE_OR_DEFER: 40,
  };
  const actions = (matrix.features || [])
    .map((feature) => ({
      ...feature,
      recoveryAction: classifyRecoveryAction(feature),
    }))
    .filter((feature) => feature.recoveryAction !== "NONE")
    .sort((left, right) =>
      (priority[right.recoveryAction] || 0) - (priority[left.recoveryAction] || 0) ||
      String(left.feature).localeCompare(String(right.feature))
    );
  return {
    schemaVersion: 1,
    generatedAt: matrix.generatedAt || new Date().toISOString(),
    actions,
    unresolved: actions.length,
  };
}

export function persistEvidenceRecoveryReports(matrix, plan, options = {}) {
  const reportsDir = options.reportsDir || "reports";
  const coverage = writeAtomicJson(`${reportsDir}/evidence-coverage-matrix.json`, matrix);
  const recovery = writeAtomicJson(`${reportsDir}/evidence-recovery-plan.json`, plan);
  return { coveragePath: coverage.file, recoveryPath: recovery.file };
}
