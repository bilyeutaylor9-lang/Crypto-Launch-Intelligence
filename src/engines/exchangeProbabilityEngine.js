// src/engines/exchangeProbabilityEngine.js

/**
 * Exchange Probability Engine
 *
 * Purpose:
 * Estimates whether a project may gain exchange attention
 * based on liquidity, volume, holders, narrative strength,
 * community size, and listing signals.
 */

export function scoreExchangeProbability(project = {}) {
  let score = 0;

  const liquidity = Number(project.liquidityUsd || 0);
  const volume24h = Number(project.volume24h || 0);
  const holders = Number(project.holders || project.holdersNow || 0);
  const followers = Number(project.followers || project.xFollowers || 0);

  if (liquidity >= 100000) score += 15;
  if (liquidity >= 500000) score += 15;
  if (volume24h >= 250000) score += 15;
  if (volume24h >= 1000000) score += 15;
  if (holders >= 1000) score += 10;
  if (holders >= 5000) score += 10;
  if (followers >= 10000) score += 10;
  if (project.narrativeScore >= 70) score += 10;
  if (project.cexListingSignal) score += 10;

  return Math.max(0, Math.min(100, score));
}

export function classifyExchangeProbability(score = 0) {
  if (score >= 85) return "very high";
  if (score >= 70) return "high";
  if (score >= 50) return "possible";
  if (score >= 30) return "early";
  return "low";
}

export function analyzeExchangeProbability(project = {}) {
  const exchangeProbabilityScore = scoreExchangeProbability(project);

  return {
    ...project,
    exchangeProbabilityScore,
    exchangeProbability: classifyExchangeProbability(exchangeProbabilityScore),
    exchangeProbabilityReason:
      exchangeProbabilityScore >= 70
        ? "Project shows signals that may attract exchange attention."
        : "Exchange attention signal is still early or limited."
  };
}

export function analyzeExchangeProbabilityBatch(projects = []) {
  return projects
    .map(analyzeExchangeProbability)
    .sort((a, b) => b.exchangeProbabilityScore - a.exchangeProbabilityScore);
}
