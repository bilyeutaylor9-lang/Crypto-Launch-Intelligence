import {
  normalizeChainId,
  normalizePoolAddress,
  normalizeTokenAddress,
} from "../identity/strictIdentityValidators.js";
import {
  hasVerifiedBuyQuote,
  hasVerifiedSellQuote,
  routeQuoteAgeSeconds,
} from "../execution/routeTruthV2.js";

const CEX_VENUES = [
  ["Coinbase", ["coinbase", "coinbase.com"]],
  ["Kraken", ["kraken", "kraken.com"]],
  ["Binance", ["binance", "binance.com", "binance.us"]],
  ["Gemini", ["gemini", "gemini.com"]],
  ["OKX", ["okx", "okx.com"]],
  ["KuCoin", ["kucoin", "kucoin.com"]],
  ["Gate", ["gate.io", "gate"]],
  ["MEXC", ["mexc", "mexc.com"]],
  ["Bybit", ["bybit", "bybit.com"]],
];

const EVM_DEX_VENUES = [
  ["Uniswap", ["uniswap", "app.uniswap.org"]],
  ["Aerodrome", ["aerodrome", "aerodrome.finance"]],
  ["PancakeSwap", ["pancakeswap", "pancake"]],
  ["Camelot", ["camelot"]],
  ["QuickSwap", ["quickswap"]],
  ["SushiSwap", ["sushiswap", "sushi.com"]],
  ["Curve", ["curve", "curve.fi"]],
];

const SOLANA_VENUES = [
  ["Jupiter", ["jupiter", "jup.ag"]],
  ["Raydium", ["raydium"]],
  ["Meteora", ["meteora"]],
  ["Orca", ["orca"]],
  ["PumpSwap", ["pumpswap", "pump.fun"]],
];

const DEX_SOURCE_HINTS = ["dexscreener", "geckoterminal", "birdeye"];

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

function clean(value = "") {
  return String(value ?? "").trim();
}

function lower(value = "") {
  return clean(value).toLowerCase();
}

