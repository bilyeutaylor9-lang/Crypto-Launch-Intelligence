import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  adaptForCoreModels,
  buildGuardedLiveRanking,
  buildMicroTestPlan,
  guardedIdentityKey,
  loadGuardedBacktestPolicy,
  writeGuardedLiveRankingReports,
} from "../src/ranking/guardedLiveRankingEngine.js";

const TOKEN = "0x0000000000000000000000000000000000000a11";
const POOL = "0x0000000000000000000000000000000000000b11";
const USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";

function candidate(overrides = {}) {
  const now = new Date().toISOString();
  return {
    name: "Measured Alpha",
    tokenName: "Measured Alpha",
    symbol: "MALPHA",
    chain: "base",
    tokenAddress: TOKEN,
    contractAddress: TOKEN,
    poolAddress: POOL,
    pairAddress: POOL,
    routeType: "DEX_AGGREGATOR",
    dexName: "0x",
    venue: "0x",
    baseTokenAddress: TOKEN,
    quoteTokenAddress: USDC,
    pipelineScore: 84,
    researchOpportunityScore: 82,
    researchOpportunityCoverage: {
      observedComponentCount: 8,
      expectedComponentCount: 10,
      coveragePct: 80,
    },
    sourceTruthScore: 82,
    activeLiquidityTruthScore: 80,
    instantSafetyScore: 90,
    contractAuthoritySafetyScore: 90,
    deployerReputationScore: 75,
    outcomeCalibrationScore: 70,
    utilityQualityScore: 78,
    realUtilityScore: 78,
    utilityClassification: "REAL_UTILITY",
    realUtilityQualified: true,
    utilityEvidenceFamilies: ["PRODUCT", "DEVELOPMENT", "ADOPTION"],
    memeOnlySpeculative: false,
    rawEvidence: {
      independentBuyerAccelerationScore: 82,
      qualifiedSmartWalletFlowScore: 80,
      liquidityFormationScore: 78,
      relativeStrengthScore: 76,
      volumeAccelerationScore: 74,
      verifiedCatalystScore: 72,
      safetyScore: 90,
    },
    verifiedCatalyst: true,
    strongestCatalyst: {
      verified: true,
      source: "official-announcement",
      announcedAt: now,
    },
    safetyProofStatus: "SAFETY_VERIFIED_CLEAN",
    securityEvidence: [{ check: "honeypot simulation", status: "PASS" }],
    securityEvidenceSources: ["goplus"],
    buyQuoteVerified: true,
    sellQuoteVerified: true,
    purchaseRouteConfirmed: true,
    sellRouteAvailable: true,
    quoteTimestamp: now,
    quoteAgeSeconds: 60,
    routeTruthStatus: "LIVE_EXECUTION_READY",
    executionProofState: "LIVE_EXECUTION_READY",
    executionStatus: "LIVE_EXECUTION_READY",
    exactIdentityVerified: true,
    contractVerified: true,
    orderBookDepthVerified: true,
    verifiedDepthSource: "LIVE-BUY-SELL-QUOTE",
    orderBookDepthUsd: 150000,
    verifiedTradeSizeUsd: 100,
    liquidityUsd: 150000,
    dexLiquidityUsd: 150000,
    volume24h: 80000,
    estimatedRoundTripSlippagePct: 1.2,
    slippageIsHeuristic: false,
    lastVerifiedAt: now,
    provenance: ["0x-live-quote", "goplus"],
    canonicalExecutionRoute: {
      routeType: "DEX_AGGREGATOR",
      chain: "base",
      tokenAddress: TOKEN,
      contractAddress: TOKEN,
      poolAddress: POOL,
      pairAddress: POOL,
      baseTokenAddress: TOKEN,
      quoteTokenAddress: USDC,
      venue: "0x",
      exactIdentityVerified: true,
      buyQuoteVerified: true,
      sellQuoteVerified: true,
      quoteTimestamp: now,
      quoteAgeSeconds: 60,
      verifiedTradeSizeUsd: 100,
      verifiedDepthSource: "LIVE-BUY-SELL-QUOTE",
      estimatedRoundTripSlippagePct: 1.2,
      slippageIsHeuristic: false,
      liquidityUsd: 150000,
      volume24hUsd: 80000,
      supportingSources: ["0x-live-quote"],
      routeTruthStatus: "LIVE_EXECUTION_READY",
      status: "LIVE_EXECUTION_READY",
      regionStatus: "UNKNOWN",
      lastVerifiedAt: now,
    },
    ...overrides,
  };
}

const noWinnerPolicy = {
  source: "test",
  winnerPublished: false,
  bestModel: null,
  adequateModels: [],
  rejectionReasons: ["BACKTEST_DID_NOT_PUBLISH_A_WINNER"],
};

