import fs from "fs";
import path from "path";

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

export function writeRecoveredOpportunityWatchlistReport(projects = [], extra = {}) {
  const activelyRecovered = projects.filter((project) =>
    ["RECOVERED", "PARTIAL_RECOVERY"].includes(project.activeEvidenceRecoveryStatus)
  );
  const watchlist = projects
    .filter((project) => project.starvationRescueEligible || project.dataStarvationStatus === "RECOVERABLE_GAPS")
    .sort((a, b) => (b.starvationRescueScore || b.earlyAsymmetryResearchPriorityScore || 0) - (a.starvationRescueScore || a.earlyAsymmetryResearchPriorityScore || 0))
    .slice(0, 250)
    .map((project) => ({
      symbol: project.symbol || "UNKNOWN",
      chain: project.chain || project.canonicalAliases?.chain || null,
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
  const recoveryResults = activelyRecovered.map((project) => ({
    symbol: project.symbol || "UNKNOWN",
    name: project.name || project.projectName || "Unknown",
    chain: project.chain || project.canonicalAliases?.chain || null,
    tokenAddress: project.tokenAddress || project.contractAddress || null,
    poolAddress: project.poolAddress || project.pairAddress || null,
    status: project.activeEvidenceRecoveryStatus,
    recoveredFields: project.activeEvidenceRecovery?.recoveredFields || [],
    unrecoveredFields: project.activeEvidenceRecovery?.unrecoveredFields || [],
    providerAttempts: project.activeEvidenceRecovery?.providerAttempts || [],
  }));
  const report = {
    ...meta(projects, extra),
    status: watchlist.length ? "WATCHLIST_READY" : "NO_RECOVERABLE_OPPORTUNITIES",
    recoveredThisScan: new Set([
      ...activelyRecovered.map((project) => project.progressivePipelineIdentityKey || project.canonicalId || project.symbol),
      ...projects
        .filter((project) => project.starvationRecoveryResult === "RECOVERED")
        .map((project) => project.progressivePipelineIdentityKey || project.canonicalId || project.symbol),
    ].filter(Boolean)).size,
    fullyRecoveredThisScan: projects.filter((project) => project.activeEvidenceRecoveryStatus === "RECOVERED").length,
    partiallyRecoveredThisScan: projects.filter((project) => project.activeEvidenceRecoveryStatus === "PARTIAL_RECOVERY").length,
    promotedToAdvancedResearch: projects.filter((project) => project.promotedToAdvancedResearch === true).length,
    promotedToDeepResearch: projects.filter((project) => project.promotedToDeepResearch === true).length,
    stillUnresolved: projects.filter((project) => (project.dataStarvationMissingEvidence || []).some((item) => item.recoverable)).length,
    watchlist,
  };
  const filePath = writeJson("recovered-opportunity-watchlist.json", report);
  const recoveryPath = writeJson("starvation-recovery-results.json", {
    ...meta(projects, extra),
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
