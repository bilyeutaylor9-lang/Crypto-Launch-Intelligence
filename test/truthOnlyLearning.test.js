import test from "node:test";
import assert from "node:assert/strict";

import {
  analyzeOutcomeLearning,
  buildTrainingSet,
} from "../src/engines/outcomeLearningEngine.js";
import { analyzeOutcomeCalibration } from "../src/engines/outcomeCalibrationEngine.js";
import {
  buildOutcomeCalibrationReport,
  buildOutcomeExamples,
} from "../src/learning/outcomeCalibrationEngine.js";

const ADDRESS_TRUTH = `0x${"1".repeat(40)}`;
const ADDRESS_CALIBRATION = `0x${"2".repeat(40)}`;
const ADDRESS_LATE = `0x${"3".repeat(40)}`;
const SOLANA_CASE_SENSITIVE_MINT = "2TzuVRtMwZmSYsPCkw8nvhQnkCdDPNeGZQCoj5Evpump";

function addressFor(index = 0) {
  return `0x${index.toString(16).padStart(40, "0")}`;
}

test("outcome learning does not convert a high scanner score into a synthetic winner", () => {
  const memory = [
    {
      id: `base:${addressFor(4)}`,
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
      id: `base:${ADDRESS_TRUTH}`,
      name: "Truth Token",
      symbol: "TRUE",
      scannedAt: "2026-01-01T00:00:00.000Z",
      market: { priceUsd: 1, marketCap: 1_000_000, liquidityUsd: 100_000 },
      scores: { pipeline: 20, marketRank: 82 },
    },
  ];
  const snapshots = [
    {
      key: `base:${ADDRESS_TRUTH}`,
      timestamp: "2026-01-01T00:00:00.000Z",
      name: "Truth Token",
      symbol: "TRUE",
      priceUsd: 1,
      marketCap: 1_000_000,
      liquidityUsd: 100_000,
      score: 20,
    },
    {
      key: `base:${ADDRESS_TRUTH}`,
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
      key: `base:${ADDRESS_CALIBRATION}`,
      name: "Calibration Token",
      symbol: "CAL",
      scannedAt: "2026-01-01T00:00:00.000Z",
      market: { priceUsd: 1, marketCap: 1_000_000, liquidityUsd: 100_000 },
      scores: { pipeline: 10, marketRank: 90 },
    },
  ];
  const snapshots = [
    {
      key: `base:${ADDRESS_CALIBRATION}`,
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

test("outcome calibration joins scan memory by exact chain-scoped identity", () => {
  const memory = [
    {
      id: SOLANA_CASE_SENSITIVE_MINT,
      identityKey: `solana:${SOLANA_CASE_SENSITIVE_MINT}`,
      chain: "solana",
      symbol: "CASE",
      scannedAt: "2026-01-01T00:00:00.000Z",
      market: { priceUsd: 1 },
      scores: { pipeline: 50, marketRank: 70 },
    },
  ];
  const snapshots = [
    {
      key: `solana:${SOLANA_CASE_SENSITIVE_MINT}`,
      timestamp: "2026-01-02T00:00:00.000Z",
      priceUsd: 1.25,
    },
  ];

  const examples = buildOutcomeExamples(memory, snapshots, [24]);

  assert.equal(examples.length, 1);
  assert.equal(examples[0].key, `solana:${SOLANA_CASE_SENSITIVE_MINT}`);
});

test("symbol-only memory cannot enter outcome calibration", () => {
  const examples = buildOutcomeExamples(
    [
      {
        id: "unknown:collide",
        chain: "base",
        symbol: "COLLIDE",
        scannedAt: "2026-01-01T00:00:00.000Z",
        market: { priceUsd: 1 },
        scores: { marketRank: 90 },
      },
    ],
    [
      {
        key: `base:${ADDRESS_TRUTH}`,
        timestamp: "2026-01-02T00:00:00.000Z",
        priceUsd: 2,
      },
    ],
    [24]
  );

  assert.equal(examples.length, 0);
});

test("far-late observations cannot masquerade as short-horizon outcomes", () => {
  const examples = buildOutcomeExamples(
    [
      {
        id: `base:${ADDRESS_LATE}`,
        scannedAt: "2026-01-01T00:00:00.000Z",
        market: { priceUsd: 1 },
        scores: { marketRank: 90 },
      },
    ],
    [
      {
        key: `base:${ADDRESS_LATE}`,
        timestamp: "2026-01-03T00:00:00.000Z",
        priceUsd: 3,
      },
    ],
    [1]
  );

  assert.equal(examples.length, 0);
});

test("positive calibration weight requires a validated independent edge", () => {
  const baseReport = {
    totalExamples: 100,
    uniqueProjects: 30,
    hitRate: 55,
    missRate: 20,
    avgOutcomePct: 4,
    validatedEdgeSignals: [],
    signalCalibration: [
      {
        key: "marketRank",
        samples: 80,
        uniqueProjects: 30,
        reliability: 70,
        edgeStatus: "INSUFFICIENT_INDEPENDENT_SAMPLE",
      },
    ],
  };
  const project = { marketRankScore: 90 };
  const blocked = analyzeOutcomeCalibration(project, { report: baseReport });
  const validatedReport = {
    ...baseReport,
    validatedEdgeSignals: [{ key: "marketRank" }],
    signalCalibration: [
      {
        ...baseReport.signalCalibration[0],
        edgeStatus: "VALIDATED_DIRECTIONAL_EDGE",
        hitRate: 60,
        falsePositiveRate: 10,
        weightMultiplier: 1.1,
      },
    ],
  };
  const validated = analyzeOutcomeCalibration(project, { report: validatedReport });

  assert.equal(blocked.calibrationAdjustment, 0);
  assert.ok(validated.calibrationAdjustment > 0);
});

test("validated contradiction can only subtract calibration weight", () => {
  const contradictedReport = {
    totalExamples: 100,
    uniqueProjects: 30,
    hitRate: 20,
    missRate: 30,
    avgOutcomePct: -2,
    edgeState: "NO_EDGE_EVIDENCE",
    validatedEdgeSignals: [],
    contradictedEdgeSignals: [{ key: "richToken" }],
    signalCalibration: [
      {
        key: "richToken",
        samples: 68,
        uniqueProjects: 34,
        reliability: 46,
        hitRate: 12,
        falsePositiveRate: 18,
        directionalReturnEdgePct: -4.55,
        weightMultiplier: 0.96,
        scoreAdjustment: -1,
        edgeStatus: "CONTRADICTED_DIRECTIONAL_EDGE",
      },
      {
        key: "risk",
        samples: 68,
        uniqueProjects: 34,
        reliability: 60,
        hitRate: 40,
        falsePositiveRate: 10,
        directionalReturnEdgePct: -5,
        weightMultiplier: 1.1,
        scoreAdjustment: 1,
        edgeStatus: "CONTRADICTED_DIRECTIONAL_EDGE",
      },
    ],
  };
  const result = analyzeOutcomeCalibration(
    { richTokenScore: 90, riskScore: 90 },
    { report: contradictedReport }
  );

  assert.ok(result.calibrationAdjustment < 0);
  assert.equal(result.calibrationSignals.length, 0);
  assert.equal(result.calibrationRiskSignals.length, 1);
  assert.equal(result.calibrationRiskSignals[0].key, "richToken");
  assert.equal(
    result.calibrationRiskSignals.some((signal) => signal.key === "risk"),
    false
  );
});

test("promising but under-sampled edge remains a zero-weight shadow hypothesis", () => {
  const memory = Array.from({ length: 20 }, (_, index) => ({
    identityKey: `base:${addressFor(index + 10)}`,
    scannedAt: "2026-01-01T00:00:00.000Z",
    market: { priceUsd: 1 },
    scores: { momentumShift: index < 10 ? 80 : 40 },
  }));
  const snapshots = Array.from({ length: 20 }, (_, index) => ({
    key: `base:${addressFor(index + 10)}`,
    timestamp: "2026-01-02T00:00:00.000Z",
    priceUsd: index < 10 ? 1.5 : 0.9,
  }));
  const report = buildOutcomeCalibrationReport({ memory, snapshots, horizons: [24] });
  const result = analyzeOutcomeCalibration({ momentumShiftScore: 90 }, { report });
  const hypothesis = report.shadowEdgeHypotheses.find(
    (signal) => signal.key === "momentumShift"
  );

  assert.equal(report.edgeState, "SHADOW_HYPOTHESES_ONLY");
  assert.equal(hypothesis.status, "SHADOW_ONLY");
  assert.equal(hypothesis.scoreAdjustment, 0);
  assert.equal(hypothesis.mayAffectFinalDecision, false);
  assert.ok(hypothesis.validationGaps.uniqueProjectsNeeded > 0);
  assert.equal(result.calibrationAdjustment, 0);
  assert.equal(result.calibrationShadowSignals[0].key, "momentumShift");
  assert.equal(result.calibrationShadowSignals[0].mayAffectFinalDecision, false);
});

test("outcome learning remains neutral below its independent-project minimum", () => {
  const result = analyzeOutcomeLearning(
    { marketRankScore: 90 },
    {
      minimumSamples: 20,
      trainingSet: Array.from({ length: 19 }, (_, index) => ({
        key: `base:project-${index}`,
        vector: { marketRank: 90 },
        label: "winner",
        outcomePct: 50,
      })),
    }
  );

  assert.equal(result.outcomeLearningScore, 50);
  assert.equal(result.outcomeLearning.learningStatus, "INSUFFICIENT_INDEPENDENT_SAMPLE");
});

test("calibration report exposes independent edge qualification state", () => {
  const report = buildOutcomeCalibrationReport({ memory: [], snapshots: [] });

  assert.equal(report.identityJoinPolicy, "EXACT_CHAIN_SCOPED_IDENTITY_ONLY");
  assert.equal(report.edgeState, "NO_EDGE_EVIDENCE");
  assert.equal(report.validatedEdgeSignals.length, 0);
  assert.equal(report.avoidanceEdgeSignals.length, 0);
  assert.equal(report.edgeQualificationPolicy.minimumUniqueProjects, 20);
});
