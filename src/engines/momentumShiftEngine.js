// src/engines/momentumShiftEngine.js

/**
 * Momentum Shift Engine v2
 *
 * Purpose:
 * Detects early momentum even when some engines are still missing data.
 */

function num(value = 0) {
  return Number(value || 0);
}

export function calculateMomentumShiftScore(project = {}) {
  let score = 0;

  const priceChange24h = num(project.priceChange24h);
  const volume24h = num(project.volume24h);
  const liquidityUsd = num(project.liquidityUsd);
  const buys = num(project.buyTransactions24h);
  const sells = num(project.sellTransactions24h);
  const richTokenScore = num(project.richTokenScore);
  const earlyBreakoutScore = num(project.earlyBreakoutScore);
  const relativeStrengthScore = num(project.relativeStrengthScore);
  const buyPressureScore = num(project.buyPressureScore);

  if (priceChange24h >= 10) score += 10;
  if (priceChange24h >= 25) score += 10;
  if (priceChange24h >= 50) score += 10;
  if (priceChange24h >= 100) score += 10;

  if (volume24h >= 50_000) score += 10;
  if (volume24h >= 250_000) score += 10;
  if (volume24h >= 1_000_000) score += 10;

  if (liquidityUsd >= 25_000) score += 5;
  if (liquidityUsd >= 100_000) score += 5;

  if (buys > sells && buys >= 25) score += 10;
  if (buys >= 100) score += 10;

  if (richTokenScore >= 40) score += 10;
  if (earlyBreakoutScore >= 50) score += 10;
  if (relativeStrengthScore >= 50) score += 10;
  if (buyPressureScore >= 50) score += 10;

  return Math.max(0, Math.min(100, Math.round(score)));
}

export function classifyMomentumShift(score = 0) {
  if (score >= 85) return "major early momentum shift";
  if (score >= 70) return "confirmed momentum shift";
  if (score >= 55) return "developing momentum shift";
  if (score >= 35) return "early watch";
  return "no clear shift";
}

export function analyzeMomentumShift(project = {}) {
  const momentumShiftScore = calculateMomentumShiftScore(project);

  return {
    ...project,
    momentumShiftScore,
    momentumShiftLevel: classifyMomentumShift(momentumShiftScore),

    evidence: [
      ...(project.evidence || []),
      {
        engine: "Momentum Shift Engine v2",
        signal: "Composite early momentum shift",
        confidence: Math.min(momentumShiftScore / 100, 1),
        impact: momentumShiftScore >= 55 ? "Positive" : "Neutral"
      }
    ],

    alerts: [
      ...(project.alerts || []),
      ...(momentumShiftScore >= 70
        ? ["Strong early momentum shift detected."]
        : [])
    ]
  };
}

export function analyzeMomentumShiftBatch(projects = []) {
  return projects
    .map(analyzeMomentumShift)
    .sort((a, b) => b.momentumShiftScore - a.momentumShiftScore);
}
