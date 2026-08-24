import { clamp, finite } from "./productionMath.js";

function eventProbability(base, hours, rate) {
  const b = clamp(base, 0, 1);
  const h = Math.max(0, Number(hours) || 0);
  return clamp(1 - Math.exp(-Math.max(0.0001, rate * b) * h), 0, 0.995);
}

function medianTime(probability, rate) {
  if (probability <= 0 || rate <= 0) return null;
  return Math.log(2) / Math.max(0.0001, rate * probability);
}

export function buildTimeToEventForecast(candidate = {}, context = {}, options = {}) {
  const transition = context.transition || candidate.transition || {};
  const pIgnite = finite(transition.probabilities?.IGNITING) ?? 0.2;
  const pExpand = finite(transition.probabilities?.EXPANSION) ?? 0.15;
  const pFailure = finite(transition.probabilities?.FAILURE) ?? 0.15;
  const executionEv = finite(context.executionAwareEv?.captureableExpectedValuePct ?? candidate.captureableExpectedValuePct) ?? 0;
  const remaining = finite(context.opportunityHalfLife?.remainingAsymmetryScore) ?? 50;

  const quality = clamp((pIgnite + pExpand) * 0.65 + clamp(executionEv / 50, 0, 1) * 0.2 + remaining / 100 * 0.15, 0, 1);

  const definitions = [
    ["plus25", 0.065, quality],
    ["plus50", 0.035, quality * 0.75],
    ["twoX", 0.014, quality * 0.48],
    ["failure20", 0.045, clamp(pFailure + (1 - quality) * 0.25, 0, 1)],
  ];

  const horizons = options.horizonsHours || [1, 3, 6, 12, 24, 72, 168];
  const events = Object.fromEntries(definitions.map(([name, rate, base]) => [
    name,
    {
      probabilityByHorizon: Object.fromEntries(horizons.map((h) => [String(h), eventProbability(base, h, rate)])),
      medianTimeHours: medianTime(base, rate),
    },
  ]));

  return {
    schemaVersion: 1,
    identityKey: candidate.identityKey || null,
    generatedAt: options.now || new Date().toISOString(),
    events,
    methodology: "research-only parametric hazard approximation pending forward calibration",
    calibrated: false,
    automaticTrading: false,
  };
}
