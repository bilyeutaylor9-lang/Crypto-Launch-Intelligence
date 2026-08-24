import test from "node:test";
import assert from "node:assert/strict";

import {
  buildHistoricalIgnitionGenomes,
  buildIgnitionGenomeReport,
  buildIgnitionTrajectoryVector,
  compareIgnitionGenomes,
  matchIgnitionGenome,
} from "../src/learning/ignitionGenomeEngine.js";

function obs(identity, minute, overrides = {}) {
  return {
    identityKey: identity,
    observedAt: new Date(Date.UTC(2026, 0, 1, 0, minute)).toISOString(),
    symbol: identity.split(":").at(-1),
    chain: "base",
    priceUsd: 1 + minute * 0.001,
    liquidityUsd: 500_000 + minute * 4_000,
    state: minute < 20 ? "FORMING" : minute < 40 ? "COMPRESSED" : "ARMED",
    confidencePct: 60 + minute * 0.3,
    evidenceCoveragePct: 70 + minute * 0.2,
    effectiveFreeFloatUsd: 5_000_000 - minute * 15_000,
    effectiveFloatCompressionPct: 20 + minute * 0.4,
    demandPressureScore: 45 + minute * 0.7,
    sellerExhaustionScore: 40 + minute * 0.6,
    buyerReplacementScore: 45 + minute * 0.6,
    nearPriceSellInventoryUsd: 500_000 - minute * 4_000,
    marginalSellerInventoryBurnPct: 10 + minute * 0.8,
    liquidityConvexityIndex: 1 + minute * 0.02,
    reflexivityMechanismStrengthScore: 40 + minute * 0.7,
    ignitionCapitalUsd: 100_000 - minute * 500,
    sequenceCompressionRatio: 1 + minute * 0.03,
    eventTimeAccelerationRatio: 1 + minute * 0.025,
    repricingGapScore: 45 + minute * 0.5,
    ...overrides,
  };
}

function history(identity, bias = 0) {
  return [0, 15, 30, 45, 60].map((minute) =>
    obs(identity, minute, {
      demandPressureScore: 45 + minute * 0.7 + bias,
      sellerExhaustionScore: 40 + minute * 0.6 + bias,
      buyerReplacementScore: 45 + minute * 0.6 + bias,
    })
  );
}

function record(identity, returnPct, observedAt = "2026-01-01T01:00:00.000Z") {
  return {
    identityKey: identity,
    observedAt,
    symbol: identity.split(":").at(-1),
    state: "ARMED",
    outcomes: {
      "24": {
        returnPct,
        observedAt: "2026-01-02T01:00:00.000Z",
      },
    },
  };
}

test("trajectory vector captures levels and motion without future rows", () => {
  const rows = [
    ...history("base:a"),
    obs("base:a", 120, { demandPressureScore: 0 }),
  ];
  const vector = buildIgnitionTrajectoryVector(
    rows,
    "2026-01-01T01:00:00.000Z",
    { windowMinutes: 90 }
  );
  assert.ok(vector);
  assert.equal(vector.points, 5);
  assert.ok(vector.dimensionCount >= 10);
  assert.ok("demandPressureScore.delta" in vector.vector);
});

test("historical genome requires outcome resolved by as-of time", () => {
  const observations = history("base:a");
  const lab = { records: [record("base:a", 120)] };

  const tooEarly = buildHistoricalIgnitionGenomes(observations, lab, {
    asOf: "2026-01-01T12:00:00.000Z",
    windowMinutes: 90,
  });
  assert.equal(tooEarly.length, 0);

  const resolved = buildHistoricalIgnitionGenomes(observations, lab, {
    asOf: "2026-01-03T00:00:00.000Z",
    windowMinutes: 90,
  });
  assert.equal(resolved.length, 1);
  assert.equal(resolved[0].label, "TWO_X");
});

