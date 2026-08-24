import { finite, mean, timestamp } from "./productionMath.js";

function within(row, nowMs, fromDays, toDays = 0) {
  const at = timestamp(row.generatedAt || row.observedAt || row.timestamp);
  if (at === null) return false;
  const ageDays = (nowMs - at) / 86400000;
  return ageDays >= toDays && ageDays < fromDays;
}

function performance(rows = []) {
  const values = rows.map((row) => finite(
    row.realizedReturnPct ?? row.netReturnPct ?? row.returnPct
  )).filter((v) => v !== null);
  const hits = rows.map((row) =>
    row.hit === true ? 1 :
    row.actual === true ? 1 :
    finite(row.realizedReturnPct ?? row.netReturnPct ?? row.returnPct) >= 25 ? 1 : 0
  );
  return {
    samples: rows.length,
    averageReturnPct: mean(values),
    hitRate: mean(hits),
  };
}

export function evaluateEdgeDecay(history = [], options = {}) {
  const nowMs = timestamp(options.now || new Date().toISOString());
  const recent = performance(history.filter((row) => within(row, nowMs, 30, 0)));
  const prior = performance(history.filter((row) => within(row, nowMs, 120, 30)));

  let state = "INSUFFICIENT_HISTORY";
  let hitRateDelta = null;
  let returnDelta = null;
  if (recent.samples >= Number(options.minimumRecentSamples || 30) &&
      prior.samples >= Number(options.minimumPriorSamples || 60)) {
    hitRateDelta = (recent.hitRate ?? 0) - (prior.hitRate ?? 0);
    returnDelta = (recent.averageReturnPct ?? 0) - (prior.averageReturnPct ?? 0);
    if (hitRateDelta <= -0.18 || returnDelta <= -20) state = "DECAYING";
    else if (hitRateDelta <= -0.10 || returnDelta <= -10) state = "WEAKENING";
    else if (hitRateDelta >= 0.05 && returnDelta >= 5) state = "STRENGTHENING";
    else state = "HEALTHY";
  }

  return {
    state,
    recent30d: recent,
    prior30to120d: prior,
    hitRateDelta,
    averageReturnDeltaPct: returnDelta,
    rankingWeightMultiplier:
      state === "DECAYING" ? 0 :
      state === "WEAKENING" ? 0.5 :
      state === "INSUFFICIENT_HISTORY" ? 0.25 : 1,
  };
}
