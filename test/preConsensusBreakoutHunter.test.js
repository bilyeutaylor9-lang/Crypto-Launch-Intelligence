import test from "node:test";
import assert from "node:assert/strict";

import { analyzeQuietAccumulation } from "../src/engines/quietAccumulationEngine.js";
import { analyzePreBreakoutMomentum } from "../src/engines/preBreakoutMomentumEngine.js";
import { analyzeInformationAdvantage } from "../src/engines/informationAdvantageEngine.js";
import { analyzeDistressedMicrocapTrap } from "../src/engines/distressedMicrocapTrapEngine.js";
import {
  analyzePreConsensusBreakoutHunter,
  analyzePreConsensusBreakoutHunterBatch,
} from "../src/engines/preConsensusBreakoutHunterEngine.js";
import { analyzeFinalSelectionIntegrityBatch } from "../src/engines/finalSelectionIntegrityEngine.js";
import { buildPreConsensusBreakoutReport } from "../src/reports/preConsensusBreakoutReportEngine.js";
import { runNativeDiscoveryMesh } from "../src/data/native/nativeDiscoveryMesh.js";
import { NATIVE_EVENT_TYPES } from "../src/data/native/NativePoolAdapter.js";

function baseProject(overrides = {}) {
  const quoteTimestamp = new Date().toISOString();
  return {
    name: "PreConsensus Alpha",
    symbol: "PCA",
    chain: "base",
    contractAddress: "0x0000000000000000000000000000000000000aaa",
    tokenAddress: "0x0000000000000000000000000000000000000aaa",
    address: "0x0000000000000000000000000000000000000aaa",
    pairAddress: "0x0000000000000000000000000000000000000bbb",
    poolAddress: "0x0000000000000000000000000000000000000bbb",
    dex: "Uniswap",
    dexName: "Uniswap",
    quoteAsset: "USDC",
    source: "dexscreener",
    discoverySources: ["dexscreener", "geckoterminal", "github-project-discovery"],
    identityVerified: true,
    contractVerified: true,
    chainVerified: true,
    liquidityVerified: true,
    routeTruthStatus: "LIVE_EXECUTION_READY",
    executionProofState: "LIVE_EXECUTION_READY",
    executionStatus: "LIVE_EXECUTION_READY",
    exactIdentityVerified: true,
    buyQuoteVerified: true,
    sellQuoteVerified: true,
    orderBookDepthVerified: true,
    orderBookDepthUsd: 420_000,
    estimatedRoundTripSlippagePct: 1.5,
    quoteTimestamp,
    quoteAgeSeconds: 60,
    purchaseRouteConfirmed: true,
    executionRouteAvailable: true,
    executionRoute: {
      venue: "Uniswap",
      routeType: "DEX",
      chain: "base",
      tokenAddress: "0x0000000000000000000000000000000000000aaa",
      contract: "0x0000000000000000000000000000000000000aaa",
      poolAddress: "0x0000000000000000000000000000000000000bbb",
      pairAddress: "0x0000000000000000000000000000000000000bbb",
      quoteAsset: "USDC",
      buyRouteAvailable: true,
      sellRouteAvailable: true,
      buyQuoteVerified: true,
      sellQuoteVerified: true,
      quoteTimestamp,
      quoteAgeSeconds: 60,
      liquidityUsd: 420_000,
      volume24hUsd: 250_000,
      estimatedRoundTripSlippagePct: 1.5,
      slippageIsHeuristic: false,
      regionStatus: "CONFIRMED_AVAILABLE",
    },
    finalIdentityState: "VERIFIED_CONTRACT",
    projectIdentityVerdict: "Identity Resolved",
    pipelineScore: 84,
    marketCap: 28_000_000,
    fdv: 42_000_000,
    liquidityUsd: 420_000,
    volume24h: 250_000,
    priceChange24h: 4,
    priceChange7d: 8,
    liquidityGrowth24h: 28,
    liquidityGrowth7d: 55,
    liquidityExpansionScore: 74,
    activeLiquidityTruthScore: 72,
    developerActivityScore: 78,
    githubProScore: 76,
    adoptionAccelerationScore: 74,
    organicBuyerScore: 70,
    buyerRetentionScore: 68,
    holderGrowthScore: 66,
    smartMoneyAccumulationScore: 76,
    smartWalletPerformanceScore: 74,
    smartWalletScore: 70,
    smartWalletAccumulationPattern: "gradual",
    smartWalletHoldRatePct: 82,
    narrativeHeatScore: 66,
    narrativeForecastScore: 64,
    catalystCalendarScore: 70,
    liveCatalystRadarScore: 72,
    tokenValueCaptureScore: 58,
    tokenomicsScore: 62,
    sourceTruthScore: 74,
    sourceReliabilityScore: 72,
    dataConfidenceScore: 76,
    riskScore: 18,
    trapRiskScore: 12,
    sellPressureScore: 20,
    xSocialScore: 24,
    socialAccelerationScore: 18,
    purchaseRoute: {
      purchasable: true,
      preferredRoute: "MetaMask",
      status: "Available Route Detected",
    },
    smallCapHunter: {
      purchaseRoute: {
        purchasable: true,
        preferredRoute: "MetaMask",
        status: "Available Route Detected",
      },
    },
    proofOfAlphaExecutionTwinVerdict: "Execution-Verified Alpha Candidate",
    proofOfAlphaExecutionTwin: {
      route: { detected: true, preferredRoute: "MetaMask", status: "Detected" },
      quote: { liquidityUsd: 420_000, estimatedSlippagePct: 1.5, timestamp: quoteTimestamp, ageSeconds: 60 },
      safety: { blockers: [] },
    },
    executionProof: {
      executionStatus: "LIVE_EXECUTION_READY",
      executionProofState: "LIVE_EXECUTION_READY",
      routeTruthStatus: "LIVE_EXECUTION_READY",
      buyQuoteVerified: true,
      sellQuoteVerified: true,
      orderBookDepthVerified: true,
      observedSlippagePct: 1.5,
      quoteTimestamp,
      quoteAgeSeconds: 60,
      exactIdentityVerified: true,
    },
    liveCatalystEvents: [
      {
        type: "Mainnet Launch",
        expectedDate: "2026-09-01",
        score: 78,
        urgency: "High",
        verificationSources: ["official docs"],
      },
    ],
    ...overrides,
  };
}

