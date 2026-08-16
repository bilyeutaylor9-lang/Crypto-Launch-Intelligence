import { trainCapitalCommitmentModel, predictCapitalCommitment } from "./capitalCommitmentModel.js";

function brier(rows = []) {
  if (!rows.length) return null;
  return rows.reduce((sum, row) => sum + (row.p - row.y) ** 2, 0) / rows.length;
}
function calibrationError(rows = [], bins = 5) {
  if (!rows.length) return null;
  let weighted = 0;
  for (let i = 0; i < bins; i += 1) {
    const lo = i / bins, hi = (i + 1) / bins;
    const bucket = rows.filter((r) => r.p >= lo && (i === bins - 1 ? r.p <= hi : r.p < hi));
    if (!bucket.length) continue;
    const avgP = bucket.reduce((s, r) => s + r.p, 0) / bucket.length;
    const avgY = bucket.reduce((s, r) => s + r.y, 0) / bucket.length;
    weighted += (bucket.length / rows.length) * Math.abs(avgP - avgY);
  }
  return weighted;
}

export function runCapitalCommitmentWalkForwardLab(examples = [], options = {}) {
  const rows = (Array.isArray(examples) ? examples : []).slice().sort((a, b) => Date.parse(a.feature?.featureObservedAt || "") - Date.parse(b.feature?.featureObservedAt || ""));
  const evaluated = [];
  for (const test of rows) {
    const testAt = Date.parse(test.feature?.featureObservedAt || "");
    if (!Number.isFinite(testAt)) continue;
    const train = rows.filter((row) => Date.parse(row.outcomeObservedAt || "") < testAt);
    const model = trainCapitalCommitmentModel(train, { asOf: new Date(testAt).toISOString() });
    const pred = predictCapitalCommitment(test.feature, model, options.modelOptions || options);
    const curve = pred.arrivalCurve?.find((row) => Number(row.horizonHours) === 6);
    if (!curve || !String(pred.state).includes("SHADOW")) continue;
    evaluated.push({
      p: Number(curve.deploymentProbabilityPct || 0) / 100,
      y: ["TARGET_BUY", "OUT_OF_UNIVERSE_BUY"].includes(test.outcomeType) && Number(test.timeToOutcomeHours) <= 6 ? 1 : 0,
    });
  }
  const minPredictions = Math.max(20, Number(options.minPredictions || 50));
  const result = {
    evaluatedPredictions: evaluated.length,
    sixHourBrierScore: brier(evaluated) === null ? null : Number(brier(evaluated).toFixed(6)),
    sixHourExpectedCalibrationError: calibrationError(evaluated) === null ? null : Number(calibrationError(evaluated).toFixed(6)),
    promotionState: evaluated.length >= minPredictions ? "REVIEW_FOR_INDEPENDENT_REPLICATION" : "SHADOW_MODE",
    shadowOnly: true,
    rankingInfluence: false,
    policy: "Walk-forward training includes only terminal outcomes already observed before each test feature timestamp. This lab does not auto-promote the model.",
  };
  return result;
}

export const __capitalCommitmentWalkForwardHooks = { brier, calibrationError };
