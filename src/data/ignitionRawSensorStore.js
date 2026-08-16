import fs from "fs";
import path from "path";

const DATA_DIR = path.resolve("data");
const FILE = path.join(DATA_DIR, "ignition-raw-sensor-observations.jsonl");
const MAX_BYTES = Number(process.env.IGNITION_RAW_SENSOR_MAX_BYTES || 24 * 1024 * 1024);
const READ_LIMIT = Number(process.env.IGNITION_RAW_SENSOR_READ_LIMIT || 12_000);

function ensureDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function identity(project = {}) {
  return String(
    project.canonicalProjectId ||
    project.projectId ||
    (project.chain && (project.tokenAddress || project.contractAddress || project.address)
      ? `${project.chain}:${project.tokenAddress || project.contractAddress || project.address}`
      : project.symbol || project.name || "unknown")
  ).toLowerCase();
}

function compactRow(project = {}) {
  const raw = project.ignitionRawSensors || {};
  return {
    observedAt: raw.observedAt || new Date().toISOString(),
    identity: identity(project),
    chain: project.chain || project.canonicalChain || null,
    symbol: project.symbol || null,
    tokenAddress: project.tokenAddress || project.contractAddress || project.address || null,
    poolAddress: project.poolAddress || project.pairAddress || null,
    status: raw.status || "UNKNOWN",
    coveragePct: raw.coveragePct ?? null,
    liquidity: raw.liquidity ? {
      status: raw.liquidity.status || null,
      blockNumber: raw.liquidity.blockNumber || null,
      depthByMovePct: raw.liquidity.liquiditySurface?.depthByMovePct || {},
      initializedTicksRead: raw.liquidity.poolState?.initializedTicksRead ?? null,
    } : null,
    holders: raw.holders ? {
      status: raw.holders.status || null,
      retention1hPct: raw.holders.holderCohorts?.recentAcquisitionRetention1hPct ?? null,
      retention6hPct: raw.holders.holderCohorts?.recentAcquisitionRetention6hPct ?? null,
      sampledEoaWallets: raw.holders.holderCohorts?.sampledEoaWallets ?? null,
    } : null,
    leverage: raw.leverage ? {
      status: raw.leverage.status || null,
      coin: raw.leverage.coin || null,
      openInterestUsd: raw.leverage.derivatives?.openInterestUsd ?? null,
      fundingRate: raw.leverage.derivatives?.fundingRate ?? null,
      liquidationLadderState: raw.leverage.derivatives?.liquidationLadderState || null,
    } : null,
    prePositioningCapital: raw.prePositioningCapital ? {
      status: raw.prePositioningCapital.status || null,
      state: raw.prePositioningCapital.state || null,
      confidencePct: raw.prePositioningCapital.confidencePct ?? null,
      observedFreshCapitalUsd: raw.prePositioningCapital.observedFreshCapitalUsd ?? null,
      executionReadyCapitalUsd: raw.prePositioningCapital.executionReadyCapitalUsd ?? null,
      targetProximityCapitalUsd: raw.prePositioningCapital.targetProximityCapitalUsd ?? null,
      visibleDeployedToTargetUsd: raw.prePositioningCapital.visibleDeployedToTargetUsd ?? null,
      preparedWalletCount: raw.prePositioningCapital.capitalConvergence?.preparedWalletCount ?? null,
      distinctFundingSourceCount: raw.prePositioningCapital.capitalConvergence?.distinctFundingSourceCount ?? null,
      largestFundingSourceSharePct: raw.prePositioningCapital.capitalConvergence?.largestFundingSourceSharePct ?? null,
      convergenceState: raw.prePositioningCapital.capitalConvergence?.state || null,
      targetingEvidenceMode: raw.prePositioningCapital.targetingEvidenceMode || null,
    } : null,
    holderInventory: raw.holderInventory ? {
      status: raw.holderInventory.status || null,
      blockNumber: raw.holderInventory.blockNumber || null,
      sampledActors: raw.holderInventory.sampledActors ?? null,
      balanceResolvedActors: raw.holderInventory.balanceResolvedActors ?? null,
      actorBalanceCoveragePct: raw.holderInventory.actorBalanceCoveragePct ?? null,
      knownCostBasisCoveragePct: raw.holderInventory.knownCostBasisCoveragePct ?? null,
      sampledInventoryUsd: raw.holderInventory.sampledInventoryUsd ?? null,
      knownCostBasisInventoryUsd: raw.holderInventory.knownCostBasisInventoryUsd ?? null,
      unknownBasisInventoryUsd: raw.holderInventory.unknownBasisInventoryUsd ?? null,
      acquisitionCostBands: raw.holderInventory.acquisitionCostBands || [],
      dormancyBands: raw.holderInventory.dormancyBands || [],
    } : null,
    marginalSellerCurve: raw.marginalSellerCurve ? {
      status: raw.marginalSellerCurve.status || null,
      nearPriceSellInventoryUsd: raw.marginalSellerCurve.nearPriceSellInventoryUsd ?? null,
      nearPriceSellInventoryLowerUsd: raw.marginalSellerCurve.nearPriceSellInventoryLowerUsd ?? null,
      nearPriceSellInventoryUpperUsd: raw.marginalSellerCurve.nearPriceSellInventoryUpperUsd ?? null,
      nearPriceInventoryBurnPct: raw.marginalSellerCurve.nearPriceInventoryBurnPct ?? null,
      inventoryState: raw.marginalSellerCurve.inventoryState || null,
      confidencePct: raw.marginalSellerCurve.confidencePct ?? null,
      bands: raw.marginalSellerCurve.bands || [],
    } : null,
    eventTape: raw.eventTape ? {
      status: raw.eventTape.status || null,
      blockNumber: raw.eventTape.blockNumber ?? null,
      fromBlock: raw.eventTape.fromBlock ?? null,
      eventsScanned: raw.eventTape.eventsScanned ?? null,
      swapEvents: raw.eventTape.swapEvents ?? null,
      mintEvents: raw.eventTape.mintEvents ?? null,
      burnEvents: raw.eventTape.burnEvents ?? null,
      windows: raw.eventTape.marketMicrostructure?.windows || {},
      swapTimeAcceleration: raw.eventTape.marketMicrostructure?.swapTimeAcceleration || null,
      sequenceCompression: raw.eventTape.marketMicrostructure?.sequenceCompression || null,
      refillHalfLife: raw.eventTape.lpEventTape?.refillHalfLife || null,
      rangeMigration: raw.eventTape.lpEventTape?.rangeMigration || null,
    } : null,
    shadowOnly: true,
  };
}

