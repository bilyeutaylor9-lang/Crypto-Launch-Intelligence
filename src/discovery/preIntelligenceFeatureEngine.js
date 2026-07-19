import {
  discoveryLaneForProject,
  evidenceFamiliesForProject,
  independentEvidenceScore,
} from "./discoveryCoverageEngine.js";

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

function avg(values = []) {
  const finite = values.filter((value) => Number.isFinite(Number(value)));
  if (!finite.length) return 0;
  return finite.reduce((sum, value) => sum + Number(value), 0) / finite.length;
}

function boundedPct(value = 0, fullScale = 100) {
  return clamp((num(value) / fullScale) * 100);
}

function positiveDelta(...values) {
  return Math.max(0, ...values.map(num));
}

function negativePressure(...values) {
  return Math.max(0, ...values.map((value) => -num(value)));
}

function marketCapGroup(project = {}) {
  const cap = num(project.marketCap || project.circulatingMarketCap || project.circulatingMarketCapUsd);
  if (!cap) return "unknown";
  if (cap < 5_000_000) return "micro";
  if (cap < 50_000_000) return "small";
  if (cap < 250_000_000) return "mid";
  return "large";
}

function sourceCount(project = {}) {
  const sources = new Set(
    [
      project.source,
      ...(Array.isArray(project.sources) ? project.sources : []),
      ...(Array.isArray(project.discoverySources) ? project.discoverySources : []),
    ]
      .map((source) => String(source || "").toLowerCase())
      .filter(Boolean)
  );
  return sources.size;
}

function confidenceFromCompleteness(fields = []) {
  const known = fields.filter((value) => value !== undefined && value !== null && value !== "").length;
  return Math.round(clamp((known / Math.max(1, fields.length)) * 100));
}

function hardDangerReasons(project = {}) {
  const reasons = [];
  if (project.honeypot === true || project.honeypotDetected === true || num(project.honeypotRiskScore) >= 85) {
    reasons.push("confirmed honeypot danger");
  }
  if (project.identityConflict === true || num(project.identityRiskScore) >= 85) {
    reasons.push("confirmed identity conflict");
  }
  if (project.contractMismatch === true || project.chainContractMismatch === true) {
    reasons.push("chain/contract mismatch");
  }
  if (num(project.liquidityManipulationRisk) >= 90 || num(project.washTradingRiskScore) >= 90) {
    reasons.push("severe manipulation evidence");
  }
  return reasons;
}

