import test from "node:test";
import assert from "node:assert/strict";

import {
  observePrePositioningCapital,
  __prePositioningCapitalSensorTestHooks,
  ERC20_APPROVAL_TOPIC,
} from "../src/sensors/prePositioningCapitalSensor.js";
import { analyzePrePositioningIntelligence } from "../src/engines/prePositioningIntelligenceEngine.js";
import { normalizeIgnitionSignals } from "../src/ignition/ignitionSignalNormalizer.js";
import { analyzeIgnitionTwin, __ignitionTwinTestHooks } from "../src/engines/ignitionTwinEngine.js";

const WALLET_A = "0x1111111111111111111111111111111111111111";
const WALLET_B = "0x2222222222222222222222222222222222222222";
const FUNDER_A = "0x3333333333333333333333333333333333333333";
const FUNDER_B = "0x4444444444444444444444444444444444444444";
const ROUTER = "0x5555555555555555555555555555555555555555";
const OTHER = "0x6666666666666666666666666666666666666666";
const POOL = "0x7777777777777777777777777777777777777777";
const TOKEN = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

function topicAddress(address) {
  return `0x${address.slice(2).padStart(64, "0")}`;
}

function word(value) {
  return `0x${BigInt(value).toString(16).padStart(64, "0")}`;
}

function fundingRow(address, source, amountUsd) {
  return {
    address,
    actorType: "EOA",
    executionPrepared: true,
    executionReadyCapitalUsd: amountUsd,
    fundingSourceAmounts: [{ address: source, type: "UNLABELED_ADDRESS", amountUsd }],
  };
}

test("wallet candidates only include valid explicit EVM addresses", () => {
  const wallets = __prePositioningCapitalSensorTestHooks.walletCandidates({ walletWatchlist: [WALLET_A, "not-an-address"] }, { wallets: [WALLET_B] });
  assert.deepEqual(new Set(wallets), new Set([WALLET_A, WALLET_B]));
});

test("execution contract registry is explicit rather than inferred from arbitrary spenders", () => {
  const contracts = __prePositioningCapitalSensorTestHooks.executionContracts({ canonicalExecutionRoute: { routerAddress: ROUTER } }, { executionContracts: [OTHER] });
  assert.deepEqual(new Set(contracts), new Set([ROUTER, OTHER]));
});

test("distinct funding sources create convergence without claiming distinct owners", () => {
  const result = __prePositioningCapitalSensorTestHooks.convergenceFor([
    fundingRow(WALLET_A, FUNDER_A, 30_000),
    fundingRow(WALLET_B, FUNDER_B, 40_000),
  ]);
  assert.equal(result.state, "DISTINCT_SOURCE_CAPITAL_CONVERGENCE");
  assert.equal(result.preparedWalletCount, 2);
  assert.match(result.note, /not asserted/i);
});

test("one dominant funder is classified as common-source clustering", () => {
  const result = __prePositioningCapitalSensorTestHooks.convergenceFor([
    fundingRow(WALLET_A, FUNDER_A, 30_000),
    fundingRow(WALLET_B, FUNDER_A, 40_000),
  ]);
  assert.equal(result.state, "COMMON_SOURCE_CLUSTER");
});

test("pre-positioning intelligence heavily discounts generic execution-ready capital without target evidence", () => {
  const result = analyzePrePositioningIntelligence({
    prePositioningCapital: {
      status: "OBSERVED_PRE_POSITIONING",
      state: "EXECUTION_PREPARED",
      observedFreshCapitalUsd: 100_000,
      executionReadyCapitalUsd: 100_000,
      targetProximityCapitalUsd: 0,
      visibleDeployedToTargetUsd: 0,
      confidencePct: 85,
      targetingEvidenceMode: "ECOSYSTEM_EXECUTION_PREPARATION_ONLY",
      capitalConvergence: { preparedWalletCount: 2, distinctFundingSourceCount: 2, largestFundingSourceSharePct: 55, state: "DISTINCT_SOURCE_CAPITAL_CONVERGENCE" },
    },
  });
  assert.equal(result.prePositioningIntelligence.targetingConfidencePct, 20);
  assert.equal(result.prePositioningIntelligence.candidateAdjustedStagedCapitalUsd, 20_000);
});

test("explicit target-proximity capital receives high targeting confidence", () => {
  const result = analyzePrePositioningIntelligence({
    prePositioningCapital: {
      status: "OBSERVED_PRE_POSITIONING",
      state: "TARGET_PROXIMITY",
      observedFreshCapitalUsd: 80_000,
      executionReadyCapitalUsd: 60_000,
      targetProximityCapitalUsd: 50_000,
      visibleDeployedToTargetUsd: 0,
      confidencePct: 88,
      targetingEvidenceMode: "EXPLICIT_TARGET_PROXIMITY_WALLET",
      capitalConvergence: { preparedWalletCount: 2, distinctFundingSourceCount: 2, largestFundingSourceSharePct: 52, state: "DISTINCT_SOURCE_CAPITAL_CONVERGENCE" },
    },
  });
  assert.equal(result.prePositioningIntelligence.targetingConfidencePct, 90);
  assert.equal(result.prePositioningIntelligence.candidateAdjustedStagedCapitalUsd, 54_000);
});

