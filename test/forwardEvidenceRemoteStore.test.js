import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";
import { collectSupabaseMemory } from "../src/storage/supabaseMemory.js";

import {
  __forwardEvidenceRemoteHooks,
  FORWARD_EVIDENCE_LEDGERS,
  loadLocalForwardEvidence,
  mergeForwardEvidenceRows,
  restoreForwardEvidence,
  runForwardEvidenceRemoteCommand,
  syncForwardEvidence,
} from "../src/production/forwardEvidenceRemoteStore.js";

// Captured by Exact Outcome Probe run 39655424278 on 2026-10-21.
const DATABASE_SIZE_MESSAGE = "Service for this project is restricted due to the following violations: exceed_db_size_quota. " +
  "The project owner must upgrade their plan or remove spend caps to restore service.";

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

function fakeBackend(rows = [], { onRead, onWrite, url = "https://example-project.supabase.co" } = {}) {
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
  return { client, config: { serverWriteCapable: true, url }, reads, writes };
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

for (const [ledgerName, relative] of Object.entries(FORWARD_EVIDENCE_LEDGERS)) {
  for (const ending of ["\n", "\r\n", "", " \t"]) {
    test(`restore preserves original ${ledgerName} bytes with ending ${JSON.stringify(ending)}`, (t) => {
      const root = isolatedRoot(t);
      const file = path.join(root, relative);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const original = Buffer.from(' \t{ "priceUsd":1.00, "observationKey":"z", "label":"\\u0061" }\r\n' +
        '\t\r\n{"observationKey":"a","priceUsd":2e0}\n' +
        '{ "observationKey" : "z", "label":"a", "priceUsd":1 }' + ending);
      fs.writeFileSync(file, original);
      const inode = fs.statSync(file).ino;
      const older = remoteRow(ledgerName, { observationKey: "older", observedAt: "2026-01-01T00:00:00Z" });
      const newer = remoteRow(ledgerName, { observationKey: "newer", observedAt: "2026-02-01T00:00:00Z" });

      assert.deepEqual(mergeForwardEvidenceRows([newer, older], { root }), {
        localRecords: 3, remoteRecords: 2, restored: 2,
      });
      const suffix = `${ending.endsWith("\n") ? "" : "\n"}${JSON.stringify(older.record_json)}\n${JSON.stringify(newer.record_json)}\n`;
      assert.deepEqual(fs.readFileSync(file), Buffer.concat([original, Buffer.from(suffix)]));
      assert.equal(fs.statSync(file).ino, inode);
      assert.deepEqual(loadLocalForwardEvidence({ root }).map((row) => row.record_id), ["z", "a", "z", "older", "newer"]);
    });
  }
}

test("restore appends each validated remote ID once and repeated restores do not write", (t) => {
  const root = isolatedRoot(t);
  const row = remoteRow("production-market-observations", { observationKey: "duplicate", priceUsd: 1 });
  const reordered = remoteRow(row.ledger_name, { priceUsd: 1, observationKey: "duplicate" });
  assert.deepEqual(mergeForwardEvidenceRows([row, reordered, row], { root }), {
    localRecords: 0, remoteRecords: 3, restored: 1,
  });
  const file = path.join(root, FORWARD_EVIDENCE_LEDGERS[row.ledger_name]);
  assert.equal(loadLocalForwardEvidence({ root }).length, 1);
  const before = fs.readFileSync(file);
  for (const method of ["writeSync", "writeFileSync", "renameSync"]) {
    t.mock.method(fs, method, () => assert.fail("A duplicate-only restore must not write"));
  }
  assert.deepEqual(mergeForwardEvidenceRows([row, row], { root }), {
    localRecords: 1, remoteRecords: 2, restored: 0,
  });
  assert.deepEqual(fs.readFileSync(file), before);
});

for (const [name, change, message] of [
  ["contradictory duplicate", (row) => remoteRow(row.ledger_name, { observationKey: "duplicate", priceUsd: 99 }), /Immutable forward-evidence conflict/],
  ["forged duplicate hash", (row) => ({ ...row, record_json: { observationKey: "duplicate", priceUsd: 99 } }), /hash mismatch/],
  ["duplicate ID mismatch", (row) => ({ ...row, record_id: "other" }), /record ID mismatch/],
]) {
  test(`restore rejects ${name} before touching any ledger`, (t) => {
    const root = isolatedRoot(t);
    const file = path.join(root, "data", "production-market-observations.jsonl");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const before = Buffer.from(' \t{"observationKey":"local"}\r\n\r\n');
    fs.writeFileSync(file, before);
    const row = remoteRow("market-context-observations", { observationKey: "duplicate", priceUsd: 1 });
    const missing = remoteRow("production-market-observations", { observationKey: "missing" });
    assert.throws(() => mergeForwardEvidenceRows([missing, row, change(row)], { root }), message);
    assert.deepEqual(fs.readFileSync(file), before);
    assert.deepEqual(fs.readdirSync(path.dirname(file)), [path.basename(file)]);
  });
}

for (const malformed of ['{"observationKey":"truncated"', "not-json\r\n", "[]\n", "null\n"]) {
  test(`restore leaves malformed local bytes untouched: ${JSON.stringify(malformed)}`, (t) => {
    const root = isolatedRoot(t);
    const file = path.join(root, "data", "prospective-edge-cohorts.jsonl");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const before = Buffer.from(` \t{"episodeId":"valid"}\r\n${malformed}`);
    fs.writeFileSync(file, before);
    assert.throws(() => mergeForwardEvidenceRows([
      remoteRow("production-market-observations", { observationKey: "missing" }),
      remoteRow("prospective-edge-cohorts", { episodeId: "missing" }),
    ], { root }), /invalid forward-evidence JSONL/);
    assert.deepEqual(fs.readFileSync(file), before);
    assert.deepEqual(fs.readdirSync(path.dirname(file)), [path.basename(file)]);
  });
}

test("restore rechecks an append made after its initial local snapshot without losing or duplicating it", (t) => {
  const root = isolatedRoot(t);
  const file = path.join(root, "data", "production-market-observations.jsonl");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const before = ' {"observationKey":"local"}\r\n';
  const concurrent = remoteRow("production-market-observations", { observationKey: "concurrent" });
  const concurrentBytes = ` \t${JSON.stringify(concurrent.record_json)}\r\n`;
  fs.writeFileSync(file, before);
  const read = fs.readFileSync;
  let injected = false;
  t.mock.method(fs, "readFileSync", (target, ...args) => {
    const result = read(target, ...args);
    if (target === file && !injected) {
      injected = true;
      fs.appendFileSync(file, concurrentBytes);
    }
    return result;
  });
  const missing = remoteRow("production-market-observations", { observationKey: "missing" });
  assert.equal(mergeForwardEvidenceRows([concurrent, missing], { root }).restored, 1);
  assert.equal(injected, true);
  assert.equal(read(file, "utf8"), `${before}${concurrentBytes}${JSON.stringify(missing.record_json)}\n`);
});

test("restore does not overwrite a local append immediately before its own write", (t) => {
  const root = isolatedRoot(t);
  const file = path.join(root, "data", "production-market-observations.jsonl");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const before = ' {"observationKey":"local"}\r\n';
  const concurrentBytes = ' \t{"observationKey":"late-local"}\r\n';
  fs.writeFileSync(file, before);
  const write = fs.writeFileSync;
  let injected = false;
  t.mock.method(fs, "writeFileSync", (target, ...args) => {
    if (!injected) {
      injected = true;
      fs.appendFileSync(file, concurrentBytes);
    }
    return write(target, ...args);
  });
  const missing = remoteRow("production-market-observations", { observationKey: "missing" });
  assert.equal(mergeForwardEvidenceRows([missing], { root }).restored, 1);
  assert.equal(injected, true);
  assert.equal(fs.readFileSync(file, "utf8"), `${before}${concurrentBytes}${JSON.stringify(missing.record_json)}\n`);
});

for (const [name, concurrentBytes, message] of [
  ["conflicting", '{"observationKey":"missing","priceUsd":99}\n', /Immutable forward-evidence conflict/],
  ["malformed", "not-json\n", /invalid forward-evidence JSONL/],
]) {
  test(`restore fails closed on a ${name} append visible during its recheck`, (t) => {
    const root = isolatedRoot(t);
    const file = path.join(root, "data", "production-market-observations.jsonl");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const before = '{"observationKey":"local"}\n';
    fs.writeFileSync(file, before);
    const read = fs.readFileSync;
    let injected = false;
    t.mock.method(fs, "readFileSync", (target, ...args) => {
      const result = read(target, ...args);
      if (target === file && !injected) {
        injected = true;
        fs.appendFileSync(file, concurrentBytes);
      }
      return result;
    });
    assert.throws(() => mergeForwardEvidenceRows([
      remoteRow("production-market-observations", { observationKey: "missing", priceUsd: 1 }),
    ], { root }), message);
    assert.equal(injected, true);
    assert.equal(read(file, "utf8"), `${before}${concurrentBytes}`);
  });
}

test("restore flushes appended evidence and newly created directory entries before acknowledging it", (t) => {
  const root = isolatedRoot(t);
  const flushed = [];
  const flush = fs.fsyncSync;
  t.mock.method(fs, "fsyncSync", (fd) => {
    const stat = fs.fstatSync(fd);
    flushed.push({ inode: stat.ino, directory: stat.isDirectory() });
    return flush(fd);
  });
  const row = remoteRow("production-market-observations", { observationKey: "missing" });
  assert.equal(mergeForwardEvidenceRows([row], { root }).restored, 1);
  const file = path.join(root, FORWARD_EVIDENCE_LEDGERS[row.ledger_name]);
  assert.deepEqual(flushed, [file, path.dirname(file), root].map((target) => {
    const stat = fs.statSync(target);
    return { inode: stat.ino, directory: stat.isDirectory() };
  }));
});

test("restore propagates a flush failure without rewriting local bytes", (t) => {
  const root = isolatedRoot(t);
  const file = path.join(root, "data", "production-market-observations.jsonl");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const before = ' \t{"observationKey":"local"}\r\n';
  fs.writeFileSync(file, before);
  const missing = remoteRow("production-market-observations", { observationKey: "missing" });
  const flush = t.mock.method(fs, "fsyncSync", () => { throw new Error("fixture flush failure"); });
  assert.throws(() => mergeForwardEvidenceRows([missing], { root }), /fixture flush failure/);
  assert.equal(flush.mock.callCount(), 1);
  assert.equal(fs.readFileSync(file, "utf8"), `${before}${JSON.stringify(missing.record_json)}\n`);
  flush.mock.restore();
  assert.equal(mergeForwardEvidenceRows([missing], { root }).restored, 0);
});

test("restore never truncates concurrent evidence to roll back a partially failed append", (t) => {
  const root = isolatedRoot(t);
  const file = path.join(root, "data", "production-market-observations.jsonl");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const before = ' \t{"observationKey":"local"}\r\n';
  fs.writeFileSync(file, before);
  const write = fs.writeFileSync;
  let partial;
  t.mock.method(fs, "writeFileSync", (fd, payload) => {
    assert.equal(typeof fd, "number");
    partial = payload.slice(0, 10);
    write(fd, partial);
    write(file, '\n{"observationKey":"late-local"}\n', { flag: "a" });
    throw new Error("fixture partial append failure");
  });
  assert.throws(() => mergeForwardEvidenceRows([
    remoteRow("production-market-observations", { observationKey: "missing" }),
  ], { root }), /fixture partial append failure/);
  assert.equal(fs.readFileSync(file, "utf8"), `${before}${partial}\n{"observationKey":"late-local"}\n`);
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

test("only the exact provider egress code opens a durable circuit and later commands skip remote work", async (t) => {
  const root = isolatedRoot(t);
  const backend = fakeBackend([], {
    onRead: () => ({ data: null, error: { code: "exceed_egress_quota", message: "provider quota reached" } }),
  });
  const first = await runForwardEvidenceRemoteCommand("restore", {
    root, backend, now: "2026-10-19T00:00:00.000Z", writeReport: false,
  });
  assert.deepEqual(first, {
    schemaVersion: 1, generatedAt: "2026-10-19T00:00:00.000Z", state: "REMOTE_FORWARD_EVIDENCE_EGRESS_OUTAGE",
    error: "Remote forward-evidence read failed: provider quota reached", providerCode: "exceed_egress_quota",
    detectedAt: "2026-10-19T00:00:00.000Z",
  });
  assert.equal(backend.reads.length, 1);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, "data", "remote-operational-circuits.json"), "utf8")), {
    schemaVersion: 1, incidents: { "supabase:https://example-project.supabase.co": {
      state: "REMOTE_EGRESS_OUTAGE", providerCode: "exceed_egress_quota", detectedAt: "2026-10-19T00:00:00.000Z",
    } },
  });
  const skipped = await runForwardEvidenceRemoteCommand("sync", { root, backend, now: "2026-10-19T01:00:00.000Z", writeReport: false });
  assert.equal(skipped.state, "REMOTE_FORWARD_EVIDENCE_EGRESS_OUTAGE");
  assert.equal(skipped.skipped, true);
  assert.equal(backend.reads.length, 1);
  assert.equal(backend.writes.length, 0);
});

