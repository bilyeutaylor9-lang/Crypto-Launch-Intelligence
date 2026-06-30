// src/engines/ecosystemDiscoveryEngine.js

/**
 * Ecosystem Discovery Engine
 *
 * Purpose:
 * Detects which crypto ecosystem a project belongs to
 * and scores whether that ecosystem is gaining market attention.
 */

const HOT_ECOSYSTEMS = [
  "base",
  "solana",
  "bitcoin",
  "ethereum",
  "arbitrum",
  "optimism",
  "polygon",
  "bnb",
  "avalanche",
  "sui",
  "aptos",
  "cosmos",
  "near",
  "sei",
  "injective"
];

export function detectEcosystem(project = {}) {
  const text = [
    project.chain,
    project.ecosystem,
    project.description,
    project.website,
    project.tags
  ]
    .flat()
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return HOT_ECOSYSTEMS.find(ecosystem => text.includes(ecosystem)) || "unknown";
}

export function scoreEcosystemStrength(project = {}) {
  const ecosystem = detectEcosystem(project);

  let score = 0;

  if (ecosystem !== "unknown") score += 40;
  if (["base", "solana", "bitcoin", "ethereum"].includes(ecosystem)) score += 25;
  if (project.ecosystemGrant) score += 15;
  if (project.integrations?.length) score += 10;
  if (project.partners?.length) score += 10;

  return Math.max(0, Math.min(100, score));
}

export function discoverEcosystemProjects(projects = []) {
  return projects
    .map(project => ({
      ...project,
      ecosystem: detectEcosystem(project),
      ecosystemScore: scoreEcosystemStrength(project),
      discoveryReason: "Project mapped to an active crypto ecosystem."
    }))
    .filter(project => project.ecosystemScore >= 35)
    .sort((a, b) => b.ecosystemScore - a.ecosystemScore);
}