test("guarded ranking replaces the live score while preserving legacy score and rank", () => {
  const result = buildGuardedLiveRanking([candidate()], {
    policy: noWinnerPolicy,
    env: {
      LIVE_RANKING_MODEL: "auto",
      LIVE_RANKING_MIN_SCORE: "70",
      LIVE_RANKING_MIN_MICRO_COVERAGE: "0.6",
    },
  });
  const project = result.ranked[0];
  assert.equal(project.legacyProductionScore, 84);
  assert.equal(project.legacyRank, 1);
  assert.equal(project.pipelineScore, project.guardedLiveScore);
  assert.equal(project.liveRankingModel, "GUARDED_CORE_BLEND_UNPROVEN_CANARY");
  assert.equal(project.liveActionStatus, "MICRO_TEST_ELIGIBLE");
  assert.equal(project.liveExecutionReady, true);
});

test("unknown safety can remain research-worthy but never micro-test eligible", () => {
  const result = buildGuardedLiveRanking(
    [
      candidate({
        safetyProofStatus: "SAFETY_UNKNOWN",
        securityEvidence: [],
        securityEvidenceSources: [],
        rawEvidence: {
          ...candidate().rawEvidence,
          safetyScore: undefined,
        },
      }),
    ],
    { policy: noWinnerPolicy, env: { LIVE_RANKING_MIN_SCORE: "70" } }
  );
  assert.notEqual(result.ranked[0].liveActionStatus, "MICRO_TEST_ELIGIBLE");
  assert.equal(result.ranked[0].liveExecutionReady, false);
  assert.ok(result.ranked[0].liveRankingMissingEvidence.includes("authoritativeSafetyProof"));
});

test("known honeypot is blocked regardless of a high legacy score", () => {
  const result = buildGuardedLiveRanking(
    [candidate({ pipelineScore: 99, honeypotDetected: true })],
    { policy: noWinnerPolicy }
  );
  assert.equal(result.ranked[0].liveActionStatus, "BLOCKED");
  assert.ok(result.ranked[0].guardedLiveScore <= 20);
});

test("missing sell quote cannot become micro-test eligible", () => {
  const base = candidate();
  const result = buildGuardedLiveRanking(
    [
      candidate({
        sellQuoteVerified: false,
        sellRouteAvailable: false,
        canonicalExecutionRoute: {
          ...base.canonicalExecutionRoute,
          sellQuoteVerified: false,
        },
      }),
    ],
    { policy: noWinnerPolicy }
  );
  assert.notEqual(result.ranked[0].liveActionStatus, "MICRO_TEST_ELIGIBLE");
  assert.equal(result.ranked[0].microTestPlan.maximumExperimentAllocationUsd, null);
});

test("missing identity is a recoverable data state rather than a deterministic block", () => {
  const result = buildGuardedLiveRanking(
    [
      candidate({
        chain: null,
        tokenAddress: null,
        contractAddress: null,
        canonicalExecutionRoute: null,
      }),
    ],
    { policy: noWinnerPolicy }
  );
  assert.equal(result.ranked[0].liveActionStatus, "DATA_RECOVERY_REQUIRED");
  assert.deepEqual(result.ranked[0].liveRankingBlocks, []);
});

test("data-recovery candidates never backfill the guarded top 10", () => {
  const result = buildGuardedLiveRanking(
    [
      candidate({
        chain: null,
        tokenAddress: null,
        contractAddress: null,
        canonicalExecutionRoute: null,
      }),
    ],
    { policy: noWinnerPolicy }
  );
  assert.equal(result.ranked[0].liveActionStatus, "DATA_RECOVERY_REQUIRED");
  assert.deepEqual(result.top10, []);
  assert.equal(result.summary.liveLeader, null);
  assert.equal(result.summary.recoveryLeader, "Measured Alpha");
});

test("meme-only candidates cannot enter the guarded research or micro-test lanes", () => {
  const result = buildGuardedLiveRanking(
    [
      candidate({
        name: "Artificial Inu",
        symbol: "AINU",
        utilityQualityScore: null,
        realUtilityScore: null,
        utilityClassification: "MEME_SPECULATION",
        realUtilityQualified: false,
        utilityEvidenceFamilies: [],
        memeOnlySpeculative: true,
      }),
    ],
    { policy: noWinnerPolicy }
  );

  assert.equal(result.top10.length, 0);
  assert.equal(result.microEligible.length, 0);
  assert.equal(result.researchWatchlist.length, 0);
  assert.equal(result.ranked[0].liveActionStatus, "DATA_RECOVERY_REQUIRED");
  assert.equal(result.ranked[0].liveRankingUtilityEligible, false);
});

test("derived advisory scores are not laundered into raw baseline evidence", () => {
  const project = candidate({
    rawEvidence: undefined,
    buyerBreadthAccelerationScore: 99,
    qualifiedSmartWalletFlowScore: 99,
    liquidityFormationScore: 99,
    relativeStrengthScore: 99,
    volumeAccelerationScore: 99,
    uniqueBuyers24h: null,
    buyers24h: null,
    previousClusterAdjustedUniqueBuyers24h: null,
    qualifiedSmartWalletNetFlowUsd: null,
    qualifiedSmartWalletCount: null,
    liquidityGrowthPct: null,
    previousLiquidityUsd: null,
    marketRelativeStrengthPct: null,
    relativePerformance24hPct: null,
    volumeAccelerationPct: null,
    previousVolume24h: null,
  });
  const adapted = adaptForCoreModels(project).project;
  assert.equal(adapted.rawEvidence.independentBuyerAccelerationScore, null);
  assert.equal(adapted.rawEvidence.qualifiedSmartWalletFlowScore, null);
  assert.equal(adapted.rawEvidence.liquidityFormationScore, null);
  assert.equal(adapted.rawEvidence.relativeStrengthScore, null);
  assert.equal(adapted.rawEvidence.volumeAccelerationScore, null);
});

