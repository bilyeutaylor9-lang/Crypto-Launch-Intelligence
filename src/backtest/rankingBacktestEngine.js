function numberOrNull(value) {
  return value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value))
    ? Number(value)
    : null;
}

function decisionDay(row) {
  const date = new Date(row.scannedAt || row.decisionAt || row.timestamp || 0);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function percentile(values, fraction) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * fraction;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function downsideDeviation(values) {
  if (!values.length) return null;
  return Math.sqrt(mean(values.map((value) => Math.min(0, value) ** 2)));
}

function seededRandom(seed = 1729) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function candidateBootstrap(rows, statistic, options = {}) {
  const groups = new Map();
  for (const row of rows) {
    if (!groups.has(row.identityKey)) groups.set(row.identityKey, []);
    groups.get(row.identityKey).push(row);
  }
  const clusters = [...groups.values()];
  if (clusters.length < Number(options.minimumClusters ?? 20)) {
    return { status: "INSUFFICIENT_CLUSTERS", clusters: clusters.length, lower: null, upper: null };
  }
  const iterations = Number(options.iterations ?? 500);
  const random = seededRandom(Number(options.seed ?? 1729));
  const estimates = [];
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const sample = [];
    for (let index = 0; index < clusters.length; index += 1) {
      sample.push(...clusters[Math.floor(random() * clusters.length)]);
    }
    const estimate = statistic(sample);
    if (Number.isFinite(estimate)) estimates.push(estimate);
  }
  return {
    status: estimates.length ? "AVAILABLE" : "UNAVAILABLE",
    method: "candidate-cluster-bootstrap",
    clusters: clusters.length,
    iterations,
    lower: percentile(estimates, 0.025),
    upper: percentile(estimates, 0.975),
  };
}

function resolvedOutcome(row) {
  return row.outcome?.status === "RESOLVED";
}

function hit(row, targetPct) {
  const maximumReturn = numberOrNull(row.outcome?.maximumReturn168hPct);
  const maximumDrawdown = numberOrNull(row.outcome?.maximumDrawdownPct);
  return (
    maximumReturn !== null &&
    maximumReturn >= targetPct &&
    (maximumDrawdown === null || maximumDrawdown < 50) &&
    row.outcome?.rugged !== true &&
    row.outcome?.liquiditySurvived === true
  );
}

function catastrophic(row) {
  const drawdown = numberOrNull(row.outcome?.maximumDrawdownPct);
  const finalReturn = numberOrNull(row.outcome?.returnAt168hPct);
  return (
    row.outcome?.rugged === true ||
    row.outcome?.liquiditySurvived === false ||
    (drawdown !== null && drawdown >= 50) ||
    (finalReturn !== null && finalReturn <= -80)
  );
}

function normalizeScorerResult(value) {
  if (value && typeof value === "object") {
    if (value.eligible === false) return null;
    return numberOrNull(value.score);
  }
  return numberOrNull(value);
}

