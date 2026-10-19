import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import crypto from "node:crypto";
import Database from "better-sqlite3";
import zlib from "node:zlib";
import { openDurableEvidenceArchive, restoreDurableEvidenceArchive } from "../src/archive/durableEvidenceArchive.js";

function fixture(t, extra = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "archive-integrity-"));
  const store = openDurableEvidenceArchive({ root, ...extra });
  t.after(() => { store.close(); fs.rmSync(root, { recursive: true, force: true }); });
  return { root, store };
}

function prediction() {
  return {
    recordId: "episode:SoLAnA:CaseSensitive",
    rawBytes: Buffer.from("{original malformed bytes\n"),
    immutableContract: { episodeId: "episode:SoLAnA:CaseSensitive", tokenAddress: "CaseSensitive", outcomeHorizonsHours: [6] },
    cohortMetadata: { cohortId: "cohort-1", role: "CONTROL_MATCHED" },
    missingness: { observedAt: null },
    frozenObligations: [{ obligationId: "episode:SoLAnA:CaseSensitive:6", dueAt: "2026-01-01T06:00:00.000Z", expiresAt: "2026-01-01T07:00:00.000Z", horizonHours: 6 }],
  };
}

test("duplicate raw bytes cannot silently replace the frozen contract or obligations", (t) => {
  const { store } = fixture(t); store.admitPrediction(prediction());
  const changedContract = prediction(); changedContract.immutableContract.tokenAddress = "casesensitive";
  assert.throws(() => store.admitPrediction(changedContract), /IMMUTABLE.*CONFLICT/);
  const changedHorizon = prediction(); changedHorizon.frozenObligations[0].horizonHours = 24;
  assert.throws(() => store.admitPrediction(changedHorizon), /IMMUTABLE.*CONFLICT/);
});

test("tampering with manifest cohort or obligations fails the final archive audit", (t) => {
  const { root, store } = fixture(t); const admitted = store.admitPrediction(prediction());
  const file = path.join(root, "manifests", admitted.manifestName);
  const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
  manifest.cohortMetadata.role = "TREATMENT";
  manifest.frozenObligations[0].dueAt = "2026-02-01T06:00:00.000Z";
  fs.writeFileSync(file, JSON.stringify(manifest));
  assert.equal(store.audit().ok, false);
  assert.throws(() => store.readEvidence(admitted.recordId), /MANIFEST.*CORRUPT/);
});

test("a duplicate admission cannot hide a missing original segment", (t) => {
  const { root, store } = fixture(t); const admitted = store.admitPrediction(prediction());
  fs.unlinkSync(path.join(root, "segments", `${admitted.contentHash}.gz`));
  assert.throws(() => store.admitPrediction(prediction()), /SEGMENT_MISSING/);
});

test("stale work cannot complete a replacement lease owned by the same worker", (t) => {
  const { store } = fixture(t); store.admitPrediction(prediction());
  const [first] = store.leaseDue({ owner: "worker-1", nowAt: "2026-01-01T06:01:00.000Z", leaseMs: 1000 });
  const [replacement] = store.leaseDue({ owner: "worker-1", nowAt: "2026-01-01T06:02:00.000Z" });
  assert.ok(first.leaseToken); assert.notEqual(replacement.leaseToken, first.leaseToken);
  assert.equal(store.transitionTask({ obligationId: first.obligationId, owner: "worker-1", leaseToken: first.leaseToken, state: "completed", nowAt: "2026-01-01T06:02:01.000Z" }), false);
  assert.equal(store.transitionTask({ obligationId: replacement.obligationId, owner: "worker-1", leaseToken: replacement.leaseToken, state: "retryable", nowAt: "2026-01-01T06:02:01.000Z" }), true);
});

test("late collection remains expired and in the due denominator", (t) => {
  const { store } = fixture(t); store.admitPrediction(prediction());
  const tasks = store.leaseDue({ owner: "worker-1", nowAt: "2026-01-01T08:00:00.000Z" });
  assert.equal(tasks.length, 0);
  assert.deepEqual(store.dueDenominators("2026-01-01T08:00:00.000Z"), [{ state: "expired", count: 1 }]);
});

