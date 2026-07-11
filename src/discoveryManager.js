// src/discoveryManager.js

import { scanLiveMarket } from "./liveMarketScanner.js";
import { getGeckoTerminalCandidates } from "./data/geckoTerminalConnector.js";
import { getCoinGeckoCandidates } from "./data/coinGeckoConnector.js";
import { getBirdeyeCandidates } from "./data/birdeyeConnector.js";
import { getFreeMarketDataCandidates } from "./data/freeMarketDataConnector.js";
import { getExpandedMarketDataCandidates } from "./data/expandedMarketDataConnector.js";
import { getFallbackResearchSeedCandidates } from "./data/fallbackResearchSeedConnector.js";
import { getGoogleNewsDiscoveryCandidates } from "./data/googleNewsDiscoveryConnector.js";
import { getGithubProjectDiscoveryCandidates } from "./data/githubProjectDiscoveryConnector.js";
import { buildCandidateRescueExpansion } from "./data/candidateRescueExpansionEngine.js";
import { runAIDiscoverySwarm } from "./data/aiDiscoverySwarmEngine.js";
import {
  getSourceRoutingPlan,
  saveSourceRoutingOutcome,
  shouldRunSource,
} from "./data/adaptiveSourceRouter.js";

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

async function routedSource(plan = {}, sourceKey = "", name = "", fn) {
  if (!shouldRunSource(plan, sourceKey)) {
    return {
      name,
      status: "SKIPPED",
      durationMs: 0,
      output: [],
      error: "Skipped by Adaptive Source Router",
    };
  }

  return safeSource(name, fn);
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

function discoveryPriority(project = {}) {
  const sources = Array.isArray(project.discoverySources) ? project.discoverySources.length : 0;
  const liquidity = Math.log10(Math.max(1, num(project.liquidityUsd)));
  const volume = Math.log10(Math.max(1, num(project.volume24h)));
  const marketCap = Math.log10(Math.max(1, num(project.marketCap)));
  const text = [
    project.name,
    project.symbol,
    project.description,
    project.category,
    project.source,
    ...(project.discoverySources || []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const narrativeHits = [
    "ai",
    "agent",
    "rwa",
    "depin",
    "stablecoin",
    "prediction",
    "zk",
    "perp",
    "modular",
    "restaking",
    "launch",
    "airdrop",
    "mainnet",
  ].filter((word) => text.includes(word)).length;
  const sourceBoost = sources * 8;
  const seedPenalty = project.researchSeed ? 35 : 0;

  return Math.round(liquidity * 12 + volume * 11 + marketCap * 4 + narrativeHits * 9 + sourceBoost - seedPenalty);
}

function rankAndLimitCandidates(projects = [], options = {}) {
  const wideScan = options.wideScan ?? process.env.WIDE_SCAN === "true";
  const wideLimit = num(options.wideLimit || process.env.WIDE_SCAN_LIMIT || 10000);
  const limit = num(
    options.maxCandidates ||
      process.env.DISCOVERY_SCAN_LIMIT ||
      (wideScan ? wideLimit : 1000)
  );
  const ranked = [...projects]
    .map((project) => ({
      ...project,
      discoveryPriorityScore: discoveryPriority(project),
    }))
    .sort((a, b) => b.discoveryPriorityScore - a.discoveryPriorityScore);

  return {
    ranked,
    limited: limit > 0 ? ranked.slice(0, limit) : ranked,
    limit,
  };
}

export async function runDiscoveryManager(options = {}) {
  const startedAt = Date.now();
  const wideScan = options.wideScan ?? process.env.WIDE_SCAN === "true";
  const wideLimit = num(options.wideLimit || process.env.WIDE_SCAN_LIMIT || 10000);

  const maxTokens = num(options.maxTokens || process.env.MAX_TOKENS || (wideScan ? 750 : 200));
  const freeLimit = num(options.freeLimit || process.env.FREE_SOURCE_LIMIT || (wideScan ? wideLimit : 100));
  const expandedLimit = num(options.expandedLimit || process.env.EXPANDED_SOURCE_LIMIT || (wideScan ? wideLimit : 100));
  const googleNewsLimit = num(
    options.googleNewsLimit ||
      process.env.GOOGLE_NEWS_DISCOVERY_LIMIT ||
      (wideScan ? 500 : 120)
  );
  const githubDiscoveryLimit = num(
    options.githubDiscoveryLimit ||
      process.env.GITHUB_DISCOVERY_LIMIT ||
      (wideScan ? 500 : 120)
  );
  const fallbackSeedsEnabled = options.fallbackSeeds ?? process.env.DISABLE_RESEARCH_SEEDS !== "true";
  const seedSupplementThreshold = num(
    options.seedSupplementThreshold ||
      process.env.RESEARCH_SEED_SUPPLEMENT_THRESHOLD ||
      (wideScan ? 1000 : 150)
  );
  const candidateRescueEnabled =
    options.candidateRescue?.enabled ?? process.env.DISABLE_CANDIDATE_RESCUE !== "true";
  const aiDiscoverySwarmEnabled =
    options.aiDiscoverySwarm?.enabled ?? process.env.DISABLE_AI_DISCOVERY_SWARM !== "true";
  const sourceRouterPlan = options.sourceRouter?.enabled === false
    ? { sources: [], run: [], skipped: [], prioritized: [] }
    : getSourceRoutingPlan();

  const dex = await routedSource(sourceRouterPlan, "dexscreener", "DexScreener", () => scanLiveMarket({ maxTokens }));
  const gecko = await routedSource(sourceRouterPlan, "geckoterminal", "GeckoTerminal", () => getGeckoTerminalCandidates());
  const coinGecko = await routedSource(sourceRouterPlan, "coingecko", "CoinGecko", () =>
    getCoinGeckoCandidates({
      perPage: num(options.coinGeckoPerPage || process.env.COINGECKO_PER_PAGE || 100),
      pages: num(options.coinGeckoPages || process.env.COINGECKO_PAGES || (wideScan ? 2 : 1)),
      categoryLimit: num(
        options.coinGeckoCategoryLimit ||
          process.env.COINGECKO_CATEGORY_LIMIT ||
          (wideScan ? 8 : 4)
      ),
    })
  );
  const birdeye = await routedSource(sourceRouterPlan, "birdeye", "Birdeye", () =>
    getBirdeyeCandidates({
      limit: num(options.birdeyeLimit || process.env.BIRDEYE_LIMIT || 100),
    })
  );
  const freeMarket = await routedSource(sourceRouterPlan, "freeMarketData", "FreeMarketData", () =>
    getFreeMarketDataCandidates({ limit: freeLimit })
  );
  const expandedMarket = await routedSource(sourceRouterPlan, "expandedMarketData", "ExpandedMarketData", () =>
    getExpandedMarketDataCandidates({ limit: expandedLimit })
  );
  const googleNews = await routedSource(sourceRouterPlan, "googleNewsDiscovery", "GoogleNewsDiscovery", () =>
    getGoogleNewsDiscoveryCandidates({ limit: googleNewsLimit })
  );
  const githubDiscovery = await routedSource(sourceRouterPlan, "githubProjectDiscovery", "GitHubProjectDiscovery", () =>
    getGithubProjectDiscoveryCandidates({ limit: githubDiscoveryLimit })
  );

  const dexResults = normalizeResults(dex.output, []);
  const geckoResults = normalizeResults(gecko.output, []);
  const coinGeckoResults = normalizeResults(coinGecko.output, []);
  const birdeyeResults = normalizeResults(birdeye.output, []);
  const freeMarketResults = normalizeResults(freeMarket.output, []);
  const expandedMarketResults = normalizeResults(expandedMarket.output, []);
  const googleNewsResults = normalizeResults(googleNews.output, []);
  const githubDiscoveryResults = normalizeResults(githubDiscovery.output, []);

  const rawPool = [
    ...dexResults.map((p) => enrichDiscoverySource(p, "dexscreener")),
    ...geckoResults.map((p) => enrichDiscoverySource(p, "geckoterminal")),
    ...coinGeckoResults.map((p) => enrichDiscoverySource(p, "coingecko")),
    ...birdeyeResults.map((p) => enrichDiscoverySource(p, "birdeye")),
    ...freeMarketResults.map((p) => enrichDiscoverySource(p, p.source || "free-market")),
    ...expandedMarketResults.map((p) => enrichDiscoverySource(p, p.source || "expanded-market")),
    ...googleNewsResults.map((p) => enrichDiscoverySource(p, "google-news")),
    ...githubDiscoveryResults.map((p) => enrichDiscoverySource(p, "github-project-discovery")),
  ];

  const liveDedupedPool = dedupeAndMerge(rawPool);
  const fallbackSeedResults =
    fallbackSeedsEnabled &&
    shouldRunSource(sourceRouterPlan, "researchSeeds") &&
    liveDedupedPool.length < seedSupplementThreshold
      ? getFallbackResearchSeedCandidates({ limit: options.seedLimit })
      : [];
  const seedSupplementedPool = dedupeAndMerge([
    ...liveDedupedPool,
    ...fallbackSeedResults.map((p) => enrichDiscoverySource(p, "research-seed")),
  ]);
  const aiDiscoverySwarm = aiDiscoverySwarmEnabled
    && shouldRunSource(sourceRouterPlan, "aiDiscoverySwarm")
    ? runAIDiscoverySwarm(seedSupplementedPool, options.aiDiscoverySwarm || {})
    : {
        candidates: [],
        report: {
          status: "DISABLED",
          agents: [],
          addedCount: 0,
        },
      };
  const agentExpandedPool = dedupeAndMerge([
    ...seedSupplementedPool,
    ...(aiDiscoverySwarm.candidates || []).map((p) => enrichDiscoverySource(p, "ai-discovery-swarm")),
  ]);
  const rescueExpansion = candidateRescueEnabled
    && shouldRunSource(sourceRouterPlan, "candidateRescue")
    ? buildCandidateRescueExpansion(
        agentExpandedPool,
        {
          sourceReports: {
            dexscreener: dex,
            geckoterminal: gecko,
            coingecko: coinGecko,
            birdeye,
            freeMarketData: freeMarket,
            expandedMarketData: expandedMarket,
            googleNewsDiscovery: googleNews,
            githubProjectDiscovery: githubDiscovery,
          },
        },
        options.candidateRescue || {}
      )
    : {
        candidates: [],
        report: {
          status: "DISABLED",
          reasons: ["candidate rescue disabled"],
          originalCount: agentExpandedPool.length,
          expandedCount: agentExpandedPool.length,
          addedCount: 0,
          failedSources: [],
          clusters: [],
        },
      };
  const dedupedPool = dedupeAndMerge([
    ...agentExpandedPool,
    ...(rescueExpansion.candidates || []).map((p) => enrichDiscoverySource(p, "candidate-rescue")),
  ]);
  const qualityGate = applyQualityGate(dedupedPool, options);
  const candidateRanking = rankAndLimitCandidates(qualityGate.accepted, options);
  const candidatePool = candidateRanking.limited;

  const dexScannedTokens = getReportNumber(dex.output, [
    "discoveredTokens",
    "scannedTokens",
    "acceptedTokens",
  ]);

  const dexRejectedTokens = num(dex.output?.rejectedTokens);

  const discovery = {
    scannedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    mode: wideScan ? "wide" : "standard",

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
      "coincap",
      "coinlore",
      "cryptocompare",
      "defillama-yields",
      "defillama-stablecoins",
      "dexscreener-search",
      "dexscreener-profiles",
      "dexscreener-boosts",
      "google-news",
      "github-project-discovery",
      "research-seed-supplement",
      "ai-discovery-swarm",
      "candidate-rescue",
    ],

    discoveredCount:
      dexScannedTokens +
      geckoResults.length +
      coinGeckoResults.length +
      birdeyeResults.length +
      freeMarketResults.length +
      expandedMarketResults.length +
      googleNewsResults.length +
      githubDiscoveryResults.length +
      fallbackSeedResults.length +
      (aiDiscoverySwarm.candidates?.length || 0) +
      (rescueExpansion.candidates?.length || 0),

    rawCount: rawPool.length,
    liveDedupedCount: liveDedupedPool.length,
    seedSupplementCount: fallbackSeedResults.length,
    seedSupplementThreshold,
    aiDiscoverySwarmCount: aiDiscoverySwarm.candidates?.length || 0,
    candidateRescueCount: rescueExpansion.candidates?.length || 0,
    dedupedCount: dedupedPool.length,
    acceptedCount: candidatePool.length,
    acceptedBeforeLimitCount: qualityGate.accepted.length,
    scanLimit: candidateRanking.limit,
    wideLimit,
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
      acceptedAfterLimitCount: candidatePool.length,
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

      expandedMarketData: {
        status: expandedMarket.status,
        durationMs: expandedMarket.durationMs,
        scannedTokens: expandedMarketResults.length,
        enabled: true,
        error: expandedMarket.error,
        sources: [
          "coincap",
          "coinlore",
          "cryptocompare",
          "defillama-yields",
          "defillama-stablecoins",
          "dexscreener-search",
          "dexscreener-profiles",
          "dexscreener-boosts",
          "okx",
          "bybit",
          "gate",
          "mexc",
          "bitget",
          "htx",
          "bitfinex",
          "bitstamp",
          "gemini",
        ],
      },

      googleNewsDiscovery: {
        status: googleNews.status,
        durationMs: googleNews.durationMs,
        scannedTokens: googleNewsResults.length,
        enabled: true,
        error: googleNews.error,
      },

      githubProjectDiscovery: {
        status: githubDiscovery.status,
        durationMs: githubDiscovery.durationMs,
        scannedTokens: githubDiscoveryResults.length,
        enabled: process.env.DISABLE_GITHUB_DISCOVERY !== "true",
        error: githubDiscovery.error,
        report: githubDiscovery.output?.report,
      },

      researchSeeds: {
        status: fallbackSeedResults.length ? "USED" : "SKIPPED",
        scannedTokens: fallbackSeedResults.length,
        enabled: Boolean(fallbackSeedsEnabled),
        reason: fallbackSeedResults.length
          ? `Live discovery returned fewer than ${seedSupplementThreshold} deduped candidates, so research seeds were added.`
          : "Live source candidate count was above the supplement threshold or seeds were disabled.",
      },

      aiDiscoverySwarm: {
        status: aiDiscoverySwarm.report?.status || "UNKNOWN",
        scannedTokens: aiDiscoverySwarm.candidates?.length || 0,
        enabled: Boolean(aiDiscoverySwarmEnabled),
        report: aiDiscoverySwarm.report,
      },

      candidateRescue: {
        status: rescueExpansion.report?.status || "UNKNOWN",
        scannedTokens: rescueExpansion.candidates?.length || 0,
        enabled: Boolean(candidateRescueEnabled),
        report: rescueExpansion.report,
      },
    },
    aiDiscoverySwarm: aiDiscoverySwarm.report,
    candidateRescue: rescueExpansion.report,
    sourceRouter: sourceRouterPlan,
  };

  if (options.saveSourceRouter !== false && sourceRouterPlan.sources?.length) {
    discovery.sourceRouterReport = saveSourceRoutingOutcome(discovery);
  }

  return discovery;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const discovery = await runDiscoveryManager();
  console.log(JSON.stringify(discovery, null, 2));
}
