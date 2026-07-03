
/**
 * Crypto Launch Intelligence
 * Data Orchestrator v2
 *
 * Purpose:
 * Creates one trusted market-data layer for all engines.
 *
 * What this does:
 * - Pulls free market candidates from freeMarketDataConnector
 * - Matches tokens safely using address, pair, chain, symbol, and name
 * - Prevents bad fallback matches like Solana ACT becoming Kraken ACT
 * - Scores candidate confidence
 * - Adds match reasons
 * - Normalizes output for every engine
 * - Caches results so engines do not refetch the same token repeatedly
 * - Reports health, missing fields, execution time, and cache stats
 */

import { getFreeMarketDataCandidates } from "./freeMarketDataConnector.js";

const cache = new Map();

const DEFAULT_LIMIT = 250;
const DEFAULT_MIN_CONFIDENCE = 70;

const SOURCE_PRIORITY = {
  dexscreener: 100,
  geckoterminal: 95,
  birdeye: 90,
  coingecko: 80,
  coinpaprika: 75,
  defillama: 70,
  "defillama-chain": 65,
  binance: 60,
  kucoin: 55,
  coinbase: 50,
  kraken: 50
};

const REQUIRED_FIELDS = [
  "priceUsd",
  "liquidityUsd",
  "volume24h",
  "priceChange24h"
];

function normalize(value = "") {
  return String(value || "").trim().toUpperCase();
}

function normalizeSource(value = "") {
  return String(value || "").trim().toLowerCase();
}

