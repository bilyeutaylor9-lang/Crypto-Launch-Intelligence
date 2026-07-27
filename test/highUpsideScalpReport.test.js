import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { analyzeSevenDayTenXResearchBatch } from "../src/engines/sevenDayTenXResearchEngine.js";
import { analyzeUtilityQualityBatch } from "../src/engines/utilityQualityEngine.js";
import { analyzeScalpMicrostructureBatch } from "../src/engines/scalpMicrostructureEngine.js";
import { analyzeHighUpsideScalpClassificationBatch } from "../src/engines/highUpsideScalpClassificationEngine.js";
import { analyzeBuyerBreadthAcceleration } from "../src/engines/buyerBreadthAccelerationEngine.js";
import { summarizeHighUpsideScalpResearch } from "../src/reports/highUpsideScalpReportEngine.js";
import { compactProjectsForReportWriters } from "../src/reports/reportPayloadCompactor.js";
import { generateReports } from "../src/reports/reportOrchestrator.js";

const TOKEN = "0x0000000000000000000000000000000000000abc";
const POOL = "0x0000000000000000000000000000000000000def";

function candidate(overrides = {}) {
  return {
    name: "Utility Scalp Candidate",
    symbol: "USC",
    chain: "base",
    tokenAddress: TOKEN,
    contractAddress: TOKEN,
    poolAddress: POOL,
    pairAddress: POOL,
    category: "AI infrastructure",
    description:
      "AI infrastructure protocol with SDK, API, mainnet app, revenue fees, integrations, developer docs and active users.",
    website: "https://utility.example",
    docsUrl: "https://docs.utility.example",
    githubRepo: "https://github.com/utility/protocol",
    discoverySources: ["dexscreener", "geckoterminal", "github", "official-docs"],
    identityVerified: true,
    contractVerified: true,
    chainVerified: true,
    finalIdentityState: "VERIFIED_CONTRACT",
    finalSelectionState: "QUALIFIED",
    purchaseRouteConfirmed: true,
    executionRouteAvailable: true,
    sellRouteAvailable: true,
    executionStatus: "VERIFIED",
    executionProofState: "LIVE_EXECUTION_READY",
    routeTruthStatus: "LIVE_EXECUTION_READY",
    buyQuoteVerified: true,
    sellQuoteVerified: true,
    exactIdentityVerified: true,
    quoteAgeSeconds: 60,
    spreadPct: 0.3,
    estimatedRoundTripSlippagePct: 1.1,
    estimatedGasUsd: 0.2,
    estimatedFeesUsd: 0.05,
    purchaseRoute: { sellable: true, buyQuoteVerified: true, sellQuoteVerified: true, quoteAgeSeconds: 60 },
    executionProof: {
      executionStatus: "VERIFIED",
      executionProofState: "LIVE_EXECUTION_READY",
      routeTruthStatus: "LIVE_EXECUTION_READY",
      buyRouteAvailable: true,
      sellRouteAvailable: true,
      buyQuoteVerified: true,
      sellQuoteVerified: true,
      liveExecutionReady: true,
      exactIdentityVerified: true,
      quoteFreshnessSeconds: 60,
      liquidityUsd: 180_000,
      estimatedRoundTripSlippagePct: 1.1,
      slippageIsHeuristic: false,
    },
    proofOfAlphaExecutionTwin: {
      route: { detected: true, sellDetected: true },
      safety: { blockers: [] },
    },
    priceUsd: 0.004,
    priceChange24h: 16,
    priceChange7d: 44,
    marketCap: 2_500_000,
    liquidityUsd: 180_000,
    dexLiquidityUsd: 180_000,
    stableExitLiquidityUsd: 90_000,
    volume24h: 320_000,
    accelerationScore: 82,
    earlyBreakoutScore: 80,
    preBreakoutRadarScore: 82,
    preConsensusBreakoutScore: 80,
    earlyAsymmetryResearchPriorityScore: 84,
    capitalMigrationScore: 78,
    capitalFlowScore: 76,
    buyerBreadthAccelerationScore: 82,
    buyPressureScore: 78,
    liquidityFormationScore: 84,
    liquidityExpansionScore: 80,
    organicBuyerScore: 82,
    buyerRetentionScore: 78,
    organicDemandIntegrityScore: 82,
    smartWalletArrivalScore: 74,
    smartMoneyAccumulationScore: 76,
    catalystScore: 76,
    catalystCalendarScore: 76,
    liveCatalystRadarScore: 78,
    developerActivityScore: 82,
    developerAccelerationScore: 80,
    githubProScore: 78,
    ecosystemIntegrationScore: 78,
    tokenomicsScore: 76,
    sourceTruthScore: 84,
    sourceReliabilityScore: 82,
    institutionalDataProvenanceScore: 80,
    evidenceCoverageScore: 78,
    opportunityEvidenceCoverage: 80,
    instantSafetyStatus: "PASS",
    instantSafetyScore: 92,
    contractAuthoritySafetyScore: 90,
    liquidityControlSafetyScore: 88,
    sniperIntegrityScore: 86,
    finalIntegrityScore: 88,
    contractAuthorityRiskScore: 6,
    liquidityControlRiskScore: 8,
    washTradingRiskScore: 5,
    walletClusterRiskScore: 6,
    deployerRiskScore: 6,
    sellPressureScore: 14,
    securityEvidenceStatus: "EVIDENCE_AVAILABLE",
    contractSafetyVerified: true,
    liveCatalystEvents: [
      {
        type: "Product release",
        expectedDate: new Date(Date.now() + 3 * 86400000).toISOString(),
        verificationSources: ["official docs"],
      },
    ],
    ...overrides,
  };
}

