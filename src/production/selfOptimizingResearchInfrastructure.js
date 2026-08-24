import { clamp, finite } from "./productionMath.js";

export function optimizeResearchInfrastructure(metrics = [], options = {}) {
  const rows = (Array.isArray(metrics) ? metrics : []).map((row) => {
    const cost = Math.max(0.01, finite(row.computeCostUnits ?? row.costUnits ?? row.calls) ?? 1);
    const decisionsChanged = Math.max(0, finite(row.decisionsChanged) ?? 0);
    const winnersRescued = Math.max(0, finite(row.winnersRescued) ?? 0);
    const falsePositivesRemoved = Math.max(0, finite(row.falsePositivesRemoved) ?? 0);
    const forwardImprovementPct = finite(row.forwardImprovementPct) ?? 0;
    const value =
      decisionsChanged * 0.5 +
      winnersRescued * 4 +
      falsePositivesRemoved * 2 +
      Math.max(0, forwardImprovementPct) * 10;
    const valuePerCost = value / cost;
    const score = clamp(Math.tanh(valuePerCost / 5) * 100, 0, 100);
    return {
      component: row.component || row.provider || row.engine || "UNKNOWN",
      costUnits: cost,
      valueUnits: value,
      valuePerCost,
      researchEconomicsScore: score,
      recommendation: score >= 70 ? "EXPAND"
        : score >= 40 ? "MAINTAIN"
        : "REDUCE",
      automaticDisable: false,
    };
  }).sort((a, b) => b.researchEconomicsScore - a.researchEconomicsScore);

  return {
    schemaVersion: 1,
    generatedAt: options.now || new Date().toISOString(),
    components: rows,
    policy: {
      recommendationsOnly: true,
      neverDisableSafetyOrIdentityChecks: true,
      automaticTrading: false,
    },
  };
}
