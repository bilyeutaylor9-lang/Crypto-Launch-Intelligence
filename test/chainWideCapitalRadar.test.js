import test from "node:test";
import assert from "node:assert/strict";

import {
  observeChainWideCapitalRadar,
  capitalRadarCandidateMatch,
  capitalRadarProjectKey,
  ERC20_APPROVAL_TOPIC,
  __chainWideCapitalRadarTestHooks,
} from "../src/sensors/chainWideCapitalRadarSensor.js";
import { analyzeCapitalDestinationIntelligence } from "../src/engines/capitalDestinationIntelligenceEngine.js";
import { __prePositioningCapitalSensorTestHooks } from "../src/sensors/prePositioningCapitalSensor.js";

const WALLET_A = "0x1111111111111111111111111111111111111111";
const WALLET_B = "0x2222222222222222222222222222222222222222";
const FUNDER_A = "0x3333333333333333333333333333333333333333";
const FUNDER_B = "0x4444444444444444444444444444444444444444";
const ROUTER = "0x5555555555555555555555555555555555555555";
const TARGET_CONTRACT = "0x6666666666666666666666666666666666666666";
const SHARED_TARGET = "0x7777777777777777777777777777777777777777";
const TOKEN_A = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const TOKEN_B = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const POOL_A = "0x8888888888888888888888888888888888888888";
const USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

function topicAddress(address) {
  return `0x${address.slice(2).padStart(64, "0")}`;
}

function word(value) {
  return `0x${BigInt(value).toString(16).padStart(64, "0")}`;
}

function baseProject(overrides = {}) {
  return {
    chain: "base",
    symbol: "AAA",
    tokenAddress: TOKEN_A,
    poolAddress: POOL_A,
    ...overrides,
  };
}

function walletRow(overrides = {}) {
  return {
    address: WALLET_A,
    newlyDiscovered: true,
    executionPrepared: true,
    executionReadyCapitalUsd: 40_000,
    fundingSources: [{ address: FUNDER_A, amountUsd: 40_000 }],
    destination: { assignedProjectKey: "base:0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", confidencePct: 82 },
    ...overrides,
  };
}

test("capital radar project keys are stable by chain plus token address", () => {
  assert.equal(capitalRadarProjectKey(baseProject()), `base:${TOKEN_A}`);
});

test("generic execution routers are never treated as token-specific target contracts", () => {
  const descriptors = __chainWideCapitalRadarTestHooks.candidateDescriptors([
    baseProject({ canonicalExecutionRoute: { routerAddress: ROUTER } }),
  ]);
  const registry = __chainWideCapitalRadarTestHooks.executionRegistry(descriptors);
  assert.equal(registry.generic.get(ROUTER)?.length, 1);
  assert.equal(registry.targetSpecific.has(ROUTER), false);
});

test("generic router approval alone remains chain-level capital", () => {
  const descriptors = __chainWideCapitalRadarTestHooks.candidateDescriptors([
    baseProject({ canonicalExecutionRoute: { routerAddress: ROUTER } }),
  ]);
  const destination = __chainWideCapitalRadarTestHooks.assignDestination(WALLET_A, [{
    owner: WALLET_A,
    spender: ROUTER,
    genericCandidateKeys: [descriptors[0].key],
    targetCandidateKeys: [],
    allowanceUsd: 40_000,
  }], descriptors);
  assert.equal(destination.state, "CHAIN_LEVEL_ONLY");
  assert.equal(destination.assignedProjectKey, null);
});

test("a unique target-specific approval can create candidate proximity", () => {
  const descriptors = __chainWideCapitalRadarTestHooks.candidateDescriptors([
    baseProject({ targetSpecificExecutionContracts: [TARGET_CONTRACT] }),
  ]);
  const destination = __chainWideCapitalRadarTestHooks.assignDestination(WALLET_A, [{
    owner: WALLET_A,
    spender: TARGET_CONTRACT,
    genericCandidateKeys: [],
    targetCandidateKeys: [descriptors[0].key],
    allowanceUsd: 40_000,
  }], descriptors);
  assert.equal(destination.state, "CANDIDATE_PROXIMITY");
  assert.equal(destination.assignedProjectKey, descriptors[0].key);
  assert.equal(destination.confidencePct, 82);
});

