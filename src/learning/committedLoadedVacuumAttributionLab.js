import fs from "node:fs";
import path from "node:path";

import { resolveValidationOutcome, buildCommittedLoadedVacuumValidation } from "./committedLoadedVacuumValidationLab.js";

const REPORT = path.resolve("reports", "committed-loaded-vacuum-attribution.json");
const IGNITION_ORDINAL = { DORMANT: 0, FORMING: 1, COMPRESSED: 2, ARMED: 3, IGNITING: 4, EXPANSION: 5, EXHAUSTION: 6 };

const FEATURE_DEFINITIONS = Object.freeze([
  { key: "marketCapUsd", family: "baseline", transform: "log" },
  { key: "liquidityUsd", family: "baseline", transform: "log" },
  { key: "volume24hUsd", family: "baseline", transform: "log" },
  { key: "priceChange24hPct", family: "baseline", transform: "identity" },
  { key: "productionScore", family: "baseline", transform: "identity" },
  { key: "riskScore", family: "baseline", transform: "identity" },
  { key: "evidenceCoveragePct", family: "baseline", transform: "identity" },
  { key: "ignitionState", family: "baseline", transform: "ignitionOrdinal" },

  { key: "supplyVacuumSupported", family: "supply", transform: "binary" },
  { key: "sellerExhaustionScore", family: "supply", transform: "identity" },
  { key: "marginalSellerInventoryBurnPct", family: "supply", transform: "identity" },

  { key: "oneHourExpectedArrivalToIgnitionRatio", family: "arrival", transform: "identity" },
  { key: "sixHourExpectedArrivalToIgnitionRatio", family: "arrival", transform: "identity" },
  { key: "twentyFourHourExpectedArrivalToIgnitionRatio", family: "arrival", transform: "identity" },
  { key: "sixHourExpectedArrivalUsd", family: "arrival", transform: "log" },
  { key: "ignitionCapitalUsd", family: "arrival", transform: "log" },

  { key: "buyerReplacementScore", family: "microstructure", transform: "identity" },
  { key: "liquidityConvexityIndex", family: "microstructure", transform: "identity" },
  { key: "reflexivityMechanismStrengthScore", family: "microstructure", transform: "identity" },
  { key: "pressureWithoutMovement", family: "microstructure", transform: "binary" },
]);

const PRIMARY_FAMILIES = Object.freeze(["baseline", "supply", "arrival", "microstructure"]);
const PRE_REGISTERED_RATIO_THRESHOLDS = Object.freeze([0.75, 1.0, 1.25]);

function finite(value) { if (value === null || value === undefined || value === "") return null; const n = Number(value); return Number.isFinite(n) ? n : null; }
function ts(value) { const t = Date.parse(value || ""); return Number.isFinite(t) ? t : null; }
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function sigmoid(z) { if (z >= 0) { const e = Math.exp(-z); return 1 / (1 + e); } const e = Math.exp(z); return e / (1 + e); }
function logit(p) { const q = clamp(p, 1e-5, 1 - 1e-5); return Math.log(q / (1 - q)); }
function round(value, digits = 6) { const n = finite(value); return n === null ? null : Number(n.toFixed(digits)); }
function mean(values = []) { const a = values.map(finite).filter((v) => v !== null); return a.length ? a.reduce((s, v) => s + v, 0) / a.length : null; }
function median(values = []) { const a = values.map(finite).filter((v) => v !== null).sort((x, y) => x - y); if (!a.length) return null; const m = Math.floor(a.length / 2); return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; }
function variance(values = [], center = null) { const a = values.map(finite).filter((v) => v !== null); if (!a.length) return null; const c = center ?? mean(a); return mean(a.map((v) => (v - c) ** 2)); }

function snapshotMap(snapshots = []) {
  const map = new Map();
  for (const row of Array.isArray(snapshots) ? snapshots : []) {
    if (!row?.key || !ts(row.timestamp) || finite(row.priceUsd) === null || Number(row.priceUsd) <= 0) continue;
    map.set(row.key, [...(map.get(row.key) || []), row]);
  }
  for (const rows of map.values()) rows.sort((a, b) => ts(a.timestamp) - ts(b.timestamp));
  return map;
}

