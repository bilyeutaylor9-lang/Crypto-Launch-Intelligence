import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import Database from "better-sqlite3";
import test from "node:test";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { openDurableEvidenceArchive, restoreDurableEvidenceArchive } from "../src/archive/durableEvidenceArchive.js";

const initial = "2026-01-01T06:00:00.000Z";
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "evidence-coordinator-"));
  let current = initial;
  const stores = [];
  const open = () => {
    const store = openDurableEvidenceArchive({ root, clock: () => current }); stores.push(store); return store;
  };
  t.after(() => { for (const store of stores) store.close(); fs.rmSync(root, { recursive: true, force: true }); });
  return { root, open, set: time => { current = time; } };
}
function prediction(id = "episode-1", role = "TREATMENT") {
  return { recordId: id, rawBytes: Buffer.from(`original:${id}`), cohortMetadata: { role }, immutableContract: { tokenAddress: "CaseSensitive", outcomeHorizonsHours: [6] },
    frozenObligations: [{ obligationId: "six-hour", horizonHours: 6, dueAt: initial, expiresAt: "2026-01-01T08:00:00.000Z" }] };
}
const policy = { provider: "dex", windowMs: 3600000, requestLimit: 2 };

test("persistent single writer fences legacy handles, stale owners, and released ownership", t => {
  const f = fixture(t), first = f.open(), second = f.open();
  first.admitPrediction(prediction());
  const lease = first.claimWriter({ owner: "capture", leaseMs: 1000 }); assert.ok(lease.writerToken);
  assert.equal(second.claimWriter({ owner: "dashboard" }), null);
  assert.throws(() => second.admitPrediction(prediction("competing")), /WRITER_NOT_OWNED/);
  assert.throws(() => second.leaseDue({ owner: "other" }), /WRITER_NOT_OWNED/);
  assert.equal(second.dueDenominators().reduce((sum, row) => sum + row.count, 0), 1);
  f.set("2026-01-01T06:00:02.000Z");
  assert.ok(second.claimWriter({ owner: "replacement" }));
  assert.throws(() => first.leaseDue({ owner: "old" }), /WRITER_NOT_OWNED/);
  assert.equal(first.releaseWriter(), false);
  assert.equal(second.releaseWriter(), true);
  assert.throws(() => second.admitPrediction(prediction("after-release")), /WRITER_NOT_OWNED/);
  assert.ok(first.claimWriter({ owner: "capture-again" }));
  assert.equal(first.audit().ok, true);
});

test("polling and restart cannot reset a provider window or refund an interrupted reservation", t => {
  const f = fixture(t), first = f.open(); first.claimWriter({ owner: "first" });
  const reserved = first.reserveProviderRequest(policy); assert.equal(reserved.reserved, true);
  assert.equal(first.releaseWriter(), true); first.close();
  f.set("2026-01-01T06:01:00.000Z");
  const reopened = f.open(); reopened.claimWriter({ owner: "after-crash", leaseMs: 4000000 });
  assert.equal(reopened.reserveProviderRequest(policy).reserved, true);
  const blocked = reopened.reserveProviderRequest(policy);
  assert.deepEqual(blocked, { reserved: false, reason: "PROVIDER_BUDGET_EXHAUSTED", retryAt: "2026-01-01T07:00:00.000Z" });
  assert.throws(() => reopened.reserveProviderRequest({ ...policy, requestLimit: 3 }), /POLICY_CONFLICT/);
  assert.equal(reopened.coordinationStatus().providers[0].used, 2);
  f.set("2026-01-01T07:00:00.000Z");
  assert.equal(reopened.reserveProviderRequest(policy).reserved, true);
  assert.equal(reopened.audit().ok, true);
});

test("zero request allowance and unclaimed provider writes fail closed", t => {
  const f = fixture(t), store = f.open();
  assert.throws(() => store.reserveProviderRequest(policy), /NOT_CLAIMED/);
  store.claimWriter({ owner: "worker" });
  assert.equal(store.reserveProviderRequest({ ...policy, requestLimit: 0 }).reserved, false);
  assert.deepEqual(store.coordinationStatus().requests, []);
});

