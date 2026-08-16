import test from "node:test";
import assert from "node:assert/strict";

import {
  SELECTORS,
  ERC20_TRANSFER_TOPIC,
  callData,
  decodeInt,
  decodeUint,
  encodeSignedWord,
} from "../src/sensors/evmAbi.js";
import {
  buildDepthCurveFromSnapshot,
  observeUniswapV3Liquidity,
  __uniswapV3LiquiditySensorTestHooks,
} from "../src/sensors/uniswapV3LiquiditySensor.js";
import { __erc20HolderCohortSensorTestHooks } from "../src/sensors/erc20HolderCohortSensor.js";
import { __hyperliquidLeverageSensorTestHooks, observeHyperliquidLeverage } from "../src/sensors/hyperliquidLeverageSensor.js";
import {
  analyzeIgnitionRawSensorsBatch,
  __ignitionRawSensorOrchestratorTestHooks,
} from "../src/sensors/ignitionRawSensorOrchestrator.js";
import { normalizeIgnitionSignals } from "../src/ignition/ignitionSignalNormalizer.js";
import { analyzeMarketPressure } from "../src/engines/marketPressureEngine.js";

const TOKEN = "0x0000000000000000000000000000000000000011";
const POOL = "0x0000000000000000000000000000000000000022";
const USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
const Q96 = 2n ** 96n;

function word(value) {
  return BigInt(value).toString(16).padStart(64, "0");
}

function signedWord(value) {
  return encodeSignedWord(value, 256);
}

function addressWord(address) {
  return address.toLowerCase().replace(/^0x/, "").padStart(64, "0");
}

function topicAddress(address) {
  return `0x${address.toLowerCase().replace(/^0x/, "").padStart(64, "0")}`;
}

function transferLog(from, to, amountRaw, block = 100) {
  return {
    topics: [ERC20_TRANSFER_TOPIC, topicAddress(from), topicAddress(to)],
    data: `0x${word(amountRaw)}`,
    blockNumber: `0x${block.toString(16)}`,
    removed: false,
  };
}

test("signed ABI words are 256-bit sign-extended", () => {
  const encoded = encodeSignedWord(-1, 16);
  assert.equal(encoded, "f".repeat(64));
  const call = callData(SELECTORS.tickBitmap, [encoded]);
  assert.equal(call.slice(0, 10), SELECTORS.tickBitmap);
  assert.equal(decodeInt(`0x${encoded}`, 0, 16), -1n);
});

test("tick direction is correct for token0 and token1 price increases", () => {
  const { tickForPriceMove } = __uniswapV3LiquiditySensorTestHooks;
  assert.ok(tickForPriceMove(0, 10, true) > 0);
  assert.ok(tickForPriceMove(0, 10, false) < 0);
});

test("CLMM depth curve increases with larger upward price moves", () => {
  const snapshot = {
    token0: TOKEN,
    token1: USDC,
    token0Decimals: 18,
    token1Decimals: 6,
    fee: 3000,
    tickSpacing: 10,
    tick: 0,
    sqrtPriceX96: Number(Q96),
    liquidity: 1e12,
  };
  const tickSurface = { ticks: [], scannedMinTick: -6000, scannedMaxTick: 6000 };
  const curve = buildDepthCurveFromSnapshot(snapshot, tickSurface, TOKEN, { priceUsd: 1, source: "TEST", confidencePct: 100 }, { moveTargets: [1, 5, 10, 25] });
  assert.equal(curve.status, "OBSERVED_CLMM_DEPTH");
  assert.ok(curve.depthByMovePct["1"] > 0);
  assert.ok(curve.depthByMovePct["25"] > curve.depthByMovePct["10"]);
  assert.ok(curve.depthByMovePct["10"] > curve.depthByMovePct["5"]);
});

