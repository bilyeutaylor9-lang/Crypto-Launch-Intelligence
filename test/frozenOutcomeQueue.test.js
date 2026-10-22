import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { openDurableEvidenceArchive, restoreDurableEvidenceArchive } from "../src/archive/durableEvidenceArchive.js";
import { freezeProspectiveEdgeCohort, prospectiveEpisodeIntegrityHash } from "../src/production/prospectiveEdgeCohortLedger.js";
import { buildExactMarketObservation, exactMarketObservationIntegrityHash } from "../src/production/exactMarketObservationLedger.js";
import { importFrozenOutcomeLedgers, restoreOriginalLedgerBytes } from "../src/archive/frozenOutcomeQueue.js";

const at = "2026-01-01T00:00:00.000Z";
const later = "2026-02-15T00:00:00.000Z";
const address = n => `0x${n.toString(16).padStart(40, "0")}`;
const candidate = (n, sourceObservedAt = "2025-12-31T23:55:00.000Z") => ({
  chain: "base", tokenAddress: address(n), poolAddress: address(n + 10000), sourceObservedAt, priceUsd: 1,
  marketCapUsd: 1e7, liquidityUsd: 5e5, volume24hUsd: 1e6, evidenceCoveragePct: 90, riskScore: 20,
  priceChange24hPct: 3, roundTripExecutionCostBps: 100, executionReferenceSizeUsd: 500,
  executionCostProvenance: "TEST_FROZEN_COST", portfolioResearchScore: 80, probability25Pct: 70,
});

function frozen(treatmentOverride = {}, controlOverride = {}) {
  const treatment = { ...candidate(1), ...treatmentOverride }, control = { ...candidate(2), ...controlOverride };
  const result = freezeProspectiveEdgeCohort([treatment], [control], { now: at, sourceObservedAt: treatment.sourceObservedAt,
    requireRowSourceObservedAt: true, maxControls: 1, maximumSelections: 1, codeCommitSha: "a".repeat(40),
    reservedControlsByTreatment: { [`${treatment.chain}:${treatment.tokenAddress}:${treatment.poolAddress}`]: [`${control.chain}:${control.tokenAddress}:${control.poolAddress}`] } });
  assert.equal(result.episodes.length, 2, JSON.stringify(result.audit));
  return result.episodes;
}
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "frozen-outcome-queue-")); let clock = later;
  const archive = openDurableEvidenceArchive({ root, clock: () => clock }); archive.claimWriter({ owner: "queue", nowAt: clock });
  t.after(() => { archive.close(); fs.rmSync(root, { recursive: true, force: true }); });
  return { root, archive, set: value => { clock = value; } };
}
function observation(episode, horizon = 24, offsetMinutes = 5) {
  const observedAt = new Date(Date.parse(episode.decisionAt) + horizon * 36e5 + offsetMinutes * 60000).toISOString();
  return buildExactMarketObservation({ chain: episode.chain, tokenAddress: episode.tokenAddress, poolAddress: episode.poolAddress,
    observedAt, priceUsd: 1.2, source: "fixture", outcomeObservationProvenance: {
      receiptObservedAt: observedAt, sourceTimestamp: new Date(Date.parse(episode.decisionAt) + horizon * 36e5).toISOString(),
    } }, { asOf: later });
}

