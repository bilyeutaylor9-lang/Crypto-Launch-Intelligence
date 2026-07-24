import test from "node:test";
import assert from "node:assert/strict";

import { summarizeHottestTenNow } from "../src/reports/hottestTenNowReportEngine.js";

function candidate(overrides = {}) {
  return {
    name: "Current Utility Candidate",
    symbol: "CUR",
    chain: "base",
    tokenAddress: "0x00000000000000000000000000000000000000c1",
    poolAddress: "0x00000000000000000000000000000000000000c2",
    priceUsd: 0.004,
    marketCap: 3_000_000,
    liquidityUsd: 220_000,
    priceChange24hPct: 18,
    priceChange7dPct: 62,
    liveExecutionReady: true,
    executionProofState: "LIVE_EXECUTION_READY",
    executionProof: { buyRouteAvailable: true, sellRouteAvailable: true, liveExecutionReady: true },
    purchaseRouteConfirmed: true,
    sellRouteAvailable: true,
    scalpMicrostructureScore: 84,
    scalpMicrostructureLane: "SCALP_ACTIONABLE_RESEARCH",
    sevenDayTenXScore: 86,
    preBreakoutRadarScore: 82,
    preConsensusBreakoutScore: 80,
    earlyAsymmetryResearchPriorityScore: 84,
    progressiveOpportunityScore: 82,
    capitalMigrationScore: 82,
    capitalFlowScore: 78,
    buyerBreadthAccelerationScore: 84,
    buyPressureScore: 78,
    liquidityFormationScore: 84,
    liquidityExpansionScore: 82,
    organicDemandIntegrityScore: 82,
    utilityQualityScore: 84,
    realUtilityScore: 82,
    developerAccelerationScore: 80,
    developerActivityScore: 82,
    githubProScore: 78,
    ecosystemIntegrationScore: 78,
    tokenomicsScore: 76,
    sourceTruthScore: 84,
    sourceReliabilityScore: 82,
    institutionalDataProvenanceScore: 80,
    evidenceCoverageScore: 82,
    opportunityEvidenceCoverage: 84,
    sniperEvidenceCoverage: 80,
    trapRiskScore: 8,
    contractAuthorityRiskScore: 6,
    liquidityControlRiskScore: 6,
    washTradingRiskScore: 4,
    walletClusterRiskScore: 7,
    deployerRiskScore: 5,
    sellPressureScore: 12,
    ...overrides,
  };
}

test("hottest-ten-now ranks current high-upside utility candidates without financial-advice language", () => {
  const report = summarizeHottestTenNow([
    candidate({ symbol: "ONE", sevenDayTenXScore: 88 }),
    candidate({ symbol: "TWO", sevenDayTenXScore: 80, liquidityUsd: 120_000 }),
  ]);

  assert.equal(report.returnedCount, 2);
  assert.equal(report.shortfallToTen, 8);
  assert.equal(report.notForced, true);
  assert.equal(report.topTenHighestRatedNow[0].symbol, "ONE");
  assert.match(report.disclaimer, /not financial advice/i);
});

test("hottest-ten-now excludes late-chase, meme-only, unsafe, and no-sell-route names", () => {
  const report = summarizeHottestTenNow([
    candidate({ symbol: "CHASE", priceChange24hPct: 140 }),
    candidate({ symbol: "MEME", utilityClassification: "MEME_SPECULATION" }),
    candidate({ symbol: "RISK", honeypotDetected: true }),
    candidate({
      symbol: "NOSALE",
      liveExecutionReady: false,
      executionProofState: "BUY_QUOTE_VERIFIED",
      executionProof: { buyRouteAvailable: true, sellRouteAvailable: false },
      sellRouteAvailable: false,
      purchaseRouteConfirmed: true,
    }),
  ]);

  assert.equal(report.returnedCount, 0);
  assert.equal(report.rejectedOrNotCurrent.length, 4);
  assert.ok(report.countsByLane.ALREADY_EXTENDED_OR_LATE_CHASE >= 1);
  assert.ok(report.countsByLane.MEME_ONLY_OR_NO_VERIFIED_UTILITY >= 1);
  assert.ok(report.countsByLane.DETERMINISTIC_SAFETY_OR_SCALP_BLOCK >= 1);
  assert.ok(report.countsByLane.BUY_AND_SELL_ROUTE_NOT_VERIFIED >= 1);
});
