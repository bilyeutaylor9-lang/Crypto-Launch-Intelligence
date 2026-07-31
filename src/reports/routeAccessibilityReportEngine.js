import fs from "fs";
import path from "path";
import {
  analyzeRouteAccessibilityBatch,
  summarizeRouteAccessibility,
} from "../engines/routeAccessibilityEngine.js";
import { writeDataStarvationRootCauseReports } from "./dataStarvationRootCauseReportEngine.js";
import { writeStarvationRescueQueueReport } from "./starvationRescueQueueReportEngine.js";
import { writeRecoveredOpportunityWatchlistReport } from "./recoveredOpportunityWatchlistReportEngine.js";
import { writeFirstSeenOpportunityReport } from "./firstSeenOpportunityReportEngine.js";
import { writeMissedWinnerReplayReport } from "./missedWinnerReplayReportEngine.js";
import { writeEarlyAsymmetryReport } from "./earlyAsymmetryReportEngine.js";
import { writeAliasResolutionReports } from "./aliasResolutionReportEngine.js";

const REPORTS_DIR = path.resolve("reports");

function ensureReportsDir() {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
}

function writeReport(fileName = "", payload = {}) {
  ensureReportsDir();
  const filePath = path.join(REPORTS_DIR, fileName);
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
  return filePath;
}

export function writeRouteAccessibilityReports(projects = [], meta = {}) {
  const routeProjects = Array.isArray(projects) && projects.some((project) => Array.isArray(project?.canonicalRoutes))
    ? projects
    : analyzeRouteAccessibilityBatch(projects, meta.routeAccessibility || meta);
  const report = summarizeRouteAccessibility(routeProjects, meta.routeAccessibility || meta);
  const shared = {
    generatedAt: report.generatedAt,
    scanRunId: meta.scanRunId || meta.runId || process.env.GITHUB_RUN_ID || null,
    codeCommitSha: meta.codeCommitSha || null,
    dataCutoffTimestamp: meta.dataCutoffTimestamp || meta.completedAt || meta.generatedAt || null,
    status: report.status,
    rule: report.rule,
    projectsAnalyzed: report.projectsAnalyzed,
    projectsWithRoutes: report.projectsWithRoutes,
    routeCount: report.routeCount,
    executionReadyCount: report.executionReadyCount,
    userAccessibleCount: report.userAccessibleCount,
    researchEligibleCount: report.researchEligibleCount,
    preferences: report.preferences,
    prohibitedOutputs: report.prohibitedOutputs,
    note:
      "Opportunity ranking and user-accessibility ranking are intentionally separate. This is research software, not financial advice.",
  };

  const routeUniversePath = writeReport("route-universe.json", {
    ...shared,
    routes: report.routeUniverse,
  });
  const alternativeRoutesPath = writeReport("alternative-execution-routes.json", {
    ...shared,
    routes: report.alternativeRoutes,
  });
  const userAccessibilityRankingPath = writeReport("user-accessibility-ranking.json", {
    ...shared,
    topProjectsByOpportunity: report.topProjectsByOpportunity,
    topProjectsByGlobalRouteQuality: report.topProjectsByGlobalRouteQuality,
    topProjectsByUserAccessibility: report.topProjectsByUserAccessibility,
  });
  const venueCoverageHealthPath = writeReport("venue-coverage-health.json", {
    ...shared,
    venueCoverageHealth: report.venueCoverageHealth,
  });
  const {
    dataStarvationRootCausePath,
    dataStarvationByChainPath,
    dataStarvationByProviderPath,
    dataStarvationByEnginePath,
    dataStarvationByFieldPath,
  } = writeDataStarvationRootCauseReports(routeProjects, meta);
  const {
    filePath: starvationRescueQueuePath,
  } = writeStarvationRescueQueueReport(routeProjects, meta);
  const {
    filePath: recoveredOpportunityWatchlistPath,
    recoveryPath: starvationRecoveryResultsPath,
  } = writeRecoveredOpportunityWatchlistReport(routeProjects, meta);
  const {
    filePath: firstSeenOpportunitiesPath,
  } = writeFirstSeenOpportunityReport(routeProjects, meta);
  const {
    filePath: missedWinnerReplayPath,
  } = writeMissedWinnerReplayReport(routeProjects, meta);
  const {
    filePath: earlyAsymmetryRankingPath,
    preBreakoutSequencePath,
    earlyOpportunityOutcomesPath,
  } = writeEarlyAsymmetryReport(routeProjects, meta);
  const {
    aliasResolutionSummaryPath,
    aliasResolutionConflictsPath,
    providerVocabularyCoveragePath,
    unresolvedFieldVerbiagePath,
    rejectedAliasCandidatesPath,
    aliasStarvationRecoveriesPath,
  } = writeAliasResolutionReports(routeProjects, meta);

  return {
    routeUniversePath,
    alternativeRoutesPath,
    userAccessibilityRankingPath,
    venueCoverageHealthPath,
    dataStarvationRootCausePath,
    dataStarvationByChainPath,
    dataStarvationByProviderPath,
    dataStarvationByEnginePath,
    dataStarvationByFieldPath,
    starvationRescueQueuePath,
    starvationRecoveryResultsPath,
    recoveredOpportunityWatchlistPath,
    firstSeenOpportunitiesPath,
    missedWinnerReplayPath,
    earlyAsymmetryRankingPath,
    preBreakoutSequencePath,
    earlyOpportunityOutcomesPath,
    aliasResolutionSummaryPath,
    aliasResolutionConflictsPath,
    providerVocabularyCoveragePath,
    unresolvedFieldVerbiagePath,
    rejectedAliasCandidatesPath,
    aliasStarvationRecoveriesPath,
    report,
  };
}
