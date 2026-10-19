import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import test from "node:test";
import { openDurableEvidenceArchive } from "../src/archive/durableEvidenceArchive.js";
import { runDurableOutcomeCycle } from "../src/archive/durableOutcomeCoordinator.js";

const start = "2026-01-01T06:00:00.000Z";
function fixture(t, count = 1) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "durable-outcome-cycle-")); let current = start;
  const clock = () => current;
  const archive = openDurableEvidenceArchive({ root, clock });
  for (let n = 0; n < count; n++) archive.admitPrediction({ recordId: `episode-${n}`, rawBytes: Buffer.from(`original-episode-${n}`),
    cohortMetadata: { role: n % 2 ? "CONTROL_MATCHED" : "TREATMENT" }, immutableContract: { chain: "solana", tokenAddress: "CaseSensitive", poolAddress: "ExactPool", outcomeHorizonsHours: [6] },
    frozenObligations: [{ obligationId: "6h", horizonHours: 6, dueAt: start, expiresAt: "2026-01-01T08:00:00.000Z" }] });
  t.after(() => { archive.close(); fs.rmSync(root, { recursive: true, force: true }); });
  const options = { archive, owner: "test-worker", clock, leaseMs: 10800000,
    globalBudget: { provider: "all-outcomes", requestLimit: 4, windowMs: 3600000 },
    providerPolicies: { dex: { requestLimit: 4, windowMs: 3600000, timeoutMs: 8000 }, gecko: { requestLimit: 4, windowMs: 3600000, timeoutMs: 8000 } } };
  return { root, archive, options, clock, set: value => { current = value; } };
}
function observation(task, receipt, body = Buffer.from("original-price-response")) {
  return { recordId: "response:" + task.taskId, rawBytes: body, frozenObligations: [], immutableContract: {
    chain: "solana", tokenAddress: "CaseSensitive", poolAddress: "ExactPool",
    observationOf: { recordId: task.recordId, taskId: task.taskId, horizonHours: 6,
      requestedAt: receipt.requestedAt, receivedAt: receipt.receivedAt, marketObservedAt: start } } };
}

test("actual cycle atomically archives a response and completes its exact obligation", async t => {
  const f = fixture(t);
  const result = await runDurableOutcomeCycle({ ...f.options, collect: async ({ task, request }) => {
    const receipt = await request("dex", async () => ({ price: 1 }));
    return observation(task, receipt);
  } });
  assert.equal(result.status, "CAPTURE_COMPLETE"); assert.equal(result.completed, 1);
  assert.equal(result.edgeEstablished, false);
  assert.equal(f.archive.coordinationStatus().writer.active, false);
  assert.equal(f.archive.coordinationStatus().providers.find(row => row.provider === "all-outcomes").used, 1);
  assert.equal(f.archive.audit().ok, true);
  const idle = await runDurableOutcomeCycle({ ...f.options, collect: () => { throw new Error("must not fetch completed work"); } });
  assert.equal(idle.status, "NO_PENDING_OUTCOMES"); assert.equal(idle.attempted, 0);
});

test("network awaits hold no SQL transaction and an independent fallback can recover", async t => {
  const f = fixture(t); const reader = new Database(f.archive.dbPath);
  try {
    const result = await runDurableOutcomeCycle({ ...f.options, collect: async ({ task, request }) => {
      try { await request("dex", async () => { const error = new Error("primary unavailable"); error.statusCode = 503; throw error; }); } catch {}
      const receipt = await request("gecko", async () => {
        reader.exec("BEGIN IMMEDIATE"); reader.exec("ROLLBACK");
        await Promise.resolve(); return { price: 1 };
      });
      return observation(task, receipt);
    } });
    assert.equal(result.completed, 1);
    assert.deepEqual(f.archive.coordinationStatus().requests.map(row => [row.state, row.count]), [["failed", 1], ["succeeded", 1]]);
    assert.equal(f.archive.audit().ok, true);
  } finally { reader.close(); }
});