test("generic provider failures do not open an egress circuit", async (t) => {
  const root = isolatedRoot(t);
  const backend = fakeBackend([], { onRead: () => ({ data: null, error: { code: "42501", message: "forbidden" } }) });
  const report = await runForwardEvidenceRemoteCommand("restore", { root, backend, writeReport: false });
  assert.equal(report.state, "REMOTE_FORWARD_EVIDENCE_FAILED");
  assert.equal(fs.existsSync(path.join(root, "data", "remote-operational-circuits.json")), false);
});

test("the captured platform restriction message opens the SDK circuit even without a code field", async (t) => {
  const root = isolatedRoot(t);
  const message = "Service for this project is restricted due to the following violations: exceed_egress_quota. " +
    "The project owner must upgrade their plan or remove spend caps to restore service.";
  const backend = fakeBackend([], { onRead: () => ({ data: null, error: { message } }) });
  const first = await runForwardEvidenceRemoteCommand("restore", { root, backend, writeReport: false });
  assert.equal(first.state, "REMOTE_FORWARD_EVIDENCE_EGRESS_OUTAGE");
  const next = await runForwardEvidenceRemoteCommand("sync", { root, backend, writeReport: false });
  assert.equal(next.skipped, true);
  assert.equal(backend.reads.length, 1);
  assert.equal(backend.writes.length, 0);
});

