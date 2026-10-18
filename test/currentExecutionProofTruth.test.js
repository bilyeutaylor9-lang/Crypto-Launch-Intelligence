import test from "node:test";
import assert from "node:assert/strict";
import { analyzeExecutionProof } from "../src/engines/executionProofEngine.js";
import { attachCandidateTruthState } from "../src/kernel/candidateTruthState.js";
import { hasVerifiedExecutionRoute, summarizeEvidenceFunnel } from "../src/kernel/evidenceFunnelSummary.js";
import { hasExactRouteIdentity, hasVerifiedBuyQuote, hasVerifiedSellQuote, isLiveExecutionReady,
  routeQuoteAgeSeconds } from "../src/execution/routeTruthV2.js";
import { decisionCompleteProject } from "./fixtures/decisionCompleteProject.js";
import { buildScannerSemanticHealth } from "../src/index.js";

test("fresh complete execution proof remains ready across consumers", () => {
  const project = decisionCompleteProject();
  assert.equal(project.executionProofState, "LIVE_EXECUTION_READY");
  assert.equal(isLiveExecutionReady(project), true);
  assert.equal(hasVerifiedExecutionRoute(project), true);
  assert.equal(attachCandidateTruthState(project).executionReadinessState, "READY");
});

test("current negative tax proof cannot be overruled by retained live route flags", () => {
  const project = decisionCompleteProject({ buyTaxPct: undefined, sellTaxPct: undefined });
  assert.equal(project.executionProofState, "TRANSFER_TAX_EVIDENCE_REQUIRED");
  assert.equal(project.canonicalExecutionRoute.routeTruthStatus, "LIVE_EXECUTION_READY");
  assert.equal(isLiveExecutionReady(project), false);
  assert.equal(hasVerifiedExecutionRoute(project), false);
  assert.notEqual(attachCandidateTruthState(project).executionReadinessState, "READY");
  const staleSelected = { ...project, finalSelectionState: "QUALIFIED", finalSelectionQualified: true };
  assert.equal(summarizeEvidenceFunnel([staleSelected]).fullyQualified, 0);
  assert.equal(buildScannerSemanticHealth([staleSelected]).status, "DATA_DEGRADED");
});

test("null, partial, invalid and empty tax observations cannot verify transfer taxes", () => {
  for (const patch of [{ buyTaxPct: null, sellTaxPct: null }, { sellTaxPct: undefined },
    { buyTaxPct: "", sellTaxPct: "" }, { buyTaxPct: false }, { buyTaxPct: -1 },
    { buyTaxPct: 101 }, { buyTaxPct: undefined, sellTaxPct: undefined, transferTaxEvidence: {} }]) {
    const project = decisionCompleteProject(patch);
    assert.equal(project.executionProof.transferTaxEvidenceVerified, false);
    assert.equal(isLiveExecutionReady(project), false);
  }
});

test("nested negative quote and identity evidence outranks retained positives", () => {
  const base = decisionCompleteProject();
  for (const [field, checker] of [["buyQuoteVerified", hasVerifiedBuyQuote],
    ["sellQuoteVerified", hasVerifiedSellQuote], ["exactIdentityVerified", hasExactRouteIdentity]]) {
    for (const value of [false, null]) {
      const project = { ...base, [field]: true, executionProof: { ...base.executionProof, [field]: value } };
      assert.equal(checker(project), false);
      assert.equal(isLiveExecutionReady(project), false);
      assert.equal(hasVerifiedExecutionRoute(project), false);
      assert.notEqual(attachCandidateTruthState(project).executionReadinessState, "READY");
    }
  }
});

test("nested stale or missing quote freshness cannot borrow a retained fresh age", () => {
  const base = decisionCompleteProject();
  for (const age of [7200, null, "", false, -1]) {
    const project = { ...base, quoteAgeSeconds: 30, executionProof: { ...base.executionProof, quoteFreshnessSeconds: age } };
    assert.equal(routeQuoteAgeSeconds(project), age === 7200 ? 7200 : null);
    assert.equal(isLiveExecutionReady(project), false);
    assert.notEqual(attachCandidateTruthState(project).executionReadinessState, "READY");
  }
});

