import { mean, median, num, quantile } from "../edge/edgeMath.js";
import { writeAtomicJson } from "../production/atomicArtifactStore.js";
import { featureEligibility, safeEvidenceValue } from "./featureEvidencePolicy.js";

const DEFAULT_FEATURES = [
  "productionScore",
  "projectClockScore",
  "capitalClockScore",
  "attentionClockScore",
  "divergenceScore",
  "leadStage",
  "structuralBreakScore",
  "fakeMomentumRiskScore",
  "sequenceSimilarity",
  "residualBlindspotSimilarity",
];

function finite(values) {
  return values.map(num).filter((value) => value !== null && Number.isFinite(value));
}

function evidenceValue(row, feature, options = {}) {
  const evidence = row?.evidence?.[feature];
  if (!evidence) return null;
  return safeEvidenceValue(evidence.value, evidence.state, options);
}

function winsorizedMean(values, lower = 0.05, upper = 0.95) {
  const active = finite(values);
  if (!active.length) return null;
  const low = quantile(active, lower);
  const high = quantile(active, upper);
  return mean(active.map((value) => Math.max(low, Math.min(high, value))));
}

function outcomeReturn(row, horizon) {
  return num(row?.outcomes?.[String(horizon)]?.endReturnPct);
}

function thresholdRate(rows, horizon, threshold, direction = "gte") {
  const values = rows.map((row) => outcomeReturn(row, horizon)).filter((value) => value !== null);
  if (!values.length) return null;
  const hits = values.filter((value) => direction === "gte" ? value >= threshold : value <= threshold).length;
  return hits / values.length * 100;
}

function bucketByQuantiles(rows, feature, options = {}) {
  const bucketCount = Number(options.buckets ?? 3);
  const valued = rows
    .map((row) => ({ row, value: evidenceValue(row, feature, options) }))
    .filter(({ value }) => value !== null)
    .sort((left, right) => left.value - right.value);
  if (valued.length < bucketCount) return [];
  return Array.from({ length: bucketCount }, (_, index) => {
    const start = Math.floor(index * valued.length / bucketCount);
    const end = Math.floor((index + 1) * valued.length / bucketCount);
    return {
      label: `Q${index + 1}`,
      rows: valued.slice(start, end).map(({ row }) => row),
      min: valued[start]?.value ?? null,
      max: valued[Math.max(start, end - 1)]?.value ?? null,
    };
  });
}

function summarizeBucket(bucket, horizon) {
  const returns = bucket.rows.map((row) => outcomeReturn(row, horizon)).filter((value) => value !== null);
  return {
    bucket: bucket.label,
    n: returns.length,
    minFeatureValue: bucket.min,
    maxFeatureValue: bucket.max,
    medianReturnPct: median(returns),
    winsorizedMeanReturnPct: winsorizedMean(returns),
    hit25Pct: thresholdRate(bucket.rows, horizon, 25),
    hit50Pct: thresholdRate(bucket.rows, horizon, 50),
    hit100Pct: thresholdRate(bucket.rows, horizon, 100),
    loss15Pct: thresholdRate(bucket.rows, horizon, -15, "lte"),
    loss20Pct: thresholdRate(bucket.rows, horizon, -20, "lte"),
  };
}

function featureRank(rows, feature, horizon, options = {}) {
  const eligibility = featureEligibility(rows, feature, options);
  if (eligibility.status !== "ELIGIBLE") {
    return { feature, horizon, eligibility, status: "NOT_RANKED" };
  }
  const summaries = bucketByQuantiles(rows, feature, options)
    .map((bucket) => summarizeBucket(bucket, horizon))
    .filter((bucket) => bucket.n >= Number(options.minBucketN ?? 10));
  if (summaries.length < 2) {
    return { feature, horizon, eligibility, status: "NOT_RANKED", reason: "INSUFFICIENT_BUCKETS" };
  }
  summaries.sort((left, right) =>
    (right.medianReturnPct ?? -Infinity) - (left.medianReturnPct ?? -Infinity)
  );
  const best = summaries[0];
  const worst = summaries.at(-1);
  return {
    feature,
    horizon,
    eligibility,
    status: "EXPLORATORY",
    bestBucket: best,
    worstBucket: worst,
    medianSpreadPct: (best.medianReturnPct ?? 0) - (worst.medianReturnPct ?? 0),
    buckets: summaries,
    automaticPromotion: false,
  };
}

