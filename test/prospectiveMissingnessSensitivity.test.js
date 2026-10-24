import test from "node:test";
import assert from "node:assert/strict";
import { freezeProspectiveEdgeCohort } from "../src/production/prospectiveEdgeCohortLedger.js";
import { buildExactMarketObservation } from "../src/production/exactMarketObservationLedger.js";
import { gradeIntegrityScopedProspectiveEdgeCohorts } from "../src/production/integrityScopedProspectiveEdgeGrader.js";

const AS_OF = "2026-05-01T00:00:00.000Z";
const address = value => `0x${value.toString(16).padStart(40, "0")}`;
const route = row => `${row.chain}:${row.tokenAddress}:${row.poolAddress}`;

function evidence({ adverse = true, immature = false, extraTreatments = 0, treatmentPrice = 1.41, controlPrice = 1.06 } = {}) {
  const episodes = [], observations = [];
  function add(cohort, treatmentIds, controlIds, now, pending = false) {
    const sourceObservedAt = new Date(Date.parse(now) - 600_000).toISOString();
    const candidate = id => ({
      chain: "base", tokenAddress: address(id), poolAddress: address(id + 100_000),
      sourceObservedAt, priceUsd: 1, marketCapUsd: 10_000_000, liquidityUsd: 500_000,
      volume24hUsd: 1_000_000, evidenceCoveragePct: 90, riskScore: 20, priceChange24hPct: 3,
      roundTripExecutionCostBps: 100, executionReferenceSizeUsd: 500,
      executionCostProvenance: "SYNTHETIC_MISSINGNESS_FIXTURE_NOT_LIVE_EVIDENCE",
    });
    const treatments = treatmentIds.map(candidate), controls = controlIds.map(candidate);
    const frozen = freezeProspectiveEdgeCohort(treatments, controls, {
      now, sourceObservedAt, existingEpisodes: [], requireRowSourceObservedAt: true,
      maxControls: 2, maximumSelections: 7,
      codeCommitSha: "0123456789abcdef0123456789abcdef01234567",
      configFingerprint: "fixed-missing-control-sensitivity-fixture",
      reservedControlsByTreatment: Object.fromEntries(treatments.map((row, index) => [
        route(row), treatments.length === 1 ? controls.map(route) : [route(controls[index])],
      ])),
    });
    assert.equal(frozen.episodes.length, treatments.length + controls.length);
    episodes.push(...frozen.episodes);
    if (pending) return;
    for (const episode of frozen.episodes) {
      const priceUsd = cohort === 36
        ? episode.role === "TREATMENT" ? 0.01 : episode.tokenAddress === address(60_002) ? 200 : 1.06
        : episode.role === "TREATMENT" ? treatmentPrice : controlPrice;
      const observation = buildExactMarketObservation({
        chain: episode.chain, tokenAddress: episode.tokenAddress, poolAddress: episode.poolAddress,
        observedAt: new Date(Date.parse(now) + 86_400_000).toISOString(),
        priceUsd, source: "synthetic-missingness-fixture",
      }, { asOf: AS_OF });
      assert.ok(observation);
      observations.push(observation);
    }
  }
  for (let cohort = 0; cohort < 36; cohort += 1) {
    add(cohort, Array.from({ length: 7 }, (_, index) => cohort * 7 + index + 1),
      Array.from({ length: 7 }, (_, index) => 50_001 + cohort * 7 + index),
      new Date(Date.UTC(2026, 0, 1 + cohort * 2)).toISOString());
  }
  if (adverse) add(36, [60_000], [60_001, 60_002], "2026-03-14T00:00:00.000Z");
  if (immature) add(37, [70_000], [70_001, 70_002], "2026-04-30T23:00:00.000Z", true);
  if (extraTreatments) add(38, Array.from({ length: extraTreatments }, (_, index) => 80_000 + index),
    Array.from({ length: extraTreatments }, (_, index) => 90_000 + index), "2026-03-18T00:00:00.000Z");
  return { episodes, observations };
}

const complete = evidence();
const positive = evidence({ adverse: false });