test("legitimate early-stage project with growing liquidity, developers, users, and flat price ranks early", () => {
  const result = analyzePreConsensusBreakoutHunter(baseProject());

  assert.ok(result.preConsensusOpportunityScore >= 70);
  assert.equal(result.preConsensusBreakoutScore, result.preConsensusOpportunityScore);
  assert.equal(
    result.preConsensusBreakoutHunter.preConsensusBreakoutScore,
    result.preConsensusOpportunityScore
  );
  assert.equal(result.preBreakoutMomentumStage !== "ALREADY_PUMPED", true);
  assert.equal(result.quietAccumulationDetected, true);
});

test("token pumping 200 percent with no fundamental improvement is not a pre-consensus top candidate", () => {
  const result = analyzePreConsensusBreakoutHunter(
    baseProject({
      priceChange7d: 200,
      priceChange24h: 90,
      developerActivityScore: 8,
      adoptionAccelerationScore: 0,
      liquidityExpansionScore: 12,
      smartMoneyAccumulationScore: 0,
      narrativeHeatScore: 20,
    })
  );

  assert.equal(result.preBreakoutMomentumStage, "ALREADY_PUMPED");
  assert.equal(result.preConsensusCandidateSelected, false);
});

test("symbol collision across two chains keeps separate final identities", () => {
  const results = analyzeFinalSelectionIntegrityBatch([
    baseProject({ symbol: "PERP", chain: "ethereum", contractAddress: "0x0000000000000000000000000000000000000e01" }),
    baseProject({ symbol: "PERP", chain: "base", contractAddress: "0x0000000000000000000000000000000000000b01" }),
  ]);

  assert.notEqual(results[0].permanentProjectKey, results[1].permanentProjectKey);
});

test("fake-volume token receives anti-manipulation block pressure", () => {
  const result = analyzePreConsensusBreakoutHunter(
    baseProject({
      washTradingRiskScore: 88,
      fakeVolumeRiskScore: 90,
      volume24h: 10_000_000,
    })
  );

  assert.ok(result.antiManipulationConfidenceScore < 30);
  assert.ok(result.preConsensusHardBlockers.some((reason) => /Wash trading/i.test(reason)));
});

