import fs from "node:fs";
import path from "node:path";
import { buildHistoricalDataset } from "./historicalDatasetBuilder.js";
import { buildExpandingWindowFolds, chronologicalSplit } from "./walkForwardSplitter.js";
import { scoreCoreBaseline } from "./coreBaselineModel.js";
import { scoreCoreInstitutionalModel } from "./coreInstitutionalModel.js";
import { evaluateRanking } from "./rankingBacktestEngine.js";
import { compareModels } from "./modelComparisonReport.js";
import { runSlippageSensitivity } from "./portfolioSimulationEngine.js";
import {
  calculateProductionCorrelations,
  evaluateRegimes,
  evaluateShadowFamilies,
  runBaselineAblation,
} from "./modelDiagnostics.js";

function numberOrNull(value) {
  return value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value))
    ? Number(value)
    : null;
}

function productionScore(row = {}) {
  return numberOrNull(row.storedProductionScore);
}

function baselineResult(row = {}) {
  return scoreCoreBaseline(row);
}

function baselineScore(row = {}) {
  const result = baselineResult(row);
  return { score: result.evidenceAdjustedBaselineScore, eligible: result.eligible };
}

function institutionalResult(row = {}) {
  return scoreCoreInstitutionalModel(row);
}

function institutionalScore(row = {}) {
  const result = institutionalResult(row);
  return { score: result.evidenceAdjustedScore, eligible: result.eligible };
}

function evidencePenalizedProduction(row = {}) {
  const base = productionScore(row);
  if (base === null) return null;
  const core = institutionalResult(row);
  const baseline = baselineResult(row);
  if (baseline.safetyBlocked) return 0;
  let multiplier = Math.sqrt(Math.max(0, Math.min(1, core.coverage)));
  if (row.identityKey && row.chain && row.tokenAddress) multiplier *= 1;
  else multiplier *= 0.5;
  if (baseline.components.qualifiedSmartWalletNetFlow === null) multiplier *= 0.8;
  if (core.components.contractSafety === null) multiplier *= 0.75;
  if (row.buyQuoteVerified !== true) multiplier *= 0.8;
  if (row.sellQuoteVerified !== true) multiplier *= 0.7;
  if (row.evidenceFreshnessVerified !== true) multiplier *= 0.9;
  if (row.providerFailure === true) multiplier *= 0.7;
  if (row.aliasConflict === true) multiplier *= 0.5;
  return base * multiplier;
}

const MODELS = [
  { id: "A", name: "CURRENT_PRODUCTION", scorer: productionScore },
  { id: "B", name: "CORE_EVIDENCE_BASELINE", scorer: baselineScore },
  { id: "C", name: "CORE_INSTITUTIONAL", scorer: institutionalScore },
  { id: "D", name: "PRODUCTION_PLUS_EVIDENCE_PENALTY", scorer: evidencePenalizedProduction },
];

function evaluateModels(rows) {
  return MODELS.map((model) =>
    evaluateRanking(rows, {
      modelName: model.name,
      scorer: model.scorer,
      ks: [1, 3, 5, 10, 25],
      threshold: 60,
    })
  );
}

function writeJson(file, value) {
  const output = path.resolve(file);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const temporary = `${output}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2));
  fs.renameSync(temporary, output);
  return output;
}

function writeText(file, value) {
  const output = path.resolve(file);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const temporary = `${output}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, value);
  fs.renameSync(temporary, output);
  return output;
}

function slimFold(fold) {
  return {
    index: fold.index,
    trainCount: fold.train.length,
    trainProjectCount: new Set(fold.train.map((row) => row.identityKey)).size,
    validationCount: fold.validation.length,
    validationProjectCount: new Set(fold.validation.map((row) => row.identityKey)).size,
    boundaries: fold.boundaries,
  };
}

