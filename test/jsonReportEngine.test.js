import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";

import { writeJsonReport } from "../src/reports/jsonReportEngine.js";

test("JSON report summarizes wide discovery without serializing raw candidate pools", () => {
  const rawCandidates = Array.from({ length: 80 }, (_, index) => ({
    symbol: `RAW${index}`,
    providerPayload: "x".repeat(8_192),
  }));

  const filePath = writeJsonReport(
    [{ name: "Report Candidate", symbol: "RPT", pipelineScore: 77 }],
    {
      discovery: {
        mode: "free-max",
        rawCount: 80,
        candidates: rawCandidates,
        shadowRejectedCandidates: rawCandidates,
        providerHealth: { healthy: 2, total: 3 },
        sourceReports: { dexscreener: { status: "SUCCESS", scannedTokens: 80 } },
        discoveryCoverage: { rawCount: 80, shadowRejected: rawCandidates },
        universeLedger: { status: "OK", savedProjects: 80, totals: { promoted: 2 } },
      },
    }
  );

  const reportText = fs.readFileSync(filePath, "utf8");
  const report = JSON.parse(reportText);

  assert.equal(report.meta.discovery.candidateCount, 80);
  assert.equal(report.meta.discovery.shadowRejectedCandidateCount, 80);
  assert.equal(report.meta.discovery.discoveryCoverage.shadowRejectedCount, 80);
  assert.equal(report.meta.discovery.sourceReports.dexscreener.status, "SUCCESS");
  assert.equal("candidates" in report.meta.discovery, false);
  assert.equal("shadowRejectedCandidates" in report.meta.discovery, false);
  assert.doesNotMatch(reportText, /providerPayload/);
});
