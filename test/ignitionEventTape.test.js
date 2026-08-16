import test from "node:test";
import assert from "node:assert/strict";

import { keccak256Hex } from "../src/sensors/keccak256.js";
import { ERC20_TRANSFER_TOPIC, SELECTORS, encodeSignedWord } from "../src/sensors/evmAbi.js";
import {
  UNISWAP_V3_EVENT_TOPICS,
  observeUniswapV3EventTape,
  __uniswapV3EventTapeSensorTestHooks,
} from "../src/sensors/uniswapV3EventTapeSensor.js";
import { __ignitionRawSensorOrchestratorTestHooks } from "../src/sensors/ignitionRawSensorOrchestrator.js";

const TOKEN = "0x0000000000000000000000000000000000000011";
const POOL = "0x0000000000000000000000000000000000000022";
const USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
const USER = "0x00000000000000000000000000000000000000aa";
const ROUTER = "0x00000000000000000000000000000000000000bb";
const Q96 = 2n ** 96n;

function word(value) {
  return BigInt(value).toString(16).padStart(64, "0");
}

function addressWord(address) {
  return address.toLowerCase().replace(/^0x/, "").padStart(64, "0");
}

function topicAddress(address) {
  return `0x${address.toLowerCase().replace(/^0x/, "").padStart(64, "0")}`;
}

function topicInt(value, bits = 24) {
  return `0x${encodeSignedWord(value, bits)}`;
}

function swapData({ amount0, amount1, sqrtPriceX96 = Q96, liquidity = 1_000_000n, tick = 0 }) {
  return `0x${encodeSignedWord(amount0, 256)}${encodeSignedWord(amount1, 256)}${word(sqrtPriceX96)}${word(liquidity)}${encodeSignedWord(tick, 24)}`;
}

function swapLog({ amount0, amount1, block = 100, logIndex = 0, timestamp = null }) {
  return {
    topics: [UNISWAP_V3_EVENT_TOPICS.SWAP, topicAddress(ROUTER), topicAddress(USER)],
    data: swapData({ amount0, amount1 }),
    blockNumber: `0x${block.toString(16)}`,
    blockHash: `0x${"1".repeat(64)}`,
    transactionHash: `0x${String(block).padStart(64, "0")}`,
    logIndex: `0x${logIndex.toString(16)}`,
    removed: false,
    _timestamp: timestamp,
  };
}

function mintLog({ amount = 1000n, amount0 = 10n ** 18n, amount1 = 10_000_000n, lower = -100, upper = 100, block = 101, logIndex = 0 }) {
  return {
    topics: [UNISWAP_V3_EVENT_TOPICS.MINT, topicAddress(USER), topicInt(lower), topicInt(upper)],
    data: `0x${addressWord(ROUTER)}${word(amount)}${word(amount0)}${word(amount1)}`,
    blockNumber: `0x${block.toString(16)}`,
    blockHash: `0x${"2".repeat(64)}`,
    transactionHash: `0x${String(block + 1000).padStart(64, "0")}`,
    logIndex: `0x${logIndex.toString(16)}`,
    removed: false,
  };
}

function burnLog({ amount = 1000n, amount0 = 10n ** 18n, amount1 = 10_000_000n, lower = -100, upper = 100, block = 102, logIndex = 0 }) {
  return {
    topics: [UNISWAP_V3_EVENT_TOPICS.BURN, topicAddress(USER), topicInt(lower), topicInt(upper)],
    data: `0x${word(amount)}${word(amount0)}${word(amount1)}`,
    blockNumber: `0x${block.toString(16)}`,
    blockHash: `0x${"3".repeat(64)}`,
    transactionHash: `0x${String(block + 2000).padStart(64, "0")}`,
    logIndex: `0x${logIndex.toString(16)}`,
    removed: false,
  };
}

const poolContext = {
  token0: TOKEN,
  token1: USDC,
  token0Decimals: 18,
  token1Decimals: 6,
  sqrtPriceX96: Number(Q96),
  tick: 0,
};

const decodeContext = {
  pool: poolContext,
  project: { chain: "base", tokenAddress: TOKEN, poolAddress: POOL },
  priceCtx: { tokenIs0: true, tokenIs1: false, token0Usd: 10, token1Usd: 1 },
  quoteUsd: { priceUsd: 1, source: "TEST" },
  timestamp: { timestamp: 1_700_000_000, mode: "RPC_BLOCK_TIMESTAMP" },
};

