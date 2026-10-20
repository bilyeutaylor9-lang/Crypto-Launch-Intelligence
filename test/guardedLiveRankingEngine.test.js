import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { summarizeEvidenceFunnel } from "../src/kernel/evidenceFunnelSummary.js";

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

test("published integrity uses the guarded score and labels the earlier canonical pass", () => {
  const canonicalReasons = ["Pipeline score 21 is below required minimum 60."];
  const input = candidate({
    pipelineScore: 21,
    finalDecisionScore: 21,
    researchOpportunityScore: 19.6692,
    utilityQualityScore: 12,
    realUtilityQualified: false,
    utilityClassification: "UNKNOWN_UTILITY",
    utilityEvidenceFamilies: [],
    finalSelectionState: "BLOCKED",
    finalSelectionQualified: false,
    finalIntegrityScore: 86,
    finalIntegrityVerdict: "Blocked By Final Integrity",
    finalBlockingReasons: canonicalReasons,
    finalWarningReasons: ["Canonical evidence review pending."],
    finalSelectionReasons: [],
    finalAuthorityEngine: "Final Selection Integrity",
  });
  const before = structuredClone(input);
  const { ranked, top10 } = buildGuardedLiveRanking([input], {
    policy: noWinnerPolicy,
    env: { LIVE_RANKING_MODEL: "research" },
  });
  const [project] = ranked;
  assert.equal(project.pipelineScore, 14.7519);
  assert.equal(project.finalDecisionScore, project.pipelineScore);
  assert.equal(project.finalSelectionState, "BLOCKED");
  assert.equal(project.liveActionStatus, "BLOCKED");
  assert.equal(project.finalIntegrityVerdict, "Blocked By Final Integrity");
  assert.ok(project.finalBlockingReasons.includes(`Pipeline score ${project.pipelineScore} is below required minimum 60.`));
  assert.equal(project.finalBlockingReasons.includes(canonicalReasons[0]), false);
  assert.equal(project.finalIntegrityPipelineScore, project.pipelineScore);
  assert.equal(project.finalAuthorityEngine, "Guarded Live Ranking");
  assert.equal(project.legacyFinalAuthorityEngine, "Final Selection Integrity");
  assert.equal(project.legacyFinalIntegrityVerdict, "Blocked By Final Integrity");
  assert.equal(project.legacyFinalIntegrityScore, 86);
  assert.equal(project.legacyFinalSelectionState, "BLOCKED");
  assert.equal(project.legacyFinalSelectionQualified, false);
  assert.equal(project.legacyFinalDecisionScore, 21);
  assert.deepEqual(project.legacyFinalBlockingReasons, canonicalReasons);
  assert.deepEqual(project.legacyFinalWarningReasons, input.finalWarningReasons);
  assert.equal(project.legacyFinalIntegritySource, "PRE_GUARDED_CANONICAL_PASS");
  assert.deepEqual(top10, []);
  assert.deepEqual(input, before);
});

test("guarded diagnostics never retain a canonical qualified verdict after a utility denial", () => {
  const [project] = buildGuardedLiveRanking([candidate({
    finalSelectionState: "QUALIFIED",
    finalSelectionQualified: true,
    finalIntegrityVerdict: "Qualified Final Candidate",
    finalSelectionReasons: ["Earlier canonical gates passed."],
    utilityQualityScore: null,
    realUtilityScore: null,
    realUtilityQualified: false,
    utilityClassification: "UNKNOWN_UTILITY",
    utilityEvidenceFamilies: [],
  })], { policy: noWinnerPolicy, env: { LIVE_RANKING_MODEL: "research" } }).ranked;
  assert.equal(project.liveActionStatus, "DATA_RECOVERY_REQUIRED");
  assert.equal(project.finalSelectionState, "INSUFFICIENT_DATA");
  assert.equal(project.finalSelectionQualified, false);
  assert.equal(project.finalIntegrityVerdict, "Research Only - Insufficient Data");
  assert.deepEqual(project.finalSelectionReasons, []);
  assert.ok(project.finalWarningReasons.some(reason => /utility/i.test(reason)));
  assert.equal(project.legacyFinalIntegrityVerdict, "Qualified Final Candidate");
});

