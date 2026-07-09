import fs from "fs";
import path from "path";
import {
  buildWatchtowerPerformanceReport,
  saveWatchtowerPerformanceReport,
} from "../learning/watchtowerPerformanceEngine.js";

export function writeWatchtowerPerformanceReport() {
  const reportsDir = path.resolve("reports");
  fs.mkdirSync(reportsDir, { recursive: true });

  const report = buildWatchtowerPerformanceReport();
  saveWatchtowerPerformanceReport(report);

  const filePath = path.join(reportsDir, "watchtower-performance.json");
  fs.writeFileSync(filePath, JSON.stringify(report, null, 2));

  return {
    filePath,
    report,
  };
}
