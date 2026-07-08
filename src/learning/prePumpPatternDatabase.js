import fs from "fs";
import path from "path";
import { loadOutcomeSnapshots } from "./outcomeSnapshotStore.js";
import { loadScanMemory } from "./scanMemoryStore.js";

const DATA_DIR = path.resolve("data");
const PATTERN_FILE = path.join(DATA_DIR, "pre-pump-patterns.json");
const DEFAULT_LOOKAHEAD_HOURS = [24, 168, 720];

export const PATTERN_FEATURES = [
  "marketRank",
  "richToken",
  "prePump",
  "narrative",
  "narrativeForecast",
  "narrativeLaunchStaking",
  "liquidity",
  "liquidityExpansion",
  "momentumShift",
  "capitalFlow",
  "buyPressure",
  "relativeStrength",
  "smartWalletPerformance",
  "smartMoneyAccumulation",
  "catalyst",
  "catalystCalendar",
  "xSocial",
  "externalSignal",
  "institutionalWatch",
  "learningEdge",
  "outcomeLearning",
  "signalCombination",
  "calibration",
  "quantumOpportunity",
  "aiAnalyst",
  "sellPressure",
  "stakingRisk",
  "externalRisk",
  "risk",
];

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function keyOf(item = {}) {
  return String(item.key || item.id || `${item.chain || "unknown"}:${item.symbol || item.name || "unknown"}`).toLowerCase();
}

function timestampOf(item = {}) {
  return new Date(item.timestamp || item.scannedAt || 0).getTime();
}

function pctChange(oldValue = 0, newValue = 0) {
  const oldNum = num(oldValue);
  const newNum = num(newValue);

  if (oldNum <= 0 || newNum <= 0) return 0;
  return ((newNum - oldNum) / oldNum) * 100;
}

function groupByKey(items = []) {
  const grouped = new Map();

  for (const item of items) {
    const key = keyOf(item);
    if (!key || key.includes("unknown:unknown")) continue;
    grouped.set(key, [...(grouped.get(key) || []), item]);
  }

  for (const [key, list] of grouped.entries()) {
    grouped.set(key, [...list].sort((a, b) => timestampOf(a) - timestampOf(b)));
  }

  return grouped;
}

function closestSnapshotAfter(snapshots = [], fromMs = 0, horizonHours = 168) {
  const targetMs = fromMs + horizonHours * 60 * 60 * 1000;
  const future = snapshots.filter((snapshot) => timestampOf(snapshot) >= targetMs);

  if (!future.length) return null;

  return future.sort(
    (a, b) => Math.abs(timestampOf(a) - targetMs) - Math.abs(timestampOf(b) - targetMs)
  )[0];
}

export function vectorFromScores(scores = {}) {
  return Object.fromEntries(PATTERN_FEATURES.map((key) => [key, clamp(scores[key])]));
}

export function vectorFromProject(project = {}) {
  return vectorFromScores({
    marketRank: project.marketRankScore,
    richToken: project.richTokenScore,
    prePump: project.prePump?.score,
    narrative: project.narrativeScore,
    narrativeForecast: project.narrativeForecastScore,
    narrativeLaunchStaking: project.narrativeLaunchStakingScore,
    liquidity: project.liquidityScore,
    liquidityExpansion: project.liquidityExpansionScore,
    momentumShift: project.momentumShiftScore,
    capitalFlow: project.capitalFlowScore,
    buyPressure: project.buyPressureScore,
    relativeStrength: project.relativeStrengthScore,
    smartWalletPerformance: project.smartWalletPerformanceScore,
    smartMoneyAccumulation: project.smartMoneyAccumulationScore,
    catalyst: project.catalystScore,
    catalystCalendar: project.catalystCalendarScore,
    xSocial: project.xSocialScore,
    externalSignal: project.externalSignalScore,
    institutionalWatch: project.institutionalWatchScore,
    learningEdge: project.learningEdgeScore,
    outcomeLearning: project.outcomeLearningScore,
    signalCombination: project.signalCombinationScore,
    calibration: project.calibrationScore,
    quantumOpportunity: project.quantumOpportunityScore,
    aiAnalyst: project.aiAnalystScore,
    sellPressure: project.sellPressureScore,
    stakingRisk: project.stakingRiskScore,
    externalRisk: project.externalRiskScore,
    risk: project.riskScore,
  });
}

