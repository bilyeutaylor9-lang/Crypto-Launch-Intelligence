// src/engines/projectQualityGateEngine.js

/**
 * Crypto Launch Intelligence
 * Project Quality Gate Engine
 *
 * Purpose:
 * Rejects weak, thin, noisy, or unsafe-looking projects before
 * they reach the final opportunity ranking.
 */

export const DEFAULT_PROJECT_QUALITY_RULES = {
  minLiquidityUsd: 50000,
  minVolume24h: 100000,
  minBuyTransactions24h: 25,
  maxSellPressureRatio: 0.8,
  minRichTokenScore: 40,
  requireChart: true,
  requirePairAddress: true
};

function num(value = 0) {
  return Number(value || 0);
}

function sellPressureRatio(project = {}) {
  const buys = num(project.buyTransactions24h);
  const sells = num(project.sellTransactions24h);
  const total = buys + sells;

  if (total <= 0) return 0;
  return sells / total;
}

export function evaluateProjectQuality(project = {}, rules = DEFAULT_PROJECT_QUALITY_RULES) {
  const reasons = [];

  if (num(project.liquidityUsd) < rules.minLiquidityUsd) {
    reasons.push(`Liquidity under $${rules.minLiquidityUsd}`);
  }

  if (num(project.volume24h) < rules.minVolume24h) {
    reasons.push(`24h volume under $${rules.minVolume24h}`);
  }

  if (num(project.buyTransactions24h) < rules.minBuyTransactions24h) {
    reasons.push(`Buy transactions under ${rules.minBuyTransactions24h}`);
  }

  if (sellPressureRatio(project) > rules.maxSellPressureRatio) {
    reasons.push("Sell pressure too high");
  }

  if (num(project.richTokenScore) < rules.minRichTokenScore) {
    reasons.push(`Rich token score under ${rules.minRichTokenScore}`);
  }

  if (rules.requireChart && !project.url) {
    reasons.push("Missing chart/source URL");
  }

  if (rules.requirePairAddress && !project.pairAddress) {
    reasons.push("Missing pair address");
  }

  return {
    passed: reasons.length === 0,
    reasons,
    sellPressureRatio: sellPressureRatio(project)
  };
}

export function applyProjectQualityGate(projects = [], customRules = {}) {
  const rules = {
    ...DEFAULT_PROJECT_QUALITY_RULES,
    ...customRules
  };

  const accepted = [];
  const rejected = [];

  for (const project of projects) {
    const quality = evaluateProjectQuality(project, rules);

    const enriched = {
      ...project,
      projectQualityPassed: quality.passed,
      projectQualityReasons: quality.reasons,
      projectSellPressureRatio: quality.sellPressureRatio
    };

    if (quality.passed) {
      accepted.push(enriched);
    } else {
      rejected.push(enriched);
    }
  }

  return {
    rules,
    accepted,
    rejected,
    acceptedCount: accepted.length,
    rejectedCount: rejected.length
  };
}
