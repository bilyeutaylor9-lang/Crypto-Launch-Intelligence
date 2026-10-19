import test from "node:test";
import assert from "node:assert/strict";

import {
  prospectiveCohortsToProbeMemory,
  prospectiveEntryEpisodesToProbeMemory,
  runOutcomeProbe,
  selectOutcomeProbeCandidates,
} from "../src/learning/outcomeProbe.js";
import { PROSPECTIVE_ENTRY_EDGE_TRIALS } from "../src/learning/prospectiveEntryEdgeTrialRegistry.js";
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

test("frozen explicit horizons govern selection without being intersected with global defaults", () => {
  const frozen = {
    ...memoryRecord(),
    exactIdentityFrozen: true,
    outcomeHorizonsHours: [1, 6, 24, 168, 720],
  };
  const due = selectOutcomeProbeCandidates([frozen], [], {
    now: "2026-01-01T06:30:00.000Z",
    horizons: [1, 24, 168, 720],
  });
  assert.equal(due.length, 1);
  assert.deepEqual(due[0].duePredictions.map((item) => item.horizonHours), [6]);

  const malformed = selectOutcomeProbeCandidates([{
    ...frozen,
    outcomeHorizonsHours: ["not-a-horizon"],
  }], [], { now: "2026-01-01T01:30:00.000Z", horizons: [1] });
  assert.deepEqual(malformed, []);
});

test("prospective frozen cohorts without a valid horizon contract are not assigned invented work", () => {
  const episode = {
    cohortId: "cohort-invalid", episodeId: "episode-invalid", role: "TREATMENT",
    decisionAt: "2026-01-01T00:00:00.000Z", chain: "base", tokenAddress: TOKEN_A, poolAddress: POOL_A,
  };
  assert.deepEqual(prospectiveCohortsToProbeMemory([episode]), []);
  assert.deepEqual(prospectiveCohortsToProbeMemory([{
    ...episode, outcomeHorizonsHours: [6, "invalid", 24],
  }]), []);
});

test("frozen evaluation policy controls the primary-horizon tolerance only", () => {
  const memory = prospectiveCohortsToProbeMemory([{
    cohortId: "cohort-policy", episodeId: "episode-policy", role: "TREATMENT",
    decisionAt: "2026-01-01T00:00:00.000Z", chain: "base", tokenAddress: TOKEN_A, poolAddress: POOL_A,
    outcomeHorizonsHours: [24, 168],
    strategyDefinition: { evaluationPolicy: {
      version: "PROSPECTIVE_EDGE_CERTIFICATE_V1", primaryHorizonHours: 24, outcomeToleranceHours: 8,
    } },
  }]);
  const due = selectOutcomeProbeCandidates(memory, [], {
    now: "2026-01-02T07:00:00.000Z", horizons: [1],
  });
  assert.equal(due.length, 1);
  assert.equal(due[0].duePredictions[0].maximumLatenessHours, 8);
  assert.equal(due[0].duePredictions[0].toleranceBasis, "FROZEN_EVALUATION_POLICY_PRIMARY_HORIZON");
});

test("dedicated exact-ledger observations prevent redundant outcome requests", () => {
  const exactLedgerObservation = {
    chain: "base",
    tokenAddress: TOKEN_A,
    poolAddress: POOL_A,
    observedAt: "2026-01-01T01:10:00.000Z",
    priceUsd: 1.1,
    exactIdentityVerified: true,
  };
  const due = selectOutcomeProbeCandidates([memoryRecord()], [exactLedgerObservation], {
    now: "2026-01-01T01:30:00.000Z",
    horizons: [1],
  });
  assert.equal(due.length, 0);
});

test("outcome probe saves only an exact chain-token-pool match with provenance", async () => {
  let saved = [];
  let exactSaved = [];
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
    saveExactObservations: (observations) => {
      exactSaved = observations;
      return { saved: observations.length, rejected: 0 };
    },
    writeReport: false,
  });

  assert.equal(report.status, "PASS");
  assert.equal(report.providerRequestsUsed, 1);
  assert.equal(report.observationsSaved, 1);
  assert.equal(report.exactLedgerObservationsSaved, 1);
  assert.equal(exactSaved.length, 1);
  assert.equal(saved[0].tokenAddress, TOKEN_A);
  assert.equal(saved[0].poolAddress, POOL_A);
  assert.equal(saved[0].outcomeObservationProvenance.source, "dexscreener");
  assert.equal(
    saved[0].outcomeObservationProvenance.verificationStatus,
    "EXACT_CHAIN_TOKEN_POOL_MATCH"
  );
  assert.equal(saved[0].outcomeObservationProvenance.confidence, 1);
});

