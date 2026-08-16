
import fs from "node:fs";
import path from "node:path";

const FILE = path.resolve("data", "ignition-executable-edge-canary-replays.jsonl");
const MAX_BYTES = 96 * 1024 * 1024;

function readTail(file = FILE, maxBytes = MAX_BYTES) {
  if (!fs.existsSync(file)) return [];
  const stat = fs.statSync(file);
  const bytes = Math.min(stat.size, Math.max(1024, Number(maxBytes) || MAX_BYTES));
  const start = Math.max(0, stat.size - bytes);
  const buffer = Buffer.alloc(bytes);
  const fd = fs.openSync(file, "r");
  try { fs.readSync(fd, buffer, 0, bytes, start); } finally { fs.closeSync(fd); }
  const lines = buffer.toString("utf8").split("\n");
  if (start > 0) lines.shift();
  return lines.filter(Boolean).flatMap((line) => {
    try { return [JSON.parse(line)]; } catch { return []; }
  });
}

function replayKey(row = {}) {
  return [row.ticketId, row.kind, row.delaySeconds, row.capturedAt, row.quoteId || ""].join("|");
}

export function appendCanaryReplayQuotes(rows = [], options = {}) {
  const file = options.file || FILE;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const existing = readTail(file, options.maxBytes);
  const seen = new Set(existing.map(replayKey));
  const fresh = (Array.isArray(rows) ? rows : []).filter((row) => {
    if (!row?.ticketId) return false;
    const key = replayKey(row);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (fresh.length) fs.appendFileSync(file, fresh.map((row) => JSON.stringify(row)).join("\n") + "\n");
  if (fs.existsSync(file) && fs.statSync(file).size > Number(options.maxBytes || MAX_BYTES)) {
    const retained = readTail(file, Math.floor(Number(options.maxBytes || MAX_BYTES) * 0.75));
    fs.writeFileSync(file, retained.map((row) => JSON.stringify(row)).join("\n") + (retained.length ? "\n" : ""));
  }
  return { file, saved: fresh.length, rows: fresh };
}

export function loadCanaryReplayQuotes(options = {}) {
  return readTail(options.file || FILE, options.maxBytes).slice(-Math.max(1, Number(options.limit || 100000)));
}

export const CANARY_REPLAY_FILE = FILE;
export const __canaryReplayHooks = { readTail, replayKey };
