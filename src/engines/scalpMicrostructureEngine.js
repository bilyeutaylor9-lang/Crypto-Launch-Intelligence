const DEFAULT_TRADE_SIZE_USD = 100;
const DEFAULT_MIN_LIQUIDITY_USD = 25_000;
const DEFAULT_MAX_COST_PCT = 8;
const DEFAULT_MAX_QUOTE_AGE_SECONDS = 300;

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

function getPath(source = {}, path = "") {
  return String(path)
    .split(".")
    .reduce((value, part) => (value && Object.prototype.hasOwnProperty.call(value, part) ? value[part] : undefined), source);
}

function firstValue(source = {}, paths = []) {
  for (const path of paths) {
    const value = getPath(source, path);
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return null;
}

function firstNumber(source = {}, paths = []) {
  const value = firstValue(source, paths);
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function average(values = []) {
  const active = values.map(num).filter((value) => value > 0);
  if (!active.length) return 0;
  return active.reduce((sum, value) => sum + value, 0) / active.length;
}

function configuredNumber(options = {}, key = "", fallback = 0) {
  const optionValue = num(options[key]);
  if (optionValue > 0) return optionValue;
  const envName = `SCALP_${key.replace(/[A-Z]/g, (letter) => `_${letter}`).toUpperCase()}`;
  const envValue = num(process.env[envName]);
  return envValue > 0 ? envValue : fallback;
}

function liquidityUsd(project = {}) {
  return firstNumber(project, [
    "scalpLiquidityUsd",
    "stableExitLiquidityUsd",
    "hardExitLiquidityUsd",
    "dexLiquidityUsd",
    "activeLiquidityUsd",
    "liquidityUsd",
    "executionProof.liquidityUsd",
    "canonicalExecutionRoute.liquidityUsd",
    "marketData.liquidityUsd",
    "rawCandidate.liquidityUsd",
  ]);
}

function orderBookDepthUsd(project = {}) {
  return firstNumber(project, [
    "orderBookDepthUsd",
    "bidDepthUsd",
    "askDepthUsd",
    "executionProof.orderBookDepthUsd",
    "canonicalExecutionRoute.orderBookDepthUsd",
    "route.orderBookDepthUsd",
  ]);
}

function marketCapUsd(project = {}) {
  return firstNumber(project, [
    "circulatingMarketCapUsd",
    "verifiedMarketCap",
    "marketCapUsd",
    "marketCap",
    "estimatedMarketCapUsd",
    "sevenDayTenXMarketCap",
    "marketData.marketCapUsd",
    "rawCandidate.marketCapUsd",
  ]);
}

function priceChange24hPct(project = {}) {
  return firstNumber(project, [
    "sevenDayTenXPriceExtension.priceChange24hPct",
    "priceChange24hPct",
    "priceChange24h",
    "marketData.priceChange24hPct",
    "rawCandidate.priceChange24hPct",
  ]);
}

function priceChange7dPct(project = {}) {
  return firstNumber(project, [
    "sevenDayTenXPriceExtension.priceChange7dPct",
    "priceChange7dPct",
    "priceChange7d",
    "marketData.priceChange7dPct",
    "rawCandidate.priceChange7dPct",
  ]);
}

function routeStatus(project = {}) {
  return String(
    firstValue(project, [
      "executionStatus",
      "routeStatus",
      "canonicalExecutionRoute.verificationStatus",
      "executionProof.verificationStatus",
      "purchaseRoute.verificationStatus",
    ]) || ""
  ).toUpperCase();
}

function verifiedRouteStatus(status = "", mode = "buy") {
  const normalized = String(status || "").toUpperCase();
  if (/PARTIAL|PARTIALLY|DETECTED|PRELIMINARY|UNVERIFIED|UNKNOWN|NEEDS_REVIEW/.test(normalized)) {
    return false;
  }
  const buyPattern = /VERIFIED|CONFIRMED|READY|TRADABLE/;
  const sellPattern = /VERIFIED|CONFIRMED/;
  return mode === "sell" ? sellPattern.test(normalized) : buyPattern.test(normalized);
}

function buyRouteAvailable(project = {}) {
  const status = routeStatus(project);
  return Boolean(
    project.purchaseRouteConfirmed === true ||
      project.buyRouteAvailable === true ||
      project.executionRouteAvailable === true ||
      project.executionProof?.buyRouteAvailable === true ||
      project.canonicalExecutionRoute?.buyRouteAvailable === true ||
      project.proofOfAlphaExecutionTwin?.route?.detected === true ||
      verifiedRouteStatus(status, "buy")
  );
}

function sellRouteAvailable(project = {}) {
  const status = routeStatus(project);
  return Boolean(
    project.sellRouteAvailable === true ||
      project.executionProof?.sellRouteAvailable === true ||
      project.canonicalExecutionRoute?.sellRouteAvailable === true ||
      project.purchaseRoute?.sellable === true ||
      project.proofOfAlphaExecutionTwin?.route?.sellDetected === true ||
      verifiedRouteStatus(status, "sell")
  );
}

function quoteAgeSeconds(project = {}) {
  const explicit = firstNumber(project, [
    "quoteAgeSeconds",
    "executionProof.quoteAgeSeconds",
    "canonicalExecutionRoute.quoteAgeSeconds",
    "purchaseRoute.quoteAgeSeconds",
  ]);
  if (explicit > 0) return explicit;

  const timestamp = firstValue(project, [
    "quoteTimestamp",
    "executionProof.quoteTimestamp",
    "canonicalExecutionRoute.quoteTimestamp",
    "purchaseRoute.quoteTimestamp",
    "observedAt",
  ]);
  const parsed = timestamp ? Date.parse(timestamp) : Number.NaN;
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.round((Date.now() - parsed) / 1000));
}

function estimatedRouteCostPct(project = {}, tradeSizeUsd = DEFAULT_TRADE_SIZE_USD) {
  const spreadPct = firstNumber(project, [
    "spreadPct",
    "bidAskSpreadPct",
    "executionProof.spreadPct",
    "canonicalExecutionRoute.spreadPct",
  ]);
  const explicitSlippagePct = firstNumber(project, [
    "estimatedRoundTripSlippagePct",
    "slippagePct",
    "estimatedSlippagePct",
    "executionProof.estimatedRoundTripSlippagePct",
    "executionProof.estimatedSlippagePct",
    "canonicalExecutionRoute.estimatedRoundTripSlippagePct",
    "canonicalExecutionRoute.estimatedSlippagePct",
  ]);
  const priceImpactPct = firstNumber(project, [
    "priceImpactPct",
    "estimatedPriceImpactPct",
    "executionProof.priceImpactPct",
    "canonicalExecutionRoute.priceImpactPct",
  ]);
  const buyTaxPct = firstNumber(project, ["buyTaxPct", "executionProof.buyTaxPct", "security.buyTaxPct"]);
  const sellTaxPct = firstNumber(project, ["sellTaxPct", "executionProof.sellTaxPct", "security.sellTaxPct"]);
  const gasUsd = firstNumber(project, [
    "estimatedGasUsd",
    "gasUsd",
    "executionProof.estimatedGasUsd",
    "canonicalExecutionRoute.estimatedGasUsd",
  ]);
  const feesUsd = firstNumber(project, [
    "estimatedFeesUsd",
    "feeUsd",
    "executionProof.estimatedFeesUsd",
    "canonicalExecutionRoute.estimatedFeesUsd",
  ]);
  const liquidity = liquidityUsd(project);
  const ammImpactEstimate = liquidity > 0 ? (tradeSizeUsd / liquidity) * 200 : 0;
  const routeFeePct = tradeSizeUsd > 0 ? ((gasUsd + feesUsd) / tradeSizeUsd) * 100 : 0;
  const roundTripSlippagePct = explicitSlippagePct || priceImpactPct * 2 || ammImpactEstimate;

  return {
    spreadPct,
    roundTripSlippagePct,
    priceImpactPct: priceImpactPct || ammImpactEstimate / 2,
    buyTaxPct,
    sellTaxPct,
    gasUsd,
    feesUsd,
    routeFeePct,
    totalCostPct: clamp(spreadPct + roundTripSlippagePct + buyTaxPct + sellTaxPct + routeFeePct, 0, 1000),
  };
}

function safetyBlocked(project = {}) {
  const text = [
    ...(project.sevenDayTenXBlockers || []),
    ...(project.finalSelectionBlockers || []),
    ...(project.sniperBlockingReasons || []),
    ...(project.scamRiskReasons || []),
  ]
    .join(" ")
    .toLowerCase();
  const finalSelectionBlocked = project.finalSelectionState === "BLOCKED";
  const hasSafetyBlockerText =
    /honeypot|cannot sell|sell restricted|verified scam|identity conflict|contract mismatch|chain mismatch|blacklist|freeze authority|critical safety|malicious|trap token|owner can drain|liquidity removal/.test(
      text
    );

  return Boolean(
    project.honeypotDetected ||
      project.verifiedScam ||
      project.sellRestricted ||
      project.identityConflict ||
      project.canonicalIdentityHardBlock ||
      (finalSelectionBlocked && hasSafetyBlockerText) ||
      project.instantSafetyStatus === "CRITICAL" ||
      num(project.contractAuthorityRiskScore) >= 70 ||
      num(project.liquidityControlRiskScore) >= 75 ||
      num(project.washTradingRiskScore) >= 75 ||
      hasSafetyBlockerText
  );
}

function lateChase(project = {}) {
  const status = String(
    project.sevenDayTenXLateChaseStatus || project.preBreakoutMomentumStage || project.sniperState || project.prePump?.status || ""
  ).toUpperCase();
  return /ALREADY_10X|LATE_CHASE|ALREADY_PUMPED|EXTENDED/.test(status) || priceChange24hPct(project) >= 85 || priceChange7dPct(project) >= 220;
}

function depthScore(project = {}, tradeSizeUsd = DEFAULT_TRADE_SIZE_USD) {
  const liquidity = liquidityUsd(project);
  const orderBookDepth = orderBookDepthUsd(project);
  const depth = Math.max(liquidity, orderBookDepth);
  if (depth <= 0) return 0;
  const coverage = depth / Math.max(tradeSizeUsd, 1);
  if (coverage >= 1500) return 100;
  if (coverage >= 800) return 92;
  if (coverage >= 350) return 82;
  if (coverage >= 150) return 68;
  if (coverage >= 75) return 52;
  if (coverage >= 30) return 34;
  return 12;
}

function costScore(totalCostPct = 0) {
  if (totalCostPct <= 1) return 98;
  if (totalCostPct <= 2.5) return 88;
  if (totalCostPct <= 5) return 72;
  if (totalCostPct <= 8) return 54;
  if (totalCostPct <= 12) return 32;
  return 10;
}

function extensionScore(project = {}) {
  const change24h = priceChange24hPct(project);
  const change7d = priceChange7dPct(project);
  if (lateChase(project)) return 5;
  if (change24h >= 0 && change24h <= 35 && change7d >= -20 && change7d <= 110) return 94;
  if (change24h <= 60 && change7d <= 170) return 74;
  if (change24h < 0 && change7d < 0) return 42;
  return 58;
}

function routeScore(project = {}, maxQuoteAgeSeconds = DEFAULT_MAX_QUOTE_AGE_SECONDS) {
  const buy = buyRouteAvailable(project);
  const sell = sellRouteAvailable(project);
  const age = quoteAgeSeconds(project);
  const fresh = age === null ? null : age <= maxQuoteAgeSeconds;
  if (buy && sell && fresh === true) return 100;
  if (buy && sell && fresh === null) return 78;
  if (buy && sell) return 58;
  if (buy || sell) return 28;
  return 0;
}

function riskPenalty(project = {}) {
  return average([
    project.trapRiskScore,
    project.contractAuthorityRiskScore,
    project.liquidityControlRiskScore,
    project.washTradingRiskScore,
    project.walletClusterRiskScore,
    project.deployerRiskScore,
    project.sellPressureScore,
  ]);
}

export function analyzeScalpMicrostructure(project = {}, options = {}) {
  const tradeSizeUsd = configuredNumber(options, "tradeSizeUsd", DEFAULT_TRADE_SIZE_USD);
  const minLiquidityUsd = configuredNumber(options, "minLiquidityUsd", DEFAULT_MIN_LIQUIDITY_USD);
  const maxCostPct = configuredNumber(options, "maxTotalCostPct", DEFAULT_MAX_COST_PCT);
  const maxQuoteAgeSeconds = configuredNumber(options, "maxQuoteAgeSeconds", DEFAULT_MAX_QUOTE_AGE_SECONDS);
  const liquidity = liquidityUsd(project);
  const depth = Math.max(liquidity, orderBookDepthUsd(project));
  const routeCost = estimatedRouteCostPct(project, tradeSizeUsd);
  const quoteAge = quoteAgeSeconds(project);
  const buyReady = buyRouteAvailable(project);
  const sellReady = sellRouteAvailable(project);
  const blockers = [];
  const warnings = [];

  if (safetyBlocked(project)) blockers.push("SCALP_SAFETY_BLOCK");
  if (lateChase(project)) blockers.push("SCALP_LATE_CHASE_OR_ALREADY_EXTENDED");
  if (!buyReady || !sellReady) blockers.push("SCALP_BUY_AND_SELL_ROUTE_NOT_VERIFIED");
  if (liquidity < minLiquidityUsd) blockers.push("SCALP_LIQUIDITY_BELOW_MINIMUM");
  if (routeCost.totalCostPct > maxCostPct) blockers.push("SCALP_ROUTE_COST_TOO_HIGH");

  if (quoteAge === null) warnings.push("FRESH_QUOTE_REQUIRED_BEFORE_ANY_REAL_TRADE");
  if (quoteAge !== null && quoteAge > maxQuoteAgeSeconds) warnings.push("QUOTE_STALE_REFRESH_ROUTE_BEFORE_RESEARCH");
  if (num(project.routeHopCount || project.canonicalExecutionRoute?.routeHopCount) > 2) warnings.push("ROUTE_COMPLEXITY_REQUIRES_MANUAL_REVIEW");
  if (marketCapUsd(project) > 0 && liquidity / marketCapUsd(project) < 0.01) warnings.push("LOW_LIQUIDITY_TO_MARKET_CAP_RATIO");

  const componentScores = {
    routeScore: routeScore(project, maxQuoteAgeSeconds),
    depthScore: depthScore(project, tradeSizeUsd),
    costScore: costScore(routeCost.totalCostPct),
    extensionScore: extensionScore(project),
    flowScore: average([
      project.capitalMigrationScore,
      project.capitalFlowScore,
      project.buyerBreadthAccelerationScore,
      project.buyPressureScore,
      project.liquidityFormationScore,
      project.liquidityExpansionScore,
    ]),
    organicDemandScore: average([
      project.organicBuyerScore,
      project.buyerRetentionScore,
      project.organicDemandIntegrityScore,
      project.buyerBreadthAccelerationScore,
    ]),
    safetyScore: clamp(100 - riskPenalty(project)),
    proofScore: average([
      project.sourceTruthScore,
      project.sourceReliabilityScore,
      project.institutionalDataProvenanceScore,
      project.evidenceCoverageScore,
      project.opportunityEvidenceCoverage,
    ]),
  };

  const rawScore =
    componentScores.routeScore * 0.18 +
    componentScores.depthScore * 0.18 +
    componentScores.costScore * 0.16 +
    componentScores.extensionScore * 0.14 +
    componentScores.flowScore * 0.14 +
    componentScores.safetyScore * 0.1 +
    componentScores.proofScore * 0.06 +
    componentScores.organicDemandScore * 0.04;
  const warningPenalty = warnings.length * 3;
  const blockerPenalty = blockers.length * 24;
  const score = Math.round(clamp(rawScore - warningPenalty - blockerPenalty));

  let lane = "SCALP_RESEARCH_ONLY";
  if (blockers.includes("SCALP_SAFETY_BLOCK")) lane = "SCALP_NO_TRADE_SAFETY_BLOCK";
  else if (blockers.includes("SCALP_LATE_CHASE_OR_ALREADY_EXTENDED")) lane = "SCALP_NO_TRADE_LATE_CHASE";
  else if (blockers.includes("SCALP_BUY_AND_SELL_ROUTE_NOT_VERIFIED")) lane = "SCALP_NO_TRADE_ROUTE_BLOCK";
  else if (blockers.includes("SCALP_LIQUIDITY_BELOW_MINIMUM")) lane = "SCALP_NO_TRADE_THIN_LIQUIDITY";
  else if (blockers.includes("SCALP_ROUTE_COST_TOO_HIGH")) lane = "SCALP_NO_TRADE_HIGH_COST";
  else if (score >= 78) lane = "SCALP_ACTIONABLE_RESEARCH";
  else if (score >= 64) lane = "SCALP_WATCHLIST";

  return {
    ...project,
    scalpMicrostructureScore: score,
    scalpMicrostructureLane: lane,
    scalpResearchQualified: lane === "SCALP_ACTIONABLE_RESEARCH",
    scalpNoTrade: lane.startsWith("SCALP_NO_TRADE"),
    scalpMicrostructureBlockers: blockers,
    scalpMicrostructureWarnings: warnings,
    scalpEstimatedTotalCostPct: Math.round(routeCost.totalCostPct * 100) / 100,
    scalpTradeSizeUsd: tradeSizeUsd,
    scalpLiquidityUsd: liquidity,
    scalpDepthUsd: depth,
    scalpTradeSizeToDepthPct: depth > 0 ? Math.round((tradeSizeUsd / depth) * 10000) / 100 : 0,
    scalpQuoteAgeSeconds: quoteAge,
    scalpMicrostructure: {
      name: "Scalp Microstructure Engine",
      objective:
        "Research short-horizon tradeability using verified route, sell path, depth, cost, extension, safety, and flow evidence.",
      disclaimer:
        "Research output only. Not financial advice, not a buy/sell recommendation, and not a profit guarantee.",
      lane,
      score,
      tradeSizeUsd,
      liquidityUsd: liquidity,
      depthUsd: depth,
      marketCapUsd: marketCapUsd(project),
      priceChange24hPct: priceChange24hPct(project),
      priceChange7dPct: priceChange7dPct(project),
      buyRouteAvailable: buyReady,
      sellRouteAvailable: sellReady,
      quoteAgeSeconds: quoteAge,
      maxQuoteAgeSeconds,
      routeCost,
      componentScores,
      blockers,
      warnings,
      requiredBeforeRealTrade: [
        "Refresh live quote immediately before acting.",
        "Confirm both buy and sell simulation for the exact token and chain.",
        "Reject if route cost, slippage, taxes, or extension has moved beyond limits.",
        "Use independent risk controls outside the scanner.",
      ],
    },
  };
}

export function analyzeScalpMicrostructureBatch(projects = [], options = {}) {
  return (Array.isArray(projects) ? projects : []).map((project) => analyzeScalpMicrostructure(project, options));
}

export function summarizeScalpMicrostructure(projects = [], meta = {}) {
  const analyzed = (Array.isArray(projects) ? projects : [])
    .filter((project) => project.scalpMicrostructure)
    .sort((a, b) => num(b.scalpMicrostructureScore) - num(a.scalpMicrostructureScore));
  const actionable = analyzed.filter((project) => project.scalpMicrostructureLane === "SCALP_ACTIONABLE_RESEARCH");
  const watch = analyzed.filter((project) => project.scalpMicrostructureLane === "SCALP_WATCHLIST");
  const noTrade = analyzed.filter((project) => project.scalpNoTrade);

  const compact = (project = {}, rank = null) => ({
    rank,
    symbol: project.symbol || "UNKNOWN",
    name: project.name || "Unknown",
    chain: project.chain || project.canonicalChain || "unknown",
    tokenAddress: project.tokenAddress || project.contractAddress || null,
    poolAddress: project.poolAddress || project.pairAddress || null,
    scalpMicrostructureScore: project.scalpMicrostructureScore || 0,
    scalpMicrostructureLane: project.scalpMicrostructureLane || "UNKNOWN",
    scalpEstimatedTotalCostPct: project.scalpEstimatedTotalCostPct || 0,
    scalpTradeSizeUsd: project.scalpTradeSizeUsd || DEFAULT_TRADE_SIZE_USD,
    scalpLiquidityUsd: project.scalpLiquidityUsd || 0,
    scalpDepthUsd: project.scalpDepthUsd || 0,
    scalpTradeSizeToDepthPct: project.scalpTradeSizeToDepthPct || 0,
    scalpQuoteAgeSeconds: project.scalpQuoteAgeSeconds ?? null,
    buyRouteAvailable: project.scalpMicrostructure?.buyRouteAvailable || false,
    sellRouteAvailable: project.scalpMicrostructure?.sellRouteAvailable || false,
    priceChange24hPct: project.scalpMicrostructure?.priceChange24hPct || 0,
    priceChange7dPct: project.scalpMicrostructure?.priceChange7dPct || 0,
    componentScores: project.scalpMicrostructure?.componentScores || {},
    blockers: project.scalpMicrostructureBlockers || [],
    warnings: project.scalpMicrostructureWarnings || [],
  });

  return {
    generatedAt: new Date().toISOString(),
    scanRunId: meta.scanRunId || meta.runId || process.env.GITHUB_RUN_ID || null,
    codeCommitSha: meta.codeCommitSha || process.env.GITHUB_SHA || null,
    dataCutoffTimestamp: meta.dataCutoffTimestamp || new Date().toISOString(),
    status: analyzed.length ? "PASS" : "NO_PROJECTS",
    mode: "SCALP_MICROSTRUCTURE_RESEARCH",
    disclaimer:
      "Research output only. Not financial advice, not a buy/sell recommendation, and not a profit guarantee.",
    projectsAnalyzed: analyzed.length,
    actionableResearchCount: actionable.length,
    watchlistCount: watch.length,
    noTradeCount: noTrade.length,
    topScalpMicrostructureResearch: actionable.slice(0, 10).map((project, index) => compact(project, index + 1)),
    scalpWatchlist: watch.slice(0, 25).map((project, index) => compact(project, index + 1)),
    noTradeLanes: noTrade.slice(0, 50).map((project, index) => compact(project, index + 1)),
    operatingRules: [
      "Never treat route detection as enough; the sell route must be verified.",
      "Reject late-chase setups even when the headline score is high.",
      "Penalize route cost, stale quotes, taxes, spread, slippage, and shallow depth separately.",
      "Keep this report as research-only until a fresh live quote is checked.",
    ],
  };
}
