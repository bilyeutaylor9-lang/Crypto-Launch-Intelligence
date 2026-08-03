import test from "node:test";
import assert from "node:assert/strict";
import { compareModels } from "../src/backtest/modelComparisonReport.js";

test("comparison never publishes a winner from a tiny final test", () => {
  const result = compareModels([
    {
      model: "TINY_PERFECT_MODEL",
      byK: { 10: { precision: 1, catastrophicLossRate: 0, selections: 2, uniqueProjects: 2, windows: 1 } },
    },
  ], { leakageAuditStatus: "PASS", foldAuditStatus: "PASS", testCount: 2 });
  assert.equal(result.winnerPublished, false);
  assert.equal(result.bestModel, null);
  assert.equal(result.status, "INSUFFICIENT_FINAL_TEST_SAMPLE");
});
