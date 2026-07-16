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
        discoveryFrontier: {
          targetChainCount: 2,
          observedChainCount: 1,
          scopeCoveragePct: 50,
          nativeProtocolCoverage: { total: 4, configured: 2, unconfigured: 2 },
          criticalGapCount: 1,
          criticalGaps: [{ chain: "solana", code: "NO_LIVE_CANDIDATES" }],
          chains: [{ chain: "base", state: "NATIVE_OBSERVED", candidateCount: 2 }],
        },
        universeLedger: { status: "OK", savedProjects: 80, totals: { promoted: 2 } },
      },
    }
  );

  const reportText = fs.readFileSync(filePath, "utf8");
  const report = JSON.parse(reportText);

  assert.equal(report.meta.discovery.candidateCount, 80);
  assert.equal(report.meta.discovery.shadowRejectedCandidateCount, 80);
  assert.equal(report.meta.discovery.discoveryCoverage.shadowRejectedCount, 80);
  assert.equal(report.meta.discovery.discoveryFrontier.scopeCoveragePct, 50);
  assert.equal(report.meta.discovery.discoveryFrontier.chains[0].state, "NATIVE_OBSERVED");
  assert.equal(report.meta.discovery.sourceReports.dexscreener.status, "SUCCESS");
  assert.equal("candidates" in report.meta.discovery, false);
  assert.equal("shadowRejectedCandidates" in report.meta.discovery, false);
  assert.doesNotMatch(reportText, /providerPayload/);
});

test("JSON report bounds an oversized enriched project while preserving final decision fields", () => {
  const reportPath = writeJsonReport([
    {
      name: "Bounded Candidate",
      symbol: "BND",
      chain: "base",
      finalSelectionState: "RESEARCH_ONLY",
      finalSelectionQualified: false,
      finalIntegrityScore: 42,
      pipelineScore: 71,
      riskScore: 34,
      hugeResearchPayload: "e".repeat(200_000),
      nestedEngineOutput: Array.from({ length: 500 }, (_, index) => ({
        index,
        payload: "n".repeat(4_096),
      })),
    },
  ]);

  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  const [project] = report.projects;

  assert.equal(project.name, "Bounded Candidate");
  assert.equal(project.symbol, "BND");
  assert.equal(project.finalSelectionState, "RESEARCH_ONLY");
  assert.equal(project.pipelineScore, 71);
  assert.equal(report.meta.reportSerialization.truncatedProjects, 1);
  assert.ok(fs.statSync(reportPath).size < 100_000);
});
