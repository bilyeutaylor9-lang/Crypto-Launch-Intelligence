function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

function average(values = []) {
  const active = values.map(num).filter((value) => value > 0);
  if (!active.length) return 0;
  return Math.round(active.reduce((sum, value) => sum + value, 0) / active.length);
}

function exchangeCoverage(project = {}) {
  const route = project.smallCapHunter?.purchaseRoute || project.purchaseRoute || {};
  const sources = [
    project.source,
    project.exchange,
    project.listingExchange,
    ...(Array.isArray(project.discoverySources) ? project.discoverySources : []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (sources.includes("coinbase") || sources.includes("binance") || sources.includes("kraken") || sources.includes("okx")) {
    return 72;
  }
  if (route.preferredRoute === "Coinbase") return 64;
  if (route.purchasable || route.preferredRoute === "MetaMask") return 38;
  return 18;
}

function priceRecognition(project = {}) {
  const move = Math.max(
    Math.abs(num(project.priceChange24h)),
    Math.abs(num(project.priceChange7d)),
    Math.abs(num(project.recentPriceMovePct))
  );

  if (move >= 120) return 92;
  if (move >= 60) return 76;
  if (move >= 30) return 55;
  if (move >= 12) return 36;
  return 18;
}

function consensusStage(awareness = 0, fundamental = 0, exchange = 0, social = 0) {
  if (!fundamental && !awareness) return "UNKNOWN";
  if (awareness < 28 && fundamental >= 45) return "TECHNICAL_EARLY";
  if (social < 40 && fundamental >= 58) return "SMART_MONEY_EARLY";
  if (exchange < 45 && fundamental >= 62) return "ECOSYSTEM_EARLY";
  if (awareness < 58) return "CRYPTO_NATIVE_DISCOVERY";
  if (social >= 65 && awareness < 72) return "INFLUENCER_DISCOVERY";
  if (awareness < 84) return "RETAIL_DISCOVERY";
  if (awareness < 94) return "MAINSTREAM";
  return "SATURATED";
}

export function analyzeInformationAdvantage(project = {}) {
  const social = average([
    project.xSocialScore,
    project.socialAccelerationScore,
    project.influencerCoverageScore,
    project.externalSignalScore,
  ]);
  const search = average([
    project.searchInterestScore,
    project.webResearchPriority,
    project.internetResearchScore,
  ]);
  const exchange = exchangeCoverage(project);
  const price = priceRecognition(project);
  const fundamentalAccelerationScore = average([
    project.developerActivityScore ?? project.developerScore,
    project.githubProScore,
    project.adoptionAccelerationScore,
    project.organicBuyerScore,
    project.liquidityFormationScore,
    project.smartWalletAccumulationScore,
    project.quietAccumulationScore,
    project.catalystCalendarScore,
    project.liveCatalystRadarScore,
    project.narrativeHeatScore,
  ]);
  const marketAwarenessScore = average([
    social,
    search,
    exchange,
    price,
    project.marketRankScore,
  ]);
  const priceRecognitionGap = Math.round(clamp(fundamentalAccelerationScore - price, -100, 100));
  const socialRecognitionGap = Math.round(clamp(fundamentalAccelerationScore - social, -100, 100));
  const exchangeRecognitionGap = Math.round(clamp(fundamentalAccelerationScore - exchange, -100, 100));
  const stage = consensusStage(marketAwarenessScore, fundamentalAccelerationScore, exchange, social);
  const earlyStageBonus = ["TECHNICAL_EARLY", "SMART_MONEY_EARLY", "ECOSYSTEM_EARLY"].includes(stage)
    ? 14
    : stage === "CRYPTO_NATIVE_DISCOVERY"
    ? 5
    : ["MAINSTREAM", "SATURATED"].includes(stage)
    ? -18
    : 0;
  const informationAdvantageScore = Math.round(
    clamp(
      fundamentalAccelerationScore * 0.45 +
        Math.max(0, priceRecognitionGap) * 0.18 +
        Math.max(0, socialRecognitionGap) * 0.18 +
        Math.max(0, exchangeRecognitionGap) * 0.12 +
        num(project.sourceTruthScore || project.sourceReliabilityScore) * 0.07 +
        earlyStageBonus
    )
  );

  return {
    ...project,
    informationAdvantageScore,
    marketAwarenessScore,
    fundamentalAccelerationScore,
    priceRecognitionGap,
    socialRecognitionGap,
    exchangeRecognitionGap,
    estimatedConsensusStage: stage,
    informationAdvantage: {
      score: informationAdvantageScore,
      stage,
      marketAwarenessScore,
      fundamentalAccelerationScore,
      priceRecognitionGap,
      socialRecognitionGap,
      exchangeRecognitionGap,
      explanation:
        informationAdvantageScore >= 70
          ? "Fundamentals appear to be improving faster than broad market recognition."
          : informationAdvantageScore >= 50
          ? "Some pre-consensus gap exists, but confirmation is still developing."
          : "No durable information advantage is visible from current data.",
    },
  };
}

export function analyzeInformationAdvantageBatch(projects = []) {
  return (Array.isArray(projects) ? projects : []).map(analyzeInformationAdvantage);
}