test("an observation arriving after the frozen window cannot complete an active lease", (t) => {
  const { store } = fixture(t); store.admitPrediction(prediction());
  const [task] = store.leaseDue({ owner: "worker-1", nowAt: "2026-01-01T06:59:59.000Z", leaseMs: 120000 });
  assert.equal(store.transitionTask({ obligationId: task.obligationId, owner: "worker-1", leaseToken: task.leaseToken, state: "completed", nowAt: "2026-01-01T07:00:01.000Z" }), false);
  assert.deepEqual(store.dueDenominators("2026-01-01T07:00:01.000Z"), [{ state: "expired", count: 1 }]);
});

test("portable recovery retains the original bytes of unindexed interrupted admissions", (t) => {
  const { root, store } = fixture(t, { fault: "after-segment" });
  assert.throws(() => store.admitPrediction(prediction()), /FAULT_AFTER_SEGMENT/);
  const segments = fs.readdirSync(path.join(root, "segments"));
  const exported = store.exportArchive(path.join(root, "export"));
  const target = fs.mkdtempSync(path.join(os.tmpdir(), "archive-orphan-restore-"));
  t.after(() => fs.rmSync(target, { recursive: true, force: true }));
  const restored = restoreDurableEvidenceArchive({ source: exported, root: target });
  try {
    assert.deepEqual(fs.readdirSync(path.join(target, "segments")), segments);
    assert.deepEqual(fs.readFileSync(path.join(target, "segments", segments[0])), fs.readFileSync(path.join(root, "segments", segments[0])));
    assert.equal(restored.audit().detectedOrphans.length, 1);
    assert.equal(restored.readEvidence(prediction().recordId), null);
  } finally { restored.close(); }
});

test("restore cannot overwrite pre-existing raw archive files", (t) => {
  const { root, store } = fixture(t); const admitted = store.admitPrediction(prediction());
  const exported = store.exportArchive(path.join(root, "export"));
  const target = fs.mkdtempSync(path.join(os.tmpdir(), "archive-nonempty-"));
  t.after(() => fs.rmSync(target, { recursive: true, force: true }));
  fs.mkdirSync(path.join(target, "segments"));
  const existing = path.join(target, "segments", `${admitted.contentHash}.gz`);
  fs.writeFileSync(existing, "original quarantined bytes");
  assert.throws(() => restoreDurableEvidenceArchive({ source: exported, root: target }), /RESTORE_TARGET_NOT_EMPTY/);
  assert.equal(fs.readFileSync(existing, "utf8"), "original quarantined bytes");
});

test("distinct episodes can share unchanged provider bytes and horizon labels", (t) => {
  const { root, store } = fixture(t);
  const first = prediction(); first.frozenObligations[0].obligationId = "six-hour";
  const a = store.admitPrediction(first);
  const second = prediction(); second.recordId = "episode:second";
  second.immutableContract.episodeId = second.recordId;
  second.frozenObligations[0].obligationId = "six-hour";
  const b = store.admitPrediction(second);
  assert.equal(a.contentHash, b.contentHash); assert.notEqual(a.manifestName, b.manifestName);
  assert.equal(fs.readdirSync(path.join(root, "segments")).length, 1);
  assert.equal(store.leaseDue({ owner: "worker", nowAt: "2026-01-01T06:01:00.000Z", limit: 2 }).length, 2);
  assert.equal(store.audit().ok, true);
});

test("existing valid compressed bytes are reused rather than recompressed or overwritten", (t) => {
  const { root, store } = fixture(t); const input = prediction();
  const hash = crypto.createHash("sha256").update(input.rawBytes).digest("hex");
  const original = zlib.gzipSync(input.rawBytes, { level: 0 });
  const file = path.join(root, "segments", `${hash}.gz`); fs.writeFileSync(file, original);
  store.admitPrediction(input);
  assert.deepEqual(fs.readFileSync(file), original); assert.equal(store.audit().ok, true);
});

test("unsupported or missing declared horizons fail before admission", (t) => {
  const { root, store } = fixture(t);
  const input = prediction(); input.immutableContract.outcomeHorizonsHours = [6, 72];
  assert.throws(() => store.admitPrediction(input), /HORIZON_CONFLICT/);
  assert.equal(store.audit().records, 0); assert.equal(fs.readdirSync(path.join(root, "segments")).length, 0);
});

