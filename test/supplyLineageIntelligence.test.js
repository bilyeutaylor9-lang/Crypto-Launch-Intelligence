import test from "node:test";
import assert from "node:assert/strict";

import {
  observeSupplyLineage,
  __supplyLineageSensorTestHooks,
} from "../src/sensors/supplyLineageSensor.js";
import { analyzeSupplyLineageIntelligence } from "../src/engines/supplyLineageIntelligenceEngine.js";
import { normalizeIgnitionSignals } from "../src/ignition/ignitionSignalNormalizer.js";
import { analyzeMarketPressure } from "../src/engines/marketPressureEngine.js";
import { analyzeIgnitionTwin } from "../src/engines/ignitionTwinEngine.js";

const TREASURY = "0x1111111111111111111111111111111111111111";
const TEAM = "0x2222222222222222222222222222222222222222";
const VESTING = "0x3333333333333333333333333333333333333333";
const USER = "0x4444444444444444444444444444444444444444";
const MID = "0x5555555555555555555555555555555555555555";
const POOL = "0x6666666666666666666666666666666666666666";
const ROUTER = "0x7777777777777777777777777777777777777777";
const CEX = "0x8888888888888888888888888888888888888888";
const BRIDGE = "0x9999999999999999999999999999999999999999";
const TOKEN = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function transfer(from, to, amountTokens, blockNumber, txHash = `0x${String(blockNumber).padStart(64, "0")}`) {
  return { from, to, amountTokens, blockNumber, txHash, eventTime: new Date(1_700_000_000_000 + blockNumber * 1000).toISOString() };
}

function registry() {
  return __supplyLineageSensorTestHooks.normalizeSupplyAddressRegistry({
    poolAddress: POOL,
    treasuryAddresses: [TREASURY],
    teamAddresses: [TEAM],
    vestingAddresses: [VESTING],
    exchangeAddresses: [CEX],
    bridgeAddresses: [BRIDGE],
    routerAddresses: [ROUTER],
  });
}

test("address registry only labels explicitly supplied strategic and market addresses", () => {
  const r = registry();
  assert.ok(r.get(TREASURY).labels.includes("TREASURY"));
  assert.ok(r.get(POOL).labels.includes("DEX_POOL"));
  assert.ok(r.get(CEX).labels.includes("CEX"));
  assert.equal(r.has(USER), false);
});

test("confirmed sell tx is stronger than a generic transfer to the pool", () => {
  const tx = `0x${"1".repeat(64)}`;
  const rows = [transfer(USER, POOL, 100, 10, tx)];
  const lineage = __supplyLineageSensorTestHooks.buildSupplyLineage(rows, registry(), new Map(), new Set([tx]));
  assert.equal(lineage.relevantEvents[0].type, "CONFIRMED_DEX_SELL");
  assert.equal(lineage.confirmedSellSupplyTokens, 100);
  assert.equal(lineage.marketFacingPotentialSupplyTokens, 100);
});

test("pool transfer without swap confirmation remains potential supply rather than a confirmed sale", () => {
  const lineage = __supplyLineageSensorTestHooks.buildSupplyLineage([transfer(USER, POOL, 40, 10)], registry(), new Map(), new Set());
  assert.equal(lineage.confirmedSellSupplyTokens, 0);
  assert.equal(lineage.marketFacingPotentialSupplyTokens, 40);
  assert.equal(lineage.relevantEvents[0].type, "UNCONFIRMED_MARKET_ROUTE_TRANSFER");
});

test("treasury transfer through an intermediary is resolved as one-hop staged supply", () => {
  const rows = [
    transfer(TREASURY, MID, 100, 10),
    transfer(MID, ROUTER, 70, 12),
  ];
  const lineage = __supplyLineageSensorTestHooks.buildSupplyLineage(rows, registry(), new Map(), new Set(), { stagingWindowBlocks: 10 });
  assert.equal(lineage.oneHopPaths.length, 1);
  assert.equal(lineage.stagedOneHopSupplyTokens, 70);
  assert.equal(lineage.unresolvedStagedTokens, 30);
  assert.equal(lineage.oneHopPaths[0].type, "STAGED_TREASURY_TO_MARKET");
});

