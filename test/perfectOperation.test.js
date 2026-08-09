import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  analyzeDailyCapitalMove,
  summarizeDailyCapitalMoves,
} from "../src/engines/dailyCapitalMoveEngine.js";
import { summarizeDailyRecoveryQueue } from "../src/reports/dailyRecoveryQueueReportEngine.js";
import { summarizeDailySourceGaps } from "../src/reports/dailySourceGapReportEngine.js";
import { summarizeSystemReadiness } from "../src/reports/systemReadinessReportEngine.js";

const NOW = new Date().toISOString();
const TOKEN = "0x1111111111111111111111111111111111111111";
const POOL = "0x2222222222222222222222222222222222222222";
const BASE_USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";

function utilitySmallCap(overrides = {}) {
  return {
    name: "Utility Small Cap",
    symbol: "USC",
    chain: "base",
    tokenAddress: TOKEN,
    contractAddress: TOKEN,
    poolAddress: POOL,
    pairAddress: POOL,
    dexName: "Aerodrome",
    dex: "Aerodrome",
    baseTokenAddress: TOKEN,
    quoteTokenAddress: BASE_USDC,
    quoteAsset: "USDC",
    discoverySources: ["dexscreener", "geckoterminal"],
    source: "dexscreener",
    priceUsd: 0.004,
    marketCapUsd: 6_500_000,
    liquidityUsd: 210_000,
    dexLiquidityUsd: 210_000,
    volume24h: 150_000,
    volume24hUsd: 150_000,
    priceChange24hPct: 18,
    priceChange7dPct: 64,
    routeTruthStatus: "LIVE_EXECUTION_READY",
    buyQuoteVerified: true,
    sellQuoteVerified: true,
    quoteTimestamp: NOW,
    estimatedRoundTripSlippagePct: 1.4,
    regionStatus: "CONFIRMED_AVAILABLE",
    instantSafetyStatus: "PASS",
    highUpsideScalpScore: 86,
    hottestTenNowScore: 82,
    sevenDayTenXScore: 80,
    earlyAsymmetryResearchPriorityScore: 84,
    capitalMigrationScore: 86,
    capitalFlowScore: 84,
    buyerBreadthAccelerationScore: 82,
    buyPressureScore: 78,
    liquidityFormationScore: 80,
    organicDemandIntegrityScore: 79,
    utilityQualityScore: 84,
    realUtilityScore: 82,
    developerAccelerationScore: 78,
    developerActivityScore: 76,
    githubProScore: 74,
    ecosystemIntegrationScore: 75,
    tokenomicsScore: 72,
    sourceTruthScore: 86,
    sourceReliabilityScore: 84,
    institutionalDataProvenanceScore: 80,
    evidenceCoverageScore: 78,
    opportunityEvidenceCoverage: 76,
    trapRiskScore: 4,
    contractAuthorityRiskScore: 3,
    liquidityControlRiskScore: 5,
    washTradingRiskScore: 6,
    walletClusterRiskScore: 8,
    deployerRiskScore: 6,
    sellPressureScore: 9,
    ...overrides,
  };
}

test("daily capital move selects only fully proven utility-small-cap research candidates", () => {
  const result = analyzeDailyCapitalMove(utilitySmallCap());

  assert.equal(result.dailyCapitalMoveLane, "CAPITAL_MOVE_RESEARCH");
  assert.equal(result.dailyCapitalMoveExecutionReady, true);
  assert.equal(result.dailyCapitalMoveExecutionTruthState, "LIVE_EXECUTION_READY");
  assert.deepEqual(result.dailyCapitalMoveMissingProof, []);
});

