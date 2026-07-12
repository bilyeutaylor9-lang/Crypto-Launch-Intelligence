import fs from "fs";
import path from "path";

const DATA_DIR = path.resolve("data");
const MEMORY_FILE = path.join(DATA_DIR, "strategy-memory.json");
const MAX_RECORDS = Number(process.env.MAX_STRATEGY_MEMORY_RECORDS || 25000);

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
      updatedAt: new Date().toISOString(),
      records: [],
    };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(MEMORY_FILE, "utf8"));
    return {
      version: parsed.version || 1,
      updatedAt: parsed.updatedAt || new Date().toISOString(),
      records: Array.isArray(parsed.records) ? parsed.records : [],
    };
  } catch {
    return {
      version: 1,
      updatedAt: new Date().toISOString(),
      records: [],
    };
  }
}

function writeMemory(memory = {}) {
  ensureDataDir();
  fs.writeFileSync(
    MEMORY_FILE,
    JSON.stringify(
      {
        version: 1,
        updatedAt: new Date().toISOString(),
        records: (memory.records || []).slice(-MAX_RECORDS),
      },
      null,
      2
    )
  );
}

function projectId(project = {}) {
  return String(
    project.address ||
      project.tokenAddress ||
      project.pairAddress ||
      `${project.chain || "unknown"}:${project.symbol || project.name || "unknown"}`
  ).toLowerCase();
}

function compactStrategy(project = {}) {
  const best = project.autonomousStrategyLab?.bestStrategy || project.bestAutonomousStrategy || {};

  return {
    id: projectId(project),
    name: project.name || "Unknown",
    symbol: project.symbol || "UNKNOWN",
    chain: project.chain || "unknown",
    scannedAt: new Date().toISOString(),
    strategyId: best.id || "none",
    strategyName: best.name || "No Strategy",
    verdict: project.strategyLabVerdict || "No Strategy",
    score: num(project.strategyLabScore),
    readiness: num(project.strategyReadinessPct),
    paperTradeScore: num(project.paperTradeScore),
    causalAlphaScore: num(project.causalAlphaScore),
    alphaOSScore: num(project.autonomousAlphaOSScore),
    alphaOSVerdict: project.autonomousAlphaOSVerdict || "Unknown",
    expectedReturn30dPct: num(project.expectedReturn30dPct),
    breakoutProbability30d: num(project.breakoutProbability30d),
    bearCaseDrawdownPct: num(project.bearCaseDrawdownPct),
    trapRiskScore: num(project.trapRiskScore),
    proofScore: num(project.proofScore),
    dataConfidenceScore: num(project.dataConfidenceScore),
    sourceReliabilityScore: num(project.sourceReliabilityScore),
    entryTriggers: project.paperTradingPlan?.entryTriggers || [],
    invalidationRules: project.paperTradingPlan?.invalidationRules || [],
  };
}

export function loadStrategyMemory() {
  return readMemory();
}

export function saveStrategyMemory(projects = []) {
  const memory = readMemory();
  const records = (Array.isArray(projects) ? projects : [])
    .filter((project) => project.autonomousStrategyLab || project.autonomousAlphaOS)
    .map(compactStrategy);
  const updated = {
    ...memory,
    records: [...memory.records, ...records].slice(-MAX_RECORDS),
  };

  writeMemory(updated);

  return {
    saved: records.length,
    totalRecords: updated.records.length,
    file: MEMORY_FILE,
  };
}

export function summarizeStrategyMemory(records = null) {
  const memoryRecords = Array.isArray(records) ? records : readMemory().records;
  const strategies = new Map();

  for (const record of memoryRecords) {
    const key = record.strategyId || "none";
    const current = strategies.get(key) || {
      id: key,
      name: record.strategyName || "Unknown",
      observations: 0,
      avgScore: 0,
      avgReadiness: 0,
      avgPaperTradeScore: 0,
      avgCausalAlphaScore: 0,
      avgAlphaOSScore: 0,
      promoted: 0,
      paperOnly: 0,
      rejected: 0,
    };
    const observations = current.observations + 1;

    strategies.set(key, {
      ...current,
      name: record.strategyName || current.name,
      observations,
      avgScore: Math.round((current.avgScore * current.observations + num(record.score)) / observations),
      avgReadiness: Math.round((current.avgReadiness * current.observations + num(record.readiness)) / observations),
      avgPaperTradeScore: Math.round(
        (current.avgPaperTradeScore * current.observations + num(record.paperTradeScore)) / observations
      ),
      avgCausalAlphaScore: Math.round(
        (current.avgCausalAlphaScore * current.observations + num(record.causalAlphaScore)) / observations
      ),
      avgAlphaOSScore: Math.round(
        (current.avgAlphaOSScore * current.observations + num(record.alphaOSScore)) / observations
      ),
      promoted:
        current.promoted +
        (/strong|priority|promote/i.test(record.alphaOSVerdict || record.verdict || "") ? 1 : 0),
      paperOnly:
        current.paperOnly +
        (/paper|watch/i.test(record.alphaOSVerdict || record.verdict || "") ? 1 : 0),
      rejected:
        current.rejected +
        (/reject|avoid|block/i.test(record.alphaOSVerdict || record.verdict || "") ? 1 : 0),
    });
  }

  const strategySummaries = [...strategies.values()]
    .map((strategy) => ({
      ...strategy,
      promotionRate:
        strategy.observations > 0
          ? Math.round((strategy.promoted / strategy.observations) * 100)
          : 0,
      status:
        strategy.observations >= 20 && strategy.avgAlphaOSScore >= 68
          ? "Learning Candidate"
          : strategy.observations >= 6
          ? "Paper-Tested"
          : "Cold Start",
    }))
    .sort((a, b) => b.avgAlphaOSScore - a.avgAlphaOSScore || b.observations - a.observations);

  return {
    file: MEMORY_FILE,
    totalRecords: memoryRecords.length,
    strategyCount: strategySummaries.length,
    strategies: strategySummaries,
    bestStrategy: strategySummaries[0] || null,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(JSON.stringify(summarizeStrategyMemory(), null, 2));
}
