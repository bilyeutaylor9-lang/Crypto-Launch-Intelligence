import {
  buildWatchtowerPerformanceReport,
  saveWatchtowerPerformanceReport,
} from "./learning/watchtowerPerformanceEngine.js";

const report = buildWatchtowerPerformanceReport();
const { file } = saveWatchtowerPerformanceReport(report);

console.log(
  JSON.stringify(
    {
      file,
      generatedAt: report.generatedAt,
      totalAlerts: report.totalAlerts,
      evaluatedAlerts: report.evaluatedAlerts,
      pendingAlerts: report.pendingAlerts,
      hitRate: report.hitRate,
      missRate: report.missRate,
      strongestAlertTypes: report.strongestAlertTypes,
      noisiestAlertTypes: report.noisiestAlertTypes,
      byType: report.byType,
      bySeverity: report.bySeverity,
    },
    null,
    2
  )
);