test("ambiguous target-specific approval shared by multiple candidates is not force-assigned", () => {
  const descriptors = __chainWideCapitalRadarTestHooks.candidateDescriptors([
    baseProject({ targetSpecificExecutionContracts: [SHARED_TARGET] }),
    baseProject({ symbol: "BBB", tokenAddress: TOKEN_B, targetSpecificExecutionContracts: [SHARED_TARGET] }),
  ]);
  const destination = __chainWideCapitalRadarTestHooks.assignDestination(WALLET_A, [{
    owner: WALLET_A,
    spender: SHARED_TARGET,
    genericCandidateKeys: [],
    targetCandidateKeys: descriptors.map((row) => row.key),
    allowanceUsd: 40_000,
  }], descriptors);
  assert.equal(destination.state, "AMBIGUOUS_DESTINATION");
  assert.equal(destination.assignedProjectKey, null);
});

test("prior explicit target activity can create a weak but explicit candidate proximity", () => {
  const descriptors = __chainWideCapitalRadarTestHooks.candidateDescriptors([
    baseProject({ walletTemporalEvents: [{ type: "TARGET_BUY", wallet: WALLET_A }] }),
  ]);
  const destination = __chainWideCapitalRadarTestHooks.assignDestination(WALLET_A, [], descriptors);
  assert.equal(destination.state, "CANDIDATE_PROXIMITY_WEAK");
  assert.equal(destination.assignedProjectKey, descriptors[0].key);
  assert.equal(destination.confidencePct, 55);
});

test("independent funding addresses are convergence evidence without ownership claims", () => {
  const result = __chainWideCapitalRadarTestHooks.convergenceFor([
    walletRow(),
    walletRow({ address: WALLET_B, fundingSources: [{ address: FUNDER_B, amountUsd: 30_000 }] }),
  ]);
  assert.equal(result.state, "INDEPENDENT_CAPITAL_CONVERGENCE");
  assert.equal(result.distinctFundingSourceCount, 2);
  assert.match(result.note, /not asserted/i);
});

test("candidate summaries confidence-adjust staged capital instead of counting all capital as certain", () => {
  const descriptors = __chainWideCapitalRadarTestHooks.candidateDescriptors([baseProject()]);
  const rows = __chainWideCapitalRadarTestHooks.candidateSummaries([
    walletRow({ destination: { assignedProjectKey: descriptors[0].key, confidencePct: 82 } }),
  ], descriptors);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].executionReadyCapitalUsd, 40_000);
  assert.equal(rows[0].candidateAdjustedRadarCapitalUsd, 32_800);
});

test("capital destination intelligence remains shadow-only and preserves adjusted capital", () => {
  const result = analyzeCapitalDestinationIntelligence({
    chainCapitalRadarCandidate: {
      state: "CANDIDATE_CAPITAL_CONVERGENCE",
      executionReadyCapitalUsd: 80_000,
      candidateAdjustedRadarCapitalUsd: 64_000,
      candidateWallets: [WALLET_A, WALLET_B],
      targetProximityWallets: [WALLET_A, WALLET_B],
      convergence: { state: "INDEPENDENT_CAPITAL_CONVERGENCE", distinctFundingSourceCount: 2, largestFundingSourceSharePct: 55 },
      confidencePct: 82,
    },
  });
  assert.equal(result.capitalDestinationIntelligence.state, "MULTI_WALLET_TARGET_PROXIMITY");
  assert.equal(result.capitalDestinationIntelligence.candidateAdjustedRadarCapitalUsd, 64_000);
  assert.equal(result.capitalDestinationIntelligence.rankingInfluence, false);
});

test("radar-discovered candidate wallets feed the deeper pre-positioning sensor", () => {
  const wallets = __prePositioningCapitalSensorTestHooks.walletCandidates({
    chainCapitalRadarCandidate: { candidateWallets: [WALLET_A] },
  }, {});
  const targets = __prePositioningCapitalSensorTestHooks.targetProximityWallets({
    chainCapitalRadarCandidate: { targetProximityWallets: [WALLET_B] },
  }, {});
  assert.ok(wallets.includes(WALLET_A));
  assert.ok(targets.has(WALLET_B));
});