export function calculatePreIntelligenceFeatures(project = {}, context = {}) {
  const evidenceFamilies = evidenceFamiliesForProject(project);
  const lane = project.discoveryLane || discoveryLaneForProject(project);
  const sources = sourceCount(project);
  const discoveryRank = num(context.discoveryRank || project.discoveryRank || project.discoveryIndex);
  const priorRank = num(project.previousDiscoveryRank || project.previousRank || project.priorRank);
  const rankImprovement = priorRank > 0 && discoveryRank > 0 ? Math.max(0, priorRank - discoveryRank) : 0;

  const priceAcceleration = avg([
    boundedPct(project.priceChange1h, 35),
    boundedPct(project.priceChange24h, 80),
    boundedPct(project.priceChange7d, 180),
    boundedPct(project.priceAccelerationPct || project.priceAccelerationScore, 100),
  ]);
  const volumeAcceleration = avg([
    boundedPct(project.volumeChange1hPct, 80),
    boundedPct(project.volumeChange24hPct || project.volumeGrowth24hPct, 150),
    boundedPct(project.volumeChange7dPct || project.volumeGrowth7dPct, 250),
    boundedPct(project.volumeAccelerationScore, 100),
  ]);
  const liquidityAcceleration = avg([
    boundedPct(project.liquidityChange24hPct || project.liquidityGrowth24hPct, 80),
    boundedPct(project.liquidityChange7dPct || project.liquidityGrowth7dPct, 150),
    boundedPct(project.liquidityExpansionScore, 100),
  ]);
  const buyerAcceleration = avg([
    boundedPct(project.buyersChange24hPct || project.buyerGrowth24hPct, 100),
    boundedPct(project.buyPressureScore, 100),
    boundedPct(project.organicBuyerScore, 100),
    boundedPct(project.buyerRetentionScore, 100),
  ]);
  const developerAcceleration = avg([
    boundedPct(project.developerActivityScore, 100),
    boundedPct(project.githubProScore, 100),
    boundedPct(project.githubCommits30d, 80),
    boundedPct(project.githubStars30d, 120),
  ]);
  const holderAcceleration = avg([
    boundedPct(project.holderGrowthScore, 100),
    boundedPct(project.holdersChange24hPct, 60),
    boundedPct(project.holdersChange7dPct, 120),
  ]);
  const relativeStrengthChange = avg([
    boundedPct(project.relativeStrengthScore, 100),
    boundedPct(project.marketRankImprovementScore, 100),
    boundedPct(rankImprovement, 500),
  ]);
  const acceleration = Math.round(
    clamp(
      priceAcceleration * 0.13 +
        volumeAcceleration * 0.17 +
        liquidityAcceleration * 0.2 +
        buyerAcceleration * 0.2 +
        holderAcceleration * 0.1 +
        developerAcceleration * 0.12 +
        relativeStrengthChange * 0.08
    )
  );

  const overextension = Math.max(
    boundedPct(project.priceChange24h, 90),
    boundedPct(project.priceChange7d, 220),
    boundedPct(project.priceChange30d, 420)
  );
  const liquidityBeforePrice = clamp(50 + liquidityAcceleration * 0.45 - priceAcceleration * 0.25);
  const buyersBeforeRetail = clamp(50 + buyerAcceleration * 0.35 - boundedPct(project.socialAccelerationScore || project.xSocialScore, 100) * 0.25);
  const compression = avg([
    boundedPct(project.momentumCompressionScore, 100),
    boundedPct(project.preBreakoutMomentumScore, 100),
    boundedPct(project.volatilityCompressionScore, 100),
  ]);
  const timing = Math.round(
    clamp(
      (100 - overextension) * 0.32 +
        liquidityBeforePrice * 0.24 +
        buyersBeforeRetail * 0.2 +
        compression * 0.16 +
        boundedPct(project.liveCatalystRadarScore || project.catalystCalendarScore, 100) * 0.08
    )
  );

  const socialAttention = avg([
    boundedPct(project.socialAccelerationScore, 100),
    boundedPct(project.xSocialScore, 100),
    boundedPct(project.externalSignalScore, 100),
    boundedPct(project.narrativeHeatScore, 100),
  ]);
  const adoptionOrBuilderStrength = avg([
    developerAcceleration,
    boundedPct(project.ecosystemAdoptionScore || project.productUsageScore, 100),
    boundedPct(project.ecosystemIntegrationScore, 100),
    liquidityAcceleration,
    buyerAcceleration,
  ]);
  const attentionGap = Math.round(clamp(50 + adoptionOrBuilderStrength * 0.45 - socialAttention * 0.32 - priceAcceleration * 0.18));

  const liquidityQuality = avg([
    boundedPct(project.liquidityUsd || project.liquidity, 500_000),
    boundedPct(project.activeLiquidityTruthScore, 100),
    100 - boundedPct(project.liquidityControlRisk, 100),
  ]);
  const catalystDeveloperChange = avg([
    boundedPct(project.liveCatalystRadarScore, 100),
    boundedPct(project.catalystCalendarScore, 100),
    boundedPct(project.roadmapCatalystProfitScore, 100),
    developerAcceleration,
  ]);
  const identityAndEvidence = avg([
    boundedPct(project.identityResolutionScore || project.projectIdentityScore, 100),
    boundedPct(project.sourceTruthScore, 100),
    boundedPct(independentEvidenceScore(project), 100),
    boundedPct(sources, 5),
    boundedPct(evidenceFamilies.length, 5),
  ]);
  const lifecycleNovelty = ["new-pool", "prelaunch"].includes(lane) ? 72 : lane === "established-emerging" ? 58 : 50;
  const riskSignals = [
    project.trapRiskScore,
    project.riskScore,
    project.honeypotRiskScore,
    project.identityRiskScore,
    project.walletClusterRiskScore,
    project.washTradingRiskScore,
    project.liquidityManipulationRisk,
    project.sellPressureScore,
    project.tokenUnlockRiskScore,
    project.vestingPressureScore,
    negativePressure(project.liquidityChange24hPct, project.liquidityChange7dPct) * 0.4,
  ];
  const riskPenalty = Math.round(Math.min(35, Math.max(0, ...riskSignals.map((value) => clamp(value) * 0.35))));
  const hardDangers = hardDangerReasons(project);
  const completeness = confidenceFromCompleteness([
    project.priceChange24h,
    project.volume24h,
    project.liquidityUsd,
    project.buyers24h,
    project.holders,
    project.source,
    project.chain,
    project.symbol,
    project.address || project.contractAddress || project.tokenAddress || project.pairAddress,
  ]);
  const missingEvidence = [];
  if (!sources) missingEvidence.push("source family");
  if (!project.address && !project.contractAddress && !project.tokenAddress && !project.pairAddress) {
    missingEvidence.push("contract or pool identity");
  }
  if (!num(project.liquidityUsd || project.liquidity)) missingEvidence.push("liquidity");
  if (!num(project.volume24h || project.volume)) missingEvidence.push("volume");

  const score = Math.round(
    clamp(
      acceleration * 0.25 +
        timing * 0.15 +
        attentionGap * 0.15 +
        liquidityQuality * 0.12 +
        catalystDeveloperChange * 0.1 +
        identityAndEvidence * 0.08 +
        relativeStrengthChange * 0.08 +
        lifecycleNovelty * 0.04 +
        boundedPct(rankImprovement, 500) * 0.03 -
        riskPenalty
    )
  );

  return {
    preIntelligenceOpportunityScore: hardDangers.length ? 0 : score,
    preIntelligenceConfidence: Math.round(clamp(completeness * 0.65 + identityAndEvidence * 0.35)),
    preIntelligenceComponents: {
      acceleration,
      timing,
      attentionGap,
      liquidityBuyerQuality: Math.round(clamp(avg([liquidityQuality, buyerAcceleration]))),
      catalystDeveloperChange: Math.round(clamp(catalystDeveloperChange)),
      identityEvidenceStrength: Math.round(clamp(identityAndEvidence)),
      relativeMarketStrength: Math.round(clamp(relativeStrengthChange)),
      lifecycleNovelty: Math.round(clamp(lifecycleNovelty)),
      historicalRankImprovement: Math.round(clamp(boundedPct(rankImprovement, 500))),
    },
    preIntelligenceRiskPenalty: riskPenalty,
    preIntelligenceHardBlockers: hardDangers,
    preIntelligenceMissingEvidence: missingEvidence,
    preIntelligenceFeatureConfidence: completeness,
    preIntelligenceLane: lane,
    preIntelligenceMarketCapGroup: marketCapGroup(project),
    preIntelligenceEvidenceFamilies: evidenceFamilies,
    preIntelligenceSourceCount: sources,
    preIntelligenceSignals: {
      priceAcceleration: Math.round(clamp(priceAcceleration)),
      volumeAcceleration: Math.round(clamp(volumeAcceleration)),
      liquidityAcceleration: Math.round(clamp(liquidityAcceleration)),
      buyerAcceleration: Math.round(clamp(buyerAcceleration)),
      holderAcceleration: Math.round(clamp(holderAcceleration)),
      developerAcceleration: Math.round(clamp(developerAcceleration)),
      attentionGap,
      catalystDeveloperChange: Math.round(clamp(catalystDeveloperChange)),
      rankImprovement: Math.round(clamp(boundedPct(rankImprovement, 500))),
      overextension: Math.round(clamp(overextension)),
    },
    preIntelligenceContext: {
      lane,
      marketCapGroup: marketCapGroup(project),
      narrative: project.narrative || project.primaryNarrative || project.category || "unknown",
      chain: project.chain || project.network || "unknown",
      source: project.source || "unknown",
    },
  };
}

export function analyzePreIntelligenceFeaturesBatch(projects = [], options = {}) {
  return (Array.isArray(projects) ? projects : []).map((project, index) => ({
    ...project,
    ...calculatePreIntelligenceFeatures(project, {
      ...options,
      discoveryRank: index + 1,
    }),
  }));
}

export function hasConfirmedPreIntelligenceHardDanger(project = {}) {
  return (project.preIntelligenceHardBlockers || hardDangerReasons(project)).length > 0;
}
