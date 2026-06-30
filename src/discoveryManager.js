// src/discoveryManager.js

/**
 * Crypto Launch Intelligence
 * Discovery Manager v4
 *
 * Purpose:
 * Combines live discovery sources into one clean candidate pool.
 */

import { scanLiveMarket } from "./liveMarketScanner.js";
import { getGeckoTerminalCandidates } from "./data/geckoTerminalConnector.js";
import { getCoinGeckoCandidates } from "./data/coinGeckoConnector.js";
import { getBirdeyeCandidates } from "./data/birdeyeConnector.js";

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

function enrichDiscoverySource(project = {}, source = "unknown") {
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

  let geckoProjects = [];

  try {
    geckoProjects = await getGeckoTerminalCandidates();
    geckoProjects = geckoProjects.map(project =>
      enrichDiscoverySource(project, "geckoterminal")
    );
  } catch (error) {
    console.warn(`GeckoTerminal skipped: ${error.message}`);
  }

  let coinGeckoProjects = [];

  try {
    coinGeckoProjects = await getCoinGeckoCandidates({
      perPage: Number(options.coinGeckoPerPage || 50)
    });

    coinGeckoProjects = coinGeckoProjects.map(project =>
      enrichDiscoverySource(project, "coingecko")
    );
  } catch (error) {
    console.warn(`CoinGecko skipped: ${error.message}`);
  }

  let birdeyeProjects = [];

  try {
    birdeyeProjects = await getBirdeyeCandidates({
      limit: Number(options.birdeyeLimit || process.env.BIRDEYE_LIMIT || 50)
    });

    birdeyeProjects = birdeyeProjects.map(project =>
      enrichDiscoverySource(project, "birdeye")
    );
  } catch (error) {
    console.warn(`Birdeye skipped: ${error.message}`);
  }

  const candidatePool = dedupeByPair([
    ...dexProjects,
    ...geckoProjects,
    ...coinGeckoProjects,
    ...birdeyeProjects
  ]);

  return {
    scannedAt: new Date().toISOString(),
    sourcesUsed: ["dexscreener", "geckoterminal", "coingecko", "birdeye"],
    discoveredCount:
      Number(dexReport.discoveredTokens || dexReport.scannedTokens || 0) +
      geckoProjects.length +
      coinGeckoProjects.length +
      birdeyeProjects.length,
    acceptedCount: candidatePool.length,
    rejectedCount: dexReport.rejectedTokens || 0,
    candidates: candidatePool,
    sourceReports: {
      dexscreener: {
        scannedTokens: dexReport.scannedTokens,
        rejectedTokens: dexReport.rejectedTokens,
        filters: dexReport.filters
      },
      geckoterminal: {
        scannedTokens: geckoProjects.length
      },
      coingecko: {
        scannedTokens: coinGeckoProjects.length
      },
      birdeye: {
        scannedTokens: birdeyeProjects.length,
        enabled: Boolean(process.env.BIRDEYE_API_KEY)
      }
    }
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const discovery = await runDiscoveryManager();
  console.log(JSON.stringify(discovery, null, 2));
}
