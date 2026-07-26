import fs from "fs";
import path from "path";
import { summarizeEngineDataContractHealth } from "../kernel/engineDataContractGovernor.js";

export function writeEngineDataContractHealthReport(projects = [], meta = {}) {
  const reportsDir = path.resolve("reports");
  fs.mkdirSync(reportsDir, { recursive: true });

  const summary = summarizeEngineDataContractHealth(projects, {
    engineLimit: meta.engineContractHealthLimit || 40,
  });
  const report = {
    ...summary,
    scanRunId: meta.scanRunId || null,
    codeCommitSha: meta.codeCommitSha || null,
    dataCutoffTimestamp: meta.dataCutoffTimestamp || meta.generatedAt || new Date().toISOString(),
    disclaimer:
      "Engine data-contract health verifies pipeline plumbing and evidence coverage. It is not financial advice and does not qualify a trade.",
  };

  const filePath = path.join(reportsDir, "engine-data-contract-health.json");
  fs.writeFileSync(filePath, JSON.stringify(report, null, 2));

  return {
    filePath,
    report,
  };
}
