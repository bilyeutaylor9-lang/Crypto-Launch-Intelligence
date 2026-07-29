import fs from "fs";
import path from "path";
import { REQUIRED_REPORT_FILES, validateReportContracts } from "./reportContractValidator.js";

function readJson(fileName = "", reportsDir = path.resolve("reports")) {
  const filePath = path.join(reportsDir, fileName);
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function statusFromFailures(failures = []) {
  if (failures.some((item) => item.severity === "FAIL")) return "FAIL";
  if (failures.length) return "DEGRADED";
  return "PASS";
}

function countFailures(value) {
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === "object") return Object.keys(value).length;
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

export function summarizeSystemReadiness(meta = {}, options = {}) {
  const reportsDir = path.resolve(options.reportsDir || "reports");
  const requiredFiles = (options.requiredFiles || REQUIRED_REPORT_FILES).filter(
    (fileName) => fileName !== "system-readiness.json"
  );
  const validation = validateReportContracts({ reportsDir, requiredFiles });
  const engineHealth = readJson("engine-health-report.json", reportsDir) || {};
  const wholeEngineAudit = readJson("whole-engine-audit.json", reportsDir) || {};
  const contractHealth = readJson("engine-data-contract-health.json", reportsDir) || {};
  const sourceGaps = readJson("daily-source-gaps.json", reportsDir) || {};
  const dailyCapital = readJson("daily-capital-move.json", reportsDir) || {};
  const recovery = readJson("daily-recovery-queue.json", reportsDir) || {};
  const dataStarvation = readJson("data-starvation-root-cause.json", reportsDir) || {};
  const routeHealth = readJson("venue-coverage-health.json", reportsDir) || {};
  const opMode = readJson("op-mode-readiness.json", reportsDir) || {};

  const failures = [];
  if (validation.status !== "PASS") {
    failures.push({ area: "reports", severity: "FAIL", reason: "Required report contract validation failed.", nextAction: "Run npm run results:health and fix missing/invalid JSON." });
  }
  if (countFailures(engineHealth.failures || engineHealth.failedEngines || engineHealth.enginesFailed || 0) > 0) {
    failures.push({ area: "engines", severity: "FAIL", reason: "One or more engines failed.", nextAction: "Open engine-health-report.json and fix failed engines before trusting scan output." });
  }
  if (wholeEngineAudit.status === "FAIL" || wholeEngineAudit.runtimeDataStatus === "FAIL") {
    failures.push({ area: "whole-engine-audit", severity: "FAIL", reason: "Whole-engine audit found runtime or import failures.", nextAction: "Open whole-engine-audit.json and repair the topRepairQueue." });
  } else if (Number(wholeEngineAudit.summary?.outputMissingEngineCount || 0) > 0) {
    failures.push({ area: "whole-engine-audit", severity: "WARN", reason: "Some engines are missing runtime outputs.", nextAction: "Open whole-engine-audit.json and repair output-missing engines." });
  }
  if (contractHealth.status && contractHealth.status !== "PASS") {
    failures.push({ area: "engine-contracts", severity: "FAIL", reason: "Engine input/output contract gaps exist.", nextAction: "Open engine-data-contract-health.json and repair missing inputs/outputs." });
  }
  if (dailyCapital.status === "NO_PROJECTS") {
    failures.push({ area: "daily-capital", severity: "WARN", reason: "No projects reached daily capital evaluation.", nextAction: "Check discovery and pipeline-stage reports." });
  }
  if (dailyCapital.status === "NO_VALID_MOVE_TODAY") {
    failures.push({ area: "daily-capital", severity: "WARN", reason: "No valid daily capital move today.", nextAction: "Use daily-recovery-queue.json and do not force a pick." });
  }
  if (Number(sourceGaps.failedCount || 0) + Number(sourceGaps.missingKeyCount || 0) + Number(sourceGaps.rateLimitedCount || 0) > 0) {
    failures.push({ area: "sources", severity: "WARN", reason: "Provider/source gaps reduce coverage.", nextAction: "Open daily-source-gaps.json and add keys or wait for cooldowns." });
  }
  if (opMode.status && !["READY", "PASS"].includes(opMode.status)) {
    failures.push({ area: "op-mode", severity: "WARN", reason: `OP Mode status is ${opMode.status}.`, nextAction: "Open op-mode-readiness.json for exact setup gaps." });
  }

  return {
    generatedAt: new Date().toISOString(),
    scanRunId: meta.scanRunId || meta.runId || process.env.GITHUB_RUN_ID || null,
    codeCommitSha: meta.codeCommitSha || process.env.GITHUB_SHA || null,
    status: statusFromFailures(failures),
    objective: "One master readiness gate for scanner completion, engine contracts, reports, dashboard data, source coverage, routes, Supabase, and daily capital research.",
    scanStatus: meta.scannedProjects || meta.projectsAnalyzed || meta.discoveredProjects ? "SCAN_COMPLETED" : "SCAN_STATUS_UNKNOWN",
    engineStatus: engineHealth.status || engineHealth.pipelineStatus || "REPORT_NOT_GENERATED",
    wholeEngineAuditStatus: wholeEngineAudit.status || "REPORT_NOT_GENERATED",
    wholeEngineRuntimeDataStatus: wholeEngineAudit.runtimeDataStatus || "REPORT_NOT_GENERATED",
    wholeEngineContractCoverageStatus: wholeEngineAudit.contractCoverageStatus || wholeEngineAudit.status || "REPORT_NOT_GENERATED",
    engineContractStatus: contractHealth.status || "REPORT_NOT_GENERATED",
    providerStatus: sourceGaps.status || "REPORT_NOT_GENERATED",
    reportStatus: validation.status,
    dashboardStatus: validation.status === "PASS" ? "DASHBOARD_INPUTS_READY" : "DASHBOARD_INPUTS_INVALID",
    supabaseStatus: meta.supabaseMemory?.status || meta.supabaseSync?.status || "OPTIONAL_OR_UNKNOWN",
    dataStarvationStatus: dataStarvation.status || "REPORT_NOT_GENERATED",
    routeStatus: routeHealth.status || "REPORT_NOT_GENERATED",
    dailyCapitalStatus: dailyCapital.status || "REPORT_NOT_GENERATED",
    recoveryStatus: recovery.status || "REPORT_NOT_GENERATED",
    requiredReportCount: requiredFiles.length,
    checkedReportCount: validation.checkedFiles,
    wholeEngineAuditSummary: wholeEngineAudit.summary || {},
    failures,
    nextFixes: failures.map((item) => item.nextAction).slice(0, 12),
    policy: [
      "A successful scan must publish valid reports, not only finish Node execution.",
      "No daily pick is forced when proof is missing.",
      "Engine output gaps are pipeline failures, not external market-data shortages.",
      "Provider failures create recovery actions instead of candidate penalties.",
    ],
  };
}

export function writeSystemReadinessReport(meta = {}, options = {}) {
  const reportsDir = path.resolve(options.reportsDir || "reports");
  fs.mkdirSync(reportsDir, { recursive: true });
  const report = summarizeSystemReadiness(meta, { ...options, reportsDir });
  const filePath = path.join(reportsDir, "system-readiness.json");
  fs.writeFileSync(filePath, JSON.stringify(report, null, 2));
  return { filePath, report };
}
