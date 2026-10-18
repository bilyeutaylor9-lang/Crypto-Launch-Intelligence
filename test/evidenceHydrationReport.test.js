import test from "node:test";
import assert from "node:assert/strict";
import { summarizeEvidenceHydration, summarizeRecoveryAttempts } from "../src/reports/recoveredOpportunityWatchlistReportEngine.js";
import { analyzeEngineDataReadiness } from "../src/engines/engineDataReadinessEngine.js";
import { analyzeDataStarvationRootCause } from "../src/engines/dataStarvationRootCauseEngine.js";

test("saved hydration metrics retain observed budget, wave and family counters", () => {
  const summary = { deepEvaluatedCandidates: 500, recoveryCandidatesAttempted: 480,
    selectedWaveCounts: { wave1: 500, wave2: 150, wave3: 50 },
    providerRequestsUsed: 500, providerRequestBudget: 600, timeBudgetExceeded: true,
    timeBudgetSkippedCalls: 3, recoveredFieldsByFamily: { DEPLOYER: 400 },
    unresolvedFieldsByFamily: { WALLETS: 100 } };
  const result = summarizeEvidenceHydration([
    { deepEvaluationState: "DEFERRED_BEFORE_DEEP", activeEvidenceRecovery: { batchSummary: { deepEvaluatedCandidates: 3500 } } },
    { deepEvaluationState: "DEEP_EVALUATED", activeEvidenceRecovery: { batchSummary: summary } },
  ]);
  assert.deepEqual(result, summary);
  assert.notEqual(result, summary);
});

test("root-cause and readiness audits agree on measured zero and partial core evidence", () => {
  const contracts = [{ id: "marketTruth", affectsFinalDecision: true, canBlockCandidate: true,
    inputContract: { requiredAny: [["liquidityUsd"], ["poolAddress"]], optional: [] } }];
  for (const liquidityUsd of [0, 100]) {
    const project = { chain: "base", liquidityUsd, deepEvaluationState: "DEEP_EVALUATED" };
    const readiness = analyzeEngineDataReadiness(project, { contracts });
    const starvation = analyzeDataStarvationRootCause(project, { contracts });
    assert.equal(readiness.engineDataReadiness.coreDataStarved, false);
    assert.equal(starvation.coreDataStarved, false);
    assert.equal(starvation.dataStarvationStatus, "CORE_EVIDENCE_PARTIAL");
    assert.ok(starvation.coreMissingEvidence.some((item) => item.canonicalField === "poolAddress"));
    assert.equal(starvation.coreMissingEvidence.some((item) => item.canonicalField === "liquidityUsd"), false);
  }
  assert.equal(analyzeDataStarvationRootCause({ chain: "base" }, { contracts }).coreDataStarved, true);
});

test("absent hydration measurements remain unknown instead of fabricated zero costs", () => {
  assert.equal(summarizeEvidenceHydration([]), null);
  assert.equal(summarizeEvidenceHydration([{ deepEvaluationState: "DEFERRED_BEFORE_DEEP",
    activeEvidenceRecovery: { batchSummary: { providerRequestsUsed: 0 } } }]), null);
});

test("saved recovery attempts separate cumulative changes from this phase and exclude deferred rows", () => {
  const recovery = { changedEvidenceFamilies: ["WALLETS", "EXECUTION"], changedEvidenceFamiliesThisPhase: ["EXECUTION"] };
  const rows = summarizeRecoveryAttempts([
    { deepEvaluationState: "DEFERRED_BEFORE_DEEP", activeEvidenceRecoveryStatus: "PARTIAL_RECOVERY", activeEvidenceRecovery: recovery },
    { deepEvaluationState: "DEEP_EVALUATED", activeEvidenceRecoveryStatus: "PARTIAL_RECOVERY", activeEvidenceRecovery: recovery },
  ]);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].changedEvidenceFamilies, ["WALLETS", "EXECUTION"]);
  assert.deepEqual(rows[0].changedEvidenceFamiliesThisPhase, ["EXECUTION"]);
  assert.notEqual(rows[0].changedEvidenceFamilies, recovery.changedEvidenceFamilies);
  assert.notEqual(rows[0].changedEvidenceFamiliesThisPhase, recovery.changedEvidenceFamiliesThisPhase);
});

test("saved recovery changes preserve observed empty arrays without inventing legacy observations", () => {
  const rows = summarizeRecoveryAttempts([
    { activeEvidenceRecoveryStatus: "NO_RECOVERY", activeEvidenceRecovery: {
      changedEvidenceFamilies: [], changedEvidenceFamiliesThisPhase: [] } },
    { activeEvidenceRecoveryStatus: "NO_RECOVERY" },
    { activeEvidenceRecoveryStatus: "NO_RECOVERY", activeEvidenceRecovery: {
      changedEvidenceFamilies: "WALLETS", changedEvidenceFamiliesThisPhase: {} } },
  ]);
  assert.deepEqual(rows[0].changedEvidenceFamilies, []);
  assert.deepEqual(rows[0].changedEvidenceFamiliesThisPhase, []);
  for (const row of rows.slice(1)) {
    assert.equal(row.changedEvidenceFamilies, null);
    assert.equal(row.changedEvidenceFamiliesThisPhase, null);
  }
});
