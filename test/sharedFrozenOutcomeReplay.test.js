import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import test from "node:test";
import { openDurableEvidenceArchive } from "../src/archive/durableEvidenceArchive.js";
import { createFrozenOutcomeCollector, frozenOutcomeEvidenceFromReceipt } from "../src/archive/frozenOutcomeCollector.js";
import { importFrozenOutcomeLedgers } from "../src/archive/frozenOutcomeQueue.js";
import { replayArchivedFrozenOutcomes } from "../src/archive/frozenOutcomeReplay.js";
import { freezeProspectiveEdgeCohort } from "../src/production/prospectiveEdgeCohortLedger.js";
import { runFrozenOutcomeCollection } from "../src/ops/runFrozenOutcomeCollection.js";

const decision = "2026-01-01T00:00:00.000Z", due = "2026-01-02T00:00:00.000Z";
const now = "2026-01-02T00:01:00.000Z", recoveryAt = "2026-01-02T00:03:00.000Z";
const address = n => "0x" + n.toString(16).padStart(40, "0");
function episodes(decisionAt = decision, poolOffset = 100) {
  const sourceObservedAt = new Date(Date.parse(decisionAt) - 300000).toISOString();
  const rows = [1, 2].map(n => ({ chain: "base", tokenAddress: address(n), poolAddress: poolOffset === null ? null : address(n + poolOffset), sourceObservedAt,
    priceUsd: 1, marketCapUsd: 1e7, liquidityUsd: 5e5, volume24hUsd: 1e6, evidenceCoveragePct: 90, riskScore: 20,
    priceChange24hPct: 3, roundTripExecutionCostBps: 100, executionReferenceSizeUsd: 500,
    executionCostProvenance: "TEST_ONLY", portfolioResearchScore: 80 }));
  const frozen = freezeProspectiveEdgeCohort([rows[0]], [rows[1]], { now: decisionAt, sourceObservedAt,
    requireRowSourceObservedAt: true, maxControls: 1, maximumSelections: 1, codeCommitSha: "a".repeat(40) });
  assert.equal(frozen.episodes.length, 2);
  return frozen.episodes;
}
const ledger = rows => Buffer.from(rows.map(JSON.stringify).join("\r\n") + "\r\n");
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "shared-frozen-replay-"));
  const archiveRoot = path.join(root, "archive"), archive = openDurableEvidenceArchive({ root: archiveRoot, clock: () => now });
  t.after(() => { archive.close(); fs.rmSync(root, { recursive: true, force: true }); });
  archive.claimWriter({ owner: "fixture", nowAt: now });
  return { root, archiveRoot, archive };
}
function importRows(archive, rows, at = now) {
  return importFrozenOutcomeLedgers({ archive, cohortBytes: ledger(rows), observationBytes: Buffer.alloc(0), clock: () => at });
}
function receipt(archive, task, sourceTimestamp = null) {
  const prediction = archive.readEvidence(task.recordId), identity = prediction.immutableContract;
  const requestId = "saved:" + task.taskId, diagnosticRecordId = "http-provider-response:" + requestId + ":dexscreener";
  const rawBytes = Buffer.from(JSON.stringify({ pairs: [{ chainId: identity.chain, pairAddress: identity.poolAddress,
    baseToken: { address: identity.tokenAddress }, priceUsd: "1.25", sourceTimestamp }] }));
  const header = { kind: "HTTP_PROVIDER_RESPONSE_V1_DIAGNOSTIC", taskId: task.taskId, requestId, provider: "dexscreener",
    requestedAt: now, receivedAt: now, status: 200, headers: {} };
  archive.admitPrediction({ recordId: diagnosticRecordId, rawBytes, frozenObligations: [], immutableContract: header });
  return frozenOutcomeEvidenceFromReceipt({ task, prediction, diagnosticRecordId, requestId, receipt: { ...header, rawBytes } });
}
function saveAnchors(archive, mode, sourceTimestamp = null) {
  for (;;) {
    const [task] = archive.leaseDue({ owner: "fixture", nowAt: now });
    if (!task) break;
    const evidence = receipt(archive, task, sourceTimestamp);
    if (mode === "completed") archive.completeWithEvidence({ obligationId: task.obligationId, owner: "fixture", leaseToken: task.leaseToken, evidence, nowAt: now });
    else {
      archive.admitPrediction(evidence);
      archive.transitionTask({ obligationId: task.obligationId, owner: "fixture", leaseToken: task.leaseToken, state: "retryable", nowAt: now });
      archive.reconcileHistoricalObservation({ taskId: task.taskId, evidenceRecordId: evidence.recordId, nowAt: now });
    }
  }
  assert.equal(archive.listOutcomeCaptures().length, 2);
}

