import { finite, mean, median, percentile, seededRandom, strictIdentityKey, timestamp } from "./productionMath.js";

function resolveReturn(row = {}) {
  return finite(row.realizedReturnPct ?? row.netReturnPct ?? row.returnPct ?? row.outcome?.returnAt24hPct ?? row.outcome?.returnAt168hPct);
}

function isHit(row, target = 25) {
  const value = resolveReturn(row);
  return value !== null && value >= target;
}

function isCatastrophic(row) {
  const value = resolveReturn(row);
  return row.failure === true || row.outcome?.rugged === true || row.outcome?.liquiditySurvived === false || (value !== null && value <= -50);
}

function summarize(rows = [], target = 25) {
  const resolved = (Array.isArray(rows) ? rows : []).filter((row) => resolveReturn(row) !== null);
  const returns = resolved.map(resolveReturn);
  const hits = resolved.filter((row) => isHit(row, target)).length;
  const catastrophic = resolved.filter(isCatastrophic).length;
  return {
    samples: resolved.length,
    uniqueProjects: new Set(resolved.map(strictIdentityKey).filter(Boolean)).size,
    averageReturnPct: mean(returns),
    medianReturnPct: median(returns),
    returnP10Pct: percentile(returns, 0.10),
    returnP90Pct: percentile(returns, 0.90),
    hitRate: resolved.length ? hits / resolved.length : null,
    catastrophicLossRate: resolved.length ? catastrophic / resolved.length : null,
  };
}

function featureValue(row = {}, key) {
  return finite(row[key] ?? row.frozenFeatures?.[key] ?? row.research?.diagnostic?.[key]);
}

function logDistance(left, right) {
  if (left === null || right === null) return null;
  return Math.abs(Math.log1p(Math.max(0, left)) - Math.log1p(Math.max(0, right)));
}

export function verificationControlDistance(left = {}, right = {}, options = {}) {
  const fields = options.matchFields || [
    ["liquidityUsd", 1.0],
    ["marketCapUsd", 1.0],
    ["volume24hUsd", 0.8],
    ["evidenceCoveragePct", 0.5],
  ];
  let total = 0;
  let weight = 0;
  for (const [field, fieldWeight] of fields) {
    const distance = logDistance(featureValue(left, field), featureValue(right, field));
    if (distance === null) continue;
    total += distance * Number(fieldWeight);
    weight += Number(fieldWeight);
  }
  const leftChain = String(left.chain || "").toLowerCase();
  const rightChain = String(right.chain || "").toLowerCase();
  if (leftChain && rightChain && leftChain !== rightChain) total += 3;
  const leftRegime = left.globalMarketRegimeState || left.marketRegime || null;
  const rightRegime = right.globalMarketRegimeState || right.marketRegime || null;
  if (leftRegime && rightRegime && leftRegime !== rightRegime) total += 1;
  const leftAt = timestamp(left.decisionAt || left.generatedAt || left.startAt || left.observedAt);
  const rightAt = timestamp(right.startAt || right.decisionAt || right.generatedAt || right.observedAt);
  if (leftAt !== null && rightAt !== null) {
    const dayDistance = Math.abs(leftAt - rightAt) / 86_400_000;
    if (dayDistance > Number(options.controlWindowDays || 14)) return Infinity;
    total += dayDistance / Math.max(1, Number(options.controlWindowDays || 14));
  }
  return weight ? total / weight : Infinity;
}

export function buildMatchedVerificationControls(selections = [], universeRows = [], options = {}) {
  const maxControlsPerSelection = Math.max(1, Number(options.maxControlsPerSelection || 3));
  const controls = [];
  const selectedKeys = new Set((Array.isArray(selections) ? selections : []).map(strictIdentityKey).filter(Boolean));
  const usedControlIds = new Set();
  for (const selection of Array.isArray(selections) ? selections : []) {
    const selectedKey = strictIdentityKey(selection);
    if (!selectedKey) continue;
    const candidates = (Array.isArray(universeRows) ? universeRows : [])
      .filter((row) => { const key = strictIdentityKey(row); return key && !selectedKeys.has(key) && !usedControlIds.has(key) && resolveReturn(row) !== null; })
      .map((row) => ({ row, distance: verificationControlDistance(selection, row, options) }))
      .filter((item) => Number.isFinite(item.distance))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, maxControlsPerSelection);
    for (const { row, distance } of candidates) {
      usedControlIds.add(strictIdentityKey(row));
      controls.push({ ...row, __matchedTo: selectedKey, __matchDistance: distance });
    }
  }
  return controls;
}

