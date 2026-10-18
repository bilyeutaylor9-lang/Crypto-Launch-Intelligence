import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";

import {
  __forwardEvidenceRemoteHooks,
  loadLocalForwardEvidence,
  mergeForwardEvidenceRows,
  restoreForwardEvidence,
  runForwardEvidenceRemoteCommand,
  syncForwardEvidence,
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
    observed_at: __forwardEvidenceRemoteHooks.observedAt(record),
  };
}

function isolatedRoot(t) {
  const root = tempRoot();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function fakeBackend(rows = [], { onRead, onWrite } = {}) {
  const reads = [];
  const writes = [];
  const client = {
    from(table) {
      assert.equal(table, "forward_evidence_records");
      const call = {};
      const query = {
        select(fields) {
          call.fields = fields;
          return query;
        },
        eq(column, value) {
          assert.equal(column, "ledger_name");
          call.ledger = value;
          return query;
        },
        gt(column, value) {
          assert.equal(column, "record_id");
          call.afterId = value;
          return query;
        },
        in(column, values) {
          assert.equal(column, "record_id");
          call.ids = values;
          return query;
        },
        order(column, options) {
          assert.equal(column, "record_id");
          assert.deepEqual(options, { ascending: true });
          return query;
        },
        async range(start, end) {
          call.range = [start, end];
          reads.push(call);
          const selected = rows
            .filter((row) => row.ledger_name === call.ledger)
            .filter((row) => call.afterId === undefined || row.record_id > call.afterId)
            .filter((row) => !call.ids || call.ids.includes(row.record_id))
            .sort((left, right) => left.record_id < right.record_id ? -1 : left.record_id > right.record_id ? 1 : 0)
            .slice(start, end + 1)
            .map((row) => Object.fromEntries(call.fields.split(",").map((field) => [field, row[field]])));
          return onRead?.(call, selected) ?? { data: selected, error: null };
        },
        async upsert(pending, options) {
          assert.deepEqual(options, { onConflict: "ledger_name,record_id", ignoreDuplicates: true });
          writes.push(pending);
          const result = onWrite?.(pending);
          if (result) return result;
          for (const row of pending) {
            if (!rows.some((remote) => remote.ledger_name === row.ledger_name && remote.record_id === row.record_id)) {
              rows.push(row);
            }
          }
          return { error: null };
        },
      };
      return query;
    },
  };
  return { client, config: { serverWriteCapable: true }, reads, writes };
}

function bodyReads(backend) {
  return backend.reads.filter((call) => call.fields.includes("record_json"));
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

test("remote reads page each ledger through its primary key without selecting bodies", async () => {
  const backend = fakeBackend();
  const rows = await __forwardEvidenceRemoteHooks.fetchRemoteRows(backend.client, 2);
  assert.deepEqual(rows, []);
  assert.deepEqual(backend.reads.map((call) => call.ledger), [
    "production-market-observations", "market-context-observations", "prospective-edge-cohorts",
  ]);
  assert.ok(backend.reads.every((call) => call.fields === "ledger_name,record_id,content_hash"));
  assert.ok(backend.reads.every((call) => call.range[0] === 0 && call.range[1] === 1));
});

test("repeated sync and restore reuse exact local bodies and preserve public counts", async (t) => {
  const root = isolatedRoot(t);
  const known = [
    remoteRow("production-market-observations", { observationKey: "shared", priceUsd: 1 }),
    remoteRow("market-context-observations", { observationKey: "shared", context: "market" }),
    remoteRow("prospective-edge-cohorts", { episodeId: "shared", role: "TREATMENT" }),
    remoteRow("production-market-observations", { priceUsd: 2 }),
  ];
  const localOnly = remoteRow("production-market-observations", { observationKey: "local-only", priceUsd: 3 });
  mergeForwardEvidenceRows([...known, localOnly], { root });
  const backend = fakeBackend([...known]);

  assert.deepEqual(await syncForwardEvidence({ root, backend, pageSize: 2 }), {
    schemaVersion: 1, state: "REMOTE_FORWARD_EVIDENCE_SYNCED",
    localRecords: 5, remoteRecordsBeforeSync: 4, uploaded: 1,
  });
  assert.deepEqual(await syncForwardEvidence({ root, backend, pageSize: 2 }), {
    schemaVersion: 1, state: "REMOTE_FORWARD_EVIDENCE_SYNCED",
    localRecords: 5, remoteRecordsBeforeSync: 5, uploaded: 0,
  });
  for (let run = 0; run < 2; run += 1) {
    assert.deepEqual(await restoreForwardEvidence({ root, backend, pageSize: 2 }), {
      schemaVersion: 1, state: "REMOTE_FORWARD_EVIDENCE_RESTORED",
      localRecords: 5, remoteRecords: 5, restored: 0,
    });
  }
  assert.equal(bodyReads(backend).length, 0);
  assert.deepEqual(backend.writes, [[localOnly]]);
});

test("a later restore still discovers missing historical and undated records", async (t) => {
  const root = isolatedRoot(t);
  const known = remoteRow("production-market-observations", {
    observationKey: "m-known", observedAt: "2026-10-17T00:00:00Z", priceUsd: 3,
  });
  mergeForwardEvidenceRows([known], { root });
  const remote = [known];
  const backend = fakeBackend(remote);
  assert.equal((await restoreForwardEvidence({ root, backend, pageSize: 2 })).restored, 0);
  const historical = remoteRow("production-market-observations", {
    observationKey: "a-historical", observedAt: "2025-01-01T00:00:00Z", priceUsd: 1,
  });
  const undated = remoteRow("production-market-observations", { observationKey: "z-undated", priceUsd: 2 });
  const otherLedger = remoteRow("market-context-observations", { observationKey: "a-historical", context: "old" });
  remote.push(historical, undated, otherLedger);

  assert.deepEqual(await restoreForwardEvidence({ root, backend, pageSize: 2 }), {
    schemaVersion: 1, state: "REMOTE_FORWARD_EVIDENCE_RESTORED",
    localRecords: 1, remoteRecords: 4, restored: 3,
  });
  assert.deepEqual(loadLocalForwardEvidence({ root }).map((row) => row.record_json), [
    known.record_json, undated.record_json, historical.record_json, otherLedger.record_json,
  ]);
  assert.deepEqual(bodyReads(backend).map((call) => call.ids), [["a-historical", "z-undated"], ["a-historical"]]);
  const bodyCount = bodyReads(backend).length;
  assert.equal((await syncForwardEvidence({ root, backend, pageSize: 2 })).uploaded, 0);
  assert.equal(bodyReads(backend).length, bodyCount);
});

test("metadata cursors and bounded body batches are safe across timestamp ties", async (t) => {
  const root = isolatedRoot(t);
  const rows = ["g", "b", "a", "f", "d", "e", "c"].map((id) => ({
    ...remoteRow("production-market-observations", { observationKey: id, observedAt: "2026-01-01T00:00:00Z" }),
    created_at: "2026-01-01T00:00:00Z",
  }));
  rows.push(remoteRow("market-context-observations", { observationKey: "a" }));
  const backend = fakeBackend(rows);
  assert.equal((await restoreForwardEvidence({ root, backend, pageSize: "2" })).restored, 8);
  assert.equal(loadLocalForwardEvidence({ root }).length, 8);
  const pages = backend.reads.filter((call) => call.ledger === "production-market-observations" && !call.ids);
  assert.deepEqual(pages.map((call) => call.afterId), [undefined, "b", "d", "f", "g"]);
  assert.deepEqual(bodyReads(backend).map((call) => call.ids), [["a", "b"], ["c", "d"], ["e", "f"], ["g"], ["a"]]);
  assert.ok(bodyReads(backend).every((call) => call.ids.length <= 2 && call.range[1] === call.ids.length - 1));
});

test("short metadata pages do not falsely signal completion under a lower server row cap", async (t) => {
  const root = isolatedRoot(t);
  const rows = ["a", "b", "c"].map((observationKey) =>
    remoteRow("production-market-observations", { observationKey })
  );
  const backend = fakeBackend(rows, {
    onRead: (call, data) => ({ data: call.ids ? data : data.slice(0, 1), error: null }),
  });
  assert.equal((await restoreForwardEvidence({ root, backend, pageSize: 2 })).remoteRecords, 3);
  assert.equal(loadLocalForwardEvidence({ root }).length, 3);
});

for (const [command, execute] of [["restore", restoreForwardEvidence], ["sync", syncForwardEvidence]]) {
  test(`${command} rejects an indexed local hash conflict before appends or uploads`, async (t) => {
    const root = isolatedRoot(t);
    const known = remoteRow("prospective-edge-cohorts", { episodeId: "known", role: "TREATMENT" });
    mergeForwardEvidenceRows([known], { root });
    const backend = fakeBackend([
      remoteRow("production-market-observations", { observationKey: "missing" }),
      remoteRow("prospective-edge-cohorts", { episodeId: "known", role: "CONTROL_MATCHED" }),
    ]);
    await assert.rejects(execute({ root, backend, pageSize: 1 }), /Immutable forward-evidence conflict/);
    assert.deepEqual(loadLocalForwardEvidence({ root }), [known]);
    assert.equal(bodyReads(backend).length, 0);
    assert.equal(backend.writes.length, 0);
  });

  test(`${command} rejects missing bodies even after a valid earlier batch`, async (t) => {
    const root = isolatedRoot(t);
    const rows = ["a", "b"].map((observationKey) =>
      remoteRow("production-market-observations", { observationKey })
    );
    const backend = fakeBackend(rows, {
      onRead: (call, data) => ({ data: call.ids?.includes("b") ? [] : data, error: null }),
    });
    await assert.rejects(execute({ root, backend, pageSize: 1 }), /missing body/);
    assert.equal(bodyReads(backend).length, 2);
    assert.deepEqual(loadLocalForwardEvidence({ root }), []);
    assert.equal(backend.writes.length, 0);
  });

  test(`${command} rejects invalid page sizes before any remote request`, async (t) => {
    const root = isolatedRoot(t);
    const backend = fakeBackend();
    for (const pageSize of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, "", "0", "1.5", "bad", false]) {
      await assert.rejects(execute({ root, backend, pageSize }), /Invalid forward-evidence page size/);
    }
    assert.equal(backend.reads.length, 0);
    assert.equal(backend.writes.length, 0);
  });

  for (const phase of ["index", "body"]) {
    test(`${command} reports ${phase} query quota errors as FAILED`, async (t) => {
      const root = isolatedRoot(t);
      const backend = fakeBackend([remoteRow("production-market-observations", { observationKey: "a" })], {
        onRead: (call) => Boolean(call.ids) === (phase === "body")
          ? { data: null, error: { message: "exceed_egress_quota" } }
          : undefined,
      });
      const report = await runForwardEvidenceRemoteCommand(command, { root, backend, pageSize: 1, writeReport: false });
      assert.equal(report.state, "REMOTE_FORWARD_EVIDENCE_FAILED");
      assert.match(report.error, /Remote forward-evidence read failed: exceed_egress_quota/);
      assert.deepEqual(loadLocalForwardEvidence({ root }), []);
      assert.equal(backend.writes.length, 0);
    });
  }
}

for (const [name, transform, message] of [
  ["corrupt hash", (row) => ({ ...row, record_json: { observationKey: "a", priceUsd: 99 } }), /hash mismatch/],
  ["missing payload", (row) => ({ ...row, record_json: undefined }), /record must be an object/],
  ["non-object payload", (row) => ({ ...row, record_json: [] }), /record must be an object/],
  ["record ID mismatch", (row) => ({ ...row, record_id: "different" }), /record ID mismatch/],
  ["self-consistent changed payload", (row) => remoteRow(row.ledger_name, { observationKey: "a", priceUsd: 99 }), /index\/body mismatch/],
  ["unexpected record ID", (row) => remoteRow(row.ledger_name, { observationKey: "unexpected" }), /index\/body mismatch/],
  ["unexpected ledger", (row) => ({ ...row, ledger_name: "market-context-observations" }), /index\/body mismatch/],
]) {
  test(`restore fails closed on ${name} without appending any fetched body`, async (t) => {
    const root = isolatedRoot(t);
    const backend = fakeBackend([remoteRow("production-market-observations", { observationKey: "a", priceUsd: 1 })], {
      onRead: (call, data) => ({ data: call.ids ? data.map(transform) : data, error: null }),
    });
    await assert.rejects(restoreForwardEvidence({ root, backend }), message);
    assert.deepEqual(loadLocalForwardEvidence({ root }), []);
  });
}

test("duplicate metadata pages fail closed rather than looping or skipping IDs", async (t) => {
  const root = isolatedRoot(t);
  const row = remoteRow("production-market-observations", { observationKey: "a" });
  const backend = fakeBackend([row], {
    onRead: (call, data) => ({ data: call.afterId ? [row] : data, error: null }),
  });
  await assert.rejects(restoreForwardEvidence({ root, backend, pageSize: 1 }), /duplicate index row/);
  assert.equal(backend.reads.length, 2);
  assert.equal(bodyReads(backend).length, 0);
  assert.deepEqual(loadLocalForwardEvidence({ root }), []);
});

test("duplicate or partially omitted body batches fail closed", async (t) => {
  const root = isolatedRoot(t);
  const rows = ["a", "b"].map((observationKey) => remoteRow("production-market-observations", { observationKey }));
  for (const duplicate of [false, true]) {
    const backend = fakeBackend(rows, {
      onRead: (call, data) => ({ data: call.ids ? duplicate ? [data[0], data[0]] : data.slice(0, 1) : data, error: null }),
    });
    await assert.rejects(restoreForwardEvidence({ root, backend, pageSize: 2 }), /duplicate body row|missing body/);
    assert.deepEqual(loadLocalForwardEvidence({ root }), []);
  }
});

test("malformed metadata and absent query data fail closed", async (t) => {
  const root = isolatedRoot(t);
  const row = remoteRow("production-market-observations", { observationKey: "a" });
  for (const data of [null, {}, [null], [{ ...row, content_hash: "invalid" }], [{ ...row, record_id: "" }], [{ ...row, ledger_name: "other" }]]) {
    const backend = fakeBackend([row], { onRead: () => ({ data, error: null }) });
    await assert.rejects(restoreForwardEvidence({ root, backend }), /invalid page|invalid index row/);
    assert.deepEqual(loadLocalForwardEvidence({ root }), []);
  }
});

test("sync still reports upload query failures as FAILED", async (t) => {
  const root = isolatedRoot(t);
  mergeForwardEvidenceRows([remoteRow("production-market-observations", { observationKey: "local-only" })], { root });
  const backend = fakeBackend([], { onWrite: () => ({ error: { message: "write denied" } }) });
  const report = await runForwardEvidenceRemoteCommand("sync", { root, backend, writeReport: false });
  assert.equal(report.state, "REMOTE_FORWARD_EVIDENCE_FAILED");
  assert.match(report.error, /Remote forward-evidence write failed: write denied/);
});

test("body batches cap short ID lists at 50 records", async (t) => {
  const root = isolatedRoot(t);
  const rows = Array.from({ length: 101 }, (_, id) =>
    remoteRow("production-market-observations", { observationKey: String(id).padStart(3, "0") })
  );
  const backend = fakeBackend(rows);
  assert.equal((await restoreForwardEvidence({ root, backend, pageSize: 250 })).restored, 101);
  assert.deepEqual(bodyReads(backend).map((call) => call.ids.length), [50, 50, 1]);
});

test("an oversized single ID fails closed before cursor or body requests", async (t) => {
  const root = isolatedRoot(t);
  const backend = fakeBackend([
    remoteRow("production-market-observations", { observationKey: "identity:/".repeat(1000) }),
  ]);
  await assert.rejects(restoreForwardEvidence({ root, backend }), /record ID exceeds request byte limit/);
  assert.equal(backend.reads.length, 1);
  assert.equal(bodyReads(backend).length, 0);
  assert.deepEqual(loadLocalForwardEvidence({ root }), []);
});

test("real Supabase SDK encodes bounded long-ID requests with an injected offline transport", async (t) => {
  const root = isolatedRoot(t);
  const suffix = "identity:/asset?(pair),chain&observedAt=".repeat(18);
  const remote = Array.from({ length: 20 }, (_, id) => remoteRow("production-market-observations", {
    observationKey: `asset:${String(id).padStart(3, "0")}:${suffix}`,
    observedAt: "2026-10-17T00:00:00Z",
  }));
  const known = remote[0];
  mergeForwardEvidenceRows([known], { root });
  const requests = [];
  const client = createClient("https://forward-evidence.invalid", "offline-test-placeholder", {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    global: {
      fetch: async (input, init) => {
        const url = new URL(String(input));
        assert.equal(url.origin, "https://forward-evidence.invalid");
        assert.equal(url.pathname, "/rest/v1/forward_evidence_records");
        assert.equal(init.method, "GET");
        assert.ok(url.href.length <= 6000, `encoded request exceeded byte budget: ${url.href.length}`);
        const params = url.searchParams;
        const fields = params.get("select").split(",");
        const ledgerFilter = params.get("ledger_name");
        assert.ok(ledgerFilter.startsWith("eq."));
        assert.equal(params.get("order"), "record_id.asc");
        assert.equal(params.get("offset"), "0");
        const filter = params.get("record_id");
        let ids = null;
        let afterId = null;
        if (filter?.startsWith("in.(")) {
          assert.ok(fields.includes("record_json"));
          ids = filter.slice(4, -1).match(/"[^"]*"|[^,]+/g).map((id) => id.startsWith('"') ? id.slice(1, -1) : id);
          assert.ok(ids.length <= 50);
          assert.equal(Number(params.get("limit")), ids.length);
        } else {
          assert.deepEqual(fields, ["ledger_name", "record_id", "content_hash"]);
          if (filter) {
            assert.ok(filter.startsWith("gt."));
            afterId = filter.slice(3);
          }
        }
        requests.push({ fields, ids, afterId });
        const data = remote
          .filter((row) => row.ledger_name === ledgerFilter.slice(3))
          .filter((row) => afterId === null || row.record_id > afterId)
          .filter((row) => ids === null || ids.includes(row.record_id))
          .sort((left, right) => left.record_id < right.record_id ? -1 : left.record_id > right.record_id ? 1 : 0)
          .slice(0, Number(params.get("limit")))
          .map((row) => Object.fromEntries(fields.map((field) => [field, row[field]])));
        return new Response(JSON.stringify(data), { status: 200, headers: { "Content-Type": "application/json" } });
      },
    },
  });
  const backend = { client, config: { serverWriteCapable: true } };
  const restored = await restoreForwardEvidence({ root, backend, pageSize: 7 });
  assert.equal(restored.remoteRecords, 20);
  assert.equal(restored.restored, 19);
  const bodies = requests.filter((request) => request.ids);
  assert.ok(bodies.every((request) => request.ids.length < 7));
  assert.equal(bodies.flatMap((request) => request.ids).length, 19);
  assert.ok(bodies.every((request) => !request.ids.includes(known.record_id)));
  assert.ok(requests.some((request) => request.afterId));

  remote.push(remoteRow("production-market-observations", {
    observationKey: `000-historical:${suffix}`, observedAt: "2020-01-01T00:00:00Z",
  }));
  assert.equal((await restoreForwardEvidence({ root, backend, pageSize: 7 })).restored, 1);
  const bodyCount = requests.filter((request) => request.ids).length;
  const synced = await syncForwardEvidence({ root, backend, pageSize: 7 });
  assert.equal(synced.remoteRecordsBeforeSync, 21);
  assert.equal(synced.uploaded, 0);
  assert.equal((await restoreForwardEvidence({ root, backend, pageSize: 7 })).restored, 0);
  assert.equal(requests.filter((request) => request.ids).length, bodyCount);
});
