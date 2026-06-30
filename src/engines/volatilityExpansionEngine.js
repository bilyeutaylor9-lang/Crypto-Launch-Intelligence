// src/engines/volatilityExpansionEngine.js

/**
 * Volatility Expansion Engine
 *
 * Purpose:
 * Detects when volatility is expanding in a way that may
 * support a larger momentum move.
 */

export function calculateVolatilityExpansion(project = {}) {
  const currentRange = Number(project.currentRange24h || project.range24h || 0);
  const previousRange = Number(project.previousRange24h || 0);
  const atrNow = Number(project.atrNow || project.atr24h || 0);
  const atrPrevious = Number(project.atrPrevious || 0);

  const rangeExpansion =
    previousRange > 0 ? ((currentRange - previousRange) / previousRange) * 100 : 0;

  const atrExpansion =
    atrPrevious > 0 ? ((atrNow - atrPrevious) / atrPrevious) * 100 : 0;

  return {
    currentRange,
    previousRange,
    atrNow,
    atrPrevious,
    rangeExpansion,
    atrExpansion
  };
}

export function scoreVolatilityExpansion(project = {}) {
  const volatility = calculateVolatilityExpansion(project);

  let score = 0;

  if (volatility.rangeExpansion >= 25) score += 25;
  if (volatility.rangeExpansion >= 75) score += 25;
  if (volatility.atrExpansion >= 20) score += 20;
  if (volatility.atrExpansion >= 50) score += 20;
  if (project.volumeChange24h >= 75) score += 10;

  return Math.max(0, Math.min(100, score));
}

export function analyzeVolatilityExpansion(project = {}) {
  const volatilityExpansion = calculateVolatilityExpansion(project);
  const volatilityExpansionScore = scoreVolatilityExpansion(project);

  return {
    ...project,
    volatilityExpansion,
    volatilityExpansionScore,

    volatilityExpansionLevel:
      volatilityExpansionScore >= 85 ? "explosive expansion" :
      volatilityExpansionScore >= 65 ? "strong expansion" :
      volatilityExpansionScore >= 45 ? "early expansion" :
      "normal volatility",

    evidence: [
      ...(project.evidence || []),
      {
        engine: "Volatility Expansion Engine",
        signal: "Volatility expansion",
        confidence: Math.min(volatilityExpansionScore / 100, 1),
        impact: volatilityExpansionScore >= 60 ? "Positive" : "Neutral"
      }
    ],

    alerts: [
      ...(project.alerts || []),
      ...(volatilityExpansionScore >= 80
        ? ["Volatility expansion detected."]
        : [])
    ]
  };
}

export function analyzeVolatilityExpansionBatch(projects = []) {
  return projects
    .map(analyzeVolatilityExpansion)
    .sort((a, b) => b.volatilityExpansionScore - a.volatilityExpansionScore);
}
