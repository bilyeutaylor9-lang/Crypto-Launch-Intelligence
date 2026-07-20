import fs from "fs";
import path from "path";
import { summarizeRouteAccessibility } from "../engines/routeAccessibilityEngine.js";
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
  const report = summarizeRouteAccessibility(projects, meta.routeAccessibility || meta);
  const shared = {
    generatedAt: report.generatedAt,
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
  } = writeDataStarvationRootCauseReports(projects, meta);
  const {
    filePath: starvationRescueQueuePath,
  } = writeStarvationRescueQueueReport(projects, meta);
  const {
    filePath: recoveredOpportunityWatchlistPath,
    recoveryPath: starvationRecoveryResultsPath,
  } = writeRecoveredOpportunityWatchlistReport(projects, meta);
  const {
    filePath: firstSeenOpportunitiesPath,
  } = writeFirstSeenOpportunityReport(projects, meta);
  const {
    filePath: missedWinnerReplayPath,
  } = writeMissedWinnerReplayReport(projects, meta);
  const {
    filePath: earlyAsymmetryRankingPath,
    preBreakoutSequencePath,
    earlyOpportunityOutcomesPath,
  } = writeEarlyAsymmetryReport(projects, meta);
  const {
    aliasResolutionSummaryPath,
    aliasResolutionConflictsPath,
    providerVocabularyCoveragePath,
    unresolvedFieldVerbiagePath,
    rejectedAliasCandidatesPath,
    aliasStarvationRecoveriesPath,
  } = writeAliasResolutionReports(projects, meta);

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
