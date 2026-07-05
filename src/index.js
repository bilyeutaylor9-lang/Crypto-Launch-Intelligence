// src/index.js

import { runDiscoveryManager } from "./discoveryManager.js";

import {
  runIntelligencePipeline,
  summarizePipelineResults,
} from "./intelligencePipeline.js";

import { generateReports } from "./reports/reportOrchestrator.js";

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

function weightedScore(project = {}) {
  const score =
    num(project.marketRankScore) * 0.12 +
    num(project.richTokenScore) * 0.08 +
    num(project.prePump?.score) * 0.13 +
    num(project.momentumShiftScore) * 0.08 +
    num(project.relativeStrengthScore) * 0.07 +
    num(project.buyPressureScore) * 0.08 +
    num(project.capitalFlowScore) * 0.1 +
    num(project.liquidityScore) * 0.08 +
    num(project.narrativeScore) * 0.08 +
    num(project.narrativeForecastScore) * 0.07 +
    num(project.smartMoneyAccumulationScore) * 0.08 +
    num(project.smartWalletPerformanceScore) * 0.07 +
    num(project.catalystScore) * 0.07 +
    num(project.catalystCalendarScore) * 0.06 +
    num(project.communityGrowthScore) * 0.04 +
    num(project.developerActivityScore) * 0.04 -
    num(project.riskScore) * 0.08;

  return clamp(score);
}

function tierForScore(score = 0) {
  if (score >= 95) return "Institutional Alpha";
  if (score >= 90) return "Elite";
  if (score >= 85) return "A+ Opportunity";
  if (score >= 80) return "Strong Watchlist";
  if (score >= 70) return "Watchlist";
  if (score >= 55) return "Early Candidate";
  return "Low Priority";
}

function confidenceForScore(score = 0) {
  if (score >= 85) return "High";
  if (score >= 70) return "Medium";
  if (score >= 55) return "Developing";
  return "Low";
}

function scoreOf(project = {}) {
  const existing = num(project.opportunityScore ?? project.pipelineScore ?? project.score);
  const fused = weightedScore(project);
  return Math.max(existing, fused);
}

function normalizeForReports(projects = []) {
  return [...projects]
    .map((project) => {
      const score = scoreOf(project);
      const tier = project.pipelineTier || project.tier || tierForScore(score);

      return {
        ...project,
        opportunityScore: score,
        pipelineScore: score,
        score,
        tier,
        pipelineTier: tier,
        confidence: project.confidence || project.pipelineConfidence || confidenceForScore(score),
        pipelineConfidence: project.pipelineConfidence || confidenceForScore(score),
        riskScore: project.riskScore ?? project.risk?.score ?? 0,
        narrative:
          project.narrative ||
          project.primaryNarrative ||
          project.narrativeForecast?.narrative ||
          "",
        volume24h: project.volume24h ?? project.volume ?? "",
        marketCap: project.marketCap ?? project.fdv ?? "",
        liquidity: project.liquidityUsd ?? project.liquidity ?? "",
      };
    })
    .sort((a, b) => scoreOf(b) - scoreOf(a));
}

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

    const discoveredList = Array.isArray(discoveredProjects)
      ? discoveredProjects
      : discoveredProjects.candidates || [];

    console.log(`✓ Found ${discoveredList.length} projects`);

    console.log("");
    console.log("Running intelligence pipeline...\n");

    const pipelineResults = await runIntelligencePipeline(discoveredList, {
      saveMemory: true,
    });

    const results = normalizeForReports(pipelineResults);
    const summary = summarizePipelineResults(results);

    const reportPaths = generateReports(results, {
      startedAt: startedAt.toISOString(),
      completedAt: new Date().toISOString(),
      discoveredProjects: discoveredList.length,
      scannedProjects: results.length,
      engineMode: "full",
      scoringMode: "institutional-weighted-fallback",
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
