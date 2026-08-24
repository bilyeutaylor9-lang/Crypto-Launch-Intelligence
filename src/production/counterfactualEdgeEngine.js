import { clamp, finite, identityKey, mean, median } from "./productionMath.js";

const DEFAULT_MATCH_FIELDS = Object.freeze([
  ["liquidityUsd", 1.0],
  ["marketCapUsd", 1.0],
  ["volume24hUsd", 0.8],
  ["riskScore", 0.6],
  ["evidenceCoveragePct", 0.6],
]);

function logDistance(a, b) {
  const left = Math.log1p(Math.max(0, finite(a) ?? 0));
  const right = Math.log1p(Math.max(0, finite(b) ?? 0));
  return Math.abs(left - right);
}

function value(row, key) {
  return finite(row[key] ?? row.frozenFeatures?.[key]);
}

export function counterfactualDistance(left = {}, right = {}, options = {}) {
  const fields = options.matchFields || DEFAULT_MATCH_FIELDS;
  let weighted = 0;
  let total = 0;
  for (const [key, weight] of fields) {
    const a = value(left, key);
    const b = value(right, key);
    if (a === null || b === null) continue;
    weighted += Number(weight) * logDistance(a, b);
    total += Number(weight);
  }
  const chainPenalty =
    String(left.chain || "").toLowerCase() === String(right.chain || "").toLowerCase() ? 0 : 2;
  const regimePenalty =
    left.globalMarketRegimeState && right.globalMarketRegimeState &&
    left.globalMarketRegimeState !== right.globalMarketRegimeState ? 0.8 : 0;
  return total ? weighted / total + chainPenalty + regimePenalty : Infinity;
}

export function selectMatchedCounterfactuals(target = {}, historical = [], options = {}) {
  const targetKey = identityKey(target);
  const maxControls = Math.max(5, Number(options.maxControls || 50));
  return (Array.isArray(historical) ? historical : [])
    .filter((row) => identityKey(row) !== targetKey)
    .map((row) => ({ row, distance: counterfactualDistance(target, row, options) }))
    .filter((item) => Number.isFinite(item.distance))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, maxControls);
}

export function estimateCounterfactualEdge(target = {}, historical = [], options = {}) {
  const controls = selectMatchedCounterfactuals(target, historical, options);
  const targetSignals = new Set(target.verifiedSignals || target.signals || []);
  const treatmentRows = controls.filter(({ row }) =>
    (row.verifiedSignals || row.signals || []).some((signal) => targetSignals.has(signal))
  );
  const controlRows = controls.filter(({ row }) =>
    !(row.verifiedSignals || row.signals || []).some((signal) => targetSignals.has(signal))
  );

  const outcome = (row) => finite(
    row.netReturnPct ??
    row.returnPct ??
    row.outcome?.returnAt168hPct ??
    row.outcome?.returnAt24hPct
  );

  const treatedReturns = treatmentRows.map(({ row }) => outcome(row)).filter((v) => v !== null);
  const controlReturns = controlRows.map(({ row }) => outcome(row)).filter((v) => v !== null);
  const treatedMean = mean(treatedReturns);
  const controlMean = mean(controlReturns);
  const incremental = treatedMean !== null && controlMean !== null ? treatedMean - controlMean : null;

  const strength = incremental === null
    ? 0
    : clamp((incremental / 30) * Math.min(1, treatedReturns.length / 30) * Math.min(1, controlReturns.length / 30));

  return {
    identityKey: identityKey(target),
    matchedCandidates: controls.length,
    treatmentSamples: treatedReturns.length,
    controlSamples: controlReturns.length,
    treatmentAverageReturnPct: treatedMean,
    controlAverageReturnPct: controlMean,
    treatmentMedianReturnPct: median(treatedReturns),
    controlMedianReturnPct: median(controlReturns),
    estimatedIncrementalReturnPct: incremental,
    counterfactualEdgeStrength: Number(strength.toFixed(4)),
    counterfactualEdgeStrengthPct: Number((strength * 100).toFixed(2)),
    state:
      treatedReturns.length < 10 || controlReturns.length < 10
        ? "INSUFFICIENT_COUNTERFACTUAL_SAMPLE"
        : incremental > 10
          ? "POSITIVE_INCREMENTAL_EDGE"
          : incremental < -10
            ? "NEGATIVE_INCREMENTAL_EDGE"
            : "NO_CLEAR_INCREMENTAL_EDGE",
    controls: controls.slice(0, Number(options.reportControls || 10)).map(({ row, distance }) => ({
      identityKey: identityKey(row),
      symbol: row.symbol || null,
      distance: Number(distance.toFixed(5)),
      returnPct: outcome(row),
    })),
    policy: {
      causalClaimAllowed: false,
      matchedObservationalEstimateOnly: true,
      productionRankingInfluence: false,
    },
  };
}
