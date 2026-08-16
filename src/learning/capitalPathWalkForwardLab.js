import { trainCapitalDestinationPathModel, predictCapitalDestination } from "./capitalDestinationPathModel.js";

function chainPrior(train = [], chain = "", candidateKeys = []) {
  const allowed = new Set(candidateKeys);
  const counts = new Map();
  for (const row of train) {
    if (row.feature?.chain !== chain) continue;
    if (allowed.size && !allowed.has(row.destinationProjectKey)) continue;
    counts.set(row.destinationProjectKey, (counts.get(row.destinationProjectKey) || 0) + 1);
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return sorted[0]?.[0] || null;
}

export function runCapitalPathWalkForwardLab(examples = [], options = {}) {
  const rows = (Array.isArray(examples) ? examples : []).slice().sort((a, b) => Date.parse(a.feature?.featureObservedAt || "") - Date.parse(b.feature?.featureObservedAt || ""));
  const minTrainExamples = Math.max(5, Number(options.minTrainExamples || process.env.IGNITION_CAPITAL_PATH_WF_MIN_TRAIN || 30));
  const predictions = [];
  for (const test of rows) {
    const featureTime = Date.parse(test.feature?.featureObservedAt || "");
    if (!Number.isFinite(featureTime)) continue;
    const train = rows.filter((row) => Date.parse(row.outcomeObservedAt || "") < featureTime);
    if (train.length < minTrainExamples) continue;
    const candidateKeys = [...new Set(train.filter((row) => row.feature?.chain === test.feature.chain).map((row) => row.destinationProjectKey).concat(test.destinationProjectKey))];
    const model = trainCapitalDestinationPathModel(train, { asOf: new Date(featureTime - 1).toISOString() });
    const prediction = predictCapitalDestination(test.feature, model, candidateKeys, options.modelOptions || options);
    const baseline = chainPrior(train, test.feature.chain, candidateKeys);
    predictions.push({
      featureObservedAt: test.feature.featureObservedAt,
      trueProjectKey: test.destinationProjectKey,
      prediction,
      baselineProjectKey: baseline,
      baselineCorrect: baseline === test.destinationProjectKey,
      modelCorrect: prediction.state === "PREDICTED_DESTINATION_SHADOW" && prediction.predictedProjectKey === test.destinationProjectKey,
    });
  }
  const emitted = predictions.filter((row) => row.prediction.state === "PREDICTED_DESTINATION_SHADOW");
  const accuracy = emitted.length ? emitted.filter((row) => row.modelCorrect).length / emitted.length : null;
  const baselineAccuracy = predictions.length ? predictions.filter((row) => row.baselineCorrect).length / predictions.length : null;
  const coverage = predictions.length ? emitted.length / predictions.length : 0;
  const calibrationError = emitted.length
    ? emitted.reduce((sum, row) => sum + Math.abs((row.prediction.empiricalProbabilityPct || 0) / 100 - (row.modelCorrect ? 1 : 0)), 0) / emitted.length
    : null;
  const uniqueDestinations = new Set(rows.map((row) => row.destinationProjectKey)).size;
  const uniqueWallets = new Set(rows.map((row) => row.feature?.walletAddress).filter(Boolean)).size;
  const requirements = {
    resolvedExamples: rows.length >= Number(options.promotionMinExamples || 100),
    emittedPredictions: emitted.length >= Number(options.promotionMinPredictions || 30),
    uniqueDestinations: uniqueDestinations >= Number(options.promotionMinDestinations || 8),
    uniqueWallets: uniqueWallets >= Number(options.promotionMinWallets || 30),
    incrementalAccuracy: accuracy !== null && baselineAccuracy !== null && accuracy >= baselineAccuracy + Number(options.promotionMinAccuracyLift || 0.10),
    calibration: calibrationError !== null && calibrationError <= Number(options.promotionMaxCalibrationError || 0.25),
  };
  const passed = Object.values(requirements).every(Boolean);
  return {
    status: rows.length ? "EVALUATED" : "NO_RESOLVED_EXAMPLES",
    resolvedExamples: rows.length,
    testablePredictions: predictions.length,
    emittedPredictions: emitted.length,
    coveragePct: Number((coverage * 100).toFixed(2)),
    modelAccuracyPct: accuracy === null ? null : Number((accuracy * 100).toFixed(2)),
    baselineAccuracyPct: baselineAccuracy === null ? null : Number((baselineAccuracy * 100).toFixed(2)),
    incrementalAccuracyPct: accuracy === null || baselineAccuracy === null ? null : Number(((accuracy - baselineAccuracy) * 100).toFixed(2)),
    meanAbsoluteProbabilityError: calibrationError === null ? null : Number(calibrationError.toFixed(4)),
    uniqueDestinations,
    uniqueWallets,
    requirements,
    promotionState: passed ? "REVIEW_FOR_INDEPENDENT_REPLICATION" : "SHADOW_MODE",
    leakageRule: "For every test feature snapshot, training examples are restricted to outcomes that were already observed before that feature timestamp.",
    warning: "Accuracy is conditional on non-abstained predictions and does not establish profitability. Promotion requires independent replication and realistic execution-cost evaluation.",
    sample: predictions.slice(-100),
  };
}
