import test from "node:test";
import assert from "node:assert/strict";
import {
  analyzeRouteAccessibilityBatch,
  summarizeRouteAccessibility,
} from "../src/engines/routeAccessibilityEngine.js";
import { analyzeSmallCapHunter } from "../src/engines/smallCapHunterEngine.js";

const NOW = new Date().toISOString();
const EVM_TOKEN = "0x1111111111111111111111111111111111111111";
const EVM_POOL = "0x2222222222222222222222222222222222222222";
const SOL_TOKEN = "So11111111111111111111111111111111111111112";
const SOL_POOL = "11111111111111111111111111111111";

function route(overrides = {}) {
  return {
    venue: "Uniswap",
    routeType: "DEX",
    chain: "base",
    walletFamily: "Rabby",
    tokenAddress: EVM_TOKEN,
    poolAddress: EVM_POOL,
    buyRouteAvailable: true,
    sellRouteAvailable: true,
    verificationStatus: "VERIFIED",
    liquidityUsd: 300_000,
    estimatedRoundTripSlippagePct: 1.2,
    quoteTimestamp: NOW,
    source: "test-route",
    ...overrides,
  };
}

function project(overrides = {}) {
  return {
    symbol: "TEST",
    name: "Test Project",
    chain: "base",
    tokenAddress: EVM_TOKEN,
    poolAddress: EVM_POOL,
    marketOpportunityScore: 70,
    sourceTruthScore: 72,
    proofScore: 68,
    evidenceQualityScore: 70,
    dataConfidenceScore: 66,
    githubProScore: 62,
    prePump: { score: 65 },
    prePumpPatternScore: 62,
    narrativeHeatScore: 68,
    catalystCalendarScore: 64,
    breakoutBrainScore: 66,
    smartWalletArrivalScore: 60,
    organicBuyerScore: 66,
    activeLiquidityTruthScore: 64,
    marketCap: 18_000_000,
    liquidityUsd: 300_000,
    volume24h: 110_000,
    executionRoutes: [route()],
    ...overrides,
  };
}

test("strong Solana Phantom/Jupiter project is not rejected because MetaMask is unsupported", () => {
  const [result] = analyzeRouteAccessibilityBatch([
    project({
      symbol: "SOLX",
      chain: "solana",
      tokenAddress: SOL_TOKEN,
      poolAddress: SOL_POOL,
      executionRoutes: [
        route({
          venue: "Jupiter",
          routeType: "DEX_AGGREGATOR",
          chain: "solana",
          walletFamily: "Phantom",
          tokenAddress: SOL_TOKEN,
          poolAddress: SOL_POOL,
        }),
      ],
    }),
  ]);

  assert.equal(result.researchEligible, true);
  assert.equal(result.qualityQualified, true);
  assert.equal(result.metamaskCompatible, false);
  assert.equal(result.executionReady, true);
  assert.equal(result.userAccessible, true);
  assert.equal(result.requiredWallet, "Phantom");
  assert.equal(result.accessibilityLane, "DEX_AGGREGATOR_ROUTE");
});

test("legitimate DEX-only project remains research eligible", () => {
  const [result] = analyzeRouteAccessibilityBatch([
    project({ symbol: "DEXO", executionRoutes: [route({ venue: "Aerodrome" })] }),
  ]);

  assert.equal(result.researchEligible, true);
  assert.equal(result.qualityQualified, true);
  assert.equal(result.coinbaseAvailable, false);
  assert.equal(result.alternativeRouteAvailable, true);
  assert.equal(result.executionReady, true);
});

