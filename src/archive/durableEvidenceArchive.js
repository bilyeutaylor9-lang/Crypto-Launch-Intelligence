/**
 * Local, append-only evidence archive.  This is deliberately not connected to
 * collection: callers must explicitly pass the bytes and the already-frozen
 * future obligations that their contract created.
 */
import crypto from "crypto";
import fs from "fs";
import path from "path";
import zlib from "zlib";
import Database from "better-sqlite3";

const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
const now = () => new Date().toISOString();
const parse = (value, fallback = null) => { try { return JSON.parse(value); } catch { return fallback; } };

function fsyncDirectory(directory) {
  let fd;
  try { fd = fs.openSync(directory, "r"); fs.fsyncSync(fd); } finally { if (fd !== undefined) fs.closeSync(fd); }
}

function writeExclusiveAndSync(file, bytes) {
  const temporary = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
  let fd;
  try {
    fd = fs.openSync(temporary, "wx", 0o600);
    fs.writeFileSync(fd, bytes);
    fs.fsyncSync(fd);
  } finally { if (fd !== undefined) fs.closeSync(fd); }
  try { fs.renameSync(temporary, file); } catch (error) {
    try { fs.unlinkSync(temporary); } catch {}
    if (error.code !== "EEXIST") throw error;
  }
  fsyncDirectory(path.dirname(file));
}

function rawBuffer(rawBytes) {
  if (Buffer.isBuffer(rawBytes)) return rawBytes;
  if (rawBytes instanceof Uint8Array) return Buffer.from(rawBytes);
  throw new TypeError("rawBytes must be Buffer or Uint8Array; stringify at the collection boundary if appropriate");
}

