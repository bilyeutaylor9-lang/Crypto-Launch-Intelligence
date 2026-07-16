import fs from "fs";
import path from "path";
import { summarizeMarketOpportunityLearning } from "../learning/marketOpportunityLearningStore.js";

export function writeMarketOpportunityLearningReport(projects = [], meta = {}) {
  const reportsDir = path.resolve("reports");
  fs.mkdirSync(reportsDir, { recursive: true });
  const report = summarizeMarketOpportunityLearning(projects, {
    now: meta.now,
    filePath: meta.marketOpportunityLearningFilePath,
  });
  const filePath = path.join(reportsDir, "market-opportunity-learning.json");

  fs.writeFileSync(filePath, JSON.stringify(report, null, 2));
  return {
    filePath,
    report,
  };
}
