import fs from "fs";
import path from "path";
import {
  canonicalIdentityKey,
  clamp,
  cosineSimilarity,
  hoursBetween,
  num,
  pctChange,
  percentileRank,
} from "../edge/edgeMath.js";

const REPORT_FILE = path.resolve("reports", "residual-alpha-blindspots.json");

const FEATURE_MAP = [
  ["projectChange", (record) => num(record.scores?.projectChange)],
  ["capitalFlow", (record) => num(record.scores?.capitalFlow)],
  ["buyPressure", (record) => num(record.scores?.buyPressure)],
  ["developer", (record) => num(record.scores?.developer)],
  ["githubPro", (record) => num(record.scores?.githubPro)],
  ["smartWalletArrival", (record) => num(record.scores?.smartWalletArrival)],
  ["smartMoneyAccumulation", (record) => num(record.scores?.smartMoneyAccumulation)],
  ["liquidityExpansion", (record) => num(record.scores?.liquidityExpansion)],
  ["narrativeHeat", (record) => num(record.scores?.narrativeHeat)],
  ["socialAcceleration", (record) => num(record.scores?.socialAcceleration)],
  ["sourceTruth", (record) => num(record.scores?.sourceTruth)],
  ["trapRiskInverse", (record) => {
    const risk = num(record.scores?.trapRisk);
    return risk === null ? null : 100 - risk;
  }],
];

function recordKey(record = {}) {
  return record.identityKey || canonicalIdentityKey(record);
}

function scoreOf(record = {}) {
  return num(record.scores?.opportunity ?? record.scores?.pipeline ?? record.pointInTime?.productionDecision?.score);
}

function priceOf(record = {}) {
  return num(record.pointInTime?.market?.priceUsd ?? record.market?.priceUsd ?? record.priceUsd);
}

function futureSnapshot(record = {}, snapshotsByKey = new Map(), horizonHours = 168, toleranceHours = 36) {
  const key = recordKey(record);
  const startAt = record.scannedAt || record.timestamp;
  if (!key || !startAt) return null;
  const candidates = snapshotsByKey.get(key) || [];
  return candidates
    .map((snapshot) => ({ snapshot, delta: hoursBetween(startAt, snapshot.timestamp) }))
    .filter((item) => item.delta !== null && item.delta >= horizonHours && item.delta <= horizonHours + toleranceHours)
    .sort((a, b) => Math.abs(a.delta - horizonHours) - Math.abs(b.delta - horizonHours))[0]?.snapshot || null;
}

function vectorFromRecord(record = {}) {
  return FEATURE_MAP.map(([, getter]) => getter(record) ?? 0);
}

function vectorFromProject(project = {}) {
  const proxy = {
    scores: {
      projectChange: project.projectChangeScore,
      capitalFlow: project.capitalFlowScore,
      buyPressure: project.buyPressureScore,
      developer: project.developerActivityScore ?? project.developerScore,
      githubPro: project.githubProScore,
      smartWalletArrival: project.smartWalletArrivalScore,
      smartMoneyAccumulation: project.smartMoneyAccumulationScore,
      liquidityExpansion: project.liquidityExpansionScore,
      narrativeHeat: project.narrativeHeatScore,
      socialAcceleration: project.socialAccelerationScore,
      sourceTruth: project.sourceTruthScore,
      trapRisk: project.trapRiskScore,
    },
  };
  return vectorFromRecord(proxy);
}

function snapshotsMap(snapshots = []) {
  const map = new Map();
  for (const snapshot of snapshots) {
    if (!snapshot?.key) continue;
    map.set(snapshot.key, [...(map.get(snapshot.key) || []), snapshot]);
  }
  for (const rows of map.values()) rows.sort((a, b) => String(a.timestamp || "").localeCompare(String(b.timestamp || "")));
  return map;
}

