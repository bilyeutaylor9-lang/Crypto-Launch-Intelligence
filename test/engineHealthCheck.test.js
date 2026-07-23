import test from "node:test";
import assert from "node:assert/strict";

import {
  buildEngineHealthReport,
  getPipelineEngineUsage,
  runEngineHealthCheck,
} from "../src/engineHealthCheck.js";
import { getEngineContracts } from "../src/kernel/engineContractManifest.js";

test("engine health check executes every declared core contract engine", async () => {
  const results = await runEngineHealthCheck({}, { timeoutMs: 12_000 });
  const executed = results.filter((result) => result.executionStatus === "EXECUTED");
  const failed = results.filter((result) => result.status === "FAIL");

  assert.equal(failed.length, 0);
  assert.equal(executed.length, getEngineContracts().length);
  assert.ok(results.some((result) => result.status === "PIPELINE_ACTIVE_UNCONTRACTED"));
  assert.equal(results.some((result) => result.status === "IMPORT_ONLY"), false);

  const report = buildEngineHealthReport(results);
  assert.ok(report.healthScore >= 0);
  assert.ok(report.coverage.contractCoveragePercent >= 0);
  assert.ok(Array.isArray(report.deadExports));
  assert.ok(Array.isArray(report.engineOrderingProblems));
  assert.equal(report.coverage.contractCount, getEngineContracts().length);
});

test("engine audit discovers the live pipeline exports instead of treating them as import-only", () => {
  const usage = getPipelineEngineUsage();
  const worldModel = usage.find((entry) => entry.engine === "worldModelBrainEngine.js");
  const finalSelection = usage.find((entry) => entry.engine === "finalSelectionIntegrityEngine.js");
  const prePump = usage.find((entry) => entry.engine === "prePumpDetectionEngine.js");

  assert.ok(usage.length >= 100);
  assert.equal(worldModel?.exportName, "analyzeWorldModelBrainBatch");
  assert.equal(finalSelection?.exportName, "analyzeFinalSelectionIntegrityBatch");
  assert.equal(prePump?.exportName, "prePumpDetectionEngine");
});

test("full engine audit classifies and executes standalone discovery engines", async () => {
  const results = await runEngineHealthCheck({}, { executePipelineActive: true, timeoutMs: 12_000 });
  const report = buildEngineHealthReport(results);

  assert.equal(report.status, "OK");
  assert.equal(report.failures.length, 0);
  assert.equal(report.runtime.dormantEngines, 0);
  assert.equal(report.runtime.activeUncontractedEngines, 0);
  assert.equal(report.engineOrderingProblems.length, 0);
  assert.equal(report.warnings.length, 0);
  assert.ok(report.runtime.standaloneEngines >= 20);
  assert.ok(report.coverage.executionCoveragePercent >= 100);
});
