import test from "node:test";
import assert from "node:assert/strict";

import {
  analyzeAutonomousCausalAlphaNetwork,
  analyzeAutonomousCausalAlphaNetworkBatch,
} from "../src/engines/autonomousCausalAlphaNetworkEngine.js";
import { buildAutonomousCausalAlphaNetworkReport } from "../src/reports/autonomousCausalAlphaNetworkReportEngine.js";

const emptyLake = {
  projects: {},
  indexes: {
    eventTypes: {},
    sources: {},
    sequences: {},
  },
};

test("autonomous causal alpha network arms underrecognized causal sequences", () => {
  const result = analyzeAutonomousCausalAlphaNetwork(
    {
      name: "Quiet Builders",
      symbol: "QUIET",
      chain: "base",
      address: "0xquiet",
      pairAddress: "0xpool",
      identityVerified: true,
      contractVerified: true,
      purchaseRouteConfirmed: true,
      executionRouteAvailable: true,
      liquidityVerified: true,
      discoverySources: ["dexscreener", "github", "roadmap", "native-discovery", "coingecko", "defillama"],
      sourceTruthScore: 90,
      sourceReliabilityScore: 88,
      dataConfidenceScore: 86,
      proofScore: 88,
      identityResolutionScore: 92,
      instantSafetyStatus: "PASS",
      instantSafetyScore: 88,
      deployerReputationScore: 80,
      githubProScore: 88,
      developerActivityScore: 84,
      liquidityUsd: 1_500_000,
      liquidityScore: 82,
      liquidityExpansionScore: 86,
      activeLiquidityTruthScore: 83,
      smartMoneyAccumulationScore: 84,
      smartWalletScore: 80,
      walletClusterRiskScore: 10,
      organicBuyerScore: 78,
      buyerRetentionScore: 76,
      communityGrowthScore: 72,
      holderGrowthScore: 74,
      liveCatalystRadarScore: 82,
      roadmapProfitabilityScore: 80,
      catalystCalendarScore: 78,
      tokenomicsScore: 82,
      tokenUnlockRiskScore: 12,
      vestingPressureScore: 10,
      narrativeHeatScore: 74,
      narrativeForecastScore: 78,
      xSocialScore: 34,
      priceChange24h: 4,
      priceChange7d: 6,
      riskScore: 14,
      trapRiskScore: 8,
    },
    { eventLake: emptyLake }
  );

  assert.equal(result.autonomousCausalProjectState, "ARMED");
  assert.equal(result.autonomousCausalNetworkVerdict, "Causal Network Armed");
  assert.ok(result.autonomousCausalNetworkScore >= 78);
  assert.equal(result.causalEvidenceFragility, "Low");
  assert.ok(result.autonomousCausalAlphaNetwork.pointInTimeEvents.length >= 7);
  assert.ok(result.autonomousCausalAlphaNetwork.graph.nodes.length >= 7);
  assert.ok(result.autonomousCausalAlphaNetwork.hypothesis.confirmations.length > 0);
  assert.ok(result.autonomousCausalAlphaNetwork.researchAgents.some((agent) => agent.agent === "Bear-Case Investigator"));
});

test("autonomous causal alpha network blocks fragile hype and risk sequences", () => {
  const result = analyzeAutonomousCausalAlphaNetwork(
    {
      name: "Loud Pump",
      symbol: "LOUD",
      chain: "solana",
      discoverySources: ["x-social"],
      sourceTruthScore: 20,
      sourceReliabilityScore: 22,
      dataConfidenceScore: 24,
      proofScore: 18,
      narrativeHeatScore: 90,
      xSocialScore: 92,
      priceChange24h: 180,
      priceChange7d: 240,
      liquidityUsd: 40000,
      liquidityScore: 20,
      githubProScore: 0,
      developerActivityScore: 0,
      smartMoneyAccumulationScore: 22,
      organicBuyerScore: 16,
      liveCatalystRadarScore: 18,
      tokenUnlockRiskScore: 76,
      vestingPressureScore: 80,
      walletClusterRiskScore: 84,
      washTradingRiskScore: 88,
      trapRiskScore: 90,
      riskScore: 86,
      prePump: { status: "ALREADY_PUMPED" },
    },
    { eventLake: emptyLake }
  );

  assert.notEqual(result.autonomousCausalProjectState, "ARMED");
  assert.equal(result.autonomousCausalNetworkVerdict, "Causal Network Block");
  assert.ok(result.autonomousCausalAlphaNetwork.researchAgents.some((agent) => agent.agent === "Bear-Case Investigator" && agent.verdict === "Block"));
  assert.ok(result.autonomousCausalAlphaNetwork.causalSequence.manipulationWarning);
});

test("autonomous causal network report summarizes ranked projects", () => {
  const results = analyzeAutonomousCausalAlphaNetworkBatch(
    [
      {
        name: "Builder One",
        symbol: "ONE",
        chain: "base",
        address: "0xone",
        discoverySources: ["github", "roadmap", "dexscreener", "coingecko"],
        sourceTruthScore: 86,
        sourceReliabilityScore: 82,
        dataConfidenceScore: 82,
        proofScore: 80,
        identityResolutionScore: 88,
        instantSafetyStatus: "PASS",
        instantSafetyScore: 84,
        githubProScore: 82,
        developerActivityScore: 84,
        liquidityUsd: 900000,
        liquidityScore: 78,
        liquidityExpansionScore: 78,
        activeLiquidityTruthScore: 75,
        smartMoneyAccumulationScore: 76,
        organicBuyerScore: 72,
        buyerRetentionScore: 70,
        liveCatalystRadarScore: 76,
        tokenomicsScore: 76,
        riskScore: 15,
        trapRiskScore: 10,
      },
    ]
  );
  const report = buildAutonomousCausalAlphaNetworkReport(results);

  assert.equal(report.name, "Autonomous Causal Alpha Intelligence Network");
  assert.equal(report.topProjects.length, 1);
  assert.ok(report.topProjects[0].graph.events > 0);
  assert.ok(report.eventSchema.eventId);
});
