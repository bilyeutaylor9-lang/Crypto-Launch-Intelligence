import fs from "fs";
import path from "path";
import { loadOutcomeSnapshots } from "./outcomeSnapshotStore.js";
import { loadScanMemory } from "./scanMemoryStore.js";
import {
  normalizeChainId,
  normalizeTokenAddress,
} from "../identity/strictIdentityValidators.js";

const DATA_DIR = path.resolve("data");
const CALIBRATION_FILE = path.join(DATA_DIR, "outcome-calibration.json");
const DEFAULT_HORIZONS = [1, 24, 168, 720];
const DEFAULT_EDGE_MIN_SAMPLES = 30;
const DEFAULT_EDGE_MIN_UNIQUE_PROJECTS = 20;
const DEFAULT_EDGE_MIN_DIRECTIONAL_RETURN_PCT = 3;
const DEFAULT_EDGE_MIN_RELIABILITY = 58;
const DEFAULT_SHADOW_MIN_SAMPLES = 10;
const DEFAULT_SHADOW_MIN_UNIQUE_PROJECTS = 5;
const DEFAULT_SHADOW_MIN_RELIABILITY = 50;

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

function normalizeIdentityKey(value = "") {
  const raw = String(value || "").trim();
  const separator = raw.indexOf(":");
  if (separator <= 0 || separator === raw.length - 1) return "";
  const chain = normalizeChainId(raw.slice(0, separator));
  const identity = normalizeTokenAddress(raw.slice(separator + 1), chain);
  return chain && identity ? `${chain}:${identity}` : "";
}

function keyOf(record = {}) {
  const explicit = normalizeIdentityKey(record.identityKey || record.key);
  if (explicit) return explicit;

  const id = normalizeIdentityKey(record.id);
  if (id) return id;

  const chain = String(record.chain || "").trim().toLowerCase();
  const tokenAddress = String(record.tokenAddress || record.contractAddress || "").trim();
  if (!chain || !tokenAddress) return "";
  return normalizeIdentityKey(`${chain}:${tokenAddress}`);
}

