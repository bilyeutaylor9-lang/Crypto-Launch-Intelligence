// src/discoveryManager.js

/**
 * Crypto Launch Intelligence
 * Discovery Manager v5
 *
 * Purpose:
 * Combines live discovery sources into one clean candidate pool.
 */

import { scanLiveMarket } from "./liveMarketScanner.js";
import { getGeckoTerminalCandidates } from "./data/geckoTerminalConnector.js";
import { getCoinGeckoCandidates } from "./data/coinGeckoConnector.js";
import { getBirdeyeCandidates } from "./data/birdeyeConnector.js";
import { getFreeMarketDataCandidates } from "./data/freeMarketDataConnector.js";

function keyForProject(project = {}) {
  const symbol = String(project.symbol || "").toUpperCase();
  const chain = String(project.chain || "").toLowerCase();
  const address = String(project.address || "").toLowerCase();
  const pair = String(project.pairAddress || "").toLowerCase();

  if (address && address !== "null") return `${chain}:${address}`;
  if (pair && pair !== "null") return `${chain}:${pair}`;
  return `${chain}:${symbol}:${String(project.name || "").toLowerCase()}`;
}

function mergeProject(existing = {}, incoming = {}) {
  const sources = [
    ...(existing.discoverySources || []),
    ...(incoming.discoverySources || []),
    incoming.source
  ].filter(Boolean);

  return {
    ...existing,
    ...incoming,
    name: existing.name || incoming.name,
    symbol: existing.symbol || incoming.symbol,
    priceUsd: Number(incoming.priceUsd || 0) || Number(existing.priceUsd || 0),
    liquidityUsd: Math.max(Number(existing.liquidityUsd || 0), Number(incoming.liquidityUsd || 0)),
    volume24h: Math.max(Number(existing.volume24h || 0), Number(incoming.volume24h || 0)),
    marketCap: Math.max(Number(existing.marketCap || 0), Number(incoming.marketCap || 0)),
    tvl: Math.max(Number(existing.tvl || 0), Number(incoming.tvl || 0)),
    discoverySources: [...new Set(sources)],
    discoveredAt: existing.discoveredAt || incoming.discoveredAt || new Date().toISOString()
  };
}

function dedupeAndMerge(projects = []) {
  const seen = new Map();

  for (const project of projects) {
    const key = keyForProject(project);

    if (!seen.has(key)) {
      seen.set(key, project);
    } else {
      seen.set(key, mergeProject(seen.get(key), project));
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

async function safeSource(name, fn) {
  try {
    return await fn();
  } catch (error) {
    console.warn(`${name} skipped: ${error.message}`);
    return [];
  }
}

export async function runDiscoveryManager(options = {}) {
  const maxTokens = Number(options.maxTokens || process.env.MAX_TOKENS || 200);
  const freeLimit = Number(options.freeLimit || process.env.FREE_SOURCE_LIMIT || 100);

  const dexReport = await scanLiveMarket({ maxTokens });

  const dexProjects = dexReport.results.map(project =>
    enrichDiscoverySource(project, "dexscreener")
  );

  const geckoProjects = (await safeSource("GeckoTerminal", () => getGeckoTerminalCandidates()))
    .map(project => enrichDiscoverySource(project, "geckoterminal"));

  const coinGeckoProjects = (await safeSource("CoinGecko", () =>
    getCoinGeckoCandidates({
      perPage: Number(options.coinGeckoPerPage || process.env.COINGECKO_PER_PAGE || 250)
    })
  )).map(project => enrichDiscoverySource(project, "coingecko"));

  const birdeyeProjects = (await safeSource("Birdeye", () =>
    getBirdeyeCandidates({
      limit: Number(options.birdeyeLimit || process.env.BIRDEYE_LIMIT || 100)
    })
  )).map(project => enrichDiscoverySource(project, "birdeye"));

  const freeMarketProjects = (await safeSource("FreeMarketData", () =>
    getFreeMarketDataCandidates({ limit: freeLimit })
  )).map(project => enrichDiscoverySource(project, project.source || "free-market"));

  const candidatePool = dedupeAndMerge([
    ...dexProjects,
    ...geckoProjects,
    ...coinGeckoProjects,
    ...birdeyeProjects,
    ...freeMarketProjects
  ]);

  return {
    scannedAt: new Date().toISOString(),
    sourcesUsed: [
      "dexscreener",
      "geckoterminal",
      "coingecko",
      "birdeye",
      "coinpaprika",
      "defillama",
      "binance",
      "kucoin",
      "coinbase",
      "kraken"
    ],
    discoveredCount:
      Number(dexReport.discoveredTokens || dexReport.scannedTokens || 0) +
      geckoProjects.length +
      coinGeckoProjects.length +
      birdeyeProjects.length +
      freeMarketProjects.length,
    acceptedCount: candidatePool.length,
    rejectedCount: dexReport.rejectedTokens || 0,
    candidates: candidatePool,
    sourceReports: {
      dexscreener: {
        scannedTokens: dexReport.scannedTokens,
        rejectedTokens: dexReport.rejectedTokens,
        filters: dexReport.filters
      },
      geckoterminal: { scannedTokens: geckoProjects.length },
      coingecko: { scannedTokens: coinGeckoProjects.length },
      birdeye: {
        scannedTokens: birdeyeProjects.length,
        enabled: Boolean(process.env.BIRDEYE_API_KEY)
      },
      freeMarketData: {
        scannedTokens: freeMarketProjects.length,
        sources: ["coinpaprika", "defillama", "binance", "kucoin", "coinbase", "kraken"]
      }
    }
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const discovery = await runDiscoveryManager();
  console.log(JSON.stringify(discovery, null, 2));
}