test("current safety, authority, tax, depth and slippage requirements cannot borrow retained clearance", () => {
  const base = decisionCompleteProject();
  for (const patch of [{ safetyVerified: false }, { authorityEvidenceRequired: true, authorityEvidenceVerified: false },
    { authorityEvidenceRequired: true, authorityEvidenceVerified: true, authoritySafetyClean: false },
    { transferTaxEvidenceRequired: true, transferTaxEvidenceVerified: false }, { orderBookDepthVerified: false },
    { slippageIsHeuristic: true }, { userAccessEvidenceRequired: true, userAccessVerified: false },
    { liveExecutionReady: false }]) {
    const project = { ...base, executionProof: { ...base.executionProof, ...patch } };
    assert.equal(isLiveExecutionReady(project), false);
    assert.notEqual(attachCandidateTruthState(project).executionReadinessState, "READY");
  }
});

test("fresh producer evidence can recover a candidate with a previous negative proof", () => {
  const negative = decisionCompleteProject({ buyTaxPct: undefined, sellTaxPct: undefined });
  const recovered = analyzeExecutionProof({ ...negative, buyTaxPct: 0, sellTaxPct: 0 });
  assert.equal(recovered.executionProofState, "LIVE_EXECUTION_READY");
  assert.equal(isLiveExecutionReady(recovered), true);
  assert.equal(attachCandidateTruthState(recovered).executionReadinessState, "READY");
});

test("healthy input coverage without decision proof is not healthy no-edge evidence", () => {
  const rows = Array.from({ length: 43 }, () => ({ deepEvaluationState: "DEEP_EVALUATED",
    coreEvidenceState: "CORE_EVIDENCE_READY", coreEvidenceCoveragePct: 91,
    finalSelectionState: "INSUFFICIENT_DATA" }));
  const health = summarizeEvidenceFunnel(rows);
  assert.equal(health.coreEvidenceReady, 43);
  assert.equal(health.coreDataStarved, 0);
  assert.equal(health.unresolvedDecisionEvidence, 43);
  assert.equal(health.decisionProofMissingFields.IDENTITY, 43);
  assert.equal(health.healthyCoreEvidence, true);
  assert.equal(health.healthyDecisionEvidence, false);
  assert.equal(health.selectionOutcome, "DATA_DEGRADED");
});

test("conclusive rejection and advisory-only gaps do not require irrelevant proof", () => {
  const rejected = summarizeEvidenceFunnel([{ deepEvaluationState: "DEEP_EVALUATED",
    coreEvidenceState: "CORE_EVIDENCE_READY", coreEvidenceCoveragePct: 91,
    finalSelectionState: "BLOCKED", honeypotDetected: true }]);
  assert.equal(rejected.unresolvedDecisionEvidence, 0);
  assert.equal(rejected.selectionOutcome, "NO_EDGE_FOUND");
  const advisory = summarizeEvidenceFunnel([{ ...decisionCompleteProject(), advisoryDataGaps: true }]);
  assert.equal(advisory.unresolvedDecisionEvidence, 0);
  assert.equal(advisory.advisoryDataGaps, 1);
  assert.equal(advisory.selectionOutcome, "NO_EDGE_FOUND");
});

test("the 28 quote, 11 safety and 4 identity proof gaps remain degraded with healthy core inputs", () => {
  const base = decisionCompleteProject();
  const groups = [[28, { buyQuoteVerified: false, executionProofState: "BUY_QUOTE_REQUIRED" }],
    [11, { safetyVerified: false, executionProofState: "SAFETY_REVIEW" }],
    [4, { exactIdentityVerified: false, executionProofState: "IDENTITY_REQUIRED" }]];
  const rows = groups.flatMap(([count, patch]) => Array.from({ length: count }, () => ({ ...base,
    finalSelectionState: "INSUFFICIENT_DATA", executionProof: { ...base.executionProof,
      liveExecutionReady: false, ...patch, routeTruthStatus: patch.executionProofState } })));
  rows.push({ deepEvaluationState: "DEFERRED_BEFORE_DEEP" });
  const health = buildScannerSemanticHealth(rows);
  assert.equal(health.deepEvaluated, 43);
  assert.equal(health.deepDeferred, 1);
  assert.equal(health.coreEvidenceReady, 43);
  assert.equal(health.unresolvedDecisionEvidence, 43);
  assert.equal(health.insufficientDataCandidates, 43);
  assert.equal(health.decisionProofMissingFields.BUY_QUOTE, 28);
  assert.equal(health.decisionProofMissingFields.SAFETY, 11);
  assert.equal(health.decisionProofMissingFields.IDENTITY, 4);
  assert.equal(health.verifiedRoutes, 0);
  assert.equal(health.status, "DATA_DEGRADED");
  assert.equal(health.readinessClass, "DATA_DEGRADED");
});
