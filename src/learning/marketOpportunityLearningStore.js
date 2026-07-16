import fs from "fs";
import path from "path";
import { assembleOpportunityEvidence } from "../opportunity/opportunityEvidenceAssembler.js";

const DATA_DIR = path.resolve("data");
const MEMORY_FILE = path.join(DATA_DIR, "market-opportunity-learning.json");
const MAX_RECORDS = Number(process.env.MAX_MARKET_OPPORTUNITY_LEARNING_RECORDS || 50000);

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

function clampReturn(value = 0) {
  return Math.max(-100, Math.min(2500, num(value)));
}

function ensureDataDir(filePath = MEMORY_FILE) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function hoursBetween(start = "", end = "") {
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return 0;
  return Math.max(0, (endMs - startMs) / (60 * 60 * 1000));
}

function marketValue(project = {}, keys = []) {
  for (const key of keys) {
    const value = key.split(".").reduce((current, part) => current?.[part], project);
    if (Number.isFinite(Number(value)) && Number(value) > 0) return Number(value);
  }
  return 0;
}

function priceUsd(project = {}) {
  return marketValue(project, ["priceUsd", "price", "market.priceUsd", "latestPriceUsd"]);
}

function liquidityUsd(project = {}) {
  return marketValue(project, ["liquidityUsd", "liquidity", "market.liquidityUsd", "latestLiquidityUsd"]);
}

function marketCapUsd(project = {}) {
  return marketValue(project, ["marketCap", "fdv", "market.marketCap", "market.fdv"]);
}

function returnPct(entry = 0, current = 0) {
  if (entry <= 0 || current <= 0) return null;
  return Math.round(clampReturn(((current - entry) / entry) * 100));
}

function projectRecord(project = {}) {
  return project.opportunityEvidenceRecord || assembleOpportunityEvidence(project);
}

function projectKey(project = {}) {
  return String(projectRecord(project).projectKey || `${project.chain || "unknown"}:${project.symbol || project.name || "unknown"}`).toLowerCase();
}

function compactSignal(signal = {}) {
  return {
    type: signal.type || "UNKNOWN",
    label: signal.label || "Signal",
    score: Math.round(clamp(signal.score)),
    sourceEngine: signal.sourceEngine || "unknown",
  };
}

function compactRisk(risk = {}) {
  return {
    label: risk.label || String(risk),
    family: risk.family || "UNKNOWN",
    score: Math.round(clamp(risk.score || 50)),
  };
}

function marketSnapshot(project = {}, at = new Date().toISOString()) {
  return {
    observedAt: at,
    priceUsd: priceUsd(project),
    liquidityUsd: liquidityUsd(project),
    marketCapUsd: marketCapUsd(project),
  };
}

function signalFamilies(record = {}, project = {}) {
  const families = new Set();
  for (const signal of safeArray(record.signals)) {
    if (signal.type) families.add(String(signal.type));
  }
  for (const family of safeArray(record.evidenceFamilies)) {
    if (family.family) families.add(String(family.family).toUpperCase());
  }
  for (const hint of [
    ["TIMING", project.opportunityTimingScore],
    ["ATTENTION_GAP", project.attentionGapScore],
    ["LIQUIDITY", project.liquidityExpansionScore || project.activeLiquidityTruthScore],
    ["DEVELOPMENT", project.developerActivityScore || project.githubProScore],
    ["SMART_MONEY", project.smartWalletArrivalScore || project.smartMoneyAccumulationScore],
    ["CATALYST", project.liveCatalystRadarScore || project.roadmapCatalystProfitScore],
    ["SOURCE_TRUTH", project.sourceTruthScore],
  ]) {
    if (num(hint[1]) >= 55) families.add(hint[0]);
  }
  return [...families].slice(0, 14);
}

function latestRecordFor(memory = {}, key = "") {
  return [...safeArray(memory.records)]
    .filter((record) => record.projectKey === key)
    .sort((a, b) => new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime())[0] || null;
}

function outcomeLabel(record = {}) {
  if (safeArray(record.currentHardBlocks).length) return "Invalidated";
  if (record.latestReturnPct == null) return "Pending";
  if (num(record.maxRisePct) >= 100) return "Breakout Winner";
  if (num(record.latestReturnPct) >= 35) return "Winner";
  if (num(record.latestReturnPct) >= 15) return "Constructive";
  if (num(record.maxDrawdownPct) <= -40 || num(record.latestReturnPct) <= -35) return "Major Loser";
  if (num(record.latestReturnPct) <= -15) return "Loser";
  return "Flat";
}

