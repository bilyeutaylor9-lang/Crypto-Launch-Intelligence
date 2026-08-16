import test from "node:test";
import assert from "node:assert/strict";

import { normalizeIgnitionSignals } from "../src/ignition/ignitionSignalNormalizer.js";
import { analyzeEffectiveFloat } from "../src/engines/effectiveFloatEngine.js";
import {
  analyzeLiquidityGeometry,
  depthForMovePct,
  impactForNotionalUsd,
} from "../src/engines/liquidityGeometryEngine.js";
import { analyzeMarketPressure } from "../src/engines/marketPressureEngine.js";
import { analyzeReflexivityMechanisms } from "../src/engines/reflexivityMechanismEngine.js";
import {
  analyzeIgnitionTwin,
  analyzeIgnitionTwinBatch,
  simulateIgnitionShock,
  __ignitionTwinTestHooks,
} from "../src/engines/ignitionTwinEngine.js";

function base(overrides = {}) {
  return {
    name: "Ignition Protocol",
    symbol: "IGN",
    chain: "base",
    tokenAddress: "0x0000000000000000000000000000000000000011",
    poolAddress: "0x0000000000000000000000000000000000000022",
    priceUsd: 1,
    circulatingMarketCapUsd: 10_000_000,
    liquidityUsd: 500_000,
    projectClockScore: 82,
    capitalClockScore: 74,
    attentionClockScore: 22,
    projectChangeScore: 80,
    downstreamAdoptionScore: 65,
    washTradingRiskScore: 10,
    tokenUnlockRiskScore: 10,
    ...overrides,
  };
}

function armedFixture(overrides = {}) {
  return base({
    buyVolumeUsd: 60_000,
    sellVolumeUsd: 20_000,
    uniqueBuyers24h: 120,
    uniqueSellers24h: 35,
    newBuyers24h: 80,
    repeatBuyers24h: 30,
    freshHolderRetention6hPct: 78,
    stakedSupplyPct: 25,
    lockedSupplyPct: 20,
    treasuryNonTradingPct: 10,
    depthByMovePct: { "5": 15_000, "10": 30_000, "25": 90_000, "50": 190_000 },
    liquidationBands: [
      { side: "SHORT", movePct: 8, forcedFlowUsd: 60_000, confidencePct: 85 },
      { side: "SHORT", movePct: 20, forcedFlowUsd: 90_000, confidencePct: 80 },
    ],
    previousUniqueSellers: 70,
    currentUniqueSellers: 35,
    previousSellInventoryUsd: 200_000,
    currentSellInventoryUsd: 75_000,
    priceChange24hPct: 4,
    ...overrides,
  });
}

test("normalizer does not invent leverage or holder supply evidence", () => {
  const signals = normalizeIgnitionSignals(base());
  assert.deepEqual(signals.leverage.liquidationBands, []);
  assert.deepEqual(signals.supply.holderSellSupplyBands, []);
  assert.equal(signals.supply.explicitEffectiveFreeFloatUsd, null);
});

test("effective float uses direct evidence when supplied", () => {
  const result = analyzeEffectiveFloat(base({ effectiveFreeFloatUsd: 2_000_000 }));
  assert.equal(result.effectiveFloat.mode, "DIRECT_EFFECTIVE_FLOAT");
  assert.equal(result.effectiveFreeFloatUsd, 2_000_000);
  assert.equal(result.effectiveFreeFloatRatioPct, 20);
});

test("component float estimate excludes only explicit non-trading components", () => {
  const result = analyzeEffectiveFloat(base({
    stakedSupplyPct: 20,
    lockedSupplyPct: 30,
    dormantSupplyMovedUsd: 5_000_000,
  }));
  assert.equal(result.effectiveFloat.mode, "COMPONENT_ESTIMATE");
  assert.equal(result.effectiveFreeFloatUsd, 5_000_000);
  assert.equal(result.effectiveFloat.dormantSupplyNotSubtracted, true);
});

test("explicit liquidity depth curve is preserved and invertible", () => {
  const result = analyzeLiquidityGeometry(base({ depthByMovePct: { "10": 30_000, "25": 90_000, "50": 190_000 } }));
  assert.equal(result.liquidityGeometry.mode, "EXPLICIT_DEPTH_CURVE");
  assert.equal(depthForMovePct(result.liquidityGeometry, 25), 90_000);
  const impact = impactForNotionalUsd(result.liquidityGeometry, 60_000);
  assert.ok(impact > 10 && impact < 25);
  assert.equal(result.liquidityGeometry.executableQuote, false);
});

test("headline-liquidity fallback is explicitly heuristic", () => {
  const result = analyzeLiquidityGeometry(base());
  assert.equal(result.liquidityGeometry.mode, "CONSTANT_PRODUCT_HEURISTIC");
  assert.match(result.liquidityGeometry.caution, /not a protocol-aware executable quote/i);
});

test("seller exhaustion plus positive flow can identify pressure without movement", () => {
  let project = analyzeEffectiveFloat(armedFixture());
  project = analyzeMarketPressure(project);
  assert.ok(project.sellerExhaustionScore >= 70);
  assert.equal(project.marketPressure.pressureWithoutMovement, true);
  assert.equal(project.absorptionState, "POTENTIAL_ACCUMULATION_ABSORPTION");
});

test("reflexivity engine observes an explicit short-liquidation ladder", () => {
  const result = analyzeReflexivityMechanisms(armedFixture());
  assert.equal(result.reflexivityMechanismState, "LEVERAGE_REFLEXIVITY_AVAILABLE");
  assert.equal(result.reflexivityMechanisms.leverage.totalPotentialForcedBuyUsd, 150_000);
});