test("outcome probe attaches and persists point-in-time market context separately from request budget", async () => {
  let exactSaved = [];
  let contextSaved = [];
  const report = await runOutcomeProbe({
    now: "2026-01-01T01:30:00.000Z",
    horizons: [1],
    memory: [memoryRecord()],
    snapshots: [],
    exactObservations: [],
    providers: {
      getPairByAddress: async () => ({ pairs: [providerPair()] }),
      getTokenPairs: async () => [],
    },
    marketContextProvider: async ({ now }) => ({
      observedAt: now,
      state: "PARTIAL_POINT_IN_TIME_CONTEXT",
      pointInTimeVerified: true,
      btcReturnPct: 2,
      stablecoinSupplyUsd: 100,
      stablecoinNetFlowUsd: null,
      fieldProvenance: { btcReturnPct: "test:observed" },
      providerHealth: { test: { status: "OBSERVED" } },
    }),
    saveSnapshots: (observations) => ({ saved: observations.length }),
    saveExactObservations: (observations) => {
      exactSaved = observations;
      return { saved: observations.length, rejected: 0 };
    },
    saveMarketContextObservations: (observations) => {
      contextSaved = observations;
      return { saved: observations.length, rejected: 0 };
    },
    writeReport: false,
  });

  assert.equal(report.providerRequestsUsed, 1);
  assert.equal(report.marketContextObservationsSaved, 1);
  assert.equal(report.marketContextCapture.pointInTimeVerified, true);
  assert.equal(contextSaved.length, 1);
  assert.equal(exactSaved[0].btcReturnPct, 2);
  assert.equal(exactSaved[0].marketContextPointInTimeVerified, true);
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
    saveExactObservations: (observations) => ({ saved: observations.length, rejected: 0 }),
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
    saveExactObservations: (observations) => ({ saved: observations.length, rejected: 0 }),
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

test("an exact observation from another known pool does not resolve a frozen pool route", () => {
  const memory = [memoryRecord(TOKEN_A, POOL_A)];
  const wrongPool = [{
    key: `base:${TOKEN_A}`,
    chain: "base",
    tokenAddress: TOKEN_A,
    poolAddress: POOL_B,
    timestamp: "2026-01-01T01:10:00.000Z",
    priceUsd: 1.1,
    exactIdentityVerified: true,
  }];
  const due = selectOutcomeProbeCandidates(memory, wrongPool, {
    now: "2026-01-01T01:30:00.000Z",
    horizons: [1],
  });
  assert.equal(due.length, 1);
  assert.equal(due[0].poolAddress, POOL_A);
});

test("a verified snapshot with no pool cannot resolve a frozen pool route", () => {
  const missingPool = [{
    key: `base:${TOKEN_A}`,
    chain: "base",
    tokenAddress: TOKEN_A,
    timestamp: "2026-01-01T01:10:00.000Z",
    priceUsd: 1.1,
    exactIdentityVerified: true,
  }];
  const due = selectOutcomeProbeCandidates([memoryRecord()], missingPool, {
    now: "2026-01-01T01:30:00.000Z", horizons: [1],
  });
  assert.equal(due.length, 1);
});

test("a primary provider failure still permits the budgeted exact Gecko fallback", async () => {
  let saved = [];
  const report = await runOutcomeProbe({
    now: "2026-01-01T01:30:00.000Z",
    horizons: [1], maxRequests: 2, geckoMinimumIntervalMs: 0,
    memory: [memoryRecord()], snapshots: [],
    providers: {
      getPairByAddress: async () => { throw new Error("dex unavailable"); },
      getTokenPairs: async () => [],
      getGeckoPoolByAddress: async () => ({ data: {
        id: `base_${POOL_A}`,
        attributes: { address: POOL_A, name: "Edge / WETH", base_token_price_usd: "1.3", reserve_in_usd: "100000" },
        relationships: { base_token: { data: { id: `base_${TOKEN_A}` } } },
      } }),
    },
    saveSnapshots: (observations) => { saved = observations; return { saved: observations.length }; },
    saveExactObservations: (observations) => ({ saved: observations.length, rejected: 0 }),
    writeReport: false,
  });
  assert.equal(report.status, "PASS");
  assert.equal(report.providerRequestsUsed, 2);
  assert.equal(saved[0].outcomeObservationProvenance.source, "geckoterminal");
});

test("a timed-out DEX request does not abort the independently timed Gecko fallback", async () => {
  let saved = [];
  const report = await runOutcomeProbe({
    now: "2026-01-01T01:30:00.000Z", timeoutMs: 5, horizons: [1], maxRequests: 2, geckoMinimumIntervalMs: 0,
    memory: [memoryRecord()], snapshots: [],
    providers: {
      getPairByAddress: async (_chain, _pool, { signal }) => new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(Object.assign(new Error("timed out"), { name: "AbortError" })));
      }),
      getTokenPairs: async () => [],
      getGeckoPoolByAddress: async (_chain, _pool, { signal }) => {
        assert.equal(signal.aborted, false);
        return { data: {
          id: `base_${POOL_A}`,
          attributes: { address: POOL_A, name: "Edge / WETH", base_token_price_usd: "1.3", reserve_in_usd: "100000" },
          relationships: { base_token: { data: { id: `base_${TOKEN_A}` } } },
        } };
      },
    },
    saveSnapshots: (observations) => { saved = observations; return { saved: observations.length }; },
    saveExactObservations: (observations) => ({ saved: observations.length, rejected: 0 }), writeReport: false,
  });
  assert.equal(report.status, "PASS");
  assert.deepEqual(saved[0].outcomeObservationProvenance.providerAttempts.map((item) => item.status), ["TIMEOUT", "RECEIVED"]);
  assert.ok(saved[0].outcomeObservationProvenance.providerAttempts.every((item) => item.requestedAt));
  assert.equal(saved[0].outcomeObservationProvenance.receiptObservedAt, "2026-01-01T01:30:00.000Z");
});

