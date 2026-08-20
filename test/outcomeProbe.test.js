import test from "node:test";
import assert from "node:assert/strict";

import {
  runOutcomeProbe,
  selectOutcomeProbeCandidates,
} from "../src/learning/outcomeProbe.js";
import { resolveDexScreenerChainId } from "../src/data/dexScreenerConnector.js";

const TOKEN_A = `0x${"1".repeat(40)}`;
const TOKEN_B = `0x${"2".repeat(40)}`;
const POOL_A = `0x${"a".repeat(40)}`;
const POOL_B = `0x${"b".repeat(40)}`;

function memoryRecord(tokenAddress = TOKEN_A, poolAddress = POOL_A, scannedAt = "2026-01-01T00:00:00.000Z") {
  return {
    identityKey: `base:${tokenAddress}`,
    chain: "base",
    tokenAddress,
    poolAddress,
    symbol: "EDGE",
    scannedAt,
    scores: { opportunity: 70 },
  };
}

function providerPair(tokenAddress = TOKEN_A, poolAddress = POOL_A) {
  return {
    chainId: "base",
    pairAddress: poolAddress,
    baseToken: { address: tokenAddress, name: "Edge", symbol: "EDGE" },
    quoteToken: { address: `0x${"f".repeat(40)}`, symbol: "WETH" },
    priceUsd: "1.25",
    liquidity: { usd: 100_000 },
    volume: { h24: 50_000 },
  };
}

test("outcome probe selects only unresolved exact identities inside a due horizon", () => {
  const now = "2026-01-01T01:30:00.000Z";
  const memory = [
    memoryRecord(),
    {
      chain: "base",
      symbol: "SYMBOL_ONLY",
      scannedAt: "2026-01-01T00:00:00.000Z",
      scores: { opportunity: 99 },
    },
  ];
  const baseline = [
    {
      key: `base:${TOKEN_A}`,
      chain: "base",
      tokenAddress: TOKEN_A,
      poolAddress: POOL_A,
      timestamp: "2026-01-01T00:00:00.000Z",
      priceUsd: 1,
    },
  ];

  const due = selectOutcomeProbeCandidates(memory, baseline, { now, horizons: [1] });
  const resolved = selectOutcomeProbeCandidates(
    memory,
    [
      ...baseline,
      {
        ...baseline[0],
        timestamp: "2026-01-01T01:10:00.000Z",
        priceUsd: 1.1,
        provenance: { verificationStatus: "EXACT_CHAIN_TOKEN_POOL_MATCH" },
      },
    ],
    { now, horizons: [1] }
  );

  assert.equal(due.length, 1);
  assert.equal(due[0].key, `base:${TOKEN_A}`);
  assert.equal(due[0].duePredictions[0].horizonHours, 1);
  assert.equal(resolved.length, 0);
});

test("outcome probe does not treat a legacy unverified snapshot as resolved", () => {
  const memory = [memoryRecord()];
  const snapshots = [{
    key: `base:${TOKEN_A}`,
    chain: "base",
    tokenAddress: TOKEN_A,
    poolAddress: POOL_A,
    timestamp: "2026-01-01T01:10:00.000Z",
    priceUsd: 1.1,
    provenance: null,
  }];

  const due = selectOutcomeProbeCandidates(memory, snapshots, {
    now: "2026-01-01T01:30:00.000Z",
    horizons: [1],
  });

  assert.equal(due.length, 1);
});

test("outcome probe saves only an exact chain-token-pool match with provenance", async () => {
  let saved = [];
  const report = await runOutcomeProbe({
    now: "2026-01-01T01:30:00.000Z",
    horizons: [1],
    memory: [memoryRecord()],
    snapshots: [],
    providers: {
      getPairByAddress: async () => ({ pairs: [providerPair()] }),
      getTokenPairs: async () => [],
    },
    saveSnapshots: (observations) => {
      saved = observations;
      return { saved: observations.length };
    },
    writeReport: false,
  });

  assert.equal(report.status, "PASS");
  assert.equal(report.providerRequestsUsed, 1);
  assert.equal(report.observationsSaved, 1);
  assert.equal(saved[0].tokenAddress, TOKEN_A);
  assert.equal(saved[0].poolAddress, POOL_A);
  assert.equal(saved[0].outcomeObservationProvenance.source, "dexscreener");
  assert.equal(
    saved[0].outcomeObservationProvenance.verificationStatus,
    "EXACT_CHAIN_TOKEN_POOL_MATCH"
  );
  assert.equal(saved[0].outcomeObservationProvenance.confidence, 1);
});

