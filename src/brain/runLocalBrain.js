import "../config/loadEnv.js";

import { getOllamaConfig, inspectOllama } from "./localAIClient.js";
import {
  demoProject,
  readProjectFromScannerReport,
  runLocalResearchSwarm,
  unavailableLocalBrainReport,
  writeLocalBrainReport,
} from "./swarmBrain.js";

async function main() {
  const query = process.argv.slice(2).join(" ").trim();
  const config = getOllamaConfig();
  const availability = await inspectOllama(config);

  if (!availability.reachable || !availability.modelInstalled) {
    const reportPath = writeLocalBrainReport(unavailableLocalBrainReport(availability, query ? "REPORT" : "DEMO"));
    console.error(`Local AI brain is unavailable. Details written to ${reportPath}`);
    process.exitCode = 1;
    return;
  }

  const { project, selection } = query
    ? readProjectFromScannerReport(query)
    : { project: demoProject(), selection: "DEMO" };
  const report = await runLocalResearchSwarm(project, {
    chatOptions: config,
  });
  report.selection = selection;
  report.localModel = {
    baseUrl: config.baseUrl,
    model: config.model,
    provider: config.provider,
    reachable: true,
    modelInstalled: true,
  };

  const reportPath = writeLocalBrainReport(report);
  console.log(`Local AI brain ${report.status.toLowerCase()}. Report written to ${reportPath}`);
  if (report.status !== "COMPLETE") process.exitCode = 1;
}

main().catch((error) => {
  const reportPath = writeLocalBrainReport({
    generatedAt: new Date().toISOString(),
    status: "FAILED",
    advisoryOnly: true,
    error: String(error?.message || error),
    disclaimer: "No financial advice was produced.",
  });
  console.error(`Local AI brain failed. Details written to ${reportPath}`);
  process.exitCode = 1;
});
