export const DATA_STATES = Object.freeze({
  VERIFIED: "VERIFIED",
  ESTIMATED: "ESTIMATED",
  PARTIAL: "PARTIAL",
  UNKNOWN: "UNKNOWN",
  MISSING: "MISSING",
  STALE: "STALE",
  FAILED: "FAILED",
});

const STATE_WEIGHTS = {
  [DATA_STATES.VERIFIED]: 1,
  [DATA_STATES.ESTIMATED]: 0.65,
  [DATA_STATES.PARTIAL]: 0.5,
  [DATA_STATES.UNKNOWN]: 0,
  [DATA_STATES.MISSING]: 0,
  [DATA_STATES.STALE]: 0.25,
  [DATA_STATES.FAILED]: 0,
};

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

function normalizeState(status = "") {
  const key = String(status || "").trim().toUpperCase();
  if (key === "VERIFIED_ABSENT") return DATA_STATES.VERIFIED;
  if (key === "NO_DATA") return DATA_STATES.MISSING;
  if (key === "SUCCESS") return DATA_STATES.VERIFIED;
  if (key === "PARTIALLY_VERIFIED") return DATA_STATES.PARTIAL;
  if (key === "LOW" || key === "HIGH") return DATA_STATES.PARTIAL;
  return DATA_STATES[key] || DATA_STATES.UNKNOWN;
}

export function metricRecord({
  value = null,
  source = "unknown",
  timestamp = null,
  confidence = 0,
  freshness = "UNKNOWN",
  provenance = "unspecified",
  status,
  label = "",
} = {}) {
  const inferredStatus =
    status ||
    (value === undefined || value === null || value === "" ? DATA_STATES.MISSING : DATA_STATES.VERIFIED);

  return {
    label,
    value: value ?? null,
    source,
    timestamp: timestamp || null,
    confidence: clamp(confidence),
    freshness,
    provenance,
    status: normalizeState(inferredStatus),
  };
}

export function numericMetric({
  value = null,
  source = "unknown",
  timestamp = null,
  confidence = 0,
  freshness = "UNKNOWN",
  provenance = "unspecified",
  status,
  label = "",
} = {}) {
  const numericValue = value === undefined || value === null || value === "" ? null : Number(value);
  return metricRecord({
    value: Number.isFinite(numericValue) ? numericValue : null,
    source,
    timestamp,
    confidence,
    freshness,
    provenance,
    status:
      status ||
      (Number.isFinite(numericValue)
        ? DATA_STATES.VERIFIED
        : DATA_STATES.MISSING),
    label,
  });
}

export function calculateEvidenceCoverage(signals = []) {
  const normalized = (Array.isArray(signals) ? signals : [])
    .filter(Boolean)
    .map((signal) => ({
      ...signal,
      status: normalizeState(signal.status),
    }));
  const totalSignals = normalized.length;
  const byStatus = (status) => normalized.filter((signal) => signal.status === status);
  const verifiedSignals = byStatus(DATA_STATES.VERIFIED);
  const estimatedSignals = byStatus(DATA_STATES.ESTIMATED);
  const partialSignals = byStatus(DATA_STATES.PARTIAL);
  const missingSignals = [
    ...byStatus(DATA_STATES.UNKNOWN),
    ...byStatus(DATA_STATES.MISSING),
  ];
  const staleSignals = byStatus(DATA_STATES.STALE);
  const failedSignals = byStatus(DATA_STATES.FAILED);
  const weightedCoverage = totalSignals
    ? normalized.reduce((sum, signal) => sum + (STATE_WEIGHTS[signal.status] || 0), 0) / totalSignals
    : 0;
  const evidenceCoveragePercent = Math.round(clamp(weightedCoverage * 100));
  const confidencePenalty = Math.round(
    clamp(
      missingSignals.length * 7 +
        staleSignals.length * 4 +
        failedSignals.length * 10 +
        estimatedSignals.length * 2 +
        partialSignals.length * 3,
      0,
      80
    )
  );

  return {
    evidenceCoveragePercent,
    verifiedSignals: verifiedSignals.map((signal) => signal.label || signal.name || signal.source || "verified"),
    estimatedSignals: estimatedSignals.map((signal) => signal.label || signal.name || signal.source || "estimated"),
    partialSignals: partialSignals.map((signal) => signal.label || signal.name || signal.source || "partial"),
    missingSignals: missingSignals.map((signal) => signal.label || signal.name || signal.source || "missing"),
    staleSignals: staleSignals.map((signal) => signal.label || signal.name || signal.source || "stale"),
    failedSignals: failedSignals.map((signal) => signal.label || signal.name || signal.source || "failed"),
    confidencePenalty,
    totalSignals,
    rawSignals: normalized,
  };
}

export function confidenceFromCoverage(baseConfidence = 0, coverage = {}) {
  return Math.round(clamp(num(baseConfidence) - num(coverage.confidencePenalty)));
}
