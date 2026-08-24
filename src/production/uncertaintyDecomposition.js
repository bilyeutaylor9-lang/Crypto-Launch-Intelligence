import { clamp, finite } from "./productionMath.js";

export function decomposeUncertainty(candidate = {}, context = {}) {
  const components = {
    source: clamp(finite(context.sourceUncertaintyPct ?? candidate.sourceUncertaintyPct) ?? 15, 0, 100),
    identity: clamp(finite(context.identityUncertaintyPct ?? candidate.identityUncertaintyPct) ?? 0, 0, 100),
    walletAttribution: clamp(finite(context.walletAttributionUncertaintyPct ?? candidate.walletAttributionUncertaintyPct) ?? 20, 0, 100),
    regime: clamp(finite(context.regimeUncertaintyPct ?? candidate.regimeUncertaintyPct) ?? 20, 0, 100),
    modelDisagreement: clamp(finite(context.modelDisagreementPct ?? candidate.modelDisagreementPct) ?? 25, 0, 100),
    execution: clamp(finite(context.executionUncertaintyPct ?? candidate.executionUncertaintyPct) ?? 15, 0, 100),
    outcomeSparsity: clamp(finite(context.outcomeSparsityPct ?? candidate.outcomeSparsityPct) ?? 30, 0, 100),
  };
  const weights = {
    source: 0.12, identity: 0.18, walletAttribution: 0.16, regime: 0.14,
    modelDisagreement: 0.16, execution: 0.10, outcomeSparsity: 0.14,
  };
  const totalUncertaintyPct = Object.entries(components)
    .reduce((sum, [key, value]) => sum + value * weights[key], 0);

  const ranked = Object.entries(components)
    .map(([source, value]) => ({ source, uncertaintyPct: value, weightedContribution: value * weights[source] }))
    .sort((a, b) => b.weightedContribution - a.weightedContribution);

  return {
    schemaVersion: 1,
    identityKey: candidate.identityKey || null,
    totalUncertaintyPct,
    components,
    primaryUncertainty: ranked[0] || null,
    ranked,
    automaticTrading: false,
  };
}
