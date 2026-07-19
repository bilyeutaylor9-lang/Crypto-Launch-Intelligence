import test from "node:test";
import assert from "node:assert/strict";

import {
  analyzeSevenDayTenXResearch,
  analyzeSevenDayTenXResearchBatch,
  summarizeSevenDayTenXResearch,
} from "../src/engines/sevenDayTenXResearchEngine.js";

const TOKEN = "0x0000000000000000000000000000000000000a11";
const POOL = "0x0000000000000000000000000000000000000b11";

function catalystDate(daysFromNow = 5) {
  return new Date(Date.now() + daysFromNow * 86400000).toISOString();
}

function akeStyleProject(overrides = {}) {
  return {
    name: "Alpha Keeper",
    symbol: "AKE",
    chain: "base",
    contractAddress: TOKEN,
    tokenAddress: TOKEN,
    poolAddress: POOL,
    pairAddress: POOL,
    source: "dexscreener",
    discoverySources: ["dexscreener", "geckoterminal", "github-project-discovery", "native-discovery-mesh"],
    finalSelectionState: "QUALIFIED",
    finalIntegrityScore: 86,
    finalIdentityState: "VERIFIED_CONTRACT",
    identityVerified: true,
    contractVerified: true,
    chainVerified: true,
    liquidityVerified: true,
    purchaseRouteConfirmed: true,
    executionRouteAvailable: true,
    executionStatus: "VERIFIED",
    priceUsd: 0.08,
    priceChange24h: 12,
    priceChange7d: 38,
    circulatingMarketCapUsd: 1_800_000,
    marketCap: 1_800_000,
    fdv: 8_500_000,
    liquidityUsd: 180_000,
    dexLiquidityUsd: 180_000,
    stableExitLiquidityUsd: 90_000,
    volume24h: 250_000,
    accelerationScore: 84,
    earlyBreakoutScore: 82,
    preBreakoutMomentumScore: 82,
    momentumShiftScore: 80,
    momentumCompressionScore: 76,
    volatilityExpansionScore: 70,
    relativeStrengthScore: 78,
    breakoutBrainScore: 82,
    breakoutProbabilitySoon: 62,
    prePump: { score: 76, status: "EARLY_SETUP" },
    prePumpPatternScore: 74,
    liquidityExpansionScore: 84,
    activeLiquidityTruthScore: 82,
    liquidityControlSafetyScore: 92,
    liquidityControlRiskScore: 8,
    organicBuyerScore: 82,
    buyerRetentionScore: 78,
    buyPressureScore: 80,
    holderGrowthScore: 72,
    organicEconomicIntegrityScore: 84,
    smartWalletArrivalScore: 80,
    smartWalletScore: 78,
    smartWalletPerformanceScore: 76,
    smartMoneyAccumulationScore: 82,
    smartMoneyRotationScore: 72,
    capitalFlowScore: 74,
    liveCatalystRadarScore: 78,
    catalystCalendarScore: 76,
    catalystScore: 74,
    roadmapProfitabilityScore: 72,
    exchangeProbabilityScore: 58,
    narrativeForecastScore: 74,
    narrativeHeatScore: 72,
    sourceTruthScore: 82,
    sourceReliabilityScore: 80,
    dataConfidenceScore: 78,
    evidenceQualityScore: 76,
    opportunityEvidenceCoverage: 80,
    sniperEvidenceConfidence: 84,
    instantSafetyStatus: "PASS",
    instantSafetyScore: 92,
    contractAuthoritySafetyScore: 94,
    contractAuthorityRiskScore: 6,
    contractSafetyVerified: true,
    securityEvidenceStatus: "EVIDENCE_AVAILABLE",
    sniperIntegrityScore: 88,
    riskScore: 12,
    trapRiskScore: 8,
    sellPressureScore: 18,
    washTradingRiskScore: 4,
    walletClusterRiskScore: 10,
    deployerRiskScore: 8,
    liveCatalystEvents: [
      {
        type: "Mainnet rollout",
        expectedDate: catalystDate(4),
        score: 80,
        verificationSources: ["official docs"],
      },
    ],
    smallCapHunter: {
      purchaseRoute: {
        purchasable: true,
        preferredRoute: "MetaMask",
        status: "Available Route Detected",
      },
    },
    proofOfAlphaExecutionTwin: {
      route: { detected: true, preferredRoute: "MetaMask" },
      quote: { liquidityUsd: 180_000 },
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

test("7-day asymmetric engine selects a clean AKE-style small-cap setup", () => {
  const [result] = analyzeSevenDayTenXResearchBatch([akeStyleProject()]);

  assert.equal(result.sevenDayTenXSelected, true);
  assert.equal(result.sevenDayTenXSelectionRank, 1);
  assert.ok(result.sevenDayTenXScore >= 74);
  assert.ok(result.sevenDayTenXModeledScenarioPct > 0);
  assert.ok(result.sevenDayTenXModeledScenarioPct <= 24);
  assert.equal(result.sevenDayTenXBlockers.length, 0);
  assert.match(result.sevenDayTenX.disclaimer, /not financial advice/i);
});

test("7-day asymmetric engine blocks late fake-volume moves", () => {
  const result = analyzeSevenDayTenXResearch(
    akeStyleProject({
      symbol: "FAKE",
      priceChange24h: 145,
      priceChange7d: 310,
      organicBuyerScore: 12,
      buyerRetentionScore: 8,
      smartWalletArrivalScore: 0,
      smartMoneyAccumulationScore: 0,
      washTradingRiskScore: 92,
      activityAuthenticityRiskScore: 88,
      trapRiskScore: 74,
    })
  );

  assert.equal(result.sevenDayTenXSelectedEligible, false);
  assert.ok(result.sevenDayTenXBlockers.some((blocker) => /Wash trading|fake activity/i.test(blocker)));
  assert.ok(result.sevenDayTenXPenaltyTotal > 20);
});

test("7-day asymmetric report keeps best-available watchlist separate from selected picks", () => {
  const projects = analyzeSevenDayTenXResearchBatch([
    akeStyleProject(),
    akeStyleProject({
      symbol: "NOROUTE",
      purchaseRouteConfirmed: false,
      executionRouteAvailable: false,
      executionStatus: "UNKNOWN",
      smallCapHunter: { purchaseRoute: { purchasable: false } },
      proofOfAlphaExecutionTwin: { route: { detected: false } },
    }),
  ]);
  const report = summarizeSevenDayTenXResearch(projects);

  assert.equal(report.selectedCount, 1);
  assert.equal(report.selected[0].symbol, "AKE");
  assert.ok(report.bestAvailableWatchlist.some((project) => project.symbol === "NOROUTE"));
  assert.ok(report.bestAvailableWatchlist.find((project) => project.symbol === "NOROUTE").blockers.length > 0);
});