test("imports real sealed treatment/control cohorts byte-exactly with all declared horizons and frozen primary window", t => {
  const { archive } = fixture(t), episodes = frozen();
  const rows = [JSON.stringify(episodes[0]) + "\r\n", "\r\n", JSON.stringify(episodes[1])];
  const cohortBytes = Buffer.from(rows.join(""));
  const observations = episodes.map(row => observation(row));
  const observationBytes = Buffer.from(observations.map(row => JSON.stringify(row)).join("\r\n") + "\r\n");
  const report = importFrozenOutcomeLedgers({ archive, cohortBytes, observationBytes, clock: () => later });
  assert.equal(report.sourceIntegrityHealthy, true, JSON.stringify(report.issues));
  assert.equal(report.episodes, 2); assert.equal(report.tasks, 10); assert.equal(report.primaryTasks, 2); assert.equal(report.operationalOnlyTasks, 8);
  assert.equal(report.historicalReconciled, 2, "only exact known-pool 24h observations reconcile; other declared horizons remain missing");
  for (const episode of episodes) {
    const tasks = archive.listTasks({ recordId: `frozen-episode:${episode.episodeId}` });
    assert.deepEqual(tasks.map(task => task.frozen.horizonHours).sort((a, b) => a - b), [1, 6, 24, 168, 720]);
    const primary = tasks.find(task => task.frozen.horizonHours === 24), six = tasks.find(task => task.frozen.horizonHours === 6);
    assert.equal(Date.parse(primary.expires_at) - Date.parse(primary.due_at), 8 * 36e5);
    assert.equal(primary.frozen.windowAuthority, "FROZEN_EVALUATION_POLICY_PRIMARY_HORIZON");
    assert.equal(six.frozen.windowAuthority, "OUTCOME_PROBE_OPERATIONAL_TOLERANCE_V1");
  }
  assert.deepEqual(restoreOriginalLedgerBytes(archive, report.sourceIndexes.cohorts), cohortBytes);
  assert.deepEqual(restoreOriginalLedgerBytes(archive, report.sourceIndexes.observations), observationBytes);
  const again = importFrozenOutcomeLedgers({ archive, cohortBytes: Buffer.from(cohortBytes.toString().replace(/\r\n/g, "\n")), observationBytes, clock: () => later });
  assert.equal(again.episodes, 2); assert.equal(archive.audit().ok, true);
});

test("unchanged historical source rows stay counted but never reopen reconciliation writer transactions", t => {
  const { archive } = fixture(t), episodes = frozen();
  const cohortBytes = Buffer.from(`${JSON.stringify(episodes[0])}\r\n${JSON.stringify(episodes[1])}`);
  const observationBytes = Buffer.from(episodes.map(episode => JSON.stringify(observation(episode))).join("\n"));
  const reconcile = archive.reconcileHistoricalObservation;
  let calls = 0;
  archive.reconcileHistoricalObservation = args => { calls++; return reconcile(args); };
  const initial = importFrozenOutcomeLedgers({ archive, cohortBytes, observationBytes, clock: () => later });
  assert.equal(initial.historicalReconciled, 2);
  assert.equal(calls, 2, "both new, valid 24h historical observations reconcile once");
  const snapshot = () => archive.listTasks().map(task => ({ taskId: task.task_id, state: task.state, completedAt: task.completed_at,
    frozen: task.frozen, historicallyReconciled: task.historicallyReconciled, historicalReconciliation: task.historicalReconciliation }));
  const before = snapshot();
  calls = 0;
  const unchanged = importFrozenOutcomeLedgers({ archive, cohortBytes, observationBytes, clock: () => later });
  assert.equal(unchanged.tasks, 10); assert.equal(unchanged.primaryTasks, 2); assert.equal(unchanged.historicalReconciled, 0);
  assert.equal(calls, 0, "already reconciled rows must not renew the writer or enter reconciliation");
  assert.deepEqual(snapshot(), before);
  assert.deepEqual(restoreOriginalLedgerBytes(archive, unchanged.sourceIndexes.cohorts), cohortBytes);
  assert.deepEqual(restoreOriginalLedgerBytes(archive, unchanged.sourceIndexes.observations), observationBytes);

  const cohortVariant = Buffer.from(cohortBytes.toString().replace(/\r\n/g, "\n") + "\n");
  const observationVariant = Buffer.from(observationBytes.toString().replace(/\n/g, "\r\n") + "\r\n");
  calls = 0;
  const reformatted = importFrozenOutcomeLedgers({ archive, cohortBytes: cohortVariant, observationBytes: observationVariant, clock: () => later });
  assert.equal(reformatted.tasks, 10); assert.equal(reformatted.primaryTasks, 2); assert.equal(reformatted.historicalReconciled, 0);
  assert.equal(calls, 0, "byte formatting variants preserve immutable reconciliation state without writes");
  assert.deepEqual(snapshot(), before);
  assert.deepEqual(restoreOriginalLedgerBytes(archive, reformatted.sourceIndexes.cohorts), cohortVariant);
  assert.deepEqual(restoreOriginalLedgerBytes(archive, reformatted.sourceIndexes.observations), observationVariant);
  assert.equal(archive.audit().ok, true);

  const canonicalBefore = episodes.map(episode => archive.readEvidence("exact-observation:" + observation(episode).observationIntegrityHash));
  const expanded = Buffer.from([...episodes.map(episode => observation(episode)), ...episodes.map(episode => observation(episode, 6))].map(JSON.stringify).join("\n"));
  calls = 0;
  const added = importFrozenOutcomeLedgers({ archive, cohortBytes, observationBytes: expanded, clock: () => later });
  assert.equal(added.tasks, 10);
  assert.equal(added.historicalReconciled, 2);
  assert.equal(calls, 2, "new raw observations still resolve unfinished duties while old matches are skipped");
  assert.equal(archive.listTasks().filter(task => task.historicallyReconciled).length, 4);
  for (const previous of before) {
    const current = snapshot().find(task => task.taskId === previous.taskId);
    assert.deepEqual(current.frozen, previous.frozen);
    if (previous.historicallyReconciled) assert.deepEqual(current, previous);
  }
  for (const previous of canonicalBefore) assert.deepEqual(archive.readEvidence(previous.recordId), previous, "original bytes and firstSeen remain immutable");
  assert.deepEqual(restoreOriginalLedgerBytes(archive, added.sourceIndexes.observations), expanded);
  assert.equal(archive.audit().ok, true);
});

