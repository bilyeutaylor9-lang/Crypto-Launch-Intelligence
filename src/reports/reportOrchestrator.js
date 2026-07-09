import { writeJsonReport } from "./jsonReportEngine.js";
import { writeCsvReport } from "./csvExportEngine.js";
import { writeWatchlist } from "./watchlistEngine.js";
import { writeSummaryReport } from "./summaryReportEngine.js";
import { writeHtmlReport } from "./htmlReportEngine.js";
import { writeQuantumFieldReport } from "./quantumFieldReportEngine.js";
import { writeCalibrationReport } from "./calibrationReportEngine.js";
import { writePrePumpPatternReport } from "./prePumpPatternReportEngine.js";
import { writeInstitutionalVNextReport } from "./institutionalVNextReportEngine.js";
import { writeWatchtowerReports } from "./watchtowerReportEngine.js";
import { writeWatchtowerPerformanceReport } from "./watchtowerPerformanceReportEngine.js";
import { writeStateOfArtReport } from "./stateOfArtReportEngine.js";
import { writeAICouncilReports } from "./aiCouncilReportEngine.js";
import { writeResearchOSReports } from "./researchOSReportEngine.js";
import { writeEngineAuditReport } from "./engineAuditReportEngine.js";
import { writeSimulationBrainReport } from "./simulationBrainReportEngine.js";
import { writeOutcomeJudgeReport } from "./outcomeJudgeReportEngine.js";

export function generateReports(projects = [], meta = {}) {
  const jsonPath = writeJsonReport(projects, meta);
  const csvPath = writeCsvReport(projects);
  const { filePath: watchlistPath, watchlist } = writeWatchlist(projects);
  const summaryPath = writeSummaryReport(projects);
  const htmlPath = writeHtmlReport(projects);
  const quantumFieldPath = writeQuantumFieldReport(projects);
  const calibrationPath = writeCalibrationReport();
  const prePumpPatternPath = writePrePumpPatternReport();
  const institutionalVNextPath = writeInstitutionalVNextReport(projects);
  const stateOfArtPath = writeStateOfArtReport(projects);
  const {
    councilPath: aiCouncilPath,
    performancePath: agentPerformancePath,
  } = writeAICouncilReports(projects);
  const {
    researchOSPath,
    alphaLabPath,
  } = writeResearchOSReports(projects);
  const {
    filePath: simulationBrainPath,
  } = writeSimulationBrainReport(projects);
  const {
    filePath: outcomeJudgePath,
  } = writeOutcomeJudgeReport(projects);
  const {
    filePath: engineAuditPath,
  } = writeEngineAuditReport();
  const {
    alertsPath,
    briefPath,
    alerts,
    brief,
  } = writeWatchtowerReports(projects);
  const {
    filePath: watchtowerPerformancePath,
    report: watchtowerPerformance,
  } = writeWatchtowerPerformanceReport();

  return {
    htmlPath,
    jsonPath,
    csvPath,
    quantumFieldPath,
    calibrationPath,
    prePumpPatternPath,
    institutionalVNextPath,
    stateOfArtPath,
    aiCouncilPath,
    agentPerformancePath,
    researchOSPath,
    alphaLabPath,
    simulationBrainPath,
    outcomeJudgePath,
    engineAuditPath,
    alertsPath,
    briefPath,
    watchtowerPerformancePath,
    watchlistPath,
    summaryPath,
    watchlistCount: watchlist.length,
    alertCount: alerts.length,
    criticalAlertCount: alerts.filter((alert) => alert.severity === "Critical").length,
    highAlertCount: alerts.filter((alert) => alert.severity === "High").length,
    dailyBrief: brief.brief,
    watchtowerHitRate: watchtowerPerformance.hitRate,
    watchtowerEvaluatedAlerts: watchtowerPerformance.evaluatedAlerts,
    watchtowerPendingAlerts: watchtowerPerformance.pendingAlerts,
  };
}
