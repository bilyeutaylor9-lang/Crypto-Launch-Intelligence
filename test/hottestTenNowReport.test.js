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

test("hottest-ten-now excludes aggregate provider rows from the top-ten board", () => {
  const report = summarizeHottestTenNow([
    candidate({
      symbol: "BTCETHUSDTBNBUSDCXRPSOLTRXHYPEDOGE",
      name: "Bitcoin Ethereum Tether BNB USDC XRP Solana TRON Hyperliquid Dogecoin and unrelated catalog assets",
      source: "defillama-yields",
      tokenAddress: null,
      poolAddress: null,
      marketCap: 0,
      liquidityUsd: 400_000_000,
      priceUsd: 0,
    }),
    candidate({
      symbol: "REAL",
      sevenDayTenXScore: 78,
      liveExecutionReady: false,
      executionProofState: "MARKET_OBSERVED",
      routeTruthStatus: "MARKET_OBSERVED",
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
    }),
  ]);

  assert.equal(report.countsByLane.MALFORMED_OR_AGGREGATE_IDENTITY, 1);
  assert.equal(report.topTenCurrentResearchBoard.some((project) => project.symbol === "BTCETHUSDTBNBUSDCXRPSOLTRXHYPEDOGE"), false);
  assert.equal(report.topTenCurrentResearchBoard[0].symbol, "REAL");
});

test("hottest-ten-now excludes obvious meme identities and oversized assets from utility-small-cap board", () => {
  const report = summarizeHottestTenNow([
    candidate({
      symbol: "HAPPYCAT",
      name: "Happy Cat",
      website: null,
      docsUrl: null,
      githubRepo: null,
      description: "Cat meme community token with viral posts and no product docs.",
      developerActivityScore: 0,
      developerAccelerationScore: 0,
      githubProScore: 0,
      ecosystemIntegrationScore: 0,
      tokenomicsScore: 0,
      utilityQualityScore: 0,
      realUtilityScore: 0,
      utilityClassification: "UNKNOWN_UTILITY",
      realUtilityQualified: false,
      utilityEvidenceFamilies: [],
    }),
    candidate({
      symbol: "CAPOO",
      name: "Capoo Bugcat",
      website: null,
      docsUrl: null,
      githubRepo: null,
      description: "Viral culture token with no product docs.",
      developerActivityScore: 0,
      developerAccelerationScore: 0,
      githubProScore: 0,
      ecosystemIntegrationScore: 0,
      tokenomicsScore: 0,
      utilityQualityScore: 0,
      realUtilityScore: 0,
      utilityClassification: "UNKNOWN_UTILITY",
      realUtilityQualified: false,
      utilityEvidenceFamilies: [],
    }),
    candidate({
      symbol: "RACCOOS",
      name: "RACCOOS",
      website: null,
      docsUrl: null,
      githubRepo: null,
      description: "Novelty culture token with no product docs.",
      developerActivityScore: 0,
      developerAccelerationScore: 0,
      githubProScore: 0,
      ecosystemIntegrationScore: 0,
      tokenomicsScore: 0,
      utilityQualityScore: 0,
      realUtilityScore: 0,
      utilityClassification: "UNKNOWN_UTILITY",
      realUtilityQualified: false,
      utilityEvidenceFamilies: [],
    }),
    candidate({
      symbol: "BIG",
      marketCap: 900_000_000,
    }),
    candidate({
      symbol: "AKE",
      name: "AKE / WBNB 0.01%",
      liveExecutionReady: false,
      executionProofState: "MARKET_OBSERVED",
      routeTruthStatus: "MARKET_OBSERVED",
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
    }),
  ]);

  assert.equal(report.countsByLane.MEME_ONLY_OR_NO_VERIFIED_UTILITY, 3);
  assert.equal(report.countsByLane.TOO_LARGE_FOR_UTILITY_SMALL_CAP_BOARD, 1);
  assert.equal(report.topTenCurrentResearchBoard.length, 1);
  assert.equal(report.topTenCurrentResearchBoard[0].symbol, "AKE");
});

