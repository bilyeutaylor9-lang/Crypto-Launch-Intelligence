import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import test from "node:test";
import { openDurableEvidenceArchive, restoreDurableEvidenceArchive } from "../src/archive/durableEvidenceArchive.js";
import { createFrozenOutcomeCollector, frozenOutcomeEvidenceFromReceipt } from "../src/archive/frozenOutcomeCollector.js";
import { importFrozenOutcomeLedgers } from "../src/archive/frozenOutcomeQueue.js";
import { replayArchivedFrozenOutcomes } from "../src/archive/frozenOutcomeReplay.js";
import { runDurableOutcomeCycle } from "../src/archive/durableOutcomeCoordinator.js";
import { freezeProspectiveEdgeCohort } from "../src/production/prospectiveEdgeCohortLedger.js";

const now = "2026-01-02T00:01:00.000Z", due = "2026-01-02T00:00:00.000Z", expiry = "2026-01-02T01:00:00.000Z";
const address = n => "0x" + n.toString(16).padStart(40, "0");
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "shared-frozen-outcome-"));
  const archive = openDurableEvidenceArchive({ root, clock: () => now });
  t.after(() => { archive.close(); fs.rmSync(root, { recursive: true, force: true }); });
  return { root, archive };
}
function add(archive, id, overrides = {}) {
  const { dueAt = due, expiresAt = expiry, policy = "COLLECTION_RECEIPT_V1", kind = "FROZEN_EPISODE_OUTCOME_OBLIGATIONS_V1", ...identity } = overrides;
  return archive.admitPrediction({ recordId: id, rawBytes: Buffer.from("synthetic archive policy fixture:" + id),
    immutableContract: { kind, chain: "base", tokenAddress: address(1), poolAddress: address(100), outcomeHorizonsHours: [24], ...identity },
    frozenObligations: [{ obligationId: id + ":24h", horizonHours: 24, dueAt, expiresAt, observationClockPolicy: policy }] });
}
function saveReceipt(archive, task, prediction) {
  const identity = prediction.immutableContract;
  const rawBytes = Buffer.from(JSON.stringify({ pairs: [{ chainId: identity.chain, pairAddress: identity.poolAddress,
    baseToken: { address: identity.tokenAddress }, priceUsd: "1.25" }] }));
  const header = { kind: "HTTP_PROVIDER_RESPONSE_V1_DIAGNOSTIC", taskId: task.taskId, requestId: "original-request",
    provider: "dexscreener", requestedAt: now, receivedAt: now, status: 200, url: "https://fixture.invalid/exact", headers: {} };
  const diagnosticRecordId = "http-provider-response:original-request:dexscreener";
  archive.admitPrediction({ recordId: diagnosticRecordId, rawBytes, frozenObligations: [], immutableContract: header });
  return frozenOutcomeEvidenceFromReceipt({ task, prediction, diagnosticRecordId, requestId: header.requestId, receipt: { ...header, rawBytes } });
}
function realFrozenEpisodes() {
  const episodes = [];
  for (const decisionAt of ["2026-01-01T00:00:00.000Z", "2026-01-01T00:00:30.000Z", "2026-01-01T02:00:00.000Z"]) {
    const sourceObservedAt = new Date(Date.parse(decisionAt) - 300000).toISOString();
    const candidates = [1, 2].map(n => ({ chain: "base", tokenAddress: address(n), poolAddress: address(n + 100), sourceObservedAt,
      priceUsd: 1, marketCapUsd: 1e7, liquidityUsd: 5e5, volume24hUsd: 1e6, evidenceCoveragePct: 90, riskScore: 20,
      priceChange24hPct: 3, roundTripExecutionCostBps: 100, executionReferenceSizeUsd: 500, executionCostProvenance: "TEST_ONLY", portfolioResearchScore: 80 }));
    const frozen = freezeProspectiveEdgeCohort([candidates[0]], [candidates[1]], { now: decisionAt, sourceObservedAt,
      requireRowSourceObservedAt: true, maxControls: 1, maximumSelections: 1, codeCommitSha: "a".repeat(40) });
    assert.equal(frozen.episodes.length, 2); episodes.push(...frozen.episodes);
  }
  return episodes;
}

