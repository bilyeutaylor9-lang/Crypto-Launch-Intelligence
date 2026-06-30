// src/engines/whaleActivityEngine.js

/**
 * Whale Activity Engine
 *
 * Purpose:
 * Detects large-wallet accumulation, selling pressure,
 * and whale behavior changes around early-stage crypto projects.
 */

export function calculateWhaleActivity(project = {}) {
  const whaleBuys24h = Number(project.whaleBuys24h || 0);
  const whaleSells24h = Number(project.whaleSells24h || 0);
  const whaleNetFlowUsd =
    Number(project.whaleBuyVolumeUsd || 0) - Number(project.whaleSellVolumeUsd || 0);

  const whaleBuySellRatio =
    whaleSells24h > 0 ? whaleBuys24h / whaleSells24h : whaleBuys24h;

  return {
    whaleBuys24h,
    whaleSells24h,
    whaleNetFlowUsd,
    whaleBuySellRatio
  };
}

export function scoreWhaleActivity(project = {}) {
  const activity = calculateWhaleActivity(project);

  let score = 0;

  if (activity.whaleBuys24h >= 3) score += 20;
  if (activity.whaleBuys24h >= 10) score += 20;
  if (activity.whaleNetFlowUsd > 10000) score += 20;
  if (activity.whaleNetFlowUsd > 50000) score += 20;
  if (activity.whaleBuySellRatio >= 2) score += 10;
  if (activity.whaleSells24h > activity.whaleBuys24h) score -= 20;

  return Math.max(0, Math.min(100, score));
}

export function analyzeWhaleActivity(project = {}) {
  const whaleActivity = calculateWhaleActivity(project);
  const whaleActivityScore = scoreWhaleActivity(project);

  return {
    ...project,
    whaleActivity,
    whaleActivityScore,
    whaleActivityLevel:
      whaleActivityScore >= 80 ? "strong accumulation" :
      whaleActivityScore >= 60 ? "positive accumulation" :
      whaleActivityScore >= 40 ? "mixed" :
      "weak",
    whaleActivityReason:
      whaleActivityScore >= 60
        ? "Whale activity appears net-positive."
        : "Whale activity is limited, mixed, or negative."
  };
}

export function analyzeWhaleActivityBatch(projects = []) {
  return projects
    .map(analyzeWhaleActivity)
    .sort((a, b) => b.whaleActivityScore - a.whaleActivityScore);
}
