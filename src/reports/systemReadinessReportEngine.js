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
  const blocking = failures.filter((item) => item.blocksReadiness !== false);
  if (blocking.some((item) => item.severity === "FAIL")) return "FAIL";
  if (blocking.length) return "DEGRADED";
  return "PASS";
}

function countFailures(value) {
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === "object") return Object.keys(value).length;
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function finding(item = {}, blocksReadiness = true) {
  return {
    ...item,
    blocksReadiness,
    readinessImpact: blocksReadiness ? "BLOCKING" : "ADVISORY",
  };
}

function scannerEvidenceIsHealthy(scannerSemanticHealth = {}, liveCoreRanking = {}) {
  return (
    scannerSemanticHealth.readinessClass === "HEALTHY_EVIDENCE" ||
    scannerSemanticHealth.healthyCoreEvidence === true ||
    liveCoreRanking.summary?.healthyCoreEvidence === true
  );
}

function scannerFoundNoEdgeWithHealthyEvidence(scannerSemanticHealth = {}, liveCoreRanking = {}) {
  const selectionOutcome =
    scannerSemanticHealth.selectionOutcome ||
    liveCoreRanking.summary?.selectionOutcome ||
    scannerSemanticHealth.status;
  return (
    scannerSemanticHealth.status === "NO_EDGE_FOUND" &&
    scannerEvidenceIsHealthy(scannerSemanticHealth, liveCoreRanking) &&
    selectionOutcome === "NO_EDGE_FOUND"
  );
}