for (const phase of ["index", "body", "write", "write verification"]) {
  test(`database-size restriction during ${phase} persists and skips future history work without changing evidence`, async t => {
    const root = isolatedRoot(t);
    const local = [
      remoteRow("production-market-observations", { observationKey: "pending" }),
      remoteRow("market-context-observations", { observationKey: "context" }),
      remoteRow("prospective-edge-cohorts", { episodeId: "cohort" }),
    ];
    mergeForwardEvidenceRows(local, { root });
    const outbox = path.join(root, "data", "outbox-fixture.jsonl");
    fs.writeFileSync(outbox, '{"state":"PENDING","receipt":null}\n');
    const files = [outbox, ...["production-market-observations", "market-context-observations", "prospective-edge-cohorts"]
      .map(name => path.join(root, "data", `${name}.jsonl`))];
    const before = files.map(file => fs.readFileSync(file));
    const error = { message: DATABASE_SIZE_MESSAGE };
    const remote = phase === "body" ? [remoteRow("production-market-observations", { observationKey: "remote-only" })] : [];
    const backend = fakeBackend(remote, {
      onRead: call => (phase === "index" || (phase === "body" && call.ids) || (phase === "write verification" && call.ids))
        ? { data: null, error } : undefined,
      onWrite: () => phase === "write" ? { error } : undefined,
    });
    const first = await runForwardEvidenceRemoteCommand(phase === "index" || phase === "body" ? "restore" : "sync", {
      root, backend, now: "2026-10-21T18:44:54.161Z",
    });
    assert.equal(first.state, "REMOTE_FORWARD_EVIDENCE_FAILED");
    assert.equal(first.circuitState, "REMOTE_DATABASE_SIZE_OUTAGE");
    assert.equal(first.providerCode, "exceed_db_size_quota");
    assert.equal(first.detectedAt, "2026-10-21T18:44:54.161Z");
    assert.equal(first.uploaded, undefined);
    assert.match(first.error, /exceed_db_size_quota/);
    const circuitFile = path.join(root, "data", "remote-operational-circuits.json");
    assert.deepEqual(JSON.parse(fs.readFileSync(circuitFile, "utf8")), {
      schemaVersion: 1, incidents: { "supabase:https://example-project.supabase.co": {
        state: "REMOTE_DATABASE_SIZE_OUTAGE", providerCode: "exceed_db_size_quota", detectedAt: first.detectedAt,
      } },
    });
    const circuitBytes = fs.readFileSync(circuitFile);
    const nextBackend = fakeBackend([], {
      onRead: () => assert.fail("An open database-size circuit must not read history"),
      onWrite: () => assert.fail("An open database-size circuit must not acknowledge pending evidence"),
    });
    for (const command of ["restore", "sync"]) {
      const next = await runForwardEvidenceRemoteCommand(command, {
        root, backend: nextBackend, now: "2028-01-01T00:00:00.000Z",
      });
      assert.equal(next.state, "REMOTE_FORWARD_EVIDENCE_FAILED");
      assert.equal(next.circuitState, "REMOTE_DATABASE_SIZE_OUTAGE");
      assert.equal(next.providerCode, "exceed_db_size_quota");
      assert.equal(next.detectedAt, first.detectedAt);
      assert.equal(next.skipped, true);
      assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, "reports", "forward-evidence-remote-sync.json"), "utf8")), next);
    }
    assert.equal(nextBackend.reads.length, 0);
    assert.equal(nextBackend.writes.length, 0);
    assert.deepEqual(fs.readFileSync(circuitFile), circuitBytes);
    assert.deepEqual(files.map(file => fs.readFileSync(file)), before);
  });
}

test("a restored database-size operational snapshot suppresses requests independently of evidence caches", async t => {
  const root = isolatedRoot(t);
  const outage = fakeBackend([], { onRead: () => ({ data: null, error: { code: "exceed_db_size_quota" } }) });
  await runForwardEvidenceRemoteCommand("restore", { root, backend: outage, writeReport: false });
  const restoredRoot = isolatedRoot(t);
  fs.mkdirSync(path.join(restoredRoot, "data"));
  fs.copyFileSync(path.join(root, "data", "remote-operational-circuits.json"),
    path.join(restoredRoot, "data", "remote-operational-circuits.json"));
  const backend = fakeBackend();
  const report = await runForwardEvidenceRemoteCommand("sync", { root: restoredRoot, backend, writeReport: false });
  assert.equal(report.circuitState, "REMOTE_DATABASE_SIZE_OUTAGE");
  assert.equal(report.skipped, true);
  assert.equal(backend.reads.length, 0);
  assert.equal(backend.writes.length, 0);
  assert.deepEqual(loadLocalForwardEvidence({ root: restoredRoot }), []);
});

