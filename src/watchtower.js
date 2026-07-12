import "./config/loadEnv.js";
import { runDiscoveryManager } from "./discoveryManager.js";
import { runIntelligencePipeline } from "./intelligencePipeline.js";
import { generateReports } from "./reports/reportOrchestrator.js";
import { summarizeWatchtower } from "./learning/watchtowerStore.js";

function normalizeProjects(output = {}) {
  if (Array.isArray(output)) return output;
  if (Array.isArray(output.candidates)) return output.candidates;
  if (Array.isArray(output.projects)) return output.projects;
  if (Array.isArray(output.results)) return output.results;
  return [];
}

export async function runWatchtowerOnce(options = {}) {
  const startedAt = new Date();
  const discovered = await runDiscoveryManager(options.discovery || {});
  const candidates = normalizeProjects(discovered);
  const results = await runIntelligencePipeline(candidates, {
    saveMemory: true,
    ...(options.pipeline || {}),
  });
  const reports = generateReports(results, {
    startedAt: startedAt.toISOString(),
    completedAt: new Date().toISOString(),
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