function componentReadiness(rows) {
  const familyCounts = {};
  for (const row of rows) {
    const result = baselineResult(row);
    for (const [family, value] of Object.entries(result.components)) {
      if (!familyCounts[family]) familyCounts[family] = { measured: 0, missing: 0 };
      familyCounts[family][value === null ? "missing" : "measured"] += 1;
    }
  }
  return {
    observations: rows.length,
    familyCounts,
    baselineEligible: rows.filter((row) => baselineResult(row).eligible).length,
    institutionalEligible: rows.filter((row) => institutionalResult(row).eligible).length,
    storedProductionScoreAvailable: rows.filter((row) => productionScore(row) !== null).length,
    verifiedTwoWayRouteAvailable: rows.filter(
      (row) => row.buyQuoteVerified === true && row.sellQuoteVerified === true
    ).length,
    nextRecorderRequirements: [
      "cluster-adjusted unique-buyer observations with source timestamps",
      "qualified wallet flow plus historical performance sample size",
      "liquidity observations as a timestamped sequence",
      "verified catalyst announcement timestamp and authoritative source",
      "contract safety checks with tested/unknown distinction",
      "fresh buy and sell quotes, depth, slippage, and route timestamps",
      "provider status, alias conflicts, and evidence freshness at decision time",
    ],
  };
}

function formatMetric(value, digits = 3) {
  return value === null || value === undefined || !Number.isFinite(Number(value))
    ? "n/a"
    : Number(value).toFixed(digits);
}

