import fs from "fs";
import path from "path";
import { summarizePreBreakoutRadar } from "../engines/preBreakoutRadarEngine.js";

export function writePreBreakoutRadarReport(projects = []) {
  const reportsDir = path.resolve("reports");
  fs.mkdirSync(reportsDir, { recursive: true });

  const report = {
    ...summarizePreBreakoutRadar(projects),
    commandMap: {
      report: "npm run pre-breakout-radar",
      scan: "npm run scan",
      wideScan: "npm run scan:wide",
      freeMaxScan: "npm run scan:free-max",
      sevenDayResearch: "npm run tenx:7d",
    },
  };
  const filePath = path.join(reportsDir, "pre-breakout-radar.json");

  fs.writeFileSync(filePath, JSON.stringify(report, null, 2));

  return {
    filePath,
    report,
  };
}
