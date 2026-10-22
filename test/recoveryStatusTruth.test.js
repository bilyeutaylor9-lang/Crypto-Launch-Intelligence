import test from "node:test";
import assert from "node:assert/strict";
import {
  analyzeDataStarvationRootCause,
  analyzeDataStarvationRootCauseBatch,
} from "../src/engines/dataStarvationRootCauseEngine.js";
import { summarizeDataStarvation } from "../src/reports/dataStarvationRootCauseReportEngine.js";

const FIELDS = ["holderAddresses", "wallets", "smartWalletBuyCount"];
const CONTRACTS = FIELDS.map((field, index) => ({
  id: `fixture_${field}`, phase: "test", affectsFinalDecision: index < 2,
  canBlockCandidate: index < 2, inputContract: { requiredAny: [[field]] },
}));
const OPTIONS = { contracts: CONTRACTS, disableSemanticScan: true, now: "2026-10-22T12:00:00.000Z" };
const OUTCOMES = [
  ["RATE_LIMITED", "PROVIDER_RATE_LIMITED"],
  ["PROVIDER_COOLDOWN", "PROVIDER_RATE_LIMITED"],
  ["REQUEST_BUDGET_EXHAUSTED", "PROVIDER_BUDGET_EXHAUSTED"],
  ["PHASE_REQUEST_BUDGET_EXHAUSTED", "PROVIDER_BUDGET_EXHAUSTED"],
  ["PHASE_TIME_BUDGET_EXHAUSTED", "ENRICHMENT_DEFERRED"],
  ["TIME_BUDGET_EXHAUSTED", "ENRICHMENT_DEFERRED"],
];

function candidate(providerAttempts, patch = {}) {
  return { chain: "base", tokenAddress: `0x${"1".repeat(40)}`, deepEvaluationState: "DEEP_EVALUATED",
    activeEvidenceRecovery: { attemptedFields: FIELDS, providerAttempts, recoveredFields: [] }, ...patch };
}

function attempt(status, requestedFields = FIELDS, patch = {}) {
  return { provider: "fixture-provider", family: "WALLETS", status, requestedFields, ...patch };
}

function missing(output, field) {
  return output.dataStarvationMissingEvidence.find(item => item.canonicalField === field);
}

test.beforeEach(t => {
  t.mock.method(globalThis, "fetch", () => assert.fail("Pure attribution fixtures must not use the network"));
});

for (const [status, expected] of OUTCOMES) {
  test(`public engine attributes ${status} without promoting missing evidence`, () => {
    for (const value of [status, ` ${status.toLowerCase()} `]) {
      const input = candidate([attempt(value)]), before = structuredClone(input);
      const output = analyzeDataStarvationRootCause(input, OPTIONS);
      for (const field of FIELDS) {
        assert.equal(missing(output, field).rootCause, expected);
        assert.equal(missing(output, field).providerStatus, expected);
        assert.equal(output[field], undefined);
      }
      assert.equal(output.coreDataStarved, true);
      assert.equal(output.advisoryDataGaps, true);
      assert.equal(output.coreMissingEvidence.length, 2);
      assert.equal(output.advisoryMissingEvidence.length, 1);
      assert.equal(output.dataStarvationStatus, "CORE_DATA_STARVED");
      assert.deepEqual(output.dataStarvationRootCauses, { [expected]: 3 });
      assert.deepEqual(input, before);
    }
  });

  test(`${status} cannot leak through an explicit scope to another same-family field`, () => {
    const output = analyzeDataStarvationRootCause(candidate([attempt(status, ["holderAddresses"])]), OPTIONS);
    assert.equal(missing(output, "holderAddresses").providerStatus, expected);
    for (const field of FIELDS.slice(1)) {
      assert.equal(missing(output, field).providerStatus, "PROVIDER_RETURNED_UNKNOWN");
      assert.equal(missing(output, field).rootCause, "PROVIDER_RETURNED_UNKNOWN");
    }
  });
}