test("an invalid frozen cohort contract cannot be reported as no outcomes due", async () => {
  const report = await runOutcomeProbe({
    now: "2026-01-01T01:30:00.000Z", memory: [], prospectiveEpisodes: [{
      cohortId: "cohort-invalid", episodeId: "episode-invalid", role: "TREATMENT",
      decisionAt: "2026-01-01T00:00:00.000Z", chain: "base", tokenAddress: TOKEN_A, poolAddress: POOL_A,
    }], snapshots: [], providers: { getPairByAddress: async () => ({ pairs: [] }), getTokenPairs: async () => [] },
    writeReport: false,
  });
  assert.equal(report.status, "INVALID_FROZEN_OUTCOME_CONTRACT");
  assert.equal(report.invalidFrozenOutcomeContracts, 1);
  assert.equal(report.invalidFrozenOutcomeContractDiagnostics[0].reason, "MISSING_OR_EMPTY_FROZEN_HORIZONS");
});

test("a mixed malformed frozen horizon list is reported as an invalid contract", async () => {
  const report = await runOutcomeProbe({
    now: "2026-01-01T01:30:00.000Z", memory: [], prospectiveEpisodes: [{
      cohortId: "cohort-mixed", episodeId: "episode-mixed", role: "TREATMENT",
      decisionAt: "2026-01-01T00:00:00.000Z", chain: "base", tokenAddress: TOKEN_A, poolAddress: POOL_A,
      outcomeHorizonsHours: [6, "invalid", 24],
    }], snapshots: [], providers: { getPairByAddress: async () => ({ pairs: [] }), getTokenPairs: async () => [] },
    writeReport: false,
  });
  assert.equal(report.status, "INVALID_FROZEN_OUTCOME_CONTRACT");
  assert.equal(report.invalidFrozenOutcomeContracts, 1);
  assert.equal(report.invalidFrozenOutcomeContractDiagnostics[0].reason, "FROZEN_HORIZONS_MUST_BE_FINITE_POSITIVE_NUMBERS");
});

test("outcome observations retain receipt time and do not invent a missing provider source time", async () => {
  let saved = [];
  await runOutcomeProbe({
    now: "2026-01-01T01:30:00.000Z", horizons: [1], memory: [memoryRecord()], snapshots: [],
    providers: { getPairByAddress: async () => ({ pairs: [providerPair()] }), getTokenPairs: async () => [] },
    saveSnapshots: (observations) => { saved = observations; return { saved: observations.length }; },
    saveExactObservations: (observations) => ({ saved: observations.length, rejected: 0 }), writeReport: false,
  });
  assert.equal(saved[0].observedAt, "2026-01-01T01:30:00.000Z");
  assert.equal(saved[0].outcomeObservationProvenance.receiptObservedAt, "2026-01-01T01:30:00.000Z");
  assert.equal(saved[0].outcomeObservationProvenance.sourceTimestamp, null);
  assert.equal(saved[0].outcomeObservationProvenance.observationTimeBasis, "COLLECTION_RECEIPT_ONLY");
});

