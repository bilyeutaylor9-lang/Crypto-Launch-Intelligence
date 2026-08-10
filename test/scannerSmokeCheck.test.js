import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { evaluateScannerSmoke } from "../src/ops/scannerSmokeCheck.js";

function tempReports() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "cli-scanner-smoke-"));
}

function writeJson(dir, fileName, value) {
  fs.writeFileSync(path.join(dir, fileName), JSON.stringify(value, null, 2));
}

function writeMinimumScannerReports(dir, readiness) {
  writeJson(dir, "system-readiness.json", readiness);
  writeJson(dir, "data-starvation-root-cause.json", { status: "PASS" });
  writeJson(dir, "engine-data-contract-health.json", { status: "PASS" });
}

test("scanner smoke fails data-degraded semantic readiness", () => {
  const reportsDir = tempReports();
  writeMinimumScannerReports(reportsDir, {
    status: "FAIL",
    scannerSemanticHealth: { status: "DATA_DEGRADED" },
  });

  const report = evaluateScannerSmoke({ reportsDir });

  assert.equal(report.status, "FAIL");
  assert.ok(report.findings.some((finding) => finding.message.includes("DATA_DEGRADED")));
});

test("scanner smoke passes insufficient-evidence debug runs with a master readiness warning", () => {
  const reportsDir = tempReports();
  writeMinimumScannerReports(reportsDir, {
    status: "FAIL",
    scannerSemanticHealth: { status: "INSUFFICIENT_EVIDENCE" },
    failures: [{ area: "reports", severity: "FAIL" }],
  });

  const report = evaluateScannerSmoke({ reportsDir });

  assert.equal(report.status, "PASS");
  assert.ok(report.findings.some((finding) => finding.severity === "WARN"));
});

test("scanner smoke requires semantic scanner health", () => {
  const reportsDir = tempReports();
  writeMinimumScannerReports(reportsDir, { status: "PASS" });

  const report = evaluateScannerSmoke({ reportsDir });

  assert.equal(report.status, "FAIL");
  assert.ok(report.findings.some((finding) => finding.message.includes("scannerSemanticHealth")));
});
