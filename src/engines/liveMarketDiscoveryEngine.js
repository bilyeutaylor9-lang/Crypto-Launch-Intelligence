// src/engines/liveMarketDiscoveryEngine.js

/**
 * Live Market Discovery Engine
 *
 * Purpose:
 * Pull real market candidates from live connectors
 * and prepare them for the intelligence pipeline.
 */

import { getDexScreenerMarketCandidates } from "../data/dexScreenerConnector.js";

export async function discoverLiveMarketProjects(options = {}) {
  const maxTokens = Number(options.maxTokens || process.env.MAX_TOKENS || 50);

  const dexScreenerProjects = await getDexScreenerMarketCandidates({
    maxTokens
  });

  return dexScreenerProjects.map(project => ({
    ...project,
    source: project.source || "dexscreener",
    discoveredAt: new Date().toISOString(),
    stage: project.pairCreatedAt ? "live-market" : "unknown"
  }));
}

export function filterLiveCandidates(projects = [], options = {}) {
  const minLiquidity = Number(options.minLiquidity || 10000);
  const minVolume24h = Number(options.minVolume24h || 5000);

  return projects.filter(project => {
    return (
      Number(project.liquidityUsd || 0) >= minLiquidity &&
      Number(project.volume24h || 0) >= minVolume24h
    );
  });
}