export function buildResidualBlindspotModel(memory = [], snapshots = [], options = {}) {
  const horizonHours = Number(options.horizonHours || 168);
  const toleranceHours = Number(options.toleranceHours || Math.max(12, horizonHours * 0.25));
  const byKey = snapshotsMap(snapshots);
  const rows = (Array.isArray(memory) ? memory : []).flatMap((record) => {
    const score = scoreOf(record);
    const startPrice = priceOf(record);
    const future = futureSnapshot(record, byKey, horizonHours, toleranceHours);
    const returnPct = future ? pctChange(startPrice, future.priceUsd) : null;
    if (score === null || returnPct === null) return [];
    return [{ record, score, returnPct, vector: vectorFromRecord(record) }];
  });

  const scores = rows.map((row) => row.score);
  const returns = rows.map((row) => row.returnPct);
  for (const row of rows) {
    row.scorePercentile = percentileRank(row.score, scores);
    row.returnPercentile = percentileRank(row.returnPct, returns);
    row.residual = (row.returnPercentile ?? 0) - (row.scorePercentile ?? 0);
  }

  const blindspots = rows.filter((row) => row.residual >= 0.35 && row.returnPercentile >= 0.7);
  const centroid = FEATURE_MAP.map((_, index) => {
    if (!blindspots.length) return 0;
    return blindspots.reduce((sum, row) => sum + (row.vector[index] || 0), 0) / blindspots.length;
  });

  const model = {
    status: rows.length >= 30 && blindspots.length >= 5 ? "EXPLORATORY_MODEL_READY" : "INSUFFICIENT_SAMPLE",
    horizonHours,
    resolvedExamples: rows.length,
    blindspotExamples: blindspots.length,
    featureNames: FEATURE_MAP.map(([name]) => name),
    centroid: centroid.map((value) => Number(value.toFixed(3))),
    blindspots: blindspots
      .sort((a, b) => b.residual - a.residual)
      .slice(0, 50)
      .map((row) => ({
        key: recordKey(row.record),
        symbol: row.record.symbol || null,
        score: row.score,
        returnPct: Number(row.returnPct.toFixed(2)),
        scorePercentile: Number(row.scorePercentile.toFixed(3)),
        returnPercentile: Number(row.returnPercentile.toFixed(3)),
        residual: Number(row.residual.toFixed(3)),
      })),
    warning: "Residual alpha is rank-residual analysis, not a return forecast. It identifies historically under-rated outcomes relative to the scanner's own cross-sectional ranking.",
  };

  if (options.writeReport !== false) {
    fs.mkdirSync(path.dirname(REPORT_FILE), { recursive: true });
    fs.writeFileSync(REPORT_FILE, JSON.stringify(model, null, 2));
  }
  return model;
}

export function analyzeResidualAlpha(project = {}, model = {}) {
  if (model.status !== "EXPLORATORY_MODEL_READY") {
    return {
      ...project,
      residualAlpha: {
        state: "INSUFFICIENT_SAMPLE",
        blindspotSimilarity: null,
        examples: model.resolvedExamples || 0,
        blindspotExamples: model.blindspotExamples || 0,
        shadowOnly: true,
      },
      residualBlindspotSimilarity: 0,
    };
  }

  const similarityRaw = cosineSimilarity(vectorFromProject(project), model.centroid);
  const similarity = similarityRaw === null ? null : clamp(similarityRaw * 100);
  const state = similarity !== null && similarity >= 88
    ? "STRONG_MODEL_BLINDSPOT_SIMILARITY"
    : similarity !== null && similarity >= 78
      ? "MODEL_BLINDSPOT_WATCH"
      : "LOW_BLINDSPOT_SIMILARITY";

  return {
    ...project,
    residualAlpha: {
      state,
      blindspotSimilarity: similarity === null ? null : Math.round(similarity),
      examples: model.resolvedExamples,
      blindspotExamples: model.blindspotExamples,
      horizonHours: model.horizonHours,
      shadowOnly: true,
      rankingInfluence: false,
    },
    residualBlindspotSimilarity: similarity === null ? 0 : Math.round(similarity),
  };
}

async function loadDefaultHistory(options = {}) {
  if (Array.isArray(options.memory) && Array.isArray(options.snapshots)) {
    return { memory: options.memory, snapshots: options.snapshots };
  }
  const [{ loadScanMemory }, { loadOutcomeSnapshots }] = await Promise.all([
    import("./scanMemoryStore.js"),
    import("./outcomeSnapshotStore.js"),
  ]);
  return {
    memory: Array.isArray(options.memory) ? options.memory : loadScanMemory(),
    snapshots: Array.isArray(options.snapshots) ? options.snapshots : loadOutcomeSnapshots(),
  };
}

export async function analyzeResidualAlphaBatch(projects = [], options = {}) {
  const { memory, snapshots } = await loadDefaultHistory(options);
  const model = options.model || buildResidualBlindspotModel(memory, snapshots, options);
  return (Array.isArray(projects) ? projects : []).map((project) => analyzeResidualAlpha(project, model));
}