test("one actual request resolves compatible real frozen windows without increasing independent observations", async t => {
  const { root, archive } = fixture(t);
  archive.claimWriter({ owner: "import", nowAt: now });
  const imported = importFrozenOutcomeLedgers({ archive, cohortBytes: Buffer.from(realFrozenEpisodes().map(JSON.stringify).join("\n")), observationBytes: Buffer.alloc(0), clock: () => now });
  assert.equal(imported.tasks, 30); archive.releaseWriter({ nowAt: now });
  let calls = 0;
  const collect = createFrozenOutcomeCollector({ archive, clock: () => now, dexFetcher: async options => {
    calls++;
    const rawBytes = Buffer.from(JSON.stringify({ pairs: [{ chainId: options.chain, pairAddress: options.poolAddress,
      baseToken: { address: options.tokenAddress }, priceUsd: "1.3" }] }));
    await options.onResponseBytes({ provider: "dexscreener", requestedAt: now, receivedAt: now, status: 200, headers: {}, rawBytes });
    return JSON.parse(rawBytes);
  } });
  const result = await runDurableOutcomeCycle({ archive, owner: "collector", collect, clock: () => now, limit: 1,
    globalBudget: { provider: "all", requestLimit: 1, windowMs: 3600000 },
    providerPolicies: { dexscreener: { requestLimit: 1, windowMs: 3600000, timeoutMs: 8000 } } });
  assert.equal(calls, 1); assert.equal(result.capturedObservations, 1); assert.equal(result.sharedReconciledDuties, 1); assert.equal(result.resolvedDuties, 2);
  assert.equal(archive.listOutcomeCaptures().length, 1); assert.equal(archive.listTasks().length, 30);
  assert.equal(result.before.reduce((sum, row) => sum + row.count, 0), result.after.reduce((sum, row) => sum + row.count, 0));
  assert.equal(archive.audit().ok, true, JSON.stringify(archive.audit()));
  const shared = archive.listTasks().filter(task => task.historical_source_kind === "SHARED_CAPTURED_EXACT_OBSERVATION_V1");
  assert.equal(shared.length, 1); assert.equal(shared[0].completed_at, null);
  assert.ok(archive.listTasks().filter(task => task.due_at > now).every(task => !task.historicallyReconciled && task.completed_at === null));
  archive.claimWriter({ owner: "export", nowAt: now });
  const portable = archive.exportArchive(path.join(root, "portable")), restored = restoreDurableEvidenceArchive({ source: portable, root: path.join(root, "restore") });
  try { assert.equal(restored.audit().ok, true); assert.deepEqual(restored.listTasks(), archive.listTasks()); } finally { restored.close(); }
  const db = new Database(archive.dbPath);
  try { db.prepare("UPDATE historical_reconciliations SET observation_hash=? WHERE task_id=?").run("0".repeat(64), shared[0].task_id); } finally { db.close(); }
  assert.equal(archive.audit().ok, false);
});

