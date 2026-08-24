import { finite, identityKey } from "./productionMath.js";

export function buildMissedWinnerAutopsy(predictions = [], outcomes = [], options = {}) {
  const threshold = Number(options.winnerReturnPct || 100);
  const predictionMap = new Map(
    (Array.isArray(predictions) ? predictions : []).map((row) => [identityKey(row), row])
  );
  const rows = [];

  for (const outcome of Array.isArray(outcomes) ? outcomes : []) {
    const realized = finite(outcome.returnPct ?? outcome.maximumReturn168hPct ?? outcome.outcome?.maximumReturn168hPct);
    if (realized === null || realized < threshold) continue;
    const key = identityKey(outcome);
    const prediction = predictionMap.get(key);

    let failureMode = "NOT_DISCOVERED";
    if (prediction) {
      const score = finite(prediction.combinedResearchScore ?? prediction.pipelineScore) ?? 0;
      if (prediction.blocked === true || prediction.liveActionStatus === "BLOCKED") {
        failureMode = "SAFETY_OR_POLICY_BLOCK";
      } else if (prediction.dataRecoveryRequired === true || prediction.liveActionStatus === "DATA_RECOVERY_REQUIRED") {
        failureMode = "DATA_STARVATION";
      } else if (score < Number(options.minimumPriorityScore || 65)) {
        failureMode = "RANKED_TOO_LOW";
      } else {
        failureMode = "FOUND_BUT_NOT_ESCALATED";
      }
    }

    rows.push({
      identityKey: key,
      symbol: outcome.symbol || prediction?.symbol || null,
      realizedReturnPct: realized,
      failureMode,
      priorScore: prediction
        ? finite(prediction.combinedResearchScore ?? prediction.pipelineScore)
        : null,
    });
  }

  const counts = rows.reduce((acc, row) => {
    acc[row.failureMode] = (acc[row.failureMode] || 0) + 1;
    return acc;
  }, {});

  return {
    schemaVersion: 1,
    winnerThresholdPct: threshold,
    missedWinners: rows.length,
    failureModeCounts: counts,
    cases: rows,
  };
}
