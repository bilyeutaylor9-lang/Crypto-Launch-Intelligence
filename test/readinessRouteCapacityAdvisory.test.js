import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { summarizeSystemReadiness } from "../src/reports/systemReadinessReportEngine.js";

function evaluate(t, semantic, extra = {}) {
  const reportsDir = fs.mkdtempSync(path.join(os.tmpdir(), "route-capacity-readiness-"));
  t.after(() => fs.rmSync(reportsDir, {recursive: true, force: true}));
  fs.writeFileSync(path.join(reportsDir, "daily-source-gaps.json"), JSON.stringify({
    routePromotionBlindnessRisk: "HIGH", scannerBlindnessRisk: "LOW", missingKeyCount: 1,
  }));
  for (const [file, report] of Object.entries(extra)) {
    fs.writeFileSync(path.join(reportsDir, file), JSON.stringify(report));
  }
  return summarizeSystemReadiness({scannerSemanticHealth: semantic}, {reportsDir, requiredFiles: []});
}

const healthy = {status: "NO_EDGE_FOUND", readinessClass: "HEALTHY_EVIDENCE", healthyCoreEvidence: true,
  healthyDecisionEvidence: true, unresolvedDecisionEvidence: 0, decisionEvidenceComplete: 1,
  verifiedRoutes: 1, fullyQualified: 0};

test("provider capacity alone cannot block a decision-complete healthy no-edge scan", t => {
  const report = evaluate(t, healthy);
  assert.equal(report.status, "PASS");
  assert.equal(report.selectionOutcomeStatus, "NO_EDGE_FOUND");
  const capacity = report.failures.find(item => item.area === "candidate-promotion");
  assert.equal(capacity.blocksReadiness, false);
  assert.equal(capacity.readinessImpact, "ADVISORY");
});

test("route capacity remains blocking for missing, false or contradictory decision proof", t => {
  for (const healthyDecisionEvidence of [undefined, false]) {
    const report = evaluate(t, {...healthy, healthyDecisionEvidence});
    assert.notEqual(report.status, "PASS");
    assert.equal(report.failures.find(item => item.area === "candidate-promotion").blocksReadiness, true);
  }
  const contradictory = evaluate(t, healthy, {"live-core-ranking.json": {
    summary: {unresolvedDecisionEvidence: 1},
  }});
  assert.equal(contradictory.failures.find(item => item.area === "candidate-promotion").blocksReadiness, true);
  const negative = evaluate(t, healthy, {"live-core-ranking.json": {
    summary: {healthyDecisionEvidence: false, unresolvedDecisionEvidence: 0},
  }});
  assert.equal(negative.failures.find(item => item.area === "candidate-promotion").blocksReadiness, true);
});

test("actual degraded live evidence remains failed even when core input coverage is high", t => {
  const report = evaluate(t, {...healthy, status: "DATA_DEGRADED", healthyDecisionEvidence: false,
    coreEvidenceCoveragePct: 92, unresolvedDecisionEvidence: 125});
  assert.equal(report.status, "FAIL");
  assert.equal(report.failures.find(item => item.area === "candidate-promotion").blocksReadiness, true);
  assert.ok(report.failures.some(item => item.area === "scanner-semantic-health" && item.blocksReadiness));
});
