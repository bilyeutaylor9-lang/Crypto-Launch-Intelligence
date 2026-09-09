import test from "node:test";
import assert from "node:assert/strict";

import { buildAlphaFeatureLeaderboard } from "../src/learning/alphaFeatureLeaderboard.js";

function row(index) {
  const high = index >= 30;
  return {
    evidence: {
      capitalClockScore: { value: high ? 90 + index / 10 : 20 + index / 10, state: "OBSERVED" },
      fakeMomentumRiskScore: { value: high ? 10 : 80, state: "OBSERVED" },
    },
    outcomes: { "24": { endReturnPct: high ? 40 + index / 10 : -20 + index / 20 } },
  };
}

test("leaderboard identifies positive high-capital separation", () => {
  const report = buildAlphaFeatureLeaderboard(Array.from({ length: 60 }, (_, index) => row(index)), {
    features: ["capitalClockScore", "fakeMomentumRiskScore"],
    horizons: [24],
    minObserved: 30,
    minCoveragePct: 60,
    minDistinctValues: 3,
    minBucketN: 10,
    minComboN: 10,
  });
  const capital = report.featureRankings.find(({ feature }) => feature === "capitalClockScore");
  assert.equal(capital.status, "EXPLORATORY");
  assert.ok(capital.medianSpreadPct > 20);
  assert.equal(report.policy.automaticPromotion, false);
});

test("missing evidence state cannot be bypassed by top-level or embedded values", () => {
  const rows = Array.from({ length: 40 }, (_, index) => ({
    f: 100 + index,
    evidence: { f: { value: 100 + index, state: "MISSING" } },
    outcomes: { "24": { endReturnPct: index } },
  }));
  const report = buildAlphaFeatureLeaderboard(rows, {
    features: ["f"],
    horizons: [24],
    minObserved: 1,
    minCoveragePct: 1,
    minDistinctValues: 1,
  });
  assert.equal(report.featureRankings[0].status, "NOT_RANKED");
  assert.equal(report.featureRankings[0].eligibility.eligible, 0);
});
