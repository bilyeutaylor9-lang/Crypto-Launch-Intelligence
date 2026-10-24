import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import test from "node:test";

import { runOutcomeProbe } from "../src/learning/outcomeProbe.js";

const START = Date.parse("2026-01-01T01:30:00.000Z");
const TOKEN = `0x${"1".repeat(40)}`;
const POOLS = ["a", "b", "c", "d"].map((digit) => `0x${digit.repeat(40)}`);

function geckoPair(poolAddress, price = "1.3") {
  return { data: {
    id: `base_${poolAddress}`,
    attributes: { address: poolAddress, base_token_price_usd: price },
    relationships: { base_token: { data: { id: `base_${TOKEN}` } } },
  } };
}

function dexPair(price = "1.25") {
  return { pairs: [{
    chainId: "base", pairAddress: POOLS[0],
    baseToken: { address: TOKEN }, priceUsd: price,
  }] };
}

function fixture(t, count = 1, now = START) {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now });
  t.mock.method(globalThis, "fetch", () => assert.fail("timeout tests must not make live calls"));
  const interval = process.env.OUTCOME_PROBE_GECKO_MINIMUM_INTERVAL_MS;
  delete process.env.OUTCOME_PROBE_GECKO_MINIMUM_INTERVAL_MS;
  t.after(() => {
    if (interval === undefined) delete process.env.OUTCOME_PROBE_GECKO_MINIMUM_INTERVAL_MS;
    else process.env.OUTCOME_PROBE_GECKO_MINIMUM_INTERVAL_MS = interval;
  });
  const saved = [];
  return { saved, options: {
    memory: POOLS.slice(0, count).map((poolAddress) => ({
      chain: "base", tokenAddress: TOKEN, poolAddress,
      scannedAt: "2026-01-01T00:00:00.000Z", outcomeHorizonsHours: [1],
    })),
    snapshots: [], exactObservations: [], horizons: [1],
    maxRequests: count * 2, concurrency: count,
    acquireOutcomeProbeLock: false, writeReport: false,
    collectMarketContext: false, saveLegacySnapshots: false,
    saveExactObservations: (observations) => {
      saved.push(...observations);
      return { saved: observations.length, rejected: 0 };
    },
  } };
}

async function advance(t, milliseconds = 0) {
  t.mock.timers.tick(milliseconds);
  await new Promise((resolve) => setImmediate(resolve));
}

test("queued Gecko requests retain the full transport timeout at default spacing", async (t) => {
  const f = fixture(t, 4);
  const dispatches = [];
  const pending = runOutcomeProbe({ ...f.options, providers: {
    getPairByAddress: async () => ({ pairs: [] }),
    getGeckoPoolByAddress: async (_chain, poolAddress, { signal, maxAttempts, timeoutMs }) => {
      assert.equal(signal.aborted, false);
      assert.equal(maxAttempts, 1);
      assert.equal(timeoutMs, 8000);
      dispatches.push(Date.now());
      return geckoPair(poolAddress);
    },
  } });
  await advance(t);
  assert.equal(dispatches.length, 1);
  for (let count = 2; count <= 4; count += 1) {
    await advance(t, 6099);
    assert.equal(dispatches.length, count - 1);
    await advance(t, 1);
    assert.equal(dispatches.length, count);
  }
  const report = await pending;
  assert.equal(report.status, "PASS");
  assert.equal(report.providerRequestsUsed, 8);
  assert.equal(report.providerRequestBudget, 8);
  assert.equal(report.resolvedDuePredictions, 4);
  assert.deepEqual(dispatches, [0, 6100, 12200, 18300].map((offset) => START + offset));
  assert.deepEqual(f.saved.map((row) => row.outcomeObservationProvenance.providerAttempts[1].requestedAt),
    dispatches.map((time) => new Date(time).toISOString()));
});

test("a hung DEX request times out independently and its late result cannot replace fallback evidence", async (t) => {
  const f = fixture(t);
  let finishDex, dexSignal, report;
  const pending = runOutcomeProbe({ ...f.options, providers: {
    getPairByAddress: (_chain, _pool, { signal }) => {
      dexSignal = signal;
      return new Promise((resolve) => { finishDex = resolve; });
    },
    getGeckoPoolByAddress: async (_chain, poolAddress, { signal }) => {
      assert.equal(signal.aborted, false);
      return geckoPair(poolAddress);
    },
  } }).then((value) => { report = value; });
  await advance(t);
  await advance(t, 8000);
  assert.ok(report, "a provider ignoring abort must not hold the probe open");
  await pending;
  assert.equal(dexSignal.aborted, true);
  assert.equal(report.status, "PASS");
  assert.equal(report.providerRequestsUsed, 2);
  assert.equal(f.saved[0].priceUsd, 1.3);
  const attempts = f.saved[0].outcomeObservationProvenance.providerAttempts;
  assert.deepEqual(attempts.map((attempt) => attempt.status), ["TIMEOUT", "RECEIVED"]);
  assert.equal(attempts[0].receiptObservedAt, null);
  finishDex(dexPair("999"));
  await advance(t);
  assert.equal(f.saved.length, 1);
  assert.equal(f.saved[0].priceUsd, 1.3);
  assert.equal(attempts[0].status, "TIMEOUT");
  assert.equal(attempts[0].receiptObservedAt, null);
});