test("fallback providers share one atomic total budget without double-counting HTTP requests", t => {
  const f = fixture(t), store = f.open(); store.claimWriter({ owner: "worker" });
  const globalBudget = { provider: "all-outcome-requests", windowMs: 3600000, requestLimit: 2 };
  const dex = store.reserveProviderRequest({ ...policy, globalBudget }); assert.equal(dex.reserved, true);
  const gecko = store.reserveProviderRequest({ ...policy, provider: "gecko", globalBudget }); assert.equal(gecko.reserved, true);
  assert.equal(store.reserveProviderRequest({ ...policy, provider: "gecko", globalBudget }).reserved, false);
  assert.deepEqual(store.coordinationStatus().requests, [{ state: "reserved", count: 2, units: 2 }]);
  const total = store.coordinationStatus().providers.find(row => row.provider === globalBudget.provider);
  assert.equal(total.used, 2);
  assert.equal(store.audit().ok, true);
});

test("protected first-attempt capacity cannot be consumed by repeated fallbacks", t => {
  const f = fixture(t), store = f.open();
  for (let n = 0; n < 4; n++) store.admitPrediction(prediction("episode-" + n));
  store.claimWriter({ owner: "worker" });
  const tasks = store.leaseDue({ owner: "worker", limit: 4 });
  const globalBudget = { provider: "balanced-total-v1", windowMs: 3600000, requestLimit: 4, balanceOutcomeAttempts: true };
  const reserve = task => store.reserveProviderRequest({ ...policy, requestLimit: 20, globalBudget, taskId: task.taskId });
  assert.equal(reserve(tasks[0]).reserved, true);
  assert.equal(reserve(tasks[0]).reserved, true);
  assert.equal(reserve(tasks[0]).reserved, true);
  assert.equal(reserve(tasks[0]).reason, "OUTCOME_ATTEMPT_CAPACITY_RESERVED");
  assert.equal(reserve(tasks[1]).reserved, true);
  assert.equal(reserve(tasks[3]).reason, "PROVIDER_BUDGET_EXHAUSTED");
  assert.equal(store.coordinationStatus().providers.find(row => row.provider === globalBudget.provider).used, 4);
  assert.equal(store.audit().ok, true);
});

test("fallback capacity remains available while pending retries share the same budget", t => {
  const f = fixture(t), store = f.open();
  for (let n = 0; n < 4; n++) store.admitPrediction(prediction("episode-" + n));
  store.claimWriter({ owner: "worker" });
  const tasks = store.leaseDue({ owner: "worker", limit: 4 });
  const globalBudget = { provider: "balanced-total-v1", windowMs: 3600000, requestLimit: 4, balanceOutcomeAttempts: true };
  const reserve = task => store.reserveProviderRequest({ ...policy, requestLimit: 20, globalBudget, taskId: task.taskId });
  assert.equal(reserve(tasks[0]).reserved, true);
  assert.equal(reserve(tasks[1]).reserved, true);
  assert.equal(reserve(tasks[2]).reason, "OUTCOME_ATTEMPT_CAPACITY_RESERVED");
  assert.equal(reserve(tasks[0]).reserved, true);
  assert.equal(reserve(tasks[1]).reserved, true);
  const db = new Database(store.dbPath, { readonly: true });
  try { assert.deepEqual(db.prepare("SELECT attempt_kind,COUNT(*) n FROM provider_requests GROUP BY 1 ORDER BY 1").all(), [
    { attempt_kind: "FIRST_ATTEMPT", n: 2 }, { attempt_kind: "RETRY_OR_FALLBACK", n: 2 },
  ]); } finally { db.close(); }
  assert.equal(store.audit().ok, true);
});

test("actual HTTP receipt and provider pacing survive delayed storage and restart", t => {
  const f = fixture(t), store = f.open(); store.claimWriter({ owner: "worker" });
  const reserved = store.reserveProviderRequest(policy); store.markProviderDispatched(reserved);
  f.set("2026-01-01T06:00:01.000Z");
  store.finishProviderRequest({ ...reserved, success: true, statusCode: 200, receivedAt: initial, minimumIntervalMs: 6100 });
  assert.equal(store.reserveProviderRequest(policy).retryAt, "2026-01-01T06:00:06.100Z");
  store.releaseWriter(); store.close();
  const reopened = f.open(); reopened.claimWriter({ owner: "restart" });
  assert.equal(reopened.reserveProviderRequest(policy).reason, "PROVIDER_COOLDOWN");
  assert.equal(reopened.audit().ok, true);
});

