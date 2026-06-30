// src/engines/relativeStrengthEngine.js

/**
 * Relative Strength Engine v2
 *
 * Purpose:
 * Measures how strongly a token is outperforming
 * normal market movement.
 */

function num(value = 0) {
  return Number(value || 0);
}

export function calculateRelativeStrengthScore(project = {}) {
  let score = 0;

  const priceChange1h = num(project.priceChange1h);
  const priceChange6h = num(project.priceChange6h);
  const priceChange24h = num(project.priceChange24h);
  const volume24h = num(project.volume24h);
  const liquidityUsd = num(project.liquidityUsd);

  if (priceChange1h >= 3) score += 10;
  if (priceChange1h >= 10) score += 10;

  if (priceChange6h >= 10) score += 15;
  if (priceChange6h >= 25) score += 15;

  if (priceChange24h >= 20) score += 15;
  if (priceChange24h >= 50) score += 15;
  if (priceChange24h >= 100) score += 10;

  if (volume24h >= 100000) score += 10;
  if (volume24h >= 500000) score += 10;

  if (liquidityUsd >= 50000) score += 5;
  if (liquidityUsd >= 250000) score += 5;

  return Math.max(0, Math.min(100, Math.round(score)));
}

export function analyzeRelativeStrength(project = {}) {
  const relativeStrengthScore = calculateRelativeStrengthScore(project);

  return {
    ...project,
    relativeStrengthScore,
    relativeStrengthLevel:
      relativeStrengthScore >= 85 ? "market leader" :
      relativeStrengthScore >= 70 ? "strong outperformer" :
      relativeStrengthScore >= 50 ? "outperforming" :
      relativeStrengthScore >= 30 ? "early strength" :
      "weak",

    evidence: [
      ...(project.evidence || []),
      {
        engine: "Relative Strength Engine v2",
        signal: "Relative market strength",
        confidence: Math.min(relativeStrengthScore / 100, 1),
        impact: relativeStrengthScore >= 50 ? "Positive" : "Neutral"
      }
    ],

    alerts: [
      ...(project.alerts || []),
      ...(relativeStrengthScore >= 70
        ? ["Relative strength leadership detected."]
        : [])
    ]
  };
}

export function analyzeRelativeStrengthBatch(projects = []) {
  return projects
    .map(analyzeRelativeStrength)
    .sort((a, b) => b.relativeStrengthScore - a.relativeStrengthScore);
}
