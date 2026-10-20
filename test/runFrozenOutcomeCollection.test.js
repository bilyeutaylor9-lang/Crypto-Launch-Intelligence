import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { runFrozenOutcomeCollection } from "../src/ops/runFrozenOutcomeCollection.js";
import { createFrozenOutcomeCollector } from "../src/archive/frozenOutcomeCollector.js";
import { openDurableEvidenceArchive } from "../src/archive/durableEvidenceArchive.js";
import { freezeProspectiveEdgeCohort } from "../src/production/prospectiveEdgeCohortLedger.js";

const decision = "2026-01-01T00:00:00.000Z", now = "2026-01-01T01:05:00.000Z";
const address = n => "0x" + n.toString(16).padStart(40, "0");
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "frozen-outcome-cli-"));
  const rows = [1, 2].map(n => ({ chain: "base", tokenAddress: address(n), poolAddress: address(n + 10000),
    sourceObservedAt: "2025-12-31T23:55:00.000Z", priceUsd: 1, marketCapUsd: 1e7, liquidityUsd: 5e5,
    volume24hUsd: 1e6, evidenceCoveragePct: 90, riskScore: 20, priceChange24hPct: 3,
    roundTripExecutionCostBps: 100, executionReferenceSizeUsd: 500, executionCostProvenance: "TEST_ONLY",
    portfolioResearchScore: 80 }));
  const frozen = freezeProspectiveEdgeCohort([rows[0]], [rows[1]], { now: decision,
    sourceObservedAt: rows[0].sourceObservedAt, requireRowSourceObservedAt: true, maxControls: 1,
    maximumSelections: 1, codeCommitSha: "a".repeat(40) });
  assert.equal(frozen.episodes.length, 2);
  const cohortFile = path.join(root, "cohorts.jsonl"), observationFile = path.join(root, "observations.jsonl");
  const original = Buffer.from(frozen.episodes.map(row => JSON.stringify(row)).join("\r\n") + "\r\n");
  fs.writeFileSync(cohortFile, original); fs.writeFileSync(observationFile, "");
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { root, original, cohortFile, observationFile, archiveRoot: path.join(root, "archive"), clock: () => now, rows };
}
function dexFixture(f, calls) {
  return ({ archive, clock }) => createFrozenOutcomeCollector({ archive, clock, dexFetcher: async options => {
    calls.push(options);
    const row = f.rows.find(row => row.poolAddress === options.poolAddress);
    const rawBytes = Buffer.from(JSON.stringify({ pairs: [{ chainId: "base", pairAddress: row.poolAddress,
      baseToken: { address: row.tokenAddress }, quoteToken: { address: address(99) }, priceUsd: "1.25", liquidity: { usd: 500000 } }] }));
    await options.onResponseBytes({ provider: "dexscreener", requestedAt: now, receivedAt: now,
      status: 200, url: "https://api.dexscreener.com/test-exact-fixture", headers: {}, rawBytes });
    return JSON.parse(rawBytes);
  } });
}

test("import-only mode never calls providers and is explicitly not live acceptance", async t => {
  const f = fixture(t);
  const report = await runFrozenOutcomeCollection({ ...f, createCollector: () => { throw new Error("must not construct a live collector"); } });
  assert.equal(report.status, "IMPORT_ONLY_NOT_LIVE_ACCEPTANCE"); assert.equal(report.imported.tasks, 10);
  assert.equal(report.collection, null); assert.deepEqual(report.providerState.requests, []);
  assert.deepEqual(fs.readFileSync(f.cohortFile), f.original); assert.equal(fs.readFileSync(f.observationFile).length, 0);
});

test("frozen treatment/control duties flow through raw receipts, atomic completion and existing ledger exactly once", async t => {
  const f = fixture(t), calls = [];
  const options = { ...f, collectLive: true, createCollector: dexFixture(f, calls) };
  const report = await runFrozenOutcomeCollection(options);
  assert.equal(report.collection.completed, 2, JSON.stringify(report));
  assert.equal(report.projectionAfter.appended, 2); assert.equal(calls.length, 2);
  assert.equal(report.storage.localIntegrityHealthy, true); assert.equal(report.storage.remoteSyncVerified, false);
  assert.equal(report.automaticTrading, false); assert.equal(report.edgeEstablished, false);
  const originalProjection = fs.readFileSync(f.observationFile);
  const again = await runFrozenOutcomeCollection(options);
  assert.equal(again.collection.attempted, 0); assert.equal(calls.length, 2);
  assert.deepEqual(fs.readFileSync(f.observationFile), originalProjection);
  assert.deepEqual(fs.readFileSync(f.cohortFile), f.original);
  const archive = openDurableEvidenceArchive({ root: f.archiveRoot, clock: f.clock });
  try {
    assert.equal(archive.listOutcomeCaptures().length, 2); assert.equal(archive.audit().ok, true);
    assert.deepEqual(archive.coordinationStatus().requests, [{ state: "succeeded", count: 2, units: 2 }]);
  } finally { archive.close(); }
});

test("legacy collector ownership prevents both queue import and HTTP dispatch", async t => {
  const f = fixture(t), lockFile = path.join(f.root, "outcome-probe-run.lock");
  fs.writeFileSync(lockFile, JSON.stringify({ ownerToken: "other", pid: process.pid }));
  const report = await runFrozenOutcomeCollection({ ...f, collectLive: true });
  assert.equal(report.status, "LEGACY_COLLECTOR_BUSY");
  assert.equal(fs.existsSync(f.archiveRoot), false);
});

