// src/discoveryManager.js

import { scanLiveMarket } from "./liveMarketScanner.js";
import { getGeckoTerminalCandidates } from "./data/geckoTerminalConnector.js";
import { getCoinGeckoCandidates } from "./data/coinGeckoConnector.js";
import { getBirdeyeCandidates } from "./data/birdeyeConnector.js";
import { getFreeMarketDataCandidates } from "./data/freeMarketDataConnector.js";

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

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
  const address = String(project.address || project.tokenAddress || "").toLowerCase();
  const pair = String(project.pairAddress || "").toLowerCase();

  if (address && address !== "null") return `${chain}:${address}`;
  if (pair && pair !== "null") return `${chain}:${pair}`;

  return `${chain}:${symbol}:${String(project.name || "").toLowerCase()}`;
}

function normalizeProject(project = {}) {
  return {
    ...project,
    name: project.name || project.baseToken?.name || "Unknown",
    symbol: project.symbol || project.baseToken?.symbol || "UNKNOWN",
    chain: String(project.chain || project.chainId || "unknown").toLowerCase(),
    address: project.address || project.tokenAddress || project.baseToken?.address || null,
    pairAddress: project.pairAddress || project.pair?.address || null,
    priceUsd: num(project.priceUsd ?? project.price),
    liquidityUsd: num(project.liquidityUsd ?? project.liquidity?.usd ?? project.liquidity),
    volume24h: num(project.volume24h ?? project.volume?.h24 ?? project.volume),
    marketCap: num(project.marketCap ?? project.fdv),
    fdv: num(project.fdv ?? project.marketCap),
    priceChange24h: num(project.priceChange24h ?? project.priceChange?.h24),
    discoveredAt: project.discoveredAt || new Date().toISOString(),
  };
}

function mergeProject(existing = {}, incoming = {}) {
  const a = normalizeProject(existing);
  const b = normalizeProject(incoming);

  const sources = [
    ...(a.discoverySources || []),
    ...(b.discoverySources || []),
    a.source,
    b.source,
  ].filter(Boolean);

  return {
    ...a,
    ...b,
    name: a.name !== "Unknown" ? a.name : b.name,
    symbol: a.symbol !== "UNKNOWN" ? a.symbol : b.symbol,
    priceUsd: b.priceUsd || a.priceUsd,
    liquidityUsd: Math.max(a.liquidityUsd, b.liquidityUsd),
    volume24h: Math.max(a.volume24h, b.volume24h),
    marketCap: Math.max(a.marketCap, b.marketCap),
    fdv: Math.max(a.fdv, b.fdv),
    tvl: Math.max(num(a.tvl), num(b.tvl)),
    discoverySources: [...new Set(sources)],
    discoveredAt: a.discoveredAt || b.discoveredAt || new Date().toISOString(),
  };
}

