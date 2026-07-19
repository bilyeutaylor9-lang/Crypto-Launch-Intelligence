// src/engines/marketRankingEngine.js

/**
 * Crypto Launch Intelligence
 * Market Ranking Engine
 *
 * Purpose:
 * Scores every project across the whole market without hard-rejecting
 * projects just because some data is missing.
 */

function num(value = 0) {
  return Number(value || 0);
}

function hasValue(value) {
  return value !== undefined && value !== null && value !== "";
}

function sourceCount(project = {}) {
  return Array.isArray(project.discoverySources)
    ? project.discoverySources.length
    : project.source
      ? 1
      : 0;
}

function clamp(score) {
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function calculateMarketRankScore(project = {}) {
  let score = 0;

  const liquidity = num(project.liquidityUsd);
  const volume = num(project.volume24h);
  const marketCap = num(project.marketCap || project.circulatingMarketCap || project.circulatingMarketCapUsd);
  const priceChange24h = num(project.priceChange24h);

  if (liquidity >= 100000) score += 10;
  if (liquidity >= 500000) score += 10;
  if (liquidity >= 1000000) score += 10;

  if (volume >= 250000) score += 10;
  if (volume >= 1000000) score += 10;
  if (volume >= 5000000) score += 10;

  if (marketCap >= 1000000) score += 8;
  if (marketCap >= 10000000) score += 8;
  if (marketCap >= 100000000) score += 6;

  if (priceChange24h > 5) score += 5;
  if (priceChange24h > 20) score += 7;
  if (priceChange24h > 50) score += 8;

  if (sourceCount(project) >= 2) score += 8;
  if (sourceCount(project) >= 3) score += 7;

  if (hasValue(project.richTokenScore)) score += num(project.richTokenScore) * 0.15;
  if (hasValue(project.momentumShiftScore)) score += num(project.momentumShiftScore) * 0.15;
  if (hasValue(project.relativeStrengthScore)) score += num(project.relativeStrengthScore) * 0.10;
  if (hasValue(project.buyPressureScore)) score += num(project.buyPressureScore) * 0.10;
  if (hasValue(project.liquidityExpansionScore)) score += num(project.liquidityExpansionScore) * 0.10;
  if (hasValue(project.earlyBreakoutScore)) score += num(project.earlyBreakoutScore) * 0.10;

  return clamp(score);
}

export function classifyMarketRank(score = 0) {
  if (score >= 90) return "institutional grade";
  if (score >= 80) return "A grade opportunity";
  if (score >= 70) return "B grade opportunity";
  if (score >= 60) return "watchlist candidate";
  if (score >= 45) return "early market candidate";
  return "low priority";
}

export function analyzeMarketRank(project = {}) {
  const marketRankScore = calculateMarketRankScore(project);

  return {
    ...project,
    marketRankScore,
    marketRankLevel: classifyMarketRank(marketRankScore),
    evidence: [
      ...(project.evidence || []),
      {
        engine: "Market Ranking Engine",
        signal: "Progressive market-wide ranking",
        confidence: Math.min(marketRankScore / 100, 1),
        impact: marketRankScore >= 60 ? "Positive" : "Neutral"
      }
    ],
    alerts: [
      ...(project.alerts || []),
      ...(marketRankScore >= 80 ? ["High market-rank opportunity detected."] : [])
    ]
  };
}

export function analyzeMarketRankBatch(projects = []) {
  return projects
    .map(analyzeMarketRank)
    .sort((a, b) => b.marketRankScore - a.marketRankScore);
}