export function openDurableEvidenceArchive(options = {}) {
  const root = path.resolve(options.root || "durable-evidence-archive");
  const segmentDir = path.join(root, "segments");
  const manifestDir = path.join(root, "manifests");
  const dbPath = path.join(root, "archive.sqlite");
  fs.mkdirSync(segmentDir, { recursive: true }); fs.mkdirSync(manifestDir, { recursive: true });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = FULL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS evidence_records (
      record_id TEXT PRIMARY KEY, content_hash TEXT NOT NULL UNIQUE, segment_name TEXT NOT NULL,
      compressed_hash TEXT NOT NULL, raw_size INTEGER NOT NULL, cohort_json TEXT,
      missingness_json TEXT, immutable_json TEXT NOT NULL, admitted_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS obligations (
      obligation_id TEXT PRIMARY KEY, record_id TEXT NOT NULL, frozen_json TEXT NOT NULL,
      due_at TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'pending', task_id TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL, completed_at TEXT, FOREIGN KEY(record_id) REFERENCES evidence_records(record_id)
    );
    CREATE TABLE IF NOT EXISTS leases (
      obligation_id TEXT PRIMARY KEY, owner TEXT NOT NULL, lease_until TEXT NOT NULL, version INTEGER NOT NULL,
      FOREIGN KEY(obligation_id) REFERENCES obligations(obligation_id)
    );
    CREATE TABLE IF NOT EXISTS outbox (
      outbox_id TEXT PRIMARY KEY, record_id TEXT NOT NULL, content_hash TEXT NOT NULL, kind TEXT NOT NULL,
      payload_json TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'pending', receipt_json TEXT, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS orphan_segments (
      content_hash TEXT PRIMARY KEY, segment_name TEXT NOT NULL, reason TEXT NOT NULL, noted_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_obligations_due ON obligations(state, due_at);
  `);

  const findRecord = db.prepare("SELECT * FROM evidence_records WHERE record_id = ?");
  const findHash = db.prepare("SELECT * FROM evidence_records WHERE content_hash = ?");
  const markOrphan = db.prepare("INSERT OR IGNORE INTO orphan_segments VALUES (@content_hash,@segment_name,@reason,@noted_at)");

  function assertSegment(row) {
    const file = path.join(segmentDir, row.segment_name);
    if (!fs.existsSync(file)) throw new Error(`ARCHIVE_SEGMENT_MISSING:${row.segment_name}`);
    const compressed = fs.readFileSync(file);
    if (hash(compressed) !== row.compressed_hash) throw new Error(`ARCHIVE_SEGMENT_CORRUPT:${row.segment_name}`);
    let raw;
    try { raw = zlib.gunzipSync(compressed); } catch { throw new Error(`ARCHIVE_SEGMENT_CORRUPT:${row.segment_name}`); }
    if (hash(raw) !== row.content_hash) throw new Error(`ARCHIVE_SEGMENT_CORRUPT:${row.segment_name}`);
    const manifestFile = path.join(manifestDir, `${row.content_hash}.json`);
    if (!fs.existsSync(manifestFile)) throw new Error(`ARCHIVE_MANIFEST_MISSING:${row.content_hash}`);
    const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
    if (manifest.recordId !== row.record_id || manifest.contentHash !== row.content_hash || manifest.compressedHash !== row.compressed_hash) throw new Error(`ARCHIVE_MANIFEST_CORRUPT:${row.content_hash}`);
    return raw;
  }

  function normalizeObligations(recordId, obligations) {
    if (!Array.isArray(obligations)) throw new TypeError("frozenObligations must be an array supplied by the frozen contract");
    const seen = new Set();
    return obligations.map((frozen) => {
      if (!frozen || typeof frozen !== "object" || !frozen.obligationId || !frozen.dueAt) throw new TypeError("each frozen obligation needs obligationId and dueAt");
      if (!Number.isFinite(Date.parse(frozen.dueAt))) throw new TypeError("frozen obligation dueAt must be an ISO date");
      if (seen.has(frozen.obligationId)) throw new Error(`DUPLICATE_OBLIGATION:${frozen.obligationId}`);
      seen.add(frozen.obligationId);
      return { ...frozen, taskId: frozen.taskId || hash(`${recordId}\u0000${frozen.obligationId}`) };
    });
  }

  function admitPrediction(input = {}) {
    if (!input.recordId) throw new TypeError("recordId is required");
    const bytes = rawBuffer(input.rawBytes);
    const contentHash = hash(bytes);
    const old = findRecord.get(input.recordId);
    if (old) {
      if (old.content_hash !== contentHash) throw new Error(`IMMUTABLE_ID_CONFLICT:${input.recordId}`);
      return { status: "duplicate", recordId: input.recordId, contentHash, taskIds: db.prepare("SELECT task_id FROM obligations WHERE record_id=?").all(input.recordId).map((x) => x.task_id) };
    }
    const sameContent = findHash.get(contentHash);
    if (sameContent) throw new Error(`IMMUTABLE_CONTENT_CONFLICT:${contentHash}`);
    const obligations = normalizeObligations(input.recordId, input.frozenObligations);
    const segmentName = `${contentHash}.gz`;
    const compressed = zlib.gzipSync(bytes, { mtime: 0 });
    const row = { record_id: input.recordId, content_hash: contentHash, segment_name: segmentName, compressed_hash: hash(compressed), raw_size: bytes.length, cohort_json: JSON.stringify(input.cohortMetadata ?? null), missingness_json: JSON.stringify(input.missingness ?? null), immutable_json: JSON.stringify(input.immutableContract ?? null), admitted_at: now() };
    const file = path.join(segmentDir, segmentName);
    if (!fs.existsSync(file)) writeExclusiveAndSync(file, compressed);
    const manifest = { format: "durable-evidence-manifest/v1", recordId: input.recordId, contentHash, compressedHash: row.compressed_hash, rawSize: bytes.length, cohortMetadata: input.cohortMetadata ?? null, missingness: input.missingness ?? null, immutableContract: input.immutableContract ?? null, frozenObligations: obligations };
    const manifestFile = path.join(manifestDir, `${contentHash}.json`);
    if (!fs.existsSync(manifestFile)) writeExclusiveAndSync(manifestFile, Buffer.from(JSON.stringify(manifest)));
    if (options.fault === "after-segment") throw new Error("FAULT_AFTER_SEGMENT");
    try {
      db.transaction(() => {
        db.prepare("INSERT INTO evidence_records VALUES (@record_id,@content_hash,@segment_name,@compressed_hash,@raw_size,@cohort_json,@missingness_json,@immutable_json,@admitted_at)").run(row);
        const insert = db.prepare("INSERT INTO obligations (obligation_id,record_id,frozen_json,due_at,state,task_id,created_at) VALUES (?,?,?,?, 'pending',?,?)");
        for (const obligation of obligations) insert.run(obligation.obligationId, input.recordId, JSON.stringify(obligation), obligation.dueAt, obligation.taskId, row.admitted_at);
        db.prepare("INSERT INTO outbox VALUES (?,?,?,?,?,'pending',NULL,?)").run(hash(`admit\u0000${input.recordId}\u0000${contentHash}`), input.recordId, contentHash, "admission", JSON.stringify({ recordId: input.recordId, contentHash }), row.admitted_at);
        if (options.fault === "inside-transaction") throw new Error("FAULT_INSIDE_TRANSACTION");
      })();
    } catch (error) {
      markOrphan.run({ content_hash: contentHash, segment_name: segmentName, reason: `unindexed:${error.message}`, noted_at: now() });
      throw error;
    }
    return { status: "admitted", recordId: input.recordId, contentHash, taskIds: obligations.map((x) => x.taskId) };
  }

  function readEvidence(recordId) { const row = findRecord.get(recordId); if (!row) return null; return { recordId, contentHash: row.content_hash, rawBytes: assertSegment(row), cohortMetadata: parse(row.cohort_json), missingness: parse(row.missingness_json), immutableContract: parse(row.immutable_json) }; }

  function leaseDue({ owner, nowAt = now(), limit = 1, leaseMs = 60_000 } = {}) {
    if (!owner) throw new TypeError("owner required");
    const until = new Date(Date.parse(nowAt) + leaseMs).toISOString();
    return db.transaction(() => {
      db.prepare("UPDATE obligations SET state='pending' WHERE state='leased' AND obligation_id IN (SELECT obligation_id FROM leases WHERE lease_until <= ?)").run(nowAt);
      db.prepare("DELETE FROM leases WHERE lease_until <= ?").run(nowAt);
      const candidates = db.prepare("SELECT * FROM obligations WHERE state IN ('pending','retryable','budget-deferred') AND due_at <= ? ORDER BY due_at LIMIT ?").all(nowAt, limit);
      const leased = [];
      for (const task of candidates) {
        const changed = db.prepare("UPDATE obligations SET state='leased' WHERE obligation_id=? AND state IN ('pending','retryable','budget-deferred')").run(task.obligation_id).changes;
        if (changed) { db.prepare("INSERT INTO leases VALUES (?,?,?,1)").run(task.obligation_id, owner, until); leased.push({ taskId: task.task_id, obligationId: task.obligation_id, frozen: parse(task.frozen_json), leaseUntil: until }); }
      }
      return leased;
    })();
  }
  function transitionTask({ obligationId, owner, state, nowAt = now() } = {}) {
    if (!['completed','retryable','budget-deferred','expired'].includes(state)) throw new TypeError("invalid terminal task state");
    return db.transaction(() => {
      const lease = db.prepare("SELECT * FROM leases WHERE obligation_id=?").get(obligationId);
      if (!lease || lease.owner !== owner || lease.lease_until <= nowAt) return false;
      const changed = db.prepare("UPDATE obligations SET state=?, completed_at=? WHERE obligation_id=? AND state='leased'").run(state, state === 'completed' ? nowAt : null, obligationId).changes;
      if (changed) db.prepare("DELETE FROM leases WHERE obligation_id=? AND owner=? AND version=?").run(obligationId, owner, lease.version);
      return Boolean(changed);
    })();
  }
  function dueDenominators(nowAt = now()) { return db.prepare("SELECT state, COUNT(*) AS count FROM obligations WHERE due_at <= ? GROUP BY state").all(nowAt); }
  function acknowledgeOutbox({ outboxId, recordId, contentHash, receipt } = {}) {
    const row = db.prepare("SELECT * FROM outbox WHERE outbox_id=?").get(outboxId);
    if (!row || row.record_id !== recordId || row.content_hash !== contentHash) return false;
    return db.prepare("UPDATE outbox SET state='acknowledged', receipt_json=? WHERE outbox_id=? AND state='pending'").run(JSON.stringify(receipt ?? null), outboxId).changes === 1;
  }
  function audit() {
    const errors = [];
    for (const row of db.prepare("SELECT * FROM evidence_records").all()) { try { assertSegment(row); } catch (error) { errors.push(error.message); } }
    const indexed = new Set(db.prepare("SELECT segment_name FROM evidence_records").all().map((row) => row.segment_name));
    const detectedOrphans = fs.readdirSync(segmentDir).filter((name) => name.endsWith(".gz") && !indexed.has(name));
    return { ok: errors.length === 0, errors, orphanSegments: db.prepare("SELECT * FROM orphan_segments").all(), detectedOrphans, records: db.prepare("SELECT COUNT(*) n FROM evidence_records").get().n };
  }
  function exportArchive(destination) {
    const target = path.resolve(destination); fs.mkdirSync(target, { recursive: true });
    const records = db.prepare("SELECT * FROM evidence_records").all().map((row) => ({ row, rawBase64: assertSegment(row).toString("base64") }));
    const snapshot = { format: "durable-evidence-archive/v1", records, obligations: db.prepare("SELECT * FROM obligations").all(), leases: db.prepare("SELECT * FROM leases").all(), outbox: db.prepare("SELECT * FROM outbox").all(), orphanSegments: db.prepare("SELECT * FROM orphan_segments").all() };
    fs.writeFileSync(path.join(target, "archive-export.json"), JSON.stringify(snapshot));
    return path.join(target, "archive-export.json");
  }
  function rebuildIndex() {
    if (db.prepare("SELECT COUNT(*) n FROM evidence_records").get().n) throw new Error("REBUILD_TARGET_NOT_EMPTY");
    const manifests = fs.readdirSync(manifestDir).filter((name) => name.endsWith(".json"));
    for (const name of manifests) {
      const manifest = JSON.parse(fs.readFileSync(path.join(manifestDir, name), "utf8"));
      if (manifest.format !== "durable-evidence-manifest/v1") throw new Error(`INVALID_MANIFEST:${name}`);
      const raw = zlib.gunzipSync(fs.readFileSync(path.join(segmentDir, `${manifest.contentHash}.gz`)));
      if (hash(raw) !== manifest.contentHash) throw new Error(`ARCHIVE_SEGMENT_CORRUPT:${manifest.contentHash}.gz`);
      admitPrediction({ recordId: manifest.recordId, rawBytes: raw, cohortMetadata: manifest.cohortMetadata, missingness: manifest.missingness, immutableContract: manifest.immutableContract, frozenObligations: manifest.frozenObligations });
    }
    return audit();
  }
  function importArchive(source) {
    const snapshot = JSON.parse(fs.readFileSync(source, "utf8"));
    if (snapshot.format !== "durable-evidence-archive/v1") throw new Error("UNSUPPORTED_ARCHIVE_EXPORT");
    if (db.prepare("SELECT COUNT(*) n FROM evidence_records").get().n) throw new Error("RESTORE_TARGET_NOT_EMPTY");
    db.transaction(() => {
      for (const item of snapshot.records) {
        const raw = Buffer.from(item.rawBase64, "base64"); const row = item.row;
        if (hash(raw) !== row.content_hash) throw new Error(`INVALID_EXPORT_HASH:${row.record_id}`);
        writeExclusiveAndSync(path.join(segmentDir, row.segment_name), zlib.gzipSync(raw, { mtime: 0 }));
        const compressed = fs.readFileSync(path.join(segmentDir, row.segment_name));
        if (hash(compressed) !== row.compressed_hash) throw new Error(`INVALID_EXPORT_SEGMENT:${row.record_id}`);
        const frozenObligations = snapshot.obligations.filter((obligation) => obligation.record_id === row.record_id).map((obligation) => parse(obligation.frozen_json));
        writeExclusiveAndSync(path.join(manifestDir, `${row.content_hash}.json`), Buffer.from(JSON.stringify({ format: "durable-evidence-manifest/v1", recordId: row.record_id, contentHash: row.content_hash, compressedHash: row.compressed_hash, rawSize: row.raw_size, cohortMetadata: parse(row.cohort_json), missingness: parse(row.missingness_json), immutableContract: parse(row.immutable_json), frozenObligations })));
        db.prepare("INSERT INTO evidence_records VALUES (@record_id,@content_hash,@segment_name,@compressed_hash,@raw_size,@cohort_json,@missingness_json,@immutable_json,@admitted_at)").run(row);
      }
      for (const row of snapshot.obligations) db.prepare("INSERT INTO obligations VALUES (@obligation_id,@record_id,@frozen_json,@due_at,@state,@task_id,@created_at,@completed_at)").run(row);
      for (const row of snapshot.leases) db.prepare("INSERT INTO leases VALUES (@obligation_id,@owner,@lease_until,@version)").run(row);
      for (const row of snapshot.outbox) db.prepare("INSERT INTO outbox VALUES (@outbox_id,@record_id,@content_hash,@kind,@payload_json,@state,@receipt_json,@created_at)").run(row);
      for (const row of snapshot.orphanSegments) markOrphan.run(row);
    })();
    return audit();
  }
  async function backup(destination) { await db.backup(path.resolve(destination)); return path.resolve(destination); }
  function close() { db.close(); }
  return { root, dbPath, admitPrediction, readEvidence, leaseDue, transitionTask, dueDenominators, acknowledgeOutbox, audit, exportArchive, importArchive, rebuildIndex, backup, close };
}

export function restoreDurableEvidenceArchive({ source, root }) {
  const store = openDurableEvidenceArchive({ root });
  store.importArchive(source);
  return store;
}