test("canonical hard blocks and unknown qualification remain denied in guarded publication", () => {
  for (const finalSelectionState of ["BLOCKED", "IDENTITY_CONFLICT", "UNKNOWN", "INSUFFICIENT_DATA"]) {
    const hard = ["BLOCKED", "IDENTITY_CONFLICT"].includes(finalSelectionState);
    const reason = "Canonical identity conflict requires independent resolution.";
    const { ranked, top10 } = buildGuardedLiveRanking([candidate({
      finalSelectionState,
      finalSelectionQualified: false,
      finalBlockingReasons: hard ? [reason] : [],
      utilityQualityScore: null,
      realUtilityScore: null,
      realUtilityQualified: false,
      utilityClassification: "UNKNOWN_UTILITY",
      utilityEvidenceFamilies: [],
    })], { policy: noWinnerPolicy });
    const [project] = ranked;
    assert.equal(project.finalSelectionQualified, false, finalSelectionState);
    assert.notEqual(project.finalIntegrityVerdict, "Qualified Final Candidate");
    assert.deepEqual(top10, []);
    if (hard) {
      assert.equal(project.finalSelectionState, finalSelectionState);
      assert.equal(project.liveActionStatus, "BLOCKED");
      assert.ok(project.finalBlockingReasons.some(value => value.includes(reason)));
      assert.deepEqual(project.legacyFinalBlockingReasons, [reason]);
    }
  }
});

test("deferred publication skips final-integrity diagnostics without inventing an evaluated score", () => {
  let evaluations = 0;
  const [project] = buildGuardedLiveRanking([candidate({
    deepEvaluationState: "DEFERRED_BEFORE_DEEP",
    finalIntegrityScore: 86,
    finalIntegrityVerdict: "Canonical review pending",
    signalProfile: { get risk() { evaluations += 1; return 18; } },
  })], { policy: noWinnerPolicy }).ranked;
  assert.equal(evaluations, 0);
  assert.equal(project.liveActionStatus, "DEEP_DEFERRED");
  assert.equal(project.finalSelectionState, "DEFERRED_BEFORE_DEEP");
  assert.equal(project.finalSelectionQualified, false);
  assert.equal(project.finalIntegrityScore, null);
  assert.equal(project.finalIntegrityPipelineScore, null);
  assert.equal(project.finalIntegrityScoreSource, "NOT_REEVALUATED_DEFERRED");
  assert.equal(project.legacyFinalIntegrityScore, 86);
  assert.equal(project.legacyFinalIntegrityVerdict, "Canonical review pending");
});

test("unchanged eligible diagnostics reuse only the same-score same-clock evaluation", (t) => {
  let evaluations = 0;
  const input = candidate({
    signalProfile: { get risk() { evaluations += 1; return 18; } },
  });
  const now = Date.parse(input.quoteTimestamp) + 1000;
  t.mock.method(Date, "now", () => now);
  const [project] = buildGuardedLiveRanking([input], {
    policy: noWinnerPolicy, env: { LIVE_RANKING_MODEL: "research" },
  }).ranked;
  assert.equal(project.pipelineScore, 82);
  assert.equal(project.finalSelectionQualified, true);
  assert.equal(evaluations, 1);
});

test("a quote expiring between integrity passes is reevaluated and cannot remain qualified", (t) => {
  let now = Date.now();
  const cutoff = now;
  t.mock.method(Date, "now", () => now);
  let evaluations = 0;
  const issued = new Date(cutoff - 1000).toISOString();
  const expires = new Date(cutoff + 1).toISOString();
  const input = candidate({
    quoteTimestamp: issued,
    quoteAgeSeconds: 1,
    quoteExpiresAt: expires,
    signalProfile: { get risk() {
      evaluations += 1;
      if (evaluations === 1) now = cutoff + 2;
      return 18;
    } },
  });
  input.canonicalExecutionRoute = { ...input.canonicalExecutionRoute,
    quoteTimestamp: issued, quoteAgeSeconds: 1, quoteExpiresAt: expires, lastVerifiedAt: issued };
  const [project] = buildGuardedLiveRanking([input], {
    policy: noWinnerPolicy, env: { LIVE_RANKING_MODEL: "research" },
  }).ranked;
  assert.ok(evaluations >= 2);
  assert.equal(project.finalSelectionQualified, false);
  assert.equal(project.liveExecutionReady, false);
  assert.notEqual(project.liveActionStatus, "MICRO_TEST_ELIGIBLE");
  assert.ok(project.finalWarningReasons.some(reason => /stale|fresh|route/i.test(reason)));
});