test("valid frozen cohorts remain admitted while a valid-hash future observation stays non-reconcilable forever", t => {
  const { root, archive, set } = fixture(t), episodes = frozen();
  const future = observation(episodes[0]); future.observedAt = "2027-01-01T00:00:00.000Z"; future.observationIntegrityHash = exactMarketObservationIntegrityHash(future);
  const cohortBytes = Buffer.from(`${JSON.stringify(episodes[0])}\r\n${JSON.stringify(episodes[1])}\nnull\n`);
  const observationBytes = Buffer.from(`${JSON.stringify(future)}\nnull\n`);
  const report = importFrozenOutcomeLedgers({ archive, cohortBytes, observationBytes, clock: () => later });
  assert.equal(report.episodes, 2); assert.equal(report.historicalReconciled, 0);
  assert.ok(report.issues.some(issue => issue.reasons.includes("INVALID_EXACT_OBSERVATION_TIME_OR_PRICE")));
  assert.ok(!report.issues.some(issue => issue.reasons.includes("INVALID_EXACT_OBSERVATION_HASH")));
  assert.deepEqual(restoreOriginalLedgerBytes(archive, report.sourceIndexes.cohorts), cohortBytes);
  assert.deepEqual(restoreOriginalLedgerBytes(archive, report.sourceIndexes.observations), observationBytes);
  set("2028-01-01T00:00:00.000Z");
  assert.ok(archive.claimWriter({ owner: "queue-later", nowAt: "2028-01-01T00:00:00.000Z" }));
  const reimport = importFrozenOutcomeLedgers({ archive, cohortBytes, observationBytes, clock: () => "2028-01-01T00:00:00.000Z" });
  assert.equal(reimport.episodes, 2); assert.equal(reimport.historicalReconciled, 0, "a future-clock source cannot gain validity merely by later reimport");
  const source = archive.exportArchive(path.join(root, "portable")); const restored = restoreDurableEvidenceArchive({ source, root: path.join(root, "restored") });
  try { assert.deepEqual(restoreOriginalLedgerBytes(restored, report.sourceIndexes.cohorts), cohortBytes); } finally { restored.close(); }
});

