import test from "node:test";
import assert from "node:assert/strict";

import {
  buildDatasetEvidenceCoverageMatrix,
  buildEvidenceCoverageMatrix,
  buildEvidenceRecoveryPlan,
} from "../src/learning/evidenceRecoveryBrain.js";
import { featureEligibility, safeEvidenceValue } from "../src/learning/featureEvidencePolicy.js";
import { assessPriceIdentitySanity } from "../src/learning/priceIdentitySanityGate.js";

const TOKEN = "0x1111111111111111111111111111111111111111";
const POOL = "0x2222222222222222222222222222222222222222";

test("missing evidence is never converted to zero", () => {
  assert.equal(safeEvidenceValue(null, "MISSING"), null);
  assert.equal(safeEvidenceValue(0, "MISSING"), null);
  assert.equal(safeEvidenceValue(0, "OBSERVED"), 0);
  assert.equal(safeEvidenceValue(7, "DERIVED"), null);
  assert.equal(safeEvidenceValue(7, "DERIVED", { eligibleStates: ["DERIVED"] }), 7);
});

test("coverage matrix preserves distinct evidence states", () => {
  const matrix = buildEvidenceCoverageMatrix({
    a: { value: 1, state: "OBSERVED" },
    b: { value: null, state: "MISSING", reason: "PROVIDER_RATE_LIMITED" },
    c: { value: 5, state: "CONFLICTED" },
  });
  assert.equal(matrix.totals.OBSERVED, 1);
  assert.equal(matrix.totals.MISSING, 1);
  assert.equal(matrix.totals.CONFLICTED, 1);
});

test("dataset coverage reports missing cells instead of hiding them behind one observed row", () => {
  const matrix = buildDatasetEvidenceCoverageMatrix([
    { evidence: { f: { value: 1, state: "OBSERVED" } } },
    { evidence: { f: { value: null, state: "MISSING" } } },
  ], ["f"]);
  assert.equal(matrix.totalEvidenceCells, 2);
  assert.equal(matrix.observedEvidenceCells, 1);
  assert.equal(matrix.features[0].totals.MISSING, 1);
  assert.equal(matrix.features[0].observedCoveragePct, 50);
});

test("recovery plan routes rate-limited evidence", () => {
  const plan = buildEvidenceRecoveryPlan(buildEvidenceCoverageMatrix({
    x: { value: null, state: "MISSING", reason: "PROVIDER_RATE_LIMITED" },
  }));
  assert.equal(plan.actions[0].recoveryAction, "RETRY_ALTERNATE_PROVIDER");
});

test("feature with no variance is non-identifiable", () => {
  const rows = Array.from({ length: 40 }, () => ({ evidence: { f: { value: 0, state: "OBSERVED" } } }));
  assert.equal(featureEligibility(rows, "f", { minObserved: 30, minDistinctValues: 3 }).status, "NON_IDENTIFIABLE");
});

test("absurd fast price jump is quarantinable", () => {
  const result = assessPriceIdentitySanity(
    { chain: "base", tokenAddress: TOKEN, poolAddress: POOL, observedAt: "2026-01-01T00:00:00Z", priceUsd: 1 },
    { chain: "base", tokenAddress: TOKEN, poolAddress: POOL, timestamp: "2026-01-01T00:20:00Z", priceUsd: 700001 }
  );
  assert.equal(result.pass, false);
  assert.ok(result.reasons.includes("ABS_RETURN_IMPLAUSIBLE"));
});

test("price sanity requires exact token and pool identity", () => {
  const otherToken = "0x3333333333333333333333333333333333333333";
  const result = assessPriceIdentitySanity(
    { chain: "base", tokenAddress: TOKEN, poolAddress: POOL, observedAt: "2026-01-01T00:00:00Z", priceUsd: 1 },
    { chain: "base", tokenAddress: otherToken, poolAddress: POOL, timestamp: "2026-01-01T01:00:00Z", priceUsd: 1.1 }
  );
  assert.ok(result.reasons.includes("IDENTITY_MISMATCH"));
});

test("price sanity preserves case for non-EVM identities", () => {
  const result = assessPriceIdentitySanity(
    { chain: "solana", tokenAddress: "AbCdEfGhijkLMNopqrstUVWxyz123456", observedAt: "2026-01-01T00:00:00Z", priceUsd: 1 },
    { chain: "solana", tokenAddress: "abcdefGhijkLMNopqrstUVWxyz123456", timestamp: "2026-01-01T01:00:00Z", priceUsd: 1.1 }
  );
  assert.ok(result.reasons.includes("IDENTITY_MISMATCH"));
});
