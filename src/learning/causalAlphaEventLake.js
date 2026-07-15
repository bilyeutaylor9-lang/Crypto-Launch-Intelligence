import fs from "fs";
import path from "path";

const DATA_DIR = path.resolve("data");
const EVENT_LAKE_FILE = path.join(DATA_DIR, "causal-alpha-event-lake.json");
const MAX_PROJECTS = Number(process.env.MAX_CAUSAL_ALPHA_EVENT_PROJECTS || 15000);
const MAX_EVENTS_PER_PROJECT = Number(process.env.MAX_CAUSAL_ALPHA_EVENTS_PER_PROJECT || 120);
const SCANNER_VERSION = process.env.SCANNER_VERSION || "causal-alpha-network-v1";

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function compactId(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9:_./-]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 180);
}

function emptyLake() {
  return {
    generatedAt: null,
    projects: {},
    indexes: {
      eventTypes: {},
      sources: {},
      sequences: {},
    },
  };
}

function normalizeLake(parsed = {}) {
  return {
    generatedAt: parsed.generatedAt || null,
    projects: parsed.projects && typeof parsed.projects === "object" ? parsed.projects : {},
    indexes: {
      eventTypes:
        parsed.indexes?.eventTypes && typeof parsed.indexes.eventTypes === "object"
          ? parsed.indexes.eventTypes
          : {},
      sources:
        parsed.indexes?.sources && typeof parsed.indexes.sources === "object"
          ? parsed.indexes.sources
          : {},
      sequences:
        parsed.indexes?.sequences && typeof parsed.indexes.sequences === "object"
          ? parsed.indexes.sequences
          : {},
    },
  };
}

function readLake() {
  ensureDataDir();

  if (!fs.existsSync(EVENT_LAKE_FILE)) return emptyLake();

  try {
    return normalizeLake(JSON.parse(fs.readFileSync(EVENT_LAKE_FILE, "utf8")));
  } catch {
    return emptyLake();
  }
}

function writeLake(lake = emptyLake()) {
  ensureDataDir();
  fs.writeFileSync(EVENT_LAKE_FILE, JSON.stringify(normalizeLake(lake), null, 2));
}

export function causalAlphaProjectKey(project = {}) {
  return compactId(
    project.permanentProjectKey ||
      project.address ||
      project.tokenAddress ||
      project.pairAddress ||
      project.proofCarryingAlphaContract?.projectKey ||
      project.githubIntelligencePro?.repository ||
      `${project.chain || "unknown"}:${project.symbol || project.name || "unknown"}`
  );
}

function confidenceFromProject(project = {}) {
  const scores = [
    project.sourceTruthScore,
    project.sourceReliabilityScore,
    project.dataConfidenceScore,
    project.proofScore,
  ].map(num).filter((value) => value > 0);

  if (!scores.length) return 0.45;
  return Number((scores.reduce((sum, value) => sum + value, 0) / scores.length / 100).toFixed(2));
}

function sourceList(project = {}) {
  return [
    project.source,
    ...(project.discoverySources || []),
    ...(project.sourceTruth?.sources || []).map((source) => source.source || source.type),
    project.githubIntelligencePro?.repository ? "github" : "",
    project.roadmapProfitabilityScore ? "roadmap" : "",
    project.liveCatalystRadarScore ? "catalyst-radar" : "",
    project.nativeDiscoveryScore ? "native-discovery" : "",
    project.proofOfAlphaExecutionTwinRoute ? "execution-route" : "",
  ]
    .filter(Boolean)
    .map(compactId)
    .filter(Boolean);
}

function relatedEntities(project = {}) {
  return [
    { nodeType: "PROJECT", nodeId: causalAlphaProjectKey(project) },
    project.symbol ? { nodeType: "TOKEN", nodeId: compactId(project.symbol) } : null,
    project.address || project.tokenAddress
      ? { nodeType: "CONTRACT", nodeId: compactId(project.address || project.tokenAddress) }
      : null,
    project.pairAddress ? { nodeType: "TOKEN_POOL", nodeId: compactId(project.pairAddress) } : null,
    project.chain ? { nodeType: "CHAIN", nodeId: compactId(project.chain) } : null,
    project.githubIntelligencePro?.repository || project.githubRepository || project.repository
      ? {
          nodeType: "REPOSITORY",
          nodeId: compactId(project.githubIntelligencePro?.repository || project.githubRepository || project.repository),
        }
      : null,
  ].filter(Boolean);
}