test("ignition signal normalization preserves unknown pre-positioning as null", () => {
  const signals = normalizeIgnitionSignals({});
  assert.equal(signals.capitalPreparation.executionReadyCapitalUsd, null);
  assert.equal(signals.capitalPreparation.targetProximityCapitalUsd, null);
});

test("generic staged ecosystem capital cannot create a loaded-vacuum target call", () => {
  const project = {
    stableExitLiquidityUsd: 100_000,
    depthByMovePct: { "5": 5_000, "10": 10_000, "25": 30_000 },
    liquidityRefillHalfLifeMinutes: 30,
    currentSellInventoryUsd: 5_000,
    previousSellInventoryUsd: 25_000,
    projectChangeScore: 80,
    attentionClockScore: 20,
    prePositioningIntelligence: {
      state: "EXECUTION_PREPARED",
      score: 80,
      confidencePct: 85,
      stagedCapitalUsd: 100_000,
      targetProximityCapitalUsd: 0,
      candidateAdjustedStagedCapitalUsd: 20_000,
      targetingConfidencePct: 20,
      targetingEvidenceMode: "ECOSYSTEM_EXECUTION_PREPARATION_ONLY",
    },
  };
  const result = analyzeIgnitionTwin(project, { persist: false });
  assert.notEqual(result.ignitionTwin.stagedCapital.loadedVacuumState, "LOADED_VACUUM_SHADOW");
  assert.notEqual(result.ignitionState, "ARMED");
});

test("directly targeted execution-ready capital can arm a measured vacuum before visible target flow", () => {
  const project = {
    stableExitLiquidityUsd: 100_000,
    depthByMovePct: { "5": 5_000, "10": 10_000, "25": 30_000 },
    liquidityRefillHalfLifeMinutes: 30,
    currentSellInventoryUsd: 5_000,
    previousSellInventoryUsd: 25_000,
    projectChangeScore: 80,
    attentionClockScore: 20,
    prePositioningIntelligence: {
      state: "TARGET_PROXIMITY",
      score: 85,
      confidencePct: 88,
      stagedCapitalUsd: 20_000,
      targetProximityCapitalUsd: 15_000,
      candidateAdjustedStagedCapitalUsd: 13_500,
      targetingConfidencePct: 90,
      targetingEvidenceMode: "EXPLICIT_TARGET_PROXIMITY_WALLET",
    },
  };
  const result = analyzeIgnitionTwin(project, { persist: false });
  assert.equal(result.ignitionTwin.ignitionCapitalUsd, 10_000);
  assert.equal(result.ignitionTwin.stagedCapital.loadedVacuumState, "LOADED_VACUUM_SHADOW");
  assert.equal(result.ignitionState, "ARMED");
});

test("staged-capital assessment creates candidate-specific counterfactuals only from adjusted target capital", () => {
  const project = {
    liquidityGeometry: { mode: "EXPLICIT_DEPTH_CURVE", depthByMovePct: { "5": 5_000, "10": 10_000 }, referenceLiquidityUsd: 100_000 },
    marketPressure: { sellerExhaustion: { score: 75 }, priceMovePct: 2 },
    reflexivityMechanisms: {},
  };
  const signals = normalizeIgnitionSignals({
    prePositioningIntelligence: { state: "TARGET_PROXIMITY", stagedCapitalUsd: 40_000, targetProximityCapitalUsd: 20_000, candidateAdjustedStagedCapitalUsd: 18_000, targetingConfidencePct: 90, targetingEvidenceMode: "EXPLICIT_TARGET_PROXIMITY_WALLET" },
  });
  const assessment = __ignitionTwinTestHooks.stagedCapitalAssessment(project, signals, { ignitionCapitalUsd: 10_000 });
  assert.equal(assessment.candidateSpecificShockScenarios.length, 4);
  assert.equal(assessment.candidateSpecificShockScenarios.at(-1).capitalUsd, 18_000);
  assert.equal(assessment.stagedCapitalToIgnitionRatio, 4);
  assert.equal(assessment.candidateAdjustedToIgnitionRatio, 1.8);
});

