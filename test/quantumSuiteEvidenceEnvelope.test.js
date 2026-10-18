import test from "node:test";
import assert from "node:assert/strict";
import { analyzeQuantumOutcomeField } from "../src/engines/quantumOutcomeFieldEngine.js";
import { analyzeQuantumReasoningBrain } from "../src/engines/quantumReasoningBrainEngine.js";
import { summarizeQuantumSuiteHealth } from "../src/engines/quantumSuiteHealthEngine.js";

function fixture() {
  return analyzeQuantumReasoningBrain(analyzeQuantumOutcomeField({
    name: "Diagnostic fixture", symbol: "DIAGNOSTIC", evidence: [],
  }, {scenarios: 64}));
}

test("diagnostic replay accepts retained evidence envelopes without mutating or scoring them", () => {
  const original = fixture();
  const baseline = summarizeQuantumSuiteHealth([original]);
  assert.equal(baseline.status, "PASS");
  for (const evidence of [null, undefined, false, 1, "UNKNOWN", {source: "provider", verificationStatus: "UNKNOWN"}]) {
    const project = {...original, evidence};
    const before = structuredClone(project);
    const report = summarizeQuantumSuiteHealth([project]);
    assert.equal(report.status, baseline.status);
    assert.deepEqual(report.deterministicChecks, baseline.deterministicChecks);
    assert.deepEqual(report.topQuantumFields, baseline.topQuantumFields);
    assert.deepEqual(project, before);
  }
});

test("diagnostic replay preserves existing evidence arrays and their provenance", () => {
  const project = {...fixture(), evidence: [{source: "fixture", sourceTimestamp: "2026-10-18T00:00:00.000Z",
    verificationStatus: "UNKNOWN", confidence: 0}]};
  const before = structuredClone(project);
  assert.equal(summarizeQuantumSuiteHealth([project]).status, "PASS");
  assert.deepEqual(project, before);
});

test("evidence envelope handling cannot hide invalid simulator outputs", () => {
  const project = {...fixture(), evidence: {verificationStatus: "UNKNOWN"}};
  project.quantumOutcomeField.expectedReturnPct = Number.NaN;
  const report = summarizeQuantumSuiteHealth([project]);
  assert.equal(report.status, "FAIL");
  assert.ok(report.invalidOutcomeFields.length > 0);
});