test("outbox HTTP success alone cannot acknowledge an immutable record", (t) => {
  const { store } = fixture(t); store.admitPrediction(prediction());
  const [row] = store.listOutbox();
  const fields = { outboxId: row.outbox_id, recordId: row.record_id, contentHash: row.content_hash, manifestHash: row.manifest_hash };
  assert.equal(store.acknowledgeOutbox({ ...fields, receipt: { status: 200 } }), false);
  assert.equal(store.acknowledgeOutbox({ ...fields, readBack: { recordId: row.record_id, contentHash: "0".repeat(64), manifestHash: row.manifest_hash } }), false);
  assert.equal(store.acknowledgeOutbox({ ...fields, readBack: { recordId: row.record_id, contentHash: row.content_hash, manifestHash: row.manifest_hash } }), true);
  assert.equal(store.listOutbox()[0].state, "acknowledged");
});

test("due denominator includes work omitted by selection caps and survives restart", (t) => {
  const { root, store } = fixture(t); const input = prediction();
  input.immutableContract.outcomeHorizonsHours = [1, 6];
  input.frozenObligations.unshift({ obligationId: "hour-1", horizonHours: 1, dueAt: "2026-01-01T01:00:00.000Z", expiresAt: "2026-01-01T07:00:00.000Z" });
  store.admitPrediction(input);
  assert.equal(store.leaseDue({ owner: "w", nowAt: "2026-01-01T06:01:00.000Z", limit: 1 }).length, 1);
  assert.deepEqual(store.dueDenominators("2026-01-01T06:01:00.000Z"), [{ state: "leased", count: 1 }, { state: "pending", count: 1 }]);
  store.close(); const reopened = openDurableEvidenceArchive({ root });
  try { assert.equal(reopened.dueDenominators("2026-01-01T06:01:00.000Z").reduce((sum, row) => sum + row.count, 0), 2); } finally { reopened.close(); }
});

test("ambiguous local dates cannot silently hide overdue obligations", (t) => {
  const { store } = fixture(t); const input = prediction(); input.frozenObligations[0].dueAt = "2026-1-2";
  assert.throws(() => store.admitPrediction(input), /explicit timezone/);
});

function editExport(file, edit) {
  const snapshot = JSON.parse(fs.readFileSync(file, "utf8")); edit(snapshot);
  const bytes = Buffer.from(JSON.stringify(snapshot)); fs.writeFileSync(file, bytes);
  fs.writeFileSync(`${file}.sha256`, crypto.createHash("sha256").update(bytes).digest("hex"));
}

test("malicious export paths fail before any file escapes the restore root", (t) => {
  const { root, store } = fixture(t); store.admitPrediction(prediction());
  const file = store.exportArchive(path.join(root, "export"));
  editExport(file, (snapshot) => { snapshot.tables.evidence_records[0].segment_name = "../../escaped.gz"; });
  assert.throws(() => restoreDurableEvidenceArchive({ source: file, root: path.join(root, "restored") }), /EXPORT_RECORD_INVALID/);
  assert.equal(fs.existsSync(path.join(root, "escaped.gz")), false);
});

test("deleted archive segments make empty-directory restore fail visibly", (t) => {
  const { root, store } = fixture(t); const admitted = store.admitPrediction(prediction());
  const file = store.exportArchive(path.join(root, "export"));
  fs.unlinkSync(path.join(root, "export", "segments", `${admitted.contentHash}.gz`));
  assert.throws(() => restoreDurableEvidenceArchive({ source: file, root: path.join(root, "restored") }), /ENOENT/);
});

test("restore rejects inconsistent mutable state and rolls back its SQL admission", (t) => {
  const { root, store } = fixture(t); store.admitPrediction(prediction());
  store.leaseDue({ owner: "w", nowAt: "2026-01-01T06:01:00.000Z" });
  const file = store.exportArchive(path.join(root, "export"));
  editExport(file, (snapshot) => { snapshot.tables.leases = []; });
  const target = path.join(root, "restored");
  assert.throws(() => restoreDurableEvidenceArchive({ source: file, root: target }), /LEASE_STATE_INCONSISTENT/);
  const db = new Database(path.join(target, "archive.sqlite"));
  try { assert.equal(db.prepare("SELECT COUNT(*) AS n FROM evidence_records").get().n, 0); } finally { db.close(); }
});

test("queue scheduling columns cannot diverge from the immutable contract", (t) => {
  const { store } = fixture(t); store.admitPrediction(prediction());
  const db = new Database(store.dbPath);
  try { db.prepare("UPDATE obligations SET due_at=?").run("2027-01-01T06:00:00.000Z"); } finally { db.close(); }
  assert.equal(store.audit().ok, false);
  assert.ok(store.audit().errors.includes("ARCHIVE_TASK_CONTRACT_CORRUPT"));
});