for (const mutation of ["indexed-due", "indexed-expiry", "frozen-clock", "frozen-and-indexed-window", "frozen-role"]) {
  test("shared completion rolls back when a real target differs from its manifest: " + mutation, t => {
    const { archive } = fixture(t), first = episodes(), later = episodes("2026-01-01T00:00:30.000Z");
    importRows(archive, first);
    const [task] = archive.leaseDue({ owner: "fixture", nowAt: now });
    importRows(archive, [...first, ...later]);
    const parent = archive.readEvidence(task.recordId).immutableContract;
    const target = archive.listTasks().find(row => row.frozen.horizonHours === 24 && row.due_at !== due &&
      archive.readEvidence(row.record_id).immutableContract.tokenAddress === parent.tokenAddress);
    assert.ok(target);
    const evidence = receipt(archive, task, mutation === "indexed-due" ? due : now);
    const outbox = archive.listOutbox(), frozen = structuredClone(target.frozen), db = new Database(archive.dbPath);
    try {
      if (mutation === "indexed-due") db.prepare("UPDATE obligations SET due_at=? WHERE task_id=?").run(due, target.task_id);
      else if (mutation === "indexed-expiry") db.prepare("UPDATE obligations SET expires_at=? WHERE task_id=?").run(now, target.task_id);
      else {
        if (mutation === "frozen-clock") frozen.observationClockPolicy = "INDEPENDENT_MARKET_CLOCK_V1";
        else if (mutation === "frozen-role") frozen.role = "ALTERED_AFTER_ADMISSION";
        else {
          frozen.dueAt = due;
          db.prepare("UPDATE obligations SET due_at=? WHERE task_id=?").run(due, target.task_id);
        }
        db.prepare("UPDATE obligations SET frozen_json=? WHERE task_id=?").run(JSON.stringify(frozen), target.task_id);
      }
    } finally { db.close(); }
    assert.throws(() => archive.completeWithEvidence({ obligationId: task.obligationId, owner: "fixture", leaseToken: task.leaseToken,
      evidence, nowAt: now }), /ARCHIVE_TASK_CONTRACT_CORRUPT|ARCHIVE_MANIFEST_CORRUPT/);
    const anchor = archive.listTasks().find(row => row.task_id === task.taskId);
    assert.equal(anchor.state, "leased"); assert.equal(anchor.completed_at, null);
    assert.ok(archive.listTasks().every(row => !row.historicallyReconciled));
    assert.equal(archive.readEvidence(evidence.recordId), null);
    assert.deepEqual(archive.listOutbox(), outbox);
  });
}

for (const mode of ["completed", "reconciled"]) {
  test("restart reuses " + mode + " anchors saved before projection for later-imported duties without HTTP", async t => {
    const f = fixture(t), first = episodes(), later = episodes("2026-01-01T00:00:30.000Z");
    importRows(f.archive, first); saveAnchors(f.archive, mode);
    const originalCaptures = f.archive.listOutcomeCaptures(), originalTasks = f.archive.listTasks();
    const cohortFile = path.join(f.root, "cohorts.jsonl"), observationFile = path.join(f.root, "observations.jsonl");
    const cohortBytes = ledger([...first, ...later]);
    fs.writeFileSync(cohortFile, cohortBytes); fs.writeFileSync(observationFile, "");
    f.archive.releaseWriter({ nowAt: now }); f.archive.close();
    const previousActions = process.env.GITHUB_ACTIONS;
    process.env.GITHUB_ACTIONS = "false";
    t.after(() => {
      if (previousActions === undefined) delete process.env.GITHUB_ACTIONS;
      else process.env.GITHUB_ACTIONS = previousActions;
    });
    let http = 0;
    const options = { archiveRoot: f.archiveRoot, cohortFile, observationFile, clock: () => recoveryAt, collectLive: true,
      createCollector: ({ archive, clock }) => createFrozenOutcomeCollector({ archive, clock,
        dexFetcher: async () => { http++; assert.fail("saved observations must be reused before leasing"); },
        geckoFetcher: async () => { http++; assert.fail("replay must not invoke fallback HTTP"); } }) };
    const result = await runFrozenOutcomeCollection(options);
    assert.equal(result.imported.episodes, 4);
    assert.equal(result.replay.sharedReconciledDuties, 2);
    assert.equal(result.replay.providerRequests, 0);
    assert.equal(result.collection.attempted, 0); assert.equal(http, 0);
    assert.equal(result.projectionBefore.appended, 2);
    const projected = fs.readFileSync(observationFile);
    const again = await runFrozenOutcomeCollection(options);
    assert.equal(again.replay.sharedReconciledDuties, 0);
    assert.equal(again.collection.attempted, 0); assert.equal(http, 0);
    assert.deepEqual(fs.readFileSync(observationFile), projected);
    assert.deepEqual(fs.readFileSync(cohortFile), cohortBytes);
    const reopened = openDurableEvidenceArchive({ root: f.archiveRoot, clock: () => recoveryAt });
    try {
      assert.deepEqual(reopened.listOutcomeCaptures(), originalCaptures);
      for (const task of originalTasks) assert.deepEqual(reopened.listTasks().find(row => row.task_id === task.task_id), task);
      const shared = reopened.listTasks().filter(row => row.historical_source_kind === "SHARED_CAPTURED_EXACT_OBSERVATION_V1");
      assert.equal(shared.length, 2);
      assert.ok(shared.every(row => row.historical_observed_at === now && row.historical_reconciled_at === recoveryAt && row.completed_at === null));
      assert.deepEqual(reopened.coordinationStatus(recoveryAt).requests, []);
      assert.equal(reopened.audit().ok, true);
    } finally { reopened.close(); }
  });
}

