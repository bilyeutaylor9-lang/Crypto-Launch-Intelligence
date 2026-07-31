import fs from "fs";
import path from "path";

function compactList(value = [], limit = 12) {
  return (Array.isArray(value) ? value : value == null ? [] : [value])
    .slice(0, limit)
    .map((item) => {
      if (item == null || ["string", "number", "boolean"].includes(typeof item)) return item;
      return {
        field: item.field || item.canonicalField || null,
        rootCause: item.rootCause || null,
        reason: item.reason || item.message || null,
        blockingResearch: item.blockingResearch === true,
        blockingExecution: item.blockingExecution === true,
      };
    });
}

function compactFirstSeen(firstSeen = {}) {
  return {
    firstSeenAt: firstSeen.firstSeenAt || null,
    firstSeenPrice: firstSeen.firstSeenPrice ?? null,
    firstSeenMarketCap: firstSeen.firstSeenMarketCap ?? null,
    firstSeenLiquidity: firstSeen.firstSeenLiquidity ?? null,
    firstSeenVolume: firstSeen.firstSeenVolume ?? null,
    firstSeenBuyerCount: firstSeen.firstSeenBuyerCount ?? null,
    firstSeenHolderCount: firstSeen.firstSeenHolderCount ?? null,
    firstSeenPoolAge: firstSeen.firstSeenPoolAge ?? null,
    firstSeenSources: compactList(firstSeen.firstSeenSources, 12),
    firstSeenIdentityState: firstSeen.firstSeenIdentityState || "UNKNOWN",
    firstSeenSafetyState: firstSeen.firstSeenSafetyState || "UNKNOWN",
    firstSeenResearchPriority: firstSeen.firstSeenResearchPriority ?? null,
    firstSeenOpportunityRank: firstSeen.firstSeenOpportunityRank ?? null,
    firstSeenCoverage: firstSeen.firstSeenCoverage ?? null,
    firstSeenMissingEvidence: compactList(firstSeen.firstSeenMissingEvidence, 12),
    firstSeenReasonNotSelected: compactList(firstSeen.firstSeenReasonNotSelected, 8),
    firstSeenFunnelStage: firstSeen.firstSeenFunnelStage || null,
    firstSeenRouteState: firstSeen.firstSeenRouteState || "UNKNOWN",
    firstSeenCodeCommitSha: firstSeen.firstSeenCodeCommitSha || null,
    firstSeenScanRunId: firstSeen.firstSeenScanRunId || null,
  };
}

export function writeFirstSeenOpportunityReport(projects = [], extra = {}) {
  const reportsDir = path.resolve("reports");
  fs.mkdirSync(reportsDir, { recursive: true });
  const opportunities = projects
    .filter((project) => project.firstSeenOpportunity || project.firstSeenAt)
    .slice(0, 500)
    .map((project) => ({
      symbol: project.symbol || "UNKNOWN",
      chain: project.chain || project.canonicalAliases?.chain || null,
      firstSeen: compactFirstSeen(project.firstSeenOpportunity || {
        firstSeenAt: project.firstSeenAt,
        firstSeenResearchPriority: project.firstSeenResearchPriority,
        firstSeenMissingEvidence: project.firstSeenMissingEvidence,
      }),
      currentStage: project.preBreakoutTimingState || project.researchReadinessState || "UNKNOWN",
      reasonNotYetQualified: compactList(project.reasonNotQualified || project.researchReadinessWarnings, 8),
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
