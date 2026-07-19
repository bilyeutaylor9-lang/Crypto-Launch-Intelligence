import { finiteValues, numberOrNull } from "./numericSafety.js";

export function brierScore(predictions = [], outcomes = []) {
  const pairs = predictions
    .map((prediction, index) => [numberOrNull(prediction), numberOrNull(outcomes[index])])
    .filter(([prediction, outcome]) => prediction !== null && outcome !== null);
  if (!pairs.length) return null;
  return pairs.reduce((sum, [prediction, outcome]) => sum + (prediction - outcome) ** 2, 0) / pairs.length;
}

export function betaBinomialPosterior(successes = 0, failures = 0, options = {}) {
  const priorAlpha = Number(options.priorAlpha || 1);
  const priorBeta = Number(options.priorBeta || 1);
  const alpha = priorAlpha + Math.max(0, Number(successes) || 0);
  const beta = priorBeta + Math.max(0, Number(failures) || 0);
  const mean = alpha / (alpha + beta);
  const variance = (alpha * beta) / (((alpha + beta) ** 2) * (alpha + beta + 1));
  const std = Math.sqrt(variance);
  return {
    posteriorAlpha: alpha,
    posteriorBeta: beta,
    posteriorMean: mean,
    credibleIntervalLower: Math.max(0, mean - 1.96 * std),
    credibleIntervalUpper: Math.min(1, mean + 1.96 * std),
    sampleSize: Math.max(0, Number(successes) || 0) + Math.max(0, Number(failures) || 0),
    priorUsed: `Beta(${priorAlpha},${priorBeta})`,
  };
}

export function calibrationBins(predictions = [], outcomes = [], options = {}) {
  const binCount = Math.max(1, Number(options.binCount || 10));
  const rows = Array.from({ length: binCount }, (_, index) => ({
    bin: index,
    lower: index / binCount,
    upper: (index + 1) / binCount,
    count: 0,
    averagePrediction: null,
    accuracy: null,
    absoluteError: null,
  }));
  const pairs = predictions
    .map((prediction, index) => [numberOrNull(prediction), numberOrNull(outcomes[index])])
    .filter(([prediction, outcome]) => prediction !== null && outcome !== null && prediction >= 0 && prediction <= 1 && (outcome === 0 || outcome === 1));

  for (const [prediction, outcome] of pairs) {
    const index = Math.min(binCount - 1, Math.floor(prediction * binCount));
    const row = rows[index];
    row.count += 1;
    row._predictions = [...(row._predictions || []), prediction];
    row._outcomes = [...(row._outcomes || []), outcome];
  }

  return rows.map((row) => {
    const predictionsInBin = finiteValues(row._predictions || []);
    const outcomesInBin = finiteValues(row._outcomes || []);
    const averagePrediction = predictionsInBin.length
      ? predictionsInBin.reduce((sum, value) => sum + value, 0) / predictionsInBin.length
      : null;
    const accuracy = outcomesInBin.length
      ? outcomesInBin.reduce((sum, value) => sum + value, 0) / outcomesInBin.length
      : null;
    return {
      bin: row.bin,
      lower: row.lower,
      upper: row.upper,
      count: row.count,
      averagePrediction,
      accuracy,
      absoluteError: averagePrediction === null || accuracy === null ? null : Math.abs(accuracy - averagePrediction),
    };
  });
}
