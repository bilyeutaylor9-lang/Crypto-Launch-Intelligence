import { capitalPathSignatureLevels } from "./capitalPathFeatureExtractor.js";

const DEFAULT_HORIZONS = [0.25, 1, 3, 6, 12, 24, 72];
const BUY_TYPES = new Set(["TARGET_BUY", "OUT_OF_UNIVERSE_BUY"]);

function clamp(v, min = 0, max = 1) { return Math.max(min, Math.min(max, Number(v) || 0)); }
function finite(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }
function median(values = []) {
  const rows = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (!rows.length) return null;
  const mid = Math.floor(rows.length / 2);
  return rows.length % 2 ? rows[mid] : (rows[mid - 1] + rows[mid]) / 2;
}
function wilsonLower(successes, total, z = 1.96) {
  if (!total) return 0;
  const p = successes / total;
  const d = 1 + z * z / total;
  const c = p + z * z / (2 * total);
  const r = z * Math.sqrt((p * (1 - p)) / total + z * z / (4 * total * total));
  return Math.max(0, (c - r) / d);
}
function dedupe(examples = [], asOfMs = Infinity) {
  const seen = new Set();
  const rows = [];
  for (const row of (Array.isArray(examples) ? examples : []).filter((item) => {
    const f = Date.parse(item?.feature?.featureObservedAt || "");
    const o = Date.parse(item?.outcomeObservedAt || "");
    return item?.feature?.chain && item?.outcomeType && Number.isFinite(f) && Number.isFinite(o) && o > f && o <= asOfMs;
  }).sort((a, b) => Date.parse(a.outcomeObservedAt) - Date.parse(b.outcomeObservedAt))) {
    const key = row.episodeKey || row.snapshotId;
    if (!key || seen.has(key)) continue;
    seen.add(key); rows.push(row);
  }
  return rows;
}
function buildGroup(rows = [], levelIndex = 0) {
  const map = new Map();
  for (const row of rows) {
    const sig = capitalPathSignatureLevels(row.feature)[levelIndex];
    if (!sig) continue;
    const group = map.get(sig.key) || { level: sig.level, key: sig.key, examples: [] };
    group.examples.push(row); map.set(sig.key, group);
  }
  return map;
}

export function trainCapitalCommitmentModel(examples = [], options = {}) {
  const asOfMs = options.asOf ? Date.parse(options.asOf) : Date.now();
  const safeAsOf = Number.isFinite(asOfMs) ? asOfMs : Date.now();
  const rows = dedupe(examples, safeAsOf);
  return {
    schemaVersion: 1,
    trainedAt: new Date().toISOString(),
    asOf: new Date(safeAsOf).toISOString(),
    trainingExamples: rows.length,
    uniqueWallets: new Set(rows.map((row) => row.feature.walletAddress).filter(Boolean)).size,
    groups: [0, 1, 2, 3, 4].map((index) => buildGroup(rows, index)),
    horizonsHours: options.horizonsHours || DEFAULT_HORIZONS,
    shadowOnly: true,
    rankingInfluence: false,
    policy: "Empirical competing-risk capital commitment model. Unresolved/right-censored episodes are not silently converted into failures. NO_DEPLOYMENT_EXPIRED labels require explicitly complete observation coverage.",
  };
}

function groupStats(group = {}, horizons = DEFAULT_HORIZONS) {
  const rows = group.examples || [];
  const uniqueWallets = new Set(rows.map((r) => r.feature.walletAddress).filter(Boolean)).size;
  const terminalCounts = {};
  for (const row of rows) terminalCounts[row.outcomeType] = (terminalCounts[row.outcomeType] || 0) + 1;
  const fractions = rows.filter((r) => BUY_TYPES.has(r.outcomeType)).map((r) => finite(r.deploymentFraction)).filter((v) => v !== null && v >= 0 && v <= 1);
  const deploymentFractionMedian = median(fractions);
  const byHorizon = Object.fromEntries(horizons.map((h) => {
    const buys = rows.filter((r) => BUY_TYPES.has(r.outcomeType) && finite(r.timeToOutcomeHours) !== null && r.timeToOutcomeHours <= h).length;
    const anyTerminal = rows.filter((r) => finite(r.timeToOutcomeHours) !== null && r.timeToOutcomeHours <= h).length;
    return [String(h), {
      horizonHours: h,
      deploymentProbability: rows.length ? buys / rows.length : 0,
      deploymentWilsonLower: wilsonLower(buys, rows.length),
      anyTerminalProbability: rows.length ? anyTerminal / rows.length : 0,
      unresolvedSurvivalProxy: rows.length ? 1 - anyTerminal / rows.length : 1,
      deploymentCount: buys,
      support: rows.length,
    }];
  }));
  return { support: rows.length, uniqueWallets, terminalCounts, deploymentFractionMedian, fractionSupport: fractions.length, byHorizon };
}