test("local Keccak-256 derives Ethereum event topics correctly", () => {
  assert.equal(keccak256Hex("Transfer(address,address,uint256)"), ERC20_TRANSFER_TOPIC);
  assert.equal(UNISWAP_V3_EVENT_TOPICS.SWAP.length, 66);
  assert.notEqual(UNISWAP_V3_EVENT_TOPICS.SWAP, UNISWAP_V3_EVENT_TOPICS.MINT);
});

test("swap decoder identifies target-token buys and quote notional without claiming end-user identity", () => {
  const event = __uniswapV3EventTapeSensorTestHooks.decodeLog(
    swapLog({ amount0: -(10n * 10n ** 18n), amount1: 100n * 10n ** 6n }),
    decodeContext
  );
  assert.equal(event.eventType, "SWAP");
  assert.equal(event.side, "BUY");
  assert.equal(event.targetTokenAmount, 10);
  assert.equal(event.quoteTokenAmount, 100);
  assert.equal(event.usdNotional, 100);
  assert.equal(event.actorAddress, USER.toLowerCase());
  assert.equal(event.routerAdjusted, false);
  assert.equal(event.participantIdentityMode, "POOL_EVENT_ACTORS_UNADJUSTED");
});

test("mint and burn decoder identify active-range liquidity changes", () => {
  const mint = __uniswapV3EventTapeSensorTestHooks.decodeLog(mintLog({ amount: 1200n }), decodeContext);
  const burn = __uniswapV3EventTapeSensorTestHooks.decodeLog(burnLog({ amount: 500n }), decodeContext);
  assert.equal(mint.eventType, "MINT");
  assert.equal(mint.activeRange, true);
  assert.equal(mint.liquidityChangeRaw, "1200");
  assert.equal(burn.eventType, "BURN");
  assert.equal(burn.activeRange, true);
  assert.equal(burn.burnedLiquidityRaw, "500");
  assert.ok(mint.liquidityUsdNotional > 0);
});

test("pool event window separates real swap flow and active LP removal", () => {
  const now = 1_700_000_000_000;
  const events = [
    { eventType: "SWAP", side: "BUY", eventTime: new Date(now - 60_000).toISOString(), usdNotional: 1000, actorAddress: "a", executionPriceUsd: 1 },
    { eventType: "SWAP", side: "BUY", eventTime: new Date(now - 50_000).toISOString(), usdNotional: 500, actorAddress: "b", executionPriceUsd: 1.01 },
    { eventType: "SWAP", side: "SELL", eventTime: new Date(now - 40_000).toISOString(), usdNotional: 300, actorAddress: "c", executionPriceUsd: 1.02 },
    { eventType: "MINT", activeRange: true, eventTime: new Date(now - 30_000).toISOString(), liquidityChangeRaw: "200", liquidityUsdNotional: 2000 },
    { eventType: "BURN", activeRange: true, eventTime: new Date(now - 20_000).toISOString(), burnedLiquidityRaw: "800", liquidityChangeRaw: "-800", liquidityUsdNotional: 5000 },
  ];
  const window = __uniswapV3EventTapeSensorTestHooks.buildWindow(events, "5m", 300, now);
  assert.equal(window.buyVolumeUsd, 1500);
  assert.equal(window.sellVolumeUsd, 300);
  assert.equal(window.netFlowUsd, 1200);
  assert.equal(window.uniqueObservedBuyers, 2);
  assert.equal(window.activeLiquidityMintRaw, "200");
  assert.equal(window.activeLiquidityBurnRaw, "800");
  assert.equal(window.activeLiquidityWithdrawalPressurePct, 80);
});

test("swap-time acceleration detects shrinking inter-event gaps", () => {
  const base = 1_700_000_000_000;
  const gaps = [120, 100, 90, 30, 20, 10];
  let t = base;
  const events = [{ eventType: "SWAP", eventTime: new Date(t).toISOString() }];
  for (const gap of gaps) {
    t += gap * 1000;
    events.push({ eventType: "SWAP", eventTime: new Date(t).toISOString() });
  }
  const result = __uniswapV3EventTapeSensorTestHooks.intervalAcceleration(events);
  assert.ok(result.ratio > 2);
  assert.equal(result.state, "EVENT_TIME_ACCELERATING_FAST");
});

test("active-range refill half-life is based on observed burn then mint recovery", () => {
  const base = 1_700_000_000_000;
  const result = __uniswapV3EventTapeSensorTestHooks.refillHalfLife([
    { eventType: "BURN", activeRange: true, eventTime: new Date(base).toISOString(), burnedLiquidityRaw: "1000" },
    { eventType: "MINT", activeRange: true, eventTime: new Date(base + 4 * 60_000).toISOString(), liquidityChangeRaw: "200" },
    { eventType: "MINT", activeRange: true, eventTime: new Date(base + 9 * 60_000).toISOString(), liquidityChangeRaw: "400" },
  ]);
  assert.equal(result.halfLifeMinutes, 9);
  assert.equal(result.state, "MODERATE_REFILL");
});

