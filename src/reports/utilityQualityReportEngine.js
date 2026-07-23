import fs from "fs";
import path from "path";
import { summarizeUtilityQuality } from "../engines/utilityQualityEngine.js";

export function writeUtilityQualityReport(projects = [], meta = {}) {
  const reportsDir = path.resolve("reports");
  fs.mkdirSync(reportsDir, { recursive: true });

  const report = {
    ...summarizeUtilityQuality(projects),
    scanRunId: meta.scanRunId || process.env.GITHUB_RUN_ID || null,
    codeCommitSha: meta.codeCommitSha || process.env.GITHUB_SHA || null,
    dataCutoffTimestamp: meta.dataCutoffTimestamp || new Date().toISOString(),
    disclaimer:
      "Real-utility ranking is research-only. It separates product/dev/adoption/token utility evidence from meme-only speculation and is not financial advice.",
  };
  const filePath = path.join(reportsDir, "real-utility-opportunities.json");
  fs.writeFileSync(filePath, JSON.stringify(report, null, 2));

  return { filePath, report };
}
