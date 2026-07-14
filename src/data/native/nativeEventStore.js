import fs from "fs";
import path from "path";
import { normalizeNativeEvent } from "./NativePoolAdapter.js";

const DATA_DIR = path.resolve("data", "native-discovery");
const RAW_EVENTS_FILE = path.join(DATA_DIR, "raw-events.json");
const CONFIRMED_EVENTS_FILE = path.join(DATA_DIR, "confirmed-events.json");
const CHECKPOINTS_FILE = path.join(DATA_DIR, "checkpoints.json");
const DEAD_LETTER_FILE = path.join(DATA_DIR, "dead-letter.json");
const MAX_EVENTS = Number(process.env.NATIVE_EVENT_STORE_MAX_EVENTS || 100000);

function ensureDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readJson(filePath, fallback) {
  ensureDir();
  if (!fs.existsSync(filePath)) return fallback;

  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, value) {
  ensureDir();
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function upsertEvents(existing = [], incoming = []) {
  const map = new Map();

  for (const event of existing) {
    if (event?.eventId) map.set(event.eventId, event);
  }
  for (const event of incoming) {
    if (event?.eventId) map.set(event.eventId, { ...(map.get(event.eventId) || {}), ...event });
  }

  return [...map.values()]
    .sort((a, b) => String(a.timestamp || "").localeCompare(String(b.timestamp || "")))
    .slice(-MAX_EVENTS);
}

export function recordNativeEvents(events = [], options = {}) {
  const normalized = (Array.isArray(events) ? events : [events])
    .filter(Boolean)
    .map((event) => normalizeNativeEvent({ ...event, finalized: options.finalized ?? event.finalized }));
  const filePath = options.confirmed ? CONFIRMED_EVENTS_FILE : RAW_EVENTS_FILE;
  const existing = readJson(filePath, []);
  const updated = upsertEvents(existing, normalized);

  writeJson(filePath, updated);

  return {
    saved: normalized.length,
    total: updated.length,
    filePath,
  };
}

export function confirmNativeEvents(events = []) {
  const normalized = (Array.isArray(events) ? events : [events])
    .filter(Boolean)
    .map((event) => normalizeNativeEvent({ ...event, finalized: true }));
  const existing = readJson(CONFIRMED_EVENTS_FILE, []);
  const updated = upsertEvents(existing, normalized);

  writeJson(CONFIRMED_EVENTS_FILE, updated);

  return {
    confirmed: normalized.length,
    total: updated.length,
    filePath: CONFIRMED_EVENTS_FILE,
  };
}

export function loadNativeEvents(options = {}) {
  const confirmed = options.confirmed === true;
  const includeRaw = options.includeRaw === true;
  const limit = Number(options.limit || 0);
  const events = [
    ...(confirmed || !includeRaw ? readJson(CONFIRMED_EVENTS_FILE, []) : []),
    ...(includeRaw ? readJson(RAW_EVENTS_FILE, []) : []),
  ];
  const seen = new Map(events.map((event) => [event.eventId, event]));
  const filtered = [...seen.values()].filter((event) => {
    if (options.chain && event.chain !== options.chain) return false;
    if (options.protocol && event.protocol !== options.protocol) return false;
    if (options.eventType && event.eventType !== options.eventType) return false;
    return true;
  });

  return limit > 0 ? filtered.slice(-limit) : filtered;
}

export function updateNativeCheckpoint(source = "", checkpoint = {}) {
  const checkpoints = readJson(CHECKPOINTS_FILE, {});
  const key = source || `${checkpoint.chain || "unknown"}:${checkpoint.protocol || "unknown"}`;

  checkpoints[key] = {
    ...(checkpoints[key] || {}),
    ...checkpoint,
    source: key,
    updatedAt: new Date().toISOString(),
  };

  writeJson(CHECKPOINTS_FILE, checkpoints);

  return checkpoints[key];
}

export function getNativeCheckpoints() {
  return readJson(CHECKPOINTS_FILE, {});
}

export function recordNativeDeadLetter(item = {}) {
  const existing = readJson(DEAD_LETTER_FILE, []);
  const updated = [...existing, { ...item, recordedAt: new Date().toISOString() }].slice(-10000);

  writeJson(DEAD_LETTER_FILE, updated);

  return {
    recorded: true,
    total: updated.length,
    filePath: DEAD_LETTER_FILE,
  };
}

export function summarizeNativeEventStore() {
  const raw = readJson(RAW_EVENTS_FILE, []);
  const confirmed = readJson(CONFIRMED_EVENTS_FILE, []);
  const checkpoints = readJson(CHECKPOINTS_FILE, {});
  const deadLetters = readJson(DEAD_LETTER_FILE, []);
  const byType = [...raw, ...confirmed].reduce((acc, event) => {
    acc[event.eventType || "UNKNOWN"] = (acc[event.eventType || "UNKNOWN"] || 0) + 1;
    return acc;
  }, {});

  return {
    dataDir: DATA_DIR,
    rawEvents: raw.length,
    confirmedEvents: confirmed.length,
    checkpoints: Object.keys(checkpoints).length,
    deadLetters: deadLetters.length,
    byType,
    latestEventAt: [...raw, ...confirmed].map((event) => event.timestamp).filter(Boolean).sort().at(-1) || null,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(JSON.stringify(summarizeNativeEventStore(), null, 2));
}
