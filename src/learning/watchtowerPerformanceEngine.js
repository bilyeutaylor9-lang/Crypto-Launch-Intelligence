import fs from "fs";
import path from "path";
import { loadOutcomeSnapshots } from "./outcomeSnapshotStore.js";
import { loadWatchtowerAlerts } from "./watchtowerStore.js";

const DATA_DIR = path.resolve("data");
const PERFORMANCE_FILE = path.join(DATA_DIR, "watchtower-performance.json");
const DEFAULT_HORIZONS = [24, 168, 720];

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function keyOf(item = {}) {
  return String(
    item.key ||
      item.projectId ||
      `${item.chain || "unknown"}:${item.symbol || item.project || item.name || "unknown"}`
  ).toLowerCase();
}

function timestampOf(item = {}) {
  return new Date(item.timestamp || item.generatedAt || item.scannedAt || 0).getTime();
}

function pctChange(oldValue = 0, newValue = 0) {
  const oldNum = num(oldValue);
  const newNum = num(newValue);

  if (oldNum <= 0 || newNum <= 0) return 0;
  return ((newNum - oldNum) / oldNum) * 100;
}

function groupSnapshots(snapshots = []) {
  const grouped = new Map();

  for (const snapshot of snapshots) {
    const key = keyOf(snapshot);
    if (!key || key.includes("unknown:unknown")) continue;
    grouped.set(key, [...(grouped.get(key) || []), snapshot]);
  }

  for (const [key, list] of grouped.entries()) {
    grouped.set(key, [...list].sort((a, b) => timestampOf(a) - timestampOf(b)));
  }

  return grouped;
}

function closestSnapshotAtOrBefore(snapshots = [], targetMs = 0) {
  return [...snapshots]
    .filter((snapshot) => timestampOf(snapshot) <= targetMs)
    .sort((a, b) => timestampOf(b) - timestampOf(a))[0] || null;
}

function closestSnapshotAfter(snapshots = [], targetMs = 0) {
  return [...snapshots]
    .filter((snapshot) => timestampOf(snapshot) >= targetMs)
    .sort((a, b) => Math.abs(timestampOf(a) - targetMs) - Math.abs(timestampOf(b) - targetMs))[0] || null;
}

function labelOutcome(changePct = 0) {
  if (changePct >= 75) return "major_hit";
  if (changePct >= 25) return "hit";
  if (changePct <= -30) return "major_miss";
  if (changePct <= -12) return "miss";
  return "neutral";
}

function gradeAlert(alert = {}, outcome = {}) {
  const positiveAlert = !/risk|deterioration|warning|reject/i.test(alert.type || "");
  const outcomeLabel = outcome.outcomeLabel;

  if (positiveAlert) {
    if (["major_hit", "hit"].includes(outcomeLabel)) return "hit";
    if (["major_miss", "miss"].includes(outcomeLabel)) return "miss";
    return "neutral";
  }

  if (["major_miss", "miss"].includes(outcomeLabel)) return "risk_correct";
  if (["major_hit", "hit"].includes(outcomeLabel)) return "risk_false_positive";
  return "neutral";
}

function evaluateAlert(alert = {}, snapshotsByKey = new Map(), horizons = DEFAULT_HORIZONS) {
  const key = keyOf(alert);
  const snapshots = snapshotsByKey.get(key) || [];
  const alertMs = timestampOf(alert);
  const baseline = closestSnapshotAtOrBefore(snapshots, alertMs) || snapshots[0] || null;

  if (!baseline || !alertMs) {
    return {
      alert,
      status: "pending",
      reason: "No baseline snapshot available for this alert.",
      outcomes: [],
    };
  }

  const outcomes = horizons
    .map((horizonHours) => {
      const future = closestSnapshotAfter(snapshots, alertMs + horizonHours * 60 * 60 * 1000);
      if (!future) return null;
      if (num(baseline.priceUsd) <= 0 || num(future.priceUsd) <= 0) return null;

      const priceChangePct = pctChange(baseline.priceUsd, future.priceUsd);
      const marketCapChangePct = pctChange(baseline.marketCap, future.marketCap);
      const liquidityChangePct = pctChange(baseline.liquidityUsd, future.liquidityUsd);
      const scoreDelta = num(future.score) - num(baseline.score);
      const primaryChangePct = priceChangePct;
      const outcomeLabel = labelOutcome(primaryChangePct);

      return {
        horizonHours,
        outcomeAt: future.timestamp,
        priceChangePct: Number(priceChangePct.toFixed(2)),
        marketCapChangePct: Number(marketCapChangePct.toFixed(2)),
        liquidityChangePct: Number(liquidityChangePct.toFixed(2)),
        scoreDelta: Number(scoreDelta.toFixed(2)),
        scannerScoreDeltaIgnored: Number(scoreDelta.toFixed(2)),
        primaryChangePct: Number(primaryChangePct.toFixed(2)),
        outcomeBasis: "PRICE_ONLY_POINT_IN_TIME_SNAPSHOT",
        outcomeLabel,
      };
    })
    .filter(Boolean);

  if (!outcomes.length) {
    return {
      alert,
      status: "pending",
      reason: "No future snapshot has reached an evaluation horizon yet.",
      outcomes: [],
    };
  }

  const bestOutcome = [...outcomes].sort(
    (a, b) => Math.abs(b.primaryChangePct) - Math.abs(a.primaryChangePct)
  )[0];

  return {
    alert,
    status: "evaluated",
    grade: gradeAlert(alert, bestOutcome),
    baseline: {
      timestamp: baseline.timestamp,
      priceUsd: baseline.priceUsd,
      score: baseline.score,
    },
    bestOutcome,
    outcomes,
  };
}

