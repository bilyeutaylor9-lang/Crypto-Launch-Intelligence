import { assembleOpportunityEvidence } from "../opportunity/opportunityEvidenceAssembler.js";

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

function weighted(items = []) {
  const active = items.filter((item) => Number.isFinite(Number(item.score)));
  const totalWeight = active.reduce((sum, item) => sum + item.weight, 0);
  if (!totalWeight) return 0;
  return Math.round(
    clamp(active.reduce((sum, item) => sum + clamp(item.score) * item.weight, 0) / totalWeight)
  );
}

function maxScore(project = {}, keys = []) {
  return Math.max(...keys.map((key) => clamp(project[key])));
}

function localAIConsensusScore(project = {}) {
  if (project.localAIPromotionBlocked === true) return 15;
  const status = project.localAIStatus || project.localAIExecutionStatus || "";
  const verdict = String(project.localAIVerdict || project.aiDecision || "").toUpperCase();
  const confidence = clamp(project.localAIConfidence);
  const coverage = clamp(project.localAICoverage);
  const evidenceQuality = Math.min(confidence || 50, coverage || 50);

  if (!["COMPLETE", "PARTIAL"].includes(status)) return 50;
  if (verdict.includes("RISK") || verdict.includes("REJECT") || verdict.includes("BLOCK")) {
    return Math.round(clamp(35 - evidenceQuality * 0.18));
  }
  if (verdict.includes("EVIDENCE") || verdict.includes("SUPPORTED") || verdict.includes("BULL")) {
    return Math.round(clamp(58 + evidenceQuality * 0.32));
  }
  return 50;
}

function horizonScores(project = {}) {
  const immediate = weighted([
    { score: project.accelerationScore, weight: 16 },
    { score: project.velocityScore, weight: 13 },
    { score: project.buyPressureScore, weight: 13 },
    { score: project.volumeChange24hPct, weight: 8 },
    { score: project.liquidityExpansionScore, weight: 12 },
    { score: project.activeLiquidityTruthScore, weight: 10 },
    { score: project.earlyBreakoutScore, weight: 12 },
    { score: project.liveCatalystRadarScore, weight: 10 },
    { score: 100 - clamp(project.lateChaseRiskScore), weight: 6 },
  ]);

  const medium = weighted([
    { score: project.liveCatalystRadarScore, weight: 15 },
    { score: project.catalystCalendarScore, weight: 14 },
    { score: project.roadmapCatalystProfitScore, weight: 12 },
    { score: project.smartWalletArrivalScore, weight: 12 },
    { score: project.smartMoneyAccumulationScore, weight: 10 },
    { score: project.liquidityExpansionScore, weight: 11 },
    { score: project.narrativeForecastScore, weight: 10 },
    { score: project.sourceTruthScore, weight: 8 },
    { score: project.trustScore, weight: 8 },
  ]);

  const long = weighted([
    { score: project.roadmapCatalystProfitScore, weight: 14 },
    { score: project.developerActivityScore, weight: 13 },
    { score: project.githubProScore, weight: 12 },
    { score: project.ecosystemIntegrationScore, weight: 11 },
    { score: project.communityGrowthScore, weight: 8 },
    { score: project.tokenomicsScore, weight: 10 },
    { score: project.productUsageScore ?? project.ecosystemAdoptionScore, weight: 10 },
    { score: project.attentionGapScore, weight: 12 },
    { score: project.trustScore, weight: 10 },
  ]);

  return {
    "24_72_HOURS": immediate,
    "7_14_DAYS": medium,
    "30_90_DAYS": long,
  };
}

function recommendedHorizon(scores = {}) {
  const [label] = Object.entries(scores).sort((a, b) => num(b[1]) - num(a[1]))[0] || ["RESEARCH_ONLY"];
  return label;
}

function hardBlocks(project = {}) {
  return [
    ...(Array.isArray(project.opportunityHardBlockers) ? project.opportunityHardBlockers : []),
    ...(Array.isArray(project.hardBlockers) ? project.hardBlockers : []),
    ...(Array.isArray(project.finalBlockingReasons) ? project.finalBlockingReasons : []),
    ...(Array.isArray(project.sniperBlockingReasons) ? project.sniperBlockingReasons : []),
  ].filter(Boolean);
}