function minimumHorizonHours(horizon = "") {
  if (String(horizon).includes("24_72")) return 24;
  if (String(horizon).includes("7_14")) return 7 * 24;
  if (String(horizon).includes("30_90")) return 30 * 24;
  return 24;
}

function isEvaluated(record = {}, now = new Date().toISOString()) {
  if (record.latestReturnPct == null) return false;
  if (Math.abs(num(record.latestReturnPct)) >= 20) return true;
  if (safeArray(record.currentHardBlocks).length) return true;
  return hoursBetween(record.openedAt, now) >= minimumHorizonHours(record.recommendedHorizon);
}

function createRecord(project = {}, rank = 1, now = new Date().toISOString()) {
  const record = projectRecord(project);
  const snapshot = marketSnapshot(project, now);
  const signals = safeArray(record.signals).map(compactSignal).slice(0, 12);
  const risks = safeArray(record.risks).map(compactRisk).slice(0, 10);
  const key = String(record.projectKey || projectKey(project)).toLowerCase();

  return {
    id: `${key}:${now}:${rank}`,
    projectKey: key,
    name: record.identity?.name || project.name || "Unknown",
    symbol: record.identity?.symbol || project.symbol || "UNKNOWN",
    chain: record.identity?.chain || project.chain || "unknown",
    openedAt: now,
    updatedAt: now,
    rankAtPrediction: rank,
    marketOpportunityRankAtPrediction: Math.round(clamp(project.marketOpportunityRank)),
    recommendedHorizon: record.timeHorizons?.recommended || project.recommendedHorizon || "RESEARCH_ONLY",
    opportunityLane: record.opportunityLane || project.opportunityLane || "MONITOR",
    scores: {
      opportunity: num(record.scores?.opportunity),
      timing: num(record.scores?.timing || project.opportunityTimingScore),
      trust: num(record.scores?.trust || project.trustScore),
      attentionGap: num(record.scores?.attentionGap || project.attentionGapScore),
      marketOpportunityRank: num(record.scores?.marketOpportunityRank || project.marketOpportunityRank),
      localAIConsensus: num(record.scores?.localAIConsensus || project.localAIConsensusScore),
      evidenceCoverage: num(record.scores?.evidenceCoverage || project.opportunityEvidenceCoverage),
    },
    sourceCoverage: record.sourceCoverage || {},
    signalFamilies: signalFamilies(record, project),
    signals,
    risks,
    hardBlocks: safeArray(record.hardBlocks),
    missingEvidence: safeArray(record.missingEvidence).slice(0, 10),
    thesis:
      project.marketOpportunityRankDrivers?.slice(0, 6) ||
      signals.map((signal) => `${signal.label}: ${signal.score}`).slice(0, 6),
    invalidationConditions: safeArray(project.invalidationConditions).slice(0, 8),
    initial: snapshot,
    latest: snapshot,
    observations: [
      {
        ...snapshot,
        returnPct: 0,
        liquidityChangePct: 0,
      },
    ],
    latestReturnPct: snapshot.priceUsd > 0 ? 0 : null,
    liquidityChangePct: snapshot.liquidityUsd > 0 ? 0 : null,
    maxRisePct: 0,
    maxDrawdownPct: 0,
    currentHardBlocks: [],
    outcomeStatus: "Pending",
    outcomeLabel: "Pending",
    evaluated: false,
  };
}

function updateRecord(record = {}, project = {}, now = new Date().toISOString()) {
  const snapshot = marketSnapshot(project, now);
  const latestReturn = returnPct(num(record.initial?.priceUsd), snapshot.priceUsd);
  const liquidityChange = returnPct(num(record.initial?.liquidityUsd), snapshot.liquidityUsd);
  const currentHardBlocks = [
    ...safeArray(project.opportunityHardBlockers),
    ...safeArray(project.hardBlockers),
    ...safeArray(project.finalBlockingReasons),
    ...safeArray(project.sniperBlockingReasons),
  ].filter(Boolean);

  const observation = {
    ...snapshot,
    returnPct: latestReturn,
    liquidityChangePct: liquidityChange,
  };
  const observations = [...safeArray(record.observations), observation].slice(-120);
  const updated = {
    ...record,
    updatedAt: now,
    latest: snapshot,
    observations,
    latestReturnPct: latestReturn,
    liquidityChangePct: liquidityChange,
    maxRisePct: latestReturn == null ? num(record.maxRisePct) : Math.max(num(record.maxRisePct), latestReturn),
    maxDrawdownPct: latestReturn == null ? num(record.maxDrawdownPct) : Math.min(num(record.maxDrawdownPct), latestReturn),
    currentHardBlocks,
  };

  updated.outcomeLabel = outcomeLabel(updated);
  updated.evaluated = isEvaluated(updated, now);
  updated.outcomeStatus = updated.evaluated ? "Evaluated" : "Pending";
  return updated;
}

