// src/engines/highRatingFilterEngine.js

/**
 * Crypto Launch Intelligence
 * High Rating Filter Engine v2
 *
 * Purpose:
 * Soft-ranks stronger projects without rejecting good market-wide
 * projects just because some DEX-only fields are missing.
 */

export const DEFAULT_HIGH_RATING_RULES = {
  minLiquidityUsd: 50000,
  minVolume24h: 100000,
  minOverallOpportunityScore: 35,
  minMarketRankScore: 45,
  preferMultipleSources: false
};

function num(value = 0) {
  return Number(value || 0);
}

function hasRealValue(value) {
  return value !== undefined && value !== null && value !== "";
}

function hasMultipleSources(project = {}) {
  return Array.isArray(project.discoverySources) && project.discoverySources.length >= 2;
}

export function evaluateHighRating(project = {}, rules = DEFAULT_HIGH_RATING_RULES) {
  const reasons = [];
  let bonusScore = 0;

  const liquidity = num(project.liquidityUsd || project.marketCap || project.tvl);
  const volume = num(project.volume24h);
  const overall = num(project.overallOpportunityScore);
  const marketRank = num(project.marketRankScore);

  if (liquidity < rules.minLiquidityUsd) {
    reasons.push(`Liquidity/market cap under $${rules.minLiquidityUsd}`);
  } else {
    bonusScore += 20;
  }

  if (volume < rules.minVolume24h) {
    reasons.push(`24h volume under $${rules.minVolume24h}`);
  } else {
    bonusScore += 20;
  }

  if (hasRealValue(project.marketRankScore)) {
    if (marketRank < rules.minMarketRankScore) {
      reasons.push(`Market rank under ${rules.minMarketRankScore}`);
    } else {
      bonusScore += 25;
    }
  }

  if (hasRealValue(project.overallOpportunityScore)) {
    if (overall < rules.minOverallOpportunityScore) {
      reasons.push(`Overall opportunity under ${rules.minOverallOpportunityScore}`);
    } else {
      bonusScore += 20;
    }
  }

  if (hasRealValue(project.richTokenScore) && num(project.richTokenScore) >= 50) {
    bonusScore += 10;
  }

  if (hasRealValue(project.momentumShiftScore) && num(project.momentumShiftScore) >= 50) {
    bonusScore += 10;
  }

  if (rules.preferMultipleSources && !hasMultipleSources(project)) {
    reasons.push("Only found on one source");
  } else if (hasMultipleSources(project)) {
    bonusScore += 10;
  }

  const passed = bonusScore >= 45 && reasons.length <= 2;

  return {
    passed,
    reasons,
    bonusScore
  };
}

export function applyHighRatingFilter(projects = [], customRules = {}) {
  const rules = {
    ...DEFAULT_HIGH_RATING_RULES,
    ...customRules
  };

  const accepted = [];
  const rejected = [];

  for (const project of projects) {
    const rating = evaluateHighRating(project, rules);

    const enriched = {
      ...project,
      highRatingPassed: rating.passed,
      highRatingReasons: rating.reasons,
      highRatingBonusScore: rating.bonusScore
    };

    if (rating.passed) {
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
