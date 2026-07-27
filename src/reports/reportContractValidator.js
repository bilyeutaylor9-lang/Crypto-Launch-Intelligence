import fs from "fs";
import path from "path";

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
  "daily-capital-move.json",
  "daily-recovery-queue.json",
  "daily-source-gaps.json",
  "system-readiness.json",
  "decision-report-compaction-audit.json",
  "institutional-ranking.json",
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
