import { forwardReturnPct, maximumAdverseExcursionPct, maximumFavorableExcursionPct, maximumDrawdownPct } from "../math/timeSeriesMetrics.js";
import { numberOrNull } from "../math/numericSafety.js";

export const OUTCOME_HORIZONS = Object.freeze({
  "1h": 60 * 60 * 1000,
  "6h": 6 * 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "3d": 3 * 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
  "90d": 90 * 24 * 60 * 60 * 1000,
});

function projectId(project = {}) {
  return project.canonicalProjectId || project.projectId || project.capitalFlowObservation?.canonicalProjectId || null;
}

function timestamp(value) {
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? parsed : null;
}

function nearestObservation(observations = [], targetTime, toleranceMs) {
  const candidates = observations
    .map((observation) => ({
      observation,
      delta: Math.abs((timestamp(observation.observedAt) ?? Infinity) - targetTime),
    }))
    .filter((item) => item.delta <= toleranceMs)
    .sort((a, b) => a.delta - b.delta);
  return candidates[0]?.observation || null;
}

export function evaluatePredictionHorizons(prediction = {}, observations = [], options = {}) {
  const predictionTime = timestamp(prediction.predictedAt || prediction.observedAt || prediction.timestamp);
  const id = projectId(prediction);
  const entryPrice = numberOrNull(prediction.entryPriceUsd ?? prediction.priceUsd);
  if (!predictionTime || !id || entryPrice === null || entryPrice <= 0) {
    return {
      predictionId: prediction.predictionId || null,
      canonicalProjectId: id,
      status: "INSUFFICIENT_ENTRY_DATA",
      horizons: {},
    };
  }
  const sorted = observations
    .filter((observation) => observation.canonicalProjectId === id)
    .filter((observation) => (timestamp(observation.observedAt) ?? 0) >= predictionTime)
    .sort((a, b) => timestamp(a.observedAt) - timestamp(b.observedAt));
  const tolerancePct = Number(options.tolerancePct || 0.2);
  const horizons = {};

  for (const [label, durationMs] of Object.entries(OUTCOME_HORIZONS)) {
    const targetTime = predictionTime + durationMs;
    const nearest = nearestObservation(sorted, targetTime, durationMs * tolerancePct);
    const path = sorted.filter((observation) => {
      const time = timestamp(observation.observedAt);
      return time !== null && time <= targetTime;
    });
    const prices = path.map((observation) => observation.priceUsd).filter((value) => numberOrNull(value) !== null);
    horizons[label] = {
      targetTimestamp: new Date(targetTime).toISOString(),
      observedTimestamp: nearest?.observedAt || null,
      status: nearest ? "RESOLVED" : "MISSING_OUTCOME_OBSERVATION",
      forwardReturnPct: nearest ? forwardReturnPct(entryPrice, nearest.priceUsd) : null,
      maximumFavorableExcursionPct: prices.length ? maximumFavorableExcursionPct(entryPrice, prices) : null,
      maximumAdverseExcursionPct: prices.length ? maximumAdverseExcursionPct(entryPrice, prices) : null,
      maximumDrawdownPct: prices.length ? maximumDrawdownPct(prices) : null,
      liquiditySurvival: nearest ? numberOrNull(nearest.dexLiquidityUsd) !== null && nearest.dexLiquidityUsd > 0 : null,
      routeSurvival: nearest ? nearest.executionStatus ? nearest.executionStatus === "VERIFIED" : null : null,
      rugEvent: nearest?.rugEvent === true,
      honeypotEvent: nearest?.honeypotEvent === true,
      poolDisappearance: nearest ? nearest.poolDisappearance === true : null,
      delistingEvent: nearest ? nearest.delistingEvent === true : null,
    };
  }

  return {
    predictionId: prediction.predictionId || `${id}:${prediction.predictedAt || predictionTime}`,
    canonicalProjectId: id,
    status: "EVALUATED",
    predictionTimestamp: new Date(predictionTime).toISOString(),
    horizons,
  };
}

export function summarizeExactOutcomeLab(predictions = [], observations = [], options = {}) {
  const evaluations = (Array.isArray(predictions) ? predictions : []).map((prediction) =>
    evaluatePredictionHorizons(prediction, observations, options)
  );
  return {
    generatedAt: new Date().toISOString(),
    status: evaluations.length ? "OK" : "INSUFFICIENT_SAMPLE",
    predictionsEvaluated: evaluations.length,
    sampleState:
      evaluations.length < 20 ? "INSUFFICIENT_SAMPLE" :
      evaluations.length < 50 ? "PRELIMINARY" :
      evaluations.length < 200 ? "TRACKED" :
      "STATISTICALLY_SUPPORTED",
    horizons: Object.keys(OUTCOME_HORIZONS),
    resolvedByHorizon: Object.fromEntries(
      Object.keys(OUTCOME_HORIZONS).map((horizon) => [
        horizon,
        evaluations.filter((evaluation) => evaluation.horizons?.[horizon]?.status === "RESOLVED").length,
      ])
    ),
    evaluations,
  };
}
