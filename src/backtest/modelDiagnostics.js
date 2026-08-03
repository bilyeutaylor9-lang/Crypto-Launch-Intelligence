import { DEFAULT_WEIGHTS, scoreCoreBaseline } from "./coreBaselineModel.js";
import { scoreCoreInstitutionalModel } from "./coreInstitutionalModel.js";
import { evaluateRanking } from "./rankingBacktestEngine.js";

const SHADOW_FAMILY_PATTERNS = Object.freeze({
  quantum: [/quantum/i],
  autonomous: [/autonomous/i, /alphaOS/i],
  councils: [/council/i, /debate/i],
  swarms: [/swarm/i, /dossier/i],
  simulations: [/simulation/i, /worldModel/i],
  causalModels: [/causal/i],
  narrativeModels: [/narrative/i],
  executionModels: [/execution/i, /activeLiquidity/i, /liquidityControl/i],
  walletModels: [/wallet/i, /smartMoney/i, /whale/i],
  marketMicrostructure: [/buyPressure/i, /sellPressure/i, /velocity/i, /acceleration/i, /relativeStrength/i, /momentum/i],
  safety: [/safety/i, /Risk$/i, /organicDemandFirewall/i],
});

function measuredScore(value) {
  return value !== null && value !== undefined && Number.isFinite(Number(value)) && Number(value) !== 0
    ? Number(value)
    : null;
}

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function pearson(pairs) {
  if (pairs.length < 2) return null;
  const xs = pairs.map(([left]) => left);
  const ys = pairs.map(([, right]) => right);
  const xMean = mean(xs);
  const yMean = mean(ys);
  let numerator = 0;
  let xVariance = 0;
  let yVariance = 0;
  for (let index = 0; index < pairs.length; index += 1) {
    const xDelta = xs[index] - xMean;
    const yDelta = ys[index] - yMean;
    numerator += xDelta * yDelta;
    xVariance += xDelta ** 2;
    yVariance += yDelta ** 2;
  }
  const denominator = Math.sqrt(xVariance * yVariance);
  return denominator ? numerator / denominator : null;
}

export function runBaselineAblation(rows = []) {
  const full = evaluateRanking(rows, {
    modelName: "CORE_EVIDENCE_BASELINE",
    scorer: (row) => {
      const result = scoreCoreBaseline(row);
      return { score: result.evidenceAdjustedBaselineScore, eligible: result.eligible };
    },
  });
  const fullTop10 = full.byK[10];
  const ablations = Object.keys(DEFAULT_WEIGHTS).map((family) => {
    const result = evaluateRanking(rows, {
      modelName: `BASELINE_WITHOUT_${family}`,
      scorer: (row) => {
        const score = scoreCoreBaseline(row, { excludedFamilies: [family] });
        return { score: score.evidenceAdjustedBaselineScore, eligible: score.eligible };
      },
    });
    const top10 = result.byK[10];
    return {
      removedFamily: family,
      top10,
      deltaPrecisionAt10:
        top10.precision !== null && fullTop10.precision !== null ? top10.precision - fullTop10.precision : null,
      deltaCatastrophicLossRateAt10:
        top10.catastrophicLossRate !== null && fullTop10.catastrophicLossRate !== null
          ? top10.catastrophicLossRate - fullTop10.catastrophicLossRate
          : null,
      interpretation:
        top10.selections < 50
          ? "INSUFFICIENT_SAMPLE"
          : top10.precision > fullTop10.precision
            ? "REMOVAL_IMPROVED_EXPLORATORY_PRECISION"
            : "REMOVAL_DID_NOT_IMPROVE_EXPLORATORY_PRECISION",
    };
  });
  return {
    status: fullTop10.selections >= 50 ? "EXPLORATORY" : "INSUFFICIENT_SAMPLE",
    fixedBaseline: fullTop10,
    ablations,
    warning: "Seven ablations create a multiple-comparison problem; findings are exploratory until independently replicated.",
  };
}