test("a provider-specific cooldown does not suppress an independent fallback", t => {
  const f = fixture(t), store = f.open(); store.claimWriter({ owner: "worker" });
  const globalBudget = { provider: "total", windowMs: 3600000, requestLimit: 10 };
  const request = store.reserveProviderRequest({ ...policy, globalBudget });
  store.markProviderDispatched(request); store.finishProviderRequest({ ...request, success: false, statusCode: 429, retryAfterMs: 60000 });
  assert.equal(store.reserveProviderRequest({ ...policy, globalBudget }).reserved, false);
  assert.equal(store.reserveProviderRequest({ ...policy, provider: "gecko", globalBudget }).reserved, true);
  assert.equal(store.coordinationStatus().providers.find(row => row.provider === "total").used, 2);
  assert.equal(store.audit().ok, true);
});

test("429 cooldown and provider failure circuit survive a process restart", t => {
  const f = fixture(t), store = f.open(); store.claimWriter({ owner: "worker" });
  const request = store.reserveProviderRequest({ ...policy, requestLimit: 20 });
  assert.equal(store.markProviderDispatched(request), true);
  assert.equal(store.finishProviderRequest({ ...request, success: false, statusCode: 429, retryAfterMs: 60000 }), true);
  assert.equal(store.coordinationStatus().providers[0].consecutive_failures, 0);
  store.releaseWriter(); store.close();
  const reopened = f.open(); reopened.claimWriter({ owner: "worker-after-restart", leaseMs: 300000 });
  assert.equal(reopened.reserveProviderRequest({ ...policy, requestLimit: 20 }).reason, "PROVIDER_COOLDOWN");
  f.set("2026-01-01T06:01:00.000Z");
  for (let i = 0; i < 3; i++) {
    const next = reopened.reserveProviderRequest({ ...policy, requestLimit: 20 }); assert.equal(next.reserved, true);
    reopened.markProviderDispatched(next);
    reopened.finishProviderRequest({ ...next, success: false, statusCode: 503 });
  }
  assert.equal(reopened.reserveProviderRequest({ ...policy, requestLimit: 20 }).retryAt, "2026-01-01T06:02:00.000Z");
  assert.equal(reopened.audit().ok, true);
});

test("retry scheduling survives restart and does not hide cap-deferred or expired work", t => {
  const f = fixture(t), store = f.open();
  store.admitPrediction(prediction("treatment", "TREATMENT"));
  store.admitPrediction(prediction("control", "CONTROL_MATCHED"));
  store.claimWriter({ owner: "worker" });
  const [leased] = store.leaseDue({ owner: "worker", limit: 1 });
  store.transitionTask({ obligationId: leased.obligationId, owner: "worker", leaseToken: leased.leaseToken, state: "budget-deferred", retryAt: "2026-01-01T07:00:00.000Z" });
  store.releaseWriter(); store.close();
  const reopened = f.open(); reopened.claimWriter({ owner: "restart", leaseMs: 10800000 });
  const [other] = reopened.leaseDue({ owner: "restart", limit: 10 });
  assert.notEqual(other.recordId, leased.recordId);
  assert.equal(reopened.dueDenominators().reduce((sum, row) => sum + row.count, 0), 2);
  assert.throws(() => reopened.transitionTask({ obligationId: other.obligationId, owner: "restart", leaseToken: other.leaseToken, state: "retryable", retryAt: "2026-01-01T05:59:00.000Z" }), /BACKDATED/);
  f.set("2026-01-01T08:00:00.001Z");
  assert.deepEqual(reopened.dueDenominators(), [{ state: "expired", count: 2 }]);
  assert.deepEqual(reopened.leaseDue({ owner: "restart" }), []);
  assert.equal(reopened.audit().ok, true);
});

