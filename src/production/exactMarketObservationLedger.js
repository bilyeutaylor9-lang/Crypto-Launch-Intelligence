import fs from "node:fs";
import path from "node:path";

import { finite, stableHash, strictIdentity, timestamp } from "./productionMath.js";

const FILE = path.resolve("data", "production-market-observations.jsonl");
const DEFAULT_MAX_BYTES = 256 * 1024 * 1024;
const DEFAULT_LIMIT = 1_000_000;

function readTail(file = FILE, maxBytes = DEFAULT_MAX_BYTES) {
  if (!fs.existsSync(file)) return [];
  const stat = fs.statSync(file);
  const bytes = Math.min(stat.size, Math.max(1024, Number(maxBytes) || DEFAULT_MAX_BYTES));
  const start = Math.max(0, stat.size - bytes);
  const buffer = Buffer.alloc(bytes);
  const fd = fs.openSync(file, "r");
  try { fs.readSync(fd, buffer, 0, bytes, start); }
  finally { fs.closeSync(fd); }
  const lines = buffer.toString("utf8").split("\n");
  if (start > 0) lines.shift();
  return lines.filter(Boolean).flatMap((line) => {
    try { return [JSON.parse(line)]; }
    catch {
      return [{
        __exactObservationLedgerParseFailure: true,
        malformedLineHash: stableHash(line),
      }];
    }
  });
}

function observationTime(row = {}, options = {}) {
  return row.observedAt || row.timestamp || row.sourceObservedAt || row.lastVerifiedAt || options.observedAt || null;
}

export function buildExactMarketObservation(row = {}, options = {}) {
  const identity = strictIdentity(row);
  const observedAt = observationTime(row, options);
  const observedMs = timestamp(observedAt);
  const asOfMs = timestamp(options.asOf || options.now || new Date().toISOString());
  const priceUsd = finite(row.priceUsd ?? row.price ?? row.currentPrice ?? row.marketData?.priceUsd);
  const maximumFutureSkewMs = Math.max(0, Number(options.maximumFutureSkewMs || 0));
  const maximumObservationAgeMinutes = finite(options.maximumObservationAgeMinutes);
  if (!identity || observedMs === null || asOfMs === null || priceUsd === null || priceUsd <= 0) return null;
  if (observedMs > asOfMs + maximumFutureSkewMs) return null;
  if (
    maximumObservationAgeMinutes !== null &&
    maximumObservationAgeMinutes >= 0 &&
    asOfMs - observedMs > maximumObservationAgeMinutes * 60_000
  ) return null;

  const source = String(options.source || row.source || "production-observation-ledger");
  const observationKey = stableHash([
    "PRODUCTION_MARKET_OBSERVATION_V2",
    identity.routeKey,
    new Date(observedMs).toISOString(),
    source,
  ].join("|"));
  const marketContextMs = timestamp(row.marketContextObservedAt);
  const marketContextPointInTimeVerified =
    marketContextMs !== null &&
    marketContextMs <= observedMs &&
    row.marketContextPointInTimeVerified === true;

  const observation = {
    schemaVersion: 2,
    observationKey,
    observedAt: new Date(observedMs).toISOString(),
    source,
    chain: identity.chain,
    tokenAddress: identity.tokenAddress,
    poolAddress: identity.poolAddress,
    identityKey: identity.identityKey,
    routeKey: identity.routeKey,
    symbol: row.symbol || null,
    name: row.name || null,
    priceUsd,
    liquidityUsd: finite(row.liquidityUsd ?? row.activeLiquidityUsd ?? row.marketData?.liquidityUsd),
    marketCapUsd: finite(row.marketCapUsd ?? row.marketCap ?? row.circulatingMarketCapUsd ?? row.marketData?.marketCap),
    volume24hUsd: finite(row.volume24hUsd ?? row.volume24h ?? row.dexVolume24hUsd ?? row.marketData?.volume24h),
    globalMarketRegimeState: row.globalMarketRegimeState || row.marketRegime || null,
    marketContextObservationKey: marketContextPointInTimeVerified
      ? row.marketContextObservationKey || null
      : null,
    marketContextObservedAt: marketContextPointInTimeVerified
      ? new Date(marketContextMs).toISOString()
      : null,
    marketContextState: marketContextPointInTimeVerified ? row.marketContextState || null : null,
    btcReturnPct: marketContextPointInTimeVerified ? finite(row.btcReturnPct) : null,
    ethReturnPct: marketContextPointInTimeVerified ? finite(row.ethReturnPct) : null,
    btcVolatility: marketContextPointInTimeVerified
      ? finite(row.btcVolatility ?? row.btcVolatilityPct)
      : null,
    btcVolatilityPct: marketContextPointInTimeVerified
      ? finite(row.btcVolatilityPct ?? row.btcVolatility)
      : null,
    stablecoinSupplyUsd: marketContextPointInTimeVerified ? finite(row.stablecoinSupplyUsd) : null,
    stablecoinFlowUsd: marketContextPointInTimeVerified
      ? finite(row.stablecoinFlowUsd ?? row.stablecoinNetFlowUsd)
      : null,
    stablecoinNetFlowUsd: marketContextPointInTimeVerified
      ? finite(row.stablecoinNetFlowUsd ?? row.stablecoinFlowUsd)
      : null,
    perpFundingRate: marketContextPointInTimeVerified ? finite(row.perpFundingRate) : null,
    openInterestUsd: marketContextPointInTimeVerified ? finite(row.openInterestUsd) : null,
    openInterestChangePct: marketContextPointInTimeVerified ? finite(row.openInterestChangePct) : null,
    liquidationUsd: marketContextPointInTimeVerified ? finite(row.liquidationUsd) : null,
    bridgeNetFlowUsd: marketContextPointInTimeVerified ? finite(row.bridgeNetFlowUsd) : null,
    dexVolumeChangePct: marketContextPointInTimeVerified ? finite(row.dexVolumeChangePct) : null,
    liquidityChangePct: marketContextPointInTimeVerified ? finite(row.liquidityChangePct) : null,
    marketBreadthPct: marketContextPointInTimeVerified ? finite(row.marketBreadthPct) : null,
    marketBreadthSampleSize: marketContextPointInTimeVerified
      ? Math.max(0, Number(row.marketBreadthSampleSize || 0))
      : 0,
    dexVolumeChangeSampleSize: marketContextPointInTimeVerified
      ? Math.max(0, Number(row.dexVolumeChangeSampleSize || 0))
      : 0,
    liquidityChangeSampleSize: marketContextPointInTimeVerified
      ? Math.max(0, Number(row.liquidityChangeSampleSize || 0))
      : 0,
    marketContextFieldProvenance: marketContextPointInTimeVerified && row.marketContextFieldProvenance
      ? row.marketContextFieldProvenance
      : {},
    marketContextPointInTimeVerified,
    exactIdentityVerified: true,
    scoringOrSelectionAllowed: false,
  };
  return {
    ...observation,
    observationIntegrityHash: exactMarketObservationIntegrityHash(observation),
  };
}

