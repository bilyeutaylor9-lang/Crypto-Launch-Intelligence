// src/engines/presaleDiscoveryEngine.js

/**
 * Presale Discovery Engine
 *
 * Purpose:
 * Detects projects in presale, whitelist, private sale,
 * public sale, or early access funding stages.
 */

const PRESALE_KEYWORDS = [
  "presale",
  "pre-sale",
  "private sale",
  "public sale",
  "whitelist",
  "allowlist",
  "early access",
  "seed round",
  "strategic round",
  "token sale"
];

export function detectPresaleSignal(project = {}) {
  const text = [
    project.stage,
    project.description,
    project.website,
    project.saleUrl,
    project.twitterBio,
    project.announcement
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return PRESALE_KEYWORDS.find(keyword => text.includes(keyword)) || null;
}

export function scorePresaleOpportunity(project = {}) {
  let score = 0;

  if (detectPresaleSignal(project)) score += 35;
  if (project.saleUrl) score += 15;
  if (project.website) score += 10;
  if (project.twitter || project.x) score += 10;
  if (project.tokenomics) score += 10;
  if (project.vesting) score += 10;
  if (project.tgeDate || project.launchDate) score += 10;

  return Math.max(0, Math.min(100, score));
}

export function discoverPresales(projects = []) {
  return projects
    .map(project => ({
      ...project,
      stage: project.stage || "presale",
      presaleSignal: detectPresaleSignal(project),
      presaleScore: scorePresaleOpportunity(project),
      discoveryReason: "Presale or early funding signal detected."
    }))
    .filter(project => project.presaleScore >= 35)
    .sort((a, b) => b.presaleScore - a.presaleScore);
}