function defaultMemory() {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    records: [],
  };
}

export function loadMarketOpportunityLearningStore(filePath = MEMORY_FILE) {
  ensureDataDir(filePath);
  if (!fs.existsSync(filePath)) return defaultMemory();

  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return {
      version: parsed.version || 1,
      updatedAt: parsed.updatedAt || new Date().toISOString(),
      records: safeArray(parsed.records),
    };
  } catch {
    return defaultMemory();
  }
}

export function saveMarketOpportunityLearningStore(memory = defaultMemory(), filePath = MEMORY_FILE) {
  ensureDataDir(filePath);
  const saved = {
    version: 1,
    updatedAt: new Date().toISOString(),
    records: safeArray(memory.records).slice(-MAX_RECORDS),
  };
  fs.writeFileSync(filePath, JSON.stringify(saved, null, 2));
  return saved;
}

export function evaluateMarketOpportunityOutcomes(projects = [], options = {}) {
  const filePath = options.filePath || MEMORY_FILE;
  const now = options.now || new Date().toISOString();
  const memory = options.memory || loadMarketOpportunityLearningStore(filePath);
  const byKey = new Map((Array.isArray(projects) ? projects : []).map((project) => [projectKey(project), project]));
  let evaluated = 0;
  let updated = 0;

  memory.records = safeArray(memory.records).map((record) => {
    const project = byKey.get(record.projectKey);
    if (!project) return record;
    const next = updateRecord(record, project, now);
    if (next.evaluated) evaluated += 1;
    updated += 1;
    return next;
  });
  memory.updatedAt = now;

  if (options.save !== false) saveMarketOpportunityLearningStore(memory, filePath);
  return { memory, evaluated, updated };
}

export function recordMarketOpportunitySnapshot(projects = [], options = {}) {
  const filePath = options.filePath || MEMORY_FILE;
  const now = options.now || new Date().toISOString();
  const topN = Math.max(1, Number(options.topN || 5));
  const minHoursBetweenSnapshots = Number(options.minHoursBetweenSnapshots ?? 12);
  const ranked = [...(Array.isArray(projects) ? projects : [])]
    .filter((project) => num(project.marketOpportunityRank) > 0)
    .sort((a, b) => num(b.marketOpportunityRank) - num(a.marketOpportunityRank));
  const { memory } = evaluateMarketOpportunityOutcomes(ranked, { filePath, now, save: false });
  let opened = 0;
  let skippedRecent = 0;

  ranked.slice(0, topN).forEach((project, index) => {
    const key = projectKey(project);
    const latest = latestRecordFor(memory, key);
    if (latest && hoursBetween(latest.openedAt, now) < minHoursBetweenSnapshots) {
      skippedRecent += 1;
      return;
    }
    memory.records.push(createRecord(project, index + 1, now));
    opened += 1;
  });

  memory.records = safeArray(memory.records).slice(-MAX_RECORDS);
  memory.updatedAt = now;
  saveMarketOpportunityLearningStore(memory, filePath);

  return {
    file: filePath,
    opened,
    updated: ranked.length,
    skippedRecent,
    totalRecords: memory.records.length,
  };
}

function statsFor(records = [], field = "") {
  const evaluated = records.filter((record) => record.evaluated && record.latestReturnPct != null);
  const avgReturnPct = evaluated.length
    ? Math.round(evaluated.reduce((sum, record) => sum + num(record.latestReturnPct), 0) / evaluated.length)
    : 0;
  const winners = evaluated.filter((record) => num(record.latestReturnPct) >= 20).length;
  const losers = evaluated.filter((record) => num(record.latestReturnPct) <= -15 || safeArray(record.currentHardBlocks).length).length;
  const winRate = evaluated.length ? Math.round((winners / evaluated.length) * 100) : 0;
  const lossRate = evaluated.length ? Math.round((losers / evaluated.length) * 100) : 0;

  return {
    id: field,
    samples: records.length,
    evaluated: evaluated.length,
    winners,
    losers,
    winRate,
    lossRate,
    avgReturnPct,
    score: Math.round(clamp(50 + avgReturnPct * 0.35 + (winRate - 50) * 0.25 - lossRate * 0.2)),
  };
}

