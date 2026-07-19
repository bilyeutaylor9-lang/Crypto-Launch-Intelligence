const EVIDENCE_STATUSES = new Set(["VERIFIED", "VERIFIED_ABSENT", "UNKNOWN", "STALE", "FAILED"]);

const BUY_BLOCKING_SAFETY_STATES = new Set(["BLOCKED", "RESTRICTED_RESEARCH"]);

const FAMILY_DEFINITIONS = [
  {
    key: "narrative",
    label: "Narrative",
    metrics: [
      ["narrativeScore", "Narrative engine"],
      ["narrativeForecastScore", "Narrative forecast"],
      ["narrativeHeatScore", "Narrative heat"],
      ["infrastructureNarrativeScore", "Infrastructure narrative"],
      ["xSocialScore", "X/social intelligence"],
      ["socialAccelerationScore", "Social acceleration"],
    ],
  },
  {
    key: "momentum",
    label: "Momentum",
    metrics: [
      ["momentumShiftScore", "Momentum shift"],
      ["velocityScore", "Velocity"],
      ["accelerationScore", "Acceleration"],
      ["earlyBreakoutScore", "Early breakout"],
      ["volatilityExpansionScore", "Volatility expansion"],
      ["trendChangeScore", "Trend change"],
      ["prePump.score", "Pre-pump detector"],
      ["preBreakoutMomentumScore", "Pre-breakout momentum"],
      ["relativeStrengthScore", "Relative strength"],
    ],
  },
  {
    key: "organicDemand",
    label: "Organic Demand",
    metrics: [
      ["organicBuyerScore", "Organic buyer quality"],
      ["buyerRetentionScore", "Buyer retention"],
      ["buyPressureScore", "Buy pressure"],
      ["holderGrowthScore", "Holder growth"],
      ["organicEconomicIntegrityScore", "Organic economic integrity"],
      ["activeLiquidityTruthScore", "Active liquidity truth"],
    ],
  },
  {
    key: "liquidity",
    label: "Liquidity",
    metrics: [
      ["liquidityScore", "Liquidity intelligence"],
      ["liquidityExpansionScore", "Liquidity expansion"],
      ["activeLiquidityTruthScore", "Active liquidity truth"],
      ["liquidityControlSafetyScore", "Liquidity control safety"],
      ["liquidityUsd", "Visible liquidity"],
      ["stableExitLiquidityUsd", "Stable exit liquidity"],
    ],
  },
  {
    key: "smartMoney",
    label: "Smart Money",
    metrics: [
      ["smartWalletScore", "Smart wallet"],
      ["smartWalletPerformanceScore", "Smart wallet performance"],
      ["smartMoneyAccumulationScore", "Smart money accumulation"],
      ["smartMoneyRotationScore", "Smart money rotation"],
      ["smartWalletArrivalScore", "Smart wallet arrival"],
      ["whaleActivityScore", "Whale activity"],
      ["capitalFlowScore", "Capital flow"],
    ],
  },
  {
    key: "fundamentals",
    label: "Fundamentals",
    metrics: [
      ["tokenomicsScore", "Tokenomics"],
      ["fundingBackerScore", "Funding/backers"],
      ["partnershipScore", "Partnerships"],
      ["ecosystemIntegrationScore", "Ecosystem integration"],
      ["developerActivityScore", "Developer activity"],
      ["githubProScore", "GitHub intelligence"],
    ],
  },
  {
    key: "communityDevelopment",
    label: "Community and Development",
    metrics: [
      ["developerActivityScore", "Developer activity"],
      ["githubScore", "GitHub quality"],
      ["githubQualityScore", "GitHub quality"],
      ["githubProScore", "GitHub intelligence"],
      ["communityGrowthScore", "Community growth"],
      ["sourceReliabilityScore", "Source reliability"],
    ],
  },
  {
    key: "safetyIntegrity",
    label: "Safety and Integrity",
    metrics: [
      ["instantSafetyScore", "Instant safety"],
      ["contractAuthoritySafetyScore", "Contract authority safety"],
      ["liquidityControlSafetyScore", "Liquidity control safety"],
      ["organicEconomicIntegrityScore", "Organic economic integrity"],
      ["sourceTruthScore", "Source truth"],
      ["identityResolutionScore", "Identity resolution"],
      ["finalIntegrityScore", "Final integrity"],
    ],
  },
  {
    key: "catalysts",
    label: "Catalysts",
    metrics: [
      ["catalystScore", "Catalysts"],
      ["catalystCalendarScore", "Catalyst calendar"],
      ["liveCatalystRadarScore", "Live catalyst radar"],
      ["roadmapProfitabilityScore", "Roadmap profitability"],
      ["exchangeProbabilityScore", "Exchange probability"],
      ["narrativeLaunchStakingScore", "Launch/staking"],
    ],
  },
  {
    key: "timing",
    label: "Timing",
    metrics: [
      ["opportunityTimingScore", "Opportunity timing"],
      ["candidateLifecycleReadinessScore", "Candidate lifecycle"],
      ["discoveryDecisionScore", "Discovery decision"],
      ["preConsensusOpportunityScore", "Pre-consensus score"],
      ["quietAccumulationScore", "Quiet accumulation"],
      ["breakoutBrainScore", "Breakout brain"],
    ],
  },
];