function numberOrNull(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function same(a, b) {
  return Boolean(normalize(a) && normalize(b) && normalize(a) === normalize(b));
}

function buildCacheKey(token = {}) {
  return [
    normalize(token.chain || "any"),
    normalize(token.address || token.pairAddress || token.symbol || token.name || "unknown")
  ].join(":");
}

function getSourcePriority(candidate = {}) {
  const source = normalizeSource(candidate.source);
  return SOURCE_PRIORITY[source] || 10;
}

function scoreCandidate(candidate = {}, token = {}) {
  let score = 0;
  const reasons = [];

  const candidateSource = normalizeSource(candidate.source);
  const tokenAddress = normalize(token.address);
  const tokenPairAddress = normalize(token.pairAddress);
  const tokenChain = normalize(token.chain);
  const tokenSymbol = normalize(token.symbol);
  const tokenName = normalize(token.name);

  const candidateAddress = normalize(candidate.address);
  const candidatePairAddress = normalize(candidate.pairAddress);
  const candidateChain = normalize(candidate.chain);
  const candidateSymbol = normalize(candidate.symbol);
  const candidateName = normalize(candidate.name);

  if (tokenAddress && candidateAddress && tokenAddress === candidateAddress) {
    score += 120;
    reasons.push("exact contract address match");
  }

  if (tokenPairAddress && candidatePairAddress && tokenPairAddress === candidatePairAddress) {
    score += 105;
    reasons.push("exact pair address match");
  }

  if (tokenChain && candidateChain && tokenChain === candidateChain) {
    score += 40;
    reasons.push("chain match");
  }

  if (tokenSymbol && candidateSymbol && tokenSymbol === candidateSymbol) {
    score += 35;
    reasons.push("symbol match");
  }

  if (tokenName && candidateName && tokenName === candidateName) {
    score += 25;
    reasons.push("name match");
  }

  if (tokenSymbol && candidateName && candidateName.includes(tokenSymbol)) {
    score += 10;
    reasons.push("symbol appears in candidate name");
  }

  if (tokenName && candidateSymbol && tokenName.includes(candidateSymbol)) {
    score += 5;
    reasons.push("candidate symbol appears in token name");
  }

  const liquidityUsd = Number(candidate.liquidityUsd || 0);
  const volume24h = Number(candidate.volume24h || 0);
  const priceUsd = Number(candidate.priceUsd || 0);

  if (priceUsd > 0) {
    score += 8;
    reasons.push("has live price");
  }

  if (liquidityUsd > 10000) {
    score += 15;
    reasons.push("healthy liquidity");
  } else if (liquidityUsd > 0) {
    score += 5;
    reasons.push("has liquidity");
  }

  if (volume24h > 1000) {
    score += 12;
    reasons.push("healthy 24h volume");
  } else if (volume24h > 0) {
    score += 4;
    reasons.push("has 24h volume");
  }

  const sourcePriority = getSourcePriority(candidate);
  score += sourcePriority;
  reasons.push(`source priority: ${candidateSource || "unknown"} +${sourcePriority}`);

  const hasOnlySymbolMatch =
    tokenSymbol &&
    candidateSymbol &&
    tokenSymbol === candidateSymbol &&
    !(tokenChain && candidateChain && tokenChain === candidateChain) &&
    !(tokenAddress && candidateAddress && tokenAddress === candidateAddress) &&
    !(tokenPairAddress && candidatePairAddress && tokenPairAddress === candidatePairAddress);

  if (hasOnlySymbolMatch) {
    score -= 45;
    reasons.push("penalty: symbol-only match without chain/address confirmation");
  }

  const chainConflict =
    tokenChain &&
    candidateChain &&
    tokenChain !== candidateChain &&
    candidateChain !== "MARKET" &&
    candidateChain !== "CEX" &&
    !["BINANCE", "KUCOIN", "COINBASE", "KRAKEN", "COINPAPRIKA"].includes(candidateChain);

  if (chainConflict) {
    score -= 80;
    reasons.push("penalty: chain conflict");
  }

  return {
    candidate,
    score,
    confidence: Math.max(0, Math.round(score)),
    reasons
  };
}

function findBestCandidate(candidates = [], token = {}, options = {}) {
  const minConfidence = Number(options.minConfidence || DEFAULT_MIN_CONFIDENCE);

  const scored = candidates
    .map(candidate => scoreCandidate(candidate, token))
    .sort((a, b) => b.score - a.score);

  const best = scored[0] || null;

  if (!best) {
    return {
      status: "NO_DATA",
      best: null,
      scored,
      reason: "No candidates returned from free market data sources"
    };
  }

  if (best.confidence < minConfidence) {
    return {
      status: "NO_CONFIDENT_MATCH",
      best,
      scored,
      reason: `Best candidate confidence ${best.confidence} is below minimum ${minConfidence}`
    };
  }

  return {
    status: "SUCCESS",
    best,
    scored,
    reason: "Confident market data match found"
  };
}

function normalizeMarketData(matchResult = {}, token = {}, startedAt = Date.now()) {
  const best = matchResult.best;
  const candidate = best?.candidate || null;

  const result = {
    status: matchResult.status,

    token,

    source: candidate?.source || null,
    confidence: best?.confidence || 0,
    matchReasons: best?.reasons || [],
    matchReason: matchResult.reason || null,

    cacheHit: false,
    dataReceived: Boolean(candidate),
    executionTimeMs: Date.now() - startedAt,

    name: candidate?.name || token.name || null,
    symbol: candidate?.symbol || token.symbol || null,
    chain: candidate?.chain || token.chain || null,
    address: candidate?.address || token.address || null,
    pairAddress: candidate?.pairAddress || token.pairAddress || null,
    dex: candidate?.dex || null,
    url: candidate?.url || null,
    description: candidate?.description || null,

    priceUsd: numberOrNull(candidate?.priceUsd),
    liquidityUsd: numberOrNull(candidate?.liquidityUsd),
    volume24h: numberOrNull(candidate?.volume24h),
    volume6h: numberOrNull(candidate?.volume6h),
    volume1h: numberOrNull(candidate?.volume1h),
    priceChange24h: numberOrNull(candidate?.priceChange24h),
    priceChange6h: numberOrNull(candidate?.priceChange6h),
    priceChange1h: numberOrNull(candidate?.priceChange1h),
    marketCap: numberOrNull(candidate?.marketCap),
    fdv: numberOrNull(candidate?.fdv),
    tvl: numberOrNull(candidate?.tvl),

    rawCandidate: candidate,

    health: {
      passed: matchResult.status === "SUCCESS",
      missingFields: [],
      warnings: [],
      failed: matchResult.status !== "SUCCESS"
    }
  };

  result.health.missingFields = REQUIRED_FIELDS.filter(field => result[field] === null);

  if (result.status === "NO_CONFIDENT_MATCH") {
    result.health.warnings.push("No confident token match found");
  }

  if (result.status === "NO_DATA") {
    result.health.warnings.push("No market candidates returned");
  }

  if (result.health.missingFields.length > 0) {
    result.health.warnings.push(`Missing fields: ${result.health.missingFields.join(", ")}`);
  }

  if (result.confidence > 0 && result.confidence < DEFAULT_MIN_CONFIDENCE) {
    result.health.warnings.push("Low confidence data match");
  }

  return result;
}

export async function getTokenData(token = {}, options = {}) {
  const key = buildCacheKey(token);
  const useCache = options.useCache !== false;
  const limit = Number(options.limit || DEFAULT_LIMIT);
  const minConfidence = Number(options.minConfidence || DEFAULT_MIN_CONFIDENCE);
  const startedAt = Date.now();

  if (useCache && cache.has(key)) {
    return {
      ...cache.get(key),
      cacheHit: true
    };
  }

  try {
    const candidates = await getFreeMarketDataCandidates({ limit });

    const matchResult = findBestCandidate(candidates, token, {
      minConfidence
    });

    const result = normalizeMarketData(matchResult, token, startedAt);

    result.totalCandidatesChecked = candidates.length;

    result.topCandidates = (matchResult.scored || [])
      .slice(0, 5)
      .map(item => ({
        source: item.candidate?.source || null,
        name: item.candidate?.name || null,
        symbol: item.candidate?.symbol || null,
        chain: item.candidate?.chain || null,
        pairAddress: item.candidate?.pairAddress || null,
        confidence: item.confidence,
        reasons: item.reasons
      }));

    if (useCache) {
      cache.set(key, result);
    }

    return result;

  } catch (err) {
    return {
      status: "FAIL_SOFT",

      token,

      source: "dataOrchestrator",
      confidence: 0,
      matchReasons: [],

      cacheHit: false,
      dataReceived: false,
      executionTimeMs: Date.now() - startedAt,

      error: err.message,

      health: {
        passed: false,
        failed: true,
        missingFields: REQUIRED_FIELDS,
        warnings: [err.message]
      }
    };
  }
}

export async function getTokenDataBatch(tokens = [], options = {}) {
  const results = [];

  for (const token of tokens) {
    const result = await getTokenData(token, options);
    results.push(result);
  }

  return results;
}

export function clearDataCache() {
  cache.clear();

  return {
    status: "SUCCESS",
    message: "Data orchestrator cache cleared"
  };
}

export function getDataCacheStats() {
  return {
    cachedTokens: cache.size,
    keys: [...cache.keys()]
  };
}

export function getDataSourcePriority() {
  return { ...SOURCE_PRIORITY };
}

export function inspectCandidateMatch(candidate = {}, token = {}) {
  return scoreCandidate(candidate, token);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const token = {
    chain: process.argv[2] || "solana",
    symbol: process.argv[3] || "ACT",
    address: process.argv[4] || null
  };

  const result = await getTokenData(token, {
    limit: 250,
    minConfidence: 70,
    useCache: false
  });

  console.log(JSON.stringify(result, null, 2));
}
