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
    if (!row.record_json || typeof row.record_json !== "object" || Array.isArray(row.record_json)) {
      throw new Error(`Remote forward-evidence record must be an object: ${row.ledger_name}/${row.record_id}`);
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

async function readRemotePage(query, pageSize) {
  const { data, error } = await query;
  if (error) throw new Error(`Remote forward-evidence read failed: ${error.message}`);
  if (!Array.isArray(data) || data.length > pageSize) {
    throw new Error("Remote forward-evidence read failed: invalid page");
  }
  return data;
}

function recordIdQueryBytes(id) {
  // Budget for URLSearchParams encoding, IN-list quotes and a separator.
  return new URLSearchParams({ record_id: id }).toString().length + 9;
}

async function fetchRemoteRows(client, pageSize = 250, localRows = []) {
  const size = typeof pageSize === "number" || typeof pageSize === "string" ? Number(pageSize) : NaN;
  if (!Number.isSafeInteger(size) || size <= 0) {
    throw new Error("Invalid forward-evidence page size: expected a positive safe integer");
  }
  pageSize = Math.min(size, 1000);
  const localById = validateRows(localRows);
  const index = new Map();
  const rowsById = new Map();

  // The composite primary key gives each ledger a unique, indexed cursor.
  // Scan every ID, including historical additions; timestamps are not cursors.
  for (const ledgerName of Object.keys(FORWARD_EVIDENCE_LEDGERS)) {
    let afterId = null;
    for (;;) {
      let query = client
        .from("forward_evidence_records")
        .select("ledger_name,record_id,content_hash")
        .eq("ledger_name", ledgerName)
        .order("record_id", { ascending: true });
      if (afterId !== null) query = query.gt("record_id", afterId);
      const data = await readRemotePage(query.range(0, pageSize - 1), pageSize);
      if (!data.length) break;
      for (const row of data) {
        if (row?.ledger_name !== ledgerName || typeof row.record_id !== "string" || !row.record_id ||
            typeof row.content_hash !== "string" || !/^[0-9a-f]{64}$/.test(row.content_hash)) {
          throw new Error(`Remote forward-evidence read failed: invalid index row for ${ledgerName}`);
        }
        if (recordIdQueryBytes(row.record_id) + 512 > 6000) {
          throw new Error(`Remote forward-evidence record ID exceeds request byte limit: ${ledgerName}`);
        }
        const key = `${row.ledger_name}:${row.record_id}`;
        const previous = index.get(key) || localById.get(key);
        if (previous && previous.content_hash !== row.content_hash) {
          throw new Error(`Immutable forward-evidence conflict: ${key}`);
        }
        if (index.has(key)) {
          throw new Error(`Remote forward-evidence read failed: duplicate index row ${key}`);
        }
        index.set(key, row);
        if (localById.has(key)) rowsById.set(key, localById.get(key));
      }
      afterId = data.at(-1).record_id;
    }
  }

  // Exact local hashes already prove immutable bodies. Download only absent IDs,
  // and validate every response against the index before allowing any merge.
  for (const ledgerName of Object.keys(FORWARD_EVIDENCE_LEDGERS)) {
    const missing = [...index.values()].filter((row) =>
      row.ledger_name === ledgerName && !rowsById.has(`${row.ledger_name}:${row.record_id}`)
    );
    for (let start = 0; start < missing.length;) {
      const batch = [];
      // Leave room for the endpoint and fixed query fields as well as IDs.
      let requestBytes = 512;
      while (start < missing.length && batch.length < Math.min(pageSize, 50)) {
        const bytes = recordIdQueryBytes(missing[start].record_id);
        if (requestBytes + bytes > 6000) break;
        batch.push(missing[start++]);
        requestBytes += bytes;
      }
      const requested = new Map(batch.map((row) => [`${row.ledger_name}:${row.record_id}`, row]));
      const data = await readRemotePage(client
        .from("forward_evidence_records")
        .select("ledger_name,record_id,content_hash,record_json,observed_at,created_at")
        .eq("ledger_name", ledgerName)
        .in("record_id", batch.map((row) => row.record_id))
        .order("record_id", { ascending: true })
        .range(0, batch.length - 1), batch.length);
      const fetched = validateRows(data);
      if (fetched.size !== data.length) {
        throw new Error("Remote forward-evidence read failed: duplicate body row");
      }
      for (const [key, row] of fetched) {
        const expected = requested.get(key);
        if (!expected || row.content_hash !== expected.content_hash) {
          throw new Error(`Remote forward-evidence index/body mismatch: ${key}`);
        }
        rowsById.set(key, row);
      }
      for (const key of requested.keys()) {
        if (!fetched.has(key)) {
          throw new Error(`Remote forward-evidence missing body: ${key}`);
        }
      }
    }
  }
  return [...index.keys()].map((key) => rowsById.get(key));
}

export async function restoreForwardEvidence(options = {}) {
  const backend = options.backend || createBackendSupabaseClient({ env: options.env || process.env });
  if (!backend.client) {
    return { schemaVersion: 1, state: "REMOTE_FORWARD_EVIDENCE_NOT_CONFIGURED", restored: 0, reason: backend.reason };
  }
  const rows = await fetchRemoteRows(
    backend.client,
    options.pageSize ?? process.env.SUPABASE_FORWARD_EVIDENCE_PAGE_SIZE ?? 250,
    loadLocalForwardEvidence(options)
  );
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
  const remoteRows = await fetchRemoteRows(
    backend.client,
    options.pageSize ?? process.env.SUPABASE_FORWARD_EVIDENCE_PAGE_SIZE ?? 250,
    loadLocalForwardEvidence(options)
  );
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
  fetchRemoteRows,
};