function first(values = []) {
  return values.find((value) => value !== undefined && value !== null && value !== "") ?? null;
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function validRawAddress(value = "") {
  const raw = clean(value);
  return raw && !lower(raw).startsWith("research-seed-") ? raw : null;
}

function routeText(project = {}, routes = []) {
  return [
    project.source,
    project.exchange,
    project.listingExchange,
    project.cex,
    project.dex,
    project.url,
    project.marketUrl,
    project.marketData?.url,
    project.marketData?.marketUrl,
    project.rawCandidate?.url,
    project.rawCandidate?.marketUrl,
    ...array(project.discoverySources),
    ...routes.flatMap((route) => [
      route.source,
      route.venue,
      route.type,
      route.name,
      route.status,
      route.url,
      route.routeUrl,
      route.marketUrl,
      route.preferredRoute,
    ]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function findVenue(text = "", registry = []) {
  const normalized = lower(text);
  for (const [venue, aliases] of registry) {
    if (aliases.some((alias) => normalized.includes(alias))) return venue;
  }
  return null;
}

function routeObjects(project = {}) {
  return [
    project.purchaseRoute,
    project.executionRoute,
    ...array(project.executionRoutes),
    project.smallCapHunter?.purchaseRoute,
    project.proofOfAlphaExecutionTwin?.route,
    ...array(project.purchaseRoute?.routes),
    ...array(project.smallCapHunter?.purchaseRoute?.routes),
    ...array(project.proofOfAlphaExecutionTwin?.route?.routes),
    project.rawCandidate?.purchaseRoute,
    project.marketData?.purchaseRoute,
  ].filter((route) => route && typeof route === "object");
}

function supportingSources(project = {}, routes = []) {
  return [
    project.source,
    project.exchange,
    project.dex,
    ...array(project.discoverySources),
    ...routes.flatMap((route) => [route.source, route.provider, route.venue, route.type]),
  ]
    .map((source) => clean(source))
    .filter(Boolean)
    .filter((source, index, list) => list.indexOf(source) === index);
}

function providerUnavailable(project = {}, routes = []) {
  const text = [
    project.providerStatus,
    project.discoveryProviderStatus,
    project.executionProviderStatus,
    project.routeStatus,
    project.rawCandidate?.providerStatus,
    project.marketData?.providerStatus,
    ...array(project.providerFailures),
    ...array(project.discoveryProviderFailures),
    ...routes.map((route) => route.status),
  ]
    .join(" ")
    .toLowerCase();

  return ["fetch failed", "timeout", "429", "403", "451", "rate limit", "provider unavailable", "outage", "missing api key"].some((term) =>
    text.includes(term)
  );
}

function boolFromRoutes(routes = [], keys = []) {
  return routes.some((route) => keys.some((key) => route[key] === true));
}

function routeMarketPair(project = {}, routes = []) {
  return first([
    project.marketPair,
    project.marketData?.marketPair,
    project.rawCandidate?.marketPair,
    routes.find((route) => route.marketPair || route.market || route.symbol)?.marketPair,
    routes.find((route) => route.marketPair || route.market || route.symbol)?.market,
    routes.find((route) => route.marketPair || route.market || route.symbol)?.symbol,
  ]);
}

function routeStatusText(routes = []) {
  return routes.map((route) => lower(route.status || route.verdict || route.routeStatus)).join(" ");
}

function inferChain(project = {}) {
  return normalizeChainId(first([
    project.canonicalChain,
    project.finalChain,
    project.chain,
    project.network,
    project.chainId,
    project.rawCandidate?.chain,
    project.rawCandidate?.network,
    project.marketData?.chain,
    project.marketData?.network,
  ]));
}

function inferContract(project = {}, chain = null, routes = []) {
  return normalizeTokenAddress(
    first([
      project.finalContractAddress,
      project.canonicalAddress,
      project.contractAddress,
      project.tokenAddress,
      project.address,
      project.baseToken?.address,
      project.rawCandidate?.contractAddress,
      project.rawCandidate?.tokenAddress,
      project.rawCandidate?.address,
      project.marketData?.contractAddress,
      project.marketData?.tokenAddress,
      routes.find((route) => validRawAddress(route.contract || route.tokenAddress || route.address))?.contract,
      routes.find((route) => validRawAddress(route.contract || route.tokenAddress || route.address))?.tokenAddress,
      routes.find((route) => validRawAddress(route.contract || route.tokenAddress || route.address))?.address,
    ].map(validRawAddress)),
    chain
  );
}

function inferPair(project = {}, chain = null, routes = []) {
  return normalizePoolAddress(
    first([
      project.primaryTradablePool,
      project.finalPairAddress,
      project.pairAddress,
      project.poolAddress,
      project.pair?.address,
      project.rawCandidate?.pairAddress,
      project.rawCandidate?.poolAddress,
      project.marketData?.pairAddress,
      project.marketData?.poolAddress,
      routes.find((route) => validRawAddress(route.pairAddress || route.poolAddress))?.pairAddress,
      routes.find((route) => validRawAddress(route.pairAddress || route.poolAddress))?.poolAddress,
    ].map(validRawAddress)),
    chain
  );
}

function inferNumber(project = {}, routes = [], keys = []) {
  return Math.max(
    ...keys.map((key) => num(key.split(".").reduce((value, part) => (value ? value[part] : undefined), project))),
    ...routes.flatMap((route) => keys.map((key) => num(route[key] || route[key.split(".").pop()]))),
    0
  );
}

function routeUrl(project = {}, routes = []) {
  return first([
    project.routeUrl,
    project.url,
    project.marketUrl,
    project.marketData?.routeUrl,
    project.marketData?.url,
    project.marketData?.marketUrl,
    project.rawCandidate?.routeUrl,
    project.rawCandidate?.url,
    project.rawCandidate?.marketUrl,
    routes.find((route) => route.routeUrl || route.url || route.marketUrl)?.routeUrl,
    routes.find((route) => route.routeUrl || route.url || route.marketUrl)?.url,
    routes.find((route) => route.routeUrl || route.url || route.marketUrl)?.marketUrl,
  ]);
}

function quoteTimestamp(project = {}, routes = []) {
  return first([
    project.quoteTimestamp,
    project.executionQuoteTimestamp,
    project.marketData?.updatedAt,
    project.rawCandidate?.updatedAt,
    routes.find((route) => route.quoteTimestamp || route.timestamp || route.updatedAt)?.quoteTimestamp,
    routes.find((route) => route.quoteTimestamp || route.timestamp || route.updatedAt)?.timestamp,
    routes.find((route) => route.quoteTimestamp || route.timestamp || route.updatedAt)?.updatedAt,
  ]);
}

function routeTypeFor({ cexVenue, evmDexVenue, solanaVenue, text }) {
  if (cexVenue) return "CEX";
  if (solanaVenue && (text.includes("jupiter") || text.includes("jup.ag"))) return "AGGREGATOR";
  if (solanaVenue) return "DEX";
  if (evmDexVenue) return "DEX";
  if (DEX_SOURCE_HINTS.some((hint) => text.includes(hint))) return "DEX";
  return null;
}

function venueFor({ cexVenue, evmDexVenue, solanaVenue, text }) {
  return cexVenue || evmDexVenue || solanaVenue || (DEX_SOURCE_HINTS.some((hint) => text.includes(hint)) ? "DEX Market Data" : null);
}

function statusFor({
  routeType,
  venue,
  chain,
  contractAddress,
  pairAddress,
  liquidityUsd,
  priceUsd,
  buyRouteAvailable,
  sellRouteAvailable,
  buyQuoteVerified,
  sellQuoteVerified,
  quoteFresh,
  exactIdentity,
  unavailable,
  routes,
}) {
  if (buyQuoteVerified && sellQuoteVerified && quoteFresh && exactIdentity && routeType === "CEX" && venue && priceUsd > 0) return "VERIFIED";
  if (buyQuoteVerified && sellQuoteVerified && quoteFresh && exactIdentity && routeType && chain && contractAddress && (pairAddress || routeType === "AGGREGATOR") && liquidityUsd > 0) return "VERIFIED";
  if ((buyRouteAvailable || sellRouteAvailable || buyQuoteVerified || sellQuoteVerified) && venue && (priceUsd > 0 || liquidityUsd > 0 || contractAddress || pairAddress)) return "PARTIALLY_VERIFIED";
  if (venue || routes.length) return "DETECTED";
  if (unavailable) return "PROVIDER_UNAVAILABLE";
  return "NO_ROUTE";
}

function confidenceFor(status = "", fields = {}) {
  const base =
    status === "VERIFIED" ? 72 :
    status === "PARTIALLY_VERIFIED" ? 54 :
    status === "DETECTED" ? 34 :
    status === "PROVIDER_UNAVAILABLE" ? 18 :
    5;
  const boost =
    (fields.chain ? 6 : 0) +
    (fields.contractAddress ? 8 : 0) +
    (fields.pairAddress ? 7 : 0) +
    (fields.liquidityUsd > 0 ? 5 : 0) +
    (fields.priceUsd > 0 ? 4 : 0) +
    (fields.supportingSources.length >= 2 ? 5 : 0);
  return Math.round(clamp(base + boost));
}

function missingEvidenceFor(fields = {}) {
  const missing = [];
  if (!fields.venue) missing.push("recognized venue");
  if (!fields.routeType) missing.push("route type");
  if (fields.routeType !== "CEX" && !fields.chain) missing.push("supported chain");
  if (fields.routeType !== "CEX" && !fields.contractAddress) missing.push("verified token contract");
  if (fields.routeType !== "CEX" && !fields.pairAddress) missing.push("verified pair/pool address");
  if (!fields.buyQuoteVerified) missing.push("fresh buy quote proof");
  if (!fields.sellQuoteVerified) missing.push("fresh sell quote proof");
  if (!fields.quoteFresh) missing.push("fresh quote timestamp");
  if (!fields.liquidityUsd && fields.routeType !== "CEX") missing.push("DEX liquidity");
  if (!fields.priceUsd) missing.push("current price quote");
  return missing;
}

function routeTruthStatusFor(fields = {}) {
  if (fields.status === "PROVIDER_UNAVAILABLE") return "PROVIDER_UNAVAILABLE";
  if (fields.status === "NO_ROUTE") return "NO_VERIFIED_ROUTE";
  if (fields.buyQuoteVerified && fields.sellQuoteVerified && fields.quoteFresh && fields.exactIdentity) return "SELL_QUOTE_VERIFIED";
  if (fields.buyQuoteVerified && fields.exactIdentity) return "BUY_QUOTE_VERIFIED";
  if (fields.exactIdentity) return "PAIR_IDENTITY_VERIFIED";
  if (fields.venue || fields.routeType || fields.supportingSources?.length) return "MARKET_OBSERVED";
  return "UNVERIFIED";
}

export function analyzeCanonicalExecutionRoute(project = {}) {
  const routes = routeObjects(project);
  const text = routeText(project, routes);
  const cexVenue = findVenue(text, CEX_VENUES);
  const evmDexVenue = findVenue(text, EVM_DEX_VENUES);
  const solanaVenue = findVenue(text, SOLANA_VENUES);
  const venue = venueFor({ cexVenue, evmDexVenue, solanaVenue, text });
  const routeType = routeTypeFor({ cexVenue, evmDexVenue, solanaVenue, text });
  const chain = inferChain(project) || (solanaVenue ? "solana" : null);
  const contractAddress = inferContract(project, chain, routes);
  const inferredPairAddress = inferPair(project, chain, routes);
  const tokenPoolIdentityConflict = Boolean(
    contractAddress && inferredPairAddress && contractAddress === inferredPairAddress
  );
  const pairAddress = tokenPoolIdentityConflict ? null : inferredPairAddress;
  const supporting = supportingSources(project, routes);
  const statusText = routeStatusText(routes);
  const liquidityUsd = inferNumber(project, routes, [
    "dexLiquidityUsd",
    "liquidityUsd",
    "liquidity",
    "marketData.liquidityUsd",
    "rawCandidate.liquidityUsd",
    "quote.liquidityUsd",
  ]);
  const volume24hUsd = inferNumber(project, routes, [
    "dexVolume24hUsd",
    "volume24h",
    "volume",
    "marketData.volume24h",
    "rawCandidate.volume24h",
    "quote.volume24h",
  ]);
  const priceUsd = inferNumber(project, routes, [
    "priceUsd",
    "price",
    "marketData.priceUsd",
    "rawCandidate.priceUsd",
    "quote.priceUsd",
  ]);
  const quoteAgeSeconds = routeQuoteAgeSeconds({
    quoteAgeSeconds: first([project.quoteAgeSeconds, project.executionQuoteAgeSeconds, routes.find((route) => route.quoteAgeSeconds)?.quoteAgeSeconds]),
    quoteTimestamp: quoteTimestamp(project, routes),
  });
  const quoteFresh = quoteAgeSeconds !== null && quoteAgeSeconds <= 21_600;
  const buyQuoteVerified = [project, ...routes].some(hasVerifiedBuyQuote);
  const sellQuoteVerified = [project, ...routes].some(hasVerifiedSellQuote);
  const explicitBuy = boolFromRoutes(routes, ["buyRouteAvailable", "purchasable", "canBuy", "buyAvailable"]);
  const explicitSell = boolFromRoutes(routes, ["sellRouteAvailable", "sellable", "canSell", "sellAvailable"]);
  const sellBlocked = project.honeypotDetected === true || num(project.honeypotRiskScore) >= 85 || /honeypot|cannot sell|sell unavailable|transfer blocked/.test(statusText);
  const buyRouteAvailable = Boolean(buyQuoteVerified || explicitBuy);
  const sellRouteAvailable = Boolean(!sellBlocked && (sellQuoteVerified || explicitSell));
  const unavailable = providerUnavailable(project, routes);
  const marketPair = routeMarketPair(project, routes);
  const exactIdentity = routeType === "CEX"
    ? Boolean(venue && marketPair)
    : Boolean(chain && contractAddress && (pairAddress || routeType === "AGGREGATOR"));
  const status = statusFor({
    routeType,
    venue,
    chain,
    contractAddress,
    pairAddress,
    liquidityUsd,
    priceUsd,
    buyRouteAvailable,
    sellRouteAvailable,
    buyQuoteVerified,
    sellQuoteVerified,
    quoteFresh,
    exactIdentity,
    unavailable,
    routes,
  });
  const fields = {
    venue,
    routeType,
    chain,
    contractAddress,
    pairAddress,
    liquidityUsd,
    priceUsd,
    buyRouteAvailable,
    sellRouteAvailable,
    buyQuoteVerified,
    sellQuoteVerified,
    quoteFresh,
    exactIdentity,
    supportingSources: supporting,
  };
  const routeTruthStatus = routeTruthStatusFor({ ...fields, status });
  const failureReasons = [];
  if (status === "PROVIDER_UNAVAILABLE") failureReasons.push("Route provider unavailable; no negative route conclusion made.");
  if (status === "NO_ROUTE") failureReasons.push("No recognized CEX, DEX, aggregator, contract, pair, or market URL route was detected.");
  if (sellBlocked) failureReasons.push("Sell-route safety is blocked by honeypot or transfer-risk evidence.");
  if (tokenPoolIdentityConflict) failureReasons.push("Token contract and pool address are identical; pool proof rejected.");

  const canonicalExecutionRoute = {
    status,
    venue: venue || "UNKNOWN",
    routeType: routeType || "UNKNOWN",
    chain,
    contractAddress,
    pairAddress,
    quoteAsset: first([
      project.quoteAsset,
      project.quoteToken,
      project.marketData?.quoteAsset,
      project.rawCandidate?.quoteAsset,
      routes.find((route) => route.quoteAsset || route.quoteToken)?.quoteAsset,
      routes.find((route) => route.quoteAsset || route.quoteToken)?.quoteToken,
    ]) || null,
    routeUrl: routeUrl(project, routes) || null,
    buyRouteAvailable,
    sellRouteAvailable,
    buyQuoteVerified,
    sellQuoteVerified,
    exactIdentityVerified: exactIdentity,
    routeTruthStatus,
    liquidityUsd,
    volume24hUsd,
    priceUsd,
    quoteTimestamp: quoteTimestamp(project, routes) || null,
    quoteAgeSeconds,
    marketPair: marketPair || null,
    supportingSources: supporting,
    confidence: confidenceFor(status, fields),
    missingEvidence: missingEvidenceFor(fields),
    failureReasons,
  };

  return {
    ...project,
    canonicalExecutionRoute,
    canonicalExecutionRouteStatus: status,
    canonicalExecutionRouteVenue: canonicalExecutionRoute.venue,
    canonicalExecutionRouteType: canonicalExecutionRoute.routeType,
    canonicalExecutionRouteConfidence: canonicalExecutionRoute.confidence,
    canonicalRouteBuyAvailable: buyRouteAvailable,
    canonicalRouteSellAvailable: sellRouteAvailable,
    evidence: [
      ...(project.evidence || []),
      {
        engine: "Canonical Execution Route",
        source: supporting[0] || "canonical-execution-route",
        family: "execution",
        signal: status,
        score: canonicalExecutionRoute.confidence,
        confidence: canonicalExecutionRoute.confidence / 100,
        impact: status === "VERIFIED" ? "Positive" : status === "NO_ROUTE" ? "Neutral" : "Risk Control",
        reasons: [
          `Venue ${canonicalExecutionRoute.venue}; route type ${canonicalExecutionRoute.routeType}.`,
          canonicalExecutionRoute.missingEvidence.length
            ? `Missing: ${canonicalExecutionRoute.missingEvidence.slice(0, 3).join(", ")}.`
            : "Execution route has buy, sell, chain, contract/pool, liquidity, and quote evidence.",
        ],
      },
    ],
  };
}

export function analyzeCanonicalExecutionRouteBatch(projects = []) {
  return (Array.isArray(projects) ? projects : []).map(analyzeCanonicalExecutionRoute);
}