test("saved-capture sweeps preserve original source windows and unresolved gaps without no-change poll writes", t => {
  const { archive } = fixture(t), first = episodes();
  importRows(archive, first); saveAnchors(archive, "completed", due);
  const compatible = episodes("2025-12-31T23:59:30.000Z");
  const later = episodes("2026-01-01T00:00:30.000Z"), future = episodes("2026-01-01T02:00:00.000Z");
  const expired = episodes("2025-12-31T00:00:00.000Z"), wrongPool = episodes("2026-01-01T00:00:15.000Z", 200);
  const unknownPool = episodes("2026-01-01T00:00:15.000Z", null);
  const imported = importRows(archive, [...first, ...compatible, ...later, ...future, ...expired, ...wrongPool, ...unknownPool]);
  assert.equal(imported.sourceIntegrityHealthy, true, JSON.stringify(imported.issues));
  assert.equal(replayArchivedFrozenOutcomes({ archive, clock: () => now }).sharedReconciledDuties, 2);
  const captures = archive.listOutcomeCaptures(), tasks = archive.listTasks();
  for (const episode of [...later, ...future, ...expired, ...wrongPool, ...unknownPool]) {
    assert.ok(tasks.filter(row => row.record_id === "frozen-episode:" + episode.episodeId)
      .every(row => !row.historicallyReconciled && row.completed_at === null));
  }
  const db = new Database(archive.dbPath), version = db.pragma("data_version", { simple: true });
  t.after(() => db.close());
  t.mock.method(archive, "renewWriter", () => assert.fail("unchanged polls must not renew per capture"));
  t.mock.method(archive, "reconcileCompatibleFrozenObligations", () => assert.fail("incompatible/resolved duties need no write transaction"));
  t.mock.method(archive, "admitPrediction", () => assert.fail("saved captures must not be readmitted"));
  t.mock.method(fs, "fsyncSync", () => assert.fail("unchanged replay must not fsync"));
  for (const at of [now, recoveryAt, "2026-01-02T00:04:00.000Z"]) {
    const replay = replayArchivedFrozenOutcomes({ archive, clock: () => at });
    assert.equal(replay.providerRequests, 0); assert.equal(replay.sharedReconciledDuties, 0);
  }
  assert.deepEqual(archive.listTasks(), tasks);
  assert.deepEqual(archive.listOutcomeCaptures(), captures);
  assert.equal(db.pragma("data_version", { simple: true }), version);
  assert.equal(archive.audit().ok, true);
  const target = tasks.find(row => later.some(episode => row.record_id === "frozen-episode:" + episode.episodeId));
  db.prepare("UPDATE obligations SET expires_at=? WHERE task_id=?").run(now, target.task_id);
  assert.equal(archive.audit().ok, false, "read-only replay filters must not weaken the full source audit");
});

test("saved capture replay validates the original anchored raw receipt before clearing any later duty", t => {
  const { archive } = fixture(t), first = episodes();
  importRows(archive, first); saveAnchors(archive, "completed");
  const [original] = archive.listOutcomeCaptures();
  archive.admitPrediction({ ...original, recordId: "aaa-invalid-saved-capture", frozenObligations: [],
    immutableContract: { ...original.immutableContract, originalDiagnosticRecordId: "missing-original-receipt" } });
  importRows(archive, [...first, ...episodes("2026-01-01T00:00:30.000Z")]);
  assert.throws(() => replayArchivedFrozenOutcomes({ archive, clock: () => now }), /SHARED_CAPTURE_ANCHOR_INVALID/);
  assert.ok(archive.listTasks().every(row => !row.historicallyReconciled));
  assert.deepEqual(archive.coordinationStatus(now).requests, []);
});
