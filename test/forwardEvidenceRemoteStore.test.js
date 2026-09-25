import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  __forwardEvidenceRemoteHooks,
  loadLocalForwardEvidence,
  mergeForwardEvidenceRows,
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

test("remote reads page each ledger through the indexed ledger key", async () => {
  const calls = [];
  const client = {
    from(table) {
      assert.equal(table, "forward_evidence_records");
      const query = {
        select(fields) {
          assert.match(fields, /ledger_name/);
          return query;
        },
        eq(column, value) {
          calls.push({ column, value });
          return query;
        },
        order(column, options) {
          assert.equal(column, "created_at");
          assert.deepEqual(options, { ascending: true });
          return query;
        },
        async range(start, end) {
          assert.equal(end - start + 1, 2);
          return { data: [], error: null };
        },
      };
      return query;
    },
  };

  const rows = await __forwardEvidenceRemoteHooks.fetchRemoteRows(client, 2);
  assert.deepEqual(rows, []);
  assert.deepEqual(calls.map((call) => call.value), Object.keys({
    "production-market-observations": true,
    "market-context-observations": true,
    "prospective-edge-cohorts": true,
  }));
});
