import test from "node:test";
import assert from "node:assert/strict";

import {
  calculateEvidenceCoverage,
  confidenceFromCoverage,
  numericMetric,
} from "../src/kernel/evidenceCoverage.js";

test("evidence coverage distinguishes verified, partial, stale, missing, and failed signals", () => {
  const coverage = calculateEvidenceCoverage([
    numericMetric({
      label: "circulating market cap",
      value: 1_250_000,
      source: "coingecko",
      timestamp: "2026-07-18T00:00:00.000Z",
      confidence: 80,
      freshness: "FRESH",
      provenance: "circulatingMarketCapUsd",
    }),
    { label: "FDV", status: "MISSING" },
    { label: "quote freshness", status: "STALE" },
    { label: "liquidity route", status: "PARTIAL" },
    { label: "honeypot check", status: "FAILED" },
  ]);

  assert.equal(coverage.verifiedSignals.length, 1);
  assert.equal(coverage.partialSignals.length, 1);
  assert.equal(coverage.staleSignals.length, 1);
  assert.equal(coverage.missingSignals.length, 1);
  assert.equal(coverage.failedSignals.length, 1);
  assert.ok(coverage.evidenceCoveragePercent < 50);
  assert.ok(confidenceFromCoverage(80, coverage) < 80);
});