export function summarizeSystemReadiness(meta = {}, options = {}) {
  const reportsDir = path.resolve(options.reportsDir || "reports");
  const requiredFiles = (options.requiredFiles || REQUIRED_REPORT_FILES).filter(
    (fileName) => !["system-readiness.json", "scan-artifact-manifest.json"].includes(fileName)
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
  const highUpsideScalp = readJson("high-upside-scalp-research.json", reportsDir) || {};
  const executionRecovery = readJson("execution-proof-recovery.json", reportsDir) || {};
  const liveCoreRanking = readJson("live-core-ranking.json", reportsDir) || {};
  const scannerSemanticHealth = meta.scannerSemanticHealth || {};
  const scalpReadyCount = Number(highUpsideScalp.scalpReadyCount || 0);
  const highUpsideWatchCount = Number(highUpsideScalp.highUpsideWatchCount || 0);
  const routePendingCount = Number(highUpsideScalp.researchOnlyRouteMissingCount || 0);
  const quarantinedIdentityOrRouteCount = Number(highUpsideScalp.quarantinedIdentityOrRouteCount || 0);
  const healthyEvidence = scannerEvidenceIsHealthy(scannerSemanticHealth, liveCoreRanking);
  const healthyNoEdge = scannerFoundNoEdgeWithHealthyEvidence(scannerSemanticHealth, liveCoreRanking);

  const failures = [];
  if (validation.status !== "PASS") {
    failures.push(finding({ area: "reports", severity: "FAIL", reason: "Required report contract validation failed.", nextAction: "Run npm run results:health and fix missing/invalid JSON." }));
  }
  if (countFailures(engineHealth.failures || engineHealth.failedEngines || engineHealth.enginesFailed || 0) > 0) {
    failures.push(finding({ area: "engines", severity: "FAIL", reason: "One or more engines failed.", nextAction: "Open engine-health-report.json and fix failed engines before trusting scan output." }));
  }
  if (wholeEngineAudit.status === "FAIL" || wholeEngineAudit.runtimeDataStatus === "FAIL") {
    failures.push(finding({ area: "whole-engine-audit", severity: "FAIL", reason: "Whole-engine audit found runtime or import failures.", nextAction: "Open whole-engine-audit.json and repair the topRepairQueue." }));
  } else if (Number(wholeEngineAudit.summary?.outputMissingEngineCount || 0) > 0) {
    failures.push(finding({ area: "whole-engine-audit", severity: "WARN", reason: "Some engines are missing runtime outputs.", nextAction: "Open whole-engine-audit.json and repair output-missing engines." }));
  }
  if (contractHealth.status && contractHealth.status !== "PASS") {
    const outputContractBroken =
      contractHealth.status === "OUTPUT_CONTRACT_GAPS" ||
      Number(contractHealth.outputContractMismatchProjects || 0) > 0;
    failures.push(finding({
      area: "engine-contracts",
      severity: outputContractBroken ? "FAIL" : "WARN",
      reason: outputContractBroken
        ? "Engine output contract gaps exist."
        : "Engine input contracts found recoverable candidate data gaps.",
      nextAction: outputContractBroken
        ? "Open engine-data-contract-health.json and repair missing engine outputs."
        : "Open engine-data-contract-health.json and daily-recovery-queue.json to recover missing candidate evidence.",
    }, outputContractBroken || !healthyEvidence));
  }
  if (dailyCapital.status === "NO_PROJECTS") {
    failures.push(finding({ area: "daily-capital", severity: "WARN", reason: "No projects reached daily capital evaluation.", nextAction: "Check discovery and pipeline-stage reports." }));
  }
  if (dailyCapital.status === "NO_VALID_MOVE_TODAY") {
    failures.push(finding({ area: "daily-capital", severity: "WARN", reason: "No valid daily capital move today.", nextAction: "Use daily-recovery-queue.json and do not force a pick." }));
  }
  if (Number(sourceGaps.failedCount || 0) + Number(sourceGaps.missingKeyCount || 0) + Number(sourceGaps.rateLimitedCount || 0) > 0) {
    const sourceBlindnessBlocksReadiness =
      sourceGaps.scannerBlindnessRisk === "CRITICAL" ||
      sourceGaps.scannerBlindnessRisk === "HIGH";
    const sourceBlocksReadiness =
      sourceBlindnessBlocksReadiness ||
      (!healthyEvidence && Number(sourceGaps.blockingGapCount || 0) > 0);
    failures.push(finding({
      area: "sources",
      severity: "WARN",
      reason: sourceBlocksReadiness
        ? "Provider/source gaps reduce coverage."
        : "Provider/source capacity advisories remain, but current scanner source coverage is healthy.",
      nextAction: sourceBlocksReadiness
        ? "Open daily-source-gaps.json and add keys or wait for cooldowns."
        : "Use paid keys and optional probes to improve capacity; do not downgrade a healthy no-edge scan for non-blocking source upside.",
    }, sourceBlocksReadiness));
  }
  if (["CRITICAL", "HIGH"].includes(sourceGaps.routePromotionBlindnessRisk)) {
    failures.push(finding({
      area: "candidate-promotion",
      severity: "WARN",
      reason: `Candidate promotion is blocked by ${sourceGaps.routePromotionBlindnessRisk.toLowerCase()} route-identity/quote source coverage.`,
      nextAction: "Restore DexScreener/GeckoTerminal/DeFiLlama exact identity coverage first, then recover LI.FI keyless or CEX public buy-sell proof; keyed Jupiter/0x remain optional.",
    }));
  }
  if (
    Number(highUpsideScalp.quarantinedIdentityOrRouteCount || 0) > 0 &&
    Number(highUpsideScalp.scalpReadyCount || 0) === 0 &&
    Number(highUpsideScalp.highUpsideWatchCount || 0) === 0
  ) {
    const candidateLaneBlocksReadiness = !healthyEvidence && !healthyNoEdge;
    failures.push(finding({
      area: "candidate-lanes",
      severity: "WARN",
      reason: candidateLaneBlocksReadiness
        ? "Research candidates exist, but none reached scalp-ready or high-upside watch because strict identity/route proof is incomplete."
        : "Strict identity and route gates kept all candidates out of action lanes; current scanner evidence is healthy and no winner was forced.",
      nextAction: candidateLaneBlocksReadiness
        ? "Open high-upside-scalp-research.json and execution-proof-recovery.json; prioritize CONTRACT_MISSING, PAIR_NOT_FOUND, liquidity, and fresh buy/sell quotes."
        : "Keep recovering route and identity proof for research lanes; do not force a winner without full execution proof.",
    }, candidateLaneBlocksReadiness));
  }
  if (opMode.status && !["READY", "PASS"].includes(opMode.status)) {
    const opModeBlocksReadiness = !healthyEvidence && opMode.status !== "DEGRADED_BUT_USABLE";
    failures.push(finding({
      area: "op-mode",
      severity: "WARN",
      reason: `OP Mode status is ${opMode.status}.`,
      nextAction: opModeBlocksReadiness
        ? "Open op-mode-readiness.json for exact setup gaps."
        : "Treat OP Mode gaps as setup advisories when current scanner evidence, reports, routes, and memory are healthy.",
    }, opModeBlocksReadiness));
  }
  if (
    liveCoreRanking.authoritativeRanking &&
    Number(liveCoreRanking.summary?.microTestEligible || 0) === 0 &&
    Number(liveCoreRanking.summary?.researchWatchlist || 0) === 0
  ) {
    const liveRankingBlocksReadiness = !healthyNoEdge && highUpsideWatchCount === 0;
    failures.push(finding({
      area: "guarded-live-ranking",
      severity: "WARN",
      reason: liveRankingBlocksReadiness
        ? "No project currently passes the evidence-backed live ranking gates."
        : "No project currently passes action gates, and the scanner correctly classified this as a healthy no-edge result.",
      nextAction: liveRankingBlocksReadiness
        ? "Open live-core-ranking.json and recover its missing identity, utility, safety, liquidity, buyer, and route evidence; do not force a leader."
        : "Keep monitoring recovery lanes; do not force a leader when the semantic outcome is NO_EDGE_FOUND.",
    }, liveRankingBlocksReadiness));
  }
  if (scannerSemanticHealth.status === "DATA_DEGRADED") {
    failures.push(finding({
      area: "scanner-semantic-health",
      severity: "FAIL",
      reason:
        `Scanner semantic health is DATA_DEGRADED: ${scannerSemanticHealth.insufficientDataCandidates || 0} insufficient-data candidates, ${scannerSemanticHealth.averageEvidenceCoverage || 0}% average evidence coverage.`,
      nextAction: "Run the active evidence recovery pass, inspect data-starvation-root-cause.json, and fix provider/memory/rescue failures before publishing readiness.",
    }));
  } else if (scannerSemanticHealth.status === "INSUFFICIENT_EVIDENCE") {
    failures.push(finding({
      area: "scanner-semantic-health",
      severity: "WARN",
      reason: "No edge was selected because evidence remains insufficient, but the scan did not cross the production degradation threshold.",
      nextAction: "Open starvation-rescue-queue.json and data-starvation-by-field.json before expanding research scope.",
    }));
  }
  const blockingFailures = failures.filter((item) => item.blocksReadiness !== false);
  const readinessAdvisories = failures.filter((item) => item.blocksReadiness === false);

  return {
    generatedAt: new Date().toISOString(),
    scanRunId: meta.scanRunId || meta.runId || process.env.GITHUB_RUN_ID || null,
    codeCommitSha: meta.codeCommitSha || process.env.GITHUB_SHA || null,
    dataCutoffTimestamp: meta.dataCutoffTimestamp || meta.completedAt || null,
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
    authoritativeRanking: liveCoreRanking.authoritativeRanking || "GUARDED_LIVE_CORE",
    liveRankingStatus: liveCoreRanking.status || "REPORT_NOT_GENERATED",
    liveRankingSummary: liveCoreRanking.summary || {},
    scannerSemanticHealth,
    selectionOutcomeStatus: scannerSemanticHealth.status || "UNKNOWN",
    selectionOutcomeClass: scannerSemanticHealth.readinessClass || "UNKNOWN",
    candidatePromotionStatus:
      scalpReadyCount > 0 || highUpsideWatchCount > 0
        ? "CANDIDATES_PROMOTING"
        : routePendingCount > 0
          ? "ROUTE_PENDING_RESEARCH_AVAILABLE"
        : quarantinedIdentityOrRouteCount > 0
          ? "IDENTITY_ROUTE_PROOF_BLOCKED"
          : highUpsideScalp.status || "REPORT_NOT_GENERATED",
    candidatePromotionDiagnosis: {
      highUpsideStatus: highUpsideScalp.status || "REPORT_NOT_GENERATED",
      laneDistribution: highUpsideScalp.laneDistribution || {},
      scalpReadyCount,
      highUpsideWatchCount,
      researchOnlyRouteMissingCount: routePendingCount,
      quarantinedIdentityOrRouteCount,
      invalidOrAggregateIdentityCount: Number(highUpsideScalp.invalidOrAggregateIdentityCount || 0),
      routeIdentitySourceAvailableCount: Number(sourceGaps.routeIdentitySourceAvailableCount || 0),
      routeIdentityUsefulSourceCount: Number(sourceGaps.routeIdentityUsefulSourceCount || 0),
      executionQuoteSourceAvailableCount: Number(sourceGaps.executionQuoteSourceAvailableCount || 0),
      routePromotionBlindnessRisk: sourceGaps.routePromotionBlindnessRisk || "UNKNOWN",
      executionProofRecoveryStatus: executionRecovery.status || "REPORT_NOT_GENERATED",
      executionProofCandidatesAttempted: Number(executionRecovery.candidatesAttempted || 0),
      executionProofRoutesRecovered: Number(executionRecovery.routesRecovered || 0),
      dominantReason:
        routePendingCount > 0 && scalpReadyCount === 0 && highUpsideWatchCount === 0
          ? "Route-pending research candidates are visible, but no candidate has full execution-ready proof yet."
          : quarantinedIdentityOrRouteCount > 0
          ? "Candidates are stuck before rank eligibility because strict contract, pool, liquidity, and fresh buy/sell route proof is missing."
          : "No dominant candidate-promotion blocker detected from current reports.",
    },
    requiredReportCount: requiredFiles.length,
    checkedReportCount: validation.checkedFiles,
    wholeEngineAuditSummary: wholeEngineAudit.summary || {},
    blockingFindingCount: blockingFailures.length,
    advisoryFindingCount: readinessAdvisories.length,
    readinessAdvisories,
    failures,
    nextFixes: blockingFailures.map((item) => item.nextAction).slice(0, 12),
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
