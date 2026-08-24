const DEFAULT_WINDOW_MINUTES = 360;
const DEFAULT_HORIZON_HOURS = 24;

const STATE_ORDER = Object.freeze({
  FORMING: 1,
  COMPRESSED: 2,
  ARMED: 3,
  IGNITING: 4,
  EXPANSION: 5,
  EXHAUSTION: 6,
});

const FEATURE_SPECS = Object.freeze({
  liquidityUsd: { type: "money", cap: 20_000_000, modes: ["level", "delta", "accel"] },
  effectiveFreeFloatUsd: { type: "money", cap: 500_000_000, modes: ["level", "delta"] },
  effectiveFloatCompressionPct: { type: "percent", modes: ["level", "delta", "accel"] },
  demandPressurePct: { type: "percent", modes: ["level", "delta", "accel"] },
  demandPressureScore: { type: "score", modes: ["level", "delta", "accel"] },
  sellerExhaustionScore: { type: "score", modes: ["level", "delta", "accel"] },
  buyerReplacementScore: { type: "score", modes: ["level", "delta", "accel"] },
  holderKnownCostBasisCoveragePct: { type: "percent", modes: ["level", "delta"] },
  nearPriceSellInventoryUsd: { type: "money", cap: 100_000_000, modes: ["level", "delta", "accel"] },
  marginalSellerInventoryBurnPct: { type: "percent", modes: ["level", "delta", "accel"] },
  liquidityConvexityIndex: { type: "ratio", cap: 20, modes: ["level", "delta", "accel"] },
  reflexivityMechanismStrengthScore: { type: "score", modes: ["level", "delta", "accel"] },
  ignitionCapitalUsd: { type: "money", cap: 50_000_000, modes: ["level", "delta"] },
  maxObservedReflexivityMultiplier: { type: "ratio", cap: 10, modes: ["level", "delta"] },
  sequenceCompressionRatio: { type: "ratio", cap: 10, modes: ["level", "delta", "accel"] },
  eventTimeAccelerationRatio: { type: "ratio", cap: 10, modes: ["level", "delta", "accel"] },
  repricingGapScore: { type: "score", modes: ["level", "delta", "accel"] },
  evidenceCoveragePct: { type: "percent", modes: ["level", "delta"] },
  confidencePct: { type: "percent", modes: ["level", "delta"] },
});

function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function timestamp(value) {
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? parsed : null;
}

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function identityKey(item = {}) {
  if (item.identityKey) return String(item.identityKey).toLowerCase();
  if (item.canonicalProjectId && String(item.canonicalProjectId).includes(":")) {
    return String(item.canonicalProjectId).toLowerCase();
  }
  const chain = String(item.chain || item.canonicalChain || "unknown").toLowerCase();
  const token = String(
    item.tokenAddress || item.contractAddress || item.canonicalAddress || ""
  ).trim().toLowerCase();
  return token ? `${chain}:${token}` : `${chain}:${String(item.symbol || item.name || "unknown").toLowerCase()}`;
}

function normalizeValue(value, spec = {}) {
  const numeric = finite(value);
  if (numeric === null) return null;
  if (spec.type === "money") {
    const cap = Math.max(1, Number(spec.cap || 1_000_000));
    return clamp(Math.log10(1 + Math.max(0, numeric)) / Math.log10(1 + cap));
  }
  if (spec.type === "percent" || spec.type === "score") {
    return clamp(numeric / 100);
  }
  if (spec.type === "ratio") {
    const cap = Math.max(1, Number(spec.cap || 10));
    return clamp(Math.log1p(Math.max(0, numeric)) / Math.log1p(cap));
  }
  return numeric;
}

function normalizedSeries(rows, key, spec) {
  return rows
    .map((row) => ({
      at: timestamp(row.observedAt),
      value: normalizeValue(row[key], spec),
    }))
    .filter((row) => row.at !== null && row.value !== null);
}