test("smart-wallet accumulation pattern strengthens quiet accumulation", () => {
  const result = analyzeQuietAccumulation(baseProject());

  assert.equal(result.quietAccumulationDetected, true);
  assert.ok(result.smartWalletAccumulationScore >= 60);
});

test("insider accumulation is not labeled as smart-money accumulation", () => {
  const result = analyzeQuietAccumulation(
    baseProject({
      insiderWalletSharePct: 72,
      smartWalletVerdict: "Insider Dominated",
    })
  );

  assert.equal(result.quietAccumulationDetected, false);
  assert.ok(result.distributionRisk >= 55 || result.smartWalletAccumulationScore < 60);
});

test("distressed delisted token is blocked as a microcap trap", () => {
  const result = analyzeDistressedMicrocapTrap(
    baseProject({
      priceDrawdownPct: 96,
      exchangeDelisted: true,
      developmentAbandoned: true,
      developerActivityScore: 0,
      requiresProtocolUsage: true,
      activeUsers30d: 0,
      protocolFees30d: 0,
    })
  );

  assert.equal(result.distressedTrapBlock, true);
  assert.equal(result.distressedTrapVerdict, "Distressed Microcap Trap");
});

test("older project with verified renewed activity becomes neglected reacceleration", () => {
  const result = analyzePreConsensusBreakoutHunter(
    baseProject({
      priceDrawdownPct: 82,
      developerActivityScore: 82,
      adoptionAccelerationScore: 78,
      protocolRevenueGrowthPct: 68,
      liquidityGrowth30d: 45,
      ecosystemIntegrationScore: 70,
    })
  );

  assert.equal(result.legitimateReacceleration, true);
  assert.equal(result.preConsensusCandidateType, "NEGLECTED_REACCELERATION");
});

test("verified upcoming catalyst receives higher source confidence", () => {
  const result = analyzePreConsensusBreakoutHunter(baseProject());

  assert.equal(result.catalystTimeline[0].sourceConfidence, "High");
});

test("rumor-only catalyst is low confidence", () => {
  const result = analyzePreConsensusBreakoutHunter(
    baseProject({
      liveCatalystEvents: [
        {
          type: "Exchange listing rumor",
          window: "7d",
          source: "rumor channel",
          score: 80,
        },
      ],
    })
  );

  assert.equal(result.catalystTimeline[0].sourceConfidence, "Low");
});

test("strong social activity with no product is capped", () => {
  const result = analyzePreConsensusBreakoutHunter(
    baseProject({
      xSocialScore: 95,
      socialAccelerationScore: 92,
      developerActivityScore: 0,
      adoptionAccelerationScore: 0,
      organicBuyerScore: 0,
      liquidityExpansionScore: 10,
      smartMoneyAccumulationScore: 0,
    })
  );

  assert.ok(result.preConsensusOpportunityScore < 70);
  assert.equal(result.preConsensusCandidateSelected, false);
});

test("strong product activity with low social attention creates information advantage", () => {
  const result = analyzeInformationAdvantage(baseProject());

  assert.ok(result.informationAdvantageScore >= 60);
  assert.ok(["TECHNICAL_EARLY", "SMART_MONEY_EARLY", "ECOSYSTEM_EARLY"].includes(result.estimatedConsensusStage));
});

test("candidate becomes invalid after contract-risk discovery", () => {
  const [result] = analyzeFinalSelectionIntegrityBatch([
    {
      ...analyzePreConsensusBreakoutHunter(baseProject()),
      contractVerdict: "Honeypot unsafe contract",
    },
  ]);

  assert.equal(result.preConsensusCandidateSelected, false);
  assert.equal(result.finalSelectionQualified, false);
  assert.ok(result.finalBlockingReasons.some((reason) => /Honeypot/i.test(reason)));
});

