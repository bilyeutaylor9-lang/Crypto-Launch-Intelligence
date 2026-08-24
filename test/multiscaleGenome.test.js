import test from "node:test";
import assert from "node:assert/strict";
import { buildGenomeConvergence } from "../src/production/genomeConvergenceEngine.js";
import { estimateCounterfactualEdge } from "../src/production/counterfactualEdgeEngine.js";

test("genome convergence detects increasing similarity", () => {
  const now = "2026-08-22T12:00:00Z";
  const key = "base:abc";
  const history = [30, 45, 60, 80].map((score, i) => ({
    identityKey: key,
    observedAt: new Date(Date.parse(now) - (3 - i) * 3600000).toISOString(),
    multiscaleGenomeScore: score,
    failureProbabilityPct: 30 - i * 5,
  }));
  const result = buildGenomeConvergence(
    { identityKey: key, multiscaleGenomeScore: 80, failureProbabilityPct: 15 },
    history,
    { now }
  );
  assert.ok(result.scoreVelocityPerHour > 0);
  assert.ok(["GENOME_CONVERGING", "RAPID_GENOME_CONVERGENCE"].includes(result.state));
});

test("counterfactual engine reports insufficient sample honestly", () => {
  const target = {
    identityKey: "base:live",
    chain: "base",
    liquidityUsd: 500000,
    marketCapUsd: 10000000,
    verifiedSignals: ["A"],
  };
  const historical = Array.from({ length: 8 }, (_, i) => ({
    identityKey: `base:${i}`,
    chain: "base",
    liquidityUsd: 500000 + i,
    marketCapUsd: 10000000 + i,
    verifiedSignals: i % 2 ? ["A"] : [],
    returnPct: i % 2 ? 30 : 5,
  }));
  const report = estimateCounterfactualEdge(target, historical);
  assert.equal(report.state, "INSUFFICIENT_COUNTERFACTUAL_SAMPLE");
  assert.equal(report.policy.causalClaimAllowed, false);
});
