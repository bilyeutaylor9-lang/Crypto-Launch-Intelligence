import fs from "fs";
import path from "path";
import crypto from "node:crypto";

export const REQUIRED_REPORT_FILES = [
  "small-cap-hunter.json",
  "proof-of-alpha-execution-twin.json",
  "organic-demand-integrity.json",
  "quantum-field.json",
  "quantum-reasoning-brain.json",
  "quantum-suite-health.json",
  "capital-migration-core.json",
  "chain-capital-rotation.json",
  "narrative-capital-rotation.json",
  "market-cap-rotation.json",
  "capital-outflow-watch.json",
  "pipeline-stage-health.json",
  "mathematical-validation.json",
  "exact-outcome-horizon-lab.json",
  "debug-execution-proof.json",
  "debug-stage-health.json",
  "engine-data-readiness.json",
  "engine-data-contract-health.json",
  "whole-engine-audit.json",
  "engine-value-ledger.json",
  "route-universe.json",
  "execution-proof-recovery.json",
  "alternative-execution-routes.json",
  "user-accessibility-ranking.json",
  "venue-coverage-health.json",
  "data-starvation-root-cause.json",
  "data-starvation-by-chain.json",
  "data-starvation-by-provider.json",
  "data-starvation-by-engine.json",
  "data-starvation-by-field.json",
  "starvation-rescue-queue.json",
  "starvation-recovery-results.json",
  "recovered-opportunity-watchlist.json",
  "early-asymmetry-ranking.json",
  "first-seen-opportunities.json",
  "missed-winner-replay.json",
  "pre-breakout-sequence-analysis.json",
  "early-opportunity-outcomes.json",
  "alias-resolution-summary.json",
  "alias-resolution-conflicts.json",
  "provider-vocabulary-coverage.json",
  "unresolved-field-verbiage.json",
  "rejected-alias-candidates.json",
  "alias-starvation-recoveries.json",
  "advertised-category-coverage.json",
  "crawler-health.json",
  "real-utility-opportunities.json",
  "high-upside-scalp-research.json",
  "scalp-microstructure.json",
  "hottest-ten-now.json",
  "top-10-breakout-picks.json",
  "top10-candidate-input.json",
  "daily-capital-move.json",
  "daily-recovery-queue.json",
  "daily-source-gaps.json",
  "system-readiness.json",
  "scan-artifact-manifest.json",
  "decision-report-compaction-audit.json",
  "institutional-ranking.json",
  "live-core-ranking.json",
  "micro-test-watchlist.json",
];

export const DASHBOARD_CRITICAL_REPORT_FILES = [
  "system-readiness.json",
  "daily-source-gaps.json",
  "high-upside-scalp-research.json",
  "hottest-ten-now.json",
  "daily-capital-move.json",
  "top-10-breakout-picks.json",
  "route-universe.json",
  "execution-proof-recovery.json",
  "user-accessibility-ranking.json",
  "live-core-ranking.json",
  "micro-test-watchlist.json",
];

function invalidValueIssues(value, location = "root", issues = []) {
  if (value === undefined) {
    issues.push(`${location}: undefined`);
    return issues;
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    issues.push(`${location}: non-finite number`);
    return issues;
  }
  if (typeof value === "string" && /^(nan|infinity|-infinity)$/i.test(value.trim())) {
    issues.push(`${location}: non-finite string`);
    return issues;
  }
  if (typeof value === "string" && value.trim() === "N/A") {
    issues.push(`${location}: ambiguous N/A placeholder`);
    return issues;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => invalidValueIssues(item, `${location}[${index}]`, issues));
    return issues;
  }
  if (value && typeof value === "object") {
    Object.entries(value).forEach(([key, nested]) => invalidValueIssues(nested, `${location}.${key}`, issues));
  }
  return issues;
}

function highUpsideScalpIssues(report = {}, fileName = "high-upside-scalp-research.json") {
  if (fileName !== "high-upside-scalp-research.json") return [];
  if (!report || typeof report !== "object" || Array.isArray(report)) return [];
  if (report.mode !== "HIGH_UPSIDE_SCALP_RESEARCH" && report.projectsAnalyzed === undefined) return [];

  const issues = [];
  const projectsAnalyzed = Number(report.projectsAnalyzed);
  if (!Number.isFinite(projectsAnalyzed)) {
    issues.push(`${fileName}: projectsAnalyzed must be numeric`);
    return issues;
  }

  const laneDistribution = report.laneDistribution || {};
  const laneTotal = Object.values(laneDistribution).reduce((sum, count) => {
    const parsed = Number(count);
    return sum + (Number.isFinite(parsed) ? parsed : 0);
  }, 0);

  if (laneTotal !== projectsAnalyzed) {
    issues.push(`${fileName}: laneDistribution total ${laneTotal} does not equal projectsAnalyzed ${projectsAnalyzed}`);
  }

  if (report.classificationInvariant?.status === "FAIL") {
    issues.push(`${fileName}: classification invariant failed`);
  }

  if (report.status === "PASS_WITH_SCALP_READY" && Number(report.scalpReadyCount || 0) <= 0) {
    issues.push(`${fileName}: PASS_WITH_SCALP_READY requires at least one scalp-ready candidate`);
  }

  if (
    report.status === "PASS_WITH_WATCHLIST" &&
    Number(report.highUpsideWatchCount || 0) +
      Number(report.researchOnlyRouteMissingCount || 0) +
      Number(report.manualReviewCount || 0) <= 0
  ) {
    issues.push(`${fileName}: PASS_WITH_WATCHLIST requires a watchlist, route-missing, or manual-review research candidate`);
  }

  return issues;
}