const CATEGORY_WEIGHTS = {
  Meme: {
    narrative: 1.3,
    momentum: 1.25,
    organicDemand: 1.25,
    liquidity: 1.15,
    smartMoney: 0.9,
    fundamentals: 0.45,
    communityDevelopment: 0.75,
    safetyIntegrity: 1.25,
    catalysts: 0.8,
    timing: 1.2,
  },
  AI: {
    narrative: 1.1,
    momentum: 1.0,
    organicDemand: 0.9,
    liquidity: 0.95,
    smartMoney: 1.0,
    fundamentals: 1.15,
    communityDevelopment: 1.15,
    safetyIntegrity: 1.15,
    catalysts: 1.1,
    timing: 1.0,
  },
  DeFi: {
    narrative: 0.85,
    momentum: 0.95,
    organicDemand: 1.05,
    liquidity: 1.25,
    smartMoney: 1.1,
    fundamentals: 1.15,
    communityDevelopment: 0.9,
    safetyIntegrity: 1.25,
    catalysts: 0.95,
    timing: 0.95,
  },
  Infrastructure: {
    narrative: 0.85,
    momentum: 0.85,
    organicDemand: 0.85,
    liquidity: 0.95,
    smartMoney: 0.95,
    fundamentals: 1.35,
    communityDevelopment: 1.35,
    safetyIntegrity: 1.2,
    catalysts: 1.2,
    timing: 0.95,
  },
  Gaming: {
    narrative: 1.15,
    momentum: 1.0,
    organicDemand: 1.1,
    liquidity: 0.95,
    smartMoney: 0.9,
    fundamentals: 0.95,
    communityDevelopment: 1.05,
    safetyIntegrity: 1.1,
    catalysts: 1.2,
    timing: 1.0,
  },
  DePIN: {
    narrative: 1.0,
    momentum: 0.95,
    organicDemand: 0.95,
    liquidity: 0.95,
    smartMoney: 0.95,
    fundamentals: 1.25,
    communityDevelopment: 1.2,
    safetyIntegrity: 1.15,
    catalysts: 1.15,
    timing: 1.0,
  },
  RWA: {
    narrative: 0.85,
    momentum: 0.85,
    organicDemand: 0.85,
    liquidity: 1.05,
    smartMoney: 1.05,
    fundamentals: 1.35,
    communityDevelopment: 0.95,
    safetyIntegrity: 1.25,
    catalysts: 1.15,
    timing: 0.95,
  },
  "Layer 1": {
    narrative: 0.95,
    momentum: 0.9,
    organicDemand: 0.85,
    liquidity: 0.95,
    smartMoney: 0.95,
    fundamentals: 1.3,
    communityDevelopment: 1.25,
    safetyIntegrity: 1.2,
    catalysts: 1.15,
    timing: 0.95,
  },
  "Layer 2": {
    narrative: 0.95,
    momentum: 0.9,
    organicDemand: 0.9,
    liquidity: 0.95,
    smartMoney: 0.95,
    fundamentals: 1.25,
    communityDevelopment: 1.2,
    safetyIntegrity: 1.2,
    catalysts: 1.15,
    timing: 0.95,
  },
  "Ecosystem Token": {
    narrative: 1.0,
    momentum: 0.95,
    organicDemand: 0.95,
    liquidity: 1.0,
    smartMoney: 1.0,
    fundamentals: 1.1,
    communityDevelopment: 1.0,
    safetyIntegrity: 1.15,
    catalysts: 1.05,
    timing: 1.0,
  },
  Presale: {
    narrative: 1.05,
    momentum: 0.65,
    organicDemand: 0.8,
    liquidity: 0.65,
    smartMoney: 0.8,
    fundamentals: 1.15,
    communityDevelopment: 1.1,
    safetyIntegrity: 1.35,
    catalysts: 1.15,
    timing: 1.05,
  },
  "Newly Launched": {
    narrative: 1.1,
    momentum: 1.15,
    organicDemand: 1.15,
    liquidity: 1.05,
    smartMoney: 1.0,
    fundamentals: 0.8,
    communityDevelopment: 0.9,
    safetyIntegrity: 1.3,
    catalysts: 1.0,
    timing: 1.15,
  },
  "Mature Asset": {
    narrative: 0.8,
    momentum: 0.8,
    organicDemand: 0.9,
    liquidity: 1.15,
    smartMoney: 1.05,
    fundamentals: 1.25,
    communityDevelopment: 1.05,
    safetyIntegrity: 1.2,
    catalysts: 0.9,
    timing: 0.85,
  },
  Unknown: {
    narrative: 1,
    momentum: 1,
    organicDemand: 1,
    liquidity: 1,
    smartMoney: 1,
    fundamentals: 1,
    communityDevelopment: 1,
    safetyIntegrity: 1.15,
    catalysts: 1,
    timing: 1,
  },
};

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

function lower(value = "") {
  return String(value || "").toLowerCase();
}

