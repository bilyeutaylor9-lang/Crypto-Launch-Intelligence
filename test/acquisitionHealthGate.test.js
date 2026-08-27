import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  buildAcquisitionHealthGate,
  loadAcquisitionHealthGate,
  runAcquisitionHealthGate,
} from "../src/diagnostics/acquisitionHealthGate.js";

function observed(overrides = {}) {
  return {
    generatedAt: "2026-08-20T17:00:00.000Z",
    state: "EDGE_ACQUISITION_OBSERVED",
    candidates: 50,
    observedChains: 1,
    continuousChains: 1,
    continuityGaps: 0,
    qualifyingTransfers: 0,
    fundedRecipients: 0,
    carriedWallets: 20,
    preparedWallets: 2,
    ...overrides,
  };
}

test("zero qualifying transfers under complete coverage is healthy negative evidence", () => {
  const report = buildAcquisitionHealthGate(observed(), {
    now: "2026-08-20T17:05:00.000Z",
    stepOutcome: "success",
  });
  assert.equal(report.state, "ACQUISITION_HEALTHY_NO_EVENT");
  assert.equal(report.observationClass, "HEALTHY_NEGATIVE_EVIDENCE");
  assert.equal(report.blockResearchAdvancement, false);
});

test("observed qualifying transfer is healthy positive evidence", () => {
  const report = buildAcquisitionHealthGate(observed({
    qualifyingTransfers: 2,
    fundedRecipients: 1,
  }), {
    now: "2026-08-20T17:05:00.000Z",
    stepOutcome: "success",
  });
  assert.equal(report.state, "ACQUISITION_HEALTHY_EVENT_OBSERVED");
  assert.equal(report.blockResearchAdvancement, false);
});

test("failed acquisition step always blocks research even if an old report looks healthy", () => {
  const report = buildAcquisitionHealthGate(observed(), {
    now: "2026-08-20T17:05:00.000Z",
    stepOutcome: "failure",
  });
  assert.equal(report.state, "ACQUISITION_FAILED");
  assert.ok(report.blockers.includes("ACQUISITION_STEP_FAILURE"));
});

test("missing report blocks strict acquisition health", () => {
  const report = buildAcquisitionHealthGate(null, {
    now: "2026-08-20T17:05:00.000Z",
    stepOutcome: "success",
  });
  assert.equal(report.blockResearchAdvancement, true);
  assert.ok(report.blockers.includes("ACQUISITION_REPORT_MISSING"));
});

test("missing exact candidate universe is an upstream failure, not no-event", () => {
  const report = buildAcquisitionHealthGate({
    generatedAt: "2026-08-20T17:00:00.000Z",
    state: "WAITING_FOR_EXACT_CANDIDATE_UNIVERSE",
    candidates: 0,
  }, {
    now: "2026-08-20T17:05:00.000Z",
    stepOutcome: "success",
  });
  assert.ok(report.blockers.includes("UPSTREAM_EXACT_CANDIDATE_UNIVERSE_MISSING"));
  assert.equal(report.observationClass, "INFRASTRUCTURE_OR_COVERAGE_FAILURE");
});

test("unavailable optional capital acquisition is excluded from proof without invalidating independent research", () => {
  const report = buildAcquisitionHealthGate(observed({
    state: "EDGE_ACQUISITION_DEGRADED",
    observedChains: 0,
    continuousChains: 0,
  }), {
    now: "2026-08-20T17:05:00.000Z",
    stepOutcome: "success",
  });
  assert.equal(report.blockResearchAdvancement, false);
  assert.equal(report.capitalEvidenceEligible, false);
  assert.ok(report.advisories.includes("CAPITAL_RADAR_UNAVAILABLE_RESEARCH_ONLY"));
});

test("continuity gap excludes capital attribution without blocking independent research", () => {
  const report = buildAcquisitionHealthGate(observed({
    continuityGaps: 17,
  }), {
    now: "2026-08-20T17:05:00.000Z",
    stepOutcome: "success",
  });
  assert.equal(report.blockResearchAdvancement, false);
  assert.equal(report.capitalEvidenceEligible, false);
  assert.ok(report.advisories.includes("CAPITAL_RADAR_PARTIAL_COVERAGE_EXCLUDED_FROM_PROOF"));
});

test("partial capital-radar continuity is excluded from proof without blocking independent exact-universe research", () => {
  const report = buildAcquisitionHealthGate(observed({
    observedChains: 2,
    continuousChains: 1,
  }), {
    now: "2026-08-20T17:05:00.000Z",
    stepOutcome: "success",
  });
  assert.equal(report.state, "ACQUISITION_HEALTHY_LIMITED_COVERAGE");
  assert.equal(report.blockResearchAdvancement, false);
  assert.equal(report.capitalEvidenceEligible, false);
  assert.equal(report.blockCapitalAttribution, true);
  assert.ok(report.advisories.includes("CAPITAL_RADAR_PARTIAL_COVERAGE_EXCLUDED_FROM_PROOF"));
});

test("optional unsupported chains remain research-only rather than failing a healthy supported observation", () => {
  const report = buildAcquisitionHealthGate(observed({
    unsupportedChains: 6,
  }), {
    now: "2026-08-20T17:05:00.000Z",
    stepOutcome: "success",
  });
  assert.equal(report.healthy, true);
  assert.equal(report.capitalEvidenceEligible, true);
  assert.equal(report.blockResearchAdvancement, false);
  assert.ok(report.advisories.includes("UNSUPPORTED_CHAINS_RESEARCH_ONLY"));
});

test("stale acquisition report blocks research", () => {
  const report = buildAcquisitionHealthGate(observed({
    generatedAt: "2026-08-20T15:00:00.000Z",
  }), {
    now: "2026-08-20T17:05:00.000Z",
    stepOutcome: "success",
    maxReportAgeMinutes: 30,
  });
  assert.ok(report.blockers.includes("ACQUISITION_REPORT_STALE"));
});

test("loader returns UNKNOWN but non-promoting state when no report exists", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "acq-load-"));
  const report = loadAcquisitionHealthGate({ reportFile: path.join(dir, "missing.json") });
  assert.equal(report.state, "ACQUISITION_HEALTH_UNKNOWN");
  assert.equal(report.blockResearchAdvancement, false);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("CLI helper persists gate report", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "acq-run-"));
  const reportFile = path.join(dir, "gate.json");
  const report = runAcquisitionHealthGate({
    report: observed(),
    reportFile,
    now: "2026-08-20T17:05:00.000Z",
    stepOutcome: "success",
  });
  assert.equal(report.state, "ACQUISITION_HEALTHY_NO_EVENT");
  assert.equal(JSON.parse(fs.readFileSync(reportFile, "utf8")).state, "ACQUISITION_HEALTHY_NO_EVENT");
  fs.rmSync(dir, { recursive: true, force: true });
});