test("budget exhaustion persists pending work and all due work stays in the denominator", async t => {
  const f = fixture(t, 3); let calls = 0;
  const result = await runDurableOutcomeCycle({ ...f.options, globalBudget: { ...f.options.globalBudget, requestLimit: 1 }, collect: async ({ task, request }) => {
    const receipt = await request("dex", async () => { calls++; return 1; }); return observation(task, receipt);
  } });
  assert.equal(calls, 1); assert.equal(result.completed, 1); assert.equal(result.status, "COLLECTION_INCOMPLETE");
  assert.equal(result.before.reduce((sum, row) => sum + row.count, 0), 3);
  assert.equal(result.after.reduce((sum, row) => sum + row.count, 0), 3);
  assert.equal(result.results.filter(row => row.state === "budget-deferred").length, 2);
  const second = await runDurableOutcomeCycle({ ...f.options, globalBudget: { ...f.options.globalBudget, requestLimit: 1 }, collect: () => { throw new Error("must not poll budget-deferred work early"); } });
  assert.equal(second.attempted, 0); assert.equal(second.status, "COLLECTION_INCOMPLETE");
  assert.equal(f.archive.audit().ok, true);
});

test("selection caps never convert unattempted controls into success or remove them", async t => {
  const f = fixture(t, 3);
  const result = await runDurableOutcomeCycle({ ...f.options, limit: 1, collect: async ({ task, request }) => observation(task, await request("dex", async () => 1)) });
  assert.equal(result.attempted, 1); assert.equal(result.before[0].count, 3);
  assert.equal(result.status, "COLLECTION_INCOMPLETE");
  assert.equal(result.after.find(row => row.state === "pending").count, 2);
});

test("a competing trigger does not issue network requests", async t => {
  const f = fixture(t); f.archive.claimWriter({ owner: "other", leaseMs: 10000 });
  const other = openDurableEvidenceArchive({ root: f.root, clock: f.clock });
  try {
    const result = await runDurableOutcomeCycle({ ...f.options, archive: other, collect: () => { throw new Error("competing trigger fetched evidence"); } });
    assert.equal(result.status, "WRITER_BUSY"); assert.equal(result.attempted, 0);
  } finally { other.close(); }
});

test("late original bytes are retained but never resolve the expired obligation", async t => {
  const f = fixture(t);
  const result = await runDurableOutcomeCycle({ ...f.options, collect: async ({ task, request }) => {
    const receipt = await request("dex", async () => { f.set("2026-01-01T08:00:00.001Z"); return 1; });
    return observation(task, receipt, Buffer.from("late response original bytes"));
  } });
  assert.equal(result.completed, 0); assert.equal(result.expiredMissing, 1);
  assert.equal(result.status, "COLLECTION_INCOMPLETE");
  assert.equal(f.archive.audit().records, 2); assert.equal(f.archive.audit().ok, true);
});

test("provider errors are durable retries, not a negative trade or a successful empty cycle", async t => {
  const f = fixture(t);
  const result = await runDurableOutcomeCycle({ ...f.options, collect: async ({ request }) => request("dex", async () => { throw new Error("provider down"); }) });
  assert.equal(result.status, "COLLECTION_INCOMPLETE"); assert.equal(result.completed, 0);
  assert.equal(result.results[0].state, "retryable");
  const db = new Database(f.archive.dbPath, { readonly: true });
  try { assert.equal(db.prepare("SELECT next_attempt_at FROM task_schedule").get().next_attempt_at, "2026-01-01T06:01:00.000Z"); } finally { db.close(); }
  assert.equal(f.archive.audit().ok, true);
});

test("early windows cause no requests and past windows remain missing", async t => {
  const f = fixture(t); f.set("2026-01-01T05:59:00.000Z");
  const collect = () => { throw new Error("no work should be dispatched"); };
  assert.equal((await runDurableOutcomeCycle({ ...f.options, collect })).status, "NO_OUTCOMES_DUE");
  f.set("2026-01-01T09:00:00.000Z");
  const expired = await runDurableOutcomeCycle({ ...f.options, collect });
  assert.equal(expired.status, "COLLECTION_INCOMPLETE"); assert.equal(expired.expiredMissing, 1); assert.equal(expired.attempted, 0);
  assert.deepEqual(f.archive.coordinationStatus().requests, []);
});
