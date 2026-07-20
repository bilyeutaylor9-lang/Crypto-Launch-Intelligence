import test from "node:test";
import assert from "node:assert/strict";

import {
  analyzePreBreakoutRadar,
  analyzePreBreakoutRadarBatch,
  summarizePreBreakoutRadar,
} from "../src/engines/preBreakoutRadarEngine.js";

const TOKEN = "0x0000000000000000000000000000000000000a12";
const POOL = "0x0000000000000000000000000000000000000b12";

function akeStyleProject(overrides = {}) {
  return {
    name: "Akedo Style",
    symbol: "AKE",
    chain: "base",
    contractAddress: TOKEN,
    tokenAddress: TOKEN,
    poolAddress: POOL,
    pairAddress: POOL,
    source: "dexscreener",
    discoverySources: ["dexscreener", "geckoterminal", "github-project-discovery", "native-discovery-mesh"],
    finalSelectionState: "QUALIFIED",
    finalIdentityState: "VERIFIED_CONTRACT",
    finalIntegrityScore: 88,
    identityVerified: true,
    contractVerified: true,
    chainVerified: true,
    liquidityVerified: true,
    purchaseRouteConfirmed: true,
    executionRouteAvailable: true,
    executionStatus: "VERIFIED",
    circulatingMarketCapUsd: 2_400_000,
    marketCap: 2_400_000,
    dexLiquidityUsd: 220_000,
    stableExitLiquidityUsd: 120_000,
    liquidityUsd: 220_000,
    volume24h: 310_000,
    priceChange24h: 9,
    priceChange7d: 26,
    attentionGapScore: 78,
    informationAdvantageScore: 76,
    quietAccumulationScore: 82,
    preConsensusOpportunityScore: 80,
    developerActivityScore: 76,
    githubProScore: 74,
    preBreakoutMomentumScore: 82,
    momentumCompressionScore: 76,
    momentumShiftScore: 78,
    earlyBreakoutScore: 76,
    volatilityExpansionScore: 70,
    liquidityExpansionScore: 82,
    prePump: { score: 76, status: "EARLY_SETUP" },
    prePumpPatternScore: 74,
    organicBuyerScore: 82,
    organicBuyerClassifierScore: 78,
    buyerRetentionScore: 76,
    organicDemandIntegrityScore: 80,
    organicEconomicIntegrityScore: 84,
    buyPressureScore: 78,
    holderGrowthScore: 72,
    activeLiquidityTruthScore: 84,
    smartWalletArrivalScore: 80,
    smartMoneyAccumulationScore: 82,
    smartWalletPerformanceScore: 76,
    smartWalletScore: 74,
    capitalFlowScore: 76,
    liveCatalystRadarScore: 78,
    catalystCalendarScore: 76,
    roadmapProfitabilityScore: 74,
    exchangeProbabilityScore: 60,
    catalystScore: 72,
    narrativeForecastScore: 72,
    narrativeHeatScore: 70,
    sourceTruthScore: 82,
    sourceReliabilityScore: 80,
    dataConfidenceScore: 78,
    evidenceQualityScore: 76,
    opportunityEvidenceCoverage: 80,
    sniperEvidenceConfidence: 82,
    instantSafetyStatus: "PASS",
    instantSafetyScore: 92,
    contractAuthoritySafetyScore: 94,
    contractAuthorityRiskScore: 6,
    liquidityControlSafetyScore: 90,
    liquidityControlRiskScore: 8,
    sniperIntegrityScore: 86,
    riskScore: 12,
    trapRiskScore: 8,
    sellPressureScore: 16,
    washTradingRiskScore: 4,
    walletClusterRiskScore: 10,
    deployerRiskScore: 8,
    proofOfAlphaExecutionTwinScore: 82,
    executionProofScore: 84,
    proofOfAlphaExecutionTwin: {
      route: { detected: true, preferredRoute: "MetaMask", status: "Detected" },
      quote: { liquidityUsd: 220_000 },
      safety: { blockers: [] },
    },
    evidence: [
      { engine: "sourceTruth", source: "dexscreener", family: "market", score: 82 },
      { engine: "github", source: "github-project-discovery", family: "developer", score: 78 },
      { engine: "native", source: "native-discovery-mesh", family: "chain", score: 80 },
    ],
    ...overrides,
  };
}

test("pre-breakout radar arms a clean AKE-style setup with proof and execution", () => {
  const [result] = analyzePreBreakoutRadarBatch([akeStyleProject()]);

  assert.equal(result.preBreakoutRadarLane, "ARMED");
  assert.equal(result.preBreakoutRadarSelected, true);
  assert.equal(result.preBreakoutRadarSelectionRank, 1);
  assert.ok(result.preBreakoutRadarScore >= 78);
  assert.equal(result.preBreakoutRadarBlockers.length, 0);
  assert.match(result.preBreakoutRadar.disclaimer, /not financial advice/i);
});

test("pre-breakout radar blocks late unsafe runners instead of chasing them", () => {
  const result = analyzePreBreakoutRadar(
    akeStyleProject({
      symbol: "CHASE",
      priceChange24h: 110,
      priceChange7d: 260,
      prePump: { score: 92, status: "ALREADY_PUMPED" },
      preBreakoutMomentumStage: "ALREADY_PUMPED",
      organicBuyerScore: 12,
      buyerRetentionScore: 8,
      washTradingRiskScore: 91,
      activityAuthenticityRiskScore: 88,
      trapRiskScore: 82,
    })
  );

  assert.equal(result.preBreakoutRadarLane, "BLOCKED");
  assert.equal(result.preBreakoutRadarSelectedEligible, false);
  assert.equal(result.preBreakoutRadarProbability, 0);
  assert.ok(result.preBreakoutRadarBlockers.some((reason) => /already pumped|wash trading|trap risk/i.test(reason)));
});

test("high signal with partial route stays watchlisted and cannot become armed", () => {
  const [result] = analyzePreBreakoutRadarBatch([
    akeStyleProject({
      symbol: "NOROUTE",
      purchaseRouteConfirmed: false,
      executionRouteAvailable: false,
      executionStatus: "UNKNOWN",
      proofOfAlphaExecutionTwin: {
        route: { detected: true, preferredRoute: "MetaMask", status: "Detected" },
        quote: { liquidityUsd: 0 },
        safety: { blockers: [] },
      },
      smallCapHunter: {
        purchaseRoute: {
          purchasable: true,
          preferredRoute: "MetaMask",
          status: "Available Route Detected",
        },
      },
    }),
  ]);

  assert.equal(result.preBreakoutRadarSelected, false);
  assert.equal(result.preBreakoutRadarLane, "WATCH");
  assert.ok(result.preBreakoutRadarMissingEvidence.includes("verified fresh buy/sell execution route"));
  assert.equal(result.preBreakoutRadarWatchRank, 1);
});

test("pre-breakout radar summary does not force armed candidates", () => {
  const projects = analyzePreBreakoutRadarBatch([
    akeStyleProject({
      symbol: "BLOCKED",
      verifiedScam: true,
      honeypotDetected: true,
    }),
  ]);
  const report = summarizePreBreakoutRadar(projects);

  assert.equal(report.armedCount, 0);
  assert.equal(report.blockedCount, 1);
  assert.equal(report.armedCandidates.length, 0);
  assert.match(report.disclaimer, /not financial advice/i);
});
