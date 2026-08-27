import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { evaluateOperationalTruth } from "../src/ops/operationalTruthGate.js";
import { runProductionShadowCycle } from "../src/ops/runProductionShadowCycle.js";

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

test("shadow-universe preflight fails unavailable input without requiring prior shadow reports", () => {
  const report = evaluateOperationalTruth({
    universe: {
      availabilityState: "EDGE_CANDIDATE_UNIVERSE_UNAVAILABLE",
      availabilityReason: "FILE_MISSING",
      candidates: [],
      exactCandidates: 0,
    },
  }, { now, scope: "shadow-universe", maximumUniverseAgeMinutes: 90 });

  assert.equal(report.pass, false);
  assert.ok(report.blockers.includes("EDGE_CANDIDATE_UNIVERSE_UNAVAILABLE"));
  assert.ok(report.blockers.includes("EXACT_CANDIDATE_UNIVERSE_TIMESTAMP_INVALID"));
  assert.ok(!report.blockers.includes("PRODUCTION_SHADOW_REPORT_MISSING"));
});

test("shadow-universe preflight defaults to the 90-minute PIT limit", () => {
  const report = evaluateOperationalTruth({
    universe: {
      generatedAt: "2026-08-26T10:29:00.000Z",
      exactCandidates: 1,
      candidates: [exact],
    },
  }, { now, scope: "shadow-universe" });

  assert.equal(report.metrics.maximumUniverseAgeMinutes, 90);
  assert.ok(report.blockers.includes("EXACT_CANDIDATE_UNIVERSE_STALE"));
});

test("production shadow writes an explicit blocked report instead of treating a missing universe as empty", async () => {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "cli-shadow-preflight-"));
  const priorDirectory = process.cwd();
  try {
    process.chdir(temporaryDirectory);
    const result = await runProductionShadowCycle({
      now,
      observations: [],
      universe: {
        availabilityState: "EDGE_CANDIDATE_UNIVERSE_UNAVAILABLE",
        availabilityReason: "FILE_MISSING",
        candidates: [],
        exactCandidates: 0,
      },
    });
    const report = JSON.parse(fs.readFileSync("reports/production-shadow-ranking.json", "utf8"));

    assert.equal(result.shadowReport.state, "PRODUCTION_SHADOW_BLOCKED_UNIVERSE_PRECONDITION");
    assert.equal(report.state, "PRODUCTION_SHADOW_BLOCKED_UNIVERSE_PRECONDITION");
    assert.ok(report.universePreflight.blockers.includes("EDGE_CANDIDATE_UNIVERSE_UNAVAILABLE"));
  } finally {
    process.chdir(priorDirectory);
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
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

test("operational truth keeps partial research-only capital coverage out of proof without failing an independent exact-universe path", () => {
  const report = evaluateOperationalTruth({
    acquisition: {
      healthy: true,
      blockResearchAdvancement: false,
      capitalEvidenceEligible: false,
      observationClass: "LIMITED_COVERAGE_EXCLUDED_FROM_PROOF",
    },
  }, { now, scope: "edge-truth" });
  assert.equal(report.pass, true);
  assert.equal(report.state, "OPERATIONAL_HEALTHY_NO_EDGE_OR_EVENT");
  assert.ok(report.warnings.includes("CAPITAL_RADAR_EXCLUDED_FROM_PROOF_AND_ATTRIBUTION"));
});
