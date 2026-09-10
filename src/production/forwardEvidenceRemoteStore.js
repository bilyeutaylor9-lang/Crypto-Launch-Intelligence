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

/**
 * Keep physical JSONL row counts separate from their immutable logical record
 * counts. A duplicate line with the same canonical identity is not a remote
 * conflict, but it must be visible instead of making a 6019-vs-6018 sync look
 * healthy by accident.
 */
export function reconcileForwardEvidenceRows(localRows = [], remoteRows = []) {
  const localById = validateRows(localRows);
  const remoteById = validateRows(remoteRows);
  const localOnly = [];
  const remoteOnly = [];

  for (const key of localById.keys()) if (!remoteById.has(key)) localOnly.push(key);
  for (const key of remoteById.keys()) if (!localById.has(key)) remoteOnly.push(key);

  const localDuplicateRecordCount = Math.max(0, localRows.length - localById.size);
  const remoteDuplicateRecordCount = Math.max(0, remoteRows.length - remoteById.size);
  const reconciliationRequired =
    localDuplicateRecordCount > 0 ||
    remoteDuplicateRecordCount > 0 ||
    localOnly.length > 0 ||
    remoteOnly.length > 0;

  return {
    state: reconciliationRequired
      ? "FORWARD_EVIDENCE_RECONCILIATION_REQUIRED"
      : "FORWARD_EVIDENCE_RECONCILED",
    reconciled: !reconciliationRequired,
    localPhysicalRecords: localRows.length,
    localUniqueRecords: localById.size,
    remotePhysicalRecords: remoteRows.length,
    remoteUniqueRecords: remoteById.size,
    localDuplicateRecordCount,
    remoteDuplicateRecordCount,
    localOnlyRecordCount: localOnly.length,
    remoteOnlyRecordCount: remoteOnly.length,
    localOnlyRecords: localOnly.slice(0, 100),
    remoteOnlyRecords: remoteOnly.slice(0, 100),
  };
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
  const reconciledLocalRows = loadLocalForwardEvidence({ root });
  return {
    localRecords: reconciledLocalRows.length,
    remoteRecords: remoteRows.length,
    restored,
    reconciliation: reconcileForwardEvidenceRows(reconciledLocalRows, remoteRows),
  };
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
  const localById = validateRows(localRows);
  const pending = [...localById.values()].filter((row) => {
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
  const remoteRowsAfterSync = await fetchRemoteRows(backend.client, options.pageSize);
  return {
    schemaVersion: 1,
    state: "REMOTE_FORWARD_EVIDENCE_SYNCED",
    localRecords: localRows.length,
    remoteRecordsBeforeSync: remoteRows.length,
    remoteRecordsAfterSync: remoteRowsAfterSync.length,
    uploaded: pending.length,
    reconciliation: reconcileForwardEvidenceRows(localRows, remoteRowsAfterSync),
  };
}

/**
 * Read back the append-only remote ledger after a sync. This deliberately
 * performs no writes: it proves that every local immutable row is present
 * remotely with the same identity and canonical content hash.
 */
export async function verifyForwardEvidence(options = {}) {
  const backend = options.backend || createBackendSupabaseClient({ env: options.env || process.env });
  if (!backend.client) {
    return {
      schemaVersion: 1,
      state: "REMOTE_FORWARD_EVIDENCE_NOT_CONFIGURED",
      verified: false,
      reason: backend.reason,
    };
  }

  const remoteRows = await fetchRemoteRows(backend.client, options.pageSize);
  const localRows = loadLocalForwardEvidence(options);
  const remoteById = validateRows(remoteRows);
  const localById = validateRows(localRows);
  const missingRemoteRecords = [];

  for (const [key, local] of localById) {
    const remote = remoteById.get(key);
    if (!remote || remote.content_hash !== local.content_hash) missingRemoteRecords.push(key);
  }

  return {
    schemaVersion: 1,
    state: missingRemoteRecords.length
      ? "REMOTE_FORWARD_EVIDENCE_VERIFICATION_FAILED"
      : "REMOTE_FORWARD_EVIDENCE_VERIFIED",
    verified: missingRemoteRecords.length === 0,
    localRecords: localRows.length,
    remoteRecords: remoteRows.length,
    missingRemoteRecords: missingRemoteRecords.slice(0, 100),
    missingRemoteRecordCount: missingRemoteRecords.length,
    reconciliation: reconcileForwardEvidenceRows(localRows, remoteRows),
    appendOnlyIntegrityPass: true,
  };
}

export async function runForwardEvidenceRemoteCommand(command = "restore", options = {}) {
  const now = options.now || new Date().toISOString();
  try {
    const result = command === "sync"
      ? await syncForwardEvidence(options)
      : command === "verify"
        ? await verifyForwardEvidence(options)
        : await restoreForwardEvidence(options);
    const report = { ...result, generatedAt: now };
    if (options.writeReport !== false) {
      writeAtomicJson(`reports/forward-evidence-${command}.json`, report);
      // Retain the historical report path for existing workflow artifacts and
      // dashboard integrations while command-specific reports provide an
      // auditable restore/sync/verify trail.
      writeAtomicJson("reports/forward-evidence-remote-sync.json", report);
      if (report.reconciliation) {
        writeAtomicJson("reports/forward-evidence-reconciliation.json", {
          ...report.reconciliation,
          generatedAt: now,
          command,
        });
      }
    }
    return report;
  } catch (error) {
    const report = {
      schemaVersion: 1,
      generatedAt: now,
      state: "REMOTE_FORWARD_EVIDENCE_FAILED",
      error: error?.message || String(error),
    };
    if (options.writeReport !== false) {
      writeAtomicJson(`reports/forward-evidence-${command}.json`, report);
      writeAtomicJson("reports/forward-evidence-remote-sync.json", report);
    }
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
