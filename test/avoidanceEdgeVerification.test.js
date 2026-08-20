import test from "node:test";
import assert from "node:assert/strict";

import { buildOutcomeExamples } from "../src/learning/outcomeCalibrationEngine.js";
import { buildAvoidanceEdgeVerificationReport } from "../src/learning/avoidanceEdgeVerificationLab.js";

const TOKEN = "0x1111111111111111111111111111111111111111";

function exactExamples(cohorts = 3) {
  const rows = [];
  for (let cohort = 0; cohort < cohorts; cohort += 1) {
    const scannedAt = new Date(Date.UTC(2026, 0, 1, cohort)).toISOString();
    for (let index = 0; index < 20; index += 1) {
      rows.push({
        key: `base:0x${(cohort * 100 + index + 1).toString(16).padStart(40, "0")}`,
        scannedAt,
        outcomeAt: "2026-01-08T00:00:00.000Z",
        horizonHours: 168,
        scores: { richToken: 80 },
        primaryChangePct: -40 - cohort,
        outcomeProvenance: { verificationStatus: "EXACT_CHAIN_TOKEN_POOL_MATCH" },
      });
    }
    for (let index = 0; index < 30; index += 1) {
      rows.push({
        key: `base:0x${(cohort * 100 + index + 51).toString(16).padStart(40, "0")}`,
        scannedAt,
        outcomeAt: "2026-01-08T00:00:00.000Z",
        horizonHours: 168,
        scores: { richToken: 40 },
        primaryChangePct: cohort,
        outcomeProvenance: { verificationStatus: "EXACT_CHAIN_TOKEN_POOL_MATCH" },
      });
    }
  }
  return rows;
}

test("avoidance verification requires exact provider outcome provenance", () => {
  const memory = [{
    identityKey: `base:${TOKEN}`,
    scannedAt: "2026-01-01T00:00:00.000Z",
    market: { priceUsd: 1 },
    scores: { richToken: 80 },
  }];
  const unverified = [{
    key: `base:${TOKEN}`,
    timestamp: "2026-01-08T00:00:00.000Z",
    priceUsd: 0.5,
  }];
  const verified = [{
    ...unverified[0],
    provenance: { verificationStatus: "EXACT_CHAIN_TOKEN_POOL_MATCH" },
  }];
  assert.equal(buildOutcomeExamples(memory, unverified, [168], {
    requireVerifiedOutcomeProvenance: true,
  }).length, 0);
  assert.equal(buildOutcomeExamples(memory, verified, [168], {
    requireVerifiedOutcomeProvenance: true,
  }).length, 1);
});

test("replicated 168h exclusion effect can verify without creating a buy", () => {
  const report = buildAvoidanceEdgeVerificationReport({
    examples: exactExamples(),
    bootstrapReplicates: 500,
    writeReport: false,
  });
  assert.equal(report.state, "VERIFIED_SAME_REGIME_AVOIDANCE_EDGE");
  assert.equal(report.verifiedEdges[0].signal, "richToken");
  assert.ok(report.verifiedEdges[0].projectClusteredBootstrap95.lower95Pct > 0);
  assert.ok(report.verifiedEdges[0].latestCohort.clusteredBootstrap95.lower95Pct > 0);
  assert.equal(report.buySignalCreated, false);
  assert.equal(report.picksForced, false);
  assert.equal(report.automaticExclusionAllowed, false);
  assert.equal(report.crossRegimeVerified, false);
});

test("an effect without three mature cohorts remains unverified", () => {
  const report = buildAvoidanceEdgeVerificationReport({
    examples: exactExamples(2),
    bootstrapReplicates: 500,
    writeReport: false,
  });
  assert.equal(report.state, "NO_VERIFIED_AVOIDANCE_EDGE");
  const richToken = report.signals.find((signal) => signal.signal === "richToken");
  assert.ok(richToken.blockers.includes("NEED_MORE_SCAN_COHORTS"));
});

test("avoidance verification rejects injected non-exact and wrong-horizon examples", () => {
  const exact = exactExamples();
  const report = buildAvoidanceEdgeVerificationReport({
    examples: [
      ...exact,
      { ...exact[0], horizonHours: 24 },
      {
        ...exact[0],
        outcomeProvenance: { verificationStatus: "UNKNOWN" },
      },
    ],
    bootstrapReplicates: 500,
  });

  assert.equal(report.exactProviderOutcomeExamples, exact.length);
});