test("portable restoration retains ownership, budgets, dispatches, and retry schedules", t => {
  const f = fixture(t), store = f.open(); store.admitPrediction(prediction());
  store.claimWriter({ owner: "worker" });
  const [task] = store.leaseDue({ owner: "worker" });
  const request = store.reserveProviderRequest({ ...policy, taskId: task.taskId }); store.markProviderDispatched(request);
  store.transitionTask({ obligationId: task.obligationId, owner: "worker", leaseToken: task.leaseToken, state: "retryable", retryAt: "2026-01-01T07:00:00.000Z" });
  const source = store.exportArchive(path.join(f.root, "export"));
  const restored = restoreDurableEvidenceArchive({ source, root: path.join(f.root, "restored") });
  try {
    assert.equal(restored.coordinationStatus(initial).writer.active, true);
    assert.equal(restored.coordinationStatus(initial).providers[0].used, 1);
    assert.deepEqual(restored.coordinationStatus(initial).requests, [{ state: "dispatched", count: 1, units: 1 }]);
    assert.equal(restored.claimWriter({ owner: "too-early", nowAt: initial }), null);
    const db = new Database(restored.dbPath, { readonly: true });
    try { assert.equal(db.prepare("SELECT next_attempt_at FROM task_schedule").get().next_attempt_at, "2026-01-01T07:00:00.000Z"); } finally { db.close(); }
    assert.equal(restored.audit().ok, true);
  } finally { restored.close(); }
});

test("version-one portable provider receipts migrate without inventing first-attempt labels", t => {
  const f = fixture(t), store = f.open(); store.claimWriter({ owner: "legacy-worker" });
  const reserved = store.reserveProviderRequest(policy); store.markProviderDispatched(reserved);
  const source = store.exportArchive(path.join(f.root, "legacy-export"));
  const snapshot = JSON.parse(fs.readFileSync(source)); snapshot.operationalStateSchemaVersion = 1;
  delete snapshot.tables.historical_reconciliations;
  for (const row of snapshot.tables.provider_requests) { delete row.attempt_kind; delete row.finished_at; }
  const bytes = Buffer.from(JSON.stringify(snapshot));
  fs.writeFileSync(source, bytes); fs.writeFileSync(source + ".sha256", crypto.createHash("sha256").update(bytes).digest("hex"));
  const restored = restoreDurableEvidenceArchive({ source, root: path.join(f.root, "legacy-restored") });
  try {
    const db = new Database(restored.dbPath, { readonly: true });
    try { assert.equal(db.prepare("SELECT attempt_kind FROM provider_requests").get().attempt_kind, "LEGACY_UNCLASSIFIED"); } finally { db.close(); }
    assert.equal(restored.coordinationStatus(initial).providers[0].used, 1); assert.equal(restored.audit().ok, true);
  } finally { restored.close(); }
});

test("legacy export compatibility does not permit silently dropped operational tables", t => {
  const f = fixture(t), store = f.open(); store.admitPrediction(prediction());
  const source = store.exportArchive(path.join(f.root, "export"));
  const snapshot = JSON.parse(fs.readFileSync(source, "utf8"));
  delete snapshot.tables.provider_requests;
  const write = () => {
    const bytes = Buffer.from(JSON.stringify(snapshot)); fs.writeFileSync(source, bytes);
    fs.writeFileSync(source + ".sha256", crypto.createHash("sha256").update(bytes).digest("hex"));
  };
  write();
  assert.throws(() => restoreDurableEvidenceArchive({ source, root: path.join(f.root, "invalid") }), /UNSUPPORTED_ARCHIVE_EXPORT/);
  delete snapshot.operationalStateSchemaVersion;
  for (const table of ["writer_coordination", "provider_windows", "task_schedule", "historical_reconciliations"]) delete snapshot.tables[table];
  write();
  const restored = restoreDurableEvidenceArchive({ source, root: path.join(f.root, "legacy") });
  try { assert.equal(restored.audit().ok, true); assert.equal(restored.coordinationStatus().writerEnforced, false); } finally { restored.close(); }
});

test("budget corruption is detected and cannot be exported as a healthy archive", t => {
  const f = fixture(t), store = f.open(); store.claimWriter({ owner: "worker" }); store.reserveProviderRequest(policy);
  const db = new Database(store.dbPath);
  try { db.prepare("UPDATE provider_windows SET used=0").run(); } finally { db.close(); }
  assert.ok(store.audit().errors.includes("ARCHIVE_PROVIDER_BUDGET_CORRUPT"));
  assert.throws(() => store.reserveProviderRequest(policy), /BUDGET_CORRUPT/);
  assert.throws(() => store.exportArchive(path.join(f.root, "bad-export")), /BUDGET_CORRUPT/);
});

