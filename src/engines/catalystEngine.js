// src/engines/catalystEngine.js

/**
 * Catalyst Engine
 *
 * Purpose:
 * Detects upcoming or recent catalysts that may influence
 * project attention, adoption, liquidity, or momentum.
 */

const CATALYST_KEYWORDS = [
  "tge",
  "mainnet",
  "testnet",
  "airdrop",
  "claim",
  "staking",
  "partnership",
  "integration",
  "listing",
  "grant",
  "launch",
  "migration",
  "bridge",
  "sdk",
  "burn",
  "token unlock",
  "governance"
];

export function detectCatalysts(project = {}) {
  const text = [
    project.description,
    project.announcement,
    project.news,
    project.roadmap,
    project.twitterBio,
    project.docs,
    project.tags
  ]
    .flat()
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return CATALYST_KEYWORDS.filter(keyword => text.includes(keyword));
}

export function scoreCatalysts(project = {}) {
  const catalysts = detectCatalysts(project);

  let score = 0;

  score += catalysts.length * 10;

  if (project.tgeDate) score += 15;
  if (project.mainnetDate) score += 15;
  if (project.listingDate) score += 15;
  if (project.partnerships?.length) score += 10;
  if (project.integrations?.length) score += 10;
  if (project.grants?.length) score += 10;
  if (project.airdropDate || project.claimDate) score += 10;

  return Math.max(0, Math.min(100, score));
}

export function analyzeCatalysts(project = {}) {
  const catalysts = detectCatalysts(project);
  const catalystScore = scoreCatalysts(project);

  return {
    ...project,
    catalysts,
    catalystScore,
    catalystLevel:
      catalystScore >= 80 ? "major" :
      catalystScore >= 60 ? "strong" :
      catalystScore >= 40 ? "developing" :
      "limited",
    catalystReason:
      catalysts.length
        ? `Detected catalyst signals: ${catalysts.join(", ")}.`
        : "No major catalyst signal detected yet."
  };
}

export function analyzeCatalystsBatch(projects = []) {
  return projects
    .map(analyzeCatalysts)
    .sort((a, b) => b.catalystScore - a.catalystScore);
}
