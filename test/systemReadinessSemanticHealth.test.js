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

test("system readiness keeps healthy no-edge scans passable with advisory recovery gaps", () => {
  const reportsDir = fs.mkdtempSync(path.join(os.tmpdir(), "semantic-readiness-"));
  fs.writeFileSync(path.join(reportsDir, "engine-data-contract-health.json"), JSON.stringify({
    status: "INPUT_DATA_GAPS",
    outputContractMismatchProjects: 0,
    enginesWithInputGaps: 6,
  }));
  fs.writeFileSync(path.join(reportsDir, "daily-source-gaps.json"), JSON.stringify({
    status: "SOURCE_GAPS_FOUND",
    missingKeyCount: 13,
    blockingGapCount: 1,
    timedOutCount: 1,
    scannerBlindnessRisk: "LOW",
    routePromotionBlindnessRisk: "MEDIUM",
  }));
  fs.writeFileSync(path.join(reportsDir, "op-mode-readiness.json"), JSON.stringify({
    status: "DEGRADED_BUT_USABLE",
  }));
  fs.writeFileSync(path.join(reportsDir, "live-core-ranking.json"), JSON.stringify({
    authoritativeRanking: "GUARDED_LIVE_CORE",
    status: "PASS_DATA_RECOVERY_ONLY",
    summary: {
      microTestEligible: 0,
      researchWatchlist: 0,
      healthyCoreEvidence: true,
      selectionOutcome: "NO_EDGE_FOUND",
    },
  }));
  fs.writeFileSync(path.join(reportsDir, "high-upside-scalp-research.json"), JSON.stringify({
    status: "PASS_WITH_WATCHLIST",
    highUpsideWatchCount: 0,
    scalpReadyCount: 0,
    researchOnlyRouteMissingCount: 487,
    quarantinedIdentityOrRouteCount: 2,
  }));
  fs.writeFileSync(path.join(reportsDir, "execution-proof-recovery.json"), JSON.stringify({
    status: "ROUTES_RECOVERED",
    candidatesAttempted: 50,
    routesRecovered: 30,
  }));

  const readiness = summarizeSystemReadiness(
    {
      scanRunId: "scan_healthy_no_edge_with_advisories",
      scannedProjects: 2456,
      scannerSemanticHealth: {
        status: "NO_EDGE_FOUND",
        readinessClass: "HEALTHY_EVIDENCE",
        healthyCoreEvidence: true,
        selectionOutcome: "NO_EDGE_FOUND",
      },
    },
    { reportsDir, requiredFiles: [] }
  );

  assert.equal(readiness.status, "PASS");
  assert.equal(readiness.blockingFindingCount, 0);
  assert.equal(readiness.advisoryFindingCount, 5);
  assert.deepEqual(readiness.nextFixes, []);
  assert.ok(readiness.readinessAdvisories.some((item) => item.area === "engine-contracts"));
  assert.ok(readiness.readinessAdvisories.some((item) => item.area === "sources"));
  assert.ok(readiness.readinessAdvisories.some((item) => item.area === "candidate-lanes"));
  assert.ok(readiness.readinessAdvisories.some((item) => item.area === "op-mode"));
  assert.ok(readiness.readinessAdvisories.some((item) => item.area === "guarded-live-ranking"));
});