test("outcome probe rejects a provider response for another exact token", async () => {
  const report = await runOutcomeProbe({
    now: "2026-01-01T01:30:00.000Z",
    horizons: [1],
    memory: [memoryRecord()],
    snapshots: [],
    providers: {
      getPairByAddress: async () => ({ pairs: [providerPair(TOKEN_B, POOL_A)] }),
      getTokenPairs: async () => [],
      getGeckoPoolByAddress: async () => null,
    },
    saveSnapshots: () => assert.fail("mismatched evidence must not be persisted"),
    writeReport: false,
  });

  assert.equal(report.status, "PROVIDER_DEGRADED");
  assert.equal(report.observationsSaved, 0);
  assert.equal(report.results[0].status, "NO_EXACT_PROVIDER_MATCH");
});

test("outcome probe falls back to an exact GeckoTerminal pool with provenance", async () => {
  let saved = [];
  const report = await runOutcomeProbe({
    now: "2026-01-01T01:30:00.000Z",
    horizons: [1],
    maxRequests: 2,
    geckoMinimumIntervalMs: 0,
    memory: [memoryRecord()],
    snapshots: [],
    providers: {
      getPairByAddress: async () => ({ pairs: [] }),
      getTokenPairs: async () => [],
      getGeckoPoolByAddress: async () => ({
        data: {
          id: `base_${POOL_A}`,
          attributes: {
            address: POOL_A,
            name: "Edge / WETH",
            base_token_price_usd: "1.3",
            reserve_in_usd: "100000",
          },
          relationships: {
            base_token: { data: { id: `base_${TOKEN_A}` } },
            quote_token: { data: { id: `base_0x${"f".repeat(40)}` } },
          },
        },
      }),
    },
    saveSnapshots: (observations) => {
      saved = observations;
      return { saved: observations.length };
    },
    writeReport: false,
  });

  assert.equal(report.status, "PASS");
  assert.equal(report.providerRequestsUsed, 2);
  assert.equal(saved[0].outcomeObservationProvenance.source, "geckoterminal");
  assert.equal(
    saved[0].outcomeObservationProvenance.verificationStatus,
    "EXACT_CHAIN_TOKEN_POOL_MATCH"
  );
});

test("outcome probe does not exceed its request budget for provider fallback", async () => {
  let geckoRequests = 0;
  const report = await runOutcomeProbe({
    now: "2026-01-01T01:30:00.000Z",
    horizons: [1],
    maxRequests: 1,
    memory: [memoryRecord()],
    snapshots: [],
    providers: {
      getPairByAddress: async () => ({ pairs: [] }),
      getTokenPairs: async () => [],
      getGeckoPoolByAddress: async () => {
        geckoRequests += 1;
        return null;
      },
    },
    saveSnapshots: () => assert.fail("no exact observation should be saved"),
    writeReport: false,
  });

  assert.equal(report.providerRequestsUsed, 1);
  assert.equal(geckoRequests, 0);
  assert.equal(report.status, "PROVIDER_DEGRADED");
});

test("outcome probe enforces its provider request budget", async () => {
  let requests = 0;
  const report = await runOutcomeProbe({
    now: "2026-01-01T01:30:00.000Z",
    horizons: [1],
    maxRequests: 1,
    maxCandidates: 2,
    memory: [memoryRecord(TOKEN_A, POOL_A), memoryRecord(TOKEN_B, POOL_B)],
    snapshots: [],
    providers: {
      getPairByAddress: async (_chain, poolAddress) => {
        requests += 1;
        return {
          pairs: [
            poolAddress === POOL_A
              ? providerPair(TOKEN_A, POOL_A)
              : providerPair(TOKEN_B, POOL_B),
          ],
        };
      },
      getTokenPairs: async () => [],
    },
    saveSnapshots: (observations) => ({ saved: observations.length }),
    writeReport: false,
  });

  assert.equal(requests, 1);
  assert.equal(report.dueCandidates, 2);
  assert.equal(report.providerRequestsUsed, 1);
  assert.equal(report.providerRequestBudget, 1);
  assert.equal(report.unresolvedCandidates, 1);
});

test("outcome probe provider adapter keeps canonical identity while using provider chain ids", () => {
  assert.equal(resolveDexScreenerChainId("robinhood-chain"), "robinhood");
  assert.equal(resolveDexScreenerChainId("robinhood"), "robinhood");
  assert.equal(resolveDexScreenerChainId("solana"), "solana");
});
