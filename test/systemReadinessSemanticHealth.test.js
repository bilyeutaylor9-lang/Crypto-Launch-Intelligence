import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { summarizeSystemReadiness } from "../src/reports/systemReadinessReportEngine.js";

test("system readiness fails semantic scanner degradation", () => {
  const reportsDir = fs.mkdtempSync(path.join(os.tmpdir(), "semantic-readiness-"));
  const readiness = summarizeSystemReadiness(
    {
      scanRunId: "scan_semantic_fail",
      scannedProjects: 4000,
      scannerSemanticHealth: {
        status: "DATA_DEGRADED",
        insufficientDataCandidates: 3999,
        averageEvidenceCoverage: 28,
        readinessClass: "DATA_DEGRADED",
      },
    },
    { reportsDir, requiredFiles: [] }
  );

  assert.equal(readiness.status, "FAIL");
  assert.equal(readiness.selectionOutcomeStatus, "DATA_DEGRADED");
  assert.ok(readiness.failures.some((item) => item.area === "scanner-semantic-health"));
});

test("system readiness accepts no-edge outcome when evidence is healthy", () => {
  const reportsDir = fs.mkdtempSync(path.join(os.tmpdir(), "semantic-readiness-"));
  const readiness = summarizeSystemReadiness(
    {
      scanRunId: "scan_no_edge",
      scannedProjects: 4000,
      scannerSemanticHealth: {
        status: "NO_EDGE_FOUND",
        insufficientDataCandidates: 0,
        averageEvidenceCoverage: 82,
        readinessClass: "HEALTHY_EVIDENCE",
      },
    },
    { reportsDir, requiredFiles: [] }
  );

  assert.equal(readiness.status, "PASS");
  assert.equal(readiness.selectionOutcomeStatus, "NO_EDGE_FOUND");
});