function cosineSimilarity(a = {}, b = {}) {
  let dot = 0;
  let magA = 0;
  let magB = 0;

  for (const key of PATTERN_FEATURES) {
    const av = num(a[key]) / 100;
    const bv = num(b[key]) / 100;
    dot += av * bv;
    magA += av * av;
    magB += bv * bv;
  }

  if (magA <= 0 || magB <= 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

function classifyOutcome(primaryChangePct = 0, scoreDelta = 0) {
  if (primaryChangePct >= 75 || scoreDelta >= 25) return "pre_breakout";
  if (primaryChangePct >= 30 || scoreDelta >= 14) return "breakout";
  if (primaryChangePct <= -40 || scoreDelta <= -20) return "rug_or_dump";
  if (primaryChangePct <= -18 || scoreDelta <= -10) return "fade";
  return "neutral";
}

function outcomeForRecord(record = {}, snapshots = [], horizonHours = 168) {
  const future = closestSnapshotAfter(snapshots, timestampOf(record), horizonHours);
  if (!future) return null;

  const priceChangePct = pctChange(record.market?.priceUsd, future.priceUsd);
  const marketCapChangePct = pctChange(record.market?.marketCap, future.marketCap);
  const liquidityChangePct = pctChange(record.market?.liquidityUsd, future.liquidityUsd);
  const scoreDelta = num(future.score) - num(record.scores?.pipeline);
  const primaryChangePct =
    [priceChangePct, marketCapChangePct, liquidityChangePct]
      .filter((value) => value !== 0)
      .sort((a, b) => Math.abs(b) - Math.abs(a))[0] || scoreDelta;

  return {
    horizonHours,
    outcomeAt: future.timestamp,
    priceChangePct: Number(priceChangePct.toFixed(2)),
    marketCapChangePct: Number(marketCapChangePct.toFixed(2)),
    liquidityChangePct: Number(liquidityChangePct.toFixed(2)),
    scoreDelta: Number(scoreDelta.toFixed(2)),
    primaryChangePct: Number(primaryChangePct.toFixed(2)),
    label: classifyOutcome(primaryChangePct, scoreDelta),
  };
}

function buildExamples(memory = [], snapshots = [], lookaheadHours = DEFAULT_LOOKAHEAD_HOURS) {
  const snapshotsByKey = groupByKey(snapshots);
  const examples = [];

  for (const record of memory) {
    const key = keyOf(record);
    const projectSnapshots = snapshotsByKey.get(key) || [];

    if (!projectSnapshots.length || !timestampOf(record)) continue;

    for (const horizonHours of lookaheadHours) {
      const outcome = outcomeForRecord(record, projectSnapshots, horizonHours);
      if (!outcome) continue;

      examples.push({
        key,
        name: record.name || "Unknown",
        symbol: record.symbol || "Unknown",
        chain: record.chain || "unknown",
        scannedAt: record.scannedAt,
        vector: vectorFromScores(record.scores || {}),
        scores: record.scores || {},
        labels: record.labels || {},
        outcome,
      });
    }
  }

  return examples;
}

function averageVector(examples = []) {
  if (!examples.length) return vectorFromScores({});

  const totals = Object.fromEntries(PATTERN_FEATURES.map((key) => [key, 0]));

  for (const example of examples) {
    for (const key of PATTERN_FEATURES) {
      totals[key] += num(example.vector?.[key]);
    }
  }

  return Object.fromEntries(
    PATTERN_FEATURES.map((key) => [key, Number((totals[key] / examples.length).toFixed(2))])
  );
}

function strongestFeatures(winners = [], traps = []) {
  const winnerVector = averageVector(winners);
  const trapVector = averageVector(traps);

  return PATTERN_FEATURES.map((key) => ({
    key,
    winnerAverage: winnerVector[key],
    trapAverage: trapVector[key],
    edge: Number((winnerVector[key] - trapVector[key]).toFixed(2)),
  }))
    .sort((a, b) => Math.abs(b.edge) - Math.abs(a.edge))
    .slice(0, 15);
}

function topExamples(examples = [], direction = "winner") {
  return [...examples]
    .sort((a, b) =>
      direction === "winner"
        ? b.outcome.primaryChangePct - a.outcome.primaryChangePct
        : a.outcome.primaryChangePct - b.outcome.primaryChangePct
    )
    .slice(0, 12)
    .map((example) => ({
      name: example.name,
      symbol: example.symbol,
      scannedAt: example.scannedAt,
      horizonHours: example.outcome.horizonHours,
      label: example.outcome.label,
      primaryChangePct: example.outcome.primaryChangePct,
      pipelineScore: num(example.scores?.pipeline),
    }));
}

export function buildPrePumpPatternDatabase(options = {}) {
  const memory = options.memory || loadScanMemory();
  const snapshots = options.snapshots || loadOutcomeSnapshots();
  const lookaheadHours = options.lookaheadHours || DEFAULT_LOOKAHEAD_HOURS;
  const examples = buildExamples(memory, snapshots, lookaheadHours);
  const breakoutExamples = examples.filter((example) =>
    ["pre_breakout", "breakout"].includes(example.outcome.label)
  );
  const trapExamples = examples.filter((example) =>
    ["rug_or_dump", "fade"].includes(example.outcome.label)
  );
  const neutralExamples = examples.filter((example) => example.outcome.label === "neutral");
  const breakoutProfile = averageVector(breakoutExamples);
  const trapProfile = averageVector(trapExamples);
  const featureEdges = strongestFeatures(breakoutExamples, trapExamples);

  return {
    generatedAt: new Date().toISOString(),
    lookaheadHours,
    totalExamples: examples.length,
    breakoutExamples: breakoutExamples.length,
    trapExamples: trapExamples.length,
    neutralExamples: neutralExamples.length,
    confidence:
      examples.length >= 100
        ? "High"
        : examples.length >= 30
        ? "Developing"
        : examples.length >= 8
        ? "Early"
        : "Cold Start",
    breakoutProfile,
    trapProfile,
    featureEdges,
    topBreakouts: topExamples(breakoutExamples, "winner"),
    topTraps: topExamples(trapExamples, "trap"),
  };
}

export function savePrePumpPatternDatabase(database = buildPrePumpPatternDatabase()) {
  ensureDataDir();
  fs.writeFileSync(PATTERN_FILE, JSON.stringify(database, null, 2));

  return {
    file: PATTERN_FILE,
    database,
  };
}

export function loadPrePumpPatternDatabase() {
  ensureDataDir();

  if (!fs.existsSync(PATTERN_FILE)) return buildPrePumpPatternDatabase();

  try {
    const parsed = JSON.parse(fs.readFileSync(PATTERN_FILE, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : buildPrePumpPatternDatabase();
  } catch {
    return buildPrePumpPatternDatabase();
  }
}

export function compareToPrePumpPatterns(project = {}, database = loadPrePumpPatternDatabase()) {
  const vector = vectorFromProject(project);
  const breakoutMatch = Math.round(cosineSimilarity(vector, database.breakoutProfile || {}) * 100);
  const trapMatch = Math.round(cosineSimilarity(vector, database.trapProfile || {}) * 100);
  const netEdge = breakoutMatch - trapMatch;
  const patternConfidence =
    database.totalExamples >= 100
      ? "High"
      : database.totalExamples >= 30
      ? "Developing"
      : database.totalExamples >= 8
      ? "Early"
      : "Cold Start";
  const score = Math.round(
    clamp(
      50 +
        netEdge * 0.45 +
        Math.min(10, num(database.breakoutExamples) / 10) -
        Math.min(10, num(database.trapExamples) / 12)
    )
  );
  const matchedFeatures = (database.featureEdges || [])
    .map((feature) => ({
      ...feature,
      projectScore: Math.round(num(vector[feature.key])),
      aligned:
        feature.edge >= 0
          ? num(vector[feature.key]) >= feature.winnerAverage
          : num(vector[feature.key]) <= feature.trapAverage,
    }))
    .filter((feature) => feature.aligned)
    .slice(0, 8);

  return {
    prePumpPatternScore: score,
    prePumpPatternMatchPct: breakoutMatch,
    trapPatternMatchPct: trapMatch,
    prePumpPatternEdge: netEdge,
    prePumpPatternConfidence: patternConfidence,
    prePumpPattern: {
      databaseExamples: database.totalExamples || 0,
      breakoutExamples: database.breakoutExamples || 0,
      trapExamples: database.trapExamples || 0,
      breakoutMatchPct: breakoutMatch,
      trapMatchPct: trapMatch,
      edge: netEdge,
      score,
      confidence: patternConfidence,
      matchedFeatures,
      summary:
        patternConfidence === "Cold Start"
          ? "Pattern database is waiting for enough future outcomes."
          : netEdge >= 12
          ? `This token matches ${breakoutMatch}% of prior pre-breakout profiles.`
          : netEdge <= -12
          ? `This token is closer to prior dump/trap profiles than breakout profiles.`
          : "Pattern match is mixed or not decisive yet.",
    },
  };
}
