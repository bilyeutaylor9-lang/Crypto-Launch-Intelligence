import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { armCommittedLoadedVacuumReplicationPlan, loadCommittedLoadedVacuumReplicationPlan, replicationSpecHash, REPLICATION_SPEC } from "../src/learning/committedLoadedVacuumReplicationPlanStore.js";
import { buildCommittedLoadedVacuumReplication, __committedLoadedVacuumReplicationHooks } from "../src/learning/committedLoadedVacuumReplicationLab.js";

function at(day, hour = 0) { return new Date(Date.UTC(2026, 0, 1 + day, hour)).toISOString(); }
function obs(id, day, overrides = {}) {
  return {
    schemaVersion: 2,
    signalDefinitionVersion: REPLICATION_SPEC.signalDefinitionVersion,
    identityKey: `base:${id}`,
    observedAt: at(day),
    scanRunId: `scan-${day}`,
    codeCommitSha: "abc",
    chain: "base",
    symbol: id,
    priceUsd: 1,
    marketCapUsd: 10_000_000,
    liquidityUsd: 500_000,
    volume24hUsd: 1_000_000,
    priceChange24hPct: 2,
    productionScore: 72,
    riskScore: 20,
    ignitionState: "ARMED",
    capitalArrivalState: "ARRIVAL_PRESSURE_BUILDING_SHADOW",
    treatment: false,
    sixHourExpectedArrivalToIgnitionRatio: 0.8,
    supplyVacuumSupported: true,
    evidenceCoveragePct: 80,
    ...overrides,
  };
}
function snap(key, iso, price) { return { key, timestamp: iso, priceUsd: price }; }
function futureSnaps(row, winner) {
  const t = Date.parse(row.observedAt);
  return [
    snap(row.identityKey, new Date(t + 3_600_000).toISOString(), winner ? 1.3 : 0.8),
    snap(row.identityKey, new Date(t + 168 * 3_600_000).toISOString(), winner ? 1.4 : 0.7),
  ];
}
function plan(cutoff = at(0)) {
  return {
    schemaVersion: 1,
    armedAt: at(0),
    cutoffObservedAt: cutoff,
    signalDefinitionVersion: REPLICATION_SPEC.signalDefinitionVersion,
    signalSpecHash: replicationSpecHash(),
    confirmationDefaults: { minResolvedTreatments: 5, minUniqueProjects: 5, minSpanDays: 14, minPositiveTimeBlockPct: 70, maxFalseIgnitionDeteriorationPct: 5 },
    immutable: true,
  };
}
function strongConfirmation(n = 8) {
  const observations = [];
  const snapshots = [];
  for (let i = 0; i < n; i += 1) {
    const day = 3 + i * 7;
    const treated = obs(`t${i}`, day, { treatment: true, capitalArrivalState: "COMMITTED_LOADED_VACUUM_SHADOW", sixHourExpectedArrivalToIgnitionRatio: 1.3, scanRunId: `pair-${i}` });
    const control = obs(`c${i}`, day, { treatment: false, capitalArrivalState: "ARRIVAL_PRESSURE_BUILDING_SHADOW", sixHourExpectedArrivalToIgnitionRatio: 0.8, scanRunId: `pair-${i}` });
    observations.push(treated, control);
    snapshots.push(...futureSnaps(treated, true), ...futureSnaps(control, false));
  }
  return { observations, snapshots };
}

test("replication specification hash is deterministic", () => {
  assert.equal(replicationSpecHash(), replicationSpecHash());
  assert.equal(replicationSpecHash().length, 64);
});

