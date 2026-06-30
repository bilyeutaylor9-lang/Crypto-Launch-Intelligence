// src/discoveryManager.js

/**
 * Crypto Launch Intelligence
 * Discovery Manager v1
 *
 * Purpose:
 * Combines live discovery sources into one clean candidate pool.
 * v1 starts with DexScreener and is designed so CoinGecko,
 * DefiLlama, GitHub, GoPlus, and RugCheck can plug in next.
 */

import { scanLiveMarket } from "./liveMarketScanner.js";

function dedupeByPair(projects = []) {
  const seen = new Map();

  for (const project of projects) {
    const key =
      project.pairAddress ||
      `${project.chain}:${project.address}:${project.symbol}`;

    if (!seen.has(key)) {
      seen.set(key, project);
    }
  }

  return [...seen.values()];
}

function enrichDiscoverySource(project = {}, source = "dexscreener") {
  return {
    ...project,
    discoverySources: [...new Set([...(project.discoverySources || []), source])],
    discoveredAt: project.discoveredAt || new Date().toISOString()
  };
}

export async function runDiscoveryManager(options = {}) {
  const maxTokens = Number(options.maxTokens || process.env.MAX_TOKENS || 50);

  const dexReport = await scanLiveMarket({ maxTokens });

  const dexProjects = dexReport.results.map(project =>
    enrichDiscoverySource(project, "dexscreener")
  );

  const candidatePool = dedupeByPair([
    ...dexProjects
  ]);

  return {
    scannedAt: new Date().toISOString(),
    sourcesUsed: ["dexscreener"],
    discoveredCount: dexReport.discoveredTokens || dexReport.scannedTokens || 0,
    acceptedCount: candidatePool.length,
    rejectedCount: dexReport.rejectedTokens || 0,
    candidates: candidatePool,
    sourceReports: {
      dexscreener: {
        scannedTokens: dexReport.scannedTokens,
        rejectedTokens: dexReport.rejectedTokens,
        filters: dexReport.filters
      }
    }
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const discovery = await runDiscoveryManager();

  console.log(JSON.stringify(discovery, null, 2));
}
