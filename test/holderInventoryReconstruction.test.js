import test from "node:test";
import assert from "node:assert/strict";

import {
  observeHolderInventoryReconstruction,
  __holderInventoryReconstructionTestHooks,
} from "../src/sensors/holderInventoryReconstructionSensor.js";
import {
  analyzeMarginalSellerCurve,
  __marginalSellerCurveTestHooks,
} from "../src/engines/marginalSellerCurveEngine.js";
import { normalizeIgnitionSignals } from "../src/ignition/ignitionSignalNormalizer.js";
import { analyzeMarketPressure } from "../src/engines/marketPressureEngine.js";
import { analyzeIgnitionTwin } from "../src/engines/ignitionTwinEngine.js";

const A = "0x1111111111111111111111111111111111111111";
const B = "0x2222222222222222222222222222222222222222";
const TOKEN = "0x3333333333333333333333333333333333333333";
const POOL = "0x4444444444444444444444444444444444444444";

function swap(actor, side, qty, usd, price, time, key = `${actor}:${side}:${time}`) {
  return {
    eventKey: key,
    eventType: "SWAP",
    side,
    economicActorAddress: actor,
    actorAddress: actor,
    actorConfidencePct: 90,
    transactionInitiatorType: "EOA",
    routerAdjusted: true,
    targetTokenAmount: qty,
    usdNotional: usd,
    executionPriceUsd: price,
    eventTime: time,
    tokenAddress: TOKEN,
    poolAddress: POOL,
  };
}

test("FIFO reconstruction preserves observed cost basis after partial selling", () => {
  const events = [
    swap(A, "BUY", 100, 100, 1.0, "2026-08-10T00:00:00Z", "b1"),
    swap(A, "BUY", 100, 200, 2.0, "2026-08-11T00:00:00Z", "b2"),
    swap(A, "SELL", 120, 360, 3.0, "2026-08-12T00:00:00Z", "s1"),
  ];
  const row = __holderInventoryReconstructionTestHooks.reconstructActorInventory(
    A,
    events,
    80,
    3,
    new Date("2026-08-13T00:00:00Z").getTime()
  );
  assert.equal(row.currentBalanceTokens, 80);
  assert.equal(row.knownCostBasisTokens, 80);
  assert.equal(row.knownCostBasisUsd, 160);
  assert.equal(row.avgObservedAcquisitionPriceUsd, 2);
  assert.equal(row.matchedSellTokens, 120);
  assert.ok(row.realizedSellReturnPct > 100);
  assert.equal(row.reconstructionState, "HIGH_OBSERVED_BASIS_COVERAGE");
});

test("prior inventory is explicitly left unknown when current balance exceeds observed remaining buys", () => {
  const events = [swap(A, "BUY", 20, 20, 1, "2026-08-12T00:00:00Z")];
  const row = __holderInventoryReconstructionTestHooks.reconstructActorInventory(A, events, 100, 1.5, Date.now());
  assert.equal(row.knownCostBasisTokens, 20);
  assert.equal(row.unknownBasisTokens, 80);
  assert.equal(row.knownCostBasisCoveragePct, 20);
  assert.equal(row.reconstructionState, "PRIOR_OR_TRANSFERRED_IN_INVENTORY_DOMINANT");
});

test("unmatched historical sells reduce reconstruction confidence instead of inventing an opening basis", () => {
  const events = [
    swap(A, "SELL", 50, 50, 1, "2026-08-11T00:00:00Z", "s0"),
    swap(A, "BUY", 25, 25, 1, "2026-08-12T00:00:00Z", "b0"),
  ];
  const row = __holderInventoryReconstructionTestHooks.reconstructActorInventory(A, events, 25, 1, Date.now());
  assert.equal(row.unmatchedSellTokens, 50);
  assert.ok(row.confidencePct < 70);
});

test("contract initiators are excluded from sampled economic inventory", () => {
  const event = swap(A, "BUY", 10, 10, 1, "2026-08-12T00:00:00Z");
  event.transactionInitiatorType = "CONTRACT";
  assert.equal(__holderInventoryReconstructionTestHooks.actorForEvent(event, 60), null);
});

