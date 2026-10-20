import test from "node:test";
import assert from "node:assert/strict";
import { analyzeExecutionProof } from "../src/engines/executionProofEngine.js";
import { hasFreshTokenAuthorityEvidence } from "../src/execution/routeTruthV2.js";
import { decisionProofAssessment } from "../src/kernel/evidenceFunnelSummary.js";

const MINT = "3HLhtXNCVh1VbCrpwACoZWwHoNeoCB7hRAPcYN2jjUiL";
const POOL = "DN5Eq6ELcvUcC69VNbNW5pNbnt3bvtVGfHpBWb8pAcoF";
function proof(overrides = {}) {
  return { provider: "solana-rpc-rugcheck", status: "EVIDENCE_AVAILABLE", chain: "solana", address: MINT,
    responseIdentityVerified: true, identityVerifiedOnChain: true, snapshotTimestampVerified: true,
    sourceTimestamp: new Date(Date.now() - 1000).toISOString(), observedAt: new Date().toISOString(),
    testedChecks: ["mint-account identity", "mint authority", "freeze authority"],
    mintRisk: false, freezeRisk: false, ...overrides };
}
function project(evidence = [], overrides = {}) {
  return { chain: "solana", tokenAddress: MINT, poolAddress: POOL, securityEvidence: evidence,
    mintAuthorityEnabled: false, freezeAuthorityEnabled: false, ...overrides };
}
function assess(candidate) { return analyzeExecutionProof(candidate).executionProof; }

test("fresh exact on-chain paired authority evidence remains usable", () => {
  const result = assess(project([proof()]));
  assert.equal(result.authorityEvidenceRequired, true);
  assert.equal(result.authorityEvidenceVerified, true);
  assert.equal(result.authoritySafetyClean, true);
  assert.equal(result.transferTaxEvidenceRequired, false);
});

test("a source label on scalar aliases cannot replace an on-chain authority proof", () => {
  const result = assess(project([], { fieldProvenance: {
    mintAuthorityEnabled: { source: "unknown-provider", verificationStatus: "UNKNOWN" },
    freezeAuthorityEnabled: { source: "unknown-provider", verificationStatus: "UNKNOWN" },
  } }));
  assert.equal(result.authorityEvidenceVerified, false);
  assert.equal(result.authoritySafetyClean, false);
});

test("stale, future, absent and malformed snapshot times cannot borrow a fresh receipt timestamp", () => {
  for (const sourceTimestamp of [new Date(Date.now() - 300_001).toISOString(),
    new Date(Date.now() + 60_000).toISOString(), undefined, null, "invalid"]) {
    const result = assess(project([proof({ sourceTimestamp })]));
    assert.equal(result.authorityEvidenceVerified, false, String(sourceTimestamp));
    assert.equal(result.authoritySafetyClean, false);
  }
});

test("foreign identities and unverified provider or snapshot flags remain unknown", () => {
  for (const patch of [{ chain: "base" }, { address: "So11111111111111111111111111111111111111112" },
    { address: MINT.toLowerCase() }, { address: undefined }, { responseIdentityVerified: false },
    { identityVerifiedOnChain: false }, { snapshotTimestampVerified: false },
    { status: "UNKNOWN" }, { mintRisk: null }, { freezeRisk: undefined },
    { testedChecks: ["mint authority"] }]) {
    const result = assess(project([proof(patch)]));
    assert.equal(result.authorityEvidenceVerified, false, JSON.stringify(patch));
    assert.equal(result.authoritySafetyClean, false);
  }
});

test("conflicting project token or chain aliases cannot borrow valid authority evidence", () => {
  assert.equal(assess(project([proof()], {
    contractAddress: "So11111111111111111111111111111111111111112",
  })).authorityEvidenceVerified, false);
  const wrongChain = assess(project([proof()], { chainId: "base" }));
  assert.equal(wrongChain.exactIdentityVerified, false);
  assert.equal(wrongChain.liveExecutionReady, false);
});

test("fresh verified active authorities remain an unsafe observation, not missing evidence", () => {
  for (const patch of [{ mintRisk: true }, { freezeRisk: true }]) {
    const result = assess(project([proof(patch)]));
    assert.equal(result.authorityEvidenceVerified, true);
    assert.equal(result.authoritySafetyClean, false);
    assert.equal(result.liveExecutionReady, false);
  }
});

test("persisted positive authority flags cannot freeze snapshot freshness or hide its recovery field", () => {
  const candidate = analyzeExecutionProof(project([proof()]));
  assert.equal(hasFreshTokenAuthorityEvidence(candidate), true);
  for (const authorityEvidenceSourceTimestamp of [undefined, null, "invalid",
    new Date(Date.now() - 300_001).toISOString(), new Date(Date.now() + 60_000).toISOString()]) {
    const stale = { ...candidate, executionProof: { ...candidate.executionProof, authorityEvidenceSourceTimestamp } };
    assert.equal(hasFreshTokenAuthorityEvidence(stale), false);
    assert.ok(decisionProofAssessment(stale).missingFields.includes("TOKEN_AUTHORITY"));
  }
});
