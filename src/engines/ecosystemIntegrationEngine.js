// src/engines/ecosystemIntegrationEngine.js

/**
 * Ecosystem Integration Engine
 *
 * Purpose:
 * Scores how deeply a project is integrated into a broader
 * blockchain ecosystem through protocols, grants, tooling,
 * partnerships, bridges, SDKs, and infrastructure.
 */

const INTEGRATION_KEYWORDS = [
  "integration",
  "integrated",
  "ecosystem",
  "grant",
  "sdk",
  "api",
  "bridge",
  "oracle",
  "validator",
  "wallet",
  "defi",
  "dao",
  "infrastructure"
];

export function detectIntegrationSignals(project = {}) {
  const text = [
    project.integrations,
    project.partners,
    project.description,
    project.announcement,
    project.docs,
    project.website,
    project.blog,
    project.tags
  ]
    .flat()
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return INTEGRATION_KEYWORDS.filter(keyword => text.includes(keyword));
}

export function scoreEcosystemIntegration(project = {}) {
  const signals = detectIntegrationSignals(project);

  let score = 0;

  if (signals.length) score += 20;
  if (project.integrations?.length) score += Math.min(project.integrations.length * 10, 30);
  if (project.ecosystemGrant) score += 15;
  if (project.sdk) score += 10;
  if (project.apiDocs) score += 10;
  if (project.bridgeSupport) score += 10;
  if (project.walletSupport) score += 5;

  return Math.max(0, Math.min(100, score));
}

export function analyzeEcosystemIntegration(project = {}) {
  const integrationSignals = detectIntegrationSignals(project);
  const ecosystemIntegrationScore = scoreEcosystemIntegration(project);

  return {
    ...project,
    integrationSignals,
    ecosystemIntegrationScore,
    ecosystemIntegrationLevel:
      ecosystemIntegrationScore >= 80 ? "deep integration" :
      ecosystemIntegrationScore >= 60 ? "strong integration" :
      ecosystemIntegrationScore >= 40 ? "developing integration" :
      "limited integration",
    ecosystemIntegrationReason:
      ecosystemIntegrationScore >= 60
        ? "Project shows meaningful ecosystem integration."
        : "Ecosystem integration is still limited or early."
  };
}

export function analyzeEcosystemIntegrationBatch(projects = []) {
  return projects
    .map(analyzeEcosystemIntegration)
    .sort((a, b) => b.ecosystemIntegrationScore - a.ecosystemIntegrationScore);
}