function guardedLiveRankingIssues(report = {}, fileName = "") {
  if (!["live-core-ranking.json", "micro-test-watchlist.json"].includes(fileName)) return [];
  const issues = [];
  if (!comparableScanId(report)) issues.push(`${fileName}: scanRunId missing`);
  if (report.automaticTradingEnabled !== false) {
    issues.push(`${fileName}: automaticTradingEnabled must be false`);
  }
  const candidates = fileName === "live-core-ranking.json" ? report.microEligible || [] : report.candidates || [];
  for (const candidate of candidates) {
    if (candidate.liveActionStatus !== "MICRO_TEST_ELIGIBLE") {
      issues.push(`${fileName}: non-eligible candidate appears in micro-test output`);
    }
    if (
      candidate.liveExecutionReady !== true ||
      candidate.safetyVerified !== true ||
      candidate.liveRankingTrace?.baseline?.eligible !== true ||
      candidate.liveRankingDisplayEligible !== true ||
      (report.configuration?.requireUtility !== false &&
        candidate.liveRankingUtilityEligible !== true)
    ) {
      issues.push(`${fileName}: micro-test candidate lacks execution, safety, or measured baseline proof`);
    }
  }
  if (fileName === "live-core-ranking.json") {
    const top10 = report.top10 || [];
    for (const candidate of top10) {
      if (!["MICRO_TEST_ELIGIBLE", "RESEARCH_WATCHLIST"].includes(candidate.liveActionStatus)) {
        issues.push(`${fileName}: data-recovery or blocked candidate appears in guarded top10`);
      }
      if (
        candidate.liveRankingDisplayEligible !== true ||
        (report.configuration?.requireUtility !== false &&
          candidate.liveRankingUtilityEligible !== true)
      ) {
        issues.push(`${fileName}: guarded top10 candidate lacks clean identity or utility proof`);
      }
    }
    const summary = report.summary || {};
    const total =
      Number(summary.microTestEligible || 0) +
      Number(summary.researchWatchlist || 0) +
      Number(summary.dataRecoveryRequired || 0) +
      Number(summary.blocked || 0);
    if (total !== Number(report.projectsAnalyzed || 0)) {
      issues.push(`${fileName}: status counts ${total} do not equal projectsAnalyzed ${report.projectsAnalyzed}`);
    }
    if (
      Number(summary.microTestEligible || 0) + Number(summary.researchWatchlist || 0) === 0 &&
      top10.length > 0
    ) {
      issues.push(`${fileName}: guarded top10 must be empty when no evidence-backed candidate qualifies`);
    }
  }
  return issues;
}

function utilityQualityIssues(report = {}, fileName = "") {
  if (fileName !== "real-utility-opportunities.json") return [];
  const issues = [];
  const utilityLeads = Array.isArray(report.topRealUtilityResearch)
    ? report.topRealUtilityResearch
    : [];
  const speculativeLeads = Array.isArray(report.memeSpeculationOnly)
    ? report.memeSpeculationOnly
    : [];

  for (const candidate of utilityLeads) {
    if (
      candidate.realUtilityQualified !== true ||
      candidate.utilityIdentityEligible !== true
    ) {
      issues.push(
        `${fileName}: real-utility lead lacks qualified utility or valid project identity`
      );
    }
  }
  for (const candidate of speculativeLeads) {
    if (
      candidate.memeOnlySpeculative !== true ||
      candidate.utilityIdentityEligible !== true
    ) {
      issues.push(
        `${fileName}: speculative lead lacks explicit speculation classification or valid project identity`
      );
    }
  }
  if (Number(report.realUtilityQualifiedCount || 0) > 0 && utilityLeads.length === 0) {
    issues.push(`${fileName}: qualified utility count is nonzero but no utility lead is published`);
  }

  return issues;
}

