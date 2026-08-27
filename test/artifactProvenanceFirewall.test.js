import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { publishGithubPagesDashboard } from "../src/reports/githubPagesPublisher.js";
import { writeScanArtifactManifest } from "../src/reports/scanArtifactManifestReportEngine.js";

const SHA = "a".repeat(40);
const NOW = "2026-08-27T12:00:00.000Z";

function temp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeReport(directory, fileName, overrides = {}) {
  fs.writeFileSync(
    path.join(directory, fileName),
    JSON.stringify({
      generatedAt: NOW,
      scanRunId: "scan_provenance_1",
      codeCommitSha: SHA,
      dataCutoffTimestamp: NOW,
      status: "PASS",
      projectsAnalyzed: 1,
      rows: [],
      ...overrides,
    }),
  );
}

test("live manifest becomes publishable only with immutable current provenance", () => {
  const reportsDir = temp("live-provenance-");
  const files = ["route-universe.json", "live-core-ranking.json"];
  files.forEach((fileName) => writeReport(reportsDir, fileName));

  const { report } = writeScanArtifactManifest(
    {
      scanRunId: "scan_provenance_1",
      codeCommitSha: SHA,
      dataCutoffTimestamp: NOW,
      artifactClass: "LIVE_SHADOW",
      evidenceMode: "SHADOW_RESEARCH_ONLY",
    },
    { reportsDir, files, now: NOW },
  );

  assert.equal(report.status, "COMPLETE");
  assert.equal(report.livePublishable, true);
  assert.equal(report.artifactClass, "LIVE_SHADOW");
  assert.match(report.provenanceFingerprint, /^[0-9a-f]{64}$/);
});

test("fixture identities fail closed in a live artifact manifest", () => {
  const reportsDir = temp("fixture-provenance-");
  const files = ["route-universe.json"];
  writeReport(reportsDir, files[0], {
    routes: [{
      name: "Repair Candidate",
      symbol: "GEN",
      tokenAddress: "0x1111111111111111111111111111111111111111",
      poolAddress: "0x2222222222222222222222222222222222222222",
    }],
  });

  const { report } = writeScanArtifactManifest(
    {
      scanRunId: "scan_provenance_1",
      codeCommitSha: SHA,
      dataCutoffTimestamp: NOW,
      artifactClass: "LIVE_SHADOW",
    },
    { reportsDir, files, now: NOW },
  );

  assert.equal(report.status, "INCOMPLETE");
  assert.equal(report.livePublishable, false);
  assert.ok(report.errors.some((error) => error.includes("fixture contamination")));
});

test("live manifest rejects mixed cutoffs and explicit test-class reports", () => {
  const reportsDir = temp("mixed-provenance-");
  const files = ["route-universe.json"];
  writeReport(reportsDir, files[0], {
    artifactClass: "TEST",
    dataCutoffTimestamp: "2026-08-27T11:59:00.000Z",
  });

  const { report } = writeScanArtifactManifest(
    {
      scanRunId: "scan_provenance_1",
      codeCommitSha: SHA,
      dataCutoffTimestamp: NOW,
      artifactClass: "LIVE_SHADOW",
    },
    { reportsDir, files, now: NOW },
  );

  assert.equal(report.status, "INCOMPLETE");
  assert.equal(report.livePublishable, false);
  assert.ok(report.errors.some((error) => error.includes("dataCutoffTimestamp does not match")));
  assert.ok(report.errors.some((error) => error.includes("artifactClass TEST does not match")));
});

test("required-live publishing replaces stale outputs with a no-live-data page", () => {
  const reportsDir = temp("blocked-publication-reports-");
  const docsDir = temp("blocked-publication-docs-");
  fs.writeFileSync(path.join(reportsDir, "scan-artifact-manifest.json"), JSON.stringify({
    schemaVersion: 2,
    status: "INCOMPLETE",
    scanRunId: "scan_failed",
    codeCommitSha: SHA,
    artifactClass: "LIVE_SHADOW",
    livePublishable: false,
    errors: ["route-universe.json: fixture contamination"],
  }));
  fs.writeFileSync(path.join(docsDir, "route-universe.json"), JSON.stringify({ status: "STALE" }));
  fs.writeFileSync(path.join(docsDir, "index.html"), "stale dashboard");

  const result = publishGithubPagesDashboard({ reportsDir, docsDir, requireLive: true });
  const status = JSON.parse(fs.readFileSync(path.join(docsDir, "publication-status.json"), "utf8"));
  const html = fs.readFileSync(path.join(docsDir, "index.html"), "utf8");

  assert.equal(result.publicationMode, "NO_LIVE_DATA");
  assert.equal(status.state, "NO_LIVE_DATA_PUBLISHED");
  assert.equal(status.staleResultsPublished, false);
  assert.equal(fs.existsSync(path.join(docsDir, "route-universe.json")), false);
  assert.ok(html.includes("NO LIVE DATA PUBLISHED"));
  assert.equal(html.includes("stale dashboard"), false);
});
