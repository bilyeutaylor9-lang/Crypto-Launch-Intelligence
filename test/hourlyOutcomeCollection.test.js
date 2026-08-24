import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { runOutcomeProbe } from "../src/learning/outcomeProbe.js";
import { acquireOutcomeProbeRunLock } from "../src/learning/outcomeProbeRunLock.js";
import {
  hourlyOutcomeCollectionExitCode,
  resolveHourlyOutcomeCollectionConfig,
  resolveHourlyOutcomeHorizons,
  runHourlyOutcomeCollection,
  startHourlyOutcomeCollectionScheduler,
} from "../src/ops/runHourlyOutcomeCollection.js";

const TOKEN = `0x${"1".repeat(40)}`;
const POOL = `0x${"a".repeat(40)}`;

function dueMemory() {
  return [{
    identityKey: `base:${TOKEN}`,
    chain: "base",
    tokenAddress: TOKEN,
    poolAddress: POOL,
    scannedAt: "2026-01-01T00:00:00.000Z",
    scores: { opportunity: 70 },
  }];
}

function exactProviderPair() {
  return {
    chainId: "base",
    pairAddress: POOL,
    baseToken: { address: TOKEN, symbol: "EDGE", name: "Edge" },
    quoteToken: { address: `0x${"f".repeat(40)}`, symbol: "WETH" },
    priceUsd: "1.25",
    liquidity: { usd: 100_000 },
    volume: { h24: 50_000 },
  };
}

test("hourly collector always includes the 1h horizon and carries no ranking authority", async () => {
  let probeOptions = null;
  const report = await runHourlyOutcomeCollection({
    now: "2026-08-24T12:00:00.000Z",
    horizons: [24, 168],
    maxRequests: 11,
    concurrency: 2,
    writeReport: false,
    writeProbeReport: false,
    runOutcomeProbe: async (options) => {
      probeOptions = options;
      return {
        status: "PASS",
        dueCandidates: 3,
        duePredictions: 4,
        providerRequestsUsed: 3,
        providerRequestBudget: 11,
        exactLedgerObservationsSaved: 2,
        prospectiveEdgeDueCandidates: 2,
        outcomesByHorizon: { "1h": 2, "24h": 2 },
        results: [{ status: "OBSERVED" }, { status: "NO_EXACT_PROVIDER_MATCH" }],
      };
    },
  });

  assert.deepEqual(probeOptions.horizons, [1, 24, 168]);
  assert.equal(probeOptions.maxRequests, 11);
  assert.equal(probeOptions.concurrency, 2);
  assert.equal(probeOptions.saveLegacySnapshots, false);
  assert.equal(report.status, "PASS");
  assert.equal(report.probe.exactLedgerObservationsSaved, 2);
  assert.deepEqual(report.probe.resultStatusCounts, {
    OBSERVED: 1,
    NO_EXACT_PROVIDER_MATCH: 1,
  });
  assert.equal(report.policy.discoveryRun, false);
  assert.equal(report.policy.cohortCaptureRun, false);
  assert.equal(report.policy.gradingRun, false);
  assert.equal(report.policy.rankingInfluence, false);
  assert.equal(report.policy.automaticTrading, false);
  assert.equal(report.policy.automaticPromotion, false);
});

test("hourly collector uses exact-ledger-only persistence and returns scheduler-safe statuses", async () => {
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "hourly-outcome-test-"));
  const lockFile = path.join(tempDirectory, "outcome-probe.lock");
  let legacySnapshotWrites = 0;
  let exactLedgerWrites = 0;

  try {
    const report = await runHourlyOutcomeCollection({
      now: "2026-01-01T01:30:00.000Z",
      horizons: [1],
      outcomeProbeLockFile: lockFile,
      writeReport: false,
      writeProbeReport: false,
      runOutcomeProbe: (options) => runOutcomeProbe({
        ...options,
        memory: dueMemory(),
        snapshots: [],
        providers: {
          getPairByAddress: async () => ({ pairs: [exactProviderPair()] }),
          getTokenPairs: async () => [],
        },
        saveSnapshots: () => {
          legacySnapshotWrites += 1;
          return { saved: 1 };
        },
        saveExactObservations: (observations) => {
          exactLedgerWrites += observations.length;
          return { saved: observations.length, rejected: 0 };
        },
      }),
    });

    assert.equal(report.status, "PASS");
    assert.equal(legacySnapshotWrites, 0);
    assert.equal(exactLedgerWrites, 1);
    assert.equal(report.probe.exactLedgerObservationsSaved, 1);
    assert.equal(hourlyOutcomeCollectionExitCode(report), 0);
    assert.equal(hourlyOutcomeCollectionExitCode({ status: "PROVIDER_DEGRADED" }), 1);
  } finally {
    fs.rmSync(tempDirectory, { recursive: true, force: true });
  }
});

