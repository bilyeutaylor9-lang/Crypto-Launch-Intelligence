import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

import {
  canonicalJson,
  stableHash,
} from "../src/production/productionMath.js";
import {
  __prospectiveEdgeGraderHooks,
} from "../src/production/prospectiveEdgeCohortGrader.js";
import {
  __integrityScopedProspectiveEdgeGraderHooks,
  gradeIntegrityScopedProspectiveEdgeCohorts,
} from "../src/production/integrityScopedProspectiveEdgeGrader.js";
import {
  freezeProspectiveEdgeCohort,
  predictionContractIntegrityHash,
  prospectiveEpisodeIntegrityHash,
  sealProspectiveEdgeEpisode,
} from "../src/production/prospectiveEdgeCohortLedger.js";
import { buildExactMarketObservation } from "../src/production/exactMarketObservationLedger.js";

const AS_OF = "2026-02-01T00:00:00.000Z";

function address(value) {
  return `0x${Number(value).toString(16).padStart(40, "0")}`;
}

function candidate(index) {
  return {
    chain: "base",
    tokenAddress: address(index),
    poolAddress: address(index + 100_000),
    sourceObservedAt: "2026-01-01T00:00:00.000Z",
    priceUsd: 1,
    marketCapUsd: 10_000_000,
    liquidityUsd: 500_000,
    volume24hUsd: 1_000_000,
    evidenceCoveragePct: 80,
    riskScore: 20,
    priceChange24hPct: 3,
    roundTripExecutionCostBps: 100,
    executionReferenceSizeUsd: 100,
    executionCostProvenance: "TEST_FROZEN_QUOTE",
    portfolioResearchScore: 80,
    probability25Pct: 70,
    probability50Pct: 45,
    probability100Pct: 15,
    probabilityLoss20Pct: 12,
  };
}

function frozenCohort({ index = 1, now = "2026-01-01T00:10:00.000Z", controlPoolDefinition } = {}) {
  const sourceObservedAt = new Date(Date.parse(now) - 10 * 60_000).toISOString();
  const treatment = { ...candidate(index), sourceObservedAt };
  const control = { ...candidate(index + 1), sourceObservedAt };
  const cohort = freezeProspectiveEdgeCohort(
    [treatment],
    [control],
    {
      now,
      sourceObservedAt,
      existingEpisodes: [],
      requireRowSourceObservedAt: true,
      maximumSourceAgeMinutes: 30,
      maxControls: 1,
      codeCommitSha: "0123456789abcdef0123456789abcdef01234567",
      configFingerprint: `integrity-scope-${index}`,
      controlPoolDefinition,
    },
  );
  assert.equal(cohort.state, "PROSPECTIVE_EDGE_COHORT_FROZEN");
  return cohort.episodes;
}

function reverseObjectKeys(value) {
  if (Array.isArray(value)) return value.map(reverseObjectKeys);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value)
      .reverse()
      .map(([key, item]) => [key, reverseObjectKeys(item)]));
  }
  return value;
}

function legacyHash(value) {
  return crypto.createHash("sha256")
    .update(typeof value === "string" ? value : JSON.stringify(value))
    .digest("hex");
}