test("missing sell proof keeps a strong project research-only and creates recovery actions", () => {
  const result = analyzeDailyCapitalMove(utilitySmallCap({
    routeTruthStatus: "BUY_QUOTE_VERIFIED",
    sellQuoteVerified: false,
  }));
  const summary = summarizeDailyCapitalMoves([result]);
  const recovery = summarizeDailyRecoveryQueue([result]);

  assert.equal(result.dailyCapitalMoveLane, "QUARANTINED_IDENTITY_OR_ROUTE");
  assert.equal(result.dailyCapitalMoveExecutionReady, false);
  assert.ok(result.dailyCapitalMoveMissingProof.includes("fresh verified buy and sell route"));
  assert.equal(result.dailyCapitalMoveQuarantineReason, "SELL_ROUTE_FAILED");
  assert.equal(summary.bestCandidate, null);
  assert.equal(summary.status, "NO_VALID_MOVE_TODAY_RESEARCH_ONLY");
  assert.equal(recovery.status, "RECOVERY_ACTIONS_READY");
  assert.ok(recovery.topRecoveryCandidates[0].targetSources.includes("Jupiter"));
});

test("daily recovery queue excludes malformed aggregate provider rows", () => {
  const aggregate = analyzeDailyCapitalMove(utilitySmallCap({
    symbol: "BTCETHUSDTBNBUSDCXRPSOLTRXHYPEDOGE",
    name: "Bitcoin Ethereum Tether BNB USDC XRP Solana TRON Hyperliquid Dogecoin and unrelated catalog assets",
    source: "defillama-yields",
    tokenAddress: null,
    contractAddress: null,
    poolAddress: null,
    routeTruthStatus: "BUY_QUOTE_VERIFIED",
    sellQuoteVerified: false,
  }));
  const real = analyzeDailyCapitalMove(utilitySmallCap({
    symbol: "REAL",
    routeTruthStatus: "BUY_QUOTE_VERIFIED",
    sellQuoteVerified: false,
  }));
  const recovery = summarizeDailyRecoveryQueue([aggregate, real]);

  assert.equal(recovery.recoveryCandidateCount, 1);
  assert.equal(recovery.topRecoveryCandidates[0].symbol, "REAL");
});

test("daily recovery queue excludes blocked, late-chase, and meme-only lanes", () => {
  const blocked = analyzeDailyCapitalMove(utilitySmallCap({
    symbol: "BLOCK",
    honeypotDetected: true,
  }));
  const late = analyzeDailyCapitalMove(utilitySmallCap({
    symbol: "LATE",
    priceChange24hPct: 160,
  }));
  const meme = analyzeDailyCapitalMove(utilitySmallCap({
    symbol: "MEME",
    utilityClassification: "MEME_SPECULATION",
  }));
  const real = analyzeDailyCapitalMove(utilitySmallCap({
    symbol: "REAL",
    routeTruthStatus: "BUY_QUOTE_VERIFIED",
    sellQuoteVerified: false,
  }));
  const recovery = summarizeDailyRecoveryQueue([blocked, late, meme, real]);

  assert.equal(recovery.recoveryCandidateCount, 1);
  assert.equal(recovery.topRecoveryCandidates[0].symbol, "REAL");
});

test("already-pumped projects cannot enter the daily capital slate", () => {
  const result = analyzeDailyCapitalMove(utilitySmallCap({
    priceChange24hPct: 140,
    priceChange7dPct: 460,
  }));

  assert.equal(result.dailyCapitalMoveLane, "LATE_CHASE_DO_NOT_CHASE");
  assert.equal(summarizeDailyCapitalMoves([result]).bestCandidate, null);
});

test("daily capital engine refuses meme-only speculation in utility mode", () => {
  const result = analyzeDailyCapitalMove(utilitySmallCap({
    utilityClassification: "MEME_SPECULATION",
  }));

  assert.equal(result.dailyCapitalMoveLane, "MEME_ONLY_EXCLUDED");
});