test("one confirmed REST database-size error suppresses retries and both caller paths even after read admission", async t => {
  const root = isolatedRoot(t);
  let calls = 0;
  const env = { SUPABASE_ENABLED: "true", SUPABASE_URL: "https://example-project.supabase.co",
    SUPABASE_SECRET_KEY: "fixture-secret", SUPABASE_SERVICE_ROLE_KEY: "fixture-fallback" };
  const options = { root, env, writeReport: false, maxRetries: 2, retryDelayMs: 0,
    fetchImpl: async () => {
      const call = ++calls;
      return { ok: false, status: call === 1 ? 403 : 500,
        text: async () => JSON.stringify({ message: call === 1 ? DATABASE_SIZE_MESSAGE : "Temporary server failure" }) };
    },
  };
  const first = await collectSupabaseMemory(options);
  assert.equal(calls, 3); // Only the three already-dispatched table reads, no retry or fallback key.
  assert.equal(first.remoteCircuit.state, "REMOTE_DATABASE_SIZE_OUTAGE");
  assert.equal(first.remoteCircuit.providerCode, "exceed_db_size_quota");
  const skippedMemory = await collectSupabaseMemory(options);
  assert.equal(skippedMemory.status, "FAILED");
  assert.match(skippedMemory.reason, /database-size/);
  assert.doesNotMatch(skippedMemory.reason, /egress/);
  assert.equal(skippedMemory.tableHealth.projects.status, "SKIPPED");
  assert.equal(calls, 3);
  const backend = fakeBackend();
  for (const command of ["restore", "sync"]) {
    const skipped = await runForwardEvidenceRemoteCommand(command, { root, backend, writeReport: false });
    assert.equal(skipped.skipped, true);
    assert.equal(skipped.circuitState, "REMOTE_DATABASE_SIZE_OUTAGE");
    assert.equal(skipped.providerCode, "exceed_db_size_quota");
  }
  assert.equal(backend.reads.length, 0);
  assert.equal(backend.writes.length, 0);
  let otherCalls = 0;
  const healthyFetch = async () => { otherCalls++; return { ok: true, json: async () => [] }; };
  await collectSupabaseMemory({ ...options, env: { ...env, SUPABASE_URL: "https://other-project.supabase.co" }, fetchImpl: healthyFetch });
  assert.equal(otherCalls, 3);
  const proof = fakeBackend([remoteRow("production-market-observations", { observationKey: "proof" })]);
  const verified = await runForwardEvidenceRemoteCommand("verify", { root, backend: proof, writeReport: false });
  assert.equal(verified.state, "REMOTE_FORWARD_EVIDENCE_FAILED");
  assert.equal(verified.readAdmissionVerified, true);
  assert.equal(verified.circuitRetained, true);
  assert.equal(proof.reads.length, 1);
  assert.equal((await collectSupabaseMemory({ ...options, fetchImpl: healthyFetch })).status, "FAILED");
  assert.equal(otherCalls, 3);
});

test("SDK database-size detection suppresses same-project REST history without calling fetch", async t => {
  const root = isolatedRoot(t);
  const backend = fakeBackend([], { onRead: () => ({ data: null, error: { message: DATABASE_SIZE_MESSAGE } }) });
  await runForwardEvidenceRemoteCommand("restore", { root, backend, writeReport: false });
  let calls = 0;
  const memory = await collectSupabaseMemory({ root, writeReport: false,
    env: { SUPABASE_ENABLED: "true", SUPABASE_URL: backend.config.url, SUPABASE_SECRET_KEY: "different-fixture-key" },
    fetchImpl: async () => { calls++; assert.fail("No REST history request during the scoped outage"); },
  });
  assert.equal(calls, 0);
  assert.equal(memory.remoteCircuit.state, "REMOTE_DATABASE_SIZE_OUTAGE");
  assert.equal(memory.remoteCircuit.providerCode, "exceed_db_size_quota");
  assert.ok(Object.values(memory.tableHealth).every(table => table.status === "SKIPPED"));
});

test("database-size verification cannot clear an incident when reads work but writes remain blocked", async t => {
  const root = isolatedRoot(t);
  const outage = fakeBackend([], { onRead: () => ({ data: null, error: { providerCode: "exceed_db_size_quota" } }) });
  const opened = await runForwardEvidenceRemoteCommand("restore", { root, backend: outage, writeReport: false });
  assert.equal(opened.circuitState, "REMOTE_DATABASE_SIZE_OUTAGE");
  const file = path.join(root, "data", "remote-operational-circuits.json");
  const before = fs.readFileSync(file);
  const proof = remoteRow("production-market-observations", { observationKey: "proof" });
  for (const data of [[], null, {}, [null], [{ ...proof, ledger_name: "other" }],
    [{ ...proof, content_hash: [proof.content_hash] }], [{ ...proof, content_hash: "bad" }],
    [{ ...proof, record_id: " " }], [{ ...proof, record_id: "x".repeat(7000) }]]) {
    const invalid = fakeBackend([], { onRead: () => ({ data, error: null }) });
    const result = await runForwardEvidenceRemoteCommand("verify", { root, backend: invalid, writeReport: false });
    assert.equal(result.state, "REMOTE_FORWARD_EVIDENCE_FAILED");
    assert.equal(invalid.reads.length, 1);
    assert.deepEqual(fs.readFileSync(file), before);
    assert.equal((await runForwardEvidenceRemoteCommand("sync", { root, backend: invalid, writeReport: false })).skipped, true);
    assert.equal(invalid.reads.length, 1);
  }
  const unavailable = { client: null, config: outage.config, reason: "No client" };
  assert.equal((await runForwardEvidenceRemoteCommand("verify", { root, backend: unavailable, writeReport: false })).state,
    "REMOTE_FORWARD_EVIDENCE_NOT_CONFIGURED");
  const other = fakeBackend([proof], { url: "https://other-project.supabase.co" });
  await runForwardEvidenceRemoteCommand("verify", { root, backend: other, writeReport: false });
  assert.deepEqual(fs.readFileSync(file), before);
  const failed = fakeBackend([], { onRead: () => ({ data: null, error: { code: "403", message: "Forbidden" } }) });
  assert.equal((await runForwardEvidenceRemoteCommand("verify", { root, backend: failed, writeReport: false })).state,
    "REMOTE_FORWARD_EVIDENCE_FAILED");
  assert.deepEqual(fs.readFileSync(file), before);
  const readOnly = fakeBackend([proof], { onWrite: () => ({ error: { message: DATABASE_SIZE_MESSAGE } }) });
  const result = await runForwardEvidenceRemoteCommand("verify", { root, backend: readOnly, writeReport: false });
  assert.equal(result.state, "REMOTE_FORWARD_EVIDENCE_FAILED");
  assert.equal(result.circuitState, "REMOTE_DATABASE_SIZE_OUTAGE");
  assert.equal(result.providerCode, "exceed_db_size_quota");
  assert.equal(result.verificationScope, "INDEXED_SERVICE_ADMISSION_ONLY");
  assert.equal(result.readAdmissionVerified, true);
  assert.equal(result.verificationIncomplete, true);
  assert.equal(result.circuitRetained, true);
  assert.equal(result.writeProofRequired, true);
  assert.match(result.error, /write with ID\/hash acknowledgment/);
  assert.equal(result.remoteDataRestored, false);
  assert.equal(result.remoteSyncAcknowledged, false);
  assert.equal(readOnly.reads.length, 1);
  assert.equal(readOnly.writes.length, 0);
  assert.deepEqual(readOnly.reads[0].range, [0, 0]);
  assert.deepEqual(fs.readFileSync(file), before);
  assert.deepEqual(loadLocalForwardEvidence({ root }), []);
  for (const command of ["restore", "sync"]) {
    const skipped = await runForwardEvidenceRemoteCommand(command, { root, backend: readOnly, writeReport: false });
    assert.equal(skipped.state, "REMOTE_FORWARD_EVIDENCE_FAILED");
    assert.equal(skipped.skipped, true);
  }
  assert.equal(readOnly.reads.length, 1);
  assert.equal(readOnly.writes.length, 0);
});

