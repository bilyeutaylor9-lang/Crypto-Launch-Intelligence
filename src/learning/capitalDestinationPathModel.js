import { capitalPathSignatureLevels } from "./capitalPathFeatureExtractor.js";
import { capitalRadarProjectKey } from "../sensors/chainWideCapitalRadarSensor.js";

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function entropy(probabilities = []) {
  const rows = probabilities.filter((value) => value > 0);
  if (rows.length <= 1) return 0;
  const raw = -rows.reduce((sum, p) => sum + p * Math.log(p), 0);
  return raw / Math.log(rows.length);
}

function wilsonLower(successes, total, z = 1.96) {
  if (!total) return 0;
  const p = successes / total;
  const denominator = 1 + (z * z) / total;
  const center = p + (z * z) / (2 * total);
  const radius = z * Math.sqrt((p * (1 - p)) / total + (z * z) / (4 * total * total));
  return Math.max(0, (center - radius) / denominator);
}

function validExample(example, asOfMs = Infinity) {
  const featureMs = Date.parse(example?.feature?.featureObservedAt || "");
  const outcomeMs = Date.parse(example?.outcomeObservedAt || "");
  return Boolean(
    example?.feature?.chain &&
    example?.destinationProjectKey &&
    Number.isFinite(featureMs) &&
    Number.isFinite(outcomeMs) &&
    outcomeMs > featureMs &&
    outcomeMs <= asOfMs
  );
}