function baseEvent(project = {}, eventType = "", strength = 0, observedAt = new Date().toISOString(), extra = {}) {
  const projectId = causalAlphaProjectKey(project);
  const eventTimestamp = extra.eventTimestamp || project.eventTimestamp || project.pairCreatedAt || project.createdAt || observedAt;
  const source = extra.source || sourceList(project)[0] || "scanner";
  const eventId = compactId(`${projectId}:${eventType}:${source}:${eventTimestamp}`);

  return {
    eventId,
    projectId,
    eventType,
    eventTimestamp,
    discoveredTimestamp: observedAt,
    blockNumber: project.blockNumber || project.creationBlock || null,
    source,
    sourceConfidence: extra.sourceConfidence ?? confidenceFromProject(project),
    relatedEntities: extra.relatedEntities || relatedEntities(project),
    rawEvidence: extra.rawEvidence || {},
    normalizedEvidence: {
      strength: Math.round(clamp(strength)),
      signalFamily: extra.signalFamily || "general",
      direction: extra.direction || "positive",
      description: extra.description || eventType,
    },
    scannerVersion: SCANNER_VERSION,
  };
}

function pushIf(events = [], condition = false, eventFactory = null) {
  if (condition && typeof eventFactory === "function") events.push(eventFactory());
}

