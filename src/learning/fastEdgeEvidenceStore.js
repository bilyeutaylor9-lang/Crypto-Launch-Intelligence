import fs from "node:fs";
import path from "node:path";

const FILE = path.resolve("data", "edge-fast-outcomes.jsonl");
const MAX_BYTES = 64 * 1024 * 1024;

function readTail(file = FILE, maxBytes = MAX_BYTES) {
  if (!fs.existsSync(file)) return [];
  const stat = fs.statSync(file);
  const bytes = Math.min(stat.size, Math.max(1024, Number(maxBytes) || MAX_BYTES));
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
  return lines.filter(Boolean).flatMap((line) => {
    try { return [JSON.parse(line)]; } catch { return []; }
  });
}

export function loadFastEdgeOutcomes(options = {}) {
  return readTail(options.file || FILE, options.maxBytes);
}

export function appendFastEdgeOutcomes(outcomes = [], options = {}) {
  const file = options.file || FILE;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const existing = readTail(file, options.maxBytes);
  const ids = new Set(existing.map((row) => row.observationId).filter(Boolean));
  const fresh = (Array.isArray(outcomes) ? outcomes : [])
    .filter((row) => row?.observationId && !ids.has(row.observationId));

  if (fresh.length) {
    fs.appendFileSync(file, `${fresh.map((row) => JSON.stringify(row)).join("\n")}\n`);
  }

  return {
    file,
    attempted: Array.isArray(outcomes) ? outcomes.length : 0,
    saved: fresh.length,
    duplicates: (Array.isArray(outcomes) ? outcomes.length : 0) - fresh.length,
  };
}

export const FAST_EDGE_OUTCOME_FILE = FILE;
export const __fastEdgeEvidenceStoreHooks = { readTail };