function markdownReport(context) {
  const {
    generatedAt,
    report,
    comparison,
    finalTestResults,
    ablation,
    correlations,
    shadowFamilies,
    dataReadiness,
  } = context;
  const rows = finalTestResults
    .map((result) => {
      const top10 = result.byK[10];
      return `| ${result.model} | ${top10.selections} | ${top10.uniqueProjects} | ${formatMetric(top10.precision)} | ${formatMetric(top10.catastrophicLossRate)} | ${formatMetric(top10.medianReturnPct, 2)} | ${formatMetric(top10.averageMaximumDrawdownPct, 2)} |`;
    })
    .join("\n");
  const winner = comparison.winnerPublished ? comparison.bestModel?.model : "No model: final test is inadequate";
  const ablationAnswer =
    ablation.status === "INSUFFICIENT_SAMPLE"
      ? "No component has proven predictive value yet; ablation samples are inadequate."
      : ablation.ablations
          .map((item) => `${item.removedFamily}: delta precision ${formatMetric(item.deltaPrecisionAt10)}`)
          .join("; ");
  const shadow = shadowFamilies.families
    .filter((item) => item.recommendation === "SHADOW_MODE")
    .map((item) => item.family)
    .join(", ");
  return `# Core Model Point-in-Time Backtest

Generated: ${generatedAt}

## Verdict

- **Best model on the untouched final period:** ${winner}
- **Did the simple baseline beat production?** ${comparison.winnerPublished ? (comparison.bestModel?.model === "CORE_EVIDENCE_BASELINE" ? "Yes under the predeclared gate." : "No.") : "Not proven; sample gate failed."}
- **Did evidence penalties improve production?** ${comparison.winnerPublished ? (comparison.bestModel?.model === "PRODUCTION_PLUS_EVIDENCE_PENALTY" ? "Yes under the predeclared gate." : "Not enough to win.") : "Not proven."}
- **Is a production change justified?** No automatic change. ${comparison.recommendation}
- **Leakage audit:** ${report.leakageAudit.status}

## Final Untouched Test

| Model | Top-10 selections | Unique projects | 2x precision | Catastrophic loss rate | Median return % | Average max drawdown % |
|---|---:|---:|---:|---:|---:|---:|
${rows}

## Dataset Integrity

- Historical decisions loaded: ${report.datasetHealth.rawPredictions}
- Decisions with valid chain-specific token identity: ${report.datasetHealth.exactIdentityPredictions}
- Decisions quarantined: ${report.datasetHealth.quarantinedCount}
- Seven-day outcomes resolved: ${report.datasetHealth.resolvedSevenDayOutcomes}
- Resolved decision dates: ${report.datasetHealth.resolvedOutcomeDecisionRange?.first || "n/a"} through ${report.datasetHealth.resolvedOutcomeDecisionRange?.last || "n/a"}
- Distinct resolved decision days available to walk-forward: ${report.walkForward.audit.uniqueDays || 0}
- Populated future labels removed before scoring: ${report.leakageAudit.evidenceAudit.populatedFutureLabelsRemoved || 0}
- Empty future placeholders removed: ${report.leakageAudit.evidenceAudit.emptyFuturePlaceholdersRemoved || 0}
- Unresolved point-in-time violations: ${report.leakageAudit.evidenceAudit.unresolvedViolationCount || 0}

The seven-day purge/embargo leaves no legal untouched test fold. This is why no model is ranked or declared superior.

## Evidence And Engine Findings

- **Baseline component value:** ${ablationAnswer}
- **Highly correlated production pairs:** ${correlations.highCorrelationPairs.length}; correlation alone is not proof of redundancy.
- **Derived family score additions that must remain shadow-only:** ${shadow || "None evaluated with enough evidence"}. Their raw evidence collectors remain active where applicable.
- **Families that should remain active:** identity, source truth, liquidity, safety, buyer breadth, wallet flow, catalyst, and execution remain required evidence roles; this run does not prove their ranking weights.

## Data Readiness

- Resolved observations: ${dataReadiness.observations}
- Baseline eligible: ${dataReadiness.baselineEligible}
- Core institutional eligible: ${dataReadiness.institutionalEligible}
- Stored production scores: ${dataReadiness.storedProductionScoreAvailable}
- Verified historical two-way routes: ${dataReadiness.verifiedTwoWayRouteAvailable}

## Exact Production Recommendation

1. Keep live production ranking unchanged.
2. Use the newly installed scan-memory point-in-time schema to persist exact identity, raw buyer breadth, qualified-wallet flow, liquidity/volume sequences, catalyst announcement provenance, tested safety checks, and two-way quote truth. Missing values remain null.
3. Use the repaired outcome identity contract: preserve case-sensitive non-EVM addresses, normalize EVM addresses only, and never substitute a pool address for a token address.
4. Continue running Models B, C, and D in shadow mode.
5. Re-run this frozen experiment after the untouched test has at least 100 resolved observations, 10 decision windows, 50 top-10 selections, and 30 unique selected projects per model.
6. Promote a model only if it improves final-test top-10 precision without increasing catastrophic loss and repeats across walk-forward folds and regimes.

The production scoring function and ranking weights were not changed by this work.

## Statistical Limitations

- Candidate-cluster bootstrap intervals are emitted only with at least 20 independent identities.
- Ablations and family additions are exploratory and subject to multiple-comparison error.
- Missing route history prevents executable-profit claims; research-only portfolio results are explicitly labeled.
- Market-regime claims are suppressed when point-in-time regime inputs or samples are inadequate.
`;
}

const generatedAt = new Date().toISOString();
const dataset = buildHistoricalDataset({ horizonHours: 168, outcomeToleranceHours: 24 });
const chronological = chronologicalSplit(dataset.records, {
  trainPct: 0.6,
  validationPct: 0.2,
  embargoHours: 168,
});
const walkForward = buildExpandingWindowFolds(dataset.records, {
  purgeDays: 7,
  embargoDays: 7,
  validationDays: 1,
  minimumTrainDays: 3,
  testFraction: 0.2,
});
const validationRows = walkForward.folds.flatMap((fold) => fold.validation);
const finalTestRows = walkForward.finalTest;
const validationResults = evaluateModels(validationRows);
const validationFoldResults = walkForward.folds.map((fold) => ({
  fold: slimFold(fold),
  results: evaluateModels(fold.validation),
}));
const finalTestResults = evaluateModels(finalTestRows);
const comparison = compareModels(finalTestResults, {
  generatedAt,
  leakageAuditStatus: dataset.leakageAudit.status,
  foldAuditStatus: walkForward.audit.status,
  testCount: finalTestRows.length,
  minimumTestObservations: 100,
  minimumTestWindows: 10,
  minimumTop10Selections: 50,
  minimumUniqueTop10Projects: 30,
});
const portfolioSimulations = MODELS.map((model) => ({
  model: model.name,
  finalTest: runSlippageSensitivity(finalTestRows, { scorer: model.scorer, k: 10 }),
  validation: runSlippageSensitivity(validationRows, { scorer: model.scorer, k: 10 }),
}));
const ablation = {
  generatedAt,
  validation: runBaselineAblation(validationRows),
  finalTest: runBaselineAblation(finalTestRows),
};
const diagnosticTrainingRows = walkForward.finalTrain.length
  ? walkForward.finalTrain
  : chronological.train;
