// src/engines/opportunityDiscoveryEngine.js

/**
 * Crypto Launch Intelligence
 * Opportunity Discovery Engine
 *
 * Purpose:
 * Find projects showing improving fundamentals,
 * momentum, and adoption before they become widely recognized.
 */

const DEFAULT_WEIGHTS = {
  narrative: 0.15,
  developer: 0.15,
  liquidity: 0.15,
  holders: 0.15,
  community: 0.10,
  momentum: 0.15,
  catalysts: 0.10,
  risk: -0.20
};

export function calculateOpportunityScore(project = {}) {
  const score =
      (project.narrativeScore || 0) * DEFAULT_WEIGHTS.narrative +
      (project.developerScore || 0) * DEFAULT_WEIGHTS.developer +
      (project.liquidityScore || 0) * DEFAULT_WEIGHTS.liquidity +
      (project.holderScore || 0) * DEFAULT_WEIGHTS.holders +
      (project.communityScore || 0) * DEFAULT_WEIGHTS.community +
      (project.momentumScore || 0) * DEFAULT_WEIGHTS.momentum +
      (project.catalystScore || 0) * DEFAULT_WEIGHTS.catalysts +
      (project.riskScore || 0) * DEFAULT_WEIGHTS.risk;

  return Math.max(0, Math.min(100, Math.round(score)));
}

export function classifyOpportunity(score) {
  if (score >= 90) return "Institutional Alpha";
  if (score >= 80) return "Exceptional";
  if (score >= 70) return "Strong";
  if (score >= 60) return "Promising";
  if (score >= 50) return "Watch";
  return "Low Priority";
}

export function rankProjects(projects = []) {
  return [...projects]
    .map(project => ({
      ...project,
      opportunityScore: calculateOpportunityScore(project),
      rating: classifyOpportunity(
        calculateOpportunityScore(project)
      )
    }))
    .sort((a, b) => b.opportunityScore - a.opportunityScore);
}