test("research-only entities stay outside tradable route recovery and capital lanes", () => {
  const result = analyzeDailyCapitalMove(utilitySmallCap({
    name: "builder/alpha-protocol",
    symbol: "UNRESOLVED",
    researchOnly: true,
    tradableCandidate: false,
    tokenAddress: null,
    contractAddress: null,
    poolAddress: null,
    pairAddress: null,
  }));
  const summary = summarizeDailyCapitalMoves([result]);
  const recovery = summarizeDailyRecoveryQueue([result]);

  assert.equal(result.dailyCapitalMoveLane, "ENTITY_RESEARCH_ONLY");
  assert.equal(summary.entityResearchOnly.length, 1);
  assert.equal(summary.quarantinedIdentityOrRoute.length, 0);
  assert.equal(recovery.recoveryCandidateCount, 0);
});

test("daily capital engine excludes meme-like identities without utility proof", () => {
  for (const project of [
    { symbol: "CAPOO", name: "Capoo Bugcat" },
    { symbol: "RACCOOS", name: "RACCOOS" },
  ]) {
    const result = analyzeDailyCapitalMove(utilitySmallCap({
      ...project,
      description: "Viral culture token with no product docs.",
      utilityClassification: "UNKNOWN_UTILITY",
      realUtilityQualified: false,
      utilityEvidenceFamilies: [],
      utilityQualityScore: 0,
      realUtilityScore: 0,
      developerActivityScore: 0,
      developerAccelerationScore: 0,
      githubProScore: 0,
      ecosystemIntegrationScore: 0,
      tokenomicsScore: 0,
    }));

    assert.equal(result.dailyCapitalMoveLane, "MEME_ONLY_EXCLUDED");
  }
});

test("daily capital engine rejects aggregate or malformed identity rows", () => {
  const result = analyzeDailyCapitalMove(utilitySmallCap({
    symbol: "BTCETHUSDTBNBUSDCXRPSOLTRXHYPEDOGE",
    name: "Bitcoin Ethereum Tether BNB USDC XRP Solana TRON Hyperliquid Dogecoin Zcash Avalanche Ethereum Base Sonic and hundreds of unrelated catalog assets",
  }));

  assert.equal(result.dailyCapitalMoveLane, "BLOCKED");
  assert.match(result.dailyCapitalMoveReason, /Malformed|aggregate/i);
});

test("daily capital engine rejects generic market labels without project proof", () => {
  const result = analyzeDailyCapitalMove(utilitySmallCap({
    symbol: "$DEPIN",
    name: "DEPIN",
    source: "defillama-yields",
    tokenAddress: null,
    contractAddress: null,
    poolAddress: null,
    pairAddress: null,
    routeTruthStatus: "BUY_QUOTE_VERIFIED",
    sellQuoteVerified: false,
  }));

  assert.equal(result.dailyCapitalMoveLane, "BLOCKED");
  assert.match(result.dailyCapitalMoveReason, /aggregate/i);
});

test("daily capital engine honors upstream high-upside safety blocks", () => {
  const result = analyzeDailyCapitalMove(utilitySmallCap({
    highUpsideScalpLane: "SCALP_NO_TRADE_SAFETY_BLOCK",
  }));

  assert.equal(result.dailyCapitalMoveLane, "BLOCKED");
  assert.equal(result.dailyCapitalMoveSafetyStatus, "BLOCKED");
});

test("daily source gaps classify missing keys, rate limits, failures, and regional blocks", () => {
  const report = summarizeDailySourceGaps({
    sourceRouter: {
      sources: [
        { source: "DexScreener", status: "success", lastCandidateCount: 12 },
        { source: "CoinGecko", status: "429 rate limited" },
        { source: "Binance", status: "451 region blocked" },
        { source: "Birdeye", status: "missing BIRDEYE_API_KEY" },
        { source: "CoinCap", status: "fetch failed" },
      ],
    },
  });

  assert.equal(report.status, "SOURCE_GAPS_FOUND");
  assert.equal(report.availableCount, 1);
  assert.equal(report.rateLimitedCount, 1);
  assert.equal(report.regionBlockedCount, 1);
  assert.equal(report.missingKeyCount, 1);
  assert.equal(report.failedCount, 1);
});

