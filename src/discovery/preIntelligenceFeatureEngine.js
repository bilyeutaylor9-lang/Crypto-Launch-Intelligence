import {
  discoveryLaneForProject,
  evidenceFamiliesForProject,
  hasConcreteMarketEvidence,
  hasExplicitPrelaunchEvidence,
  independentEvidenceScore,
} from "./discoveryCoverageEngine.js";
import { analyzeExplosionReadinessBatch } from "./explosionReadinessEngine.js";
import { isLikelyMemeIdentity } from "../identity/displayIdentityGuard.js";

function present(value) {
  return value !== undefined && value !== null && value !== "";
}

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function numberOrNull(value) {
  if (!present(value)) return null;
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function firstPresent(...values) {
  return values.find(present);
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

function avgKnown(values = []) {
  const finite = values.map(numberOrNull).filter((value) => value !== null);
  if (!finite.length) return null;
  return finite.reduce((sum, value) => sum + value, 0) / finite.length;
}

function boundedPctIfPresent(value, fullScale = 100) {
  const parsed = numberOrNull(value);
  return parsed === null ? null : clamp((parsed / fullScale) * 100);
}

function fixedWeightedScore(entries = []) {
  return clamp(
    entries.reduce(
      (sum, [value, weight]) => sum + (value === null || value === undefined ? 0 : num(value) * weight),
      0
    )
  );
}

function negativePressure(...values) {
  const known = values.map(numberOrNull).filter((value) => value !== null);
  return known.length ? Math.max(0, ...known.map((value) => -value)) : 0;
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
  return new Set(
    [
      project.source,
      ...(Array.isArray(project.sources) ? project.sources : []),
      ...(Array.isArray(project.discoverySources) ? project.discoverySources : []),
    ]
      .map((source) => String(source || "").toLowerCase())
      .filter(Boolean)
  ).size;
}

function confidenceFromCompleteness(fields = []) {
  const known = fields.filter(present).length;
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
  const memeCategory = /(?:^|\b)meme(?:coin|[- ]token| coin)?(?:\b|$)/i.test(
    [project.category, project.narrative, project.primaryNarrative].filter(Boolean).join(" ")
  );
  if (
    process.env.EXCLUDE_MEME_CANDIDATES !== "false" &&
    (isLikelyMemeIdentity(project) || memeCategory)
  ) {
    reasons.push("meme branding excluded by scanner policy");
  }
  return reasons;
}

function knownOrZero(value) {
  return value === null || value === undefined ? 0 : clamp(value);
}

export function calculatePreIntelligenceFeatures(project = {}, context = {}) {
  const evidenceFamilies = evidenceFamiliesForProject(project);
  const lane = project.discoveryLane || discoveryLaneForProject(project);
  const sources = sourceCount(project);
  const discoveryRank = num(context.discoveryRank || project.discoveryRank || project.discoveryIndex);
  const priorRank = num(project.previousDiscoveryRank || project.previousRank || project.priorRank);
  const rankImprovement = priorRank > 0 && discoveryRank > 0 ? Math.max(0, priorRank - discoveryRank) : 0;

  const priceAcceleration = avgKnown([
    boundedPctIfPresent(project.priceChange1h, 35),
    boundedPctIfPresent(project.priceChange24h, 80),
    boundedPctIfPresent(project.priceChange7d, 180),
    boundedPctIfPresent(firstPresent(project.priceAccelerationPct, project.priceAccelerationScore), 100),
  ]);
  const volumeAcceleration = avgKnown([
    boundedPctIfPresent(project.volumeChange1hPct, 80),
    boundedPctIfPresent(firstPresent(project.volumeChange24hPct, project.volumeGrowth24hPct), 150),
    boundedPctIfPresent(firstPresent(project.volumeChange7dPct, project.volumeGrowth7dPct), 250),
    boundedPctIfPresent(project.volumeAccelerationScore, 100),
    project.explosionReadinessComponents?.volumeAcceleration,
  ]);
  const liquidityAcceleration = avgKnown([
    boundedPctIfPresent(firstPresent(project.liquidityChange24hPct, project.liquidityGrowth24hPct), 80),
    boundedPctIfPresent(firstPresent(project.liquidityChange7dPct, project.liquidityGrowth7dPct), 150),
    boundedPctIfPresent(project.liquidityExpansionScore, 100),
    project.explosionReadinessComponents?.liquidityFormation,
  ]);
  const buyerAcceleration = avgKnown([
    boundedPctIfPresent(firstPresent(project.buyersChange24hPct, project.buyerGrowth24hPct), 100),
    boundedPctIfPresent(project.buyPressureScore, 100),
    boundedPctIfPresent(project.organicBuyerScore, 100),
    boundedPctIfPresent(project.buyerRetentionScore, 100),
    project.explosionReadinessComponents?.buyerBreadthAcceleration,
  ]);
  const developerAcceleration = avgKnown([
    boundedPctIfPresent(project.developerActivityScore, 100),
    boundedPctIfPresent(project.githubProScore, 100),
    boundedPctIfPresent(project.githubCommits30d, 80),
    boundedPctIfPresent(project.githubStars30d, 120),
  ]);
  const holderAcceleration = avgKnown([
    boundedPctIfPresent(project.holderGrowthScore, 100),
    boundedPctIfPresent(project.holdersChange24hPct, 60),
    boundedPctIfPresent(project.holdersChange7dPct, 120),
  ]);
  const relativeStrengthChange = avgKnown([
    boundedPctIfPresent(project.relativeStrengthScore, 100),
    boundedPctIfPresent(project.marketRankImprovementScore, 100),
    priorRank > 0 && discoveryRank > 0 ? boundedPctIfPresent(rankImprovement, 500) : null,
  ]);
  const acceleration = Math.round(
    fixedWeightedScore([
      [priceAcceleration, 0.13],
      [volumeAcceleration, 0.17],
      [liquidityAcceleration, 0.2],
      [buyerAcceleration, 0.2],
      [holderAcceleration, 0.1],
      [developerAcceleration, 0.12],
      [relativeStrengthChange, 0.08],
    ])
  );

  const extensionInputs = [
    boundedPctIfPresent(project.priceChange24h, 90),
    boundedPctIfPresent(project.priceChange7d, 220),
    boundedPctIfPresent(project.priceChange30d, 420),
  ].filter((value) => value !== null);
  const overextension = extensionInputs.length ? Math.max(...extensionInputs) : null;
  const liquidityBeforePrice =
    liquidityAcceleration === null || priceAcceleration === null
      ? null
      : clamp(50 + liquidityAcceleration * 0.45 - priceAcceleration * 0.25);
  const socialForTiming = avgKnown([
    boundedPctIfPresent(project.socialAccelerationScore, 100),
    boundedPctIfPresent(project.xSocialScore, 100),
  ]);
  const buyersBeforeRetail =
    buyerAcceleration === null || socialForTiming === null
      ? null
      : clamp(50 + buyerAcceleration * 0.35 - socialForTiming * 0.25);
  const compression = avgKnown([
    boundedPctIfPresent(project.momentumCompressionScore, 100),
    boundedPctIfPresent(project.preBreakoutMomentumScore, 100),
    boundedPctIfPresent(project.volatilityCompressionScore, 100),
  ]);
  const catalystScore = boundedPctIfPresent(
    firstPresent(project.liveCatalystRadarScore, project.catalystCalendarScore),
    100
  );
  const timing = Math.round(
    fixedWeightedScore([
      [overextension === null ? null : 100 - overextension, 0.32],
      [liquidityBeforePrice, 0.24],
      [buyersBeforeRetail, 0.2],
      [compression, 0.16],
      [catalystScore, 0.08],
    ])
  );

  const socialAttention = avgKnown([
    boundedPctIfPresent(project.socialAccelerationScore, 100),
    boundedPctIfPresent(project.xSocialScore, 100),
    boundedPctIfPresent(project.externalSignalScore, 100),
    boundedPctIfPresent(project.narrativeHeatScore, 100),
  ]);
  const adoptionOrBuilderStrength = avgKnown([
    developerAcceleration,
    boundedPctIfPresent(firstPresent(project.ecosystemAdoptionScore, project.productUsageScore), 100),
    boundedPctIfPresent(project.ecosystemIntegrationScore, 100),
    liquidityAcceleration,
    buyerAcceleration,
  ]);
  const attentionGap =
    adoptionOrBuilderStrength === null || socialAttention === null || priceAcceleration === null
      ? null
      : Math.round(clamp(50 + adoptionOrBuilderStrength * 0.45 - socialAttention * 0.32 - priceAcceleration * 0.18));

  const liquidityRisk = boundedPctIfPresent(project.liquidityControlRisk, 100);
  const liquidityQuality = avgKnown([
    boundedPctIfPresent(firstPresent(project.liquidityUsd, project.liquidity), 500_000),
    boundedPctIfPresent(project.activeLiquidityTruthScore, 100),
    liquidityRisk === null ? null : 100 - liquidityRisk,
  ]);
  const catalystDeveloperChange = avgKnown([
    boundedPctIfPresent(project.liveCatalystRadarScore, 100),
    boundedPctIfPresent(project.catalystCalendarScore, 100),
    boundedPctIfPresent(project.roadmapCatalystProfitScore, 100),
    developerAcceleration,
    project.explosionReadinessComponents?.builderCatalystChange,
  ]);
  const identityAndEvidence = avgKnown([
    boundedPctIfPresent(firstPresent(project.identityResolutionScore, project.projectIdentityScore), 100),
    boundedPctIfPresent(project.sourceTruthScore, 100),
    independentEvidenceScore(project),
    sources ? boundedPctIfPresent(sources, 5) : null,
    evidenceFamilies.length ? boundedPctIfPresent(evidenceFamilies.length, 5) : null,
  ]);
  const lifecycleNovelty = lane === "new-pool" ? 72 : lane === "prelaunch" ? 60 : lane === "established-emerging" ? 55 : 0;
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
  ].map(numberOrNull).filter((value) => value !== null);
  const riskPenalty = Math.round(
    Math.min(
      35,
      Math.max(0, ...(riskSignals.map((value) => clamp(value) * 0.35)), negativePressure(project.liquidityChange24hPct, project.liquidityChange7dPct) * 0.4)
    )
  );
  const hardDangers = hardDangerReasons(project);
  const completeness = confidenceFromCompleteness([
    project.priceChange24h,
    firstPresent(project.volume24h, project.volume),
    firstPresent(project.liquidityUsd, project.liquidity),
    firstPresent(project.independentBuyers24h, project.uniqueBuyers24h, project.buyers24h),
    project.holders,
    project.source,
    project.chain,
    project.symbol,
    firstPresent(project.address, project.contractAddress, project.tokenAddress, project.pairAddress),
  ]);
  const missingEvidence = [];
  if (!sources) missingEvidence.push("source family");
  if (!project.address && !project.contractAddress && !project.tokenAddress && !project.pairAddress) {
    missingEvidence.push("contract or pool identity");
  }
  if (!num(project.liquidityUsd || project.liquidity)) missingEvidence.push("liquidity");
  if (!num(project.volume24h || project.volume)) missingEvidence.push("volume");
  missingEvidence.push(...(project.explosionReadinessMissingEvidence || []));

  const rawScore = fixedWeightedScore([
    [project.explosionReadinessScore, 0.28],
    [acceleration, 0.17],
    [timing, 0.13],
    [attentionGap, 0.1],
    [liquidityQuality, 0.1],
    [catalystDeveloperChange, 0.08],
    [identityAndEvidence, 0.06],
    [relativeStrengthChange, 0.04],
    [lifecycleNovelty, 0.04],
  ]);
  const evidenceMultiplier = 0.25 + (completeness / 100) * 0.75;
  const missingPenalty = Math.min(24, [...new Set(missingEvidence)].length * 3);
  let score = Math.round(clamp(rawScore * evidenceMultiplier - riskPenalty - missingPenalty));
  if (lane === "identity-only") score = Math.min(score, 10);
  if (lane === "prelaunch" && !hasConcreteMarketEvidence(project)) score = Math.min(score, 45);
  if (hardDangers.length) score = 0;

  const rankEligible = Boolean(
    !hardDangers.length &&
      lane !== "identity-only" &&
      hasConcreteMarketEvidence(project) &&
      completeness >= 44 &&
      identityAndEvidence !== null
  );

  return {
    preIntelligenceOpportunityScore: score,
    preIntelligenceConfidence: Math.round(
      clamp(completeness * 0.65 + knownOrZero(identityAndEvidence) * 0.25 + num(project.explosionReadinessCoverage) * 100 * 0.1)
    ),
    preIntelligenceComponents: {
      explosionReadiness: num(project.explosionReadinessScore),
      acceleration,
      timing,
      attentionGap: knownOrZero(attentionGap),
      liquidityBuyerQuality: Math.round(knownOrZero(avgKnown([liquidityQuality, buyerAcceleration]))),
      catalystDeveloperChange: Math.round(knownOrZero(catalystDeveloperChange)),
      identityEvidenceStrength: Math.round(knownOrZero(identityAndEvidence)),
      relativeMarketStrength: Math.round(knownOrZero(relativeStrengthChange)),
      lifecycleNovelty: Math.round(clamp(lifecycleNovelty)),
      historicalRankImprovement: Math.round(clamp(boundedPctIfPresent(rankImprovement, 500))),
    },
    preIntelligenceRiskPenalty: riskPenalty,
    preIntelligenceEvidencePenalty: missingPenalty,
    preIntelligenceHardBlockers: hardDangers,
    preIntelligenceMissingEvidence: [...new Set(missingEvidence)],
    preIntelligenceFeatureConfidence: completeness,
    preIntelligenceEvidenceQuality: Number(evidenceMultiplier.toFixed(3)),
    preIntelligenceRankEligible: rankEligible,
    preIntelligenceResearchOnly: !rankEligible,
    preIntelligenceLane: lane,
    preIntelligenceMarketCapGroup: marketCapGroup(project),
    preIntelligenceEvidenceFamilies: evidenceFamilies,
    preIntelligenceSourceCount: sources,
    preIntelligenceSignals: {
      priceAcceleration: Math.round(knownOrZero(priceAcceleration)),
      volumeAcceleration: Math.round(knownOrZero(volumeAcceleration)),
      liquidityAcceleration: Math.round(knownOrZero(liquidityAcceleration)),
      buyerAcceleration: Math.round(knownOrZero(buyerAcceleration)),
      holderAcceleration: Math.round(knownOrZero(holderAcceleration)),
      developerAcceleration: Math.round(knownOrZero(developerAcceleration)),
      attentionGap: knownOrZero(attentionGap),
      catalystDeveloperChange: Math.round(knownOrZero(catalystDeveloperChange)),
      rankImprovement: Math.round(clamp(boundedPctIfPresent(rankImprovement, 500))),
      overextension: Math.round(knownOrZero(overextension)),
    },
    preIntelligenceContext: {
      lane,
      marketCapGroup: marketCapGroup(project),
      narrative: project.narrative || project.primaryNarrative || project.category || "unknown",
      chain: project.chain || project.network || "unknown",
      source: project.source || "unknown",
      explicitPrelaunchEvidence: hasExplicitPrelaunchEvidence(project),
    },
  };
}

export function analyzePreIntelligenceFeaturesBatch(projects = [], options = {}) {
  const explosionAnalyzed = analyzeExplosionReadinessBatch(projects, options);
  return explosionAnalyzed.map((project, index) => ({
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
