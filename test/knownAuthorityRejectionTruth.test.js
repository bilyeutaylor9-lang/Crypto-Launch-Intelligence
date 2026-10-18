import test from "node:test";
import assert from "node:assert/strict";
import { buildCandidateProofState, deterministicCandidateBlocks } from "../src/kernel/candidateTruthState.js";
import { decisionProofAssessment, summarizeEvidenceFunnel } from "../src/kernel/evidenceFunnelSummary.js";

function candidate(proof = {}) {
  return {
    chain: "solana",
    tokenAddress: "DWCj1WhLQouv7WgfzLM4V1K3AQadZr4re6gSbLdD7Ppo",
    poolAddress: "A5YvHkFxKwm2M1KXy9iaAU45EshX8nZcdSZSsVZQ21y2",
    deepEvaluationState: "DEEP_EVALUATED",
    coreEvidenceState: "CORE_EVIDENCE_READY",
    coreEvidenceCoveragePct: 92,
    finalSelectionState: "INSUFFICIENT_DATA",
    finalSelectionQualified: false,
    contractSafetyVerified: true,
    safetyTestedChecks: ["mint authority", "freeze authority"],
    executionProof: {
      routeKind: "SOLANA",
      authorityEvidenceRequired: true,
      authorityEvidenceVerified: true,
      authoritySafetyClean: false,
      buyQuoteVerified: false,
      sellQuoteVerified: false,
      liveExecutionReady: false,
      ...proof,
    },
  };
}

test("verified unsafe authority is a conclusive rejection, not a request for more quotes", () => {
  const project = candidate();
  assert.ok(deterministicCandidateBlocks(project).some((reason) => /authority/i.test(reason)));
  assert.equal(buildCandidateProofState(project).safety.status, "BLOCKED");
  assert.deepEqual(decisionProofAssessment(project), { conclusivelyRejected: true, missingFields: [] });
  const funnel = summarizeEvidenceFunnel([project]);
  assert.equal(funnel.deterministicallyBlocked, 1);
  assert.equal(funnel.conclusivelyRejected, 1);
  assert.equal(funnel.unresolvedDecisionEvidence, 0);
  assert.equal(funnel.verifiedRoutes, 0);
  assert.equal(funnel.fullyQualified, 0);
  assert.equal(funnel.selectionOutcome, "NO_EDGE_FOUND");
});

test("unknown or unverified authority is never converted into a known rejection or clean proof", () => {
  for (const proof of [
    { authorityEvidenceVerified: false },
    { authorityEvidenceVerified: null },
    { authorityEvidenceVerified: "true" },
    { authoritySafetyClean: null },
    { authoritySafetyClean: undefined },
    { authoritySafetyClean: "false" },
  ]) {
    const project = candidate(proof);
    assert.deepEqual(deterministicCandidateBlocks(project), []);
    assert.equal(decisionProofAssessment(project).conclusivelyRejected, false);
    assert.ok(decisionProofAssessment(project).missingFields.includes("TOKEN_AUTHORITY"));
    assert.equal(summarizeEvidenceFunnel([project]).selectionOutcome, "DATA_DEGRADED");
  }
});

test("a clean current authority proof clears the authority block but not missing quote gates", () => {
  const project = candidate({ authoritySafetyClean: true });
  assert.deepEqual(deterministicCandidateBlocks(project), []);
  assert.equal(decisionProofAssessment(project).conclusivelyRejected, false);
  assert.ok(decisionProofAssessment(project).missingFields.includes("BUY_QUOTE"));
  assert.ok(!decisionProofAssessment(project).missingFields.includes("TOKEN_AUTHORITY"));
  assert.equal(summarizeEvidenceFunnel([project]).fullyQualified, 0);
});

test("non-applicable authority fields do not introduce a Solana-specific block", () => {
  const project = candidate({ authorityEvidenceRequired: false });
  assert.deepEqual(deterministicCandidateBlocks(project), []);
  assert.equal(decisionProofAssessment(project).conclusivelyRejected, false);
});
