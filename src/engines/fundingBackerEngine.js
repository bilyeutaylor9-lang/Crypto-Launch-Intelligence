// src/engines/fundingBackerEngine.js

/**
 * Funding Backer Engine
 *
 * Purpose:
 * Evaluates investor, grant, incubator, and ecosystem backing
 * signals behind an early-stage crypto project.
 */

const STRONG_BACKER_KEYWORDS = [
  "coinbase ventures",
  "binance labs",
  "a16z",
  "paradigm",
  "multicoin",
  "dragonfly",
  "electric capital",
  "polychain",
  "framework",
  "delphi",
  "jump",
  "hashed",
  "animoca",
  "pantera",
  "lightspeed"
];

export function detectStrongBackers(project = {}) {
  const text = [
    project.backers,
    project.investors,
    project.fundingAnnouncement,
    project.description,
    project.news,
    project.website
  ]
    .flat()
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return STRONG_BACKER_KEYWORDS.filter(backer => text.includes(backer));
}

export function scoreFundingBackers(project = {}) {
  const strongBackers = detectStrongBackers(project);

  let score = 0;

  if (strongBackers.length) score += strongBackers.length * 15;
  if (project.fundingRaisedUsd >= 1000000) score += 15;
  if (project.fundingRaisedUsd >= 5000000) score += 15;
  if (project.grants?.length) score += 10;
  if (project.incubator) score += 10;
  if (project.ecosystemGrant) score += 10;
  if (project.leadInvestor) score += 10;

  return Math.max(0, Math.min(100, score));
}

export function analyzeFundingBackers(project = {}) {
  const strongBackers = detectStrongBackers(project);
  const fundingBackerScore = scoreFundingBackers(project);

  return {
    ...project,
    strongBackers,
    fundingBackerScore,
    fundingBackerLevel:
      fundingBackerScore >= 80 ? "institutional-grade" :
      fundingBackerScore >= 60 ? "strong" :
      fundingBackerScore >= 40 ? "credible" :
      "limited",
    fundingBackerReason:
      strongBackers.length
        ? `Recognized backers detected: ${strongBackers.join(", ")}.`
        : "No major backer signal detected yet."
  };
}

export function analyzeFundingBackersBatch(projects = []) {
  return projects
    .map(analyzeFundingBackers)
    .sort((a, b) => b.fundingBackerScore - a.fundingBackerScore);
}
