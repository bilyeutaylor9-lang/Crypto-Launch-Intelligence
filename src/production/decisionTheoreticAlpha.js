import { clamp, finite } from "./productionMath.js";

export function evaluateDecisionUtility(candidate = {}, context = {}, options = {}) {
  const p25 = finite(context.p25 ?? candidate.p25) ?? 0.35;
  const p50 = finite(context.p50 ?? candidate.p50) ?? 0.20;
  const p2x = finite(context.p2x ?? candidate.p2x) ?? 0.08;
  const pLoss20 = finite(context.pLoss20 ?? candidate.pLoss20) ?? 0.20;
  const captureableEv = finite(context.captureableExpectedValuePct ?? candidate.captureableExpectedValuePct) ?? 0;
  const medianTimeHours = Math.max(0.5, finite(context.medianTimeHours ?? candidate.medianTimeHours) ?? 24);
  const uncertaintyPct = clamp(finite(context.uncertaintyPct ?? candidate.uncertaintyPct) ?? 50, 0, 100);
  const researchValue = clamp(finite(context.researchValueScore ?? candidate.researchValueScore) ?? 50, 0, 100);

  const outcomeUtility =
    p25 * 0.8 + p50 * 1.1 + p2x * 1.8 - pLoss20 * 1.35;
  const economicUtility = Math.tanh(captureableEv / 30);
  const timeEfficiency = clamp(12 / medianTimeHours, 0, 1);
  const certainty = 1 - uncertaintyPct / 100;

  const utilityScore = clamp(
    50 +
    outcomeUtility * 22 +
    economicUtility * 18 +
    timeEfficiency * 8 +
    certainty * 8 +
    (researchValue - 50) * 0.08,
    0, 100
  );

  return {
    schemaVersion: 1,
    identityKey: candidate.identityKey || null,
    utilityScore,
    components: {
      outcomeUtility,
      economicUtility,
      timeEfficiency,
      certainty,
      researchValue,
    },
    decisionTier: utilityScore >= 75 ? "PRIORITY_RESEARCH"
      : utilityScore >= 60 ? "RESEARCH"
      : utilityScore >= 45 ? "WATCH"
      : "DEPRIORITIZE",
    automaticTrading: false,
  };
}
