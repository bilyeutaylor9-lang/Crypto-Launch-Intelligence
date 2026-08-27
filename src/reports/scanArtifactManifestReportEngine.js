import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { DASHBOARD_CRITICAL_REPORT_FILES } from "./reportContractValidator.js";
import { auditArtifactProvenance } from "./artifactProvenanceFirewall.js";

function readArtifact(filePath = "") {
  if (!fs.existsSync(filePath)) return null;
  const bytes = fs.readFileSync(filePath);
  try {
    return {
      bytes,
      parsed: JSON.parse(bytes.toString("utf8")),
    };
  } catch {
    return {
      bytes,
      parsed: null,
    };
  }
}

function scanRunId(report = {}) {
  return report?.scanRunId || report?.meta?.scanRunId || null;
}

function projectCount(report = {}) {
  const value =
    report?.projectsAnalyzed ??
    report?.inputProjectCount ??
    report?.projectCount ??
    report?.projectsAttempted ??
    null;
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

export function buildScanArtifactManifest(meta = {}, options = {}) {
  const reportsDir = path.resolve(options.reportsDir || "reports");
  const files = options.files || DASHBOARD_CRITICAL_REPORT_FILES;
  const expectedScanRunId =
    meta.scanRunId ||
    meta.runId ||
    process.env.SCAN_RUN_ID ||
    process.env.GITHUB_RUN_ID ||
    null;
  const artifacts = [];
  const errors = [];

  for (const fileName of files) {
    const artifact = readArtifact(path.join(reportsDir, fileName));
    if (!artifact) {
      artifacts.push({ fileName, status: "MISSING" });
      errors.push(`${fileName}: missing dashboard-critical artifact`);
      continue;
    }
    if (!artifact.parsed) {
      artifacts.push({ fileName, status: "MALFORMED", sha256: sha256(artifact.bytes) });
      errors.push(`${fileName}: malformed JSON`);
      continue;
    }

    const artifactScanRunId = scanRunId(artifact.parsed);
    const fileErrors = [];
    if (!artifactScanRunId) fileErrors.push("scanRunId missing");
    if (expectedScanRunId && artifactScanRunId && artifactScanRunId !== expectedScanRunId) {
      fileErrors.push(`scanRunId ${artifactScanRunId} does not match ${expectedScanRunId}`);
    }
    errors.push(...fileErrors.map((error) => `${fileName}: ${error}`));
    artifacts.push({
      fileName,
      status: fileErrors.length ? "INVALID" : "READY",
      scanRunId: artifactScanRunId,
      generatedAt: artifact.parsed.generatedAt || null,
      reportStatus: artifact.parsed.status || null,
      projectsAnalyzed: projectCount(artifact.parsed),
      bytes: artifact.bytes.length,
      sha256: sha256(artifact.bytes),
      errors: fileErrors,
      parsed: artifact.parsed,
    });
  }

  const observedScanRunIds = [...new Set(artifacts.map((item) => item.scanRunId).filter(Boolean))];
  if (observedScanRunIds.length > 1) {
    errors.push(`dashboard-critical artifacts contain multiple scanRunIds: ${observedScanRunIds.join(", ")}`);
  }

  const provenance = auditArtifactProvenance(
    {
      ...meta,
      scanRunId: expectedScanRunId || observedScanRunIds[0] || null,
      codeCommitSha: meta.codeCommitSha || process.env.GITHUB_SHA || null,
      dataCutoffTimestamp: meta.dataCutoffTimestamp || meta.completedAt || null,
    },
    artifacts,
    options,
  );
  errors.push(...provenance.errors);

  return {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    scanRunId: expectedScanRunId || observedScanRunIds[0] || null,
    codeCommitSha: meta.codeCommitSha || process.env.GITHUB_SHA || null,
    dataCutoffTimestamp: meta.dataCutoffTimestamp || meta.completedAt || null,
    artifactClass: provenance.artifactClass,
    evidenceMode: meta.evidenceMode || (provenance.liveClass ? "SHADOW_RESEARCH_ONLY" : provenance.artifactClass),
    livePublishable: provenance.livePublishable,
    provenanceFingerprint: provenance.provenanceFingerprint,
    provenance,
    status: errors.length ? "INCOMPLETE" : "COMPLETE",
    expectedScanRunId: expectedScanRunId || null,
    observedScanRunIds,
    artifactCount: artifacts.length,
    readyArtifactCount: artifacts.filter((item) => item.status === "READY").length,
    artifacts: artifacts.map(({ parsed: _parsed, ...artifact }) => artifact),
    errors,
  };
}

export function writeScanArtifactManifest(meta = {}, options = {}) {
  const reportsDir = path.resolve(options.reportsDir || "reports");
  fs.mkdirSync(reportsDir, { recursive: true });
  const report = buildScanArtifactManifest(meta, { ...options, reportsDir });
  const filePath = path.join(reportsDir, "scan-artifact-manifest.json");
  fs.writeFileSync(filePath, JSON.stringify(report, null, 2));
  return { filePath, report };
}

export function finalizeScanArtifactManifestPublication(options = {}) {
  const reportsDir = path.resolve(options.reportsDir || "reports");
  const docsDir = path.resolve(options.docsDir || "docs");
  const filePath = path.join(reportsDir, "scan-artifact-manifest.json");
  if (!fs.existsSync(filePath)) {
    throw new Error("scan-artifact-manifest.json must exist before dashboard publication.");
  }
  const report = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const publicationErrors = [];
  const publishedArtifacts = (report.artifacts || []).map((artifact) => {
    const docsPath = path.join(docsDir, artifact.fileName);
    if (!fs.existsSync(docsPath)) {
      publicationErrors.push(`${artifact.fileName}: missing from dashboard publication`);
      return { ...artifact, dashboardStatus: "MISSING" };
    }
    const docsBytes = fs.readFileSync(docsPath);
    const docsSha256 = sha256(docsBytes);
    if (artifact.sha256 && artifact.sha256 !== docsSha256) {
      publicationErrors.push(`${artifact.fileName}: dashboard hash does not match report hash`);
    }
    return {
      ...artifact,
      dashboardStatus: artifact.sha256 === docsSha256 ? "MATCH" : "MISMATCH",
      dashboardBytes: docsBytes.length,
      dashboardSha256: docsSha256,
    };
  });
  const finalized = {
    ...report,
    status: report.errors?.length || publicationErrors.length ? "INCOMPLETE" : "COMPLETE",
    dashboardPublicationTimestamp: new Date().toISOString(),
    dashboardArtifactCount: publishedArtifacts.length,
    dashboardMatchedArtifactCount: publishedArtifacts.filter((item) => item.dashboardStatus === "MATCH").length,
    artifacts: publishedArtifacts,
    publicationErrors,
  };
  fs.writeFileSync(filePath, JSON.stringify(finalized, null, 2));
  return { filePath, report: finalized };
}
