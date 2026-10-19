import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import Database from "better-sqlite3";

const digest = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const now = () => new Date().toISOString();
const HASH = /^[a-f0-9]{64}$/;
const TABLES = ["evidence_records", "obligations", "leases", "outbox", "orphan_segments"];

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
  const db = new Database(dbPath);
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
    PRAGMA user_version = 2;
  `);
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
      cohort_json: canonical(body.cohortMetadata), missingness_json: canonical(body.missingness), immutable_json: canonical(contract), admitted_at: now() };
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
      markOrphan.run({ content_hash: row.content_hash, segment_name: row.segment_name, reason: `unindexed:${error.message}`, noted_at: now() });
      throw error;
    }
    return { status: "admitted", recordId, contentHash: row.content_hash, manifestName: row.manifest_name, admissionHash: row.admission_hash, taskIds: obligations.map((item) => item.taskId) };
  }

  function readEvidence(recordId) {
    const row = findRecord.get(recordId); if (!row) return null;
    return { recordId, contentHash: row.content_hash, admissionHash: row.admission_hash, rawBytes: assertRow(row).raw,
      cohortMetadata: JSON.parse(row.cohort_json), missingness: JSON.parse(row.missingness_json), immutableContract: JSON.parse(row.immutable_json) };
  }

  function expireTasks(at) {
    db.prepare("UPDATE obligations SET state='expired',completed_at=NULL WHERE state IN ('pending','leased','retryable','budget-deferred') AND expires_at < ?").run(at);
    db.prepare("DELETE FROM leases WHERE task_id IN (SELECT task_id FROM obligations WHERE state='expired')").run();
    db.prepare("UPDATE obligations SET state='pending' WHERE state='leased' AND task_id IN (SELECT task_id FROM leases WHERE lease_until <= ?)").run(at);
    db.prepare("DELETE FROM leases WHERE lease_until <= ?").run(at);
  }

  function leaseDue({ owner, nowAt = now(), limit = 1, leaseMs = 60000 } = {}) {
    identifier(owner, "owner"); const at = timestamp(nowAt, "nowAt");
    if (!Number.isSafeInteger(limit) || limit < 0 || !Number.isSafeInteger(leaseMs) || leaseMs <= 0) throw new TypeError("Invalid lease limit or duration");
    const until = new Date(Date.parse(at) + leaseMs).toISOString();
    return db.transaction(() => {
      expireTasks(at);
      const candidates = db.prepare("SELECT * FROM obligations WHERE state IN ('pending','retryable','budget-deferred') AND due_at <= ? ORDER BY due_at,obligation_id LIMIT ?").all(at, limit);
      return candidates.map((task) => {
        const token = crypto.randomUUID();
        db.prepare("UPDATE obligations SET state='leased' WHERE task_id=?").run(task.task_id);
        db.prepare("INSERT INTO leases VALUES (?,?,?,?)").run(task.task_id, owner, until, token);
        return { taskId: task.task_id, obligationId: task.obligation_id, frozen: JSON.parse(task.frozen_json), leaseUntil: until, leaseToken: token };
      });
    }).immediate();
  }

  function validObservation(task, evidenceRecordId, completedAt) {
    if (!evidenceRecordId) return false;
    const observation = findRecord.get(evidenceRecordId);
    if (!observation) return false;
    const manifest = assertRow(observation).manifest;
    const link = manifest.immutableContract?.observationOf;
    if (link?.recordId !== task.record_id || link?.taskId !== task.task_id) return false;
    let requestedAt, receivedAt, marketAt;
    try { requestedAt = timestamp(link.requestedAt, "requestedAt"); receivedAt = timestamp(link.receivedAt, "receivedAt"); marketAt = timestamp(link.marketObservedAt, "marketObservedAt"); } catch { return false; }
    if (requestedAt > receivedAt || marketAt > receivedAt || receivedAt > completedAt || marketAt < task.due_at || marketAt > task.expires_at || receivedAt > task.expires_at) return false;
    const parent = JSON.parse(findRecord.get(task.record_id).immutable_json);
    for (const key of ["chain", "tokenAddress", "poolAddress"]) if (parent?.[key] !== undefined && parent[key] !== manifest.immutableContract?.[key]) return false;
    const frozen = JSON.parse(task.frozen_json);
    if (frozen.horizonHours !== undefined && frozen.horizonHours !== link.horizonHours) return false;
    return true;
  }

  function transitionTask({ obligationId, owner, leaseToken, state, evidenceRecordId = null, nowAt = now() } = {}) {
    if (!["completed", "retryable", "budget-deferred", "expired"].includes(state)) throw new TypeError("Invalid task transition");
    const at = timestamp(nowAt, "nowAt");
    return db.transaction(() => {
      expireTasks(at);
      if (typeof leaseToken !== "string") return false;
      const lease = db.prepare("SELECT leases.*, obligations.obligation_id FROM leases JOIN obligations USING(task_id) WHERE token=?").get(leaseToken);
      if (!lease || lease.obligation_id !== obligationId || lease.owner !== owner || lease.lease_until <= at) return false;
      if (state === "expired") return false;
      const task = db.prepare("SELECT * FROM obligations WHERE task_id=?").get(lease.task_id);
      assertRow(findRecord.get(task.record_id));
      if (state === "completed" && !validObservation(task, evidenceRecordId, at)) return false;
      const changed = db.prepare("UPDATE obligations SET state=?,completed_at=?,evidence_record_id=? WHERE task_id=? AND state='leased'").run(state, state === "completed" ? at : null, state === "completed" ? evidenceRecordId : null, lease.task_id).changes;
      if (changed) db.prepare("DELETE FROM leases WHERE task_id=? AND token=?").run(lease.task_id, leaseToken);
      return changed === 1;
    }).immediate();
  }

  function completeWithEvidence({ obligationId, owner, leaseToken, evidence, nowAt = now() } = {}) {
    const at = timestamp(nowAt, "nowAt");
    return db.transaction(() => {
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

  function dueDenominators(nowAt = now()) {
    const at = timestamp(nowAt, "nowAt");
    return db.transaction(() => { expireTasks(at); return db.prepare("SELECT state,COUNT(*) AS count FROM obligations WHERE due_at <= ? GROUP BY state ORDER BY state").all(at); }).immediate();
  }

  function listOutbox() { return db.prepare("SELECT * FROM outbox ORDER BY created_at,outbox_id").all(); }

  function acknowledgeOutbox({ outboxId, recordId, contentHash, manifestHash, readBack, receipt } = {}) {
    const row = db.prepare("SELECT * FROM outbox WHERE outbox_id=?").get(outboxId);
    if (!row || row.kind !== "admission" || row.record_id !== recordId || row.content_hash !== contentHash || row.manifest_hash !== manifestHash ||
      readBack?.recordId !== recordId || readBack?.contentHash !== contentHash || readBack?.manifestHash !== manifestHash) return false;
    const record = findRecord.get(recordId);
    if (!record || record.content_hash !== contentHash || record.manifest_hash !== manifestHash) return false;
    assertRow(record);
    return db.prepare("UPDATE outbox SET state='acknowledged',receipt_json=? WHERE outbox_id=? AND state='pending'").run(canonical({ readBack, receipt: receipt ?? null }), outboxId).changes === 1;
  }

  function audit() {
    const errors = [];
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
    const invalidStates = db.prepare("SELECT task_id FROM obligations WHERE state NOT IN ('pending','leased','retryable','budget-deferred','expired','completed') OR (state='completed' AND (completed_at IS NULL OR completed_at < due_at OR completed_at > expires_at OR evidence_record_id IS NULL)) OR (state!='completed' AND (completed_at IS NOT NULL OR evidence_record_id IS NOT NULL))").all();
    if (invalidStates.length) errors.push("ARCHIVE_TASK_STATE_INVALID");
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
    const snapshot = db.transaction(() => {
      const checked = audit();
      if (!checked.ok && !(exportOptions.preserveQuarantinedEvidence === true && checked.integrityOk)) throw new Error("ARCHIVE_EXPORT_INTEGRITY_FAILED:" + (checked.errors.join(",") || "UNINDEXED_EVIDENCE"));
      const tables = Object.fromEntries(TABLES.map((table) => [table, db.prepare(`SELECT * FROM ${table}`).all()]));
      for (const row of tables.evidence_records) assertRow(row);
      return { format: "durable-evidence-archive/v2", createdAt: now(), preservesQuarantinedEvidence: !checked.ok, tables, files: [] };
    })();
    for (const directory of ["segments", "manifests"]) {
      fs.mkdirSync(path.join(target, directory));
      for (const name of fs.readdirSync(path.join(root, directory)).sort()) {
        const relative = `${directory}/${name}`;
        const bytes = readRegular(path.join(root, relative));
        persistImmutable(path.join(target, relative), bytes);
        snapshot.files.push({ path: relative, bytes: bytes.length, sha256: digest(bytes) });
      }
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
    if (snapshot.format !== "durable-evidence-archive/v2" || !Array.isArray(snapshot.files) || TABLES.some((table) => !Array.isArray(snapshot.tables?.[table]))) throw new Error("UNSUPPORTED_ARCHIVE_EXPORT");
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
  return { root, dbPath, admitPrediction, readEvidence, leaseDue, transitionTask, completeWithEvidence, dueDenominators, listOutbox, acknowledgeOutbox, audit, exportArchive, importArchive, rebuildIndex, backup, close };
}

export function restoreDurableEvidenceArchive({ source, root, preserveQuarantinedEvidence = false }) {
  const destination = path.resolve(root);
  const assertDestination = () => {
    if (fs.existsSync(destination) && (!fs.lstatSync(destination).isDirectory() || fs.readdirSync(destination).length)) throw new Error("RESTORE_TARGET_NOT_EMPTY");
  };
  assertDestination();
  const parent = path.dirname(destination);
  fs.mkdirSync(parent, { recursive: true });
  const staging = fs.mkdtempSync(path.join(parent, ".archive-restore-"));
  const store = openDurableEvidenceArchive({ root: staging });
  try {
    store.importArchive(source, { preserveQuarantinedEvidence });
    store.close();
    syncDirectory(staging);
    assertDestination();
    fs.renameSync(staging, destination);
    syncDirectory(parent);
    return openDurableEvidenceArchive({ root: destination });
  } catch (error) {
    store.close();
    error.recoveryDirectory = fs.existsSync(staging) ? staging : destination;
    throw error;
  }
}
