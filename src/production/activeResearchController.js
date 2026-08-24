import { clamp, finite, identityKey } from "./productionMath.js";

const ACTIONS = Object.freeze([
  { key: "IDENTITY", fields: ["tokenAddress", "poolAddress"], action: "RECOVER_EXACT_IDENTITY", cost: 1.0, impact: 1.0 },
  { key: "SAFETY", fields: ["safetyProofStatus"], action: "VERIFY_CONTRACT_AND_SELLABILITY", cost: 1.5, impact: 1.0 },
  { key: "WALLET", fields: ["walletEntityScore", "walletPreparationScore"], action: "EXPAND_WALLET_ENTITY_ATTRIBUTION", cost: 2.0, impact: 0.8 },
  { key: "CAPITAL", fields: ["capitalMigrationForecastScore", "capitalMigrationScore"], action: "REFRESH_CAPITAL_MIGRATION_EVIDENCE", cost: 1.5, impact: 0.85 },
  { key: "EXECUTION", fields: ["estimatedRoundTripSlippagePct", "routeTruthStatus"], action: "REFRESH_EXECUTION_ROUTE_AND_DEPTH", cost: 1.4, impact: 0.95 },
  { key: "NARRATIVE", fields: ["narrativePropagationScore"], action: "VERIFY_UPSTREAM_CATALYST_GRAPH", cost: 1.8, impact: 0.65 },
  { key: "GENOME", fields: ["multiscaleGenomeScore"], action: "COLLECT_NEXT_TEMPORAL_GENOME_OBSERVATION", cost: 0.8, impact: 0.65 },
]);

function missing(candidate, fields) {
  return fields.every((field) => candidate[field] === null || candidate[field] === undefined || candidate[field] === "");
}

export function nextBestResearchAction(candidate = {}, options = {}) {
  const confidence = clamp((finite(candidate.confidencePct ?? candidate.expertEnsemble?.confidence * 100) ?? 0) / 100);
  const score = finite(candidate.captureableExpectedValuePct ?? candidate.combinedResearchScore ?? candidate.portfolioResearchScore) ?? 50;
  const boundary = Number(options.decisionBoundary || 65);
  const boundaryProximity = 1 - clamp(Math.abs(score - boundary) / 45);
  const actions = ACTIONS.map((definition) => {
    const isMissing = missing(candidate, definition.fields);
    const uncertainty = isMissing ? 1 : 1 - confidence;
    const value = clamp((uncertainty * 0.45 + boundaryProximity * 0.35 + definition.impact * 0.20) / definition.cost);
    return {
      evidenceFamily: definition.key,
      action: definition.action,
      missing: isMissing,
      estimatedInformationValue: Number((value * 100).toFixed(2)),
      costUnits: definition.cost,
      expectedDecisionImpact: definition.impact,
    };
  }).sort((a,b)=>b.estimatedInformationValue-a.estimatedInformationValue);
  return { identityKey: identityKey(candidate), nextAction: actions[0] || null, rankedActions: actions, policy: { researchOnly: true, automaticExecution: false } };
}

export function buildActiveResearchQueue(candidates = [], options = {}) {
  const budget = Math.max(1, Number(options.budgetUnits || 50));
  const ranked = (Array.isArray(candidates) ? candidates : []).map((candidate) => ({ candidate, plan: nextBestResearchAction(candidate, options) })).filter((row)=>row.plan.nextAction).sort((a,b)=>b.plan.nextAction.estimatedInformationValue-a.plan.nextAction.estimatedInformationValue);
  const selected=[]; let spent=0;
  for (const row of ranked) {
    const cost=row.plan.nextAction.costUnits;
    if (spent+cost>budget) continue;
    selected.push({ identityKey: identityKey(row.candidate), symbol: row.candidate.symbol || null, ...row.plan.nextAction }); spent+=cost;
  }
  return { budgetUnits: budget, spentUnits: spent, selected, totalCandidates: ranked.length };
}