function legacyOrderDamagedEpisodes(rows) {
  const damaged = rows.map(reverseObjectKeys);
  const fingerprint = legacyHash(damaged[0].strategyDefinition);
  const treatment = damaged.find((row) => row.role === "TREATMENT");
  for (const row of damaged) {
    row.strategyFingerprint = fingerprint;
    row.frozenPrediction.strategyFingerprint = fingerprint;
  }
  const cohortId = legacyHash([
    "PROSPECTIVE_EDGE_COHORT_V1",
    treatment.decisionAt,
    fingerprint,
    treatment.runId,
  ].join("|")).slice(0, 40);
  treatment.cohortId = cohortId;
  treatment.episodeId = legacyHash([
    "PROSPECTIVE_EDGE_COHORT_MEMBER_V1",
    cohortId,
    "TREATMENT",
    treatment.routeKey,
    "ROOT",
  ].join("|")).slice(0, 40);
  for (const row of damaged.filter((entry) => entry.role === "CONTROL_MATCHED")) {
    row.cohortId = cohortId;
    row.parentTreatmentEpisodeId = treatment.episodeId;
    row.episodeId = legacyHash([
      "PROSPECTIVE_EDGE_COHORT_MEMBER_V1",
      cohortId,
      "CONTROL_MATCHED",
      row.routeKey,
      treatment.episodeId,
    ].join("|")).slice(0, 40);
  }
  for (const row of damaged) {
    row.frozenPrediction.featureSnapshotHash = legacyHash(row.frozenPrediction.featureSnapshot);
    const { contractIntegrityHash: _contractHash, ...contractPayload } = row.frozenPrediction;
    row.frozenPrediction.contractIntegrityHash = legacyHash(contractPayload);
    const { freezeIntegrityHash: _episodeHash, ...episodePayload } = row;
    row.freezeIntegrityHash = legacyHash(episodePayload);
  }
  return damaged;
}

function grade(episodes, observations = []) {
  return gradeIntegrityScopedProspectiveEdgeCohorts(episodes, observations, {
    asOf: AS_OF,
    horizonHours: 24,
    toleranceHours: 8,
    requireObservationLedgerIntegrity: true,
  });
}

test("canonical stable hashes ignore object-key order but preserve array and raw-string semantics", () => {
  assert.equal(stableHash({ a: 1, b: 2 }), stableHash({ b: 2, a: 1 }));
  assert.equal(stableHash({ x: { a: 1, b: 2 } }), stableHash({ x: { b: 2, a: 1 } }));
  assert.notEqual(stableHash(["a", "b"]), stableHash(["b", "a"]));
  const raw = "raw-string-id";
  assert.equal(stableHash(raw), crypto.createHash("sha256").update(raw).digest("hex"));
  assert.equal(canonicalJson({ b: undefined, a: [undefined, 1] }), '{"a":[null,1]}');
  assert.equal(canonicalJson({ retained: 1, omitted: { toJSON: () => undefined } }), '{"retained":1}');
});

test("a JSONB-style key reorder preserves frozen episode and prediction integrity", () => {
  const episodes = frozenCohort();
  for (const episode of episodes) {
    const reordered = reverseObjectKeys(episode);
    assert.deepEqual(
      __prospectiveEdgeGraderHooks.episodeIntegrityFailures(reordered, Date.parse(AS_OF), {}),
      [],
    );
    assert.equal(predictionContractIntegrityHash(reordered.frozenPrediction), reordered.frozenPrediction.contractIntegrityHash);
    assert.equal(prospectiveEpisodeIntegrityHash(reordered), reordered.freezeIntegrityHash);
  }
});

test("the V4 exact signal control pool remains subject to the full integrity policy", () => {
  const report = grade(frozenCohort({
    index: 5,
    controlPoolDefinition: "FRESH_EXACT_SIGNAL_ELIGIBLE_UNIVERSE_V4",
  }));
  assert.equal(report.inputAudit.currentStrategyPartitionIntegrityPass, true);
  assert.equal(report.inputAudit.episodeIntegrityFailureCounts.INVALID_CONTROL_POOL_DEFINITION, undefined);
  assert.equal(report.certificateEligible, false);
});

test("legacy hash-only rows are quarantined without poisoning a newer valid strategy", () => {
  const historical = legacyOrderDamagedEpisodes(frozenCohort({ index: 10, now: "2025-12-01T00:10:00.000Z" }));
  const current = frozenCohort({ index: 20 });
  const report = grade([...historical, ...current]);
  assert.equal(report.inputAudit.currentStrategyPartitionIntegrityPass, true);
  assert.equal(
    report.integrityScope.legacyHashOrderRowsQuarantined,
    historical.length,
    JSON.stringify(report.inputAudit.episodeIntegrityFailureCounts),
  );
  assert.equal(report.integrityScope.nonLegacyInvalidRowsObserved, 0);
  assert.notEqual(report.edgeState, "UNVERIFIED_PROSPECTIVE_LEDGER_INTEGRITY");
  assert.equal(report.certificateEligible, false);
});