test("a resealed bad control blocks its entire frozen cohort while null and malformed source rows retain bytes", t => {
  const { archive } = fixture(t), episodes = frozen();
  const badControl = structuredClone(episodes[1]); badControl.parentTreatmentEpisodeId = "missing-parent";
  badControl.freezeIntegrityHash = prospectiveEpisodeIntegrityHash(badControl);
  const bytes = Buffer.from(`${JSON.stringify(episodes[0])}\nnull\nnot-json\n${JSON.stringify(badControl)}\r\n`);
  const report = importFrozenOutcomeLedgers({ archive, cohortBytes: bytes, observationBytes: Buffer.alloc(0), clock: () => later });
  assert.equal(report.episodes, 0);
  assert.ok(report.issues.some(issue => issue.reasons.includes("CONTROL_PARENT_NOT_FOUND")));
  assert.deepEqual(restoreOriginalLedgerBytes(archive, report.sourceIndexes.cohorts), bytes);
});

test("known late receipt or stale source cannot backfill an otherwise on-time historical market timestamp", t => {
  const { archive } = fixture(t), episodes = frozen();
  const lateReceipt = observation(episodes[0]); lateReceipt.outcomeObservationProvenance.receiptObservedAt = later;
  lateReceipt.observationIntegrityHash = exactMarketObservationIntegrityHash(lateReceipt);
  const staleSource = observation(episodes[1]); staleSource.outcomeObservationProvenance.sourceTimestamp = "2025-12-01T00:00:00.000Z";
  staleSource.observationIntegrityHash = exactMarketObservationIntegrityHash(staleSource);
  const report = importFrozenOutcomeLedgers({ archive, cohortBytes: Buffer.from(episodes.map(JSON.stringify).join("\n")),
    observationBytes: Buffer.from([lateReceipt, staleSource].map(JSON.stringify).join("\n")), clock: () => later });
  assert.equal(report.episodes, 2); assert.equal(report.historicalReconciled, 0);
  assert.ok(report.issues.some(issue => issue.reasons.includes("INVALID_EXACT_OBSERVATION_PROVENANCE_CLOCK")) || report.historicalReconciled === 0);
});

test("duplicate episode IDs block the affected cohort without deleting duplicate original bytes", t => {
  const { archive } = fixture(t), episodes = frozen();
  const bytes = Buffer.from([episodes[0], episodes[1], episodes[0]].map(JSON.stringify).join("\n"));
  const report = importFrozenOutcomeLedgers({ archive, cohortBytes: bytes, observationBytes: Buffer.alloc(0), clock: () => later });
  assert.equal(report.episodes, 0);
  assert.ok(report.issues.some(issue => issue.reasons.includes("DUPLICATE_FROZEN_EPISODE_ID")));
  assert.deepEqual(restoreOriginalLedgerBytes(archive, report.sourceIndexes.cohorts), bytes);
});

test("Solana token and pool case remain exact through frozen obligation recovery", t => {
  const { archive } = fixture(t);
  const tokenAddress = "tSATdGGSLYBVCrm3pXiib8NmzKcB1iUdjRRseNGssxu";
  const poolAddress = "HBYptNEWREPFK2UmaVtfg8Mfp9D8Xye41Ueo9wZo9oX4";
  const episodes = frozen({ chain: "solana", tokenAddress, poolAddress }, {
    chain: "solana", tokenAddress: "So11111111111111111111111111111111111111112", poolAddress: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  });
  const treatment = episodes.find(row => row.role === "TREATMENT");
  const exact = observation(treatment);
  const wrongToken = observation({ ...treatment, tokenAddress: tokenAddress.replace("SAT", "SaT") });
  const wrongPool = observation({ ...treatment, poolAddress: poolAddress.replace("HBY", "HBy") });
  assert.ok(wrongToken); assert.ok(wrongPool);
  const report = importFrozenOutcomeLedgers({ archive, cohortBytes: Buffer.from(episodes.map(JSON.stringify).join("\n")),
    observationBytes: Buffer.from([wrongToken, wrongPool, exact].map(JSON.stringify).join("\n")), clock: () => later });
  assert.equal(report.episodes, 2); assert.equal(report.historicalReconciled, 1);
  const target = archive.listTasks({ recordId: "frozen-episode:" + treatment.episodeId }).find(task => task.frozen.horizonHours === 24);
  assert.equal(archive.reconcileHistoricalObservation({ taskId: target.task_id, evidenceRecordId: "exact-observation:" + exact.observationIntegrityHash, nowAt: later }).status, "duplicate");
  assert.equal(archive.audit().ok, true);
});