function omit(input, ...tokenIds) {
  const tokens = new Set(tokenIds.map(address));
  return { episodes: input.episodes, observations: input.observations.filter(row => !tokens.has(row.tokenAddress)) };
}

function grade(input, options = {}) {
  const original = JSON.stringify(input);
  const report = gradeIntegrityScopedProspectiveEdgeCohorts(input.episodes, input.observations, {
    asOf: AS_OF, requireObservationLedgerIntegrity: true, ...options,
  });
  assert.equal(JSON.stringify(input), original, "Grading must not rewrite frozen policies, observations or hashes");
  assert.equal(report.inputAudit.currentStrategyLedgerIntegrityPass, true);
  assert.equal(report.current.gates.minimumResolvedPairs, 250);
  assert.equal(report.current.gates.minimumPairCaptureRate, 0.95);
  assert.equal(report.current.gates.minimumEpisodeCaptureRate, 0.95);
  assert.equal(report.current.sequentialInference.checkpointPairCount, 250);
  assert.equal(report.automaticTrading, false);
  assert.equal(report.automaticPromotion, false);
  return report;
}

function assertOtherGates(report) {
  for (const field of ["enoughData", "capturePass", "executionCostPass", "matchQualityPass",
    "replicationPass", "returnVerified", "hitVerified", "catastropheSafe"]) {
    assert.equal(report.current.gates[field], true, field);
  }
}

test("a complete mature valid fixture still verifies under the original frozen policy", () => {
  const report = grade(positive);
  assertOtherGates(report);
  assert.equal(report.certificateEligible, true);
  assert.equal(report.current.sample.totalResolvedMatchedPairs, 252);
  const sensitivity = report.current.missingnessSensitivity;
  assert.equal(sensitivity.returnBoundProven, true);
  assert.equal(sensitivity.unresolvedOrIncompletePairs, 0);
  assert.equal(sensitivity.incompletePairs.length, 0);
  assert.equal(sensitivity.worstCaseAverageNetReturnEdgePct, report.current.interimSafety.averageNetReturnEdgePct);
  assert.equal(sensitivity.pass, true);
});

test("deleting a required control cannot resurrect a revoked mature certificate", t => {
  const before = grade(complete);
  const after = grade(omit(complete, 60_002));
  assertOtherGates(before);
  assertOtherGates(after);
  assert.equal(before.current.interimSafety.pass, false);
  assert.equal(before.certificateEligible, false);
  assert.equal(after.certificateEligible, false);
  assert.ok(after.current.capture.pairCaptureRate >= 0.95);
  assert.ok(after.current.capture.episodeCaptureRate >= 0.95);
  const sensitivity = after.current.missingnessSensitivity;
  assert.equal(sensitivity.state, "UNBOUNDED_MISSING_CONTROL_RETURN");
  assert.equal(sensitivity.returnBoundProven, false);
  assert.equal(sensitivity.worstCaseAverageNetReturnEdgePct, null);
  assert.equal(sensitivity.matureTreatments, 253);
  assert.equal(sensitivity.fullyResolvedPairs, 252);
  assert.equal(sensitivity.unresolvedOrIncompletePairs, 1);
  assert.deepEqual(sensitivity.treatmentOutcomes, {
    observed: 253, missing: 0, catastrophicLosses: 1,
  });
  assert.deepEqual(sensitivity.controlOutcomes, { frozen: 254, observed: 253, missing: 1 });
  const partial = sensitivity.incompletePairs[0];
  assert.equal(partial.treatmentOutcome.tokenAddress, address(60_000));
  assert.equal(partial.treatmentOutcome.netReturnPct, -100);
  assert.equal(partial.treatmentOutcome.catastrophicLoss, true);
  assert.equal(partial.missingControlCount, 1);
  assert.equal(partial.returnLowerBoundPct, null);
  assert.equal(partial.worstCaseHitRateEdge, -0.5);
  assert.equal(partial.appliedHitRateEdge, -1);
  assert.equal(partial.appliedCatastrophicLossDelta, 1);
  assert.equal(partial.controls.find(row => row.episodeId === complete.episodes.at(-1).episodeId).outcome, null);
  assert.equal(sensitivity.pass, false);
  assert.ok(after.current.blockers.includes("MISSING_CONTROL_RETURN_SENSITIVITY_UNBOUNDED"));
  assert.ok(after.current.blockers.includes("MISSING_OUTCOME_WORST_CASE_SENSITIVITY_FAILED"));
  t.diagnostic(JSON.stringify({ beforeEligible: before.certificateEligible, afterEligible: after.certificateEligible,
    completeEdgePct: before.current.interimSafety.averageNetReturnEdgePct,
    pairCaptureRate: after.current.capture.pairCaptureRate, sensitivityState: sensitivity.state,
    observedAdverseTreatmentReturnPct: partial.treatmentOutcome.netReturnPct }));
});

