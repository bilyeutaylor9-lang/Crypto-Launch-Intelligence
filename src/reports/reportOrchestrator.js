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
