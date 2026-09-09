import { num } from "../edge/edgeMath.js";

export const VALID_EVIDENCE_STATES = Object.freeze([
  "OBSERVED",
  "DERIVED",
  "STALE",
  "MISSING",
  "CONFLICTED",
  "NOT_APPLICABLE",
]);

const VALID_STATES = new Set(VALID_EVIDENCE_STATES);

export function normalizeEvidenceState(value = "") {
  const state = String(value || "").trim().toUpperCase();
  return VALID_STATES.has(state) ? state : "MISSING";
}

export function safeEvidenceValue(value, evidenceState, options = {}) {
  const state = normalizeEvidenceState(evidenceState);
  const eligibleStates = new Set(
    options.eligibleStates || (options.allowDerived === true ? ["OBSERVED", "DERIVED"] : ["OBSERVED"])
  );
  return eligibleStates.has(state) ? num(value) : null;
}

export function featureEligibility(rows = [], feature, options = {}) {
  const minObserved = Number(options.minObserved ?? 30);
  const minCoveragePct = Number(options.minCoveragePct ?? 60);
  const minDistinctValues = Number(options.minDistinctValues ?? 3);
  const eligibleStates = options.eligibleStates || ["OBSERVED"];
  const applicable = rows.filter(
    (row) => normalizeEvidenceState(row?.evidence?.[feature]?.state) !== "NOT_APPLICABLE"
  );
  const observed = applicable.filter(
    (row) => normalizeEvidenceState(row?.evidence?.[feature]?.state) === "OBSERVED"
  );
  const derived = applicable.filter(
    (row) => normalizeEvidenceState(row?.evidence?.[feature]?.state) === "DERIVED"
  );
  const usable = applicable
    .map((row) => safeEvidenceValue(
      row?.evidence?.[feature]?.value,
      row?.evidence?.[feature]?.state,
      { eligibleStates }
    ))
    .filter((value) => value !== null);
  const distinct = new Set(usable.map((value) => Number(value.toFixed(8)))).size;
  const observedCoveragePct = applicable.length ? (observed.length / applicable.length) * 100 : 0;
  const usableCoveragePct = applicable.length ? (usable.length / applicable.length) * 100 : 0;

  let status = "ELIGIBLE";
  let reason = null;
  if (usable.length < minObserved) {
    status = "INSUFFICIENT_ELIGIBLE_SAMPLE";
    reason = `eligible=${usable.length} < minObserved=${minObserved}`;
  } else if (usableCoveragePct < minCoveragePct) {
    status = "LOW_EVIDENCE_COVERAGE";
    reason = `coverage=${usableCoveragePct.toFixed(2)}% < minCoveragePct=${minCoveragePct}%`;
  } else if (distinct < minDistinctValues) {
    status = "NON_IDENTIFIABLE";
    reason = `distinctEligibleValues=${distinct} < minDistinctValues=${minDistinctValues}`;
  }

  return {
    feature,
    status,
    reason,
    eligibleStates,
    applicable: applicable.length,
    observed: observed.length,
    derived: derived.length,
    eligible: usable.length,
    observedCoveragePct,
    usableCoveragePct,
    distinctObservedValues: distinct,
  };
}
