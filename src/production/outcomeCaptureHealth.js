import { timestamp } from "./productionMath.js";
import { writeAtomicJson } from "./atomicArtifactStore.js";

export function buildOutcomeCaptureHealth(episodes = [], outcomes = [], options = {}) {
  const nowMs = timestamp(options.now || new Date().toISOString());
  const horizonHours = Number(options.horizonHours || 24);
  const expected = (Array.isArray(episodes) ? episodes : []).filter((episode) => {
    const at = timestamp(episode.signalObservedAt || episode.frozenAt);
    return at !== null && nowMs !== null && nowMs >= at + horizonHours * 3_600_000;
  });
  const resolved = new Set(
    (Array.isArray(outcomes) ? outcomes : [])
      .filter((row) => Number(row.horizonHours) === horizonHours)
      .map((row) => row.episodeId)
      .filter(Boolean)
  );
  const captured = expected.filter((episode) => resolved.has(episode.episodeId)).length;
  const captureRate = expected.length ? captured / expected.length : null;

  const report = {
    schemaVersion: 1,
    generatedAt: options.now || new Date().toISOString(),
    horizonHours,
    matureExpected: expected.length,
    captured,
    missing: expected.length - captured,
    captureRate,
    state:
      captureRate === null
        ? "NO_MATURE_EXPECTATIONS"
        : captureRate >= Number(options.minimumCaptureRate || 0.95)
          ? "PASS"
          : "FAIL",
  };
  if (options.writeReport !== false) {
    writeAtomicJson(
      options.reportFile || "reports/outcome-capture-health.json",
      report
    );
  }
  return report;
}