test("all controls missing retains an observed adverse treatment without manufacturing a comparison", () => {
  const report = grade(omit(complete, 60_001, 60_002));
  assertOtherGates(report);
  const sensitivity = report.current.missingnessSensitivity;
  assert.equal(report.certificateEligible, false);
  assert.equal(sensitivity.controlOutcomes.missing, 2);
  assert.equal(sensitivity.treatmentOutcomes.catastrophicLosses, 1);
  assert.equal(sensitivity.incompletePairs[0].treatmentOutcome.netReturnPct, -100);
  assert.ok(sensitivity.incompletePairs[0].controls.every(row => row.outcome === null));
  assert.equal(sensitivity.incompletePairs[0].worstCaseHitRateEdge, -1);
  assert.equal(sensitivity.incompletePairs[0].worstCaseCatastrophicLossDelta, 1);
  assert.equal(sensitivity.worstCaseAverageNetReturnEdgePct, null);
});

test("missing both sides remains unknown and every mature treatment stays in the denominator", () => {
  const report = grade(omit(complete, 60_000, 60_001, 60_002));
  const sensitivity = report.current.missingnessSensitivity;
  assert.equal(report.certificateEligible, false);
  assert.equal(sensitivity.matureTreatments, 253);
  assert.equal(sensitivity.fullyResolvedPairs + sensitivity.unresolvedOrIncompletePairs, 253);
  assert.deepEqual(sensitivity.treatmentOutcomes, { observed: 252, missing: 1, catastrophicLosses: 0 });
  assert.equal(sensitivity.incompletePairs[0].treatmentOutcome, null);
  assert.equal(sensitivity.incompletePairs[0].returnLowerBoundPct, null);
});

test("even an otherwise positive strategy cannot certify an unbounded missing control return", () => {
  const report = grade(omit(positive, 50_001));
  assertOtherGates(report);
  assert.equal(report.current.interimSafety.pass, true);
  assert.equal(report.current.missingnessSensitivity.returnBoundProven, false);
  assert.equal(report.certificateEligible, false);
});

test("missing treatment bounds use observed control returns rather than the fixed -200 placeholder", () => {
  const report = grade(omit(complete, 60_000));
  assertOtherGates(report);
  const sensitivity = report.current.missingnessSensitivity;
  assert.equal(sensitivity.returnBoundProven, true);
  assert.equal(sensitivity.incompletePairs[0].treatmentOutcome, null);
  assert.equal(sensitivity.incompletePairs[0].returnLowerBoundPct, -10_053);
  assert.ok(sensitivity.worstCaseAverageNetReturnEdgePct < 0);
  assert.equal(report.certificateEligible, false);
  assert.ok(!report.current.blockers.includes("MISSING_CONTROL_RETURN_SENSITIVITY_UNBOUNDED"));
});

test("a proven missing-treatment bound may pass without tightening the 95-percent capture threshold", () => {
  const report = grade(omit(positive, 1));
  assertOtherGates(report);
  const sensitivity = report.current.missingnessSensitivity;
  assert.equal(report.current.capture.pairCaptureRate, 251 / 252);
  assert.equal(sensitivity.returnBoundProven, true);
  assert.equal(sensitivity.incompletePairs[0].treatmentOutcome, null);
  assert.equal(sensitivity.incompletePairs[0].returnLowerBoundPct, -106);
  assert.equal(sensitivity.incompletePairs[0].appliedReturnLowerBoundPct, -200);
  assert.equal(sensitivity.pass, true);
  assert.equal(report.certificateEligible, true);
});