test("receipt-clock work must be explicitly admitted and preserves unknown provider time as null", t => {
  const f = fixture(t), store = f.open(), input = prediction();
  input.frozenObligations[0].observationClockPolicy = "COLLECTION_RECEIPT_V1";
  store.admitPrediction(input); store.claimWriter({ owner: "worker" });
  const [task] = store.leaseDue({ owner: "worker" });
  const evidence = { recordId: "receipt-snapshot", rawBytes: Buffer.from("original response without provider clock"), frozenObligations: [], immutableContract: {
    tokenAddress: "CaseSensitive", observationOf: { recordId: input.recordId, taskId: task.taskId, horizonHours: 6,
      requestedAt: initial, receivedAt: initial, marketObservedAt: null, observationClockPolicy: "COLLECTION_RECEIPT_V1" } } };
  assert.equal(store.completeWithEvidence({ owner: "worker", obligationId: task.obligationId, leaseToken: task.leaseToken, evidence }), true);
  assert.equal(store.readEvidence(evidence.recordId).immutableContract.observationOf.marketObservedAt, null);
  assert.equal(store.audit().ok, true);
});

test("a receipt cannot retrospectively waive the independent clock requirement", t => {
  const f = fixture(t), store = f.open(), input = prediction();
  store.admitPrediction(input); store.claimWriter({ owner: "worker" });
  const [task] = store.leaseDue({ owner: "worker" });
  const evidence = { recordId: "unknown-market-clock", rawBytes: Buffer.from("unknown source clock"), frozenObligations: [], immutableContract: {
    tokenAddress: "CaseSensitive", observationOf: { recordId: input.recordId, taskId: task.taskId, horizonHours: 6,
      requestedAt: initial, receivedAt: initial, marketObservedAt: null, observationClockPolicy: "COLLECTION_RECEIPT_V1" } } };
  assert.throws(() => store.completeWithEvidence({ owner: "worker", obligationId: task.obligationId, leaseToken: task.leaseToken, evidence }), /OBSERVATION_CONTRACT_MISMATCH/);
  assert.equal(store.dueDenominators()[0].state, "leased");
});

test("SIGKILL preserves dispatched budget charges and reclaims rather than loses leased work", async t => {
  const f = fixture(t), store = f.open(); store.admitPrediction(prediction()); store.close();
  const moduleUrl = new URL("../src/archive/durableEvidenceArchive.js", import.meta.url).href;
  const script = `
    const { openDurableEvidenceArchive } = await import(${JSON.stringify(moduleUrl)});
    const archive = openDurableEvidenceArchive({ root: process.argv[1], clock: () => ${JSON.stringify(initial)} });
    archive.claimWriter({ owner: 'killed-worker', leaseMs: 1000 });
    const [task] = archive.leaseDue({ owner: 'killed-worker', leaseMs: 1000 });
    const request = archive.reserveProviderRequest({ provider: 'dex', windowMs: 3600000, requestLimit: 2, taskId: task.taskId });
    archive.markProviderDispatched(request);
    process.stdout.write('DISPATCH_COMMITTED\\n');
    setInterval(() => {}, 1000);
  `;
  const child = spawn(process.execPath, ["--input-type=module", "-e", script, f.root], { stdio: ["ignore", "pipe", "pipe"] });
  t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL"); });
  let stderr = ""; child.stderr.on("data", bytes => { stderr += bytes; });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("child failed to commit dispatch: " + stderr)), 10000);
    child.stdout.on("data", bytes => { if (bytes.toString().includes("DISPATCH_COMMITTED")) { clearTimeout(timer); resolve(); } });
    child.once("error", error => { clearTimeout(timer); reject(error); });
    child.once("exit", code => { clearTimeout(timer); reject(new Error("child exited before kill: " + code + " " + stderr)); });
  });
  const exited = once(child, "exit"); child.kill("SIGKILL");
  const [, signal] = await exited; assert.equal(signal, "SIGKILL");
  f.set("2026-01-01T06:00:02.000Z");
  const restarted = f.open(); restarted.claimWriter({ owner: "replacement" });
  assert.equal(restarted.coordinationStatus().providers[0].used, 1);
  assert.deepEqual(restarted.coordinationStatus().requests, [{ state: "dispatched", count: 1, units: 1 }]);
  assert.deepEqual(restarted.dueDenominators(), [{ state: "pending", count: 1 }]);
  assert.equal(restarted.leaseDue({ owner: "replacement" }).length, 1);
  assert.equal(restarted.audit().ok, true);
});