function transformValue(row = {}, definition = {}) {
  const raw = row?.[definition.key];
  if (definition.transform === "binary") return typeof raw === "boolean" ? (raw ? 1 : 0) : null;
  if (definition.transform === "ignitionOrdinal") return Number.isFinite(IGNITION_ORDINAL[raw]) ? IGNITION_ORDINAL[raw] : null;
  const n = finite(raw);
  if (n === null) return null;
  if (definition.transform === "log") return n >= 0 ? Math.log1p(n) : null;
  return n;
}

export function buildAttributionDataset(observations = [], snapshots = [], options = {}) {
  const byKey = snapshotMap(snapshots);
  const rows = [];
  for (const observation of (Array.isArray(observations) ? observations : []).slice().sort((a, b) => (ts(a.observedAt) || 0) - (ts(b.observedAt) || 0))) {
    if (!observation?.identityKey || !ts(observation.observedAt)) continue;
    const outcome = resolveValidationOutcome(observation, byKey.get(observation.identityKey) || [], options);
    if (!outcome || outcome.plus25BeforeMinus15 === null) continue;
    rows.push({ observation, outcome, y: outcome.plus25BeforeMinus15 ? 1 : 0 });
  }
  return rows;
}

function fitPreprocessor(rows = [], families = PRIMARY_FAMILIES) {
  const allowed = new Set(families);
  const definitions = FEATURE_DEFINITIONS.filter((d) => allowed.has(d.family));
  const specs = definitions.map((definition) => {
    const values = rows.map((row) => transformValue(row.observation, definition)).filter((v) => v !== null);
    const impute = definition.transform === "binary" ? (mean(values) ?? 0.5) : (median(values) ?? 0);
    const completed = rows.map((row) => transformValue(row.observation, definition)).map((v) => v === null ? impute : v);
    const center = mean(completed) ?? 0;
    const scale = Math.sqrt(variance(completed, center) ?? 0) || 1;
    return { ...definition, impute, center, scale };
  });
  return { families: [...allowed], specs };
}

function vectorize(row = {}, preprocessor = {}) {
  const vector = [];
  for (const spec of preprocessor.specs || []) {
    const raw = transformValue(row.observation || row, spec);
    const missing = raw === null;
    const value = missing ? spec.impute : raw;
    vector.push((value - spec.center) / spec.scale);
    vector.push(missing ? 1 : 0);
  }
  return vector;
}

function fitLogistic(train = [], families = PRIMARY_FAMILIES, options = {}) {
  const preprocessor = fitPreprocessor(train, families);
  const x = train.map((row) => vectorize(row, preprocessor));
  const y = train.map((row) => row.y);
  const dimensions = x[0]?.length || 0;
  const baseRate = mean(y) ?? 0.5;
  let intercept = logit(baseRate);
  const weights = Array(dimensions).fill(0);
  if (!train.length || !dimensions || new Set(y).size < 2) return { preprocessor, intercept, weights, baseRate, degenerate: true };
  const iterations = Math.max(80, Number(options.logisticIterations || 320));
  const learningRate = Number(options.learningRate || 0.06);
  const l2 = Math.max(0, Number(options.l2 || 0.08));
  for (let iter = 0; iter < iterations; iter += 1) {
    let gi = 0;
    const gw = Array(dimensions).fill(0);
    for (let i = 0; i < x.length; i += 1) {
      let z = intercept;
      for (let j = 0; j < dimensions; j += 1) z += weights[j] * x[i][j];
      const error = sigmoid(z) - y[i];
      gi += error;
      for (let j = 0; j < dimensions; j += 1) gw[j] += error * x[i][j];
    }
    intercept -= learningRate * gi / x.length;
    for (let j = 0; j < dimensions; j += 1) weights[j] -= learningRate * (gw[j] / x.length + l2 * weights[j]);
  }
  return { preprocessor, intercept, weights, baseRate, degenerate: false };
}

function predictLogistic(model = {}, row = {}) {
  const x = vectorize(row, model.preprocessor || {});
  let z = finite(model.intercept) ?? 0;
  for (let j = 0; j < Math.min(x.length, model.weights?.length || 0); j += 1) z += model.weights[j] * x[j];
  return clamp(sigmoid(z), 1e-5, 1 - 1e-5);
}

