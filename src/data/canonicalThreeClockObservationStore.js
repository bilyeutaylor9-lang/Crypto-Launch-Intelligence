import fs from "fs";
import path from "path";
import {
  normalizeChainId,
  normalizePoolAddress,
  normalizeTokenAddress,
} from "../identity/strictIdentityValidators.js";

const DEFAULT_FILE = path.resolve("data", "three-clock-canonical-observations.jsonl");

function ensure(file) { fs.mkdirSync(path.dirname(file), { recursive: true }); }
function first(values) { return values.find((value) => value !== undefined && value !== null && value !== "") ?? null; }
function numberOrNull(value) { const n = Number(value); return Number.isFinite(n) ? n : null; }

/**
 * A Three-Clock history row is useful only when it can be tied back to the
 * same on-chain asset on a supported chain. Symbol-only scanner rows are still
 * allowed through the shadow analysis, but they must not create reusable
 * history or appear in the append-only observation store.
 */
export function canonicalThreeClockIdentity(project = {}) {
  const chain = normalizeChainId(first([
    project.canonicalChain,
    project.finalChain,
    project.chain,
    project.network,
    project.chainId,
  ]));
  const tokenAddress = chain
    ? normalizeTokenAddress(first([
      project.finalContractAddress,
      project.tokenAddress,
      project.contractAddress,
      project.address,
    ]), chain)
    : null;
  const poolAddress = chain
    ? normalizePoolAddress(first([
      project.primaryTradablePool,
      project.poolAddress,
      project.pairAddress,
    ]), chain)
    : null;

  return {
    chain,
    tokenAddress,
    poolAddress,
    exact: Boolean(chain && tokenAddress),
  };
}

export function hasCanonicalThreeClockIdentity(project = {}) {
  return canonicalThreeClockIdentity(project).exact;
}

export function canonicalThreeClockKey(project = {}) {
  const identity = canonicalThreeClockIdentity(project);
  if (identity.exact) return `${identity.chain}:token:${identity.tokenAddress}`;
  const rawChain = String(first([project.canonicalChain, project.finalChain, project.chain, project.network, project.chainId]) || "unknown").toLowerCase();
  return `unresolved:${rawChain}:${String(project.symbol || project.name || "unknown").toLowerCase()}`;
}

export function loadCanonicalThreeClockObservations(options = {}) {
  const file = options.filePath || DEFAULT_FILE; ensure(file);
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8").split("\n").filter(Boolean).slice(-Number(options.limit || 20_000)).flatMap((line) => { try { return [JSON.parse(line)]; } catch { return []; } });
}

export function historyForCanonicalThreeClock(project, rows = [], options = {}) {
  if (!hasCanonicalThreeClockIdentity(project)) return [];
  const key = canonicalThreeClockKey(project);
  return rows.filter((row) => row.identityKey === key).sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt)).slice(-Number(options.limit || 96));
}

export function appendCanonicalThreeClockObservations(projects = [], options = {}) {
  const file = options.filePath || DEFAULT_FILE; ensure(file);
  if (!fs.existsSync(file)) fs.writeFileSync(file, "");
  const observedAt = options.observedAt || new Date().toISOString();
  const analyzed = projects.filter((project) => project.canonicalThreeClockEdge);
  const records = analyzed.flatMap((project) => {
    const identity = canonicalThreeClockIdentity(project);
    if (!identity.exact) return [];
    return [{
      identityKey: canonicalThreeClockKey(project),
      observedAt: project.canonicalThreeClockEdge.provenance?.observedAt || observedAt,
      symbol: project.symbol || null,
      chain: identity.chain,
      tokenAddress: identity.tokenAddress,
      poolAddress: identity.poolAddress,
      priceUsd: numberOrNull(first([project.priceUsd, project.price, project.marketData?.priceUsd])),
      liquidityUsd: numberOrNull(first([project.dexLiquidityUsd, project.liquidityUsd, project.liquidity])),
      marketCapUsd: numberOrNull(first([project.circulatingMarketCapUsd, project.marketCap])),
      priceChange24hPct: numberOrNull(first([project.priceChange24hPct, project.priceChange24h])),
      projectClock: project.canonicalThreeClockEdge.projectClock,
      capitalClock: project.canonicalThreeClockEdge.capitalClock,
      attentionClock: project.canonicalThreeClockEdge.attentionClock,
      sequence: project.canonicalThreeClockEdge.sequence,
      sequenceCompression: project.canonicalThreeClockEdge.sequenceCompression,
      freshness: project.canonicalThreeClockEdge.freshness,
      ignitionContext: project.canonicalThreeClockEdge.ignitionContext,
      qualifying: project.canonicalThreeClockEdge.qualifying,
      shadowOnly: true,
      rankingInfluence: false,
      provenance: project.canonicalThreeClockEdge.provenance,
    }];
  });
  if (records.length) fs.appendFileSync(file, `${records.map((record) => JSON.stringify(record)).join("\n")}\n`);
  const lines = fs.readFileSync(file, "utf8").split("\n").filter(Boolean), maxRows = Math.max(1_000, Number(options.maxRows || 50_000));
  if (lines.length > maxRows) fs.writeFileSync(file, `${lines.slice(-maxRows).join("\n")}\n`);
  return {
    file,
    saved: records.length,
    skippedWithoutExactIdentity: analyzed.length - records.length,
    observations: records,
  };
}

export function summarizeCanonicalThreeClockStore(options = {}) {
  const rows = loadCanonicalThreeClockObservations(options);
  const exactRows = rows.filter((row) => hasCanonicalThreeClockIdentity(row));
  return {
    file: options.filePath || DEFAULT_FILE,
    observations: rows.length,
    exactObservations: exactRows.length,
    unresolvedOrLegacyObservations: rows.length - exactRows.length,
    uniqueProjects: new Set(exactRows.map((row) => row.identityKey)).size,
    qualifying: exactRows.filter((row) => row.qualifying).length,
    latestObservedAt: rows.at(-1)?.observedAt || null,
    latestExactObservedAt: exactRows.at(-1)?.observedAt || null,
  };
}
