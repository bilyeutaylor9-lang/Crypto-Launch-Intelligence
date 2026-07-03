// src/data/dataOrchestrator.js

import { getFreeMarketDataCandidates } from "./freeMarketDataConnector.js";

const cache = new Map();

function normalize(value = "") {
  return String(value || "").trim().toUpperCase();
}

export async function getTokenData(token = {}) {
  const key = `${token.chain || "any"}:${token.address || token.symbol || token.name || "unknown"}`;

  if (cache.has(key)) {
    return {
      ...cache.get(key),
      cacheHit: true
    };
  }

  const startedAt = Date.now();

  try {
    const candidates = await getFreeMarketDataCandidates({
      limit: 200
    });

    const tokenAddress = normalize(token.address);
    const tokenPair = normalize(token.pairAddress);
    const tokenChain = normalize(token.chain);
    const tokenSymbol = normalize(token.symbol);
    const tokenName = normalize(token.name);

    const match =
      // 1. Exact contract address
      candidates.find(c =>
        tokenAddress &&
        normalize(c.address) === tokenAddress
      ) ||

      // 2. Exact pair address
      candidates.find(c =>
        tokenPair &&
        normalize(c.pairAddress) === tokenPair
      ) ||

      // 3. Exact chain + symbol
      candidates.find(c =>
        tokenChain &&
        tokenSymbol &&
        normalize(c.chain) === tokenChain &&
        normalize(c.symbol) === tokenSymbol
      ) ||

      // 4. Symbol only
      candidates.find(c =>
        tokenSymbol &&
        normalize(c.symbol) === tokenSymbol
      ) ||

      // 5. Name only
      candidates.find(c =>
        tokenName &&
        normalize(c.name) === tokenName
      ) ||

      null;

    const result = {
      status: match ? "SUCCESS" : "NO_DATA",

      token,

      source: match?.source || null,

      cacheHit: false,

      dataReceived: Boolean(match),

      executionTimeMs: Date.now() - startedAt,

      name: match?.name || token.name || null,

      symbol: match?.symbol || token.symbol || null,

      chain: match?.chain || token.chain || null,

      address: match?.address || token.address || null,

      pairAddress: match?.pairAddress || token.pairAddress || null,

      url: match?.url || null,

      priceUsd: match?.priceUsd ?? null,

      liquidityUsd: match?.liquidityUsd ?? null,

      volume24h: match?.volume24h ?? null,

      priceChange24h: match?.priceChange24h ?? null,

      marketCap: match?.marketCap ?? null,

      tvl: match?.tvl ?? null,

      health: {
        passed: Boolean(match),
        missingFields: []
      }
    };

    result.health.missingFields = [
      "priceUsd",
      "liquidityUsd",
      "volume24h",
      "priceChange24h",
      "marketCap",
      "tvl"
    ].filter(field => result[field] === null);

    cache.set(key, result);

    return result;

  } catch (err) {
    return {
      status: "FAIL_SOFT",

      token,

      source: "dataOrchestrator",

      cacheHit: false,

      dataReceived: false,

      executionTimeMs: Date.now() - startedAt,

      error: err.message,

      health: {
        passed: false,
        missingFields: [],
        error: err.message
      }
    };
  }
}

export function clearDataCache() {
  cache.clear();
}

export function getDataCacheStats() {
  return {
    cachedTokens: cache.size,
    keys: [...cache.keys()]
  };
}