test("staging outside the configured window is not promoted to a one-hop market path", () => {
  const rows = [
    transfer(TREASURY, MID, 100, 10),
    transfer(MID, ROUTER, 100, 100),
  ];
  const lineage = __supplyLineageSensorTestHooks.buildSupplyLineage(rows, registry(), new Map(), new Set(), { stagingWindowBlocks: 20 });
  assert.equal(lineage.stagedOneHopSupplyTokens, 0);
  assert.equal(lineage.unresolvedStagedTokens, 100);
});

test("bridge deposits are tracked as mobility and are not automatically market-facing supply", () => {
  const lineage = __supplyLineageSensorTestHooks.buildSupplyLineage([transfer(TREASURY, BRIDGE, 100, 10)], registry(), new Map(), new Set());
  assert.equal(lineage.bridgeMobilityTokens, 100);
  assert.equal(lineage.marketFacingPotentialSupplyTokens, 0);
  assert.equal(lineage.relevantEvents[0].type, "CROSS_CHAIN_MOBILITY");
});

test("dormant sampled holder waking into a market route is distinguished from ordinary holder flow", () => {
  const dormant = new Map([[USER, { dormancyHours: 120, currentBalanceTokens: 500, confidencePct: 80 }]]);
  const lineage = __supplyLineageSensorTestHooks.buildSupplyLineage([transfer(USER, ROUTER, 50, 10)], registry(), dormant, new Set());
  assert.equal(lineage.dormantWakeupTokens, 50);
  assert.equal(lineage.dormantMarketFacingTokens, 50);
  assert.equal(lineage.relevantEvents[0].type, "DORMANT_TO_MARKET_ROUTE");
});

test("supply-lineage intelligence flags material one-hop inventory relative to liquidity", () => {
  const project = {
    stableExitLiquidityUsd: 100_000,
    marginalSellerCurve: { inventoryState: "MARGINAL_SELL_INVENTORY_COLLAPSING", nearPriceInventoryBurnPct: 50, nearPriceSellInventoryUsd: 20_000 },
    supplyLineage: {
      status: "OBSERVED_SUPPLY_LINEAGE",
      confidencePct: 80,
      stagedOneHopSupplyUsd: 25_000,
      unresolvedStagedUsd: 5_000,
      marketFacingPotentialSupplyUsd: 0,
      confirmedSellSupplyUsd: 0,
      cexDirectedSupplyUsd: 0,
      dormantWakeupUsd: 0,
      dormantMarketFacingUsd: 0,
      strategicMarketFacingUsd: 0,
      bridgeMobilityUsd: 0,
      relevantEvents: [],
      oneHopPaths: [{ amountTokens: 1 }],
    },
  };
  const result = analyzeSupplyLineageIntelligence(project);
  assert.equal(result.supplyLineageIntelligence.state, "ONE_HOP_SUPPLY_STAGING");
  assert.equal(result.supplyLineageIntelligence.vacuumIntegrityState, "VACUUM_THREATENED_BY_ONE_HOP_SUPPLY");
  assert.ok(result.supplyLineageRiskScore >= 45);
});

test("bridge-only lineage does not create bearish contextual supply risk", () => {
  const result = analyzeSupplyLineageIntelligence({
    stableExitLiquidityUsd: 100_000,
    supplyLineage: {
      status: "OBSERVED_SUPPLY_LINEAGE",
      confidencePct: 75,
      bridgeMobilityUsd: 50_000,
      marketFacingPotentialSupplyUsd: 0,
      confirmedSellSupplyUsd: 0,
      stagedOneHopSupplyUsd: 0,
      unresolvedStagedUsd: 0,
      cexDirectedSupplyUsd: 0,
      dormantWakeupUsd: 0,
      dormantMarketFacingUsd: 0,
      strategicMarketFacingUsd: 0,
    },
  });
  assert.equal(result.supplyLineageIntelligence.state, "CROSS_CHAIN_MOBILITY_ONLY");
  assert.equal(result.supplyLineageIntelligence.contextualSupplyRiskUsd, 0);
});

test("normalized ignition signals preserve supply-lineage context without converting unknown to zero", () => {
  const signals = normalizeIgnitionSignals({
    supplyLineageRiskScore: 72,
    supplyLineageContextualRiskUsd: 12_000,
    supplyLineageState: "ONE_HOP_SUPPLY_STAGING",
    supplyVacuumIntegrityState: "VACUUM_THREATENED_BY_ONE_HOP_SUPPLY",
  });
  assert.equal(signals.supply.supplyLineageRiskScore, 72);
  assert.equal(signals.supply.supplyLineageContextualRiskUsd, 12_000);
  assert.equal(normalizeIgnitionSignals({}).supply.supplyLineageRiskScore, null);
});