function analyzed(projects = []) {
  const tenX = analyzeSevenDayTenXResearchBatch(analyzeUtilityQualityBatch(projects), {
    targetCount: 10,
  });
  return analyzeScalpMicrostructureBatch(tenX);
}

function classified(projects = []) {
  return analyzeHighUpsideScalpClassificationBatch(analyzed(projects));
}

test("high-upside scalp report promotes pre-extension real-utility route-ready candidates", () => {
  const report = summarizeHighUpsideScalpResearch(classified([candidate()]));

  assert.equal(report.status, "PASS_WITH_SCALP_READY");
  assert.equal(report.scalpReadyCount, 1);
  assert.equal(report.classificationInvariant.status, "PASS");
  assert.equal(report.topScalpResearchCandidates[0].symbol, "USC");
  assert.equal(report.topScalpResearchCandidates[0].lane, "SCALP_READY_RESEARCH");
  assert.equal(report.topScalpResearchCandidates[0].subCent, true);
});

test("already-10x or late-chase candidates are rejected from scalp-ready lane", () => {
  const report = summarizeHighUpsideScalpResearch(
    classified([
      candidate({
        symbol: "CHASE",
        priceChange24h: 240,
        priceChange7d: 980,
      }),
    ])
  );

  assert.equal(report.scalpReadyCount, 0);
  assert.equal(report.lateChaseRejected[0].symbol, "CHASE");
  assert.equal(report.lateChaseRejected[0].lane, "LATE_CHASE_REJECTED");
  assert.ok(report.lateChaseRejected[0].blockers.some((blocker) => /10x|extended/i.test(blocker)));
});

test("meme-only coins are excluded from real-utility scalp lane", () => {
  const report = summarizeHighUpsideScalpResearch(
    classified([
      candidate({
        symbol: "MEME",
        category: "meme-token",
        description: "Meme community cat dog culture token with viral posts and no product docs.",
        website: null,
        docsUrl: null,
        githubRepo: null,
        developerActivityScore: 0,
        developerAccelerationScore: 0,
        githubProScore: 0,
        ecosystemIntegrationScore: 0,
        tokenomicsScore: 0,
        narrativeHeatScore: 98,
        socialAccelerationScore: 94,
      }),
    ])
  );

  assert.equal(report.scalpReadyCount, 0);
  assert.equal(report.memeSpeculationExcluded[0].symbol, "MEME");
});