export function exactMarketObservationIntegrityHash(observation = {}) {
  const { observationIntegrityHash: _ignored, ...payload } = observation;
  return stableHash(payload);
}

export function loadExactMarketObservations(options = {}) {
  return readTail(options.file || FILE, options.maxBytes)
    .slice(-Math.max(1, Number(options.limit || DEFAULT_LIMIT)));
}

export function appendExactMarketObservations(rows = [], options = {}) {
  const file = options.file || FILE;
  const built = (Array.isArray(rows) ? rows : [])
    .map((row) => buildExactMarketObservation(row, options))
    .filter(Boolean);
  if (!built.length) return { file, attempted: Array.isArray(rows) ? rows.length : 0, saved: 0, rejected: Array.isArray(rows) ? rows.length : 0 };

  fs.mkdirSync(path.dirname(file), { recursive: true });
  const dedupeBytes = Math.min(Number(options.dedupeBytes || 16 * 1024 * 1024), Number(options.maxBytes || DEFAULT_MAX_BYTES));
  const existing = readTail(file, dedupeBytes);
  const ids = new Set(existing.map((row) => row.observationKey).filter(Boolean));
  const fresh = built.filter((row) => !ids.has(row.observationKey));
  if (fresh.length) {
    const fd = fs.openSync(file, "a");
    try {
      fs.writeSync(fd, `${fresh.map((row) => JSON.stringify(row)).join("\n")}\n`);
      fs.fsyncSync(fd);
    } finally { fs.closeSync(fd); }
  }

  const retentionMaxBytes = finite(options.retentionMaxBytes);
  if (
    retentionMaxBytes !== null &&
    retentionMaxBytes > 0 &&
    fs.existsSync(file) &&
    fs.statSync(file).size > retentionMaxBytes
  ) {
    const retained = readTail(file, Math.floor(retentionMaxBytes * 0.75));
    fs.writeFileSync(file, retained.map((row) => JSON.stringify(row)).join("\n") + (retained.length ? "\n" : ""));
  }

  return {
    file,
    attempted: Array.isArray(rows) ? rows.length : 0,
    accepted: built.length,
    saved: fresh.length,
    duplicates: built.length - fresh.length,
    rejected: (Array.isArray(rows) ? rows.length : 0) - built.length,
  };
}

export function toOutcomeSnapshots(rows = []) {
  return (Array.isArray(rows) ? rows : [])
    .flatMap((row) => {
      const identity = strictIdentity(row);
      const at = row.observedAt || row.timestamp || null;
      if (!identity || timestamp(at) === null || finite(row.priceUsd) <= 0) return [];
      return [{ ...row, key: identity.identityKey, timestamp: at }];
    });
}

export const EXACT_MARKET_OBSERVATION_FILE = FILE;
export const __exactMarketObservationHooks = { readTail, observationTime };
