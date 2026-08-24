import fs from "node:fs";
import path from "node:path";

import { finite, stableHash, timestamp } from "./productionMath.js";

const FILE = path.resolve("data", "market-context-observations.jsonl");
const DEFAULT_MAX_BYTES = 64 * 1024 * 1024;
const DEFAULT_LIMIT = 250_000;

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
        __marketContextLedgerParseFailure: true,
        malformedLineHash: stableHash(line),
      }];
    }
  });
}

function nullableObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

export function marketContextObservationIntegrityHash(observation = {}) {
  const { observationIntegrityHash: _ignored, ...payload } = observation;
  return stableHash(payload);
}

export function isMarketContextObservationIntegrityValid(observation = {}) {
  return Boolean(observation?.observationIntegrityHash) &&
    observation.observationIntegrityHash === marketContextObservationIntegrityHash(observation);
}

export function buildMarketContextObservation(row = {}, options = {}) {
  const observedMs = timestamp(row.observedAt || row.timestamp || options.observedAt);
  const asOfMs = timestamp(options.asOf || options.now || new Date().toISOString());
  const maximumFutureSkewMs = Math.max(0, Number(options.maximumFutureSkewMs || 0));
  if (
    observedMs === null ||
    asOfMs === null ||
    observedMs > asOfMs + maximumFutureSkewMs ||
    row.pointInTimeVerified === false
  ) return null;

  const observedAt = new Date(observedMs).toISOString();
  const source = String(row.source || options.source || "market-context-snapshot-provider");
  const observation = {
    schemaVersion: 1,
    observationKey: stableHash(["MARKET_CONTEXT_OBSERVATION_V1", observedAt, source].join("|")),
    observedAt,
    source,
    state: row.state || "INSUFFICIENT_EVIDENCE",
    btcReturnPct: finite(row.btcReturnPct),
    ethReturnPct: finite(row.ethReturnPct),
    btcVolatility: finite(row.btcVolatility ?? row.btcVolatilityPct),
    btcVolatilityPct: finite(row.btcVolatilityPct ?? row.btcVolatility),
    stablecoinSupplyUsd: finite(row.stablecoinSupplyUsd),
    stablecoinFlowUsd: finite(row.stablecoinFlowUsd ?? row.stablecoinNetFlowUsd),
    stablecoinNetFlowUsd: finite(row.stablecoinNetFlowUsd ?? row.stablecoinFlowUsd),
    perpFundingRate: finite(row.perpFundingRate),
    openInterestUsd: finite(row.openInterestUsd),
    openInterestChangePct: finite(row.openInterestChangePct),
    liquidationUsd: finite(row.liquidationUsd),
    bridgeNetFlowUsd: finite(row.bridgeNetFlowUsd),
    dexVolumeChangePct: finite(row.dexVolumeChangePct),
    liquidityChangePct: finite(row.liquidityChangePct),
    marketBreadthPct: finite(row.marketBreadthPct),
    marketBreadthSampleSize: Math.max(0, Number(row.marketBreadthSampleSize || 0)),
    dexVolumeChangeSampleSize: Math.max(0, Number(row.dexVolumeChangeSampleSize || 0)),
    liquidityChangeSampleSize: Math.max(0, Number(row.liquidityChangeSampleSize || 0)),
    fieldProvenance: nullableObject(row.fieldProvenance),
    unavailableFields: Array.isArray(row.unavailableFields) ? row.unavailableFields : [],
    providerHealth: nullableObject(row.providerHealth),
    pointInTimeVerified: true,
    scoringOrSelectionAllowed: false,
    automaticTrading: false,
  };
  return {
    ...observation,
    observationIntegrityHash: marketContextObservationIntegrityHash(observation),
  };
}

export function loadMarketContextObservations(options = {}) {
  return readTail(options.file || FILE, options.maxBytes)
    .map((row) => {
      if (row.__marketContextLedgerParseFailure || isMarketContextObservationIntegrityValid(row)) return row;
      return {
        ...row,
        __marketContextLedgerIntegrityFailure: true,
        pointInTimeVerified: false,
      };
    })
    .slice(-Math.max(1, Number(options.limit || DEFAULT_LIMIT)));
}

export function appendMarketContextObservations(rows = [], options = {}) {
  const file = options.file || FILE;
  const input = Array.isArray(rows) ? rows : [];
  const built = input.map((row) => buildMarketContextObservation(row, options)).filter(Boolean);
  if (!built.length) return { file, attempted: input.length, saved: 0, rejected: input.length };

  fs.mkdirSync(path.dirname(file), { recursive: true });
  const existing = readTail(file, options.dedupeBytes || 8 * 1024 * 1024);
  const keys = new Set(existing.map((row) => row.observationKey).filter(Boolean));
  const fresh = built.filter((row) => !keys.has(row.observationKey));
  if (fresh.length) {
    const fd = fs.openSync(file, "a");
    try {
      fs.writeSync(fd, `${fresh.map((row) => JSON.stringify(row)).join("\n")}\n`);
      fs.fsyncSync(fd);
    } finally { fs.closeSync(fd); }
  }

  return {
    file,
    attempted: input.length,
    accepted: built.length,
    saved: fresh.length,
    duplicates: built.length - fresh.length,
    rejected: input.length - built.length,
    observations: fresh,
  };
}

export const MARKET_CONTEXT_OBSERVATION_FILE = FILE;
export const __marketContextObservationLedgerHooks = { readTail };
