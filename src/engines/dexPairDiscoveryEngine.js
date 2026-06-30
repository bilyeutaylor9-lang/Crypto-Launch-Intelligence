// src/engines/dexPairDiscoveryEngine.js

/**
 * DEX Pair Discovery Engine
 *
 * Purpose:
 * Identifies newly created or fast-growing DEX trading pairs.
 */

export function normalizeDexPair(pair = {}) {
  return {
    id: pair.id || pair.pairAddress || "unknown",
    pairAddress: pair.pairAddress || null,
    chain: pair.chain || pair.chainId || "unknown",
    baseToken: pair.baseToken || {},
    quoteToken: pair.quoteToken || {},
    dex: pair.dex || pair.dexId || "unknown",
    priceUsd: Number(pair.priceUsd || 0),
    liquidityUsd: Number(pair.liquidityUsd || pair.liquidity?.usd || 0),
    volume24h: Number(pair.volume24h || pair.volume?.h24 || 0),
    pairCreatedAt: pair.pairCreatedAt || pair.createdAt || null,
    url: pair.url || null
  };
}

export function scoreDexPair(pair = {}) {
  const normalized = normalizeDexPair(pair);

  let score = 0;

  if (normalized.liquidityUsd >= 25000) score += 25;
  if (normalized.liquidityUsd >= 100000) score += 20;
  if (normalized.volume24h >= 50000) score += 20;
  if (normalized.volume24h >= normalized.liquidityUsd) score += 15;
  if (normalized.pairCreatedAt) score += 10;
  if (normalized.dex !== "unknown") score += 10;

  return Math.max(0, Math.min(100, score));
}

export function discoverDexPairs(pairs = []) {
  return pairs
    .map(pair => {
      const normalized = normalizeDexPair(pair);

      return {
        ...normalized,
        discoveryType: "dex-pair",
        dexPairScore: scoreDexPair(pair),
        discoveryReason: "DEX trading pair detected for launch intelligence review."
      };
    })
    .filter(pair => pair.dexPairScore >= 30)
    .sort((a, b) => b.dexPairScore - a.dexPairScore);
}
