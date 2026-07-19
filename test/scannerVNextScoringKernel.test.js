import test from "node:test";
import assert from "node:assert/strict";

import {
  analyzeScannerVNextProject,
  applyScannerVNextScoring,
} from "../src/kernel/scannerVNextScoringKernel.js";

const TOKEN = "0x0000000000000000000000000000000000000aaa";
const POOL = "0x0000000000000000000000000000000000000bbb";

function completeProject(overrides = {}) {
  return {
    name: "Balanced Breakout",
    symbol: "BBO",
    chain: "base",
    category: "DeFi infrastructure",
    tokenAddress: TOKEN,
    contractAddress: TOKEN,
    poolAddress: POOL,
    pairAddress: POOL,
    identityVerified: true,
    contractVerified: true,
    purchaseRouteConfirmed: true,
    executionRouteAvailable: true,
    finalIdentityState: "VERIFIED_CONTRACT",
    finalIntegrityScore: 84,
    pipelineScore: 65,
    priceChange24h: 11,
    priceChange7d: 32,
    volume24h: 220_000,
    liquidityUsd: 420_000,
    stableExitLiquidityUsd: 210_000,
    liquidityControlSafetyScore: 88,
    liquidityControlRiskScore: 8,
    instantSafetyScore: 90,
    instantSafetyStatus: "PASS",
    contractAuthoritySafetyScore: 92,
    contractAuthorityRiskScore: 5,
    organicEconomicIntegrityScore: 78,
    sourceTruthScore: 82,
    identityResolutionScore: 86,
    sourceReliabilityScore: 76,
    narrativeScore: 70,
    narrativeForecastScore: 72,
    narrativeHeatScore: 68,
    infrastructureNarrativeScore: 72,
    xSocialScore: 62,
    socialAccelerationScore: 64,
    momentumShiftScore: 76,
    velocityScore: 70,
    accelerationScore: 74,
    earlyBreakoutScore: 78,
    volatilityExpansionScore: 66,
    trendChangeScore: 70,
    prePump: { score: 72, status: "EARLY_SETUP" },
    preBreakoutMomentumScore: 74,
    relativeStrengthScore: 68,
    organicBuyerScore: 72,
    buyerRetentionScore: 68,
    buyPressureScore: 70,
    holderGrowthScore: 66,
    activeLiquidityTruthScore: 76,
    liquidityScore: 78,
    liquidityExpansionScore: 74,
    smartWalletScore: 66,
    smartWalletPerformanceScore: 68,
    smartMoneyAccumulationScore: 70,
    smartMoneyRotationScore: 62,
    smartWalletArrivalScore: 66,
    whaleActivityScore: 58,
    capitalFlowScore: 66,
    tokenomicsScore: 64,
    fundingBackerScore: 62,
    partnershipScore: 60,
    ecosystemIntegrationScore: 66,
    developerActivityScore: 72,
    githubScore: 68,
    githubQualityScore: 66,
    githubProScore: 70,
    communityGrowthScore: 64,
    catalystScore: 72,
    catalystCalendarScore: 70,
    liveCatalystRadarScore: 66,
    roadmapProfitabilityScore: 68,
    exchangeProbabilityScore: 62,
    narrativeLaunchStakingScore: 64,
    opportunityTimingScore: 74,
    candidateLifecycleReadinessScore: 72,
    discoveryDecisionScore: 70,
    preConsensusOpportunityScore: 68,
    quietAccumulationScore: 58,
    breakoutBrainScore: 72,
    evidence: [
      { source: "dexscreener", family: "market" },
      { source: "github", family: "developer" },
      { source: "official", family: "project" },
    ],
    ...overrides,
  };
}

