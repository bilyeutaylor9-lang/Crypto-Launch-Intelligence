import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { refreshSystemReadinessReport } from "../src/reports/refreshSystemReadinessReport.js";

function writeJson(reportsDir, fileName, value) {
  fs.writeFileSync(path.join(reportsDir, fileName), JSON.stringify(value, null, 2));
}

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

test("post-audit readiness refresh stamps audits and rebuilds manifest hashes", () => {
  const reportsDir = fs.mkdtempSync(path.join(os.tmpdir(), "readiness-refresh-"));
  const scanRunId = "scan_refresh_current";
  const meta = {
    generatedAt: "2026-07-31T00:00:00.000Z",
    scanRunId,
    codeCommitSha: "abc123",
    dataCutoffTimestamp: "2026-07-31T00:00:00.000Z",
    status: "PASS",
    projectsAnalyzed: 100,
  };

  writeJson(reportsDir, "top-10-breakout-picks.json", meta);
  writeJson(reportsDir, "high-upside-scalp-research.json", {
    ...meta,
    scalpReadyCount: 0,
    highUpsideWatchCount: 1,
    researchOnlyRouteMissingCount: 10,
  });
  writeJson(reportsDir, "system-readiness.json", {
    ...meta,
    status: "FAIL",
    reportStatus: "FAIL",
  });
  writeJson(reportsDir, "scan-artifact-manifest.json", {
    ...meta,
    expectedScanRunId: scanRunId,
  });
  writeJson(reportsDir, "engine-health-report.json", { status: "PASS" });
  writeJson(reportsDir, "whole-engine-audit.json", {
    status: "PASS",
    runtimeDataStatus: "PASS",
    summary: { outputMissingEngineCount: 0 },
  });
  writeJson(reportsDir, "engine-value-ledger.json", { status: "PASS" });
  writeJson(reportsDir, "engine-data-contract-health.json", { status: "PASS" });
  writeJson(reportsDir, "daily-source-gaps.json", {
    status: "PASS",
    routePromotionBlindnessRisk: "LOW",
  });
  writeJson(reportsDir, "daily-capital-move.json", {
    status: "NO_VALID_MOVE_TODAY_RESEARCH_ONLY",
  });

  const result = refreshSystemReadinessReport({
    reportsDir,
    requiredFiles: [],
    manifestFiles: [
      "system-readiness.json",
      "top-10-breakout-picks.json",
      "high-upside-scalp-research.json",
    ],
  });
  const readiness = JSON.parse(
    fs.readFileSync(path.join(reportsDir, "system-readiness.json"), "utf8")
  );
  const audit = JSON.parse(
    fs.readFileSync(path.join(reportsDir, "whole-engine-audit.json"), "utf8")
  );
  const manifest = JSON.parse(
    fs.readFileSync(path.join(reportsDir, "scan-artifact-manifest.json"), "utf8")
  );
  const readinessArtifact = manifest.artifacts.find(
    (artifact) => artifact.fileName === "system-readiness.json"
  );

  assert.equal(result.systemReadinessStatus, "PASS");
  assert.equal(result.reportContractStatus, "PASS");
  assert.equal(result.manifestStatus, "COMPLETE");
  assert.equal(readiness.scanRunId, scanRunId);
  assert.equal(readiness.wholeEngineAuditStatus, "PASS");
  assert.equal(readiness.dashboardStatus, "DASHBOARD_INPUTS_READY");
  assert.equal(audit.scanRunId, scanRunId);
  assert.equal(readinessArtifact.sha256, sha256(path.join(reportsDir, "system-readiness.json")));
});