test("daily source gaps let no-key free sources become available with useful probe data", () => {
  const report = summarizeDailySourceGaps({
    sourceProbes: {
      dexscreener: { status: "success", pairs: 8 },
      geckoterminal: { status: "ok", pools: 4 },
      coingecko: { status: "success", results: 2 },
    },
    opModeReadiness: {
      keys: {
        groups: [
          {
            label: "Paid market keys",
            missingRequired: ["BIRDEYE_API_KEY"],
          },
        ],
      },
    },
  });

  assert.equal(report.availableCount >= 3, true);
  assert.equal(report.workingFreeSourceCount >= 3, true);
  assert.equal(report.sources.find((source) => source.source === "dexscreener").available, true);
  assert.equal(report.sources.find((source) => source.source === "coingecko").missingKey, null);
  assert.notEqual(report.scannerBlindnessRisk, "CRITICAL");
});

test("daily source gaps do not mark successful empty probes as available", () => {
  const report = summarizeDailySourceGaps({
    sourceProbes: {
      dexscreener: { status: "SUCCESS_EMPTY", lastCandidateCount: 0 },
    },
  });
  const dex = report.sources.find((source) => source.source === "dexscreener");

  assert.equal(dex.status, "EMPTY");
  assert.equal(dex.available, false);
  assert.match(dex.nextAction, /returned no usable records/i);
});

test("daily source gaps do not let missing paid keys make the free-mode scanner blind", () => {
  const report = summarizeDailySourceGaps({
    sourceProbes: {
      dexscreener: { status: "success", lastCandidateCount: 10 },
      researchSeeds: { status: "success", seedCount: 5 },
      nativeDiscoveryMesh: { status: "success", poolCount: 3 },
    },
    opModeReadiness: {
      keys: {
        groups: [
          {
            label: "Paid source keys",
            missingRequired: ["BIRDEYE_API_KEY", "ETHERSCAN_API_KEY", "ZEROX_API_KEY"],
          },
        ],
      },
    },
  });

  assert.equal(report.missingKeyCount, 3);
  assert.equal(report.workingFreeSourceCount >= 3, true);
  assert.notEqual(report.scannerBlindnessRisk, "CRITICAL");
  assert.ok(report.paidKeyUpsideRank.some((item) => item.missingKey === "BIRDEYE_API_KEY"));
});

test("daily source gaps distinguish seed coverage from route-promotion coverage", () => {
  const report = summarizeDailySourceGaps({
    sourceProbes: {
      researchSeeds: { status: "success", seedCount: 30 },
      candidateRescue: { status: "success", candidates: 10 },
      dexscreener: { status: "fetch failed" },
      geckoterminal: { status: "fetch failed" },
      coingecko: { status: "timeout" },
    },
    executionProofRecovery: {
      adapterHealth: [
        { adapter: "jupiter", attempts: 8, recovered: 0, providerFailures: 0 },
        { adapter: "cex-order-book", attempts: 8, recovered: 0, providerFailures: 8 },
      ],
    },
  });

  assert.equal(report.workingFreeSourceCount >= 2, true);
  assert.equal(report.routeIdentityUsefulSourceCount, 0);
  assert.equal(report.executionQuoteSourceAvailableCount, 0);
  assert.equal(report.routePromotionBlindnessRisk, "CRITICAL");
  assert.match(report.routePromotionWarning, /contract\/pool\/liquidity/i);
  assert.ok(report.topRoutePromotionSourceFailures.some((item) => item.source === "DexScreener"));
});