test("outbox hashes remain bound to the archived immutable manifest", (t) => {
  const { store } = fixture(t); store.admitPrediction(prediction());
  const db = new Database(store.dbPath);
  try { db.prepare("UPDATE outbox SET manifest_hash=?").run("0".repeat(64)); } finally { db.close(); }
  assert.equal(store.audit().ok, false);
});

test("missing previously recorded orphan evidence cannot yield a healthy audit", (t) => {
  const { root, store } = fixture(t, { fault: "inside-transaction" });
  assert.throws(() => store.admitPrediction(prediction()), /FAULT_INSIDE_TRANSACTION/);
  for (const name of fs.readdirSync(path.join(root, "segments"))) fs.unlinkSync(path.join(root, "segments", name));
  assert.equal(store.audit().ok, false); assert.equal(store.audit().integrityOk, false);
});

test("portable SQL snapshot is consistent when another writer releases a lease mid-export", (t) => {
  const { root, store } = fixture(t); store.admitPrediction(prediction());
  store.leaseDue({ owner: "w", nowAt: "2026-01-01T06:01:00.000Z" });
  const writer = new Database(store.dbPath); t.after(() => writer.close());
  const original = Database.prototype.prepare; let changed = false;
  t.mock.method(Database.prototype, "prepare", function(sql) {
    const statement = original.call(this, sql);
    if (this !== writer && sql === "SELECT * FROM obligations") {
      const all = statement.all.bind(statement);
      statement.all = (...args) => {
        const rows = all(...args);
        if (!changed) {
          changed = true;
          writer.transaction(() => { original.call(writer, "UPDATE obligations SET state='retryable'").run(); original.call(writer, "DELETE FROM leases").run(); })();
        }
        return rows;
      };
    }
    return statement;
  });
  const file = store.exportArchive(path.join(root, "export"));
  const snapshot = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.equal(changed, true);
  assert.equal(snapshot.tables.obligations[0].state, "leased");
  assert.equal(snapshot.tables.leases.length, 1);
  assert.equal(store.dueDenominators("2026-01-01T06:01:01.000Z")[0].state, "retryable");
});

test("a worker cannot silently complete or expire an obligation without its evidence", (t) => {
  const { store } = fixture(t); store.admitPrediction(prediction());
  const [task] = store.leaseDue({ owner: "worker", nowAt: "2026-01-01T06:01:00.000Z" });
  const transition = { obligationId: task.obligationId, owner: "worker", leaseToken: task.leaseToken, nowAt: "2026-01-01T06:01:01.000Z" };
  assert.equal(store.transitionTask({ ...transition, state: "completed" }), false);
  assert.equal(store.transitionTask({ ...transition, state: "expired" }), false);
  assert.deepEqual(store.dueDenominators(transition.nowAt), [{ state: "leased", count: 1 }]);
});

test("atomic completion retains exact observation bytes and rejects unknown timestamps", (t) => {
  const { store } = fixture(t); const parent = store.admitPrediction(prediction());
  const [task] = store.leaseDue({ owner: "worker", nowAt: "2026-01-01T06:01:00.000Z" });
  const evidence = { recordId: "observation:exact", rawBytes: Buffer.from("provider response original bytes"), frozenObligations: [],
    immutableContract: { tokenAddress: "CaseSensitive", observationOf: { recordId: parent.recordId, taskId: task.taskId, horizonHours: 6,
      requestedAt: "2026-01-01T06:01:00.000Z", receivedAt: "2026-01-01T06:01:01.000Z", marketObservedAt: null } } };
  const request = { obligationId: task.obligationId, owner: "worker", leaseToken: task.leaseToken, nowAt: "2026-01-01T06:01:01.000Z", evidence };
  assert.throws(() => store.completeWithEvidence(request), /OBSERVATION_CONTRACT_MISMATCH/);
  assert.equal(store.readEvidence(evidence.recordId), null);
  evidence.immutableContract.observationOf.marketObservedAt = "2026-01-01T06:01:00.000Z";
  // Failed admission bytes remain immutable: a corrected contract needs a new ID.
  evidence.recordId = "observation:with-source-time";
  assert.equal(store.completeWithEvidence(request), true);
  assert.deepEqual(store.readEvidence(evidence.recordId).rawBytes, evidence.rawBytes);
  assert.deepEqual(store.dueDenominators(request.nowAt), [{ state: "completed", count: 1 }]);
});
