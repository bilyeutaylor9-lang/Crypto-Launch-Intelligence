import fs from "fs";
import path from "path";
import { summarizeEngineDataReadiness } from "../engines/engineDataReadinessEngine.js";

export function writeEngineDataReadinessReport(projects = []) {
  const reportsDir = path.resolve("reports");
  fs.mkdirSync(reportsDir, { recursive: true });

  const report = {
    ...summarizeEngineDataReadiness(projects),
    disclaimer:
      "Data readiness is an input-coverage audit. It does not qualify a project, predict performance, or provide financial advice.",
  };
  const filePath = path.join(reportsDir, "engine-data-readiness.json");
  fs.writeFileSync(filePath, JSON.stringify(report, null, 2));

  return {
    filePath,
    report,
  };
}
