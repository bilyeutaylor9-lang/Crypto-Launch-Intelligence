// src/index.js

/**
 * ==========================================================
 * Crypto Launch Intelligence
 * Main Application Entry Point
 * ==========================================================
 *
 * Flow
 *
 * 1. Discover projects
 * 2. Run intelligence pipeline
 * 3. Generate rankings
 * 4. Save learning
 * 5. Display results
 *
 * ==========================================================
 */

import { runDiscoveryManager } from "./discoveryManager.js";

import {
  runIntelligencePipeline,
  summarizePipelineResults
} from "./intelligencePipeline.js";

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

  console.log(
    `Smart Money Accumulation: ${summary.strongSmartMoneyAccumulationCount}`
  );

  console.log(
    `Smart Wallet Performance: ${summary.strongSmartWalletPerformanceCount}`
  );

  console.log(
    `Narrative Forecast: ${summary.strongNarrativeForecastCount}`
  );

  console.log(
    `Catalyst Calendar: ${summary.strongCatalystCalendarCount}`
  );

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
    console.log(`${index + 1}. ${project.name}`);

    console.log(`   Symbol: ${project.symbol || "-"}`);
    console.log(`   Chain: ${project.chain || "-"}`);

    console.log(
      `   Pipeline Score: ${project.pipelineScore || 0}`
    );

    console.log(
      `   Tier: ${project.pipelineTier || "Unknown"}`
    );

    console.log(
      `   Pre-Pump: ${project.prePump?.score || 0}`
    );

    console.log(
      `   Status: ${project.prePump?.status || "UNKNOWN"}`
    );

    console.log("");
  });
}

function printAlerts(summary) {
  if (!summary.alerts?.length) return;

  console.log("");
  console.log("================ ALERTS ====================");

  summary.alerts.forEach(alert => {
    console.log(`${alert.project}`);
    console.log(` • ${alert.alert}`);
  });

  console.log("============================================");
}

async function main() {
  try {
    printBanner();

    console.log("Discovering projects...\n");

    const discoveredProjects = await runDiscoveryManager();

    console.log(
      `✓ Found ${discoveredProjects.length} projects`
    );

    console.log("");
    console.log("Running intelligence pipeline...\n");

    const results = await runIntelligencePipeline(
      discoveredProjects,
      {
        saveMemory: true
      }
    );

    const summary = summarizePipelineResults(results);

    printSummary(summary);

    printTopProjects(results);

    printAlerts(summary);

    console.log("");
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
