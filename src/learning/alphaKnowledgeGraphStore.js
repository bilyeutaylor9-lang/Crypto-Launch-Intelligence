import fs from "fs";
import path from "path";
import { appendMemorySidecar, shouldUseAppendOnlyMemory } from "./boundedMemoryStore.js";

const DATA_DIR = path.resolve("data");
const MEMORY_FILE = path.join(DATA_DIR, "alpha-knowledge-graph.json");
const MAX_PROJECTS = Number(process.env.MAX_ALPHA_KNOWLEDGE_GRAPH_PROJECTS || 10000);
const MAX_HISTORY = Number(process.env.MAX_ALPHA_KNOWLEDGE_GRAPH_HISTORY || 40);

const NARRATIVE_TERMS = {
  ai: ["ai", "agent", "bittensor", "compute", "model"],
  rwa: ["rwa", "real world", "tokenized", "treasury", "credit"],
  depin: ["depin", "wireless", "sensor", "physical infrastructure"],
  gaming: ["gaming", "gamefi", "game", "metaverse"],
  base: ["base", "coinbase"],
  solana: ["solana", "sol"],
  restaking: ["restaking", "avs", "eigen", "staking"],
  modular: ["modular", "celestia", "data availability", "rollup"],
  defi: ["defi", "dex", "amm", "lending", "yield"],
  privacy: ["privacy", "zk", "zero knowledge", "confidential"],
  stablecoin: ["stablecoin", "payments", "settlement"],
};

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function emptyGraph() {
  return {
    generatedAt: null,
    projects: {},
    indexes: {
      chains: {},
      narratives: {},
      sources: {},
      repositories: {},
    },
  };
}

function normalizeGraph(parsed = {}) {
  return {
    generatedAt: parsed.generatedAt || null,
    projects: parsed.projects && typeof parsed.projects === "object" ? parsed.projects : {},
    indexes: {
      chains: parsed.indexes?.chains && typeof parsed.indexes.chains === "object" ? parsed.indexes.chains : {},
      narratives:
        parsed.indexes?.narratives && typeof parsed.indexes.narratives === "object" ? parsed.indexes.narratives : {},
      sources: parsed.indexes?.sources && typeof parsed.indexes.sources === "object" ? parsed.indexes.sources : {},
      repositories:
        parsed.indexes?.repositories && typeof parsed.indexes.repositories === "object"
          ? parsed.indexes.repositories
          : {},
    },
  };
}

function readGraph() {
  ensureDataDir();

  if (!fs.existsSync(MEMORY_FILE)) return emptyGraph();

  try {
    return normalizeGraph(JSON.parse(fs.readFileSync(MEMORY_FILE, "utf8")));
  } catch {
    return emptyGraph();
  }
}

function writeGraph(graph = emptyGraph()) {
  ensureDataDir();
  fs.writeFileSync(MEMORY_FILE, JSON.stringify(normalizeGraph(graph), null, 2));
}

function compactId(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .slice(0, 160);
}

export function alphaKnowledgeGraphProjectKey(project = {}) {
  return compactId(
    project.address ||
      project.tokenAddress ||
      project.pairAddress ||
      project.proofCarryingAlphaContract?.projectKey ||
      project.selfEvolvingAlphaOS?.identityGraph?.id ||
      project.githubIntelligencePro?.repository ||
      `${project.chain || "unknown"}:${project.symbol || project.name || "unknown"}`
  );
}

