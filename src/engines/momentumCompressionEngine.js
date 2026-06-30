// src/engines/momentumCompressionEngine.js

/**
 * Momentum Compression Engine
 *
 * Purpose:
 * Detects when a project is building pressure before a breakout.
 * Ideal pattern:
 * - price is holding steady
 * - volume is rising
 * - liquidity is improving
 * - holders are growing
 * - sell pressure is fading
 */

export function detectMomentumCompression(project = {}) {
  const priceChange24h = Math.abs(Number(project.priceChange24h || 0));
  const volumeChange24h = Number(project.volumeChange24h || 0);
  const liquidityGrowth24h = Number(project.liquidityGrowth24h || 0);
  const holderGrowthRate =
    Number(project.holderGrowth?.holderGrowthRate || project.holderGrowthRate || 0);
  const sellPressureChange = Number(project.sellPressureChange || 0);

  const compressionSignals = [
    priceChange24h <= 15,
    volumeChange24h >= 50,
    liquidityGrowth24h >= 10,
    holderGrowthRate >= 10,
    sellPressureChange <= 0
  ].filter(Boolean).length;

  return {
    compressionSignals,
    isCompressed: compressionSignals >= 4
  };
}

export function scoreMomentumCompression(project = {}) {
  const result = detectMomentumCompression(project);

  let score = result.compressionSignals * 18;

  if (project.velocityScore >= 60) score += 5;
  if (project.accelerationScore >= 60) score += 5;

  return Math.max(0, Math.min(100, score));
}

export function analyzeMomentumCompression(project = {}) {
  const momentumCompression = detectMomentumCompression(project);
  const momentumCompressionScore = scoreMomentumCompression(project);

  return {
    ...project,
    momentumCompression,
    momentumCompressionScore,
    momentumCompressionLevel:
      momentumCompressionScore >= 80 ? "strong compression" :
      momentumCompressionScore >= 60 ? "building pressure" :
      momentumCompressionScore >= 40 ? "early compression" :
      "no compression",

    evidence: [
      ...(project.evidence || []),
      {
        engine: "Momentum Compression Engine",
        signal: "Pre-breakout compression",
        confidence: Math.min(momentumCompressionScore / 100, 1),
        impact: momentumCompression.isCompressed ? "Positive" : "Neutral"
      }
    ],

    alerts: [
      ...(project.alerts || []),
      ...(momentumCompression.isCompressed
        ? ["Momentum compression detected."]
        : [])
    ]
  };
}

export function analyzeMomentumCompressionBatch(projects = []) {
  return projects
    .map(analyzeMomentumCompression)
    .sort((a, b) => b.momentumCompressionScore - a.momentumCompressionScore);
}
