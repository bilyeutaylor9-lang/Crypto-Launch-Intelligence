import "./config/loadEnv.js";
import { runDiscoveryManager } from "./discoveryManager.js";
import { runIntelligencePipeline } from "./intelligencePipeline.js";
import { generateReports } from "./reports/reportOrchestrator.js";
import { summarizeWatchtower } from "./learning/watchtowerStore.js";
import { resolveLocalAIOptions } from "./brain/localAIOptions.js";

function normalizeProjects(output = {}) {
  if (Array.isArray(output)) return output;
  if (Array.isArray(output.candidates)) return output.candidates;
  if (Array.isArray(output.projects)) return output.projects;
  if (Array.isArray(output.results)) return output.results;
  return [];
}

export async function runWatchtowerOnce(options = {}) {
  const startedAt = new Date();
  const scanRunId = `watch_${startedAt.getTime()}`;
  const discovered = await runDiscoveryManager(options.discovery || {});
  const candidates = normalizeProjects(discovered);
  const results = await runIntelligencePipeline(candidates, {
    scanRunId,
    saveMemory: true,
    localAI: options.localAI ?? resolveLocalAIOptions(),
    ...(options.pipeline || {}),
  });
  const completedAt = new Date().toISOString();
  const reports = generateReports(results, {
    runId: scanRunId,
    scanRunId,
    startedAt: startedAt.toISOString(),
    completedAt,
    dataCutoffTimestamp: completedAt,
    discoveredProjects: candidates.length,
    scannedProjects: results.length,
    engineMode: "watchtower",
    platform: "Crypto Launch Intelligence",
  });

  return {
    scannedProjects: results.length,
    reports,
    watchtower: summarizeWatchtower(),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runWatchtowerOnce()
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