function segmentSlope(series = []) {
  if (series.length < 2) return null;
  const first = series[0];
  const last = series.at(-1);
  const hours = (last.at - first.at) / 3_600_000;
  if (!(hours > 0)) return null;
  return (last.value - first.value) / hours;
}

function featureTrajectory(series = []) {
  if (series.length < 2) return null;
  const first = series[0];
  const last = series.at(-1);
  const hours = (last.at - first.at) / 3_600_000;
  if (!(hours > 0)) return null;

  const middle = Math.max(1, Math.floor(series.length / 2));
  const left = series.slice(0, middle + 1);
  const right = series.slice(Math.max(0, middle - 1));
  const leftSlope = segmentSlope(left);
  const rightSlope = segmentSlope(right);

  return {
    level: last.value,
    delta: clamp((last.value - first.value + 1) / 2),
    velocity: Math.tanh((last.value - first.value) / Math.max(0.25, hours)),
    accel:
      leftSlope === null || rightSlope === null
        ? null
        : Math.tanh(rightSlope - leftSlope),
  };
}

function priceTrajectory(rows = []) {
  const series = rows
    .map((row) => ({ at: timestamp(row.observedAt), value: finite(row.priceUsd) }))
    .filter((row) => row.at !== null && row.value !== null && row.value > 0);
  if (series.length < 2) return null;

  const first = series[0];
  const last = series.at(-1);
  const hours = (last.at - first.at) / 3_600_000;
  if (!(hours > 0)) return null;

  const logReturn = Math.log(last.value / first.value);
  const middle = Math.max(1, Math.floor(series.length / 2));
  const firstHalf = series.slice(0, middle + 1);
  const secondHalf = series.slice(Math.max(0, middle - 1));
  const logSlope = (segment) => {
    if (segment.length < 2) return null;
    const a = segment[0];
    const b = segment.at(-1);
    const elapsed = (b.at - a.at) / 3_600_000;
    return elapsed > 0 ? Math.log(b.value / a.value) / elapsed : null;
  };
  const left = logSlope(firstHalf);
  const right = logSlope(secondHalf);

  return {
    delta: Math.tanh(logReturn * 2),
    velocity: Math.tanh(logReturn / Math.max(0.25, hours)),
    accel: left === null || right === null ? null : Math.tanh(right - left),
  };
}

function stateTrajectory(rows = []) {
  const values = rows
    .map((row) => STATE_ORDER[String(row.state || "").toUpperCase()] || null)
    .filter((value) => value !== null);
  if (!values.length) return null;
  const first = values[0];
  const last = values.at(-1);
  return {
    level: last / 6,
    delta: (last - first) / 5,
  };
}

export function buildIgnitionTrajectoryVector(history = [], anchorAt = null, options = {}) {
  const anchorMs = timestamp(anchorAt || history.at(-1)?.observedAt);
  if (anchorMs === null) return null;

  const windowMinutes = Math.max(
    30,
    Number(options.windowMinutes || DEFAULT_WINDOW_MINUTES)
  );
  const minimumPoints = Math.max(2, Number(options.minimumPoints || 3));
  const earliestMs = anchorMs - windowMinutes * 60_000;

  const rows = (Array.isArray(history) ? history : [])
    .filter((row) => {
      const at = timestamp(row.observedAt);
      return at !== null && at <= anchorMs && at >= earliestMs;
    })
    .sort((a, b) => timestamp(a.observedAt) - timestamp(b.observedAt));

  if (rows.length < minimumPoints) return null;

  const vector = {};
  for (const [key, spec] of Object.entries(FEATURE_SPECS)) {
    const trajectory = featureTrajectory(normalizedSeries(rows, key, spec));
    if (!trajectory) continue;
    for (const mode of spec.modes) {
      const value = trajectory[mode];
      if (value !== null && value !== undefined && Number.isFinite(value)) {
        vector[`${key}.${mode}`] = value;
      }
    }
  }

  const price = priceTrajectory(rows);
  if (price) {
    vector["price.delta"] = price.delta;
    vector["price.velocity"] = price.velocity;
    if (price.accel !== null) vector["price.accel"] = price.accel;
  }

  const state = stateTrajectory(rows);
  if (state) {
    vector["state.level"] = state.level;
    vector["state.delta"] = state.delta;
  }

  const startMs = timestamp(rows[0].observedAt);
  const endMs = timestamp(rows.at(-1).observedAt);
  const durationMinutes =
    startMs !== null && endMs !== null ? (endMs - startMs) / 60_000 : 0;

  return {
    anchorAt: new Date(anchorMs).toISOString(),
    startAt: rows[0].observedAt,
    endAt: rows.at(-1).observedAt,
    points: rows.length,
    durationMinutes: Number(durationMinutes.toFixed(2)),
    dimensionCount: Object.keys(vector).length,
    vector,
  };
}

