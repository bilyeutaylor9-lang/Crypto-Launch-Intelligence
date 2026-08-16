import fs from "fs";
import path from "path";

const DATA_DIR = path.resolve("data");
const FILE = path.join(DATA_DIR, "supply-lineage-observations.jsonl");
const MAX_BYTES = Number(process.env.IGNITION_SUPPLY_LINEAGE_MAX_BYTES || 32 * 1024 * 1024);
const READ_LIMIT = Number(process.env.IGNITION_SUPPLY_LINEAGE_READ_LIMIT || 15_000);

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

function compact(project = {}, lineage = {}, intelligence = {}) {
  return {
    schemaVersion: 1,
    observedAt: lineage.observedAt || new Date().toISOString(),
    identity: identity(project),
    chain: project.chain || project.canonicalChain || null,
    symbol: project.symbol || null,
    tokenAddress: project.tokenAddress || project.contractAddress || project.address || null,
    status: lineage.status || "UNKNOWN",
    confidencePct: lineage.confidencePct ?? null,
    transferLogCount: lineage.transferLogCount ?? null,
    confirmedSellSupplyUsd: lineage.confirmedSellSupplyUsd ?? null,
    marketFacingPotentialSupplyUsd: lineage.marketFacingPotentialSupplyUsd ?? null,
    stagedOneHopSupplyUsd: lineage.stagedOneHopSupplyUsd ?? null,
    unresolvedStagedUsd: lineage.unresolvedStagedUsd ?? null,
    cexDirectedSupplyUsd: lineage.cexDirectedSupplyUsd ?? null,
    bridgeMobilityUsd: lineage.bridgeMobilityUsd ?? null,
    dormantWakeupUsd: lineage.dormantWakeupUsd ?? null,
    dormantMarketFacingUsd: lineage.dormantMarketFacingUsd ?? null,
    strategicMarketFacingUsd: lineage.strategicMarketFacingUsd ?? null,
    lineageState: intelligence.state || null,
    lineageRiskScore: intelligence.riskScore ?? null,
    contextualSupplyRiskUsd: intelligence.contextualSupplyRiskUsd ?? null,
    vacuumIntegrityState: intelligence.vacuumIntegrityState || null,
    oneHopPaths: (lineage.oneHopPaths || []).slice(0, 30),
    relevantEvents: (lineage.relevantEvents || []).slice(-80).map((row) => ({
      type: row.type,
      txHash: row.txHash || null,
      blockNumber: row.blockNumber ?? null,
      eventTime: row.eventTime || null,
      from: row.from || null,
      to: row.to || null,
      amountTokens: row.amountTokens ?? null,
      confidencePct: row.confidencePct ?? null,
    })),
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
  try { fs.readSync(fd, buffer, 0, buffer.length, start); } finally { fs.closeSync(fd); }
  const lines = buffer.toString("utf8").split("\n");
  if (start > 0) lines.shift();
  fs.writeFileSync(FILE, lines.filter(Boolean).join("\n") + "\n");
}

export function appendSupplyLineageObservation(project = {}, lineage = {}, intelligence = {}) {
  ensureDir();
  const row = compact(project, lineage, intelligence);
  fs.appendFileSync(FILE, JSON.stringify(row) + "\n");
  trimFile();
  return { file: FILE, saved: 1, observation: row };
}

export function loadSupplyLineageObservations(options = {}) {
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

export function supplyLineageHistoryFor(project = {}, options = {}) {
  return loadSupplyLineageObservations({ ...options, identity: identity(project) });
}

export { FILE as SUPPLY_LINEAGE_OBSERVATION_FILE };
