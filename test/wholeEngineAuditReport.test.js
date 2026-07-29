import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { getPipelineEngineUsage } from "../src/engineHealthCheck.js";
import {
  buildEngineValueLedger,
  buildWholeEngineAuditReport,
  writeWholeEngineAuditReports,
} from "../src/reports/wholeEngineAuditReportEngine.js";

test("whole-engine audit accounts for every live pipeline stage", () => {
  const usage = getPipelineEngineUsage();
  const report = buildWholeEngineAuditReport();
  const auditedStages = new Set(report.pipelineStages.map((stage) => `${stage.engineName}:${stage.engineFile}`));

  assert.ok(usage.length >= 100);
  assert.ok(report.summary.engineFileCount >= usage.length);
  for (const stage of usage) {
    assert.ok(
      auditedStages.has(`${stage.stage}:src/engines/${stage.engine}`),
      `${stage.stage} from ${stage.engine} should appear in whole-engine audit`
    );
  }
});

test("whole-engine audit gives every engine a role, recovery plan, and recommendation", () => {
  const report = buildWholeEngineAuditReport();

  assert.ok(report.engineTruthTable.length >= 100);
  assert.equal(report.engineTruthTable.every((row) => row.file.startsWith("src/engines/")), true);
  assert.equal(report.engineTruthTable.every((row) => row.profile), true);
  assert.equal(report.engineTruthTable.every((row) => row.recommendation), true);
  assert.equal(
    report.engineTruthTable.every((row) => row.sourceRecoveryPlan?.missingDataRule === "UNKNOWN_STAYS_UNKNOWN"),
    true
  );
  assert.equal(
    report.pipelineStages.every((stage) => Array.isArray(stage.recoverySources) && stage.recoverySources.length > 0),
    true
  );
});

test("engine value ledger separates daily core engines from deep or archive candidates", () => {
  const report = buildWholeEngineAuditReport();
  const ledger = buildEngineValueLedger(report);

  assert.equal(ledger.engineCount, report.engineTruthTable.length);
  assert.ok(ledger.dailyCoreCount > 0);
  assert.ok(ledger.valueClasses.CORE_REQUIRED > 0);
  assert.equal(
    ledger.engines.every((engine) => Number.isFinite(engine.valueScore) && engine.valueScore >= 0 && engine.valueScore <= 100),
    true
  );
});

test("whole-engine audit writer creates json, ledger, and markdown artifacts", () => {
  const reportsDir = fs.mkdtempSync(path.join(os.tmpdir(), "whole-engine-audit-"));
  const result = writeWholeEngineAuditReports({ reportsDir });

  assert.equal(fs.existsSync(path.join(reportsDir, "whole-engine-audit.json")), true);
  assert.equal(fs.existsSync(path.join(reportsDir, "engine-value-ledger.json")), true);
  assert.equal(fs.existsSync(path.join(reportsDir, "whole-engine-audit.md")), true);
  assert.equal(result.report.auditName, "Whole Engine Audit");
  assert.equal(result.ledger.engineCount, result.report.engineTruthTable.length);
});
