import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { openDurableEvidenceArchive } from "../src/archive/durableEvidenceArchive.js";
import { projectFrozenOutcomeObservations } from "../src/archive/frozenOutcomeProjection.js";
import { buildExactMarketObservation } from "../src/production/exactMarketObservationLedger.js";

const now = "2026-01-01T06:00:00.000Z";
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "outcome-projection-"));
  const archive = openDurableEvidenceArchive({ root: path.join(root, "archive"), clock: () => now });
  archive.claimWriter({ owner: "projection" });
  t.after(() => { archive.close(); fs.rmSync(root, { recursive: true, force: true }); });
  return { archive, file: path.join(root, "observations.jsonl"), clock: () => now };
}
function row(n) {
  return buildExactMarketObservation({ chain: "base", tokenAddress: "0x" + String(n).repeat(40), poolAddress: "0x" + "a".repeat(40),
    priceUsd: n, observedAt: now, receiptObservedAt: now }, { asOf: now });
}
function capture(f, observation, id = "captured") {
  f.archive.admitPrediction({ recordId: id, rawBytes: Buffer.from('{"original_http_bytes":true}'), frozenObligations: [],
    immutableContract: { kind: "CAPTURED_EXACT_OUTCOME_V1", exactObservation: observation } });
}

test("projection preserves every historical byte and verifies newly appended keys and hashes", t => {
  const f = fixture(t), original = Buffer.from(" " + JSON.stringify(row(1)) + "\r\n\n");
  fs.writeFileSync(f.file, original); capture(f, row(2));
  const result = projectFrozenOutcomeObservations(f);
  assert.equal(result.appended, 1); assert.equal(result.remoteAcknowledged, false);
  assert.deepEqual(fs.readFileSync(f.file).subarray(0, original.length), original);
  assert.equal(f.archive.listOutbox().some(item => item.state === "acknowledged"), false);
  const after = fs.readFileSync(f.file);
  assert.equal(projectFrozenOutcomeObservations(f).appended, 0);
  assert.deepEqual(fs.readFileSync(f.file), after); assert.equal(f.archive.audit().ok, true);
});

test("a complete append surviving an interrupted receipt does not trigger duplicate rows", t => {
  const f = fixture(t); capture(f, row(1));
  const originalAdmit = f.archive.admitPrediction;
  f.archive.admitPrediction = () => { throw new Error("SIMULATED_RECEIPT_FAILURE"); };
  assert.throws(() => projectFrozenOutcomeObservations(f), /SIMULATED_RECEIPT_FAILURE/);
  const appended = fs.readFileSync(f.file);
  f.archive.admitPrediction = originalAdmit;
  assert.equal(projectFrozenOutcomeObservations(f).appended, 0);
  assert.deepEqual(fs.readFileSync(f.file), appended);
});

test("a valid final row without newline is preserved and separated before append", t => {
  const f = fixture(t), original = Buffer.from(JSON.stringify(row(1)));
  fs.writeFileSync(f.file, original); capture(f, row(2));
  assert.equal(projectFrozenOutcomeObservations(f).appended, 1);
  assert.deepEqual(fs.readFileSync(f.file).subarray(0, original.length), original);
  assert.equal(fs.readFileSync(f.file, "utf8").split("\n").filter(Boolean).length, 2);
});

test("a partial or corrupt ledger is retained untouched and never silently repaired", t => {
  const f = fixture(t), original = Buffer.from(JSON.stringify(row(1)) + '\n{"partial":');
  fs.writeFileSync(f.file, original); capture(f, row(2));
  assert.throws(() => projectFrozenOutcomeObservations(f), /MALFORMED_PRESERVE_ORIGINAL/);
  assert.deepEqual(fs.readFileSync(f.file), original);
});

test("an existing key with different contents cannot be overwritten or acknowledged", t => {
  const f = fixture(t), originalRow = row(1), changed = { ...originalRow, priceUsd: 9 };
  const original = Buffer.from(JSON.stringify(originalRow) + "\n");
  fs.writeFileSync(f.file, original); capture(f, changed);
  assert.throws(() => projectFrozenOutcomeObservations(f), /INVALID_OBSERVATION/);
  assert.deepEqual(fs.readFileSync(f.file), original);
});