test("microstructure no-trade lanes cannot remain scalp-ready", () => {
  const report = summarizeHighUpsideScalpResearch(
    classified([
      candidate({
        symbol: "COSTLY",
        spreadPct: 4,
        estimatedRoundTripSlippagePct: 8,
        estimatedGasUsd: 4,
      }),
    ])
  );

  assert.equal(report.scalpReadyCount, 0);
  assert.equal(report.microstructureRejectedCount, 1);
  assert.equal(report.microstructureRejected[0].lane, "SCALP_NO_TRADE_HIGH_COST");
});

test("high-upside classification survives project compaction beyond eighty top-level fields", () => {
  const noisy = candidate(
    Object.fromEntries(Array.from({ length: 140 }, (_, index) => [`extraField${index}`, `value-${index}`]))
  );
  const compacted = compactProjectsForReportWriters(classified([noisy]));
  const report = summarizeHighUpsideScalpResearch(compacted);

  assert.equal(report.scalpReadyCount, 1);
  assert.equal(report.topScalpResearchCandidates[0].lane, "SCALP_READY_RESEARCH");
  assert.equal(report.compactionDetected, true);
  assert.equal(report.classificationInvariant.status, "PASS");
});

test("strong project passed through generateReports remains scalp-ready", () => {
  const cwd = process.cwd();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cli-high-upside-generate-"));
  try {
    process.chdir(tmp);
    generateReports(classified([candidate({ symbol: "FULL" })]), {
      scanRunId: "high-upside-test",
      codeCommitSha: "test-sha",
    });
    const report = JSON.parse(fs.readFileSync(path.join(tmp, "reports", "high-upside-scalp-research.json"), "utf8"));
    assert.equal(report.scalpReadyCount, 1);
    assert.equal(report.topScalpResearchCandidates[0].symbol, "FULL");
    assert.equal(report.topScalpResearchCandidates[0].lane, "SCALP_READY_RESEARCH");
  } finally {
    process.chdir(cwd);
  }
});

test("missing scoring fields produce data-starved instead of silent zero scoring", () => {
  const report = summarizeHighUpsideScalpResearch([
    {
      symbol: "MISS",
      chain: "base",
      tokenAddress: TOKEN,
      contractAddress: TOKEN,
      poolAddress: POOL,
      routeTruthStatus: "LIVE_EXECUTION_READY",
      executionProofState: "LIVE_EXECUTION_READY",
      buyQuoteVerified: true,
      sellQuoteVerified: true,
      exactIdentityVerified: true,
      quoteAgeSeconds: 30,
      liquidityUsd: 150_000,
      estimatedRoundTripSlippagePct: 1.2,
      regionStatus: "CONFIRMED_AVAILABLE",
    },
  ]);

  assert.equal(report.dataStarvedCount, 1);
  assert.equal(report.dataStarved[0].lane, "DATA_STARVED");
  assert.ok(report.dataStarved[0].highUpsideScalpMissingFields.length > 0);
});

test("standard-stage projects not selected for deep high-upside research are deferred, not data-starved", () => {
  const report = summarizeHighUpsideScalpResearch([
    {
      symbol: "BROAD",
      chain: "base",
      progressivePipelineStages: ["standard"],
      standardSelectionRank: 1200,
    },
  ]);

  assert.equal(report.status, "PASS_NO_ACTIONABLE_RESULTS");
  assert.equal(report.highUpsideResearchDeferredCount, 1);
  assert.equal(report.dataStarvedCount, 0);
  assert.equal(report.classificationEligibleProjectCount, 0);
  assert.equal(report.laneDistribution.HIGH_UPSIDE_RESEARCH_DEFERRED, 1);
  assert.equal(report.highUpsideResearchDeferred[0].lane, "HIGH_UPSIDE_RESEARCH_DEFERRED");
  assert.equal(report.missingFieldFrequency.length, 0);
  assert.equal(report.deferredFunnelSummary.deferredCount, 1);
});