test("raw sensor merge promotes event tape to observed market microstructure without erasing prior windows", () => {
  const project = { marketMicrostructure: { windows: { "24h": { buyVolumeUsd: 999 } }, source: "OLD" } };
  const merged = __ignitionRawSensorOrchestratorTestHooks.mergeObserved(project, {
    status: "PARTIAL_SENSOR_COVERAGE",
    coveragePct: 25,
    eventTape: {
      status: "OBSERVED_EVENT_TAPE",
      meaningfulEventTimestamps: ["2026-08-13T00:00:00.000Z"],
      marketMicrostructure: {
        source: "UNISWAP_V3_POOL_EVENTS",
        windows: { "1h": { buyVolumeUsd: 100, sellVolumeUsd: 20, netFlowUsd: 80 } },
        swapTimeAcceleration: { ratio: 2.2 },
        sequenceCompression: { ratio: 1.8 },
      },
      lpEventTape: { refillHalfLife: { halfLifeMinutes: 12 } },
    },
  });
  assert.equal(merged.marketMicrostructure.windows["1h"].netFlowUsd, 80);
  assert.equal(merged.marketMicrostructure.windows["24h"].buyVolumeUsd, 999);
  assert.equal(merged.liquidityRefillHalfLifeMinutes, 12);
  assert.equal(merged.swapTimeAccelerationRatio, 2.2);
  assert.equal(merged.sequenceCompressionRatio, 1.8);
});

test("live event-tape sensor reads safe logs and exact block timestamps from mocked Base RPC", async () => {
  const previousFetch = global.fetch;
  const now = 1_700_000_000;
  const sqrtForTenUsd = BigInt(Math.floor(Math.sqrt(10 * 10 ** (6 - 18)) * Number(Q96)));
  const log = swapLog({ amount0: -(10n * 10n ** 18n), amount1: 100n * 10n ** 6n, block: 999, logIndex: 1 });
  log.data = swapData({ amount0: -(10n * 10n ** 18n), amount1: 100n * 10n ** 6n, sqrtPriceX96: sqrtForTenUsd, liquidity: 1_000_000n, tick: -253_000 });

  global.fetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    if (Array.isArray(body)) {
      const response = body.map((req) => ({ jsonrpc: "2.0", id: req.id, result: { number: req.params[0], timestamp: `0x${(now - 10).toString(16)}` } }));
      return new Response(JSON.stringify(response), { status: 200 });
    }
    if (body.method === "eth_getBlockByNumber") {
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { number: "0x3e8", timestamp: `0x${now.toString(16)}` } }), { status: 200 });
    }
    if (body.method === "eth_getLogs") {
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: [log] }), { status: 200 });
    }
    if (body.method === "eth_call") {
      const data = body.params[0].data;
      const to = body.params[0].to.toLowerCase();
      let result;
      if (data === SELECTORS.token0) result = `0x${addressWord(TOKEN)}`;
      else if (data === SELECTORS.token1) result = `0x${addressWord(USDC)}`;
      else if (data === SELECTORS.slot0) result = `0x${word(sqrtForTenUsd)}${encodeSignedWord(-253000, 24)}${word(0)}${word(0)}${word(0)}${word(0)}${word(1)}`;
      else if (data === SELECTORS.decimals && to === TOKEN.toLowerCase()) result = `0x${word(18)}`;
      else if (data === SELECTORS.decimals && to === USDC.toLowerCase()) result = `0x${word(6)}`;
      else throw new Error(`Unexpected call ${data}`);
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }), { status: 200 });
    }
    throw new Error(`Unexpected RPC ${body.method}`);
  };

  try {
    const result = await observeUniswapV3EventTape(
      { chain: "base", tokenAddress: TOKEN, poolAddress: POOL, priceUsd: 10 },
      { lookbackSeconds: 120, logChunkBlocks: 500 }
    );
    assert.equal(result.status, "OBSERVED_EVENT_TAPE");
    assert.equal(result.swapEvents, 1);
    assert.equal(result.marketMicrostructure.windows["5m"].buyVolumeUsd, 100);
    assert.equal(result.marketMicrostructure.windows["5m"].netFlowUsd, 100);
    assert.equal(result.marketMicrostructure.routerAdjusted, false);
    assert.equal(result.marketMicrostructure.reorgSafe, true);
  } finally {
    global.fetch = previousFetch;
  }
});
