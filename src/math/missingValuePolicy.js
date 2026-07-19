export const MissingValueStatus = Object.freeze({
  MISSING: "MISSING",
  OBSERVED: "OBSERVED",
  STALE: "STALE",
  INVALID: "INVALID",
  PROVIDER_UNAVAILABLE: "PROVIDER_UNAVAILABLE",
});

export function missingValuePenalty(coveragePct = 0, minimumRequiredCoveragePct = 70) {
  const coverage = Number(coveragePct);
  const minimum = Number(minimumRequiredCoveragePct);
  if (!Number.isFinite(coverage) || !Number.isFinite(minimum) || minimum <= 0) return 0;
  return Math.max(0, Math.min(1, coverage / minimum));
}

export function missingComponent(field = "", sourceHints = []) {
  return {
    field,
    status: MissingValueStatus.MISSING,
    sourceHints,
    policy: "Missing evidence lowers coverage and confidence; it is never converted to a confirmed zero.",
  };
}
