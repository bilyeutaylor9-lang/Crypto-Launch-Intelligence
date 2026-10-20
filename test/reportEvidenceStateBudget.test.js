import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { summarizeEvidenceFunnel } from "../src/kernel/evidenceFunnelSummary.js";
import { writeJsonReport } from "../src/reports/jsonReportEngine.js";
import {
  compactProjectsForReportWriters,
  REPORT_DECISION_SCALAR_FIELDS,
} from "../src/reports/reportPayloadCompactor.js";

const STATE_FIELDS = [
  "deepEvaluationState", "finalSelectionState", "finalSelectionQualified",
  "coreEvidenceState", "engineDataReadinessStatus", "advisoryEvidenceState", "advisoryDataGaps",
  "coreEvidenceCoveragePct", "advisoryEvidenceCoveragePct", "coreDataStarved",
];

function fixtures() {
  const dense = {
    ...Object.fromEntries(REPORT_DECISION_SCALAR_FIELDS.map((field) => [field, 42])),
    name: "Bounded negative evidence", symbol: "NEG", chain: "base", chainId: 8453,
    tokenAddress: "0x1111111111111111111111111111111111111111",
    poolAddress: "0x2222222222222222222222222222222222222222",
    deepEvaluationState: "DEEP_EVALUATED", finalSelectionState: "RESEARCH_ONLY",
    finalSelectionQualified: false, liveExecutionReady: false,
    coreEvidenceState: "CORE_DATA_STARVED", engineDataReadinessStatus: "CORE_DATA_STARVED",
    advisoryEvidenceState: "ADVISORY_DATA_GAPS", advisoryDataGaps: true,
    coreEvidenceCoveragePct: 45, advisoryEvidenceCoveragePct: 12, coreDataStarved: true,
    signalProfile: { risk: { trapRisk: 65 }, details: Array.from({ length: 120 }, () => "x".repeat(200)) },
    executionProof: { executionProofState: "INSUFFICIENT_EVIDENCE", liveExecutionReady: false,
      safetyVerified: false, errorTrace: "e".repeat(20_000) },
    canonicalExecutionRoute: { routeTruthStatus: "INSUFFICIENT_EVIDENCE" },
    hugeResearchPayload: "r".repeat(100_000),
    ...Object.fromEntries(Array.from({ length: 120 }, (_, i) => [`advisoryMetric${i}`, i])),
  };
  const deferred = {
    name: "Deferred candidate", chain: "base", deepEvaluationState: "DEFERRED_BEFORE_DEEP",
    finalSelectionState: "RESEARCH_ONLY", finalSelectionQualified: false,
    coreEvidenceState: "DEFERRED_BEFORE_DEEP", engineDataReadinessStatus: "DEFERRED_BEFORE_DEEP",
    advisoryEvidenceState: "DEFERRED_BEFORE_DEEP", advisoryDataGaps: false,
    coreEvidenceCoveragePct: 0, advisoryEvidenceCoveragePct: 0, coreDataStarved: false,
  };
  return [dense, deferred];
}

for (const firstPass of [false, true]) {
  test(`8,000-character production row budget retains evidence states ${firstPass ? "through both compaction stages" : "in JSON writer"}`, (t) => {
    const directory = mkdtempSync(path.join(tmpdir(), "report-state-budget-"));
    const previousLimit = process.env.REPORT_MAX_TOTAL_PROJECT_PAYLOAD_CHARS;
    // The same per-row budget as the default 32M / 4,000-candidate live report.
    process.env.REPORT_MAX_TOTAL_PROJECT_PAYLOAD_CHARS = "16000";
    t.after(() => {
      if (previousLimit === undefined) delete process.env.REPORT_MAX_TOTAL_PROJECT_PAYLOAD_CHARS;
      else process.env.REPORT_MAX_TOTAL_PROJECT_PAYLOAD_CHARS = previousLimit;
      rmSync(directory, { recursive: true, force: true });
    });
    const projects = fixtures();
    const original = JSON.stringify(projects);
    const before = summarizeEvidenceFunnel(projects);
    const inputs = firstPass ? compactProjectsForReportWriters(projects) : projects;
    const file = writeJsonReport(inputs, { reportsDir: directory });
    const report = JSON.parse(readFileSync(file, "utf8"));
    assert.equal(JSON.stringify(projects), original, "serialization must not alter producer evidence");
    for (let index = 0; index < projects.length; index += 1) {
      for (const field of STATE_FIELDS) {
        assert.deepEqual(report.projects[index][field], projects[index][field], `${index}.${field}`);
      }
    }
    for (const field of REPORT_DECISION_SCALAR_FIELDS) {
      assert.deepEqual(report.projects[0][field], projects[0][field], field);
    }
    const after = summarizeEvidenceFunnel(report.projects);
    for (const field of ["deepEvaluated", "deepDeferred", "coreDataStarved", "coreEvidenceUnknown",
      "coreEvidenceCoveragePct", "advisoryEvidenceCoveragePct", "advisoryDataGaps", "selectionOutcome"]) {
      assert.equal(after[field], before[field], field);
    }
    assert.equal(after.deepEvaluated, 1);
    assert.equal(after.deepDeferred, 1);
    assert.equal(after.verifiedRoutes, 0, "retaining negative state must not create route proof");
    assert.equal(report.meta.reportSerialization.projectPayloadCharacterLimit, 8_000);
    assert.equal(report.meta.reportSerialization.truncatedProjects, 1);
    assert.ok(statSync(file).size < 64_000, "report stays bounded despite large source graphs");
  });
}
