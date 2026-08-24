import test from "node:test";
import assert from "node:assert/strict";

import { buildRealtimeEventFabric } from "../src/production/realTimeMarketNervousSystem.js";
import { analyzeMicrostructure } from "../src/production/marketMicrostructureBrain.js";
import { buildEconomicEntityGraph } from "../src/production/economicEntityGraphV2.js";
import { predictStateTransition } from "../src/production/stateTransitionPredictor.js";
import { buildTimeToEventForecast } from "../src/production/timeToEventEngine.js";
import { buildInvalidationPolicy, evaluateInvalidation } from "../src/production/dynamicInvalidationEngine.js";
import { learnCrossMarketRelevance } from "../src/production/crossMarketIntelligence.js";
import { forecastLiquidityWeather } from "../src/production/liquidityWeatherForecast.js";
import { forecastCapitalDestinations } from "../src/production/capitalDestinationForecastV2.js";
import { evaluateDecisionUtility } from "../src/production/decisionTheoreticAlpha.js";
import { calculateOpportunityCost } from "../src/production/opportunityCostEngine.js";
import { decomposeUncertainty } from "../src/production/uncertaintyDecomposition.js";
import { optimizeResearchInfrastructure } from "../src/production/selfOptimizingResearchInfrastructure.js";
import { buildAlphaMemoryGraph } from "../src/production/alphaMemoryGraph.js";
import { generateMarketThesis } from "../src/production/marketThesisGenerator.js";
import { runFutureIntelligenceStack } from "../src/ops/runFutureIntelligenceStack.js";

const A = "0x1111111111111111111111111111111111111111";
const P = "0x2222222222222222222222222222222222222222";

function event(i, side = "BUY", extra = {}) {
  return {
    chain: "base",
    tokenAddress: A,
    poolAddress: P,
    observedAt: `2026-08-23T0${i}:00:00Z`,
    side,
    eventType: "SWAP",
    usdNotional: side === "BUY" ? 10000 : 3000,
    actorAddress: `0x${String(i).padStart(40, "3")}`,
    ...extra,
  };
}

test("event fabric rejects future and symbol-only events", () => {
  const fabric = buildRealtimeEventFabric([
    event(1),
    { symbol: "ABC", chain: "base", observedAt: "2026-08-23T01:00:00Z" },
    { ...event(2), observedAt: "2026-08-25T00:00:00Z" },
  ], { asOf: "2026-08-24T00:00:00Z" });
  assert.equal(fabric.acceptedEvents, 1);
});

test("microstructure detects buyer-dominant exact flow", () => {
  const rows = analyzeMicrostructure([event(1), event(2), event(3), event(4, "SELL")]);
  assert.equal(rows.projects.length, 1);
  assert.ok(rows.projects[0].buyShare > 0.5);
});

test("entity graph merges only high-confidence observed relations", () => {
  const e = event(1, "BUY", {
    actorAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    fundedBy: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    entityLinkConfidencePct: 95,
  });
  const graph = buildEconomicEntityGraph([e], []);
  assert.ok(graph.entities.some((x) => x.walletCount >= 2));
});

test("transition probabilities sum to one", () => {
  const result = predictStateTransition({ identityKey: "base:x" }, {
    microstructure: { absorptionScore: 80, sellerDepletionScore: 75, toxicityScore: 20 },
  });
  const total = Object.values(result.probabilities).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(total - 1) < 1e-9);
});

test("time-to-event remains explicitly uncalibrated", () => {
  const result = buildTimeToEventForecast({}, {
    transition: { probabilities: { IGNITING: 0.5, EXPANSION: 0.2, FAILURE: 0.1 } },
  });
  assert.equal(result.calibrated, false);
  assert.ok(result.events.plus25.probabilityByHorizon["24"] > 0);
});