function getPath(object = {}, path = "") {
  return String(path)
    .split(".")
    .reduce((value, key) => (value === undefined || value === null ? undefined : value[key]), object);
}

function first(project = {}, paths = []) {
  for (const path of paths) {
    const value = getPath(project, path);
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return null;
}

function average(values = []) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + num(value), 0) / values.length;
}

function weightedAverage(items = []) {
  const active = items.filter((item) => item.weight > 0);
  const weight = active.reduce((sum, item) => sum + item.weight, 0);
  if (!weight) return 0;
  return active.reduce((sum, item) => sum + num(item.score) * item.weight, 0) / weight;
}

function marketCap(project = {}) {
  return num(first(project, ["circulatingMarketCapUsd", "circulatingMarketCap", "marketCap", "estimatedMarketCapUsd"]));
}

function liquidityUsd(project = {}) {
  return num(
    first(project, [
      "stableExitLiquidityUsd",
      "hardExitLiquidityUsd",
      "dexLiquidityUsd",
      "liquidityUsd",
      "liquidity",
      "finalLiquidityUsd",
      "activeLiquidityUsd",
    ])
  );
}

function volume24h(project = {}) {
  return num(first(project, ["volume24h", "volume", "marketData.volume24h", "rawCandidate.volume24h"]));
}

function priceChange24h(project = {}) {
  return num(first(project, ["priceChange24h", "price_change_percentage_24h", "marketData.priceChange24h"]));
}

function priceChange7d(project = {}) {
  return num(first(project, ["priceChange7d", "price_change_percentage_7d_in_currency", "marketData.priceChange7d"]));
}

function routeVerified(project = {}) {
  return Boolean(
    project.purchaseRouteConfirmed === true ||
      project.executionRouteAvailable === true ||
      project.purchaseRoute?.purchasable === true ||
      project.smallCapHunter?.purchaseRoute?.purchasable === true ||
      project.proofOfAlphaExecutionTwinSelected === true ||
      project.proofOfAlphaExecutionTwin?.route?.detected === true ||
      ["VERIFIED", "PARTIALLY_VERIFIED"].includes(project.executionStatus)
  );
}

function identityVerified(project = {}) {
  return Boolean(
    project.identityVerified === true ||
      project.contractVerified === true ||
      project.projectIdentityVerdict === "Identity Resolved" ||
      ["VERIFIED_CONTRACT", "VERIFIED_LISTING"].includes(project.finalIdentityState || project.identityState)
  );
}

function tokenAddress(project = {}) {
  return first(project, [
    "finalContractAddress",
    "canonicalAddress",
    "contractAddress",
    "tokenAddress",
    "address",
    "baseToken.address",
  ]);
}

function poolAddress(project = {}) {
  return first(project, ["primaryTradablePool", "poolAddress", "pairAddress", "finalPairAddress"]);
}

function chain(project = {}) {
  return first(project, ["canonicalChain", "finalChain", "chain", "network", "chainId"]);
}

function isStale(project = {}) {
  const stamp = first(project, [
    "updatedAt",
    "lastUpdated",
    "dataTimestamp",
    "collectedAt",
    "marketData.updatedAt",
    "rawCandidate.updatedAt",
  ]);
  if (!stamp) return false;
  const parsed = new Date(stamp).getTime();
  if (!Number.isFinite(parsed)) return false;
  return Date.now() - parsed > 48 * 60 * 60 * 1000;
}

function fieldStatus(project = {}, path = "") {
  const value = getPath(project, path);
  if (isStale(project)) return "STALE";
  if (value === undefined || value === null || value === "") return "UNKNOWN";
  if (typeof value === "boolean") return value ? "VERIFIED" : "VERIFIED_ABSENT";
  if (typeof value === "number") return value > 0 ? "VERIFIED" : "UNKNOWN";
  if (Array.isArray(value)) return value.length ? "VERIFIED" : "VERIFIED_ABSENT";
  return "VERIFIED";
}

function scoreValue(project = {}, path = "") {
  const value = getPath(project, path);
  if (value === true) return 85;
  if (value === false) return 0;

  const numeric = num(value);
  if (/(^liquidity$|liquidityUsd|stableExitLiquidityUsd|hardExitLiquidityUsd|dexLiquidityUsd|activeLiquidityUsd|finalLiquidityUsd)/i.test(path) && numeric > 0) {
    if (numeric >= 1_000_000) return 92;
    if (numeric >= 250_000) return 82;
    if (numeric >= 75_000) return 68;
    if (numeric >= 25_000) return 48;
    if (numeric >= 5_000) return 24;
    return 8;
  }

  return clamp(numeric);
}

