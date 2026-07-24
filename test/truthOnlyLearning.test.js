import test from "node:test";
import assert from "node:assert/strict";

import { buildTrainingSet } from "../src/engines/outcomeLearningEngine.js";
import { buildOutcomeExamples } from "../src/learning/outcomeCalibrationEngine.js";

test("outcome learning does not convert a high scanner score into a synthetic winner", () => {
  const memory = [
    {
      id: "base:score-only",
      name: "Score Only",
      symbol: "SCORE",
      scannedAt: "2026-01-01T00:00:00.000Z",
      scores: { pipeline: 99, marketRank: 88 },
    },
  ];

  const trainingSet = buildTrainingSet(memory, []);

  assert.equal(trainingSet.length, 0);
});

test("outcome learning labels by future price path, not scanner-score movement", () => {
  const memory = [
    {
      id: "base:truth",
      name: "Truth Token",
      symbol: "TRUE",
      scannedAt: "2026-01-01T00:00:00.000Z",
      scores: { pipeline: 20, marketRank: 82 },
    },
  ];
  const snapshots = [
    {
      key: "base:truth",
      timestamp: "2026-01-01T00:00:00.000Z",
      name: "Truth Token",
      symbol: "TRUE",
      priceUsd: 1,
      marketCap: 1_000_000,
      liquidityUsd: 100_000,
      score: 20,
    },
    {
      key: "base:truth",
      timestamp: "2026-01-02T00:00:00.000Z",
      name: "Truth Token",
      symbol: "TRUE",
      priceUsd: 0.6,
      marketCap: 1_500_000,
      liquidityUsd: 200_000,
      score: 99,
    },
  ];

  const [sample] = buildTrainingSet(memory, snapshots);

  assert.equal(sample.label, "trap");
  assert.equal(sample.outcomePct, -40);
  assert.equal(sample.outcomeSource, "PRICE_ONLY_POINT_IN_TIME_SNAPSHOT");
});

test("outcome calibration ignores score deltas when assigning result labels", () => {
  const memory = [
    {
      key: "base:calibration",
      name: "Calibration Token",
      symbol: "CAL",
      scannedAt: "2026-01-01T00:00:00.000Z",
      market: { priceUsd: 1, marketCap: 1_000_000, liquidityUsd: 100_000 },
      scores: { pipeline: 10, marketRank: 90 },
    },
  ];
  const snapshots = [
    {
      key: "base:calibration",
      timestamp: "2026-01-02T00:00:00.000Z",
      name: "Calibration Token",
      symbol: "CAL",
      priceUsd: 0.6,
      marketCap: 1_900_000,
      liquidityUsd: 300_000,
      score: 99,
    },
  ];

  const [example] = buildOutcomeExamples(memory, snapshots, [24]);

  assert.equal(example.outcomeLabel, "major_loser");
  assert.equal(example.primaryChangePct, -40);
  assert.equal(example.scannerScoreDeltaIgnored, 89);
  assert.equal(example.outcomeBasis, "PRICE_ONLY_POINT_IN_TIME_SNAPSHOT");
});
