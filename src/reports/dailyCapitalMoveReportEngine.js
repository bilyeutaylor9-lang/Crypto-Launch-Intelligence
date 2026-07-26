import fs from "fs";
import path from "path";
import { summarizeDailyCapitalMoves } from "../engines/dailyCapitalMoveEngine.js";

export function writeDailyCapitalMoveReport(projects = [], meta = {}) {
  const reportsDir = path.resolve("reports");
  fs.mkdirSync(reportsDir, { recursive: true });
  const report = summarizeDailyCapitalMoves(projects, meta);
  const filePath = path.join(reportsDir, "daily-capital-move.json");
  fs.writeFileSync(filePath, JSON.stringify(report, null, 2));
  return { filePath, report };
}