function brier(rows = [], key = "p") { return mean(rows.map((row) => (finite(row[key]) - row.y) ** 2)); }
function logLoss(rows = [], key = "p") { return mean(rows.map((row) => { const p = clamp(finite(row[key]) ?? 0.5, 1e-5, 1 - 1e-5); return -(row.y * Math.log(p) + (1 - row.y) * Math.log(1 - p)); })); }
function ece(rows = [], key = "p", bins = 8) {
  if (!rows.length) return null;
  let total = 0;
  for (let b = 0; b < bins; b += 1) {
    const lo = b / bins, hi = (b + 1) / bins;
    const bucket = rows.filter((row) => { const p = finite(row[key]); return p !== null && p >= lo && (b === bins - 1 ? p <= hi : p < hi); });
    if (!bucket.length) continue;
    total += (bucket.length / rows.length) * Math.abs((mean(bucket.map((r) => r[key])) ?? 0) - (mean(bucket.map((r) => r.y)) ?? 0));
  }
  return total;
}

function seeded(seed = 8173) { let state = seed >>> 0; return () => { state = (1664525 * state + 1013904223) >>> 0; return state / 2 ** 32; }; }
function bootstrapLossDifference(rows = [], altKey, fullKey = "pFull", options = {}) {
  const usable = rows.filter((row) => finite(row[altKey]) !== null && finite(row[fullKey]) !== null && row.identityKey);
  const clusters = new Map();
  for (const row of usable) clusters.set(row.identityKey, [...(clusters.get(row.identityKey) || []), row]);
  const keys = [...clusters.keys()];
  if (keys.length < Math.max(8, Number(options.minBootstrapClusters || 8))) return { pointEstimate: null, lower95: null, upper95: null, clusters: keys.length };
  const lossDelta = (row) => (row[altKey] - row.y) ** 2 - (row[fullKey] - row.y) ** 2;
  const point = mean(usable.map(lossDelta));
  const rand = seeded(Number(options.bootstrapSeed || 8173));
  const reps = Math.max(200, Number(options.bootstrapReplicates || 600));
  const samples = [];
  for (let r = 0; r < reps; r += 1) {
    const selected = [];
    for (let i = 0; i < keys.length; i += 1) selected.push(...clusters.get(keys[Math.floor(rand() * keys.length)]));
    samples.push(mean(selected.map(lossDelta)) ?? 0);
  }
  samples.sort((a, b) => a - b);
  const q = (p) => samples[Math.max(0, Math.min(samples.length - 1, Math.floor((samples.length - 1) * p)))];
  return { pointEstimate: round(point), lower95: round(q(0.025)), upper95: round(q(0.975)), clusters: keys.length };
}

function expandingWalkForward(dataset = [], options = {}) {
  const rows = dataset.slice().sort((a, b) => ts(a.observation.observedAt) - ts(b.observation.observedAt));
  const minTrainRows = Math.max(20, Number(options.minTrainRows || 80));
  const foldSize = Math.max(5, Number(options.foldSize || 25));
  const predictions = [];
  const folds = [];
  for (let start = minTrainRows, foldIndex = 0; start < rows.length; start += foldSize, foldIndex += 1) {
    const train = rows.slice(0, start);
    const trainIds = new Set(train.map((r) => r.observation.identityKey));
    let test = rows.slice(start, Math.min(rows.length, start + foldSize));
    if (options.newProjectOnly !== false) test = test.filter((row) => !trainIds.has(row.observation.identityKey));
    if (!test.length || new Set(train.map((r) => r.y)).size < 2) continue;
    const models = {
      full: fitLogistic(train, PRIMARY_FAMILIES, options),
      baseline: fitLogistic(train, ["baseline"], options),
      noSupply: fitLogistic(train, PRIMARY_FAMILIES.filter((f) => f !== "supply"), options),
      noArrival: fitLogistic(train, PRIMARY_FAMILIES.filter((f) => f !== "arrival"), options),
      noMicrostructure: fitLogistic(train, PRIMARY_FAMILIES.filter((f) => f !== "microstructure"), options),
    };
    const foldRows = test.map((row) => ({
      identityKey: row.observation.identityKey,
      observedAt: row.observation.observedAt,
      y: row.y,
      foldIndex,
      pFull: predictLogistic(models.full, row),
      pBaseline: predictLogistic(models.baseline, row),
      pNoSupply: predictLogistic(models.noSupply, row),
      pNoArrival: predictLogistic(models.noArrival, row),
      pNoMicrostructure: predictLogistic(models.noMicrostructure, row),
    }));
    predictions.push(...foldRows);
    folds.push({
      foldIndex,
      trainRows: train.length,
      trainUniqueProjects: trainIds.size,
      testRows: foldRows.length,
      testUniqueProjects: new Set(foldRows.map((r) => r.identityKey)).size,
      testStart: foldRows[0]?.observedAt || null,
      testEnd: foldRows.at(-1)?.observedAt || null,
      brierFull: round(brier(foldRows, "pFull")),
      brierBaseline: round(brier(foldRows, "pBaseline")),
      brierNoSupply: round(brier(foldRows, "pNoSupply")),
      brierNoArrival: round(brier(foldRows, "pNoArrival")),
      brierNoMicrostructure: round(brier(foldRows, "pNoMicrostructure")),
    });
  }
  return { predictions, folds };
}

