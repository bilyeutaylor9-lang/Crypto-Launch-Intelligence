import test from "node:test";
import assert from "node:assert/strict";
import { analyzeSmartMoneyAccumulation } from "../src/engines/smartMoneyAccumulationEngine.js";
import { analyzeDataStarvationRootCause } from "../src/engines/dataStarvationRootCauseEngine.js";
import { buildTargetedEnrichmentPlan } from "../src/data/targetedEnrichmentRouter.js";
import { getEngineContracts } from "../src/kernel/engineContractManifest.js";

const NOW = "2026-10-22T00:00:00.000Z";
const FIELDS = ["smartWalletNetFlowUsd", "smartWalletBuyCount", "smartWalletSellCount", "accumulationDays"];
const CONTRACT = getEngineContracts().find((contract) => contract.id === "smartMoneyAccumulation");

function evaluated() {
  return {
    ...analyzeSmartMoneyAccumulation({
      chain: "base", tokenAddress: `0x${"1".repeat(40)}`,
      deepEvaluationState: "DEEP_EVALUATED",
    }, { now: NOW }),
    engineResults: { smartMoneyAccumulation: { status: "SUCCESS" } },
  };
}

function audit(project, contracts = [CONTRACT], options = {}) {
  return analyzeDataStarvationRootCause(project, { now: NOW, contracts, ...options });
}

test("successful wallet producer reports unavailable raw prerequisites, not a missing pipeline output", () => {
  const project = evaluated();
  const result = audit(project);
  assert.equal(project.smartMoneyAccumulationScore, null);
  assert.equal(result.dataStarvationStatus, "ADVISORY_DATA_GAPS");
  assert.equal(result.coreDataStarved, false);
  assert.equal(result.advisoryMissingEvidence.length, 4);
  for (const item of result.advisoryMissingEvidence) {
    assert.equal(item.rootCause, "RAW_SOURCE_MISSING");
    assert.deepEqual(item.rawPrerequisites, project.measuredWalletFlow.rawPrerequisites[item.canonicalField]);
    assert.equal(item.recoverable, false);
    assert.equal(item.estimatedRecoveryCost, 0);
    assert.deepEqual(item.targetSources, []);
    assert.equal(item.recoveryDisposition, ["smartWalletNetFlowUsd", "accumulationDays"].includes(item.canonicalField)
      ? "DERIVED_RECOMPUTE" : "UNAVAILABLE_WITH_CURRENT_PROVIDERS");
  }
  const plan = buildTargetedEnrichmentPlan(result.advisoryMissingEvidence, { chain: "base" });
  assert.equal(plan.estimatedRequests, 0);
  assert.deepEqual(plan.nextSources, []);
  assert.equal(result.starvationRecoveryPlan.estimatedRequests, 0);
  assert.equal(JSON.stringify(project), JSON.stringify(evaluated()));
});

test("missing, failed and unconfirmed producer stages cannot be relabeled as raw-data gaps", () => {
  for (const [record, expected] of [
    [undefined, "PIPELINE_STAGE_NOT_RUN"],
    [{ status: "FAILED", failureReason: "provider timeout" }, "PIPELINE_STAGE_TIMED_OUT"],
    [{ status: "FAILED", failureReason: "bad output" }, "PIPELINE_STAGE_FAILED"],
    [{ status: "SKIPPED" }, "PIPELINE_OUTPUT_MISSING"],
    [{ status: "UNKNOWN" }, "PIPELINE_OUTPUT_MISSING"],
  ]) {
    const project = evaluated();
    project.engineResults = record ? { smartMoneyAccumulation: record } : {};
    for (const item of audit(project).advisoryMissingEvidence.filter((item) =>
      ["smartWalletNetFlowUsd", "accumulationDays"].includes(item.canonicalField))) {
      assert.equal(item.rootCause, expected);
      assert.equal(item.rawPrerequisites, undefined);
    }
  }
});

test("malformed, stale, future and contradictory wallet diagnostics do not override pipeline diagnosis", () => {
  for (const mutate of [
    (p) => { p.measuredWalletFlow.schemaVersion = 2; },
    (p) => { p.measuredWalletFlow.status = "MEASURED"; },
    (p) => { p.measuredWalletFlow.evaluatedAt = "2026-10-21T20:00:00Z"; },
    (p) => { p.measuredWalletFlow.evaluatedAt = "2026-10-22T00:00:01Z"; },
    (p) => { p.measuredWalletFlow.evaluatedAt = "not a clock"; },
    (p) => { p.measuredWalletFlow.values.smartWalletNetFlowUsd = 0; },
    (p) => { p.measuredWalletFlow.effectiveValues.smartWalletNetFlowUsd = 100; },
    (p) => { p.measuredWalletFlow.rawPrerequisites.smartWalletNetFlowUsd.rootCause = "PASS"; },
    (p) => { p.measuredWalletFlow.rawPrerequisites.smartWalletNetFlowUsd.recoveryDisposition = "RAW_RECOVERABLE"; },
    (p) => { p.measuredWalletFlow.rawPrerequisites.smartWalletNetFlowUsd.requiredAny = [["unrelated secret"]]; },
    (p) => { p.measuredWalletFlow.rawPrerequisites.smartWalletNetFlowUsd.receiptPaths = []; },
  ]) {
    const project = evaluated();
    mutate(project);
    const item = audit(project, [CONTRACT], { disableSemanticScan: true }).advisoryMissingEvidence
      .find((entry) => entry.canonicalField === "smartWalletNetFlowUsd");
    assert.equal(item.rootCause, "PIPELINE_OUTPUT_MISSING");
    assert.equal(item.rawPrerequisites, undefined);
  }
});

