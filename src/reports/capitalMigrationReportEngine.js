import fs from "fs";
import path from "path";

import { summarizeCapitalMigration } from "../engines/capitalMigrationCoreEngine.js";

export function writeCapitalMigrationReport(projects = []) {
  const reportsDir = path.resolve("reports");
  fs.mkdirSync(reportsDir, { recursive: true });
  const report = {
    ...summarizeCapitalMigration(projects),
    disclaimer:
      "Capital Migration is a research signal built from observed flow evidence. It is not financial advice and does not force a qualified pick.",
  };
  const filePath = path.join(reportsDir, "capital-migration-core.json");
  fs.writeFileSync(filePath, JSON.stringify(report, null, 2));
  return { filePath, report };
}