test("a declared winner is rejected unless adequacy and the full leakage audit pass", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "guarded-policy-"));
  const reportPath = path.join(dir, "backtest.json");
  fs.writeFileSync(
    reportPath,
    JSON.stringify({
      status: "COMPLETE",
      leakageAudit: { status: "INSUFFICIENT_HISTORY_FOR_FOLD_AUDIT", evidenceAudit: { status: "PASS" } },
      comparison: {
        winnerPublished: true,
        bestModel: { model: "CORE_EVIDENCE_BASELINE" },
        models: [{ model: "CORE_EVIDENCE_BASELINE", adequacy: { adequate: true } }],
      },
    })
  );
  const policy = loadGuardedBacktestPolicy(reportPath);
  assert.equal(policy.declaredWinnerPublished, true);
  assert.equal(policy.winnerPublished, false);
  assert.ok(policy.rejectionReasons.includes("FULL_LEAKAGE_AND_FOLD_AUDIT_NOT_PASSED"));
});

test("micro-test ceiling requires an explicitly configured experiment bankroll", () => {
  const project = { liveActionStatus: "MICRO_TEST_ELIGIBLE" };
  assert.equal(buildMicroTestPlan(project, { env: {} }).maximumExperimentAllocationUsd, null);
  const configured = buildMicroTestPlan(project, {
    env: {
      MICRO_TEST_MODE: "true",
      MICRO_TEST_BANKROLL_USD: "500",
      MICRO_TEST_MAX_POSITION_PCT: "0.01",
      MICRO_TEST_MAX_PER_POSITION_USD: "25",
    },
  });
  assert.equal(configured.maximumExperimentAllocationUsd, 5);
  assert.equal(configured.automaticExecutionAllowed, false);
  assert.equal(configured.leverageAllowed, false);
});

test("non-EVM identity preserves case and token and pool identities cannot collapse", () => {
  assert.equal(
    guardedIdentityKey({
      chain: "solana",
      tokenAddress: "AbCdEfGhijkLMNopQRstuVWxyz123456789ABCDE",
      poolAddress: "11111111111111111111111111111111",
    }),
    "solana:AbCdEfGhijkLMNopQRstuVWxyz123456789ABCDE"
  );
  assert.equal(
    guardedIdentityKey({ chain: "base", tokenAddress: TOKEN, poolAddress: TOKEN }),
    null
  );
});

test("live ranking reports preserve scan identity and status accounting", () => {
  const ranking = buildGuardedLiveRanking([candidate()], {
    policy: noWinnerPolicy,
    scanRunId: "scan_guarded_test",
    env: { LIVE_RANKING_MIN_MICRO_COVERAGE: "0.6" },
  });
  const reportDir = fs.mkdtempSync(path.join(os.tmpdir(), "guarded-report-"));
  const paths = writeGuardedLiveRankingReports(
    ranking.ranked,
    {
      scanRunId: "scan_guarded_test",
      codeCommitSha: "abc123",
      guardedLiveRankingPolicy: ranking.policy,
      guardedLiveRankingConfiguration: ranking.configuration,
    },
    { reportDir }
  );
  const report = JSON.parse(fs.readFileSync(paths.liveCoreRankingJsonPath, "utf8"));
  assert.equal(report.scanRunId, "scan_guarded_test");
  assert.equal(report.projectsAnalyzed, 1);
  assert.equal(report.summary.microTestEligible, 1);
  assert.equal(report.top10[0].legacyRank, 1);
});

test("live ranking report does not publish an incomplete candidate as a pick", () => {
  const ranking = buildGuardedLiveRanking(
    [
      candidate({
        chain: null,
        tokenAddress: null,
        contractAddress: null,
        canonicalExecutionRoute: null,
      }),
    ],
    { policy: noWinnerPolicy, scanRunId: "scan_recovery_only" }
  );
  const reportDir = fs.mkdtempSync(path.join(os.tmpdir(), "guarded-recovery-report-"));
  const paths = writeGuardedLiveRankingReports(
    ranking.ranked,
    { scanRunId: "scan_recovery_only" },
    { reportDir }
  );
  const report = JSON.parse(fs.readFileSync(paths.liveCoreRankingJsonPath, "utf8"));
  assert.equal(report.status, "PASS_DATA_RECOVERY_ONLY");
  assert.deepEqual(report.top10, []);
  assert.equal(report.dataRecovery.length, 1);
});