test("database-size then egress then successful SELECT never forgets the write restriction", async t => {
  const root = isolatedRoot(t);
  const databaseOutage = fakeBackend([], { onRead: () => ({ data: null, error: { message: DATABASE_SIZE_MESSAGE } }) });
  const opened = await runForwardEvidenceRemoteCommand("restore", { root, backend: databaseOutage, writeReport: false });
  const file = path.join(root, "data", "remote-operational-circuits.json"), before = fs.readFileSync(file);
  const egress = fakeBackend([], { onRead: () => ({ data: null, error: { code: "exceed_egress_quota", message: "egress restricted" } }) });
  const failed = await runForwardEvidenceRemoteCommand("verify", { root, backend: egress, writeReport: false });
  assert.equal(failed.state, "REMOTE_FORWARD_EVIDENCE_FAILED");
  assert.equal(failed.providerCode, "exceed_egress_quota");
  assert.equal(failed.circuitProviderCode, "exceed_db_size_quota");
  assert.equal(failed.circuitState, "REMOTE_DATABASE_SIZE_OUTAGE");
  assert.equal(failed.detectedAt, opened.detectedAt);
  assert.match(failed.error, /egress restricted/);
  assert.deepEqual(fs.readFileSync(file), before);
  const readOnly = fakeBackend([remoteRow("production-market-observations", { observationKey: "read-proof" })]);
  const admitted = await runForwardEvidenceRemoteCommand("verify", { root, backend: readOnly, writeReport: false });
  assert.equal(admitted.state, "REMOTE_FORWARD_EVIDENCE_FAILED");
  assert.equal(admitted.readAdmissionVerified, true);
  assert.equal(admitted.circuitRetained, true);
  assert.deepEqual(fs.readFileSync(file), before);
  assert.equal((await runForwardEvidenceRemoteCommand("sync", { root, backend: readOnly, writeReport: false })).skipped, true);
  assert.equal(readOnly.reads.length, 1);
  assert.equal(readOnly.writes.length, 0);
});

test("an egress verification awaiting SELECT cannot clear a concurrent REST database-size incident", async t => {
  const root = isolatedRoot(t);
  let releaseRest, restDispatched, calls = 0;
  const restGate = new Promise(resolve => { releaseRest = resolve; });
  const restStarted = new Promise(resolve => { restDispatched = resolve; });
  const memoryRead = collectSupabaseMemory({ root, writeReport: false, maxRetries: 0,
    env: { SUPABASE_ENABLED: "true", SUPABASE_URL: "https://example-project.supabase.co", SUPABASE_SECRET_KEY: "fixture-secret" },
    fetchImpl: async () => {
      if (++calls === 3) restDispatched();
      await restGate;
      return { ok: false, status: 403, text: async () => JSON.stringify({ message: DATABASE_SIZE_MESSAGE }) };
    },
  });
  await restStarted;
  const egress = fakeBackend([], { onRead: () => ({ data: null, error: { code: "exceed_egress_quota" } }) });
  await runForwardEvidenceRemoteCommand("restore", { root, backend: egress, writeReport: false });
  let started, finish;
  const readStarted = new Promise(resolve => { started = resolve; });
  const readFinished = new Promise(resolve => { finish = resolve; });
  const backend = fakeBackend([remoteRow("production-market-observations", { observationKey: "read-proof" })], {
    onRead: (_call, data) => { started(); return readFinished.then(() => ({ data, error: null })); },
  });
  const verifying = runForwardEvidenceRemoteCommand("verify", { root, backend, writeReport: false });
  await readStarted;
  const file = path.join(root, "data", "remote-operational-circuits.json");
  let snapshot;
  try {
    releaseRest();
    const memory = await memoryRead;
    assert.equal(memory.remoteCircuit.providerCode, "exceed_db_size_quota");
    snapshot = fs.readFileSync(file);
  } finally { finish(); }
  const result = await verifying;
  assert.equal(calls, 3);
  assert.equal(result.state, "REMOTE_FORWARD_EVIDENCE_FAILED");
  assert.equal(result.circuitState, "REMOTE_DATABASE_SIZE_OUTAGE");
  assert.equal(result.providerCode, "exceed_db_size_quota");
  assert.equal(result.readAdmissionVerified, true);
  assert.equal(result.circuitRetained, true);
  assert.deepEqual(fs.readFileSync(file), snapshot);
  assert.equal(backend.reads.length, 1);
  assert.equal(backend.writes.length, 0);
});

test("the real SDK only persists exact structured quota errors or the captured full envelope (offline fetch)", async t => {
  t.mock.method(globalThis, "fetch", async () => assert.fail("No network calls"));
  for (const [status, body, trusted] of [
    [402, JSON.stringify({ message: DATABASE_SIZE_MESSAGE }), true],
    [403, JSON.stringify({ code: "exceed_db_size_quota", message: "quota" }), true],
    [403, JSON.stringify({ message: "Forbidden" }), false],
    [403, JSON.stringify({ message: "exceed_db_size_quota" }), false],
    [403, JSON.stringify({ message: `${DATABASE_SIZE_MESSAGE} extra` }), false],
    [403, JSON.stringify({ message: DATABASE_SIZE_MESSAGE.split(". ")[0] + "." }), false],
    [403, JSON.stringify({ message: DATABASE_SIZE_MESSAGE.replace("exceed_db_size_quota", "exceed_db_size_quota_extra") }), false],
    [403, `<html>${DATABASE_SIZE_MESSAGE}</html>`, false],
    [403, `{"message":${JSON.stringify(DATABASE_SIZE_MESSAGE)}`, false],
    [403, JSON.stringify([{ message: DATABASE_SIZE_MESSAGE }]), false],
    [403, JSON.stringify({ message: [DATABASE_SIZE_MESSAGE] }), false],
  ]) {
    const root = isolatedRoot(t);
    let calls = 0;
    const client = createClient("https://forward-evidence.invalid", "offline-test-placeholder", {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
      global: { fetch: async () => { calls++; return new Response(body, { status }); } },
    });
    const backend = { client, config: { url: "https://forward-evidence.invalid", serverWriteCapable: true } };
    const first = await runForwardEvidenceRemoteCommand("restore", { root, backend, writeReport: false });
    assert.equal(first.state, "REMOTE_FORWARD_EVIDENCE_FAILED");
    assert.equal(first.circuitState, trusted ? "REMOTE_DATABASE_SIZE_OUTAGE" : undefined, body);
    assert.equal(first.providerCode, trusted ? "exceed_db_size_quota" : undefined, body);
    assert.equal(fs.existsSync(path.join(root, "data", "remote-operational-circuits.json")), trusted, body);
    const next = await runForwardEvidenceRemoteCommand("sync", { root, backend, writeReport: false });
    assert.equal(next.skipped, trusted ? true : undefined, body);
    assert.equal(calls, trusted ? 1 : 2, body);
  }
});

test("invalid backend configuration is reported without recreating the failed client", async (t) => {
  const root = isolatedRoot(t);
  t.mock.method(globalThis, "fetch", async () => assert.fail("No network calls"));
  const result = await runForwardEvidenceRemoteCommand("restore", { root, writeReport: false, env: {
    SUPABASE_ENABLED: "true", SUPABASE_URL: "not-a-url", SUPABASE_SECRET_KEY: "fixture-secret",
  } });
  assert.equal(result.state, "REMOTE_FORWARD_EVIDENCE_FAILED");
  assert.match(result.error, /URL/i);
});

