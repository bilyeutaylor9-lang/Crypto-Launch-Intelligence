// src/engines/discoveryPackEngine.js

/**
 * Crypto Launch Intelligence
 * Discovery Pack Engine
 *
 * Purpose:
 * Coordinates all discovery engines that find newly launched,
 * upcoming, or early-stage crypto projects.
 */

export function normalizeProject(project = {}) {
  return {
    id: project.id || project.address || project.symbol || "unknown",
    name: project.name || "Unknown Project",
    symbol: project.symbol || "UNKNOWN",
    chain: project.chain || "unknown",
    stage: project.stage || "unknown",
    source: project.source || "manual",
    address: project.address || null,
    website: project.website || null,
    twitter: project.twitter || null,
    discoveredAt: project.discoveredAt || new Date().toISOString()
  };
}

export function dedupeProjects(projects = []) {
  const seen = new Map();

  for (const project of projects) {
    const normalized = normalizeProject(project);
    const key = `${normalized.chain}:${normalized.address || normalized.symbol}`;

    if (!seen.has(key)) {
      seen.set(key, normalized);
    }
  }

  return [...seen.values()];
}

export function classifyLaunchStage(project = {}) {
  if (project.stage) return project.stage;
  if (project.address && project.pairCreatedAt) return "just-launched";
  if (project.tgeDate) return "upcoming-tge";
  if (project.presaleUrl) return "presale";
  if (project.testnetLive) return "testnet";
  return "early-watch";
}

export function runDiscoveryPack(inputs = {}) {
  const projects = inputs.projects || [];

  return dedupeProjects(
    projects.map(project => ({
      ...normalizeProject(project),
      stage: classifyLaunchStage(project)
    }))
  );
}
