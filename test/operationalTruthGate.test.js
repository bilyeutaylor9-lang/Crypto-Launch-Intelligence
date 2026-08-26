import test from "node:test";
import assert from "node:assert/strict";

import { evaluateOperationalTruth } from "../src/ops/operationalTruthGate.js";

const now = "2026-08-26T12:00:00.000Z";
const exact = {
  chain: "base",
  tokenAddress: "0x1111111111111111111111111111111111111111",
  poolAddress: "0x2222222222222222222222222222222222222222",
};

test("operational truth accepts honest no-edge output from a fresh exact universe", () => {
  const report = evaluateOperationalTruth({
    universe: { generatedAt: now, codeCommitSha: "abc", workflowRunId: "123", exactCandidates: 0, candidates: [] },
    shadow: { candidates: [] },
    cohort: { state: "NO_MATCHABLE_PROSPECTIVE_SELECTIONS" },
  }, { now, scope: "dashboard-shadow", codeCommitSha: "abc", workflowRunId: "123" });
  assert.equal(report.pass, true);
  assert.equal(report.state, "OPERATIONAL_HEALTHY_NO_EDGE_OR_EVENT");
  assert.deepEqual(report.blockers, []);
});

test("dashboard shadow rejects an exact universe left over from another workflow run", () => {
  const report = evaluateOperationalTruth({
    universe: { generatedAt: now, codeCommitSha: "abc", workflowRunId: "old", exactCandidates: 0, candidates: [] },
    shadow: { candidates: [] },
    cohort: {},
  }, { now, scope: "dashboard-shadow", codeCommitSha: "abc", workflowRunId: "current" });
  assert.equal(report.pass, false);
  assert.ok(report.blockers.includes("CANDIDATE_UNIVERSE_WORKFLOW_RUN_MISMATCH"));
});

test("operational truth exposes a missing or stale candidate handoff", () => {
  const missing = evaluateOperationalTruth({ shadow: { candidates: [] }, cohort: {} }, { now, scope: "production-shadow" });
  assert.equal(missing.pass, false);
  assert.ok(missing.blockers.includes("EXACT_CANDIDATE_UNIVERSE_MISSING"));

  const stale = evaluateOperationalTruth({
    universe: { generatedAt: "2026-08-25T00:00:00.000Z", exactCandidates: 1, candidates: [exact] },
    shadow: { candidates: [exact] },
    cohort: {},
  }, { now, scope: "production-shadow", maximumUniverseAgeMinutes: 90 });
  assert.ok(stale.blockers.includes("EXACT_CANDIDATE_UNIVERSE_STALE"));
});

test("operational truth fails broken acquisition but accepts complete negative evidence", () => {
  const broken = evaluateOperationalTruth({
    acquisition: { healthy: false, blockResearchAdvancement: true, blockers: ["CHAIN_COVERAGE_INCOMPLETE"] },
  }, { now, scope: "edge-truth" });
  assert.equal(broken.pass, false);
  assert.deepEqual(broken.blockers, ["CHAIN_COVERAGE_INCOMPLETE"]);

  const healthy = evaluateOperationalTruth({
    acquisition: { healthy: true, blockResearchAdvancement: false, observationClass: "HEALTHY_NEGATIVE_EVIDENCE" },
  }, { now, scope: "edge-truth" });
  assert.equal(healthy.pass, true);
  assert.equal(healthy.state, "OPERATIONAL_HEALTHY_NO_EDGE_OR_EVENT");
});