function dedupeAndMerge(projects = []) {
  const safeProjects = normalizeResults(projects, []);
  const seen = new Map();

  for (const rawProject of safeProjects) {
    if (!rawProject || typeof rawProject !== "object") continue;

    const project = normalizeProject(rawProject);
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
  const normalized = normalizeProject(project);

  return {
    ...normalized,
    source: normalized.source || source,
    discoverySources: [...new Set([...(normalized.discoverySources || []), source])],
    discoveredAt: normalized.discoveredAt || new Date().toISOString(),
  };
}

async function safeSource(name, fn) {
  const startedAt = Date.now();

  try {
    const output = await fn();
    return {
      name,
      status: "SUCCESS",
      durationMs: Date.now() - startedAt,
      output: output || [],
      error: null,
    };
  } catch (error) {
    console.warn(`${name} skipped: ${error.message}`);
    return {
      name,
      status: "FAILED",
      durationMs: Date.now() - startedAt,
      output: [],
      error: error.message,
    };
  }
}

function getReportNumber(report = {}, keys = []) {
  for (const key of keys) {
    const value = num(report?.[key]);
    if (value > 0) return value;
  }

  return 0;
}

function passesQualityGate(project = {}, options = {}) {
  const minLiquidity = num(options.minLiquidity ?? process.env.MIN_LIQUIDITY ?? 0);
  const minVolume = num(options.minVolume ?? process.env.MIN_VOLUME_24H ?? 0);
  const maxMarketCap = num(options.maxMarketCap ?? process.env.MAX_MARKET_CAP ?? 0);

  if (minLiquidity > 0 && num(project.liquidityUsd) < minLiquidity) return false;
  if (minVolume > 0 && num(project.volume24h) < minVolume) return false;
  if (maxMarketCap > 0 && num(project.marketCap) > maxMarketCap) return false;

  return true;
}

function applyQualityGate(projects = [], options = {}) {
  const accepted = [];
  const rejected = [];

  for (const project of projects) {
    if (passesQualityGate(project, options)) accepted.push(project);
    else rejected.push(project);
  }

  return { accepted, rejected };
}

export async function runDiscoveryManager(options = {}) {
  const startedAt = Date.now();

  const maxTokens = num(options.maxTokens || process.env.MAX_TOKENS || 200);
  const freeLimit = num(options.freeLimit || process.env.FREE_SOURCE_LIMIT || 100);

  const dex = await safeSource("DexScreener", () => scanLiveMarket({ maxTokens }));
  const gecko = await safeSource("GeckoTerminal", () => getGeckoTerminalCandidates());
  const coinGecko = await safeSource("CoinGecko", () =>
    getCoinGeckoCandidates({
      perPage: num(options.coinGeckoPerPage || process.env.COINGECKO_PER_PAGE || 250),
    })
  );
  const birdeye = await safeSource("Birdeye", () =>
    getBirdeyeCandidates({
      limit: num(options.birdeyeLimit || process.env.BIRDEYE_LIMIT || 100),
    })
  );
  const freeMarket = await safeSource("FreeMarketData", () =>
    getFreeMarketDataCandidates({ limit: freeLimit })
  );

  const dexResults = normalizeResults(dex.output, []);
  const geckoResults = normalizeResults(gecko.output, []);
  const coinGeckoResults = normalizeResults(coinGecko.output, []);
  const birdeyeResults = normalizeResults(birdeye.output, []);
  const freeMarketResults = normalizeResults(freeMarket.output, []);

  const rawPool = [
    ...dexResults.map((p) => enrichDiscoverySource(p, "dexscreener")),
    ...geckoResults.map((p) => enrichDiscoverySource(p, "geckoterminal")),
    ...coinGeckoResults.map((p) => enrichDiscoverySource(p, "coingecko")),
    ...birdeyeResults.map((p) => enrichDiscoverySource(p, "birdeye")),
    ...freeMarketResults.map((p) => enrichDiscoverySource(p, p.source || "free-market")),
  ];

  const dedupedPool = dedupeAndMerge(rawPool);
  const qualityGate = applyQualityGate(dedupedPool, options);
  const candidatePool = qualityGate.accepted;

  const dexScannedTokens = getReportNumber(dex.output, [
    "discoveredTokens",
    "scannedTokens",
    "acceptedTokens",
  ]);

  const dexRejectedTokens = num(dex.output?.rejectedTokens);

  return {
    scannedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,

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
      "kraken",
    ],

    discoveredCount:
      dexScannedTokens +
      geckoResults.length +
      coinGeckoResults.length +
      birdeyeResults.length +
      freeMarketResults.length,

    rawCount: rawPool.length,
    dedupedCount: dedupedPool.length,
    acceptedCount: candidatePool.length,
    rejectedCount: dexRejectedTokens + qualityGate.rejected.length,

    qualityGate: {
      enabled:
        Boolean(options.minLiquidity) ||
        Boolean(options.minVolume) ||
        Boolean(options.maxMarketCap) ||
        Boolean(process.env.MIN_LIQUIDITY) ||
        Boolean(process.env.MIN_VOLUME_24H) ||
        Boolean(process.env.MAX_MARKET_CAP),
      acceptedCount: qualityGate.accepted.length,
      rejectedCount: qualityGate.rejected.length,
      rules: {
        minLiquidity: num(options.minLiquidity ?? process.env.MIN_LIQUIDITY ?? 0),
        minVolume: num(options.minVolume ?? process.env.MIN_VOLUME_24H ?? 0),
        maxMarketCap: num(options.maxMarketCap ?? process.env.MAX_MARKET_CAP ?? 0),
      },
    },

    candidates: candidatePool,

    sourceReports: {
      dexscreener: {
        status: dex.status,
        durationMs: dex.durationMs,
        scannedTokens: num(dex.output?.scannedTokens || dexResults.length),
        discoveredTokens: num(dex.output?.discoveredTokens || dexResults.length),
        rejectedTokens: dexRejectedTokens,
        filters: dex.output?.filters || {},
        error: dex.error,
      },

      geckoterminal: {
        status: gecko.status,
        durationMs: gecko.durationMs,
        scannedTokens: geckoResults.length,
        enabled: true,
        error: gecko.error,
      },

      coingecko: {
        status: coinGecko.status,
        durationMs: coinGecko.durationMs,
        scannedTokens: coinGeckoResults.length,
        enabled: true,
        error: coinGecko.error,
      },

      birdeye: {
        status: birdeye.status,
        durationMs: birdeye.durationMs,
        scannedTokens: birdeyeResults.length,
        enabled: Boolean(process.env.BIRDEYE_API_KEY),
        error: birdeye.error,
      },

      freeMarketData: {
        status: freeMarket.status,
        durationMs: freeMarket.durationMs,
        scannedTokens: freeMarketResults.length,
        enabled: true,
        error: freeMarket.error,
        sources: ["coinpaprika", "defillama", "binance", "kucoin", "coinbase", "kraken"],
      },
    },
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const discovery = await runDiscoveryManager();
  console.log(JSON.stringify(discovery, null, 2));
}