test("CLMM curve stays unpriced when quote USD evidence is absent", () => {
  const snapshot = {
    token0: TOKEN,
    token1: "0x0000000000000000000000000000000000000099",
    token0Decimals: 18,
    token1Decimals: 18,
    fee: 3000,
    tickSpacing: 10,
    tick: 0,
    sqrtPriceX96: Number(Q96),
    liquidity: 1e12,
  };
  const curve = buildDepthCurveFromSnapshot(snapshot, { ticks: [], scannedMinTick: -6000, scannedMaxTick: 6000 }, TOKEN, null);
  assert.equal(curve.status, "QUOTE_USD_PRICE_UNOBSERVED");
  assert.deepEqual(curve.depthByMovePct, {});
});

test("live CLMM sensor parses a block-consistent mocked Base RPC snapshot", async () => {
  const previousFetch = global.fetch;
  global.fetch = async (_url, init) => {
    const req = JSON.parse(init.body);
    if (req.method === "eth_getBlockByNumber") {
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { number: "0x100" } }), { status: 200 });
    }
    if (req.method !== "eth_call") throw new Error(`Unexpected method ${req.method}`);
    const data = req.params[0].data;
    let result;
    if (data === SELECTORS.token0) result = `0x${addressWord(TOKEN)}`;
    else if (data === SELECTORS.token1) result = `0x${addressWord(USDC)}`;
    else if (data === SELECTORS.fee) result = `0x${word(3000)}`;
    else if (data === SELECTORS.tickSpacing) result = `0x${word(10)}`;
    else if (data === SELECTORS.liquidity) result = `0x${word(1_000_000_000_000n)}`;
    else if (data === SELECTORS.slot0) result = `0x${word(Q96)}${signedWord(0)}${word(0)}${word(0)}${word(0)}${word(0)}${word(1)}`;
    else if (data === SELECTORS.decimals && req.params[0].to.toLowerCase() === TOKEN.toLowerCase()) result = `0x${word(18)}`;
    else if (data === SELECTORS.decimals && req.params[0].to.toLowerCase() === USDC.toLowerCase()) result = `0x${word(6)}`;
    else if (data.startsWith(SELECTORS.tickBitmap)) result = `0x${word(0)}`;
    else throw new Error(`Unexpected eth_call ${data}`);
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }), { status: 200 });
  };
  try {
    const result = await observeUniswapV3Liquidity({ chain: "base", tokenAddress: TOKEN, poolAddress: POOL });
    assert.equal(result.status, "OBSERVED_CLMM_DEPTH");
    assert.equal(result.liquiditySurface.protocolAware, true);
    assert.ok(result.liquiditySurface.depthByMovePct["10"] > 0);
    assert.equal(result.liquiditySurface.executableQuote, false);
  } finally {
    global.fetch = previousFetch;
  }
});

test("holder ledger distinguishes transfer accumulation from direct pool flow", () => {
  const A = "0x00000000000000000000000000000000000000aa";
  const B = "0x00000000000000000000000000000000000000bb";
  const logs = [
    transferLog(A, B, 100_000_000n, 100),
    transferLog(B, POOL, 25_000_000n, 101),
  ];
  const result = __erc20HolderCohortSensorTestHooks.buildLedger(logs, 6, new Set([POOL.toLowerCase()]));
  assert.equal(result.ledger.get(B.toLowerCase()).inboundTokens, 100);
  assert.equal(result.ledger.get(B.toLowerCase()).outboundTokens, 25);
  assert.equal(result.directPoolInTokens, 25);
});

test("recent acquisition retention is computed only from eligible EOA cohorts", () => {
  const rows = [
    { address: "a", isContract: false, firstInboundBlock: 100, inboundTokens: 100, currentBalanceRaw: 80_000_000n },
    { address: "b", isContract: false, firstInboundBlock: 100, inboundTokens: 100, currentBalanceRaw: 40_000_000n },
    { address: "c", isContract: true, firstInboundBlock: 100, inboundTokens: 1000, currentBalanceRaw: 1_000_000_000n },
  ];
  const result = __erc20HolderCohortSensorTestHooks.weightedRetention(rows, 220, 20, 5, 7, 6);
  assert.equal(result.wallets, 2);
  assert.equal(result.retentionPct, 60);
});