test("counterfactual shock can cascade through explicit liquidation bands", () => {
  let project = analyzeEffectiveFloat(armedFixture());
  project = analyzeLiquidityGeometry(project);
  project = analyzeMarketPressure(project);
  project = analyzeReflexivityMechanisms(project);
  const scenario = simulateIgnitionShock(project, 25_000);
  assert.equal(scenario.reflexiveMechanismTriggered, true);
  assert.ok(scenario.forcedBuyUsd >= 60_000);
  assert.ok(scenario.grossReflexivityMultiplier > 2);
  assert.equal(scenario.executableQuote, false);
});

test("holder supply dampens net pressure without erasing gross forced flow", () => {
  const fixture = armedFixture({
    holderSellSupplyBands: [
      { movePct: 6, supplyUsd: 40_000 },
      { movePct: 18, supplyUsd: 80_000 },
    ],
  });
  let project = analyzeEffectiveFloat(fixture);
  project = analyzeLiquidityGeometry(project);
  project = analyzeMarketPressure(project);
  project = analyzeReflexivityMechanisms(project);
  const scenario = simulateIgnitionShock(project, 25_000);
  assert.ok(scenario.forcedBuyUsd > 0);
  assert.ok(scenario.holderSellSupplyUsd > 0);
  assert.ok(scenario.netPressureMultiplier < scenario.grossReflexivityMultiplier);
});

test("ignition twin classifies a measured pre-consensus trigger as ARMED", () => {
  const result = analyzeIgnitionTwin(armedFixture(), {
    history: [],
    shockNotionals: [10_000, 25_000, 50_000, 100_000],
  });
  assert.equal(result.ignitionState, "ARMED");
  assert.equal(result.ignitionCapitalUsd, 25_000);
  assert.match(result.ignitionCapitalMode, /OBSERVED_LEVERAGE/);
  assert.equal(result.ignitionTwinRankingInfluence, false);
  assert.equal(result.ignitionTwin.executableQuote, false);
});

test("high scores alone do not manufacture ignition capital", () => {
  const result = analyzeIgnitionTwin(base({
    buyVolumeUsd: 70_000,
    sellVolumeUsd: 10_000,
    projectClockScore: 99,
    capitalClockScore: 99,
    depthByMovePct: undefined,
    liquidationBands: undefined,
    holderSellSupplyBands: undefined,
  }), { history: [], shockNotionals: [10_000, 25_000] });
  assert.equal(result.ignitionCapitalUsd, null);
  assert.notEqual(result.ignitionState, "ARMED");
  assert.notEqual(result.ignitionState, "IGNITING");
});

test("safety evidence invalidates ignition state", () => {
  const result = analyzeIgnitionTwin(armedFixture({ honeypotDetected: true }), { history: [], shockNotionals: [25_000] });
  assert.equal(result.ignitionState, "INVALIDATED");
});

test("late-chase evidence moves the state to EXHAUSTION", () => {
  const result = analyzeIgnitionTwin(armedFixture({ preBreakoutMomentumStage: "LATE_CHASE" }), { history: [], shockNotionals: [25_000] });
  assert.equal(result.ignitionState, "EXHAUSTION");
});

test("short-window observed flow near threshold moves state to IGNITING", () => {
  const result = analyzeIgnitionTwin(armedFixture({
    marketMicrostructure: {
      windows: {
        "5m": {
          buyVolumeUsd: 32_000,
          sellVolumeUsd: 4_000,
          uniqueBuyers: 35,
          uniqueSellers: 8,
          priceStartUsd: 1,
          priceEndUsd: 1.03,
          liquidityStartUsd: 500_000,
          liquidityEndUsd: 500_000,
        },
      },
    },
  }), { history: [], shockNotionals: [10_000, 25_000, 50_000] });
  assert.equal(result.ignitionState, "IGNITING");
});

test("event-time acceleration detects compressed event intervals", () => {
  const start = Date.parse("2026-08-13T00:00:00Z");
  const minutes = [0, 120, 240, 330, 360, 375];
  const result = analyzeIgnitionTwin(armedFixture({
    meaningfulEventTimestamps: minutes.map((minute) => new Date(start + minute * 60000).toISOString()),
  }), { history: [], shockNotionals: [25_000] });
  assert.ok(result.ignitionTwin.eventTimeAcceleration.accelerationRatio >= 2);
  assert.match(result.ignitionTwin.eventTimeAcceleration.state, /COMPRESSING/);
});

test("sequence compression is learned only from actual state transitions", () => {
  const history = [
    { observedAt: "2026-08-13T00:00:00Z", state: "DORMANT" },
    { observedAt: "2026-08-13T12:00:00Z", state: "FORMING" },
    { observedAt: "2026-08-13T18:00:00Z", state: "COMPRESSED" },
    { observedAt: "2026-08-13T20:00:00Z", state: "ARMED" },
  ];
  const result = __ignitionTwinTestHooks.sequenceCompression(history);
  assert.equal(result.state, "SEQUENCE_COMPRESSING");
  assert.ok(result.compressionRatio > 1);
});

test("batch mode can run without persistence or report side effects", () => {
  const results = analyzeIgnitionTwinBatch([armedFixture(), base({ symbol: "IGN2", tokenAddress: "0x0000000000000000000000000000000000000033" })], {
    persist: false,
    writeReport: false,
    observations: [],
    shockNotionals: [10_000, 25_000],
  });
  assert.equal(results.length, 2);
  assert.ok(results.every((row) => row.ignitionTwin?.shadowOnly === true));
  assert.ok(results.every((row) => row.ignitionTwin?.rankingInfluence === false));
});
