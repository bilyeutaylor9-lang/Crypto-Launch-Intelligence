import test from "node:test";
import assert from "node:assert/strict";

import { buildScannerSemanticHealth } from "../src/index.js";

test("scanner semantic health judges only the deep-evaluated universe", () => {
  const health = buildScannerSemanticHealth([
    { symbol: "DEEP1", deepEvaluationState: "DEEP_EVALUATED", finalSelectionState: "INSUFFICIENT_DATA", evidenceCoverageScore: 35 },
    { symbol: "DEEP2", deepEvaluationState: "DEEP_EVALUATED", finalSelectionState: "RESEARCH_ONLY", coreEvidenceState: "CORE_EVIDENCE_READY", coreEvidenceCoveragePct: 75 },
    { symbol: "WAIT1", deepEvaluationState: "DEFERRED_BEFORE_DEEP", finalSelectionState: "INSUFFICIENT_DATA", evidenceCoverageScore: 0 },
    { symbol: "WAIT2", deepEvaluationState: "DEFERRED_BEFORE_DEEP", finalSelectionState: "INSUFFICIENT_DATA", evidenceCoverageScore: 0 },
    { symbol: "WAIT3", deepEvaluationState: "DEFERRED_BEFORE_DEEP", finalSelectionState: "INSUFFICIENT_DATA", evidenceCoverageScore: 0 },
  ]);

  assert.equal(health.standardCandidateCount, 5);
  assert.equal(health.deepEvaluatedCandidates, 2);
  assert.equal(health.deferredBeforeDeepCandidates, 3);
  assert.equal(health.insufficientDataCandidates, 1);
  assert.equal(health.insufficientDataRatioPct, 50);
});

test("optional remote-memory failure warns without degrading current scan evidence", () => {
  const health = buildScannerSemanticHealth([
    { symbol: "DEEP", deepEvaluationState: "DEEP_EVALUATED", finalSelectionState: "RESEARCH_ONLY", evidenceCoverageScore: 82 },
  ], {
    supabaseMemory: { status: "FAILED", required: false, reason: "optional receipt table unavailable" },
  });

  assert.equal(health.status, "NO_EDGE_FOUND");
  assert.equal(health.readinessClass, "HEALTHY_EVIDENCE");
  assert.equal(health.degradedLearningWarning, true);
});

test("advisory gaps do not masquerade as insufficient core data", () => {
  const health = buildScannerSemanticHealth([
    {
      symbol: "READY",
      deepEvaluationState: "DEEP_EVALUATED",
      finalSelectionState: "INSUFFICIENT_DATA",
      coreEvidenceState: "CORE_EVIDENCE_READY",
      coreEvidenceCoveragePct: 92,
      advisoryDataGaps: true,
    },
  ]);

  assert.equal(health.insufficientDataCandidates, 0);
  assert.equal(health.insufficientDataRatioPct, 0);
  assert.equal(health.coreEvidenceReady, 1);
  assert.equal(health.advisoryDataGaps, 1);
  assert.equal(health.status, "NO_EDGE_FOUND");
});
