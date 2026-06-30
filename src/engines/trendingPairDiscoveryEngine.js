// src/engines/trendingPairDiscoveryEngine.js

/**
 * Trending Pair Discovery Engine
 *
 * Purpose:
 * Detects pairs that are beginning to trend based on
 * volume, liquidity, transaction activity, and score changes.
 */

export function calculateTrendingPairScore(pair = {}) {
  let score = 0;

  const volume24h = Number(pair.volume24h || pair.volume?.h24 || 0);
  const volume6h = Number(pair.volume6h || pair.volume?.h6 || 0);
  const volume1h = Number(pair.volume1h || pair.volume?.h1 || 0);
  const liquidityUsd = Number(pair.liquidityUsd || pair.liquidity?.usd || 0);
  const txns24h =
    Number(pair.txns24h || pair.txns?.h24?.buys || 0) +
    Number(pair.txns24hSells || pair.txns?.h24?.sells || 0);

  if (volume1h > 5000) score += 15;
  if (volume6h > 25000) score += 15;
  if (volume24h > 100000) score += 20;
  if (liquidityUsd > 25000) score += 15;
  if (liquidityUsd > 100000) score += 10;
  if (txns24h > 250) score += 15;
  if (pair.scoreDelta && pair.scoreDelta >= 15) score += 10;

  return Math.max(0, Math.min(100, score));
}

export function detectTrendingPair(pair = {}) {
  const score = calculateTrendingPairScore(pair);

  return {
    ...pair,
    discoveryType: "trending-pair",
    trendingPairScore: score,
    isTrending: score >= 50,
    discoveryReason:
      score >= 50
        ? "Pair is showing early trending behavior."
        : "Pair does not meet trending threshold yet."
  };
}

export function discoverTrendingPairs(pairs = []) {
  return pairs
    .map(detectTrendingPair)
    .filter(pair => pair.isTrending)
    .sort((a, b) => b.trendingPairScore - a.trendingPairScore);
}