test("live sensor detects fresh Base USDC plus approval to an explicitly known execution contract", async () => {
  const previousFetch = global.fetch;
  global.fetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    const respond = (value) => new Response(JSON.stringify(value), { status: 200 });
    if (!Array.isArray(body)) {
      if (body.method === "eth_getBlockByNumber") return respond({ jsonrpc: "2.0", id: 1, result: { number: "0x1000", timestamp: "0x6553f100" } });
      throw new Error(`Unexpected singleton request ${body.method}`);
    }
    const rows = body.map((req) => {
      if (req.method === "eth_call" && req.params?.[0]?.data === "0x313ce567") return { jsonrpc: "2.0", id: req.id, result: word(6) };
      if (req.method === "eth_getCode") return { jsonrpc: "2.0", id: req.id, result: "0x" };
      if (req.method === "eth_getBalance") return { jsonrpc: "2.0", id: req.id, result: "0x38d7ea4c68000" };
      if (req.method === "eth_call") return { jsonrpc: "2.0", id: req.id, result: word(50_000n * 1_000_000n) };
      if (req.method === "eth_getLogs") {
        const topic0 = req.params?.[0]?.topics?.[0];
        if (topic0 === TRANSFER_TOPIC) {
          return { jsonrpc: "2.0", id: req.id, result: [{ address: USDC, blockNumber: "0x0fff", transactionHash: `0x${"a".repeat(64)}`, logIndex: "0x0", removed: false, topics: [TRANSFER_TOPIC, topicAddress(FUNDER_A), topicAddress(WALLET_A)], data: word(40_000n * 1_000_000n) }] };
        }
        if (topic0 === ERC20_APPROVAL_TOPIC) {
          return { jsonrpc: "2.0", id: req.id, result: [{ address: USDC, blockNumber: "0x0fff", transactionHash: `0x${"b".repeat(64)}`, logIndex: "0x1", removed: false, topics: [ERC20_APPROVAL_TOPIC, topicAddress(WALLET_A), topicAddress(ROUTER)], data: word(50_000n * 1_000_000n) }] };
        }
        return { jsonrpc: "2.0", id: req.id, result: [] };
      }
      if (req.method === "eth_getBlockByNumber") return { jsonrpc: "2.0", id: req.id, result: { number: req.params[0], timestamp: "0x6553f100" } };
      throw new Error(`Unexpected batch request ${req.method}`);
    });
    return respond(rows);
  };
  try {
    const result = await observePrePositioningCapital({ chain: "base", tokenAddress: TOKEN, poolAddress: POOL, walletWatchlist: [WALLET_A] }, { rpcUrl: "https://example.invalid", executionContracts: [ROUTER], lookbackHours: 1 });
    assert.equal(result.status, "OBSERVED_PRE_POSITIONING");
    assert.equal(result.state, "EXECUTION_PREPARED");
    assert.equal(result.observedFreshCapitalUsd, 40_000);
    assert.equal(result.executionReadyCapitalUsd, 40_000);
    assert.equal(result.targetProximityCapitalUsd, 0);
    assert.ok(result.walletTemporalEvents.some((event) => event.type === "EXECUTION_APPROVAL"));
  } finally {
    global.fetch = previousFetch;
  }
});

test("approval to an unregistered spender does not become execution-ready capital", async () => {
  const previousFetch = global.fetch;
  global.fetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    const respond = (value) => new Response(JSON.stringify(value), { status: 200 });
    if (!Array.isArray(body)) return respond({ jsonrpc: "2.0", id: 1, result: { number: "0x1000", timestamp: "0x6553f100" } });
    const rows = body.map((req) => {
      if (req.method === "eth_call" && req.params?.[0]?.data === "0x313ce567") return { jsonrpc: "2.0", id: req.id, result: word(6) };
      if (req.method === "eth_getCode") return { jsonrpc: "2.0", id: req.id, result: "0x" };
      if (req.method === "eth_getBalance") return { jsonrpc: "2.0", id: req.id, result: "0x1" };
      if (req.method === "eth_call") return { jsonrpc: "2.0", id: req.id, result: word(20_000n * 1_000_000n) };
      if (req.method === "eth_getLogs") {
        const topic0 = req.params?.[0]?.topics?.[0];
        if (topic0 === TRANSFER_TOPIC) return { jsonrpc: "2.0", id: req.id, result: [{ address: USDC, blockNumber: "0x0fff", transactionHash: `0x${"c".repeat(64)}`, logIndex: "0x0", topics: [TRANSFER_TOPIC, topicAddress(FUNDER_A), topicAddress(WALLET_A)], data: word(20_000n * 1_000_000n) }] };
        if (topic0 === ERC20_APPROVAL_TOPIC) return { jsonrpc: "2.0", id: req.id, result: [{ address: USDC, blockNumber: "0x0fff", transactionHash: `0x${"d".repeat(64)}`, logIndex: "0x1", topics: [ERC20_APPROVAL_TOPIC, topicAddress(WALLET_A), topicAddress(OTHER)], data: word(20_000n * 1_000_000n) }] };
        return { jsonrpc: "2.0", id: req.id, result: [] };
      }
      if (req.method === "eth_getBlockByNumber") return { jsonrpc: "2.0", id: req.id, result: { number: req.params[0], timestamp: "0x6553f100" } };
      throw new Error(`Unexpected batch request ${req.method}`);
    });
    return respond(rows);
  };
  try {
    const result = await observePrePositioningCapital({ chain: "base", walletWatchlist: [WALLET_A] }, { rpcUrl: "https://example.invalid", executionContracts: [ROUTER], lookbackHours: 1 });
    assert.equal(result.state, "CAPITAL_FUNDED");
    assert.equal(result.executionReadyCapitalUsd, 0);
  } finally {
    global.fetch = previousFetch;
  }
});
