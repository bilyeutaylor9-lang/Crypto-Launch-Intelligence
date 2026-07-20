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
      researchOnly: true,
    }));
  const report = {
    ...meta(projects, extra),
    status: watchlist.length ? "WATCHLIST_READY" : "NO_RECOVERABLE_OPPORTUNITIES",
    recoveredThisScan: projects.filter((project) => project.starvationRecoveryResult === "RECOVERED").length,
    promotedToAdvancedResearch: projects.filter((project) => project.promotedToAdvancedResearch === true).length,
    promotedToDeepResearch: projects.filter((project) => project.promotedToDeepResearch === true).length,
    stillUnresolved: projects.filter((project) => (project.dataStarvationMissingEvidence || []).some((item) => item.recoverable)).length,
    watchlist,
  };
  const filePath = writeJson("recovered-opportunity-watchlist.json", report);
  const recoveryPath = writeJson("starvation-recovery-results.json", {
    ...meta(projects, extra),
    recoveredThisScan: report.recoveredThisScan,
    stillUnresolved: report.stillUnresolved,
    recoveryResults: watchlist,
  });
  return {
    filePath,
    recoveryPath,
    report,
  };
}
