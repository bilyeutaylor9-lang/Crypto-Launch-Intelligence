import { finite } from "./productionMath.js";

const DEFAULT_WEIGHTS = Object.freeze({ regime: 0.12, wallet: 0.18, capital: 0.18, genome: 0.20, narrative: 0.10, execution: 0.12, signal: 0.10 });

function value(candidate, key) {
  const map = {
    regime: candidate.regimeCompatibilityScore ?? candidate.marketRegimeScore,
    wallet: candidate.walletEntityScore ?? candidate.walletPreparationScore,
    capital: candidate.capitalMigrationForecastScore ?? candidate.capitalMigrationScore,
    genome: candidate.multiscaleGenomeScore ?? candidate.ignitionGenome?.genomeResearchScore,
    narrative: candidate.narrativePropagationScore,
    execution: candidate.executionAwareEV?.routeQuality === undefined ? candidate.executionQualityScore : candidate.executionAwareEV.routeQuality * 100,
    signal: candidate.adaptiveResearchScore ?? candidate.combinedResearchScore,
  };
  return finite(map[key]);
}

export function attributeAlpha(candidate = {}, options = {}) {
  const weights = { ...DEFAULT_WEIGHTS, ...(options.weights || {}) };
  const parts = [];
  let totalWeighted = 0;
  for (const [key, weight] of Object.entries(weights)) {
    const raw = value(candidate, key);
    if (raw === null) continue;
    const contribution = raw * Number(weight);
    totalWeighted += contribution;
    parts.push({ component: key, rawScore: raw, weight: Number(weight), weightedScore: contribution });
  }
  const realized = finite(options.realizedReturnPct ?? candidate.realizedReturnPct);
  const denominator = parts.reduce((sum, row) => sum + Math.max(0, row.weightedScore), 0) || 1;
  const attributed = parts.map((row) => ({
    ...row,
    modelContributionPct: Number((Math.max(0, row.weightedScore) / denominator * 100).toFixed(2)),
    attributedRealizedReturnPct: realized === null ? null : Number((realized * Math.max(0, row.weightedScore) / denominator).toFixed(2)),
  })).sort((a,b)=>b.modelContributionPct-a.modelContributionPct);
  return {
    modelScore: Number(totalWeighted.toFixed(2)),
    realizedReturnPct: realized,
    components: attributed,
    unexplainedRealizedReturnPct: realized === null ? null : Number((realized - attributed.reduce((sum,row)=>sum+(row.attributedRealizedReturnPct||0),0)).toFixed(6)),
    policy: { attributionIsModelBasedNotCausal: true, automaticTrading: false },
  };
}
