import { clamp, finite } from "./productionMath.js";

export function informationGainScore(candidate = {}, options = {}) {
  const score = finite(candidate.combinedResearchScore ?? candidate.researchPriorityScore) ?? 0;
  const confidence = clamp((finite(candidate.confidencePct ?? candidate.ignitionGenome?.confidencePct) ?? 0) / 100);
  const coverage = clamp((finite(candidate.evidenceCoveragePct ?? candidate.research?.diagnostic?.coverage) ?? 0) > 1
    ? (finite(candidate.evidenceCoveragePct) ?? 0) / 100
    : finite(candidate.research?.diagnostic?.coverage) ?? 0);
  const p50 = clamp((finite(candidate.ignitionGenome?.probability50Pct) ?? 0) / 100);
  const failure = clamp((finite(candidate.ignitionGenome?.failureProbabilityPct) ?? 0) / 100);
  const decisionBoundary = Number(options.decisionBoundary || 65);
  const boundaryProximity = 1 - clamp(Math.abs(score - decisionBoundary) / 35);
  const uncertainty = 1 - confidence;
  const missingness = 1 - coverage;
  const outcomeAmbiguity = 1 - Math.abs(p50 - failure);
  const researchCost = Math.max(0.1, finite(candidate.estimatedResearchCostUnits) ?? 1);

  const gain = clamp(
    0.32 * uncertainty +
    0.25 * missingness +
    0.23 * boundaryProximity +
    0.20 * outcomeAmbiguity
  ) / researchCost;

  return {
    informationGainScore: Number((gain * 100).toFixed(2)),
    uncertainty: Number(uncertainty.toFixed(4)),
    missingness: Number(missingness.toFixed(4)),
    boundaryProximity: Number(boundaryProximity.toFixed(4)),
    outcomeAmbiguity: Number(outcomeAmbiguity.toFixed(4)),
    estimatedResearchCostUnits: researchCost,
  };
}

export function routeResearchBudget(candidates = [], options = {}) {
  const budget = Math.max(1, Number(options.budgetUnits || 100));
  const scored = (Array.isArray(candidates) ? candidates : [])
    .map((candidate) => ({ ...candidate, informationGain: informationGainScore(candidate, options) }))
    .sort((a, b) => b.informationGain.informationGainScore - a.informationGain.informationGainScore);

  const selected = [];
  let spent = 0;
  for (const row of scored) {
    const cost = row.informationGain.estimatedResearchCostUnits;
    if (spent + cost > budget) continue;
    selected.push(row);
    spent += cost;
  }
  return { budgetUnits: budget, spentUnits: spent, selected, ranked: scored };
}