test("malformed explicit scopes cannot fall back to the broader family", () => {
  for (const requestedFields of [undefined, null, [], "holderAddresses", [null], ["otherField"]]) {
    const output = analyzeDataStarvationRootCause(candidate(OUTCOMES.map(([status]) =>
      attempt(status, FIELDS, { requestedFields }))), OPTIONS);
    for (const field of FIELDS) assert.equal(missing(output, field).providerStatus, "PROVIDER_RETURNED_UNKNOWN");
  }
});

test("legacy family scopes still match only their own raw evidence family", () => {
  const output = analyzeDataStarvationRootCause(candidate([
    { family: "SECURITY", status: "RATE_LIMITED" },
    { family: "WALLETS", status: "PHASE_TIME_BUDGET_EXHAUSTED" },
  ]), OPTIONS);
  for (const field of FIELDS) assert.equal(missing(output, field).rootCause, "ENRICHMENT_DEFERRED");
});

test("canonical scoped names retain their matching without broadening the attempted field set", () => {
  const providerAttempts = [
    attempt("RATE_LIMITED", ["HOLDERADDRESSES"]),
    attempt("PHASE_REQUEST_BUDGET_EXHAUSTED", ["wallets"]),
  ];
  const output = analyzeDataStarvationRootCause(candidate(providerAttempts,
    { activeEvidenceRecovery: { attemptedFields: ["HOLDERADDRESSES"], providerAttempts } }), OPTIONS);
  assert.equal(missing(output, "holderAddresses").providerStatus, "PROVIDER_RATE_LIMITED");
  assert.equal(missing(output, "wallets").providerStatus, "UNKNOWN");
  assert.equal(missing(output, "wallets").rootCause, "RAW_SOURCE_MISSING");
});

const PRECEDENCE = [
  [["REQUEST_BUDGET_EXHAUSTED", "CIRCUIT_OPEN", "FAILED", "RATE_LIMITED"], "PROVIDER_BUDGET_EXHAUSTED"],
  [["PHASE_REQUEST_BUDGET_EXHAUSTED", "CIRCUIT_OPEN", "FAILED"], "PROVIDER_BUDGET_EXHAUSTED"],
  [["CIRCUIT_OPEN", "FAILED", "RATE_LIMITED", "TIME_BUDGET_EXHAUSTED"], "PROVIDER_CIRCUIT_OPEN"],
  [["FAILED", "PROVIDER_COOLDOWN", "PHASE_TIME_BUDGET_EXHAUSTED"], "PROVIDER_UNAVAILABLE"],
  [["PROVIDER_UNAVAILABLE", "RATE_LIMITED"], "PROVIDER_UNAVAILABLE"],
  [["RATE_LIMITED", "TIME_BUDGET_EXHAUSTED", "UNKNOWN"], "PROVIDER_RATE_LIMITED"],
  [["PROVIDER_COOLDOWN", "PHASE_TIME_BUDGET_EXHAUSTED"], "PROVIDER_RATE_LIMITED"],
  [["PHASE_TIME_BUDGET_EXHAUSTED", "SUCCESS", "UNKNOWN"], "ENRICHMENT_DEFERRED"],
];

for (const [statuses, expected] of PRECEDENCE) {
  test(`overlapping scoped outcomes preserve precedence: ${statuses.join(" / ")}`, () => {
    for (const ordered of [statuses, [...statuses].reverse()]) {
      const output = analyzeDataStarvationRootCause(candidate([
        ...ordered.map(status => attempt(status, ["holderAddresses"])),
        attempt("REQUEST_BUDGET_EXHAUSTED", ["wallets"]),
      ]), OPTIONS);
      assert.equal(missing(output, "holderAddresses").rootCause, expected);
      assert.equal(missing(output, "wallets").rootCause, "PROVIDER_BUDGET_EXHAUSTED");
      assert.equal(missing(output, "smartWalletBuyCount").rootCause, "PROVIDER_RETURNED_UNKNOWN");
    }
  });
}

test("genuinely empty or unknown provider responses remain unknown, not outage or recovery", () => {
  for (const statuses of [[], ["SUCCESS"], ["NO_CANDIDATE_EVIDENCE"], ["UNKNOWN"], ["AMBIGUOUS_OR_NO_EXACT_MATCH"]]) {
    const output = analyzeDataStarvationRootCause(candidate(statuses.map(status => attempt(status))), OPTIONS);
    for (const field of FIELDS) assert.equal(missing(output, field).rootCause, "PROVIDER_RETURNED_UNKNOWN");
    assert.equal(output.coreDataStarved, true);
    assert.equal(output.dataStarvationSatisfiedGroups, 0);
  }
});