function labelForReturn(returnPct) {
  const value = finite(returnPct);
  if (value === null) return "UNKNOWN";
  if (value >= 100) return "TWO_X";
  if (value >= 50) return "BREAKOUT_50";
  if (value >= 25) return "WIN_25";
  if (value <= -20) return "FAILURE";
  return "NEUTRAL";
}

function groupObservations(observations = []) {
  const map = new Map();
  for (const row of Array.isArray(observations) ? observations : []) {
    const key = identityKey(row);
    if (!key || !timestamp(row.observedAt)) continue;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  for (const rows of map.values()) {
    rows.sort((a, b) => timestamp(a.observedAt) - timestamp(b.observedAt));
  }
  return map;
}

export function buildHistoricalIgnitionGenomes(
  observations = [],
  outcomeLab = {},
  options = {}
) {
  const byIdentity = groupObservations(observations);
  const horizonHours = Number(options.horizonHours || DEFAULT_HORIZON_HOURS);
  const horizonKey = String(horizonHours);
  const asOfMs = timestamp(options.asOf || new Date().toISOString());
  const minimumAnchorSpacingMinutes = Math.max(
    1,
    Number(options.minimumAnchorSpacingMinutes || 60)
  );
  const lastAnchorByIdentity = new Map();
  const genomes = [];

  const records = (Array.isArray(outcomeLab?.records) ? outcomeLab.records : [])
    .slice()
    .sort((a, b) => timestamp(a.observedAt) - timestamp(b.observedAt));

  for (const record of records) {
    const key = identityKey(record);
    const anchorMs = timestamp(record.observedAt);
    const outcome = record?.outcomes?.[horizonKey];
    const returnPct = finite(outcome?.returnPct);
    const resolvedMs = timestamp(outcome?.observedAt);
    if (
      !key ||
      anchorMs === null ||
      returnPct === null ||
      resolvedMs === null ||
      (asOfMs !== null && resolvedMs > asOfMs)
    ) {
      continue;
    }

    const priorAnchor = lastAnchorByIdentity.get(key);
    if (
      priorAnchor !== undefined &&
      anchorMs - priorAnchor < minimumAnchorSpacingMinutes * 60_000
    ) {
      continue;
    }

    const trajectory = buildIgnitionTrajectoryVector(
      byIdentity.get(key) || [],
      record.observedAt,
      options
    );
    if (!trajectory || trajectory.dimensionCount < Number(options.minimumDimensions || 10)) {
      continue;
    }

    genomes.push({
      schemaVersion: 1,
      genomeId: `${key}@${record.observedAt}`,
      identityKey: key,
      symbol: record.symbol || null,
      state: record.state || null,
      anchorAt: record.observedAt,
      resolvedAt: outcome.observedAt,
      horizonHours,
      returnPct,
      label: labelForReturn(returnPct),
      trajectory,
    });
    lastAnchorByIdentity.set(key, anchorMs);
  }

  return genomes;
}

function dimensionWeight(key) {
  if (key.endsWith(".accel")) return 1.4;
  if (key.endsWith(".velocity")) return 1.3;
  if (key.endsWith(".delta")) return 1.25;
  if (key.startsWith("price.")) return 0.7;
  if (key.startsWith("state.")) return 1.15;
  return 1;
}

export function compareIgnitionGenomes(left = {}, right = {}, options = {}) {
  const leftVector = left.vector || left.trajectory?.vector || {};
  const rightVector = right.vector || right.trajectory?.vector || {};
  const shared = Object.keys(leftVector).filter(
    (key) => finite(rightVector[key]) !== null && finite(leftVector[key]) !== null
  );
  const minimumSharedDimensions = Math.max(
    4,
    Number(options.minimumSharedDimensions || 10)
  );
  if (shared.length < minimumSharedDimensions) return null;

  let weightedSquaredDistance = 0;
  let totalWeight = 0;
  for (const key of shared) {
    const weight = dimensionWeight(key);
    const diff = Number(leftVector[key]) - Number(rightVector[key]);
    weightedSquaredDistance += weight * diff * diff;
    totalWeight += weight;
  }
  const rmse = Math.sqrt(weightedSquaredDistance / Math.max(1e-9, totalWeight));
  const union = new Set([...Object.keys(leftVector), ...Object.keys(rightVector)]);
  const coverage = shared.length / Math.max(1, union.size);
  const rawSimilarity = Math.exp(-2.15 * rmse);
  const similarity = clamp(rawSimilarity * Math.sqrt(coverage));

  return {
    similarity,
    similarityPct: Number((similarity * 100).toFixed(2)),
    sharedDimensions: shared.length,
    unionDimensions: union.size,
    coveragePct: Number((coverage * 100).toFixed(2)),
    rmse: Number(rmse.toFixed(6)),
  };
}

function weightedMean(rows = [], selector = (row) => row.value) {
  const active = rows
    .map((row) => ({
      value: finite(selector(row)),
      weight: finite(row.weight),
    }))
    .filter((row) => row.value !== null && row.weight !== null && row.weight > 0);
  if (!active.length) return null;
  const total = active.reduce((sum, row) => sum + row.weight, 0);
  return active.reduce((sum, row) => sum + row.value * row.weight, 0) / total;
}

function weightedProbability(neighbors = [], predicate) {
  const total = neighbors.reduce((sum, row) => sum + row.weight, 0);
  if (!(total > 0)) return null;
  return neighbors
    .filter(predicate)
    .reduce((sum, row) => sum + row.weight, 0) / total;
}

function effectiveNeighborCount(neighbors = []) {
  const sum = neighbors.reduce((total, row) => total + row.weight, 0);
  const squares = neighbors.reduce((total, row) => total + row.weight * row.weight, 0);
  return squares > 0 ? (sum * sum) / squares : 0;
}

function topClassSimilarity(neighbors = [], predicate) {
  const values = neighbors
    .filter(predicate)
    .map((row) => row.comparison.similarity)
    .sort((a, b) => b - a)
    .slice(0, 3);
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function matchIgnitionGenome(currentTrajectory, historicalGenomes = [], options = {}) {
  if (!currentTrajectory) {
    return {
      state: "INSUFFICIENT_CURRENT_TRAJECTORY",
      confidence: 0,
      neighbors: [],
    };
  }

  const currentIdentity = String(options.identityKey || "").toLowerCase();
  const asOfMs = timestamp(options.asOf || new Date().toISOString());
  const topK = Math.max(3, Number(options.topK || 25));
  const minimumSimilarity = clamp(
    options.minimumSimilarity === undefined ? 0.35 : options.minimumSimilarity
  );

  const neighbors = [];
  for (const genome of Array.isArray(historicalGenomes) ? historicalGenomes : []) {
    if (currentIdentity && genome.identityKey === currentIdentity) continue;
    const resolvedMs = timestamp(genome.resolvedAt);
    if (asOfMs !== null && (resolvedMs === null || resolvedMs > asOfMs)) continue;

    const comparison = compareIgnitionGenomes(
      currentTrajectory,
      genome.trajectory,
      options
    );
    if (!comparison || comparison.similarity < minimumSimilarity) continue;

    const weight =
      Math.pow(comparison.similarity, 3) *
      Math.sqrt(Math.max(0.05, comparison.coveragePct / 100));

    neighbors.push({
      genomeId: genome.genomeId,
      identityKey: genome.identityKey,
      symbol: genome.symbol,
      label: genome.label,
      returnPct: genome.returnPct,
      anchorAt: genome.anchorAt,
      resolvedAt: genome.resolvedAt,
      comparison,
      weight,
    });
  }

  neighbors.sort(
    (a, b) =>
      b.comparison.similarity - a.comparison.similarity ||
      b.weight - a.weight
  );
  const selected = neighbors.slice(0, topK);
  const effectiveN = effectiveNeighborCount(selected);
  const averageSimilarity =
    selected.length
      ? selected.reduce((sum, row) => sum + row.comparison.similarity, 0) /
        selected.length
      : 0;

  const p25 = weightedProbability(selected, (row) => row.returnPct >= 25);
  const p50 = weightedProbability(selected, (row) => row.returnPct >= 50);
  const p100 = weightedProbability(selected, (row) => row.returnPct >= 100);
  const pFailure = weightedProbability(selected, (row) => row.returnPct <= -20);
  const expectedReturnPct = weightedMean(
    selected,
    (row) => Math.max(-95, Math.min(400, row.returnPct))
  );

  const confidence = clamp(
    (effectiveN / 15) *
    averageSimilarity *
    Math.min(1, selected.length / 12)
  );

  let state = "GENOME_MATCH";
  if (selected.length < Number(options.minimumNeighbors || 6) || effectiveN < 4) {
    state = "INSUFFICIENT_HISTORICAL_NEIGHBORS";
  } else if (averageSimilarity < 0.5) {
    state = "WEAK_GENOME_MATCH";
  } else if ((pFailure ?? 0) >= 0.45) {
    state = "FAILURE_GENOME_DOMINANT";
  } else if ((p100 ?? 0) >= 0.25 && confidence >= 0.45) {
    state = "TWO_X_GENOME_RESEMBLANCE";
  } else if ((p50 ?? 0) >= 0.4 && confidence >= 0.4) {
    state = "BREAKOUT_GENOME_RESEMBLANCE";
  }

  const twoXSimilarity = topClassSimilarity(selected, (row) => row.returnPct >= 100);
  const breakout50Similarity = topClassSimilarity(selected, (row) => row.returnPct >= 50);
  const failureSimilarity = topClassSimilarity(selected, (row) => row.returnPct <= -20);

  const genomeResearchScore = clamp(
    confidence *
      (
        0.25 * (p25 ?? 0) +
        0.30 * (p50 ?? 0) +
        0.30 * (p100 ?? 0) +
        0.15 * averageSimilarity -
        0.40 * (pFailure ?? 0)
      )
  ) * 100;

  return {
    state,
    confidence: Number(confidence.toFixed(4)),
    confidencePct: Number((confidence * 100).toFixed(2)),
    neighborCount: selected.length,
    effectiveNeighborCount: Number(effectiveN.toFixed(2)),
    averageSimilarityPct: Number((averageSimilarity * 100).toFixed(2)),
    probability25Pct:
      p25 === null ? null : Number((p25 * 100).toFixed(2)),
    probability50Pct:
      p50 === null ? null : Number((p50 * 100).toFixed(2)),
    probability100Pct:
      p100 === null ? null : Number((p100 * 100).toFixed(2)),
    failureProbabilityPct:
      pFailure === null ? null : Number((pFailure * 100).toFixed(2)),
    expectedReturnPct:
      expectedReturnPct === null ? null : Number(expectedReturnPct.toFixed(2)),
    twoXSimilarityPct:
      twoXSimilarity === null ? null : Number((twoXSimilarity * 100).toFixed(2)),
    breakout50SimilarityPct:
      breakout50Similarity === null
        ? null
        : Number((breakout50Similarity * 100).toFixed(2)),
    failureSimilarityPct:
      failureSimilarity === null
        ? null
        : Number((failureSimilarity * 100).toFixed(2)),
    genomeResearchScore: Number(genomeResearchScore.toFixed(2)),
    neighbors: selected.slice(0, Number(options.reportNeighborLimit || 10)),
  };
}

export function buildIgnitionGenomeReport(
  observations = [],
  outcomeLab = {},
  candidates = [],
  options = {}
) {
  const asOf = options.asOf || new Date().toISOString();
  const byIdentity = groupObservations(observations);
  const historicalGenomes = buildHistoricalIgnitionGenomes(
    observations,
    outcomeLab,
    { ...options, asOf }
  );

  const rows = [];
  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    const key = identityKey(candidate);
    const history = byIdentity.get(key) || [];
    const latest = history.at(-1);
    if (!latest) continue;

    const trajectory = buildIgnitionTrajectoryVector(
      history,
      latest.observedAt,
      options
    );
    const analysis = matchIgnitionGenome(
      trajectory,
      historicalGenomes,
      { ...options, identityKey: key, asOf }
    );

    rows.push({
      identityKey: key,
      symbol: candidate.symbol || latest.symbol || null,
      name: candidate.name || latest.name || null,
      chain: candidate.chain || latest.chain || null,
      tokenAddress: candidate.tokenAddress || candidate.contractAddress || null,
      poolAddress: candidate.poolAddress || candidate.pairAddress || null,
      latestObservedAt: latest.observedAt,
      latestIgnitionState: latest.state || null,
      trajectory: trajectory
        ? {
            points: trajectory.points,
            durationMinutes: trajectory.durationMinutes,
            dimensionCount: trajectory.dimensionCount,
          }
        : null,
      genome: analysis,
    });
  }

  rows.sort(
    (a, b) =>
      b.genome.genomeResearchScore - a.genome.genomeResearchScore ||
      b.genome.confidence - a.genome.confidence
  );

  const labelCounts = historicalGenomes.reduce((acc, row) => {
    acc[row.label] = (acc[row.label] || 0) + 1;
    return acc;
  }, {});

  return {
    schemaVersion: 1,
    generatedAt: asOf,
    horizonHours: Number(options.horizonHours || DEFAULT_HORIZON_HOURS),
    windowMinutes: Number(options.windowMinutes || DEFAULT_WINDOW_MINUTES),
    historicalGenomeCount: historicalGenomes.length,
    historicalLabelCounts: labelCounts,
    liveCandidatesScored: rows.length,
    candidates: rows,
    policy: {
      pointInTimeFeaturesOnly: true,
      outcomeMustBeResolvedBeforeAsOf: true,
      selfIdentityNeighborsExcluded: true,
      symbolOnlyHistoricalMatchDisallowed: false,
      futureFeatureBackfillAllowed: false,
      automaticTrading: false,
      productionRankingInfluence: false,
      scoringInfluence: false,
      researchPriorityOnly: true,
    },
  };
}

export const __ignitionGenomeHooks = {
  finite,
  timestamp,
  clamp,
  identityKey,
  normalizeValue,
  normalizedSeries,
  segmentSlope,
  featureTrajectory,
  priceTrajectory,
  stateTrajectory,
  groupObservations,
  labelForReturn,
  dimensionWeight,
  weightedProbability,
  effectiveNeighborCount,
};