test("a provider source clock after the actual receipt is degraded rather than captured", async () => {
  let saves = 0;
  const report = await runOutcomeProbe({
    now: "2026-01-01T01:30:00.000Z", horizons: [1], memory: [memoryRecord()], snapshots: [],
    providers: {
      getPairByAddress: async () => ({ pairs: [{ ...providerPair(), sourceTimestamp: "2026-01-01T01:31:00.000Z" }] }),
      getTokenPairs: async () => [],
    },
    saveSnapshots: () => { saves += 1; return { saved: 0 }; },
    saveExactObservations: () => assert.fail("contradictory provider clock must not be persisted"), writeReport: false,
  });
  assert.equal(report.status, "PROVIDER_DEGRADED");
  assert.equal(report.results[0].status, "PROVIDER_CLOCK_INVALID");
  assert.equal(saves, 0);
});

test("a late receipt is retained as evidence but cannot make the due capture pass", async () => {
  const originalNow = Date.now;
  let clock = Date.parse("2026-01-01T01:30:00.000Z");
  let saved = [];
  Date.now = () => clock;
  try {
    const report = await runOutcomeProbe({
      acquireOutcomeProbeLock: false,
      horizons: [1], memory: [memoryRecord()], snapshots: [],
      providers: {
        getPairByAddress: async () => {
          clock = Date.parse("2026-01-01T03:01:00.000Z");
          return { pairs: [providerPair()] };
        },
        getTokenPairs: async () => [],
      },
      saveSnapshots: (observations) => { saved = observations; return { saved: observations.length }; },
      saveExactObservations: (observations) => ({ saved: observations.length, rejected: 0 }),
      writeReport: false,
    });
    assert.equal(saved.length, 1);
    assert.equal(saved[0].observedAt, "2026-01-01T03:01:00.000Z");
    assert.equal(report.status, "PROVIDER_DEGRADED");
    assert.equal(report.results[0].status, "OBSERVED_LATE");
    assert.equal(report.unresolvedCandidates, 1);
  } finally {
    Date.now = originalNow;
  }
});

test("one receipt cannot pass a candidate while one of its due obligations expires", async () => {
  const originalNow = Date.now;
  let clock = Date.parse("2026-01-01T02:30:00.000Z");
  Date.now = () => clock;
  try {
    const report = await runOutcomeProbe({
      acquireOutcomeProbeLock: false,
      memory: [{ ...memoryRecord(), outcomeHorizonsHours: [1, 2] }], snapshots: [],
      providers: {
        getPairByAddress: async () => {
          clock = Date.parse("2026-01-01T03:01:00.000Z");
          return { pairs: [providerPair()] };
        },
        getTokenPairs: async () => [],
      },
      saveSnapshots: (observations) => ({ saved: observations.length }),
      saveExactObservations: (observations) => ({ saved: observations.length, rejected: 0 }), writeReport: false,
    });
    assert.equal(report.status, "PARTIAL");
    assert.equal(report.duePredictions, 2);
    assert.equal(report.resolvedDuePredictions, 1);
    assert.equal(report.unresolvedDuePredictions, 1);
    assert.equal(report.resolvedOutcomesByHorizon["2h"], 1);
  } finally {
    Date.now = originalNow;
  }
});

test("prospective treatment and control outcomes receive priority over ordinary scan memory", () => {
  const cohortMemory = prospectiveCohortsToProbeMemory([{
    cohortId: "cohort-1",
    episodeId: "episode-1",
    role: "TREATMENT",
    decisionAt: "2026-01-01T00:00:00.000Z",
    chain: "base",
    tokenAddress: TOKEN_B,
    poolAddress: POOL_B,
    outcomeHorizonsHours: [1],
  }]);
  const due = selectOutcomeProbeCandidates(
    [memoryRecord(TOKEN_A, POOL_A), ...cohortMemory],
    [],
    { now: "2026-01-01T01:30:00.000Z", horizons: [1], maxCandidates: 1 },
  );
  assert.equal(due.length, 1);
  assert.equal(due[0].key, `base:${TOKEN_B}`);
  assert.equal(due[0].forwardEvidencePriority, 100);
});

