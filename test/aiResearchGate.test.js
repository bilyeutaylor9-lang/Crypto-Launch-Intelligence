import test from "node:test";
import assert from "node:assert/strict";

import { selectAgents } from "../src/brain/agentRouter.js";
import { decideAIResearch, selectAIResearchCandidates } from "../src/brain/aiResearchGate.js";
import { LOCAL_BRAIN_AGENTS } from "../src/brain/agentRegistry.js";

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

test("AI research gate queues no more than the top 100 eligible projects", () => {
  const projects = Array.from({ length: 120 }, (_, index) =>
    eligibleProject({
      permanentProjectKey: `base:top-${index}`,
      contractAddress: `0xtop${index}`,
      pipelineScore: 90 - index / 10,
    })
  );
  const selected = selectAIResearchCandidates(projects);

  assert.equal(selected.candidates.length, 100);
  assert.equal(selected.summary.deepCount, 5);
  assert.equal(selected.summary.lightCount, 25);
  assert.equal(selected.summary.triageCount, 70);
  assert.equal(new Set(selected.candidates.map((item) => item.decision.projectKey)).size, 100);
});

test("AI research queue reserves capacity for eligible underrepresented chains", () => {
  const baseProjects = Array.from({ length: 120 }, (_, index) =>
    eligibleProject({
      permanentProjectKey: `base:base-${index}`,
      contractAddress: `0xbase${index}`,
      pipelineScore: 95 - index / 10,
    })
  );
  const solana = eligibleProject({
    chain: "solana",
    permanentProjectKey: "solana:coverage",
    contractAddress: "solcoverage",
    pipelineScore: 66,
  });
  const arbitrum = eligibleProject({
    chain: "arbitrum",
    permanentProjectKey: "arbitrum:coverage",
    contractAddress: "arbcoverage",
    pipelineScore: 65,
  });

  const selected = selectAIResearchCandidates([...baseProjects, solana, arbitrum]);
  const selectedKeys = new Set(selected.candidates.map((item) => item.decision.projectKey));

  assert.ok(selectedKeys.has("solana:coverage"));
  assert.ok(selectedKeys.has("arbitrum:coverage"));
  assert.ok(selected.summary.coverageSelection.selectedByReason.COVERAGE_RESERVE >= 2);
});

test("agent router uses focused triage, relevant light workers, and the full deep team", () => {
  const triage = selectAgents(eligibleProject(), { depth: "TRIAGE" });
  const light = selectAgents(eligibleProject({ tokenomicsScore: 0, catalystScore: 0, narratives: [] }), { depth: "LIGHT" });
  const deep = selectAgents(eligibleProject(), { depth: "DEEP" });

  assert.deepEqual(triage.map((agent) => agent.id), ["identity-verifier", "source-provenance-auditor", "bear-researcher"]);
  assert.ok(light.some((agent) => agent.id === "identity-verifier"));
  assert.ok(light.some((agent) => agent.id === "market-structure-analyst"));
  assert.ok(light.some((agent) => agent.id === "contract-behavior-auditor"));
  assert.ok(light.some((agent) => agent.id === "liquidity-control-analyst"));
  assert.ok(light.some((agent) => agent.id === "bear-researcher"));
  assert.equal(deep.length, LOCAL_BRAIN_AGENTS.length);
});