function trimFile() {
  ensureDir();
  if (!fs.existsSync(FILE)) return;
  const stat = fs.statSync(FILE);
  if (stat.size <= MAX_BYTES) return;
  const bytes = Math.max(1_000_000, Math.floor(MAX_BYTES * 0.7));
  const start = Math.max(0, stat.size - bytes);
  const fd = fs.openSync(FILE, "r");
  const buffer = Buffer.alloc(stat.size - start);
  try {
    fs.readSync(fd, buffer, 0, buffer.length, start);
  } finally {
    fs.closeSync(fd);
  }
  const lines = buffer.toString("utf8").split("\n");
  if (start > 0) lines.shift();
  fs.writeFileSync(FILE, lines.filter(Boolean).join("\n") + "\n");
}

export function appendIgnitionRawSensorObservations(projects = []) {
  ensureDir();
  const rows = (Array.isArray(projects) ? projects : [])
    .filter((project) => project?.ignitionRawSensors)
    .map(compactRow);
  if (rows.length) fs.appendFileSync(FILE, rows.map((row) => JSON.stringify(row)).join("\n") + "\n");
  trimFile();
  return { file: FILE, saved: rows.length };
}

export function loadIgnitionRawSensorObservations(options = {}) {
  ensureDir();
  if (!fs.existsSync(FILE)) return [];
  const limit = Math.max(1, Number(options.limit || READ_LIMIT));
  const target = options.identity ? String(options.identity).toLowerCase() : null;
  return fs.readFileSync(FILE, "utf8")
    .split("\n")
    .filter(Boolean)
    .slice(-limit)
    .flatMap((line) => {
      try {
        const row = JSON.parse(line);
        if (target && row.identity !== target) return [];
        return [row];
      } catch {
        return [];
      }
    });
}

export function ignitionRawSensorHistoryFor(project = {}, options = {}) {
  return loadIgnitionRawSensorObservations({ ...options, identity: identity(project) });
}

export { FILE as IGNITION_RAW_SENSOR_FILE };
