import fs from "fs";
import path from "path";

const DATA_DIR = path.resolve("data");
const MEMORY_FILE = path.join(DATA_DIR, "paper-trading-outcomes.json");
const MAX_RECORDS = Number(process.env.MAX_PAPER_TRADING_RECORDS || 50000);

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clamp(value = 0, min = -100, max = 1000) {
  return Math.max(min, Math.min(max, num(value)));
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

function strategyId(project = {}) {
  return String(
    project.bestAutonomousStrategy?.id ||
      project.autonomousStrategyLab?.bestStrategy?.id ||
      project.alphaLabBestStrategy?.id ||
      "no_strategy"
  );
}

function priceOf(project = {}) {
  return num(project.priceUsd ?? project.price ?? project.market?.priceUsd);
}

function openSignal(project = {}) {
  return [
    "OS Strong Buy Research Candidate",
    "OS Best Available Candidate",
    "OS Priority Research",
    "OS Paper Trade",
    "Paper Strong Buy Candidate",
    "Priority Paper Trade",
  ].includes(project.autonomousAlphaOSVerdict || project.strategyLabVerdict);
}

function daysBetween(start = "", end = "") {
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();

  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return 0;
  return Math.max(0, Math.floor((endMs - startMs) / (24 * 60 * 60 * 1000)));
}

function returnPct(entry = 0, current = 0) {
  if (entry <= 0 || current <= 0) return 0;
  return Math.round(clamp(((current - entry) / entry) * 100, -100, 1000));
}

function outcomeLabel(record = {}) {
  const latest = num(record.latestReturnPct);
  const daysOpen = num(record.daysOpen);

  if (daysOpen < 1) return "Open";
  if (latest >= 50) return "Breakout Winner";
  if (latest >= 20) return "Winner";
  if (latest <= -35) return "Major Loser";
  if (latest <= -15) return "Loser";
  if (latest >= 5) return "Small Winner";
  if (latest <= -5) return "Small Loser";
  return "Flat";
}

function createRecord(project = {}, now = new Date().toISOString()) {
  const price = priceOf(project);

  return {
    id: projectId(project),
    name: project.name || "Unknown",
    symbol: project.symbol || "UNKNOWN",
    chain: project.chain || "unknown",
    strategyId: strategyId(project),
    strategyName:
      project.bestAutonomousStrategy?.name ||
      project.autonomousStrategyLab?.bestStrategy?.name ||
      project.alphaLabBestStrategy?.name ||
      "No Strategy",
    openedAt: now,
    updatedAt: now,
    entryPriceUsd: price,
    latestPriceUsd: price,
    latestReturnPct: 0,
    daysOpen: 0,
    outcomeLabel: "Open",
    alphaOSVerdict: project.autonomousAlphaOSVerdict || "Unknown",
    alphaOSScore: num(project.autonomousAlphaOSScore),
    causalAlphaScore: num(project.causalAlphaScore),
    strategyLabScore: num(project.strategyLabScore),
    paperTradeScore: num(project.paperTradeScore),
    proofScore: num(project.proofScore),
    sourceTruthScore: num(project.sourceTruthScore),
    githubProScore: num(project.githubProScore),
    riskScore: Math.max(
      num(project.trapRiskScore),
      num(project.riskScore),
      num(project.sellPressureScore),
      num(project.tokenUnlockRiskScore),
      num(project.vestingPressureScore)
    ),
    expectedReturn30dPct: num(project.expectedReturn30dPct),
    breakoutProbability30d: num(project.breakoutProbability30d),
    entryTriggers: project.paperTradingPlan?.entryTriggers || [],
    invalidationRules: project.paperTradingPlan?.invalidationRules || [],
    checkpoints: {
      "1d": null,
      "7d": null,
      "30d": null,
      "90d": null,
    },
  };
}

function updateRecord(record = {}, project = {}, now = new Date().toISOString()) {
  const currentPrice = priceOf(project) || num(record.latestPriceUsd);
  const daysOpen = daysBetween(record.openedAt, now);
  const latestReturn = returnPct(num(record.entryPriceUsd), currentPrice);
  const checkpoints = { ...(record.checkpoints || {}) };

  for (const horizon of [1, 7, 30, 90]) {
    const key = `${horizon}d`;
    if (daysOpen >= horizon && !checkpoints[key]) {
      checkpoints[key] = {
        checkedAt: now,
        priceUsd: currentPrice,
        returnPct: latestReturn,
        label: outcomeLabel({ latestReturnPct: latestReturn, daysOpen }),
      };
    }
  }

  const updated = {
    ...record,
    name: project.name || record.name,
    symbol: project.symbol || record.symbol,
    chain: project.chain || record.chain,
    updatedAt: now,
    latestPriceUsd: currentPrice,
    latestReturnPct: latestReturn,
    daysOpen,
    outcomeLabel: outcomeLabel({ latestReturnPct: latestReturn, daysOpen }),
    latestAlphaOSVerdict: project.autonomousAlphaOSVerdict || record.latestAlphaOSVerdict || record.alphaOSVerdict,
    latestAlphaOSScore: num(project.autonomousAlphaOSScore || record.latestAlphaOSScore),
    latestRiskScore: Math.max(
      num(project.trapRiskScore),
      num(project.riskScore),
      num(project.sellPressureScore),
      num(project.tokenUnlockRiskScore),
      num(project.vestingPressureScore),
      num(record.latestRiskScore)
    ),
    checkpoints,
  };

  return updated;
}

export function loadPaperTradingOutcomes() {
  return readMemory();
}

export function savePaperTradingOutcomes(projects = []) {
  const memory = readMemory();
  const now = new Date().toISOString();
  const byKey = new Map(
    (memory.records || []).map((record) => [`${record.id}:${record.strategyId}`, record])
  );
  let opened = 0;
  let updated = 0;

  for (const project of Array.isArray(projects) ? projects : []) {
    if (!openSignal(project)) continue;

    const key = `${projectId(project)}:${strategyId(project)}`;
    const existing = byKey.get(key);

    if (existing) {
      byKey.set(key, updateRecord(existing, project, now));
      updated += 1;
    } else {
      byKey.set(key, createRecord(project, now));
      opened += 1;
    }
  }

  const records = [...byKey.values()].slice(-MAX_RECORDS);
  writeMemory({
    ...memory,
    records,
  });

  return {
    file: MEMORY_FILE,
    opened,
    updated,
    totalRecords: records.length,
  };
}

export function summarizePaperTradingOutcomes(records = null) {
  const memoryRecords = Array.isArray(records) ? records : readMemory().records;
  const closedOrAged = memoryRecords.filter((record) => num(record.daysOpen) >= 1);
  const winners = closedOrAged.filter((record) => num(record.latestReturnPct) > 5);
  const losers = closedOrAged.filter((record) => num(record.latestReturnPct) < -5);
  const strategyMap = new Map();

  for (const record of memoryRecords) {
    const key = record.strategyId || "no_strategy";
    const current = strategyMap.get(key) || {
      id: key,
      name: record.strategyName || "No Strategy",
      observations: 0,
      evaluated: 0,
      winners: 0,
      losers: 0,
      avgReturnPct: 0,
      avgAlphaOSScore: 0,
      avgRiskScore: 0,
    };
    const observations = current.observations + 1;
    const evaluated = current.evaluated + (num(record.daysOpen) >= 1 ? 1 : 0);
    const winnersCount = current.winners + (num(record.latestReturnPct) > 5 && num(record.daysOpen) >= 1 ? 1 : 0);
    const losersCount = current.losers + (num(record.latestReturnPct) < -5 && num(record.daysOpen) >= 1 ? 1 : 0);

    strategyMap.set(key, {
      ...current,
      name: record.strategyName || current.name,
      observations,
      evaluated,
      winners: winnersCount,
      losers: losersCount,
      avgReturnPct: Math.round(
        (current.avgReturnPct * current.observations + num(record.latestReturnPct)) / observations
      ),
      avgAlphaOSScore: Math.round(
        (current.avgAlphaOSScore * current.observations + num(record.alphaOSScore)) / observations
      ),
      avgRiskScore: Math.round(
        (current.avgRiskScore * current.observations + num(record.riskScore)) / observations
      ),
    });
  }

  const strategies = [...strategyMap.values()]
    .map((strategy) => ({
      ...strategy,
      winRate:
        strategy.evaluated > 0
          ? Math.round((strategy.winners / strategy.evaluated) * 100)
          : 0,
      lossRate:
        strategy.evaluated > 0
          ? Math.round((strategy.losers / strategy.evaluated) * 100)
          : 0,
      status:
        strategy.evaluated >= 20 && strategy.winners > strategy.losers
          ? "Promote"
          : strategy.evaluated >= 8
          ? "Paper-Test"
          : "Collecting",
    }))
    .sort((a, b) => b.winRate - a.winRate || b.avgReturnPct - a.avgReturnPct);

  return {
    file: MEMORY_FILE,
    totalRecords: memoryRecords.length,
    evaluatedRecords: closedOrAged.length,
    openRecords: memoryRecords.filter((record) => num(record.daysOpen) < 1).length,
    winners: winners.length,
    losers: losers.length,
    winRate:
      closedOrAged.length > 0
        ? Math.round((winners.length / closedOrAged.length) * 100)
        : 0,
    averageReturnPct:
      closedOrAged.length > 0
        ? Math.round(
            closedOrAged.reduce((sum, record) => sum + num(record.latestReturnPct), 0) /
              closedOrAged.length
          )
        : 0,
    strategies,
    topOpenTrades: [...memoryRecords]
      .sort((a, b) => num(b.alphaOSScore) - num(a.alphaOSScore))
      .slice(0, 25),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(JSON.stringify(summarizePaperTradingOutcomes(), null, 2));
}