function textFor(project = {}) {
  return [
    project.name,
    project.symbol,
    project.chain,
    project.category,
    project.description,
    project.narrative,
    project.primaryNarrative,
    ...(project.narratives || []),
    ...(project.alphaTags || []),
    ...(project.discoverySources || []),
    project.alphaThesis?.summary,
    project.opportunityThesis?.summary || project.opportunityThesis,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function extractAlphaGraphNarratives(project = {}) {
  const explicit = [
    ...(project.narratives || []),
    project.narrative,
    project.primaryNarrative,
    project.category,
  ]
    .filter(Boolean)
    .map(compactId);
  const body = textFor(project);
  const detected = Object.entries(NARRATIVE_TERMS)
    .filter(([, terms]) => terms.some((term) => body.includes(term)))
    .map(([id]) => id);

  return [...new Set([...explicit, ...detected])].filter(Boolean).slice(0, 12);
}

export function extractAlphaGraphSources(project = {}) {
  return [
    project.source,
    ...(project.discoverySources || []),
    ...(project.sourceTruth?.sources || []).map((source) => source.source || source.type),
    ...(project.proofCarryingAlphaContract?.sources || []),
    project.internetResearch?.status?.googleNews === "SUCCESS" ? "google-news" : "",
    project.externalIntelligence?.status?.news === "SUCCESS" ? "news" : "",
    project.externalIntelligence?.status?.x === "SUCCESS" ? "x" : "",
    project.githubIntelligencePro?.repository ? "github" : "",
    project.roadmapProfitabilityScore ? "roadmap" : "",
  ]
    .filter(Boolean)
    .map(compactId)
    .filter(Boolean)
    .slice(0, 30);
}

export function extractAlphaGraphRepository(project = {}) {
  return (
    project.githubIntelligencePro?.repository ||
    project.githubRepository ||
    project.repository ||
    project.repo ||
    project.links?.github ||
    ""
  );
}

function scoreSnapshot(project = {}) {
  return {
    pipeline: num(project.pipelineScore),
    confidenceAdjusted: num(project.confidenceAdjustedScore),
    alphaKnowledgeGraph: num(project.alphaKnowledgeGraphScore),
    causalMarketTwin: num(project.causalMarketTwinScore),
    causalAlpha: num(project.causalAlphaScore),
    autonomousAlphaOS: num(project.autonomousAlphaOSScore),
    selfEvolvingAlphaOS: num(project.selfEvolvingAlphaOSScore),
    proofContract: num(project.proofCarryingAlphaContractScore),
    governor: num(project.alphaEvolutionGovernorScore),
    sourceTruth: num(project.sourceTruthScore),
    proof: num(project.proofScore),
    github: num(project.githubProScore || project.githubScore),
    narrativeHeat: num(project.narrativeHeatScore),
    liquidity: num(project.liquidityScore || project.liquidityExpansionScore),
    catalyst: num(project.liveCatalystRadarScore || project.catalystCalendarScore || project.catalystScore),
    risk: Math.max(
      num(project.trapRiskScore),
      num(project.riskScore),
      num(project.sellPressureScore),
      num(project.externalRiskScore),
      num(project.tokenUnlockRiskScore),
      num(project.vestingPressureScore),
      num(project.falsePositiveSimilarity)
    ),
  };
}

function compactSnapshot(project = {}, generatedAt = new Date().toISOString()) {
  const key = alphaKnowledgeGraphProjectKey(project);
  const repository = extractAlphaGraphRepository(project);

  return {
    key,
    at: generatedAt,
    name: project.name || "Unknown",
    symbol: project.symbol || "UNKNOWN",
    chain: compactId(project.chain || "unknown"),
    contract: project.address || project.tokenAddress || project.pairAddress || "",
    repository,
    narratives: extractAlphaGraphNarratives(project),
    sources: extractAlphaGraphSources(project),
    scores: scoreSnapshot(project),
    verdicts: {
      alphaKnowledgeGraph: project.alphaKnowledgeGraphVerdict || "Unknown",
      causalMarketTwin: project.causalMarketTwinVerdict || "Unknown",
      causalAlpha: project.causalAlphaVerdict || "Unknown",
      alphaOS: project.autonomousAlphaOSVerdict || "Unknown",
      proofContract: project.proofCarryingAlphaContractVerdict || "Unknown",
      governor: project.alphaEvolutionGovernorVerdict || "Unknown",
    },
    primaryDriver:
      project.causalMarketTwin?.primaryCausalDriver ||
      project.causalSignalGraph?.primaryDriver?.label ||
      project.alphaKnowledgeGraph?.dominantRelation ||
      "Unknown",
    nextCatalyst:
      project.liveCatalystEvents?.[0]?.title ||
      project.roadmapMilestones?.[0]?.title ||
      project.strongestCatalyst?.label ||
      project.nextCatalyst?.label ||
      "",
    riskFlags: (project.riskFlags || []).slice(0, 12),
  };
}

function addIndexEntry(index = {}, id = "", key = "") {
  const normalized = compactId(id);
  if (!normalized || !key) return;

  const current = index[normalized] || { count: 0, projects: [] };
  const projects = [...new Set([...(current.projects || []), key])].slice(-200);
  index[normalized] = {
    count: projects.length,
    projects,
  };
}

function rebuildIndexes(projects = {}) {
  const indexes = {
    chains: {},
    narratives: {},
    sources: {},
    repositories: {},
  };

  for (const [key, project] of Object.entries(projects)) {
    const latest = project.latest || {};
    addIndexEntry(indexes.chains, latest.chain || "unknown", key);
    for (const narrative of latest.narratives || []) addIndexEntry(indexes.narratives, narrative, key);
    for (const source of latest.sources || []) addIndexEntry(indexes.sources, source, key);
    if (latest.repository) addIndexEntry(indexes.repositories, latest.repository, key);
  }

  return indexes;
}

function trimProjects(projects = {}) {
  return Object.fromEntries(
    Object.entries(projects)
      .sort(([, a], [, b]) => {
        const aTime = Date.parse(a.latest?.at || a.firstSeenAt || 0);
        const bTime = Date.parse(b.latest?.at || b.firstSeenAt || 0);
        return bTime - aTime;
      })
      .slice(0, MAX_PROJECTS)
  );
}

export function loadAlphaKnowledgeGraphMemory() {
  return readGraph();
}

export function saveAlphaKnowledgeGraph(projects = []) {
  const generatedAt = new Date().toISOString();
  const safeProjects = Array.isArray(projects) ? projects : [];

  if (shouldUseAppendOnlyMemory(MEMORY_FILE)) {
    const snapshots = safeProjects.map((project) => compactSnapshot(project, generatedAt));
    const sidecar = appendMemorySidecar(MEMORY_FILE, snapshots, { recordType: "alpha-knowledge-graph-snapshot" });
    return {
      file: sidecar.file,
      savedProjects: snapshots.length,
      trackedProjects: null,
      generatedAt,
      persistenceMode: sidecar.mode,
      legacyFilePreserved: sidecar.legacyFilePreserved,
      legacyFileBytes: sidecar.legacyFileBytes,
    };
  }

  const graph = readGraph();

  for (const project of safeProjects) {
    const snapshot = compactSnapshot(project, generatedAt);
    const previous = graph.projects[snapshot.key] || {
      key: snapshot.key,
      firstSeenAt: generatedAt,
      scans: 0,
      history: [],
    };
    const priorScores = previous.latest?.scores || {};
    const scoreDelta = Math.round(num(snapshot.scores.pipeline) - num(priorScores.pipeline));
    const twinDelta = Math.round(num(snapshot.scores.causalMarketTwin) - num(priorScores.causalMarketTwin));

    graph.projects[snapshot.key] = {
      ...previous,
      key: snapshot.key,
      scans: num(previous.scans) + 1,
      lastSeenAt: generatedAt,
      latest: snapshot,
      deltas: {
        pipeline: scoreDelta,
        causalMarketTwin: twinDelta,
        sourceTruth: Math.round(num(snapshot.scores.sourceTruth) - num(priorScores.sourceTruth)),
        risk: Math.round(num(snapshot.scores.risk) - num(priorScores.risk)),
      },
      history: [...(previous.history || []), snapshot].slice(-MAX_HISTORY),
    };
  }

  graph.generatedAt = generatedAt;
  graph.projects = trimProjects(graph.projects);
  graph.indexes = rebuildIndexes(graph.projects);
  writeGraph(graph);

  return {
    file: MEMORY_FILE,
    savedProjects: safeProjects.length,
    trackedProjects: Object.keys(graph.projects).length,
    generatedAt,
  };
}

function topIndex(index = {}, limit = 10) {
  return Object.entries(index)
    .map(([id, value]) => ({
      id,
      count: num(value.count),
      projects: value.projects || [],
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export function summarizeAlphaKnowledgeGraphMemory(memory = readGraph()) {
  const graph = normalizeGraph(memory);
  const projects = Object.values(graph.projects);

  return {
    file: MEMORY_FILE,
    generatedAt: graph.generatedAt,
    trackedProjects: projects.length,
    indexedChains: Object.keys(graph.indexes.chains || {}).length,
    indexedNarratives: Object.keys(graph.indexes.narratives || {}).length,
    indexedSources: Object.keys(graph.indexes.sources || {}).length,
    indexedRepositories: Object.keys(graph.indexes.repositories || {}).length,
    hotspots: {
      chains: topIndex(graph.indexes.chains, 8),
      narratives: topIndex(graph.indexes.narratives, 12),
      sources: topIndex(graph.indexes.sources, 12),
    },
    topMemoryProfiles: projects
      .sort((a, b) => {
        const aScore = num(a.latest?.scores?.causalMarketTwin || a.latest?.scores?.alphaKnowledgeGraph || a.latest?.scores?.pipeline);
        const bScore = num(b.latest?.scores?.causalMarketTwin || b.latest?.scores?.alphaKnowledgeGraph || b.latest?.scores?.pipeline);
        return bScore - aScore;
      })
      .slice(0, 25)
      .map((project) => ({
        key: project.key,
        scans: project.scans || 0,
        name: project.latest?.name || "Unknown",
        symbol: project.latest?.symbol || "UNKNOWN",
        chain: project.latest?.chain || "unknown",
        alphaKnowledgeGraphScore: project.latest?.scores?.alphaKnowledgeGraph || 0,
        causalMarketTwinScore: project.latest?.scores?.causalMarketTwin || 0,
        governorScore: project.latest?.scores?.governor || 0,
        verdict: project.latest?.verdicts?.causalMarketTwin || project.latest?.verdicts?.alphaKnowledgeGraph || "Unknown",
        pipelineDelta: project.deltas?.pipeline || 0,
        twinDelta: project.deltas?.causalMarketTwin || 0,
      })),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(JSON.stringify(summarizeAlphaKnowledgeGraphMemory(), null, 2));
}
