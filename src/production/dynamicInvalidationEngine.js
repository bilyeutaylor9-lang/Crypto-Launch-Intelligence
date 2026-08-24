import { finite } from "./productionMath.js";

export function buildInvalidationPolicy(candidate = {}, context = {}, options = {}) {
  const baseline = {
    qualifiedEntityFlowUsd: finite(context.qualifiedEntityFlowUsd ?? candidate.qualifiedEntityFlowUsd) ?? 0,
    liquidityUsd: finite(candidate.liquidityUsd) ?? null,
    sellerInventoryUsd: finite(context.sellerInventoryUsd ?? candidate.sellerInventoryUsd) ?? null,
    genomeConvergenceScore: finite(context.genomeConvergenceScore ?? candidate.genomeConvergenceScore) ?? null,
    regimeState: context.regimeState ?? candidate.regimeState ?? null,
  };
  return {
    schemaVersion: 1,
    identityKey: candidate.identityKey || null,
    createdAt: options.now || new Date().toISOString(),
    baseline,
    rules: [
      { id: "ENTITY_FLOW_REVERSAL", field: "qualifiedEntityFlowUsd", op: "lt", threshold: baseline.qualifiedEntityFlowUsd - Number(options.entityFlowToleranceUsd || 55_000) },
      ...(baseline.liquidityUsd !== null ? [{ id: "LIQUIDITY_DROP", field: "liquidityUsd", op: "lt", threshold: baseline.liquidityUsd * 0.85 }] : []),
      ...(baseline.sellerInventoryUsd !== null ? [{ id: "SELLER_INVENTORY_REFILL", field: "sellerInventoryUsd", op: "gt", threshold: baseline.sellerInventoryUsd * 1.30 }] : []),
      { id: "GENOME_CONVERGENCE_BREAK", field: "genomeConvergenceScore", op: "lt", threshold: Number(options.minimumGenomeConvergence || 50) },
      { id: "REGIME_RISK_OFF", field: "regimeState", op: "in", values: ["RISK_OFF", "RISK_OFF_STRESS", "STRESS"] },
    ],
    automaticTrading: false,
  };
}

function compare(value, rule) {
  if (rule.op === "lt") return finite(value) !== null && finite(value) < rule.threshold;
  if (rule.op === "gt") return finite(value) !== null && finite(value) > rule.threshold;
  if (rule.op === "in") return rule.values.includes(String(value || "").toUpperCase());
  return false;
}

export function evaluateInvalidation(policy = {}, live = {}, options = {}) {
  const triggered = (policy.rules || []).filter((rule) => compare(live[rule.field], rule));
  return {
    schemaVersion: 1,
    identityKey: policy.identityKey || null,
    evaluatedAt: options.now || new Date().toISOString(),
    thesisState: triggered.length ? "INVALIDATED_OR_DEGRADED" : "ACTIVE",
    triggered,
    severity: triggered.length >= 2 ? "HIGH" : triggered.length === 1 ? "MEDIUM" : "NONE",
    automaticTrading: false,
  };
}
