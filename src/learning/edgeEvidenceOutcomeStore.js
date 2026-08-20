import fs from "node:fs";
import path from "node:path";

const FILE = path.resolve("data", "edge-evidence-outcomes.jsonl");
const MAX_BYTES = 96 * 1024 * 1024;
const DEFAULT_LIMIT = 200_000;

function readTail(file = FILE, maxBytes = MAX_BYTES) {
  if (!fs.existsSync(file)) return [];
  const stat = fs.statSync(file);
  const bytes = Math.min(stat.size, Math.max(1024, Number(maxBytes) || MAX_BYTES));
  const start = Math.max(0, stat.size - bytes);
  const buffer = Buffer.alloc(bytes);
  const descriptor = fs.openSync(file, "r");
  try {
    fs.readSync(descriptor, buffer, 0, bytes, start);
  } finally {
    fs.closeSync(descriptor);
  }
  const lines = buffer.toString("utf8").split("\n");
  if (start > 0) lines.shift();
  return lines.filter(Boolean).flatMap((line) => {
    try { return [JSON.parse(line)]; } catch { return []; }
  });
}

export function loadEdgeEvidenceOutcomes(options = {}) {
  return readTail(options.file || FILE, options.maxBytes)
    .slice(-Math.max(1, Number(options.limit || DEFAULT_LIMIT)));
}

export function appendEdgeEvidenceOutcomes(outcomes = [], options = {}) {
  const file = options.file || FILE;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const existing = readTail(file, options.maxBytes);
  const ids = new Set(existing.map((row) => row.observationId).filter(Boolean));
  const fresh = (Array.isArray(outcomes) ? outcomes : [])
    .filter((row) => row?.observationId && !ids.has(row.observationId));
  if (fresh.length) fs.appendFileSync(file, `${fresh.map((row) => JSON.stringify(row)).join("\n")}\n`);
  if (fs.existsSync(file) && fs.statSync(file).size > Number(options.maxBytes || MAX_BYTES)) {
    const retained = readTail(file, Math.floor(Number(options.maxBytes || MAX_BYTES) * 0.75));
    fs.writeFileSync(file, retained.map((row) => JSON.stringify(row)).join("\n") + (retained.length ? "\n" : ""));
  }
  return {
    file,
    attempted: Array.isArray(outcomes) ? outcomes.length : 0,
    saved: fresh.length,
    duplicates: (Array.isArray(outcomes) ? outcomes.length : 0) - fresh.length,
    outcomes: fresh,
  };
}

export const EDGE_EVIDENCE_OUTCOME_FILE = FILE;
export const __edgeEvidenceOutcomeStoreHooks = { readTail };