test("similar trajectories score above opposite trajectories", () => {
  const a = buildIgnitionTrajectoryVector(history("base:a"), "2026-01-01T01:00:00.000Z", { windowMinutes: 90 });
  const b = buildIgnitionTrajectoryVector(history("base:b", 2), "2026-01-01T01:00:00.000Z", { windowMinutes: 90 });
  const opposite = buildIgnitionTrajectoryVector(
    [0, 15, 30, 45, 60].map((minute) =>
      obs("base:c", minute, {
        demandPressureScore: 90 - minute,
        sellerExhaustionScore: 90 - minute,
        buyerReplacementScore: 90 - minute,
        nearPriceSellInventoryUsd: 100_000 + minute * 8_000,
        sequenceCompressionRatio: 4 - minute * 0.04,
      })
    ),
    "2026-01-01T01:00:00.000Z",
    { windowMinutes: 90 }
  );
  assert.ok(compareIgnitionGenomes(a, b).similarity > compareIgnitionGenomes(a, opposite).similarity);
});

test("self-identity historical genomes are excluded from neighbors", () => {
  const trajectory = buildIgnitionTrajectoryVector(history("base:a"), "2026-01-01T01:00:00.000Z", { windowMinutes: 90 });
  const historical = [
    {
      genomeId: "a1",
      identityKey: "base:a",
      returnPct: 120,
      label: "TWO_X",
      resolvedAt: "2025-12-01T00:00:00.000Z",
      trajectory,
    },
  ];
  const match = matchIgnitionGenome(trajectory, historical, {
    identityKey: "base:a",
    asOf: "2026-01-03T00:00:00.000Z",
  });
  assert.equal(match.neighborCount, 0);
});

test("winner-like history produces nonzero breakout probabilities", () => {
  const current = buildIgnitionTrajectoryVector(history("base:live"), "2026-01-01T01:00:00.000Z", { windowMinutes: 90 });
  const historical = [];
  for (let i = 0; i < 12; i += 1) {
    historical.push({
      genomeId: `g-${i}`,
      identityKey: `base:h${i}`,
      symbol: `H${i}`,
      returnPct: i < 8 ? 120 : 60,
      label: i < 8 ? "TWO_X" : "BREAKOUT_50",
      anchorAt: "2025-12-01T00:00:00.000Z",
      resolvedAt: "2025-12-02T00:00:00.000Z",
      trajectory: buildIgnitionTrajectoryVector(
        history(`base:h${i}`, i % 3),
        "2026-01-01T01:00:00.000Z",
        { windowMinutes: 90 }
      ),
    });
  }
  const match = matchIgnitionGenome(current, historical, {
    identityKey: "base:live",
    asOf: "2026-01-03T00:00:00.000Z",
    minimumNeighbors: 6,
  });
  assert.ok(match.probability50Pct > 50);
  assert.ok(match.probability100Pct > 40);
  assert.ok(match.genomeResearchScore > 0);
});

test("full report ranks live candidates but remains research-only", () => {
  const observations = [
    ...history("base:live"),
    ...history("base:hist1"),
    ...history("base:hist2"),
    ...history("base:hist3"),
    ...history("base:hist4"),
    ...history("base:hist5"),
    ...history("base:hist6"),
  ];
  const records = [
    record("base:hist1", 120),
    record("base:hist2", 80),
    record("base:hist3", 60),
    record("base:hist4", 110),
    record("base:hist5", 55),
    record("base:hist6", -25),
  ];
  const report = buildIgnitionGenomeReport(
    observations,
    { records },
    [{ canonicalProjectId: "base:live", symbol: "LIVE", chain: "base" }],
    {
      asOf: "2026-01-03T00:00:00.000Z",
      windowMinutes: 90,
      minimumNeighbors: 3,
    }
  );
  assert.equal(report.liveCandidatesScored, 1);
  assert.equal(report.policy.productionRankingInfluence, false);
  assert.equal(report.policy.automaticTrading, false);
});
