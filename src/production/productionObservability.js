import { finite } from "./productionMath.js";

function stateWeight(state) {
  const value = String(state || "UNKNOWN").toUpperCase();
  if (/FAIL|BLOCK|OPEN|BROKEN|DECAY/.test(value)) return 0;
  if (/DEGRADED|WEAK|INSUFFICIENT|UNKNOWN/.test(value)) return 0.5;
  return 1;
}

export function buildProductionObservability(inputs = {}, options = {}) {
  const components = Object.entries(inputs).map(([name, report]) => ({
    name,
    state: report?.state || report?.status || "UNKNOWN",
    healthWeight: stateWeight(report?.state || report?.status),
  }));

  const score = components.length
    ? components.reduce((sum, row) => sum + row.healthWeight, 0) / components.length
    : 0;

  const providerFailures = finite(inputs.providerHealth?.failureRate) ?? null;
  const unknownRate = finite(inputs.dataHealth?.unknownRate) ?? null;

  return {
    schemaVersion: 1,
    generatedAt: options.now || new Date().toISOString(),
    healthScore: Number((score * 100).toFixed(2)),
    state: score >= 0.9 ? "HEALTHY" : score >= 0.65 ? "DEGRADED" : "BLOCKED",
    components,
    providerFailureRate: providerFailures,
    unknownRate,
    alerts: [
      ...(providerFailures !== null && providerFailures > 0.2 ? ["PROVIDER_FAILURE_RATE_HIGH"] : []),
      ...(unknownRate !== null && unknownRate > 0.25 ? ["DATA_UNKNOWN_RATE_HIGH"] : []),
      ...components.filter((row) => row.healthWeight === 0).map((row) => `COMPONENT_BLOCKED:${row.name}`),
    ],
  };
}
