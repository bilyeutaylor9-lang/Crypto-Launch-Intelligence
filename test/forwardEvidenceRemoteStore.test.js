import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  __forwardEvidenceRemoteHooks,
  loadLocalForwardEvidence,
  mergeForwardEvidenceRows,
  reconcileForwardEvidenceRows,
  verifyForwardEvidence,
} from "../src/production/forwardEvidenceRemoteStore.js";

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "forward-evidence-test-"));
}

function remoteRow(ledgerName, record) {
  const contentHash = __forwardEvidenceRemoteHooks.hashRecord(record);
  return {
    ledger_name: ledgerName,
    record_id: __forwardEvidenceRemoteHooks.recordId(record, contentHash),
    content_hash: contentHash,
    record_json: record,
    observed_at: record.observedAt || record.decisionAt,
  };
}

test("remote forward evidence restores missing immutable rows without duplicating local rows", () => {
  const root = tempRoot();
  try {
    const file = path.join(root, "data", "production-market-observations.jsonl");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const first = { observationKey: "a", observedAt: "2026-08-26T00:00:00.000Z", priceUsd: 1 };
    const second = { observationKey: "b", observedAt: "2026-08-26T01:00:00.000Z", priceUsd: 2 };
    fs.writeFileSync(file, `${JSON.stringify(first)}\n`);
    const result = mergeForwardEvidenceRows([
      remoteRow("production-market-observations", first),
      remoteRow("production-market-observations", second),
    ], { root });
    assert.equal(result.restored, 1);
    assert.deepEqual(loadLocalForwardEvidence({ root }).map((row) => row.record_id), ["a", "b"]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("remote forward evidence rejects a changed record under an existing immutable ID", () => {
  const root = tempRoot();
  try {
    const file = path.join(root, "data", "prospective-edge-cohorts.jsonl");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify({ episodeId: "episode-1", decisionAt: "2026-08-26T00:00:00.000Z", role: "TREATMENT" })}\n`);
    assert.throws(
      () => mergeForwardEvidenceRows([
        remoteRow("prospective-edge-cohorts", { episodeId: "episode-1", decisionAt: "2026-08-26T00:00:00.000Z", role: "CONTROL_MATCHED" }),
      ], { root }),
      /Immutable forward-evidence conflict/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("forward evidence loader fails closed on malformed JSONL", () => {
  const root = tempRoot();
  try {
    const file = path.join(root, "data", "market-context-observations.jsonl");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, "not-json\n");
    assert.throws(() => loadLocalForwardEvidence({ root }), /invalid forward-evidence JSONL/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("remote forward evidence verification proves exact append-only persistence", async () => {
  const root = tempRoot();
  try {
    const file = path.join(root, "data", "production-market-observations.jsonl");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const record = { observationKey: "observation-1", observedAt: "2026-08-27T00:00:00.000Z", priceUsd: 1 };
    fs.writeFileSync(file, `${JSON.stringify(record)}\n`);
    const rows = [remoteRow("production-market-observations", record)];
    const backend = {
      client: {
        from: () => ({
          select: () => ({
            order: () => ({
              range: async () => ({ data: rows, error: null }),
            }),
          }),
        }),
      },
    };
    const report = await verifyForwardEvidence({ root, backend });
    assert.equal(report.state, "REMOTE_FORWARD_EVIDENCE_VERIFIED");
    assert.equal(report.verified, true);
    assert.equal(report.appendOnlyIntegrityPass, true);
    assert.equal(report.missingRemoteRecordCount, 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("remote forward evidence verification fails closed when a local row was not persisted", async () => {
  const root = tempRoot();
  try {
    const file = path.join(root, "data", "production-market-observations.jsonl");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const record = { observationKey: "observation-1", observedAt: "2026-08-27T00:00:00.000Z", priceUsd: 1 };
    fs.writeFileSync(file, `${JSON.stringify(record)}\n`);
    const backend = {
      client: {
        from: () => ({
          select: () => ({
            order: () => ({
              range: async () => ({ data: [], error: null }),
            }),
          }),
        }),
      },
    };
    const report = await verifyForwardEvidence({ root, backend });
    assert.equal(report.state, "REMOTE_FORWARD_EVIDENCE_VERIFICATION_FAILED");
    assert.equal(report.verified, false);
    assert.equal(report.missingRemoteRecordCount, 1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("forward evidence reconciliation exposes physical duplicate rows instead of hiding a count mismatch", () => {
  const record = { observationKey: "duplicate", observedAt: "2026-08-27T00:00:00.000Z", priceUsd: 1 };
  const row = remoteRow("production-market-observations", record);
  const reconciliation = reconcileForwardEvidenceRows([row, row], [row]);

  assert.equal(reconciliation.state, "FORWARD_EVIDENCE_RECONCILIATION_REQUIRED");
  assert.equal(reconciliation.reconciled, false);
  assert.equal(reconciliation.localPhysicalRecords, 2);
  assert.equal(reconciliation.localUniqueRecords, 1);
  assert.equal(reconciliation.remoteUniqueRecords, 1);
  assert.equal(reconciliation.localDuplicateRecordCount, 1);
  assert.equal(reconciliation.localOnlyRecordCount, 0);
  assert.equal(reconciliation.remoteOnlyRecordCount, 0);
});
