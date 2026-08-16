import fs from "fs";
import path from "path";

const DEFAULT_FILE = path.resolve("data", "three-clock-canonical-observations.jsonl");

function ensure(file) { fs.mkdirSync(path.dirname(file), { recursive: true }); }
function first(values) { return values.find((value) => value !== undefined && value !== null && value !== "") ?? null; }
function numberOrNull(value) { const n = Number(value); return Number.isFinite(n) ? n : null; }

export function canonicalThreeClockKey(project = {}) {
  const chain = String(first([project.canonicalChain, project.finalChain, project.chain, project.network, project.chainId]) || "unknown").toLowerCase();
  const token = String(first([project.finalContractAddress, project.tokenAddress, project.contractAddress, project.address]) || "").toLowerCase();
  const pool = String(first([project.primaryTradablePool, project.poolAddress, project.pairAddress]) || "").toLowerCase();
  return token ? `${chain}:token:${token}` : pool ? `${chain}:pool:${pool}` : `unresolved:${chain}:${String(project.symbol || project.name || "unknown").toLowerCase()}`;
}

export function loadCanonicalThreeClockObservations(options = {}) {
  const file = options.filePath || DEFAULT_FILE; ensure(file);
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8").split("\n").filter(Boolean).slice(-Number(options.limit || 20_000)).flatMap((line) => { try { return [JSON.parse(line)]; } catch { return []; } });
}

export function historyForCanonicalThreeClock(project, rows = [], options = {}) {
  const key = canonicalThreeClockKey(project);
  return rows.filter((row) => row.identityKey === key).sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt)).slice(-Number(options.limit || 96));
}

export function appendCanonicalThreeClockObservations(projects = [], options = {}) {
  const file = options.filePath || DEFAULT_FILE; ensure(file);
  const observedAt = options.observedAt || new Date().toISOString();
  const records = projects.filter((project) => project.canonicalThreeClockEdge).map((project) => ({
    identityKey: canonicalThreeClockKey(project), observedAt: project.canonicalThreeClockEdge.provenance?.observedAt || observedAt, symbol: project.symbol || null, chain: project.chain || null,
    tokenAddress: first([project.tokenAddress, project.contractAddress, project.address]), poolAddress: first([project.poolAddress, project.pairAddress]),
    priceUsd: numberOrNull(first([project.priceUsd, project.price, project.marketData?.priceUsd])), liquidityUsd: numberOrNull(first([project.dexLiquidityUsd, project.liquidityUsd, project.liquidity])),
    marketCapUsd: numberOrNull(first([project.circulatingMarketCapUsd, project.marketCap])), priceChange24hPct: numberOrNull(first([project.priceChange24hPct, project.priceChange24h])),
    projectClock: project.canonicalThreeClockEdge.projectClock, capitalClock: project.canonicalThreeClockEdge.capitalClock, attentionClock: project.canonicalThreeClockEdge.attentionClock,
    sequence: project.canonicalThreeClockEdge.sequence, sequenceCompression: project.canonicalThreeClockEdge.sequenceCompression, freshness: project.canonicalThreeClockEdge.freshness, ignitionContext: project.canonicalThreeClockEdge.ignitionContext, qualifying: project.canonicalThreeClockEdge.qualifying,
    shadowOnly: true, rankingInfluence: false, provenance: project.canonicalThreeClockEdge.provenance,
  }));
  if (records.length) fs.appendFileSync(file, `${records.map((record) => JSON.stringify(record)).join("\n")}\n`);
  const lines = fs.readFileSync(file, "utf8").split("\n").filter(Boolean), maxRows = Math.max(1_000, Number(options.maxRows || 50_000));
  if (lines.length > maxRows) fs.writeFileSync(file, `${lines.slice(-maxRows).join("\n")}\n`);
  return { file, saved: records.length, observations: records };
}

export function summarizeCanonicalThreeClockStore(options = {}) {
  const rows = loadCanonicalThreeClockObservations(options);
  return { file: options.filePath || DEFAULT_FILE, observations: rows.length, uniqueProjects: new Set(rows.map((row) => row.identityKey)).size, qualifying: rows.filter((row) => row.qualifying).length, latestObservedAt: rows.at(-1)?.observedAt || null };
}