function dedupeExamples(examples = [], asOfMs = Infinity) {
  const seen = new Set();
  const rows = [];
  for (const example of (Array.isArray(examples) ? examples : []).filter((row) => validExample(row, asOfMs)).sort((a, b) => Date.parse(a.outcomeObservedAt) - Date.parse(b.outcomeObservedAt))) {
    const key = example.episodeKey || `${example.feature.chain}|${example.feature.walletAddress}|${example.destinationProjectKey}|${String(example.outcomeObservedAt).slice(0, 13)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(example);
  }
  return rows;
}

function buildGroup(rows = [], levelIndex = 0) {
  const bySignature = new Map();
  for (const row of rows) {
    const signature = capitalPathSignatureLevels(row.feature)[levelIndex];
    if (!signature) continue;
    const group = bySignature.get(signature.key) || { level: signature.level, key: signature.key, examples: [] };
    group.examples.push(row);
    bySignature.set(signature.key, group);
  }
  return bySignature;
}

export function trainCapitalDestinationPathModel(examples = [], options = {}) {
  const asOfMs = options.asOf ? Date.parse(options.asOf) : Date.now();
  const safeAsOf = Number.isFinite(asOfMs) ? asOfMs : Date.now();
  const rows = dedupeExamples(examples, safeAsOf);
  const groups = [0, 1, 2, 3, 4].map((index) => buildGroup(rows, index));
  return {
    schemaVersion: 1,
    trainedAt: new Date().toISOString(),
    asOf: new Date(safeAsOf).toISOString(),
    trainingExamples: rows.length,
    uniqueWallets: new Set(rows.map((row) => row.feature.walletAddress).filter(Boolean)).size,
    uniqueDestinations: new Set(rows.map((row) => row.destinationProjectKey)).size,
    groups,
    policy: "Leakage-safe empirical path model. Training outcomes must be observed strictly after their feature snapshot and no later than the prediction as-of time. Target-specific approvals and destination identities are excluded from model features.",
    shadowOnly: true,
    rankingInfluence: false,
  };
}

function distributionForGroup(group, candidateKeys = [], alpha = 0.5) {
  const allowed = new Set((Array.isArray(candidateKeys) ? candidateKeys : []).filter(Boolean));
  const counts = new Map();
  const wallets = new Set();
  for (const example of group?.examples || []) {
    if (allowed.size && !allowed.has(example.destinationProjectKey)) continue;
    counts.set(example.destinationProjectKey, (counts.get(example.destinationProjectKey) || 0) + 1);
    if (example.feature.walletAddress) wallets.add(example.feature.walletAddress);
  }
  const destinations = allowed.size ? [...allowed] : [...counts.keys()];
  const support = [...counts.values()].reduce((sum, value) => sum + value, 0);
  if (!support || !destinations.length) return { support: 0, uniqueWallets: wallets.size, probabilities: [] };
  const denominator = support + alpha * destinations.length;
  const probabilities = destinations.map((key) => ({
    projectKey: key,
    count: counts.get(key) || 0,
    probability: ((counts.get(key) || 0) + alpha) / denominator,
  })).sort((a, b) => b.probability - a.probability || b.count - a.count || a.projectKey.localeCompare(b.projectKey));
  return { support, uniqueWallets: wallets.size, probabilities };
}

export function predictCapitalDestination(feature = {}, model = {}, candidateKeys = [], options = {}) {
  const minSupport = Math.max(3, Number(options.minSupport || process.env.IGNITION_CAPITAL_PATH_MIN_SUPPORT || 12));
  const minUniqueWallets = Math.max(2, Number(options.minUniqueWallets || process.env.IGNITION_CAPITAL_PATH_MIN_UNIQUE_WALLETS || 6));
  const minProbability = clamp(options.minProbability ?? process.env.IGNITION_CAPITAL_PATH_MIN_PROBABILITY ?? 0.55, 0.34, 0.95);
  const minMargin = clamp(options.minMargin ?? process.env.IGNITION_CAPITAL_PATH_MIN_MARGIN ?? 0.15, 0.05, 0.6);
  const minWilson = clamp(options.minWilsonLower ?? process.env.IGNITION_CAPITAL_PATH_MIN_WILSON ?? 0.30, 0.05, 0.8);
  const maxEntropy = clamp(options.maxEntropy ?? process.env.IGNITION_CAPITAL_PATH_MAX_ENTROPY ?? 0.82, 0.1, 1);
  const alpha = Math.max(0.01, Number(options.alpha || 0.5));
  const signatures = capitalPathSignatureLevels(feature);
  let bestAmbiguous = null;

  const maxLevelIndex = options.allowChainPriorPrediction === true ? signatures.length - 1 : Math.min(3, signatures.length - 1);
  for (let levelIndex = 0; levelIndex <= maxLevelIndex; levelIndex += 1) {
    const signature = signatures[levelIndex];
    const group = model?.groups?.[levelIndex]?.get?.(signature.key);
    if (!group) continue;
    const distribution = distributionForGroup(group, candidateKeys, alpha);
    if (distribution.support < minSupport || distribution.uniqueWallets < minUniqueWallets) continue;
    const top = distribution.probabilities[0];
    const second = distribution.probabilities[1] || { probability: 0 };
    const margin = top.probability - second.probability;
    const normalizedEntropy = entropy(distribution.probabilities.map((row) => row.probability));
    const lower = wilsonLower(top.count, distribution.support);
    const diagnostic = {
      state: "ABSTAIN_AMBIGUOUS",
      featureSnapshotId: feature.snapshotId || null,
      signatureLevel: signature.level,
      signatureKey: signature.key,
      support: distribution.support,
      uniqueWallets: distribution.uniqueWallets,
      empiricalProbabilityPct: Number((top.probability * 100).toFixed(2)),
      empiricalWilsonLowerPct: Number((lower * 100).toFixed(2)),
      marginPct: Number((margin * 100).toFixed(2)),
      normalizedEntropy: Number(normalizedEntropy.toFixed(4)),
      predictedProjectKey: top.projectKey,
      probabilities: distribution.probabilities.slice(0, 10).map((row) => ({ ...row, probabilityPct: Number((row.probability * 100).toFixed(2)) })),
      shadowOnly: true,
      rankingInfluence: false,
      loadedVacuumInfluence: false,
    };
    bestAmbiguous ||= diagnostic;
    if (top.probability >= minProbability && margin >= minMargin && lower >= minWilson && normalizedEntropy <= maxEntropy) {
      return {
        ...diagnostic,
        state: "PREDICTED_DESTINATION_SHADOW",
        confidencePct: Math.round(Math.min(95, 35 + Math.log10(distribution.support + 1) * 15 + margin * 35 + lower * 20)),
        warning: "This is an empirical historical-path probability, not observed target demand. It cannot trigger Loaded Vacuum or production ranking in v9.",
      };
    }
  }

  if (bestAmbiguous) return { ...bestAmbiguous, warning: "Historical analogs exist but the destination distribution is too ambiguous to use." };
  return {
    state: "ABSTAIN_INSUFFICIENT_ANALOGS",
    featureSnapshotId: feature.snapshotId || null,
    predictedProjectKey: null,
    support: 0,
    probabilities: [],
    confidencePct: null,
    shadowOnly: true,
    rankingInfluence: false,
    loadedVacuumInfluence: false,
    warning: "Insufficient leakage-safe historical analogs. No destination is inferred.",
  };
}

export function inferCapitalDestinations(features = [], model = {}, projects = [], options = {}) {
  const candidateByChain = new Map();
  for (const [index, project] of (Array.isArray(projects) ? projects : []).entries()) {
    const chain = String(project.chain || project.canonicalChain || project.network || project.chainId || "").toLowerCase();
    const key = capitalRadarProjectKey(project, index);
    if (!chain || !key) continue;
    const rows = candidateByChain.get(chain) || [];
    if (!rows.includes(key)) rows.push(key);
    candidateByChain.set(chain, rows);
  }
  return (Array.isArray(features) ? features : []).map((feature) => ({
    feature,
    prediction: predictCapitalDestination(feature, model, candidateByChain.get(feature.chain) || [], options),
  }));
}

export const __capitalDestinationPathModelTestHooks = { entropy, wilsonLower, dedupeExamples, distributionForGroup };
