import fs from "fs";
import os from "node:os";
import path from "path";
import { ENGINE_REGISTRY } from "./engines/engineRegistry.js";
import { getEngineContracts } from "./kernel/engineContractManifest.js";
import { writeWholeEngineAuditReports } from "./reports/wholeEngineAuditReportEngine.js";

const ENGINE_DIR = path.resolve("src/engines");
const PIPELINE_FILE = path.resolve("src/intelligencePipeline.js");
const DEFAULT_AUDIT_TIMEOUT_MS = 7_000;
const PIPELINE_STAGE_AUDIT_TIMEOUTS_MS = Object.freeze({
  "External Intelligence": 30_000,
  "Web Research Agent": 60_000,
  "Roadmap Catalyst Profit": 30_000,
  "Live Catalyst Radar": 30_000,
  "Project Dossier Swarm": 30_000,
  "AI Research Commander": 30_000,
  "Autonomous Alpha Investigator": 30_000,
  "Capital Flow Observation": 45_000,
});

const STANDALONE_ENGINE_AUDIT_SPECS = Object.freeze({
  "aiMonteCarloEngine.js": { exportName: "analyzeAIMonteCarloBatch", role: "optional-ai-adapter", args: "projects", options: { limit: 1, delayMs: 1 } },
  "airdropToTokenEngine.js": { exportName: "analyzeAirdropToTokenBatch", role: "discovery-signal", args: "projects" },
  "alphaDatabaseEngine.js": { exportName: "analyzeAlphaDatabaseBatch", role: "memory-helper", args: "projects" },
  "alphaDecayEngine.js": { exportName: "analyzeAlphaDecayBatch", role: "advisory-signal", args: "projects" },
  "breakoutHazardEngine.js": { exportName: "analyzeBreakoutHazardBatch", role: "indirect-three-clock-component", args: "projects" },
  "capitalArrivalCurveEngine.js": { exportName: "attachCapitalArrivalIntelligence", role: "indirect-ignition-component", args: "projects" },
  "capitalConservationLedgerEngine.js": { exportName: "buildCapitalConservationLedger", role: "indirect-ignition-component", args: "projectsAndEmptyRows" },
  "capitalDestinationIntelligenceEngine.js": { exportName: "analyzeCapitalDestinationIntelligenceBatch", role: "indirect-ignition-component", args: "projects" },
  "capitalIntentGraphEngine.js": { exportName: "analyzeCapitalIntentGraphBatch", role: "indirect-three-clock-component", args: "projects" },
  "capitalPathPredictionEngine.js": { exportName: "attachCapitalPathPredictions", role: "indirect-ignition-component", args: "projectsAndEmptyRows" },
  "cexListingDiscoveryEngine.js": { exportName: "analyzeCexListingBatch", role: "discovery-signal", args: "projects" },
  "dexPairDiscoveryEngine.js": { exportName: "discoverDexPairs", role: "discovery-source", args: "projects" },
  "discoveryFilterEngine.js": { exportName: "filterDiscoveryCandidates", role: "discovery-filter", args: "projects" },
  "discoveryPackEngine.js": { exportName: "runDiscoveryPack", role: "discovery-orchestrator", args: "inputObject" },
  "downstreamAdoptionGraphEngine.js": { exportName: "analyzeDownstreamAdoptionGraphBatch", role: "indirect-three-clock-component", args: "projects" },
  "ecosystemDiscoveryEngine.js": { exportName: "discoverEcosystemProjects", role: "discovery-source", args: "projects" },
  "economicParticipantFlowEngine.js": { exportName: "analyzeEconomicParticipantFlowBatch", role: "indirect-ignition-component", args: "projects" },
  "edgeHalfLifeEngine.js": { exportName: "analyzeEdgeHalfLife", role: "indirect-three-clock-component", args: "projectAndLab" },
  "edgeUncertaintyEngine.js": { exportName: "analyzeEdgeUncertaintyBatch", role: "indirect-three-clock-component", args: "projects" },
  "effectiveFloatEngine.js": { exportName: "analyzeEffectiveFloatBatch", role: "indirect-ignition-component", args: "projects" },
  "eventSequenceDNAEngine.js": { exportName: "analyzeEventSequenceDNA", role: "indirect-three-clock-component", args: "project" },
  "fakeMomentumFirewallEngine.js": { exportName: "analyzeFakeMomentumFirewallBatch", role: "indirect-three-clock-component", args: "projects" },
  "globalMarketRegimeEngine.js": { exportName: "attachGlobalMarketRegimeBatch", role: "indirect-three-clock-component", args: "projects" },
  "highRatingFilterEngine.js": { exportName: "applyHighRatingFilter", role: "discovery-filter", args: "projects" },
  "informationDiffusionClockEngine.js": { exportName: "analyzeInformationDiffusionClock", role: "indirect-three-clock-component", args: "project" },
  "launchpadDiscoveryEngine.js": { exportName: "discoverLaunchpadProjects", role: "discovery-source", args: "projects" },
  "liquidityGeometryEngine.js": { exportName: "analyzeLiquidityGeometryBatch", role: "indirect-ignition-component", args: "projects" },
  "liveMarketDiscoveryEngine.js": { exportName: "filterLiveCandidates", role: "live-discovery-filter", args: "projects", options: { minLiquidity: 1, minVolume24h: 1 } },
  "localMarketStateEngine.js": { exportName: "analyzeLocalMarketStateBatch", role: "indirect-three-clock-component", args: "projects" },
  "marginalSellerCurveEngine.js": { exportName: "analyzeMarginalSellerCurveBatch", role: "indirect-ignition-component", args: "projects" },
  "marketChangePointRadarEngine.js": { exportName: "analyzeMarketChangePointRadarBatch", role: "indirect-three-clock-component", args: "projects" },
  "marketPressureEngine.js": { exportName: "analyzeMarketPressureBatch", role: "indirect-ignition-component", args: "projects" },
  "memeFilterEngine.js": { exportName: "filterMemes", role: "legacy-discovery-filter", args: "projects" },
  "monteCarloEngine.js": { exportName: "runIntelligencePipeline", role: "legacy-pipeline-adapter", args: "projects", options: { saveMemory: false } },
  "newTokenDiscoveryEngine.js": { exportName: "discoverNewTokens", role: "discovery-source", args: "newProject" },
  "opportunityDiscoveryEngine.js": { exportName: "rankProjects", role: "legacy-ranking-helper", args: "projects" },
  "opportunityThesisEngine.js": { exportName: "analyzeOpportunityThesisBatch", role: "thesis-helper", args: "projects" },
  "prePositioningIntelligenceEngine.js": { exportName: "analyzePrePositioningIntelligenceBatch", role: "indirect-ignition-component", args: "projects" },
  "presaleDiscoveryEngine.js": { exportName: "discoverPresales", role: "discovery-source", args: "projects" },
  "projectQualityGateEngine.js": { exportName: "analyzeProjectQualityGateBatch", role: "quality-gate-helper", args: "projects" },
  "realTimeTradeFlowEngine.js": { exportName: "analyzeRealTimeTradeFlowBatch", role: "indirect-three-clock-component", args: "projects" },
  "reflexivityMechanismEngine.js": { exportName: "analyzeReflexivityMechanismsBatch", role: "indirect-ignition-component", args: "projects" },
  "riskGateEngine.js": { exportName: "analyzeRiskGateBatch", role: "legacy-risk-gate", args: "projects" },
  "supplyLineageIntelligenceEngine.js": { exportName: "analyzeSupplyLineageIntelligenceBatch", role: "indirect-ignition-component", args: "projects" },
  "supplyShockEngine.js": { exportName: "analyzeSupplyShockBatch", role: "indirect-three-clock-component", args: "projects" },
  "testnetDiscoveryEngine.js": { exportName: "discoverTestnets", role: "discovery-source", args: "projects" },
  "threeClockEdgeEngine.js": { exportName: "analyzeThreeClockEdgeBatch", role: "indirect-three-clock-component", args: "projects" },
  "trendingPairDiscoveryEngine.js": { exportName: "discoverTrendingPairs", role: "discovery-source", args: "projects" },
  "upcomingLaunchDiscoveryEngine.js": { exportName: "analyzeUpcomingLaunchBatch", role: "discovery-signal", args: "projects" },
  "walletTemporalFingerprintEngine.js": { exportName: "analyzeWalletTemporalFingerprintBatch", role: "indirect-three-clock-component", args: "projects" },
  "watchtowerEngine.js": { exportName: "analyzeWatchtower", role: "watchtower-standalone", args: "watchtower" },
});

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function defaultSampleProject() {
  return {
    projectId: "engine-audit:sample",
    name: "Engine Audit Sample",
    symbol: "AUDIT",
    chain: "base",
    address: "0x1111111111111111111111111111111111111111",
    pairAddress: "0x2222222222222222222222222222222222222222",
    source: "dexscreener",
    discoverySources: ["dexscreener", "github", "coingecko"],
    discoveredAt: new Date().toISOString(),
    liquidityUsd: 300000,
    volume24h: 180000,
    marketCap: 4500000,
    priceUsd: 0.04,
    priceChange24h: 6,
    identityResolutionScore: 82,
    projectIdentityVerdict: "Identity Resolved",
    sourceTruthScore: 80,
    sourceTruthVerdict: "Verified Source Stack",
    activeLiquidityTruthScore: 78,
    activeLiquidityTruthVerdict: "Usable Exit Liquidity Confirmed",
    organicBuyerScore: 76,
    organicBuyerVerdict: "Organic Buyer Signal",
    walletClusterScore: 72,
    walletClusterRiskScore: 10,
    instantSafetyStatus: "PASS",
    instantSafetyScore: 85,
    organicDemandFirewallStatus: "PASS",
    organicEconomicIntegrityScore: 78,
    githubProScore: 74,
    developerActivityScore: 72,
    catalystScore: 70,
    roadmapProfitabilityScore: 70,
    discoveryDecisionScore: 78,
    discoveryDecisionTier: "PASS",
    sniperEvidenceConfidence: 78,
    sniperState: "WATCH",
    sniperIntegrityScore: 76,
    purchaseRouteConfirmed: true,
    executionTwinScore: 75,
    executionTwinVerdict: "Route Verified",
    alphaEvolutionGovernorScore: 76,
    alphaEvolutionGovernorVerdict: "Governor Priority Research",
    pipelineScore: 76,
    institutionalScore: 76,
    riskScore: 12,
    trapRiskScore: 8,
    evidence: [{ engine: "engine-health-check", source: "engine-health-check", score: 80 }],
  };
}

