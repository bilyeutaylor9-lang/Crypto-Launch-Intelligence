import fs from "fs";
import path from "path";

const DATA_DIR = path.resolve("data");
const MEMORY_FILE = path.join(DATA_DIR, "source-router-memory.json");
const MAX_RUNS = Number(process.env.SOURCE_ROUTER_MAX_RUNS || 250);

const CORE_SOURCE_NAMES = [
  "dexscreener",
  "geckoterminal",
  "coingecko",
  "birdeye",
  "freeMarketData",
  "expandedMarketData",
  "googleNewsDiscovery",
  "githubProjectDiscovery",
  "nativeDiscoveryMesh",
  "researchSeeds",
  "aiDiscoverySwarm",
  "candidateRescue",
];

const RECOVERABLE_NO_KEY_PROBE_SOURCES = new Set([
  "dexscreener",
  "geckoterminal",
  "freeMarketData",
  "expandedMarketData",
  "googleNewsDiscovery",
  "githubProjectDiscovery",
  "nativeDiscoveryMesh",
]);

const NON_RECOVERABLE_COOLDOWN_TYPES = new Set(["RATE_LIMIT", "BLOCKED", "AUTH_REQUIRED"]);

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readMemory() {
  ensureDataDir();

  if (!fs.existsSync(MEMORY_FILE)) {
    return {
      version: 1,
      updatedAt: null,
      runs: [],
      sources: {},
    };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(MEMORY_FILE, "utf8"));
    return {
      version: 1,
      updatedAt: parsed.updatedAt || null,
      runs: Array.isArray(parsed.runs) ? parsed.runs : [],
      sources: parsed.sources && typeof parsed.sources === "object" ? parsed.sources : {},
    };
  } catch {
    return {
      version: 1,
      updatedAt: null,
      runs: [],
      sources: {},
    };
  }
}

function writeMemory(memory = {}) {
  ensureDataDir();
  fs.writeFileSync(
    MEMORY_FILE,
    JSON.stringify(
      {
        ...memory,
        updatedAt: new Date().toISOString(),
        runs: (memory.runs || []).slice(-MAX_RUNS),
      },
      null,
      2
    )
  );
}

function sourceState(memory = {}, sourceName = "") {
  return memory.sources?.[sourceName] || {
    source: sourceName,
    runs: 0,
    successes: 0,
    usefulSuccesses: 0,
    emptyResponses: 0,
    failures: 0,
    totalCandidates: 0,
    totalDurationMs: 0,
    lastStatus: "UNKNOWN",
    lastError: null,
    lastRunAt: null,
    cooldownUntil: null,
  };
}

function isCoolingDown(state = {}, now = Date.now()) {
  const until = state.cooldownUntil ? new Date(state.cooldownUntil).getTime() : 0;
  return Number.isFinite(until) && until > now;
}

function errorType(error = "") {
  const text = String(error || "").toLowerCase();

  if (text.includes("429") || text.includes("rate")) return "RATE_LIMIT";
  if (text.includes("451") || text.includes("403") || text.includes("blocked")) return "BLOCKED";
  if (text.includes("401") || text.includes("unauthorized")) return "AUTH_REQUIRED";
  if (text.includes("abort") || text.includes("timeout")) return "TIMEOUT";
  if (!text) return null;
  return "ERROR";
}

function statusErrorType(status = "") {
  const normalized = String(status || "").toUpperCase();
  if (normalized === "RATE_LIMITED") return "RATE_LIMIT";
  if (normalized === "REGION_BLOCKED") return "BLOCKED";
  if (normalized === "AUTH_REQUIRED") return "AUTH_REQUIRED";
  if (normalized === "TIMEOUT") return "TIMEOUT";
  if (normalized === "FAILED") return "ERROR";
  return null;
}

function cooldownHoursFor(type = null, failures = 0) {
  if (type === "RATE_LIMIT") return Math.min(12, 2 + failures);
  if (type === "BLOCKED") return 24;
  if (type === "AUTH_REQUIRED") return 24;
  if (type === "TIMEOUT") return Math.min(4, 1 + failures * 0.5);
  if (type === "ERROR") return Math.min(6, 1 + failures);
  return 0;
}

function canProbeRecoverableCooldown(source = "", state = {}) {
  if (process.env.SOURCE_ROUTER_PROBE_RECOVERABLE_COOLDOWNS === "false") return false;
  if (!RECOVERABLE_NO_KEY_PROBE_SOURCES.has(source)) return false;
  return !NON_RECOVERABLE_COOLDOWN_TYPES.has(state.lastErrorType || errorType(state.lastError));
}

