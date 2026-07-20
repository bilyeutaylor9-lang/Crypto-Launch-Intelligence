import { normalizeChainId } from "../identity/strictIdentityValidators.js";

const DEFAULT_CEX_VENUES = [
  "Coinbase",
  "Kraken",
  "Binance",
  "Binance.US",
  "Gemini",
  "OKX",
  "Bybit",
  "KuCoin",
  "Gate",
  "MEXC",
  "Bitget",
  "Crypto.com",
  "HTX",
  "Upbit",
  "Bithumb",
];

const DEX_VENUES = {
  ethereum: ["Uniswap", "SushiSwap", "Curve", "Balancer"],
  base: ["Uniswap", "Aerodrome", "BaseSwap", "SushiSwap", "Curve"],
  bsc: ["PancakeSwap", "SushiSwap"],
  arbitrum: ["Uniswap", "Camelot", "SushiSwap", "Curve"],
  polygon: ["Uniswap", "QuickSwap", "SushiSwap", "Curve", "Balancer"],
  optimism: ["Uniswap", "Velodrome", "SushiSwap", "Curve"],
  avalanche: ["Trader Joe", "PancakeSwap", "SushiSwap"],
  solana: ["Jupiter", "Raydium", "Meteora", "Orca", "PumpSwap"],
  sui: ["Cetus", "Turbos", "Aftermath"],
  ton: ["STON.fi", "DeDust"],
  cosmos: ["Osmosis", "Astroport"],
};

const WALLET_FAMILIES = {
  evm: ["MetaMask", "Rabby", "Coinbase Wallet", "Trust Wallet"],
  solana: ["Phantom", "Solflare", "Backpack", "Trust Wallet"],
  sui: ["Sui Wallet", "Slush", "Trust Wallet"],
  ton: ["Tonkeeper", "Trust Wallet"],
  cosmos: ["Keplr", "Leap", "Trust Wallet"],
};

const CHAIN_FAMILY = {
  ethereum: "evm",
  base: "evm",
  bsc: "evm",
  arbitrum: "evm",
  polygon: "evm",
  optimism: "evm",
  avalanche: "evm",
  solana: "solana",
  sui: "sui",
  ton: "ton",
  cosmos: "cosmos",
};

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

function text(value = "") {
  return String(value ?? "").trim();
}

