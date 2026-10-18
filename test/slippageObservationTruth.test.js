import test from "node:test";
import assert from "node:assert/strict";
import { analyzeExecutionProof } from "../src/engines/executionProofEngine.js";
import { analyzeRouteAccessibility } from "../src/engines/routeAccessibilityEngine.js";
import { analyzeCanonicalExecutionRoute } from "../src/engines/canonicalExecutionRouteEngine.js";
import { hasVerifiedRouteSlippage } from "../src/execution/routeTruthV2.js";
import { decisionCompleteProject } from "./fixtures/decisionCompleteProject.js";

function project(overrides = {}) {
  const complete = decisionCompleteProject();
  const { executionProof, ...raw } = complete;
  return {
    ...raw,
    estimatedSlippagePct: undefined,
    canonicalExecutionRoute: { ...raw.canonicalExecutionRoute, estimatedSlippagePct: undefined },
    ...overrides,
  };
}

test("route accessibility cannot turn the producer's own heuristic into observed slippage on rerun", () => {
  const first = analyzeExecutionProof(project());
  assert.equal(first.executionProof.slippageIsHeuristic, true);
  assert.ok(first.executionProof.estimatedSlippage100 > 0);
  const normalized = analyzeRouteAccessibility(first);
  const rerun = analyzeExecutionProof(normalized);
  assert.equal(rerun.executionProof.observedSlippagePct, null);
  assert.equal(rerun.executionProof.slippageIsHeuristic, true);
  assert.equal(hasVerifiedRouteSlippage(rerun), false);
  assert.equal(rerun.moneyEvidence.slippage100.status, "UNKNOWN");
  assert.equal(rerun.liveExecutionReady, false);
});

test("an explicitly heuristic route remains unverified after accessibility and proof normalization", () => {
  const raw = project();
  raw.canonicalExecutionRoute = { ...raw.canonicalExecutionRoute,
    estimatedRoundTripSlippagePct: 1, slippageIsHeuristic: true };
  const rerun = analyzeExecutionProof(analyzeRouteAccessibility(raw));
  assert.equal(rerun.executionProof.observedSlippagePct, null);
  assert.equal(hasVerifiedRouteSlippage(rerun), false);
});

test("paper-twin and small-cap simulation estimates cannot establish observed execution costs", () => {
  for (const patch of [
    { proofOfAlphaExecutionTwinSlippagePct: 0.2 },
    { proofOfAlphaExecutionTwin: { quote: { estimatedSlippagePct: 0.2 } } },
    { smallCapHunter: { execution: { slippagePct: 0.2 } } },
  ]) {
    const result = analyzeExecutionProof(project(patch));
    assert.equal(result.executionProof.observedSlippagePct, null);
    assert.equal(result.executionProof.slippageIsHeuristic, true);
    assert.equal(result.moneyEvidence.slippage100.status, "UNKNOWN");
  }
});

test("coercible, negative, hexadecimal and underflowed inputs cannot become measured zero slippage", () => {
  for (const value of [false, true, [], [1], {}, -1, "0x1", "1e-9999", "-0.01", "", Infinity]) {
    const subject = project({ estimatedSlippagePct: value });
    assert.equal(hasVerifiedRouteSlippage(subject), false, JSON.stringify(value));
    const result = analyzeExecutionProof(subject);
    assert.equal(result.executionProof.observedSlippagePct, null, JSON.stringify(value));
    assert.equal(hasVerifiedRouteSlippage(result), false);
  }
});

test("measured zero survives canonical and accessibility normalization without heuristic substitution", () => {
  const raw = project({ estimatedRoundTripSlippagePct: 0, slippageIsHeuristic: false });
  raw.canonicalExecutionRoute = { ...raw.canonicalExecutionRoute,
    estimatedRoundTripSlippagePct: 0, slippageIsHeuristic: false };
  const canonical = analyzeCanonicalExecutionRoute(raw);
  assert.equal(canonical.canonicalExecutionRoute.estimatedRoundTripSlippagePct, 0);
  const result = analyzeExecutionProof(analyzeRouteAccessibility(canonical));
  assert.equal(result.executionProof.observedSlippagePct, 0);
  assert.equal(result.executionProof.slippageIsHeuristic, false);
  assert.equal(hasVerifiedRouteSlippage(result), true);
});

test("current negative proof cannot borrow a retained positive slippage metric", () => {
  const measured = project({ estimatedSlippagePct: 1 });
  for (const proof of [
    { observedSlippagePct: null, slippageIsHeuristic: true },
    { observedSlippagePct: 1, slippageVerified: false },
    { observedSlippagePct: [], slippageIsHeuristic: false },
  ]) assert.equal(hasVerifiedRouteSlippage({ ...measured, executionProof: proof }), false);
});

test("fresh explicit observations recover a previous heuristic without requiring simulated flags", () => {
  const first = analyzeExecutionProof(project());
  const recovered = analyzeExecutionProof({ ...first, estimatedSlippagePct: 0.5,
    slippageIsHeuristic: false,
    canonicalExecutionRoute: { ...first.canonicalExecutionRoute,
      estimatedSlippagePct: 0.5, slippageIsHeuristic: false } });
  assert.equal(recovered.executionProof.observedSlippagePct, 0.5);
  assert.equal(recovered.executionProof.slippageIsHeuristic, false);
  assert.equal(hasVerifiedRouteSlippage(recovered), true);
});
