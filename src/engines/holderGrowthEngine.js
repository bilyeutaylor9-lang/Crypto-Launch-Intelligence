// src/engines/holderGrowthEngine.js

/**
 * Holder Growth Engine
 *
 * Purpose:
 * Detects whether a token is gaining real ownership distribution
 * through increasing holder count and improving holder quality.
 */

export function calculateHolderGrowth(project = {}) {
  const holdersNow = Number(project.holdersNow || project.holders || 0);
  const holdersPrevious = Number(project.holdersPrevious || 0);

  const holderDelta = holdersNow - holdersPrevious;

  const holderGrowthRate =
    holdersPrevious > 0 ? (holderDelta / holdersPrevious) * 100 : 0;

  return {
    holdersNow,
    holdersPrevious,
    holderDelta,
    holderGrowthRate
  };
}

export function scoreHolderGrowth(project = {}) {
  const growth = calculateHolderGrowth(project);

  let score = 0;

  if (growth.holdersNow >= 100) score += 10;
  if (growth.holdersNow >= 500) score += 15;
  if (growth.holdersNow >= 1000) score += 15;
  if (growth.holderGrowthRate >= 10) score += 15;
  if (growth.holderGrowthRate >= 30) score += 20;
  if (growth.holderGrowthRate >= 75) score += 20;
  if (project.uniqueBuyers24h >= 100) score += 5;

  return Math.max(0, Math.min(100, score));
}

export function analyzeHolderGrowth(project = {}) {
  const holderGrowth = calculateHolderGrowth(project);
  const holderGrowthScore = scoreHolderGrowth(project);

  return {
    ...project,
    holderGrowth,
    holderGrowthScore,
    holderGrowthLevel:
      holderGrowthScore >= 80 ? "explosive" :
      holderGrowthScore >= 60 ? "strong" :
      holderGrowthScore >= 40 ? "growing" :
      "early",
    holderGrowthReason:
      holderGrowthScore >= 60
        ? "Holder base is expanding meaningfully."
        : "Holder growth is still early or limited."
  };
}

export function analyzeHolderGrowthBatch(projects = []) {
  return projects
    .map(analyzeHolderGrowth)
    .sort((a, b) => b.holderGrowthScore - a.holderGrowthScore);
}
