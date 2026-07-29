import { SUPPORTED_CHAIN_REGISTRY } from "../data/chainAliasRegistry.js";
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
]);

function clean(value = "") {
  return String(value ?? "").trim();
}

function upper(value = "") {
  return clean(value).toUpperCase();
}

function lower(value = "") {
  return clean(value).toLowerCase();
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
  return id !== null && normalizedAddress ? `${id}:${normalizedAddress.toLowerCase()}` : null;
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

function inferVenue(project = {}) {
  return first([
    project.dexName,
    project.dex,
    project.venue,
    project.exchange,
    project.marketData?.dex,
    project.rawCandidate?.dex,
    firstRouteValue(project, ["dexName", "venue", "exchange", "source"]),
  ]);
}

function venueSupported(value = "") {
  const normalized = lower(value).replace(/\s+/g, " ");
  if (!normalized) return false;
  if (SUPPORTED_ROUTE_VENUES.has(normalized)) return true;
  return [...SUPPORTED_ROUTE_VENUES].some((venue) => normalized.includes(venue));
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

function routeRegionVerified(project = {}) {
  const region = first([project.regionStatus, project.canonicalExecutionRoute?.regionStatus, project.routeAccessibility?.regionStatus]);
  return !region || upper(region) === "CONFIRMED_AVAILABLE";
}

export function resolveStrictCandidateGate(project = {}) {
  const normalizedChain = inferChain(project);
  const chainId = canonicalChainId(normalizedChain);
  const nativeVariant = classifyNativeAssetVariant({ ...project, chain: normalizedChain || project.chain });
  const tokenAddress = inferTokenAddress(project, normalizedChain);
  const canonicalId = buildStrictCanonicalId(normalizedChain, tokenAddress);
  const pairAddress = inferPairAddress(project, normalizedChain);
  const baseTokenAddress = normalizeTokenAddress(first([project.baseTokenAddress, project.baseToken?.address, tokenAddress]), normalizedChain);
  const quoteTokenAddress = inferQuoteTokenAddress(project, normalizedChain);
  const tokenName = clean(first([project.tokenName, project.name, project.projectName, project.baseToken?.name, project.marketData?.name, project.rawCandidate?.name]));
  const symbol = upper(first([project.symbol, project.ticker, project.baseToken?.symbol, project.marketData?.symbol, project.rawCandidate?.symbol]));
  const dexName = clean(inferVenue(project));
  const liquidityUsd = num(
    first([
      project.stableExitLiquidityUsd,
      project.dexLiquidityUsd,
      project.liquidityUsd,
      project.marketData?.liquidityUsd,
      project.rawCandidate?.liquidityUsd,
      project.canonicalExecutionRoute?.liquidityUsd,
      firstRouteValue(project, ["liquidityUsd", "liquidity", "poolLiquidityUsd", "reserveUsd"]),
    ])
  );
  const volume24hUsd = num(
    first([
      project.volume24hUsd,
      project.volume24h,
      project.volume,
      project.marketData?.volume24h,
      project.rawCandidate?.volume24h,
      project.canonicalExecutionRoute?.volume24hUsd,
      firstRouteValue(project, ["volume24hUsd", "volume24h", "volume", "quoteVolume24h"]),
    ])
  );
  const provenance = inferProvenance(project);
  const lastVerifiedAt = inferLastVerifiedAt(project);
  const quoteFresh = routeQuoteFresh(project, 3600);
  const buyQuoteVerified = hasVerifiedBuyQuote(project);
  const sellQuoteVerified = hasVerifiedSellQuote(project);
  const depthVerified = hasVerifiedRouteDepth(project) && liquidityUsd > 0;
  const slippageVerified = routeSlippageVerified(project);
  const safetyClean = noDeterministicSafetyBlock(project);
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
      baseTokenAddress,
      quoteTokenAddress,
      liquidityUsd,
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
  if (!pairAddress || !dexName || !venueSupported(dexName) || !baseTokenAddress || !quoteTokenAddress) {
    reasons.push(ROUTE_QUARANTINE_REASONS.PAIR_NOT_FOUND);
  }
  if (liquidityUsd <= 0 || volume24hUsd <= 0) reasons.push(ROUTE_QUARANTINE_REASONS.NO_ACTIVE_LIQUIDITY);
  if (!buyQuoteVerified) reasons.push(ROUTE_QUARANTINE_REASONS.BUY_ROUTE_FAILED);
  if (!sellQuoteVerified || !depthVerified || !slippageVerified || !safetyClean) {
    reasons.push(ROUTE_QUARANTINE_REASONS.SELL_ROUTE_FAILED);
  }
  if (!routeRegionVerified(project)) reasons.push(ROUTE_QUARANTINE_REASONS.REGION_UNVERIFIED);
  if (!quoteFresh || !lastVerifiedAt || provenance.length === 0) reasons.push(ROUTE_QUARANTINE_REASONS.STALE_MARKET_DATA);

  const strictIdentityVerified = Boolean(
    canonicalId &&
      normalizedChain &&
      chainId !== null &&
      tokenAddress &&
      tokenName &&
      symbol &&
      pairAddress &&
      dexName &&
      venueSupported(dexName) &&
      baseTokenAddress &&
      quoteTokenAddress &&
      liquidityUsd > 0 &&
      volume24hUsd > 0 &&
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
      routeRegionVerified(project) &&
      safetyClean
  );
  const strictRankEligible = Boolean(strictIdentityVerified && strictRouteVerified && reasons.length === 0);
  const routeVerificationStatus = strictRouteVerified
    ? "LIVE_EXECUTION_READY"
    : sellQuoteVerified && buyQuoteVerified
      ? "SELL_QUOTE_VERIFIED"
      : buyQuoteVerified
        ? "BUY_QUOTE_VERIFIED"
        : pairAddress && tokenAddress
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
    baseTokenAddress,
    quoteTokenAddress,
    liquidityUsd,
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