function withTimeout(work, timeoutMs, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
  });

  return Promise.race([Promise.resolve().then(work), timeout]).finally(() => clearTimeout(timer));
}

function auditTimeoutMs({ options = {}, contract = {}, spec = {}, usage = {} } = {}) {
  const explicit = num(options.timeoutMs);
  if (explicit > 0) return Math.max(100, explicit);

  const declared = num(contract.timeoutMs || spec.timeoutMs || usage.timeoutMs);
  if (declared > 0) return Math.max(100, declared);

  const stageSpecific = num(PIPELINE_STAGE_AUDIT_TIMEOUTS_MS[usage.stage] || PIPELINE_STAGE_AUDIT_TIMEOUTS_MS[spec.stage]);
  if (stageSpecific > 0) return Math.max(100, stageSpecific);

  const environmentDefault = num(process.env.ENGINE_AUDIT_TIMEOUT_MS || process.env.DEFAULT_ENGINE_TIMEOUT_MS);
  if (environmentDefault > 0) return Math.max(100, environmentDefault);

  return DEFAULT_AUDIT_TIMEOUT_MS;
}

function moduleFileFor(contract = {}) {
  return path.basename(String(contract.module || ""));
}

function moduleNameFromFile(file = "") {
  return path.basename(String(file)).replace(/\.js$/, "");
}

