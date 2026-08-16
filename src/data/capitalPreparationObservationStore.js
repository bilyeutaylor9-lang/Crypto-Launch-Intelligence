import fs from "fs";
import path from "path";

const DATA_DIR = path.resolve("data");
const FILE = path.join(DATA_DIR, "capital-preparation-observations.jsonl");
const MAX_BYTES = Number(process.env.IGNITION_CAPITAL_PREPARATION_MAX_BYTES || 32 * 1024 * 1024);
const READ_LIMIT = Number(process.env.IGNITION_CAPITAL_PREPARATION_READ_LIMIT || 15_000);

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

function compactWallet(row = {}) {
  return {
    address: row.address || null,
    actorType: row.actorType || null,
    currentStablecoinBalanceUsd: row.currentStablecoinBalanceUsd ?? null,
    previousStablecoinBalanceUsd: row.previousStablecoinBalanceUsd ?? null,
    positiveStablecoinBalanceDeltaUsd: row.positiveStablecoinBalanceDeltaUsd ?? null,
    recentStablecoinInflowUsd: row.recentStablecoinInflowUsd ?? null,
    freshAvailableCapitalUsd: row.freshAvailableCapitalUsd ?? null,
    nativeBalanceWei: row.nativeBalanceWei ?? null,
    previousNativeBalanceWei: row.previousNativeBalanceWei ?? null,
    nativeBalanceDeltaWei: row.nativeBalanceDeltaWei ?? null,
    executionPrepared: row.executionPrepared === true,
    executionReadyCapitalUsd: row.executionReadyCapitalUsd ?? null,
    targetProximity: row.targetProximity === true,
    targetProximityCapitalUsd: row.targetProximityCapitalUsd ?? null,
    targetBuyUsd: row.targetBuyUsd ?? null,
    distinctFundingSources: Array.isArray(row.distinctFundingSources) ? row.distinctFundingSources.slice(0, 12) : [],
    confidencePct: row.confidencePct ?? null,
  };
}

function compact(project = {}, observation = {}, intelligence = {}) {
  return {
    schemaVersion: 1,
    observedAt: observation.observedAt || new Date().toISOString(),
    identity: identity(project),
    chain: project.chain || project.canonicalChain || null,
    symbol: project.symbol || null,
    tokenAddress: project.tokenAddress || project.contractAddress || project.address || null,
    status: observation.status || "UNKNOWN",
    state: observation.state || null,
    confidencePct: observation.confidencePct ?? null,
    observedFreshCapitalUsd: observation.observedFreshCapitalUsd ?? null,
    executionReadyCapitalUsd: observation.executionReadyCapitalUsd ?? null,
    targetProximityCapitalUsd: observation.targetProximityCapitalUsd ?? null,
    visibleDeployedToTargetUsd: observation.visibleDeployedToTargetUsd ?? null,
    preparedWalletCount: observation.capitalConvergence?.preparedWalletCount ?? null,
    distinctFundingSourceCount: observation.capitalConvergence?.distinctFundingSourceCount ?? null,
    largestFundingSourceSharePct: observation.capitalConvergence?.largestFundingSourceSharePct ?? null,
    convergenceState: observation.capitalConvergence?.state || null,
    executionContractCount: observation.executionContractCount ?? null,
    targetingEvidenceMode: observation.targetingEvidenceMode || null,
    wallets: (observation.wallets || []).slice(0, 24).map(compactWallet),
    intelligenceState: intelligence.state || null,
    candidateAdjustedStagedCapitalUsd: intelligence.candidateAdjustedStagedCapitalUsd ?? null,
    targetingConfidencePct: intelligence.targetingConfidencePct ?? null,
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

export function appendCapitalPreparationObservation(project = {}, observation = {}, intelligence = {}) {
  ensureDir();
  const row = compact(project, observation, intelligence);
  fs.appendFileSync(FILE, JSON.stringify(row) + "\n");
  trimFile();
  return { file: FILE, saved: 1, observation: row };
}

export function loadCapitalPreparationObservations(options = {}) {
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

export function capitalPreparationHistoryFor(project = {}, options = {}) {
  return loadCapitalPreparationObservations({ ...options, identity: identity(project) });
}

export { FILE as CAPITAL_PREPARATION_OBSERVATION_FILE };
