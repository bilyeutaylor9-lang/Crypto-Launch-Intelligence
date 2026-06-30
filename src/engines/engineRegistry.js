// src/engines/engineRegistry.js

export const ENGINE_REGISTRY = {
  discovery: [
    "newTokenDiscoveryEngine",
    "upcomingLaunchDiscoveryEngine",
    "dexPairDiscoveryEngine",
    "launchpadDiscoveryEngine",
    "presaleDiscoveryEngine",
    "ecosystemDiscoveryEngine",
    "testnetDiscoveryEngine",
    "airdropToTokenEngine",
    "cexListingDiscoveryEngine",
    "trendingPairDiscoveryEngine"
  ],

  intelligence: [
    "narrativeEngine",
    "developerActivityEngine",
    "githubQualityEngine",
    "communityGrowthEngine",
    "socialAccelerationEngine",
    "liquidityIntelligenceEngine",
    "holderGrowthEngine",
    "whaleActivityEngine",
    "smartWalletEngine",
    "exchangeProbabilityEngine",
    "catalystEngine",
    "tokenomicsEngine",
    "fundingBackerEngine",
    "partnershipEngine",
    "ecosystemIntegrationEngine"
  ],

  momentum: [
    "baselineEngine",
    "velocityEngine",
    "accelerationEngine",
    "scoreDeltaEngine",
    "momentumShiftEngine",
    "momentumCompressionEngine",
    "volumeExpansionEngine",
    "capitalFlowEngine",
    "buySellPressureEngine",
    "trendChangeEngine"
  ],

  risk: [
    "contractRiskEngine",
    "honeypotRiskEngine",
    "liquidityRiskEngine",
    "ownershipRiskEngine",
    "walletConcentrationEngine",
    "deployerHistoryEngine",
    "fakeVolumeEngine",
    "washTradingEngine",
    "unlockRiskEngine",
    "rugRiskEngine",
    "socialBotRiskEngine",
    "websiteDomainRiskEngine"
  ],

  scoring: [
    "opportunityDiscoveryEngine",
    "alphaScoreEngine",
    "riskAdjustedScoreEngine",
    "confidenceScoreEngine",
    "narrativeScoreEngine",
    "developerScoreEngine",
    "liquidityScoreEngine",
    "communityScoreEngine",
    "momentumScoreEngine",
    "catalystScoreEngine"
  ],

  learning: [
    "alphaDatabaseEngine",
    "historicalComparisonEngine",
    "outcomeTrackerEngine",
    "patternRecognitionEngine",
    "performanceMemoryEngine",
    "signalWeightOptimizerEngine",
    "winnerProfileEngine",
    "failurePatternEngine"
  ],

  reporting: [
    "jsonReportEngine",
    "htmlReportEngine",
    "markdownReportEngine",
    "dashboardEngine",
    "watchlistReportEngine",
    "opportunityCardEngine",
    "riskReportEngine",
    "aiSummaryEngine",
    "alertEngine",
    "dailyDigestEngine"
  ]
};

export function getAllEngines() {
  return Object.values(ENGINE_REGISTRY).flat();
}

export function getEngineCount() {
  return getAllEngines().length;
}