test("invalidation triggers when liquidity breaks", () => {
  const policy = buildInvalidationPolicy({ identityKey: "base:x", liquidityUsd: 100000 });
  const result = evaluateInvalidation(policy, { liquidityUsd: 70000 });
  assert.equal(result.thesisState, "INVALIDATED_OR_DEGRADED");
});

test("cross-market relevance shrinks low sample relationships", () => {
  const rows = Array.from({ length: 10 }, (_, i) => ({ btcReturnPct: i, futureReturnPct: i * 2 }));
  const result = learnCrossMarketRelevance(rows, { factorFields: ["btcReturnPct"] });
  assert.ok(result.factors[0].relevanceScore < 100);
});

test("liquidity weather can identify expansion", () => {
  const result = forecastLiquidityWeather(Array.from({ length: 10 }, () => ({
    stablecoinNetFlowUsd: 20_000_000,
    bridgeNetFlowUsd: 8_000_000,
    dexVolumeChangePct: 35,
    liquidityChangePct: 25,
    btcVolatilityPct: 2,
  })));
  assert.equal(result.state, "EXPANDING");
});

test("capital destination matches chain and narrative", () => {
  const result = forecastCapitalDestinations(
    [{ chain: "base", narrative: "ai", score: 90, netFlowUsd: 1000000 }],
    [{ chain: "base", tokenAddress: A, poolAddress: P, narratives: ["ai"] }]
  );
  assert.ok(result.candidateMatches[0].score > 70);
});

test("decision utility never enables automatic trading", () => {
  const result = evaluateDecisionUtility({}, {
    p25: 0.7, p50: 0.5, p2x: 0.2, pLoss20: 0.1,
    captureableExpectedValuePct: 20, uncertaintyPct: 20, medianTimeHours: 6,
  });
  assert.equal(result.automaticTrading, false);
  assert.ok(result.utilityScore > 50);
});

test("opportunity cost rewards faster edge", () => {
  const fast = calculateOpportunityCost({}, { captureableExpectedValuePct: 20, expectedDurationHours: 4 });
  const slow = calculateOpportunityCost({}, { captureableExpectedValuePct: 20, expectedDurationHours: 40 });
  assert.ok(fast.edgePerHour > slow.edgePerHour);
});

test("uncertainty decomposition identifies primary source", () => {
  const result = decomposeUncertainty({}, { walletAttributionUncertaintyPct: 95, modelDisagreementPct: 5 });
  assert.ok(result.ranked[0].source);
  assert.ok(result.totalUncertaintyPct >= 0);
});

test("research optimizer makes recommendations but never auto-disables", () => {
  const result = optimizeResearchInfrastructure([
    { component: "wallet", costUnits: 10, decisionsChanged: 100, winnersRescued: 5 },
  ]);
  assert.equal(result.components[0].automaticDisable, false);
  assert.ok(["EXPAND", "MAINTAIN", "REDUCE"].includes(result.components[0].recommendation));
});

test("alpha memory graph links structured history", () => {
  const graph = buildAlphaMemoryGraph({
    projects: [
      { chain: "base", tokenAddress: A, signals: ["A"], regimeState: "RISK_ON" },
      { chain: "base", symbol: "SYMBOL_ONLY" },
    ],
    outcomes: [{ chain: "base", tokenAddress: A, observationId: "o1" }],
  });
  assert.ok(graph.nodes.length >= 3);
  assert.ok(graph.edges.length >= 2);
  assert.equal(graph.rejectedIdentityRows, 1);
});

test("market thesis is research-only and surfaces candidates", () => {
  const thesis = generateMarketThesis({
    liquidityWeather: { state: "EXPANDING", expansionProbability: 0.8 },
    capitalDestination: { routes: [{ chain: "base", narrative: "ai", confidencePct: 85 }] },
    crossMarket: { factors: [] },
  }, [{ chain: "base", tokenAddress: A, poolAddress: P, utilityScore: 80, capitalDestinationScore: 90, ignitionProbabilityPct: 70, totalUncertaintyPct: 20 }]);
  assert.equal(thesis.policy.automaticTrading, false);
  assert.equal(thesis.bestFittingCandidates.length, 1);
});

