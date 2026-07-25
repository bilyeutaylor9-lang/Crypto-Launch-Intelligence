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
    routeTruthStatus: "LIVE_EXECUTION_READY",
    buyQuoteVerified: true,
    sellQuoteVerified: true,
    quoteAgeSeconds: 30,
    estimatedRoundTripSlippagePct: 0.4,
    exactIdentityVerified: true,
    executionProof: {
      buyRouteAvailable: true,
      sellRouteAvailable: true,
      buyQuoteVerified: true,
      sellQuoteVerified: true,
      liveExecutionReady: true,
      executionProofState: "LIVE_EXECUTION_READY",
      routeTruthStatus: "LIVE_EXECUTION_READY",
      exactIdentityVerified: true,
      quoteFreshnessSeconds: 30,
      liquidityUsd: 220_000,
      estimatedRoundTripSlippagePct: 0.4,
      slippageIsHeuristic: false,
    },
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
      routeTruthStatus: "BUY_QUOTE_VERIFIED",
      sellQuoteVerified: false,
      executionProof: {
        buyRouteAvailable: true,
        sellRouteAvailable: false,
        buyQuoteVerified: true,
        sellQuoteVerified: false,
        liveExecutionReady: false,
        executionProofState: "BUY_QUOTE_VERIFIED",
        routeTruthStatus: "BUY_QUOTE_VERIFIED",
        exactIdentityVerified: true,
        quoteFreshnessSeconds: 30,
        liquidityUsd: 220_000,
        estimatedRoundTripSlippagePct: 0.4,
        slippageIsHeuristic: false,
      },
      sellRouteAvailable: false,
      purchaseRouteConfirmed: true,
    }),
  ]);

  assert.equal(report.returnedCount, 0);
  assert.equal(report.rejectedOrNotCurrent.length, 3);
  assert.ok(report.countsByLane.ALREADY_EXTENDED_OR_LATE_CHASE >= 1);
  assert.ok(report.countsByLane.MEME_ONLY_OR_NO_VERIFIED_UTILITY >= 1);
  assert.ok(report.countsByLane.DETERMINISTIC_SAFETY_OR_SCALP_BLOCK >= 1);
  assert.ok(report.countsByLane.RESEARCH_BOARD_NEEDS_MISSING_INFO >= 1);
  assert.equal(report.topTenCurrentResearchBoard.some((project) => project.symbol === "NOSALE"), true);
  assert.equal(report.topTenHighestRatedNow.some((project) => project.symbol === "NOSALE"), false);
  assert.equal(report.topTenCurrentResearchBoard.find((project) => project.symbol === "NOSALE").reasonNotQualified, "NEEDS_FRESH_BUY_AND_SELL_ROUTE");
});

test("hottest-ten-now keeps non-danger final-selection blocks on the research board", () => {
  const report = summarizeHottestTenNow([
    candidate({
      symbol: "PROOF",
      liveExecutionReady: false,
      executionProofState: "MARKET_OBSERVED",
      routeTruthStatus: "MARKET_OBSERVED",
      buyQuoteVerified: false,
      sellQuoteVerified: false,
      executionProof: {
        buyRouteAvailable: false,
        sellRouteAvailable: false,
        buyQuoteVerified: false,
        sellQuoteVerified: false,
        liveExecutionReady: false,
        executionProofState: "MARKET_OBSERVED",
        routeTruthStatus: "MARKET_OBSERVED",
        exactIdentityVerified: true,
        liquidityUsd: 220_000,
        slippageIsHeuristic: true,
      },
      purchaseRouteConfirmed: false,
      sellRouteAvailable: false,
      finalSelectionState: "BLOCKED",
      finalSelectionBlockers: ["EXECUTION_EVIDENCE_MISSING", "SNIPER_EVIDENCE_FAMILY_QUORUM_MISSING"],
    }),
  ]);

  assert.equal(report.status, "RESEARCH_BOARD_NEEDS_CONFIRMATION");
  assert.equal(report.returnedCount, 0);
  assert.equal(report.currentResearchBoardCount, 1);
  assert.equal(report.topTenCurrentResearchBoard[0].symbol, "PROOF");
  assert.equal(report.topTenCurrentResearchBoard[0].lane, "RESEARCH_BOARD_NEEDS_MISSING_INFO");
  assert.equal(report.topTenCurrentResearchBoard[0].reasonNotQualified, "NEEDS_FRESH_BUY_AND_SELL_ROUTE");
  assert.ok(report.topTenCurrentResearchBoard[0].missingInfoNeeded.includes("fresh buy quote and sell route"));
  assert.ok(report.topTenCurrentResearchBoard[0].nextSourcesNeeded.length > 0);
});

test("hottest-ten-now still excludes confirmed safety and identity hard blocks", () => {
  const report = summarizeHottestTenNow([
    candidate({ symbol: "HONEY", honeypotDetected: true }),
    candidate({ symbol: "CONFLICT", finalSelectionBlockers: ["contract mismatch against official identity"] }),
    candidate({ symbol: "SCALP", scalpNoTrade: true, scalpMicrostructureBlockers: ["cannot sell through verified route"] }),
  ]);

  assert.equal(report.currentResearchBoardCount, 0);
  assert.equal(report.returnedCount, 0);
  assert.equal(report.countsByLane.DETERMINISTIC_SAFETY_OR_SCALP_BLOCK, 3);
  assert.equal(report.rejectedOrNotCurrent.length, 3);
});

test("hottest-ten-now fills a top-ten research board without forcing buy-ready picks", () => {
  const projects = Array.from({ length: 12 }, (_, index) =>
    candidate({
      symbol: `UTIL${index + 1}`,
      liveExecutionReady: false,
      executionProofState: "MARKET_OBSERVED",
      routeTruthStatus: "MARKET_OBSERVED",
      buyQuoteVerified: false,
      sellQuoteVerified: false,
      executionProof: {
        buyRouteAvailable: false,
        sellRouteAvailable: false,
        buyQuoteVerified: false,
        sellQuoteVerified: false,
        liveExecutionReady: false,
        executionProofState: "MARKET_OBSERVED",
        routeTruthStatus: "MARKET_OBSERVED",
        exactIdentityVerified: true,
        liquidityUsd: 220_000,
        slippageIsHeuristic: true,
      },
      purchaseRouteConfirmed: false,
      sellRouteAvailable: false,
      sevenDayTenXScore: 70 - index,
    })
  );
  const report = summarizeHottestTenNow(projects);

  assert.equal(report.status, "RESEARCH_BOARD_NEEDS_CONFIRMATION");
  assert.equal(report.returnedCount, 0);
  assert.equal(report.currentResearchBoardCount, 10);
  assert.equal(report.topTenCurrentResearchBoard.length, 10);
  assert.equal(report.topTenHighestRatedNow.length, 0);
  assert.equal(report.notForced, true);
  assert.match(report.disclaimer, /not financial advice/i);
});
