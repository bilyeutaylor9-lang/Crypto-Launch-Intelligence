import fs from "node:fs";
import path from "node:path";

import { writeScanArtifactManifest } from "./scanArtifactManifestReportEngine.js";
import { writeSystemReadinessReport } from "./systemReadinessReportEngine.js";

const AUDIT_REPORT_FILES = [
  "engine-health-report.json",
  "whole-engine-audit.json",
  "engine-value-ledger.json",
];

function readJson(filePath = "") {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function firstPresent(values = []) {
  return values.find((value) => value !== undefined && value !== null && value !== "") ?? null;
}

function reportMeta(reportsDir = path.resolve("reports")) {
  const manifest = readJson(path.join(reportsDir, "scan-artifact-manifest.json")) || {};
  const top10 = readJson(path.join(reportsDir, "top-10-breakout-picks.json")) || {};
  const highUpside = readJson(path.join(reportsDir, "high-upside-scalp-research.json")) || {};
  const currentReadiness = readJson(path.join(reportsDir, "system-readiness.json")) || {};

  return {
    scanRunId: firstPresent([
      manifest.scanRunId,
      manifest.expectedScanRunId,
      top10.scanRunId,
      highUpside.scanRunId,
      currentReadiness.scanRunId,
      process.env.SCAN_RUN_ID,
      process.env.GITHUB_RUN_ID,
    ]),
    codeCommitSha: firstPresent([
      manifest.codeCommitSha,
      top10.codeCommitSha,
      highUpside.codeCommitSha,
      currentReadiness.codeCommitSha,
      process.env.GITHUB_SHA,
    ]),
    dataCutoffTimestamp: firstPresent([
      manifest.dataCutoffTimestamp,
      top10.dataCutoffTimestamp,
      highUpside.dataCutoffTimestamp,
      currentReadiness.dataCutoffTimestamp,
    ]),
    artifactClass: firstPresent([
      manifest.artifactClass,
      top10.artifactClass,
      highUpside.artifactClass,
      currentReadiness.artifactClass,
      process.env.ARTIFACT_CLASS,
    ]),
    evidenceMode: firstPresent([
      manifest.evidenceMode,
      top10.evidenceMode,
      highUpside.evidenceMode,
      currentReadiness.evidenceMode,
    ]),
    scannedProjects: firstPresent([
      top10.projectsAnalyzed,
      highUpside.projectsAnalyzed,
      currentReadiness.projectsAnalyzed,
    ]),
    supabaseMemory: {
      status: currentReadiness.supabaseStatus || "OPTIONAL_OR_UNKNOWN",
      reason: currentReadiness.scannerSemanticHealth?.supabaseMemoryFailureReason || null,
    },
    scannerSemanticHealth: currentReadiness.scannerSemanticHealth || null,
  };
}

function stampAuditReports(reportsDir = path.resolve("reports"), meta = {}) {
  const stamped = [];
  for (const fileName of AUDIT_REPORT_FILES) {
    const filePath = path.join(reportsDir, fileName);
    const report = readJson(filePath);
    if (!report) continue;
    fs.writeFileSync(
      filePath,
      JSON.stringify(
        {
          ...report,
          scanRunId: meta.scanRunId,
          codeCommitSha: meta.codeCommitSha,
          dataCutoffTimestamp: meta.dataCutoffTimestamp,
        },
        null,
        2
      )
    );
    stamped.push(fileName);
  }
  return stamped;
}

export function refreshSystemReadinessReport(options = {}) {
  const reportsDir = path.resolve(options.reportsDir || "reports");
  const meta = { ...reportMeta(reportsDir), ...(options.meta || {}) };
  if (!meta.scanRunId) {
    throw new Error("Cannot refresh system readiness without a current scanRunId.");
  }

  const stampedAuditReports = stampAuditReports(reportsDir, meta);
  const readiness = writeSystemReadinessReport(meta, {
    reportsDir,
    ...(options.requiredFiles ? { requiredFiles: options.requiredFiles } : {}),
  });
  const manifest = writeScanArtifactManifest(meta, {
    reportsDir,
    ...(options.manifestFiles ? { files: options.manifestFiles } : {}),
  });

  return {
    scanRunId: meta.scanRunId,
    stampedAuditReports,
    systemReadinessPath: readiness.filePath,
    systemReadinessStatus: readiness.report.status,
    reportContractStatus: readiness.report.reportStatus,
    manifestPath: manifest.filePath,
    manifestStatus: manifest.report.status,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = refreshSystemReadinessReport();
  console.log(JSON.stringify(result, null, 2));
  if (
    result.systemReadinessStatus === "FAIL" ||
    result.reportContractStatus !== "PASS" ||
    result.manifestStatus !== "COMPLETE"
  ) {
    process.exitCode = 1;
  }
}