test("acquisition-cost bands separate profit, near-cost, underwater, and unknown inventory", () => {
  const rows = [
    { currentBalanceTokens: 10, knownCostBasisTokens: 10, unknownBasisTokens: 0, avgObservedAcquisitionPriceUsd: 0.4 },
    { currentBalanceTokens: 10, knownCostBasisTokens: 10, unknownBasisTokens: 0, avgObservedAcquisitionPriceUsd: 1.0 },
    { currentBalanceTokens: 10, knownCostBasisTokens: 10, unknownBasisTokens: 0, avgObservedAcquisitionPriceUsd: 1.5 },
    { currentBalanceTokens: 10, knownCostBasisTokens: 0, unknownBasisTokens: 10, avgObservedAcquisitionPriceUsd: null },
  ];
  const bands = __holderInventoryReconstructionTestHooks.acquisitionCostBands(rows, 1);
  assert.equal(bands.find((x) => x.state === "DEEP_PROFIT").inventoryTokens, 10);
  assert.equal(bands.find((x) => x.state === "NEAR_COST").inventoryTokens, 10);
  assert.equal(bands.find((x) => x.state === "UNDERWATER").inventoryTokens, 10);
  assert.equal(bands.find((x) => x.state === "UNKNOWN_BASIS").inventoryTokens, 10);
});

test("dormancy bands are based only on observed local activity age", () => {
  const rows = [
    { currentBalanceTokens: 10, dormancyHours: 0.5 },
    { currentBalanceTokens: 20, dormancyHours: 30 },
    { currentBalanceTokens: 30, dormancyHours: null },
  ];
  const bands = __holderInventoryReconstructionTestHooks.dormancyBands(rows, 2);
  assert.equal(bands.find((x) => x.state === "ACTIVE_LT_1H").inventoryUsd, 20);
  assert.equal(bands.find((x) => x.state === "DORMANT_24H_72H").inventoryUsd, 40);
  assert.equal(bands.find((x) => x.state === "DORMANCY_UNKNOWN").inventoryUsd, 60);
});

test("marginal seller curve is incremental rather than double-counted cumulative supply", () => {
  const rows = [{
    address: A,
    currentBalanceTokens: 100,
    knownCostBasisCoveragePct: 100,
    avgObservedAcquisitionPriceUsd: 1,
    observedSellToBuyPct: 10,
    sellEvents: 1,
    buyEvents: 4,
    dormancyHours: 2,
    confidencePct: 85,
    netObservedAccumulator: true,
  }];
  const curve = __marginalSellerCurveTestHooks.incrementalCurve(rows, 1, [5, 10, 25, 50, 100]);
  const total = curve.reduce((sum, band) => sum + band.supplyTokens, 0);
  assert.ok(total > 0 && total <= 82);
  assert.ok(curve.every((band) => band.supplyTokens >= 0));
  const cumulative = curve.map((_, i) => curve.slice(0, i + 1).reduce((sum, band) => sum + band.supplyTokens, 0));
  assert.ok(cumulative.every((value, i) => i === 0 || value >= cumulative[i - 1]));
});

test("historically active sellers have higher modeled propensity than accumulation-only actors", () => {
  const active = __marginalSellerCurveTestHooks.actorPropensity({
    currentBalanceTokens: 100,
    knownCostBasisCoveragePct: 100,
    avgObservedAcquisitionPriceUsd: 1,
    observedSellToBuyPct: 70,
    sellEvents: 5,
    buyEvents: 5,
    dormancyHours: 0.5,
    confidencePct: 80,
  }, 25, 1);
  const accumulator = __marginalSellerCurveTestHooks.actorPropensity({
    currentBalanceTokens: 100,
    knownCostBasisCoveragePct: 100,
    avgObservedAcquisitionPriceUsd: 1,
    observedSellToBuyPct: 0,
    sellEvents: 0,
    buyEvents: 5,
    dormancyHours: 0.5,
    confidencePct: 80,
    netObservedAccumulator: true,
  }, 25, 1);
  assert.ok(active.propensity > accumulator.propensity);
});

test("marginal seller history identifies near-price inventory burn-down", () => {
  const inventory = {
    observedAt: "2026-08-13T12:00:00Z",
    priceUsd: 1,
    sampledActors: 1,
    actorBalanceCoveragePct: 100,
    knownCostBasisCoveragePct: 100,
    sampledInventoryUsd: 100,
    actors: [{
      address: A,
      currentBalanceTokens: 100,
      knownCostBasisCoveragePct: 100,
      avgObservedAcquisitionPriceUsd: 1,
      observedSellToBuyPct: 10,
      sellEvents: 1,
      buyEvents: 4,
      dormancyHours: 1,
      confidencePct: 90,
    }],
  };
  const first = analyzeMarginalSellerCurve({ priceUsd: 1, holderInventoryReconstruction: inventory }, { inventory });
  const previousNear = first.marginalSellerCurve.nearPriceSellInventoryUsd * 2;
  const second = analyzeMarginalSellerCurve(
    { priceUsd: 1, holderInventoryReconstruction: inventory },
    { inventory, history: [{ marginalSellerCurve: { nearPriceSellInventoryUsd: previousNear } }] }
  );
  assert.ok(second.marginalSellerCurve.nearPriceInventoryBurnPct >= 40);
  assert.equal(second.marginalSellerCurve.inventoryState, "MARGINAL_SELL_INVENTORY_COLLAPSING");
});