test("no-qualified-candidates report does not promote blocked projects", () => {
  const blocked = analyzeFinalSelectionIntegrityBatch([
    {
      ...analyzePreConsensusBreakoutHunter(baseProject({ aiDecision: "Reject" })),
      aiDecision: "Reject",
    },
  ]);
  const report = buildPreConsensusBreakoutReport(blocked);

  assert.equal(report.exceptionalCandidates.length, 0);
  assert.equal(report.highConvictionResearchCandidates.length, 0);
  assert.ok(report.blockedCandidates.length >= 1);
});

test("token with missing liquidity cannot become qualified", () => {
  const [result] = analyzeFinalSelectionIntegrityBatch([
    analyzePreConsensusBreakoutHunter(
      baseProject({
        liquidityUsd: 0,
        liquidityVerified: false,
        proofOfAlphaExecutionTwin: {
          route: { detected: true, preferredRoute: "MetaMask", status: "Detected" },
          quote: { liquidityUsd: 0 },
          safety: { blockers: [] },
        },
      })
    ),
  ]);

  assert.equal(result.finalSelectionQualified, false);
  assert.notEqual(result.finalSelectionState, "QUALIFIED");
});

test("already-pumped price action cannot receive a top pre-consensus tier", () => {
  const result = analyzePreConsensusBreakoutHunter(baseProject({ priceChange7d: 160 }));

  assert.equal(result.preBreakoutMomentumStage, "ALREADY_PUMPED");
  assert.equal(result.preConsensusCandidateSelected, false);
});

test("native pool detected before aggregator indexing is normalized", async () => {
  const result = await runNativeDiscoveryMesh({
    skipStore: true,
    persist: false,
    events: [
      {
        eventType: NATIVE_EVENT_TYPES.POOL_CREATED,
        chain: "base",
        protocol: "uniswap-v3",
        poolAddress: "0x0000000000000000000000000000000000000abc",
        tokenAddress: "0x0000000000000000000000000000000000000def",
        displayedLiquidityUsd: 40_000,
        independentBuyers: 3,
        buyVolumeUsd: 8_000,
        evidenceConfidence: 70,
      },
      {
        eventType: NATIVE_EVENT_TYPES.LIQUIDITY_EXPANSION,
        chain: "base",
        protocol: "uniswap-v3",
        poolAddress: "0x0000000000000000000000000000000000000abc",
        tokenAddress: "0x0000000000000000000000000000000000000def",
        displayedLiquidityUsd: 95_000,
        liquidityChange: 55_000,
        independentBuyers: 8,
        buyVolumeUsd: 32_000,
        evidenceConfidence: 74,
      },
    ],
  });

  assert.equal(result.candidates[0].normalizedNativePool.poolAddress, "0x0000000000000000000000000000000000000abc");
  assert.ok(result.candidates[0].normalizedNativePool.currentLiquidityUsd >= 95_000);
});

test("quiet accumulation sequence over several scan periods improves persistence", () => {
  const result = analyzePreConsensusBreakoutHunter(
    baseProject({
      signalHistory: [
        { score: 48, liquidityUsd: 180_000 },
        { score: 55, liquidityUsd: 230_000 },
        { score: 64, liquidityUsd: 310_000 },
        { score: 73, liquidityUsd: 420_000 },
      ],
    })
  );

  assert.ok(result.signalPersistenceScore >= 70);
  assert.ok(result.signalAccelerationScore > 60);
});

test("false breakout is classified as failed breakout", () => {
  const result = analyzePreBreakoutMomentum(
    baseProject({
      falseBreakout: true,
      volumeCollapseScore: 85,
      priceChange24h: 42,
    })
  );

  assert.equal(result.preBreakoutMomentumStage, "FAILED_BREAKOUT");
});

test("successful pre-consensus breakout candidate survives final integrity", () => {
  const [result] = analyzeFinalSelectionIntegrityBatch([
    analyzePreConsensusBreakoutHunter(
      baseProject({
        signalHistory: [
          { score: 60, liquidityUsd: 260_000 },
          { score: 70, liquidityUsd: 340_000 },
          { score: 82, liquidityUsd: 420_000 },
        ],
      })
    ),
  ]);

  assert.equal(result.finalSelectionQualified, true);
  assert.equal(result.preConsensusCandidateSelected, true);
  assert.ok(["Exceptional Pre-Consensus Candidate", "High-Conviction Research Candidate"].includes(result.preConsensusTier));
});