function bootstrapDifference(treatment, controls, statistic, options = {}) {
  const iterations = Math.max(200, Number(options.iterations || 1200));
  const random = seededRandom(Number(options.seed || 739391));
  if (!treatment.length || !controls.length) return { status: "INSUFFICIENT_SAMPLE", lower: null, upper: null, estimate: null };
  const cluster = (rows) => {
    const map = new Map();
    for (const row of rows) {
      const key = strictIdentityKey(row);
      if (!key) continue;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(row);
    }
    return [...map.values()];
  };
  const treatmentClusters = cluster(treatment);
  const controlClusters = cluster(controls);
  if (treatmentClusters.length < Number(options.minimumBootstrapClusters || 20) || controlClusters.length < Number(options.minimumBootstrapClusters || 20)) {
    return { status: "INSUFFICIENT_CLUSTERS", treatmentClusters: treatmentClusters.length, controlClusters: controlClusters.length, lower: null, upper: null, estimate: statistic(treatment) - statistic(controls) };
  }
  const estimate = statistic(treatment) - statistic(controls);
  const sampleClusters = (clusters) => Array.from({ length: clusters.length }, () => clusters[Math.floor(random() * clusters.length)]).flat();
  const estimates = [];
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const value = statistic(sampleClusters(treatmentClusters)) - statistic(sampleClusters(controlClusters));
    if (Number.isFinite(value)) estimates.push(value);
  }
  estimates.sort((a, b) => a - b);
  return { status: estimates.length ? "AVAILABLE" : "UNAVAILABLE", method: "candidate-cluster-bootstrap", iterations, treatmentClusters: treatmentClusters.length, controlClusters: controlClusters.length, estimate, lower: percentile(estimates, 0.025), upper: percentile(estimates, 0.975) };
}

const returnStatistic = (rows) => mean(rows.map(resolveReturn).filter((v) => v !== null)) ?? 0;
const hitStatistic = (rows, target) => rows.length ? rows.filter((row) => isHit(row, target)).length / rows.length : 0;
const catastropheStatistic = (rows) => rows.length ? rows.filter(isCatastrophic).length / rows.length : 0;
const regimeOf = (row = {}) => String(row.globalMarketRegimeState ?? row.marketRegime ?? row.regime ?? "UNKNOWN").toUpperCase();

function regimeSlices(selections, controls, target, options) {
  const regimes = new Set([...selections.map(regimeOf), ...controls.map(regimeOf)]);
  const slices = {};
  for (const regime of regimes) {
    const t = selections.filter((row) => regimeOf(row) === regime);
    const c = controls.filter((row) => regimeOf(row) === regime);
    if (!t.length || !c.length) continue;
    slices[regime] = {
      selection: summarize(t, target),
      controls: summarize(c, target),
      returnDifference: bootstrapDifference(t, c, returnStatistic, { ...options, seed: Number(options.seed || 739391) + regime.length }),
      hitRateDifference: bootstrapDifference(t, c, (rows) => hitStatistic(rows, target), { ...options, seed: Number(options.seed || 739391) + regime.length * 7 }),
    };
  }
  return slices;
}

export function runEdgeVerificationProgram(selections = [], universeRows = [], options = {}) {
  const target = Number(options.targetReturnPct || 25);
  const treatment = (Array.isArray(selections) ? selections : []).filter((row) => strictIdentityKey(row) && resolveReturn(row) !== null);
  const controls = buildMatchedVerificationControls(treatment, universeRows, options);
  const selectionMetrics = summarize(treatment, target);
  const controlMetrics = summarize(controls, target);
  const returnDifference = bootstrapDifference(treatment, controls, returnStatistic, options);
  const hitRateDifference = bootstrapDifference(treatment, controls, (rows) => hitStatistic(rows, target), { ...options, seed: Number(options.seed || 739391) + 11 });
  const catastropheDifference = bootstrapDifference(treatment, controls, catastropheStatistic, { ...options, seed: Number(options.seed || 739391) + 23 });
  const minimumSelections = Number(options.minimumSelections || 200);
  const minimumProjects = Number(options.minimumUniqueProjects || 80);
  const enoughData = selectionMetrics.samples >= minimumSelections && selectionMetrics.uniqueProjects >= minimumProjects && controlMetrics.samples >= minimumSelections;
  const returnVerified = returnDifference.lower !== null && returnDifference.lower > 0 && (returnDifference.estimate ?? 0) >= Number(options.minimumReturnEdgePct || 3);
  const hitVerified = hitRateDifference.lower !== null && hitRateDifference.lower > 0 && (hitRateDifference.estimate ?? 0) >= Number(options.minimumHitRateEdge || 0.03);
  const catastropheSafe = catastropheDifference.upper !== null && catastropheDifference.upper <= Number(options.maximumCatastropheDelta || 0.02);
  let edgeState = "DIAGNOSTIC_INSUFFICIENT_SAMPLE";
  if (enoughData) {
    if (returnVerified && hitVerified && catastropheSafe) edgeState = "DIAGNOSTIC_POSITIVE_SEPARATION";
    else edgeState = "DIAGNOSTIC_NO_SEPARATION";
  }
  return {
    schemaVersion: 1,
    generatedAt: options.now || new Date().toISOString(),
    edgeState,
    targetReturnPct: target,
    selection: selectionMetrics,
    matchedControls: controlMetrics,
    incremental: { averageReturnPct: returnDifference, hitRate: hitRateDifference, catastrophicLossRate: catastropheDifference },
    regimeSlices: regimeSlices(treatment, controls, target, options),
    gates: { enoughData, returnVerified, hitVerified, catastropheSafe, minimumSelections, minimumUniqueProjects: minimumProjects },
    certificateEligible: false,
    policy: {
      forwardOutcomesOnly: true,
      controlsFrozenProspectively: false,
      postOutcomeControlSelection: true,
      certificateEligible: false,
      diagnosticOnly: true,
      matchedControlsRequired: true,
      confidenceIntervalsRequired: true,
      automaticTrading: false,
      automaticProductionPromotion: false,
    },
  };
}

export const __edgeVerificationHooks = { resolveReturn, isHit, isCatastrophic, summarize, bootstrapDifference, regimeOf };
