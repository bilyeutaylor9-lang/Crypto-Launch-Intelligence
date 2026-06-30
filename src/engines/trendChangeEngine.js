// src/engines/trendChangeEngine.js

/**
 * Trend Change Engine
 *
 * Purpose:
 * Detects when a project is shifting from flat/weak behavior
 * into improving momentum across price, volume, liquidity,
 * holders, and social activity.
 */

export function detectTrendChange(project = {}) {
  const priceChange24h = Number(project.priceChange24h || 0);
  const priceChange6h = Number(project.priceChange6h || 0);
  const volumeChange24h = Number(project.volumeChange24h || 0);
  const liquidityGrowth24h = Number(project.liquidityGrowth24h || 0);
  const holderGrowthRate = Number(project.holderGrowth?.holderGrowthRate || project.holderGrowthRate || 0);
  const socialAccelerationScore = Number(project.socialAccelerationScore || 0);

  const positiveSignals = [
    priceChange6h > priceChange24h / 4,
    volumeChange24h > 50,
    liquidityGrowth24h > 15,
    holderGrowthRate > 10,
    socialAccelerationScore > 50
  ].filter(Boolean).length;

  return {
    positiveSignals,
    trendChanging: positiveSignals >= 3
  };
}

export function scoreTrendChange(project = {}) {
  const result = detectTrendChange(project);

  let score = result.positiveSignals * 18;

  if (project.velocityScore >= 60) score += 10;
  if (project.accelerationScore >= 60) score += 10;

  return Math.max(0, Math.min(100, score));
}

export function analyzeTrendChange(project = {}) {
  const trendChange = detectTrendChange(project);
  const trendChangeScore = scoreTrendChange(project);

  return {
    ...project,
    trendChange,
    trendChangeScore,
    trendChangeLevel:
      trendChangeScore >= 80 ? "major trend shift" :
      trendChangeScore >= 60 ? "confirmed improvement" :
      trendChangeScore >= 40 ? "early improvement" :
      "no clear shift",

    evidence: [
      ...(project.evidence || []),
      {
        engine: "Trend Change Engine",
        signal: "Trend behavior change",
        confidence: Math.min(trendChangeScore / 100, 1),
        impact: trendChange.trendChanging ? "Positive" : "Neutral"
      }
    ],

    alerts: [
      ...(project.alerts || []),
      ...(trendChange.trendChanging ? ["Trend change detected."] : [])
    ]
  };
}

export function analyzeTrendChangeBatch(projects = []) {
  return projects
    .map(analyzeTrendChange)
    .sort((a, b) => b.trendChangeScore - a.trendChangeScore);
}