const correlations = {
  generatedAt,
  trainingSource: walkForward.finalTrain.length
    ? "EXPANDING_WINDOW_FINAL_TRAIN"
    : "FIXED_CHRONOLOGICAL_TRAIN_FALLBACK_NO_FINAL_TEST",
  trainingRows: diagnosticTrainingRows.length,
  trainingOnly: calculateProductionCorrelations(diagnosticTrainingRows, { minimumSamples: 30 }),
};
const shadowFamilies = {
  generatedAt,
  finalTest: evaluateShadowFamilies(finalTestRows),
};
const regimes = {
  generatedAt,
  finalTest: evaluateRegimes(finalTestRows, MODELS),
};
const dataReadiness = {
  generatedAt,
  ...componentReadiness(dataset.records),
};
const leakageAudit = {
  generatedAt,
  status:
    dataset.leakageAudit.status !== "PASS" || walkForward.audit.status === "FAIL"
      ? "FAIL"
      : walkForward.audit.status === "PASS"
        ? "PASS"
        : "INSUFFICIENT_HISTORY_FOR_FOLD_AUDIT",
  evidenceAudit: dataset.leakageAudit,
  foldIsolationAudit: walkForward.audit,
  winnerPublicationAllowed: comparison.winnerPublished,
};
const top10Comparison = {
  generatedAt,
  status: comparison.status,
  validation: validationResults.map((result) => ({ model: result.model, top10: result.byK[10] })),
  finalUntouchedTest: finalTestResults.map((result) => ({ model: result.model, top10: result.byK[10] })),
  comparison,
};

const report = {
  generatedAt,
  status:
    leakageAudit.status === "FAIL"
      ? "INVALID_LEAKAGE_AUDIT_FAILED"
      : leakageAudit.status === "INSUFFICIENT_HISTORY_FOR_FOLD_AUDIT"
        ? "INSUFFICIENT_CALENDAR_HISTORY_NO_WINNER"
      : comparison.winnerPublished
        ? "ADEQUATE_TEST_REVIEW_SHADOW_ONLY"
        : "INSUFFICIENT_SAMPLE_NO_PRODUCTION_CHANGE",
  productionRankingChanged: false,
  datasetHealth: dataset.health,
  dataReadiness,
  leakageAudit,
  walkForward: {
    fixedChronologicalSplit: {
      method: "EARLIEST_60_TRAIN_NEXT_20_VALIDATION_LATEST_20_TEST_WITH_7_DAY_BOUNDARY_EMBARGO",
      status: chronological.status,
      trainCount: chronological.train.length,
      trainProjectCount: new Set(chronological.train.map((row) => row.identityKey)).size,
      validationCount: chronological.validation.length,
      validationProjectCount: new Set(chronological.validation.map((row) => row.identityKey)).size,
      testCount: chronological.test.length,
      testProjectCount: new Set(chronological.test.map((row) => row.identityKey)).size,
      boundaries: chronological.boundaries,
      evaluation: {
        validation: evaluateModels(chronological.validation),
        test: evaluateModels(chronological.test),
      },
    },
    boundaries: walkForward.boundaries,
    audit: walkForward.audit,
    folds: walkForward.folds.map(slimFold),
    finalTrainCount: walkForward.finalTrain.length,
    finalTrainProjectCount: new Set(walkForward.finalTrain.map((row) => row.identityKey)).size,
    finalTestCount: finalTestRows.length,
    finalTestProjectCount: new Set(finalTestRows.map((row) => row.identityKey)).size,
  },
  validation: { rows: validationRows.length, results: validationResults, folds: validationFoldResults },
  finalUntouchedTest: { rows: finalTestRows.length, results: finalTestResults },
  comparison,
  diagnostics: {
    ablationSummary: ablation.finalTest,
    productionCorrelationSummary: correlations.trainingOnly,
    shadowFamilySummary: shadowFamilies.finalTest,
    regimeSummary: regimes.finalTest,
  },
  limitations: [
    "Historical memory predates strict null-preserving evidence semantics; stored zero scores are not treated as measured raw baseline evidence.",
    "Seven-day labels use observed market prices and cannot claim executable fills when historical quote costs are absent.",
    "Only exact normalized chain-plus-token-address identities enter the experiment.",
    "Models are pre-specified; final-test observations never tune weights.",
    "No winner is published without adequate samples, fold isolation, and a passing leakage audit.",
  ],
};