for (const providerCode of ["exceed_egress_quota", "exceed_db_size_quota"]) {
test(`${providerCode} persistence failure remains explicit without acknowledging remote synchronization`, async (t) => {
  const root = isolatedRoot(t);
  const backend = fakeBackend([], { onRead: () => ({ data: null, error: { code: providerCode, message: "quota" } }) });
  const rename = fs.renameSync;
  t.mock.method(fs, "renameSync", (source, target) => {
    if (String(target).endsWith("remote-operational-circuits.json")) throw new Error("fixture persistence denied");
    return rename(source, target);
  });
  const result = await runForwardEvidenceRemoteCommand("sync", { root, backend, writeReport: false });
  assert.equal(result.state, "REMOTE_FORWARD_EVIDENCE_FAILED");
  assert.equal(result.providerCode, providerCode);
  assert.equal(result.circuitState, undefined);
  assert.match(result.error, /quota/);
  assert.match(result.circuitPersistenceError, /fixture persistence denied/);
  assert.equal(result.uploaded, undefined);
  assert.equal(backend.reads.length, 1);
  assert.equal(backend.writes.length, 0);
});
}

test("operational reports stay inside the explicitly supplied workspace root", async t => {
  const root = isolatedRoot(t), backend = fakeBackend();
  const result = await runForwardEvidenceRemoteCommand("restore", { root, backend });
  const saved = JSON.parse(fs.readFileSync(path.join(root, "reports", "forward-evidence-remote-sync.json"), "utf8"));
  assert.deepEqual(saved, result);
});

test("corrupt circuit state fails closed without acknowledging or contacting remote sync", async (t) => {
  const root = isolatedRoot(t);
  const file = path.join(root, "data", "remote-operational-circuits.json");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, "not-json");
  const backend = fakeBackend();
  const report = await runForwardEvidenceRemoteCommand("sync", { root, backend, writeReport: false });
  assert.equal(report.state, "REMOTE_FORWARD_EVIDENCE_FAILED");
  assert.match(report.error, /circuit state is malformed/);
  assert.equal(backend.reads.length, 0);
  assert.equal(backend.writes.length, 0);
});

test("only an explicit successful verification clears the egress circuit", async (t) => {
  const root = isolatedRoot(t);
  const outage = fakeBackend([], { onRead: () => ({ data: null, error: { code: "exceed_egress_quota", message: "quota" } }) });
  await runForwardEvidenceRemoteCommand("restore", { root, backend: outage, writeReport: false });
  const recovered = fakeBackend([remoteRow("production-market-observations", { observationKey: "proof" })]);
  const report = await runForwardEvidenceRemoteCommand("verify", { root, backend: recovered, writeReport: false });
  assert.equal(report.state, "REMOTE_FORWARD_EVIDENCE_EGRESS_VERIFIED");
  assert.equal(report.verificationScope, "INDEXED_SERVICE_ADMISSION_ONLY");
  assert.equal(report.remoteDataRestored, false);
  assert.equal(report.remoteSyncAcknowledged, false);
  assert.equal(recovered.reads.length, 1);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, "data", "remote-operational-circuits.json"), "utf8")).incidents, {});
  assert.equal((await runForwardEvidenceRemoteCommand("sync", { root, backend: recovered, writeReport: false })).state,
    "REMOTE_FORWARD_EVIDENCE_SYNCED");
});

test("an empty or other-project verification cannot clear a scoped outage", async (t) => {
  const root = isolatedRoot(t);
  const outage = fakeBackend([], { onRead: () => ({ data: null, error: { code: "exceed_egress_quota", message: "quota" } }) });
  await runForwardEvidenceRemoteCommand("restore", { root, backend: outage, writeReport: false });
  const empty = fakeBackend();
  const report = await runForwardEvidenceRemoteCommand("verify", { root, backend: empty, writeReport: false });
  assert.equal(report.state, "REMOTE_FORWARD_EVIDENCE_FAILED");
  assert.equal((await runForwardEvidenceRemoteCommand("sync", { root, backend: empty, writeReport: false })).skipped, true);
  const other = fakeBackend([remoteRow("production-market-observations", { observationKey: "proof" })], { url: "https://other-project.supabase.co" });
  assert.equal((await runForwardEvidenceRemoteCommand("verify", { root, backend: other, writeReport: false })).state,
    "REMOTE_FORWARD_EVIDENCE_EGRESS_VERIFIED");
  assert.equal((await runForwardEvidenceRemoteCommand("sync", { root, backend: empty, writeReport: false })).skipped, true);
});