function lower(value = "") {
  return text(value).toLowerCase();
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function unique(values = []) {
  return [...new Set(values.map(text).filter(Boolean))];
}

function csv(value = "", fallback = []) {
  const raw = text(value);
  return raw ? raw.split(",").map((item) => item.trim()).filter(Boolean) : fallback;
}

function boolEnv(value, fallback = true) {
  if (value === undefined || value === null || value === "") return fallback;
  return /^(true|1|yes|on)$/i.test(String(value));
}

function numberEnv(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function resolveAccessibilityPreferences(env = process.env) {
  return {
    preferredExchanges: csv(env.PREFERRED_EXCHANGES, ["Coinbase", "Kraken", "Binance.US", "Gemini"]),
    preferredWallets: csv(env.PREFERRED_WALLETS, ["MetaMask", "Rabby", "Phantom", "Coinbase Wallet", "Keplr"]),
    supportedChains: csv(env.SUPPORTED_CHAINS, [
      "ethereum",
      "base",
      "bsc",
      "arbitrum",
      "polygon",
      "optimism",
      "avalanche",
      "solana",
      "sui",
      "ton",
      "cosmos",
    ]).map((chain) => normalizeRouteChain(chain)).filter(Boolean),
    allowDexRoutes: boolEnv(env.ALLOW_DEX_ROUTES, true),
    allowCexRoutes: boolEnv(env.ALLOW_CEX_ROUTES, true),
    allowBridgedRoutes: boolEnv(env.ALLOW_BRIDGED_ROUTES, true),
    allowNewWalletSetup: boolEnv(env.ALLOW_NEW_WALLET_SETUP, true),
    maxRouteHops: numberEnv(env.MAX_ROUTE_HOPS, 3),
    maxBridgeRisk: numberEnv(env.MAX_BRIDGE_RISK, 55),
    maxEstimatedSlippagePct: numberEnv(env.MAX_ESTIMATED_SLIPPAGE_PCT, 8),
    maxTotalRouteCostUsd: numberEnv(env.MAX_TOTAL_ROUTE_COST_USD, 50),
    userRegion: text(env.USER_REGION || "US"),
    userState: text(env.USER_STATE || ""),
  };
}

function venueCatalog() {
  return [
    ...DEFAULT_CEX_VENUES.map((venue) => ({ venue, routeType: "CEX", chain: null })),
    ...Object.entries(DEX_VENUES).flatMap(([chain, venues]) =>
      venues.map((venue) => ({
        venue,
        routeType: venue === "Jupiter" ? "DEX_AGGREGATOR" : "DEX",
        chain,
      }))
    ),
  ];
}

function normalizeVenue(value = "") {
  const raw = lower(value);
  if (!raw) return null;
  return venueCatalog().find(({ venue }) =>
    raw === lower(venue) ||
    raw.includes(lower(venue).replace(/\./g, "")) ||
    raw.includes(lower(venue))
  )?.venue || text(value);
}

function knownCatalogVenue(value = "") {
  const raw = lower(value);
  if (!raw) return null;
  return venueCatalog().find(({ venue }) =>
    raw === lower(venue) ||
    raw.includes(lower(venue).replace(/\./g, "")) ||
    raw.includes(lower(venue))
  )?.venue || null;
}

function normalizeRouteChain(value = "") {
  const normalized = normalizeChainId(value);
  const raw = lower(value).replace(/[_\s]+/g, "-");
  if (normalized) return normalized;
  if (["sui", "sui-network"].includes(raw)) return "sui";
  if (["ton", "the-open-network"].includes(raw)) return "ton";
  if (["cosmos", "osmosis", "cosmos-hub"].includes(raw)) return "cosmos";
  return null;
}

function routeFamily(chain = "", routeType = "") {
  if (routeType === "CEX") return "exchange-account";
  return CHAIN_FAMILY[normalizeRouteChain(chain)] || "unknown";
}

function defaultWalletFamily(chain = "", routeType = "") {
  const family = routeFamily(chain, routeType);
  if (family === "exchange-account") return "Exchange Account";
  return WALLET_FAMILIES[family]?.[0] || "Unknown Wallet";
}

function quoteAgeSeconds(route = {}, project = {}) {
  const explicit = route.quoteAgeSeconds ?? project.quoteAgeSeconds ?? project.executionQuoteAgeSeconds;
  if (explicit !== undefined && explicit !== null && explicit !== "") return num(explicit);
  const timestamp = route.quoteTimestamp || route.timestamp || route.updatedAt || project.quoteTimestamp || project.executionQuoteTimestamp || project.updatedAt || project.lastUpdatedAt;
  const parsed = Date.parse(timestamp || "");
  return Number.isFinite(parsed) ? Math.max(0, Math.round((Date.now() - parsed) / 1000)) : null;
}

function first(values = []) {
  return values.find((value) => value !== undefined && value !== null && value !== "") ?? null;
}

function inferMarketPair(project = {}, route = {}) {
  return first([
    route.marketPair,
    route.market,
    route.pair,
    project.marketPair,
    project.marketKey,
    project.symbol && (route.quoteAsset || project.quoteAsset || project.quoteToken)
      ? `${project.symbol}-${route.quoteAsset || project.quoteAsset || project.quoteToken}`
      : null,
  ]);
}

function inferRouteType({ venue = "", chain = "", route = {}, project = {} }) {
  const routeText = lower([route.routeType, route.type, route.source, venue, project.source, project.exchange, project.dex].join(" "));
  if (routeText.includes("cex") || DEFAULT_CEX_VENUES.some((item) => routeText.includes(lower(item)))) return "CEX";
  if (routeText.includes("aggregator") || ["jupiter", "1inch", "matcha", "paraswap"].some((item) => routeText.includes(item))) return "DEX_AGGREGATOR";
  if (venueCatalog().some((item) => item.routeType !== "CEX" && lower(venue).includes(lower(item.venue)))) {
    return venue === "Jupiter" ? "DEX_AGGREGATOR" : "DEX";
  }
  if (chain || route.poolAddress || project.poolAddress || project.pairAddress) return "DEX";
  return "UNKNOWN";
}

function regionAvailability(route = {}, preferences = {}) {
  const raw = upperFirst(route.regionAvailability || route.supportedRegion || route.regionStatus || route.status);
  const lowered = lower(raw);
  if (lowered.includes("451") || lowered.includes("region") || lowered.includes("restricted")) return "REGION_RESTRICTED";
  const regions = array(route.supportedRegions).map((item) => text(item).toUpperCase());
  if (regions.length && preferences.userRegion && !regions.includes(preferences.userRegion.toUpperCase())) return "REGION_RESTRICTED";
  return "AVAILABLE_OR_UNKNOWN";
}

function upperFirst(value = "") {
  return text(value);
}

function bridgeState(route = {}, preferences = {}) {
  const bridgeRequired = route.bridgeRequired === true || lower(route.routeType).includes("bridge");
  const bridgeRisk = num(route.bridgeRisk ?? route.bridgeRiskScore ?? route.bridgeContractRisk);
  if (!bridgeRequired) return "NO_BRIDGE_REQUIRED";
  if (!preferences.allowBridgedRoutes) return "BRIDGE_UNAVAILABLE";
  if (route.wrappedAssetRisk === true || bridgeRisk >= 80) return "WRAPPED_ASSET_RISK";
  if (bridgeRisk > preferences.maxBridgeRisk) return "BRIDGE_HIGH_RISK";
  if (route.bridgeVerified === false || route.bridgeProviderStatus === "UNKNOWN") return "BRIDGE_UNVERIFIED";
  return "BRIDGE_AVAILABLE";
}

function verificationStatus(route = {}, fields = {}) {
  if (route.verificationStatus) return route.verificationStatus;
  if (route.status === "VERIFIED" || route.verified === true) return "VERIFIED";
  const cexIdentity = fields.routeType === "CEX" && fields.marketPair;
  const dexIdentity = ["DEX", "DEX_AGGREGATOR"].includes(fields.routeType) && fields.tokenAddress && (fields.poolAddress || fields.marketPair);
  if (fields.buyRouteAvailable && fields.sellRouteAvailable && (cexIdentity || dexIdentity)) return "VERIFIED";
  if (fields.buyRouteAvailable || fields.sellRouteAvailable || fields.venue !== "UNKNOWN") return "PARTIALLY_VERIFIED";
  return "UNVERIFIED";
}

function normalizeRoute(project = {}, rawRoute = {}, preferences = {}) {
  const canonical = rawRoute.__canonical === true;
  const venue = normalizeVenue(first([
    rawRoute.venue,
    rawRoute.exchange,
    rawRoute.preferredRoute,
    rawRoute.type,
    rawRoute.name,
    project.exchange,
    project.dex,
    project.source,
  ])) || "UNKNOWN";
  const chain = normalizeRouteChain(first([rawRoute.chain, rawRoute.chainId, project.chain, project.chainId, project.network])) ||
    venueCatalog().find((item) => item.venue === venue)?.chain ||
    null;
  const routeType = inferRouteType({ venue, chain, route: rawRoute, project });
  const quoteAge = quoteAgeSeconds(rawRoute, project);
  const buyRouteAvailable = rawRoute.buyRouteAvailable === true || rawRoute.purchasable === true || rawRoute.buy === true || rawRoute.detected === true || rawRoute.verified === true || rawRoute.status === "VERIFIED" || rawRoute.status === "PARTIALLY_VERIFIED" || canonical && project.canonicalExecutionRoute?.buyRouteAvailable === true;
  const sellRouteAvailable = rawRoute.sellRouteAvailable === true || rawRoute.sellable === true || rawRoute.sell === true || rawRoute.sellDetected === true || rawRoute.verified === true || rawRoute.status === "VERIFIED" || canonical && project.canonicalExecutionRoute?.sellRouteAvailable === true;
  const bridgeStatus = bridgeState(rawRoute, preferences);
  const marketPair = inferMarketPair(project, rawRoute);
  const tokenAddress = rawRoute.tokenAddress || rawRoute.contractAddress || rawRoute.contract || project.tokenAddress || project.contractAddress || project.address || null;
  const poolAddress = rawRoute.poolAddress || rawRoute.pairAddress || project.poolAddress || project.pairAddress || null;
  const quoteAsset = rawRoute.quoteAsset || rawRoute.quoteToken || project.quoteAsset || project.quoteToken || null;
  const liquidityUsd = num(rawRoute.liquidityUsd || rawRoute.dexLiquidityUsd || project.canonicalExecutionRoute?.liquidityUsd || project.dexLiquidityUsd || project.liquidityUsd || project.liquidity);
  const orderBookDepthUsd = num(rawRoute.orderBookDepthUsd || rawRoute.orderBookDepth || project.cexOrderBookDepthUsd || project.orderBookDepthUsd);
  const estimatedPriceImpactPct = rawRoute.estimatedPriceImpactPct ?? rawRoute.priceImpactPct ?? null;
  const estimatedRoundTripSlippagePct = rawRoute.estimatedRoundTripSlippagePct ?? rawRoute.estimatedSlippagePct ?? rawRoute.slippagePct ?? project.executionProof?.estimatedSlippage100 ?? null;
  const estimatedGasUsd = rawRoute.estimatedGasUsd ?? rawRoute.gasUsd ?? null;
  const estimatedFeesUsd = rawRoute.estimatedFeesUsd ?? rawRoute.feesUsd ?? null;
  const totalRouteCostUsd = num(estimatedGasUsd) + num(estimatedFeesUsd) + num(rawRoute.bridgeFeeUsd);
  const region = regionAvailability(rawRoute, preferences);
  const fields = {
    venue,
    routeType,
    buyRouteAvailable,
    sellRouteAvailable,
    tokenAddress,
    poolAddress,
    marketPair,
  };
  const verification = verificationStatus(rawRoute, fields);
  const failureReasons = [
    ...array(rawRoute.failureReasons),
    ...(!buyRouteAvailable ? ["Buy route is not verified."] : []),
    ...(!sellRouteAvailable ? ["Sell route is not verified."] : []),
    ...(verification === "UNVERIFIED" ? ["Route authenticity is not verified."] : []),
    ...(region === "REGION_RESTRICTED" ? ["Route is restricted in the configured region."] : []),
    ...(bridgeStatus === "BRIDGE_HIGH_RISK" ? ["Bridge risk exceeds configured limit."] : []),
    ...(bridgeStatus === "BRIDGE_UNVERIFIED" ? ["Bridge route is not verified."] : []),
  ];

  return {
    routeType,
    chain,
    venue,
    walletFamily: rawRoute.walletFamily || defaultWalletFamily(chain, routeType),
    tokenAddress,
    poolAddress,
    marketPair,
    quoteAsset,
    buyRouteAvailable,
    sellRouteAvailable,
    bridgeRequired: rawRoute.bridgeRequired === true || bridgeStatus !== "NO_BRIDGE_REQUIRED",
    bridgeProvider: rawRoute.bridgeProvider || null,
    bridgeRisk: rawRoute.bridgeRisk ?? rawRoute.bridgeRiskScore ?? null,
    bridgeState: bridgeStatus,
    sourceChain: rawRoute.sourceChain || null,
    destinationChain: rawRoute.destinationChain || chain,
    bridgeRoute: rawRoute.bridgeRoute || null,
    bridgeFeeUsd: rawRoute.bridgeFeeUsd ?? null,
    bridgeTimeEstimate: rawRoute.bridgeTimeEstimate || null,
    bridgeLiquidity: rawRoute.bridgeLiquidity ?? null,
    bridgeSecurityStatus: rawRoute.bridgeSecurityStatus || bridgeStatus,
    bridgeContractRisk: rawRoute.bridgeContractRisk ?? null,
    bridgeFailureHistory: rawRoute.bridgeFailureHistory || null,
    wrappedAssetRisk: rawRoute.wrappedAssetRisk === true,
    totalRouteCostUsd,
    totalRouteComplexity: routeComplexityScore({ routeType, bridgeStatus, region, quoteAge, totalRouteCostUsd, preferences }),
    estimatedFeesUsd,
    estimatedGasUsd,
    estimatedPriceImpactPct,
    estimatedRoundTripSlippagePct,
    liquidityUsd: liquidityUsd || null,
    orderBookDepthUsd: orderBookDepthUsd || null,
    exchange: routeType === "CEX" ? venue : null,
    marketStatus: rawRoute.marketStatus || (marketPair ? "DETECTED" : "UNKNOWN"),
    depositStatus: rawRoute.depositStatus || "UNKNOWN",
    withdrawalStatus: rawRoute.withdrawalStatus || "UNKNOWN",
    tradingStatus: rawRoute.tradingStatus || (buyRouteAvailable && sellRouteAvailable ? "TRADING_DETECTED" : "UNKNOWN"),
    supportedRegion: rawRoute.supportedRegion || preferences.userRegion || "UNKNOWN",
    orderBookDepth: orderBookDepthUsd || null,
    spreadPct: rawRoute.spreadPct ?? null,
    estimatedSlippagePct: estimatedRoundTripSlippagePct,
    minimumOrderSize: rawRoute.minimumOrderSize ?? null,
    quoteTimestamp: rawRoute.quoteTimestamp || rawRoute.timestamp || project.quoteTimestamp || project.executionQuoteTimestamp || project.updatedAt || null,
    quoteAgeSeconds: quoteAge,
    source: rawRoute.source || project.source || "route-accessibility",
    regionAvailability: region,
    verificationStatus: verification,
    failureReasons: unique(failureReasons),
  };
}

function routeComplexityScore({ routeType = "", bridgeStatus = "", region = "", quoteAge = null, totalRouteCostUsd = 0, preferences = {} }) {
  let score = 10;
  if (routeType === "DEX") score += 12;
  if (routeType === "DEX_AGGREGATOR") score += 16;
  if (bridgeStatus !== "NO_BRIDGE_REQUIRED") score += 24;
  if (region === "REGION_RESTRICTED") score += 30;
  if (quoteAge === null || quoteAge > 21_600) score += 12;
  if (totalRouteCostUsd > preferences.maxTotalRouteCostUsd) score += 12;
  return Math.round(clamp(score, 0, 100));
}

function routeObjects(project = {}) {
  const routes = [];
  if (project.canonicalExecutionRoute) routes.push({ ...project.canonicalExecutionRoute, __canonical: true, source: "canonical-execution-route" });
  routes.push(project.purchaseRoute, project.executionRoute, ...array(project.executionRoutes));
  routes.push(project.smallCapHunter?.purchaseRoute, project.proofOfAlphaExecutionTwin?.route);
  routes.push(...array(project.purchaseRoute?.routes));
  routes.push(...array(project.smallCapHunter?.purchaseRoute?.routes));
  routes.push(...array(project.proofOfAlphaExecutionTwin?.route?.routes));
  routes.push(project.marketData?.purchaseRoute, project.rawCandidate?.purchaseRoute);
  return routes.filter((route) => route && typeof route === "object");
}

function sourceRoute(project = {}) {
  const sourceText = lower([project.source, project.exchange, project.dex, project.url, project.marketUrl, ...(project.discoverySources || [])].join(" "));
  const venue = knownCatalogVenue(sourceText);
  if (!venue) return null;
  return {
    venue,
    source: project.source || project.exchange || project.dex || "source-route",
    buyRouteAvailable: Boolean(project.priceUsd || project.price || project.liquidityUsd || project.dexLiquidityUsd || project.canonicalExecutionRoute?.buyRouteAvailable),
    sellRouteAvailable: Boolean(project.priceUsd || project.price || project.liquidityUsd || project.dexLiquidityUsd || project.canonicalExecutionRoute?.sellRouteAvailable) && project.honeypotDetected !== true,
    tokenAddress: project.tokenAddress || project.contractAddress || project.address,
    poolAddress: project.poolAddress || project.pairAddress,
    marketPair: project.marketPair || project.marketKey,
    quoteAsset: project.quoteAsset || project.quoteToken,
    liquidityUsd: project.dexLiquidityUsd || project.liquidityUsd,
    orderBookDepthUsd: project.cexOrderBookDepthUsd,
    quoteTimestamp: project.quoteTimestamp || project.updatedAt,
  };
}

function canonicalRoutes(project = {}, preferences = {}) {
  const candidates = [...routeObjects(project)];
  const inferred = sourceRoute(project);
  if (inferred) candidates.push(inferred);
  const normalized = candidates.map((route) => normalizeRoute(project, route, preferences));
  const deduped = new Map();
  for (const route of normalized) {
    const key = [route.routeType, route.chain, route.venue, route.tokenAddress, route.poolAddress, route.marketPair].join("|");
    const existing = deduped.get(key);
    if (!existing || routeScore(route, preferences) > routeScore(existing, preferences)) deduped.set(key, route);
  }
  return [...deduped.values()];
}

function routeVerified(route = {}) {
  return route.verificationStatus === "VERIFIED" &&
    route.buyRouteAvailable === true &&
    route.sellRouteAvailable === true &&
    route.regionAvailability !== "REGION_RESTRICTED" &&
    ["NO_BRIDGE_REQUIRED", "BRIDGE_AVAILABLE"].includes(route.bridgeState) &&
    route.quoteAgeSeconds !== null &&
    route.quoteAgeSeconds <= 21_600;
}

function routeScore(route = {}, preferences = {}) {
  const preferredExchange = route.routeType === "CEX" && preferences.preferredExchanges.some((exchange) => lower(exchange) === lower(route.venue));
  const preferredWallet = preferences.preferredWallets.some((wallet) => lower(wallet) === lower(route.walletFamily));
  const depth = Math.max(num(route.liquidityUsd), num(route.orderBookDepthUsd));
  const depthScore = depth >= 500_000 ? 25 : depth >= 100_000 ? 18 : depth >= 25_000 ? 10 : depth > 0 ? 5 : 0;
  const slippage = route.estimatedRoundTripSlippagePct === null || route.estimatedRoundTripSlippagePct === undefined
    ? 0
    : Number(route.estimatedRoundTripSlippagePct) <= preferences.maxEstimatedSlippagePct ? 15 : -12;
  return Math.round(clamp(
    (routeVerified(route) ? 35 : route.verificationStatus === "PARTIALLY_VERIFIED" ? 18 : 4) +
      (preferredExchange || preferredWallet ? 18 : 0) +
      (route.routeType === "CEX" ? 8 : route.routeType === "DEX_AGGREGATOR" ? 10 : 7) +
      depthScore +
      slippage -
      route.totalRouteComplexity * 0.25
  ));
}

function opportunityScore(project = {}) {
  return Math.round(clamp(Math.max(
    num(project.marketOpportunityScore),
    num(project.opportunityScore),
    num(project.pipelineScore),
    num(project.vNextScore),
    num(project.capitalMigrationScore),
    num(project.smallCapHunterScore),
    num(project.preBreakoutRadarScore),
    num(project.preConsensusBreakoutScore)
  )));
}

function deterministicSafetyBlocked(project = {}) {
  return Boolean(
    project.honeypotDetected === true ||
      project.verifiedScam === true ||
      ["CRITICAL", "RESTRICTED"].includes(project.instantSafetyStatus) ||
      ["HONEYPOT_RISK", "CONTRACT_MISMATCH", "CHAIN_MISMATCH"].includes(project.executionStatus) ||
      num(project.trapRiskScore) >= 90
  );
}

function qualityQualified(project = {}) {
  if (deterministicSafetyBlocked(project)) return false;
  return opportunityScore(project) >= 55 ||
    num(project.capitalMigrationScore) >= 50 ||
    num(project.preBreakoutRadarScore) >= 55 ||
    num(project.smallCapHunterScore) >= 55;
}

function accessibilityLane({ routes = [], bestRoute = null, preferences = {} }) {
  if (!routes.length) return "NO_VERIFIED_ROUTE";
  if (!bestRoute) return "ROUTE_RESEARCH_REQUIRED";
  if (bestRoute.regionAvailability === "REGION_RESTRICTED") return "REGION_RESTRICTED";
  if (!routeVerified(bestRoute)) return "ROUTE_RESEARCH_REQUIRED";
  if (bestRoute.bridgeState !== "NO_BRIDGE_REQUIRED") return "BRIDGE_REQUIRED";
  if (bestRoute.routeType === "CEX") {
    return preferences.preferredExchanges.some((exchange) => lower(exchange) === lower(bestRoute.venue))
      ? "DIRECT_PREFERRED_VENUE"
      : "DIRECT_ALTERNATIVE_CEX";
  }
  if (bestRoute.routeType === "DEX_AGGREGATOR") return "DEX_AGGREGATOR_ROUTE";
  const preferredWallet = preferences.preferredWallets.some((wallet) => lower(wallet) === lower(bestRoute.walletFamily));
  return preferredWallet || preferences.allowNewWalletSetup ? "DIRECT_CHAIN_NATIVE_DEX" : "WALLET_SETUP_REQUIRED";
}

export function analyzeRouteAccessibility(project = {}, options = {}) {
  const preferences = options.preferences || resolveAccessibilityPreferences(options.env || process.env);
  const routes = canonicalRoutes(project, preferences)
    .filter((route) => preferences.allowCexRoutes || route.routeType !== "CEX")
    .filter((route) => preferences.allowDexRoutes || !["DEX", "DEX_AGGREGATOR"].includes(route.routeType));
  const scoredRoutes = routes
    .map((route) => ({ ...route, accessibilityScore: routeScore(route, preferences) }))
    .sort((a, b) => b.accessibilityScore - a.accessibilityScore);
  const verifiedRoutes = scoredRoutes.filter(routeVerified);
  const bestRoute = verifiedRoutes[0] || scoredRoutes[0] || null;
  const coinbaseAvailable = scoredRoutes.some((route) => lower(route.venue) === "coinbase");
  const metamaskCompatible = scoredRoutes.some((route) => lower(route.walletFamily) === "metamask");
  const alternativeRouteAvailable = scoredRoutes.some((route) => lower(route.venue) !== "coinbase" && lower(route.walletFamily) !== "metamask");
  const preferredVenueAvailable = scoredRoutes.some((route) =>
    preferences.preferredExchanges.some((exchange) => lower(exchange) === lower(route.venue)) ||
    preferences.preferredWallets.some((wallet) => lower(wallet) === lower(route.walletFamily))
  );
  const executionReady = Boolean(bestRoute && routeVerified(bestRoute));
  const walletSetupRequired = Boolean(bestRoute && bestRoute.routeType !== "CEX" && !preferences.preferredWallets.some((wallet) => lower(wallet) === lower(bestRoute.walletFamily)));
  const userAccessible = Boolean(
    executionReady &&
      bestRoute.regionAvailability !== "REGION_RESTRICTED" &&
      (bestRoute.routeType === "CEX" ||
        preferences.preferredWallets.some((wallet) => lower(wallet) === lower(bestRoute.walletFamily)) ||
        preferences.allowNewWalletSetup) &&
      bestRoute.totalRouteComplexity <= 70 &&
      bestRoute.totalRouteCostUsd <= preferences.maxTotalRouteCostUsd
  );
  const lane = accessibilityLane({ routes: scoredRoutes, bestRoute, preferences });
  const routeComplexity = bestRoute?.totalRouteComplexity ?? 100;
  const accessibilityWarnings = unique([
    ...(coinbaseAvailable ? [] : ["Coinbase availability is not detected; this is not a project-quality failure."]),
    ...(metamaskCompatible ? [] : ["MetaMask compatibility is not detected; this is not a project-quality failure."]),
    ...(alternativeRouteAvailable ? [] : ["No alternative exchange, wallet, or DEX route is verified yet."]),
    ...(walletSetupRequired ? [`Wallet setup required: ${bestRoute?.walletFamily || "unknown wallet"}.`] : []),
    ...(bestRoute?.regionAvailability === "REGION_RESTRICTED" ? ["Region restriction affects accessibility, not project quality."] : []),
    ...(bestRoute?.bridgeState && !["NO_BRIDGE_REQUIRED", "BRIDGE_AVAILABLE"].includes(bestRoute.bridgeState) ? [`Bridge state ${bestRoute.bridgeState} blocks execution readiness until verified.`] : []),
    ...(bestRoute && !bestRoute.sellRouteAvailable ? ["Sell route is not verified; execution readiness is blocked."] : []),
  ]);
  const missingRouteEvidence = unique(scoredRoutes.flatMap((route) => route.failureReasons || [])).slice(0, 12);
  const supportedWalletFamilies = unique(scoredRoutes.map((route) => route.walletFamily).filter((wallet) => wallet !== "Exchange Account"));

  return {
    ...project,
    researchEligible: !deterministicSafetyBlocked(project),
    qualityQualified: qualityQualified(project),
    executionReady,
    userAccessible,
    preferredVenueAvailable,
    coinbaseAvailable,
    metamaskCompatible,
    alternativeRouteAvailable,
    routeComplexity,
    accessibilityWarnings,
    accessibilityLane: lane,
    supportedWalletFamilies,
    recommendedWalletType: bestRoute?.walletFamily || null,
    walletCompatibilityStatus: supportedWalletFamilies.length ? "SUPPORTED_WALLET_FOUND" : "NO_WALLET_ROUTE_VERIFIED",
    walletSetupRequired,
    hardwareWalletSupport: bestRoute?.routeType === "CEX" ? "EXCHANGE_DEPENDENT" : "UNKNOWN",
    walletWarnings: accessibilityWarnings.filter((warning) => /wallet|metamask|phantom|rabby|keplr|tonkeeper|sui/i.test(warning)),
    canonicalRoutes: scoredRoutes,
    alternativeRoutes: scoredRoutes.filter((route) => route !== bestRoute),
    bestBuyRoute: scoredRoutes.find((route) => route.buyRouteAvailable) || null,
    bestSellRoute: scoredRoutes.find((route) => route.sellRouteAvailable) || null,
    bestVerifiedRoute: bestRoute && routeVerified(bestRoute) ? bestRoute : null,
    lowestCostRoute: [...scoredRoutes].sort((a, b) => num(a.totalRouteCostUsd) - num(b.totalRouteCostUsd))[0] || null,
    highestLiquidityRoute: [...scoredRoutes].sort((a, b) => Math.max(num(b.liquidityUsd), num(b.orderBookDepthUsd)) - Math.max(num(a.liquidityUsd), num(a.orderBookDepthUsd)))[0] || null,
    lowestRiskRoute: [...scoredRoutes].sort((a, b) => a.totalRouteComplexity - b.totalRouteComplexity)[0] || null,
    simplestUserRoute: [...scoredRoutes].sort((a, b) => a.totalRouteComplexity - b.totalRouteComplexity || b.accessibilityScore - a.accessibilityScore)[0] || null,
    bestVerifiedVenue: bestRoute?.venue || null,
    requiredWallet: bestRoute?.routeType === "CEX" ? null : bestRoute?.walletFamily || null,
    requiredChain: bestRoute?.chain || null,
    bridgeRequired: bestRoute?.bridgeRequired === true,
    estimatedTotalCostUsd: bestRoute?.totalRouteCostUsd ?? null,
    estimatedRoundTripSlippagePct: bestRoute?.estimatedRoundTripSlippagePct ?? null,
    routeRisk: bestRoute ? bestRoute.totalRouteComplexity : 100,
    missingRouteEvidence,
    routeAccessibility: {
      opportunityScore: opportunityScore(project),
      accessibilityScore: bestRoute?.accessibilityScore || 0,
      lane,
      preferences: {
        preferredExchanges: preferences.preferredExchanges,
        preferredWallets: preferences.preferredWallets,
        userRegion: preferences.userRegion,
        userState: preferences.userState,
      },
      note: "Accessibility describes purchasing complexity. It is separate from project quality and is not financial advice.",
    },
  };
}

export function analyzeRouteAccessibilityBatch(projects = [], options = {}) {
  const analyzed = (Array.isArray(projects) ? projects : []).map((project) => analyzeRouteAccessibility(project, options));
  const opportunityRanked = [...analyzed].sort((a, b) => opportunityScore(b) - opportunityScore(a));
  const accessibilityRanked = [...analyzed].sort((a, b) =>
    num(b.routeAccessibility?.accessibilityScore) - num(a.routeAccessibility?.accessibilityScore) ||
    opportunityScore(b) - opportunityScore(a)
  );
  const opportunityRanks = new Map(opportunityRanked.map((project, index) => [project, index + 1]));
  const accessibilityRanks = new Map(accessibilityRanked.map((project, index) => [project, index + 1]));
  return analyzed.map((project) => ({
    ...project,
    opportunityRank: opportunityRanks.get(project) || null,
    accessibilityRank: accessibilityRanks.get(project) || null,
  }));
}

function compactProject(project = {}) {
  return {
    symbol: project.symbol || "UNKNOWN",
    name: project.name || "Unknown",
    opportunityRank: project.opportunityRank || null,
    accessibilityRank: project.accessibilityRank || null,
    opportunityScore: opportunityScore(project),
    accessibilityScore: project.routeAccessibility?.accessibilityScore || 0,
    coinbaseAvailable: project.coinbaseAvailable === true,
    metamaskCompatible: project.metamaskCompatible === true,
    alternativeRoutesAvailable: project.alternativeRouteAvailable === true,
    bestVerifiedVenue: project.bestVerifiedVenue || null,
    requiredWallet: project.requiredWallet || null,
    requiredChain: project.requiredChain || null,
    bridgeRequired: project.bridgeRequired === true,
    estimatedTotalCostUsd: project.estimatedTotalCostUsd ?? null,
    estimatedRoundTripSlippagePct: project.estimatedRoundTripSlippagePct ?? null,
    routeRisk: project.routeRisk ?? 100,
    accessibilityLane: project.accessibilityLane || "NO_VERIFIED_ROUTE",
    researchEligible: project.researchEligible === true,
    qualityQualified: project.qualityQualified === true,
    executionReady: project.executionReady === true,
    userAccessible: project.userAccessible === true,
    missingRouteEvidence: project.missingRouteEvidence || [],
  };
}

export function summarizeRouteAccessibility(projects = [], options = {}) {
  const safe = Array.isArray(projects) ? projects : [];
  const preferences = options.preferences || resolveAccessibilityPreferences(options.env || process.env);
  const withRoutes = safe.filter((project) => Array.isArray(project.canonicalRoutes));
  const routeUniverse = withRoutes.flatMap((project) =>
    (project.canonicalRoutes || []).map((route) => ({
      symbol: project.symbol || "UNKNOWN",
      name: project.name || "Unknown",
      ...route,
    }))
  );
  const topProjectsByOpportunity = [...withRoutes]
    .sort((a, b) => opportunityScore(b) - opportunityScore(a))
    .slice(0, 50)
    .map(compactProject);
  const topProjectsByUserAccessibility = [...withRoutes]
    .sort((a, b) => num(b.routeAccessibility?.accessibilityScore) - num(a.routeAccessibility?.accessibilityScore) || opportunityScore(b) - opportunityScore(a))
    .slice(0, 50)
    .map(compactProject);
  const venueCounts = routeUniverse.reduce((acc, route) => {
    const venue = route.venue || "UNKNOWN";
    const current = acc[venue] || { venue, routes: 0, verifiedRoutes: 0, executionReadyRoutes: 0, regionRestricted: 0 };
    current.routes += 1;
    if (route.verificationStatus === "VERIFIED") current.verifiedRoutes += 1;
    if (routeVerified(route)) current.executionReadyRoutes += 1;
    if (route.regionAvailability === "REGION_RESTRICTED") current.regionRestricted += 1;
    acc[venue] = current;
    return acc;
  }, {});

  return {
    generatedAt: new Date().toISOString(),
    status: safe.length ? "OK" : "NO_PROJECTS",
    rule:
      "The scanner must search the complete legitimate market and must never confuse easy for me to buy with best opportunity.",
    projectsAnalyzed: safe.length,
    projectsWithRoutes: withRoutes.length,
    routeCount: routeUniverse.length,
    executionReadyCount: withRoutes.filter((project) => project.executionReady).length,
    userAccessibleCount: withRoutes.filter((project) => project.userAccessible).length,
    researchEligibleCount: withRoutes.filter((project) => project.researchEligible).length,
    preferences,
    topProjectsByOpportunity,
    topProjectsByUserAccessibility,
    routeUniverse,
    alternativeRoutes: routeUniverse.filter((route) => lower(route.venue) !== "coinbase" && lower(route.walletFamily) !== "metamask"),
    venueCoverageHealth: Object.values(venueCounts).sort((a, b) => b.verifiedRoutes - a.verifiedRoutes || b.routes - a.routes),
    prohibitedOutputs: [
      "NOT ON COINBASE = REJECTED",
      "NOT ON METAMASK = REJECTED",
    ],
  };
}
