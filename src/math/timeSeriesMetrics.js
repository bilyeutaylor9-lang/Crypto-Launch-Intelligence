import { finiteValues, numberOrNull, percentRatio, safeDivide } from "./numericSafety.js";

export function logReturn(previousPrice, currentPrice) {
  const previous = numberOrNull(previousPrice);
  const current = numberOrNull(currentPrice);
  if (previous === null || current === null || previous <= 0 || current <= 0) return null;
  return Math.log(current / previous);
}

export function forwardReturnPct(entryPrice, futurePrice) {
  const entry = numberOrNull(entryPrice);
  const future = numberOrNull(futurePrice);
  if (entry === null || future === null) return null;
  return percentRatio(future - entry, entry);
}

export function maximumDrawdownPct(values = []) {
  const sample = finiteValues(values).filter((value) => value > 0);
  if (sample.length < 2) return null;
  let peak = sample[0];
  let maxDrawdown = 0;
  for (const value of sample) {
    peak = Math.max(peak, value);
    const drawdown = value / peak - 1;
    maxDrawdown = Math.min(maxDrawdown, drawdown);
  }
  return maxDrawdown * 100;
}

export function maximumFavorableExcursionPct(entryPrice, prices = []) {
  const entry = numberOrNull(entryPrice);
  const sample = finiteValues(prices);
  if (entry === null || entry <= 0 || !sample.length) return null;
  return ((Math.max(...sample) - entry) / entry) * 100;
}

export function maximumAdverseExcursionPct(entryPrice, prices = []) {
  const entry = numberOrNull(entryPrice);
  const sample = finiteValues(prices);
  if (entry === null || entry <= 0 || !sample.length) return null;
  return ((Math.min(...sample) - entry) / entry) * 100;
}

export function realizedVolatility(logReturns = []) {
  const sample = finiteValues(logReturns);
  if (sample.length < 2) return null;
  const mean = sample.reduce((sum, value) => sum + value, 0) / sample.length;
  const variance = sample.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (sample.length - 1);
  return Math.sqrt(variance);
}

export function downsideVolatility(returns = []) {
  const downside = finiteValues(returns).filter((value) => value < 0);
  return realizedVolatility(downside);
}

export function elapsedSeconds(previousTimestamp, currentTimestamp) {
  const previous = Date.parse(previousTimestamp || "");
  const current = Date.parse(currentTimestamp || "");
  if (!Number.isFinite(previous) || !Number.isFinite(current) || current <= previous) return null;
  return (current - previous) / 1000;
}

export function velocity(previousValue, currentValue, elapsedSecondsValue) {
  const previous = numberOrNull(previousValue);
  const current = numberOrNull(currentValue);
  const elapsed = numberOrNull(elapsedSecondsValue);
  if (previous === null || current === null || elapsed === null || elapsed <= 0) return null;
  return (current - previous) / elapsed;
}

export function acceleration(previousVelocity, currentVelocity, elapsedSecondsValue) {
  return velocity(previousVelocity, currentVelocity, elapsedSecondsValue);
}

export function ratioMetric(numerator, denominator, options = {}) {
  return safeDivide(numerator, denominator, options);
}

export function priceFlowGap(netFlowGrowthZ, priceReturnZ) {
  const flow = numberOrNull(netFlowGrowthZ);
  const price = numberOrNull(priceReturnZ);
  if (flow === null || price === null) return null;
  return flow - price;
}