test("system readiness names strict route proof as the candidate-promotion blocker", () => {
  const reportsDir = fs.mkdtempSync(path.join(os.tmpdir(), "cli-system-readiness-promotion-"));
  fs.writeFileSync(path.join(reportsDir, "daily-source-gaps.json"), JSON.stringify({
    status: "SOURCE_GAPS_FOUND",
    routePromotionBlindnessRisk: "CRITICAL",
    routeIdentitySourceAvailableCount: 0,
    routeIdentityUsefulSourceCount: 0,
    executionQuoteSourceAvailableCount: 0,
    failedCount: 3,
  }));
  fs.writeFileSync(path.join(reportsDir, "high-upside-scalp-research.json"), JSON.stringify({
    status: "PASS_NO_ACTIONABLE_RESULTS",
    laneDistribution: { QUARANTINED_IDENTITY_OR_ROUTE: 10 },
    scalpReadyCount: 0,
    highUpsideWatchCount: 0,
    quarantinedIdentityOrRouteCount: 10,
  }));
  fs.writeFileSync(path.join(reportsDir, "execution-proof-recovery.json"), JSON.stringify({
    status: "PROVIDERS_FAILED_OR_UNAVAILABLE",
    candidatesAttempted: 10,
    routesRecovered: 0,
  }));

  const report = summarizeSystemReadiness({}, { reportsDir, requiredFiles: [] });

  assert.equal(report.candidatePromotionStatus, "IDENTITY_ROUTE_PROOF_BLOCKED");
  assert.equal(report.candidatePromotionDiagnosis.executionProofRoutesRecovered, 0);
  assert.match(report.candidatePromotionDiagnosis.dominantReason, /strict contract, pool, liquidity/i);
  assert.ok(report.failures.some((failure) => failure.area === "candidate-promotion"));
  assert.ok(report.failures.some((failure) => failure.area === "candidate-lanes"));
});

test("system readiness distinguishes route-pending research from total promotion blockage", () => {
  const reportsDir = fs.mkdtempSync(path.join(os.tmpdir(), "cli-system-readiness-route-pending-"));
  fs.writeFileSync(path.join(reportsDir, "daily-source-gaps.json"), JSON.stringify({
    status: "SOURCE_GAPS_FOUND",
    routePromotionBlindnessRisk: "LOW",
    routeIdentitySourceAvailableCount: 3,
    routeIdentityUsefulSourceCount: 2,
    executionQuoteSourceAvailableCount: 2,
    failedCount: 1,
  }));
  fs.writeFileSync(path.join(reportsDir, "high-upside-scalp-research.json"), JSON.stringify({
    status: "PASS_WITH_WATCHLIST",
    laneDistribution: { RESEARCH_ONLY_ROUTE_MISSING: 12, QUARANTINED_IDENTITY_OR_ROUTE: 4 },
    scalpReadyCount: 0,
    highUpsideWatchCount: 0,
    researchOnlyRouteMissingCount: 12,
    quarantinedIdentityOrRouteCount: 4,
  }));
  fs.writeFileSync(path.join(reportsDir, "execution-proof-recovery.json"), JSON.stringify({
    status: "ROUTES_RECOVERED",
    candidatesAttempted: 25,
    routesRecovered: 6,
  }));

  const report = summarizeSystemReadiness({}, { reportsDir, requiredFiles: [] });

  assert.equal(report.candidatePromotionStatus, "ROUTE_PENDING_RESEARCH_AVAILABLE");
  assert.equal(report.candidatePromotionDiagnosis.researchOnlyRouteMissingCount, 12);
  assert.match(report.candidatePromotionDiagnosis.dominantReason, /Route-pending research candidates are visible/i);
});

test("daily source gaps sanitize malformed env labels and require action for unavailable unknowns", () => {
  const report = summarizeDailySourceGaps({
    opModeReadiness: {
      keys: {
        groups: [
          {
            label: "Malformed labels",
            missingRequired: ["OPENAI API KEY_API_KEY", "X/TWITTER SEARCH_API_KEY"],
          },
        ],
      },
    },
  });
  const malformedKeys = report.sources.map((source) => source.missingKey).filter(Boolean);
  const unavailableUnknown = report.sources.find((source) => source.status === "UNKNOWN" && source.available === false);

  assert.equal(malformedKeys.some((key) => /\s|\//.test(key)), false);
  assert.ok(unavailableUnknown);
  assert.notEqual(unavailableUnknown.nextAction, "No action needed.");
  assert.equal(report.availableCount, 0);
  assert.equal(report.scannerBlindnessRisk, "CRITICAL");
  assert.match(report.criticalWarning, /no live source truth/i);
});
