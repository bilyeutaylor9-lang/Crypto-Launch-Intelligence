import { getFreeMarketDataCandidates } from "./freeMarketDataConnector.js";

const cache = new Map();

export async function getTokenData(token = {}) {
  const key = `${token.chain || "any"}:${token.address || token.symbol || token.name || "unknown"}`;

  if (cache.has(key)) {
    return { ...cache.get(key), cacheHit: true };
  }

  const startedAt = Date.now();

  try {
    const candidates = await getFreeMarketDataCandidates({ limit: 200 });

    const search = String(token.symbol || token.name || token.address || "")
      .toUpperCase();

    const match =
      candidates.find(c => String(c.symbol || "").toUpperCase() === search) ||
      candidates.find(c => String(c.name || "").toUpperCase() === search) ||
      candidates.find(c => String(c.pairAddress || "").toUpperCase() === search) ||
      candidates[0];

    const result = {
      status: match ? "SUCCESS" : "NO_DATA",
      token,
      source: match?.source || "freeMarketDataConnector",
      cacheHit: false,
      dataReceived: Boolean(match),
      executionTimeMs: Date.now() - startedAt,

      name: match?.name || token.name || null,
      symbol: match?.symbol || token.symbol || null,
      chain: match?.chain || token.chain || null,
      address: match?.address || token.address || null,
      pairAddress: match?.pairAddress || null,
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
      "priceChange24h"
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
      error: err.message
    };
  }
}

export function getDataCacheStats() {
  return {
    cachedTokens: cache.size,
    keys: [...cache.keys()]
  };
}