function rankDrivers(project = {}, marketOpportunityRank = 0) {
  return [
    ["Opportunity", project.progressiveOpportunityScore ?? project.opportunityScoreV2],
    ["Timing", project.opportunityTimingScore],
    ["Trust", project.trustScore],
    ["Attention Gap", project.attentionGapScore],
    ["Local AI Consensus", project.localAIConsensusScore],
    ["Execution", project.executionScore],
    ["Evidence Coverage", project.opportunityEvidenceCoverage],
  ]
    .filter(([, score]) => num(score) > 0)
    .sort((a, b) => num(b[1]) - num(a[1]))
    .slice(0, 6)
    .map(([label, score]) => `${label}: ${Math.round(clamp(score))}`)
    .concat([`Market Opportunity Rank: ${Math.round(clamp(marketOpportunityRank))}`]);
}

function opportunityLane(project = {}, rank = 0, horizons = {}) {
  if (hardBlocks(project).length) return "BLOCKED";
  if (rank >= 80 && clamp(project.trustScore) >= 60) return "BEST_OPPORTUNITY_NOW";
  if (horizons["24_72_HOURS"] >= 78) return "IMMEDIATE_BREAKOUT";
  if (horizons["7_14_DAYS"] >= 75) return "CATALYST_WINDOW";
  if (horizons["30_90_DAYS"] >= 75) return "POSITIONAL_BUILD";
  if (clamp(project.attentionGapScore) >= 72) return "UNDER_THE_RADAR";
  if (clamp(project.progressiveOpportunityScore) >= 70) return "EARLY_RESEARCH";
  return "MONITOR";
}

export function calculateMarketOpportunityRank(project = {}) {
  const localAIConsensus = localAIConsensusScore(project);
  const base = weighted([
    { score: project.progressiveOpportunityScore ?? project.opportunityScoreV2 ?? project.pipelineScore, weight: 30 },
    { score: project.opportunityTimingScore, weight: 25 },
    { score: project.trustScore ?? project.progressiveTrustScore, weight: 20 },
    { score: project.attentionGapScore, weight: 15 },
    { score: localAIConsensus, weight: 10 },
  ]);
  const hardBlockPenalty = hardBlocks(project).length ? 100 : 0;
  const severeRiskPenalty =
    Math.max(
      clamp(project.contractRiskScore),
      clamp(project.honeypotRiskScore),
      clamp(project.washTradingRiskScore),
      clamp(project.liquidityManipulationRisk)
    ) >= 70
      ? 18
      : 0;

  return {
    score: Math.round(clamp(base - hardBlockPenalty - severeRiskPenalty)),
    localAIConsensus,
  };
}

export function classifyMarketOpportunityRank(score = 0) {
  if (score >= 85) return "clear market leader candidate";
  if (score >= 78) return "top-five opportunity";
  if (score >= 68) return "strong research lead";
  if (score >= 55) return "developing watchlist";
  return "not a current leader";
}

export function analyzeMarketOpportunityRank(project = {}) {
  const rank = calculateMarketOpportunityRank(project);
  const timeHorizonScores = horizonScores(project);
  const marketOpportunityRank = rank.score;
  const lane = opportunityLane(project, marketOpportunityRank, timeHorizonScores);
  const enriched = {
    ...project,
    localAIConsensusScore: rank.localAIConsensus,
    marketOpportunityRank,
    marketOpportunityRankScore: marketOpportunityRank,
    marketOpportunityRankLevel: classifyMarketOpportunityRank(marketOpportunityRank),
    marketOpportunityRankDrivers: rankDrivers(
      { ...project, localAIConsensusScore: rank.localAIConsensus },
      marketOpportunityRank
    ),
    timeHorizonScores,
    recommendedHorizon: recommendedHorizon(timeHorizonScores),
    opportunityLane: lane,
    marketOpportunityEvidenceFamilies: maxScore(project, [
      "sniperEvidenceConfidence",
      "opportunityEvidenceCoverage",
      "sourceTruthScore",
    ]),
  };

  return {
    ...enriched,
    opportunityEvidenceRecord: assembleOpportunityEvidence(enriched),
    evidence: [
      ...(Array.isArray(project.evidence) ? project.evidence : []),
      {
        engine: "Market Opportunity Rank Engine",
        signal: "Unified market opportunity rank",
        confidence: Math.min(marketOpportunityRank / 100, 1),
        impact: marketOpportunityRank >= 68 ? "Positive" : "Neutral",
      },
    ],
  };
}

export function analyzeMarketOpportunityRankBatch(projects = []) {
  return (Array.isArray(projects) ? projects : [])
    .map(analyzeMarketOpportunityRank)
    .sort((a, b) => b.marketOpportunityRank - a.marketOpportunityRank);
}