function combinations(items, size) {
  const output = [];
  function choose(start, selected) {
    if (selected.length === size) {
      output.push([...selected]);
      return;
    }
    for (let index = start; index < items.length; index += 1) {
      selected.push(items[index]);
      choose(index + 1, selected);
      selected.pop();
    }
  }
  choose(0, []);
  return output;
}

function rowPassesCombination(row, combination, medians, options) {
  return combination.every((feature) => {
    const value = evidenceValue(row, feature, options);
    const midpoint = medians[feature];
    if (value === null || midpoint === null) return false;
    return /fakeMomentumRisk/i.test(feature) ? value <= midpoint : value >= midpoint;
  });
}

export function buildAlphaFeatureLeaderboard(rows = [], options = {}) {
  const horizons = options.horizons || [6, 24, 72, 168];
  const features = options.features || DEFAULT_FEATURES;
  const eligibleStates = options.eligibleStates || ["OBSERVED"];
  const analysisOptions = { ...options, eligibleStates };
  const featureRankings = horizons.flatMap((horizon) =>
    features.map((feature) => featureRank(rows, feature, horizon, analysisOptions))
  );
  const eligibleFeatures = features.filter((feature) =>
    featureEligibility(rows, feature, analysisOptions).status === "ELIGIBLE"
  );
  const medians = Object.fromEntries(eligibleFeatures.map((feature) => [
    feature,
    median(rows.map((row) => evidenceValue(row, feature, analysisOptions)).filter((value) => value !== null)),
  ]));

  const interactionRankings = [];
  for (const size of [2, 3]) {
    for (const combination of combinations(eligibleFeatures, size)) {
      const selected = rows.filter((row) => rowPassesCombination(row, combination, medians, analysisOptions));
      for (const horizon of horizons) {
        const returns = selected.map((row) => outcomeReturn(row, horizon)).filter((value) => value !== null);
        if (returns.length < Number(options.minComboN ?? 20)) continue;
        interactionRankings.push({
          combo: combination.join("+"),
          features: combination,
          horizon,
          n: returns.length,
          medianReturnPct: median(returns),
          winsorizedMeanReturnPct: winsorizedMean(returns),
          hit25Pct: thresholdRate(selected, horizon, 25),
          hit50Pct: thresholdRate(selected, horizon, 50),
          hit100Pct: thresholdRate(selected, horizon, 100),
          loss15Pct: thresholdRate(selected, horizon, -15, "lte"),
          loss20Pct: thresholdRate(selected, horizon, -20, "lte"),
          status: "EXPLORATORY",
          automaticPromotion: false,
        });
      }
    }
  }
  interactionRankings.sort((left, right) =>
    (right.medianReturnPct ?? -Infinity) - (left.medianReturnPct ?? -Infinity)
  );

  return {
    schemaVersion: 1,
    generatedAt: new Date(options.now ?? Date.now()).toISOString(),
    status: rows.length >= 30 ? "EXPLORATORY_SAMPLE" : "INSUFFICIENT_SAMPLE",
    rows: rows.length,
    horizons,
    evidenceBasis: { eligibleStates },
    featureRankings,
    interactionRankings,
    policy: {
      researchOnly: true,
      automaticPromotion: false,
      requiresExistingForwardEvidenceCourt: true,
    },
  };
}

export function persistAlphaFeatureLeaderboard(report, options = {}) {
  return writeAtomicJson(options.filePath || "reports/alpha-feature-leaderboard.json", report).file;
}