function familyScore(project = {}, definition = {}) {
  const observations = definition.metrics.map(([path, label]) => {
    const status = fieldStatus(project, path);
    return {
      path,
      label,
      status: EVIDENCE_STATUSES.has(status) ? status : "UNKNOWN",
      score: status === "VERIFIED" ? scoreValue(project, path) : 0,
    };
  });
  const score = Math.round(clamp(average(observations.map((item) => item.score))));
  const coverage =
    observations.length === 0
      ? 0
      : Math.round(
          (observations.filter((item) => ["VERIFIED", "VERIFIED_ABSENT"].includes(item.status)).length /
            observations.length) *
            100
        );

  return {
    key: definition.key,
    label: definition.label,
    score,
    coverage,
    status:
      coverage >= 80 ? "VERIFIED" :
      coverage >= 45 ? "PARTIAL" :
      observations.some((item) => item.status === "FAILED") ? "FAILED" :
      observations.some((item) => item.status === "STALE") ? "STALE" :
      "UNKNOWN",
    contributingSignals: observations
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4),
    missingSignals: observations
      .filter((item) => item.status === "UNKNOWN")
      .map((item) => item.label),
    observations,
  };
}

function classifyCategory(project = {}) {
  const text = [
    project.name,
    project.symbol,
    project.category,
    project.narrative,
    project.description,
    ...(project.alphaTags || []),
    ...(project.discoverySources || []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (/presale|pre-sale|ido|ico|token sale|seed round/.test(text)) return "Presale";
  if (/meme|dog|cat|pepe|bonk|shib|brett|wif/.test(text)) return "Meme";
  if (/artificial intelligence|\bai\b|agent|llm|compute|model/.test(text)) return "AI";
  if (/defi|dex|lending|yield|staking|restaking|swap|perp|derivative|liquidity/.test(text)) return "DeFi";
  if (/infra|infrastructure|modular|rollup|bridge|oracle|data availability|sequencer/.test(text)) return "Infrastructure";
  if (/game|gaming|play-to-earn|p2e|metaverse/.test(text)) return "Gaming";
  if (/depin|physical infrastructure|wireless|storage|sensor|gpu/.test(text)) return "DePIN";
  if (/\brwa\b|real world asset|treasury|credit|tokenized/.test(text)) return "RWA";
  if (/layer 1|\bl1\b|monad|sui|aptos|solana|sei|celestia/.test(text)) return "Layer 1";
  if (/layer 2|\bl2\b|base|arbitrum|optimism|zksync|scroll|starknet/.test(text)) return "Layer 2";
  if (/ecosystem|governance|utility token/.test(text)) return "Ecosystem Token";
  if (project.launchAgeDays !== undefined && num(project.launchAgeDays) <= 30) return "Newly Launched";
  if (marketCap(project) >= 500_000_000 || project.marketRank <= 250) return "Mature Asset";
  return "Unknown";
}

function practicalLiquidity(project = {}) {
  const liq = liquidityUsd(project);
  const effectivePool = Math.max(1, liq * 0.5);
  const tradeSizes = [100, 500, 1000, 5000];
  const checks = tradeSizes.map((size) => {
    const slippagePct = Number(clamp((size / (effectivePool + size)) * 100, 0, 100).toFixed(2));
    return {
      tradeSizeUsd: size,
      estimatedSlippagePct: slippagePct,
      status: slippagePct <= 3 ? "GOOD" : slippagePct <= 8 ? "USABLE" : slippagePct <= 15 ? "HIGH_SLIPPAGE" : "POOR",
    };
  });
  const exitCapacityUsd = Math.round(Math.max(0, liq * (num(project.liquidityControlRiskScore) >= 70 ? 0.015 : 0.04)));
  const thousand = checks.find((item) => item.tradeSizeUsd === 1000);

  return {
    liquidityUsd: liq,
    estimatedSlippage100Usd: checks[0].estimatedSlippagePct,
    estimatedSlippage500Usd: checks[1].estimatedSlippagePct,
    estimatedSlippage1000Usd: checks[2].estimatedSlippagePct,
    estimatedSlippage5000Usd: checks[3].estimatedSlippagePct,
    realisticExitCapacityUsd: exitCapacityUsd,
    liquidityQuality:
      liq <= 0 ? "NO_VISIBLE_LIQUIDITY" :
      thousand.estimatedSlippagePct <= 3 ? "DEEP_FOR_SMALL_TRADES" :
      thousand.estimatedSlippagePct <= 8 ? "USABLE_FOR_SMALL_TRADES" :
      thousand.estimatedSlippagePct <= 15 ? "FRAGILE" :
      "TOO_THIN",
    tradeSizeChecks: checks,
  };
}

function classifyMarketStage(project = {}, families = {}) {
  const p24 = priceChange24h(project);
  const p7 = priceChange7d(project);
  const volume = volume24h(project);
  const liq = liquidityUsd(project);
  const momentum = families.momentum?.score || 0;
  const demand = families.organicDemand?.score || 0;
  const smart = families.smartMoney?.score || 0;
  const narrative = families.narrative?.score || 0;
  const liquidityScore = families.liquidity?.score || 0;
  const drawdown = num(project.drawdownFromLocalHighPct || project.localHighDrawdownPct);
  const pumpLegs = num(project.previousPumpLegs || project.pumpLegCount);

  if (!identityVerified(project) || !tokenAddress(project)) return "UNVERIFIED";
  if (liq <= 0 && volume <= 0) return "DEAD";
  if (drawdown >= 65 || p7 <= -55) return "BREAKDOWN";
  if (p7 >= 180 || p24 >= 90 || (pumpLegs >= 3 && p7 >= 80)) return "LATE_CHASE";
  if (
    (p7 >= 90 || p24 >= 50) &&
    (average([demand, smart, liquidityScore, narrative]) < momentum - 15 ||
      demand < 45 ||
      smart < 45 ||
      num(project.organicBuyerScore) < 45 ||
      num(project.buyerRetentionScore) < 45 ||
      num(project.smartWalletArrivalScore) < 45)
  ) {
    return "EXTENDED";
  }
  if (p7 >= 65 || p24 >= 35) return "BREAKOUT";
  if (momentum >= 65 && demand >= 45 && liquidityScore >= 45 && p7 >= 10 && p7 < 65) return "PRE_BREAKOUT";
  if ((project.quietAccumulationDetected || smart >= 55 || demand >= 55) && p7 < 25 && p24 < 18) return "QUIET_ACCUMULATION";
  if (demand >= 45 || narrative >= 50 || smart >= 45) return "EARLY_TRACTION";
  return "DISCOVERED";
}

function hardSafety(project = {}, liquidity = {}, coverageScore = 0, safetyCoverageScore = 0) {
  const blockers = [];
  const warnings = [];
  const contractRisk = Math.max(
    num(project.contractAuthorityRiskScore),
    num(project.honeypotRiskScore),
    project.honeypotDetected ? 100 : 0,
    project.verifiedScam ? 100 : 0
  );
  const liquidityRisk = Math.max(num(project.liquidityControlRiskScore), num(project.liquidityControlRisk));
  const walletRisk = Math.max(num(project.walletClusterRiskScore), num(project.bundledLaunchRiskScore));
  const manipulationRisk = Math.max(num(project.washTradingRiskScore), num(project.activityAuthenticityRiskScore));
  const deployerRisk = num(project.deployerRiskScore);

  if (project.honeypotDetected || project.verifiedScam) blockers.push("Honeypot or verified scam evidence.");
  if (project.sellRestricted || project.sellRestrictionsDetected) blockers.push("Sell restriction detected.");
  if (project.identityConflict || project.finalIdentityState === "CONFLICTED_IDENTITY") blockers.push("Contract identity mismatch.");
  if (project.wrongChainTokenMatch || project.chainMismatch) blockers.push("Wrong-chain token match.");
  if (contractRisk >= 85 || project.instantSafetyStatus === "CRITICAL") blockers.push("Critical contract authority or safety risk.");
  if (liquidityRisk >= 90 || liquidity.liquidityQuality === "NO_VISIBLE_LIQUIDITY") blockers.push("Fake, missing, or unusable exit liquidity.");
  if (walletRisk >= 90) blockers.push("Severe wallet concentration or bundled supply.");
  if (manipulationRisk >= 90) blockers.push("Severe wash trading or fake activity.");
  if (deployerRisk >= 85) blockers.push("Malicious or high-risk deployer history.");
  if (!tokenAddress(project)) blockers.push("Unresolved token contract.");
  if (!poolAddress(project)) warnings.push("Tradable pool is not verified.");
  if (!routeVerified(project)) warnings.push("Coinbase/MetaMask or execution route is not verified.");
  if (coverageScore < 40) warnings.push("Evidence coverage is below the 40% strong-recommendation floor.");
  if (safetyCoverageScore < 50) warnings.push("Safety evidence coverage is too thin; treat missing safety as unresolved risk.");

  let state = "ELIGIBLE";
  if (blockers.length) state = "BLOCKED";
  else if (
    contractRisk >= 70 ||
    liquidityRisk >= 75 ||
    walletRisk >= 75 ||
    manipulationRisk >= 75 ||
    project.instantSafetyStatus === "RESTRICTED" ||
    !identityVerified(project) ||
    safetyCoverageScore < 50
  ) {
    state = "RESTRICTED_RESEARCH";
  } else if (
    warnings.length ||
    contractRisk >= 50 ||
    manipulationRisk >= 55 ||
    ["Meme", "Newly Launched", "Presale"].includes(classifyCategory(project))
  ) {
    state = "SPECULATIVE_ONLY";
  }

  return {
    state,
    blockers,
    warnings,
    contractRisk,
    liquidityRisk,
    walletRisk,
    manipulationRisk,
    deployerRisk,
  };
}

function evidenceCoverage(project = {}, familyMap = {}) {
  const familyValues = Object.values(familyMap);
  const observations = familyValues.flatMap((family) => family.observations || []);
  const failedEngineCount = Object.values(project.engineResults || {}).filter((entry) => entry.status === "FAILED").length;
  const missing = observations.filter((item) => item.status === "UNKNOWN").length;
  const stale = observations.filter((item) => item.status === "STALE").length;
  const failed = observations.filter((item) => item.status === "FAILED").length + failedEngineCount;
  const verified = observations.filter((item) => ["VERIFIED", "VERIFIED_ABSENT"].includes(item.status)).length;
  const evidenceCoverageScore = observations.length ? Math.round((verified / observations.length) * 100) : 0;
  const safetyMissing = familyMap.safetyIntegrity?.missingSignals?.length || 0;
  const dataConfidenceScore = Math.round(
    clamp(evidenceCoverageScore - failed * 4 - stale * 2 - safetyMissing * 2)
  );

  return {
    evidenceCoverageScore,
    missingEvidenceCount: missing,
    staleEvidenceCount: stale,
    failedEngineCount: failedEngineCount,
    dataConfidenceScore,
    uncertaintyScore: Math.round(clamp(100 - dataConfidenceScore + safetyMissing * 2)),
    safetyMissingEvidenceCount: safetyMissing,
  };
}

function multipliers({ coverage = {}, stage = "DISCOVERED", liquidity = {}, route = false } = {}) {
  const evidenceConfidenceMultiplier = Number(
    clamp(coverage.dataConfidenceScore / 100, 0.18, coverage.evidenceCoverageScore < 40 ? 0.42 : 1).toFixed(2)
  );
  const timingMultiplier = Number(
    (
      {
        QUIET_ACCUMULATION: 1.06,
        EARLY_TRACTION: 1.03,
        PRE_BREAKOUT: 1.1,
        BREAKOUT: 0.94,
        EXTENDED: 0.72,
        LATE_CHASE: 0.42,
        DISTRIBUTION: 0.48,
        BREAKDOWN: 0.36,
        DEAD: 0.22,
        UNVERIFIED: 0.62,
        DISCOVERED: 0.82,
      }[stage] || 0.82
    ).toFixed(2)
  );
  const slippage1000 = num(liquidity.estimatedSlippage1000Usd);
  const executionMultiplier = Number(
    clamp(
      (route ? 0.92 : 0.55) -
        (liquidity.liquidityQuality === "TOO_THIN" ? 0.25 : liquidity.liquidityQuality === "FRAGILE" ? 0.12 : 0) -
        (slippage1000 > 15 ? 0.12 : slippage1000 > 8 ? 0.06 : 0),
      0.2,
      1
    ).toFixed(2)
  );

  return {
    evidenceConfidenceMultiplier,
    timingMultiplier,
    executionMultiplier,
  };
}

function explicitRiskPenalty(project = {}, safety = {}, stage = "DISCOVERED", coverage = {}) {
  let penalty = 0;
  penalty += Math.min(18, safety.contractRisk * 0.18);
  penalty += Math.min(14, safety.liquidityRisk * 0.14);
  penalty += Math.min(12, safety.walletRisk * 0.12);
  penalty += Math.min(16, safety.manipulationRisk * 0.16);
  penalty += Math.min(10, safety.deployerRisk * 0.1);
  penalty += Math.min(8, num(project.sellPressureScore) * 0.08);
  penalty += Math.min(8, Math.max(num(project.tokenUnlockRiskScore), num(project.vestingPressureScore)) * 0.08);
  if (stage === "LATE_CHASE") penalty += 16;
  if (stage === "EXTENDED") penalty += 9;
  if (coverage.evidenceCoverageScore < 40) penalty += 12;
  else if (coverage.evidenceCoverageScore < 60) penalty += 6;
  return Math.round(clamp(penalty, 0, 65));
}

function vNextRecommendation(score = 0, safetyState = "ELIGIBLE", coverage = {}, stage = "DISCOVERED") {
  if (safetyState === "BLOCKED") return "Blocked Research";
  if (coverage.evidenceCoverageScore < 40) return "Research Only - Insufficient Evidence";
  if (["LATE_CHASE", "EXTENDED", "BREAKDOWN", "DEAD"].includes(stage)) return "Avoid Buy Ranking - Timing Risk";
  if (safetyState === "RESTRICTED_RESEARCH") return "Restricted Research";
  if (score >= 78 && coverage.evidenceCoverageScore >= 75 && safetyState === "ELIGIBLE") return "Institutional Watch Candidate";
  if (score >= 68 && coverage.evidenceCoverageScore >= 60) return "High-Quality Watch";
  if (score >= 55) return safetyState === "SPECULATIVE_ONLY" ? "Speculative Watch" : "Developing Watch";
  return "Low Priority";
}

function reasonForDifference(project = {}, vNext = {}) {
  const legacy = num(project.legacyScore ?? project.pipelineScore);
  const delta = num(vNext.finalVNextScore) - legacy;
  const reasons = [];
  if (Math.abs(delta) < 5) reasons.push("vNext broadly agrees with the legacy score.");
  if (delta <= -5) {
    if (vNext.evidenceCoverageScore < 60) reasons.push("vNext penalized missing or weak evidence coverage.");
    if (vNext.marketStage === "EXTENDED" || vNext.marketStage === "LATE_CHASE") reasons.push("vNext reduced late-chase or extended timing risk.");
    if (BUY_BLOCKING_SAFETY_STATES.has(vNext.vNextSafetyState)) reasons.push("vNext applied hard safety gating.");
    if (vNext.explicitRiskPenalty > 0) reasons.push("vNext exposed explicit risk penalties instead of hiding them in averages.");
  }
  if (delta >= 5) {
    if (vNext.marketStage === "PRE_BREAKOUT" || vNext.marketStage === "QUIET_ACCUMULATION") reasons.push("vNext rewarded early-stage timing.");
    if (vNext.evidenceCoverageScore >= 75) reasons.push("vNext rewarded broad evidence coverage.");
    if (vNext.vNextSafetyState === "ELIGIBLE") reasons.push("vNext found no hard safety block.");
  }
  return reasons.slice(0, 4).join(" ");
}

function qualityRatings(families = {}, safety = {}, coverage = {}, stage = "DISCOVERED") {
  const momentum = families.momentum?.score || 0;
  const catalysts = families.catalysts?.score || 0;
  const timing = families.timing?.score || 0;
  const liquidity = families.liquidity?.score || 0;
  const fundamentals = families.fundamentals?.score || 0;
  const communityDevelopment = families.communityDevelopment?.score || 0;
  const narrative = families.narrative?.score || 0;
  const organic = families.organicDemand?.score || 0;
  const smartMoney = families.smartMoney?.score || 0;

  return {
    preBreakoutProbability: Math.round(clamp(average([momentum, catalysts, timing, organic]) - (stage === "EXTENDED" ? 20 : stage === "LATE_CHASE" ? 35 : 0))),
    shortTermTradeQuality: Math.round(clamp(average([momentum, liquidity, smartMoney, timing]) - safety.manipulationRisk * 0.15)),
    fundamentalQuality: Math.round(clamp(average([fundamentals, communityDevelopment, families.safetyIntegrity?.score || 0]))),
    longTermInvestmentQuality: Math.round(clamp(average([fundamentals, communityDevelopment, catalysts, families.safetyIntegrity?.score || 0]) - safety.contractRisk * 0.12)),
    narrativeStrength: Math.round(clamp(narrative)),
    liquidityQuality: Math.round(clamp(liquidity)),
    smartMoneyStrength: Math.round(clamp(smartMoney)),
    manipulationRisk: Math.round(clamp(safety.manipulationRisk)),
    contractRisk: Math.round(clamp(safety.contractRisk)),
    evidenceConfidence: Math.round(clamp(coverage.dataConfidenceScore)),
  };
}

function qualitySummary(category = "Unknown", ratings = {}, stage = "DISCOVERED") {
  if (ratings.shortTermTradeQuality >= 60 && ratings.fundamentalQuality < 45) {
    return `High-momentum speculative ${category} trade profile, but weak long-term fundamentals.`;
  }
  if (ratings.fundamentalQuality >= 65 && ratings.shortTermTradeQuality < 45) {
    return `Fundamentally stronger ${category} profile, but short-term trade quality is not proven.`;
  }
  if (stage === "LATE_CHASE" || stage === "EXTENDED") {
    return `${category} profile has moved into ${stage}; vNext avoids treating momentum as early alpha.`;
  }
  return `${category} profile separated into trade quality, project quality, evidence confidence, and risk.`;
}

export function analyzeScannerVNextProject(project = {}) {
  const projectCategory = classifyCategory(project);
  const familyEntries = FAMILY_DEFINITIONS.map((definition) => familyScore(project, definition));
  const evidenceFamilies = Object.fromEntries(familyEntries.map((entry) => [entry.key, entry]));
  const coverage = evidenceCoverage(project, evidenceFamilies);
  const liquidity = practicalLiquidity(project);
  const marketStage = classifyMarketStage(project, evidenceFamilies);
  const safety = hardSafety(
    project,
    liquidity,
    coverage.evidenceCoverageScore,
    evidenceFamilies.safetyIntegrity?.coverage || 0
  );
  const weights = CATEGORY_WEIGHTS[projectCategory] || CATEGORY_WEIGHTS.Unknown;
  const alphaScore = Math.round(
    clamp(
      weightedAverage(
        Object.entries(evidenceFamilies).map(([key, family]) => ({
          score: family.score,
          weight: weights[key] || 1,
        }))
      )
    )
  );
  const multiplierSet = multipliers({
    coverage,
    stage: marketStage,
    liquidity,
    route: routeVerified(project),
  });
  const riskPenalty = explicitRiskPenalty(project, safety, marketStage, coverage);
  const formulaScore = Math.round(
    clamp(
      alphaScore *
        multiplierSet.evidenceConfidenceMultiplier *
        multiplierSet.timingMultiplier *
        multiplierSet.executionMultiplier -
        riskPenalty
    )
  );
  const finalVNextScore = safety.state === "BLOCKED" ? 0 : formulaScore;
  const ratings = qualityRatings(evidenceFamilies, safety, coverage, marketStage);
  const recommendation = vNextRecommendation(finalVNextScore, safety.state, coverage, marketStage);

  return {
    ...coverage,
    projectCategory,
    vNextProjectCategory: projectCategory,
    marketStage,
    vNextMarketStage: marketStage,
    vNextSafetyState: safety.state,
    vNextSafetyBlockers: safety.blockers,
    vNextSafetyWarnings: safety.warnings,
    practicalLiquidity: liquidity,
    evidenceFamilies,
    deduplicatedEvidenceFamilyScores: Object.fromEntries(
      Object.entries(evidenceFamilies).map(([key, family]) => [key, family.score])
    ),
    alphaScore,
    evidenceConfidenceMultiplier: multiplierSet.evidenceConfidenceMultiplier,
    timingMultiplier: multiplierSet.timingMultiplier,
    executionMultiplier: multiplierSet.executionMultiplier,
    explicitRiskPenalty: riskPenalty,
    finalVNextScore,
    vNextScore: finalVNextScore,
    vNextRecommendation: recommendation,
    vNextBuyEligible: safety.state === "ELIGIBLE" && coverage.evidenceCoverageScore >= 40 && !["EXTENDED", "LATE_CHASE", "BREAKDOWN", "DEAD"].includes(marketStage),
    vNextConfidence:
      coverage.evidenceCoverageScore >= 75 && finalVNextScore >= 70 && safety.state === "ELIGIBLE" ? "Institutional" :
      coverage.evidenceCoverageScore >= 60 && finalVNextScore >= 58 ? "High" :
      coverage.evidenceCoverageScore >= 40 && finalVNextScore >= 42 ? "Developing" :
      "Low",
    vNextScoreFormula: {
      alphaScore,
      evidenceConfidenceMultiplier: multiplierSet.evidenceConfidenceMultiplier,
      timingMultiplier: multiplierSet.timingMultiplier,
      executionMultiplier: multiplierSet.executionMultiplier,
      explicitRiskPenalty: riskPenalty,
      finalVNextScore,
      calculation: `${alphaScore} x ${multiplierSet.evidenceConfidenceMultiplier} x ${multiplierSet.timingMultiplier} x ${multiplierSet.executionMultiplier} - ${riskPenalty} = ${finalVNextScore}`,
    },
    tradeQualityRatings: ratings,
    preBreakoutProbability: ratings.preBreakoutProbability,
    shortTermTradeQuality: ratings.shortTermTradeQuality,
    fundamentalQuality: ratings.fundamentalQuality,
    longTermInvestmentQuality: ratings.longTermInvestmentQuality,
    narrativeStrength: ratings.narrativeStrength,
    liquidityQuality: ratings.liquidityQuality,
    smartMoneyStrength: ratings.smartMoneyStrength,
    manipulationRisk: ratings.manipulationRisk,
    contractRisk: ratings.contractRisk,
    evidenceConfidence: ratings.evidenceConfidence,
    qualitySeparationSummary: qualitySummary(projectCategory, ratings, marketStage),
  };
}

export function applyScannerVNextScoring(projects = []) {
  const safeProjects = Array.isArray(projects) ? projects : [];
  const withLegacy = safeProjects.map((project, index) => ({
    ...project,
    legacyScore: Math.round(clamp(project.pipelineScore ?? project.opportunityScore ?? project.score ?? project.legacyScore)),
    legacyRank: project.legacyRank || project.pipelineRank || index + 1,
  }));
  const analyzed = withLegacy.map((project) => {
    const vNext = analyzeScannerVNextProject(project);
    const recommendationDifference =
      Math.abs(num(vNext.finalVNextScore) - num(project.legacyScore)) < 5
        ? "SIMILAR"
        : num(vNext.finalVNextScore) > num(project.legacyScore)
          ? "VNEXT_UPGRADE"
          : "VNEXT_DOWNGRADE";

    return {
      ...project,
      ...vNext,
      recommendationDifference,
      reasonForDifference: reasonForDifference(project, vNext),
    };
  });
  const vNextRanks = new Map(
    [...analyzed]
      .sort((a, b) => num(b.vNextScore) - num(a.vNextScore))
      .map((project, index) => [project, index + 1])
  );
  const buyRanks = new Map(
    [...analyzed]
      .filter((project) => project.vNextBuyEligible)
      .sort((a, b) => num(b.vNextScore) - num(a.vNextScore))
      .map((project, index) => [project, index + 1])
  );

  return analyzed.map((project) => ({
    ...project,
    vNextRank: vNextRanks.get(project) || null,
    vNextBuyRank: buyRanks.get(project) || null,
  }));
}

export function summarizeEngineHealthFromProjects(projects = []) {
  const first = Array.isArray(projects) ? projects.find((project) => project.engineHealth) : null;
  if (first?.engineHealth) return first.engineHealth;

  const engineResults = Object.values((Array.isArray(projects) ? projects[0] : null)?.engineResults || {});
  const byStatus = engineResults.reduce((acc, entry) => {
    acc[entry.status] = (acc[entry.status] || 0) + 1;
    return acc;
  }, {});
  const coverageValues = engineResults.map((entry) => num(entry.evidenceCoverage)).filter((value) => value > 0);
  return {
    enginesAttempted: engineResults.length,
    enginesSuccessful: byStatus.SUCCESS || 0,
    enginesPartial: byStatus.PARTIAL || 0,
    enginesFailed: byStatus.FAILED || 0,
    enginesNoData: byStatus.NO_DATA || 0,
    averageEvidenceCoverage: Math.round(average(coverageValues)),
    staleSourceCount: byStatus.STALE || 0,
  };
}