test("market thesis rejects candidates without exact identity", () => {
  const thesis = generateMarketThesis({
    liquidityWeather: { state: "EXPANDING", expansionProbability: 0.8 },
    capitalDestination: { routes: [] },
    crossMarket: { factors: [] },
  }, [{ chain: "base", symbol: "ABC", utilityScore: 99 }]);
  assert.equal(thesis.bestFittingCandidates.length, 0);
  assert.equal(thesis.rejectedCandidates, 1);
});

test("unified future stack quarantines symbol-only candidates and future observations", () => {
  const result = runFutureIntelligenceStack({
    now: "2026-08-24T00:00:00Z",
    universe: {
      candidates: [
        { chain: "base", tokenAddress: A, poolAddress: P, narrative: "ai", liquidityUsd: 100000 },
        { chain: "base", symbol: "ABC", liquidityUsd: 100000 },
      ],
    },
    marketObservations: [
      { chain: "base", tokenAddress: A, poolAddress: P, observedAt: "2026-08-23T23:00:00Z", priceUsd: 1 },
      { chain: "base", symbol: "ABC", observedAt: "2026-08-23T23:00:00Z", priceUsd: 1 },
      { chain: "base", tokenAddress: A, poolAddress: P, observedAt: "2026-08-25T00:00:00Z", priceUsd: 2 },
    ],
    events: [],
    shadow: { rows: [] },
    alphaOS: {},
    marketDiscovery: { routes: [] },
    writeReports: false,
  });
  assert.equal(result.candidates.length, 1);
  assert.equal(result.identityHealth.exactCandidates, 1);
  assert.equal(result.identityHealth.rejectedCandidates, 1);
  assert.equal(result.identityHealth.exactPointInTimeMarketObservations, 1);
  assert.equal(result.identityHealth.rejectedMarketObservations, 2);
  assert.equal(result.marketThesis.bestFittingCandidates.length, 1);
});

test("unified future stack joins only earlier point-in-time market context", () => {
  const result = runFutureIntelligenceStack({
    now: "2026-08-24T02:00:00Z",
    universe: { candidates: [{ chain: "base", tokenAddress: A, poolAddress: P }] },
    marketObservations: [{
      chain: "base", tokenAddress: A, poolAddress: P,
      observedAt: "2026-08-24T01:00:00Z", priceUsd: 1,
    }],
    marketContextObservations: [
      {
        observationKey: "earlier",
        observedAt: "2026-08-24T00:30:00Z",
        pointInTimeVerified: true,
        btcReturnPct: 2,
        btcVolatilityPct: 3,
        stablecoinNetFlowUsd: 1_000_000,
      },
      {
        observationKey: "future",
        observedAt: "2026-08-24T01:30:00Z",
        pointInTimeVerified: true,
        btcReturnPct: 99,
      },
    ],
    events: [],
    shadow: { rows: [] },
    alphaOS: {},
    marketDiscovery: { routes: [] },
    writeReports: false,
  });
  assert.equal(result.identityHealth.marketContextFieldSamples.btcReturnPct, 1);
  assert.equal(result.liquidityWeather.drivers.stablecoin, 1_000_000);
  assert.equal(result.liquidityWeather.drivers.volatility, 3);
});

test("market thesis stays low-confidence with no route, factors, or candidates", () => {
  const thesis = generateMarketThesis({
    liquidityWeather: { state: "NEUTRAL", expansionProbability: 0.5 },
    capitalDestination: { routes: [] },
    crossMarket: { factors: [] },
  }, []);
  assert.equal(thesis.state, "INSUFFICIENT_THESIS_EVIDENCE");
  assert.ok(thesis.thesis.confidencePct < 40);
});
