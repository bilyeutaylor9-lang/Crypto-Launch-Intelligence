import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { auditDataSourceReadiness } from "../production/dataSourceReadinessAudit.js";
import { loadMarketContextObservations } from "../production/marketContextObservationLedger.js";
import { writeAtomicJson } from "../production/atomicArtifactStore.js";

const SOURCE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function read(file, fallback = {}) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch { return fallback; }
}

export function runDataSourceReadiness(options = {}) {
  const contexts = options.marketContextObservations || loadMarketContextObservations({ limit: 10 });
  const report = auditDataSourceReadiness({
    ...options,
    root: options.root || SOURCE_ROOT,
    latestMarketContext: options.latestMarketContext || contexts.at(-1) || null,
    familyLiveHealth: options.familyLiveHealth || read("reports/data-source-live-health.json", {}),
  });
  if (options.writeReport !== false) writeAtomicJson("reports/data-source-readiness.json", report);
  return report;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const codeOnly = process.argv.includes("--code-only");
  const report = runDataSourceReadiness();
  console.log(JSON.stringify({
    state: report.state,
    criticalCodeComplete: report.criticalCodeComplete,
    configurationComplete: report.configurationComplete,
    liveReady: report.liveReady,
    blockers: report.blockers,
  }, null, 2));
  if (!report.criticalCodeComplete) process.exitCode = 1;
  else if (!codeOnly && !report.liveReady) process.exitCode = 2;
}