function groupedStats(records = [], keyFn = () => "unknown") {
  const groups = new Map();
  for (const record of records) {
    for (const key of safeArray(keyFn(record))) {
      if (!key) continue;
      groups.set(key, [...(groups.get(key) || []), record]);
    }
  }
  return [...groups.entries()]
    .map(([key, values]) => statsFor(values, key))
    .sort((a, b) => b.score - a.score || b.evaluated - a.evaluated);
}

function scoreBucket(score = 0) {
  if (num(score) >= 75) return "HIGH";
  if (num(score) >= 55) return "MEDIUM";
  return "LOW";
}

function weightHintsFromStats(signalFamilyStats = [], horizonStats = []) {
  const hints = [];
  for (const stat of [...signalFamilyStats, ...horizonStats]) {
    if (stat.evaluated < 3) {
      hints.push({
        family: stat.id,
        action: "collect_more_outcomes",
        confidence: "LOW_SAMPLE",
        samples: stat.evaluated,
        reason: "Not enough evaluated receipts to change trust yet.",
      });
      continue;
    }
    if (stat.score >= 62) {
      hints.push({
        family: stat.id,
        action: "increase_weight_carefully",
        confidence: stat.evaluated >= 10 ? "DEVELOPING" : "LOW_SAMPLE",
        samples: stat.evaluated,
        reason: `${stat.id} averaged ${stat.avgReturnPct}% with ${stat.winRate}% win rate.`,
      });
    } else if (stat.score <= 42) {
      hints.push({
        family: stat.id,
        action: "decrease_weight_or_red_team",
        confidence: stat.evaluated >= 10 ? "DEVELOPING" : "LOW_SAMPLE",
        samples: stat.evaluated,
        reason: `${stat.id} averaged ${stat.avgReturnPct}% with ${stat.lossRate}% loss rate.`,
      });
    }
  }
  return hints.slice(0, 20);
}

export function summarizeMarketOpportunityLearning(projects = [], options = {}) {
  const filePath = options.filePath || MEMORY_FILE;
  const now = options.now || new Date().toISOString();
  const memory = options.memory || loadMarketOpportunityLearningStore(filePath);
  const byKey = new Map((Array.isArray(projects) ? projects : []).map((project) => [projectKey(project), project]));
  const records = safeArray(memory.records).map((record) => {
    const project = byKey.get(record.projectKey);
    return project ? updateRecord(record, project, now) : record;
  });
  const evaluated = records.filter((record) => record.evaluated);
  const pending = records.filter((record) => !record.evaluated);
  const signalFamilyStats = groupedStats(records, (record) => record.signalFamilies || []);
  const horizonStats = groupedStats(records, (record) => [record.recommendedHorizon || "RESEARCH_ONLY"]);
  const timingStats = groupedStats(records, (record) => [`TIMING_${scoreBucket(record.scores?.timing)}`]);
  const attentionGapStats = groupedStats(records, (record) => [`ATTENTION_GAP_${scoreBucket(record.scores?.attentionGap)}`]);
  const localAIStats = groupedStats(records, (record) => [`LOCAL_AI_${scoreBucket(record.scores?.localAIConsensus)}`]);

  return {
    generatedAt: now,
    file: filePath,
    records: records.length,
    pending: pending.length,
    evaluated: evaluated.length,
    winners: evaluated.filter((record) => num(record.latestReturnPct) >= 20).length,
    losers: evaluated.filter((record) => num(record.latestReturnPct) <= -15 || safeArray(record.currentHardBlocks).length).length,
    averageReturnPct: evaluated.length
      ? Math.round(evaluated.reduce((sum, record) => sum + num(record.latestReturnPct), 0) / evaluated.length)
      : 0,
    latestReceipts: [...records]
      .sort((a, b) => new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime())
      .slice(0, 20)
      .map((record) => ({
        projectKey: record.projectKey,
        symbol: record.symbol,
        openedAt: record.openedAt,
        rankAtPrediction: record.rankAtPrediction,
        marketOpportunityRankAtPrediction: record.marketOpportunityRankAtPrediction,
        recommendedHorizon: record.recommendedHorizon,
        latestReturnPct: record.latestReturnPct,
        liquidityChangePct: record.liquidityChangePct,
        outcomeLabel: record.outcomeLabel,
        evaluated: record.evaluated,
      })),
    horizonStats,
    signalFamilyStats,
    timingStats,
    attentionGapStats,
    localAIStats,
    weightHints: weightHintsFromStats(signalFamilyStats, horizonStats),
    disclaimer: "Learning receipts are research accountability only. They are not financial advice or profit guarantees.",
  };
}

export function marketOpportunityLearningFilePath() {
  return MEMORY_FILE;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(JSON.stringify(summarizeMarketOpportunityLearning(), null, 2));
}
