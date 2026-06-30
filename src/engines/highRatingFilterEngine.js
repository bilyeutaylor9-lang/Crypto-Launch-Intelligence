// src/engines/highRatingFilterEngine.js

/**
 * Crypto Launch Intelligence
 * High Rating Filter Engine
 *
 * Purpose:
 * Only allows stronger projects into the final ranked report.
 * This removes weak meme dust, thin liquidity, low-volume tokens,
 * and low-confidence opportunities.
 */

export const DEFAULT_HIGH_RATING_RULES = {
  minLiquidityUsd: 100000,
  minVolume24h: 250000,
  minRichTokenScore: 50,
  minMomentumShiftScore: 20,
  minOverallOpportunityScore: 40,
  preferMultipleSources: false
};

function num(value = 0) {
  return Number(value || 0);
}

function hasMultipleSources(project = {}) {
  return Array.isArray(project.discoverySources) && project.discoverySources.length >= 2;
}

export function evaluateHighRating(project = {}, rules = DEFAULT_HIGH_RATING_RULES) {
  const reasons = [];

  if (num(project.liquidityUsd) < rules.minLiquidityUsd) {
    reasons.push(`Liquidity under $${rules.minLiquidityUsd}`);
  }

  if (num(project.volume24h) < rules.minVolume24h) {
    reasons.push(`24h volume under $${rules.minVolume24h}`);
  }

  if (num(project.richTokenScore) < rules.minRichTokenScore) {
    reasons.push(`Rich token score under ${rules.minRichTokenScore}`);
  }

  if (num(project.momentumShiftScore) < rules.minMomentumShiftScore) {
    reasons.push(`Momentum score under ${rules.minMomentumShiftScore}`);
  }

  if (num(project.overallOpportunityScore) < rules.minOverallOpportunityScore) {
    reasons.push(`Overall opportunity under ${rules.minOverallOpportunityScore}`);
  }

  if (rules.preferMultipleSources && !hasMultipleSources(project)) {
    reasons.push("Only found on one source");
  }

  return {
    passed: reasons.length === 0,
    reasons
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
      highRatingReasons: rating.reasons
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
