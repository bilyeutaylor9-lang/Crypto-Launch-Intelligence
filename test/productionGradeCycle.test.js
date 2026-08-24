import test from "node:test";
import assert from "node:assert/strict";

import { resolveSnapshotOutcomes } from "../src/production/snapshotOutcomeResolver.js";
import { linkShadowPredictionsToOutcomes } from "../src/production/shadowOutcomeLinker.js";
import { runProductionSecurityAudit } from "../src/production/productionSecurityAudit.js";

function cleanDependencyAudit() {
  return {
    status: 0,
    stdout: JSON.stringify({
      metadata: {
        vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 },
      },
    }),
  };
}

test("snapshot resolver creates honest fixed-horizon outcomes", () => {
  const snapshots = [
    {
      key: "base:abc",
      timestamp: "2026-01-01T00:00:00Z",
      chain: "base",
      tokenAddress: "0x" + "1".repeat(40),
      priceUsd: 1,
    },
    {
      key: "base:abc",
      timestamp: "2026-01-02T00:30:00Z",
      chain: "base",
      tokenAddress: "0x" + "1".repeat(40),
      priceUsd: 1.5,
    },
  ];
  const outcomes = resolveSnapshotOutcomes(snapshots, {
    horizonHours: 24,
    toleranceHours: 2,
  });
  assert.equal(outcomes.length, 1);
  assert.equal(Number(outcomes[0].returnPct.toFixed(2)), 50);
});

test("shadow prediction links by exact identity and future timestamp", () => {
  const token = "0x" + "1".repeat(40);
  const predictions = [{
    identityKey: `base:${token}`,
    chain: "base",
    tokenAddress: token,
    decisionAt: "2026-01-01T00:00:00Z",
    priceUsd: 1,
    probability50Pct: 60,
  }];
  const snapshots = [{
    key: `base:${token}`,
    chain: "base",
    tokenAddress: token,
    timestamp: "2026-01-02T00:10:00Z",
    priceUsd: 1.4,
  }];
  const rows = linkShadowPredictionsToOutcomes(predictions, snapshots, {
    horizonHours: 24,
    maxLatenessHours: 1,
  });
  assert.equal(rows.length, 1);
  assert.equal(Number(rows[0].realizedReturnPct.toFixed(2)), 40);
});

test("grading cutoffs exclude observations that are still in the evaluator's future", () => {
  const token = "0x" + "1".repeat(40);
  const predictions = [{
    chain: "base",
    tokenAddress: token,
    decisionAt: "2026-01-01T00:00:00Z",
    priceUsd: 1,
  }];
  const snapshots = [
    {
      chain: "base",
      tokenAddress: token,
      timestamp: "2026-01-01T00:00:00Z",
      priceUsd: 1,
    },
    {
      chain: "base",
      tokenAddress: token,
      timestamp: "2026-01-02T00:10:00Z",
      priceUsd: 2,
    },
  ];
  assert.deepEqual(linkShadowPredictionsToOutcomes(predictions, snapshots, {
    asOf: "2026-01-01T12:00:00Z",
    horizonHours: 24,
    maxLatenessHours: 1,
  }), []);
  assert.deepEqual(resolveSnapshotOutcomes(snapshots, {
    asOf: "2026-01-01T12:00:00Z",
    horizonHours: 24,
  }), []);
});

test("security audit can run in an empty workspace without inventing findings", () => {
  const report = runProductionSecurityAudit({
    root: process.cwd(),
    scanRoots: ["definitely-missing-directory"],
    writeReport: false,
    auditTimeoutMs: 1000,
    runDependencyAudit: cleanDependencyAudit,
  });
  assert.equal(Array.isArray(report.secretFindings), true);
  assert.equal(report.pass, true);
});

test("security audit fails closed when dependency audit is unavailable", () => {
  const report = runProductionSecurityAudit({
    root: process.cwd(),
    scanRoots: ["definitely-missing-directory"],
    writeReport: false,
    runDependencyAudit: () => ({
      status: null,
      stdout: "",
      error: new Error("dependency audit unavailable"),
    }),
  });
  assert.equal(report.state, "SECURITY_AUDIT_INCOMPLETE");
  assert.equal(report.pass, false);
  assert.equal(report.dependencyAudit.complete, false);
});
