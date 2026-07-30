import "./config/loadEnv.js";
import fs from "fs";
import path from "path";
import { runDiscoveryManager } from "./discoveryManager.js";
import { runIntelligencePipeline } from "./intelligencePipeline.js";
import { resolveAnalysisFunnelConfig } from "./config/analysisFunnelConfig.js";
import { planInstitutionalCandidateSelection } from "./discovery/institutionalCandidateSelector.js";
import { resolveLocalAIOptions } from "./brain/localAIOptions.js";
import { writeTop10BreakoutReports } from "./reports/top10BreakoutReportEngine.js";
import { saveProjectObservations } from "./learning/projectObservationStore.js";

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function normalizeOutput(output, fallback = []) {
  if (Array.isArray(output)) return output;
  if (Array.isArray(output?.projects)) return output.projects;
  if (Array.isArray(output?.results)) return output.results;
  if (Array.isArray(output?.candidates)) return output.candidates;
  if (Array.isArray(output?.tokens)) return output.tokens;
  return fallback;
}

function defaultReportPath() {
  const candidateInputPath = path.resolve("reports/top10-candidate-input.json");
  return fs.existsSync(candidateInputPath) ? candidateInputPath : path.resolve("reports/report.json");
}

function readProjectsFromReport(filePath = defaultReportPath()) {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Report not found: ${resolved}. Run npm run scan first, or run npm run scan:private-top10.`);
  }

  const parsed = JSON.parse(fs.readFileSync(resolved, "utf8"));
  const projects = normalizeOutput(parsed, []);
  const source = parsed.schemaVersion === "top10-candidate-input-v1" ? "top10-candidate-input" : "existing-report";
  return {
    projects,
    meta: {
      ...(parsed.meta && typeof parsed.meta === "object" ? parsed.meta : {}),
      source,
      reportPath: resolved,
      observedProjectCount: projects.length,
      targetCapacityIsCoverage: false,
    },
  };
}

async function runFreshPrivateScan() {
  const startedAt = new Date();
  const discovered = await runDiscoveryManager();
  const discoveredList = normalizeOutput(discovered, []);
  const config = resolveAnalysisFunnelConfig(process.env);
  const selection = planInstitutionalCandidateSelection(discoveredList, {
    config,
    runSequence: num(process.env.RUN_SEQUENCE || 1),
  });
  const selected = selection.selected || [];
  const localAI = resolveLocalAIOptions();
  const analyzed = await runIntelligencePipeline(selected, {
    saveMemory: true,
    freeOnly: discovered.freeMode?.enabled === true || process.env.FREE_ONLY_MODE === "true",
    localAI,
  });

  return {
    projects: normalizeOutput(analyzed, selected),
    meta: {
      source: "fresh-private-top10-scan",
      startedAt: startedAt.toISOString(),
      completedAt: new Date().toISOString(),
      discoveredProjectCount: discoveredList.length,
      analyzedProjectCount: normalizeOutput(analyzed, selected).length,
      targetCapacity: config.discoveryTargetCandidates || process.env.DISCOVERY_TARGET_CANDIDATES || null,
      targetCapacityIsCoverage: false,
      analysisFunnel: selection.report,
      providerHealth: discovered.providerHealth || null,
      freeOnly: discovered.freeMode?.enabled === true || process.env.FREE_ONLY_MODE === "true",
    },
  };
}

function printSummary(paths = {}) {
  const report = paths.report || {};
  console.log("");
  console.log("Private Top 10 Breakout Funnel Complete");
  console.log(`Observed candidates: ${report.stageSummary?.discoveryUniverseObserved || 0}`);
  console.log(`Research opportunities: ${report.top10ResearchOpportunities?.length || 0}`);
  console.log(`Qualified picks: ${report.qualifiedPicks?.length || 0}`);
  console.log(`Conditional watch: ${report.conditionalWatchCandidates?.length || 0}`);
  console.log(`Top 10 JSON: ${paths.top10Path}`);
  console.log(`Top 10 Input: ${paths.candidateInputPath}`);
  console.log(`Top 10 HTML: ${paths.htmlPath}`);
  console.log(`Top 10 CSV: ${paths.csvPath}`);
  console.log(`Best Now: ${paths.bestNowPath}`);
  console.log("Research only. Not financial advice.");
  console.log("");
}

export async function runTop10BreakoutScanner(options = {}) {
  const fromReport = options.fromReport ?? process.argv.includes("--from-report");
  const reportArgIndex = process.argv.indexOf("--report");
  const reportPath = options.reportPath || (reportArgIndex >= 0 ? process.argv[reportArgIndex + 1] : null);
  const input = fromReport ? readProjectsFromReport(reportPath || undefined) : await runFreshPrivateScan();
  const observationStore = saveProjectObservations(input.projects);
  const paths = writeTop10BreakoutReports(input.projects, input.meta);
  return {
    ...paths,
    observationStore,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runTop10BreakoutScanner()
    .then((paths) => {
      printSummary(paths);
      process.exit(0);
    })
    .catch((error) => {
      console.error("Private Top 10 scan failed");
      console.error(error);
      process.exit(1);
    });
}
