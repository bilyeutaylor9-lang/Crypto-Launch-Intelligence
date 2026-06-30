// src/engines/newTokenDiscoveryEngine.js

/**
 * New Token Discovery Engine
 *
 * Purpose:
 * Detect newly launched tokens from incoming pair/token data.
 * This engine does not guarantee performance. It only identifies
 * fresh launch candidates for further analysis.
 */

export function isNewToken(project = {}, maxAgeHours = 72) {
  if (!project.createdAt && !project.pairCreatedAt) return false;

  const createdAt = new Date(project.createdAt || project.pairCreatedAt);
  const now = new Date();

  const ageHours = (now - createdAt) / (1000 * 60 * 60);

  return ageHours >= 0 && ageHours <= maxAgeHours;
}

export function scoreLaunchFreshness(project = {}) {
  if (!project.createdAt && !project.pairCreatedAt) return 0;

  const createdAt = new Date(project.createdAt || project.pairCreatedAt);
  const ageHours = (new Date() - createdAt) / (1000 * 60 * 60);

  if (ageHours <= 6) return 100;
  if (ageHours <= 12) return 90;
  if (ageHours <= 24) return 80;
  if (ageHours <= 48) return 65;
  if (ageHours <= 72) return 50;
  return 20;
}

export function discoverNewTokens(projects = [], options = {}) {
  const maxAgeHours = options.maxAgeHours || 72;

  return projects
    .filter(project => isNewToken(project, maxAgeHours))
    .map(project => ({
      ...project,
      stage: "just-launched",
      launchFreshnessScore: scoreLaunchFreshness(project),
      discoveryReason: "Token/pair appears to be newly launched."
    }))
    .sort((a, b) => b.launchFreshnessScore - a.launchFreshnessScore);
}