test("market-pressure supply model incorporates lineage risk instead of ignoring staged supply", () => {
  const project = {
    effectiveFreeFloatUsd: 200_000,
    supplyLineageRiskScore: 70,
    supplyLineageContextualRiskUsd: 30_000,
    marketMicrostructure: { windows: { "1h": { netFlowUsd: 5_000, buyVolumeUsd: 8_000, sellVolumeUsd: 3_000 } } },
  };
  const signals = normalizeIgnitionSignals(project);
  const result = analyzeMarketPressure(project, { signals });
  assert.equal(result.marketPressure.supplyPressure.supplyLineageContextualRiskUsd, 30_000);
  assert.ok(result.marketPressure.supplyPressure.score >= 45);
});

test("Ignition Twin does not arm a supply-vacuum thesis when one-hop supply threatens it", () => {
  const project = {
    priceUsd: 1,
    stableExitLiquidityUsd: 100_000,
    depthByMovePct: { "5": 5_000, "10": 10_000, "25": 30_000 },
    marketMicrostructure: { windows: { "1h": { buyVolumeUsd: 30_000, sellVolumeUsd: 5_000, netFlowUsd: 25_000, priceDeltaPct: 2, uniqueBuyers: 20, uniqueSellers: 5 } } },
    currentSellInventoryUsd: 8_000,
    previousSellInventoryUsd: 20_000,
    projectChangeScore: 80,
    attentionClockScore: 20,
    supplyLineageRiskScore: 72,
    supplyLineageContextualRiskUsd: 20_000,
    supplyVacuumIntegrityState: "VACUUM_THREATENED_BY_ONE_HOP_SUPPLY",
  };
  const result = analyzeIgnitionTwin(project, { persist: false });
  assert.notEqual(result.ignitionState, "ARMED");
  assert.ok(result.ignitionTwin.shockScenarios.some((scenario) => scenario.contextualSupplyRiskUsd >= 20_000));
});

test("live supply-lineage sensor decodes transfer logs and explicit labels conservatively", async () => {
  const previousFetch = global.fetch;
  const topicAddress = (address) => `0x${address.slice(2).padStart(64, "0")}`;
  const amount = 100n * 10n ** 18n;
  let logServed = false;
  global.fetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    if (Array.isArray(body)) {
      return new Response(JSON.stringify(body.map((req) => ({ jsonrpc: "2.0", id: req.id, result: { timestamp: "0x6553f100" } }))), { status: 200 });
    }
    if (body.method === "eth_getBlockByNumber") {
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { number: "0x1000", timestamp: "0x6553f100" } }), { status: 200 });
    }
    if (body.method === "eth_call") {
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: `0x${18n.toString(16).padStart(64, "0")}` }), { status: 200 });
    }
    if (body.method === "eth_getLogs") {
      if (logServed) return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: [] }), { status: 200 });
      logServed = true;
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: [{
        address: TOKEN,
        blockNumber: "0x0fff",
        transactionHash: `0x${"a".repeat(64)}`,
        logIndex: "0x0",
        removed: false,
        topics: [
          "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
          topicAddress(TREASURY),
          topicAddress(CEX),
        ],
        data: `0x${amount.toString(16).padStart(64, "0")}`,
      }] }), { status: 200 });
    }
    throw new Error(`Unexpected request: ${JSON.stringify(body)}`);
  };
  try {
    const result = await observeSupplyLineage({
      chain: "base",
      tokenAddress: TOKEN,
      poolAddress: POOL,
      priceUsd: 2,
      treasuryAddresses: [TREASURY],
      exchangeAddresses: [CEX],
    }, {
      rpcUrl: "https://example.invalid",
      lookbackHours: 4,
      maxLogChunks: 2,
      logChunkSize: 1900,
    });
    assert.ok(["OBSERVED_SUPPLY_LINEAGE", "PARTIAL_SUPPLY_LINEAGE_LOOKBACK"].includes(result.status));
    assert.equal(result.cexDirectedSupplyTokens, 100);
    assert.equal(result.cexDirectedSupplyUsd, 200);
    assert.equal(result.confirmedSellSupplyTokens, 0);
  } finally {
    global.fetch = previousFetch;
  }
});
