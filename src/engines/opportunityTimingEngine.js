// src/engines/opportunityTimingEngine.js

/**
 * Opportunity Timing Engine
 *
 * Purpose:
 * Evaluates whether a project is entering a favorable
 * timing window based on momentum, catalysts, liquidity,
 * smart-wallet rotation, and risk stability.
 */

export function scoreOpportunityTiming(project = {}) {
  let score = 0;

  if (project.momentumCompressionScore >= 60) score += 20;
  if (project.accelerationScore >= 60) score += 15;
  if (project.trendChangeScore >= 60) score += 15;
  if (project.capitalFlowScore >= 60) score += 15;
  if (project.smartMoneyRotationScore >= 60) score += 15;
  if (project.catalystScore >= 60) score += 10;
  if (project.sellPressureScore <= 40) score += 10;
  if (project.riskScore && project.riskScore >= 75) score -= 20;

  return Math.max(0, Math.min(100, score));
}

export function classifyOpportunityTiming(score = 0) {
  if (score >= 85) return "prime timing window";
  if (score >= 65) return "favorable timing";
  if (score >= 45) return "early timing";
  return "not ready";
}

export function analyzeOpportunityTiming(project = {}) {
  const opportunityTimingScore = scoreOpportunityTiming(project);

  return {
    ...project,
    opportunityTimingScore,
    opportunityTimingLevel: classifyOpportunityTiming(opportunityTimingScore),

    evidence: [
      ...(project.evidence || []),
      {
        engine: "Opportunity Timing Engine",
        signal: "Favorable timing window",
        confidence: Math.min(opportunityTimingScore / 100, 1),
        impact: opportunityTimingScore >= 60 ? "Positive" : "Neutral"
      }
    ],

    alerts: [
      ...(project.alerts || []),
      ...(opportunityTimingScore >= 80
        ? ["Prime opportunity timing window detected."]
        : [])
    ]
  };
}

export function analyzeOpportunityTimingBatch(projects = []) {
  return projects
    .map(analyzeOpportunityTiming)
    .sort((a, b) => b.opportunityTimingScore - a.opportunityTimingScore);
}