test("reranking preserves the canonical origin without recursively prefixing guarded reasons", () => {
  const canonical = candidate({
    pipelineScore: 21, finalDecisionScore: 21,
    finalSelectionState: "BLOCKED", finalSelectionQualified: false,
    finalIntegrityScore: 86, finalIntegrityVerdict: "Blocked By Final Integrity",
    finalAuthorityEngine: "Final Selection Integrity",
    finalBlockingReasons: ["Pipeline score 21 is below required minimum 60."],
    finalWarningReasons: ["Canonical review pending."], finalSelectionReasons: [],
    researchOpportunityScore: 19.6692,
  });
  const options = { policy: noWinnerPolicy, env: { LIVE_RANKING_MODEL: "research" } };
  let [project] = buildGuardedLiveRanking([canonical], options).ranked;
  const original = structuredClone(project);
  for (let pass = 0; pass < 3; pass += 1) {
    [project] = buildGuardedLiveRanking([project], options).ranked;
    for (const key of ["legacyProductionScore", "legacyPipelineScore", "legacyFinalDecisionScore",
      "legacyFinalSelectionState", "legacyFinalSelectionQualified", "legacyFinalIntegrityScore",
      "legacyFinalIntegrityVerdict", "legacyFinalAuthorityEngine", "legacyFinalBlockingReasons",
      "legacyFinalWarningReasons", "legacyFinalSelectionReasons", "legacyFinalIntegritySource"]) {
      assert.deepEqual(project[key], original[key], `${pass}:${key}`);
    }
    assert.ok(project.finalBlockingReasons.every(reason => reason.split("Canonical pre-guarded pass").length <= 2));
    assert.equal(project.finalSelectionQualified, false);
    assert.equal(project.liveActionStatus, "BLOCKED");
  }
});