export function getOutcomeIdentityKey(record = {}) {
  return keyOf(record);
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

function horizonToleranceHours(horizonHours = 24, options = {}) {
  const configured = Number(options.horizonToleranceHours?.[horizonHours]);
  if (Number.isFinite(configured) && configured >= 0) return configured;
  return Math.max(2, Math.min(24, horizonHours * 0.25));
}

export function outcomeHorizonToleranceHours(horizonHours = 24, options = {}) {
  return horizonToleranceHours(horizonHours, options);
}

function closestSnapshotAfter(snapshots = [], fromMs = 0, horizonHours = 24, options = {}) {
  const targetMs = fromMs + horizonHours * 60 * 60 * 1000;
  const toleranceMs = horizonToleranceHours(horizonHours, options) * 60 * 60 * 1000;
  const future = snapshots.filter((snapshot) => {
    const observedAt = timestampOf(snapshot);
    const provenanceVerified = [
      "EXACT_CHAIN_TOKEN_MATCH",
      "EXACT_CHAIN_TOKEN_POOL_MATCH",
    ].includes(snapshot.provenance?.verificationStatus);
    return observedAt >= targetMs &&
      observedAt - targetMs <= toleranceMs &&
      (options.requireVerifiedOutcomeProvenance !== true || provenanceVerified);
  });

  if (!future.length) return null;

  return future.sort(
    (a, b) => Math.abs(timestampOf(a) - targetMs) - Math.abs(timestampOf(b) - targetMs)
  )[0];
}

function labelOutcome(changePct = 0) {
  if (changePct >= 100) return "major_winner";
  if (changePct >= 35) return "winner";
  if (changePct >= 12) return "positive";
  if (changePct <= -35) return "major_loser";
  if (changePct <= -15) return "loser";
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

export function buildOutcomeExamples(
  memory = [],
  snapshots = [],
  horizons = DEFAULT_HORIZONS,
  options = {}
) {
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

    if (!fromMs || fromPrice <= 0 || !projectSnapshots.length) continue;

    for (const horizonHours of horizons) {
      const future = closestSnapshotAfter(projectSnapshots, fromMs, horizonHours, options);
      if (!future) continue;
      if (num(future.priceUsd) <= 0) continue;

      const priceChangePct = pctChange(fromPrice, future.priceUsd);
      const marketCapChangePct = pctChange(fromMarketCap, future.marketCap);
      const liquidityChangePct = pctChange(fromLiquidity, future.liquidityUsd);
      const scoreDelta = num(future.score) - fromScore;
      const primaryChangePct = priceChangePct;
      const label = labelOutcome(primaryChangePct);

      examples.push({
        key,
        name: record.name || future.name || "Unknown",
        symbol: record.symbol || future.symbol || "Unknown",
        horizonHours,
        horizonLatenessHours: Number(
          (
            (timestampOf(future) - (fromMs + horizonHours * 60 * 60 * 1000)) /
            (60 * 60 * 1000)
          ).toFixed(3)
        ),
        horizonToleranceHours: horizonToleranceHours(horizonHours, options),
        scannedAt: record.scannedAt,
        outcomeAt: future.timestamp,
        scores: record.scores || {},
        labels: record.labels || {},
        priceChangePct: Number(priceChangePct.toFixed(2)),
        marketCapChangePct: Number(marketCapChangePct.toFixed(2)),
        liquidityChangePct: Number(liquidityChangePct.toFixed(2)),
        scannerScoreDeltaIgnored: Number(scoreDelta.toFixed(2)),
        primaryChangePct: Number(primaryChangePct.toFixed(2)),
        outcomeLabel: label,
        outcomeBasis: "PRICE_ONLY_POINT_IN_TIME_SNAPSHOT",
        outcomeProvenance: future.provenance || null,
        outcomeScore: outcomeScore(label),
      });
    }
  }

  return examples;
}

function median(values = []) {
  const active = values
    .filter((value) => Number.isFinite(Number(value)))
    .map(Number)
    .sort((a, b) => a - b);
  if (!active.length) return 0;
  const middle = Math.floor(active.length / 2);
  return active.length % 2 ? active[middle] : (active[middle - 1] + active[middle]) / 2;
}

function winsorizedAverage(values = [], cap = 300) {
  const active = values
    .filter((value) => Number.isFinite(Number(value)))
    .map((value) => clamp(value, -cap, cap));
  return active.length ? active.reduce((sum, value) => sum + value, 0) / active.length : 0;
}

function edgePolicy(options = {}) {
  return {
    minimumSamples: Number(
      options.minimumSamples || process.env.OUTCOME_EDGE_MIN_SAMPLES || DEFAULT_EDGE_MIN_SAMPLES
    ),
    minimumUniqueProjects: Number(
      options.minimumUniqueProjects ||
        process.env.OUTCOME_EDGE_MIN_UNIQUE_PROJECTS ||
        DEFAULT_EDGE_MIN_UNIQUE_PROJECTS
    ),
    minimumDirectionalReturnPct: Number(
      options.minimumDirectionalReturnPct ||
        process.env.OUTCOME_EDGE_MIN_DIRECTIONAL_RETURN_PCT ||
        DEFAULT_EDGE_MIN_DIRECTIONAL_RETURN_PCT
    ),
    minimumReliability: Number(
      options.minimumReliability ||
        process.env.OUTCOME_EDGE_MIN_RELIABILITY ||
        DEFAULT_EDGE_MIN_RELIABILITY
    ),
    shadowMinimumSamples: Number(
      options.shadowMinimumSamples ||
        process.env.OUTCOME_SHADOW_MIN_SAMPLES ||
        DEFAULT_SHADOW_MIN_SAMPLES
    ),
    shadowMinimumUniqueProjects: Number(
      options.shadowMinimumUniqueProjects ||
        process.env.OUTCOME_SHADOW_MIN_UNIQUE_PROJECTS ||
        DEFAULT_SHADOW_MIN_UNIQUE_PROJECTS
    ),
    shadowMinimumReliability: Number(
      options.shadowMinimumReliability ||
        process.env.OUTCOME_SHADOW_MIN_RELIABILITY ||
        DEFAULT_SHADOW_MIN_RELIABILITY
    ),
  };
}

function buildShadowHypothesis(signal = {}, policy = {}) {
  if (
    !["INSUFFICIENT_INDEPENDENT_SAMPLE", "NO_MEASURED_EDGE"].includes(signal.edgeStatus) ||
    signal.samples < policy.shadowMinimumSamples ||
    signal.uniqueProjects < policy.shadowMinimumUniqueProjects ||
    signal.directionalReturnEdgePct < policy.minimumDirectionalReturnPct ||
    signal.reliability < policy.shadowMinimumReliability
  ) {
    return null;
  }

  const validationRatios = [
    signal.samples / Math.max(1, policy.minimumSamples),
    signal.uniqueProjects / Math.max(1, policy.minimumUniqueProjects),
    signal.directionalReturnEdgePct / Math.max(0.01, policy.minimumDirectionalReturnPct),
    signal.reliability / Math.max(1, policy.minimumReliability),
  ].map((ratio) => Math.min(1, Math.max(0, ratio)));
  const validationProgressPct = Math.round(
    (validationRatios.reduce((sum, ratio) => sum + ratio, 0) / validationRatios.length) * 100
  );

  return {
    key: signal.key,
    label: signal.label,
    positive: signal.positive,
    status: "SHADOW_ONLY",
    samples: signal.samples,
    uniqueProjects: signal.uniqueProjects,
    reliability: signal.reliability,
    directionalReturnEdgePct: signal.directionalReturnEdgePct,
    medianOutcomePct: signal.medianOutcomePct,
    validationProgressPct,
    validationGaps: {
      samplesNeeded: Math.max(0, policy.minimumSamples - signal.samples),
      uniqueProjectsNeeded: Math.max(0, policy.minimumUniqueProjects - signal.uniqueProjects),
      directionalReturnPctNeeded: Number(
        Math.max(0, policy.minimumDirectionalReturnPct - signal.directionalReturnEdgePct).toFixed(2)
      ),
      reliabilityPointsNeeded: Math.max(0, policy.minimumReliability - signal.reliability),
    },
    scoreAdjustment: 0,
    mayAffectFinalDecision: false,
  };
}

function analyzeSignal(signal = {}, examples = [], options = {}) {
  const triggered = examples.filter((example) => num(example.scores?.[signal.key]) >= 60);
  const notTriggered = examples.filter((example) => num(example.scores?.[signal.key]) > 0 && num(example.scores?.[signal.key]) < 60);
  const policy = edgePolicy(options);

  if (!triggered.length) {
    return {
      ...signal,
      samples: 0,
      uniqueProjects: 0,
      hitRate: 50,
      avgOutcomePct: 0,
      medianOutcomePct: 0,
      winsorizedAvgOutcomePct: 0,
      baselineWinsorizedAvgOutcomePct: 0,
      directionalReturnEdgePct: 0,
      avgOutcomeScore: 45,
      falsePositiveRate: 0,
      reliability: 50,
      weightMultiplier: 1,
      scoreAdjustment: 0,
      edgeStatus: "INSUFFICIENT_INDEPENDENT_SAMPLE",
    };
  }

  const winnerCount = triggered.filter((example) => example.outcomeScore >= 0.6).length;
  const loserCount = triggered.filter((example) => example.outcomeScore <= 0.2).length;
  const hitRate = (winnerCount / triggered.length) * 100;
  const falsePositiveRate = (loserCount / triggered.length) * 100;
  const avgOutcomePct =
    triggered.reduce((sum, example) => sum + num(example.primaryChangePct), 0) / triggered.length;
  const triggeredReturns = triggered.map((example) => example.primaryChangePct);
  const baselineReturns = notTriggered.length
    ? notTriggered.map((example) => example.primaryChangePct)
    : examples.map((example) => example.primaryChangePct);
  const medianOutcomePct = median(triggeredReturns);
  const winsorizedAvgOutcomePct = winsorizedAverage(triggeredReturns);
  const baselineWinsorizedAvgOutcomePct = winsorizedAverage(baselineReturns);
  const directionalReturnEdgePct = signal.positive
    ? winsorizedAvgOutcomePct - baselineWinsorizedAvgOutcomePct
    : baselineWinsorizedAvgOutcomePct - winsorizedAvgOutcomePct;
  const uniqueProjects = new Set(triggered.map((example) => example.key)).size;
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
  const sampleConfidence = Math.min(
    1,
    triggered.length / Math.max(1, policy.minimumSamples),
    uniqueProjects / Math.max(1, policy.minimumUniqueProjects)
  );
  const weightMultiplier = Number(
    clamp(1 + ((reliability - 50) / 100) * sampleConfidence, 0.75, 1.25).toFixed(3)
  );
  const scoreAdjustment = Math.round(clamp((reliability - 50) * sampleConfidence * 0.24, -8, 8));
  const sampleReady =
    triggered.length >= policy.minimumSamples && uniqueProjects >= policy.minimumUniqueProjects;
  const edgeStatus = !sampleReady
    ? "INSUFFICIENT_INDEPENDENT_SAMPLE"
    : directionalReturnEdgePct >= policy.minimumDirectionalReturnPct &&
        reliability >= policy.minimumReliability
      ? "VALIDATED_DIRECTIONAL_EDGE"
      : directionalReturnEdgePct <= -policy.minimumDirectionalReturnPct
        ? "CONTRADICTED_DIRECTIONAL_EDGE"
        : "NO_MEASURED_EDGE";

  return {
    ...signal,
    samples: triggered.length,
    uniqueProjects,
    hitRate: Math.round(hitRate),
    avgOutcomePct: Number(avgOutcomePct.toFixed(2)),
    medianOutcomePct: Number(medianOutcomePct.toFixed(2)),
    winsorizedAvgOutcomePct: Number(winsorizedAvgOutcomePct.toFixed(2)),
    baselineWinsorizedAvgOutcomePct: Number(baselineWinsorizedAvgOutcomePct.toFixed(2)),
    directionalReturnEdgePct: Number(directionalReturnEdgePct.toFixed(2)),
    avgOutcomeScore: Math.round(avgOutcomeScore),
    falsePositiveRate: Math.round(falsePositiveRate),
    reliability: Math.round(reliability),
    weightMultiplier,
    scoreAdjustment,
    edgeStatus,
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
    outcomeBasis: example.outcomeBasis,
    scannerScoreDeltaIgnored: example.scannerScoreDeltaIgnored,
    pipelineScore: num(example.scores?.pipeline),
  }));
}

