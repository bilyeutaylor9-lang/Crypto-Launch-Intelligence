import fs from "fs";
import path from "path";

export function writeJsonReport(projects = [], meta = {}) {
  const reportsDir = path.resolve("reports");
  fs.mkdirSync(reportsDir, { recursive: true });

  const report = {
    generatedAt: new Date().toISOString(),
    totalProjects: projects.length,
    meta,
    projects,
  };

  const filePath = path.join(reportsDir, "report.json");
  fs.writeFileSync(filePath, JSON.stringify(report, null, 2));

  return filePath;
}
