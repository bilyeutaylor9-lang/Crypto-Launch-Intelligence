import fs from "fs";
import path from "path";

export function writeFirstSeenOpportunityReport(projects = [], extra = {}) {
  const reportsDir = path.resolve("reports");
  fs.mkdirSync(reportsDir, { recursive: true });
  const opportunities = projects
    .filter((project) => project.firstSeenOpportunity || project.firstSeenAt)
    .slice(0, 500)
    .map((project) => ({
      symbol: project.symbol || "UNKNOWN",
      chain: project.chain || project.canonicalAliases?.chain || null,
      firstSeen: project.firstSeenOpportunity || {
        firstSeenAt: project.firstSeenAt,
        firstSeenResearchPriority: project.firstSeenResearchPriority,
        firstSeenMissingEvidence: project.firstSeenMissingEvidence,
      },
      currentStage: project.preBreakoutTimingState || project.researchReadinessState || "UNKNOWN",
      reasonNotYetQualified: project.reasonNotQualified || project.researchReadinessWarnings || [],
    }));
  const report = {
    generatedAt: new Date().toISOString(),
    scanRunId: extra.scanRunId || process.env.GITHUB_RUN_ID || null,
    codeCommitSha: extra.codeCommitSha || process.env.GITHUB_SHA || null,
    dataCutoffTimestamp: extra.dataCutoffTimestamp || new Date().toISOString(),
    projectsAnalyzed: projects.length,
    status: opportunities.length ? "PASS" : "NO_FIRST_SEEN_SNAPSHOTS",
    warnings: [],
    limitations: ["First-seen evidence is stored point-in-time and is not reconstructed from future data."],
    sampleSize: opportunities.length,
    opportunities,
  };
  const filePath = path.join(reportsDir, "first-seen-opportunities.json");
  fs.writeFileSync(filePath, JSON.stringify(report, null, 2));
  return { filePath, report };
}
