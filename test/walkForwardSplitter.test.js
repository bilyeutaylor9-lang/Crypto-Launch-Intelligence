import test from "node:test";
import assert from "node:assert/strict";
import { buildExpandingWindowFolds, chronologicalSplit } from "../src/backtest/walkForwardSplitter.js";

function row(day, identityKey) {
  return { scannedAt: new Date(Date.UTC(2026, 0, day)).toISOString(), identityKey };
}

test("zero-hour compatibility split does not silently become seven days", () => {
  const rows = Array.from({ length: 30 }, (_, index) => row(index + 1, `solana:token${index}`));
  const split = chronologicalSplit(rows, { embargoHours: 0 });
  assert.ok(split.train.length > 0);
  assert.ok(split.validation.length > 0);
  assert.ok(split.test.length > 0);
  assert.equal(split.boundaries.embargoHours, 0);
});

test("expanding folds enforce purge and entity isolation", () => {
  const rows = [];
  for (let day = 1; day <= 80; day += 1) {
    rows.push(row(day, `solana:unique${day}`));
    rows.push(row(day, "solana:repeated-project"));
  }
  const split = buildExpandingWindowFolds(rows, {
    purgeDays: 7,
    embargoDays: 7,
    validationDays: 2,
    minimumTrainDays: 5,
    testFraction: 0.2,
  });
  assert.equal(split.audit.status, "PASS");
  assert.equal(split.audit.identityOverlapCount, 0);
  assert.equal(split.audit.temporalPurgeViolationCount, 0);
  assert.ok(split.folds.length > 1);
  const pretestIds = new Set(split.finalTrain.map((item) => item.identityKey));
  assert.equal(split.finalTest.some((item) => pretestIds.has(item.identityKey)), false);
});