function prospectiveEntryEpisode(role = "TREATMENT", overrides = {}) {
  const trial = PROSPECTIVE_ENTRY_EDGE_TRIALS[0];
  return {
    schemaVersion: 1,
    trialId: trial.trialId,
    trialSchemaVersion: trial.schemaVersion,
    declaredAt: trial.declaredAt,
    episodeId: `entry-${role.toLowerCase()}-episode`,
    role,
    signalObservedAt: "2026-08-21T00:00:00.000Z",
    chain: "base",
    tokenAddress: TOKEN_B,
    poolAddress: POOL_B,
    identityKey: `base:${TOKEN_B}`,
    exactIdentityFrozen: true,
    outcomeHorizonHours: trial.horizonHours,
    postDeclaration: true,
    rankingInfluence: false,
    scoringInfluence: false,
    realMoneyOrderCreated: false,
    ...overrides,
  };
}

test("immutable prospective-entry episodes become exact high-priority probe memory at their declared horizon", () => {
  const trial = PROSPECTIVE_ENTRY_EDGE_TRIALS[0];
  const memory = prospectiveEntryEpisodesToProbeMemory([
    prospectiveEntryEpisode("TREATMENT"),
    prospectiveEntryEpisode("CONTROL_MATCHED", {
      episodeId: "entry-control-episode",
      tokenAddress: TOKEN_A,
      poolAddress: POOL_A,
      identityKey: `base:${TOKEN_A}`,
    }),
  ]);

  assert.equal(memory.length, 2);
  assert.deepEqual(memory.map((row) => row.outcomeHorizonsHours), [[trial.horizonHours], [trial.horizonHours]]);
  assert.ok(memory[0].forwardEvidencePriority > 100);
  assert.equal(memory[0].poolAddress, POOL_B);
  assert.equal(memory[0].exactIdentityFrozen, true);
  assert.equal(memory[0].outcomeProbeOnly, true);
  assert.equal(memory[0].rankingInfluence, false);
  assert.equal(memory[0].scoringInfluence, false);
  assert.equal(memory[0].automaticTrading, false);
  assert.equal(memory[0].automaticPromotion, false);
});

test("prospective-entry probe memory rejects any non-frozen or non-registry-exact episode", () => {
  const trial = PROSPECTIVE_ENTRY_EDGE_TRIALS[0];
  const memory = prospectiveEntryEpisodesToProbeMemory([
    prospectiveEntryEpisode("TREATMENT", { exactIdentityFrozen: false }),
    prospectiveEntryEpisode("TREATMENT", { poolAddress: null }),
    prospectiveEntryEpisode("TREATMENT", { outcomeHorizonHours: trial.horizonHours - 1 }),
    prospectiveEntryEpisode("TREATMENT", { identityKey: `base:${TOKEN_A}` }),
    prospectiveEntryEpisode("CONTROL_POOL"),
  ]);
  assert.deepEqual(memory, []);
});

test("default outcome-probe memory loads immutable prospective-entry episodes and prioritizes their declared outcome", async () => {
  const trial = PROSPECTIVE_ENTRY_EDGE_TRIALS[0];
  let exactSaved = [];
  const report = await runOutcomeProbe({
    now: "2026-08-28T01:30:00.000Z",
    horizons: [1, trial.horizonHours],
    loadScanMemory: () => [],
    loadProspectiveEdgeCohorts: () => [],
    loadProspectiveEntryEdgeEpisodes: () => [prospectiveEntryEpisode()],
    snapshots: [],
    providers: {
      getPairByAddress: async () => ({ pairs: [providerPair(TOKEN_B, POOL_B)] }),
      getTokenPairs: async () => [],
    },
    saveSnapshots: (observations) => ({ saved: observations.length }),
    saveExactObservations: (observations) => {
      exactSaved = observations;
      return { saved: observations.length, rejected: 0 };
    },
    writeReport: false,
  });

  assert.equal(report.status, "PASS");
  assert.equal(report.prospectiveEntryEdgeEpisodesTracked, 1);
  assert.equal(report.prospectiveEntryEdgeDueCandidates, 1);
  assert.equal(report.prospectiveEntryEdgeDuePredictions, 1);
  assert.equal(report.duePredictions, 1);
  assert.equal(report.outcomesByHorizon[`${trial.horizonHours}h`], 1);
  assert.equal(report.rankingInfluence, false);
  assert.equal(report.automaticTrading, false);
  assert.equal(report.automaticPromotion, false);
  assert.equal(exactSaved[0].tokenAddress, TOKEN_B);
  assert.equal(exactSaved[0].poolAddress, POOL_B);
});
