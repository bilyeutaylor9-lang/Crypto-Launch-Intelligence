import test from "node:test";
import assert from "node:assert/strict";
import { summarizeEvidenceHydration } from "../src/reports/recoveredOpportunityWatchlistReportEngine.js";
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
