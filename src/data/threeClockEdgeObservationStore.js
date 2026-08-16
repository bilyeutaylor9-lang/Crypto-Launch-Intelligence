import fs from "fs";
import path from "path";
import { canonicalIdentityKey } from "../edge/edgeMath.js";

const DEFAULT_FILE = path.resolve("data", "three-clock-edge-observations.jsonl");
const DEFAULT_READ_LIMIT = 20_000;
const DEFAULT_HISTORY_LIMIT = 96;
const DEFAULT_MAX_BYTES = 24 * 1024 * 1024;

function ensureDir(filePath = DEFAULT_FILE) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function num(value = null) {
  if (value === null || value === undefined || value === "") return null;
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function compactObservation(project = {}, meta = {}) {
  const edge = project.threeClockEdge || {};
  const now = meta.observedAt || new Date().toISOString();
  const identityKey = canonicalIdentityKey(project);
  const p = edge.projectClock || {};
  const c = edge.capitalClock || {};
  const a = edge.attentionClock || {};

  return {
    observationKey: `${identityKey}|${meta.scanRunId || process.env.GITHUB_RUN_ID || "local"}|${now}`,
    identityKey,
    observedAt: now,
    scanRunId: meta.scanRunId || process.env.GITHUB_RUN_ID || null,
    codeCommitSha: meta.codeCommitSha || process.env.GITHUB_SHA || null,
    symbol: project.symbol || null,
    name: project.name || null,
    chain: project.chain || project.canonicalChain || null,
    tokenAddress: project.tokenAddress || project.contractAddress || null,
    poolAddress: project.poolAddress || project.pairAddress || null,
    priceUsd: num(project.priceUsd ?? project.price),
    liquidityUsd: num(project.stableExitLiquidityUsd ?? project.hardExitLiquidityUsd ?? project.dexLiquidityUsd ?? project.activeLiquidityUsd ?? project.liquidityUsd ?? project.liquidity),
    volume24hUsd: num(project.volume24hUsd ?? project.volume24h ?? project.volume),
    buyerCount: num(project.uniqueBuyers24h ?? project.buyers24h),
    holderCount: num(project.holderCount ?? project.holders),
    priceChange24hPct: num(project.priceChange24hPct ?? project.priceChange24h ?? project.marketData?.priceChange24hPct),
    developerAccelerationScore: num(project.developerAccelerationScore),
    projectChangeScore: num(project.projectChangeScore),
    smartWalletNoveltyScore: num(project.smartWalletNoveltyScore),
    smartWalletArrivalScore: num(project.smartWalletArrivalScore),
    smartMoneyAccumulationScore: num(project.smartMoneyAccumulationScore),
    capitalMigrationScore: num(project.capitalMigrationScore),
    capitalFlowScore: num(project.capitalFlowScore),
    buyerBreadthAccelerationScore: num(project.buyerBreadthAccelerationScore),
    buyPressureScore: num(project.buyPressureScore),
    socialAccelerationScore: num(project.socialAccelerationScore),
    narrativeHeatScore: num(project.narrativeHeatScore),
    projectClockScore: num(p.score),
    capitalClockScore: num(c.score),
    attentionClockScore: num(a.score),
    divergenceScore: num(edge.divergence?.score),
    divergenceState: edge.divergence?.state || null,
    leadStage: edge.leadSequence?.stage || null,
    safetyState: edge.safetyState || null,
    liquidityMode: edge.liquidityTopography?.mode || null,
    pressureMode: edge.asymmetricPressureTwin?.mode || null,
    shadowOnly: true,
  };
}

function maybeTrim(filePath = DEFAULT_FILE, maxBytes = DEFAULT_MAX_BYTES) {
  if (!fs.existsSync(filePath)) return;
  const stat = fs.statSync(filePath);
  if (stat.size <= maxBytes) return;
  const lines = fs.readFileSync(filePath, "utf8").split("\n").filter(Boolean);
  const keep = lines.slice(-Math.max(2_000, Math.floor(lines.length * 0.6)));
  fs.writeFileSync(filePath, keep.join("\n") + "\n");
}

export function loadThreeClockObservations(options = {}) {
  const filePath = options.filePath || DEFAULT_FILE;
  const limit = Math.max(1, Number(options.limit || DEFAULT_READ_LIMIT));
  ensureDir(filePath);
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, "utf8")
    .split("\n")
    .filter(Boolean)
    .slice(-limit)
    .flatMap((line) => {
      try { return [JSON.parse(line)]; } catch { return []; }
    });
}

export function historyForThreeClockProject(project = {}, observations = [], options = {}) {
  const identityKey = canonicalIdentityKey(project);
  const limit = Math.max(1, Number(options.limit || DEFAULT_HISTORY_LIMIT));
  return (Array.isArray(observations) ? observations : [])
    .filter((row) => row.identityKey === identityKey)
    .slice(-limit);
}

export function appendThreeClockObservations(projects = [], meta = {}, options = {}) {
  const filePath = options.filePath || DEFAULT_FILE;
  ensureDir(filePath);
  const rows = (Array.isArray(projects) ? projects : [])
    .filter((project) => project?.threeClockEdge)
    .map((project) => compactObservation(project, meta));
  if (!rows.length) return { filePath, saved: 0, observations: [] };
  fs.appendFileSync(filePath, rows.map((row) => JSON.stringify(row)).join("\n") + "\n");
  maybeTrim(filePath, Number(options.maxBytes || DEFAULT_MAX_BYTES));
  return { filePath, saved: rows.length, observations: rows };
}

export function summarizeThreeClockObservationStore(options = {}) {
  const observations = loadThreeClockObservations(options);
  return {
    filePath: options.filePath || DEFAULT_FILE,
    observations: observations.length,
    uniqueProjects: new Set(observations.map((row) => row.identityKey)).size,
    latestObservedAt: observations.at(-1)?.observedAt || null,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(JSON.stringify(summarizeThreeClockObservationStore(), null, 2));
}
