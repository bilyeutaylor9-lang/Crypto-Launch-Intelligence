import { SUPPORTED_CHAIN_REGISTRY } from "../data/chainAliasRegistry.js";
import { normalizeVenue, venueType } from "../data/venueVocabularyRegistry.js";
import {
  hasVerifiedBuyQuote,
  hasVerifiedRouteDepth,
  hasVerifiedRouteSlippage,
  hasVerifiedSellQuote,
  routeQuoteAgeSeconds,
  routeQuoteFresh,
} from "./routeTruthV2.js";
import {
  normalizeChainId,
  normalizePoolAddress,
  normalizeTokenAddress,
} from "../identity/strictIdentityValidators.js";
import { classifyNativeAssetVariant } from "../identity/nativeAssetRegistry.js";

export const ROUTE_QUARANTINE_REASONS = Object.freeze({
  CONTRACT_MISSING: "CONTRACT_MISSING",
  SYMBOL_AMBIGUOUS: "SYMBOL_AMBIGUOUS",
  PAIR_NOT_FOUND: "PAIR_NOT_FOUND",
  UNSUPPORTED_CHAIN: "UNSUPPORTED_CHAIN",
  NO_ACTIVE_LIQUIDITY: "NO_ACTIVE_LIQUIDITY",
  BUY_ROUTE_FAILED: "BUY_ROUTE_FAILED",
  SELL_ROUTE_FAILED: "SELL_ROUTE_FAILED",
  WRAPPED_ASSET_UNVERIFIED: "WRAPPED_ASSET_UNVERIFIED",
  STALE_MARKET_DATA: "STALE_MARKET_DATA",
  NATIVE_ASSET_MISMATCH: "NATIVE_ASSET_MISMATCH",
  REGION_UNVERIFIED: "REGION_UNVERIFIED",
});

const QUOTE_TOKEN_ADDRESSES = Object.freeze({
  ethereum: {
    USDC: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    USDT: "0xdac17f958d2ee523a2206206994597c13d831ec7",
    WETH: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
    ETH: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
  },
  base: {
    USDC: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
    WETH: "0x4200000000000000000000000000000000000006",
    ETH: "0x4200000000000000000000000000000000000006",
  },
  bsc: {
    USDT: "0x55d398326f99059ff775485246999027b3197955",
    USDC: "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d",
    WBNB: "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c",
    BNB: "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c",
  },
  arbitrum: {
    USDC: "0xaf88d065e77c8cc2239327c5edb3a432268e5831",
    USDT: "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9",
    WETH: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1",
    ETH: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1",
  },
  polygon: {
    USDC: "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359",
    USDT: "0xc2132d05d31c914a87c6611c10748aeb04b58e8f",
    WMATIC: "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270",
    MATIC: "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270",
  },
  optimism: {
    USDC: "0x0b2c639c533813f4aa9d7837caf62653d097ff85",
    USDT: "0x94b008aa00579c1307b0ef2c499ad98a8ce58e58",
    WETH: "0x4200000000000000000000000000000000000006",
    ETH: "0x4200000000000000000000000000000000000006",
  },
  avalanche: {
    USDC: "0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e",
    USDT: "0x9702230a8ea53601f5cd2dc00fdbc13d4df4a8c7",
    WAVAX: "0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7",
    AVAX: "0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7",
  },
  solana: {
    USDC: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    SOL: "So11111111111111111111111111111111111111112",
    WSOL: "So11111111111111111111111111111111111111112",
  },
});

const SUPPORTED_ROUTE_VENUES = new Set([
  "0x",
  "aerodrome",
  "aftermath",
  "astroport",
  "balancer",
  "baseswap",
  "binance",
  "binance.us",
  "bithumb",
  "bitget",
  "bybit",
  "camelot",
  "cetus",
  "coinbase",
  "crypto.com",
  "curve",
  "dedust",
  "gate",
  "gemini",
  "geckoterminal",
  "htx",
  "jupiter",
  "li.fi",
  "lifi",
  "kraken",
  "kucoin",
  "mexc",
  "meteora",
  "okx",
  "orca",
  "osmosis",
  "pancakeswap",
  "paraswap",
  "pumpswap",
  "quickswap",
  "raydium",
  "sushiswap",
  "ston.fi",
  "stonfi",
  "trader joe",
  "trader_joe",
  "turbos",
  "uniswap",
  "upbit",
  "velodrome",
  "zero_x",
].map(normalizeVenue));

