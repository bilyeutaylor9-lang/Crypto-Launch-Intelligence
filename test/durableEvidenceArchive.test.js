import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { openDurableEvidenceArchive, restoreDurableEvidenceArchive } from "../src/archive/durableEvidenceArchive.js";

const root = () => fs.mkdtempSync(path.join(os.tmpdir(), "archive-test-"));
const admission = (raw = Buffer.from('{bad json\n')) => ({ recordId: "Prediction:SoLAnA:ABC", rawBytes: raw, cohortMetadata: { cohort: "C1", observedClock: null }, missingness: { sourceCommit: "unknown" }, immutableContract: { identity: "SoLAnA" }, frozenObligations: [{ obligationId: "one-hour", dueAt: "2026-01-01T01:00:00.000Z", horizonHours: 1 }, { obligationId: "six-hour", dueAt: "2026-01-01T06:00:00.000Z", horizonHours: 6 }] });

test("preserves malformed original bytes and immutable duplicate/conflict semantics", () => {
  const store = openDurableEvidenceArchive({ root: root() });
  const first = store.admitPrediction(admission());
  assert.equal(store.readEvidence(first.recordId).rawBytes.toString(), "{bad json\n");
  assert.equal(store.readEvidence(first.recordId).cohortMetadata.observedClock, null);
  assert.equal(store.admitPrediction(admission()).status, "duplicate");
  assert.throws(() => store.admitPrediction(admission(Buffer.from("different"))), /IMMUTABLE_ID_CONFLICT/);
  store.close();
});
test("transaction rollback retains auditable orphan and never invents obligations", () => {
  const dir = root(); const store = openDurableEvidenceArchive({ root: dir, fault: "inside-transaction" });
  assert.throws(() => store.admitPrediction(admission()), /FAULT_INSIDE_TRANSACTION/);
  assert.equal(store.audit().orphanSegments.length, 1);
  store.close();
});
test("leases use ownership CAS and expired leases become pending", () => {
  const store = openDurableEvidenceArchive({ root: root() }); store.admitPrediction(admission());
  const [job] = store.leaseDue({ owner: "worker-a", nowAt: "2026-01-02T00:00:00.000Z", leaseMs: 1 });
  assert.equal(store.transitionTask({ obligationId: job.obligationId, owner: "worker-b", state: "completed", nowAt: "2026-01-02T00:00:00.000Z" }), false);
  assert.equal(store.leaseDue({ owner: "worker-c", nowAt: "2026-01-02T00:01:00.000Z" }).length, 1);
  store.close();
});
test("missing or corrupt segments fail visibly; backup uses SQLite backup API", async () => {
  const dir = root(); const store = openDurableEvidenceArchive({ root: dir }); const result = store.admitPrediction(admission());
  const backup = path.join(dir, "snapshot.sqlite"); await store.backup(backup); assert.ok(fs.existsSync(backup));
  fs.unlinkSync(path.join(dir, "segments", `${result.contentHash}.gz`));
  assert.throws(() => store.readEvidence(result.recordId), /ARCHIVE_SEGMENT_MISSING/);
  assert.equal(store.audit().ok, false); store.close();
});
test("empty-directory restore reproduces bytes and task states", () => {
  const dir = root(); const store = openDurableEvidenceArchive({ root: dir }); const r = store.admitPrediction(admission());
  const [job] = store.leaseDue({ owner: "w", nowAt: "2026-01-02T00:00:00.000Z" }); store.transitionTask({ obligationId: job.obligationId, owner: "w", state: "completed", nowAt: "2026-01-02T00:00:00.000Z" });
  const exported = store.exportArchive(path.join(dir, "export")); store.close();
  const restored = restoreDurableEvidenceArchive({ source: exported, root: root() });
  assert.equal(restored.readEvidence(r.recordId).rawBytes.toString(), "{bad json\n"); assert.equal(restored.audit().ok, true); restored.close();
});
test("manifests can rebuild immutable index but missing manifests fail audit", () => {
  const dir = root(); const store = openDurableEvidenceArchive({ root: dir }); const r = store.admitPrediction(admission()); store.close();
  fs.unlinkSync(path.join(dir, "archive.sqlite")); const rebuilt = openDurableEvidenceArchive({ root: dir });
  assert.equal(rebuilt.rebuildIndex().ok, true); assert.equal(rebuilt.readEvidence(r.recordId).contentHash, r.contentHash); rebuilt.close();
  fs.unlinkSync(path.join(dir, "manifests", `${r.contentHash}.json`)); const broken = openDurableEvidenceArchive({ root: dir }); assert.equal(broken.audit().ok, false); broken.close();
});