export function buildOutcomeCalibrationReport(options = {}) {
  const horizons = options.horizons || DEFAULT_HORIZONS;
  const policy = edgePolicy(options);
  const examples = buildOutcomeExamples(
    options.memory || loadScanMemory(),
    options.snapshots || loadOutcomeSnapshots(),
    horizons,
    options
  );
  const signalStats = CALIBRATED_SIGNALS.map((signal) => analyzeSignal(signal, examples, policy));
  const validatedEdgeSignals = signalStats
    .filter((signal) => signal.edgeStatus === "VALIDATED_DIRECTIONAL_EDGE")
    .sort((a, b) => b.directionalReturnEdgePct - a.directionalReturnEdgePct);
  const contradictedEdgeSignals = signalStats
    .filter((signal) => signal.edgeStatus === "CONTRADICTED_DIRECTIONAL_EDGE")
    .sort((a, b) => a.directionalReturnEdgePct - b.directionalReturnEdgePct);
  const avoidanceEdgeSignals = contradictedEdgeSignals.filter((signal) => signal.positive);
  const shadowEdgeHypotheses = signalStats
    .map((signal) => buildShadowHypothesis(signal, policy))
    .filter(Boolean)
    .sort((a, b) => b.validationProgressPct - a.validationProgressPct);
  const total = examples.length;
  const winners = examples.filter((example) => example.outcomeScore >= 0.6);
  const losers = examples.filter((example) => example.outcomeScore <= 0.2);
  const avgOutcomePct = total
    ? examples.reduce((sum, example) => sum + example.primaryChangePct, 0) / total
    : 0;

  return {
    generatedAt: new Date().toISOString(),
    learningKernel: "TRUTH_ONLY_PRICE_OUTCOME",
    scoreBasedOutcomeLabelsAllowed: false,
    identityJoinPolicy: "EXACT_CHAIN_SCOPED_IDENTITY_ONLY",
    horizonResolutionPolicy: Object.fromEntries(
      horizons.map((horizon) => [
        `${horizon}h`,
        { maximumLatenessHours: horizonToleranceHours(horizon, options) },
      ])
    ),
    edgeQualificationPolicy: policy,
    edgeState: validatedEdgeSignals.length
      ? "MEASURED_EDGE_AVAILABLE"
      : avoidanceEdgeSignals.length
        ? "MEASURED_AVOIDANCE_EDGE_AVAILABLE"
        : shadowEdgeHypotheses.length
          ? "SHADOW_HYPOTHESES_ONLY"
          : "NO_EDGE_EVIDENCE",
    horizons,
    totalExamples: total,
    uniqueProjects: new Set(examples.map((example) => example.key)).size,
    hitRate: total ? Math.round((winners.length / total) * 100) : 0,
    missRate: total ? Math.round((losers.length / total) * 100) : 0,
    avgOutcomePct: Number(avgOutcomePct.toFixed(2)),
    confidenceCalibration: analyzeConfidence(examples),
    signalCalibration: signalStats.sort((a, b) => b.reliability - a.reliability),
    validatedEdgeSignals,
    contradictedEdgeSignals,
    avoidanceEdgeSignals,
    shadowEdgeHypotheses,
    nextEdgeMilestone: shadowEdgeHypotheses[0] || null,
    strongestSignals: signalStats
      .filter((signal) => signal.edgeStatus === "VALIDATED_DIRECTIONAL_EDGE")
      .sort((a, b) => b.reliability - a.reliability)
      .slice(0, 10),
    weakestSignals: signalStats
      .filter((signal) => signal.edgeStatus === "CONTRADICTED_DIRECTIONAL_EDGE")
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
