import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { createBackendSupabaseClient } from "../db/supabaseClient.js";
import { writeAtomicJson } from "./atomicArtifactStore.js";

export const FORWARD_EVIDENCE_LEDGERS = Object.freeze({
  "production-market-observations": "data/production-market-observations.jsonl",
  "market-context-observations": "data/market-context-observations.jsonl",
  "prospective-edge-cohorts": "data/prospective-edge-cohorts.jsonl",
});

function canonicalize(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function hashRecord(record) {
  return crypto.createHash("sha256").update(canonicalize(record)).digest("hex");
}

function recordId(record, contentHash) {
  return String(
    record?.observationKey ||
    record?.episodeId ||
    record?.recordId ||
    record?.predictionId ||
    contentHash
  );
}

function observedAt(record) {
  const value = record?.observedAt || record?.sourceObservedAt || record?.decisionAt || record?.generatedAt || null;
  return Number.isFinite(Date.parse(value || "")) ? new Date(Date.parse(value)).toISOString() : null;
}

function parseJsonl(file, ledgerName) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8").split("\n").flatMap((line, index) => {
    if (!line.trim()) return [];
    try {
      const record = JSON.parse(line);
      if (!record || typeof record !== "object" || Array.isArray(record)) throw new Error("record must be an object");
      const contentHash = hashRecord(record);
      return [{
        ledger_name: ledgerName,
        record_id: recordId(record, contentHash),
        content_hash: contentHash,
        record_json: record,
        observed_at: observedAt(record),
      }];
    } catch (error) {
      throw new Error(`${path.basename(file)}:${index + 1}: invalid forward-evidence JSONL (${error.message})`);
    }
  });
}

export function loadLocalForwardEvidence(options = {}) {
  const root = path.resolve(options.root || ".");
  return Object.entries(options.ledgers || FORWARD_EVIDENCE_LEDGERS).flatMap(([ledgerName, relative]) =>
    parseJsonl(path.resolve(root, relative), ledgerName)
  );
}

function validateRows(rows = []) {
  const byId = new Map();
  for (const row of rows) {
    if (!Object.hasOwn(FORWARD_EVIDENCE_LEDGERS, row?.ledger_name)) {
      throw new Error(`Unknown remote forward-evidence ledger: ${row?.ledger_name}`);
    }
    const expectedHash = hashRecord(row?.record_json);
    if (expectedHash !== row?.content_hash) {
      throw new Error(`Remote forward-evidence hash mismatch: ${row?.ledger_name}/${row?.record_id}`);
    }
    const expectedId = recordId(row.record_json, expectedHash);
    if (String(row?.record_id || "") !== expectedId) {
      throw new Error(`Remote forward-evidence record ID mismatch: ${row?.ledger_name}/${row?.record_id}`);
    }
    const key = `${row.ledger_name}:${row.record_id}`;
    const previous = byId.get(key);
    if (previous && previous.content_hash !== row.content_hash) {
      throw new Error(`Immutable forward-evidence conflict: ${key}`);
    }
    byId.set(key, row);
  }
  return byId;
}

function writeJsonlAtomic(file, records) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temp, records.length ? `${records.map((record) => JSON.stringify(record)).join("\n")}\n` : "");
  fs.renameSync(temp, file);
}

export function mergeForwardEvidenceRows(remoteRows = [], options = {}) {
  const root = path.resolve(options.root || ".");
  const localRows = loadLocalForwardEvidence({ root });
  const localById = validateRows(localRows);
  const remoteById = validateRows(remoteRows);
  let restored = 0;

  for (const [key, row] of remoteById) {
    const local = localById.get(key);
    if (local && local.content_hash !== row.content_hash) {
      throw new Error(`Immutable forward-evidence conflict: ${key}`);
    }
  }

  for (const [ledgerName, relative] of Object.entries(FORWARD_EVIDENCE_LEDGERS)) {
    const local = localRows.filter((row) => row.ledger_name === ledgerName);
    const localIds = new Set(local.map((row) => row.record_id));
    const missing = remoteRows
      .filter((row) => row.ledger_name === ledgerName && !localIds.has(row.record_id))
      .sort((left, right) =>
        String(left.observed_at || "").localeCompare(String(right.observed_at || "")) ||
        left.record_id.localeCompare(right.record_id)
      );
    if (missing.length) {
      writeJsonlAtomic(path.resolve(root, relative), [...local, ...missing].map((row) => row.record_json));
      restored += missing.length;
    }
  }
  return { localRecords: localRows.length, remoteRecords: remoteRows.length, restored };
}

