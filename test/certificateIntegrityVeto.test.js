import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { freezeProspectiveEdgeCohort } from "../src/production/prospectiveEdgeCohortLedger.js";
import { buildExactMarketObservation } from "../src/production/exactMarketObservationLedger.js";
import { edgeCertificateIntegrityBlockers, runEdgeVerificationCycle } from "../src/ops/runEdgeVerificationProgram.js";

const AS_OF = "2026-05-01T00:00:00.000Z";
const address = value => `0x${value.toString(16).padStart(40, "0")}`;
const route = row => `${row.chain}:${row.tokenAddress}:${row.poolAddress}`;

function evidence() {
  const episodes = [], observations = [];
  for (let cohort = 0; cohort < 36; cohort++) {
    const now = new Date(Date.UTC(2026, 0, 1 + cohort * 2)).toISOString();
    const sourceObservedAt = new Date(Date.parse(now) - 600000).toISOString();
    const candidate = id => ({ chain: "base", tokenAddress: address(id), poolAddress: address(id + 100000),
      sourceObservedAt, priceUsd: 1, marketCapUsd: 1e7, liquidityUsd: 5e5, volume24hUsd: 1e6,
      evidenceCoveragePct: 90, riskScore: 20, priceChange24hPct: 3,
      roundTripExecutionCostBps: 100, executionReferenceSizeUsd: 500,
      executionCostProvenance: "SYNTHETIC_FROZEN_COST_FIXTURE_NOT_A_LIVE_EDGE",
      portfolioResearchScore: 80, probability25Pct: 70, probability50Pct: 45,
      probability100Pct: 15, probabilityLoss20Pct: 12 });
    const treatments = Array.from({ length: 7 }, (_, index) => candidate(cohort * 7 + index + 1));
    const controls = treatments.map((_, index) => candidate(cohort * 7 + index + 50001));
    const frozen = freezeProspectiveEdgeCohort(treatments, controls, { now, sourceObservedAt,
      existingEpisodes: [], requireRowSourceObservedAt: true, maxControls: 1, maximumSelections: 7,
      codeCommitSha: "c3adc485839d9bf6651cb3ed119740f70838221c", configFingerprint: "r1-fixed-synthetic-integrity-fixture",
      reservedControlsByTreatment: Object.fromEntries(treatments.map((row, index) => [route(row), [route(controls[index])]])) });
    assert.equal(frozen.episodes.length, 14, JSON.stringify(frozen.audit));
    episodes.push(...frozen.episodes);
    for (const episode of frozen.episodes) {
      const observation = buildExactMarketObservation({ chain: episode.chain, tokenAddress: episode.tokenAddress,
        poolAddress: episode.poolAddress, observedAt: new Date(Date.parse(now) + 24 * 36e5).toISOString(),
        priceUsd: episode.role === "TREATMENT" ? 1.41 : 1.06, source: "r1-synthetic-provider" }, { asOf: AS_OF });
      assert.ok(observation);
      observations.push(observation);
    }
  }
  return { episodes, observations };
}

const baseline = evidence();
function legacyHistory() {
  const reverse = value => Array.isArray(value) ? value.map(reverse)
    : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).reverse().map(([key, item]) => [key, reverse(item)])) : value;
  const hash = value => crypto.createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
  const rows = baseline.episodes.slice(0, 2).map(reverse);
  const fingerprint = hash(rows[0].strategyDefinition);
  const parent = rows.find(row => row.role === "TREATMENT");
  const cohortId = hash(["PROSPECTIVE_EDGE_COHORT_V1", parent.decisionAt, fingerprint, parent.runId].join("|")).slice(0, 40);
  for (const row of rows) {
    row.strategyFingerprint = fingerprint;
    row.frozenPrediction.strategyFingerprint = fingerprint;
    row.cohortId = cohortId;
  }
  parent.episodeId = hash(["PROSPECTIVE_EDGE_COHORT_MEMBER_V1", cohortId, "TREATMENT", parent.routeKey, "ROOT"].join("|")).slice(0, 40);
  for (const row of rows) {
    if (row.role === "CONTROL_MATCHED") {
      row.parentTreatmentEpisodeId = parent.episodeId;
      row.episodeId = hash(["PROSPECTIVE_EDGE_COHORT_MEMBER_V1", cohortId, row.role, row.routeKey, parent.episodeId].join("|")).slice(0, 40);
    }
    row.frozenPrediction.featureSnapshotHash = hash(row.frozenPrediction.featureSnapshot);
    const { contractIntegrityHash: _contractHash, ...contract } = row.frozenPrediction;
    row.frozenPrediction.contractIntegrityHash = hash(contract);
    const { freezeIntegrityHash: _episodeHash, ...episode } = row;
    row.freezeIntegrityHash = hash(episode);
  }
  return rows;
}
function run(input = structuredClone(baseline), options = {}) {
  return runEdgeVerificationCycle({ now: AS_OF, prospectiveEpisodes: input.episodes,
    prospectiveObservations: input.observations, requireObservationLedgerIntegrity: true,
    resolvedReport: { rows: [] }, marketObservations: [], snapshots: [], writeReports: false,
    iterations: 1000, ...options });
}