test("non-hash historical corruption is not treated as legacy serialization damage", () => {
  const historical = legacyOrderDamagedEpisodes(frozenCohort({ index: 30, now: "2025-12-01T00:10:00.000Z" }))[0];
  historical.tokenAddress = address(999_999);
  const current = frozenCohort({ index: 40 });
  const report = grade([historical, ...current]);
  assert.equal(report.integrityScope.legacyHashOrderRowsQuarantined, 0);
  assert.equal(report.integrityScope.nonLegacyInvalidRowsObserved, 1);
  assert.equal(report.inputAudit.currentStrategyPartitionIntegrityPass, true);
});

test("current strategy corruption, duplicates, and parent source skew remain fail-closed", () => {
  const episodes = frozenCohort({ index: 50 });
  const mutated = structuredClone(episodes);
  mutated[0].signalPriceUsd = 99;
  assert.equal(grade(mutated).inputAudit.currentStrategyPartitionIntegrityPass, false);

  assert.equal(grade([...episodes, structuredClone(episodes[0])]).inputAudit.currentStrategyPartitionIntegrityPass, false);

  const skewed = structuredClone(episodes);
  const controlIndex = skewed.findIndex((row) => row.role === "CONTROL_MATCHED");
  skewed[controlIndex].sourceObservedAt = "2025-12-31T23:50:00.000Z";
  skewed[controlIndex].sourceAgeMinutesAtDecision = 20;
  skewed[controlIndex].frozenPrediction.sourceObservedAt = skewed[controlIndex].sourceObservedAt;
  skewed[controlIndex].frozenPrediction.contractIntegrityHash = predictionContractIntegrityHash(skewed[controlIndex].frozenPrediction);
  skewed[controlIndex] = sealProspectiveEdgeEpisode(skewed[controlIndex]);
  const skewReport = grade(skewed);
  assert.equal(skewReport.inputAudit.currentStrategyPartitionIntegrityPass, false);
  assert.ok(skewReport.integrityScope.currentTopologyFailureEpisodeIds.includes(skewed[controlIndex].episodeId));
});

test("invalid exact observations stay excluded and cannot improve proof capture", () => {
  const episodes = frozenCohort({ index: 60 });
  const treatment = episodes.find((row) => row.role === "TREATMENT");
  const invalid = buildExactMarketObservation({
    chain: treatment.chain,
    tokenAddress: treatment.tokenAddress,
    poolAddress: treatment.poolAddress,
    observedAt: "2026-01-02T00:10:00.000Z",
    priceUsd: 2,
    source: "integrity-test",
  }, { asOf: AS_OF });
  invalid.priceUsd = 999;
  const report = grade(episodes, [invalid]);
  assert.equal(report.inputAudit.observationIntegrityRowsQuarantined, 1);
  assert.equal(report.current.sample.resolvedMatchedPairs, 0);
  assert.equal(report.certificateEligible, false);
  assert.equal(report.automaticTrading, false);
  assert.equal(report.automaticPromotion, false);
});

test("scope helper identifies only the newest strategy partition", () => {
  const oldRows = frozenCohort({ index: 70, now: "2025-12-01T00:10:00.000Z" });
  const currentRows = frozenCohort({ index: 80 });
  const current = __integrityScopedProspectiveEdgeGraderHooks.currentStrategyRows(
    [...oldRows, ...currentRows],
    Date.parse(AS_OF),
  );
  assert.equal(current.rows.length, currentRows.length);
  assert.equal(current.fingerprint, currentRows[0].strategyFingerprint);
});