for (const [name, change] of [
  ["array hash", row => ({ ...row, content_hash: [row.content_hash] })],
  ["whitespace ID", row => ({ ...row, record_id: "   " })],
  ["oversized ID", row => ({ ...row, record_id: "x".repeat(7000) })],
]) {
  test(`${name} cannot clear a known quota incident`, async t => {
    const root = isolatedRoot(t);
    const outage = fakeBackend([], { onRead: () => ({ data: null, error: { code: "exceed_egress_quota", message: "quota" } }) });
    await runForwardEvidenceRemoteCommand("restore", { root, backend: outage, writeReport: false });
    const row = change(remoteRow("production-market-observations", { observationKey: "verification-fixture" }));
    const invalid = fakeBackend([row]);
    const result = await runForwardEvidenceRemoteCommand("verify", { root, backend: invalid, writeReport: false });
    assert.equal(result.state, "REMOTE_FORWARD_EVIDENCE_FAILED");
    assert.equal((await runForwardEvidenceRemoteCommand("sync", { root, backend: invalid, writeReport: false })).skipped, true);
    assert.equal(invalid.reads.length, 1);
  });
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

test("duplicate or persistently omitted body batches fail closed", async (t) => {
  const root = isolatedRoot(t);
  const rows = ["a", "b"].map((observationKey) => remoteRow("production-market-observations", { observationKey }));
  for (const duplicate of [false, true]) {
    const backend = fakeBackend(rows, {
      onRead: (call, data) => ({ data: call.ids ? duplicate ? [data[0], data[0]] : data.filter((row) => row.record_id !== "b") : data, error: null }),
    });
    await assert.rejects(restoreForwardEvidence({ root, backend, pageSize: 2 }), /duplicate body row|missing body/);
    assert.deepEqual(loadLocalForwardEvidence({ root }), []);
  }
});

for (const [command, execute] of [["restore", restoreForwardEvidence], ["sync", syncForwardEvidence]]) {
  test(`${command} hydrates complete bodies under a lower server row cap`, async (t) => {
    const root = isolatedRoot(t);
    const rows = ["a", "b", "c"].map((observationKey) => remoteRow("production-market-observations", { observationKey }));
    const backend = fakeBackend(rows, {
      onRead: (_call, data) => ({ data: data.slice(0, 1), error: null }),
    });
    const report = await execute({ root, backend, pageSize: 250 });
    assert.equal(report.state, command === "sync" ? "REMOTE_FORWARD_EVIDENCE_SYNCED" : "REMOTE_FORWARD_EVIDENCE_RESTORED");
    assert.deepEqual(loadLocalForwardEvidence({ root }).map((row) => row.record_id), ["a", "b", "c"]);
    assert.deepEqual(bodyReads(backend).map((call) => call.ids), [["a", "b", "c"], ["b", "c"], ["c"]]);
    assert.equal(backend.writes.length, 0);
    await execute({ root, backend, pageSize: 250 });
    assert.equal(bodyReads(backend).length, 3);
  });

  test(`${command} leaves local history intact when a later short page fails`, async (t) => {
    const root = isolatedRoot(t);
    const known = remoteRow("market-context-observations", { observationKey: "known" });
    mergeForwardEvidenceRows([known], { root });
    const rows = ["a", "b"].map((observationKey) => remoteRow("production-market-observations", { observationKey }));
    const backend = fakeBackend([...rows, known], {
      onRead: (call, data) => call.ids
        ? call.ids.includes("a") ? { data: data.slice(0, 1), error: null }
          : { data: null, error: { message: "exceed_egress_quota" } }
        : undefined,
    });
    await assert.rejects(execute({ root, backend }), /exceed_egress_quota/);
    assert.deepEqual(loadLocalForwardEvidence({ root }), [known]);
    assert.equal(backend.writes.length, 0);
  });

  for (const [name, transform, message] of [
    ["corrupt body", (rows) => [{ ...rows[0], record_json: { observationKey: "b", priceUsd: 99 } }], /hash mismatch/],
    ["unexpected ID", () => [remoteRow("production-market-observations", { observationKey: "foreign" })], /index\/body mismatch/],
    ["duplicate bodies", (rows) => [rows[0], rows[0]], /duplicate body row/],
    ["repeated previous body", () => [remoteRow("production-market-observations", { observationKey: "a" })], /index\/body mismatch/],
  ]) {
    test(`${command} rejects ${name} on a later body page without partial appends`, async (t) => {
      const root = isolatedRoot(t);
      const rows = ["a", "b", "c"].map((observationKey) => remoteRow("production-market-observations", { observationKey }));
      const backend = fakeBackend(rows, {
        onRead: (call, data) => call.ids
          ? { data: call.ids.includes("a") ? data.slice(0, 1) : transform(data), error: null }
          : undefined,
      });
      await assert.rejects(execute({ root, backend }), message);
      assert.equal(bodyReads(backend).length, 2);
      assert.deepEqual(loadLocalForwardEvidence({ root }), []);
      assert.equal(backend.writes.length, 0);
    });
  }
}

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

test("sync rejects a conflicting concurrent insert hidden by ignoreDuplicates", async (t) => {
  const root = isolatedRoot(t);
  const expected = remoteRow("production-market-observations", { observationKey: "raced", priceUsd: 1 });
  const conflicting = remoteRow("production-market-observations", { observationKey: "raced", priceUsd: 99 });
  mergeForwardEvidenceRows([expected], { root });
  const remote = [];
  const backend = fakeBackend(remote, { onWrite: () => { remote.push(conflicting); } });
  const report = await runForwardEvidenceRemoteCommand("sync", { root, backend, writeReport: false });
  assert.equal(report.state, "REMOTE_FORWARD_EVIDENCE_FAILED");
  assert.match(report.error, /Immutable forward-evidence conflict/);
  assert.deepEqual(loadLocalForwardEvidence({ root }), [expected]);
  assert.deepEqual(remote, [conflicting]);
});

test("a successful upload acknowledgement without the remote record cannot claim synced evidence", async (t) => {
  const root = isolatedRoot(t);
  const expected = remoteRow("prospective-edge-cohorts", { episodeId: "not-persisted", role: "CONTROL_MATCHED" });
  mergeForwardEvidenceRows([expected], { root });
  const backend = fakeBackend([], { onWrite: () => ({ error: null }) });
  const report = await runForwardEvidenceRemoteCommand("sync", { root, backend, writeReport: false });
  assert.equal(report.state, "REMOTE_FORWARD_EVIDENCE_FAILED");
  assert.match(report.error, /missing.*write|write.*missing/i);
  assert.deepEqual(loadLocalForwardEvidence({ root }), [expected]);
});

test("sync accepts an identical concurrent insert only after verifying its exact hash", async (t) => {
  const root = isolatedRoot(t);
  const expected = remoteRow("production-market-observations", { observationKey: "same-race", priceUsd: 1 });
  mergeForwardEvidenceRows([expected], { root });
  const remote = [];
  const backend = fakeBackend(remote, { onWrite: () => { remote.push(expected); } });
  const report = await syncForwardEvidence({ root, backend });
  assert.equal(report.state, "REMOTE_FORWARD_EVIDENCE_SYNCED");
  assert.equal(report.uploaded, 1);
  assert.deepEqual(remote, [expected]);
  assert.deepEqual(backend.reads.filter((call) => call.ids).map((call) => call.fields), ["ledger_name,record_id,content_hash"]);
  assert.equal(bodyReads(backend).length, 0);
});

test("write verification rejects duplicate, unexpected, malformed or missing remote hashes", async (t) => {
  const root = isolatedRoot(t);
  const expected = remoteRow("market-context-observations", { observationKey: "proof", context: "market" });
  mergeForwardEvidenceRows([expected], { root });
  for (const transform of [
    () => [null], (data) => [{ ...data[0], content_hash: "bad" }],
    (data) => [{ ...data[0], ledger_name: "production-market-observations" }],
    (data) => [{ ...data[0], record_id: "unrequested" }],
    (data) => [data[0], data[0]], () => [],
  ]) {
    const backend = fakeBackend([], { onRead: (call, data) => call.ids ? { data: transform(data), error: null } : undefined });
    const report = await runForwardEvidenceRemoteCommand("sync", { root, backend, writeReport: false });
    assert.equal(report.state, "REMOTE_FORWARD_EVIDENCE_FAILED");
    assert.match(report.error, /invalid page|write verification failed/);
    assert.deepEqual(loadLocalForwardEvidence({ root }), [expected]);
  }
});

test("write verification quota failures never become synced evidence", async (t) => {
  const root = isolatedRoot(t);
  const expected = remoteRow("production-market-observations", { observationKey: "stored-but-unverified" });
  mergeForwardEvidenceRows([expected], { root });
  const backend = fakeBackend([], { onRead: (call) => call.ids
    ? { data: null, error: { message: "exceed_egress_quota" } } : undefined });
  const report = await runForwardEvidenceRemoteCommand("sync", { root, backend, writeReport: false });
  assert.equal(report.state, "REMOTE_FORWARD_EVIDENCE_FAILED");
  assert.match(report.error, /exceed_egress_quota/);
  assert.equal(backend.writes.length, 1);
  assert.deepEqual(loadLocalForwardEvidence({ root }), [expected]);
});

test("write verification supports a lower metadata row cap without re-downloading bodies", async (t) => {
  const root = isolatedRoot(t);
  const rows = ["a", "b", "c"].map((episodeId) => remoteRow("prospective-edge-cohorts", { episodeId }));
  mergeForwardEvidenceRows(rows, { root });
  const backend = fakeBackend([], { onRead: (call, data) => call.ids ? { data: data.slice(0, 1), error: null } : undefined });
  const report = await syncForwardEvidence({ root, backend });
  assert.equal(report.uploaded, 3);
  assert.deepEqual(backend.reads.filter((call) => call.ids).map((call) => call.ids), [["a", "b", "c"], ["b", "c"], ["c"]]);
  assert.equal(bodyReads(backend).length, 0);
});

test("sync retains 500-record uploads and bounded metadata checks, stopping before later writes on failed proof", async (t) => {
  const root = isolatedRoot(t);
  const rows = Array.from({ length: 501 }, (_, id) => remoteRow("production-market-observations", {
    observationKey: String(id).padStart(3, "0"),
  }));
  mergeForwardEvidenceRows(rows, { root });
  const backend = fakeBackend([]);
  assert.equal((await syncForwardEvidence({ root, backend })).uploaded, 501);
  assert.deepEqual(backend.writes.map((batch) => batch.length), [500, 1]);
  const checks = backend.reads.filter((call) => call.ids);
  assert.deepEqual(checks.map((call) => call.ids.length), [...Array(10).fill(50), 1]);
  assert.ok(checks.every((call) => call.fields === "ledger_name,record_id,content_hash"));
  assert.equal(bodyReads(backend).length, 0);
  const noProof = fakeBackend([], { onWrite: () => ({ error: null }) });
  await assert.rejects(syncForwardEvidence({ root, backend: noProof }), /missing records/);
  assert.equal(noProof.writes.length, 1);
});

test("sync rejects unqueryable local IDs before attempting any upload", async (t) => {
  const root = isolatedRoot(t);
  mergeForwardEvidenceRows([remoteRow("production-market-observations", {
    observationKey: "identity:/".repeat(1000),
  })], { root });
  const backend = fakeBackend([]);
  await assert.rejects(syncForwardEvidence({ root, backend }), /record ID exceeds request byte limit/);
  assert.equal(backend.writes.length, 0);
});

test("real Supabase SDK verifies uploaded long IDs with bounded metadata and catches a concurrent conflict", async (t) => {
  for (const conflictingWrite of [false, true]) {
    const root = isolatedRoot(t);
    const suffix = "identity:/asset?(pair),chain&observedAt=".repeat(18);
    const local = Array.from({ length: 12 }, (_, id) => remoteRow("production-market-observations", {
      observationKey: `asset:${String(id).padStart(3, "0")}:${suffix}`, priceUsd: 1,
    }));
    mergeForwardEvidenceRows(local, { root });
    const remote = [];
    const requests = [];
    const client = createClient("https://forward-evidence.invalid", "offline-test-placeholder", {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
      global: { fetch: async (input, init) => {
        const url = new URL(String(input));
        assert.equal(url.origin, "https://forward-evidence.invalid");
        assert.ok(url.href.length <= 6000);
        if (init.method === "POST") {
          assert.match(new Headers(init.headers).get("prefer"), /resolution=ignore-duplicates/);
          const pending = JSON.parse(init.body);
          requests.push({ method: "POST", count: pending.length });
          if (conflictingWrite) remote.push(remoteRow("production-market-observations", {
            observationKey: local[0].record_id, priceUsd: 99,
          }));
          for (const row of pending) if (!remote.some((item) => item.ledger_name === row.ledger_name && item.record_id === row.record_id)) remote.push(row);
          return new Response(null, { status: 201 });
        }
        assert.equal(init.method, "GET");
        const params = url.searchParams;
        const fields = params.get("select").split(",");
        assert.deepEqual(fields, ["ledger_name", "record_id", "content_hash"]);
        const filter = params.get("record_id");
        const ids = filter?.startsWith("in.(") ? filter.slice(4, -1).match(/"[^"]*"|[^,]+/g)
          .map((id) => id.startsWith('"') ? id.slice(1, -1) : id) : null;
        const afterId = filter?.startsWith("gt.") ? filter.slice(3) : null;
        assert.equal(params.get("offset"), "0");
        assert.equal(params.get("order"), "record_id.asc");
        if (ids) assert.ok(ids.length <= 50);
        requests.push({ method: "GET", ids, bytes: url.href.length });
        const data = remote.filter((row) => row.ledger_name === params.get("ledger_name").slice(3))
          .filter((row) => !ids || ids.includes(row.record_id))
          .filter((row) => !afterId || row.record_id > afterId)
          .sort((a, b) => a.record_id < b.record_id ? -1 : a.record_id > b.record_id ? 1 : 0)
          .slice(0, Number(params.get("limit")))
          .map((row) => Object.fromEntries(fields.map((field) => [field, row[field]])));
        return new Response(JSON.stringify(data), { status: 200, headers: { "Content-Type": "application/json" } });
      } },
    });
    const report = await runForwardEvidenceRemoteCommand("sync", {
      root, backend: { client, config: { serverWriteCapable: true } }, writeReport: false,
    });
    assert.equal(report.state, conflictingWrite ? "REMOTE_FORWARD_EVIDENCE_FAILED" : "REMOTE_FORWARD_EVIDENCE_SYNCED");
    if (conflictingWrite) assert.match(report.error, /Immutable forward-evidence conflict/);
    else assert.equal(report.uploaded, local.length);
    const checks = requests.filter((request) => request.ids);
    assert.ok(checks.length > 0);
    assert.ok(checks.every((request) => request.ids.length < local.length && request.bytes <= 6000));
    assert.deepEqual(loadLocalForwardEvidence({ root }), local);
  }
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

for (const maxRows of [1000, 1]) {
test(`real Supabase SDK restores bounded long-ID requests under a ${maxRows}-row server cap`, async (t) => {
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
        const data = remote
          .filter((row) => row.ledger_name === ledgerFilter.slice(3))
          .filter((row) => afterId === null || row.record_id > afterId)
          .filter((row) => ids === null || ids.includes(row.record_id))
          .sort((left, right) => left.record_id < right.record_id ? -1 : left.record_id > right.record_id ? 1 : 0)
          .slice(0, Math.min(maxRows, Number(params.get("limit"))))
          .map((row) => Object.fromEntries(fields.map((field) => [field, row[field]])));
        requests.push({ fields, ids, afterId, returnedIds: data.map((row) => row.record_id) });
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
  assert.equal(bodies.flatMap((request) => request.returnedIds).length, 19);
  assert.equal(new Set(bodies.flatMap((request) => request.returnedIds)).size, 19);
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
}
