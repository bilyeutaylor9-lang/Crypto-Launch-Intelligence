import { writeJsonReport } from "./jsonReportEngine.js";
import { writeCsvReport } from "./csvExportEngine.js";
import { writeWatchlist } from "./watchlistEngine.js";
import { writeSummaryReport } from "./summaryReportEngine.js";
import { writeHtmlReport } from "./htmlReportEngine.js";
import { writeQuantumFieldReport } from "./quantumFieldReportEngine.js";
import { writeCalibrationReport } from "./calibrationReportEngine.js";

export function generateReports(projects = [], meta = {}) {
  const jsonPath = writeJsonReport(projects, meta);
  const csvPath = writeCsvReport(projects);
  const { filePath: watchlistPath, watchlist } = writeWatchlist(projects);
  const summaryPath = writeSummaryReport(projects);
  const htmlPath = writeHtmlReport(projects);
  const quantumFieldPath = writeQuantumFieldReport(projects);
  const calibrationPath = writeCalibrationReport();

  return {
    htmlPath,
    jsonPath,
    csvPath,
    quantumFieldPath,
    calibrationPath,
    watchlistPath,
    summaryPath,
    watchlistCount: watchlist.length,
  };
}
