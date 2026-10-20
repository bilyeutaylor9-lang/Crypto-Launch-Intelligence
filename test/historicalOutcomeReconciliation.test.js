import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import test from "node:test";
import { openDurableEvidenceArchive, restoreDurableEvidenceArchive } from "../src/archive/durableEvidenceArchive.js";
import { buildExactMarketObservation, exactMarketObservationIntegrityHash } from "../src/production/exactMarketObservationLedger.js";

const token = "0x" + "1".repeat(40), pool = "0x" + "a".repeat(40);
const now = "2026-01-02T00:00:00.000Z";
function fixture(t, expectedPool = pool) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "historical-outcome-"));
  const archive = openDurableEvidenceArchive({ root, clock: () => now });
  const parent = archive.admitPrediction({ recordId: "frozen-episode", rawBytes: Buffer.from("original frozen episode bytes"),
    immutableContract: { chain: "base", tokenAddress: token, poolAddress: expectedPool, outcomeHorizonsHours: [6] },
    frozenObligations: [{ obligationId: "six-hour", horizonHours: 6, dueAt: "2026-01-01T06:00:00.000Z", expiresAt: "2026-01-01T07:00:00.000Z" }] });
  archive.claimWriter({ owner: "reconciliation" });
  t.after(() => { archive.close(); fs.rmSync(root, { recursive: true, force: true }); });
  return { root, archive, taskId: parent.taskIds[0] };
}
function observation(overrides = {}) {
  return buildExactMarketObservation({ chain: "base", tokenAddress: token, poolAddress: pool, priceUsd: 1.25,
    observedAt: "2026-01-01T06:05:00.000Z", ...overrides }, { asOf: now });
}
function admit(archive, row, recordId = "original-observation") {
  const rawBytes = Buffer.from(" " + JSON.stringify(row) + "\r\n");
  archive.admitPrediction({ recordId, rawBytes, frozenObligations: [], immutableContract: {
    kind: "EXACT_MARKET_OBSERVATION_V2_RECORD", observationIntegrityHash: row.observationIntegrityHash, firstSeenAt: now } });
  return { recordId, rawBytes };
}

test("late recovery of a genuine on-time snapshot is distinct from backdated completion", t => {
  const { archive, taskId } = fixture(t), row = observation();
  const original = admit(archive, row);
  assert.deepEqual(archive.dueDenominators(), [{ state: "expired", count: 1 }]);
  const result = archive.reconcileHistoricalObservation({ taskId, evidenceRecordId: original.recordId });
  assert.equal(result.status, "reconciled"); assert.equal(result.observedAt, row.observedAt); assert.equal(result.reconciledAt, now);
  assert.equal(archive.listTasks()[0].completed_at, null);
  assert.deepEqual(archive.dueDenominators(), [{ state: "reconciled", count: 1 }]);
  assert.deepEqual(archive.dueDenominators("2026-01-01T06:30:00.000Z"), [{ state: "pending", count: 1 }]);
  assert.deepEqual(archive.leaseDue({ owner: "reconciliation" }), []);
  assert.deepEqual(archive.readEvidence(original.recordId).rawBytes, original.rawBytes);
  assert.equal(JSON.parse(original.rawBytes).receiptObservedAt, null);
  assert.equal(archive.audit().ok, true);
});

for (const scenario of ["late", "late-receipt", "stale-source", "foreign-pool", "missing-pool", "bad-hash", "future-source"]) {
  test("historical reconciliation rejects " + scenario + " without changing missingness", t => {
    const { archive, taskId } = fixture(t);
    let row = observation();
    if (scenario === "late") row = observation({ observedAt: "2026-01-01T07:00:00.001Z" });
    if (scenario === "late-receipt") row = observation({ receiptObservedAt: "2026-01-01T08:00:00.000Z" });
    if (scenario === "stale-source") row = observation({ sourceObservedAt: "2026-01-01T05:00:00.000Z" });
    if (scenario === "foreign-pool") row = observation({ poolAddress: "0x" + "b".repeat(40) });
    if (scenario === "missing-pool") row = observation({ poolAddress: null });
    if (scenario === "bad-hash") row.priceUsd = 9;
    if (scenario === "future-source") { row.sourceObservedAt = "2026-01-01T06:06:00.000Z"; row.observationIntegrityHash = exactMarketObservationIntegrityHash(row); }
    const original = admit(archive, row);
    assert.throws(() => archive.reconcileHistoricalObservation({ taskId, evidenceRecordId: original.recordId }), /HISTORICAL_OBSERVATION/);
    assert.deepEqual(archive.dueDenominators(), [{ state: "expired", count: 1 }]);
    assert.deepEqual(archive.readEvidence(original.recordId).rawBytes, original.rawBytes);
  });
}

test("an unfrozen pool does not impose an invented null-pool requirement", t => {
  const { archive, taskId } = fixture(t, null);
  const original = admit(archive, observation());
  assert.equal(archive.reconcileHistoricalObservation({ taskId, evidenceRecordId: original.recordId }).status, "reconciled");
  assert.equal(archive.audit().ok, true);
});

test("portable restoration preserves the original snapshot and actual reconciliation time", t => {
  const { root, archive, taskId } = fixture(t); const original = admit(archive, observation());
  archive.reconcileHistoricalObservation({ taskId, evidenceRecordId: original.recordId });
  const source = archive.exportArchive(path.join(root, "portable"));
  const restored = restoreDurableEvidenceArchive({ source, root: path.join(root, "restore") });
  try {
    assert.equal(restored.audit().ok, true);
    assert.deepEqual(restored.dueDenominators(now), [{ state: "reconciled", count: 1 }]);
    assert.deepEqual(restored.readEvidence(original.recordId).rawBytes, original.rawBytes);
    const db = new Database(restored.dbPath, { readonly: true });
    try { assert.equal(db.prepare("SELECT reconciled_at FROM historical_reconciliations").get().reconciled_at, now); } finally { db.close(); }
  } finally { restored.close(); }
});

test("tampering with a reconciliation receipt fails the final archive audit", t => {
  const { archive, taskId } = fixture(t); const original = admit(archive, observation());
  archive.reconcileHistoricalObservation({ taskId, evidenceRecordId: original.recordId });
  const db = new Database(archive.dbPath);
  try { db.prepare("UPDATE historical_reconciliations SET observation_hash=?").run("0".repeat(64)); } finally { db.close(); }
  assert.ok(archive.audit().errors.some(value => value.includes("ARCHIVE_HISTORICAL_RECONCILIATION_INVALID")));
});
