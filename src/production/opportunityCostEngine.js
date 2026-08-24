import { clamp, finite } from "./productionMath.js";

export function calculateOpportunityCost(candidate = {}, context = {}) {
  const ev = finite(context.captureableExpectedValuePct ?? candidate.captureableExpectedValuePct) ?? 0;
  const hours = Math.max(0.25, finite(context.expectedDurationHours ?? candidate.expectedDurationHours) ?? 24);
  const liquidityConsumedPct = Math.max(0.1, finite(context.liquidityConsumedPct ?? candidate.liquidityConsumedPct) ?? 1);
  const researchCost = Math.max(0.1, finite(context.researchCostUnits ?? candidate.researchCostUnits) ?? 1);
  const risk = Math.max(1, finite(context.riskScore ?? candidate.riskScore) ?? 50);

  return {
    identityKey: candidate.identityKey || null,
    expectedValuePct: ev,
    edgePerHour: ev / hours,
    edgePerLiquidityPctConsumed: ev / liquidityConsumedPct,
    edgePerResearchCostUnit: ev / researchCost,
    edgePerRiskPoint: ev / risk,
    capitalEfficiencyScore: clamp(50 + (ev / hours) * 8 + (ev / risk) * 20, 0, 100),
    automaticTrading: false,
  };
}