test("hottest-ten-now excludes generic narrative labels unless project proof exists", () => {
  const report = summarizeHottestTenNow([
    candidate({
      symbol: "$DEPIN",
      name: "DEPIN",
      chain: "robinhood-chain",
      tokenAddress: "0x00000000000000000000000000000000000000d1",
      poolAddress: null,
      marketPair: null,
      website: null,
      docsUrl: null,
      githubRepo: null,
      roadmap: null,
      productEvidence: null,
      utilityQualityScore: 0,
      realUtilityScore: 0,
      utilityEvidenceFamilies: [],
      realUtilityQualified: false,
      liveExecutionReady: false,
      executionProofState: "MARKET_OBSERVED",
      routeTruthStatus: "MARKET_OBSERVED",
      sellQuoteVerified: false,
    }),
    candidate({
      symbol: "STABLECOIN",
      name: "STABLECOIN",
      tokenAddress: null,
      poolAddress: null,
      marketPair: null,
      website: null,
      docsUrl: null,
      githubRepo: null,
      roadmap: null,
      productEvidence: null,
      utilityQualityScore: 0,
      realUtilityScore: 0,
      utilityEvidenceFamilies: [],
      realUtilityQualified: false,
    }),
    candidate({
      symbol: "AI",
      name: "Artificial Inu",
      website: null,
      docsUrl: null,
      githubRepo: null,
      description: "AI meme community token with no product docs.",
      utilityQualityScore: 0,
      realUtilityScore: 0,
      utilityClassification: "UNKNOWN_UTILITY",
      realUtilityQualified: false,
      utilityEvidenceFamilies: [],
    }),
    candidate({
      symbol: "UTILX",
      name: "Utility Exchange Protocol",
      tokenAddress: null,
      poolAddress: null,
      priceUsd: 0,
      marketCap: 0,
      liquidityUsd: 0,
      liveExecutionReady: false,
      executionProofState: "UNKNOWN",
      routeTruthStatus: "UNKNOWN",
      website: "https://utilityx.example",
      docsUrl: "https://docs.utilityx.example",
      description: "Infrastructure protocol app with developer docs, mainnet roadmap, and integration evidence.",
      sevenDayTenXScore: 38,
      utilityQualityScore: 45,
      realUtilityScore: 45,
      sourceTruthScore: 45,
    }),
  ]);

  assert.equal(report.countsByLane.GENERIC_MARKET_LABEL_NEEDS_PROJECT_PROOF, 2);
  assert.equal(report.countsByLane.MEME_ONLY_OR_NO_VERIFIED_UTILITY, 1);
  assert.equal(report.topTenCurrentResearchBoard.length, 1);
  assert.equal(report.topTenCurrentResearchBoard[0].symbol, "UTILX");
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

test("hottest-ten-now backfills first board with best non-danger lower-priority recovery leads", () => {
  const projects = Array.from({ length: 12 }, (_, index) =>
    candidate({
      symbol: `REC${index + 1}`,
      name: `Recovery Utility ${index + 1}`,
      tokenAddress: null,
      poolAddress: null,
      priceUsd: 0,
      marketCap: 0,
      liquidityUsd: 0,
      liveExecutionReady: false,
      executionProofState: "UNKNOWN",
      routeTruthStatus: "UNKNOWN",
      buyQuoteVerified: false,
      sellQuoteVerified: false,
      executionProof: {
        buyRouteAvailable: false,
        sellRouteAvailable: false,
        buyQuoteVerified: false,
        sellQuoteVerified: false,
        liveExecutionReady: false,
        executionProofState: "UNKNOWN",
        routeTruthStatus: "UNKNOWN",
        exactIdentityVerified: false,
        liquidityUsd: 0,
        slippageIsHeuristic: true,
      },
      purchaseRouteConfirmed: false,
      sellRouteAvailable: false,
      description: "Infrastructure protocol app with mainnet docs, developer roadmap, integrations and staking utility.",
      website: `https://recovery-${index + 1}.example`,
      docsUrl: `https://docs.recovery-${index + 1}.example`,
      sevenDayTenXScore: 34 - index,
      utilityQualityScore: 36,
      realUtilityScore: 36,
      sourceTruthScore: 45,
    })
  );
  const report = summarizeHottestTenNow(projects);

  assert.equal(report.status, "RESEARCH_BOARD_NEEDS_CONFIRMATION");
  assert.equal(report.returnedCount, 0);
  assert.equal(report.currentResearchBoardCount, 10);
  assert.equal(report.topTenCurrentResearchBoard.length, 10);
  assert.equal(report.topTenCurrentResearchBoard[0].lane, "LOWER_PRIORITY");
  assert.equal(report.topTenCurrentResearchBoard[0].reasonNotQualified, "NEEDS_FRESH_BUY_AND_SELL_ROUTE");
  assert.ok(report.topTenCurrentResearchBoard[0].missingInfoNeeded.includes("canonical token contract"));
  assert.equal(report.topTenHighestRatedNow.length, 0);
  assert.equal(report.notForced, true);
});