export function selectRankedRows(rows = [], options = {}) {
  const scorer = options.scorer;
  const k = Number(options.k ?? 10);
  const groups = new Map();
  for (const row of rows) {
    if (!resolvedOutcome(row)) continue;
    const score = normalizeScorerResult(typeof scorer === "function" ? scorer(row) : null);
    const day = decisionDay(row);
    if (score === null || !day) continue;
    if (!groups.has(day)) groups.set(day, []);
    groups.get(day).push({ ...row, __backtestScore: score });
  }
  const selected = [];
  for (const [day, group] of [...groups.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const ranked = [...group].sort(
      (left, right) =>
        right.__backtestScore - left.__backtestScore || left.identityKey.localeCompare(right.identityKey)
    );
    selected.push(...ranked.slice(0, k).map((row, rank) => ({ ...row, __selectionDay: day, __rank: rank + 1 })));
  }
  const eligible = [...groups.values()].flat();
  return { selected, eligible, windows: groups.size, eligibleRows: eligible.length };
}

function metricsForSelection(selected, eligible, windows, totalRows) {
  const returns = selected.map((row) => numberOrNull(row.outcome?.returnAt168hPct)).filter((value) => value !== null);
  const drawdowns = selected
    .map((row) => numberOrNull(row.outcome?.maximumDrawdownPct))
    .filter((value) => value !== null);
  const favorable = selected
    .map((row) => numberOrNull(row.outcome?.maximumReturn168hPct))
    .filter((value) => value !== null);
  const liquidityKnown = selected.filter((row) => typeof row.outcome?.liquiditySurvived === "boolean");
  const catastrophicCount = selected.filter(catastrophic).length;
  const rugs = selected.filter((row) => row.outcome?.rugged === true).length;
  const positiveReturns = returns.filter((value) => value > 0);
  const negativeReturns = returns.filter((value) => value < 0);
  const precisionByTarget = Object.fromEntries(
    [25, 50, 100, 200].map((target) => {
      const count = selected.filter((row) => hit(row, target)).length;
      const universeHits = eligible.filter((row) => hit(row, target)).length;
      return [
        target,
        {
          hits: count,
          universeHits,
          precision: selected.length ? count / selected.length : null,
          recall: universeHits ? count / universeHits : null,
        },
      ];
    })
  );
  const plus25Within24hHits = selected.filter((row) => row.outcome?.targets?.plus25Within24h?.hit === true).length;
  const successfulBreakouts = selected.filter((row) => row.outcome?.successfulSevenDayBreakout === true).length;
  const precisionCi = candidateBootstrap(selected, (sample) => {
    if (!sample.length) return null;
    return sample.filter((row) => row.outcome?.successfulSevenDayBreakout === true).length / sample.length;
  });
  const returnCi = candidateBootstrap(selected, (sample) =>
    mean(sample.map((row) => numberOrNull(row.outcome?.returnAt168hPct)).filter((value) => value !== null))
  );

  return {
    windows,
    eligibleRows: eligible.length,
    totalRows,
    coverageRate: totalRows ? eligible.length / totalRows : null,
    abstentionRate: totalRows ? 1 - eligible.length / totalRows : null,
    selections: selected.length,
    uniqueProjects: new Set(selected.map((row) => row.identityKey)).size,
    precision: selected.length ? successfulBreakouts / selected.length : null,
    sevenDayTwoXHitRate: selected.length ? successfulBreakouts / selected.length : null,
    sevenDayThreeXHitRate: precisionByTarget[200]?.precision ?? null,
    plus25Within24hHitRate: selected.length ? plus25Within24hHits / selected.length : null,
    precisionByTarget,
    falsePositiveRate: selected.length ? 1 - successfulBreakouts / selected.length : null,
    catastrophicLossCount: catastrophicCount,
    catastrophicLossRate: selected.length ? catastrophicCount / selected.length : null,
    rugCount: rugs,
    rugRate: selected.length ? rugs / selected.length : null,
    averageReturnPct: mean(returns),
    medianReturnPct: percentile(returns, 0.5),
    expectancyPct: mean(returns),
    profitFactor:
      negativeReturns.length && sum(negativeReturns) !== 0
        ? sum(positiveReturns) / Math.abs(sum(negativeReturns))
        : positiveReturns.length
          ? null
          : 0,
    downsideDeviationPct: downsideDeviation(returns),
    returnP10Pct: percentile(returns, 0.1),
    returnP90Pct: percentile(returns, 0.9),
    averageMaximumReturnPct: mean(favorable),
    averageMaximumDrawdownPct: mean(drawdowns),
    medianMaximumDrawdownPct: percentile(drawdowns, 0.5),
    worstMaximumDrawdownPct: drawdowns.length ? Math.max(...drawdowns) : null,
    liquiditySurvivalKnownCount: liquidityKnown.length,
    liquiditySurvivalRate: liquidityKnown.length
      ? liquidityKnown.filter((row) => row.outcome.liquiditySurvived === true).length / liquidityKnown.length
      : null,
    confidenceIntervals: {
      successfulSevenDayBreakoutPrecision95: precisionCi,
      averageReturnPct95: returnCi,
    },
  };
}

export function evaluateRanking(rows = [], options = {}) {
  const ks = options.ks || [1, 3, 5, 10, 25];
  const byK = {};
  for (const k of ks) {
    const { selected, eligible, windows } = selectRankedRows(rows, { scorer: options.scorer, k });
    byK[k] = metricsForSelection(selected, eligible, windows, rows.filter(resolvedOutcome).length);
  }
  const threshold = Number(options.threshold ?? 60);
  const thresholdSelection = selectRankedRows(rows, { scorer: options.scorer, k: Number.MAX_SAFE_INTEGER });
  const aboveThreshold = thresholdSelection.eligible.filter((row) => row.__backtestScore >= threshold);
  return {
    model: options.modelName || "model",
    evaluatedRows: rows.filter(resolvedOutcome).length,
    evaluatedProjects: new Set(rows.filter(resolvedOutcome).map((row) => row.identityKey)).size,
    byK,
    aboveThreshold: metricsForSelection(
      aboveThreshold,
      thresholdSelection.eligible,
      thresholdSelection.windows,
      rows.filter(resolvedOutcome).length
    ),
    threshold,
  };
}

export { catastrophic, hit, numberOrNull };