function trustScore(state = {}) {
  const runs = Math.max(1, num(state.runs));
  const usefulSuccesses = num(state.usefulSuccesses || state.successes);
  const successRate = (usefulSuccesses / runs) * 100;
  const avgCandidates = num(state.totalCandidates) / runs;
  const avgDuration = num(state.totalDurationMs) / runs;
  const volumeScore = Math.min(35, Math.log10(Math.max(1, avgCandidates)) * 15);
  const speedPenalty = avgDuration > 15000 ? 12 : avgDuration > 8000 ? 6 : 0;
  const failurePenalty = Math.min(25, num(state.failures) * 4);
  const emptyPenalty = Math.min(25, num(state.emptyResponses) * 3);

  return Math.round(Math.max(0, Math.min(100, successRate * 0.55 + volumeScore + 15 - speedPenalty - failurePenalty - emptyPenalty)));
}

export function getSourceRoutingPlan(options = {}) {
  const memory = options.memory || readMemory();
  const now = Date.now();
  const disabled = new Set(
    String(process.env.DISABLED_DISCOVERY_SOURCES || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
  );
  const sources = CORE_SOURCE_NAMES.map((source) => {
    const state = sourceState(memory, source);
    const coolingDown = isCoolingDown(state, now);
    const disabledByEnv = disabled.has(source);
    const score = trustScore(state);
    let decision = "RUN";
    const reasons = [];

    if (disabledByEnv) {
      decision = "SKIP";
      reasons.push("disabled by DISABLED_DISCOVERY_SOURCES");
    } else if (coolingDown && !canProbeRecoverableCooldown(source, state)) {
      decision = "COOLDOWN";
      reasons.push(`cooling down until ${state.cooldownUntil}`);
    } else if (coolingDown) {
      reasons.push(`probing recoverable cooldown from ${state.lastErrorType || errorType(state.lastError) || "transient error"}`);
    } else if (state.runs >= 3 && score < 20 && state.failures + num(state.emptyResponses) >= num(state.usefulSuccesses || state.successes) + 2) {
      decision = "DEPRIORITIZE";
      reasons.push("low historical reliability");
    } else if (state.runs === 0) {
      reasons.push("no history yet");
    } else {
      reasons.push(`trust score ${score}`);
    }

    return {
      source,
      decision,
      trustScore: score,
      cooldownUntil: state.cooldownUntil || null,
      lastStatus: state.lastStatus || "UNKNOWN",
      lastError: state.lastError || null,
      runs: state.runs || 0,
      successes: state.successes || 0,
      usefulSuccesses: state.usefulSuccesses || 0,
      emptyResponses: state.emptyResponses || 0,
      failures: state.failures || 0,
      reasons,
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    memoryFile: MEMORY_FILE,
    sources,
    run: sources.filter((source) => source.decision === "RUN" || source.decision === "DEPRIORITIZE").map((source) => source.source),
    skipped: sources.filter((source) => source.decision === "SKIP" || source.decision === "COOLDOWN"),
    prioritized: sources
      .filter((source) => source.decision === "RUN")
      .sort((a, b) => b.trustScore - a.trustScore)
      .map((source) => source.source),
  };
}

export function shouldRunSource(plan = {}, sourceName = "") {
  const source = (plan.sources || []).find((item) => item.source === sourceName);
  if (!source) return true;
  return !["SKIP", "COOLDOWN"].includes(source.decision);
}

function updateState(previous = {}, result = {}) {
  const status = result.status || "UNKNOWN";
  const normalizedStatus = String(status || "UNKNOWN").toUpperCase();
  const candidates = num(result.candidates);
  const durationMs = num(result.durationMs);
  const usefulSuccess =
    normalizedStatus === "SUCCESS_WITH_DATA" ||
    normalizedStatus === "USED" && candidates > 0 ||
    normalizedStatus === "HEALTHY" && candidates > 0 ||
    normalizedStatus === "SUCCESS" && candidates > 0;
  const emptySuccess =
    normalizedStatus === "SUCCESS_EMPTY" ||
    (["SUCCESS", "HEALTHY", "OK"].includes(normalizedStatus) && candidates === 0);
  const type = statusErrorType(normalizedStatus) || errorType(result.error);
  const failed = Boolean(type) && !emptySuccess;
  const failures = failed ? num(previous.failures) + 1 : num(previous.failures);
  const cooldownHours = failed ? cooldownHoursFor(type, failures) : 0;
  const cooldownUntil = failed && cooldownHours > 0
    ? new Date(Date.now() + cooldownHours * 60 * 60 * 1000).toISOString()
    : null;

  return {
    source: result.source,
    runs: num(previous.runs) + 1,
    successes: num(previous.successes) + (usefulSuccess || emptySuccess ? 1 : 0),
    usefulSuccesses: num(previous.usefulSuccesses || previous.successes) + (usefulSuccess ? 1 : 0),
    emptyResponses: num(previous.emptyResponses) + (emptySuccess ? 1 : 0),
    failures,
    totalCandidates: num(previous.totalCandidates) + candidates,
    totalDurationMs: num(previous.totalDurationMs) + durationMs,
    lastStatus: status,
    lastError: failed ? result.error || status : null,
    lastErrorType: type,
    lastCandidateCount: candidates,
    lastDurationMs: durationMs,
    lastRunAt: new Date().toISOString(),
    cooldownUntil,
  };
}

export function saveSourceRoutingOutcome(discovery = {}, options = {}) {
  const memory = options.memory || readMemory();
  const reports = discovery.sourceReports || {};
  const sourceResults = {
    dexscreener: reports.dexscreener,
    geckoterminal: reports.geckoterminal,
    coingecko: reports.coingecko,
    birdeye: reports.birdeye,
    freeMarketData: reports.freeMarketData,
    expandedMarketData: reports.expandedMarketData,
    googleNewsDiscovery: reports.googleNewsDiscovery,
    githubProjectDiscovery: reports.githubProjectDiscovery,
    nativeDiscoveryMesh: reports.nativeDiscoveryMesh,
    researchSeeds: reports.researchSeeds,
    aiDiscoverySwarm: reports.aiDiscoverySwarm,
    candidateRescue: reports.candidateRescue,
  };

  for (const [source, report] of Object.entries(sourceResults)) {
    if (!report || ["SKIPPED", "DISABLED"].includes(report.status)) continue;

    const previous = sourceState(memory, source);
    const candidates = num(report.scannedTokens ?? report.discoveredTokens ?? report.report?.addedCount);
    memory.sources[source] = updateState(previous, {
      source,
      status: report.status || "UNKNOWN",
      error: report.error || null,
      candidates,
      durationMs: report.durationMs || 0,
    });
  }

  memory.runs = [
    ...(memory.runs || []),
    {
      scannedAt: discovery.scannedAt || new Date().toISOString(),
      mode: discovery.mode || "unknown",
      rawCount: discovery.rawCount || 0,
      dedupedCount: discovery.dedupedCount || 0,
      acceptedCount: discovery.acceptedCount || 0,
      candidateRescueCount: discovery.candidateRescueCount || 0,
      seedSupplementCount: discovery.seedSupplementCount || 0,
    },
  ].slice(-MAX_RUNS);

  writeMemory(memory);

  return summarizeSourceRouter(memory);
}

export function summarizeSourceRouter(memory = readMemory()) {
  const sources = CORE_SOURCE_NAMES.map((source) => {
    const state = sourceState(memory, source);
    return {
      source,
      trustScore: trustScore(state),
      runs: state.runs || 0,
      successes: state.successes || 0,
      failures: state.failures || 0,
      lastStatus: state.lastStatus || "UNKNOWN",
      lastError: state.lastError || null,
      lastCandidateCount: state.lastCandidateCount || 0,
      cooldownUntil: state.cooldownUntil || null,
    };
  }).sort((a, b) => b.trustScore - a.trustScore);

  return {
    generatedAt: new Date().toISOString(),
    memoryFile: MEMORY_FILE,
    runs: (memory.runs || []).length,
    strongestSources: sources.slice(0, 6),
    weakestSources: sources.slice(-6).reverse(),
    sources,
  };
}

export function writeSourceRouterReport() {
  const reportsDir = path.resolve("reports");
  fs.mkdirSync(reportsDir, { recursive: true });
  const report = summarizeSourceRouter();
  const filePath = path.join(reportsDir, "source-router.json");
  fs.writeFileSync(filePath, JSON.stringify(report, null, 2));
  return { filePath, report };
}

export const __adaptiveSourceRouterTestHooks = {
  canProbeRecoverableCooldown,
  updateState,
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const { report } = writeSourceRouterReport();
  console.log(JSON.stringify(report, null, 2));
}
