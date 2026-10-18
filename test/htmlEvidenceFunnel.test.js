import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { writeHtmlReport } from "../src/reports/htmlReportEngine.js";

function render(t, projects) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "html-evidence-funnel-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const previous = process.cwd();
  process.chdir(directory);
  try { return fs.readFileSync(writeHtmlReport(projects), "utf8"); }
  finally { process.chdir(previous); }
}

function metric(html, label, expected) {
  assert.match(html, new RegExp(`<h2>${expected}</h2>\\s*<p>${label}</p>`));
}

const deep = { name: "Research only", deepEvaluationState: "DEEP_EVALUATED", coreEvidenceState: "CORE_EVIDENCE_READY",
  coreEvidenceCoveragePct: 91, finalSelectionState: "INSUFFICIENT_DATA", bestAvailableEligible: false };

test("HTML recovery counts come from deep evidence, even when no candidate is best available", (t) => {
  const html = render(t, [{ ...deep, coreEvidenceState: "CORE_DATA_STARVED" }, deep,
    ...Array.from({ length: 5 }, () => ({ ...deep, deepEvaluationState: "DEFERRED_BEFORE_DEEP" }))]);
  metric(html, "Needs Data Recovery", 2);
  metric(html, "Deep Evaluated", 2);
  metric(html, "Deep Deferred", 5);
  metric(html, "Core Data Starved", 1);
  metric(html, "Insufficient-Data Candidates", 2);
  assert.doesNotMatch(html, /Missing-Evidence Tasks/);
});

test("HTML verified routes remain visible independently of final qualification", (t) => {
  const html = render(t, [{ ...deep, finalSelectionState: "RESEARCH_ONLY", liveExecutionReady: true }]);
  metric(html, "Verified Routes", 1);
  metric(html, "Qualified Candidates", 0);
});

test("HTML cannot publish stale qualified flags over current negative execution proof", (t) => {
  const stale = { ...deep, finalSelectionState: "QUALIFIED", finalSelectionQualified: true,
    identityVerified: true, contractVerified: true, purchaseRouteConfirmed: true,
    executionRouteAvailable: true, liquidityVerified: true, liveExecutionReady: true,
    executionProof: { buyQuoteVerified: false, sellQuoteVerified: false, executionStatus: "BLOCKED" } };
  const html = render(t, [stale]);
  metric(html, "Qualified Candidates", 0);
  metric(html, "Verified Routes", 0);
});

test("HTML cannot qualify or count routes from deferred or merely selected projects", (t) => {
  const stale = { ...deep, finalSelectionState: "QUALIFIED", finalSelectionQualified: true,
    identityVerified: true, contractVerified: true, purchaseRouteConfirmed: true,
    executionRouteAvailable: true, liquidityVerified: true, liveExecutionReady: true };
  const html = render(t, [{ ...stale, deepEvaluationState: "DEFERRED_BEFORE_DEEP" },
    { ...stale, deepEvaluationState: "SELECTED_FOR_DEEP" }]);
  metric(html, "Qualified Candidates", 0);
  metric(html, "Verified Routes", 0);
  metric(html, "Needs Data Recovery", 0);
});
