import test from "node:test";
import assert from "node:assert/strict";

import {
  analyzeProgressiveOpportunityRankingBatch,
  summarizeProgressiveOpportunityRanking,
} from "../src/engines/progressiveOpportunityRankingEngine.js";
import { buildAlphaDashboardV2 } from "../src/reports/alphaDashboardV2ReportEngine.js";

function earlyMover(overrides = {}) {
  return {
    name: "Early Mover",
    symbol: "MOVE",
    chain: "base",
    source: "dexscreener",
    discoverySources: ["dexscreener", "geckoterminal"],
    evidence: [{ source: "dexscreener" }, { source: "geckoterminal" }],
    liquidityUsd: 42_000,
    accelerationScore: 94,
    velocityScore: 90,
    momentumShiftScore: 88,
    liquidityExpansionScore: 86,
    activeLiquidityTruthScore: 78,
    smartWalletArrivalScore: 85,
    smartMoneyAccumulationScore: 82,
    buyPressureScore: 84,
    capitalFlowScore: 81,
    holderGrowthScore: 74,
    organicBuyerScore: 76,
    narrativeHeatScore: 78,
    narrativeForecastScore: 76,
    liveCatalystRadarScore: 72,
    catalystScore: 70,
    developerActivityScore: 68,
    githubProScore: 64,
    relativeStrengthScore: 79,
    marketRankScore: 72,
    identityResolutionScore: 72,
    projectIdentityVerdict: "Identity Resolved",
    contractVerified: true,
    identityVerified: true,
    finalIdentityState: "VERIFIED_CONTRACT",
    instantSafetyStatus: "PASS",
    instantSafetyScore: 84,
    contractRiskScore: 8,
    honeypotRiskScore: 3,
    instantSafetyRiskScore: 9,
    liquidityScore: 76,
    liquidityControlRisk: 12,
    liquidityManipulationRisk: 10,
    sourceTruthScore: 76,
    sourceReliabilityScore: 78,
    institutionalDataProvenanceScore: 80,
    institutionalDataProvenance: {
      components: { sourceAgreement: 78 },
      sourceSummary: { sourceCount: 2, sources: ["dexscreener", "geckoterminal"] },
    },
    holderDistributionScore: 70,
    walletClusterRiskScore: 14,
    insiderDistributionRisk: 18,
    bundledLaunchRiskScore: 16,
    washTradingRiskScore: 12,
    activityAuthenticityRiskScore: 14,
    organicDemandFirewallScore: 72,
    purchaseRouteConfirmed: true,
    executionRouteAvailable: true,
    purchaseRoute: { purchasable: true, preferredRoute: "MetaMask", status: "Available Route Detected" },
    proofOfAlphaExecutionTwin: { route: { detected: true }, quote: { liquidityUsd: 42_000 }, safety: { blockers: [] } },
    proofOfAlphaExecutionTwinScore: 76,
    finalSelectionState: "QUALIFIED",
    finalSelectionQualified: true,
    comparableSampleSize: 8,
    ...overrides,
  };
}

test("progressive ranking always publishes best-available results when non-blocked projects exist", () => {
  const ranked = analyzeProgressiveOpportunityRankingBatch([
    earlyMover({ symbol: "BEST", finalSelectionState: "RESEARCH_ONLY", finalSelectionQualified: false }),
    earlyMover({ symbol: "RUG", honeypotDetected: true }),
  ]);
  const report = summarizeProgressiveOpportunityRanking(ranked);

  assert.equal(report.counts.bestAvailable, 1);
  assert.equal(report.bestAvailableOpportunities[0].symbol, "BEST");
  assert.equal(report.institutionalMoneyRank[0].symbol, "BEST");
  assert.ok(report.institutionalMoneyRank[0].moneyRankScore > 0);
  assert.ok(report.executionReady.some((project) => project.symbol === "BEST"));
  assert.equal(report.blockedProjects[0].symbol, "RUG");
});

test("missing route evidence lowers Trust Score without zeroing Opportunity Score", () => {
  const ranked = analyzeProgressiveOpportunityRankingBatch([
    earlyMover({ symbol: "ROUTE" }),
    earlyMover({
      symbol: "NOROUTE",
      purchaseRouteConfirmed: false,
      executionRouteAvailable: false,
      purchaseRoute: { purchasable: false, status: "Unknown" },
      proofOfAlphaExecutionTwin: { route: { detected: false }, quote: { liquidityUsd: 42_000 }, safety: { blockers: [] } },
      proofOfAlphaExecutionTwinScore: 0,
      finalSelectionState: "RESEARCH_ONLY",
      finalSelectionQualified: false,
    }),
  ]);
  const withRoute = ranked.find((project) => project.symbol === "ROUTE");
  const missingRoute = ranked.find((project) => project.symbol === "NOROUTE");

  assert.ok(missingRoute.progressiveOpportunityScore >= 78);
  assert.ok(missingRoute.trustScore < withRoute.trustScore);
  assert.ok(missingRoute.executionScore < withRoute.executionScore);
  assert.ok(missingRoute.moneyRankScore < withRoute.moneyRankScore);
  assert.notEqual(missingRoute.opportunityRankingTier, "SNIPER_READY");
  assert.ok(missingRoute.missingEvidence.some((item) => item.includes("fresh buy/sell route")));
});

