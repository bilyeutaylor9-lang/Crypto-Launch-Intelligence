import { finite, strictIdentity, strictIdentityKey, timestamp } from "./productionMath.js";

export function linkShadowPredictionsToOutcomes(predictions = [], outcomes = [], options = {}) {
  const horizonHours = Number(options.horizonHours || 24);
  const maxLatenessHours = Number(options.maxLatenessHours || 6);
  const byIdentity = new Map();
  for (const row of Array.isArray(outcomes) ? outcomes : []) {
    const key = strictIdentityKey(row);
    if (!key) continue;
    if (!byIdentity.has(key)) byIdentity.set(key, []);
    byIdentity.get(key).push(row);
  }
  for (const rows of byIdentity.values()) {
    rows.sort((a, b) => timestamp(a.observedAt || a.timestamp) - timestamp(b.observedAt || b.timestamp));
  }

  const linked = [];
  for (const prediction of Array.isArray(predictions) ? predictions : []) {
    const predictionIdentity = strictIdentity(prediction);
    const key = predictionIdentity?.identityKey || null;
    const decisionAt = timestamp(prediction.decisionAt || prediction.generatedAt || prediction.observedAt);
    if (!key || decisionAt === null) continue;
    const targetAt = decisionAt + horizonHours * 3_600_000;
    const maxAt = targetAt + maxLatenessHours * 3_600_000;
    const match = (byIdentity.get(key) || []).find((row) => {
      const observedIdentity = strictIdentity(row);
      const at = timestamp(row.observedAt || row.timestamp);
      const poolCompatible = !predictionIdentity.poolAddress || !observedIdentity?.poolAddress || observedIdentity.poolAddress === predictionIdentity.poolAddress;
      return observedIdentity && poolCompatible && at !== null && at >= targetAt && at <= maxAt && finite(row.priceUsd) !== null;
    });
    if (!match) continue;
    const startPrice = finite(prediction.priceUsd);
    const endPrice = finite(match.priceUsd);
    if (startPrice === null || endPrice === null || startPrice <= 0 || endPrice <= 0) continue;
    const returnPct = ((endPrice / startPrice) - 1) * 100;
    linked.push({
      ...prediction,
      outcomeObservedAt: match.observedAt || match.timestamp,
      realizedReturnPct: returnPct,
      hit: returnPct >= Number(options.targetReturnPct || 25),
      failure: returnPct <= Number(options.failureReturnPct || -20),
    });
  }
  return linked;
}
