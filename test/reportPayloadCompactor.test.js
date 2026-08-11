import test from "node:test";
import assert from "node:assert/strict";

import {
  compactDiscoveryForReports,
  compactMetaForReportWriters,
  compactProjectForReportWriters,
  compactProjectsForReportWriters,
} from "../src/reports/reportPayloadCompactor.js";

test("report project compactor preserves ranking fields while bounding raw research payloads", () => {
  const compacted = compactProjectForReportWriters(
    {
      name: "Heavy Token",
      symbol: "HVY",
      chain: "base",
      pipelineScore: 88,
      finalSelectionState: "RESEARCH_ONLY",
      utilityQualityScore: 79,
      realUtilityScore: 79,
      utilityClassification: "REAL_UTILITY",
      realUtilityQualified: true,
      utilityIdentityEligible: true,
      utilityEvidenceFamilies: ["PRODUCT", "DEVELOPMENT", "ADOPTION"],
      finalBlockingReasons: Array.from({ length: 100 }, (_, index) => `block-${index}`),
      quantumOutcomeField: {
        scenarioCount: 4096,
        expectedReturnPct: 12,
        bestCaseReturnPct: 80,
        baseCaseReturnPct: 14,
        worstCaseReturnPct: -20,
        positiveProbability: 62,
        doubleProbability: 12,
        collapseProbability: 8,
      },
      quantumReasoningBrain: {
        score: 71,
        decisionState: "Research Watch",
        probabilities: { bull: 35, base: 40, bear: 20, blackSwan: 5 },
        entropyScore: 34,
      },
      rawProviderPayload: { payload: "x".repeat(500_000) },
      websiteText: "w".repeat(500_000),
      engineResults: Object.fromEntries(
        Array.from({ length: 100 }, (_, index) => [`engine-${index}`, { payload: "r".repeat(10_000) }])
      ),
      evidence: Array.from({ length: 100 }, (_, index) => ({
        source: `source-${index}`,
        payload: "e".repeat(10_000),
      })),
      nestedGraph: {
        evidence: Array.from({ length: 100 }, (_, index) => ({
          index,
          payload: "e".repeat(10_000),
        })),
      },
    },
    { arrayLimit: 10, stringLimit: 500, depthLimit: 4 }
  );

  assert.equal(compacted.name, "Heavy Token");
  assert.equal(compacted.symbol, "HVY");
  assert.equal(compacted.pipelineScore, 88);
  assert.equal(compacted.finalSelectionState, "RESEARCH_ONLY");
  assert.equal(compacted.utilityQualityScore, 79);
  assert.equal(compacted.realUtilityQualified, true);
  assert.equal(compacted.utilityIdentityEligible, true);
  assert.deepEqual(compacted.utilityEvidenceFamilies, ["PRODUCT", "DEVELOPMENT", "ADOPTION"]);
  assert.equal(compacted.quantumOutcomeField.scenarioCount, 4096);
  assert.equal(compacted.quantumReasoningBrain.probabilities.bull, 35);
  assert.equal(compacted.rawProviderPayload.omittedFromReport, true);
  assert.equal(compacted.websiteText.omittedFromReport, true);
  assert.equal(compacted.engineResults.omittedFromReport, true);
  assert.equal(compacted.evidence.omittedFromReport, true);
  assert.ok(compacted.finalBlockingReasons.length <= 11);
  assert.equal(compacted.reportCompaction.mode, "bounded-project");
});

test("report meta compactor replaces full discovery candidate arrays with counts and samples", () => {
  const candidates = Array.from({ length: 200 }, (_, index) => ({
    name: `Candidate ${index}`,
    symbol: `C${index}`,
    rawPayload: "p".repeat(25_000),
  }));

  const compacted = compactMetaForReportWriters({
    runId: "scan_test",
    discovery: {
      mode: "free-max",
      rawCount: 200,
      dedupedCount: 200,
      acceptedCount: 125,
      candidates,
      shadowRejectedCandidates: candidates,
      discoveryCoverage: { shadowRejected: candidates },
    },
  });

  assert.equal(compacted.runId, "scan_test");
  assert.equal(compacted.discovery.candidateCount, 200);
  assert.equal(compacted.discovery.shadowRejectedCandidateCount, 200);
  assert.equal(compacted.discovery.candidateSamples.length, 50);
  assert.equal(compacted.discovery.shadowRejectedSamples.length, 50);
  assert.equal("candidates" in compacted.discovery, false);
  assert.equal("shadowRejectedCandidates" in compacted.discovery, false);
  assert.equal(compacted.discovery.discoveryCoverage.shadowRejected, undefined);
});

test("report project array compactor does not double-compact already bounded projects", () => {
  const [first] = compactProjectsForReportWriters([
    { name: "One", symbol: "ONE", pipelineScore: 10 },
  ]);
  const [second] = compactProjectsForReportWriters([first]);

  assert.strictEqual(second, first);
  assert.equal(second.reportCompaction.mode, "bounded-project");
});

test("report compaction preserves every decision-critical field beyond the ordinary key cap", () => {
  const filler = Object.fromEntries(Array.from({ length: 140 }, (_, index) => [`filler${index}`, index]));
  const compacted = compactProjectForReportWriters({
    ...filler,
    name: "Protected Truth",
    symbol: "PTR",
    sourceTruth: { status: "VERIFIED", independentSources: 3 },
    activeEvidenceRecovery: { status: "RECOVERED", recoveredFields: ["liquidityUsd"] },
    executionProof: { executionProofState: "LIVE_EXECUTION_READY" },
    engineDataReadiness: { status: "CORE_READY" },
    dataStarvationRootCauses: { RAW_SOURCE_MISSING: 1 },
    targetedEnrichmentPlan: { status: "TARGETED_RECOVERY_AVAILABLE" },
    valueOfInformationPlan: { topField: "holderCount" },
    progressivePipelineStages: { deep: "COMPLETE" },
  }, { objectKeyLimit: 5 });

  assert.equal(compacted.sourceTruth.status, "VERIFIED");
  assert.equal(compacted.activeEvidenceRecovery.status, "RECOVERED");
  assert.equal(compacted.executionProof.executionProofState, "LIVE_EXECUTION_READY");
  assert.equal(compacted.engineDataReadiness.status, "CORE_READY");
  assert.equal(compacted.dataStarvationRootCauses.RAW_SOURCE_MISSING, 1);
  assert.equal(compacted.targetedEnrichmentPlan.status, "TARGETED_RECOVERY_AVAILABLE");
  assert.equal(compacted.valueOfInformationPlan.topField, "holderCount");
  assert.equal(compacted.progressivePipelineStages.deep, "COMPLETE");
  assert.equal(Object.hasOwn(compacted, "filler139"), false);
});
