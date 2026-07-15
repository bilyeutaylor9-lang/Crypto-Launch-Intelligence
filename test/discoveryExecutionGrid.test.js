import test from "node:test";
import assert from "node:assert/strict";

import {
  resolveDiscoveryExecutionOptions,
  runConcurrent,
  runWithTimeBudget,
  timeoutMsForDiscoverySource,
} from "../src/discovery/discoveryExecutionGrid.js";
import { runDiscoverySourceGrid } from "../src/discoveryManager.js";

test("discovery execution grid honors its concurrency ceiling and keeps result order", async () => {
  let active = 0;
  let peak = 0;
  const results = await runConcurrent(
    ["first", "second", "third", "fourth"],
    async (item) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 8));
      active -= 1;
      return item;
    },
    { concurrency: 2 }
  );

  assert.deepEqual(results, ["first", "second", "third", "fourth"]);
  assert.equal(peak, 2);
});

test("discovery time budget returns a classified timeout instead of hanging", async () => {
  await assert.rejects(
    runWithTimeBudget(() => new Promise(() => {}), {
      label: "Slow source",
      timeoutMs: 5,
    }),
    (error) => error.code === "DISCOVERY_SOURCE_TIMEOUT" && error.timeoutMs === 5
  );
});

test("discovery source grid runs independent sources and records usable evidence", async () => {
  const outcomes = await runDiscoverySourceGrid(
    [
      {
        key: "market",
        name: "Market",
        run: async () => [{ symbol: "EARLY" }],
      },
      {
        key: "empty",
        name: "Empty",
        run: async () => [],
      },
    ],
    { sources: [] },
    { sourceConcurrency: 2, sourceTimeoutMs: 1_000 }
  );

  assert.equal(outcomes.market.status, "SUCCESS");
  assert.equal(outcomes.market.usableEvidence, true);
  assert.equal(outcomes.market.candidateCount, 1);
  assert.equal(outcomes.empty.status, "SUCCESS");
  assert.equal(outcomes.empty.usableEvidence, false);
});

test("execution controls support global and per-source time budgets", () => {
  const execution = resolveDiscoveryExecutionOptions({ sourceConcurrency: 7, sourceTimeoutMs: 4_000 });

  assert.equal(execution.concurrency, 7);
  assert.equal(execution.timeoutMs, 4_000);
  assert.equal(
    timeoutMsForDiscoverySource("nativeDiscoveryMesh", {
      sourceTimeoutMs: 4_000,
      sourceTimeouts: { nativeDiscoveryMesh: 9_000 },
    }),
    9_000
  );
});