function dependencyKey(value = "") {
  return String(value ?? "")
    .replace(/\.js$/i, "")
    .replace(/Engine$/i, "")
    .replace(/^analyze/i, "")
    .replace(/Batch$/i, "")
    .replace(/[^a-z0-9]+/gi, "")
    .toLowerCase();
}

function countLocalReferences(source = "", localName = "") {
  if (!localName) return 0;
  const escaped = localName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return [...source.matchAll(new RegExp(`\\b${escaped}\\b`, "g"))].length;
}

function registryEntryForFile(file = "") {
  const moduleName = moduleNameFromFile(file);
  return ENGINE_REGISTRY.find((entry) => entry.engine === moduleName) || null;
}

function pipelineImports(source = "") {
  const bindings = new Map();
  const importPattern = /import\s*\{\s*([^}]*)\s*\}\s*from\s*["']\.\/engines\/([^"']+Engine\.js)["'];/g;

  for (const match of source.matchAll(importPattern)) {
    const [, names, module] = match;
    for (const item of names.split(",")) {
      const parts = item.trim().split(/\s+as\s+/);
      const exportedName = parts[0]?.trim();
      const localName = (parts[1] || parts[0])?.trim();
      if (exportedName && localName) {
        bindings.set(localName, { engine: path.basename(module), exportName: exportedName });
      }
    }
  }

  return bindings;
}

