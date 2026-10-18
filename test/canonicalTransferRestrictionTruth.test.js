import test from "node:test";
import assert from "node:assert/strict";
import { analyzeInstantSafetyGate } from "../src/engines/instantSafetyGateEngine.js";
import { analyzeExecutionProof } from "../src/engines/executionProofEngine.js";
import { selectExecutionRecoveryCandidates } from "../src/engines/executionProofRecoveryEngine.js";
import { isLiveExecutionReady } from "../src/execution/routeTruthV2.js";
import { deterministicCandidateBlocks } from "../src/kernel/candidateTruthState.js";
import { summarizeEvidenceFunnel } from "../src/kernel/evidenceFunnelSummary.js";
import { buildActiveEvidenceRecoveryWaves } from "../src/engines/activeEvidenceRecoveryEngine.js";
import { executeActiveEvidenceProviderRequests } from "../src/data/activeEvidenceProviderExecutor.js";
import { decisionCompleteProject } from "./fixtures/decisionCompleteProject.js";

test("canonical blacklist and sell restriction observations outrank stale positive simulations", () => {
  for (const field of ["blacklistEnabled", "sellRestricted"]) {
    const result = analyzeInstantSafetyGate({ [field]: true, buySimulationPassed: true, sellSimulationPassed: true });
    assert.equal(result.instantSafetyStatus, "CRITICAL", field);
    assert.ok(result.instantSafetyGate.criticalReasons.length > 0);
  }
});

test("current raw transfer restrictions cannot borrow a stale ready execution proof", () => {
  const ready = decisionCompleteProject();
  for (const field of ["blacklistEnabled", "sellRestricted", "hiddenTransferRestriction", "transferRestricted",
    "blacklistAuthority", "canBlacklist"]) {
    const candidate = { ...ready, [field]: true, finalSelectionState: "QUALIFIED", finalSelectionQualified: true };
    assert.equal(isLiveExecutionReady(candidate), false, field);
    assert.ok(deterministicCandidateBlocks(candidate).length > 0, field);
    const summary = summarizeEvidenceFunnel([candidate]);
    assert.equal(summary.verifiedRoutes, 0, field);
    assert.equal(summary.fullyQualified, 0, field);
    assert.equal(summary.deterministicallyBlocked, 1, field);
    assert.equal(summary.unresolvedDecisionEvidence, 0, field);
  }
});

test("the current proof producer reports known transfer restrictions as negative safety", () => {
  for (const field of ["blacklistEnabled", "sellRestricted"]) {
    const result = analyzeExecutionProof({ ...decisionCompleteProject(), [field]: true });
    assert.equal(result.executionProof.safetyVerified, false, field);
    assert.equal(result.executionProof.sellQuoteVerified, false, field);
    assert.equal(result.executionProof.executionStatus, "HONEYPOT_RISK", field);
    assert.equal(result.liveExecutionReady, false, field);
  }
});

test("unknown canonical restriction values cannot establish safety or erase legacy danger", () => {
  for (const value of [undefined, null, false, "UNKNOWN", "true", 1, {}]) {
    const result = analyzeInstantSafetyGate({ blacklistEnabled: value, sellRestricted: value });
    assert.equal(result.instantSafetyStatus, "UNVERIFIED", JSON.stringify(value));
    assert.equal(result.instantSafetyGate.criticalReasons.length, 0);
  }
  const restricted = analyzeInstantSafetyGate({ blacklistEnabled: false, sellRestricted: false, blacklistAuthority: true });
  assert.equal(restricted.instantSafetyStatus, "CRITICAL");
});

test("obsolete recovery plans cannot spend Wave3 on known raw transfer restrictions", () => {
  const ready = decisionCompleteProject();
  const candidate = { ...ready, targetedEnrichmentPlan: { items: [{ canonicalField: "purchaseRouteConfirmed",
    requiresFreshObservation: true, targetSources: [{ source: "LI.FI keyless quote" }] }] } };
  const options = { wave1Max: 0, wave2Max: 0, wave3Max: 1 };
  assert.equal(buildActiveEvidenceRecoveryWaves([candidate], options).waves.WAVE3.length, 1);
  for (const field of ["blacklistEnabled", "sellRestricted"]) {
    assert.equal(buildActiveEvidenceRecoveryWaves([{ ...candidate, [field]: true }], options).waves.WAVE3.length, 0, field);
  }
});

test("the raw execution recovery entrypoint refuses known restrictions before any HTTP call", async () => {
  for (const field of ["blacklistEnabled", "sellRestricted"]) {
    let calls = 0;
    const result = await executeActiveEvidenceProviderRequests({ ...decisionCompleteProject(), [field]: true }, [{
      field: "purchaseRouteConfirmed", item: { requiresFreshObservation: true,
        targetSources: [{ source: "LI.FI keyless quote" }] },
    }], { useCache: false, maxRequests: 4, executionRecovery: { enabled: true,
      lifiEnabled: true, jupiterApiKey: "", zeroxApiKey: "", tradeSizesUsd: [25],
      lifiRateBudget: { windowStartedAtMs: Date.now(), requests: 0 },
      fetchJson: async () => { calls++; throw new Error("Known blocked candidate must not fetch."); },
    } });
    assert.equal(calls, 0, field);
    assert.deepEqual(result.observations, []);
    assert.deepEqual(result.projectPatch, {});
    assert.ok(result.attempts.some((attempt) => attempt.status === "SAFETY_BLOCKED"));
  }
});

test("standalone recovery cannot bypass the same canonical restriction policy", () => {
  const candidate = { ...decisionCompleteProject(), buyQuoteVerified: false, sellQuoteVerified: false };
  assert.equal(selectExecutionRecoveryCandidates([candidate]).length, 1);
  for (const field of ["blacklistEnabled", "sellRestricted", "hiddenTransferRestriction", "transferRestricted",
    "blacklistAuthority", "canBlacklist"]) {
    assert.equal(selectExecutionRecoveryCandidates([{ ...candidate, [field]: true }]).length, 0, field);
  }
});