test("budget and deadline deferrals do not enter provider-outage report counters", () => {
  for (const [status, expected] of OUTCOMES.filter(([status]) => status.includes("BUDGET"))) {
    const output = analyzeDataStarvationRootCause(candidate([attempt(status)]), OPTIONS);
    const report = summarizeDataStarvation([output]);
    assert.deepEqual(report.totalsByRootCause, { [expected]: 3 });
    assert.equal(report.externalDataMissing, 0);
    assert.equal(report.enrichmentDeferred, expected === "ENRICHMENT_DEFERRED" ? 3 : 0);
    assert.equal(report.coreDataStarved, 1);
  }
});

test("deferred-before-deep rows stay outside evidence and report denominators", () => {
  const output = analyzeDataStarvationRootCauseBatch([
    candidate([attempt("RATE_LIMITED")]),
    candidate([attempt("PHASE_REQUEST_BUDGET_EXHAUSTED")], { deepEvaluationState: "DEFERRED_BEFORE_DEEP" }),
  ], OPTIONS);
  assert.deepEqual(output[1].dataStarvationMissingEvidence, []);
  assert.deepEqual(output[1].dataStarvationRootCauses, {});
  assert.equal(output[1].coreDataStarved, false);
  const report = summarizeDataStarvation(output);
  assert.equal(report.standardCandidates, 2);
  assert.equal(report.deepEvaluatedCandidates, 1);
  assert.equal(report.deepDeferredCandidates, 1);
  assert.deepEqual(report.totalsByRootCause, { PROVIDER_RATE_LIMITED: 3 });
});

test("advisory-only rate limits do not create core starvation", () => {
  const output = analyzeDataStarvationRootCause(candidate([attempt("RATE_LIMITED")]),
    { ...OPTIONS, contracts: [CONTRACTS[2]] });
  assert.equal(output.coreDataStarved, false);
  assert.deepEqual(output.coreMissingEvidence, []);
  assert.equal(output.advisoryDataGaps, true);
  assert.equal(output.advisoryMissingEvidence[0].rootCause, "PROVIDER_RATE_LIMITED");
});

test("derived producer failures and NOT_APPLICABLE fields keep their existing rules", () => {
  const fields = ["executionScore", "mintAuthorityEnabled"];
  const contracts = fields.map(field => ({ id: `fixture_${field}`, phase: "test", affectsFinalDecision: true,
    inputContract: { requiredAny: [[field]] } }));
  const output = analyzeDataStarvationRootCause(candidate([], {
    engineResults: { executionProof: { status: "FAILED", failureReason: "producer failed" } },
    activeEvidenceRecovery: { attemptedFields: fields, providerAttempts: [attempt("RATE_LIMITED", fields)] },
  }), { ...OPTIONS, contracts });
  assert.equal(missing(output, "executionScore").rootCause, "PIPELINE_STAGE_FAILED");
  assert.equal(missing(output, "executionScore").providerStatus, "UNKNOWN");
  assert.equal(missing(output, "executionScore").recoveryDisposition, "DERIVED_RECOMPUTE");
  assert.equal(missing(output, "mintAuthorityEnabled").rootCause, "NOT_APPLICABLE");
  assert.equal(missing(output, "mintAuthorityEnabled").recoveryDisposition, "NOT_APPLICABLE");
  assert.equal(output.coreMissingEvidence.some(item => item.canonicalField === "mintAuthorityEnabled"), false);
});

test("explicit source-health diagnostics retain precedence over recovery fallbacks", () => {
  const output = analyzeDataStarvationRootCause(candidate([attempt("PHASE_TIME_BUDGET_EXHAUSTED")],
    { sourceHealth: { status: "provider failed" } }), OPTIONS);
  for (const field of FIELDS) assert.equal(missing(output, field).rootCause, "PROVIDER_UNAVAILABLE");
});