test("vNext does not inflate a project with only two high signals", () => {
  const result = analyzeScannerVNextProject({
    name: "Thin Signal",
    symbol: "THIN",
    chain: "base",
    tokenAddress: TOKEN,
    poolAddress: POOL,
    liquidityUsd: 150_000,
    stableExitLiquidityUsd: 75_000,
    purchaseRouteConfirmed: true,
    executionRouteAvailable: true,
    narrativeHeatScore: 94,
    momentumShiftScore: 94,
    pipelineScore: 94,
  });

  assert.ok(result.evidenceCoverageScore < 40);
  assert.equal(result.vNextSafetyState, "RESTRICTED_RESEARCH");
  assert.ok(result.vNextScore <= 10);
  assert.match(result.vNextRecommendation, /Insufficient Evidence|Research/i);
});

test("vNext keeps a complete balanced setup eligible and pre-breakout", () => {
  const result = analyzeScannerVNextProject(completeProject());

  assert.equal(result.vNextSafetyState, "ELIGIBLE");
  assert.equal(result.vNextMarketStage, "PRE_BREAKOUT");
  assert.ok(result.evidenceCoverageScore >= 95);
  assert.ok(result.vNextScore >= 45);
  assert.ok(result.vNextScore < 90);
  assert.match(result.vNextScoreFormula.calculation, /x/);
});

test("vNext marks already-pumped candidates as extended timing risk", () => {
  const result = analyzeScannerVNextProject(
    completeProject({
      symbol: "LATE",
      priceChange24h: 58,
      priceChange7d: 125,
      organicBuyerScore: 25,
      buyerRetentionScore: 20,
      activeLiquidityTruthScore: 35,
      smartWalletArrivalScore: 20,
      smartMoneyAccumulationScore: 22,
    })
  );

  assert.equal(result.vNextMarketStage, "EXTENDED");
  assert.equal(result.vNextBuyEligible, false);
  assert.match(result.vNextRecommendation, /Timing Risk|Avoid/i);
});

test("vNext hard-blocks honeypots even with strong momentum", () => {
  const result = analyzeScannerVNextProject(
    completeProject({
      symbol: "HPOT",
      honeypotDetected: true,
      contractAuthorityRiskScore: 100,
      momentumShiftScore: 96,
      accelerationScore: 96,
      narrativeHeatScore: 96,
    })
  );

  assert.equal(result.vNextSafetyState, "BLOCKED");
  assert.equal(result.vNextScore, 0);
  assert.equal(result.vNextBuyEligible, false);
  assert.ok(result.vNextSafetyBlockers.some((blocker) => /Honeypot/i.test(blocker)));
});

test("vNext preserves Akedo-style early setups in research instead of deleting them", () => {
  const result = analyzeScannerVNextProject(
    completeProject({
      name: "Akedo Style",
      symbol: "AKE",
      category: "Gaming newly launched",
      fundingBackerScore: 0,
      partnershipScore: 0,
      tokenomicsScore: 0,
      priceChange24h: 9,
      priceChange7d: 24,
      smartWalletArrivalScore: 76,
      organicBuyerScore: 78,
      holderGrowthScore: 74,
    })
  );

  assert.notEqual(result.vNextSafetyState, "BLOCKED");
  assert.ok(["PRE_BREAKOUT", "QUIET_ACCUMULATION", "EARLY_TRACTION"].includes(result.vNextMarketStage));
  assert.ok(result.vNextScore > 0);
  assert.match(result.vNextRecommendation, /Watch|Research/i);
});

test("vNext runs beside legacy score with rank comparison fields", () => {
  const [thin, complete] = applyScannerVNextScoring([
    {
      name: "Thin Signal",
      symbol: "THIN",
      chain: "base",
      tokenAddress: TOKEN,
      narrativeHeatScore: 94,
      momentumShiftScore: 94,
      pipelineScore: 94,
      pipelineRank: 1,
    },
    completeProject({ pipelineScore: 65, pipelineRank: 2 }),
  ]);

  assert.equal(thin.legacyScore, 94);
  assert.equal(thin.legacyRank, 1);
  assert.ok(thin.vNextRank > complete.vNextRank);
  assert.equal(thin.recommendationDifference, "VNEXT_DOWNGRADE");
  assert.ok(complete.vNextScore > thin.vNextScore);
});