function assertNonIntegrityGates(report) {
  for (const field of ["enoughData", "capturePass", "executionCostPass", "matchQualityPass", "replicationPass", "returnVerified", "hitVerified", "catastropheSafe"]) {
    assert.equal(report.current.gates[field], true, `${field}: ${JSON.stringify(report.current.blockers)}`);
  }
  assert.equal(report.current.interimSafety.pass, true);
  assert.equal(report.current.missingnessSensitivity.pass, true);
  assert.equal(report.current.sequentialInference.checkpointPairCount, 250);
}

test("R1 valid mature synthetic evidence passes every original gate and final certificate", () => {
  const { report, certificate } = run();
  assertNonIntegrityGates(report);
  assert.equal(certificate.verified, true);
  assert.equal(certificate.certificateEligible, true);
  assert.equal(certificate.automaticTrading, false);
  assert.equal(certificate.automaticPromotion, false);
});

const corruptions = [
  ["null observation", input => { input.observations.push(null); }, "EXACT_MARKET_OBSERVATION_LEDGER_INTEGRITY_FAILURE"],
  ["null episode", input => { input.episodes.push(null); }, "PROSPECTIVE_COHORT_LEDGER_INTEGRITY_FAILURE"],
  ["duplicate observation key", input => { input.observations.push(structuredClone(input.observations[0])); }, "EXACT_MARKET_OBSERVATION_LEDGER_INTEGRITY_FAILURE"],
  ["required observation checksum", input => { input.observations[0].priceUsd = 100; }, "EXACT_MARKET_OBSERVATION_LEDGER_INTEGRITY_FAILURE"],
  ["malformed observation", input => { input.observations.push({ __exactObservationLedgerParseFailure: true, malformedLineHash: "original-bad-line-retained" }); }, "EXACT_MARKET_OBSERVATION_LEDGER_INTEGRITY_FAILURE"],
  ["malformed historical episode", input => { input.episodes.push({ __prospectiveLedgerParseFailure: true, malformedLineHash: "original-bad-line-retained" }); }, "PROSPECTIVE_COHORT_LEDGER_INTEGRITY_FAILURE"],
  ["duplicate episode ID", input => { input.episodes.push(structuredClone(input.episodes[0])); }, "PROSPECTIVE_COHORT_LEDGER_INTEGRITY_FAILURE"],
  ["invalid control relationship", input => { input.episodes.find(row => row.role === "CONTROL_MATCHED").parentTreatmentEpisodeId = "missing-parent"; }, "PROSPECTIVE_COHORT_LEDGER_INTEGRITY_FAILURE"],
  ["mismatched observation token", input => { input.observations[0].tokenAddress = address(999999); }, "EXACT_MARKET_OBSERVATION_LEDGER_INTEGRITY_FAILURE"],
  ["future observation", input => { input.observations.push(buildExactMarketObservation({ chain: "base", tokenAddress: address(999998), poolAddress: address(999997),
    observedAt: "2027-01-01T00:00:00.000Z", priceUsd: 1, source: "r1-synthetic-provider" }, { asOf: "2027-01-02T00:00:00.000Z" })); }, "EXACT_MARKET_OBSERVATION_LEDGER_INTEGRITY_FAILURE"],
  ["non-legacy historical corruption", input => { const old = structuredClone(input.episodes[0]); old.strategyFingerprint = "unrelated-historical-corruption";
    old.signalPriceUsd = 100; input.episodes.push(old); }, "PROSPECTIVE_COHORT_LEDGER_INTEGRITY_FAILURE"],
];
for (const [name, corrupt, blocker] of corruptions) {
  test(`R1 final certificate veto survives ${name} with all non-integrity gates passing`, () => {
    const input = structuredClone(baseline);
    corrupt(input);
    const bytes = JSON.stringify(input);
    const { report, certificate } = run(input);
    assertNonIntegrityGates(report);
    assert.equal(certificate.verified, false);
    assert.equal(certificate.certificateEligible, false);
    assert.equal(report.certificateEligible, false);
    assert.ok(certificate.blockers.includes(blocker), JSON.stringify(certificate));
    assert.equal(JSON.stringify(input), bytes, "Grading must not rewrite or rehash damaged evidence");
  });
}

