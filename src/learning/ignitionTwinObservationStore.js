import fs from "fs";
import path from "path";
import { canonicalIdentityKey, num } from "../edge/edgeMath.js";

const DATA_DIR = path.resolve("data");
const FILE = path.join(DATA_DIR, "ignition-twin-observations.jsonl");
const DEFAULT_LIMIT = 20000;
const DEFAULT_PROJECT_LIMIT = 120;
const DEFAULT_MAX_BYTES = 32 * 1024 * 1024;

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function parseLines(text = "") {
  return String(text || "")
    .split("\n")
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    });
}

function readTail(file = FILE, maxBytes = DEFAULT_MAX_BYTES) {
  ensureDataDir();
  if (!fs.existsSync(file)) return [];
  const stat = fs.statSync(file);
  const bytes = Math.min(stat.size, Math.max(1024, Number(maxBytes) || DEFAULT_MAX_BYTES));
  const start = Math.max(0, stat.size - bytes);
  const buffer = Buffer.alloc(bytes);
  const fd = fs.openSync(file, "r");
  try {
    fs.readSync(fd, buffer, 0, bytes, start);
  } finally {
    fs.closeSync(fd);
  }
  const lines = buffer.toString("utf8").split("\n");
  if (start > 0) lines.shift();
  return parseLines(lines.join("\n"));
}

export function loadIgnitionTwinObservations(options = {}) {
  const limit = Math.max(1, Number(options.limit || process.env.IGNITION_TWIN_OBSERVATION_READ_LIMIT || DEFAULT_LIMIT));
  const rows = readTail(options.file || FILE, options.maxBytes);
  return rows.slice(-limit);
}

export function ignitionHistoryFor(project = {}, observations = [], options = {}) {
  const key = canonicalIdentityKey(project);
  const limit = Math.max(1, Number(options.limit || DEFAULT_PROJECT_LIMIT));
  return (Array.isArray(observations) ? observations : [])
    .filter((row) => row.identityKey === key)
    .sort((a, b) => String(a.observedAt || "").localeCompare(String(b.observedAt || "")))
    .slice(-limit);
}

export function buildIgnitionTwinObservation(project = {}, observedAt = new Date().toISOString()) {
  const twin = project.ignitionTwin || {};
  return {
    schemaVersion: 1,
    identityKey: canonicalIdentityKey(project),
    observedAt,
    scanRunId: project.scanRunId || project.runId || null,
    codeCommitSha: project.codeCommitSha || process.env.GITHUB_SHA || null,
    symbol: project.symbol || null,
    name: project.name || null,
    chain: project.chain || project.canonicalChain || null,
    priceUsd: num(project.priceUsd ?? project.price ?? project.marketData?.priceUsd),
    liquidityUsd: num(project.stableExitLiquidityUsd ?? project.activeLiquidityUsd ?? project.liquidityUsd),
    state: twin.state || project.ignitionState || null,
    confidencePct: num(twin.confidencePct),
    evidenceCoveragePct: num(twin.evidenceCoveragePct),
    effectiveFreeFloatUsd: num(project.effectiveFreeFloatUsd),
    effectiveFloatCompressionPct: num(project.effectiveFloatCompressionPct),
    demandPressurePct: num(project.demandPressurePct),
    demandPressureScore: num(project.demandPressureScore),
    sellerExhaustionScore: num(project.sellerExhaustionScore),
    buyerReplacementScore: num(project.buyerReplacementScore),
    sampledHolderInventoryUsd: num(project.holderInventoryReconstruction?.sampledInventoryUsd ?? project.sampledHolderInventoryUsd),
    holderKnownCostBasisCoveragePct: num(project.holderInventoryReconstruction?.knownCostBasisCoveragePct ?? project.holderKnownCostBasisCoveragePct),
    nearPriceSellInventoryUsd: num(project.marginalSellerCurve?.nearPriceSellInventoryUsd ?? project.currentSellInventoryUsd),
    nearPriceSellInventoryLowerUsd: num(project.marginalSellerCurve?.nearPriceSellInventoryLowerUsd),
    nearPriceSellInventoryUpperUsd: num(project.marginalSellerCurve?.nearPriceSellInventoryUpperUsd),
    marginalSellerInventoryBurnPct: num(project.marginalSellerCurve?.nearPriceInventoryBurnPct ?? project.marginalSellerInventoryBurnPct),
    marginalSellerInventoryState: project.marginalSellerCurve?.inventoryState || project.marginalSellerInventoryState || null,
    liquidityConvexityIndex: num(project.liquidityConvexityIndex),
    liquidityConvexityState: project.liquidityConvexityState || null,
    reflexivityMechanismState: project.reflexivityMechanismState || null,
    reflexivityMechanismStrengthScore: num(project.reflexivityMechanismStrengthScore),
    ignitionCapitalUsd: num(twin.ignitionCapitalUsd),
    ignitionCapitalMode: twin.ignitionCapitalMode || null,
    maxObservedReflexivityMultiplier: num(twin.maxObservedReflexivityMultiplier),
    sequenceCompressionRatio: num(twin.sequenceCompression?.compressionRatio),
    eventTimeAccelerationRatio: num(twin.eventTimeAcceleration?.accelerationRatio),
    repricingGapScore: num(twin.repricingGap?.score),
    pressureWithoutMovement: Boolean(project.marketPressure?.pressureWithoutMovement),
    absorptionState: project.absorptionState || null,
    shadowOnly: true,
  };
}

function trimIfNeeded(file = FILE, maxBytes = DEFAULT_MAX_BYTES) {
  if (!fs.existsSync(file)) return;
  const stat = fs.statSync(file);
  if (stat.size <= maxBytes) return;
  const rows = readTail(file, Math.floor(maxBytes * 0.75));
  fs.writeFileSync(file, rows.map((row) => JSON.stringify(row)).join("\n") + (rows.length ? "\n" : ""));
}

export function appendIgnitionTwinObservations(projects = [], options = {}) {
  ensureDataDir();
  const file = options.file || FILE;
  const observedAt = options.observedAt || new Date().toISOString();
  const rows = (Array.isArray(projects) ? projects : []).map((project) => buildIgnitionTwinObservation(project, observedAt));
  if (rows.length) fs.appendFileSync(file, rows.map((row) => JSON.stringify(row)).join("\n") + "\n");
  trimIfNeeded(file, Number(options.maxBytes || process.env.IGNITION_TWIN_MAX_BYTES || DEFAULT_MAX_BYTES));
  return { file, saved: rows.length, observations: rows };
}

export function summarizeIgnitionTwinObservations(options = {}) {
  const rows = loadIgnitionTwinObservations(options);
  return {
    file: options.file || FILE,
    observations: rows.length,
    uniqueProjects: new Set(rows.map((row) => row.identityKey).filter(Boolean)).size,
    latestObservedAt: rows.at(-1)?.observedAt || null,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(JSON.stringify(summarizeIgnitionTwinObservations(), null, 2));
}