test("an hourly run safely skips while another scan/probe owns the shared lock", async () => {
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "hourly-outcome-lock-"));
  const lockFile = path.join(tempDirectory, "outcome-probe.lock");
  const lock = acquireOutcomeProbeRunLock({ outcomeProbeLockFile: lockFile });
  let providerCalled = false;

  try {
    assert.equal(lock.acquired, true);
    const report = await runHourlyOutcomeCollection({
      now: "2026-01-01T01:30:00.000Z",
      outcomeProbeLockFile: lockFile,
      writeReport: false,
      writeProbeReport: false,
      runOutcomeProbe: (options) => runOutcomeProbe({
        ...options,
        memory: dueMemory(),
        snapshots: [],
        providers: {
          getPairByAddress: async () => {
            providerCalled = true;
            return { pairs: [exactProviderPair()] };
          },
          getTokenPairs: async () => [],
        },
      }),
    });

    assert.equal(report.status, "SKIPPED_ALREADY_RUNNING");
    assert.equal(report.probe.skipped, true);
    assert.equal(report.probe.skipReason, "OUTCOME_PROBE_ALREADY_RUNNING");
    assert.equal(providerCalled, false);
    assert.equal(hourlyOutcomeCollectionExitCode(report), 0);
  } finally {
    lock.release();
    fs.rmSync(tempDirectory, { recursive: true, force: true });
  }
});

test("outcome lock recovers an abandoned writer but never reaps a live owner solely by age", () => {
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "hourly-outcome-stale-lock-"));
  const lockFile = path.join(tempDirectory, "outcome-probe.lock");
  const old = new Date(Date.now() - 7 * 60 * 60 * 1_000);

  try {
    fs.writeFileSync(lockFile, JSON.stringify({ pid: 999_999_999, ownerToken: "dead-owner" }));
    const recoveredDeadOwner = acquireOutcomeProbeRunLock({ outcomeProbeLockFile: lockFile });
    assert.equal(recoveredDeadOwner.acquired, true);
    recoveredDeadOwner.release();

    fs.writeFileSync(lockFile, JSON.stringify({ pid: process.pid, ownerToken: "live-owner" }));
    fs.utimesSync(lockFile, old, old);
    const liveOwner = acquireOutcomeProbeRunLock({ outcomeProbeLockFile: lockFile });
    assert.equal(liveOwner.acquired, false);
    assert.equal(liveOwner.ownerAlive, true);

    fs.writeFileSync(lockFile, "malformed lock metadata");
    fs.utimesSync(lockFile, old, old);
    const recoveredMalformedLock = acquireOutcomeProbeRunLock({ outcomeProbeLockFile: lockFile });
    assert.equal(recoveredMalformedLock.acquired, true);
    recoveredMalformedLock.release();
  } finally {
    fs.rmSync(tempDirectory, { recursive: true, force: true });
  }
});

test("hourly scheduler config is valid by default and rejects invalid cron expressions", () => {
  assert.deepEqual(resolveHourlyOutcomeHorizons("24,168"), [1, 24, 168]);
  assert.equal(resolveHourlyOutcomeCollectionConfig({ schedule: "7 * * * *" }).schedule, "7 * * * *");
  assert.throws(
    () => startHourlyOutcomeCollectionScheduler({ schedule: "not-a-cron-expression" }),
    /Invalid HOURLY_OUTCOME_CRON/,
  );
});