export function buildCausalAlphaEvents(project = {}, observedAt = new Date().toISOString()) {
  const events = [];
  const priceChange = Math.max(
    Math.abs(num(project.priceChange24h)),
    Math.abs(num(project.priceChange7d)),
    Math.abs(num(project.priceChangePercent))
  );
  const sourceConfidence = confidenceFromProject(project);

  pushIf(
    events,
    num(project.githubProScore || project.developerActivityScore || project.githubScore) >= 58,
    () =>
      baseEvent(project, "DEVELOPER_ACCELERATION", project.githubProScore || project.developerActivityScore || project.githubScore, observedAt, {
        source: "github",
        sourceConfidence,
        signalFamily: "builder",
        description: "Developer or repository activity is accelerating.",
        rawEvidence: {
          githubProScore: project.githubProScore,
          developerActivityScore: project.developerActivityScore,
          githubScore: project.githubScore,
        },
      })
  );

  pushIf(
    events,
    Boolean(project.contractVerified || project.address || project.tokenAddress || project.instantSafetyStatus === "PASS"),
    () =>
      baseEvent(project, "CONTRACT_OR_SAFETY_VERIFIED", project.instantSafetyScore || project.proofScore || 55, observedAt, {
        source: "contract-safety",
        sourceConfidence,
        signalFamily: "contract",
        description: "Contract, identity, or instant safety evidence is present.",
        rawEvidence: {
          contractVerified: project.contractVerified,
          instantSafetyStatus: project.instantSafetyStatus,
          address: project.address || project.tokenAddress,
        },
      })
  );

  pushIf(
    events,
    num(project.liquidityUsd ?? project.liquidity) >= 100000 || num(project.liquidityExpansionScore) >= 58,
    () =>
      baseEvent(project, "LIQUIDITY_FORMATION", project.liquidityExpansionScore || project.liquidityScore || 55, observedAt, {
        source: "liquidity",
        sourceConfidence,
        signalFamily: "liquidity",
        description: "Usable liquidity or liquidity expansion has formed.",
        rawEvidence: {
          liquidityUsd: project.liquidityUsd ?? project.liquidity,
          liquidityExpansionScore: project.liquidityExpansionScore,
          activeLiquidityTruthScore: project.activeLiquidityTruthScore,
        },
      })
  );

  pushIf(
    events,
    num(project.smartMoneyAccumulationScore || project.smartWalletScore || project.smartWalletArrivalScore) >= 58,
    () =>
      baseEvent(project, "QUALITY_WALLET_ACCUMULATION", project.smartMoneyAccumulationScore || project.smartWalletScore || project.smartWalletArrivalScore, observedAt, {
        source: "wallet-intelligence",
        sourceConfidence,
        signalFamily: "wallet",
        description: "Quality-wallet or smart-money accumulation is present.",
        rawEvidence: {
          smartMoneyAccumulationScore: project.smartMoneyAccumulationScore,
          smartWalletScore: project.smartWalletScore,
          walletClusterRiskScore: project.walletClusterRiskScore,
        },
      })
  );

  pushIf(
    events,
    num(project.buyerRetentionScore || project.organicBuyerScore || project.communityGrowthScore || project.holderGrowthScore) >= 55,
    () =>
      baseEvent(project, "ADOPTION_RETENTION_GROWTH", project.buyerRetentionScore || project.organicBuyerScore || project.communityGrowthScore || project.holderGrowthScore, observedAt, {
        source: "adoption",
        sourceConfidence,
        signalFamily: "adoption",
        description: "Buyer, holder, user, or community retention is improving.",
        rawEvidence: {
          buyerRetentionScore: project.buyerRetentionScore,
          organicBuyerScore: project.organicBuyerScore,
          communityGrowthScore: project.communityGrowthScore,
          holderGrowthScore: project.holderGrowthScore,
        },
      })
  );

  pushIf(
    events,
    num(project.liveCatalystRadarScore || project.roadmapProfitabilityScore || project.catalystCalendarScore || project.catalystScore) >= 55,
    () =>
      baseEvent(project, "CATALYST_CONFIRMED", project.liveCatalystRadarScore || project.roadmapProfitabilityScore || project.catalystCalendarScore || project.catalystScore, observedAt, {
        source: "catalyst",
        sourceConfidence,
        signalFamily: "catalyst",
        description: "Roadmap, catalyst, launch, or listing event is confirmed enough to track.",
        rawEvidence: {
          liveCatalystRadarScore: project.liveCatalystRadarScore,
          roadmapProfitabilityScore: project.roadmapProfitabilityScore,
          catalystCalendarScore: project.catalystCalendarScore,
          nextCatalyst: project.nextCatalyst,
        },
      })
  );

  pushIf(
    events,
    num(project.narrativeHeatScore || project.narrativeForecastScore || project.xSocialScore) >= 58,
    () =>
      baseEvent(project, "NARRATIVE_OR_ATTENTION_ACCELERATION", project.narrativeHeatScore || project.narrativeForecastScore || project.xSocialScore, observedAt, {
        source: "narrative",
        sourceConfidence,
        signalFamily: "narrative",
        description: "Narrative, social, or market attention is accelerating.",
        rawEvidence: {
          narrativeHeatScore: project.narrativeHeatScore,
          narrativeForecastScore: project.narrativeForecastScore,
          xSocialScore: project.xSocialScore,
        },
      })
  );

  pushIf(
    events,
    priceChange >= 18 || ["ALREADY_PUMPED", "LATE_CHASE"].includes(project.prePump?.status),
    () =>
      baseEvent(project, "PRICE_RECOGNITION", Math.min(100, priceChange), observedAt, {
        source: "market-price",
        sourceConfidence,
        signalFamily: "price",
        description: "Price has started recognizing the thesis or may already be chasing.",
        rawEvidence: {
          priceChange24h: project.priceChange24h,
          priceChange7d: project.priceChange7d,
          prePumpStatus: project.prePump?.status,
        },
      })
  );

  pushIf(
    events,
    num(project.sourceTruthScore || project.proofScore || project.sourceReliabilityScore) >= 62,
    () =>
      baseEvent(project, "INDEPENDENT_SOURCE_CONFIRMATION", project.sourceTruthScore || project.proofScore || project.sourceReliabilityScore, observedAt, {
        source: "source-truth",
        sourceConfidence,
        signalFamily: "source",
        description: "Independent source, proof, or reliability stack supports the thesis.",
        rawEvidence: {
          sourceTruthScore: project.sourceTruthScore,
          proofScore: project.proofScore,
          sourceReliabilityScore: project.sourceReliabilityScore,
        },
      })
  );

  pushIf(
    events,
    num(project.trapRiskScore || project.riskScore || project.walletClusterRiskScore || project.washTradingRiskScore) >= 60,
    () =>
      baseEvent(project, "MANIPULATION_OR_RISK_WARNING", Math.max(num(project.trapRiskScore), num(project.riskScore), num(project.walletClusterRiskScore), num(project.washTradingRiskScore)), observedAt, {
        source: "risk-firewall",
        sourceConfidence,
        signalFamily: "risk",
        direction: "negative",
        description: "Risk, manipulation, wallet-cluster, or wash-trading warning is active.",
        rawEvidence: {
          trapRiskScore: project.trapRiskScore,
          riskScore: project.riskScore,
          walletClusterRiskScore: project.walletClusterRiskScore,
          washTradingRiskScore: project.washTradingRiskScore,
        },
      })
  );

  return events.sort((a, b) => Date.parse(a.eventTimestamp) - Date.parse(b.eventTimestamp));
}

function mergeEvents(existing = [], incoming = []) {
  const byId = new Map();

  for (const event of [...existing, ...incoming]) {
    if (!event?.eventId) continue;
    byId.set(event.eventId, event);
  }

  return [...byId.values()]
    .sort((a, b) => Date.parse(a.discoveredTimestamp || a.eventTimestamp) - Date.parse(b.discoveredTimestamp || b.eventTimestamp))
    .slice(-MAX_EVENTS_PER_PROJECT);
}

function sequenceKey(events = []) {
  return events
    .map((event) => event.eventType)
    .filter(Boolean)
    .slice(-8)
    .join(">");
}

