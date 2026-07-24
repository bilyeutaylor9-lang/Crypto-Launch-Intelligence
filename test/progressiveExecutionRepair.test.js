import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";

import { attachCanonicalIdentityBatch } from "../src/identity/canonicalIdentityResolver.js";
import {
  analyzeExecutionProofBatch,
  executionProofStageMetadata,
} from "../src/engines/executionProofEngine.js";
import {
  analyzeProgressiveOpportunityRankingBatch,
  writeProgressiveDebugReports,
} from "../src/engines/progressiveOpportunityRankingEngine.js";
import { analyzeFinalSelectionIntegrityBatch } from "../src/engines/finalSelectionIntegrityEngine.js";

function strongProject(overrides = {}) {
  return {
    name: "Clean Early Alpha",
    symbol: "CEA",
    chain: "base",
    chainId: "base",
    source: "dexscreener",
    discoverySources: ["dexscreener", "geckoterminal"],
    contractAddress: "0x0000000000000000000000000000000000000cea",
    pairAddress: "0x0000000000000000000000000000000000000cab",
    contractVerified: true,
    chainVerified: true,
    identityVerified: true,
    finalIdentityState: "VERIFIED_CONTRACT",
    projectIdentityVerdict: "Identity Resolved",
    identityResolutionScore: 92,
    projectIdentityScore: 90,
    finalIntegrityScore: 92,
    liquidityUsd: 240_000,
    volume24h: 120_000,
    priceUsd: 0.12,
    accelerationScore: 94,
    velocityScore: 92,
    momentumShiftScore: 90,
    preBreakoutMomentumScore: 92,
    projectChangeScore: 90,
    trendChangeScore: 88,
    liquidityExpansionScore: 86,
    activeLiquidityTruthScore: 82,
    liquidityScore: 84,
    exitLiquidityScore: 82,
    smartWalletArrivalScore: 84,
    smartMoneyAccumulationScore: 80,
    smartMoneyRotationScore: 82,
    smartMoneyConvictionScore: 82,
    buyPressureScore: 86,
    capitalFlowScore: 82,
    organicDemandScore: 80,
    holderGrowthScore: 78,
    organicBuyerScore: 78,
    buyerRetentionScore: 80,
    communityGrowthScore: 76,
    narrativeHeatScore: 70,
    narrativeForecastScore: 72,
    narrativeScore: 74,
    socialAccelerationScore: 68,
    xSocialScore: 66,
    liveCatalystRadarScore: 76,
    catalystCalendarScore: 74,
    catalystScore: 76,
    roadmapCatalystProfitScore: 74,
    developerActivityScore: 72,
    githubProScore: 70,
    githubQualityScore: 70,
    relativeStrengthScore: 80,
    instantSafetyStatus: "PASS",
    instantSafetyScore: 86,
    contractRiskScore: 4,
    honeypotRiskScore: 2,
    liquidityControlRisk: 8,
    liquidityManipulationRisk: 6,
    sourceTruthScore: 82,
    sourceReliabilityScore: 80,
    institutionalDataProvenanceScore: 82,
    institutionalDataProvenance: {
      components: { sourceAgreement: 82 },
      sourceSummary: { sourceCount: 3, sources: ["dexscreener", "geckoterminal", "source-truth"] },
    },
    holderDistributionScore: 76,
    walletClusterRiskScore: 8,
    insiderDistributionRisk: 8,
    washTradingRiskScore: 7,
    organicDemandFirewallScore: 78,
    purchaseRoute: {
      purchasable: true,
      sellable: true,
      preferredRoute: "MetaMask",
      status: "Available Route Detected",
      routes: [
        {
          type: "DexScreener",
          contract: "0x0000000000000000000000000000000000000cea",
          pairAddress: "0x0000000000000000000000000000000000000cab",
          quoteAsset: "USDC",
          verified: true,
        },
      ],
    },
    proofOfAlphaExecutionTwin: {
      route: { detected: true, preferredRoute: "MetaMask", status: "Detected" },
      quote: { liquidityUsd: 240_000, estimatedSlippagePct: 0.4, timestamp: new Date().toISOString() },
      safety: { blockers: [] },
    },
    proofOfAlphaExecutionTwinScore: 82,
    finalSelectionState: "QUALIFIED",
    finalSelectionQualified: true,
    pipelineScore: 92,
    comparableSampleSize: 8,
    ...overrides,
  };
}

