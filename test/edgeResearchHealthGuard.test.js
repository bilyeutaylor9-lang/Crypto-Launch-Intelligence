import test from "node:test";
import assert from "node:assert/strict";
import { buildEdgeResearchAutopilot } from "../src/learning/edgeResearchAutopilot.js";
import { buildEdgeDiscoveryLoop } from "../src/learning/edgeDiscoveryLoop.js";

for (const state of [undefined, "UNKNOWN", "AUTOPILOT_EVIDENCE_WARMING", "AUTOPILOT_EVIDENCE_COVERAGE_BLOCKED"]) {
  test(`research consumers cannot turn ${state || "absent"} health into verified edge review`, () => {
    const inputs = { health: { state }, outcomeLab: { verification: { state: "VERIFIED_MATCHED_NET_EDGE" } },
      prospectiveEntryEdge: { state: "VERIFIED_PROSPECTIVE_ENTRY_EDGE" },
      autopsy: { leadingObservedFailureMechanism: "CAPITAL_ARRIVAL" },
      contrast: { strongestObservedContrast: { key: "sellerExhaustion" } } };
    const autopilot = buildEdgeResearchAutopilot(inputs);
    const discovery = buildEdgeDiscoveryLoop(inputs);
    assert.notEqual(autopilot.state, "AUTOPILOT_VERIFIED_EDGE_REVIEW");
    assert.notEqual(autopilot.state, "AUTOPILOT_VERIFIED_ENTRY_EDGE_REVIEW");
    assert.equal(autopilot.verifiedEdge, null);
    assert.notEqual(discovery.state, "EDGE_VERIFIED_NO_HYPOTHESIS_MUTATION");
    assert.equal(discovery.nextExperiment.mechanism, "EVIDENCE_COVERAGE");
    assert.equal(autopilot.automaticTrading, false);
    assert.equal(autopilot.automaticProductionPromotion, false);
    assert.equal(discovery.rankingInfluence, false);
    assert.equal(discovery.hypothesisChanged, false);
  });
}

test("healthy evidence permits research review but never automatic trading or promotion", () => {
  const inputs = { health: { state: "AUTOPILOT_EVIDENCE_HEALTHY" },
    outcomeLab: { verification: { state: "VERIFIED_MATCHED_NET_EDGE" } } };
  const autopilot = buildEdgeResearchAutopilot(inputs);
  const discovery = buildEdgeDiscoveryLoop(inputs);
  assert.equal(autopilot.state, "AUTOPILOT_VERIFIED_EDGE_REVIEW");
  assert.equal(discovery.state, "EDGE_VERIFIED_NO_HYPOTHESIS_MUTATION");
  assert.equal(autopilot.automaticTrading, false);
  assert.equal(autopilot.automaticProductionPromotion, false);
  assert.equal(discovery.scoringInfluence, false);
});