test("broad 4000-style queue does not mark non-deep funnel projects data-starved", () => {
  const deepNoTrade = analyzeHighUpsideScalpClassificationBatch(
    analyzed([
      candidate({
        symbol: "DEEPBAD",
        progressivePipelineStages: ["standard", "advanced", "deep"],
        spreadPct: 4,
        estimatedRoundTripSlippagePct: 8,
        estimatedGasUsd: 4,
      }),
    ])
  )[0];
  const broadDeferred = Array.from({ length: 7 }, (_, index) => ({
    symbol: `BROAD${index}`,
    chain: "base",
    progressivePipelineStages: ["standard"],
    standardSelectionRank: index + 501,
  }));
  const report = summarizeHighUpsideScalpResearch([deepNoTrade, ...broadDeferred]);

  assert.equal(report.projectsAnalyzed, 8);
  assert.equal(report.classificationEligibleProjectCount, 1);
  assert.equal(report.highUpsideResearchDeferredCount, 7);
  assert.equal(report.microstructureRejectedCount, 1);
  assert.equal(report.dataStarvedCount, 0);
  assert.equal(report.status, "PASS_NO_ACTIONABLE_RESULTS");
  assert.equal(Object.values(report.laneDistribution).reduce((sum, count) => sum + count, 0), 8);
});

test("safety blocked, lower priority, and route-missing projects stay visible", () => {
  const safeLow = candidate({
    symbol: "LOW",
    sevenDayTenXScore: 48,
    preBreakoutRadarScore: 42,
    preConsensusBreakoutScore: 40,
    earlyAsymmetryResearchPriorityScore: 44,
    capitalMigrationScore: 38,
    capitalFlowScore: 40,
    buyerBreadthAccelerationScore: 42,
    buyPressureScore: 40,
    liquidityFormationScore: 38,
    liquidityExpansionScore: 40,
    utilityQualityScore: 48,
    realUtilityScore: 44,
    developerAccelerationScore: 42,
    developerActivityScore: 42,
    ecosystemIntegrationScore: 40,
    tokenomicsScore: 42,
  });
  const noRoute = candidate({
    symbol: "NOROUTE",
    sellQuoteVerified: false,
    executionProofState: "SELL_QUOTE_MISSING",
    routeTruthStatus: "SELL_QUOTE_MISSING",
    executionProof: { sellQuoteVerified: false },
    purchaseRoute: { sellable: false },
  });
  const unsafe = candidate({ symbol: "BAD", honeypotDetected: true });
  const report = summarizeHighUpsideScalpResearch(
    analyzeHighUpsideScalpClassificationBatch([safeLow, noRoute, unsafe])
  );

  assert.equal(report.safetyBlockedCount, 1);
  assert.equal(report.lowerPriorityCount, 1);
  assert.equal(report.researchOnlyRouteMissingCount, 1);
  assert.equal(report.safetyBlocked[0].symbol, "BAD");
  assert.equal(report.lowerPriority[0].symbol, "LOW");
  assert.equal(report.researchOnlyRouteMissing[0].symbol, "NOROUTE");
});

test("high-upside scalp treats route-only microstructure blocks as research-only missing proof", () => {
  const noRoute = candidate({
    symbol: "ROUTEGAP",
    sellRouteAvailable: false,
    executionStatus: "MARKET_OBSERVED",
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
      liquidityUsd: 180_000,
      slippageIsHeuristic: true,
    },
    finalSelectionState: "BLOCKED",
    finalSelectionBlockers: ["EXECUTION_EVIDENCE_MISSING", "SNIPER_EVIDENCE_FAMILY_QUORUM_MISSING"],
  });
  const report = summarizeHighUpsideScalpResearch(classified([noRoute]));

  assert.equal(report.researchOnlyRouteMissingCount, 1);
  assert.equal(report.microstructureRejectedCount, 0);
  assert.equal(report.safetyBlockedCount, 0);
  assert.equal(report.researchOnlyRouteMissing[0].symbol, "ROUTEGAP");
});

test("promising low-coverage candidates missing route proof stay route-pending instead of data-starved", () => {
  const report = summarizeHighUpsideScalpResearch(
    analyzeHighUpsideScalpClassificationBatch([
      {
        symbol: "EARLYROUTE",
        chain: "solana",
        tokenAddress: "So11111111111111111111111111111111111111112",
        poolAddress: "pool-earlyroute",
        preBreakoutRadarScore: 81,
        earlyAsymmetryResearchPriorityScore: 84,
        capitalMigrationScore: 76,
        liquidityFormationScore: 74,
        routeTruthStatus: "MARKET_OBSERVED",
        buyQuoteVerified: false,
        sellQuoteVerified: false,
      },
    ])
  );

  assert.equal(report.researchOnlyRouteMissingCount, 1);
  assert.equal(report.dataStarvedCount, 0);
  assert.equal(report.researchOnlyRouteMissing[0].symbol, "EARLYROUTE");
  assert.equal(report.researchOnlyRouteMissing[0].readableLane, "ROUTE_PENDING");
  assert.ok(report.researchOnlyRouteMissing[0].promotionDebug.nextSingleProofToPromote);
});