test("guarded score-only denials retain unknown decision proof through the evidence funnel", () => {
  const sparse = {
    name: "Sparse Canonical Alpha", tokenName: "Sparse Canonical Alpha", symbol: "SPARSE",
    chain: "base", tokenAddress: TOKEN, contractAddress: TOKEN, poolAddress: POOL,
    pipelineScore: 0, finalSelectionState: "BLOCKED", finalSelectionQualified: false,
    finalBlockingReasons: ["Pipeline score 0 is below required minimum 60."],
    deepEvaluationState: "DEEP_EVALUATED", coreEvidenceState: "CORE_EVIDENCE_READY",
    coreEvidenceCoveragePct: 92,
  };
  const { ranked } = buildGuardedLiveRanking([sparse], { policy: noWinnerPolicy });
  const summary = summarizeEvidenceFunnel(ranked);
  assert.equal(ranked[0].finalSelectionQualified, false);
  assert.deepEqual(ranked[0].legacyFinalBlockingReasons, sparse.finalBlockingReasons);
  assert.equal(summary.healthyCoreEvidence, true);
  assert.equal(summary.healthyDecisionEvidence, false);
  assert.equal(summary.selectionOutcome, "DATA_DEGRADED");
  assert.equal(summary.conclusivelyRejected, 0);
  assert.equal(summary.unresolvedDecisionEvidence, 1);
  for (const field of ["SAFETY", "BUY_QUOTE", "SELL_QUOTE", "QUOTE_FRESHNESS", "ROUTE_DEPTH", "VERIFIED_SLIPPAGE"]) {
    assert.equal(summary.decisionProofMissingFields[field], 1, field);
  }

  for (const negative of [{ honeypotDetected: true }, { canonicalIdentityHardBlock: true }]) {
    const blocked = buildGuardedLiveRanking([{ ...sparse, ...negative }], { policy: noWinnerPolicy });
    const blockedSummary = summarizeEvidenceFunnel(blocked.ranked);
    assert.equal(blocked.ranked[0].liveActionStatus, "BLOCKED");
    assert.equal(blocked.ranked[0].finalSelectionQualified, false);
    assert.equal(blockedSummary.conclusivelyRejected, 1);
    assert.equal(blockedSummary.healthyDecisionEvidence, true);
    assert.deepEqual(blockedSummary.decisionProofMissingFields, {});
  }
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

test("an exact non-blocked recovery lead is always exposed as NOT_ACTIONABLE", () => {
  const result = buildGuardedLiveRanking(
    [
      candidate({
        utilityQualityScore: null,
        realUtilityScore: null,
        utilityClassification: "UNKNOWN_UTILITY",
        realUtilityQualified: false,
        utilityEvidenceFamilies: [],
      }),
    ],
    { policy: noWinnerPolicy }
  );

  assert.equal(result.top10.length, 0);
  assert.equal(result.primaryCandidate?.name, "Measured Alpha");
  assert.equal(result.primaryCandidate?.liveActionStatus, "DATA_RECOVERY_REQUIRED");
  assert.equal(result.primaryCandidate?.primaryCandidateLane, "BEST_AVAILABLE_MONITORED_RESEARCH");
  assert.equal(result.primaryCandidate?.primaryCandidateDisposition, "NOT_ACTIONABLE");
  assert.equal(result.primaryCandidate?.finalSelectionQualified, false);
  assert.equal(result.summary.primaryCandidate, "Measured Alpha");
  assert.equal(result.summary.primaryCandidateDisposition, "NOT_ACTIONABLE");
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
  assert.equal(result.primaryCandidate, null);
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
      dataCutoffTimestamp: "2026-08-27T12:00:00.000Z",
      guardedLiveRankingPolicy: ranking.policy,
      guardedLiveRankingConfiguration: ranking.configuration,
    },
    { reportDir }
  );
  const report = JSON.parse(fs.readFileSync(paths.liveCoreRankingJsonPath, "utf8"));
  const microTestReport = JSON.parse(fs.readFileSync(paths.microTestWatchlistPath, "utf8"));
  assert.equal(report.scanRunId, "scan_guarded_test");
  assert.equal(report.projectsAnalyzed, 1);
  assert.equal(report.summary.microTestEligible, 1);
  assert.equal(report.top10[0].legacyRank, 1);
  assert.equal(microTestReport.dataCutoffTimestamp, "2026-08-27T12:00:00.000Z");
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

test("live ranking report publishes a separate monitored lead without making it a pick", () => {
  const ranking = buildGuardedLiveRanking(
    [
      candidate({
        utilityQualityScore: null,
        realUtilityScore: null,
        utilityClassification: "UNKNOWN_UTILITY",
        realUtilityQualified: false,
        utilityEvidenceFamilies: [],
      }),
    ],
    { policy: noWinnerPolicy, scanRunId: "scan_monitored_lead" }
  );
  const reportDir = fs.mkdtempSync(path.join(os.tmpdir(), "guarded-monitored-report-"));
  const paths = writeGuardedLiveRankingReports(
    ranking.ranked,
    { scanRunId: "scan_monitored_lead" },
    { reportDir }
  );
  const report = JSON.parse(fs.readFileSync(paths.liveCoreRankingJsonPath, "utf8"));

  assert.deepEqual(report.top10, []);
  assert.equal(report.primaryCandidate.name, "Measured Alpha");
  assert.equal(report.primaryCandidate.primaryCandidateDisposition, "NOT_ACTIONABLE");
  assert.equal(report.primaryCandidate.liveActionStatus, "DATA_RECOVERY_REQUIRED");
  assert.equal(report.microEligible.length, 0);
});

test("live ranking report keeps a complete bounded index without duplicating every proof graph", () => {
  const projectCount = 2000;
  const projects = Array.from({ length: projectCount }, (_, index) => ({
    ...candidate({
      name: `Recovery Candidate ${index}`,
      symbol: `R${index}`,
      tokenAddress: `0x${String(index + 1).padStart(40, "0")}`,
      contractAddress: `0x${String(index + 1).padStart(40, "0")}`,
      liveRank: index + 1,
      legacyRank: index + 1,
      liveActionStatus: "DATA_RECOVERY_REQUIRED",
      liveRankingDisplayEligible: true,
      liveRankingUtilityEligible: false,
      liveRankingMissingEvidence: ["verifiedUtilityEvidence"],
    }),
    liveRankingTrace: {
      proofGraph: "x".repeat(5000),
      execution: { safetyVerified: false, safetyStatus: "UNKNOWN" },
    },
  }));
  const reportDir = fs.mkdtempSync(path.join(os.tmpdir(), "guarded-bounded-report-"));
  const paths = writeGuardedLiveRankingReports(
    projects,
    { scanRunId: "scan_bounded_report" },
    { reportDir }
  );
  const report = JSON.parse(fs.readFileSync(paths.liveCoreRankingJsonPath, "utf8"));
  const reportBytes = fs.statSync(paths.liveCoreRankingJsonPath).size;

  assert.equal(report.ranked.length, projectCount);
  assert.ok(report.ranked.every((project) => project.liveRankingTrace === undefined));
  assert.equal(report.dataRecovery.length, 25);
  assert.equal(report.dataRecovery[0].liveRankingTrace.proofGraph.length, 5000);
  assert.ok(reportBytes < 3_000_000, `expected bounded report, received ${reportBytes} bytes`);
});