test("Coinbase availability does not increase small-cap project-quality score", () => {
  const [coinbase, dexOnly] = analyzeRouteAccessibilityBatch([
    project({
      symbol: "EASY",
      executionRoutes: [route({ venue: "Coinbase", routeType: "CEX", chain: null, walletFamily: "Exchange Account", marketPair: "EASY-USD", poolAddress: null })],
    }),
    project({
      symbol: "DEXQ",
      executionRoutes: [route({ venue: "Raydium", routeType: "DEX", chain: "solana", walletFamily: "Phantom", tokenAddress: SOL_TOKEN, poolAddress: SOL_POOL })],
    }),
  ]);

  const easy = analyzeSmallCapHunter(coinbase);
  const dex = analyzeSmallCapHunter(dexOnly);

  assert.equal(easy.smallCapHunterScore, dex.smallCapHunterScore);
});

test("weak Coinbase project cannot outrank stronger project by opportunity solely because it is easier to buy", () => {
  const [strong, weak] = analyzeRouteAccessibilityBatch([
    project({
      symbol: "STRONG",
      marketOpportunityScore: 91,
      executionRoutes: [
        route({
          venue: "Jupiter",
          routeType: "DEX_AGGREGATOR",
          chain: "solana",
          walletFamily: "Phantom",
          tokenAddress: SOL_TOKEN,
          poolAddress: SOL_POOL,
        }),
      ],
    }),
    project({
      symbol: "EASY",
      marketOpportunityScore: 58,
      executionRoutes: [route({ venue: "Coinbase", routeType: "CEX", chain: null, walletFamily: "Exchange Account", marketPair: "EASY-USD", poolAddress: null })],
    }),
  ]);
  const summary = summarizeRouteAccessibility([strong, weak]);

  assert.equal(summary.topProjectsByOpportunity[0].symbol, "STRONG");
  assert.equal(summary.topProjectsByUserAccessibility[0].symbol, "EASY");
});

test("alternative CEX and chain-native DEX routes are detected", () => {
  const [kraken, uniswap] = analyzeRouteAccessibilityBatch([
    project({
      symbol: "KRAK",
      executionRoutes: [route({ venue: "Kraken", routeType: "CEX", chain: null, walletFamily: "Exchange Account", marketPair: "KRAK-USD", poolAddress: null })],
    }),
    project({ symbol: "RAB", executionRoutes: [route({ venue: "Uniswap", walletFamily: "Rabby" })] }),
  ]);

  assert.equal(kraken.canonicalRoutes[0].venue, "Kraken");
  assert.equal(kraken.executionReady, true);
  assert.equal(uniswap.canonicalRoutes[0].venue, "Uniswap");
  assert.equal(uniswap.requiredWallet, "Rabby");
  assert.equal(uniswap.executionReady, true);
});

test("bridge-required projects stay research eligible, while high-risk bridges block execution readiness", () => {
  const [available, risky] = analyzeRouteAccessibilityBatch([
    project({
      symbol: "BRG",
      executionRoutes: [route({ bridgeRequired: true, bridgeProvider: "LayerZero", bridgeRisk: 30 })],
    }),
    project({
      symbol: "RISKBRG",
      executionRoutes: [route({ bridgeRequired: true, bridgeProvider: "UnknownBridge", bridgeRisk: 90 })],
    }),
  ]);

  assert.equal(available.researchEligible, true);
  assert.equal(available.executionReady, true);
  assert.equal(available.accessibilityLane, "BRIDGE_REQUIRED");
  assert.equal(risky.researchEligible, true);
  assert.equal(risky.executionReady, false);
  assert.equal(risky.canonicalRoutes[0].bridgeState, "WRAPPED_ASSET_RISK");
});

test("region restrictions affect accessibility instead of project quality", () => {
  const [result] = analyzeRouteAccessibilityBatch([
    project({
      symbol: "REG",
      executionRoutes: [route({ venue: "Bybit", routeType: "CEX", chain: null, walletFamily: "Exchange Account", marketPair: "REG-USDT", poolAddress: null, supportedRegions: ["EU"] })],
    }),
  ], {
    preferences: {
      preferredExchanges: ["Coinbase", "Kraken"],
      preferredWallets: ["MetaMask", "Rabby", "Phantom"],
      supportedChains: ["base", "solana"],
      allowDexRoutes: true,
      allowCexRoutes: true,
      allowBridgedRoutes: true,
      allowNewWalletSetup: true,
      maxRouteHops: 3,
      maxBridgeRisk: 55,
      maxEstimatedSlippagePct: 8,
      maxTotalRouteCostUsd: 50,
      userRegion: "US",
      userState: "AZ",
    },
  });

  assert.equal(result.qualityQualified, true);
  assert.equal(result.executionReady, false);
  assert.equal(result.userAccessible, false);
  assert.equal(result.accessibilityLane, "REGION_RESTRICTED");
  assert.ok(result.accessibilityWarnings.some((warning) => warning.includes("Region restriction")));
});