test("canonical identity resolver treats symbol collisions as review unless contracts conflict", () => {
  const [base, solana, conflict] = attachCanonicalIdentityBatch([
    strongProject({
      symbol: "RAIN",
      chain: "base",
      chainId: "base",
      contractAddress: "0x0000000000000000000000000000000000000a01",
      purchaseRoute: { routes: [{ contract: "0x0000000000000000000000000000000000000a01", verified: true }] },
    }),
    strongProject({
      symbol: "RAIN",
      chain: "solana",
      chainId: "solana",
      contractAddress: "Rain11111111111111111111111111111111111111",
      purchaseRoute: { routes: [{ contract: "Rain11111111111111111111111111111111111111", verified: true }] },
    }),
    strongProject({
      symbol: "BAD",
      contractAddress: "0x0000000000000000000000000000000000000b01",
      tokenAddress: "0x0000000000000000000000000000000000000b02",
      contractVerdict: "contract mismatch",
    }),
  ]);

  assert.equal(base.identityStatus, "MULTICHAIN_VARIANT");
  assert.equal(solana.identityStatus, "MULTICHAIN_VARIANT");
  assert.equal(base.canonicalIdentityHardBlock, false);
  assert.equal(conflict.identityStatus, "CONTRACT_CONFLICT");
  assert.equal(conflict.canonicalIdentityHardBlock, true);
});

test("execution provider outage is unknown evidence, not a no-route hard block", () => {
  const [project] = analyzeExecutionProofBatch([
    strongProject({
      purchaseRoute: { purchasable: false, status: "fetch failed" },
      proofOfAlphaExecutionTwin: { route: { detected: false, status: "fetch failed" }, quote: {}, safety: { blockers: [] } },
      liquidityUsd: 0,
    }),
  ]);

  assert.equal(project.executionStatus, "PROVIDER_UNAVAILABLE");
  assert.equal(project.executionProof.buyRouteAvailable, false);
  assert.equal(project.moneyStatus, "UNKNOWN");
  assert.ok(project.moneyScore > 0);
  assert.ok(project.moneyEvidence.buyRoute.reason.includes("provider unavailable"));
});

test("progressive ladder keeps provider outages visible in emerging research", () => {
  const [project] = analyzeProgressiveOpportunityRankingBatch(
    analyzeFinalSelectionIntegrityBatch(
      analyzeExecutionProofBatch([
        strongProject({
          symbol: "OUTAGE",
          source: "research-seed",
          purchaseRoute: { purchasable: false, status: "fetch failed" },
          proofOfAlphaExecutionTwinVerdict: "Execution Route Block",
          proofOfAlphaExecutionTwin: { route: { detected: false, status: "fetch failed" }, quote: {}, safety: { blockers: [] } },
          finalSelectionQualified: false,
          finalSelectionState: "RESEARCH_ONLY",
        }),
      ])
    )
  );

  assert.equal(project.progressiveLane, "EMERGING_RESEARCH");
  assert.notEqual(project.progressiveLane, "HARD_BLOCKED");
  assert.equal(project.firstFailingGate, "EXECUTION");
  assert.equal(project.firstFailingGateResult, "REVIEW");
  assert.ok(project.progressiveGateTrace.length >= 5);
  assert.ok(project.moneyScore > 0);
});

test("confirmed execution and identity proof can reach sniper-ready lane", () => {
  const [project] = analyzeProgressiveOpportunityRankingBatch(
    analyzeFinalSelectionIntegrityBatch(analyzeExecutionProofBatch([strongProject()]))
  );

  assert.equal(project.executionStatus, "VERIFIED");
  assert.equal(project.executionProofState, "SELL_QUOTE_VERIFIED");
  assert.equal(project.liveExecutionReady, false);
  assert.equal(project.progressiveLane, "SNIPER_READY");
  assert.equal(project.firstFailingGate, null);
  assert.ok(project.moneyScore >= 60);
});