function clean(value = "") {
  return String(value ?? "").trim();
}

function upper(value = "") {
  return clean(value).toUpperCase();
}

function lower(value = "") {
  return clean(value).toLowerCase();
}

function venueKey(value = "") {
  const normalized = normalizeVenue(value);
  return normalized === "li.fi" ? "lifi" : normalized;
}

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function first(values = []) {
  return values.find((value) => value !== undefined && value !== null && value !== "") ?? null;
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function canonicalChainId(chain = null) {
  const normalized = normalizeChainId(chain);
  return normalized ? SUPPORTED_CHAIN_REGISTRY[normalized]?.chainId ?? null : null;
}

export function buildStrictCanonicalId(chain = null, contractAddress = null) {
  const normalizedChain = normalizeChainId(chain);
  const normalizedAddress = normalizeTokenAddress(contractAddress, normalizedChain);
  const id = canonicalChainId(normalizedChain);
  return id !== null && normalizedAddress ? `${id}:${normalizedAddress}` : null;
}

function routeObjects(project = {}) {
  return [
    project.canonicalExecutionRoute,
    project.executionProofRecoveryRoute,
    project.executionRoute,
    project.purchaseRoute,
    project.marketData?.executionRoute,
    project.rawCandidate?.executionRoute,
    ...array(project.executionRoutes),
    ...array(project.executionProofRecoveryRoutes),
    ...array(project.purchaseRoute?.routes),
  ].filter((route) => route && typeof route === "object");
}

function firstRouteValue(project = {}, keys = []) {
  const routes = routeObjects(project);
  for (const value of keys.map((key) => key.split(".").reduce((object, part) => (object ? object[part] : undefined), project))) {
    if (value !== undefined && value !== null && value !== "") return value;
  }
  for (const route of routes) {
    for (const key of keys) {
      const value = key.split(".").reduce((object, part) => (object ? object[part] : undefined), route);
      if (value !== undefined && value !== null && value !== "") return value;
    }
  }
  return null;
}

function inferChain(project = {}) {
  return normalizeChainId(
    first([
      project.canonicalChain,
      project.normalizedChain,
      project.finalChain,
      project.chain,
      project.network,
      project.chainId,
      project.rawCandidate?.chain,
      project.marketData?.chain,
      firstRouteValue(project, ["chain", "network"]),
    ])
  );
}

function inferTokenAddress(project = {}, chain = null) {
  return normalizeTokenAddress(
    first([
      project.finalContractAddress,
      project.verifiedContractAddress,
      project.canonicalAddress,
      project.contractAddress,
      project.tokenAddress,
      project.baseToken?.address,
      project.marketData?.tokenAddress,
      project.marketData?.contractAddress,
      project.rawCandidate?.tokenAddress,
      project.rawCandidate?.contractAddress,
      firstRouteValue(project, ["tokenAddress", "contractAddress", "baseToken.address"]),
    ]),
    chain
  );
}

function inferPairAddress(project = {}, chain = null) {
  return normalizePoolAddress(
    first([
      project.primaryTradablePool,
      project.finalPairAddress,
      project.verifiedPairAddress,
      project.pairAddress,
      project.poolAddress,
      project.pair?.address,
      project.marketData?.pairAddress,
      project.marketData?.poolAddress,
      project.rawCandidate?.pairAddress,
      project.rawCandidate?.poolAddress,
      firstRouteValue(project, ["pairAddress", "poolAddress", "marketAddress"]),
    ]),
    chain
  );
}

function quoteAssetFromMarketPair(project = {}) {
  const pair = upper(firstRouteValue(project, ["marketPair", "marketData.marketPair", "rawCandidate.marketPair", "symbol"]));
  if (!pair) return null;
  const compact = pair.replace(/[-_:/\s.]+/g, "");
  for (const quote of ["USDT", "USDC", "USD", "WETH", "ETH", "WBNB", "BNB", "WSOL", "SOL"]) {
    if (compact.endsWith(quote)) return quote;
  }
  return null;
}

function inferQuoteTokenAddress(project = {}, chain = null) {
  const direct = normalizeTokenAddress(
    first([
      project.quoteTokenAddress,
      project.quoteToken?.address,
      project.marketData?.quoteTokenAddress,
      project.marketData?.quoteToken?.address,
      project.rawCandidate?.quoteTokenAddress,
      project.rawCandidate?.quoteToken?.address,
      firstRouteValue(project, ["quoteTokenAddress", "quoteToken.address"]),
    ]),
    chain
  );
  if (direct) return direct;

  const quoteAsset = upper(
    first([
      project.quoteAsset,
      project.quoteToken,
      project.marketData?.quoteAsset,
      project.rawCandidate?.quoteAsset,
      firstRouteValue(project, ["quoteAsset", "quoteToken", "marketPair"]),
      quoteAssetFromMarketPair(project),
    ])
  );
  const normalizedChain = normalizeChainId(chain);
  const mapped = normalizedChain ? QUOTE_TOKEN_ADDRESSES[normalizedChain]?.[quoteAsset] : null;
  return mapped ? normalizeTokenAddress(mapped, normalizedChain) : null;
}

function exactVenueEvidence(project, route) {
  const chain = inferChain(project);
  const token = inferTokenAddress(project, chain);
  const pool = inferPairAddress(project, chain);
  const agree = (values, normalize, expected) => {
    const supplied = values.filter((value) => value !== undefined && value !== null && value !== "");
    return supplied.length > 0 && supplied.every((value) => normalize(value) === expected);
  };
  const chains = (item) => [item.chain, item.chainId, item.canonicalChain, item.network, item.finalChain, item.normalizedChain];
  const tokens = (item) => [item.tokenAddress, item.contractAddress, item.canonicalAddress,
    item.finalContractAddress, item.verifiedContractAddress, item.baseTokenAddress, item.baseToken?.address];
  const pools = (item) => [item.poolAddress, item.pairAddress, item.primaryTradablePool,
    item.finalPairAddress, item.verifiedPairAddress, item.pair?.address];
  if (!chain || !token || !agree(chains(project), normalizeChainId, chain) ||
      !agree(chains(route), normalizeChainId, chain) ||
      !agree(tokens(project), (value) => normalizeTokenAddress(value, chain), token) ||
      !agree(tokens(route), (value) => normalizeTokenAddress(value, chain), token)) return false;
  if (route.exactIdentityVerified !== true || route.buyQuoteVerified !== true || route.sellQuoteVerified !== true ||
      [route.status, route.executionStatus, route.verificationStatus].some((value) =>
        /REJECT|FAIL|UNKNOWN|UNVERIFIED|UNAVAILABLE|INVALID|BLOCKED/i.test(clean(value))) ||
      !routeQuoteFresh(route, 3600)) return false;
  if (upper(route.routeType) === "CEX") {
    return Boolean(project.marketPair && route.marketPair && upper(project.marketPair) === upper(route.marketPair));
  }
  if (!pool || !agree(pools(project), (value) => normalizePoolAddress(value, chain), pool) ||
      !agree(pools(route), (value) => normalizePoolAddress(value, chain), pool)) return false;
  const buy = route.buyQuote;
  const sell = route.sellQuote;
  const quoteToken = normalizeTokenAddress(buy?.inputMint || buy?.fromToken?.address, chain) ||
    inferQuoteTokenAddress(route, chain);
  // Recovery adapters validate both raw legs before emitting this compact attestation.
  const compactAttestation = route.identityVerificationState === "EXACT_CHAIN_CONTRACT_POOL_ATTESTED" &&
    route.quoteVerified === true && lower(route.source) === lower(route.executionRecoverySource) &&
    ["jupiter", "0x", "lifi"].includes(lower(route.source)) &&
    venueKey(route.venue) === venueKey(route.source) &&
    array(route.routePoolAddresses).some((value) => normalizePoolAddress(value, chain) === pool);
  const legMatches = (leg, from, to) => {
    if (leg?.verified !== true || !from || !to || from === to) return false;
    const addressMatches = (values, expected) => values.some((value) => value !== undefined && value !== null && value !== "")
      ? agree(values, (value) => normalizeTokenAddress(value, chain), expected) : compactAttestation;
    const legPools = [leg.poolAddress, leg.pairAddress, ...array(leg.routePoolAddresses)].filter(Boolean);
    return addressMatches([leg.inputMint, leg.fromToken?.address], from) &&
      addressMatches([leg.outputMint, leg.toToken?.address], to) &&
      (legPools.length ? legPools.some((value) => normalizePoolAddress(value, chain) === pool) : compactAttestation);
  };
  return legMatches(buy, quoteToken, token) && legMatches(sell, token, quoteToken);
}

function inferVenue(project = {}) {
  const observed = first([
    project.dexName,
    project.dex,
    project.venue,
    project.exchange,
    project.marketData?.dex,
    project.rawCandidate?.dex,
  ]);
  if (observed && !["token-profile", "token-boost", "market-aggregate"].includes(lower(observed))) return observed;

  // A discovery label is not a venue. Only current exact route evidence can replace it.
  const proof = project.executionProof;
  const candidates = proof ? [proof] : [project.executionProofRecoveryRoute, project.canonicalExecutionRoute];
  for (const route of candidates.filter((value) => value && typeof value === "object")) {
    const venue = first([route.venue, route.dexName, route.exchange]);
    if (!venueSupported(venue) || !exactVenueEvidence(project, route)) continue;
    const conflictingVenue = routeObjects(project).some((other) => {
      const otherVenue = first([other.venue, other.dexName, other.exchange]);
      return other !== route && other.quoteTimestamp === route.quoteTimestamp &&
        exactVenueEvidence(project, other) && otherVenue && venueKey(otherVenue) !== venueKey(venue);
    });
    if (!conflictingVenue) return venue;
  }
  return observed;
}

function inferRouteType(project = {}) {
  const raw = upper(firstRouteValue(project, ["routeType", "type", "canonicalExecutionRoute.routeType"]));
  if (raw === "DEX_AGGREGATOR" || raw === "AGGREGATOR") return "AGGREGATOR";
  if (raw === "CEX") return "CEX";
  if (raw === "DEX") return "DEX";
  const venue = venueKey(inferVenue(project));
  if (venueType(venue) === "cex") {
    return "CEX";
  }
  if (["jupiter", "lifi", "oneinch", "paraswap", "zero_x"].includes(venue)) {
    return "AGGREGATOR";
  }
  return raw || "DEX";
}

function venueSupported(value = "") {
  const normalized = normalizeVenue(value);
  if (!normalized) return false;
  if (SUPPORTED_ROUTE_VENUES.has(normalized)) return true;
  const versioned = lower(value).match(/^(.+?)[ _-]v[1-4](?:\.\d+)?$/);
  return Boolean(versioned && venueType(versioned[1]) !== "cex" &&
    SUPPORTED_ROUTE_VENUES.has(normalizeVenue(versioned[1])));
}

function inferProvenance(project = {}) {
  return [
    project.source,
    project.provider,
    project.discoverySource,
    ...array(project.discoverySources),
    ...array(project.sources),
    ...array(project.canonicalExecutionRoute?.supportingSources),
    firstRouteValue(project, ["source", "provider"]),
  ]
    .map(clean)
    .filter(Boolean)
    .filter((value, index, list) => list.indexOf(value) === index);
}

function inferLastVerifiedAt(project = {}) {
  const timestamp = first([
    project.lastVerifiedAt,
    project.routeLastVerifiedAt,
    project.quoteTimestamp,
    project.executionQuoteTimestamp,
    project.marketData?.updatedAt,
    project.rawCandidate?.updatedAt,
    firstRouteValue(project, ["lastVerifiedAt", "quoteTimestamp", "updatedAt", "timestamp"]),
  ]);
  if (timestamp) return timestamp;
  const age = routeQuoteAgeSeconds(project);
  if (age !== null) return new Date(Date.now() - age * 1000).toISOString();
  return null;
}

function noDeterministicSafetyBlock(project = {}) {
  const blockers = [
    ...(project.finalSelectionBlockers || []),
    ...(project.finalBlockingReasons || []),
    ...(project.sniperIntegrityBlockers || []),
    ...(project.scalpMicrostructureBlockers || []),
    ...(project.blockers || []),
  ]
    .join(" ")
    .toLowerCase();
  return !(
    project.honeypotDetected === true ||
    project.sellRestricted === true ||
    project.verifiedScam === true ||
    project.identityConflict === true ||
    project.canonicalIdentityHardBlock === true ||
    /honeypot|cannot sell|sell restricted|contract mismatch|chain mismatch|malicious|blacklist|freeze/.test(blockers)
  );
}

function routeSlippageVerified(project = {}) {
  return hasVerifiedRouteSlippage(project) && project.slippageIsHeuristic !== true && project.canonicalExecutionRoute?.slippageIsHeuristic !== true;
}

function hasVerifiedDepthSource(project = {}) {
  const source = upper(first([
    project.verifiedDepthSource,
    project.depthVerificationSource,
    project.canonicalExecutionRoute?.verifiedDepthSource,
    project.canonicalExecutionRoute?.depthVerificationSource,
    project.executionProofRecoveryRoute?.verifiedDepthSource,
    project.executionProofRecoveryRoute?.depthVerificationSource,
  ])).replace(/_/g, "-");
  return ["LIVE-BUY-SELL-QUOTE", "PUBLIC-ORDER-BOOK", "LIVE-QUOTE", "ORDER-BOOK"].includes(source) ||
    project.executionProofRecovery?.status === "ROUTE_RECOVERED";
}

function routeRegionVerified(project = {}, routeType = null) {
  const region = first([project.regionStatus, project.canonicalExecutionRoute?.regionStatus, project.routeAccessibility?.regionStatus]);
  const status = upper(region);
  if (["CONFIRMED_RESTRICTED", "REGION_RESTRICTED", "RESTRICTED", "UNAVAILABLE"].includes(status)) return false;
  if (routeType === "CEX") return status === "CONFIRMED_AVAILABLE";
  return true;
}

export function resolveStrictCandidateGate(project = {}) {
  const normalizedChain = inferChain(project);
  const chainId = canonicalChainId(normalizedChain);
  const nativeVariant = classifyNativeAssetVariant({ ...project, chain: project.chain || normalizedChain });
  const tokenAddress = inferTokenAddress(project, normalizedChain);
  const canonicalId = buildStrictCanonicalId(normalizedChain, tokenAddress);
  const pairAddress = inferPairAddress(project, normalizedChain);
  const baseTokenAddress = normalizeTokenAddress(first([project.baseTokenAddress, project.baseToken?.address, tokenAddress]), normalizedChain);
  const quoteTokenAddress = inferQuoteTokenAddress(project, normalizedChain);
  const tokenName = clean(first([project.tokenName, project.name, project.projectName, project.baseToken?.name, project.marketData?.name, project.rawCandidate?.name]));
  const symbol = upper(first([project.symbol, project.ticker, project.baseToken?.symbol, project.marketData?.symbol, project.rawCandidate?.symbol]));
  const dexName = clean(inferVenue(project));
  const routeType = inferRouteType(project);
  const liquidityUsd = Math.max(
    num(project.stableExitLiquidityUsd),
    num(project.dexLiquidityUsd),
    num(project.liquidityUsd),
    num(project.marketData?.liquidityUsd),
    num(project.rawCandidate?.liquidityUsd),
    num(project.canonicalExecutionRoute?.liquidityUsd),
    num(project.executionProofRecoveryRoute?.liquidityUsd),
    num(firstRouteValue(project, ["liquidityUsd", "liquidity", "poolLiquidityUsd", "reserveUsd"]))
  );
  const volume24hUsd = Math.max(
    num(project.volume24hUsd),
    num(project.volume24h),
    num(project.volume),
    num(project.marketData?.volume24h),
    num(project.rawCandidate?.volume24h),
    num(project.canonicalExecutionRoute?.volume24hUsd),
    num(project.executionProofRecoveryRoute?.volume24hUsd),
    num(firstRouteValue(project, ["volume24hUsd", "volume24h", "volume", "quoteVolume24h"]))
  );
  const rawRouteDepthUsd = Math.max(
    liquidityUsd,
    num(project.orderBookDepthUsd),
    num(project.executableDepthUsd),
    num(project.verifiedTradeSizeUsd),
    num(project.canonicalExecutionRoute?.orderBookDepthUsd),
    num(project.canonicalExecutionRoute?.executableDepthUsd),
    num(project.canonicalExecutionRoute?.verifiedTradeSizeUsd),
    num(project.executionProofRecoveryRoute?.orderBookDepthUsd),
    num(project.executionProofRecoveryRoute?.executableDepthUsd),
    num(project.executionProofRecoveryRoute?.verifiedTradeSizeUsd)
  );
  const routeDepthUsd = project.liquidityVerified === false && !hasVerifiedDepthSource(project) ? 0 : rawRouteDepthUsd;
  const provenance = inferProvenance(project);
  const lastVerifiedAt = inferLastVerifiedAt(project);
  const quoteFresh = routeQuoteFresh(project, 3600);
  const buyQuoteVerified = hasVerifiedBuyQuote(project);
  const sellQuoteVerified = hasVerifiedSellQuote(project);
  const depthVerified = hasVerifiedRouteDepth(project) && routeDepthUsd > 0;
  const slippageVerified = routeSlippageVerified(project);
  const safetyClean = noDeterministicSafetyBlock(project);
  const cexRoute = routeType === "CEX";
  const aggregatorRoute = routeType === "AGGREGATOR";
  const marketPair = firstRouteValue(project, ["marketPair", "market", "symbol"]);
  const routeMarketProof = cexRoute
    ? Boolean(marketPair)
    : aggregatorRoute
      ? Boolean(pairAddress || (buyQuoteVerified && sellQuoteVerified && quoteFresh))
      : Boolean(pairAddress);
  const regionVerified = routeRegionVerified(project, routeType);
  const activeMarketObserved = routeDepthUsd > 0 && (volume24hUsd > 0 || buyQuoteVerified || sellQuoteVerified);
  const identityStatus = upper(project.identityStatus || project.canonicalIdentity?.identityStatus);
  const symbolAmbiguous = Boolean(
    project.symbolAmbiguous === true ||
      project.identityConflict === true ||
      ["SYMBOL_COLLISION", "CONTRACT_CONFLICT", "UNRESOLVED", "WEAK_MATCH"].includes(identityStatus)
  );

  const reasons = [];
  if (nativeVariant.benchmarkLane === "MARKET_BENCHMARK") {
    return {
      canonicalId,
      canonicalChainId: chainId,
      normalizedChain,
      tokenName: tokenName || nativeVariant.nativeAsset?.name || symbol || "Unknown",
      symbol,
      tokenAddress,
      contractAddress: tokenAddress,
      pairAddress,
      dexName,
      routeType,
      baseTokenAddress,
      quoteTokenAddress,
      liquidityUsd,
      routeDepthUsd,
      volume24hUsd,
      provenance,
      lastVerifiedAt,
      routeLastVerifiedAt: lastVerifiedAt,
      routeVerificationStatus: "MARKET_BENCHMARK",
      strictIdentityVerified: false,
      strictRouteVerified: false,
      strictRankEligible: false,
      strictCandidateLane: "MARKET_BENCHMARK",
      candidateQuarantineReason: null,
      candidateQuarantineReasons: [],
      nativeAssetVariant: nativeVariant,
      marketBenchmarkLane: "MARKET_BENCHMARK",
      strictCandidateMissingProof: ["established native asset is benchmark context, not early-discovery alpha"],
    };
  }

  if (!normalizedChain || chainId === null) reasons.push(ROUTE_QUARANTINE_REASONS.UNSUPPORTED_CHAIN);
  if (nativeVariant.quarantineReason) reasons.push(nativeVariant.quarantineReason);
  if (!tokenAddress) reasons.push(ROUTE_QUARANTINE_REASONS.CONTRACT_MISSING);
  if (!tokenName || !symbol || symbolAmbiguous) reasons.push(ROUTE_QUARANTINE_REASONS.SYMBOL_AMBIGUOUS);
  if (!routeMarketProof || !dexName || !venueSupported(dexName) || !baseTokenAddress || (!cexRoute && !quoteTokenAddress)) {
    reasons.push(ROUTE_QUARANTINE_REASONS.PAIR_NOT_FOUND);
  }
  if (routeDepthUsd <= 0 || !activeMarketObserved) reasons.push(ROUTE_QUARANTINE_REASONS.NO_ACTIVE_LIQUIDITY);
  if (!buyQuoteVerified) reasons.push(ROUTE_QUARANTINE_REASONS.BUY_ROUTE_FAILED);
  if (!sellQuoteVerified || !depthVerified || !slippageVerified || !safetyClean) {
    reasons.push(ROUTE_QUARANTINE_REASONS.SELL_ROUTE_FAILED);
  }
  if (!regionVerified) reasons.push(ROUTE_QUARANTINE_REASONS.REGION_UNVERIFIED);
  if (!quoteFresh || !lastVerifiedAt || provenance.length === 0) reasons.push(ROUTE_QUARANTINE_REASONS.STALE_MARKET_DATA);

  const strictIdentityVerified = Boolean(
    canonicalId &&
      normalizedChain &&
      chainId !== null &&
      tokenAddress &&
      tokenName &&
      symbol &&
      routeMarketProof &&
      dexName &&
      venueSupported(dexName) &&
      baseTokenAddress &&
      (cexRoute || quoteTokenAddress) &&
      routeDepthUsd > 0 &&
      activeMarketObserved &&
      provenance.length > 0 &&
      lastVerifiedAt
  );
  const strictRouteVerified = Boolean(
    strictIdentityVerified &&
      buyQuoteVerified &&
      sellQuoteVerified &&
      quoteFresh &&
      depthVerified &&
      slippageVerified &&
      regionVerified &&
      safetyClean
  );
  const strictRankEligible = Boolean(strictIdentityVerified && strictRouteVerified && reasons.length === 0);
  const routeVerificationStatus = strictRouteVerified
    ? "LIVE_EXECUTION_READY"
    : sellQuoteVerified && buyQuoteVerified
      ? "SELL_QUOTE_VERIFIED"
      : buyQuoteVerified
        ? "BUY_QUOTE_VERIFIED"
        : routeMarketProof && tokenAddress
          ? "PAIR_IDENTITY_VERIFIED"
          : "MARKET_OBSERVED";

  return {
    canonicalId,
    canonicalChainId: chainId,
    normalizedChain,
    tokenName,
    symbol,
    tokenAddress,
    contractAddress: tokenAddress,
    pairAddress,
    dexName,
    routeType,
    baseTokenAddress,
    quoteTokenAddress,
    liquidityUsd,
    routeDepthUsd,
    volume24hUsd,
    provenance,
    lastVerifiedAt,
    routeLastVerifiedAt: lastVerifiedAt,
    routeVerificationStatus,
    strictIdentityVerified,
    strictRouteVerified,
    strictRankEligible,
    strictCandidateLane: strictRankEligible ? "RANK_ELIGIBLE" : "QUARANTINED_IDENTITY_OR_ROUTE",
    candidateQuarantineReason: reasons[0] || null,
    candidateQuarantineReasons: [...new Set(reasons)],
    nativeAssetVariant: nativeVariant,
    marketBenchmarkLane: null,
    strictCandidateMissingProof: [...new Set(reasons)],
  };
}

export function attachStrictCandidateGate(project = {}) {
  const gate = resolveStrictCandidateGate(project);
  return {
    ...project,
    ...gate,
    strictCandidateGate: gate,
  };
}

export function attachStrictCandidateGateBatch(projects = []) {
  return (Array.isArray(projects) ? projects : []).map(attachStrictCandidateGate);
}
