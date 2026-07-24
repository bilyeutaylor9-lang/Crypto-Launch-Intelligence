import fs from "fs";
import path from "path";
import { summarizeScalpMicrostructure } from "../engines/scalpMicrostructureEngine.js";

export function writeScalpMicrostructureReport(projects = [], meta = {}) {
  const reportsDir = path.resolve("reports");
  fs.mkdirSync(reportsDir, { recursive: true });

  const report = summarizeScalpMicrostructure(projects, meta);
  const filePath = path.join(reportsDir, "scalp-microstructure.json");
  fs.writeFileSync(filePath, JSON.stringify(report, null, 2));

  return {
    filePath,
    report,
  };
}
