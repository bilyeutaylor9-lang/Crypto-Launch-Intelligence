import { finiteValues } from "./numericSafety.js";

function seededRandom(seed = 1) {
  let state = Math.max(1, Math.floor(Number(seed) || 1)) % 2147483647;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

export function bootstrapConfidenceInterval(values = [], options = {}) {
  const sample = finiteValues(values);
  const minSample = Number(options.minSample || 5);
  if (sample.length < minSample) {
    return {
      status: "INSUFFICIENT_SAMPLE",
      sampleSize: sample.length,
      lowerConfidenceBound: null,
      upperConfidenceBound: null,
      pointEstimate: null,
    };
  }
  const resamples = Math.max(10, Number(options.resamples || 500));
  const random = seededRandom(options.seed || 1);
  const estimates = [];

  for (let i = 0; i < resamples; i += 1) {
    let total = 0;
    for (let j = 0; j < sample.length; j += 1) {
      total += sample[Math.floor(random() * sample.length)];
    }
    estimates.push(total / sample.length);
  }

  estimates.sort((a, b) => a - b);
  const lowerIndex = Math.max(0, Math.floor(estimates.length * 0.025));
  const upperIndex = Math.min(estimates.length - 1, Math.ceil(estimates.length * 0.975) - 1);
  const pointEstimate = sample.reduce((sum, value) => sum + value, 0) / sample.length;
  return {
    status: "TRACKED",
    sampleSize: sample.length,
    pointEstimate,
    lowerConfidenceBound: estimates[lowerIndex],
    upperConfidenceBound: estimates[upperIndex],
    standardError: Math.sqrt(estimates.reduce((sum, value) => sum + (value - pointEstimate) ** 2, 0) / Math.max(1, estimates.length - 1)),
    resamples,
    randomSeed: options.seed || 1,
  };
}
