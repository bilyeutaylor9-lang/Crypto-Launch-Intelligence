// src/discoveryManager.js

/**
 * Crypto Launch Intelligence
 * Discovery Manager v5.1
 *
 * Purpose:
 * Combines live discovery sources into one clean candidate pool.
 *
 * Production Fix:
 * - Protects DexScreener scan output from `.map is not a function`
 * - Normalizes wrapped source outputs: { results }, { candidates }, { projects }, { tokens }, { data }
 * - Keeps the pipeline alive if any discovery source fails
 * - Safely handles missing source reports
 */

import { scanLiveMarket } from "./liveMarketScanner.js";
import { getGeckoTerminalCandidates } from "./data/geckoTerminalConnector.js";
import { getCoinGeckoCandidates } from "./data/coinGeckoConnector.js";
import { getBirdeyeCandidates } from "./data/birdeyeConnector.js";
import { getFreeMarketDataCandidates } from "./data/freeMarketDataConnector.js";

function normalizeResults(output, fallback = []) {
  if (Array.isArray(output)) return output;
  if (Array.isArray(output?.results)) return output.results;
  if (Array.isArray(output?.candidates)) return output.candidates;
  if (Array.isArray(output?.projects)) return output.projects;
  if (Array.isArray(output?.tokens)) return output.tokens;
  if (Array.isArray(output?.data)) return output.data;

  return fallback;
}

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
    liquidityUsd: Math.max(
      Number(existing.liquidityUsd || 0),
      Number(incoming.liquidityUsd || 0)
    ),
    volume24h: Math.max(
      Number(existing.volume24h || 0),
      Number(incoming.volume24h || 0)
    ),
    marketCap: Math.max(
      Number(existing.marketCap || 0),
      Number(incoming.marketCap || 0)
    ),
    tvl: Math.max(
      Number(existing.tvl || 0),
      Number(incoming.tvl || 0)
    ),
    discoverySources: [...new Set(sources)],
    discoveredAt:
      existing.discoveredAt ||
      incoming.discoveredAt ||
      new Date().toISOString()
  };
}

function dedupeAndMerge(projects = []) {
  const safeProjects = normalizeResults(projects, []);
  const seen = new Map();

  for (const project of safeProjects) {
    if (!project || typeof project !== "object") continue;

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
    const output = await fn();
    return output || [];
  } catch (error) {
    console.warn(`${name} skipped: ${error.message}`);
    return [];
  }
}

function getReportNumber(report = {}, keys = []) {
  for (const key of keys) {
    const value = Number(report?.[key] || 0);
    if (value > 0) return value;
  }

  return 0;
}

export async function runDiscoveryManager(options = {}) {
  const maxTokens = Number(options.maxTokens || process.env.MAX_TOKENS || 200);
  const freeLimit = Number(options.freeLimit || process.env.FREE_SOURCE_LIMIT || 100);

  const dexReport = await safeSource("DexScreener", () =>
    scanLiveMarket({ maxTokens })
  );

  const dexResults = normalizeResults(dexReport, []);

  const dexProjects = dexResults.map(project =>
    enrichDiscoverySource(project, "dexscreener")
  );

  const geckoRaw = await safeSource("GeckoTerminal", () =>
    getGeckoTerminalCandidates()
  );

  const geckoProjects = normalizeResults(geckoRaw, []).map(project =>
    enrichDiscoverySource(project, "geckoterminal")
  );

  const coinGeckoRaw = await safeSource("CoinGecko", () =>
    getCoinGeckoCandidates({
      perPage: Number(options.coinGeckoPerPage || process.env.COINGECKO_PER_PAGE || 250)
    })
  );

  const coinGeckoProjects = normalizeResults(coinGeckoRaw, []).map(project =>
    enrichDiscoverySource(project, "coingecko")
  );

  const birdeyeRaw = await safeSource("Birdeye", () =>
    getBirdeyeCandidates({
      limit: Number(options.birdeyeLimit || process.env.BIRDEYE_LIMIT || 100)
    })
  );

  const birdeyeProjects = normalizeResults(birdeyeRaw, []).map(project =>
    enrichDiscoverySource(project, "birdeye")
  );

  const freeMarketRaw = await safeSource("FreeMarketData", () =>
    getFreeMarketDataCandidates({ limit: freeLimit })
  );

  const freeMarketProjects = normalizeResults(freeMarketRaw, []).map(project =>
    enrichDiscoverySource(project, project.source || "free-market")
  );

  const candidatePool = dedupeAndMerge([
    ...dexProjects,
    ...geckoProjects,
    ...coinGeckoProjects,
    ...birdeyeProjects,
    ...freeMarketProjects
  ]);

  const dexScannedTokens = getReportNumber(dexReport, [
    "discoveredTokens",
    "scannedTokens",
    "acceptedTokens"
  ]);

  const dexRejectedTokens = Number(dexReport?.rejectedTokens || 0);

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
      dexScannedTokens +
      geckoProjects.length +
      coinGeckoProjects.length +
      birdeyeProjects.length +
      freeMarketProjects.length,

    acceptedCount: candidatePool.length,
    rejectedCount: dexRejectedTokens,

    candidates: candidatePool,

    sourceReports: {
      dexscreener: {
        scannedTokens: Number(dexReport?.scannedTokens || dexResults.length),
        discoveredTokens: Number(dexReport?.discoveredTokens || dexResults.length),
        rejectedTokens: dexRejectedTokens,
        filters: dexReport?.filters || {}
      },

      geckoterminal: {
        scannedTokens: geckoProjects.length,
        enabled: true
      },

      coingecko: {
        scannedTokens: coinGeckoProjects.length,
        enabled: true
      },

      birdeye: {
        scannedTokens: birdeyeProjects.length,
        enabled: Boolean(process.env.BIRDEYE_API_KEY)
      },

      freeMarketData: {
        scannedTokens: freeMarketProjects.length,
        enabled: true,
        sources: [
          "coinpaprika",
          "defillama",
          "binance",
          "kucoin",
          "coinbase",
          "kraken"
        ]
      }
    }
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const discovery = await runDiscoveryManager();
  console.log(JSON.stringify(discovery, null, 2));
}
