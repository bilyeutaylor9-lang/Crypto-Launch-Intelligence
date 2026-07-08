import fs from "fs";
import path from "path";
import { loadOutcomeSnapshots } from "./outcomeSnapshotStore.js";
import { loadScanMemory } from "./scanMemoryStore.js";

const DATA_DIR = path.resolve("data");
const CALIBRATION_FILE = path.join(DATA_DIR, "outcome-calibration.json");
const DEFAULT_HORIZONS = [1, 24, 168, 720];

export const CALIBRATED_SIGNALS = [
  { key: "marketRank", label: "Market Rank", positive: true },
  { key: "richToken", label: "Rich Token", positive: true },
  { key: "prePump", label: "Pre-Pump", positive: true },
  { key: "narrative", label: "Narrative", positive: true },
  { key: "narrativeForecast", label: "Narrative Forecast", positive: true },
  { key: "narrativeLaunchStaking", label: "Launch/Staking", positive: true },
  { key: "liquidity", label: "Liquidity", positive: true },
  { key: "liquidityExpansion", label: "Liquidity Expansion", positive: true },
  { key: "momentumShift", label: "Momentum Shift", positive: true },
  { key: "capitalFlow", label: "Capital Flow", positive: true },
  { key: "buyPressure", label: "Buy Pressure", positive: true },
  { key: "relativeStrength", label: "Relative Strength", positive: true },
  { key: "smartWalletPerformance", label: "Smart Wallet Performance", positive: true },
  { key: "smartMoneyAccumulation", label: "Smart Money Accumulation", positive: true },
  { key: "catalyst", label: "Catalyst", positive: true },
  { key: "catalystCalendar", label: "Catalyst Calendar", positive: true },
  { key: "xSocial", label: "X Social", positive: true },
  { key: "institutionalWatch", label: "Institutional Watch", positive: true },
  { key: "learningEdge", label: "Learning Edge", positive: true },
  { key: "outcomeLearning", label: "Outcome Learning", positive: true },
  { key: "signalCombination", label: "Signal Combination", positive: true },
  { key: "quantumOpportunity", label: "Quantum Opportunity", positive: true },
  { key: "sellPressure", label: "Sell Pressure", positive: false },
  { key: "stakingRisk", label: "Staking Risk", positive: false },
  { key: "risk", label: "Aggregate Risk", positive: false },
];

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

function pctChange(oldValue = 0, newValue = 0) {
  const oldNum = num(oldValue);
  const newNum = num(newValue);

  if (oldNum <= 0 || newNum <= 0) return 0;
  return ((newNum - oldNum) / oldNum) * 100;
}

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function keyOf(record = {}) {
  return String(record.key || record.id || `${record.chain || "unknown"}:${record.symbol || record.name || "unknown"}`).toLowerCase();
}

function timestampOf(item = {}) {
  return new Date(item.timestamp || item.scannedAt || 0).getTime();
}

function groupByKey(items = []) {
  const grouped = new Map();

  for (const item of items) {
    const key = keyOf(item);
    if (!key || key.includes("unknown:unknown")) continue;
    grouped.set(key, [...(grouped.get(key) || []), item]);
  }

  for (const [key, list] of grouped.entries()) {
    grouped.set(
      key,
      [...list].sort((a, b) => timestampOf(a) - timestampOf(b))
    );
  }

  return grouped;
}

function closestSnapshotAfter(snapshots = [], fromMs = 0, horizonHours = 24) {
  const targetMs = fromMs + horizonHours * 60 * 60 * 1000;
  const future = snapshots.filter((snapshot) => timestampOf(snapshot) >= targetMs);

  if (!future.length) return null;

  return future.sort(
    (a, b) => Math.abs(timestampOf(a) - targetMs) - Math.abs(timestampOf(b) - targetMs)
  )[0];
}

function labelOutcome(changePct = 0, scoreDelta = 0) {
  if (changePct >= 100 || scoreDelta >= 25) return "major_winner";
  if (changePct >= 35 || scoreDelta >= 15) return "winner";
  if (changePct >= 12 || scoreDelta >= 7) return "positive";
  if (changePct <= -35 || scoreDelta <= -20) return "major_loser";
  if (changePct <= -15 || scoreDelta <= -10) return "loser";
  return "neutral";
}

function outcomeScore(label = "neutral") {
  if (label === "major_winner") return 1;
  if (label === "winner") return 0.8;
  if (label === "positive") return 0.6;
  if (label === "neutral") return 0.45;
  if (label === "loser") return 0.2;
  return 0;
}

