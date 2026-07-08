import fs from "fs";
import path from "path";
import { loadPrePumpPatternDatabase } from "../learning/prePumpPatternDatabase.js";

export function writePrePumpPatternReport() {
  const reportsDir = path.resolve("reports");
  fs.mkdirSync(reportsDir, { recursive: true });

  const database = loadPrePumpPatternDatabase();
  const filePath = path.join(reportsDir, "pre-pump-patterns.json");
  fs.writeFileSync(filePath, JSON.stringify(database, null, 2));

  return filePath;
}
