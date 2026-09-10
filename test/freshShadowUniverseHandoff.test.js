import test from "node:test";
import assert from "node:assert/strict";

import { evaluateFreshShadowUniverseHandoff } from "../src/production/freshShadowUniverseHandoff.js";
import { evaluateOperationalTruth } from "../src/ops/operationalTruthGate.js";

const NOW = "2026-08-28T12:00:00.000Z";
const exact = {
  chain: "base",
  tokenAddress: `0x${"1".repeat(40)}`,
  poolAddress: `0x${"2".repeat(40)}`,
};

function reportFor(universe, options = {}) {
  const truth = evaluateOperationalTruth({ universe }, {
    now: NOW,
    scope: "shadow-universe",
    maximumUniverseAgeMinutes: 90,
  });
  return evaluateFreshShadowUniverseHandoff({
    now: NOW,
    universe,
    truth,
    scannerState: {
      state: "SCANNER_STATE_VALID",
      generatedAt: universe.generatedAt,
      exactUniverseIncluded: true,
    },
    source: "shadow-universe-refresh-artifact",
    refreshWorkflowRunId: "123",
    writeReport: false,
    ...options,
  });
}

test("fresh shadow-universe handoff exposes the exact artifact age, identity, and candidate count", () => {
  const report = reportFor({
    generatedAt: "2026-08-28T11:15:00.000Z",
    exactCandidates: 1,
    candidates: [exact],
  });

  assert.equal(report.pass, true);
  assert.equal(report.state, "FRESH_EXACT_SHADOW_UNIVERSE_READY");
  assert.equal(report.universe.ageMinutes, 45);
  assert.equal(report.universe.candidateCount, 1);
  assert.equal(report.universe.identityValid, true);
  assert.equal(report.source.refreshWorkflowRunId, "123");
});

test("fresh shadow-universe handoff preserves the 90-minute fail-closed limit", () => {
  const report = reportFor({
    generatedAt: "2026-08-28T10:29:00.000Z",
    exactCandidates: 1,
    candidates: [exact],
  }, { refreshAttempted: true });

  assert.equal(report.pass, false);
  assert.equal(report.state, "FRESH_EXACT_SHADOW_UNIVERSE_STALE");
  assert.equal(report.universe.maximumAgeMinutes, 90);
  assert.ok(report.truth.blockers.includes("EXACT_CANDIDATE_UNIVERSE_STALE"));
  assert.equal(report.source.refreshAttempted, true);
});
