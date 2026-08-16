import fs from "fs";
import path from "path";

const DATA_DIR = path.resolve("data");
const FILE = path.join(DATA_DIR, "ignition-event-tape.jsonl");
const MAX_BYTES = Number(process.env.IGNITION_EVENT_TAPE_MAX_BYTES || 48 * 1024 * 1024);
const DEDUPE_READ_BYTES = Number(process.env.IGNITION_EVENT_TAPE_DEDUPE_READ_BYTES || 4 * 1024 * 1024);
const READ_LIMIT = Number(process.env.IGNITION_EVENT_TAPE_READ_LIMIT || 20_000);

function ensureDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function identityFrom(project = {}) {
  return String(
    project.canonicalProjectId ||
    project.projectId ||
    (project.chain && (project.tokenAddress || project.contractAddress || project.address)
      ? `${project.chain}:${project.tokenAddress || project.contractAddress || project.address}`
      : project.symbol || project.name || "unknown")
  ).toLowerCase();
}

function readTail(filePath, maxBytes) {
  const stat = fs.statSync(filePath);
  const bytes = Math.min(stat.size, Math.max(1024, maxBytes));
  const start = Math.max(0, stat.size - bytes);
  const buffer = Buffer.alloc(bytes);
  const fd = fs.openSync(filePath, "r");
  try {
    fs.readSync(fd, buffer, 0, bytes, start);
  } finally {
    fs.closeSync(fd);
  }
  const lines = buffer.toString("utf8").split("\n");
  if (start > 0) lines.shift();
  return lines.filter(Boolean);
}

function existingKeys() {
  ensureDir();
  if (!fs.existsSync(FILE)) return new Set();
  return new Set(readTail(FILE, DEDUPE_READ_BYTES).flatMap((line) => {
    try {
      const row = JSON.parse(line);
      return row.eventKey ? [row.eventKey] : [];
    } catch {
      return [];
    }
  }));
}

function trimFile() {
  ensureDir();
  if (!fs.existsSync(FILE)) return;
  const stat = fs.statSync(FILE);
  if (stat.size <= MAX_BYTES) return;
  const keepBytes = Math.max(2_000_000, Math.floor(MAX_BYTES * 0.7));
  const start = Math.max(0, stat.size - keepBytes);
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

function compactEvent(event = {}, project = {}) {
  return {
    schemaVersion: 1,
    eventKey: event.eventKey || null,
    identity: identityFrom(project),
    chain: event.chain || project.chain || project.canonicalChain || null,
    tokenAddress: event.tokenAddress || project.tokenAddress || project.contractAddress || project.address || null,
    poolAddress: event.poolAddress || project.poolAddress || project.pairAddress || null,
    eventType: event.eventType || null,
    eventTime: event.eventTime || null,
    observedAt: event.observedAt || new Date().toISOString(),
    blockNumber: event.blockNumber ?? null,
    blockHash: event.blockHash || null,
    txHash: event.txHash || null,
    logIndex: event.logIndex ?? null,
    side: event.side || null,
    usdNotional: event.usdNotional ?? null,
    targetTokenAmount: event.targetTokenAmount ?? null,
    quoteTokenAmount: event.quoteTokenAmount ?? null,
    executionPriceUsd: event.executionPriceUsd ?? null,
    actorAddress: event.actorAddress || null,
    economicActorAddress: event.economicActorAddress || null,
    economicActorRole: event.economicActorRole || null,
    transactionInitiator: event.transactionInitiator || null,
    transactionEntryAddress: event.transactionEntryAddress || null,
    transactionInitiatorType: event.transactionInitiatorType || null,
    transactionEntryType: event.transactionEntryType || null,
    actorConfidencePct: event.actorConfidencePct ?? null,
    actorResolutionMode: event.actorResolutionMode || null,
    participantIdentityMode: event.participantIdentityMode || null,
    routerAdjusted: Boolean(event.routerAdjusted),
    routeMode: event.routeMode || null,
    routeHopCountObserved: event.routeHopCountObserved ?? null,
    knownRouterObserved: event.knownRouterObserved ?? null,
    traceStatus: event.traceStatus || null,
    beneficialOwnerResolved: false,
    activeRange: event.activeRange ?? null,
    tick: event.tick ?? null,
    tickLower: event.tickLower ?? null,
    tickUpper: event.tickUpper ?? null,
    liquidityChangeRaw: event.liquidityChangeRaw ?? null,
    liquidityUsdNotional: event.liquidityUsdNotional ?? null,
    reorgSafe: event.reorgSafe !== false,
    source: event.source || "UNISWAP_V3_POOL_EVENTS",
  };
}

export function appendIgnitionEventTape(project = {}, events = []) {
  ensureDir();
  const keys = existingKeys();
  const rows = [];
  for (const event of Array.isArray(events) ? events : []) {
    if (!event?.eventKey || keys.has(event.eventKey)) continue;
    keys.add(event.eventKey);
    rows.push(compactEvent(event, project));
  }
  if (rows.length) fs.appendFileSync(FILE, rows.map((row) => JSON.stringify(row)).join("\n") + "\n");
  trimFile();
  return { file: FILE, saved: rows.length, attempted: Array.isArray(events) ? events.length : 0 };
}

export function loadIgnitionEventTape(options = {}) {
  ensureDir();
  if (!fs.existsSync(FILE)) return [];
  const limit = Math.max(1, Number(options.limit || READ_LIMIT));
  const identity = options.identity ? String(options.identity).toLowerCase() : null;
  const pool = options.poolAddress ? String(options.poolAddress).toLowerCase() : null;
  return readTail(FILE, Math.max(DEDUPE_READ_BYTES, 16 * 1024 * 1024))
    .slice(-limit)
    .flatMap((line) => {
      try {
        const row = JSON.parse(line);
        if (identity && row.identity !== identity) return [];
        if (pool && String(row.poolAddress || "").toLowerCase() !== pool) return [];
        return [row];
      } catch {
        return [];
      }
    });
}

export function ignitionEventTapeHistoryFor(project = {}, options = {}) {
  return loadIgnitionEventTape({ ...options, identity: identityFrom(project) });
}

export { FILE as IGNITION_EVENT_TAPE_FILE };
