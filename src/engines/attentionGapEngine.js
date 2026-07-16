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

function gapScore(signal = 0, attention = 0, floor = 30) {
  return Math.round(clamp(floor + clamp(signal) * 0.82 - clamp(attention) * 0.42));
}

function socialAttention(project = {}) {
  return maxScore(project, [
    "xSocialScore",
    "socialAccelerationScore",
    "narrativeHeatScore",
    "externalSignalScore",
  ]);
}

function mediaCoverage(project = {}) {
  return Math.max(
    clamp(project.newsCoverageScore),
    clamp(project.externalSignalScore),
    clamp(project.internetResearch?.coverageScore),
    clamp(project.internetResearch?.sourceCount) * 12
  );
}

export function attentionGapComponents(project = {}) {
  const priceAttention = Math.max(
    clamp(num(project.priceChange24h) * 1.4),
    clamp(num(project.priceChange7d) * 0.7),
    clamp(num(project.priceChange30d) * 0.28),
    clamp(project.relativeStrengthScore) * 0.55
  );
  const retailAttention = Math.max(socialAttention(project), clamp(project.volumeChange24hPct) * 0.45);
  const coverage = mediaCoverage(project);
  const exchangeVisibility = Math.max(clamp(project.exchangeProbabilityScore), project.cexListed ? 95 : 0);

  return {
    developerVsPrice: gapScore(
      maxScore(project, ["developerActivityScore", "githubProScore", "githubQualityScore", "projectChangeScore"]),
      priceAttention
    ),
    liquidityVsSocial: gapScore(
      maxScore(project, ["liquidityExpansionScore", "activeLiquidityTruthScore", "liquidityFormationScore"]),
      socialAttention(project)
    ),
    buyersVsMedia: gapScore(
      maxScore(project, ["buyPressureScore", "organicBuyerScore", "buyerRetentionScore", "holderGrowthScore"]),
      coverage
    ),
    catalystVsCoverage: gapScore(
      maxScore(project, ["liveCatalystRadarScore", "catalystCalendarScore", "catalystScore", "roadmapCatalystProfitScore"]),
      coverage
    ),
    adoptionVsExchangeVisibility: gapScore(
      maxScore(project, ["ecosystemAdoptionScore", "ecosystemIntegrationScore", "communityGrowthScore", "developerActivityScore"]),
      exchangeVisibility
    ),
    smartWalletVsRetail: gapScore(
      maxScore(project, ["smartWalletArrivalScore", "smartMoneyAccumulationScore", "smartMoneyRotationScore"]),
      retailAttention
    ),
    fundamentalChangeVsAttention: gapScore(
      maxScore(project, ["projectChangeScore", "informationAdvantageScore", "roadmapCatalystProfitScore", "githubProScore"]),
      Math.max(priceAttention, retailAttention, coverage)
    ),
  };
}

export function scoreAttentionGap(project = {}) {
  const components = attentionGapComponents(project);
  const raw = weighted([
    { score: components.developerVsPrice, weight: 16 },
    { score: components.liquidityVsSocial, weight: 15 },
    { score: components.buyersVsMedia, weight: 15 },
    { score: components.catalystVsCoverage, weight: 14 },
    { score: components.adoptionVsExchangeVisibility, weight: 13 },
    { score: components.smartWalletVsRetail, weight: 14 },
    { score: components.fundamentalChangeVsAttention, weight: 13 },
  ]);
  const scamPenalty = Math.max(
    clamp(project.contractRiskScore),
    clamp(project.honeypotRiskScore),
    clamp(project.washTradingRiskScore),
    clamp(project.liquidityManipulationRisk)
  );
  return Math.round(clamp(raw - (scamPenalty >= 70 ? 20 : scamPenalty >= 55 ? 10 : 0)));
}

export function classifyAttentionGap(score = 0) {
  if (score >= 85) return "major under-the-radar gap";
  if (score >= 72) return "strong attention gap";
  if (score >= 58) return "developing attention gap";
  if (score >= 42) return "limited attention gap";
  return "crowded or unproven";
}

function gapSignals(components = {}) {
  return Object.entries(components)
    .filter(([, score]) => num(score) >= 62)
    .sort((a, b) => num(b[1]) - num(a[1]))
    .slice(0, 6)
    .map(([key, score]) => ({
      type: "ATTENTION_GAP",
      label: key,
      score: Math.round(clamp(score)),
    }));
}

function missingEvidence(project = {}, components = {}) {
  const missing = [];
  if (components.developerVsPrice >= 65 && !project.githubUrl && !project.githubOrg) {
    missing.push("Confirm developer momentum with a GitHub repository or official engineering source.");
  }
  if (components.catalystVsCoverage >= 65 && !project.liveCatalystEvents?.length) {
    missing.push("Confirm the under-covered catalyst with an official or independent source.");
  }
  if (components.liquidityVsSocial >= 65 && !project.activeLiquidityTruthScore) {
    missing.push("Confirm liquidity growth is usable liquidity, not temporary or removable liquidity.");
  }
  if (components.buyersVsMedia >= 65 && !project.organicBuyerScore) {
    missing.push("Confirm buyer growth is organic and not repeat-wallet or sybil activity.");
  }
  return missing.slice(0, 6);
}

export function analyzeAttentionGap(project = {}) {
  const components = attentionGapComponents(project);
  const attentionGapScore = scoreAttentionGap(project);
  const attentionGapSignals = gapSignals(components);
  const attentionGapMissingEvidence = missingEvidence(project, components);

  return {
    ...project,
    attentionGapScore,
    attentionGapLevel: classifyAttentionGap(attentionGapScore),
    attentionGapComponents: components,
    attentionGapSignals,
    attentionGapMissingEvidence,
    missingEvidence: [
      ...(Array.isArray(project.missingEvidence) ? project.missingEvidence : []),
      ...attentionGapMissingEvidence,
    ].filter((value, index, list) => list.indexOf(value) === index),
    evidence: [
      ...(Array.isArray(project.evidence) ? project.evidence : []),
      {
        engine: "Attention Gap Engine",
        signal: "Fundamental progress versus current market attention",
        confidence: Math.min(attentionGapScore / 100, 1),
        impact: attentionGapScore >= 58 ? "Positive" : "Neutral",
        components,
      },
    ],
  };
}

export function analyzeAttentionGapBatch(projects = []) {
  return (Array.isArray(projects) ? projects : [])
    .map(analyzeAttentionGap)
    .sort((a, b) => b.attentionGapScore - a.attentionGapScore);
}
