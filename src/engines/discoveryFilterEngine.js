// src/engines/discoveryFilterEngine.js

/**
 * Crypto Launch Intelligence
 * Discovery Filter Engine
 *
 * Purpose:
 * Filters live token candidates before they enter the full
 * intelligence pipeline.
 */

export const DEFAULT_DISCOVERY_FILTERS = {
  minLiquidityUsd: 10000,
  minVolume24h: 1000,
  minBuyTransactions24h: 5,
  maxSellPressureRatio: 0.85,
  minPriceUsd: 0,
  requirePairAddress: true
};

export function calculateSellPressureRatio(project = {}) {
  const buys = Number(project.buyTransactions24h || 0);
  const sells = Number(project.sellTransactions24h || 0);
  const total = buys + sells;

  if (total === 0) return 0;

  return sells / total;
}

export function evaluateDiscoveryFilters(project = {}, filters = DEFAULT_DISCOVERY_FILTERS) {
  const reasons = [];

  const liquidityUsd = Number(project.liquidityUsd || 0);
  const volume24h = Number(project.volume24h || 0);
  const buyTransactions24h = Number(project.buyTransactions24h || 0);
  const priceUsd = Number(project.priceUsd || 0);
  const sellPressureRatio = calculateSellPressureRatio(project);

  if (liquidityUsd < filters.minLiquidityUsd) {
    reasons.push(`Liquidity below ${filters.minLiquidityUsd}`);
  }

  if (volume24h < filters.minVolume24h) {
    reasons.push(`24h volume below ${filters.minVolume24h}`);
  }

  if (buyTransactions24h < filters.minBuyTransactions24h) {
    reasons.push(`Buy transactions below ${filters.minBuyTransactions24h}`);
  }

  if (sellPressureRatio > filters.maxSellPressureRatio) {
    reasons.push("Sell pressure too high");
  }

  if (priceUsd <= filters.minPriceUsd) {
    reasons.push("Invalid price");
  }

  if (filters.requirePairAddress && !project.pairAddress) {
    reasons.push("Missing pair address");
  }

  return {
    passed: reasons.length === 0,
    reasons,
    sellPressureRatio
  };
}

export function filterDiscoveryCandidates(projects = [], customFilters = {}) {
  const filters = {
    ...DEFAULT_DISCOVERY_FILTERS,
    ...customFilters
  };

  const accepted = [];
  const rejected = [];

  for (const project of projects) {
    const evaluation = evaluateDiscoveryFilters(project, filters);

    const enriched = {
      ...project,
      discoveryFilterPassed: evaluation.passed,
      discoveryFilterReasons: evaluation.reasons,
      sellPressureRatio: evaluation.sellPressureRatio
    };

    if (evaluation.passed) {
      accepted.push(enriched);
    } else {
      rejected.push(enriched);
    }
  }

  return {
    filters,
    accepted,
    rejected,
    acceptedCount: accepted.length,
    rejectedCount: rejected.length
  };
}
