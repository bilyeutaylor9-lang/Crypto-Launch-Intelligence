import { num, pctChange } from "../edge/edgeMath.js";
import { appendJsonlDurable } from "../production/atomicArtifactStore.js";
import { strictIdentity } from "../production/productionMath.js";

const DEFAULTS = Object.freeze({
  maxAbsReturnPct: 10_000,
  maxReturnPctPerMinute: 500,
  minPriceUsd: 1e-12,
  maxPriceUsd: 1e12,
});

function identityFor(record = {}) {
  const exact = strictIdentity(record);
  if (!exact) return null;
  return {
    identityKey: exact.identityKey,
    poolAddress: exact.poolAddress,
  };
}

export function assessPriceIdentitySanity(observation = {}, snapshot = {}, options = {}) {
  const cfg = { ...DEFAULTS, ...options };
  const reasons = [];
  const startPrice = num(observation.priceUsd);
  const endPrice = num(snapshot.priceUsd);
  const observationIdentity = identityFor(observation);
  const snapshotIdentity = identityFor(snapshot);

  if (startPrice === null || endPrice === null) reasons.push("PRICE_MISSING");
  if (startPrice !== null && (startPrice < cfg.minPriceUsd || startPrice > cfg.maxPriceUsd)) {
    reasons.push("START_PRICE_OUT_OF_BOUNDS");
  }
  if (endPrice !== null && (endPrice < cfg.minPriceUsd || endPrice > cfg.maxPriceUsd)) {
    reasons.push("END_PRICE_OUT_OF_BOUNDS");
  }
  if (!observationIdentity || !snapshotIdentity) {
    reasons.push("IDENTITY_UNVERIFIED");
  } else {
    if (observationIdentity.identityKey !== snapshotIdentity.identityKey) {
      reasons.push("IDENTITY_MISMATCH");
    }
    if (
      observationIdentity.poolAddress &&
      snapshotIdentity.poolAddress &&
      observationIdentity.poolAddress !== snapshotIdentity.poolAddress
    ) {
      reasons.push("POOL_IDENTITY_MISMATCH");
    }
  }

  const startAt = observation.observedAt || observation.timestamp;
  const endAt = snapshot.timestamp || snapshot.observedAt;
  const startMs = startAt ? new Date(startAt).getTime() : Number.NaN;
  const endMs = endAt ? new Date(endAt).getTime() : Number.NaN;
  const elapsedMinutes = Number.isFinite(startMs) && Number.isFinite(endMs)
    ? (endMs - startMs) / 60_000
    : null;
  if (elapsedMinutes === null) reasons.push("TIMESTAMP_MISSING_OR_INVALID");
  else if (elapsedMinutes <= 0) reasons.push("NON_FORWARD_SNAPSHOT");

  const returnPct = startPrice !== null && endPrice !== null
    ? pctChange(startPrice, endPrice)
    : null;
  if (returnPct !== null && Math.abs(returnPct) > cfg.maxAbsReturnPct) {
    reasons.push("ABS_RETURN_IMPLAUSIBLE");
  }
  if (
    returnPct !== null &&
    elapsedMinutes !== null &&
    elapsedMinutes > 0 &&
    Math.abs(returnPct) / elapsedMinutes > cfg.maxReturnPctPerMinute
  ) {
    reasons.push("RETURN_VELOCITY_IMPLAUSIBLE");
  }

  return {
    pass: reasons.length === 0,
    reasons: [...new Set(reasons)],
    observationIdentity,
    snapshotIdentity,
    startPrice,
    endPrice,
    returnPct,
    elapsedMinutes,
  };
}

export function quarantineRecord(record = {}, sanity = {}, options = {}) {
  const filePath = options.filePath || "data/asymmetric-edge-quarantine.jsonl";
  const payload = {
    schemaVersion: 1,
    quarantinedAt: new Date(options.now ?? Date.now()).toISOString(),
    record,
    sanity,
  };
  appendJsonlDurable(filePath, [payload]);
  return payload;
}
