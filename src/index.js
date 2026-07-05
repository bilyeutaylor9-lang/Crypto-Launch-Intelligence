// src/index.js

import { runDiscoveryManager } from "./discoveryManager.js";

import {
  runIntelligencePipeline,
  summarizePipelineResults,
} from "./intelligencePipeline.js";

import { generateReports } from "./reports/reportOrchestrator.js";

function printBanner() {
  console.clear();
  console.log("");
  console.log("========================================================");
  console.log("        CRYPTO LAUNCH INTELLIGENCE PLATFORM");
  console.log("========================================================");
  console.log("");
}

function printSummary(summary) {
  console.log("");
  console.log("============= PIPELINE SUMMARY =============");
  console.log(`Projects Scanned: ${summary.scannedProjects}`);
  console.log(`Institutional Alpha: ${summary.institutionalAlphaCount}`);
  console.log(`A+ Opportunities: ${summary.aPlusOpportunityCount}`);
  console.log(`Strong Watchlist: ${summary.strongWatchlistCount}`);
  console.log("");
  console.log(`High Market Rank: ${summary.highMarketRankCount}`);
  console.log(`High Rich Token: ${summary.highRichTokenCount}`);
  console.log(`High Momentum: ${summary.highMomentumCount}`);
  console.log(`High Pre-Pump: ${summary.highPrePumpCount}`);
  console.log("");
  console.log(`Smart Money Accumulation: ${summary.strongSmartMoneyAccumulationCount}`);
  console.log(`Smart Wallet Performance: ${summary.strongSmartWalletPerformanceCount}`);
  console.log(`Narrative Forecast: ${summary.strongNarrativeForecastCount}`);
  console.log(`Catalyst Calendar: ${summary.strongCatalystCalendarCount}`);
  console.log("");
  console.log(`Already Pumped: ${summary.alreadyPumpedCount}`);
  console.log(`Late Chase: ${summary.lateChaseCount}`);
  console.log("============================================");
}

function scoreOf(project = {}) {
  return Number(project.opportunityScore ?? project.pipelineScore ?? project.score ?? 0);
}

function normalizeForReports(projects = []) {
  return [...projects]
    .map((project) => ({
      ...project,
      opportunityScore: scoreOf(project),
      score: scoreOf(project),
      tier: project.pipelineTier || project.tier || "Unknown",
      confidence: project.confidence || project.pipelineConfidence || "",
      riskScore: project.riskScore ?? project.risk?.score ?? 0,
      narrative:
        project.narrative ||
        project.primaryNarrative ||
        project.narrativeForecast?.narrative ||
        "",
      volume24h: project.volume24h ?? project.volume ?? "",
      marketCap: project.marketCap ?? project.fdv ?? "",
      liquidity: project.liquidity ?? project.liquidityUsd ?? "",
    }))
    .sort((a, b) => scoreOf(b) - scoreOf(a));
}

function printTopProjects(results) {
  console.log("");
  console.log("============= TOP OPPORTUNITIES =============");
  console.log("");

  results.slice(0, 10).forEach((project, index) => {
    console.log(`${index + 1}. ${project.name || "Unknown"}`);
    console.log(`   Symbol: ${project.symbol || "-"}`);
    console.log(`   Chain: ${project.chain || "-"}`);
    console.log(`   Pipeline Score: ${scoreOf(project).toFixed(1)}`);
    console.log(`   Tier: ${project.pipelineTier || project.tier || "Unknown"}`);
    console.log(`   Pre-Pump: ${project.prePump?.score || 0}`);
    console.log(`   Status: ${project.prePump?.status || "UNKNOWN"}`);
    console.log("");
  });
}

function printAlerts(summary) {
  if (!summary.alerts?.length) return;

  console.log("");
  console.log("================ ALERTS ====================");

  summary.alerts.forEach((alert) => {
    console.log(`${alert.project}`);
    console.log(` • ${alert.alert}`);
  });

  console.log("============================================");
}

function printReportPaths(paths) {
  console.log("");
  console.log("============= REPORTS GENERATED =============");
  console.log(`HTML Dashboard: ${paths.htmlPath}`);
  console.log(`JSON Report:    ${paths.jsonPath}`);
  console.log(`CSV Export:     ${paths.csvPath}`);
  console.log(`Watchlist:      ${paths.watchlistPath}`);
  console.log(`Summary:        ${paths.summaryPath}`);
  console.log(`Watchlist Count: ${paths.watchlistCount}`);
  console.log("=============================================");
  console.log("");
  console.log("Open dashboard with:");
  console.log("open reports/report.html");
  console.log("");
}

async function main() {
  try {
    const startedAt = new Date();

    printBanner();

    console.log("Discovering projects...\n");

    const discoveredProjects = await runDiscoveryManager();

    console.log(`✓ Found ${discoveredProjects.length} projects`);

    console.log("");
    console.log("Running intelligence pipeline...\n");

    const pipelineResults = await runIntelligencePipeline(discoveredProjects, {
      saveMemory: true,
    });

    const results = normalizeForReports(pipelineResults);
    const summary = summarizePipelineResults(results);

    const reportPaths = generateReports(results, {
      startedAt: startedAt.toISOString(),
      completedAt: new Date().toISOString(),
      discoveredProjects: discoveredProjects.length,
      scannedProjects: results.length,
      engineMode: "full",
      platform: "Crypto Launch Intelligence",
    });

    printSummary(summary);
    printTopProjects(results);
    printAlerts(summary);
    printReportPaths(reportPaths);

    console.log("Scan Complete.");
    console.log("");
  } catch (error) {
    console.error("");
    console.error("Pipeline Failed");
    console.error(error);
    console.error("");

    process.exit(1);
  }
}

main();
