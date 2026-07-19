// src/discoveryManager.js

import "./config/loadEnv.js";
import { scanLiveMarket } from "./liveMarketScanner.js";
import { getGeckoTerminalCandidates } from "./data/geckoTerminalConnector.js";
import { getCoinGeckoCandidates } from "./data/coinGeckoConnector.js";
import { getBirdeyeCandidates } from "./data/birdeyeConnector.js";
import { getFreeMarketDataProviderBatch } from "./data/freeMarketDataConnector.js";
import { getExpandedMarketDataProviderBatch } from "./data/expandedMarketDataConnector.js";
import { getFallbackResearchSeedCandidates } from "./data/fallbackResearchSeedConnector.js";
import { getGoogleNewsDiscoveryCandidates } from "./data/googleNewsDiscoveryConnector.js";
import { getGithubProjectDiscoveryCandidates } from "./data/githubProjectDiscoveryConnector.js";
import { getNativeDiscoveryMeshCandidates } from "./data/native/nativeDiscoveryMesh.js";
import { buildCandidateRescueExpansion } from "./data/candidateRescueExpansionEngine.js";
import { runAIDiscoverySwarm } from "./data/aiDiscoverySwarmEngine.js";
import {
  discoveryLaneForProject,
  evidenceFamiliesForProject,
  independentEvidenceScore,
  buildDiscoveryCoverage,
} from "./discovery/discoveryCoverageEngine.js";
import { planCoverageSelection } from "./discovery/coverageSelectionPlanner.js";
import { identityKeyForProject, attachProjectIdentity } from "./discovery/projectIdentityGraph.js";
import { buildSourceCapabilityAudit } from "./discovery/sourceCapabilityAudit.js";
import { buildDiscoveryFrontier } from "./discovery/discoveryFrontierEngine.js";
import {
  getSourceRoutingPlan,
  saveSourceRoutingOutcome,
  shouldRunSource,
} from "./data/adaptiveSourceRouter.js";
import { getSourceById } from "./config/sourceManifest.js";
import { saveUniverseLedger } from "./learning/universeLedgerStore.js";
import {
  resolveDiscoveryExecutionOptions,
  runConcurrent,
  runWithTimeBudget,
  timeoutMsForDiscoverySource,
} from "./discovery/discoveryExecutionGrid.js";
import { normalizeMetricTruth } from "./data/metricTruthNormalizer.js";

const DEFAULT_WIDE_SCAN_TARGET = 39000;
const FREE_MAX_COIN_GECKO_PAGES = 10;
const FREE_MAX_COIN_GECKO_CATEGORIES = 11;

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
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

export function resolveDiscoveryLimits(options = {}) {
  const freeMax = options.freeMax ?? process.env.FREE_MAX_MODE === "true";
  const freeOnly = freeMax || (options.freeOnly ?? process.env.FREE_ONLY_MODE === "true");
  const wideScan = options.wideScan ?? (freeMax || process.env.WIDE_SCAN === "true");
  const targetCandidates = num(
    options.targetCandidates ||
      process.env.DISCOVERY_TARGET_CANDIDATES ||
      options.wideLimit ||
      process.env.WIDE_SCAN_LIMIT ||
      DEFAULT_WIDE_SCAN_TARGET
  );
  const wideLimit = targetCandidates;
  const scanLimit = num(
    options.maxCandidates ||
      process.env.DISCOVERY_SCAN_LIMIT ||
      (wideScan ? wideLimit : 1000)
  );

  return {
    wideScan,
    freeMax,
    freeOnly,
    targetCandidates,
    wideLimit,
    scanLimit,
    maxTokens: num(options.maxTokens || process.env.MAX_TOKENS || (wideScan ? 750 : 200)),
    freeLimit: num(options.freeLimit || process.env.FREE_SOURCE_LIMIT || (wideScan ? wideLimit : 100)),
    expandedLimit: num(options.expandedLimit || process.env.EXPANDED_SOURCE_LIMIT || (wideScan ? wideLimit : 100)),
    googleNewsLimit: num(
      options.googleNewsLimit ||
        process.env.GOOGLE_NEWS_DISCOVERY_LIMIT ||
        (wideScan ? 1000 : 120)
    ),
    githubDiscoveryLimit: num(
      options.githubDiscoveryLimit ||
        process.env.GITHUB_DISCOVERY_LIMIT ||
        (wideScan ? 1000 : 120)
    ),
    nativeDiscoveryLimit: num(
      options.nativeDiscoveryLimit ||
        process.env.NATIVE_DISCOVERY_LIMIT ||
        (wideScan ? 5000 : 250)
    ),
    seedSupplementThreshold: num(
      options.seedSupplementThreshold ||
        process.env.RESEARCH_SEED_SUPPLEMENT_THRESHOLD ||
        (wideScan ? Math.min(5000, Math.ceil(wideLimit * 0.15)) : 150)
    ),
  };
}