export function predictCapitalCommitment(feature = {}, model = {}, options = {}) {
  const minSupport = Math.max(4, Number(options.minSupport || process.env.IGNITION_COMMITMENT_MIN_SUPPORT || 16));
  const minUniqueWallets = Math.max(3, Number(options.minUniqueWallets || process.env.IGNITION_COMMITMENT_MIN_UNIQUE_WALLETS || 8));
  const minFractionSupport = Math.max(2, Number(options.minFractionSupport || process.env.IGNITION_COMMITMENT_MIN_FRACTION_SUPPORT || 5));
  const minWilson = clamp(options.minWilsonLower ?? process.env.IGNITION_COMMITMENT_MIN_WILSON ?? 0.12, 0, 0.8);
  const signatures = capitalPathSignatureLevels(feature);
  const horizons = model.horizonsHours || DEFAULT_HORIZONS;
  let fallback = null;
  for (let levelIndex = 0; levelIndex <= Math.min(3, signatures.length - 1); levelIndex += 1) {
    const sig = signatures[levelIndex];
    const group = model?.groups?.[levelIndex]?.get?.(sig.key);
    if (!group) continue;
    const stats = groupStats(group, horizons);
    if (stats.support < minSupport || stats.uniqueWallets < minUniqueWallets) continue;
    const six = stats.byHorizon["6"] || stats.byHorizon[String(horizons.find((h) => h >= 6) ?? horizons.at(-1))];
    fallback = { sig, stats };
    if (!six || six.deploymentWilsonLower < minWilson) continue;
    return {
      state: stats.fractionSupport >= minFractionSupport ? "COMMITMENT_CURVE_SHADOW" : "COMMITMENT_PROBABILITY_ONLY_SHADOW",
      signatureLevel: sig.level,
      signatureKey: sig.key,
      support: stats.support,
      uniqueWallets: stats.uniqueWallets,
      terminalCounts: stats.terminalCounts,
      expectedDeploymentFraction: stats.fractionSupport >= minFractionSupport ? Number(stats.deploymentFractionMedian.toFixed(4)) : null,
      deploymentFractionSupport: stats.fractionSupport,
      arrivalCurve: Object.values(stats.byHorizon).map((row) => ({
        horizonHours: row.horizonHours,
        deploymentProbabilityPct: Number((row.deploymentProbability * 100).toFixed(2)),
        deploymentWilsonLowerPct: Number((row.deploymentWilsonLower * 100).toFixed(2)),
        intentSurvivalProxyPct: Number((row.unresolvedSurvivalProxy * 100).toFixed(2)),
        support: row.support,
      })),
      shadowOnly: true,
      rankingInfluence: false,
      loadedVacuumInfluence: false,
      warning: "Commitment probabilities are empirical competing-risk diagnostics, not observed demand. Fraction and timing remain unknown when evidence is insufficient.",
    };
  }
  if (fallback) {
    return {
      state: "ABSTAIN_WEAK_COMMITMENT_EVIDENCE",
      signatureLevel: fallback.sig.level,
      support: fallback.stats.support,
      uniqueWallets: fallback.stats.uniqueWallets,
      arrivalCurve: [],
      expectedDeploymentFraction: null,
      shadowOnly: true,
      rankingInfluence: false,
      loadedVacuumInfluence: false,
    };
  }
  return {
    state: "ABSTAIN_INSUFFICIENT_COMMITMENT_HISTORY",
    support: 0,
    uniqueWallets: 0,
    arrivalCurve: [],
    expectedDeploymentFraction: null,
    shadowOnly: true,
    rankingInfluence: false,
    loadedVacuumInfluence: false,
  };
}

export function inferCapitalCommitments(features = [], model = {}, options = {}) {
  return (Array.isArray(features) ? features : []).map((feature) => ({ feature, commitment: predictCapitalCommitment(feature, model, options) }));
}

export const __capitalCommitmentModelHooks = { median, wilsonLower, dedupe, groupStats };
