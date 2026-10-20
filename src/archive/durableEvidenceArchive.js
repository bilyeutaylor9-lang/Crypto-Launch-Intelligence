import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import Database from "better-sqlite3";
import { COORDINATOR_TABLES, createEvidenceCoordinatorState } from "./evidenceCoordinatorState.js";
import { exactMarketObservationIntegrityHash } from "../production/exactMarketObservationLedger.js";
import { strictIdentity, finite } from "../production/productionMath.js";
import { frozenOutcomeEvidenceFromReceipt } from "./frozenOutcomeCollector.js";

const digest = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const now = () => new Date().toISOString();
const HASH = /^[a-f0-9]{64}$/;
const EVIDENCE_TABLES = ["evidence_records", "obligations", "leases", "outbox", "orphan_segments"];
const OPERATIONAL_V1_TABLES = [...EVIDENCE_TABLES, ...COORDINATOR_TABLES];
const TABLES = [...OPERATIONAL_V1_TABLES, "historical_reconciliations"];

function canonical(value) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${Array.from(value, canonical).join(",")}]`;
  if (value && typeof value === "object" && [Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  throw new TypeError("Archive metadata must contain only finite JSON values");
}

function identifier(value, label) {
  if (typeof value !== "string" || !value || value.trim() !== value || value.length > 4096 || /[\x00-\x1f]/.test(value)) throw new TypeError(`${label} must be a nonempty exact identifier`);
  return value;
}

function timestamp(value, label) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) throw new TypeError(`${label} must be an ISO timestamp with an explicit timezone`);
  return new Date(value).toISOString();
}

function syncDirectory(directory) {
  const fd = fs.openSync(directory, "r");
  try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}

function readRegular(file) {
  if (!fs.lstatSync(file).isFile()) throw new Error(`ARCHIVE_NOT_REGULAR_FILE:${file}`);
  return fs.readFileSync(file);
}

// Hard-link publication cannot overwrite an existing file like POSIX rename can.
function persistImmutable(file, bytes) {
  if (fs.existsSync(file)) {
    if (!readRegular(file).equals(bytes)) throw new Error(`IMMUTABLE_FILE_CONFLICT:${path.basename(file)}`);
    return;
  }
  const temporary = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
  const fd = fs.openSync(temporary, "wx", 0o600);
  try { fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  try { fs.linkSync(temporary, file); } catch (error) {
    if (error.code !== "EEXIST") throw error;
    if (!readRegular(file).equals(bytes)) throw new Error(`IMMUTABLE_FILE_CONFLICT:${path.basename(file)}`);
  }
  fs.unlinkSync(temporary);
  syncDirectory(path.dirname(file));
}

function rawBuffer(value) {
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) return Buffer.from(value);
  throw new TypeError("rawBytes must be Buffer or Uint8Array");
}

function obligationsFor(recordId, value, contract) {
  if (!Array.isArray(value)) throw new TypeError("frozenObligations must be supplied by the frozen contract");
  const seen = new Set();
  const tasks = value.map((input) => {
    const item = JSON.parse(canonical(input));
    identifier(item.obligationId, "obligationId");
    if (seen.has(item.obligationId)) throw new Error(`DUPLICATE_OBLIGATION:${item.obligationId}`);
    seen.add(item.obligationId);
    item.dueAt = timestamp(item.dueAt, "dueAt");
    item.expiresAt = timestamp(item.expiresAt, "expiresAt");
    if (item.expiresAt < item.dueAt) throw new TypeError("expiresAt cannot precede dueAt");
    if (item.horizonHours !== undefined && !(Number.isFinite(item.horizonHours) && item.horizonHours > 0)) throw new TypeError("horizonHours must be positive");
    if (item.observationClockPolicy !== undefined && !["INDEPENDENT_MARKET_CLOCK_V1", "COLLECTION_RECEIPT_V1"].includes(item.observationClockPolicy)) throw new TypeError("Unsupported observation clock policy");
    item.taskId = item.taskId ? identifier(item.taskId, "taskId") : digest(`${recordId}\u0000${item.obligationId}`);
    return item;
  }).sort((a, b) => a.obligationId < b.obligationId ? -1 : a.obligationId > b.obligationId ? 1 : 0);
  if (Array.isArray(contract?.outcomeHorizonsHours)) {
    const declared = [...contract.outcomeHorizonsHours].sort((a, b) => a - b);
    const queued = tasks.map((task) => task.horizonHours).sort((a, b) => a - b);
    if (canonical(declared) !== canonical(queued)) throw new Error("IMMUTABLE_HORIZON_CONFLICT");
  }
  return tasks;
}

function validateManifest(manifest) {
  const { admissionHash, ...body } = manifest;
  if (body.format !== "durable-evidence-manifest/v2" || !HASH.test(body.contentHash) || !HASH.test(body.compressedHash) || admissionHash !== digest(canonical(body))) throw new Error("ARCHIVE_MANIFEST_CORRUPT");
  identifier(body.recordId, "recordId");
  if (!Number.isSafeInteger(body.rawSize) || body.rawSize < 0) throw new Error("ARCHIVE_MANIFEST_CORRUPT");
  if (canonical(body.frozenObligations) !== canonical(obligationsFor(body.recordId, body.frozenObligations, body.immutableContract))) throw new Error("ARCHIVE_MANIFEST_CORRUPT");
  return manifest;
}

export function openDurableEvidenceArchive(options = {}) {
  const root = path.resolve(options.root || "durable-evidence-archive");
  const segmentDir = path.join(root, "segments");
  const manifestDir = path.join(root, "manifests");
  const dbPath = path.join(root, "archive.sqlite");
  fs.mkdirSync(segmentDir, { recursive: true, mode: 0o700 }); fs.mkdirSync(manifestDir, { recursive: true, mode: 0o700 });
  const newIndex = !fs.existsSync(dbPath);
  const db = new Database(dbPath);
  if (newIndex) fs.chmodSync(dbPath, 0o600);
  const existing = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='evidence_records'").get();
  if (existing && !db.pragma("table_info(evidence_records)").some((column) => column.name === "manifest_hash")) {
    db.close(); throw new Error("ARCHIVE_SCHEMA_UNSUPPORTED_PRESERVE_ORIGINAL");
  }
  db.pragma("journal_mode = WAL"); db.pragma("synchronous = FULL"); db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS evidence_records (
      record_id TEXT PRIMARY KEY, content_hash TEXT NOT NULL, segment_name TEXT NOT NULL,
      compressed_hash TEXT NOT NULL, raw_size INTEGER NOT NULL, manifest_name TEXT NOT NULL UNIQUE,
      manifest_hash TEXT NOT NULL, admission_hash TEXT NOT NULL, cohort_json TEXT NOT NULL,
      missingness_json TEXT NOT NULL, immutable_json TEXT NOT NULL, admitted_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS obligations (
      obligation_id TEXT NOT NULL, record_id TEXT NOT NULL REFERENCES evidence_records(record_id),
      frozen_json TEXT NOT NULL, due_at TEXT NOT NULL, expires_at TEXT NOT NULL,
      state TEXT NOT NULL DEFAULT 'pending', task_id TEXT PRIMARY KEY, created_at TEXT NOT NULL, completed_at TEXT,
      evidence_record_id TEXT REFERENCES evidence_records(record_id),
      UNIQUE(record_id, obligation_id)
    );
    CREATE TABLE IF NOT EXISTS leases (
      task_id TEXT PRIMARY KEY REFERENCES obligations(task_id), owner TEXT NOT NULL,
      lease_until TEXT NOT NULL, token TEXT NOT NULL UNIQUE
    );
    CREATE TABLE IF NOT EXISTS outbox (
      outbox_id TEXT PRIMARY KEY, record_id TEXT NOT NULL REFERENCES evidence_records(record_id),
      content_hash TEXT NOT NULL, manifest_hash TEXT NOT NULL, kind TEXT NOT NULL,
      payload_json TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'pending', receipt_json TEXT, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS orphan_segments (
      content_hash TEXT PRIMARY KEY, segment_name TEXT NOT NULL, reason TEXT NOT NULL, noted_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_obligations_due ON obligations(state, due_at);
    CREATE TABLE IF NOT EXISTS historical_reconciliations (
      task_id TEXT PRIMARY KEY REFERENCES obligations(task_id),
      evidence_record_id TEXT NOT NULL REFERENCES evidence_records(record_id),
      observed_at TEXT NOT NULL, reconciled_at TEXT NOT NULL,
      observation_hash TEXT NOT NULL, source_kind TEXT NOT NULL
    );
    PRAGMA user_version = 2;
  `);
  const coordinator = createEvidenceCoordinatorState(db, { clock: options.clock, writerToken: options.writerToken });
  const archiveNow = () => timestamp(options.clock ? options.clock() : now(), "archive clock");
  syncDirectory(root);
  let closed = false;
  const findRecord = db.prepare("SELECT * FROM evidence_records WHERE record_id=?");
  const insertRecord = db.prepare("INSERT INTO evidence_records VALUES (@record_id,@content_hash,@segment_name,@compressed_hash,@raw_size,@manifest_name,@manifest_hash,@admission_hash,@cohort_json,@missingness_json,@immutable_json,@admitted_at)");
  const insertTask = db.prepare("INSERT INTO obligations VALUES (@obligation_id,@record_id,@frozen_json,@due_at,@expires_at,@state,@task_id,@created_at,@completed_at,@evidence_record_id)");
  const insertOutbox = db.prepare("INSERT INTO outbox VALUES (@outbox_id,@record_id,@content_hash,@manifest_hash,@kind,@payload_json,@state,@receipt_json,@created_at)");
  const markOrphan = db.prepare("INSERT OR IGNORE INTO orphan_segments VALUES (@content_hash,@segment_name,@reason,@noted_at)");

  function assertRow(row) {
    if (!HASH.test(row.content_hash) || row.segment_name !== `${row.content_hash}.gz` || row.manifest_name !== `${digest(row.record_id)}.json`) throw new Error("ARCHIVE_INDEX_CORRUPT");
    const file = path.join(segmentDir, row.segment_name);
    if (!fs.existsSync(file)) throw new Error(`ARCHIVE_SEGMENT_MISSING:${row.segment_name}`);
    const compressed = readRegular(file);
    if (digest(compressed) !== row.compressed_hash) throw new Error(`ARCHIVE_SEGMENT_CORRUPT:${row.segment_name}`);
    let raw;
    try { raw = zlib.gunzipSync(compressed); } catch { throw new Error(`ARCHIVE_SEGMENT_CORRUPT:${row.segment_name}`); }
    if (digest(raw) !== row.content_hash || raw.length !== row.raw_size) throw new Error(`ARCHIVE_SEGMENT_CORRUPT:${row.segment_name}`);
    const manifestFile = path.join(manifestDir, row.manifest_name);
    if (!fs.existsSync(manifestFile)) throw new Error(`ARCHIVE_MANIFEST_MISSING:${row.manifest_name}`);
    const bytes = readRegular(manifestFile);
    if (digest(bytes) !== row.manifest_hash) throw new Error(`ARCHIVE_MANIFEST_CORRUPT:${row.manifest_name}`);
    const manifest = validateManifest(JSON.parse(bytes));
    const tasks = db.prepare("SELECT * FROM obligations WHERE record_id=? ORDER BY obligation_id").all(row.record_id);
    const frozen = tasks.map((item) => {
      const value = JSON.parse(item.frozen_json);
      if (item.obligation_id !== value.obligationId || item.task_id !== value.taskId || item.due_at !== value.dueAt || item.expires_at !== value.expiresAt) throw new Error("ARCHIVE_TASK_CONTRACT_CORRUPT");
      return value;
    });
    if (manifest.recordId !== row.record_id || manifest.contentHash !== row.content_hash || manifest.compressedHash !== row.compressed_hash || manifest.admissionHash !== row.admission_hash ||
      canonical(manifest.cohortMetadata) !== row.cohort_json || canonical(manifest.missingness) !== row.missingness_json || canonical(manifest.immutableContract) !== row.immutable_json || canonical(manifest.frozenObligations) !== canonical(frozen)) throw new Error(`ARCHIVE_MANIFEST_CORRUPT:${row.manifest_name}`);
    return { raw, manifest };
  }

  function admitPrediction(input = {}) {
    coordinator.assertWrite();
    const recordId = identifier(input.recordId, "recordId");
    const bytes = rawBuffer(input.rawBytes);
    const contract = input.immutableContract ?? null;
    const obligations = obligationsFor(recordId, input.frozenObligations, contract);
    const contentHash = digest(bytes);
    const segment = path.join(segmentDir, `${contentHash}.gz`);
    let compressed = zlib.gzipSync(bytes, { mtime: 0 });
    if (fs.existsSync(segment)) {
      compressed = readRegular(segment);
      let original;
      try { original = zlib.gunzipSync(compressed); } catch { throw new Error("ARCHIVE_SEGMENT_CORRUPT"); }
      if (!original.equals(bytes)) throw new Error("ARCHIVE_SEGMENT_CORRUPT");
    }
    const body = { format: "durable-evidence-manifest/v2", recordId, contentHash: digest(bytes), compressedHash: digest(compressed), rawSize: bytes.length,
      cohortMetadata: input.cohortMetadata ?? null, missingness: input.missingness ?? null, immutableContract: contract, frozenObligations: obligations };
    const manifest = { ...body, admissionHash: digest(canonical(body)) };
    const manifestBytes = Buffer.from(canonical(manifest));
    const row = { record_id: recordId, content_hash: body.contentHash, segment_name: `${body.contentHash}.gz`, compressed_hash: body.compressedHash,
      raw_size: bytes.length, manifest_name: `${digest(recordId)}.json`, manifest_hash: digest(manifestBytes), admission_hash: manifest.admissionHash,
      cohort_json: canonical(body.cohortMetadata), missingness_json: canonical(body.missingness), immutable_json: canonical(contract), admitted_at: archiveNow() };
    const old = findRecord.get(recordId);
    if (old) {
      assertRow(old);
      if (old.admission_hash !== row.admission_hash) throw new Error(`IMMUTABLE_ID_CONFLICT:${recordId}`);
      return { status: "duplicate", recordId, contentHash: row.content_hash, manifestName: row.manifest_name, admissionHash: row.admission_hash, taskIds: obligations.map((item) => item.taskId) };
    }
    persistImmutable(path.join(segmentDir, row.segment_name), compressed);
    if (options.fault === "after-segment") throw new Error("FAULT_AFTER_SEGMENT");
    persistImmutable(path.join(manifestDir, row.manifest_name), manifestBytes);
    if (options.fault === "after-manifest") throw new Error("FAULT_AFTER_MANIFEST");
    try {
      db.transaction(() => {
        coordinator.assertWrite();
        const concurrent = findRecord.get(recordId);
        if (concurrent) {
          assertRow(concurrent);
          if (concurrent.admission_hash !== row.admission_hash) throw new Error(`IMMUTABLE_ID_CONFLICT:${recordId}`);
          return;
        }
        insertRecord.run(row);
        for (const item of obligations) insertTask.run({ obligation_id: item.obligationId, record_id: recordId, frozen_json: canonical(item), due_at: item.dueAt, expires_at: item.expiresAt, state: "pending", task_id: item.taskId, created_at: row.admitted_at, completed_at: null, evidence_record_id: null });
        insertOutbox.run({ outbox_id: digest(`admit\u0000${recordId}\u0000${row.admission_hash}`), record_id: recordId, content_hash: row.content_hash, manifest_hash: row.manifest_hash,
          kind: "admission", payload_json: canonical({ recordId, contentHash: row.content_hash, manifestHash: row.manifest_hash, admissionHash: row.admission_hash }), state: "pending", receipt_json: null, created_at: row.admitted_at });
        if (options.fault === "inside-transaction") throw new Error("FAULT_INSIDE_TRANSACTION");
      }).immediate();
    } catch (error) {
      // Physical orphan detection still works if ownership expired during publication.
      try {
        db.transaction(() => {
          coordinator.assertWrite();
          markOrphan.run({ content_hash: row.content_hash, segment_name: row.segment_name, reason: `unindexed:${error.message}`, noted_at: archiveNow() });
        }).immediate();
      } catch {}
      throw error;
    }
    return { status: "admitted", recordId, contentHash: row.content_hash, manifestName: row.manifest_name, admissionHash: row.admission_hash, taskIds: obligations.map((item) => item.taskId) };
  }

  function readEvidence(recordId) {
    const row = findRecord.get(recordId); if (!row) return null;
    return { recordId, contentHash: row.content_hash, admissionHash: row.admission_hash, rawBytes: assertRow(row).raw,
      admittedAt: row.admitted_at, cohortMetadata: JSON.parse(row.cohort_json), missingness: JSON.parse(row.missingness_json), immutableContract: JSON.parse(row.immutable_json) };
  }

  function expireTasks(at) {
    db.prepare("UPDATE obligations SET state='expired',completed_at=NULL WHERE state IN ('pending','leased','retryable','budget-deferred') AND expires_at < ? AND (state!='leased' OR task_id NOT IN (SELECT task_id FROM leases WHERE lease_until>?))").run(at, at);
    db.prepare("DELETE FROM leases WHERE task_id IN (SELECT task_id FROM obligations WHERE state='expired')").run();
    db.prepare("UPDATE obligations SET state='pending' WHERE state='leased' AND task_id IN (SELECT task_id FROM leases WHERE lease_until <= ?)").run(at);
    db.prepare("DELETE FROM leases WHERE lease_until <= ?").run(at);
  }

  function leaseDue({ owner, nowAt = archiveNow(), limit = 1, leaseMs = 60000, excludeTaskIds = [] } = {}) {
    identifier(owner, "owner"); const at = timestamp(nowAt, "nowAt");
    if (!Number.isSafeInteger(limit) || limit < 0 || !Number.isSafeInteger(leaseMs) || leaseMs <= 0) throw new TypeError("Invalid lease limit or duration");
    if (!Array.isArray(excludeTaskIds) || excludeTaskIds.length > 1000) throw new TypeError("Invalid task exclusion list");
    excludeTaskIds.forEach(taskId => identifier(taskId, "excluded taskId"));
    const until = new Date(Date.parse(at) + leaseMs).toISOString();
    return db.transaction(() => {
      coordinator.assertWrite(at);
      expireTasks(at);
      const excluded = excludeTaskIds.length ? ` AND o.task_id NOT IN (${excludeTaskIds.map(() => '?').join(',')})` : '';
      const candidates = db.prepare("SELECT o.* FROM obligations o LEFT JOIN task_schedule s USING(task_id) WHERE o.state IN ('pending','retryable','budget-deferred') AND o.due_at <= ? AND (s.next_attempt_at IS NULL OR s.next_attempt_at<=?) AND NOT EXISTS (SELECT 1 FROM historical_reconciliations h WHERE h.task_id=o.task_id)" + excluded + " ORDER BY o.expires_at,COALESCE(s.attempt_count,0),o.due_at,o.task_id LIMIT ?").all(at, at, ...excludeTaskIds, limit);
      return candidates.map((task) => {
        const token = crypto.randomUUID();
        db.prepare("UPDATE obligations SET state='leased' WHERE task_id=?").run(task.task_id);
        db.prepare("INSERT INTO leases VALUES (?,?,?,?)").run(task.task_id, owner, until, token);
        coordinator.noteTaskLease(task.task_id, at);
        return { taskId: task.task_id, recordId: task.record_id, obligationId: task.obligation_id, frozen: JSON.parse(task.frozen_json), leaseUntil: until, leaseToken: token };
      });
    }).immediate();
  }

  function renewTaskLease({ owner, leaseToken, nowAt = archiveNow(), leaseMs = 60000 } = {}) {
    const at = timestamp(nowAt, "nowAt");
    if (!Number.isSafeInteger(leaseMs) || leaseMs <= 0) throw new TypeError("Invalid lease duration");
    return db.transaction(() => {
      coordinator.assertWrite(at);
      expireTasks(at);
      return db.prepare("UPDATE leases SET lease_until=? WHERE token=? AND owner=? AND lease_until>? AND task_id IN (SELECT task_id FROM obligations WHERE expires_at>=?)").run(new Date(Date.parse(at) + leaseMs).toISOString(), leaseToken, owner, at, at).changes === 1;
    }).immediate();
  }

  function validObservation(task, evidenceRecordId, completedAt) {
    if (!evidenceRecordId) return false;
    try { if (timestamp(completedAt, "completedAt") !== completedAt) return false; } catch { return false; }
    const observation = findRecord.get(evidenceRecordId);
    if (!observation) return false;
    const manifest = assertRow(observation).manifest;
    const link = manifest.immutableContract?.observationOf;
    if (link?.recordId !== task.record_id || link?.taskId !== task.task_id) return false;
    const frozen = JSON.parse(task.frozen_json);
    const receiptPolicy = frozen.observationClockPolicy === "COLLECTION_RECEIPT_V1";
    if (receiptPolicy && link.observationClockPolicy !== frozen.observationClockPolicy) return false;
    let requestedAt, receivedAt, marketAt;
    try {
      requestedAt = timestamp(link.requestedAt, "requestedAt"); receivedAt = timestamp(link.receivedAt, "receivedAt");
      marketAt = receiptPolicy && link.marketObservedAt === null ? null : timestamp(link.marketObservedAt, "marketObservedAt");
    } catch { return false; }
    if (requestedAt > receivedAt || receivedAt > completedAt || receivedAt < task.due_at || receivedAt > task.expires_at ||
      (marketAt !== null && (marketAt > receivedAt || marketAt < task.due_at || marketAt > task.expires_at))) return false;
    const parent = JSON.parse(findRecord.get(task.record_id).immutable_json);
    for (const key of ["chain", "tokenAddress", "poolAddress"]) if (parent?.[key] !== undefined && !(key === "poolAddress" && parent[key] === null) && parent[key] !== manifest.immutableContract?.[key]) return false;
    if (frozen.horizonHours !== undefined && frozen.horizonHours !== link.horizonHours) return false;
    const contract = manifest.immutableContract;
    if (parent?.kind === "FROZEN_EPISODE_OUTCOME_OBLIGATIONS_V1" && contract?.kind !== "CAPTURED_EXACT_OUTCOME_V1") return false;
    if (contract?.kind === "CAPTURED_EXACT_OUTCOME_V1") {
      const diagnostic = readEvidence(contract.originalDiagnosticRecordId), header = diagnostic?.immutableContract;
      if (!diagnostic || header?.kind !== "HTTP_PROVIDER_RESPONSE_V1_DIAGNOSTIC" || diagnostic.contentHash !== observation.content_hash ||
        header.taskId !== task.task_id || header.receivedAt > diagnostic.admittedAt || header.receivedAt > completedAt) return false;
      const rebuilt = frozenOutcomeEvidenceFromReceipt({ task: { taskId: task.task_id, recordId: task.record_id, frozen },
        prediction: readEvidence(task.record_id), requestId: header.requestId, diagnosticRecordId: diagnostic.recordId,
        receipt: { ...header, rawBytes: diagnostic.rawBytes } });
      if (!rebuilt || canonical(rebuilt.immutableContract) !== canonical(contract)) return false;
    }
    return true;
  }

  function transitionTask({ obligationId, owner, leaseToken, state, evidenceRecordId = null, retryAt, nowAt = archiveNow() } = {}) {
    if (!["completed", "retryable", "budget-deferred", "expired"].includes(state)) throw new TypeError("Invalid task transition");
    const at = timestamp(nowAt, "nowAt");
    return db.transaction(() => {
      coordinator.assertWrite(at);
      expireTasks(at);
      if (typeof leaseToken !== "string") return false;
      const lease = db.prepare("SELECT leases.*, obligations.obligation_id FROM leases JOIN obligations USING(task_id) WHERE token=?").get(leaseToken);
      if (!lease || lease.obligation_id !== obligationId || lease.owner !== owner || lease.lease_until <= at) return false;
      if (state === "expired") return false;
      const task = db.prepare("SELECT * FROM obligations WHERE task_id=?").get(lease.task_id);
      assertRow(findRecord.get(task.record_id));
      if (state === "completed" && !validObservation(task, evidenceRecordId, at)) return false;
      const nextState = state !== "completed" && task.expires_at < at ? "expired" : state;
      const changed = db.prepare("UPDATE obligations SET state=?,completed_at=?,evidence_record_id=? WHERE task_id=? AND state='leased'").run(nextState, nextState === "completed" ? at : null, nextState === "completed" ? evidenceRecordId : null, lease.task_id).changes;
      if (changed) {
        if (["retryable", "budget-deferred"].includes(nextState)) coordinator.scheduleTask(lease.task_id, retryAt ?? at, at);
        db.prepare("DELETE FROM leases WHERE task_id=? AND token=?").run(lease.task_id, leaseToken);
      }
      return changed === 1;
    }).immediate();
  }

  function completeWithEvidence({ obligationId, owner, leaseToken, evidence, nowAt = archiveNow() } = {}) {
    const at = timestamp(nowAt, "nowAt");
    return db.transaction(() => {
      coordinator.assertWrite(at);
      expireTasks(at);
      const lease = db.prepare("SELECT * FROM leases WHERE token=? AND owner=? AND lease_until>?").get(leaseToken, owner, at);
      if (!lease) return false;
      const task = db.prepare("SELECT * FROM obligations WHERE task_id=?").get(lease.task_id);
      if (task.obligation_id !== obligationId || !evidence?.recordId) return false;
      const admitted = admitPrediction(evidence);
      if (!transitionTask({ obligationId, owner, leaseToken, state: "completed", evidenceRecordId: admitted.recordId, nowAt: at })) throw new Error("OBSERVATION_CONTRACT_MISMATCH");
      return true;
    }).immediate();
  }

  function dueDenominators(nowAt = archiveNow()) {
    const at = timestamp(nowAt, "nowAt");
    return db.prepare("SELECT CASE WHEN task_id IN (SELECT task_id FROM historical_reconciliations WHERE reconciled_at<=?) THEN 'reconciled' WHEN state='completed' AND completed_at<=? THEN 'completed' WHEN expires_at<? THEN 'expired' WHEN state IN ('completed','expired') THEN 'pending' WHEN state='leased' AND task_id IN (SELECT task_id FROM leases WHERE lease_until<=?) THEN 'pending' ELSE state END AS state,COUNT(*) AS count FROM obligations WHERE due_at<=? GROUP BY 1 ORDER BY 1").all(at, at, at, at, at);
  }

  function historicalObservation(task, evidenceRecordId, reconciledAt) {
    const record = findRecord.get(evidenceRecordId);
    if (!record) throw new Error("HISTORICAL_OBSERVATION_MISSING");
    const { raw, manifest } = assertRow(record);
    const contract = manifest.immutableContract;
    const captured = contract?.kind === "CAPTURED_EXACT_OUTCOME_V1";
    const row = captured ? contract.exactObservation : JSON.parse(raw.toString("utf8"));
    if (captured) {
      const anchor = db.prepare("SELECT * FROM obligations WHERE task_id=?").get(contract.observationOf?.taskId);
      if (!anchor || !validObservation(anchor, evidenceRecordId, reconciledAt)) throw new Error("HISTORICAL_CAPTURE_RAW_RECEIPT_INVALID");
      if (task.task_id === anchor.task_id) return { observedAt: row.observedAt, observationHash: row.observationIntegrityHash, sourceKind: "CAPTURED_EXACT_OUTCOME_V1" };
      const parent = JSON.parse(findRecord.get(task.record_id).immutable_json), identity = strictIdentity(row);
      const frozen = JSON.parse(task.frozen_json), receipt = timestamp(contract.observationOf.receivedAt, "shared receipt"), market = contract.observationOf.marketObservedAt == null ? null : timestamp(contract.observationOf.marketObservedAt, "shared market");
      if (parent?.kind !== "FROZEN_EPISODE_OUTCOME_OBLIGATIONS_V1" || !identity?.poolAddress || !parent.poolAddress ||
        identity.chain !== parent.chain || identity.tokenAddress !== parent.tokenAddress || identity.poolAddress !== parent.poolAddress ||
        receipt < task.due_at || receipt > task.expires_at || (market === null && frozen.observationClockPolicy !== "COLLECTION_RECEIPT_V1") ||
        (market !== null && (market < task.due_at || market > task.expires_at || market > receipt))) throw new Error("HISTORICAL_SHARED_CAPTURE_INVALID");
      return { observedAt: row.observedAt, observationHash: row.observationIntegrityHash, sourceKind: "SHARED_CAPTURED_EXACT_OBSERVATION_V1" };
    }
    if (contract?.kind !== "EXACT_MARKET_OBSERVATION_V2_RECORD" || !row || Array.isArray(row) || row.schemaVersion !== 2 ||
      !row.observationIntegrityHash || row.observationIntegrityHash !== exactMarketObservationIntegrityHash(row) ||
      contract.observationIntegrityHash !== row.observationIntegrityHash || row.exactIdentityVerified !== true || !row.observationKey) throw new Error("HISTORICAL_OBSERVATION_INTEGRITY_FAILED");
    const identity = strictIdentity(row), parent = JSON.parse(findRecord.get(task.record_id).immutable_json);
    if (!identity || identity.identityKey !== row.identityKey || identity.routeKey !== row.routeKey || finite(row.priceUsd) === null || finite(row.priceUsd) <= 0) throw new Error("HISTORICAL_OBSERVATION_IDENTITY_FAILED");
    for (const key of ["chain", "tokenAddress", "poolAddress"]) if (parent?.[key] !== undefined && !(key === "poolAddress" && parent[key] === null) && parent[key] !== identity[key]) throw new Error("HISTORICAL_OBSERVATION_IDENTITY_FAILED");
    const observedAt = timestamp(row.observedAt, "historical observedAt");
    const firstSeenAt = timestamp(contract.firstSeenAt, "historical firstSeenAt");
    if (observedAt < task.due_at || observedAt > task.expires_at || observedAt > reconciledAt || observedAt > firstSeenAt) throw new Error("HISTORICAL_OBSERVATION_OUTSIDE_WINDOW");
    const receipt = row.outcomeObservationProvenance?.receiptObservedAt ?? row.receiptObservedAt;
    const source = row.outcomeObservationProvenance?.sourceTimestamp ?? row.sourceObservedAt;
    const receiptAt = receipt === null || receipt === undefined ? null : timestamp(receipt, "historical receipt");
    const sourceAt = source === null || source === undefined ? null : timestamp(source, "historical source");
    if ((receiptAt && (receiptAt > reconciledAt || receiptAt > firstSeenAt || observedAt > receiptAt || receiptAt < task.due_at || receiptAt > task.expires_at)) ||
      (sourceAt && (sourceAt > observedAt || sourceAt < task.due_at || sourceAt > task.expires_at || (receiptAt && sourceAt > receiptAt)))) throw new Error("HISTORICAL_OBSERVATION_CLOCK_CONTRADICTION");
    return { observedAt, observationHash: row.observationIntegrityHash, sourceKind: "EXACT_MARKET_OBSERVATION_V2" };
  }

  function reconcileHistoricalObservation({ taskId, evidenceRecordId, nowAt = archiveNow() } = {}) {
    const at = timestamp(nowAt, "nowAt");
    return db.transaction(() => {
      coordinator.assertWrite(at);
      expireTasks(at);
      const task = db.prepare("SELECT * FROM obligations WHERE task_id=?").get(taskId);
      if (!task) throw new Error("HISTORICAL_TASK_MISSING");
      if (task.state === "completed") return { status: "already-completed" };
      if (task.state === "leased") throw new Error("HISTORICAL_TASK_CURRENTLY_LEASED");
      const observed = historicalObservation(task, evidenceRecordId, at);
      const existing = db.prepare("SELECT * FROM historical_reconciliations WHERE task_id=?").get(taskId);
      if (existing) return { status: existing.evidence_record_id === evidenceRecordId ? "duplicate" : "already-reconciled", observedAt: existing.observed_at, reconciledAt: existing.reconciled_at };
      db.prepare("INSERT INTO historical_reconciliations VALUES (?,?,?,?,?,?)").run(taskId, evidenceRecordId, observed.observedAt, at, observed.observationHash, observed.sourceKind);
      return { status: "reconciled", observedAt: observed.observedAt, reconciledAt: at };
    }).immediate();
  }

  function reconcileCompatibleFrozenObligations({ evidenceRecordId, nowAt = archiveNow() } = {}) {
    const at = timestamp(nowAt, "nowAt");
    return db.transaction(() => {
      coordinator.assertWrite(at); expireTasks(at);
      const record = findRecord.get(evidenceRecordId), contract = record && assertRow(record).manifest.immutableContract;
      const link = contract?.observationOf, exact = contract?.exactObservation;
      if (contract?.kind !== "CAPTURED_EXACT_OUTCOME_V1" || !link || !exact) throw new Error("SHARED_CAPTURE_NOT_ANCHORED_EXACT_OBSERVATION");
      const anchor = db.prepare("SELECT * FROM obligations WHERE task_id=?").get(link.taskId);
      if (!anchor || !validObservation(anchor, evidenceRecordId, at)) return { evidenceRecordId, examined: 0, reconciled: 0, anchorValid: false };
      const identity = strictIdentity(exact); if (!identity || !identity.poolAddress) throw new Error("SHARED_CAPTURE_EXACT_POOL_REQUIRED");
      let reconciled = 0, examined = 0;
      for (const task of db.prepare("SELECT * FROM obligations WHERE due_at<=? AND state!='completed' AND state!='leased' AND task_id!=?").all(at, anchor.task_id)) {
        const parent = JSON.parse(findRecord.get(task.record_id).immutable_json), expected = strictIdentity(parent);
        if (parent?.kind !== "FROZEN_EPISODE_OUTCOME_OBLIGATIONS_V1" || !expected || expected.chain !== identity.chain || expected.tokenAddress !== identity.tokenAddress || !expected.poolAddress || expected.poolAddress !== identity.poolAddress) continue;
        examined++;
        const frozen = JSON.parse(task.frozen_json), receipt = timestamp(link.receivedAt, "shared receipt"), market = link.marketObservedAt == null ? null : timestamp(link.marketObservedAt, "shared market");
        if (receipt < task.due_at || receipt > task.expires_at || (market === null && frozen.observationClockPolicy !== "COLLECTION_RECEIPT_V1") || (market !== null && (market < task.due_at || market > task.expires_at || market > receipt))) continue;
        if (db.prepare("SELECT 1 FROM historical_reconciliations WHERE task_id=?").get(task.task_id)) continue;
        db.prepare("INSERT INTO historical_reconciliations VALUES (?,?,?,?,?,?)").run(task.task_id, evidenceRecordId, exact.observedAt, at, exact.observationIntegrityHash, "SHARED_CAPTURED_EXACT_OBSERVATION_V1"); reconciled++;
      }
      return { evidenceRecordId, examined, reconciled };
    }).immediate();
  }

  function listTasks({ recordId } = {}) {
    // Importers need to distinguish an unfinished obligation from one which
    // has already been historically reconciled without opening a write
    // transaction for every old source row.
    const query = `SELECT o.*,h.task_id AS historical_task_id,h.evidence_record_id AS historical_evidence_record_id,
      h.observed_at AS historical_observed_at,h.reconciled_at AS historical_reconciled_at,
      h.observation_hash AS historical_observation_hash,h.source_kind AS historical_source_kind
      FROM obligations o LEFT JOIN historical_reconciliations h ON h.task_id=o.task_id`;
    const rows = recordId === undefined
      ? db.prepare(query + " ORDER BY o.due_at,o.task_id").all()
      : db.prepare(query + " WHERE o.record_id=? ORDER BY o.due_at,o.task_id").all(recordId);
    return rows.map(row => {
      const historicalReconciliation = row.historical_task_id === null ? null : {
        evidenceRecordId: row.historical_evidence_record_id, observedAt: row.historical_observed_at,
        reconciledAt: row.historical_reconciled_at, observationHash: row.historical_observation_hash,
        sourceKind: row.historical_source_kind,
      };
      return { ...row, historicallyReconciled: historicalReconciliation !== null, historicalReconciliation, frozen: JSON.parse(row.frozen_json) };
    });
  }

  function listOutcomeCaptures() {
    return db.prepare("SELECT record_id FROM evidence_records WHERE json_extract(immutable_json,'$.kind')='CAPTURED_EXACT_OUTCOME_V1' ORDER BY admitted_at,record_id").all().map(row => readEvidence(row.record_id));
  }

  function listRecoverableProviderResponses() {
    return db.prepare("SELECT r.record_id FROM evidence_records r JOIN obligations o ON o.task_id=json_extract(r.immutable_json,'$.taskId') WHERE json_extract(r.immutable_json,'$.kind')='HTTP_PROVIDER_RESPONSE_V1_DIAGNOSTIC' AND json_extract(r.immutable_json,'$.status')>=200 AND json_extract(r.immutable_json,'$.status')<300 AND o.state!='completed' AND NOT EXISTS (SELECT 1 FROM historical_reconciliations h WHERE h.task_id=o.task_id) ORDER BY json_extract(r.immutable_json,'$.receivedAt'),r.record_id").all().map(row => readEvidence(row.record_id));
  }

  function listOutbox() { return db.prepare("SELECT * FROM outbox ORDER BY created_at,outbox_id").all(); }

  function acknowledgeOutbox({ outboxId, recordId, contentHash, manifestHash, readBack, receipt } = {}) {
    return db.transaction(() => {
      coordinator.assertWrite();
      const row = db.prepare("SELECT * FROM outbox WHERE outbox_id=?").get(outboxId);
      if (!row || row.kind !== "admission" || row.record_id !== recordId || row.content_hash !== contentHash || row.manifest_hash !== manifestHash ||
        readBack?.recordId !== recordId || readBack?.contentHash !== contentHash || readBack?.manifestHash !== manifestHash) return false;
      const record = findRecord.get(recordId);
      if (!record || record.content_hash !== contentHash || record.manifest_hash !== manifestHash) return false;
      assertRow(record);
      return db.prepare("UPDATE outbox SET state='acknowledged',receipt_json=? WHERE outbox_id=? AND state='pending'").run(canonical({ readBack, receipt: receipt ?? null }), outboxId).changes === 1;
    }).immediate();
  }

  function audit() {
    const errors = coordinator.integrityErrors();
    const records = db.prepare("SELECT * FROM evidence_records").all();
    for (const row of records) { try { assertRow(row); } catch (error) { errors.push(error.message); } }
    const indexed = new Set(records.map((row) => row.segment_name));
    const manifests = new Set(records.map((row) => row.manifest_name));
    const detectedOrphans = fs.readdirSync(segmentDir).filter((name) => !indexed.has(name));
    const unindexedManifests = fs.readdirSync(manifestDir).filter((name) => !manifests.has(name));
    const foreignKeyErrors = db.pragma("foreign_key_check");
    if (foreignKeyErrors.length) errors.push("ARCHIVE_FOREIGN_KEY_INTEGRITY_FAILED");
    const orphanSegments = db.prepare("SELECT * FROM orphan_segments").all();
    const unresolvedOrphanMarkers = orphanSegments.filter((row) => !indexed.has(row.segment_name));
    for (const marker of unresolvedOrphanMarkers) if (!fs.existsSync(path.join(segmentDir, marker.segment_name))) errors.push(`ARCHIVE_ORPHAN_SEGMENT_MISSING:${marker.segment_name}`);
    const inconsistentTasks = db.prepare("SELECT obligations.task_id FROM obligations LEFT JOIN leases USING(task_id) WHERE (obligations.state='leased' AND leases.token IS NULL) OR (obligations.state!='leased' AND leases.token IS NOT NULL)").all();
    if (inconsistentTasks.length) errors.push("ARCHIVE_LEASE_STATE_INCONSISTENT");
    const invalidStates = db.prepare("SELECT task_id FROM obligations WHERE state NOT IN ('pending','leased','retryable','budget-deferred','expired','completed') OR (state='completed' AND (completed_at IS NULL OR completed_at < due_at OR evidence_record_id IS NULL)) OR (state!='completed' AND (completed_at IS NOT NULL OR evidence_record_id IS NOT NULL))").all();
    if (invalidStates.length) errors.push("ARCHIVE_TASK_STATE_INVALID");
    for (const link of db.prepare("SELECT * FROM historical_reconciliations").all()) {
      try {
        const task = db.prepare("SELECT * FROM obligations WHERE task_id=?").get(link.task_id);
        const observed = historicalObservation(task, link.evidence_record_id, timestamp(link.reconciled_at, "reconciledAt"));
        if (link.source_kind !== observed.sourceKind || link.observed_at !== observed.observedAt || link.observation_hash !== observed.observationHash || task.state === "completed" || task.state === "leased") throw new Error("ARCHIVE_HISTORICAL_LINK_INVALID");
      } catch (error) { errors.push("ARCHIVE_HISTORICAL_RECONCILIATION_INVALID:" + link.task_id + ":" + error.message); }
    }
    for (const task of db.prepare("SELECT * FROM obligations WHERE state='completed'").all()) {
      try { if (!validObservation(task, task.evidence_record_id, task.completed_at)) errors.push(`ARCHIVE_COMPLETION_EVIDENCE_INVALID:${task.task_id}`); } catch (error) { errors.push(error.message); }
    }
    for (const row of records) {
      const entries = db.prepare("SELECT * FROM outbox WHERE record_id=?").all(row.record_id);
      const entry = entries[0];
      let receiptValid = false;
      try {
        const receipt = JSON.parse(entry?.receipt_json ?? "null");
        receiptValid = entry?.state === "pending" ? entry.receipt_json === null :
          receipt?.readBack?.recordId === row.record_id && receipt?.readBack?.contentHash === row.content_hash && receipt?.readBack?.manifestHash === row.manifest_hash;
      } catch {}
      if (entry?.kind !== "admission" || !receiptValid) errors.push("ARCHIVE_OUTBOX_RECEIPT_CORRUPT:" + row.record_id);
      const expectedPayload = canonical({ recordId: row.record_id, contentHash: row.content_hash, manifestHash: row.manifest_hash, admissionHash: row.admission_hash });
      if (entries.length !== 1 || entry.content_hash !== row.content_hash || entry.manifest_hash !== row.manifest_hash || entry.payload_json !== expectedPayload ||
        entry.outbox_id !== digest(`admit\u0000${row.record_id}\u0000${row.admission_hash}`) || !["pending", "acknowledged"].includes(entry.state)) errors.push(`ARCHIVE_OUTBOX_CORRUPT:${row.record_id}`);
    }
    return { ok: errors.length === 0 && detectedOrphans.length === 0 && unindexedManifests.length === 0, integrityOk: errors.length === 0,
      errors, detectedOrphans, unindexedManifests, orphanSegments, unresolvedOrphanMarkers, records: records.length };
  }

  function exportArchive(destination, exportOptions = {}) {
    const target = path.resolve(destination);
    if (fs.existsSync(target) && fs.readdirSync(target).length) throw new Error("EXPORT_TARGET_NOT_EMPTY");
    fs.mkdirSync(target, { recursive: true });
    const { paths, ...snapshot } = db.transaction(() => {
      const checked = audit();
      if (!checked.ok && !(exportOptions.preserveQuarantinedEvidence === true && checked.integrityOk)) throw new Error("ARCHIVE_EXPORT_INTEGRITY_FAILED:" + (checked.errors.join(",") || "UNINDEXED_EVIDENCE"));
      const tables = Object.fromEntries(TABLES.map((table) => [table, db.prepare(`SELECT * FROM ${table}`).all()]));
      for (const row of tables.evidence_records) assertRow(row);
      const paths = [...new Set([
        ...tables.evidence_records.flatMap(row => ["segments/" + row.segment_name, "manifests/" + row.manifest_name]),
        ...checked.detectedOrphans.map(name => "segments/" + name),
        ...checked.unindexedManifests.map(name => "manifests/" + name),
      ])].sort();
      return { format: "durable-evidence-archive/v2", operationalStateSchemaVersion: 2, createdAt: archiveNow(), preservesQuarantinedEvidence: !checked.ok, tables, paths, files: [] };
    })();
    for (const directory of ["segments", "manifests"]) fs.mkdirSync(path.join(target, directory));
    // Only copy the captured snapshot's names, not later concurrent admissions.
    for (const relative of paths) {
      const bytes = readRegular(path.join(root, relative));
      persistImmutable(path.join(target, relative), bytes);
      snapshot.files.push({ path: relative, bytes: bytes.length, sha256: digest(bytes) });
    }
    const index = Buffer.from(canonical(snapshot));
    const file = path.join(target, "archive-export.json");
    persistImmutable(file, index);
    persistImmutable(`${file}.sha256`, Buffer.from(digest(index)));
    syncDirectory(target);
    return file;
  }

  function importArchive(source, importOptions = {}) {
    if (TABLES.some((table) => db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n) || fs.readdirSync(segmentDir).length || fs.readdirSync(manifestDir).length) throw new Error("RESTORE_TARGET_NOT_EMPTY");
    const sourceFile = path.resolve(source);
    const bytes = readRegular(sourceFile);
    if (readRegular(`${sourceFile}.sha256`).toString() !== digest(bytes)) throw new Error("ARCHIVE_EXPORT_HASH_MISMATCH");
    const snapshot = JSON.parse(bytes);
    const restoredTables = snapshot.operationalStateSchemaVersion === undefined ? EVIDENCE_TABLES : snapshot.operationalStateSchemaVersion === 1 ? OPERATIONAL_V1_TABLES : snapshot.operationalStateSchemaVersion === 2 ? TABLES : [];
    if (snapshot.format !== "durable-evidence-archive/v2" || !Array.isArray(snapshot.files) || !restoredTables.length ||
      canonical(Object.keys(snapshot.tables || {}).sort()) !== canonical([...restoredTables].sort()) || restoredTables.some((table) => !Array.isArray(snapshot.tables[table]))) throw new Error("UNSUPPORTED_ARCHIVE_EXPORT");
    const seen = new Set();
    for (const item of snapshot.files) {
      if (!/^(segments|manifests)\/[a-zA-Z0-9.-]+$/.test(item.path) || item.path.split("/")[1].includes("..") || seen.has(item.path) || !HASH.test(item.sha256)) throw new Error("ARCHIVE_EXPORT_PATH_INVALID");
      seen.add(item.path);
      const original = readRegular(path.join(path.dirname(sourceFile), item.path));
      if (original.length !== item.bytes || digest(original) !== item.sha256) throw new Error(`ARCHIVE_EXPORT_FILE_CORRUPT:${item.path}`);
    }
    for (const row of snapshot.tables.evidence_records) {
      if (!HASH.test(row.content_hash) || row.segment_name !== `${row.content_hash}.gz` || row.manifest_name !== `${digest(identifier(row.record_id, "recordId"))}.json` ||
        !seen.has(`segments/${row.segment_name}`) || !seen.has(`manifests/${row.manifest_name}`)) throw new Error("ARCHIVE_EXPORT_RECORD_INVALID");
    }
    for (const item of snapshot.files) {
      const original = readRegular(path.join(path.dirname(sourceFile), item.path));
      if (original.length !== item.bytes || digest(original) !== item.sha256) throw new Error("ARCHIVE_EXPORT_FILE_CORRUPT:" + item.path);
      persistImmutable(path.join(root, item.path), original);
    }
    db.transaction(() => {
      for (const row of snapshot.tables.evidence_records) insertRecord.run(row);
      for (const row of snapshot.tables.obligations) insertTask.run(row);
      for (const row of snapshot.tables.leases) db.prepare("INSERT INTO leases VALUES (@task_id,@owner,@lease_until,@token)").run(row);
      for (const row of snapshot.tables.outbox) insertOutbox.run(row);
      for (const row of snapshot.tables.orphan_segments) markOrphan.run(row);
      for (const table of COORDINATOR_TABLES.filter(table => restoredTables.includes(table))) {
        const columns = db.pragma(`table_info(${table})`).map(column => column.name);
        const insert = db.prepare(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map(column => '@' + column).join(',')})`);
        for (const row of snapshot.tables[table]) insert.run(table === "provider_requests" && snapshot.operationalStateSchemaVersion === 1 ? { ...row, attempt_kind: row.attempt_kind ?? "LEGACY_UNCLASSIFIED", finished_at: row.finished_at ?? row.received_at } : row);
      }
      if (restoredTables.includes("historical_reconciliations")) for (const row of snapshot.tables.historical_reconciliations) db.prepare("INSERT INTO historical_reconciliations VALUES (@task_id,@evidence_record_id,@observed_at,@reconciled_at,@observation_hash,@source_kind)").run(row);
      for (const row of snapshot.tables.evidence_records) assertRow(row);
      const checked = audit();
      if (!checked.ok && !(importOptions.preserveQuarantinedEvidence === true && checked.integrityOk)) throw new Error("ARCHIVE_RESTORE_INTEGRITY_FAILED:" + (checked.errors.join(",") || "UNINDEXED_EVIDENCE"));
    })();
    const result = audit();
    if (!result.ok && !(importOptions.preserveQuarantinedEvidence === true && result.integrityOk)) throw new Error("ARCHIVE_RESTORE_INTEGRITY_FAILED:" + (result.errors.join(",") || "UNINDEXED_EVIDENCE"));
    return result;
  }

  function rebuildIndex() {
    if (TABLES.some((table) => db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n)) throw new Error("REBUILD_TARGET_NOT_EMPTY");
    const inputs = fs.readdirSync(manifestDir).filter((name) => name.endsWith(".json")).map((name) => {
      const manifest = validateManifest(JSON.parse(readRegular(path.join(manifestDir, name))));
      if (name !== `${digest(manifest.recordId)}.json`) throw new Error("ARCHIVE_MANIFEST_CORRUPT");
      const compressed = readRegular(path.join(segmentDir, `${manifest.contentHash}.gz`));
      if (digest(compressed) !== manifest.compressedHash) throw new Error("ARCHIVE_SEGMENT_CORRUPT");
      const raw = zlib.gunzipSync(compressed);
      if (digest(raw) !== manifest.contentHash || raw.length !== manifest.rawSize) throw new Error("ARCHIVE_SEGMENT_CORRUPT");
      return { ...manifest, rawBytes: raw };
    });
    db.transaction(() => { for (const input of inputs) admitPrediction(input); })();
    return { ...audit(), mutableTaskHistoryRestored: false, status: "IMMUTABLE_INDEX_REBUILT_RECONCILIATION_REQUIRED" };
  }

  async function backup(destination) {
    const target = path.resolve(destination);
    let reserved;
    try { reserved = fs.openSync(target, "wx", 0o600); } catch (error) { if (error.code === "EEXIST") throw new Error("BACKUP_TARGET_EXISTS"); throw error; }
    fs.closeSync(reserved);
    await db.backup(target);
    const fd = fs.openSync(target, "r"); try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    syncDirectory(path.dirname(target));
    return target;
  }
  function close() { if (!closed) { db.close(); closed = true; } }
  return { root, dbPath, admitPrediction, readEvidence, leaseDue, renewTaskLease, transitionTask, completeWithEvidence, dueDenominators, listTasks, listOutcomeCaptures, listRecoverableProviderResponses, reconcileHistoricalObservation, reconcileCompatibleFrozenObligations, listOutbox, acknowledgeOutbox, audit, exportArchive, importArchive, rebuildIndex, backup, close,
    claimWriter: coordinator.claimWriter, renewWriter: coordinator.renewWriter, releaseWriter: coordinator.releaseWriter,
    reserveProviderRequest: coordinator.reserveProviderRequest, markProviderDispatched: coordinator.markProviderDispatched,
    finishProviderRequest: coordinator.finishProviderRequest, coordinationStatus: coordinator.coordinationStatus };
}

export function restoreDurableEvidenceArchive({ source, root, preserveQuarantinedEvidence = false }) {
  const destination = path.resolve(root);
  const assertDestination = () => {
    if (fs.existsSync(destination) && (!fs.lstatSync(destination).isDirectory() || fs.readdirSync(destination).length)) throw new Error("RESTORE_TARGET_NOT_EMPTY");
    return fs.existsSync(destination) ? fs.lstatSync(destination, { bigint: true }) : null;
  };
  const originalDestination = assertDestination();
  const parent = path.dirname(destination);
  fs.mkdirSync(parent, { recursive: true });
  const staging = fs.mkdtempSync(path.join(parent, ".archive-restore-"));
  const store = openDurableEvidenceArchive({ root: staging });
  try {
    store.importArchive(source, { preserveQuarantinedEvidence });
    store.close();
    syncDirectory(staging);
    publishRestoredArchive(staging, destination, originalDestination);
    syncDirectory(parent);
    fs.rmSync(staging, { recursive: true });
    return openDurableEvidenceArchive({ root: destination });
  } catch (error) {
    store.close();
    error.recoveryDirectory = fs.existsSync(staging) ? staging : destination;
    throw error;
  }
}

function publishRestoredArchive(staging, destination, originalDestination) {
  if (!originalDestination) {
    try { fs.mkdirSync(destination, { mode: 0o700 }); } catch (error) {
      if (error.code === "EEXIST") throw new Error("ARCHIVE_RESTORE_TARGET_CHANGED");
      throw error;
    }
  }
  const claimed = fs.lstatSync(destination, { bigint: true });
  if (!claimed.isDirectory() || (originalDestination && (claimed.ino !== originalDestination.ino || claimed.dev !== originalDestination.dev)) ||
    fs.readdirSync(destination).length) throw new Error("ARCHIVE_RESTORE_TARGET_CHANGED");
  const assertClaim = () => {
    const current = fs.lstatSync(destination, { bigint: true });
    if (!current.isDirectory() || current.ino !== claimed.ino || current.dev !== claimed.dev) throw new Error("ARCHIVE_RESTORE_TARGET_CHANGED");
  };
  const publish = (from, to) => {
    const entries = fs.readdirSync(from, { withFileTypes: true }).sort((a, b) =>
      Number(a.name === "archive.sqlite") - Number(b.name === "archive.sqlite") || Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name));
    for (const entry of entries) {
      assertClaim();
      const source = path.join(from, entry.name), target = path.join(to, entry.name);
      if (entry.isDirectory()) {
        fs.mkdirSync(target, { mode: 0o700 });
        publish(source, target);
      } else if (entry.isFile()) fs.linkSync(source, target);
      else throw new Error("ARCHIVE_RESTORE_STAGING_NOT_REGULAR");
    }
    syncDirectory(to);
  };
  // Publish the closed index last; no existing file or directory is replaced.
  publish(staging, destination);
}