test("route-ready candidates with missing wallet flow enter manual review instead of false scalp-ready", () => {
  const noWalletProof = candidate({
    symbol: "NOWALLET",
    walletFlowScore: undefined,
    buyerBreadthAccelerationScore: undefined,
    smartWalletArrivalScore: undefined,
    rawUniqueBuyers: undefined,
    uniqueBuyers24h: undefined,
    buyers24h: undefined,
  });
  const report = summarizeHighUpsideScalpResearch(
    analyzeHighUpsideScalpClassificationBatch([noWalletProof])
  );

  assert.equal(report.scalpReadyCount, 0);
  assert.equal(report.manualReviewCount, 1);
  assert.equal(report.manualReview[0].symbol, "NOWALLET");
  assert.equal(report.manualReview[0].readableLane, "MANUAL_REVIEW");
  assert.ok(report.manualReview[0].promotionDebug.missingProof.some((proof) => /buyer|wallet/i.test(proof)));
});

test("buyer breadth acceleration emits wallet-flow quality fields", () => {
  const analyzedWalletFlow = analyzeBuyerBreadthAcceleration({
    symbol: "FLOW",
    uniqueBuyers24h: 120,
    uniqueBuyersPrev24h: 30,
    buyTransactions24h: 240,
    sellTransactions24h: 60,
    walletFlows: Array.from({ length: 80 }, () => ({ buyVolumeUsd: 100 })),
    newBuyers24h: 72,
  });

  assert.ok(Number.isFinite(analyzedWalletFlow.walletFlowScore));
  assert.equal(analyzedWalletFlow.walletFlowLane, "BROAD_ACCUMULATION_FLOW");
  assert.equal(analyzedWalletFlow.freshBuyerCount, 72);
  assert.equal(analyzedWalletFlow.buySellPressureTrend, "BUY_PRESSURE_EXPANDING");
});

test("every high-upside input project is counted exactly once", () => {
  const report = summarizeHighUpsideScalpResearch(
    classified([
      candidate({ symbol: "READY" }),
      candidate({ symbol: "WATCH", sevenDayTenXScore: 62, preBreakoutRadarScore: 64 }),
      candidate({ symbol: "LATE", priceChange24h: 120 }),
      candidate({ symbol: "MEME", category: "meme-token", description: "meme token only", githubRepo: null }),
      candidate({ symbol: "SAFE", honeypotDetected: true }),
    ])
  );
  const total = Object.values(report.laneDistribution).reduce((sum, count) => sum + count, 0);

  assert.equal(total, report.projectsAnalyzed);
  assert.equal(report.classificationInvariant.status, "PASS");
  assert.equal(report.unclassifiedCount, 0);
});

test("empty ready and watch arrays do not produce candidate-pass statuses", () => {
  const report = summarizeHighUpsideScalpResearch(
    classified([
      candidate({ symbol: "LATE_ONLY", priceChange24h: 120 }),
      candidate({ symbol: "BAD_ONLY", honeypotDetected: true }),
    ])
  );

  assert.equal(report.scalpReadyCount, 0);
  assert.equal(report.highUpsideWatchCount, 0);
  assert.equal(report.status, "PASS_NO_ACTIONABLE_RESULTS");
});

test("invalid precomputed high-upside lane causes classification incomplete", () => {
  const report = summarizeHighUpsideScalpResearch([
    {
      symbol: "BROKEN",
      highUpsideScalpLane: "BROKEN_LANE",
      highUpsideScalpScore: 99,
    },
  ]);

  assert.equal(report.status, "CLASSIFICATION_INCOMPLETE");
  assert.equal(report.unclassifiedCount, 1);
  assert.equal(report.classificationInvariant.status, "FAIL");
});