test("hard-blocked projects cannot enter positive opportunity tiers", () => {
  const [blocked] = analyzeProgressiveOpportunityRankingBatch([
    earlyMover({
      symbol: "BAD",
      honeypotDetected: true,
      finalSelectionState: "BLOCKED",
      finalBlockingReasons: ["honeypot detected"],
    }),
  ]);

  assert.equal(blocked.opportunityRankingTier, "BLOCKED");
  assert.equal(blocked.bestAvailableEligible, false);
  assert.equal(blocked.moneyRankEligible, false);
  assert.equal(blocked.moneyRankScore, 0);
  assert.ok(blocked.opportunityHardBlockers.some((reason) => reason.includes("Honeypot")));
});

test("money rank favors executable evidence over unsupported hype", () => {
  const ranked = analyzeProgressiveOpportunityRankingBatch([
    earlyMover({
      symbol: "HYPE",
      accelerationScore: 99,
      velocityScore: 98,
      momentumShiftScore: 97,
      liquidityExpansionScore: 94,
      smartWalletArrivalScore: 95,
      buyPressureScore: 94,
      narrativeHeatScore: 96,
      purchaseRouteConfirmed: false,
      executionRouteAvailable: false,
      purchaseRoute: { purchasable: false, status: "Unknown" },
      proofOfAlphaExecutionTwin: { route: { detected: false }, quote: { liquidityUsd: 42_000 }, safety: { blockers: [] } },
      proofOfAlphaExecutionTwinScore: 0,
      finalSelectionState: "RESEARCH_ONLY",
      finalSelectionQualified: false,
    }),
    earlyMover({
      symbol: "EXEC",
      accelerationScore: 84,
      velocityScore: 82,
      momentumShiftScore: 81,
      smartWalletArrivalScore: 79,
      narrativeHeatScore: 74,
    }),
  ]);

  const hype = ranked.find((project) => project.symbol === "HYPE");
  const executable = ranked.find((project) => project.symbol === "EXEC");

  assert.equal(ranked[0].symbol, "EXEC");
  assert.ok(hype.progressiveOpportunityScore >= executable.progressiveOpportunityScore);
  assert.ok(hype.executionScore < executable.executionScore);
  assert.ok(hype.moneyRankScore < executable.moneyRankScore);
});

test("acceleration can outrank static high-quality but stagnant projects", () => {
  const ranked = analyzeProgressiveOpportunityRankingBatch([
    earlyMover({
      symbol: "FAST",
      finalSelectionState: "RESEARCH_ONLY",
      finalSelectionQualified: false,
      identityVerified: false,
      contractVerified: false,
      finalIdentityState: "PROBABLE_MATCH",
      purchaseRouteConfirmed: false,
      executionRouteAvailable: false,
    }),
    earlyMover({
      symbol: "STATIC",
      accelerationScore: 18,
      velocityScore: 22,
      momentumShiftScore: 20,
      liquidityExpansionScore: 24,
      smartWalletArrivalScore: 18,
      buyPressureScore: 20,
      holderGrowthScore: 25,
      narrativeHeatScore: 24,
      liveCatalystRadarScore: 18,
      relativeStrengthScore: 28,
    }),
  ]);

  assert.equal(ranked[0].symbol, "FAST");
  assert.ok(ranked[0].progressiveOpportunityScore > ranked[1].progressiveOpportunityScore);
});

test("local AI support cannot override deterministic safety gates", () => {
  const [blocked] = analyzeProgressiveOpportunityRankingBatch([
    earlyMover({
      symbol: "AIBLOCK",
      honeypotDetected: true,
      localAIStatus: "COMPLETE",
      localAIVerdict: "EVIDENCE_SUPPORTED",
      localAIAdjustment: 6,
    }),
  ]);

  assert.equal(blocked.opportunityRankingTier, "BLOCKED");
  assert.equal(blocked.localAITrustAdjustment, 0);
});

test("final-qualified and research-only candidates are separated by the progressive ladder", () => {
  const report = summarizeProgressiveOpportunityRanking(
    analyzeProgressiveOpportunityRankingBatch([
      earlyMover({
        symbol: "READY",
        accelerationScore: 98,
        velocityScore: 96,
        momentumShiftScore: 95,
        liquidityExpansionScore: 94,
        activeLiquidityTruthScore: 92,
        smartWalletArrivalScore: 94,
        buyPressureScore: 92,
        holderGrowthScore: 90,
        narrativeHeatScore: 90,
        liveCatalystRadarScore: 88,
        developerActivityScore: 84,
        relativeStrengthScore: 92,
      }),
      earlyMover({
        symbol: "EARLY",
        purchaseRouteConfirmed: false,
        executionRouteAvailable: false,
        finalSelectionState: "RESEARCH_ONLY",
        finalSelectionQualified: false,
      }),
    ])
  );

  assert.equal(report.sniperReady[0].symbol, "READY");
  assert.ok(report.bestAvailableOpportunities.some((project) => project.symbol === "EARLY"));
  assert.notEqual(report.bestAvailableOpportunities.find((project) => project.symbol === "EARLY").tier, "SNIPER_READY");
});

test("dashboard top candidates come from the authoritative progressive ranking", () => {
  const ranked = analyzeProgressiveOpportunityRankingBatch([
    earlyMover({ symbol: "WEIGHT", autoLearningWeightScore: 99, accelerationScore: 25, velocityScore: 25, momentumShiftScore: 25 }),
    earlyMover({ symbol: "AUTH", autoLearningWeightScore: 10, accelerationScore: 96, velocityScore: 94, momentumShiftScore: 93 }),
  ]);
  const dashboard = buildAlphaDashboardV2(ranked);

  assert.equal(dashboard.topCandidates[0].symbol, "AUTH");
  assert.equal(dashboard.bestAvailableOpportunities[0].symbol, "AUTH");
  assert.equal(dashboard.institutionalMoneyRank[0].symbol, "AUTH");
  assert.ok(dashboard.executionReady.length >= 1);
});
