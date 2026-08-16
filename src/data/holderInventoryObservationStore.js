import fs from "fs";
import path from "path";

const DATA_DIR = path.resolve("data");
const FILE = path.join(DATA_DIR, "holder-inventory-observations.jsonl");
const MAX_BYTES = Number(process.env.IGNITION_HOLDER_INVENTORY_MAX_BYTES || 32 * 1024 * 1024);
const READ_LIMIT = Number(process.env.IGNITION_HOLDER_INVENTORY_READ_LIMIT || 15_000);

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

function compactActor(row = {}) {
  return {
    address: row.address || null,
    currentBalanceTokens: row.currentBalanceTokens ?? null,
    currentBalanceUsd: row.currentBalanceUsd ?? null,
    knownCostBasisTokens: row.knownCostBasisTokens ?? null,
    knownCostBasisUsd: row.knownCostBasisUsd ?? null,
    unknownBasisTokens: row.unknownBasisTokens ?? null,
    avgObservedAcquisitionPriceUsd: row.avgObservedAcquisitionPriceUsd ?? null,
    realizedSellReturnPct: row.realizedSellReturnPct ?? null,
    medianObservedSellMultiple: row.medianObservedSellMultiple ?? null,
    buyEvents: row.buyEvents ?? null,
    sellEvents: row.sellEvents ?? null,
    observedBuyTokens: row.observedBuyTokens ?? null,
    observedSellTokens: row.observedSellTokens ?? null,
    lastTradeAt: row.lastTradeAt || null,
    lastBuyAt: row.lastBuyAt || null,
    lastSellAt: row.lastSellAt || null,
    dormancyHours: row.dormancyHours ?? null,
    reconstructionState: row.reconstructionState || null,
    confidencePct: row.confidencePct ?? null,
  };
}

function compactRow(project = {}, inventory = {}) {
  return {
    schemaVersion: 1,
    observedAt: inventory.observedAt || new Date().toISOString(),
    identity: identity(project),
    chain: project.chain || project.canonicalChain || null,
    symbol: project.symbol || null,
    tokenAddress: project.tokenAddress || project.contractAddress || project.address || null,
    priceUsd: inventory.priceUsd ?? project.priceUsd ?? project.price ?? null,
    blockNumber: inventory.blockNumber ?? null,
    status: inventory.status || "UNKNOWN",
    sampledActors: inventory.sampledActors ?? 0,
    balanceResolvedActors: inventory.balanceResolvedActors ?? 0,
    actorBalanceCoveragePct: inventory.actorBalanceCoveragePct ?? null,
    knownCostBasisCoveragePct: inventory.knownCostBasisCoveragePct ?? null,
    sampledInventoryTokens: inventory.sampledInventoryTokens ?? null,
    sampledInventoryUsd: inventory.sampledInventoryUsd ?? null,
    knownCostBasisInventoryUsd: inventory.knownCostBasisInventoryUsd ?? null,
    unknownBasisInventoryUsd: inventory.unknownBasisInventoryUsd ?? null,
    acquisitionCostBands: inventory.acquisitionCostBands || [],
    dormancyBands: inventory.dormancyBands || [],
    actors: (inventory.actors || []).slice(0, 40).map(compactActor),
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
  const buffer = Buffer.alloc(stat.size - start);
  const fd = fs.openSync(FILE, "r");
  try {
    fs.readSync(fd, buffer, 0, buffer.length, start);
  } finally {
    fs.closeSync(fd);
  }
  const lines = buffer.toString("utf8").split("\n");
  if (start > 0) lines.shift();
  fs.writeFileSync(FILE, lines.filter(Boolean).join("\n") + "\n");
}

export function appendHolderInventoryObservation(project = {}, inventory = {}) {
  ensureDir();
  const row = compactRow(project, inventory);
  fs.appendFileSync(FILE, JSON.stringify(row) + "\n");
  trimFile();
  return { file: FILE, saved: 1, observation: row };
}

export function loadHolderInventoryObservations(options = {}) {
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

export function holderInventoryHistoryFor(project = {}, options = {}) {
  return loadHolderInventoryObservations({ ...options, identity: identity(project) });
}

export { FILE as HOLDER_INVENTORY_OBSERVATION_FILE };