function keyForProject(project = {}) {
  return identityKeyForProject(project);
}

function conservativeNumber(a = 0, b = 0) {
  const left = num(a);
  const right = num(b);
  if (left > 0 && right > 0) return Math.min(left, right);
  return left || right || 0;
}

function valuationDisagreement(values = []) {
  const active = values.map(num).filter((value) => value > 0);
  if (active.length < 2) return 1;
  return Number((Math.max(...active) / Math.min(...active)).toFixed(2));
}

function normalizeProject(project = {}) {
  const circulatingMarketCap = num(
    project.circulatingMarketCap ??
      project.verifiedMarketCap ??
      project.marketData?.marketCap ??
      project.marketCap
  );
  const fullyDilutedValue = num(project.fdv ?? project.fullyDilutedValue ?? project.marketData?.fdv);
  const estimatedMarketCap = num(project.estimatedMarketCap ?? project.rawCandidate?.marketCap);
  const valuationSources = [
    ...(Array.isArray(project.valuationSources) ? project.valuationSources : []),
    ...(circulatingMarketCap > 0 ? [{ source: project.source || "unknown", type: "circulatingMarketCap", value: circulatingMarketCap }] : []),
    ...(fullyDilutedValue > 0 ? [{ source: project.source || "unknown", type: "fdv", value: fullyDilutedValue }] : []),
    ...(estimatedMarketCap > 0 ? [{ source: project.source || "unknown", type: "estimatedMarketCap", value: estimatedMarketCap }] : []),
  ];
  const normalized = normalizeMetricTruth({
    ...project,
    name: project.name || project.baseToken?.name || "Unknown",
    symbol: project.symbol || project.baseToken?.symbol || "UNKNOWN",
    chain: String(project.chain || project.chainId || "unknown").toLowerCase(),
    address: project.address || project.tokenAddress || project.baseToken?.address || null,
    pairAddress: project.pairAddress || project.pair?.address || null,
    priceUsd: num(project.priceUsd ?? project.price),
    liquidityUsd: num(project.liquidityUsd ?? project.liquidity?.usd ?? project.liquidity),
    volume24h: num(project.volume24h ?? project.volume?.h24 ?? project.volume),
    circulatingMarketCap,
    verifiedMarketCap: num(project.verifiedMarketCap),
    estimatedMarketCap,
    marketCap: circulatingMarketCap,
    fdv: fullyDilutedValue,
    fullyDilutedValue,
    circulatingSupply: num(project.circulatingSupply ?? project.marketData?.circulatingSupply),
    totalSupply: num(project.totalSupply ?? project.marketData?.totalSupply),
    maxSupply: num(project.maxSupply ?? project.marketData?.maxSupply),
    supplyConfidence: num(project.supplyConfidence),
    valuationSources,
    valuationDisagreement: valuationDisagreement(valuationSources.map((source) => source.value)),
    priceChange24h: num(project.priceChange24h ?? project.priceChange?.h24),
    discoveredAt: project.discoveredAt || new Date().toISOString(),
  });

  return attachProjectIdentity({
    ...normalized,
    discoveryLane: project.discoveryLane || discoveryLaneForProject(normalized),
    evidenceFamilies: project.evidenceFamilies || evidenceFamiliesForProject(normalized),
    independentEvidenceScore: project.independentEvidenceScore || independentEvidenceScore(normalized),
  });
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

  return attachProjectIdentity({
    ...a,
    ...b,
    name: a.name !== "Unknown" ? a.name : b.name,
    symbol: a.symbol !== "UNKNOWN" ? a.symbol : b.symbol,
    priceUsd: b.priceUsd || a.priceUsd,
    liquidityUsd: Math.max(a.liquidityUsd, b.liquidityUsd),
    volume24h: Math.max(a.volume24h, b.volume24h),
    circulatingMarketCap: conservativeNumber(a.circulatingMarketCap, b.circulatingMarketCap),
    verifiedMarketCap: conservativeNumber(a.verifiedMarketCap, b.verifiedMarketCap),
    estimatedMarketCap: conservativeNumber(a.estimatedMarketCap, b.estimatedMarketCap),
    marketCap: conservativeNumber(a.marketCap, b.marketCap),
    fdv: Math.max(a.fdv, b.fdv),
    fullyDilutedValue: Math.max(a.fullyDilutedValue, b.fullyDilutedValue),
    circulatingSupply: a.circulatingSupply || b.circulatingSupply,
    totalSupply: Math.max(a.totalSupply, b.totalSupply),
    maxSupply: Math.max(a.maxSupply, b.maxSupply),
    supplyConfidence: Math.max(a.supplyConfidence, b.supplyConfidence),
    valuationSources: [...(a.valuationSources || []), ...(b.valuationSources || [])],
    valuationDisagreement: valuationDisagreement([
      ...(a.valuationSources || []),
      ...(b.valuationSources || []),
    ].map((source) => source.value)),
    tvl: Math.max(num(a.tvl), num(b.tvl)),
    discoverySources: [...new Set(sources)],
    evidenceFamilies: [...new Set([...(a.evidenceFamilies || []), ...(b.evidenceFamilies || [])])],
    independentEvidenceScore: independentEvidenceScore({ ...a, ...b, discoverySources: [...new Set(sources)] }),
    discoveryLane: a.discoveryLane || b.discoveryLane || discoveryLaneForProject({ ...a, ...b }),
    discoveredAt: a.discoveredAt || b.discoveredAt || new Date().toISOString(),
  });
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

async function safeSource(name, fn, options = {}) {
  const startedAt = Date.now();
  const sourceKey = options.sourceKey || name;
  const timeoutMs = timeoutMsForDiscoverySource(sourceKey, options);

  try {
    const output = await runWithTimeBudget(fn, { label: name, timeoutMs });
    const candidateCount = normalizeResults(output, []).length;
    return {
      name,
      status: "SUCCESS",
      durationMs: Date.now() - startedAt,
      output: output || [],
      error: null,
      failureType: null,
      attempted: true,
      timeoutMs,
      candidateCount,
      usableEvidence: candidateCount > 0,
    };
  } catch (error) {
    console.warn(`${name} skipped: ${error.message}`);
    return {
      name,
      status: "FAILED",
      durationMs: Date.now() - startedAt,
      output: [],
      error: error.message,
      failureType: error.code === "DISCOVERY_SOURCE_TIMEOUT" ? "TIMEOUT" : "ERROR",
      attempted: true,
      timeoutMs,
      candidateCount: 0,
      usableEvidence: false,
    };
  }
}

async function routedSource(plan = {}, sourceKey = "", name = "", fn, options = {}) {
  const source = getSourceById(sourceKey);
  const freeOnly = options.freeOnly ?? (options.freeMax ?? process.env.FREE_ONLY_MODE === "true");

  if (freeOnly && source.requiresKey) {
    return {
      name,
      status: "SKIPPED",
      durationMs: 0,
      output: [],
      error: "Skipped by free-only mode because this source requires an API key",
      failureType: null,
      attempted: false,
      timeoutMs: timeoutMsForDiscoverySource(sourceKey, options),
      candidateCount: 0,
      usableEvidence: false,
    };
  }

  if (!shouldRunSource(plan, sourceKey)) {
    return {
      name,
      status: "SKIPPED",
      durationMs: 0,
      output: [],
      error: "Skipped by Adaptive Source Router",
      failureType: null,
      attempted: false,
      timeoutMs: timeoutMsForDiscoverySource(sourceKey, options),
      candidateCount: 0,
      usableEvidence: false,
    };
  }

  return safeSource(name, fn, { ...options, sourceKey });
}

export async function runDiscoverySourceGrid(sources = [], plan = {}, options = {}) {
  const execution = resolveDiscoveryExecutionOptions(options);
  const outcomes = await runConcurrent(
    sources,
    (source) =>
      routedSource(
        plan,
        source.key,
        source.name,
        source.run,
        options
      ),
    execution
  );

  return Object.fromEntries(
    sources.map((source, index) => [source.key, outcomes[index]])
  );
}

function getReportNumber(report = {}, keys = []) {
  for (const key of keys) {
    const value = num(report?.[key]);
    if (value > 0) return value;
  }

  return 0;
}

function providerResultsFrom(output = {}) {
  return Array.isArray(output?.providers) ? output.providers : [];
}

function summarizeProviders(providers = []) {
  const safeProviders = Array.isArray(providers) ? providers : [];
  const byStatus = safeProviders.reduce((acc, provider) => {
    const status = provider.status || "unknown";
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});

  return {
    total: safeProviders.length,
    healthy: byStatus.healthy || 0,
    authenticationRequired: byStatus.authentication_required || 0,
    rateLimited: byStatus.rate_limited || 0,
    regionBlocked: byStatus.region_blocked || 0,
    temporarilyUnavailable: byStatus.temporarily_unavailable || 0,
    degraded: byStatus.degraded || 0,
    byStatus,
    providers: safeProviders,
  };
}

function buildSourceExecutionTelemetry(sourceOutcomes = {}, providers = []) {
  const aggregateSources = new Set(["freeMarketData", "expandedMarketData"]);
  const configured = new Set();
  const attempted = new Set();
  const succeeded = new Set();
  const failed = new Set();
  const skipped = new Set();
  const timedOut = new Set();
  const usableEvidence = new Set();

  const record = ({
    source = "unknown",
    status = "UNKNOWN",
    wasAttempted = true,
    candidateCount = 0,
    failureType = null,
    aggregate = false,
  } = {}) => {
    if (!source || source === "unknown") return;
    configured.add(source);
    const normalizedStatus = String(status || "UNKNOWN").toUpperCase();
    const healthy = ["SUCCESS", "USED", "HEALTHY", "OK"].includes(normalizedStatus);

    if (!wasAttempted || normalizedStatus === "SKIPPED" || normalizedStatus === "DISABLED") {
      skipped.add(source);
    } else if (healthy) {
      attempted.add(source);
      succeeded.add(source);
    } else {
      attempted.add(source);
      failed.add(source);
    }

    if (failureType === "TIMEOUT") timedOut.add(source);
    if (!aggregate && healthy && num(candidateCount) > 0) usableEvidence.add(source);
  };

  for (const [source, outcome] of Object.entries(sourceOutcomes)) {
    record({
      source,
      status: outcome?.status,
      wasAttempted: outcome?.attempted !== false,
      candidateCount: outcome?.candidateCount,
      failureType: outcome?.failureType,
      aggregate: aggregateSources.has(source),
    });
  }

  for (const provider of providers) {
    record({
      source: provider.source,
      status: provider.status,
      wasAttempted: provider.attempted !== false,
      candidateCount: provider.candidateCount,
    });
  }

  return {
    sourcesConfigured: [...configured].sort(),
    sourcesAttempted: [...attempted].sort(),
    sourcesSucceeded: [...succeeded].sort(),
    sourcesFailed: [...failed].sort(),
    sourcesSkipped: [...skipped].sort(),
    sourcesTimedOut: [...timedOut].sort(),
    sourcesWithUsableEvidence: [...usableEvidence].sort(),
  };
}

function passesQualityGate(project = {}, options = {}) {
  const minLiquidity = num(options.minLiquidity ?? process.env.MIN_LIQUIDITY ?? 0);
  const minVolume = num(options.minVolume ?? process.env.MIN_VOLUME_24H ?? 0);
  const maxMarketCap = num(options.maxMarketCap ?? process.env.MAX_MARKET_CAP ?? 0);
  const lane = project.discoveryLane || discoveryLaneForProject(project);

  if (lane === "prelaunch") return true;
  if (lane === "new-pool") {
    if (minLiquidity > 0 && num(project.liquidityUsd) < Math.min(minLiquidity, 10_000)) return false;
    if (maxMarketCap > 0 && num(project.circulatingMarketCap ?? project.marketCap) > maxMarketCap) return false;
    return true;
  }

  if (minLiquidity > 0 && num(project.liquidityUsd) < minLiquidity) return false;
  if (minVolume > 0 && num(project.volume24h) < minVolume) return false;
  if (maxMarketCap > 0 && num(project.circulatingMarketCap ?? project.marketCap) > maxMarketCap) return false;

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
  const lane = project.discoveryLane || discoveryLaneForProject(project);
  const ageMs = project.pairCreatedAt || project.createdAt || project.launchDate
    ? Date.now() - new Date(project.pairCreatedAt || project.createdAt || project.launchDate).getTime()
    : null;
  const ageHours = Number.isFinite(ageMs) ? Math.max(0, ageMs / 36e5) : null;
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
  const noveltyScore =
    lane === "prelaunch" ? 78 :
    ageHours !== null && ageHours <= 6 ? 95 :
    ageHours !== null && ageHours <= 24 ? 86 :
    ageHours !== null && ageHours <= 72 ? 74 :
    44;
  const liquidityFormationVelocity = clamp(
    num(project.liquidityGrowth24h) * 2 +
      Math.log10(Math.max(1, num(project.liquidityUsd))) * 9
  );
  const uniqueBuyerAcceleration = clamp(
    num(project.uniqueBuyers24h || project.buyers24h) * 0.3 +
      num(project.buyerGrowth24h || project.uniqueBuyerGrowth24h) * 1.4
  );
  const independentSourceConfirmation = independentEvidenceScore(project);
  const deployerQuality = clamp(
    num(project.deployerQualityScore || project.githubProScore || project.developerActivityScore)
  );
  const narrativeAcceleration = clamp(narrativeHits * 14 + num(project.narrativeHeatScore) * 0.35);
  const smartWalletArrival = clamp(num(project.smartWalletScore || project.smartMoneyAccumulationScore));
  const developerAcceleration = clamp(num(project.githubVelocityScore || project.developerActivityScore || project.githubProScore));
  const nativeDiscovery = clamp(num(project.nativeDiscoveryScore));
  const launchProximity = clamp(
    lane === "prelaunch"
      ? narrativeHits * 12 + (text.includes("tge") || text.includes("mainnet") ? 30 : 0)
      : 55
  );
  const manipulationRisk = clamp(
    num(project.trapRiskScore) ||
      num(project.riskScore) ||
      num(project.economicIntegrityRiskScore) ||
      (num(project.valuationDisagreement) >= 5 ? 60 : 0)
  );
  const seedPenalty = project.researchSeed ? 35 : 0;

  return Math.round(
    noveltyScore * 0.2 +
      liquidityFormationVelocity * 0.15 +
      uniqueBuyerAcceleration * 0.15 +
      independentSourceConfirmation * 0.12 +
      deployerQuality * 0.1 +
      narrativeAcceleration * 0.1 +
      smartWalletArrival * 0.08 +
      developerAcceleration * 0.05 +
      nativeDiscovery * 0.12 +
      launchProximity * 0.05 -
      manipulationRisk * 0.2 -
      seedPenalty
  );
}

export function rankAndLimitCandidates(projects = [], options = {}) {
  const limits = resolveDiscoveryLimits(options);
  const limit = limits.scanLimit;
  const ranked = [...projects]
    .map((project) => ({
      ...project,
      discoveryPriorityScore: discoveryPriority(project),
    }))
    .sort((a, b) => b.discoveryPriorityScore - a.discoveryPriorityScore);
  const selection = planCoverageSelection(ranked, {
    limit,
    prefix: "discovery",
    scoreFor: (project) => project.discoveryPriorityScore,
  });

  return {
    ranked,
    limited: selection.selected,
    limit,
    selection: selection.report,
  };
}

export async function runDiscoveryManager(options = {}) {
  const startedAt = Date.now();
  const limits = resolveDiscoveryLimits(options);
  const {
    wideScan,
    freeMax,
    freeOnly,
    targetCandidates,
    wideLimit,
    maxTokens,
    freeLimit,
    expandedLimit,
    googleNewsLimit,
    githubDiscoveryLimit,
    nativeDiscoveryLimit,
    seedSupplementThreshold,
  } = limits;
  const fallbackSeedsEnabled = options.fallbackSeeds ?? process.env.DISABLE_RESEARCH_SEEDS !== "true";
  const candidateRescueEnabled =
    options.candidateRescue?.enabled ?? process.env.DISABLE_CANDIDATE_RESCUE !== "true";
  const aiDiscoverySwarmEnabled =
    options.aiDiscoverySwarm?.enabled ?? process.env.DISABLE_AI_DISCOVERY_SWARM !== "true";
  const sourceRouterPlan = options.sourceRouter?.enabled === false || freeMax
    ? { sources: [], run: [], skipped: [], prioritized: [] }
    : getSourceRoutingPlan();
  const executionOptions = freeMax
    ? {
        ...options,
        freeOnly,
        freeMax,
        sourceTimeouts: {
          dexscreener: 120_000,
          geckoterminal: 60_000,
          coingecko: 120_000,
          googleNewsDiscovery: 60_000,
          githubProjectDiscovery: 60_000,
          freeMarketData: 60_000,
          expandedMarketData: 120_000,
          ...(options.sourceTimeouts || {}),
        },
      }
    : { ...options, freeOnly, freeMax };

  const sourceResults = await runDiscoverySourceGrid(
    [
      {
        key: "dexscreener",
        name: "DexScreener",
        // Discovery only: the full intelligence pipeline runs once after all sources merge.
        run: () => scanLiveMarket({ maxTokens, runIntelligence: false }),
      },
      {
        key: "geckoterminal",
        name: "GeckoTerminal",
        run: () => getGeckoTerminalCandidates(),
      },
      {
        key: "coingecko",
        name: "CoinGecko",
        run: () =>
          getCoinGeckoCandidates({
            perPage: num(options.coinGeckoPerPage || process.env.COINGECKO_PER_PAGE || (freeMax ? 250 : 100)),
            pages: num(
              options.coinGeckoPages ||
                process.env.COINGECKO_PAGES ||
                (freeMax ? FREE_MAX_COIN_GECKO_PAGES : wideScan ? 2 : 1)
            ),
            categoryLimit: num(
              options.coinGeckoCategoryLimit ||
                process.env.COINGECKO_CATEGORY_LIMIT ||
                (freeMax ? FREE_MAX_COIN_GECKO_CATEGORIES : wideScan ? 8 : 4)
            ),
          }),
      },
      {
        key: "birdeye",
        name: "Birdeye",
        run: () =>
          getBirdeyeCandidates({
            limit: num(options.birdeyeLimit || process.env.BIRDEYE_LIMIT || 100),
          }),
      },
      {
        key: "freeMarketData",
        name: "FreeMarketData",
        run: () => getFreeMarketDataProviderBatch({ limit: freeLimit, freeOnly }),
      },
      {
        key: "expandedMarketData",
        name: "ExpandedMarketData",
        run: () => getExpandedMarketDataProviderBatch({ limit: expandedLimit, freeOnly }),
      },
      {
        key: "googleNewsDiscovery",
        name: "GoogleNewsDiscovery",
        run: () =>
          getGoogleNewsDiscoveryCandidates({
            limit: googleNewsLimit,
            queryLimit: options.googleNewsQueryLimit || (freeMax ? 12 : undefined),
          }),
      },
      {
        key: "githubProjectDiscovery",
        name: "GitHubProjectDiscovery",
        run: () => getGithubProjectDiscoveryCandidates({ limit: githubDiscoveryLimit }),
      },
      {
        key: "nativeDiscoveryMesh",
        name: "NativeDiscoveryMesh",
        run: () =>
          getNativeDiscoveryMeshCandidates({
            limit: nativeDiscoveryLimit,
            collectConnectors:
              options.nativeDiscovery?.collectConnectors ??
              process.env.NATIVE_DISCOVERY_COLLECT === "true",
            includeRaw: options.nativeDiscovery?.includeRaw ?? true,
          }),
      },
    ],
    sourceRouterPlan,
    executionOptions
  );
  const {
    dexscreener: dex,
    geckoterminal: gecko,
    coingecko: coinGecko,
    birdeye,
    freeMarketData: freeMarket,
    expandedMarketData: expandedMarket,
    googleNewsDiscovery: googleNews,
    githubProjectDiscovery: githubDiscovery,
    nativeDiscoveryMesh: nativeDiscovery,
  } = sourceResults;

  const dexResults = normalizeResults(dex.output, []);
  const geckoResults = normalizeResults(gecko.output, []);
  const coinGeckoResults = normalizeResults(coinGecko.output, []);
  const birdeyeResults = normalizeResults(birdeye.output, []);
  const freeMarketResults = normalizeResults(freeMarket.output, []);
  const expandedMarketResults = normalizeResults(expandedMarket.output, []);
  const googleNewsResults = normalizeResults(googleNews.output, []);
  const githubDiscoveryResults = normalizeResults(githubDiscovery.output, []);
  const nativeDiscoveryResults = normalizeResults(nativeDiscovery.output, []);
  const freeMarketProviders = providerResultsFrom(freeMarket.output);
  const expandedMarketProviders = providerResultsFrom(expandedMarket.output);
  const providerHealth = summarizeProviders([
    ...freeMarketProviders,
    ...expandedMarketProviders,
  ]);
  const sourceExecution = buildSourceExecutionTelemetry(sourceResults, [
    ...freeMarketProviders,
    ...expandedMarketProviders,
  ]);

  const rawPool = [
    ...dexResults.map((p) => enrichDiscoverySource(p, "dexscreener")),
    ...geckoResults.map((p) => enrichDiscoverySource(p, "geckoterminal")),
    ...coinGeckoResults.map((p) => enrichDiscoverySource(p, "coingecko")),
    ...birdeyeResults.map((p) => enrichDiscoverySource(p, "birdeye")),
    ...freeMarketResults.map((p) => enrichDiscoverySource(p, p.source || "free-market")),
    ...expandedMarketResults.map((p) => enrichDiscoverySource(p, p.source || "expanded-market")),
    ...googleNewsResults.map((p) => enrichDiscoverySource(p, "google-news")),
    ...githubDiscoveryResults.map((p) => enrichDiscoverySource(p, "github-project-discovery")),
    ...nativeDiscoveryResults.map((p) => enrichDiscoverySource(p, "native-discovery-mesh")),
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
            nativeDiscoveryMesh: nativeDiscovery,
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
  const rankedByKey = new Map(candidateRanking.ranked.map((project) => [keyForProject(project), project]));
  const ledgerPool = dedupedPool.map((project) => {
    const rankedProject = rankedByKey.get(keyForProject(project));
    return rankedProject || {
      ...project,
      discoveryPriorityScore: discoveryPriority(project),
    };
  });

  const dexScannedTokens = getReportNumber(dex.output, [
    "discoveredTokens",
    "scannedTokens",
    "acceptedTokens",
  ]);

  const dexRejectedTokens = num(dex.output?.rejectedTokens);

  const discovery = {
    scannedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    mode: freeMax ? "free-max" : wideScan ? "wide" : "standard",
    freeMode: {
      enabled: freeOnly,
      freeMax,
      policy: freeOnly
        ? "Only public, no-key discovery and intelligence sources are permitted."
        : "Paid-key sources may run when configured.",
    },

    // Only sources that returned candidates are reported as used evidence.
    sourcesUsed: sourceExecution.sourcesWithUsableEvidence,
    ...sourceExecution,

    discoveredCount:
      dexScannedTokens +
      geckoResults.length +
      coinGeckoResults.length +
      birdeyeResults.length +
      freeMarketResults.length +
      expandedMarketResults.length +
      googleNewsResults.length +
      githubDiscoveryResults.length +
      nativeDiscoveryResults.length +
      fallbackSeedResults.length +
      (aiDiscoverySwarm.candidates?.length || 0) +
      (rescueExpansion.candidates?.length || 0),

    rawCount: rawPool.length,
    liveDedupedCount: liveDedupedPool.length,
    seedSupplementCount: fallbackSeedResults.length,
    seedSupplementThreshold,
    aiDiscoverySwarmCount: aiDiscoverySwarm.candidates?.length || 0,
    nativeDiscoveryMeshCount: nativeDiscoveryResults.length,
    candidateRescueCount: rescueExpansion.candidates?.length || 0,
    dedupedCount: dedupedPool.length,
    acceptedCount: candidatePool.length,
    acceptedBeforeLimitCount: qualityGate.accepted.length,
    scanLimit: candidateRanking.limit,
    candidateSelection: candidateRanking.selection,
    targetCandidates,
    wideLimit,
    sourceLimits: {
      maxTokens,
      freeLimit,
      expandedLimit,
      googleNewsLimit,
      githubDiscoveryLimit,
      nativeDiscoveryLimit,
    },
    targetCoverage: {
      targetCandidates,
      acceptedBeforeLimitCount: qualityGate.accepted.length,
      acceptedAfterLimitCount: candidatePool.length,
      targetMet: candidatePool.length >= targetCandidates,
      shortfall: Math.max(0, targetCandidates - candidatePool.length),
      selection: candidateRanking.selection,
    },
    rejectedCount: dexRejectedTokens + qualityGate.rejected.length,
    providerHealth,

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
        attempted: dex.attempted,
        timeoutMs: dex.timeoutMs,
        failureType: dex.failureType,
        usableEvidence: dex.usableEvidence,
        scannedTokens: num(dex.output?.scannedTokens || dexResults.length),
        discoveredTokens: num(dex.output?.discoveredTokens || dexResults.length),
        rejectedTokens: dexRejectedTokens,
        filters: dex.output?.filters || {},
        error: dex.error,
      },

      geckoterminal: {
        status: gecko.status,
        durationMs: gecko.durationMs,
        attempted: gecko.attempted,
        timeoutMs: gecko.timeoutMs,
        failureType: gecko.failureType,
        usableEvidence: gecko.usableEvidence,
        scannedTokens: geckoResults.length,
        enabled: true,
        error: gecko.error,
      },

      coingecko: {
        status: coinGecko.status,
        durationMs: coinGecko.durationMs,
        attempted: coinGecko.attempted,
        timeoutMs: coinGecko.timeoutMs,
        failureType: coinGecko.failureType,
        usableEvidence: coinGecko.usableEvidence,
        scannedTokens: coinGeckoResults.length,
        enabled: true,
        error: coinGecko.error,
      },

      birdeye: {
        status: birdeye.status,
        durationMs: birdeye.durationMs,
        attempted: birdeye.attempted,
        timeoutMs: birdeye.timeoutMs,
        failureType: birdeye.failureType,
        usableEvidence: birdeye.usableEvidence,
        scannedTokens: birdeyeResults.length,
        enabled: Boolean(process.env.BIRDEYE_API_KEY),
        error: birdeye.error,
      },

      freeMarketData: {
        status: freeMarket.status,
        durationMs: freeMarket.durationMs,
        attempted: freeMarket.attempted,
        timeoutMs: freeMarket.timeoutMs,
        failureType: freeMarket.failureType,
        usableEvidence: freeMarket.usableEvidence,
        scannedTokens: freeMarketResults.length,
        enabled: true,
        error: freeMarket.error,
        providerHealth: summarizeProviders(freeMarketProviders),
        sources: ["coinpaprika", "defillama", "defillama-chain", "binance", "kucoin", "coinbase", "kraken"],
      },

      expandedMarketData: {
        status: expandedMarket.status,
        durationMs: expandedMarket.durationMs,
        attempted: expandedMarket.attempted,
        timeoutMs: expandedMarket.timeoutMs,
        failureType: expandedMarket.failureType,
        usableEvidence: expandedMarket.usableEvidence,
        scannedTokens: expandedMarketResults.length,
        enabled: true,
        error: expandedMarket.error,
        providerHealth: summarizeProviders(expandedMarketProviders),
        sources: [
          "coincap",
          "coinlore",
          "coinlore-assets",
          "coinlore-movers",
          "cryptocompare",
          "defillama-yields",
          "defillama-stablecoins",
          "dexscreener-search",
          "dexscreener-profiles",
          "dexscreener-boosts",
          "dexscreener-community-takeovers",
          "dexscreener-ads",
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
        attempted: googleNews.attempted,
        timeoutMs: googleNews.timeoutMs,
        failureType: googleNews.failureType,
        usableEvidence: googleNews.usableEvidence,
        scannedTokens: googleNewsResults.length,
        enabled: true,
        error: googleNews.error,
      },

      githubProjectDiscovery: {
        status: githubDiscovery.status,
        durationMs: githubDiscovery.durationMs,
        attempted: githubDiscovery.attempted,
        timeoutMs: githubDiscovery.timeoutMs,
        failureType: githubDiscovery.failureType,
        usableEvidence: githubDiscovery.usableEvidence,
        scannedTokens: githubDiscoveryResults.length,
        enabled: process.env.DISABLE_GITHUB_DISCOVERY !== "true",
        error: githubDiscovery.error,
        report: githubDiscovery.output?.report,
      },

      nativeDiscoveryMesh: {
        status: nativeDiscovery.status,
        durationMs: nativeDiscovery.durationMs,
        attempted: nativeDiscovery.attempted,
        timeoutMs: nativeDiscovery.timeoutMs,
        failureType: nativeDiscovery.failureType,
        usableEvidence: nativeDiscovery.usableEvidence,
        scannedTokens: nativeDiscoveryResults.length,
        enabled: process.env.DISABLE_NATIVE_DISCOVERY_MESH !== "true",
        error: nativeDiscovery.error,
        report: nativeDiscovery.output?.report,
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

  discovery.sourceCapabilityAudit = buildSourceCapabilityAudit(discovery);
  discovery.discoveryCoverage = buildDiscoveryCoverage({
    rawPool,
    dedupedPool,
    accepted: qualityGate.accepted,
    rejected: qualityGate.rejected,
    limited: candidatePool,
    sourceReports: discovery.sourceReports,
  });
  discovery.discoveryFrontier = buildDiscoveryFrontier({
    projects: ledgerPool,
    sourceReports: discovery.sourceReports,
    sourceManifest: discovery.sourceCapabilityAudit.sources,
    nativeCoverage: nativeDiscovery.output?.report?.protocolCoverage,
  });
  discovery.shadowRejectedCandidates = discovery.discoveryCoverage.shadowRejected;
  discovery.sourceManifest = discovery.sourceCapabilityAudit.sources;

  if (options.saveSourceRouter !== false && sourceRouterPlan.sources?.length) {
    discovery.sourceRouterReport = saveSourceRoutingOutcome(discovery);
  }

  if (options.saveUniverseLedger !== false) {
    try {
      discovery.universeLedger = saveUniverseLedger(ledgerPool, {
        selected: candidatePool,
        rejected: qualityGate.rejected,
        ranked: candidateRanking.ranked,
        targetCandidates,
        observedAt: discovery.scannedAt,
      });
    } catch (error) {
      discovery.universeLedger = {
        status: "FAILED",
        error: error.message,
      };
      console.warn(`Universe ledger save failed: ${error.message}`);
    }
  }

  return discovery;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const discovery = await runDiscoveryManager();
  console.log(JSON.stringify(discovery, null, 2));
}
