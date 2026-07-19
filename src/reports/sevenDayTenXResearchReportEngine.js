import fs from "fs";
import path from "path";
import { summarizeSevenDayTenXResearch } from "../engines/sevenDayTenXResearchEngine.js";

export function writeSevenDayTenXResearchReport(projects = []) {
  const reportsDir = path.resolve("reports");
  fs.mkdirSync(reportsDir, { recursive: true });

  const report = {
    ...summarizeSevenDayTenXResearch(projects),
    operatingRules: [
      "Treat asymmetric scenario strength as a heuristic, never a calibrated probability or guarantee.",
      "Only select candidates with verified identity, route, liquidity, safety, and independent evidence.",
      "Keep blocked projects visible with exact blockers instead of forcing a pick.",
      "Use bestAvailableWatchlist for manual research when no project qualifies.",
      "Reject late-chase moves where price outruns liquidity, buyers, and catalyst proof.",
    ],
    commandMap: {
      report: "npm run tenx:7d",
      wideScan: "npm run scan:wide",
      freeMaxScan: "npm run scan:free-max",
      top10: "npm run top10",
    },
  };
  const filePath = path.join(reportsDir, "seven-day-tenx-research.json");

  fs.writeFileSync(filePath, JSON.stringify(report, null, 2));

  return {
    filePath,
    report,
  };
}
