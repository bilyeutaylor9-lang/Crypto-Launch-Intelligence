import test from "node:test";
import assert from "node:assert/strict";
import { analyzeThreeClockEdge } from "../src/engines/threeClockEdgeEngine.js";

function baseProject(overrides = {}) {
  return {
    symbol: "EDGE",
    name: "Edge Protocol",
    chain: "base",
    tokenAddress: "0x0000000000000000000000000000000000000001",
    poolAddress: "0x0000000000000000000000000000000000000002",
    priceUsd: 0.01,
    liquidityUsd: 500000,
    developerAccelerationScore: 88,
    projectChangeScore: 84,
    projectChangeState: "accelerating",
    githubProScore: 76,
    ecosystemIntegrationScore: 72,
    smartWalletNoveltyScore: 82,
    smartWalletArrivalScore: 79,
    smartMoneyAccumulationScore: 81,
    capitalMigrationScore: 77,
    capitalFlowScore: 78,
    buyerBreadthAccelerationScore: 65,
    buyPressureScore: 69,
    socialAccelerationScore: 18,
    xSocialScore: 20,
    narrativeHeatScore: 22,
    communityGrowthScore: 26,
    holderGrowthScore: 24,
    priceChange24hPct: 4,
    priceChange7dPct: 8,
    ...overrides,
  };
}

test("surfaces project+capital change before attention as pre-consensus divergence", () => {
  const result = analyzeThreeClockEdge(baseProject());
  assert.equal(result.threeClockRankingInfluence, false);
  assert.equal(result.threeClockEdge.shadowOnly, true);
  assert.equal(result.threeClockDivergenceState, "PRE_CONSENSUS_DIVERGENCE");
  assert.ok(result.projectClockScore >= 70);
  assert.ok(result.capitalClockScore >= 65);
  assert.ok(result.attentionClockScore < 40);
});

test("crowded attention cannot be pre-consensus", () => {
  const result = analyzeThreeClockEdge(baseProject({
    socialAccelerationScore: 95,
    xSocialScore: 91,
    narrativeHeatScore: 94,
    communityGrowthScore: 88,
    holderGrowthScore: 85,
    priceChange24hPct: 75,
    priceChange7dPct: 180,
  }));
  assert.notEqual(result.threeClockDivergenceState, "PRE_CONSENSUS_DIVERGENCE");
  assert.ok(result.attentionClockScore >= 70);
});

test("hard safety flags suppress the shadow edge", () => {
  const result = analyzeThreeClockEdge(baseProject({ honeypotDetected: true }));
  assert.equal(result.threeClockEdgeScore, 0);
  assert.equal(result.threeClockDivergenceState, "SAFETY_BLOCKED");
  assert.equal(result.threeClockEdgeState, "SAFETY_BLOCKED_SHADOW");
});

test("liquidity topology is explicit-only", () => {
  const noBands = analyzeThreeClockEdge(baseProject());
  assert.equal(noBands.liquidityTopographyMode, "UNOBSERVED");

  const withBands = analyzeThreeClockEdge(baseProject({
    liquidityBands: [
      { lowerPrice: 0.0100, upperPrice: 0.0105, liquidityUsd: 220000 },
      { lowerPrice: 0.0105, upperPrice: 0.0110, liquidityUsd: 45000 },
      { lowerPrice: 0.0110, upperPrice: 0.0120, liquidityUsd: 15000 },
    ],
  }));
  assert.equal(withBands.liquidityTopographyMode, "EXPLICIT_RANGE_TOPOGRAPHY");
  assert.ok(withBands.liquidityVacuumScore > 0);
});

test("pressure twin is heuristic and never executable", () => {
  const result = analyzeThreeClockEdge(baseProject());
  assert.match(result.threeClockEdge.asymmetricPressureTwin.mode, /HEURISTIC/);
  assert.equal(result.threeClockEdge.asymmetricPressureTwin.executableQuote, false);
});

test("history adds robust surprise without enabling ranking influence", () => {
  const history = Array.from({ length: 8 }, (_, index) => ({
    developerAccelerationScore: 20 + index,
    capitalMigrationScore: 25 + index,
    capitalFlowScore: 25 + index,
    smartWalletNoveltyScore: 20 + index,
    smartWalletArrivalScore: 20 + index,
    smartMoneyAccumulationScore: 20 + index,
    socialAccelerationScore: 15 + index,
    narrativeHeatScore: 15 + index,
    leadStage: 1,
  }));
  const result = analyzeThreeClockEdge(baseProject(), { history });
  assert.ok(result.threeClockEdge.projectClock.developerSurpriseZ > 0);
  assert.ok(result.threeClockEdge.capitalClock.capitalSurpriseZ > 0);
  assert.equal(result.threeClockRankingInfluence, false);
});