function buildOutcomeExamples(memory = [], snapshots = [], horizons = DEFAULT_HORIZONS) {
  const snapshotsByKey = groupByKey(snapshots);
  const examples = [];

  for (const record of memory) {
    const key = keyOf(record);
    const projectSnapshots = snapshotsByKey.get(key) || [];
    const fromMs = timestampOf(record);
    const fromPrice = num(record.market?.priceUsd);
    const fromMarketCap = num(record.market?.marketCap);
    const fromLiquidity = num(record.market?.liquidityUsd);
    const fromScore = num(record.scores?.pipeline);

    if (!fromMs || !projectSnapshots.length) continue;

    for (const horizonHours of horizons) {
      const future = closestSnapshotAfter(projectSnapshots, fromMs, horizonHours);
      if (!future) continue;

      const priceChangePct = pctChange(fromPrice, future.priceUsd);
      const marketCapChangePct = pctChange(fromMarketCap, future.marketCap);
      const liquidityChangePct = pctChange(fromLiquidity, future.liquidityUsd);
      const scoreDelta = num(future.score) - fromScore;
      const primaryChangePct =
        [priceChangePct, marketCapChangePct, liquidityChangePct]
          .filter((value) => value !== 0)
          .sort((a, b) => Math.abs(b) - Math.abs(a))[0] || scoreDelta;
      const label = labelOutcome(primaryChangePct, scoreDelta);

      examples.push({
        key,
        name: record.name || future.name || "Unknown",
        symbol: record.symbol || future.symbol || "Unknown",
        horizonHours,
        scannedAt: record.scannedAt,
        outcomeAt: future.timestamp,
        scores: record.scores || {},
        labels: record.labels || {},
        priceChangePct: Number(priceChangePct.toFixed(2)),
        marketCapChangePct: Number(marketCapChangePct.toFixed(2)),
        liquidityChangePct: Number(liquidityChangePct.toFixed(2)),
        scoreDelta: Number(scoreDelta.toFixed(2)),
        primaryChangePct: Number(primaryChangePct.toFixed(2)),
        outcomeLabel: label,
        outcomeScore: outcomeScore(label),
      });
    }
  }

  return examples;
}

function analyzeSignal(signal = {}, examples = []) {
  const triggered = examples.filter((example) => num(example.scores?.[signal.key]) >= 60);
  const notTriggered = examples.filter((example) => num(example.scores?.[signal.key]) > 0 && num(example.scores?.[signal.key]) < 60);

  if (!triggered.length) {
    return {
      ...signal,
      samples: 0,
      hitRate: 50,
      avgOutcomePct: 0,
      avgOutcomeScore: 45,
      falsePositiveRate: 0,
      reliability: 50,
      weightMultiplier: 1,
      scoreAdjustment: 0,
    };
  }

  const winnerCount = triggered.filter((example) => example.outcomeScore >= 0.6).length;
  const loserCount = triggered.filter((example) => example.outcomeScore <= 0.2).length;
  const hitRate = (winnerCount / triggered.length) * 100;
  const falsePositiveRate = (loserCount / triggered.length) * 100;
  const avgOutcomePct =
    triggered.reduce((sum, example) => sum + num(example.primaryChangePct), 0) / triggered.length;
  const avgOutcomeScore =
    triggered.reduce((sum, example) => sum + num(example.outcomeScore), 0) / triggered.length * 100;
  const baselineOutcomeScore = notTriggered.length
    ? notTriggered.reduce((sum, example) => sum + num(example.outcomeScore), 0) / notTriggered.length * 100
    : examples.reduce((sum, example) => sum + num(example.outcomeScore), 0) / Math.max(1, examples.length) * 100;
  const directionalEdge = signal.positive
    ? avgOutcomeScore - baselineOutcomeScore
    : baselineOutcomeScore - avgOutcomeScore;
  const reliability = clamp(
    50 +
      directionalEdge * 0.8 +
      (signal.positive ? hitRate - falsePositiveRate : falsePositiveRate - hitRate) * 0.25
  );
  const sampleConfidence = Math.min(1, triggered.length / 30);
  const weightMultiplier = Number(
    clamp(1 + ((reliability - 50) / 100) * sampleConfidence, 0.75, 1.25).toFixed(3)
  );
  const scoreAdjustment = Math.round(clamp((reliability - 50) * sampleConfidence * 0.24, -8, 8));

  return {
    ...signal,
    samples: triggered.length,
    hitRate: Math.round(hitRate),
    avgOutcomePct: Number(avgOutcomePct.toFixed(2)),
    avgOutcomeScore: Math.round(avgOutcomeScore),
    falsePositiveRate: Math.round(falsePositiveRate),
    reliability: Math.round(reliability),
    weightMultiplier,
    scoreAdjustment,
  };
}

