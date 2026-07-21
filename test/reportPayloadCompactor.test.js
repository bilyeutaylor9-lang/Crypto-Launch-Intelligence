import test from "node:test";
import assert from "node:assert/strict";

import {
  compactDiscoveryForReports,
  compactMetaForReportWriters,
  compactProjectForReportWriters,
  compactProjectsForReportWriters,
} from "../src/reports/reportPayloadCompactor.js";

test("report project compactor preserves ranking fields while bounding raw research payloads", () => {
  const compacted = compactProjectForReportWriters(
    {
      name: "Heavy Token",
      symbol: "HVY",
      chain: "base",
      pipelineScore: 88,
      finalSelectionState: "RESEARCH_ONLY",
      finalBlockingReasons: Array.from({ length: 100 }, (_, index) => `block-${index}`),
      rawProviderPayload: { payload: "x".repeat(500_000) },
      websiteText: "w".repeat(500_000),
      nestedGraph: {
        evidence: Array.from({ length: 100 }, (_, index) => ({
          index,
          payload: "e".repeat(10_000),
        })),
      },
    },
    { arrayLimit: 10, stringLimit: 500, depthLimit: 4 }
  );

  assert.equal(compacted.name, "Heavy Token");
  assert.equal(compacted.symbol, "HVY");
  assert.equal(compacted.pipelineScore, 88);
  assert.equal(compacted.finalSelectionState, "RESEARCH_ONLY");
  assert.equal(compacted.rawProviderPayload.omittedFromReport, true);
  assert.equal(compacted.websiteText.omittedFromReport, true);
  assert.ok(compacted.finalBlockingReasons.length <= 11);
  assert.equal(compacted.reportCompaction.mode, "bounded-project");
});

test("report meta compactor replaces full discovery candidate arrays with counts and samples", () => {
  const candidates = Array.from({ length: 200 }, (_, index) => ({
    name: `Candidate ${index}`,
    symbol: `C${index}`,
    rawPayload: "p".repeat(25_000),
  }));

  const compacted = compactMetaForReportWriters({
    runId: "scan_test",
    discovery: {
      mode: "free-max",
      rawCount: 200,
      dedupedCount: 200,
      acceptedCount: 125,
      candidates,
      shadowRejectedCandidates: candidates,
      discoveryCoverage: { shadowRejected: candidates },
    },
  });

  assert.equal(compacted.runId, "scan_test");
  assert.equal(compacted.discovery.candidateCount, 200);
  assert.equal(compacted.discovery.shadowRejectedCandidateCount, 200);
  assert.equal(compacted.discovery.candidateSamples.length, 50);
  assert.equal(compacted.discovery.shadowRejectedSamples.length, 50);
  assert.equal("candidates" in compacted.discovery, false);
  assert.equal("shadowRejectedCandidates" in compacted.discovery, false);
  assert.equal(compacted.discovery.discoveryCoverage.shadowRejected, undefined);
});

test("report project array compactor does not double-compact already bounded projects", () => {
  const [first] = compactProjectsForReportWriters([
    { name: "One", symbol: "ONE", pipelineScore: 10 },
  ]);
  const [second] = compactProjectsForReportWriters([first]);

  assert.strictEqual(second, first);
  assert.equal(second.reportCompaction.mode, "bounded-project");
});
