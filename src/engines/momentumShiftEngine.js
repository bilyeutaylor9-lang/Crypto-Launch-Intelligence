// src/engines/momentumShiftEngine.js

/**
 * Momentum Shift Engine
 *
 * Purpose:
 * Combines the Momentum Intelligence Layer into one master signal.
 * Detects whether a project may be entering an early momentum phase.
 */

const MOMENTUM_WEIGHTS = {
  velocityScore: 0.10,
  accelerationScore: 0.12,
  trendChangeScore: 0.10,
  momentumCompressionScore: 0.10,
  capitalFlowScore: 0.12,
  buyPressureScore: 0.10,
  relativeStrengthScore: 0.10,
  smartMoneyRotationScore: 0.10,
  opportunityTimingScore: 0.08,
  earlyBreakoutScore: 0.08,
  liquidityExpansionScore: 0.06,
  volatilityExpansionScore: 0.04
};

export function calculateMomentumShiftScore(project = {}) {
  let score = 0;

  for (const [key, weight] of Object.entries(MOMENTUM_WEIGHTS)) {
    score += Number(project[key] || 0) * weight;
  }

  if (Number(project.sellPressureScore || 0) >= 70) {
    score -= 15;
  }

  if (Number(project.riskScore || 0) >= 75) {
    score -= 20;
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

export function classifyMomentumShift(score = 0) {
  if (score >= 85) return "major early momentum shift";
  if (score >= 70) return "confirmed momentum shift";
  if (score >= 55) return "developing momentum shift";
  if (score >= 40) return "early watch";
  return "no clear shift";
}

export function analyzeMomentumShift(project = {}) {
  const momentumShiftScore = calculateMomentumShiftScore(project);
  const momentumShiftLevel = classifyMomentumShift(momentumShiftScore);

  return {
    ...project,

    momentumShiftScore,
    momentumShiftLevel,

    evidence: [
      ...(project.evidence || []),
      {
        engine: "Momentum Shift Engine",
        signal: "Composite early momentum shift",
        confidence: Math.min(momentumShiftScore / 100, 1),
        impact: momentumShiftScore >= 70 ? "Positive" : "Neutral"
      }
    ],

    alerts: [
      ...(project.alerts || []),
      ...(momentumShiftScore >= 80
        ? ["Major early momentum shift detected."]
        : [])
    ]
  };
}

export function analyzeMomentumShiftBatch(projects = []) {
  return projects
    .map(analyzeMomentumShift)
    .sort((a, b) => b.momentumShiftScore - a.momentumShiftScore);
}
