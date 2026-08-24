import { clamp, finite, mean } from "./productionMath.js";

export function buildCalibrationReport(predictions = [], options = {}) {
  const bins = Math.max(5, Number(options.bins || 10));
  const normalized = (Array.isArray(predictions) ? predictions : [])
    .map((row) => ({
      probability: clamp((finite(row.probability ?? row.predictedProbability ?? row.p) ?? 0)),
      actual: row.actual === true || row.outcome === true || Number(row.actual) === 1 ? 1 : 0,
    }))
    .filter((row) => Number.isFinite(row.probability));

  const bucketRows = Array.from({ length: bins }, (_, index) => {
    const low = index / bins;
    const high = (index + 1) / bins;
    const rows = normalized.filter((row) =>
      index === bins - 1
        ? row.probability >= low && row.probability <= high
        : row.probability >= low && row.probability < high
    );
    const predicted = mean(rows.map((r) => r.probability));
    const observed = mean(rows.map((r) => r.actual));
    return {
      low,
      high,
      count: rows.length,
      predicted,
      observed,
      absoluteError: predicted === null || observed === null ? null : Math.abs(predicted - observed),
    };
  });

  const brier = normalized.length
    ? mean(normalized.map((row) => (row.probability - row.actual) ** 2))
    : null;
  const ece = normalized.length
    ? bucketRows.reduce((sum, row) =>
        sum + (row.count / normalized.length) * (row.absoluteError || 0), 0)
    : null;

  return {
    schemaVersion: 1,
    samples: normalized.length,
    brierScore: brier,
    expectedCalibrationError: ece,
    bins: bucketRows,
    state:
      normalized.length < Number(options.minimumSamples || 100)
        ? "INSUFFICIENT_CALIBRATION_SAMPLE"
        : (ece ?? 1) <= Number(options.maximumEce || 0.06)
          ? "CALIBRATED"
          : "CALIBRATION_DEGRADED",
  };
}

export function calibrateByBin(probability, report = {}) {
  const p = clamp(probability);
  const bin = (report.bins || []).find((row) =>
    p >= Number(row.low) &&
    (p < Number(row.high) || Number(row.high) === 1)
  );
  if (!bin || !bin.count || bin.observed === null) return p;
  const credibility = Math.min(1, bin.count / 50);
  return clamp(p * (1 - credibility) + bin.observed * credibility);
}
