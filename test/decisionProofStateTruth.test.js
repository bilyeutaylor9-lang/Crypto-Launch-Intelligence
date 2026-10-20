import test from "node:test";
import assert from "node:assert/strict";
import { decisionProofAssessment, summarizeEvidenceFunnel } from "../src/kernel/evidenceFunnelSummary.js";
import { createEvidenceFunnelSnapshot, getFrozenEvidenceFunnel } from "../src/reports/evidenceFunnelSnapshot.js";

function unknownCandidate(extra = {}) {
  return { deepEvaluationState: "DEEP_EVALUATED", coreEvidenceState: "CORE_EVIDENCE_READY",
    coreEvidenceCoveragePct: 92, advisoryEvidenceCoveragePct: 80,
    finalSelectionQualified: false, executionProof: { buyQuoteVerified: false,
      sellQuoteVerified: false, safetyVerified: false }, ...extra };
}

test("selection labels and low unknown-derived scores cannot discharge missing decision proof", () => {
  for (const finalSelectionState of ["BLOCKED", "IDENTITY_CONFLICT", "INSUFFICIENT_DATA"]) {
    const candidate = unknownCandidate({ finalSelectionState, pipelineScore: 0,
      finalBlockingReasons: ["Pipeline score 0 is below required minimum 60."] });
    const proof = decisionProofAssessment(candidate);
    assert.equal(proof.conclusivelyRejected, false);
    assert.ok(proof.missingFields.includes("BUY_QUOTE"));
    assert.ok(proof.missingFields.includes("SAFETY"));
    const funnel = summarizeEvidenceFunnel([candidate]);
    assert.equal(funnel.healthyCoreEvidence, true);
    assert.equal(funnel.healthyDecisionEvidence, false);
    assert.equal(funnel.deterministicallyBlocked, 0);
    assert.equal(funnel.conclusivelyRejected, 0);
    assert.equal(funnel.unresolvedDecisionEvidence, 1);
    assert.equal(funnel.selectionOutcome, "DATA_DEGRADED");
  }
});

test("unknown or negated safety messages and generic rejected status remain unresolved", () => {
  for (const extra of [
    { finalBlockingReasons: ["No verified honeypot evidence; safety remains UNKNOWN."] },
    { hardBlockers: ["Cannot rule out malicious activity because evidence is missing."] },
    { executionProof: { executionStatus: "REJECTED", buyQuoteVerified: false, sellQuoteVerified: false } },
  ]) {
    const funnel = summarizeEvidenceFunnel([unknownCandidate({ finalSelectionState: "BLOCKED", ...extra })]);
    assert.equal(funnel.conclusivelyRejected, 0);
    assert.equal(funnel.unresolvedDecisionEvidence, 1);
    assert.equal(funnel.selectionOutcome, "DATA_DEGRADED");
  }
});

test("typed conclusive negative evidence still blocks without irrelevant quote recovery", () => {
  for (const extra of [
    { honeypotDetected: true }, { sellRestricted: true }, { canonicalIdentityHardBlock: true },
    { contractChainMismatch: true }, { executionProof: { executionStatus: "CONTRACT_MISMATCH" } },
    { executionProof: { authorityEvidenceRequired: true, authorityEvidenceVerified: true, authoritySafetyClean: false } },
  ]) {
    const candidate = unknownCandidate({ finalSelectionState: "BLOCKED", ...extra });
    assert.deepEqual(decisionProofAssessment(candidate), { conclusivelyRejected: true, missingFields: [] });
    const funnel = summarizeEvidenceFunnel([candidate]);
    assert.equal(funnel.deterministicallyBlocked, 1);
    assert.equal(funnel.conclusivelyRejected, 1);
    assert.equal(funnel.unresolvedDecisionEvidence, 0);
    assert.equal(funnel.fullyQualified, 0);
    assert.equal(funnel.selectionOutcome, "NO_EDGE_FOUND");
  }
});

test("identity-conflict selection label cannot retain a stale qualified flag", () => {
  const candidate = unknownCandidate({ finalSelectionState: "IDENTITY_CONFLICT",
    finalSelectionQualified: true, executionProof: {} });
  const funnel = summarizeEvidenceFunnel([candidate]);
  assert.equal(funnel.fullyQualified, 0);
  assert.equal(funnel.unresolvedDecisionEvidence, 1);
  assert.equal(funnel.selectionOutcome, "DATA_DEGRADED");
});

test("deferred label denials never enter the decision recovery denominator", () => {
  const unknown = unknownCandidate({ finalSelectionState: "BLOCKED", pipelineScore: 0 });
  const deferred = Array.from({ length: 3500 }, () => ({ ...unknown, deepEvaluationState: "DEFERRED_BEFORE_DEEP" }));
  const funnel = summarizeEvidenceFunnel([unknown, ...deferred]);
  assert.equal(funnel.deepDeferred, 3500);
  assert.equal(funnel.deepEvaluated, 1);
  assert.equal(funnel.unresolvedDecisionEvidence, 1);
  assert.equal(funnel.deterministicallyBlocked, 0);
  assert.equal(funnel.selectionOutcome, "DATA_DEGRADED");
});

test("frozen reports use the same typed conclusive-block rule as live evidence health", () => {
  const meta = { scanRunId: "typed-block-frame", dataCutoffTimestamp: new Date(Date.now() - 1000).toISOString() };
  for (const extra of [{ finalBlockingReasons: ["Pipeline score 0 is below required minimum 60."] },
    { honeypotDetected: true }]) {
    const projects = [unknownCandidate({ finalSelectionState: "BLOCKED", ...extra })];
    const summary = summarizeEvidenceFunnel(projects);
    const snapshot = createEvidenceFunnelSnapshot(projects, summary, meta);
    assert.ok(snapshot);
    assert.equal(getFrozenEvidenceFunnel(projects, { ...meta, evidenceFunnelSnapshot: snapshot }).conclusivelyRejected,
      summary.conclusivelyRejected);
    const forged = { ...summary, deterministicallyBlocked: summary.conclusivelyRejected ? 0 : 1 };
    assert.equal(createEvidenceFunnelSnapshot(projects, forged, meta), null);
  }
});
