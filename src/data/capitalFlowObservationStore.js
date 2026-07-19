import fs from "fs";
import path from "path";

import { normalizeCapitalFlowObservations } from "./capitalFlowNormalizer.js";
import { createStorageAdapter } from "../db/storageAdapter.js";

const DATA_DIR = path.resolve("data");
const OBSERVATION_FILE = path.join(DATA_DIR, "capital-flow-observations.jsonl");

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readExistingKeys() {
  ensureDataDir();
  if (!fs.existsSync(OBSERVATION_FILE)) return new Set();
  return new Set(
    fs
      .readFileSync(OBSERVATION_FILE, "utf8")
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
  const existing = options.existingKeys || readExistingKeys();
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
  const local = appendCapitalFlowObservations(observations);
  let warehouse = {
    status: "SKIPPED",
    reason: "Warehouse write disabled.",
  };

  if (options.writeWarehouse !== false) {
    const adapter = createStorageAdapter(options);
    warehouse = await adapter.writeCapitalFlowObservations(local.observations);
    adapter.close?.();
  }

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
    local = appendCapitalFlowObservations(observations);
    if (options.writeWarehouse !== false) {
      const adapter = createStorageAdapter(options);
      warehouse = await adapter.writeCapitalFlowObservations(local.observations);
      adapter.close?.();
    }
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