test("execution proof exposes live-ready only after sell simulation, taxes, and depth are verified", () => {
  const [project] = analyzeExecutionProofBatch([
    strongProject({
      sellSimulationPassed: true,
      buyTaxPct: 0,
      sellTaxPct: 0,
      orderBookDepthUsd: 25_000,
      quoteAgeSeconds: 30,
    }),
  ]);

  assert.equal(project.executionStatus, "VERIFIED");
  assert.equal(project.executionProofState, "LIVE_EXECUTION_READY");
  assert.equal(project.liveExecutionReady, true);
  assert.equal(project.executionProof.liveExecutionReady, true);
});

test("execution proof stays unknown when contract, pool, or quote evidence is missing", () => {
  const [project] = analyzeExecutionProofBatch([
    strongProject({
      contractAddress: null,
      pairAddress: null,
      contractVerified: false,
      identityVerified: false,
      finalIdentityState: "UNRESOLVED_IDENTITY",
      purchaseRoute: {
        purchasable: true,
        sellable: true,
        preferredRoute: "MetaMask",
        status: "Available Route Detected",
        routes: [],
      },
      proofOfAlphaExecutionTwin: {
        route: { detected: true, preferredRoute: "MetaMask", status: "Detected" },
        quote: {},
        safety: { blockers: [] },
      },
    }),
  ]);

  assert.equal(project.executionStatus, "UNKNOWN");
  assert.equal(project.executionProofVerified, false);
  assert.ok(project.executionEvidenceCoveragePercent < 100);
  assert.ok(project.executionProof.failureReasons.includes("Verified token contract is missing."));
  assert.ok(project.executionProof.failureReasons.includes("Verified liquidity pool is missing."));
  assert.ok(project.executionProof.failureReasons.includes("Verified quote is missing or stale/unknown."));
});

test("AKE-style movers stay best-available when advisory AI rejects without deterministic danger", () => {
  const [project] = analyzeProgressiveOpportunityRankingBatch(
    analyzeFinalSelectionIntegrityBatch(
      analyzeExecutionProofBatch([
        strongProject({
          name: "AKE Style Runner",
          symbol: "AKE",
          aiDecision: "Reject",
          allocationBucket: "Avoid",
          localAIPromotionBlocked: false,
          riskScore: 12,
          trapRiskScore: 8,
          scamRiskScore: 0,
          honeypotRiskScore: 2,
          accelerationScore: 96,
          velocityScore: 94,
          buyPressureScore: 90,
          liquidityExpansionScore: 88,
        }),
      ])
    )
  );

  assert.equal(project.finalSelectionState, "INSUFFICIENT_DATA");
  assert.equal(project.finalSelectionQualified, false);
  assert.equal(project.finalBlockingReasons.length, 0);
  assert.equal(project.progressiveLane, "BEST_AVAILABLE");
  assert.equal(project.firstFailingGate, "FINAL_INTEGRITY");
  assert.equal(project.firstFailingGateResult, "CONDITIONAL");
  assert.ok(project.finalWarningReasons.some((reason) => reason.includes("Advisory")));
});

test("debug progressive reports expose stage health and gate traces", () => {
  const projects = analyzeProgressiveOpportunityRankingBatch(
    analyzeFinalSelectionIntegrityBatch(analyzeExecutionProofBatch([strongProject(), strongProject({ symbol: "HNY", honeypotDetected: true })]))
  );
  const paths = writeProgressiveDebugReports(projects);
  const health = JSON.parse(fs.readFileSync(paths.debugStageHealthPath, "utf8"));
  const ladder = JSON.parse(fs.readFileSync(paths.debugProgressiveLadderPath, "utf8"));

  assert.equal(health.stageStatus, "COMPLETE");
  assert.equal(typeof health.executionChecksVerified, "number");
  assert.ok(ladder.candidates.every((candidate) => Array.isArray(candidate.gateTrace)));
});

test("execution proof metadata always returns numeric verified counts", () => {
  const projects = analyzeExecutionProofBatch([strongProject(), strongProject({ purchaseRoute: { status: "fetch failed" } })]);
  const meta = executionProofStageMetadata(projects);

  assert.equal(typeof meta.verifiedCandidates, "number");
  assert.equal(typeof meta.providerUnavailableCandidates, "number");
  assert.equal(meta.attemptedCandidates, 2);
});