function readJsonIfExists(filePath = "") {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function comparableScanId(report = {}) {
  return report.scanRunId || report.meta?.scanRunId || null;
}

function comparableCount(report = {}) {
  if (report.projectsAnalyzed !== undefined) return Number(report.projectsAnalyzed);
  if (report.inputProjectCount !== undefined) return Number(report.inputProjectCount);
  if (report.projectCount !== undefined) return Number(report.projectCount);
  return null;
}

function fileSha256(filePath = "") {
  return fs.existsSync(filePath)
    ? crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex")
    : null;
}

export function validateDashboardArtifactConsistency(options = {}) {
  const reportsDir = path.resolve(options.reportsDir || "reports");
  const docsDir = path.resolve(options.docsDir || "docs");
  const requestedFiles = options.files || DASHBOARD_CRITICAL_REPORT_FILES;
  const criticalSet = new Set(DASHBOARD_CRITICAL_REPORT_FILES);
  const files = requestedFiles.filter((fileName) => criticalSet.has(fileName));
  const issues = [];
  const checked = [];
  const reportScanIds = new Set();
  const docsScanIds = new Set();

  for (const fileName of files) {
    const reportsPath = path.join(reportsDir, fileName);
    const docsPath = path.join(docsDir, fileName);
    const reportsReport = readJsonIfExists(reportsPath);
    const docsReport = readJsonIfExists(docsPath);
    if (!reportsReport || !docsReport) {
      issues.push(`${fileName}: missing from ${!reportsReport ? "reports" : "docs"} during dashboard consistency check`);
      checked.push({ fileName, status: "MISSING" });
      continue;
    }

    const reportScanId = comparableScanId(reportsReport);
    const docsScanId = comparableScanId(docsReport);
    const reportCount = comparableCount(reportsReport);
    const docsCount = comparableCount(docsReport);
    const fileIssues = [];

    if (!reportScanId) fileIssues.push("reports scanRunId missing");
    if (!docsScanId) fileIssues.push("docs scanRunId missing");
    if (reportScanId) reportScanIds.add(reportScanId);
    if (docsScanId) docsScanIds.add(docsScanId);
    if (reportScanId && docsScanId && reportScanId !== docsScanId) {
      fileIssues.push(`scanRunId mismatch reports=${reportScanId} docs=${docsScanId}`);
    }
    const reportsHash = fileSha256(reportsPath);
    const docsHash = fileSha256(docsPath);
    if (reportsHash && docsHash && reportsHash !== docsHash) {
      fileIssues.push(`artifact hash mismatch reports=${reportsHash} docs=${docsHash}`);
    }
    if (reportsReport.status !== docsReport.status) {
      fileIssues.push(`status mismatch reports=${reportsReport.status} docs=${docsReport.status}`);
    }
    if (
      reportCount !== null &&
      docsCount !== null &&
      Number.isFinite(reportCount) &&
      Number.isFinite(docsCount) &&
      reportCount !== docsCount
    ) {
      fileIssues.push(`projects count mismatch reports=${reportCount} docs=${docsCount}`);
    }

    if (fileIssues.length) {
      issues.push(...fileIssues.map((issue) => `${fileName}: ${issue}`));
      checked.push({ fileName, status: "MISMATCH", issues: fileIssues });
    } else {
      checked.push({ fileName, status: "PASS" });
    }
  }

  if (reportScanIds.size > 1) {
    issues.push(`reports contain multiple dashboard scanRunIds: ${[...reportScanIds].join(", ")}`);
  }
  if (docsScanIds.size > 1) {
    issues.push(`docs contain multiple dashboard scanRunIds: ${[...docsScanIds].join(", ")}`);
  }

  return {
    status: issues.length ? "FAIL" : "PASS",
    reportsDir,
    docsDir,
    checkedFiles: checked.length,
    reportScanRunIds: [...reportScanIds],
    docsScanRunIds: [...docsScanIds],
    files: checked,
    errors: issues,
  };
}

export function validateReportContracts(options = {}) {
  const reportsDir = path.resolve(options.reportsDir || "reports");
  const requiredFiles = options.requiredFiles || REQUIRED_REPORT_FILES;
  const files = [];
  const errors = [];

  for (const fileName of requiredFiles) {
    const filePath = path.join(reportsDir, fileName);
    if (!fs.existsSync(filePath)) {
      errors.push(`${fileName}: missing required report`);
      files.push({ fileName, status: "MISSING" });
      continue;
    }

    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
      const valueIssues = invalidValueIssues(parsed, fileName).slice(0, 25);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && Object.keys(parsed).length === 0) {
        valueIssues.push(`${fileName}: empty report object`);
      }
      valueIssues.push(...highUpsideScalpIssues(parsed, fileName));
      valueIssues.push(...guardedLiveRankingIssues(parsed, fileName));
      valueIssues.push(...utilityQualityIssues(parsed, fileName));
      if (valueIssues.length) {
        errors.push(...valueIssues);
        files.push({ fileName, status: "INVALID", issues: valueIssues });
      } else {
        files.push({ fileName, status: "PASS" });
      }
    } catch (error) {
      errors.push(`${fileName}: malformed JSON (${error.message})`);
      files.push({ fileName, status: "MALFORMED", error: error.message });
    }
  }

  return {
    status: errors.length ? "FAIL" : "PASS",
    reportsDir,
    requiredFiles,
    checkedFiles: requiredFiles.length,
    files,
    errors,
  };
}

export function assertReportContracts(options = {}) {
  const result = validateReportContracts(options);
  if (result.status !== "PASS") {
    const message = [
      "Required report contract validation failed.",
      ...result.errors.slice(0, 20).map((error) => `- ${error}`),
    ].join("\n");
    const error = new Error(message);
    error.reportContractValidation = result;
    throw error;
  }
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = validateReportContracts();
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== "PASS") process.exitCode = 1;
}