function familyAttributionResult(predictions = [], folds = [], family, altKey, options = {}) {
  const fullBrier = brier(predictions, "pFull");
  const altBrier = brier(predictions, altKey);
  const bootstrap = bootstrapLossDifference(predictions, altKey, "pFull", options);
  const foldDeltas = folds.map((fold) => finite(fold[`brierNo${family[0].toUpperCase()}${family.slice(1)}`]) !== null && finite(fold.brierFull) !== null
    ? fold[`brierNo${family[0].toUpperCase()}${family.slice(1)}`] - fold.brierFull : null).filter((v) => v !== null);
  return {
    family,
    fullBrier: round(fullBrier),
    brierWithoutFamily: round(altBrier),
    brierDegradationWhenRemoved: fullBrier !== null && altBrier !== null ? round(altBrier - fullBrier) : null,
    clusterBootstrap95: bootstrap,
    positiveDirectionFoldPct: foldDeltas.length ? round((foldDeltas.filter((v) => v > 0).length / foldDeltas.length) * 100, 2) : null,
    interpretation: bootstrap.lower95 !== null && bootstrap.lower95 > 0 ? "INCREMENTAL_ASSOCIATION_SUPPORTED_SHADOW" : "INCREMENTAL_ASSOCIATION_NOT_ESTABLISHED",
  };
}

function thresholdRobustness(observations = [], snapshots = [], options = {}) {
  return PRE_REGISTERED_RATIO_THRESHOLDS.map((threshold) => {
    const modified = observations.map((row) => {
      const ratio = finite(row.sixHourExpectedArrivalToIgnitionRatio);
      const treatment = row.supplyVacuumSupported === true && ratio !== null && ratio >= threshold;
      return { ...row, treatment, capitalArrivalState: treatment ? "COMMITTED_LOADED_VACUUM_SHADOW" : row.capitalArrivalState };
    });
    const report = buildCommittedLoadedVacuumValidation(modified, snapshots, { ...options, minResolvedTreatments: 999999, minUniqueProjects: 999999, minSpanDays: 999999 });
    const t = report.treatedPerformance;
    const c = report.matchedControlPerformance;
    const lift168 = finite(t?.medianReturnPctByHorizon?.["168"]) !== null && finite(c?.medianReturnPctByHorizon?.["168"]) !== null
      ? t.medianReturnPctByHorizon["168"] - c.medianReturnPctByHorizon["168"] : null;
    return {
      threshold,
      treatments: report.treatments,
      matchedPairsResolved: report.matchedPairsResolved,
      primaryRiskDifferencePct: report.matchedRiskDifferenceBootstrap95?.pointEstimatePct ?? null,
      lower95Pct: report.matchedRiskDifferenceBootstrap95?.lower95Pct ?? null,
      upper95Pct: report.matchedRiskDifferenceBootstrap95?.upper95Pct ?? null,
      median168hReturnLiftPct: round(lift168, 4),
      falseIgnitionPct: t?.falseIgnitionPct ?? null,
    };
  });
}