function pipelineRunLocals(source = "") {
  const locals = new Set();
  const runPattern = /runEngine\(\s*["']([^"']+)["']\s*,\s*([A-Za-z_$][\w$]*)/g;

  for (const match of source.matchAll(runPattern)) {
    locals.add(match[2]);
  }

  return locals;
}

export function getPipelineEngineUsage(source = fs.readFileSync(PIPELINE_FILE, "utf8")) {
  const bindings = pipelineImports(source);
  const usage = [];
  const runPattern = /runEngine\(\s*["']([^"']+)["']\s*,\s*([A-Za-z_$][\w$]*)/g;

  for (const match of source.matchAll(runPattern)) {
    const [, stage, localName] = match;
    const binding = bindings.get(localName);
    if (binding) usage.push({ ...binding, stage });
  }

  return usage;
}

function projectResultFrom(output) {
  if (Array.isArray(output)) return output[0] || null;
  for (const field of ["results", "projects", "data", "tokens", "candidates", "accepted", "rejected"]) {
    if (Array.isArray(output?.[field])) return output[field][0] || null;
  }
  return null;
}

function identityPreserved(result = {}, sample = {}) {
  return (
    result.projectId === sample.projectId &&
    result.symbol === sample.symbol &&
    result.chain === sample.chain &&
    result.address === sample.address
  );
}

function standaloneIdentityPreserved(result = {}, sample = {}) {
  const fields = ["projectId", "symbol", "chain", "address", "pairAddress"].filter(
    (field) => result[field] !== undefined && sample[field] !== undefined
  );
  if (!fields.length) return true;
  return fields.every((field) => result[field] === sample[field]);
}

async function executeContract(contract = {}, module = {}, sample = {}, options = {}) {
  const engine = module[contract.exportName];
  const timeoutMs = auditTimeoutMs({ options, contract });

  if (typeof engine !== "function") {
    return {
      status: "FAIL",
      issue: `Missing declared export ${contract.exportName}`,
      executionStatus: "NOT_EXECUTED",
      timeoutMs,
    };
  }

  const startedAt = Date.now();
  const memoryBefore = process.memoryUsage().heapUsed;
  const memoryDelta = () => Math.max(0, process.memoryUsage().heapUsed - memoryBefore);
  try {
    const output = await withTimeout(
      () => engine([{ ...sample }], { auditMode: true, saveMemory: false, persist: false, engineTimeoutMs: timeoutMs }),
      timeoutMs,
      contract.id
    );
    const result = Array.isArray(output) ? output[0] : null;
    const scoreFields = contract.outputContract?.scoreFields || [];
    const invalidScores = scoreFields.filter((field) => {
      const value = result?.[field];
      return value !== undefined && (!Number.isFinite(Number(value)) || num(value) < 0 || num(value) > 100);
    });
    const missingScores = scoreFields.filter((field) => result?.[field] === undefined);

    if (!Array.isArray(output) || output.length !== 1) {
      return {
        status: "FAIL",
        issue: "Declared batch export did not return one project result.",
        executionStatus: "INVALID_RETURN",
        timeoutMs,
        durationMs: Date.now() - startedAt,
        memoryDeltaBytes: memoryDelta(),
      };
    }
    if (!identityPreserved(result, sample)) {
      return {
        status: "FAIL",
        issue: "Declared batch export did not preserve the project identity.",
        executionStatus: "IDENTITY_CORRUPTED",
        timeoutMs,
        durationMs: Date.now() - startedAt,
        memoryDeltaBytes: memoryDelta(),
      };
    }
    if (missingScores.length || invalidScores.length) {
      return {
        status: "FAIL",
        issue: [
          ...(missingScores.length ? [`Missing score fields: ${missingScores.join(", ")}`] : []),
          ...(invalidScores.length ? [`Invalid score fields: ${invalidScores.join(", ")}`] : []),
        ].join(". "),
        executionStatus: "INVALID_OUTPUT",
        timeoutMs,
        durationMs: Date.now() - startedAt,
        memoryDeltaBytes: memoryDelta(),
      };
    }

    return {
      status: "OK",
      executionStatus: "EXECUTED",
      timeoutMs,
      durationMs: Date.now() - startedAt,
      memoryDeltaBytes: memoryDelta(),
      scoreFields,
    };
  } catch (error) {
    return {
      status: "FAIL",
      issue: error.message,
      executionStatus: "EXECUTION_FAILED",
      timeoutMs,
      durationMs: Date.now() - startedAt,
      memoryDeltaBytes: memoryDelta(),
    };
  }
}

async function executePipelineUsage(usage = {}, module = {}, sample = {}, options = {}) {
  const engine = module[usage.exportName];
  const timeoutMs = auditTimeoutMs({ options, usage });

  if (typeof engine !== "function") {
    return {
      status: "FAIL",
      issue: `Pipeline references missing export ${usage.exportName}`,
      executionStatus: "NOT_EXECUTED",
      timeoutMs,
    };
  }

  const startedAt = Date.now();
  const memoryBefore = process.memoryUsage().heapUsed;
  const memoryDelta = () => Math.max(0, process.memoryUsage().heapUsed - memoryBefore);
  try {
    const output = await withTimeout(
      () => engine([{ ...sample }], { auditMode: true, saveMemory: false, persist: false, engineTimeoutMs: timeoutMs }),
      timeoutMs,
      usage.stage
    );
    const result = projectResultFrom(output);

    if (!result) {
      return {
        status: "FAIL",
        issue: "Pipeline export did not return a project batch result.",
        executionStatus: "INVALID_RETURN",
        timeoutMs,
        durationMs: Date.now() - startedAt,
        memoryDeltaBytes: memoryDelta(),
      };
    }
    if (!identityPreserved(result, sample)) {
      return {
        status: "FAIL",
        issue: "Pipeline export did not preserve the project identity.",
        executionStatus: "IDENTITY_CORRUPTED",
        timeoutMs,
        durationMs: Date.now() - startedAt,
        memoryDeltaBytes: memoryDelta(),
      };
    }

    return {
      status: "OK",
      executionStatus: "PIPELINE_EXECUTED",
      timeoutMs,
      durationMs: Date.now() - startedAt,
      memoryDeltaBytes: memoryDelta(),
    };
  } catch (error) {
    return {
      status: "FAIL",
      issue: error.message,
      executionStatus: "EXECUTION_FAILED",
      timeoutMs,
      durationMs: Date.now() - startedAt,
      memoryDeltaBytes: memoryDelta(),
    };
  }
}

function standaloneSampleFor(spec = {}, sample = {}) {
  const base = {
    ...sample,
    createdAt: new Date().toISOString(),
    pairCreatedAt: new Date().toISOString(),
    stage: sample.stage || "testnet presale upcoming launch",
    description:
      sample.description ||
      "Base ecosystem protocol with testnet, launchpad, presale, exchange listing, airdrop, and product launch signals.",
    announcement:
      sample.announcement ||
      "Mainnet launch, presale, airdrop snapshot, and exchange listing are upcoming.",
    docs: sample.docs || "https://example.com/docs",
    github: sample.github || "https://github.com/example/audit",
    githubRepo: sample.githubRepo || "https://github.com/example/audit",
    twitter: sample.twitter || "@audit",
    tgeDate: sample.tgeDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    launchDate: sample.launchDate || new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
    presaleDate: sample.presaleDate || new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
    mainnetDate: sample.mainnetDate || new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
    listingDate: sample.listingDate || new Date(Date.now() + 12 * 24 * 60 * 60 * 1000).toISOString(),
    airdropDate: sample.airdropDate || new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
    saleUrl: sample.saleUrl || "https://example.com/sale",
    testnetLive: true,
    pointsProgram: true,
    campaign: "points rewards testnet campaign",
    exchange: "kucoin",
    listingExchange: "kucoin",
    overallOpportunityScore: sample.overallOpportunityScore || 76,
    richTokenScore: sample.richTokenScore || 74,
    momentumShiftScore: sample.momentumShiftScore || 72,
    buyTransactions24h: sample.buyTransactions24h || 80,
    sellTransactions24h: sample.sellTransactions24h || 20,
    pairCreatedAt: sample.pairCreatedAt || new Date().toISOString(),
    dex: sample.dex || "uniswap",
    baseToken: sample.baseToken || { symbol: sample.symbol || "AUDIT", address: sample.address },
    quoteToken: sample.quoteToken || { symbol: "USDC" },
    score: sample.score || sample.pipelineScore || 76,
  };

  if (spec.args === "newProject") {
    return { ...base, createdAt: new Date().toISOString(), pairCreatedAt: new Date().toISOString() };
  }
  return base;
}

function standaloneArguments(spec = {}, sample = {}) {
  const project = standaloneSampleFor(spec, sample);
  const options = { auditMode: true, saveMemory: false, persist: false, ...(spec.options || {}) };

  if (spec.args === "inputObject") return [{ projects: [project] }, options];
  if (spec.args === "watchtower") return [[project], { ...options, watchStore: { projects: {} } }];
  if (spec.args === "project") return [project, options];
  if (spec.args === "projectAndLab") return [project, { records: [] }, options];
  if (spec.args === "projectsAndEmptyRows") return [[project], [], options];
  return [[project], options];
}

async function executeStandaloneUsage(spec = {}, module = {}, sample = {}, options = {}) {
  const engine = module[spec.exportName];
  const timeoutMs = auditTimeoutMs({ options, spec });

  if (typeof engine !== "function") {
    return {
      status: "FAIL",
      issue: `Missing standalone export ${spec.exportName}`,
      executionStatus: "NOT_EXECUTED",
      timeoutMs,
    };
  }

  const startedAt = Date.now();
  const memoryBefore = process.memoryUsage().heapUsed;
  const memoryDelta = () => Math.max(0, process.memoryUsage().heapUsed - memoryBefore);

  try {
    const output = await withTimeout(
      () => engine(...standaloneArguments(spec, sample)),
      timeoutMs,
      spec.exportName
    );
    const projectResult = projectResultFrom(output);

    if (output === undefined || output === null) {
      return {
        status: "FAIL",
        issue: "Standalone audit export returned no value.",
        executionStatus: "INVALID_RETURN",
        timeoutMs,
        durationMs: Date.now() - startedAt,
        memoryDeltaBytes: memoryDelta(),
      };
    }
    if (projectResult && !standaloneIdentityPreserved(projectResult, standaloneSampleFor(spec, sample))) {
      return {
        status: "FAIL",
        issue: "Standalone audit export corrupted the project identity.",
        executionStatus: "IDENTITY_CORRUPTED",
        timeoutMs,
        durationMs: Date.now() - startedAt,
        memoryDeltaBytes: memoryDelta(),
      };
    }

    return {
      status: "OK",
      executionStatus: "STANDALONE_EXECUTED",
      timeoutMs,
      durationMs: Date.now() - startedAt,
      memoryDeltaBytes: memoryDelta(),
      standaloneExport: spec.exportName,
      standaloneRole: spec.role,
    };
  } catch (error) {
    return {
      status: "FAIL",
      issue: error.message,
      executionStatus: "EXECUTION_FAILED",
      timeoutMs,
      durationMs: Date.now() - startedAt,
      memoryDeltaBytes: memoryDelta(),
    };
  }
}

function groupDuplicates(items = [], keyFn = (item) => item) {
  const groups = new Map();
  for (const item of items) {
    const key = keyFn(item);
    const list = groups.get(key) || [];
    list.push(item);
    groups.set(key, list);
  }
  return [...groups.entries()]
    .filter(([, list]) => list.length > 1)
    .map(([key, list]) => ({ key, count: list.length, items: list }));
}

function detectContractCycles(contracts = []) {
  const byId = new Map(contracts.map((contract) => [contract.id, contract]));
  const visiting = new Set();
  const visited = new Set();
  const cycles = [];

  function visit(id = "", stack = []) {
    if (visiting.has(id)) {
      const start = stack.indexOf(id);
      cycles.push([...stack.slice(start), id]);
      return;
    }
    if (visited.has(id)) return;

    visiting.add(id);
    const contract = byId.get(id);
    for (const dep of contract?.dependsOn || []) {
      if (byId.has(dep)) visit(dep, [...stack, id]);
    }
    visiting.delete(id);
    visited.add(id);
  }

  for (const contract of contracts) visit(contract.id, []);
  return cycles;
}

export function buildEngineHealthReport(results = []) {
  const pipelineSource = fs.existsSync(PIPELINE_FILE) ? fs.readFileSync(PIPELINE_FILE, "utf8") : "";
  const imports = pipelineImports(pipelineSource);
  const runLocals = pipelineRunLocals(pipelineSource);
  const usage = getPipelineEngineUsage(pipelineSource);
  const contracts = getEngineContracts();
  const contractById = new Map(contracts.map((contract) => [contract.id, contract]));
  const contractByModule = new Map(contracts.map((contract) => [moduleFileFor(contract), contract]));
  const pipelineIndexByModule = new Map();
  const pipelineIndexByDependency = new Map();
  usage.forEach((entry, index) => {
    if (!pipelineIndexByModule.has(entry.engine)) pipelineIndexByModule.set(entry.engine, index);
    for (const key of [
      dependencyKey(entry.stage),
      dependencyKey(entry.engine),
      dependencyKey(entry.exportName),
    ]) {
      if (key && !pipelineIndexByDependency.has(key)) pipelineIndexByDependency.set(key, index);
    }
  });

  const failed = results.filter((result) => result.status === "FAIL");
  const dormant = results.filter((result) => result.status === "DORMANT");
  const standalone = results.filter((result) => result.executionStatus === "STANDALONE_EXECUTED");
  const activeUncontracted = results.filter((result) => result.status === "PIPELINE_ACTIVE_UNCONTRACTED");
  const executed = results.filter((result) => ["EXECUTED", "PIPELINE_EXECUTED", "STANDALONE_EXECUTED"].includes(result.executionStatus));
  const timeouts = results.filter((result) => /timed out/i.test(result.issue || ""));
  const silentFailures = results.filter((result) => result.status !== "FAIL" && result.issue);
  const unexpectedMutations = results.filter((result) => result.executionStatus === "IDENTITY_CORRUPTED");
  const memoryGrowthWatchlist = results
    .filter((result) => num(result.memoryDeltaBytes) > 25_000_000)
    .map((result) => ({
      engine: result.engine,
      memoryDeltaBytes: result.memoryDeltaBytes,
      status: result.status,
    }));
  const memoryLeaks = memoryGrowthWatchlist
    .filter((result) => num(result.memoryDeltaBytes) > 250_000_000)
    .map((result) => ({
      ...result,
      severity: "POSSIBLE_LEAK",
      basis: "Single-run heap delta exceeded 250MB; confirm with repeated engine:audit:full runs.",
    }));
  const neverCalledEngines = results.filter((result) =>
    ["DORMANT", "NOT_EXECUTED"].includes(result.status) || result.executionStatus === "NOT_EXECUTED"
  );
  const deadImports = [...imports.entries()]
    .filter(([localName]) => !runLocals.has(localName) && countLocalReferences(pipelineSource, localName) <= 1)
    .map(([localName, binding]) => ({ localName, ...binding }));
  const usedExportsByModule = new Map();
  for (const entry of usage) {
    const current = usedExportsByModule.get(entry.engine) || new Set();
    current.add(entry.exportName);
    usedExportsByModule.set(entry.engine, current);
  }
  for (const contract of contracts) {
    const module = moduleFileFor(contract);
    const current = usedExportsByModule.get(module) || new Set();
    current.add(contract.exportName);
    usedExportsByModule.set(module, current);
  }
  const deadExports = results.flatMap((result) => {
    const used = usedExportsByModule.get(result.engine) || new Set();
    return (result.exports || [])
      .filter((exportName) => !used.has(exportName))
      .map((exportName) => ({ engine: result.engine, exportName }));
  });
  const duplicateEngines = [
    ...groupDuplicates(usage, (entry) => entry.stage.toLowerCase()),
    ...groupDuplicates(results.flatMap((result) => (result.exports || []).map((exportName) => ({ engine: result.engine, exportName }))), (entry) => entry.exportName),
  ];
  const pipelineLoops = detectContractCycles(contracts);
  const engineOrderingProblems = [];
  for (const contract of contracts) {
    const contractModule = moduleFileFor(contract);
    const contractIndex = pipelineIndexByModule.get(contractModule);
    for (const depId of contract.dependsOn || []) {
      const dep = contractById.get(depId);
      if (!dep) {
        const depIndex = pipelineIndexByDependency.get(dependencyKey(depId));
        if (depIndex === undefined) {
          engineOrderingProblems.push({
            engine: contract.id,
            dependency: depId,
            issue: "Declared dependency is missing from the contract manifest and live pipeline.",
          });
        } else if (contractIndex !== undefined && depIndex > contractIndex) {
          engineOrderingProblems.push({
            engine: contract.id,
            dependency: depId,
            issue: "Pipeline runs dependency after dependent engine.",
          });
        }
        continue;
      }
      if (num(dep.priority) > num(contract.priority)) {
        engineOrderingProblems.push({
          engine: contract.id,
          dependency: depId,
          issue: "Dependency priority is after dependent engine.",
        });
      }
      const depIndex = pipelineIndexByModule.get(moduleFileFor(dep));
      if (contractIndex !== undefined && depIndex !== undefined && depIndex > contractIndex) {
        engineOrderingProblems.push({
          engine: contract.id,
          dependency: depId,
          issue: "Pipeline runs dependency after dependent engine.",
        });
      }
    }
  }

  const contractCoveragePercent = results.length
    ? Math.round((results.filter((result) => contractByModule.has(result.engine)).length / results.length) * 100)
    : 0;
  const pipelineCoveragePercent = results.length
    ? Math.round((results.filter((result) => pipelineIndexByModule.has(result.engine)).length / results.length) * 100)
    : 0;
  const executionCoveragePercent = results.length
    ? Math.round((executed.length / results.length) * 100)
    : 0;
  const healthScore = Math.round(
    Math.max(
      0,
      Math.min(
        100,
        100 -
          failed.length * 12 -
          timeouts.length * 8 -
          unexpectedMutations.length * 10 -
          memoryLeaks.length * 3 -
          activeUncontracted.length * 1.5 -
          engineOrderingProblems.length * 3 -
          Math.min(12, dormant.length * 0.5)
      )
    )
  );
  const warnings = [
    ...(activeUncontracted.length ? [`${activeUncontracted.length} live pipeline engines are missing explicit contracts.`] : []),
    ...(dormant.length ? [`${dormant.length} engine modules are unclassified and never called by the live pipeline or standalone audit.`] : []),
    ...(deadImports.length ? [`${deadImports.length} pipeline imports are not passed to runEngine.`] : []),
    ...(engineOrderingProblems.length ? [`${engineOrderingProblems.length} dependency ordering issue(s) detected.`] : []),
    ...(pipelineLoops.length ? [`${pipelineLoops.length} dependency loop(s) detected.`] : []),
    ...(memoryLeaks.length ? [`${memoryLeaks.length} engines exceeded the possible memory-leak heap-growth threshold.`] : []),
  ];

  return {
    generatedAt: new Date().toISOString(),
    status: failed.length ? "FAILED" : warnings.length ? "DEGRADED" : "OK",
    healthScore,
    coverage: {
      totalEngines: results.length,
      pipelineUsageCount: usage.length,
      contractCount: contracts.length,
      contractCoveragePercent,
      pipelineCoveragePercent,
      executionCoveragePercent,
    },
    runtime: {
      executedEngines: executed.length,
      dormantEngines: dormant.length,
      standaloneEngines: standalone.length,
      activeUncontractedEngines: activeUncontracted.length,
      timeoutCount: timeouts.length,
      totalDurationMs: results.reduce((sum, result) => sum + num(result.durationMs), 0),
      slowestEngines: [...results]
        .filter((result) => num(result.durationMs) > 0)
        .sort((a, b) => num(b.durationMs) - num(a.durationMs))
        .slice(0, 10)
        .map((result) => ({ engine: result.engine, durationMs: result.durationMs, status: result.status })),
    },
    failures: failed,
    warnings,
    observations: [
      ...(standalone.length ? [`${standalone.length} standalone/discovery engines are classified and audit-executed outside the live intelligence pipeline.`] : []),
      ...(deadExports.length ? [`${deadExports.length} helper exports are not direct pipeline/contract entrypoints.`] : []),
      ...(memoryGrowthWatchlist.length ? [`${memoryGrowthWatchlist.length} engines showed notable single-run heap growth below the leak threshold.`] : []),
    ],
    unusedEngines: dormant.map((result) => result.engine),
    standaloneEngines: standalone.map((result) => ({
      engine: result.engine,
      role: result.standaloneRole,
      exportName: result.standaloneExport,
      durationMs: result.durationMs,
    })),
    duplicateEngines,
    neverCalledEngines: neverCalledEngines.map((result) => result.engine),
    orphanEngines: dormant.map((result) => result.engine),
    deadImports,
    deadExports,
    timeouts,
    silentFailures,
    unexpectedMutations,
    memoryGrowthWatchlist,
    pipelineLoops,
    memoryLeaks,
    engineOrderingProblems,
    dependencyGraph: contracts.map((contract) => ({
      id: contract.id,
      module: moduleFileFor(contract),
      dependsOn: contract.dependsOn || [],
      priority: contract.priority,
      phase: contract.phase,
    })),
    results,
  };
}

export async function runEngineHealthCheck(sampleProject = {}, options = {}) {
  const files = fs.readdirSync(ENGINE_DIR).filter((file) => file.endsWith("Engine.js")).sort();
  const contractsByModule = new Map(getEngineContracts().map((contract) => [moduleFileFor(contract), contract]));
  const pipelineUsageByModule = new Map();
  for (const usage of getPipelineEngineUsage()) {
    const entries = pipelineUsageByModule.get(usage.engine) || [];
    entries.push(usage);
    pipelineUsageByModule.set(usage.engine, entries);
  }
  const sample = { ...defaultSampleProject(), ...sampleProject };
  const results = [];

  for (const file of files) {
    try {
      const module = await import(`./engines/${file}`);
      const exports = Object.entries(module)
        .filter(([, value]) => typeof value === "function")
        .map(([name]) => name);
      const contract = contractsByModule.get(file);
      const pipelineUsage = pipelineUsageByModule.get(file) || [];
      const registryEntry = registryEntryForFile(file);
      const standaloneSpec = STANDALONE_ENGINE_AUDIT_SPECS[file] || (registryEntry && !pipelineUsage.length ? {
        exportName: exports.find((exportName) => /Batch$/.test(exportName)) || exports[0],
        role: `${registryEntry.category || "registry"}-registry`,
        args: "projects",
      } : null);

      if (!exports.length) {
        results.push({ engine: file, status: "FAIL", issue: "No exported function found", executionStatus: "NOT_EXECUTED" });
      } else if (!contract) {
        if (!pipelineUsage.length) {
          if (standaloneSpec) {
            results.push({
              engine: file,
              registryId: registryEntry?.id || null,
              registryCategory: registryEntry?.category || null,
              exports,
              ...(await executeStandaloneUsage(standaloneSpec, module, sample, options)),
            });
          } else {
            results.push({
              engine: file,
              status: "DORMANT",
              issue: "Not referenced by the live intelligence pipeline or standalone audit registry.",
              executionStatus: "NOT_EXECUTED",
              exports,
            });
          }
        } else if (options.executePipelineActive === true) {
          const executions = [];
          for (const usage of pipelineUsage) {
            executions.push(await executePipelineUsage(usage, module, sample, options));
          }
          const failedExecution = executions.find((execution) => execution.status === "FAIL");
          results.push({
            engine: file,
            status: failedExecution ? "FAIL" : "OK",
            pipelineStages: pipelineUsage.map((usage) => usage.stage),
            pipelineExports: pipelineUsage.map((usage) => usage.exportName),
            exports,
            ...(failedExecution || executions[0]),
          });
        } else {
          results.push({
            engine: file,
            status: "PIPELINE_ACTIVE_UNCONTRACTED",
            issue: "Referenced by the live pipeline but missing an explicit engine contract.",
            executionStatus: "REFERENCED_BY_PIPELINE",
            pipelineStages: pipelineUsage.map((usage) => usage.stage),
            pipelineExports: pipelineUsage.map((usage) => usage.exportName),
            exports,
          });
        }
      } else {
        results.push({
          engine: file,
          contractId: contract.id,
          exports,
          ...(await executeContract(contract, module, sample, options)),
        });
      }
    } catch (error) {
      results.push({ engine: file, status: "FAIL", issue: error.message, executionStatus: "IMPORT_FAILED" });
    }
  }

  return results;
}

function snapshotAuditDataDirectory() {
  const dataDir = path.resolve("data");
  const backupRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cli-engine-audit-data-"));
  const backupDir = path.join(backupRoot, "data");
  const existed = fs.existsSync(dataDir);
  if (existed) fs.cpSync(dataDir, backupDir, { recursive: true });
  return { dataDir, backupRoot, backupDir, existed };
}

function restoreAuditDataDirectory(snapshot) {
  if (fs.existsSync(snapshot.dataDir)) fs.rmSync(snapshot.dataDir, { recursive: true, force: true });
  if (snapshot.existed) fs.cpSync(snapshot.backupDir, snapshot.dataDir, { recursive: true });
  fs.rmSync(snapshot.backupRoot, { recursive: true, force: true });
}

if (process.argv[1]?.includes("engineHealthCheck.js")) {
  const auditDataSnapshot = snapshotAuditDataDirectory();
  const previousAuditMode = process.env.ENGINE_AUDIT_MODE;
  let results;
  try {
    process.env.ENGINE_AUDIT_MODE = "true";
    results = await runEngineHealthCheck({}, { executePipelineActive: process.argv.includes("--full") });
  } finally {
    restoreAuditDataDirectory(auditDataSnapshot);
    if (previousAuditMode === undefined) delete process.env.ENGINE_AUDIT_MODE;
    else process.env.ENGINE_AUDIT_MODE = previousAuditMode;
  }
  const report = buildEngineHealthReport(results);
  const reportsDir = path.resolve("reports");
  fs.mkdirSync(reportsDir, { recursive: true });
  const healthPath = path.join(reportsDir, "engine-health-report.json");
  fs.writeFileSync(healthPath, JSON.stringify(report, null, 2));
  const wholeEngineAudit = writeWholeEngineAuditReports({
    reportsDir,
    engineHealthReport: report,
    engineResults: results,
  });
  console.table(results.map((result) => ({
    engine: result.engine,
    contract: result.contractId || "",
    status: result.status,
    execution: result.executionStatus,
    durationMs: result.durationMs || "",
    issue: result.issue || "",
  })));

  const failed = results.filter((result) => result.status === "FAIL");
  const executed = results.filter((result) => ["EXECUTED", "PIPELINE_EXECUTED"].includes(result.executionStatus));
  const standalone = results.filter((result) => result.executionStatus === "STANDALONE_EXECUTED");
  const activeUncontracted = results.filter((result) => result.status === "PIPELINE_ACTIVE_UNCONTRACTED");
  const dormant = results.filter((result) => result.status === "DORMANT");
  console.log(`\nExecuted ${executed.length + standalone.length} engines (${standalone.length} standalone). ${activeUncontracted.length} active pipeline engines need explicit contracts. ${dormant.length} modules are unclassified dormant.`);
  console.log(`Engine health report: ${healthPath}`);
  console.log(`Whole engine audit: ${wholeEngineAudit.wholeEngineAuditPath}`);
  console.log(`Engine value ledger: ${wholeEngineAudit.engineValueLedgerPath}`);

  if (failed.length > 0) {
    console.log(`\n${failed.length} engine checks failed.`);
    process.exit(1);
  }
}