test("shared capture enforces every target identity, window and admitted clock policy", t => {
  const { archive } = fixture(t); add(archive, "anchor"); archive.claimWriter({ owner: "writer", nowAt: now });
  const [task] = archive.leaseDue({ owner: "writer", nowAt: now });
  for (const [id, overrides] of [
    ["compatible", {}], ["future", { dueAt: "2026-01-02T00:02:00.000Z" }],
    ["expired", { expiresAt: "2026-01-02T00:00:59.999Z" }], ["different-token", { tokenAddress: address(2) }],
    ["different-pool", { poolAddress: address(101) }], ["different-chain", { chain: "ethereum" }],
    ["unknown-pool", { poolAddress: null }], ["independent-clock", { policy: "INDEPENDENT_MARKET_CLOCK_V1" }],
    ["other-family", { kind: "UNRELATED_ARCHIVE_RECORD" }],
  ]) add(archive, id, overrides);
  const evidence = saveReceipt(archive, task, archive.readEvidence(task.recordId));
  const result = archive.completeWithEvidence({ obligationId: task.obligationId, owner: "writer", leaseToken: task.leaseToken, evidence, returnReceipt: true, nowAt: now });
  assert.deepEqual(result, { completed: true, sharedReconciled: 1 });
  assert.deepEqual(archive.listTasks().filter(row => row.historicallyReconciled).map(row => row.record_id), ["compatible"]);
  assert.equal(archive.audit().ok, true);
});

test("Solana case variants do not become the same shared token or pool", t => {
  const { archive } = fixture(t);
  const tokenAddress = "tSATdGGSLYBVCrm3pXiib8NmzKcB1iUdjRRseNGssxu", poolAddress = "HBYptNEWREPFK2UmaVtfg8Mfp9D8Xye41Ueo9wZo9oX4";
  const identity = { chain: "solana", tokenAddress, poolAddress };
  add(archive, "anchor", identity); archive.claimWriter({ owner: "writer", nowAt: now });
  const [task] = archive.leaseDue({ owner: "writer", nowAt: now });
  add(archive, "same", identity);
  add(archive, "other-token-case", { ...identity, tokenAddress: tokenAddress.replace("SAT", "SaT") });
  add(archive, "other-pool-case", { ...identity, poolAddress: poolAddress.replace("HBY", "HBy") });
  const result = archive.completeWithEvidence({ obligationId: task.obligationId, owner: "writer", leaseToken: task.leaseToken,
    evidence: saveReceipt(archive, task, archive.readEvidence(task.recordId)), returnReceipt: true, nowAt: now });
  assert.equal(result.sharedReconciled, 1); assert.equal(archive.audit().ok, true);
});

test("failed shared linkage rolls back anchor completion and saved raw bytes replay without another request", t => {
  const { archive } = fixture(t); add(archive, "anchor"); archive.claimWriter({ owner: "writer", nowAt: now });
  const [task] = archive.leaseDue({ owner: "writer", nowAt: now }); add(archive, "compatible");
  const evidence = saveReceipt(archive, task, archive.readEvidence(task.recordId));
  const db = new Database(archive.dbPath);
  try { db.exec("CREATE TRIGGER reject_shared BEFORE INSERT ON historical_reconciliations WHEN NEW.source_kind='SHARED_CAPTURED_EXACT_OBSERVATION_V1' BEGIN SELECT RAISE(ABORT,'SIMULATED_SHARED_WRITE_FAILURE'); END;"); } finally { db.close(); }
  assert.throws(() => archive.completeWithEvidence({ obligationId: task.obligationId, owner: "writer", leaseToken: task.leaseToken, evidence, nowAt: now }), /SIMULATED_SHARED_WRITE_FAILURE/);
  assert.equal(archive.listTasks().find(row => row.task_id === task.taskId).completed_at, null);
  assert.equal(archive.listTasks().some(row => row.historicallyReconciled), false);
  archive.admitPrediction(evidence);
  assert.equal(archive.transitionTask({ obligationId: task.obligationId, owner: "writer", leaseToken: task.leaseToken, state: "retryable", nowAt: now }), true);
  const database = new Database(archive.dbPath); try { database.exec("DROP TRIGGER reject_shared"); } finally { database.close(); }
  const replay = replayArchivedFrozenOutcomes({ archive, clock: () => now });
  assert.equal(replay.providerRequests, 0); assert.equal(replay.reconciled, 1); assert.equal(replay.sharedReconciledDuties, 1);
  assert.equal(archive.listTasks().filter(row => row.historicallyReconciled).length, 2);
  assert.equal(archive.audit().ok, true, JSON.stringify(archive.audit()));
});
