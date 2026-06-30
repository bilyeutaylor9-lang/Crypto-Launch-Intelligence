// src/engines/earlyBreakoutEngine.js

/**
 * Early Breakout Engine
 *
 * Purpose:
 * Detects when a project is showing early breakout behavior
 * before the move is fully obvious.
 */

export function detectEarlyBreakout(project = {}) {
  const priceChange6h = Number(project.priceChange6h || 0);
  const priceChange24h = Number(project.priceChange24h || 0);
  const volumeChange24h = Number(project.volumeChange24h || 0);
  const buyPressureScore = Number(project.buyPressureScore || 0);
  const sellPressureScore = Number(project.sellPressureScore || 0);
  const relativeStrengthScore = Number(project.relativeStrengthScore || 0);
  const liquidityGrowth24h = Number(project.liquidityGrowth24h || 0);

  const breakoutSignals = [
    priceChange6h > 5,
    priceChange24h > 10,
    volumeChange24h > 75,
    buyPressureScore >= 60,
    sellPressureScore <= 40,
    relativeStrengthScore >= 60,
    liquidityGrowth24h >= 10
  ].filter(Boolean).length;

  return {
    breakoutSignals,
    earlyBreakoutDetected: breakoutSignals >= 5
  };
}

export function scoreEarlyBreakout(project = {}) {
  const result = detectEarlyBreakout(project);

  let score = result.breakoutSignals * 14;

  if (project.opportunityTimingScore >= 60) score += 10;
  if (project.smartMoneyRotationScore >= 60) score += 10;

  return Math.max(0, Math.min(100, score));
}

export function analyzeEarlyBreakout(project = {}) {
  const earlyBreakout = detectEarlyBreakout(project);
  const earlyBreakoutScore = scoreEarlyBreakout(project);

  return {
    ...project,
    earlyBreakout,
    earlyBreakoutScore,

    earlyBreakoutLevel:
      earlyBreakoutScore >= 85 ? "confirmed early breakout" :
      earlyBreakoutScore >= 65 ? "strong breakout setup" :
      earlyBreakoutScore >= 45 ? "early breakout forming" :
      "no breakout yet",

    evidence: [
      ...(project.evidence || []),
      {
        engine: "Early Breakout Engine",
        signal: "Early breakout behavior",
        confidence: Math.min(earlyBreakoutScore / 100, 1),
        impact: earlyBreakout.earlyBreakoutDetected ? "Positive" : "Neutral"
      }
    ],

    alerts: [
      ...(project.alerts || []),
      ...(earlyBreakout.earlyBreakoutDetected
        ? ["Early breakout behavior detected."]
        : [])
    ]
  };
}

export function analyzeEarlyBreakoutBatch(projects = []) {
  return projects
    .map(analyzeEarlyBreakout)
    .sort((a, b) => b.earlyBreakoutScore - a.earlyBreakoutScore);
}
