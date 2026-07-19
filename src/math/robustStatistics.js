import { finiteValues, numberOrNull } from "./numericSafety.js";

export function median(values = []) {
  const sorted = finiteValues(values).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function medianAbsoluteDeviation(values = []) {
  const center = median(values);
  if (center === null) return null;
  return median(finiteValues(values).map((value) => Math.abs(value - center)));
}

export function trimmedMean(values = [], trimPct = 0.1) {
  const sorted = finiteValues(values).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const trim = Math.min(Math.floor(sorted.length / 2), Math.floor(sorted.length * Math.max(0, trimPct)));
  const kept = sorted.slice(trim, sorted.length - trim);
  if (!kept.length) return null;
  return kept.reduce((sum, value) => sum + value, 0) / kept.length;
}

export function winsorized(values = [], lowerPct = 0.01, upperPct = 0.99) {
  const sorted = finiteValues(values).sort((a, b) => a - b);
  if (!sorted.length) return { values: [], lower: null, upper: null, changed: 0 };
  const lowerIndex = Math.max(0, Math.min(sorted.length - 1, Math.floor(sorted.length * lowerPct)));
  const upperIndex = Math.max(0, Math.min(sorted.length - 1, Math.ceil(sorted.length * upperPct) - 1));
  const lower = sorted[lowerIndex];
  const upper = sorted[upperIndex];
  let changed = 0;
  const output = finiteValues(values).map((value) => {
    const bounded = Math.max(lower, Math.min(upper, value));
    if (bounded !== value) changed += 1;
    return bounded;
  });
  return { values: output, lower, upper, changed };
}

export function winsorizedMean(values = [], lowerPct = 0.01, upperPct = 0.99) {
  const result = winsorized(values, lowerPct, upperPct);
  if (!result.values.length) return null;
  return result.values.reduce((sum, value) => sum + value, 0) / result.values.length;
}

export function interquartileRange(values = []) {
  const sorted = finiteValues(values).sort((a, b) => a - b);
  if (sorted.length < 4) return null;
  const q1 = median(sorted.slice(0, Math.floor(sorted.length / 2)));
  const q3 = median(sorted.slice(Math.ceil(sorted.length / 2)));
  return q1 === null || q3 === null ? null : q3 - q1;
}

export function robustZScore(value, population = [], options = {}) {
  const x = numberOrNull(value);
  if (x === null) return null;
  const sample = finiteValues(population);
  const minSample = Number(options.minSample || 3);
  if (sample.length < minSample) return null;
  const center = median(sample);
  const mad = medianAbsoluteDeviation(sample);
  if (center === null || mad === null || mad === 0) return null;
  return (0.6745 * (x - center)) / mad;
}

export function ewma(values = [], options = {}) {
  const sample = finiteValues(values);
  if (!sample.length) return null;
  const halfLife = Math.max(1e-9, Number(options.halfLife || 1));
  const alpha = options.alpha !== undefined
    ? Number(options.alpha)
    : 1 - Math.exp(-Math.log(2) / halfLife);
  return sample.reduce((mean, value, index) => (index === 0 ? value : alpha * value + (1 - alpha) * mean), sample[0]);
}

export function ewVariance(values = [], options = {}) {
  const sample = finiteValues(values);
  if (sample.length < 2) return null;
  const mean = ewma(sample, options);
  if (mean === null) return null;
  const squared = sample.map((value) => (value - mean) ** 2);
  return ewma(squared, options);
}

export function percentileRank(value, population = []) {
  const x = numberOrNull(value);
  const sample = finiteValues(population);
  if (x === null || !sample.length) return null;
  const belowOrEqual = sample.filter((item) => item <= x).length;
  return (belowOrEqual / sample.length) * 100;
}
