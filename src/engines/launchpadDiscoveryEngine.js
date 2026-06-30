// src/engines/launchpadDiscoveryEngine.js

/**
 * Launchpad Discovery Engine
 *
 * Purpose:
 * Detects projects launching through launchpads,
 * IDOs, token sale platforms, or ecosystem incubators.
 */

const TRUSTED_LAUNCHPAD_KEYWORDS = [
  "launchpad",
  "ido",
  "token sale",
  "public sale",
  "seedify",
  "dao maker",
  "coinlist",
  "fjord",
  "echo",
  "legion",
  "binance launchpool",
  "kucoin spotlight"
];

export function detectLaunchpad(project = {}) {
  const text = [
    project.source,
    project.launchpad,
    project.description,
    project.saleUrl,
    project.website
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return TRUSTED_LAUNCHPAD_KEYWORDS.find(keyword =>
    text.includes(keyword)
  ) || null;
}

export function scoreLaunchpadSignal(project = {}) {
  const launchpad = detectLaunchpad(project);

  let score = 0;

  if (launchpad) score += 50;
  if (project.saleUrl) score += 15;
  if (project.tgeDate) score += 15;
  if (project.vesting || project.tokenomics) score += 10;
  if (project.website) score += 10;

  return Math.max(0, Math.min(100, score));
}

export function discoverLaunchpadProjects(projects = []) {
  return projects
    .map(project => ({
      ...project,
      stage: project.stage || "launchpad",
      launchpadDetected: detectLaunchpad(project),
      launchpadScore: scoreLaunchpadSignal(project),
      discoveryReason: "Launchpad or token sale signal detected."
    }))
    .filter(project => project.launchpadScore >= 40)
    .sort((a, b) => b.launchpadScore - a.launchpadScore);
}
