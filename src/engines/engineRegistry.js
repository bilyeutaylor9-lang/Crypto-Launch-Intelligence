// src/engines/engineRegistry.js

export const ENGINE_REGISTRY = [

  // =========================
  // DISCOVERY
  // =========================

  {
    id: "newTokenDiscovery",
    category: "discovery",
    engine: "newTokenDiscoveryEngine",
    enabled: true,
    weight: 1.0,
    priority: 10
  },

  {
    id: "upcomingLaunch",
    category: "discovery",
    engine: "upcomingLaunchDiscoveryEngine",
    enabled: true,
    weight: 1.0,
    priority: 20
  },

  {
    id: "launchpad",
    category: "discovery",
    engine: "launchpadDiscoveryEngine",
    enabled: true,
    weight: 1.1,
    priority: 30
  },

  {
    id: "presale",
    category: "discovery",
    engine: "presaleDiscoveryEngine",
    enabled: true,
    weight: 1.2,
    priority: 40
  },

  // =========================
  // INTELLIGENCE
  // =========================

  {
    id: "richToken",
    category: "intelligence",
    engine: "richTokenIntelligenceEngine",
    enabled: true,
    weight: 2.0,
    priority: 100
  },

  {
    id: "narrative",
    category: "intelligence",
    engine: "narrativeEngine",
    enabled: true,
    weight: 1.6,
    priority: 110
  },

  {
    id: "narrativeForecast",
    category: "intelligence",
    engine: "narrativeForecastEngine",
    enabled: true,
    weight: 1.7,
    priority: 120
  },

  {
    id: "developerActivity",
    category: "intelligence",
    engine: "developerActivityEngine",
    enabled: true,
    weight: 1.5,
    priority: 130
  },

  {
    id: "githubQuality",
    category: "intelligence",
    engine: "githubQualityEngine",
    enabled: true,
    weight: 1.4,
    priority: 140
  },

  {
    id: "communityGrowth",
    category: "intelligence",
    engine: "communityGrowthEngine",
    enabled: true,
    weight: 1.2,
    priority: 150
  },

  {
    id: "socialAcceleration",
    category: "intelligence",
    engine: "socialAccelerationEngine",
    enabled: true,
    weight: 1.3,
    priority: 160
  },

  {
    id: "liquidity",
    category: "intelligence",
    engine: "liquidityIntelligenceEngine",
    enabled: true,
    weight: 1.5,
    priority: 170
  },

  {
    id: "holderGrowth",
    category: "intelligence",
    engine: "holderGrowthEngine",
    enabled: true,
    weight: 1.2,
    priority: 180
  },

  {
    id: "whaleActivity",
    category: "intelligence",
    engine: "whaleActivityEngine",
    enabled: true,
    weight: 1.7,
    priority: 190
  },

  {
    id: "smartWallet",
    category: "intelligence",
    engine: "smartWalletEngine",
    enabled: true,
    weight: 2.0,
    priority: 200
  },

  {
    id: "smartWalletPerformance",
    category: "intelligence",
    engine: "smartWalletPerformanceEngine",
    enabled: true,
    weight: 2.1,
    priority: 210
  },

  {
    id: "smartMoneyAccumulation",
    category: "intelligence",
    engine: "smartMoneyAccumulationEngine",
    enabled: true,
    weight: 2.2,
    priority: 220
  },

  {
    id: "exchangeProbability",
    category: "intelligence",
    engine: "exchangeProbabilityEngine",
    enabled: true,
    weight: 1.8,
    priority: 230
  },

  {
    id: "catalyst",
    category: "intelligence",
    engine: "catalystEngine",
    enabled: true,
    weight: 1.5,
    priority: 240
  },

  {
    id: "catalystCalendar",
    category: "intelligence",
    engine: "catalystCalendarEngine",
    enabled: true,
    weight: 1.8,
    priority: 250
  },

  {
    id: "tokenomics",
    category: "intelligence",
    engine: "tokenomicsEngine",
    enabled: true,
    weight: 1.6,
    priority: 260
  },

  {
    id: "fundingBackers",
    category: "intelligence",
    engine: "fundingBackerEngine",
    enabled: true,
    weight: 1.8,
    priority: 270
  },

  {
    id: "partnerships",
    category: "intelligence",
    engine: "partnershipEngine",
    enabled: true,
    weight: 1.6,
    priority: 280
  },

  {
    id: "ecosystemIntegration",
    category: "intelligence",
    engine: "ecosystemIntegrationEngine",
    enabled: true,
    weight: 1.5,
    priority: 290
  }

  // Continue adding momentum, risk, learning,
  // reporting, dashboard, AI, and future engines
  // in the same structure.
];

export function getEnabledEngines() {
  return ENGINE_REGISTRY.filter(e => e.enabled);
}

export function getCategory(category) {
  return ENGINE_REGISTRY.filter(e => e.category === category);
}

export function getExecutionOrder() {
  return [...ENGINE_REGISTRY].sort(
    (a, b) => a.priority - b.priority
  );
}

export function getEngineCount() {
  return ENGINE_REGISTRY.length;
}
