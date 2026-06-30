// src/engines/airdropToTokenEngine.js

/**
 * Airdrop-To-Token Engine
 *
 * Purpose:
 * Detects projects that may move from points, testnet,
 * rewards, or airdrop campaigns into a future token launch.
 */

const AIRDROP_KEYWORDS = [
  "airdrop",
  "points",
  "rewards",
  "claim",
  "snapshot",
  "eligibility",
  "season",
  "incentives",
  "quests",
  "campaign"
];

export function detectAirdropSignal(project = {}) {
  const text = [
    project.description,
    project.website,
    project.docs,
    project.twitterBio,
    project.announcement,
    project.campaign
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return AIRDROP_KEYWORDS.find(keyword => text.includes(keyword)) || null;
}

export function scoreAirdropToToken(project = {}) {
  let score = 0;

  if (detectAirdropSignal(project)) score += 35;
  if (project.pointsProgram) score += 20;
  if (project.snapshotDate) score += 15;
  if (project.claimDate) score += 15;
  if (project.testnetLive) score += 10;
  if (project.tgeDate) score += 5;

  return Math.max(0, Math.min(100, score));
}

export function discoverAirdropToTokenProjects(projects = []) {
  return projects
    .map(project => ({
      ...project,
      stage: project.stage || "airdrop-to-token",
      airdropSignal: detectAirdropSignal(project),
      airdropToTokenScore: scoreAirdropToToken(project),
      discoveryReason:
        "Airdrop, points, rewards, or claim signal detected."
    }))
    .filter(project => project.airdropToTokenScore >= 35)
    .sort((a, b) => b.airdropToTokenScore - a.airdropToTokenScore);
}
