import fs from "fs";
import path from "path";

import { normalizeCapitalFlowObservations } from "./capitalFlowNormalizer.js";
import { createStorageAdapter } from "../db/storageAdapter.js";

const DATA_DIR = path.resolve("data");
const OBSERVATION_FILE = path.join(DATA_DIR, "capital-flow-observations.jsonl");
const DEFAULT_DEDUPE_READ_BYTES = 2_000_000;
const DEFAULT_WAREHOUSE_TIMEOUT_MS = 5_000;

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function configuredPositiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readRecentFileText(filePath, maxBytes = DEFAULT_DEDUPE_READ_BYTES) {
  const stat = fs.statSync(filePath);
  const bytesToRead = Math.min(stat.size, maxBytes);
  const start = Math.max(0, stat.size - bytesToRead);
  const buffer = Buffer.alloc(bytesToRead);
  const fd = fs.openSync(filePath, "r");
  try {
    fs.readSync(fd, buffer, 0, bytesToRead, start);
  } finally {
    fs.closeSync(fd);
  }
  const lines = buffer.toString("utf8").split("\n");
  if (start > 0) lines.shift();
  return lines.join("\n");
}

function readExistingKeys(options = {}) {
  ensureDataDir();
  if (!fs.existsSync(OBSERVATION_FILE)) return new Set();
  const maxBytes = configuredPositiveNumber(
    options.maxReadBytes || process.env.CAPITAL_FLOW_DEDUPE_READ_BYTES,
    DEFAULT_DEDUPE_READ_BYTES
  );
  return new Set(
    readRecentFileText(OBSERVATION_FILE, maxBytes)
      .split("\n")
      .filter(Boolean)
      .flatMap((line) => {
        try {
          return [JSON.parse(line).observationKey];
        } catch {
          return [];
        }
      })
      .filter(Boolean)
  );
}

export function appendCapitalFlowObservations(observations = [], options = {}) {
  ensureDataDir();
  const existing = options.existingKeys || readExistingKeys(options);
  const rows = [];

  for (const observation of Array.isArray(observations) ? observations : []) {
    if (!observation.observationKey || existing.has(observation.observationKey)) continue;
    existing.add(observation.observationKey);
    rows.push(observation);
  }

  if (rows.length) {
    fs.appendFileSync(OBSERVATION_FILE, rows.map((row) => JSON.stringify(row)).join("\n") + "\n");
  }

  return {
    file: OBSERVATION_FILE,
    attempted: Array.isArray(observations) ? observations.length : 0,
    saved: rows.length,
    observations: rows,
  };
}

async function writeWarehouseBestEffort(observations = [], options = {}) {
  if (options.writeWarehouse === false) {
    return {
      status: "SKIPPED",
      reason: "Warehouse write disabled.",
    };
  }
  if (options.signal?.aborted) {
    return {
      status: "SKIPPED",
      reason: "Observation warehouse write skipped because engine was aborted.",
    };
  }

  const timeoutMs = configuredPositiveNumber(
    options.warehouseTimeoutMs || process.env.CAPITAL_FLOW_WAREHOUSE_TIMEOUT_MS,
    DEFAULT_WAREHOUSE_TIMEOUT_MS
  );
  const adapter = createStorageAdapter(options);
  let timer = null;
  try {
    return await Promise.race([
      adapter.writeCapitalFlowObservations(observations),
      new Promise((resolve) => {
        timer = setTimeout(
          () =>
            resolve({
              status: "SKIPPED",
              reason: `Observation warehouse write exceeded ${timeoutMs}ms and was deferred.`,
            }),
          timeoutMs
        );
      }),
    ]);
  } catch (error) {
    return {
      status: "FAILED",
      reason: error.message,
    };
  } finally {
    if (timer) clearTimeout(timer);
    adapter.close?.();
  }
}

export function loadCapitalFlowObservations(options = {}) {
  ensureDataDir();
  if (!fs.existsSync(OBSERVATION_FILE)) return [];
  const limit = Math.max(1, Number(options.limit || process.env.CAPITAL_FLOW_OBSERVATION_READ_LIMIT || 10000));
  const projectId = options.canonicalProjectId || null;
  return fs
    .readFileSync(OBSERVATION_FILE, "utf8")
    .split("\n")
    .filter(Boolean)
    .slice(-limit)
    .flatMap((line) => {
      try {
        const parsed = JSON.parse(line);
        if (projectId && parsed.canonicalProjectId !== projectId) return [];
        return [parsed];
      } catch {
        return [];
      }
    });
}

export async function saveCapitalFlowObservations(projects = [], options = {}) {
  const observations = normalizeCapitalFlowObservations(projects, options);
  const local = appendCapitalFlowObservations(observations, options);
  const warehouse = await writeWarehouseBestEffort(local.observations, options);

  return {
    ...local,
    warehouse,
  };
}

export async function analyzeCapitalFlowObservationBatch(projects = [], options = {}) {
  const safeProjects = Array.isArray(projects) ? projects : [];
  const observations = normalizeCapitalFlowObservations(safeProjects, options);
  let local = {
    file: OBSERVATION_FILE,
    attempted: observations.length,
    saved: 0,
    observations: [],
  };
  let warehouse = {
    status: "SKIPPED",
    reason: "Observation persistence disabled.",
  };

  if (options.persist !== false) {
    local = appendCapitalFlowObservations(observations, options);
    warehouse = await writeWarehouseBestEffort(local.observations, options);
  }

  const storeStatus = {
    attempted: observations.length,
    saved: local.saved,
    warehouseStatus: warehouse.status,
    warehouseMode: warehouse.mode || null,
    fallbackReason: warehouse.reason || warehouse.error || null,
  };

  return safeProjects.map((project, index) => ({
    ...project,
    capitalFlowObservation: observations[index] || null,
    capitalFlowObservationStore: storeStatus,
  }));
}

export function summarizeCapitalFlowObservationStore() {
  const observations = loadCapitalFlowObservations();
  return {
    file: OBSERVATION_FILE,
    observations: observations.length,
    uniqueProjects: new Set(observations.map((observation) => observation.canonicalProjectId).filter(Boolean)).size,
    latestObservedAt: observations.at(-1)?.observedAt || null,
    missingIdentityCount: observations.filter((observation) => !observation.canonicalProjectId).length,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(JSON.stringify(summarizeCapitalFlowObservationStore(), null, 2));
}
