import fs from "fs";
import path from "path";
import { normalizeChainId, classifyAddressState } from "../identity/strictIdentityValidators.js";

function deepCandidates(projects = []) {
  return projects.filter((project) => project.deepEvaluationState !== "DEFERRED_BEFORE_DEEP" &&
    project.activeEvidenceRecoveryStatus !== "DEFERRED_BEFORE_DEEP");
}

export function summarizeRecoveryOutcomes(projects = []) {
  const evaluated = deepCandidates(projects);
  const recovered = new Set();
  evaluated.forEach((project, index) => {
    if (!["RECOVERED", "PARTIAL_RECOVERY"].includes(project.activeEvidenceRecoveryStatus) &&
      project.starvationRecoveryResult !== "RECOVERED") return;
    const chain = normalizeChainId(project.chain || project.canonicalAliases?.chain);
    const address = chain ? classifyAddressState(project.tokenAddress || project.contractAddress, chain).normalized : null;
    const pool = chain ? classifyAddressState(project.poolAddress || project.pairAddress, chain).normalized : null;
    // Unresolved rows remain separate observations; a symbol is never an identity.
    recovered.add(chain && address ? JSON.stringify([chain, address, pool]) : `row:${index}`);
  });
  return {
    recoveredThisScan: recovered.size,
    fullyRecoveredThisScan: evaluated.filter((project) => project.activeEvidenceRecoveryStatus === "RECOVERED").length,
    partiallyRecoveredThisScan: evaluated.filter((project) => project.activeEvidenceRecoveryStatus === "PARTIAL_RECOVERY").length,
    promotedToAdvancedResearch: evaluated.filter((project) => project.promotedToAdvancedResearch === true).length,
    promotedToDeepResearch: evaluated.filter((project) => project.promotedToDeepResearch === true).length,
    stillUnresolved: evaluated.filter((project) => (project.dataStarvationMissingEvidence || []).some((item) => item.recoverable)).length,
  };
}

function writeJson(fileName = "", payload = {}) {
  const reportsDir = path.resolve("reports");
  fs.mkdirSync(reportsDir, { recursive: true });
  const filePath = path.join(reportsDir, fileName);
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
  return filePath;
}

function meta(projects = [], extra = {}) {
  return {
    generatedAt: new Date().toISOString(),
    scanRunId: extra.scanRunId || process.env.GITHUB_RUN_ID || null,
    codeCommitSha: extra.codeCommitSha || process.env.GITHUB_SHA || null,
    dataCutoffTimestamp: extra.dataCutoffTimestamp || new Date().toISOString(),
    projectsAnalyzed: projects.length,
    status: "PASS",
    warnings: [],
    limitations: ["Recovered opportunities require fresh reruns of affected engines before any execution review."],
    sampleSize: projects.length,
  };
}

export function summarizeEvidenceHydration(projects = []) {
  const summary = projects.find((project) => project.deepEvaluationState !== "DEFERRED_BEFORE_DEEP" &&
    project.activeEvidenceRecovery?.batchSummary)?.activeEvidenceRecovery.batchSummary;
  return summary ? { ...summary } : null;
}

export function summarizeRecoveryAttempts(projects = []) {
  return projects.filter((project) => project.deepEvaluationState !== "DEFERRED_BEFORE_DEEP" &&
    ["RECOVERED", "PARTIAL_RECOVERY", "NO_RECOVERY"].includes(project.activeEvidenceRecoveryStatus))
    .map((project) => ({
      symbol: project.symbol || "UNKNOWN",
      name: project.name || project.projectName || "Unknown",
      chain: project.chain || project.canonicalAliases?.chain || null,
      tokenAddress: project.tokenAddress || project.contractAddress || null,
      poolAddress: project.poolAddress || project.pairAddress || null,
      canonicalId: project.canonicalId || null,
      progressivePipelineIdentityKey: project.progressivePipelineIdentityKey || null,
      status: project.activeEvidenceRecoveryStatus,
      waves: project.activeEvidenceRecovery?.waves || [],
      attemptedFields: project.activeEvidenceRecovery?.attemptedFields || [],
      recoveredFields: project.activeEvidenceRecovery?.recoveredFields || [],
      unrecoveredFields: project.activeEvidenceRecovery?.unrecoveredFields || [],
      attempts: project.activeEvidenceRecovery?.attempts || [],
      providerAttempts: project.activeEvidenceRecovery?.providerAttempts || [],
    }));
}

export function writeRecoveredOpportunityWatchlistReport(projects = [], extra = {}) {
  const evidenceHydration = summarizeEvidenceHydration(projects);
  const watchlist = deepCandidates(projects)
    .filter((project) => project.starvationRescueEligible || project.dataStarvationStatus === "RECOVERABLE_GAPS")
    .sort((a, b) => (b.starvationRescueScore || b.earlyAsymmetryResearchPriorityScore || 0) - (a.starvationRescueScore || a.earlyAsymmetryResearchPriorityScore || 0))
    .slice(0, 250)
    .map((project) => ({
      symbol: project.symbol || "UNKNOWN",
      chain: project.chain || project.canonicalAliases?.chain || null,
      tokenAddress: project.tokenAddress || project.contractAddress || null,
      poolAddress: project.poolAddress || project.pairAddress || null,
      rescueLane: project.rescueLane || null,
      researchPriority: project.earlyAsymmetryResearchPriorityScore || 0,
      valueOfInformation: project.valueOfInformationScore || 0,
      beforeRank: project.legacyRank || project.marketOpportunityRank || null,
      afterRecoveryRank: project.recoveredOpportunityRank || null,
      targetSources: project.targetSources || project.targetedEnrichmentPlan?.nextSources || [],
      missingEvidence: (project.dataStarvationMissingEvidence || []).slice(0, 8),
      executionReady: project.executionReady === true,
      activeRecoveryStatus: project.activeEvidenceRecoveryStatus || "NOT_ATTEMPTED",
      recoveredFields: project.activeEvidenceRecovery?.recoveredFields || [],
      researchOnly: true,
    }));
  const recoveryResults = summarizeRecoveryAttempts(projects);
  const report = {
    ...meta(projects, extra),
    status: watchlist.length ? "WATCHLIST_READY" : "NO_RECOVERABLE_OPPORTUNITIES",
    evidenceHydration,
    ...summarizeRecoveryOutcomes(projects),
    watchlist,
  };
  const filePath = writeJson("recovered-opportunity-watchlist.json", report);
  const recoveryPath = writeJson("starvation-recovery-results.json", {
    ...meta(projects, extra),
    evidenceHydration,
    recoveredThisScan: report.recoveredThisScan,
    fullyRecoveredThisScan: report.fullyRecoveredThisScan,
    partiallyRecoveredThisScan: report.partiallyRecoveredThisScan,
    stillUnresolved: report.stillUnresolved,
    recoveryResults,
  });
  return {
    filePath,
    recoveryPath,
    report,
  };
}
