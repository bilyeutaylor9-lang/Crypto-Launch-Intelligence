import test from "node:test";
import assert from "node:assert/strict";
import { auditPointInTimeRecord, stripFutureEvidence } from "../src/backtest/pointInTimeLeakageGuard.js";

test("future evidence nested in arrays is flagged", () => {
  const result = auditPointInTimeRecord({
    scannedAt: "2026-01-01T00:00:00Z",
    evidence: [{ sourceTimestamp: "2026-01-02T00:00:00Z", value: 90 }],
  });
  assert.equal(result.valid, false);
  assert.equal(result.violations[0].type, "FUTURE_EVIDENCE");
});

test("future labels and post-decision evidence are stripped before scoring", () => {
  const result = stripFutureEvidence({
    scannedAt: "2026-01-01T00:00:00Z",
    score: 70,
    futureOutcomes: { after7d: 200 },
    evidence: [
      { observedAt: "2025-12-31T23:00:00Z", value: 20 },
      { observedAt: "2026-01-02T00:00:00Z", value: 90 },
    ],
  });
  assert.equal(result.record.futureOutcomes, undefined);
  assert.equal(result.record.evidence.length, 1);
  assert.equal(result.rejected.length, 2);
  assert.equal(result.rejected[0].type, "POPULATED_FUTURE_LABEL_REMOVED");
  assert.equal(auditPointInTimeRecord(result.record).valid, true);
});

test("empty future placeholders are removed without being reported as populated leakage", () => {
  const result = stripFutureEvidence({
    scannedAt: "2026-01-01T00:00:00Z",
    futureOutcomes: { after1h: null, after7d: null },
  });
  assert.equal(result.rejected[0].type, "EMPTY_FUTURE_PLACEHOLDER_REMOVED");
});