export function calculateProductionCorrelations(rows = [], options = {}) {
  const minimumSamples = Number(options.minimumSamples ?? 30);
  const fields = [...new Set(rows.flatMap((row) => Object.keys(row.scores || {})))].sort();
  const pairs = [];
  for (let leftIndex = 0; leftIndex < fields.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < fields.length; rightIndex += 1) {
      const leftField = fields[leftIndex];
      const rightField = fields[rightIndex];
      const observations = rows
        .map((row) => [measuredScore(row.scores?.[leftField]), measuredScore(row.scores?.[rightField])])
        .filter(([left, right]) => left !== null && right !== null);
      if (observations.length < minimumSamples) continue;
      const correlation = pearson(observations);
      if (correlation === null) continue;
      pairs.push({ leftField, rightField, samples: observations.length, correlation });
    }
  }
  const highCorrelationPairs = pairs
    .filter((pair) => Math.abs(pair.correlation) >= 0.85)
    .sort((left, right) => Math.abs(right.correlation) - Math.abs(left.correlation));
  return {
    status: pairs.length ? "EXPLORATORY_CORRELATION_AUDIT" : "INSUFFICIENT_MEASURED_PAIRS",
    minimumSamples,
    fieldsInspected: fields.length,
    pairsEvaluated: pairs.length,
    highCorrelationThreshold: 0.85,
    highCorrelationPairs,
    warning: "Correlation does not prove redundancy; common raw lineage must be checked before pruning an engine.",
  };
}

function familyScore(row, patterns) {
  const values = Object.entries(row.scores || {})
    .filter(([field]) => patterns.some((pattern) => pattern.test(field)))
    .map(([, value]) => measuredScore(value))
    .filter((value) => value !== null);
  return mean(values);
}

export function evaluateShadowFamilies(rows = []) {
  const baseScorer = (row) => {
    const result = scoreCoreInstitutionalModel(row);
    return { score: result.evidenceAdjustedScore, eligible: result.eligible };
  };
  const base = evaluateRanking(rows, { modelName: "CORE_INSTITUTIONAL", scorer: baseScorer });
  const baseTop10 = base.byK[10];
  const families = Object.entries(SHADOW_FAMILY_PATTERNS).map(([family, patterns]) => {
    const result = evaluateRanking(rows, {
      modelName: `CORE_PLUS_${family}`,
      scorer: (row) => {
        const core = scoreCoreInstitutionalModel(row);
        const extra = familyScore(row, patterns);
        return {
          score:
            core.evidenceAdjustedScore !== null && extra !== null
              ? core.evidenceAdjustedScore * 0.9 + extra * 0.1
              : core.evidenceAdjustedScore,
          eligible: core.eligible,
        };
      },
    });
    const top10 = result.byK[10];
    const enoughSamples = top10.selections >= 50 && top10.windows >= 10 && top10.uniqueProjects >= 30;
    const improvesPrecision =
      top10.precision !== null && baseTop10.precision !== null && top10.precision > baseTop10.precision;
    const controlsLoss =
      top10.catastrophicLossRate !== null &&
      baseTop10.catastrophicLossRate !== null &&
      top10.catastrophicLossRate <= baseTop10.catastrophicLossRate;
    return {
      family,
      top10,
      deltaPrecisionAt10: improvesPrecision ? top10.precision - baseTop10.precision : 0,
      recommendation:
        enoughSamples && improvesPrecision && controlsLoss ? "REVIEW_FOR_INDEPENDENT_REPLICATION" : "SHADOW_MODE",
      blockers: [
        !enoughSamples && "INSUFFICIENT_SAMPLE",
        !improvesPrecision && "NO_PRECISION_LIFT",
        !controlsLoss && "CATASTROPHIC_LOSS_NOT_IMPROVED",
        "MULTI_REGIME_REPLICATION_NOT_PROVEN",
      ].filter(Boolean),
    };
  });
  return { baseTop10, families };
}

function regimeFor(row) {
  const change = measuredScore(row.rawEvidence?.priceChange24hPct);
  if (change === null) return [];
  return [change > 5 ? "BULLISH" : change < -5 ? "BEARISH" : "SIDEWAYS", Math.abs(change) >= 10 ? "HIGH_VOLATILITY" : "LOW_VOLATILITY"];
}

export function evaluateRegimes(rows = [], models = []) {
  const names = ["BULLISH", "BEARISH", "SIDEWAYS", "HIGH_VOLATILITY", "LOW_VOLATILITY"];
  const regimes = names.map((regime) => {
    const subset = rows.filter((row) => regimeFor(row).includes(regime));
    return {
      regime,
      observations: subset.length,
      status: subset.length >= 100 ? "EXPLORATORY" : "INSUFFICIENT_SAMPLE",
      results: subset.length
        ? models.map((model) => evaluateRanking(subset, { modelName: model.name, scorer: model.scorer }))
        : [],
    };
  });
  return {
    regimes,
    unavailableSegments: [
      "MEME_LED: historical category labels are not preserved reliably",
      "UTILITY_LED: historical category labels are not preserved reliably",
      "HIGH_BITCOIN_DOMINANCE: point-in-time Bitcoin dominance is absent",
      "LOW_BITCOIN_DOMINANCE: point-in-time Bitcoin dominance is absent",
    ],
  };
}

export { SHADOW_FAMILY_PATTERNS };
