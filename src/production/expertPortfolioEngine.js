import { clamp, finite, mean } from "./productionMath.js";

function expertReliability(expert = {}) {
  const hitRate = clamp(finite(expert.hitRate) ?? 0.5);
  const calibration = clamp(1 - (finite(expert.calibrationError) ?? 0.2));
  const samples = Math.max(0, finite(expert.samples) ?? 0);
  const freshness = clamp(finite(expert.freshness) ?? 1);
  return clamp(
    (0.45 * hitRate + 0.35 * calibration + 0.20 * freshness) *
    Math.min(1, samples / 100)
  );
}

export function combineExpertPredictions(experts = [], options = {}) {
  const active = (Array.isArray(experts) ? experts : [])
    .map((expert) => ({
      ...expert,
      reliability: expertReliability(expert),
      probability: clamp(finite(expert.probability) ?? 0),
    }))
    .filter((expert) => expert.enabled !== false);

  const totalWeight = active.reduce((sum, expert) => sum + expert.reliability, 0);
  const probability = totalWeight
    ? active.reduce((sum, expert) => sum + expert.probability * expert.reliability, 0) / totalWeight
    : mean(active.map((expert) => expert.probability)) ?? 0;

  const disagreement = active.length
    ? Math.sqrt(mean(active.map((expert) => (expert.probability - probability) ** 2)) || 0)
    : 1;

  return {
    probability: Number(probability.toFixed(4)),
    probabilityPct: Number((probability * 100).toFixed(2)),
    expertCount: active.length,
    disagreement: Number(disagreement.toFixed(4)),
    confidence: Number(clamp((1 - disagreement) * Math.min(1, totalWeight / 3)).toFixed(4)),
    experts: active.map((expert) => ({
      name: expert.name,
      probability: expert.probability,
      reliability: Number(expert.reliability.toFixed(4)),
    })),
  };
}
