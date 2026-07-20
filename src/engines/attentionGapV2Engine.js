function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

function average(values = []) {
  const active = values.filter((value) => Number.isFinite(Number(value)));
  if (!active.length) return 0;
  return active.reduce((sum, value) => sum + Number(value), 0) / active.length;
}

export function analyzeAttentionGapV2(project = {}) {
  const developerProgressScore = clamp(project.developerAccelerationV2Score ?? project.developerActivityScore ?? project.githubProScore);
  const userGrowthScore = clamp(project.buyerBreadthAccelerationScore ?? project.organicBuyerScore ?? project.holderGrowthScore);
  const capitalFormationScore = clamp(project.liquidityFormationScore ?? project.capitalMigrationScore ?? project.capitalFlowScore);
  const verifiedCatalystScore = clamp(project.catalystScore ?? project.liveCatalystRadarScore ?? project.roadmapProfitabilityScore);
  const fundamentalProgressScore = Math.round(average([
    developerProgressScore,
    userGrowthScore,
    capitalFormationScore,
    verifiedCatalystScore,
    clamp(project.sourceTruthScore),
    clamp(project.identityResolutionScore),
  ]));
  const marketActivityScore = Math.round(average([
    clamp(project.volume24hUsd ?? project.volume24h, 0, 2_000_000) / 20_000,
    clamp(project.buyPressureScore),
    clamp(project.relativeStrengthScore),
  ]));
  const socialAttentionScore = Math.round(average([
    clamp(project.socialAccelerationScore),
    clamp(project.xSocialScore),
    clamp(project.narrativeHeatScore),
    clamp(project.externalSignalScore),
  ]));
  const searchAttentionScore = clamp(project.searchAttentionScore ?? project.googleNewsAttentionScore ?? project.internetResearchAttentionScore);
  const priceAttentionScore = Math.max(
    clamp(Math.abs(num(project.priceChange24h)), 0, 120),
    clamp(Math.abs(num(project.priceChange7d)), 0, 260) * 0.75
  );
  const exchangeAttentionScore = clamp(project.exchangeProbabilityScore ?? project.cexListingAttentionScore);
  const observedProgress = Math.round(average([
    fundamentalProgressScore,
    developerProgressScore,
    userGrowthScore,
    capitalFormationScore,
    verifiedCatalystScore,
  ]));
  const marketAttention = Math.round(average([
    socialAttentionScore,
    searchAttentionScore,
    priceAttentionScore,
    exchangeAttentionScore,
  ]));
  const attentionGap = Math.round(clamp(50 + observedProgress * 0.62 - marketAttention * 0.42, 0, 100));

  return {
    ...project,
    fundamentalProgressScore,
    marketActivityScore,
    developerProgressScore,
    userGrowthScore,
    capitalFormationScore,
    verifiedCatalystScore,
    socialAttentionScore,
    searchAttentionScore,
    priceAttentionScore: Math.round(priceAttentionScore),
    exchangeAttentionScore,
    attentionGapV2Score: attentionGap,
    attentionGapV2State:
      attentionGap >= 72 && priceAttentionScore < 65
        ? "PROGRESS_EXCEEDS_ATTENTION"
        : priceAttentionScore >= 85 || socialAttentionScore >= 85
          ? "ATTENTION_ALREADY_HIGH"
          : attentionGap >= 55
            ? "DEVELOPING_ATTENTION_GAP"
            : "NO_ATTENTION_ADVANTAGE",
  };
}

export function analyzeAttentionGapV2Batch(projects = []) {
  return (Array.isArray(projects) ? projects : []).map(analyzeAttentionGapV2);
}
