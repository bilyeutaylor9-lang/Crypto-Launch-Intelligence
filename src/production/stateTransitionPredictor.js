import { clamp, finite } from "./productionMath.js";

const STATES = ["COMPRESSED", "IGNITING", "EXPANSION", "EXHAUSTION", "FAILURE"];

function softmax(scores = {}) {
  const entries = Object.entries(scores);
  const max = Math.max(...entries.map(([, v]) => v));
  const exp = entries.map(([k, v]) => [k, Math.exp(v - max)]);
  const total = exp.reduce((sum, [, v]) => sum + v, 0) || 1;
  return Object.fromEntries(exp.map(([k, v]) => [k, v / total]));
}

export function predictStateTransition(candidate = {}, context = {}, options = {}) {
  const micro = context.microstructure || candidate.microstructure || {};
  const migration = context.capitalMigration || candidate.capitalMigration || {};
  const halfLife = context.opportunityHalfLife || candidate.opportunityHalfLife || {};
  const regime = context.regime || candidate.regime || {};
  const current = String(candidate.state || candidate.ignitionState || "COMPRESSED").toUpperCase();

  const absorption = finite(micro.absorptionScore) ?? 50;
  const depletion = finite(micro.sellerDepletionScore) ?? 50;
  const toxicity = finite(micro.toxicityScore) ?? 35;
  const migrationScore = finite(migration.score ?? migration.capitalMigrationScore) ?? 50;
  const remaining = finite(halfLife.remainingAsymmetryScore ?? halfLife.remainingEdgePct) ?? 50;
  const regimeFit = finite(regime.compatibilityScore ?? regime.score) ?? 50;

  const logits = {
    COMPRESSED: 0.4 + (50 - absorption) / 80,
    IGNITING: 0.4 + absorption / 45 + depletion / 60 + migrationScore / 80 + regimeFit / 100,
    EXPANSION: 0.1 + absorption / 70 + migrationScore / 65 + remaining / 120,
    EXHAUSTION: 0.1 + (100 - remaining) / 45 + toxicity / 100,
    FAILURE: 0.1 + toxicity / 45 + (50 - regimeFit) / 75 + (50 - migrationScore) / 80,
  };
  if (current === "IGNITING") logits.EXPANSION += 0.45;
  if (current === "EXPANSION") logits.EXHAUSTION += 0.35;
  if (current === "EXHAUSTION") logits.FAILURE += 0.25;

  const probabilities = softmax(logits);
  const nextState = Object.entries(probabilities).sort((a, b) => b[1] - a[1])[0][0];
  const confidencePct = clamp(Math.max(...Object.values(probabilities)) * 100, 0, 100);

  return {
    schemaVersion: 1,
    identityKey: candidate.identityKey || micro.identityKey || null,
    currentState: STATES.includes(current) ? current : "COMPRESSED",
    horizonHours: Number(options.horizonHours || 6),
    probabilities,
    nextState,
    confidencePct,
    calibrated: false,
    researchOnly: true,
    automaticTrading: false,
  };
}
