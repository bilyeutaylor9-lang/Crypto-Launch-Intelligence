import test from "node:test";
import assert from "node:assert/strict";
import { buildActiveEvidenceRecoveryWaves } from "../src/engines/activeEvidenceRecoveryEngine.js";
import { sourcesForField } from "../src/data/enrichmentSourceRegistry.js";
import { decisionCompleteProject } from "./fixtures/decisionCompleteProject.js";
import { analyzeExecutionProofRecoveryBatch } from "../src/engines/executionProofRecoveryEngine.js";

function quoteMissing(overrides = {}) {
  const project = decisionCompleteProject();
  return { ...project, ...overrides, executionProof: { ...project.executionProof,
    liveExecutionReady: false, buyQuoteVerified: false, sellQuoteVerified: false,
    executionProofState: "BUY_QUOTE_REQUIRED", routeTruthStatus: "BUY_QUOTE_REQUIRED",
    ...overrides.executionProof } };
}

test("actual missing execution proof creates a fresh wave 3 plan without a manifest input gap", () => {
  const project = quoteMissing();
  const result = buildActiveEvidenceRecoveryWaves([project], { freeOnly: true });
  assert.equal(result.waves.WAVE1.length, 0);
  assert.equal(result.waves.WAVE2.length, 0);
  assert.equal(result.waves.WAVE3.length, 1);
  assert.deepEqual(new Set(result.waves.WAVE3[0].entries.map((item) => item.field)),
    new Set(["purchaseRouteConfirmed", "sellRouteAvailable", "quoteTimestamp", "slippagePct"]));
  for (const entry of result.waves.WAVE3[0].entries) {
    assert.equal(entry.item.requiresFreshObservation, true);
    assert.equal(entry.coreEvidence, true);
    assert.deepEqual(entry.item.targetSources.map((item) => item.source), ["LI.FI keyless quote"]);
  }
});

test("wave 3 proof recovery honors execution priority and candidate limit", () => {
  const projects = [10, 80, 40].map((score) => quoteMissing({ symbol: `P${score}`, preliminaryOpportunityScore: score }));
  const result = buildActiveEvidenceRecoveryWaves(projects, { wave3Max: 1 });
  assert.equal(result.waves.WAVE3.length, 1);
  assert.equal(result.waves.WAVE3[0].project.symbol, "P80");
});

test("deferred, conclusively rejected and already quoted candidates do not receive fresh quote plans", () => {
  const candidates = [quoteMissing({ deepEvaluationState: "DEFERRED_BEFORE_DEEP" }),
    quoteMissing({ honeypotDetected: true, finalSelectionState: "BLOCKED" }), decisionCompleteProject(),
    decisionCompleteProject({ instantSafetyStatus: "UNKNOWN", safetyProofStatus: "UNKNOWN" })];
  assert.equal(buildActiveEvidenceRecoveryWaves(candidates).waves.WAVE3.length, 0);
});

test("Solana keyless mode does not route quotes to EVM or unimplemented providers", () => {
  const project = { chain: "solana", tokenAddress: "E6vtwCUtcNJdQEPGY8vWKahtu2sfwxQ4j68pUKm7pump",
    deepEvaluationState: "DEEP_EVALUATED", executionProof: { routeType: "DEX", liveExecutionReady: false,
      executionProofState: "MARKET_OBSERVED", buyQuoteVerified: false, sellQuoteVerified: false } };
  assert.equal(buildActiveEvidenceRecoveryWaves([project], { freeOnly: true }).waves.WAVE3.length, 0);
  const keyed = buildActiveEvidenceRecoveryWaves([project], { freeOnly: false });
  assert.equal(keyed.waves.WAVE3.length, 1);
  assert.ok(keyed.waves.WAVE3[0].entries.every((entry) =>
    entry.item.targetSources.every((source) => source.source === "Jupiter (API key required)")));
});

test("CEX proof recovery uses implemented public order books rather than DEX adapters", () => {
  const project = quoteMissing({ executionProof: { routeType: "CEX" } });
  const result = buildActiveEvidenceRecoveryWaves([project]);
  assert.equal(result.waves.WAVE3.length, 1);
  assert.ok(result.waves.WAVE3[0].entries.every((entry) =>
    entry.item.targetSources.every((source) => source.source === "CEX public order books")));
});

test("registry does not advertise unimplemented quote and bridge recovery", () => {
  const sources = sourcesForField("purchaseRouteConfirmed").map((source) => source.source);
  assert.equal(sources.includes("Uniswap quote adapters"), false);
  assert.equal(sources.includes("bridge quote adapters"), false);
  assert.equal(sourcesForField("bridgeRequired").length, 0);
});

test("normal pipeline deferral preserves raw route evidence and makes no unbudgeted quote call", async () => {
  const project = quoteMissing();
  const [deferred] = await analyzeExecutionProofRecoveryBatch([project], { deferToActiveEvidence: true,
    fetchJson: async () => { assert.fail("Quote acquisition must wait for the Wave3 request budget"); } });
  assert.equal(deferred.executionProofRecovery.status, "DEFERRED_TO_WAVE3");
  assert.equal(deferred.executionProofRecovery.attempted, false);
  assert.equal(deferred.executionProofRecoveryStage.attemptedCandidates, 0);
  assert.equal(deferred.canonicalExecutionRoute, project.canonicalExecutionRoute);
  assert.equal(buildActiveEvidenceRecoveryWaves([deferred]).waves.WAVE3.length, 1);
});
