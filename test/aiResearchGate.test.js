import test from "node:test";
import assert from "node:assert/strict";

import { selectAgents } from "../src/brain/agentRouter.js";
import { decideAIResearch, selectAIResearchCandidates } from "../src/brain/aiResearchGate.js";

function eligibleProject(overrides = {}) {
  return {
    name: "Gate Fixture",
    symbol: "GATE",
    chain: "base",
    permanentProjectKey: "base:0xgate",
    contractAddress: "0xgate",
    identityVerified: true,
    finalSelectionState: "RESEARCH_ONLY",
    finalIntegrityVerdict: "RESEARCH_REQUIRED",
    liquidityUsd: 50_000,
    pipelineScore: 86,
    dataConfidenceScore: 81,
    discoverySources: ["dexscreener", "geckoterminal", "github"],
    riskScore: 21,
    smartMoneyAccumulationScore: 74,
    catalystScore: 72,
    ...overrides,
  };
}

test("AI research gate rejects deterministic safety and identity failures", () => {
  const blocked = decideAIResearch(
    eligibleProject({ contractAddress: null, riskScore: 88, finalBlockingReasons: ["honeypot confirmed"] })
  );

  assert.equal(blocked.eligible, false);
  assert.equal(blocked.depth, "NONE");
  assert.ok(blocked.blockers.includes("contract identity is unavailable"));
  assert.ok(blocked.blockers.includes("critical deterministic risk score"));
});

test("AI research gate keeps light and deep research within explicit limits", () => {
  const projects = [
    eligibleProject({ permanentProjectKey: "base:deep", contractAddress: "0xdeep", pipelineScore: 92 }),
    eligibleProject({ permanentProjectKey: "base:light", contractAddress: "0xlight", pipelineScore: 70, smartMoneyAccumulationScore: 30, catalystScore: 30 }),
    eligibleProject({ permanentProjectKey: "base:thin", contractAddress: "0xthin", dataConfidenceScore: 44 }),
  ];
  const selected = selectAIResearchCandidates(projects, { lightLimit: 1, deepLimit: 1 });

  assert.equal(selected.summary.deepCount, 1);
  assert.equal(selected.summary.lightCount, 1);
  assert.equal(selected.summary.queuedCount, 2);
  assert.equal(selected.decisions.find((item) => item.project.symbol === "GATE" && item.project.permanentProjectKey === "base:thin").decision.eligible, false);
});

test("agent router runs only relevant workers for light research and all workers for deep research", () => {
  const light = selectAgents(eligibleProject({ tokenomicsScore: 0, catalystScore: 0, narratives: [] }), { depth: "LIGHT" });
  const deep = selectAgents(eligibleProject(), { depth: "DEEP" });

  assert.ok(light.some((agent) => agent.id === "identity-verifier"));
  assert.ok(light.some((agent) => agent.id === "market-structure-analyst"));
  assert.ok(light.some((agent) => agent.id === "bear-researcher"));
  assert.equal(deep.length, 6);
});