test("a missing treatment cannot certify by weakening the original V1 sensitivity penalties", t => {
  const input = evidence({ adverse: false, extraTreatments: 5, treatmentPrice: 1.27, controlPrice: 1.21 });
  const report = grade(omit(input, 80_000, 80_001, 80_002, 80_003, 80_004));
  assertOtherGates(report);
  assert.equal(report.current.interimSafety.pass, true);
  const sensitivity = report.current.missingnessSensitivity;
  assert.equal(sensitivity.matureTreatments, 257);
  assert.equal(sensitivity.fullyResolvedPairs, 252);
  assert.equal(sensitivity.unresolvedOrIncompletePairs, 5);
  assert.equal(sensitivity.returnBoundProven, true);
  const v1Return = (252 * report.current.interimSafety.averageNetReturnEdgePct - 5 * 200) / 257;
  const v1Hit = (252 * report.current.interimSafety.hitRateEdge - 5) / 257;
  const v1Catastrophe = (252 * report.current.interimSafety.catastrophicLossDelta + 5) / 257;
  assert.ok(v1Return < 3);
  assert.equal(sensitivity.worstCaseAverageNetReturnEdgePct, v1Return);
  assert.equal(sensitivity.worstCaseHitRateEdge, v1Hit);
  assert.equal(sensitivity.worstCaseCatastrophicLossDelta, v1Catastrophe);
  assert.ok(sensitivity.provenAverageNetReturnEdgeLowerBoundPct > 3);
  assert.equal(sensitivity.pass, false);
  assert.equal(report.certificateEligible, false);
  for (const pair of sensitivity.incompletePairs) {
    assert.equal(pair.treatmentOutcome, null);
    assert.ok(pair.returnLowerBoundPct > -200);
    assert.equal(pair.appliedReturnLowerBoundPct, -200);
    assert.equal(pair.worstCaseHitRateEdge, 0);
    assert.equal(pair.appliedHitRateEdge, -1);
    assert.equal(pair.appliedCatastrophicLossDelta, 1);
  }
  t.diagnostic(JSON.stringify({ provenReturnBoundPct: sensitivity.provenAverageNetReturnEdgeLowerBoundPct,
    appliedV1ConservativeReturnBoundPct: sensitivity.worstCaseAverageNetReturnEdgePct,
    eligible: report.certificateEligible }));
});

test("incomplete report limits cannot shrink denominators or hide observed catastrophic-loss totals", () => {
  const report = grade(omit(complete, 50_001, 50_002, 60_002), { reportPairLimit: 1.9 });
  assertOtherGates(report);
  const sensitivity = report.current.missingnessSensitivity;
  assert.equal(sensitivity.matureTreatments, 253);
  assert.equal(sensitivity.fullyResolvedPairs, 250);
  assert.equal(sensitivity.unresolvedOrIncompletePairs, 3);
  assert.equal(sensitivity.controlOutcomes.missing, 3);
  assert.equal(sensitivity.treatmentOutcomes.catastrophicLosses, 1);
  assert.equal(sensitivity.incompletePairs.length, 1);
  assert.equal(sensitivity.incompletePairsOmitted, 2);
  assert.equal(sensitivity.incompletePairs[0].treatmentOutcome.netReturnPct, -100);
  assert.equal(report.certificateEligible, false);
});

test("unmatured cohorts do not count as missing outcomes or alter mature sensitivity denominators", () => {
  const input = evidence({ adverse: false, immature: true });
  const report = grade(input);
  assertOtherGates(report);
  assert.equal(report.current.sample.frozenTreatments, 253);
  assert.equal(report.current.missingnessSensitivity.matureTreatments, 252);
  assert.equal(report.current.missingnessSensitivity.controlOutcomes.frozen, 252);
  assert.equal(report.current.missingnessSensitivity.unresolvedOrIncompletePairs, 0);
  assert.equal(report.current.missingnessSensitivity.pass, true);
  assert.equal(report.certificateEligible, true);
});
