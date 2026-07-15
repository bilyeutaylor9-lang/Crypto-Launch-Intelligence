import test from "node:test";
import assert from "node:assert/strict";

import { resolveDiscoveryLimits } from "../src/discoveryManager.js";

test("wide discovery profile targets 39,000 candidates", () => {
  const limits = resolveDiscoveryLimits({ wideScan: true, targetCandidates: 39_000 });

  assert.equal(limits.targetCandidates, 39_000);
  assert.equal(limits.wideLimit, 39_000);
  assert.equal(limits.scanLimit, 39_000);
  assert.equal(limits.freeLimit, 39_000);
  assert.equal(limits.expandedLimit, 39_000);
  assert.ok(limits.googleNewsLimit >= 1_000);
  assert.ok(limits.githubDiscoveryLimit >= 1_000);
  assert.ok(limits.nativeDiscoveryLimit >= 5_000);
});

test("standard discovery profile stays smaller by default", () => {
  const limits = resolveDiscoveryLimits({ wideScan: false });

  assert.equal(limits.scanLimit, 1_000);
  assert.equal(limits.freeLimit, 100);
  assert.equal(limits.expandedLimit, 100);
});