async function fetchRemoteRows(client, pageSize = 1000) {
  const rows = [];
  for (let start = 0; ; start += pageSize) {
    const { data, error } = await client
      .from("forward_evidence_records")
      .select("ledger_name,record_id,content_hash,record_json,observed_at,created_at")
      .order("created_at", { ascending: true })
      .range(start, start + pageSize - 1);
    if (error) throw new Error(`Remote forward-evidence read failed: ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

export async function restoreForwardEvidence(options = {}) {
  const backend = options.backend || createBackendSupabaseClient({ env: options.env || process.env });
  if (!backend.client) {
    return { schemaVersion: 1, state: "REMOTE_FORWARD_EVIDENCE_NOT_CONFIGURED", restored: 0, reason: backend.reason };
  }
  const rows = await fetchRemoteRows(backend.client, options.pageSize);
  const merged = mergeForwardEvidenceRows(rows, options);
  return { schemaVersion: 1, state: "REMOTE_FORWARD_EVIDENCE_RESTORED", ...merged };
}

export async function syncForwardEvidence(options = {}) {
  const backend = options.backend || createBackendSupabaseClient({ env: options.env || process.env });
  if (!backend.client || !backend.config?.serverWriteCapable) {
    return {
      schemaVersion: 1,
      state: "REMOTE_FORWARD_EVIDENCE_NOT_WRITE_CAPABLE",
      uploaded: 0,
      reason: backend.reason,
    };
  }
  const remoteRows = await fetchRemoteRows(backend.client, options.pageSize);
  mergeForwardEvidenceRows(remoteRows, options);
  const localRows = loadLocalForwardEvidence(options);
  const remoteById = validateRows(remoteRows);
  const pending = localRows.filter((row) => {
    const remote = remoteById.get(`${row.ledger_name}:${row.record_id}`);
    if (remote && remote.content_hash !== row.content_hash) {
      throw new Error(`Immutable forward-evidence conflict: ${row.ledger_name}:${row.record_id}`);
    }
    return !remote;
  });
  for (let start = 0; start < pending.length; start += 500) {
    const { error } = await backend.client
      .from("forward_evidence_records")
      .upsert(pending.slice(start, start + 500), {
        onConflict: "ledger_name,record_id",
        ignoreDuplicates: true,
      });
    if (error) throw new Error(`Remote forward-evidence write failed: ${error.message}`);
  }
  return {
    schemaVersion: 1,
    state: "REMOTE_FORWARD_EVIDENCE_SYNCED",
    localRecords: localRows.length,
    remoteRecordsBeforeSync: remoteRows.length,
    uploaded: pending.length,
  };
}

export async function runForwardEvidenceRemoteCommand(command = "restore", options = {}) {
  const now = options.now || new Date().toISOString();
  try {
    const result = command === "sync"
      ? await syncForwardEvidence(options)
      : await restoreForwardEvidence(options);
    const report = { ...result, generatedAt: now };
    if (options.writeReport !== false) writeAtomicJson("reports/forward-evidence-remote-sync.json", report);
    return report;
  } catch (error) {
    const report = {
      schemaVersion: 1,
      generatedAt: now,
      state: "REMOTE_FORWARD_EVIDENCE_FAILED",
      error: error?.message || String(error),
    };
    if (options.writeReport !== false) writeAtomicJson("reports/forward-evidence-remote-sync.json", report);
    return report;
  }
}

export const __forwardEvidenceRemoteHooks = {
  canonicalize,
  hashRecord,
  recordId,
  observedAt,
  parseJsonl,
  validateRows,
};
