import assert from "node:assert/strict";
import test from "node:test";

import {
  buildOutcomeCollectionHealth,
  summarizeMaturedOutcomes,
} from "../src/production/outcomeCollectionHealth.js";

const TOKEN = `0x${"1".repeat(40)}`;
const CONTROL_TOKEN = `0x${"2".repeat(40)}`;
const POOL = `0x${"a".repeat(40)}`;
const CONTROL_POOL = `0x${"b".repeat(40)}`;
const NOW = "2026-08-28T05:00:00.000Z";

function episode(role, overrides = {}) {
  const control = role === "CONTROL_MATCHED";
  return {
    episodeId: `${role}-1`,
    role,
    decisionAt: "2026-08-28T03:00:00.000Z",
    chain: "base",
    tokenAddress: control ? CONTROL_TOKEN : TOKEN,
    poolAddress: control ? CONTROL_POOL : POOL,
    ...overrides,
  };
}

function observation(control = false) {
  return {
    observedAt: "2026-08-28T04:05:00.000Z",
    sourceObservedAt: "2026-08-28T04:05:00.000Z",
    chain: "base",
    tokenAddress: control ? CONTROL_TOKEN : TOKEN,
    poolAddress: control ? CONTROL_POOL : POOL,
    priceUsd: 1,
    exactIdentityVerified: true,
  };
}

function persistenceReports() {
  return {
    restoreReport: { state: "REMOTE_FORWARD_EVIDENCE_RESTORED" },
    syncReport: { state: "REMOTE_FORWARD_EVIDENCE_SYNCED", localRecords: 4 },
    verifyReport: {
      state: "REMOTE_FORWARD_EVIDENCE_VERIFIED",
      verified: true,
      localRecords: 4,
      remoteRecords: 4,
      missingRemoteRecordCount: 0,
      appendOnlyIntegrityPass: true,
    },
  };
}

function probeReport(overrides = {}) {
  return {
    status: "PASS",
    generatedAt: "2026-08-28T04:55:00.000Z",
    exactLedgerObservationsSaved: 2,
    exactLedgerObservationsRejected: 0,
    maturedObservationsByHorizon: { "1h": 2, "24h": 0, "168h": 0, "720h": 0 },
    ...overrides,
  };
}

test("outcome collection health reports fresh exact observations and verified persistence", () => {
  const report = buildOutcomeCollectionHealth({
    now: NOW,
    probeReport: probeReport(),
    ...persistenceReports(),
    episodes: [episode("TREATMENT"), episode("CONTROL_MATCHED")],
    observations: [observation(false), observation(true)],
    gradeReport: { edgeState: "UNVERIFIED_INSUFFICIENT_FORWARD_EVIDENCE", sample: { resolvedMatchedPairs: 0 } },
    edgeVerificationReport: { edgeState: "UNVERIFIED_INSUFFICIENT_FORWARD_EVIDENCE", forwardOnly: true },
    writeReport: false,
  });

  assert.equal(report.state, "OUTCOME_COLLECTION_HEALTHY");
  assert.equal(report.freshness.state, "FRESH");
  assert.equal(report.durablePersistence.verified, true);
  assert.equal(report.durablePersistence.appendOnlyIntegrityPass, true);
  assert.equal(report.maturedObservationsByHorizon["1h"].matureExpected, 2);
  assert.equal(report.maturedObservationsByHorizon["1h"].resolvedExact, 2);
  assert.equal(report.maturedObservationsByHorizon["1h"].treatmentsResolved, 1);
  assert.equal(report.maturedObservationsByHorizon["1h"].controlsResolved, 1);
  assert.equal(report.policy.historicalOrBackfilledEvidenceCountsAsForwardProof, false);
});

test("outcome collection health marks a stale probe loudly even when cached evidence exists", () => {
  const report = buildOutcomeCollectionHealth({
    now: NOW,
    probeReport: probeReport({ generatedAt: "2026-08-28T00:00:00.000Z" }),
    ...persistenceReports(),
    episodes: [],
    observations: [],
    writeReport: false,
  });

  assert.equal(report.state, "OUTCOME_COLLECTION_STALE");
  assert.equal(report.freshness.state, "STALE");
});

test("outcome collection health rejects failed current workflow steps and rejected exact rows", () => {
  const report = buildOutcomeCollectionHealth({
    now: NOW,
    probeReport: probeReport({ exactLedgerObservationsRejected: 1 }),
    ...persistenceReports(),
    probeStepOutcome: "failure",
    restoreStepOutcome: "success",
    syncStepOutcome: "success",
    verifyStepOutcome: "success",
    episodes: [],
    observations: [],
    writeReport: false,
  });

  assert.equal(report.state, "OUTCOME_COLLECTION_INVALID");
  assert.equal(report.workflowSteps.probe, "failure");
});

test("outcome collection health makes duplicate or divergent durable evidence actionable", () => {
  const reports = persistenceReports();
  reports.verifyReport.reconciliation = {
    state: "FORWARD_EVIDENCE_RECONCILIATION_REQUIRED",
    reconciled: false,
    localDuplicateRecordCount: 1,
  };
  const report = buildOutcomeCollectionHealth({
    now: NOW,
    probeReport: probeReport(),
    ...reports,
    episodes: [],
    observations: [],
    writeReport: false,
  });

  assert.equal(report.state, "OUTCOME_COLLECTION_INVALID");
  assert.equal(report.durablePersistence.reconciliation.localDuplicateRecordCount, 1);
});

test("maturity summaries never count an identity mismatch as an outcome", () => {
  const summary = summarizeMaturedOutcomes(
    [episode("TREATMENT")],
    [{ ...observation(false), tokenAddress: CONTROL_TOKEN }],
    { now: NOW, horizons: [1] },
  );

  assert.equal(summary["1h"].matureExpected, 1);
  assert.equal(summary["1h"].resolvedExact, 0);
  assert.equal(summary["1h"].unresolvedDue, 1);
});