test("live chain radar discovers fresh execution-ready capital but leaves generic router flow unassigned", async () => {
  const previousFetch = global.fetch;
  global.fetch = makeRpcMock({ approvalSpender: ROUTER, balanceUsd: 40_000 });
  try {
    const radar = await observeChainWideCapitalRadar([
      baseProject({ canonicalExecutionRoute: { routerAddress: ROUTER } }),
    ], {
      rpcUrl: "https://example.invalid",
      lookbackMinutes: 1,
      maxLookbackBlocks: 20,
      logChunkBlocks: 100,
      minTransferUsd: 5_000,
    });
    const chain = radar.chains[0];
    assert.equal(chain.status, "OBSERVED_CHAIN_CAPITAL_RADAR");
    assert.equal(chain.preparedWalletCount, 1);
    assert.equal(chain.executionReadyCapitalUsd, 40_000);
    assert.equal(chain.unassignedExecutionReadyCapitalUsd, 40_000);
    assert.equal(chain.candidateSummaries.length, 0);
  } finally {
    global.fetch = previousFetch;
  }
});

test("live chain radar assigns target-specific prepared capital and exposes a candidate match", async () => {
  const previousFetch = global.fetch;
  global.fetch = makeRpcMock({ approvalSpender: TARGET_CONTRACT, balanceUsd: 50_000 });
  try {
    const project = baseProject({ targetSpecificExecutionContracts: [TARGET_CONTRACT] });
    const radar = await observeChainWideCapitalRadar([project], {
      rpcUrl: "https://example.invalid",
      lookbackMinutes: 1,
      maxLookbackBlocks: 20,
      logChunkBlocks: 100,
      minTransferUsd: 5_000,
    });
    const match = capitalRadarCandidateMatch(radar, project, 0);
    assert.ok(match);
    assert.equal(match.candidateWallets[0], WALLET_A);
    assert.equal(match.targetProximityWallets[0], WALLET_A);
    assert.equal(match.executionReadyCapitalUsd, 40_000);
    assert.equal(match.candidateAdjustedRadarCapitalUsd, 32_800);
  } finally {
    global.fetch = previousFetch;
  }
});

function makeRpcMock({ approvalSpender, balanceUsd }) {
  return async (_url, init) => {
    const body = JSON.parse(init.body);
    const respond = (value) => new Response(JSON.stringify(value), { status: 200 });
    if (!Array.isArray(body)) {
      if (body.method === "eth_getBlockByNumber") {
        return respond({ jsonrpc: "2.0", id: 1, result: { number: "0x1000", timestamp: "0x6553f100" } });
      }
      throw new Error(`Unexpected singleton request ${body.method}`);
    }
    const rows = body.map((req) => {
      if (req.method === "eth_call" && req.params?.[0]?.data === "0x313ce567") {
        return { jsonrpc: "2.0", id: req.id, result: word(6) };
      }
      if (req.method === "eth_getLogs") {
        const topic0 = req.params?.[0]?.topics?.[0];
        if (topic0 === TRANSFER_TOPIC) {
          return {
            jsonrpc: "2.0",
            id: req.id,
            result: [{
              address: USDC,
              blockNumber: "0x0fff",
              transactionHash: `0x${"a".repeat(64)}`,
              logIndex: "0x0",
              removed: false,
              topics: [TRANSFER_TOPIC, topicAddress(FUNDER_A), topicAddress(WALLET_A)],
              data: word(40_000n * 1_000_000n),
            }],
          };
        }
        if (topic0 === ERC20_APPROVAL_TOPIC) {
          return {
            jsonrpc: "2.0",
            id: req.id,
            result: [{
              address: USDC,
              blockNumber: "0x0fff",
              transactionHash: `0x${"b".repeat(64)}`,
              logIndex: "0x1",
              removed: false,
              topics: [ERC20_APPROVAL_TOPIC, topicAddress(WALLET_A), topicAddress(approvalSpender)],
              data: word(100_000n * 1_000_000n),
            }],
          };
        }
      }
      if (req.method === "eth_getCode") return { jsonrpc: "2.0", id: req.id, result: "0x" };
      if (req.method === "eth_getBalance") return { jsonrpc: "2.0", id: req.id, result: "0x38d7ea4c68000" };
      if (req.method === "eth_call") return { jsonrpc: "2.0", id: req.id, result: word(BigInt(balanceUsd) * 1_000_000n) };
      if (req.method === "eth_getBlockByNumber") return { jsonrpc: "2.0", id: req.id, result: { number: req.params[0], timestamp: "0x6553f100" } };
      throw new Error(`Unexpected batch request ${req.method}`);
    });
    return respond(rows);
  };
}