function summarizeGroup(evaluations = [], keyFn = () => "all") {
  const groups = new Map();

  for (const evaluation of evaluations.filter((item) => item.status === "evaluated")) {
    const key = keyFn(evaluation.alert);
    const current = groups.get(key) || {
      key,
      samples: 0,
      hits: 0,
      misses: 0,
      neutral: 0,
      riskCorrect: 0,
      riskFalsePositive: 0,
      avgMovePct: 0,
      avgScoreDelta: 0,
    };

    current.samples += 1;
    current.hits += evaluation.grade === "hit" ? 1 : 0;
    current.misses += evaluation.grade === "miss" ? 1 : 0;
    current.neutral += evaluation.grade === "neutral" ? 1 : 0;
    current.riskCorrect += evaluation.grade === "risk_correct" ? 1 : 0;
    current.riskFalsePositive += evaluation.grade === "risk_false_positive" ? 1 : 0;
    current.avgMovePct += num(evaluation.bestOutcome?.primaryChangePct);
    current.avgScoreDelta += num(evaluation.bestOutcome?.scoreDelta);
    groups.set(key, current);
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      hitRate: Math.round(((group.hits + group.riskCorrect) / Math.max(1, group.samples)) * 100),
      missRate: Math.round(((group.misses + group.riskFalsePositive) / Math.max(1, group.samples)) * 100),
      avgMovePct: Number((group.avgMovePct / Math.max(1, group.samples)).toFixed(2)),
      avgScoreDelta: Number((group.avgScoreDelta / Math.max(1, group.samples)).toFixed(2)),
    }))
    .sort((a, b) => b.samples - a.samples || b.hitRate - a.hitRate);
}

export function buildWatchtowerPerformanceReport(options = {}) {
  const horizons = options.horizons || DEFAULT_HORIZONS;
  const alerts = options.alerts || loadWatchtowerAlerts().alerts;
  const snapshots = options.snapshots || loadOutcomeSnapshots();
  const snapshotsByKey = groupSnapshots(snapshots);
  const evaluations = alerts.map((alert) => evaluateAlert(alert, snapshotsByKey, horizons));
  const evaluated = evaluations.filter((item) => item.status === "evaluated");
  const pending = evaluations.filter((item) => item.status === "pending");
  const hits = evaluated.filter((item) => ["hit", "risk_correct"].includes(item.grade));
  const misses = evaluated.filter((item) => ["miss", "risk_false_positive"].includes(item.grade));

  return {
    generatedAt: new Date().toISOString(),
    horizons,
    totalAlerts: alerts.length,
    evaluatedAlerts: evaluated.length,
    pendingAlerts: pending.length,
    hitRate: Math.round((hits.length / Math.max(1, evaluated.length)) * 100),
    missRate: Math.round((misses.length / Math.max(1, evaluated.length)) * 100),
    byType: summarizeGroup(evaluations, (alert) => alert.type || "Unknown"),
    bySeverity: summarizeGroup(evaluations, (alert) => alert.severity || "Unknown"),
    strongestAlertTypes: summarizeGroup(evaluations, (alert) => alert.type || "Unknown")
      .filter((group) => group.samples >= 2)
      .sort((a, b) => b.hitRate - a.hitRate || b.avgMovePct - a.avgMovePct)
      .slice(0, 10),
    noisiestAlertTypes: summarizeGroup(evaluations, (alert) => alert.type || "Unknown")
      .filter((group) => group.samples >= 2)
      .sort((a, b) => b.missRate - a.missRate || a.avgMovePct - b.avgMovePct)
      .slice(0, 10),
    recentEvaluations: evaluated.slice(-50).reverse(),
    pending: pending.slice(-50).reverse(),
  };
}

export function saveWatchtowerPerformanceReport(report = buildWatchtowerPerformanceReport()) {
  ensureDataDir();
  fs.writeFileSync(PERFORMANCE_FILE, JSON.stringify(report, null, 2));

  return {
    file: PERFORMANCE_FILE,
    report,
  };
}

export function loadWatchtowerPerformanceReport() {
  ensureDataDir();

  if (!fs.existsSync(PERFORMANCE_FILE)) return buildWatchtowerPerformanceReport();

  try {
    const parsed = JSON.parse(fs.readFileSync(PERFORMANCE_FILE, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : buildWatchtowerPerformanceReport();
  } catch {
    return buildWatchtowerPerformanceReport();
  }
}
