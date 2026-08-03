import test from "node:test";
import assert from "node:assert/strict";
import { evaluateRanking } from "../src/backtest/rankingBacktestEngine.js";

function candidate(day, index, score, successful, catastrophic = false) {
  return {
    identityKey: `base:0x${String(day * 100 + index).padStart(40, "0")}`,
    scannedAt: new Date(Date.UTC(2026, 0, day)).toISOString(),
    modelScore: score,
    outcome: {
      status: "RESOLVED",
      successfulSevenDayBreakout: successful,
      maximumReturn168hPct: successful ? 120 : 10,
      maximumDrawdownPct: catastrophic ? 60 : 10,
      returnAt168hPct: successful ? 100 : -10,
      liquiditySurvived: true,
      targets: { plus25Within24h: { hit: successful } },
    },
  };
}

test("ranking evaluates top K against the full eligible universe", () => {
  const rows = [];
  for (let day = 1; day <= 10; day += 1) {
    rows.push(candidate(day, 1, 100, true));
    rows.push(candidate(day, 2, 50, false));
    rows.push(candidate(day, 3, 10, false, true));
  }
  const result = evaluateRanking(rows, { modelName: "TEST", scorer: (row) => row.modelScore });
  assert.equal(result.byK[1].selections, 10);
  assert.equal(result.byK[1].precision, 1);
  assert.equal(result.byK[1].precisionByTarget[100].recall, 1);
  assert.equal(result.byK[3].catastrophicLossCount, 10);
  assert.equal(result.byK[1].coverageRate, 1);
});

test("a model with no selections reports null safety metrics", () => {
  const rows = [candidate(1, 1, 100, true)];
  const result = evaluateRanking(rows, { modelName: "ABSTAIN", scorer: () => null });
  assert.equal(result.byK[10].selections, 0);
  assert.equal(result.byK[10].precision, null);
  assert.equal(result.byK[10].catastrophicLossRate, null);
  assert.equal(result.byK[10].abstentionRate, 1);
});
