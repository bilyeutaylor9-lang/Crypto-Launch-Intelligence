/**
 * Institutional vNext Engine
 *
 * Purpose:
 * Consolidates the next generation research modules into one deterministic
 * intelligence layer: narrative momentum, launch/listing probability,
 * unlock/vesting pressure, staking health, TVL/adoption, GitHub velocity,
 * sentiment/KOL/wallet conviction, liquidity migration, cross-chain expansion,
 * macro narrative, Monte Carlo v2, explainability, evidence quality, dynamic
 * weights, and institutional confidence.
 */

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

function textOf(project = {}) {
  return [
    project.name,
    project.symbol,
    project.description,
    project.websiteText,
    project.docs,
    project.blog,
    project.roadmap,
    project.launchInfo,
    project.tokenomics,
    project.narrative,
    project.primaryNarrative,
    ...(project.narratives || []),
    ...(project.alphaTags || []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function hasAny(text = "", words = []) {
  return words.filter((word) => text.includes(word));
}

function normalizedFeatures(project = {}) {
  const features = {
    narrative: project.narrativeScore,
    narrativeForecast: project.narrativeForecastScore,
    launchStaking: project.narrativeLaunchStakingScore,
    launchReadiness: project.launchReadinessScore,
    stakingMomentum: project.stakingMomentumScore,
    stakingRisk: project.stakingRiskScore,
    exchange: project.exchangeProbabilityScore,
    catalyst: project.catalystScore,
    catalystCalendar: project.catalystCalendarScore,
    liquidity: project.liquidityScore,
    liquidityExpansion: project.liquidityExpansionScore,
    capitalFlow: project.capitalFlowScore,
    buyPressure: project.buyPressureScore,
    sellPressure: project.sellPressureScore,
    momentum: project.momentumShiftScore,
    acceleration: project.accelerationScore,
    relativeStrength: project.relativeStrengthScore,
    smartWallet: project.smartWalletScore,
    smartWalletPerformance: project.smartWalletPerformanceScore,
    smartMoneyAccumulation: project.smartMoneyAccumulationScore,
    whale: project.whaleScore ?? project.whaleActivityScore,
    developer: project.developerActivityScore ?? project.developerScore,
    github: project.githubScore ?? project.githubQualityScore,
    community: project.communityGrowthScore ?? project.communityScore,
    social: project.xSocialScore,
    socialAcceleration: project.socialAccelerationScore,
    external: project.externalSignalScore,
    externalRisk: project.externalRiskScore,
    tokenomics: project.tokenomicsScore,
    funding: project.fundingBackerScore,
    partnerships: project.partnershipScore,
    ecosystem: project.ecosystemIntegrationScore,
    outcomeLearning: project.outcomeLearningScore,
    prePumpPattern: project.prePumpPatternScore,
    signalCombination: project.signalCombinationScore,
    calibration: project.calibrationScore,
    quantum: project.quantumOpportunityScore,
    aiAnalyst: project.aiAnalystScore,
    risk: project.riskScore,
  };

  return Object.fromEntries(
    Object.entries(features).map(([key, value]) => [key, Math.round(clamp(value))])
  );
}

function scoreAINarrativeMomentum(project = {}, features = {}, text = "") {
  const hotNarratives = hasAny(text, [
    "ai",
    "agent",
    "restaking",
    "rwa",
    "depin",
    "modular",
    "base",
    "solana",
    "zk",
    "privacy",
  ]);
  const score = clamp(
    features.narrative * 0.22 +
      features.narrativeForecast * 0.25 +
      features.external * 0.16 +
      features.social * 0.14 +
      features.catalyst * 0.13 +
      hotNarratives.length * 6
  );

  return {
    score: Math.round(score),
    hotNarratives,
    summary:
      score >= 70
        ? "Narrative is accelerating with external/catalyst support."
        : "Narrative momentum is early or uneven.",
  };
}

function scoreLaunchProbability(project = {}, features = {}, text = "") {
  const launchHits = hasAny(text, [
    "tge",
    "mainnet",
    "launch",
    "airdrop",
    "snapshot",
    "points",
    "ido",
    "presale",
    "listing soon",
    "testnet",
  ]);
  const score = clamp(
    features.launchReadiness * 0.28 +
      features.launchStaking * 0.22 +
      features.catalystCalendar * 0.18 +
      features.exchange * 0.14 +
      features.external * 0.1 +
      launchHits.length * 6
  );

  return {
    score: Math.round(score),
    launchHits,
    summary: score >= 70 ? "Launch probability is high." : "Launch probability is developing.",
  };
}

function scoreExchangeListingV2(project = {}, features = {}, text = "") {
  const cexHits = hasAny(text, [
    "coinbase",
    "binance",
    "kraken",
    "okx",
    "bybit",
    "kucoin",
    "market maker",
    "listing",
  ]);
  const liquidityUsd = num(project.liquidityUsd ?? project.liquidity);
  const volume24h = num(project.volume24h ?? project.volume);
  const score = clamp(
    features.exchange * 0.35 +
      features.liquidity * 0.16 +
      features.external * 0.12 +
      features.social * 0.1 +
      features.funding * 0.1 +
      (liquidityUsd >= 1000000 ? 8 : liquidityUsd >= 250000 ? 4 : 0) +
      (volume24h >= 1000000 ? 8 : volume24h >= 250000 ? 4 : 0) +
      cexHits.length * 5
  );

  return {
    score: Math.round(score),
    cexHits,
    summary: score >= 72 ? "CEX/listing attention probability is elevated." : "Listing probability remains early.",
  };
}

function scoreUnlockAndVesting(project = {}, text = "") {
  const unlockHits = hasAny(text, ["unlock", "cliff", "vesting", "emissions", "linear vesting", "team allocation"]);
  const protectiveHits = hasAny(text, ["locked liquidity", "long vesting", "fair launch", "no team allocation"]);
  const unlockPct = num(project.unlockPct30d ?? project.unlockPercent30d ?? project.nextUnlockPct);
  const teamAllocation = num(project.teamAllocationPct ?? project.teamAllocation);
  const unlockRisk = clamp(unlockHits.length * 12 + unlockPct * 2 + teamAllocation * 0.5 - protectiveHits.length * 8);
  const vestingPressure = clamp(unlockRisk + num(project.sellPressureScore) * 0.25);

  return {
    tokenUnlockRiskScore: Math.round(unlockRisk),
    vestingPressureScore: Math.round(vestingPressure),
    unlockHits,
    protectiveHits,
    summary:
      vestingPressure >= 65
        ? "Unlock or vesting pressure may weigh on launch performance."
        : "Unlock/vesting pressure is not dominant in available evidence.",
  };
}

function scoreStakingHealth(project = {}, features = {}, text = "") {
  const apy = num(project.apy ?? project.stakingApy);
  const stakingRatio = num(project.stakingRatio ?? project.percentStaked);
  const healthHits = hasAny(text, ["validator", "delegation", "slashing insurance", "audited", "liquid staking"]);
  const riskHits = hasAny(text, ["guaranteed apy", "1000% apy", "withdrawals disabled", "hidden lockup", "slashing"]);
  const score = clamp(
    features.stakingMomentum * 0.35 +
      (apy > 0 && apy <= 25 ? 20 : apy <= 80 ? 10 : apy > 100 ? -18 : 0) +
      (stakingRatio >= 20 && stakingRatio <= 70 ? 16 : stakingRatio > 85 ? -12 : 0) +
      healthHits.length * 7 -
      features.stakingRisk * 0.35 -
      riskHits.length * 10
  );

  return {
    score: Math.round(score),
    apy,
    stakingRatio,
    healthHits,
    riskHits,
    summary: score >= 65 ? "Staking health supports the thesis." : "Staking health needs manual review.",
  };
}

function scoreGrowthAndAdoption(project = {}, features = {}, text = "") {
  const adoptionHits = hasAny(text, ["integration", "partner", "users", "tvl", "protocol", "sdk", "mainnet", "developers"]);
  const tvl = num(project.tvl ?? project.totalValueLocked);
  const tvlGrowth = num(project.tvlGrowth7d ?? project.tvlGrowth30d);
  const tvlGrowthScore = clamp(features.ecosystem * 0.25 + (tvl >= 10000000 ? 20 : tvl >= 1000000 ? 10 : 0) + tvlGrowth * 0.6);
  const ecosystemAdoptionScore = clamp(features.ecosystem * 0.35 + features.partnerships * 0.2 + features.developer * 0.15 + adoptionHits.length * 7);

  return {
    tvlGrowthScore: Math.round(tvlGrowthScore),
    ecosystemAdoptionScore: Math.round(ecosystemAdoptionScore),
    adoptionHits,
    summary:
      ecosystemAdoptionScore >= 65
        ? "Adoption evidence is broad enough for institutional review."
        : "Adoption evidence is still thin.",
  };
}

function scoreDeveloperVelocity(project = {}, features = {}) {
  const commits = num(project.commits30d ?? project.githubCommits30d);
  const contributors = num(project.contributors ?? project.githubContributors);
  const releases = num(project.releases ?? project.githubReleases);
  const score = clamp(features.github * 0.35 + features.developer * 0.35 + commits * 0.6 + contributors * 1.5 + releases * 3);

  return {
    score: Math.round(score),
    commits,
    contributors,
    releases,
    summary: score >= 60 ? "Developer velocity is visible." : "Developer velocity is limited or unavailable.",
  };
}

function scoreSocialAndKOL(project = {}, features = {}, text = "") {
  const kolHits = hasAny(text, ["founder", "thread", "kol", "influencer", "research", "partner", "backed by"]);
  const followers = num(project.twitterFollowers ?? project.xFollowers ?? project.followers);
  const engagement = num(project.engagementRate);
  const sentimentScore = clamp(features.social * 0.35 + features.external * 0.25 + features.socialAcceleration * 0.2 - features.externalRisk * 0.25 + engagement * 180);
  const kolInfluenceScore = clamp(kolHits.length * 11 + (followers >= 100000 ? 18 : followers >= 25000 ? 10 : 0) + features.institutionalWatch * 0.25);

  return {
    sentimentScore: Math.round(sentimentScore),
    kolInfluenceScore: Math.round(kolInfluenceScore),
    kolHits,
    summary:
      sentimentScore >= 65 || kolInfluenceScore >= 65
        ? "Social/KOL layer supports discovery."
        : "Social/KOL confirmation is not decisive.",
  };
}

function scoreWalletAndLiquidity(project = {}, features = {}) {
  const walletClusterScore = clamp(features.smartWallet * 0.25 + features.smartWalletPerformance * 0.3 + features.whale * 0.2 + features.smartMoneyAccumulation * 0.25);
  const smartMoneyConvictionScore = clamp(
    features.smartMoneyAccumulation * 0.35 +
      features.smartWalletPerformance * 0.28 +
      features.capitalFlow * 0.18 +
      features.buyPressure * 0.14 -
      features.sellPressure * 0.18
  );
  const liquidityMigrationScore = clamp(
    features.liquidityExpansion * 0.42 +
      features.capitalFlow * 0.25 +
      features.buyPressure * 0.16 +
      features.relativeStrength * 0.12 -
      features.sellPressure * 0.18
  );

  return {
    walletClusterScore: Math.round(walletClusterScore),
    smartMoneyConvictionScore: Math.round(smartMoneyConvictionScore),
    liquidityMigrationScore: Math.round(liquidityMigrationScore),
    summary:
      smartMoneyConvictionScore >= 65
        ? "Wallet/flow evidence shows conviction."
        : "Wallet/flow evidence is not yet strong.",
  };
}

function scoreCrossChainAndMacro(project = {}, features = {}, text = "") {
  const chainHits = hasAny(text, ["cross-chain", "omnichain", "bridge", "base", "solana", "ethereum", "arbitrum", "optimism", "polygon"]);
  const macroHits = hasAny(text, ["ai", "rwa", "stablecoin", "restaking", "depin", "modular", "etf", "tokenized", "treasury"]);
  const crossChainExpansionScore = clamp(chainHits.length * 9 + features.ecosystem * 0.3 + features.partnerships * 0.2);
  const macroNarrativeScore = clamp(macroHits.length * 8 + features.narrativeForecast * 0.25 + features.external * 0.15);

  return {
    crossChainExpansionScore: Math.round(crossChainExpansionScore),
    macroNarrativeScore: Math.round(macroNarrativeScore),
    chainHits,
    macroHits,
    summary:
      macroNarrativeScore >= 65
        ? "Macro narrative alignment is strong."
        : "Macro narrative alignment is developing.",
  };
}

function monteCarloV2(project = {}, features = {}, modules = {}) {
  const base =
    features.momentum * 0.16 +
    features.liquidity * 0.12 +
    features.smartMoneyAccumulation * 0.14 +
    features.catalystCalendar * 0.12 +
    features.narrativeForecast * 0.12 +
    num(modules.launchProbability?.score) * 0.1 +
    num(modules.smartMoney?.smartMoneyConvictionScore) * 0.12 -
    features.risk * 0.16 -
    num(modules.unlockVesting?.vestingPressureScore) * 0.09;
  const expectedReturnPct = Math.round(base - 18);
  const upsideProbability = clamp(50 + expectedReturnPct * 0.45 + features.signalCombination * 0.12 - features.risk * 0.18);
  const downsideProbability = clamp(50 - expectedReturnPct * 0.35 + features.risk * 0.25 + num(modules.unlockVesting?.vestingPressureScore) * 0.1);

  return {
    expectedReturnPct,
    upsideProbability: Math.round(upsideProbability),
    downsideProbability: Math.round(downsideProbability),
    forecastScore: Math.round(clamp(upsideProbability * 0.55 + clamp(expectedReturnPct + 30) * 0.35 - downsideProbability * 0.2)),
  };
}

function buildDynamicWeights(features = {}, modules = {}) {
  const weights = {
    narrative: 1,
    launch: 1,
    exchange: 1,
    tokenomics: 1,
    staking: 1,
    growth: 1,
    developer: 1,
    social: 1,
    wallet: 1,
    liquidity: 1,
    macro: 1,
    forecast: 1,
    risk: 1,
  };

  if (features.narrativeForecast >= 65) weights.narrative += 0.18;
  if (num(modules.launchProbability?.score) >= 65) weights.launch += 0.18;
  if (num(modules.walletLiquidity?.smartMoneyConvictionScore) >= 65) weights.wallet += 0.22;
  if (num(modules.walletLiquidity?.liquidityMigrationScore) >= 65) weights.liquidity += 0.2;
  if (num(modules.unlockVesting?.vestingPressureScore) >= 60) weights.risk += 0.25;
  if (features.externalRisk >= 45) weights.risk += 0.18;
  if (features.developer <= 20 && features.github <= 20) weights.developer -= 0.12;

  return Object.fromEntries(
    Object.entries(weights).map(([key, value]) => [key, Number(clamp(value, 0.7, 1.35).toFixed(2))])
  );
}

function buildEvidenceQuality(project = {}, modules = {}) {
  const evidenceCount = Array.isArray(project.evidence) ? project.evidence.length : 0;
  const sourceCount = [
    num(project.priceUsd ?? project.price) > 0,
    num(project.liquidityUsd ?? project.liquidity) > 0,
    num(project.volume24h ?? project.volume) > 0,
    num(project.xSocialScore) > 0 || num(project.externalSignalScore) > 0,
    num(project.developerActivityScore ?? project.developerScore) > 0,
    num(project.smartMoneyAccumulationScore) > 0,
    num(project.catalystScore) > 0,
    num(project.prePumpPattern?.databaseExamples) >= 8,
  ].filter(Boolean).length;
  const score = Math.round(clamp(sourceCount * 10 + Math.min(20, evidenceCount * 1.2) + num(modules.patternConfidenceBonus)));

  return {
    score,
    sourceCount,
    evidenceCount,
    summary: score >= 70 ? "Evidence base is strong." : score >= 45 ? "Evidence base is usable but incomplete." : "Evidence base is thin.",
  };
}

function explain(project = {}, features = {}, modules = {}) {
  const positives = [];
  const negatives = [];

  if (num(modules.narrativeMomentum?.score) >= 65) positives.push("narrative momentum");
  if (num(modules.launchProbability?.score) >= 65) positives.push("launch probability");
  if (num(modules.walletLiquidity?.smartMoneyConvictionScore) >= 65) positives.push("smart money conviction");
  if (num(modules.growthAdoption?.ecosystemAdoptionScore) >= 65) positives.push("ecosystem adoption");
  if (num(modules.monteCarloV2?.forecastScore) >= 65) positives.push("Monte Carlo v2 upside");
  if (num(modules.unlockVesting?.vestingPressureScore) >= 60) negatives.push("vesting pressure");
  if (features.risk >= 65) negatives.push("aggregate risk");
  if (features.sellPressure >= 65) negatives.push("sell pressure");
  if (features.externalRisk >= 45) negatives.push("external risk language");

  return {
    positives,
    negatives,
    summary: `Primary support: ${positives.slice(0, 3).join(", ") || "none decisive"}. Primary risks: ${negatives.slice(0, 3).join(", ") || "none elevated"}.`,
  };
}

function institutionalConfidence(features = {}, modules = {}) {
  const evidence = num(modules.evidenceQuality?.score);
  const forecast = num(modules.monteCarloV2?.forecastScore);
  const wallet = num(modules.walletLiquidity?.smartMoneyConvictionScore);
  const risk = Math.max(features.risk, num(modules.unlockVesting?.vestingPressureScore), features.externalRisk);
  const score = Math.round(clamp(evidence * 0.28 + forecast * 0.22 + wallet * 0.18 + features.liquidity * 0.16 + features.narrativeForecast * 0.12 - risk * 0.18));

  return {
    score,
    level: score >= 80 ? "Institutional" : score >= 65 ? "High" : score >= 45 ? "Developing" : "Low",
  };
}

export function analyzeInstitutionalVNext(project = {}) {
  const text = textOf(project);
  const features = normalizedFeatures(project);
  const modules = {};

  modules.narrativeMomentum = scoreAINarrativeMomentum(project, features, text);
  modules.launchProbability = scoreLaunchProbability(project, features, text);
  modules.exchangeListingV2 = scoreExchangeListingV2(project, features, text);
  modules.unlockVesting = scoreUnlockAndVesting(project, text);
  modules.stakingHealth = scoreStakingHealth(project, features, text);
  modules.growthAdoption = scoreGrowthAndAdoption(project, features, text);
  modules.githubVelocity = scoreDeveloperVelocity(project, features);
  modules.socialSentiment = scoreSocialAndKOL(project, features, text);
  modules.walletLiquidity = scoreWalletAndLiquidity(project, features);
  modules.crossChainMacro = scoreCrossChainAndMacro(project, features, text);
  modules.monteCarloV2 = monteCarloV2(project, features, modules);
  modules.dynamicWeights = buildDynamicWeights(features, modules);
  modules.evidenceQuality = buildEvidenceQuality(project, modules);
  modules.explainability = explain(project, features, modules);
  modules.institutionalConfidence = institutionalConfidence(features, modules);

  const vNextScore = Math.round(
    clamp(
      modules.narrativeMomentum.score * 0.1 +
        modules.launchProbability.score * 0.1 +
        modules.exchangeListingV2.score * 0.08 +
        modules.stakingHealth.score * 0.08 +
        modules.growthAdoption.ecosystemAdoptionScore * 0.08 +
        modules.githubVelocity.score * 0.06 +
        modules.socialSentiment.sentimentScore * 0.08 +
        modules.socialSentiment.kolInfluenceScore * 0.05 +
        modules.walletLiquidity.smartMoneyConvictionScore * 0.11 +
        modules.walletLiquidity.liquidityMigrationScore * 0.08 +
        modules.crossChainMacro.macroNarrativeScore * 0.06 +
        modules.monteCarloV2.forecastScore * 0.1 +
        modules.evidenceQuality.score * 0.05 -
        modules.unlockVesting.vestingPressureScore * 0.08
    )
  );

  return {
    ...project,
    institutionalVNextScore: vNextScore,
    aiNarrativeMomentumScore: modules.narrativeMomentum.score,
    launchProbabilityScore: modules.launchProbability.score,
    exchangeListingProbabilityV2Score: modules.exchangeListingV2.score,
    tokenUnlockRiskScore: modules.unlockVesting.tokenUnlockRiskScore,
    vestingPressureScore: modules.unlockVesting.vestingPressureScore,
    stakingHealthScore: modules.stakingHealth.score,
    tvlGrowthScore: modules.growthAdoption.tvlGrowthScore,
    ecosystemAdoptionScore: modules.growthAdoption.ecosystemAdoptionScore,
    githubVelocityScore: modules.githubVelocity.score,
    socialSentimentAIScore: modules.socialSentiment.sentimentScore,
    kolInfluenceScore: modules.socialSentiment.kolInfluenceScore,
    walletClusterScore: modules.walletLiquidity.walletClusterScore,
    smartMoneyConvictionScore: modules.walletLiquidity.smartMoneyConvictionScore,
    liquidityMigrationScore: modules.walletLiquidity.liquidityMigrationScore,
    crossChainExpansionScore: modules.crossChainMacro.crossChainExpansionScore,
    macroNarrativeScore: modules.crossChainMacro.macroNarrativeScore,
    monteCarloV2Score: modules.monteCarloV2.forecastScore,
    evidenceQualityScore: modules.evidenceQuality.score,
    explainabilitySummary: modules.explainability.summary,
    institutionalConfidenceScore: modules.institutionalConfidence.score,
    institutionalConfidenceLevel: modules.institutionalConfidence.level,
    dynamicEngineWeights: modules.dynamicWeights,
    featureNormalization: features,
    institutionalVNext: {
      score: vNextScore,
      modules,
      summary:
        vNextScore >= 75
          ? "vNext stack shows institutional-grade opportunity structure."
          : vNextScore >= 55
          ? "vNext stack shows developing opportunity structure."
          : "vNext stack is cautious or incomplete.",
    },
    evidence: [
      ...(project.evidence || []),
      {
        engine: "Institutional vNext Engine",
        signal: "Advanced institutional intelligence stack",
        score: vNextScore,
        confidence: Math.min(0.92, modules.evidenceQuality.score / 100),
        impact: vNextScore >= 65 ? "Positive" : vNextScore <= 40 ? "Negative" : "Neutral",
        reasons: [
          modules.explainability.summary,
          `Institutional confidence: ${modules.institutionalConfidence.level} (${modules.institutionalConfidence.score}).`,
          `Dynamic weights active across ${Object.keys(modules.dynamicWeights).length} groups.`,
        ],
      },
    ],
  };
}

export function analyzeInstitutionalVNextBatch(projects = []) {
  return (Array.isArray(projects) ? projects : []).map(analyzeInstitutionalVNext);
}
