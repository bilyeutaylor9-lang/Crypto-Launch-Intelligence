// src/engines/relativeStrengthEngine.js

/**
 * Relative Strength Engine
 *
 * Purpose:
 * Measures whether a project is outperforming its chain,
 * sector, narrative, or broader crypto market.
 */

export function calculateRelativeStrength(project = {}) {
  const projectChange24h = Number(project.priceChange24h || 0);
  const marketChange24h = Number(project.marketChange24h || 0);
  const sectorChange24h = Number(project.sectorChange24h || 0);
  const chainChange24h = Number(project.chainChange24h || 0);
  const narrativeChange24h = Number(project.narrativeChange24h || 0);

  return {
    vsMarket: projectChange24h - marketChange24h,
    vsSector: projectChange24h - sectorChange24h,
    vsChain: projectChange24h - chainChange24h,
    vsNarrative: projectChange24h - narrativeChange24h
  };
}

export function scoreRelativeStrength(project = {}) {
  const rs = calculateRelativeStrength(project);

  let score = 0;

  if (rs.vsMarket > 0) score += 20;
  if (rs.vsMarket > 10) score += 10;
  if (rs.vsSector > 0) score += 20;
  if (rs.vsChain > 0) score += 20;
  if (rs.vsNarrative > 0) score += 20;
  if (project.buyPressureScore >= 60) score += 10;

  return Math.max(0, Math.min(100, score));
}

export function analyzeRelativeStrength(project = {}) {
  const relativeStrength = calculateRelativeStrength(project);
  const relativeStrengthScore = scoreRelativeStrength(project);

  return {
    ...project,
    relativeStrength,
    relativeStrengthScore,

    relativeStrengthLevel:
      relativeStrengthScore >= 85 ? "market leader" :
      relativeStrengthScore >= 65 ? "strong outperformer" :
      relativeStrengthScore >= 45 ? "early outperformer" :
      "weak or neutral",

    evidence: [
      ...(project.evidence || []),
      {
        engine: "Relative Strength Engine",
        signal: "Relative outperformance",
        confidence: Math.min(relativeStrengthScore / 100, 1),
        impact: relativeStrengthScore >= 60 ? "Positive" : "Neutral"
      }
    ],

    alerts: [
      ...(project.alerts || []),
      ...(relativeStrengthScore >= 80
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