test("R1 final certificate cannot treat disabled observation integrity as passing", () => {
  const { certificate } = run(undefined, { requireObservationLedgerIntegrity: false });
  assert.equal(certificate.verified, false);
  assert.equal(certificate.certificateEligible, false);
  assert.ok(certificate.blockers.includes("EXACT_MARKET_OBSERVATION_LEDGER_INTEGRITY_NOT_REQUIRED"));
});

test("R1 original legacy-only quarantine can coexist with a mature valid current certificate", () => {
  const input = structuredClone(baseline);
  input.episodes.unshift(...legacyHistory());
  const { report, certificate } = run(input);
  assertNonIntegrityGates(report);
  assert.equal(report.integrityScope.legacyHashOrderRowsQuarantined, 2);
  assert.equal(report.integrityScope.nonLegacyInvalidRowsObserved, 0);
  assert.equal(certificate.verified, true);
});

test("R1 legacy quarantine cannot hide an excluded future row carrying the current fingerprint", () => {
  const input = structuredClone(baseline);
  input.episodes.unshift(...legacyHistory());
  const future = structuredClone(baseline.episodes.at(-2));
  future.decisionAt = "2027-01-01T00:00:00.000Z";
  future.episodeId = "future-row-retained-without-repairing-its-hash";
  input.episodes.push(future);
  const bytes = JSON.stringify(input);
  const { report, certificate } = run(input);
  assertNonIntegrityGates(report);
  assert.equal(certificate.verified, false);
  assert.equal(certificate.certificateEligible, false);
  assert.ok(certificate.blockers.includes("PROSPECTIVE_COHORT_LEDGER_INTEGRITY_FAILURE"));
  assert.equal(JSON.stringify(input), bytes);
});

test("R1 certificate writer independently vetoes false and missing integrity audit checks", () => {
  const { report } = run();
  assert.deepEqual(edgeCertificateIntegrityBlockers(report), []);
  for (const key of ["currentStrategyPartitionIntegrityPass", "currentStrategyLedgerIntegrityPass",
    "scopedProspectiveLedgerIntegrityPass", "episodeInputValid", "observationInputValid",
    "exactMarketObservationLedgerIntegrityRequired", "exactMarketObservationLedgerIntegrityPass"]) {
    for (const value of [false, undefined, null, "true"]) {
      const changed = structuredClone(report);
      changed.inputAudit[key] = value;
      assert.ok(edgeCertificateIntegrityBlockers(changed).length, `${key}: ${String(value)}`);
    }
  }
  for (const [key, value] of [["duplicateEpisodeIds", ["duplicate"]], ["topologyFailureEpisodeIds", ["orphan"]],
    ["duplicateObservationKeys", ["duplicate"]],
    ["nonLegacyInvalidRowsObserved", 1], ["observationsRejected", 1], ["globalHistoricalProspectiveLedgerIntegrityPass", false]]) {
    const changed = structuredClone(report);
    changed.inputAudit[key] = value;
    assert.ok(edgeCertificateIntegrityBlockers(changed).length, key);
  }
});
