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
    try { return [JSON.parse(line)]; } catch { return []; }
  });
}

function observationTime(row = {}, options = {}) {
  return row.observedAt || row.timestamp || row.lastVerifiedAt || options.observedAt || null;
}

export function buildExactMarketObservation(row = {}, options = {}) {
  const identity = strictIdentity(row);
  const observedAt = observationTime(row, options);
  const observedMs = timestamp(observedAt);
  const priceUsd = finite(row.priceUsd ?? row.price ?? row.currentPrice ?? row.marketData?.priceUsd);
  if (!identity || observedMs === null || priceUsd === null || priceUsd <= 0) return null;

  const source = String(options.source || row.source || "production-observation-ledger");
  const observationKey = stableHash([
    "PRODUCTION_MARKET_OBSERVATION_V1",
    identity.routeKey,
    new Date(observedMs).toISOString(),
    source,
  ].join("|"));

  return {
    schemaVersion: 1,
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
    exactIdentityVerified: true,
    scoringOrSelectionAllowed: false,
  };
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

  const maxBytes = Number(options.maxBytes || DEFAULT_MAX_BYTES);
  if (fs.existsSync(file) && fs.statSync(file).size > maxBytes) {
    const retained = readTail(file, Math.floor(maxBytes * 0.75));
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