test("replication plan refuses to arm before discovery review", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "repl-v12-"));
  const file = path.join(tmp, "plan.json");
  const result = armCommittedLoadedVacuumReplicationPlan({ promotion: { state: "SHADOW_VALIDATION_INCOMPLETE" } }, [obs("a", 0)], { file });
  assert.equal(result.state, "REPLICATION_NOT_ARMED_DISCOVERY_NOT_READY");
  assert.equal(fs.existsSync(file), false);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("replication plan freezes cutoff at latest already-observed row", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "repl-v12-"));
  const file = path.join(tmp, "plan.json");
  const result = armCommittedLoadedVacuumReplicationPlan({ promotion: { state: "REVIEW_FOR_INDEPENDENT_REPLICATION" }, generatedAt: at(2) }, [obs("a", 1), obs("b", 3)], { file, armedAt: at(4) });
  assert.equal(result.state, "REPLICATION_PLAN_ARMED");
  assert.equal(result.plan.cutoffObservedAt, at(3));
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("existing replication plan is immutable and never overwritten", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "repl-v12-"));
  const file = path.join(tmp, "plan.json");
  const first = armCommittedLoadedVacuumReplicationPlan({}, [obs("a", 1)], { file, forceArm: true, armedAt: at(2) });
  const second = armCommittedLoadedVacuumReplicationPlan({}, [obs("b", 9)], { file, forceArm: true, armedAt: at(10) });
  assert.equal(second.state, "REPLICATION_PLAN_ALREADY_ARMED");
  assert.equal(second.plan.cutoffObservedAt, first.plan.cutoffObservedAt);
  assert.deepEqual(loadCommittedLoadedVacuumReplicationPlan({ file }), first.plan);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("confirmation excludes all observations at or before the frozen cutoff", () => {
  const p = plan(at(5));
  const rows = [obs("before", 4), obs("same", 5), obs("after", 6)];
  const confirmation = __committedLoadedVacuumReplicationHooks.confirmationRows(p, rows);
  assert.deepEqual(confirmation.map((r) => r.identityKey), ["base:after"]);
});

test("confirmation fails closed on a different signal-definition version", () => {
  const p = plan(at(0));
  const rows = [obs("old", 5, { signalDefinitionVersion: "DIFFERENT_SIGNAL" })];
  assert.equal(__committedLoadedVacuumReplicationHooks.confirmationRows(p, rows).length, 0);
});

test("replication lab fails closed when plan hash does not match frozen spec", () => {
  const report = buildCommittedLoadedVacuumReplication({ ...plan(), signalSpecHash: "bad" }, [], []);
  assert.equal(report.state, "REPLICATION_SPEC_MISMATCH_FAIL_CLOSED");
});

test("small confirmation sample remains collecting", () => {
  const { observations, snapshots } = strongConfirmation(2);
  const report = buildCommittedLoadedVacuumReplication(plan(), observations, snapshots, { minPairsPerBlock: 1, minQualifyingTimeBlocks: 2 });
  assert.equal(report.state, "INDEPENDENT_REPLICATION_COLLECTING");
});

test("strong untouched confirmation can reach supported shadow state", () => {
  const { observations, snapshots } = strongConfirmation(8);
  const report = buildCommittedLoadedVacuumReplication(plan(), observations, snapshots, { minPairsPerBlock: 1, minQualifyingTimeBlocks: 2, bootstrapReplicates: 300 });
  assert.equal(report.state, "INDEPENDENT_REPLICATION_SUPPORTED_SHADOW");
  assert.ok(report.matchedRiskDifferenceBootstrap95.lower95Pct > 0);
  assert.ok(report.median168hReturnLiftPct > 0);
});

test("mature but reversed confirmation fails rather than retuning thresholds", () => {
  const { observations, snapshots } = strongConfirmation(8);
  const reversed = [];
  for (const row of observations) reversed.push(row);
  const reversedSnaps = [];
  for (const row of observations) reversedSnaps.push(...futureSnaps(row, !row.treatment));
  const report = buildCommittedLoadedVacuumReplication(plan(), reversed, reversedSnaps, { minPairsPerBlock: 1, minQualifyingTimeBlocks: 2, bootstrapReplicates: 300 });
  assert.equal(report.state, "INDEPENDENT_REPLICATION_FAILED");
  assert.ok(report.evidenceBlockers.length > 0);
});

test("time-block stability reports direction rather than hiding regime reversals", () => {
  const pairs = [
    { treated: { observation: obs("t1", 2), outcome: { plus25BeforeMinus15: true } }, controls: [{ outcome: { plus25BeforeMinus15: false } }] },
    { treated: { observation: obs("t2", 10), outcome: { plus25BeforeMinus15: false } }, controls: [{ outcome: { plus25BeforeMinus15: true } }] },
  ];
  const result = __committedLoadedVacuumReplicationHooks.timeBlockStability(pairs, { timeBlockDays: 7, minPairsPerBlock: 1 });
  assert.equal(result.qualifyingBlocks, 2);
  assert.equal(result.positiveDirectionPct, 50);
});

test("replication support remains shadow-only with no automatic promotion", () => {
  const { observations, snapshots } = strongConfirmation(8);
  const report = buildCommittedLoadedVacuumReplication(plan(), observations, snapshots, { minPairsPerBlock: 1, minQualifyingTimeBlocks: 2, bootstrapReplicates: 250 });
  assert.equal(report.shadowOnly, true);
  assert.equal(report.rankingInfluence, false);
  assert.equal(report.automaticProductionPromotion, false);
});