test("a primary failure and fallback each consume a separate request and fallback pacing persists", async t => {
  const f = fixture(t); let dexCalls = 0, geckoCalls = 0;
  const report = await runFrozenOutcomeCollection({ ...f, collectLive: true, createCollector: ({ archive, clock }) => createFrozenOutcomeCollector({ archive, clock,
    dexFetcher: async options => {
      dexCalls++;
      await options.onResponseBytes({ provider: "dexscreener", requestedAt: now, receivedAt: now, status: 503,
        url: "https://api.dexscreener.com/test", headers: {}, rawBytes: Buffer.from('{"error":"test-only"}') });
      const error = new Error("fixture primary unavailable"); error.statusCode = 503; throw error;
    },
    geckoFetcher: async options => {
      geckoCalls++; assert.equal(options.maxAttempts, 1);
      const payload = { data: { id: "base_" + options.poolAddress, attributes: { address: options.poolAddress, base_token_price_usd: "1.2" },
        relationships: { network: { data: { id: "base" } }, base_token: { data: { id: "base_" + options.tokenAddress } } } } };
      await options.onResponseBytes({ provider: "geckoterminal", requestedAt: now, receivedAt: now, status: 200,
        url: "https://api.geckoterminal.com/test", headers: {}, rawBytes: Buffer.from(JSON.stringify(payload)) });
      return payload;
    },
  }) });
  assert.equal(dexCalls, 2); assert.equal(geckoCalls, 1); assert.equal(report.collection.completed, 1);
  assert.equal(report.collection.results.filter(row => row.state === "budget-deferred").length, 1);
  assert.deepEqual(report.providerState.requests, [{ state: "failed", count: 2, units: 2 }, { state: "succeeded", count: 1, units: 1 }]);
  assert.equal(report.providerState.providers.find(row => row.provider === report.providerBudget.provider).used, 3);
  assert.equal(report.projectionAfter.appended, 1);
});

test("restart replays saved original HTTP bytes after the window without fetching or backdating completion", async t => {
  const f = fixture(t); await runFrozenOutcomeCollection(f);
  const archive = openDurableEvidenceArchive({ root: f.archiveRoot, clock: f.clock });
  let task;
  try {
    archive.claimWriter({ owner: "interrupted-worker", nowAt: now });
    [task] = archive.leaseDue({ owner: "interrupted-worker", nowAt: now });
    const prediction = archive.readEvidence(task.recordId), contract = prediction.immutableContract;
    const payload = { pairs: [{ chainId: "base", pairAddress: contract.poolAddress, baseToken: { address: contract.tokenAddress }, priceUsd: "1.3" }] };
    const rawBytes = Buffer.from(JSON.stringify(payload));
    archive.admitPrediction({ recordId: "http-provider-response:interrupted:dexscreener", rawBytes, frozenObligations: [], immutableContract: {
      kind: "HTTP_PROVIDER_RESPONSE_V1_DIAGNOSTIC", taskId: task.taskId, requestId: "interrupted", provider: "dexscreener",
      status: 200, requestedAt: now, receivedAt: now, headers: {}, url: "https://api.dexscreener.com/test", scoringOrSelectionAllowed: false,
    } });
    archive.releaseWriter({ nowAt: now });
  } finally { archive.close(); }
  const recoveryAt = "2026-01-03T00:00:00.000Z";
  const recovered = await runFrozenOutcomeCollection({ ...f, clock: () => recoveryAt });
  assert.equal(recovered.replay.providerRequests, 0); assert.equal(recovered.replay.reconciled, 1);
  assert.equal(recovered.projectionBefore.appended, 1);
  const reopened = openDurableEvidenceArchive({ root: f.archiveRoot, clock: () => recoveryAt });
  try {
    const originalTask = reopened.listTasks().find(row => row.task_id === task.taskId);
    assert.equal(originalTask.completed_at, null); assert.equal(reopened.audit().ok, true);
    assert.equal(reopened.listOutcomeCaptures()[0].immutableContract.observationOf.receivedAt, now);
  } finally { reopened.close(); }
});

test("persistent archive destination must be explicit and absolute", async () => {
  await assert.rejects(runFrozenOutcomeCollection({}), /absolute persistent archiveRoot/);
  await assert.rejects(runFrozenOutcomeCollection({ archiveRoot: "temporary" }), /absolute persistent archiveRoot/);
});

test("arbitrary bytes with positive-looking clock flags cannot complete a frozen evidence obligation", async t => {
  const f = fixture(t);
  const report = await runFrozenOutcomeCollection({ ...f, collectLive: true, collect: async ({ task, prediction }) => ({
    recordId: "non-capture:" + task.taskId, rawBytes: Buffer.from("not original market evidence"), frozenObligations: [],
    immutableContract: { chain: prediction.immutableContract.chain, tokenAddress: prediction.immutableContract.tokenAddress,
      poolAddress: prediction.immutableContract.poolAddress, observationOf: { recordId: task.recordId, taskId: task.taskId,
        horizonHours: task.frozen.horizonHours, observationClockPolicy: "COLLECTION_RECEIPT_V1", requestedAt: now, receivedAt: now, marketObservedAt: null } },
  }) });
  assert.equal(report.collection.completed, 0); assert.equal(report.collection.status, "COLLECTION_INCOMPLETE");
  assert.equal(fs.readFileSync(f.observationFile).length, 0);
  assert.ok(report.collection.results.every(row => row.error === "OBSERVATION_CONTRACT_MISMATCH"));
});