test("missing sell route prevents execution readiness", () => {
  const [result] = analyzeRouteAccessibilityBatch([
    project({ symbol: "NOSALE", executionRoutes: [route({ sellRouteAvailable: false })] }),
  ]);

  assert.equal(result.researchEligible, true);
  assert.equal(result.executionReady, false);
  assert.ok(result.missingRouteEvidence.some((item) => item.includes("Sell route")));
});

test("preferred settings cannot alter fundamental small-cap quality score or safety score", () => {
  const baseProject = project({ symbol: "PREF", executionRoutes: [route({ venue: "Uniswap", walletFamily: "Rabby" })] });
  const [rabbyPreferred] = analyzeRouteAccessibilityBatch([baseProject], {
    preferences: {
      preferredExchanges: ["Kraken"],
      preferredWallets: ["Rabby"],
      supportedChains: ["base"],
      allowDexRoutes: true,
      allowCexRoutes: true,
      allowBridgedRoutes: true,
      allowNewWalletSetup: true,
      maxRouteHops: 3,
      maxBridgeRisk: 55,
      maxEstimatedSlippagePct: 8,
      maxTotalRouteCostUsd: 50,
      userRegion: "US",
      userState: "AZ",
    },
  });
  const [phantomPreferred] = analyzeRouteAccessibilityBatch([baseProject], {
    preferences: {
      preferredExchanges: ["Coinbase"],
      preferredWallets: ["Phantom"],
      supportedChains: ["base"],
      allowDexRoutes: true,
      allowCexRoutes: true,
      allowBridgedRoutes: true,
      allowNewWalletSetup: true,
      maxRouteHops: 3,
      maxBridgeRisk: 55,
      maxEstimatedSlippagePct: 8,
      maxTotalRouteCostUsd: 50,
      userRegion: "US",
      userState: "AZ",
    },
  });

  const rabbyScore = analyzeSmallCapHunter(rabbyPreferred);
  const phantomScore = analyzeSmallCapHunter(phantomPreferred);

  assert.equal(rabbyScore.smallCapHunterScore, phantomScore.smallCapHunterScore);
  assert.equal(rabbyScore.smallCapRiskScore, phantomScore.smallCapRiskScore);
  assert.notEqual(rabbyPreferred.routeAccessibility.accessibilityScore, phantomPreferred.routeAccessibility.accessibilityScore);
});

test("every execution-ready route has a fresh buy and sell path", () => {
  const staleTimestamp = new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString();
  const results = analyzeRouteAccessibilityBatch([
    project({ symbol: "FRESH", executionRoutes: [route()] }),
    project({ symbol: "STALE", executionRoutes: [route({ quoteTimestamp: staleTimestamp })] }),
  ]);

  const executionReadyRoutes = results.flatMap((item) => item.canonicalRoutes.filter((candidateRoute) => item.executionReady && candidateRoute.verificationStatus === "VERIFIED"));

  assert.equal(results.find((item) => item.symbol === "FRESH").executionReady, true);
  assert.equal(results.find((item) => item.symbol === "STALE").executionReady, false);
  assert.ok(executionReadyRoutes.every((candidateRoute) =>
    candidateRoute.buyRouteAvailable &&
    candidateRoute.sellRouteAvailable &&
    candidateRoute.quoteAgeSeconds <= 21_600
  ));
});