export function buildCommittedLoadedVacuumAttribution(observations = [], snapshots = [], options = {}) {
  const dataset = buildAttributionDataset(observations, snapshots, options);
  const uniqueProjects = new Set(dataset.map((row) => row.observation.identityKey)).size;
  const dates = dataset.map((row) => ts(row.observation.observedAt)).filter(Boolean);
  const spanDays = dates.length > 1 ? (Math.max(...dates) - Math.min(...dates)) / 86_400_000 : 0;
  const walk = expandingWalkForward(dataset, options);
  const p = walk.predictions;
  const baselineBrier = brier(p, "pBaseline");
  const fullBrier = brier(p, "pFull");
  const blockers = [];
  if (dataset.length < Number(options.minResolvedRows || 120)) blockers.push("NEED_MORE_RESOLVED_ROWS");
  if (uniqueProjects < Number(options.minUniqueProjects || 60)) blockers.push("NEED_MORE_UNIQUE_PROJECTS");
  if (spanDays < Number(options.minSpanDays || 56)) blockers.push("NEED_LONGER_TIME_SPAN");
  if (p.length < Number(options.minOutOfSampleRows || 40)) blockers.push("NEED_MORE_OUT_OF_SAMPLE_ROWS");
  if (fullBrier === null || baselineBrier === null || fullBrier >= baselineBrier) blockers.push("FULL_MODEL_NOT_BETTER_THAN_BASELINE");
  const familyAttribution = [
    familyAttributionResult(p, walk.folds, "supply", "pNoSupply", options),
    familyAttributionResult(p, walk.folds, "arrival", "pNoArrival", options),
    familyAttributionResult(p, walk.folds, "microstructure", "pNoMicrostructure", options),
  ];
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    status: dataset.length ? (p.length ? "WALK_FORWARD_ATTRIBUTION_SHADOW" : "WAITING_FOR_OUT_OF_SAMPLE_FOLDS") : "COLLECTING_RESOLVED_OUTCOMES",
    primaryOutcome: "+25% observed before -15% within 168h; attribution uses only threshold-ordered resolved outcomes",
    featurePolicy: "Frozen pre-outcome values only. Missing values are imputed from each training fold with explicit missingness indicators; imputation is a modeling operation and is not treated as observed evidence.",
    resolvedRows: dataset.length,
    uniqueProjects,
    spanDays: round(spanDays, 2),
    outOfSampleRows: p.length,
    outOfSampleUniqueProjects: new Set(p.map((row) => row.identityKey)).size,
    fullModel: { brier: round(fullBrier), logLoss: round(logLoss(p, "pFull")), expectedCalibrationError: round(ece(p, "pFull")) },
    baselineOnly: { brier: round(baselineBrier), logLoss: round(logLoss(p, "pBaseline")), expectedCalibrationError: round(ece(p, "pBaseline")) },
    fullVsBaselineBrierImprovement: fullBrier !== null && baselineBrier !== null ? round(baselineBrier - fullBrier) : null,
    familyAttribution,
    thresholdRobustness: thresholdRobustness(observations, snapshots, options),
    folds: walk.folds,
    readiness: { state: blockers.length ? "ATTRIBUTION_INCOMPLETE" : "ATTRIBUTION_READY_FOR_REPLICATION_REVIEW", blockers },
    shadowOnly: true,
    rankingInfluence: false,
    productionPromotion: false,
    policy: "V12 attribution is observational and diagnostic, not causal proof. Feature families are evaluated only in chronological out-of-sample folds, test projects are unseen in training by default, and no attribution result can alter production ranking or signal thresholds.",
  };
}

export function runCommittedLoadedVacuumAttribution(observations = [], snapshots = [], options = {}) {
  const report = buildCommittedLoadedVacuumAttribution(observations, snapshots, options);
  if (options.writeReport !== false) {
    fs.mkdirSync(path.dirname(REPORT), { recursive: true });
    fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
  }
  return report;
}

export const COMMITTED_LOADED_VACUUM_ATTRIBUTION_REPORT = REPORT;
export const __committedLoadedVacuumAttributionHooks = {
  FEATURE_DEFINITIONS, PRIMARY_FAMILIES, PRE_REGISTERED_RATIO_THRESHOLDS,
  transformValue, fitPreprocessor, vectorize, fitLogistic, predictLogistic,
  brier, logLoss, ece, bootstrapLossDifference, expandingWalkForward, thresholdRobustness,
};