function analyzeConfidence(examples = []) {
  const buckets = new Map();

  for (const example of examples) {
    const confidence = example.labels?.confidence || "Unknown";
    const current = buckets.get(confidence) || {
      confidence,
      samples: 0,
      avgOutcomePct: 0,
      hitRate: 0,
      missRate: 0,
    };
    current.samples += 1;
    current.avgOutcomePct += example.primaryChangePct;
    current.hitRate += example.outcomeScore >= 0.6 ? 1 : 0;
    current.missRate += example.outcomeScore <= 0.2 ? 1 : 0;
    buckets.set(confidence, current);
  }

  return [...buckets.values()]
    .map((bucket) => ({
      ...bucket,
      avgOutcomePct: Number((bucket.avgOutcomePct / bucket.samples).toFixed(2)),
      hitRate: Math.round((bucket.hitRate / bucket.samples) * 100),
      missRate: Math.round((bucket.missRate / bucket.samples) * 100),
    }))
    .sort((a, b) => b.samples - a.samples);
}

function topOutcomes(examples = [], direction = "winner") {
  const sorted = [...examples].sort((a, b) =>
    direction === "winner"
      ? b.primaryChangePct - a.primaryChangePct
      : a.primaryChangePct - b.primaryChangePct
  );

  return sorted.slice(0, 12).map((example) => ({
    name: example.name,
    symbol: example.symbol,
    horizonHours: example.horizonHours,
    outcomeLabel: example.outcomeLabel,
    primaryChangePct: example.primaryChangePct,
    scoreDelta: example.scoreDelta,
    pipelineScore: num(example.scores?.pipeline),
  }));
}

export function buildOutcomeCalibrationReport(options = {}) {
  const horizons = options.horizons || DEFAULT_HORIZONS;
  const examples = buildOutcomeExamples(
    options.memory || loadScanMemory(),
    options.snapshots || loadOutcomeSnapshots(),
    horizons
  );
  const signalStats = CALIBRATED_SIGNALS.map((signal) => analyzeSignal(signal, examples));
  const total = examples.length;
  const winners = examples.filter((example) => example.outcomeScore >= 0.6);
  const losers = examples.filter((example) => example.outcomeScore <= 0.2);
  const avgOutcomePct = total
    ? examples.reduce((sum, example) => sum + example.primaryChangePct, 0) / total
    : 0;

  return {
    generatedAt: new Date().toISOString(),
    horizons,
    totalExamples: total,
    uniqueProjects: new Set(examples.map((example) => example.key)).size,
    hitRate: total ? Math.round((winners.length / total) * 100) : 0,
    missRate: total ? Math.round((losers.length / total) * 100) : 0,
    avgOutcomePct: Number(avgOutcomePct.toFixed(2)),
    confidenceCalibration: analyzeConfidence(examples),
    signalCalibration: signalStats.sort((a, b) => b.reliability - a.reliability),
    strongestSignals: signalStats
      .filter((signal) => signal.samples >= 3)
      .sort((a, b) => b.reliability - a.reliability)
      .slice(0, 10),
    weakestSignals: signalStats
      .filter((signal) => signal.samples >= 3)
      .sort((a, b) => a.reliability - b.reliability)
      .slice(0, 10),
    topWinners: topOutcomes(examples, "winner"),
    topLosers: topOutcomes(examples, "loser"),
  };
}

export function saveOutcomeCalibrationReport(report = buildOutcomeCalibrationReport()) {
  ensureDataDir();
  fs.writeFileSync(CALIBRATION_FILE, JSON.stringify(report, null, 2));
  return {
    file: CALIBRATION_FILE,
    report,
  };
}

export function loadOutcomeCalibrationReport() {
  ensureDataDir();

  if (!fs.existsSync(CALIBRATION_FILE)) {
    return buildOutcomeCalibrationReport();
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(CALIBRATION_FILE, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : buildOutcomeCalibrationReport();
  } catch {
    return buildOutcomeCalibrationReport();
  }
}