const reportPaths = {
  top10Comparison: writeJson("reports/core-model-top10-comparison.json", top10Comparison),
  portfolioSimulation: writeJson("reports/core-model-portfolio-simulation.json", {
    generatedAt,
    simulations: portfolioSimulations,
  }),
  ablation: writeJson("reports/core-model-ablation.json", ablation),
  productionCorrelation: writeJson("reports/production-engine-correlation.json", correlations),
  leakageAudit: writeJson("reports/point-in-time-leakage-audit.json", leakageAudit),
  datasetHealth: writeJson("reports/backtest-dataset-health.json", {
    generatedAt,
    ...dataset.health,
    dataReadiness,
  }),
  regimeSegmentation: writeJson("reports/core-model-regime-segmentation.json", regimes),
  shadowFamilies: writeJson("reports/core-model-shadow-family-evaluation.json", shadowFamilies),
  modelComparison: writeJson("reports/core-model-comparison.json", comparison),
};
reportPaths.markdown = writeText(
  "reports/core-model-backtest.md",
  markdownReport({
    generatedAt,
    report,
    comparison,
    finalTestResults,
    ablation: ablation.finalTest,
    correlations: correlations.trainingOnly,
    shadowFamilies: shadowFamilies.finalTest,
    dataReadiness,
  })
);
reportPaths.dataReadiness = writeJson("reports/core-model-data-readiness.json", dataReadiness);
report.artifacts = Object.fromEntries(
  Object.entries(reportPaths).map(([name, file]) => [name, path.relative(process.cwd(), file)])
);
report.artifacts.master = "reports/core-model-backtest.json";
reportPaths.master = writeJson("reports/core-model-backtest.json", report);

console.log(
  JSON.stringify(
    {
      generatedAt,
      status: report.status,
      productionRankingChanged: false,
      dataset: {
        loadedPredictions: dataset.health.rawPredictions,
        exactIdentityPredictions: dataset.health.exactIdentityPredictions,
        resolvedSevenDayOutcomes: dataset.health.resolvedSevenDayOutcomes,
        quarantined: dataset.health.quarantinedCount,
        rejected: dataset.health.rejectedCount,
      },
      finalUntouchedTest: {
        observations: finalTestRows.length,
        projects: new Set(finalTestRows.map((row) => row.identityKey)).size,
        winnerPublished: comparison.winnerPublished,
        winner: comparison.bestModel?.model || null,
      },
      leakageAudit: leakageAudit.status,
      reportPaths,
    },
    null,
    2
  )
);
if (process.env.BACKTEST_STRICT === "true" && leakageAudit.status !== "PASS") process.exitCode = 2;
