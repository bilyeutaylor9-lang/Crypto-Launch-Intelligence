import fs from "fs";
import path from "path";

const DATA_DIR = path.resolve("data");
const FILE = path.join(DATA_DIR, "chain-capital-radar-observations.jsonl");

function ensureDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function compactObservation(observation = {}) {
  return {
    observationKey: `${observation.chain || "unknown"}:${observation.blockNumber ?? observation.observedAt ?? "unknown"}`,
    observedAt: observation.observedAt || new Date().toISOString(),
    chain: observation.chain || null,
    chainId: observation.chainId ?? null,
    status: observation.status || "UNKNOWN",
    blockNumber: observation.blockNumber ?? null,
    fromBlock: observation.fromBlock ?? null,
    lookbackMinutes: observation.lookbackMinutes ?? null,
    discoveredWalletCount: observation.discoveredWalletCount ?? 0,
    newlyDiscoveredWalletCount: observation.newlyDiscoveredWalletCount ?? 0,
    preparedWalletCount: observation.preparedWalletCount ?? 0,
    totalFreshCapitalUsd: observation.totalFreshCapitalUsd ?? null,
    executionReadyCapitalUsd: observation.executionReadyCapitalUsd ?? null,
    assignedExecutionReadyCapitalUsd: observation.assignedExecutionReadyCapitalUsd ?? null,
    unassignedExecutionReadyCapitalUsd: observation.unassignedExecutionReadyCapitalUsd ?? null,
    capitalConvergence: observation.capitalConvergence || null,
    candidateSummaries: (observation.candidateSummaries || []).slice(0, 100),
    wallets: (observation.wallets || []).slice(0, 120).map((row) => ({
      address: row.address || null,
      newlyDiscovered: Boolean(row.newlyDiscovered),
      observedStablecoinInflowUsd: row.observedStablecoinInflowUsd ?? null,
      currentStablecoinBalanceUsd: row.currentStablecoinBalanceUsd ?? null,
      freshAvailableCapitalUsd: row.freshAvailableCapitalUsd ?? null,
      nativeGasReady: Boolean(row.nativeGasReady),
      executionPrepared: Boolean(row.executionPrepared),
      executionReadyCapitalUsd: row.executionReadyCapitalUsd ?? null,
      fundingSources: row.fundingSources || [],
      fundingEvents: (row.fundingEvents || []).slice(0, 20).map((event) => ({
        from: event.from || null,
        to: event.to || null,
        amountUsd: event.amountUsd ?? null,
        tokenAddress: event.tokenAddress || null,
        tokenSymbol: event.tokenSymbol || null,
        txHash: event.txHash || null,
        blockNumber: event.blockNumber ?? null,
        eventTime: event.eventTime || null,
      })),
      approvalEvents: (row.approvalEvents || []).slice(0, 20).map((event) => ({
        owner: event.owner || null,
        spender: event.spender || null,
        allowanceUsd: event.allowanceUsd ?? null,
        tokenAddress: event.tokenAddress || null,
        tokenSymbol: event.tokenSymbol || null,
        genericCandidateKeys: event.genericCandidateKeys || [],
        targetCandidateKeys: event.targetCandidateKeys || [],
        txHash: event.txHash || null,
        blockNumber: event.blockNumber ?? null,
        eventTime: event.eventTime || null,
      })),
      destination: row.destination || null,
      confidencePct: row.confidencePct ?? null,
    })),
    confidencePct: observation.confidencePct ?? null,
    shadowOnly: true,
    rankingInfluence: false,
  };
}

function existingKeys() {
  ensureDir();
  if (!fs.existsSync(FILE)) return new Set();
  return new Set(fs.readFileSync(FILE, "utf8").split("\n").filter(Boolean).slice(-2000).flatMap((line) => {
    try {
      const row = JSON.parse(line);
      return row.observationKey ? [row.observationKey] : [];
    } catch {
      return [];
    }
  }));
}

export function appendChainCapitalRadarObservation(observation = {}) {
  ensureDir();
  const row = compactObservation(observation);
  const keys = existingKeys();
  if (keys.has(row.observationKey)) return { file: FILE, saved: 0, observation: row };
  fs.appendFileSync(FILE, `${JSON.stringify(row)}\n`);
  return { file: FILE, saved: 1, observation: row };
}

export function appendChainCapitalRadarObservations(observations = []) {
  let saved = 0;
  const rows = [];
  for (const observation of Array.isArray(observations) ? observations : []) {
    const result = appendChainCapitalRadarObservation(observation);
    saved += result.saved;
    rows.push(result.observation);
  }
  return { file: FILE, attempted: rows.length, saved, observations: rows };
}

export function loadChainCapitalRadarObservations(options = {}) {
  ensureDir();
  if (!fs.existsSync(FILE)) return [];
  const limit = Math.max(1, Number(options.limit || process.env.IGNITION_CAPITAL_RADAR_HISTORY_LIMIT || 500));
  const chain = String(options.chain || "").toLowerCase();
  return fs.readFileSync(FILE, "utf8").split("\n").filter(Boolean).slice(-Math.max(limit * 4, limit)).flatMap((line) => {
    try {
      const row = JSON.parse(line);
      if (chain && String(row.chain || "").toLowerCase() !== chain) return [];
      return [row];
    } catch {
      return [];
    }
  }).slice(-limit);
}

export function chainCapitalRadarHistoryFor(chain = "", options = {}) {
  return loadChainCapitalRadarObservations({ ...options, chain });
}

export function summarizeChainCapitalRadarStore() {
  const rows = loadChainCapitalRadarObservations({ limit: 5000 });
  return {
    file: FILE,
    observations: rows.length,
    chains: [...new Set(rows.map((row) => row.chain).filter(Boolean))],
    latestObservedAt: rows.at(-1)?.observedAt || null,
    latestBlockNumber: rows.at(-1)?.blockNumber ?? null,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(JSON.stringify(summarizeChainCapitalRadarStore(), null, 2));
}