test("diagnostic numbers alone cannot satisfy missing canonical wallet evidence", () => {
  for (const container of ["values", "effectiveValues", "rawSampleTotals", "unverifiedProviderFields"]) {
    const project = evaluated();
    project.measuredWalletFlow[container] = Object.fromEntries(FIELDS.map((field) => [field, 100]));
    const result = audit(project);
    assert.equal(result.advisoryMissingEvidence.length, 4, container);
    assert.equal(result.coreDataStarved, false);
    assert.equal(result.smartMoneyAccumulationScore, null);
  }
});

test("unrelated derived engine diagnostics cannot borrow wallet prerequisite records", () => {
  const project = evaluated();
  project.engineResults.unrelated = { status: "SUCCESS" };
  const contract = { ...CONTRACT, id: "unrelated" };
  const result = audit(project, [contract]);
  const item = result.advisoryMissingEvidence.find((entry) => entry.canonicalField === "smartWalletNetFlowUsd");
  assert.equal(item.rootCause, "PIPELINE_OUTPUT_MISSING");
  assert.equal(item.rawPrerequisites, undefined);
});

test("an invalid audit clock cannot authenticate a wallet producer diagnostic", () => {
  const result = audit(evaluated(), [CONTRACT], { now: "invalid" });
  const item = result.advisoryMissingEvidence.find((entry) => entry.canonicalField === "smartWalletNetFlowUsd");
  assert.equal(item.rootCause, "PIPELINE_OUTPUT_MISSING");
  assert.equal(item.rawPrerequisites, undefined);
});

test("real final-decision gaps remain core blockers alongside advisory wallet gaps", () => {
  const core = {
    id: "safety", phase: "security", affectsFinalDecision: true, canBlockCandidate: true,
    inputContract: { requiredAny: [["honeypotDetected"], ["sellRestricted"]] },
  };
  const result = audit(evaluated(), [CONTRACT, core]);
  assert.equal(result.coreDataStarved, true);
  assert.equal(result.dataStarvationStatus, "CORE_DATA_STARVED");
  assert.deepEqual(result.coreMissingEvidence.map((item) => item.canonicalField).sort(),
    ["honeypotDetected", "sellRestricted"]);
  assert.equal(result.advisoryMissingEvidence.length, 4);
});

test("raw-prerequisite diagnosis never overrides the manifest's final-decision semantics", () => {
  const result = audit(evaluated(), [{ ...CONTRACT, affectsFinalDecision: true }]);
  assert.equal(result.coreDataStarved, true);
  assert.equal(result.dataStarvationStatus, "CORE_DATA_STARVED");
  assert.equal(result.coreMissingEvidence.length, 4);
  assert.equal(result.advisoryMissingEvidence.length, 0);
  assert.ok(result.coreMissingEvidence.every((item) => item.rootCause === "RAW_SOURCE_MISSING"));
});

test("a general provider outage does not disguise the producer's specific unavailable raw prerequisites", () => {
  const project = evaluated();
  project.providerStatus = "provider unavailable";
  const result = audit(project);
  const derived = result.advisoryMissingEvidence.find((entry) => entry.canonicalField === "accumulationDays");
  assert.equal(derived.rootCause, "RAW_SOURCE_MISSING");
  assert.equal(derived.rawPrerequisites.recoveryDisposition, "UNAVAILABLE_WITH_CURRENT_PROVIDERS");
  assert.equal(derived.providerStatus, "UNKNOWN");
});

test("deferred candidates bypass wallet diagnosis and recovery denominators", () => {
  const result = audit({ ...evaluated(), deepEvaluationState: "DEFERRED_BEFORE_DEEP" });
  assert.equal(result.dataStarvationStatus, "DEFERRED_BEFORE_DEEP");
  assert.equal(result.coreDataStarved, false);
  assert.deepEqual(result.dataStarvationMissingEvidence, []);
  assert.equal(result.starvationRecoveryPlan.estimatedRequests, 0);
});

test("measured zero is not turned into a missing wallet input", () => {
  const project = evaluated();
  for (const field of FIELDS) project[field] = 0;
  const result = audit(project);
  assert.deepEqual(result.advisoryMissingEvidence, []);
});