test("Hyperliquid book depth separates bid and ask notional around mark", () => {
  const book = {
    levels: [
      [{ px: "99", sz: "10" }, { px: "95", sz: "10" }],
      [{ px: "101", sz: "5" }, { px: "106", sz: "5" }],
    ],
  };
  const depth = __hyperliquidLeverageSensorTestHooks.aggregateBookDepth(book, 100);
  assert.equal(depth["1"].bidUsd, 990);
  assert.equal(depth["1"].askUsd, 505);
  assert.ok(depth["10"].askUsd > depth["1"].askUsd);
});

test("Hyperliquid sensor observes OI and funding but does not fabricate liquidation bands", async () => {
  const previousFetch = global.fetch;
  global.fetch = async (_url, init) => {
    const req = JSON.parse(init.body);
    let payload;
    if (req.type === "metaAndAssetCtxs") {
      payload = [{ universe: [{ name: "ABC" }] }, [{ markPx: "2", openInterest: "100000", funding: "-0.0002", dayNtlVlm: "5000000" }]];
    } else if (req.type === "l2Book") {
      payload = { levels: [[{ px: "1.98", sz: "1000" }], [{ px: "2.02", sz: "900" }]], time: 1 };
    } else throw new Error("Unexpected Hyperliquid request");
    return new Response(JSON.stringify(payload), { status: 200 });
  };
  try {
    const result = await observeHyperliquidLeverage({ symbol: "ABC" });
    assert.equal(result.status, "OBSERVED_PERP_MARKET");
    assert.equal(result.derivatives.openInterestUsd, 200000);
    assert.equal(result.derivatives.fundingRate, -0.0002);
    assert.deepEqual(result.derivatives.liquidationBands, []);
    assert.equal(result.derivatives.liquidationLadderState, "NOT_AVAILABLE_FROM_AGGREGATE_PUBLIC_MARKET_SNAPSHOT");
  } finally {
    global.fetch = previousFetch;
  }
});

test("orchestrator merge preserves stronger existing position-level liquidation bands", () => {
  const project = { derivatives: { liquidationBands: [{ side: "SHORT", movePct: 5, forcedFlowUsd: 1000 }] } };
  const merged = __ignitionRawSensorOrchestratorTestHooks.mergeObserved(project, {
    status: "PARTIAL_SENSOR_COVERAGE",
    coveragePct: 33,
    leverage: { derivatives: { openInterestUsd: 50_000, fundingRate: 0.001, liquidationBands: [], liquidationLadderState: "NOT_AVAILABLE" } },
  });
  assert.equal(merged.derivatives.openInterestUsd, 50_000);
  assert.equal(merged.derivatives.liquidationBands.length, 1);
});

test("raw sensor pipeline is disabled unless explicitly activated", async () => {
  const [result] = await analyzeIgnitionRawSensorsBatch([{ symbol: "ABC" }], { enabled: false });
  assert.equal(result.ignitionRawSensorStatus, "DISABLED");
  assert.equal(result.ignitionRawSensorCoveragePct, 0);
});

test("recent transfer cohort retention is lower-confidence than true fresh-holder retention", () => {
  const project = {
    buyVolumeUsd: 100_000,
    sellVolumeUsd: 40_000,
    liquidityUsd: 500_000,
    recentAcquisitionRetention6hPct: 90,
    holderRetentionConfidencePct: 50,
  };
  const signals = normalizeIgnitionSignals(project);
  const result = analyzeMarketPressure(project, { signals });
  assert.equal(result.marketPressure.buyerReplacement.retentionMode, "RECENT_ACQUISITION_COHORT");
  assert.equal(result.marketPressure.buyerReplacement.retentionPct, 90);
  assert.equal(result.marketPressure.buyerReplacement.adjustedRetentionPct, 70);
});

test("candidate budget prioritizes pre-consensus evidence rather than input order", () => {
  const indexes = __ignitionRawSensorOrchestratorTestHooks.selectedIndexes([
    { symbol: "LOW", projectChangeScore: 10 },
    { symbol: "HIGH", projectChangeScore: 90, asymmetricEdgeSuiteState: "PRE_CONSENSUS_WATCH_SHADOW" },
    { symbol: "MID", projectChangeScore: 50 },
  ], 1);
  assert.deepEqual(indexes, [1]);
});
