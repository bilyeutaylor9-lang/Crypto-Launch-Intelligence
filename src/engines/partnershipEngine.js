// src/engines/partnershipEngine.js

/**
 * Partnership Engine
 *
 * Purpose:
 * Detects partnership, collaboration, and integration signals
 * that may improve project credibility, adoption, or momentum.
 */

const PARTNERSHIP_KEYWORDS = [
  "partnership",
  "partnered",
  "collaboration",
  "collaborating",
  "integration",
  "integrated with",
  "ecosystem partner",
  "strategic partner",
  "alliance",
  "joint campaign"
];

export function detectPartnershipSignals(project = {}) {
  const text = [
    project.partners,
    project.partnerships,
    project.announcement,
    project.news,
    project.description,
    project.website,
    project.blog
  ]
    .flat()
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return PARTNERSHIP_KEYWORDS.filter(keyword => text.includes(keyword));
}

export function scorePartnerships(project = {}) {
  const signals = detectPartnershipSignals(project);

  let score = 0;

  if (signals.length) score += 25;
  if (project.partners?.length) score += Math.min(project.partners.length * 10, 30);
  if (project.partnerships?.length) score += Math.min(project.partnerships.length * 10, 30);
  if (project.ecosystemPartner) score += 15;
  if (project.enterprisePartner) score += 15;
  if (project.exchangePartner) score += 10;

  return Math.max(0, Math.min(100, score));
}

export function analyzePartnerships(project = {}) {
  const partnershipSignals = detectPartnershipSignals(project);
  const partnershipScore = scorePartnerships(project);

  return {
    ...project,
    partnershipSignals,
    partnershipScore,
    partnershipLevel:
      partnershipScore >= 80 ? "major" :
      partnershipScore >= 60 ? "strong" :
      partnershipScore >= 40 ? "developing" :
      "limited",
    partnershipReason:
      partnershipScore >= 60
        ? "Project shows meaningful partnership or integration signals."
        : "Partnership signals are limited or still early."
  };
}

export function analyzePartnershipsBatch(projects = []) {
  return projects
    .map(analyzePartnerships)
    .sort((a, b) => b.partnershipScore - a.partnershipScore);
}
