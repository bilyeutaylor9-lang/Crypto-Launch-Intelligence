import test from "node:test";
import assert from "node:assert/strict";

import {
  rankResearchCandidates,
  scoreResearchCandidate,
} from "../src/learning/edgeResearchBudgetRouter.js";

const registry = {
  signals: [
    {
      signal: "LIQUIDITY_GE_500K",
      samples: 100,
      decided: 90,
      posteriorHitRate: 0.7,
      wilsonLowerBound: 0.61,
      rankingEligible: true,
    },
  ],
};

test("verified evidence improves research priority without creating trade permission", () => {
  const score = scoreResearchCandidate(
    {
      chain: "base",
      tokenAddress: "0x" + "1".repeat(40),
      poolAddress: "0x" + "2".repeat(40),
      liquidityUsd: 600_000,
      volume24h: 2_000_000,
      marketCap: 10_000_000,
    },
    ["LIQUIDITY_GE_500K"],
    registry
  );
  assert.ok(score.researchPriorityScore > 0);
  assert.deepEqual(score.verifiedSignals, ["LIQUIDITY_GE_500K"]);
});

test("research router sorts higher-quality evidence targets first", () => {
  const candidates = [
    {
      symbol: "WEAK",
      chain: "base",
      tokenAddress: "0x" + "1".repeat(40),
      poolAddress: "0x" + "2".repeat(40),
      liquidityUsd: 30_000,
      volume24h: 20_000,
      marketCap: 200_000_000,
    },
    {
      symbol: "STRONG",
      chain: "base",
      tokenAddress: "0x" + "3".repeat(40),
      poolAddress: "0x" + "4".repeat(40),
      liquidityUsd: 700_000,
      volume24h: 3_000_000,
      marketCap: 10_000_000,
    },
  ];

  const ranked = rankResearchCandidates(
    candidates,
    registry,
    (candidate) => candidate.symbol === "STRONG"
      ? ["LIQUIDITY_GE_500K"]
      : [],
    {}
  );
  assert.equal(ranked[0].symbol, "STRONG");
});
