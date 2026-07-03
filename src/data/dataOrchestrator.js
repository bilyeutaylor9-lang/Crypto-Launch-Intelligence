import { getFreeMarketData } from "./freeMarketDataConnector.js";

const cache = new Map();

export async function getTokenData(token) {
  const key = `${token.chain || "unknown"}:${token.address || token.symbol}`;

  if (cache.has(key)) {
    return {
      ...cache.get(key),
      cacheHit: true
    };
  }

  const startedAt = Date.now();

  try {
    const market = await getFreeMarketData(token);

    const result = {
      status: "SUCCESS",
      token,
      source: market?.source || "freeMarketDataConnector",
      cacheHit: false,
      dataReceived: Boolean(market),
      executionTimeMs: Date.now() - startedAt,

      priceUsd: market?.priceUsd ?? null,
      liquidityUsd: market?.liquidityUsd ?? null,
      volume24h: market?.volume24h ?? null,
      volume6h: market?.volume6h ?? null,
      volume1h: market?.volume1h ?? null,
      priceChange24h: market?.priceChange24h ?? null,
      priceChange6h: market?.priceChange6h ?? null,
      priceChange1h: market?.priceChange1h ?? null,
      buyTransactions24h: market?.buyTransactions24h ?? null,
      sellTransactions24h: market?.sellTransactions24h ?? null,
      pairCreatedAt: market?.pairCreatedAt ?? null,
      url: market?.url ?? null,

      health: {
        passed: true,
        missingFields: []
      }
    };

    result.health.missingFields = Object.entries(result)
      .filter(([key, value]) =>
        [
          "priceUsd",
          "liquidityUsd",
          "volume24h",
          "priceChange24h"
        ].includes(key) && value === null
      )
      .map(([key]) => key);

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