function addIndex(index = {}, id = "", projectKey = "") {
  const key = compactId(id);
  if (!key) return;

  const current = index[key] || { count: 0, projects: [] };
  const projects = [...new Set([...(current.projects || []), projectKey])].slice(-500);
  index[key] = {
    count: projects.length,
    projects,
  };
}

function rebuildIndexes(projects = {}) {
  const indexes = {
    eventTypes: {},
    sources: {},
    sequences: {},
  };

  for (const [projectKey, profile] of Object.entries(projects)) {
    const events = profile.events || [];
    for (const event of events) {
      addIndex(indexes.eventTypes, event.eventType, projectKey);
      addIndex(indexes.sources, event.source, projectKey);
    }

    const key = sequenceKey(events);
    if (key) addIndex(indexes.sequences, key, projectKey);
  }

  return indexes;
}

function trimProjects(projects = {}) {
  return Object.fromEntries(
    Object.entries(projects)
      .sort(([, a], [, b]) => {
        const aTime = Date.parse(a.lastObservedAt || a.firstObservedAt || 0);
        const bTime = Date.parse(b.lastObservedAt || b.firstObservedAt || 0);
        return bTime - aTime;
      })
      .slice(0, MAX_PROJECTS)
  );
}

export function loadCausalAlphaEventLake() {
  return readLake();
}

export function saveCausalAlphaEvents(projects = []) {
  const lake = readLake();
  const observedAt = new Date().toISOString();
  const safeProjects = Array.isArray(projects) ? projects : [];
  let savedEvents = 0;

  for (const project of safeProjects) {
    const projectKey = causalAlphaProjectKey(project);
    const events = buildCausalAlphaEvents(project, observedAt);
    const existing = lake.projects[projectKey] || {
      projectId: projectKey,
      firstObservedAt: observedAt,
      events: [],
      observations: 0,
    };
    const mergedEvents = mergeEvents(existing.events, events);

    lake.projects[projectKey] = {
      ...existing,
      projectId: projectKey,
      name: project.name || existing.name || "Unknown",
      symbol: project.symbol || existing.symbol || "UNKNOWN",
      chain: project.chain || existing.chain || "unknown",
      lastObservedAt: observedAt,
      observations: num(existing.observations) + 1,
      latestScore: num(project.autonomousCausalNetworkScore || project.pipelineScore || project.opportunityScore),
      latestVerdict: project.autonomousCausalNetworkVerdict || existing.latestVerdict || "Unknown",
      latestState: project.autonomousCausalProjectState || existing.latestState || "Unknown",
      latestSequence: sequenceKey(mergedEvents),
      events: mergedEvents,
    };
    savedEvents += events.length;
  }

  lake.generatedAt = observedAt;
  lake.projects = trimProjects(lake.projects);
  lake.indexes = rebuildIndexes(lake.projects);
  writeLake(lake);

  return {
    file: EVENT_LAKE_FILE,
    generatedAt: observedAt,
    savedProjects: safeProjects.length,
    savedEvents,
    trackedProjects: Object.keys(lake.projects).length,
  };
}

function topIndex(index = {}, limit = 12) {
  return Object.entries(index)
    .map(([id, value]) => ({
      id,
      count: num(value.count),
      projects: value.projects || [],
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export function summarizeCausalAlphaEventLake(lake = readLake()) {
  const normalized = normalizeLake(lake);
  const profiles = Object.values(normalized.projects);
  const eventCount = profiles.reduce((sum, profile) => sum + (profile.events || []).length, 0);

  return {
    file: EVENT_LAKE_FILE,
    generatedAt: normalized.generatedAt,
    trackedProjects: profiles.length,
    trackedEvents: eventCount,
    indexedEventTypes: Object.keys(normalized.indexes.eventTypes || {}).length,
    indexedSources: Object.keys(normalized.indexes.sources || {}).length,
    indexedSequences: Object.keys(normalized.indexes.sequences || {}).length,
    topEventTypes: topIndex(normalized.indexes.eventTypes, 12),
    topSources: topIndex(normalized.indexes.sources, 12),
    topSequences: topIndex(normalized.indexes.sequences, 12),
    recentProjects: profiles
      .sort((a, b) => Date.parse(b.lastObservedAt || 0) - Date.parse(a.lastObservedAt || 0))
      .slice(0, 25)
      .map((profile) => ({
        projectId: profile.projectId,
        name: profile.name || "Unknown",
        symbol: profile.symbol || "UNKNOWN",
        chain: profile.chain || "unknown",
        observations: profile.observations || 0,
        events: (profile.events || []).length,
        latestScore: profile.latestScore || 0,
        latestState: profile.latestState || "Unknown",
        latestSequence: profile.latestSequence || "",
      })),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(JSON.stringify(summarizeCausalAlphaEventLake(), null, 2));
}