test("normalized supply bands feed market-pressure seller exhaustion without becoming certain supply", () => {
  const project = {
    priceUsd: 1,
    liquidityUsd: 100_000,
    marketMicrostructure: { windows: { "1h": { buyVolumeUsd: 20_000, sellVolumeUsd: 5_000, netFlowUsd: 15_000, uniqueBuyers: 20, uniqueSellers: 5, priceDeltaPct: 2 } } },
    holderSellSupplyBands: [{ movePct: 5, supplyUsd: 4_000, lowerSupplyUsd: 2_000, upperSupplyUsd: 8_000, confidencePct: 60 }],
    previousSellInventoryUsd: 20_000,
    currentSellInventoryUsd: 10_000,
  };
  const signals = normalizeIgnitionSignals(project);
  assert.equal(signals.supply.holderSellSupplyBands[0].lowerSupplyUsd, 2_000);
  assert.equal(signals.supply.holderSellSupplyBands[0].upperSupplyUsd, 8_000);
  const pressure = analyzeMarketPressure(project, { signals });
  assert.equal(pressure.marketPressure.sellerExhaustion.inventoryBurnPct, 50);
  assert.ok(pressure.sellerExhaustionScore >= 55);
});

test("Ignition Twin shock simulation deducts modeled marginal seller supply", () => {
  const project = {
    priceUsd: 1,
    liquidityUsd: 200_000,
    depthByMovePct: { "5": 10_000, "10": 20_000, "25": 50_000, "50": 100_000 },
    holderSellSupplyBands: [
      { movePct: 5, supplyUsd: 5_000, confidencePct: 60 },
      { movePct: 10, supplyUsd: 5_000, confidencePct: 60 },
    ],
    marketMicrostructure: { windows: { "1h": { buyVolumeUsd: 30_000, sellVolumeUsd: 10_000, netFlowUsd: 20_000, priceDeltaPct: 2 } } },
    projectChangeScore: 70,
    attentionClockScore: 20,
  };
  const result = analyzeIgnitionTwin(project, { persist: false });
  const scenario = result.ignitionTwin.shockScenarios.find((row) => row.externalDemandUsd === 25_000);
  assert.ok(scenario.holderSellSupplyUsd >= 5_000);
  assert.ok(scenario.netPressureMultiplier <= scenario.grossReflexivityMultiplier);
});

test("live holder-inventory sensor batches point-in-time balances for resolved EOA actors", async () => {
  const previousFetch = global.fetch;
  const events = [
    swap(A, "BUY", 100, 100, 1, "2026-08-13T10:00:00Z", "a1"),
    swap(B, "BUY", 50, 50, 1, "2026-08-13T10:30:00Z", "b1"),
  ];
  global.fetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    if (Array.isArray(body)) {
      return new Response(JSON.stringify(body.map((req, i) => ({ jsonrpc: "2.0", id: req.id, result: `0x${BigInt((i + 1) * 50 * 10 ** 18).toString(16)}` }))), { status: 200 });
    }
    if (body.method === "eth_getBlockByNumber") {
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { number: "0x100", timestamp: "0x689d8c00" } }), { status: 200 });
    }
    if (body.method === "eth_call" && body.params[0].data === "0x313ce567") {
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: `0x${18n.toString(16).padStart(64, "0")}` }), { status: 200 });
    }
    throw new Error(`Unexpected request ${JSON.stringify(body)}`);
  };
  try {
    const result = await observeHolderInventoryReconstruction(
      { chain: "base", tokenAddress: TOKEN, poolAddress: POOL, priceUsd: 1 },
      { rpcUrl: "https://example.invalid", events, history: [], maxActors: 2 }
    );
    assert.equal(result.status, "OBSERVED_HOLDER_INVENTORY");
    assert.equal(result.sampledActors, 2);
    assert.equal(result.balanceResolvedActors, 2);
    assert.equal(result.actorBalanceCoveragePct, 100);
    assert.ok(result.sampledInventoryUsd > 0);
    assert.equal(result.beneficialOwnerResolved, false);
  } finally {
    global.fetch = previousFetch;
  }
});