test("a hung Gecko request releases its paced queue at timeout and late rejection is handled", async (t) => {
  const f = fixture(t, 2);
  const dispatches = [];
  let rejectFirst, report;
  const pending = runOutcomeProbe({ ...f.options, providers: {
    getPairByAddress: async () => ({ pairs: [] }),
    getGeckoPoolByAddress: (_chain, poolAddress, { signal }) => {
      assert.equal(signal.aborted, false);
      dispatches.push(Date.now());
      if (poolAddress === POOLS[0]) return new Promise((_resolve, reject) => { rejectFirst = reject; });
      return geckoPair(poolAddress);
    },
  } }).then((value) => { report = value; });
  await advance(t);
  await advance(t, 8000);
  assert.ok(report, "a timed-out transport must release the provider queue");
  await pending;
  assert.deepEqual(dispatches, [START, START + 8000]);
  assert.equal(report.status, "PARTIAL");
  assert.equal(report.providerRequestsUsed, 4);
  assert.deepEqual(report.results.map((row) => row.status), ["PROVIDER_TIMEOUT", "OBSERVED"]);
  rejectFirst(new Error("late transport rejection"));
  await advance(t);
  assert.equal(f.saved.length, 1);
  assert.equal(f.saved[0].poolAddress, POOLS[1]);
});

test("a timed-out request stays charged and cannot start fallback beyond its budget", async (t) => {
  const f = fixture(t);
  let report;
  const pending = runOutcomeProbe({ ...f.options, maxRequests: 1, providers: {
    getPairByAddress: () => new Promise(() => {}),
    getGeckoPoolByAddress: () => assert.fail("the timed-out request must not be refunded"),
  } }).then((value) => { report = value; });
  await advance(t);
  await advance(t, 8000);
  assert.ok(report);
  await pending;
  assert.equal(report.status, "PROVIDER_DEGRADED");
  assert.equal(report.results[0].status, "PROVIDER_TIMEOUT");
  assert.equal(report.providerRequestsUsed, 1);
  assert.equal(report.providerRequestBudget, 1);
  assert.equal(f.saved.length, 0);
});

test("an uncooperative delayed response cannot be captured after its transport timeout", async (t) => {
  const f = fixture(t);
  let report;
  const pending = runOutcomeProbe({ ...f.options, providers: {
    getPairByAddress: () => new Promise((resolve) => setTimeout(() => resolve(dexPair()), 8001)),
  } }).then((value) => { report = value; });
  await advance(t);
  await advance(t, 8000);
  assert.ok(report, "the probe must settle at its timeout, not at provider completion");
  await pending;
  assert.equal(report.status, "PROVIDER_DEGRADED");
  assert.equal(report.results[0].status, "PROVIDER_TIMEOUT");
  assert.equal(report.providerRequestsUsed, 1);
  await advance(t, 1);
  assert.equal(f.saved.length, 0);
  assert.equal(report.results[0].providerAttempts[0].receiptObservedAt, null);
});

test("a response beyond the elapsed transport deadline is rejected even before the timer callback runs", async (t) => {
  const f = fixture(t);
  let monotonicTime = 0;
  t.mock.method(performance, "now", () => monotonicTime);
  const report = await runOutcomeProbe({ ...f.options, providers: {
    getPairByAddress: () => {
      monotonicTime = 8001;
      return dexPair();
    },
  } });
  assert.equal(report.status, "PROVIDER_DEGRADED");
  assert.equal(report.results[0].status, "PROVIDER_TIMEOUT");
  assert.equal(f.saved.length, 0);
});

test("waiting for Gecko spacing does not extend a frozen duty window", async (t) => {
  const f = fixture(t, 2, Date.parse("2026-01-01T02:59:59.000Z"));
  const pending = runOutcomeProbe({ ...f.options, providers: {
    getPairByAddress: async () => ({ pairs: [] }),
    getGeckoPoolByAddress: async (_chain, poolAddress) => geckoPair(poolAddress),
  } });
  await advance(t);
  await advance(t, 6100);
  const report = await pending;
  assert.equal(report.status, "PARTIAL");
  assert.equal(report.duePredictions, 2);
  assert.equal(report.resolvedDuePredictions, 1);
  assert.equal(report.unresolvedDuePredictions, 1);
  assert.deepEqual(report.results.map((row) => row.status), ["OBSERVED", "OBSERVED_LATE"]);
  assert.equal(f.saved[1].observedAt, "2026-01-01T03:00:05.100Z");
});
