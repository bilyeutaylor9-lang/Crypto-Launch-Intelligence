import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {setTimeout} from "node:timers/promises";
import {decisionCompleteProject} from "./fixtures/decisionCompleteProject.js";
import {summarizeEvidenceFunnel, hasVerifiedExecutionRoute} from "../src/kernel/evidenceFunnelSummary.js";
import {createEvidenceFunnelSnapshot} from "../src/reports/evidenceFunnelSnapshot.js";
import {writeHtmlReport} from "../src/reports/htmlReportEngine.js";
import {writeJsonReport} from "../src/reports/jsonReportEngine.js";
import {writeGuardedLiveRankingReports} from "../src/ranking/guardedLiveRankingEngine.js";
import {summarizeHighUpsideScalpResearch} from "../src/reports/highUpsideScalpReportEngine.js";
import {summarizeExecutionProofRecovery} from "../src/reports/executionProofRecoveryReportEngine.js";
import {publishGithubPagesDashboard} from "../src/reports/githubPagesPublisher.js";

test("delayed HTML, ranking, scalp and Pages share frozen counts without reviving expired quotes", async () => {
  const timestamp = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 1000).toISOString();
  const timing = {quoteTimestamp: timestamp, quoteExpiresAt: expiresAt,
    buyQuote: {verified: true, timestamp, expiresAt}, sellQuote: {verified: true, timestamp, expiresAt}};
  const project = decisionCompleteProject({...timing, quoteAgeSeconds: 0, pipelineScore: 84,
    marketCap: 22_000_000, riskScore: 18, trapRiskScore: 12, finalSelectionQualified: false});
  project.canonicalExecutionRoute = {...project.canonicalExecutionRoute, ...timing};
  project.executionProof = {...project.executionProof, ...timing};
  project.executionProofRecovery = {status: "DEFERRED_TO_WAVE3"};
  project.activeEvidenceRecovery = {waves: ["WAVE3"], attempts: [{family: "EXECUTION"}],
    executionAdapterResults: [{adapter: "raydium", status: "ROUTE_RECOVERED"}], providerAttempts: []};
  project.executionProofRecoveryRoute = {...project.canonicalExecutionRoute, ...timing,
    source: "raydium", verificationStatus: "VERIFIED_PROVIDER_OBSERVATION", recoveryRun: true,
    exactIdentityVerified: true, buyQuoteVerified: true, sellQuoteVerified: true};
  const projects = [project];
  const summary = summarizeEvidenceFunnel(projects);
  assert.equal(summary.verifiedRoutes, 1);
  assert.equal(summary.fullyQualified, 0);
  const cutoff = new Date().toISOString();
  const meta = {runId: "frozen-report-integration", scanRunId: "frozen-report-integration",
    artifactClass: "TEST", evidenceMode: "OFFLINE_FIXTURE", dataCutoffTimestamp: cutoff, completedAt: cutoff};
  meta.evidenceFunnelSnapshot = createEvidenceFunnelSnapshot(projects, summary, meta);
  const original = JSON.stringify(projects);
  await setTimeout(Math.max(1, Date.parse(expiresAt) - Date.now() + 20));
  assert.equal(hasVerifiedExecutionRoute(project), false);
  assert.equal(summarizeEvidenceFunnel(projects).verifiedRoutes, 0);

  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "cli-frozen-report-"));
  const cwd = process.cwd();
  try {
    process.chdir(temp);
    writeJsonReport(projects, meta);
    const htmlPath = writeHtmlReport(projects, meta);
    const html = fs.readFileSync(htmlPath, "utf8");
    assert.match(html, /<h2>1<\/h2>\s*<p>Verified Routes At Scan<\/p>/);
    assert.ok(html.includes(cutoff));
    const paths = writeGuardedLiveRankingReports(projects, meta);
    const ranking = JSON.parse(fs.readFileSync(paths.liveCoreRankingJsonPath, "utf8"));
    assert.equal(ranking.funnelSummary.verifiedRoutes, 1);
    assert.equal(ranking.funnelSummary.fullyQualified, 0);
    assert.equal(ranking.funnelSummary.evidenceBasis, "FROZEN_SCAN");
    assert.equal(ranking.funnelSummary.asOfTimestamp, cutoff);
    const scalp = summarizeHighUpsideScalpResearch(projects, meta);
    assert.equal(scalp.funnelSummary.verifiedRoutes, 1);
    fs.writeFileSync("reports/high-upside-scalp-research.json", JSON.stringify(scalp));
    const recovery = summarizeExecutionProofRecovery(projects, meta);
    assert.equal(recovery.observedPairedRecoveries, 1);
    assert.equal(recovery.freshRouteCountAtReportGeneration, 0);
    assert.equal(recovery.verifiedRoutesAtScan, 1);
    assert.match(recovery.remainingActions.join(" "), /none remained fresh at report generation/);
    publishGithubPagesDashboard({reportsDir: path.join(temp, "reports"), docsDir: path.join(temp, "docs"), requireLive: false});
    const page = fs.readFileSync("docs/index.html", "utf8");
    assert.match(page, /<div class="metric-value">1<\/div><div class="metric-label">Verified Routes At Scan<\/div>/);
    assert.ok(page.includes(cutoff));
    assert.equal(hasVerifiedExecutionRoute(project), false);
    assert.equal(JSON.stringify(projects), original);

    const negative = {...project, executionProof: {...project.executionProof, safetyVerified: false}};
    const rejected = fs.readFileSync(writeHtmlReport([negative], meta), "utf8");
    assert.match(rejected, /<h2>0<\/h2>\s*<p>Verified Routes At Report<\/p>/);
  } finally {
    process.chdir(cwd);
    fs.rmSync(temp, {recursive: true, force: true});
  }
});

test("frozen funnel consumption is reporting-only and capture follows the settled current snapshot", () => {
  const ranking = fs.readFileSync(new URL("../src/ranking/guardedLiveRankingEngine.js", import.meta.url), "utf8");
  const start = ranking.indexOf("export function buildGuardedLiveRanking(");
  const end = ranking.indexOf("export function writeGuardedLiveRankingReports(");
  assert.ok(start >= 0 && end > start);
  assert.equal(ranking.slice(start, end).includes("getFrozenEvidenceFunnel("), false);
  const entry = fs.readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  const settled = entry.indexOf("const completedAt = publication.completedAt");
  const frozen = entry.indexOf("reportMeta.evidenceFunnelSnapshot = createEvidenceFunnelSnapshot(");
  const future = entry.indexOf("reportMeta.forwardEvidence = await runForwardEvidenceCapture(");
  assert.ok(settled >= 0 && settled < frozen && frozen < future);
});
