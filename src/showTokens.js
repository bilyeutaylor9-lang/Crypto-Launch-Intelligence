// src/showTokens.js

import { runDiscoveryManager } from "./discoveryManager.js";
import { filterMemes } from "./engines/memeFilterEngine.js";
import {
  runIntelligencePipeline,
  summarizePipelineResults
} from "./intelligencePipeline.js";

function formatMoney(value = 0) {
  const n = Number(value || 0);

  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(2)}K`;

  return `$${n.toFixed(2)}`;
}

function formatNumber(value = 0, decimals = 2) {
  return Number(value || 0).toFixed(decimals);
}

function confidenceLabel(score = 0) {
  const n = Number(score || 0);

  if (n >= 90) return "★★★★★ Institutional";
  if (n >= 80) return "★★★★ A Grade";
  if (n >= 70) return "★★★ B Grade";
  if (n >= 60) return "★★ Watchlist";
  if (n >= 45) return "★ Early Candidate";

  return "Low Priority";
}

function prePumpLabel(token = {}) {
  const status = token.prePump?.status || "UNKNOWN";
  const score = Number(token.prePump?.score || 0);

  if (status === "ALREADY_PUMPED") return "🚫 Already Pumped";
  if (status === "LATE_CHASE") return "⚠️ Late Chase";
  if (score >= 80) return "🔥 Early High Conviction";
  if (score >= 65) return "👀 Early Watchlist";
  if (score >= 50) return "Neutral";

  return "Low Priority";
}

function getSources(token = {}) {
  if (Array.isArray(token.discoverySources) && token.discoverySources.length) {
    return token.discoverySources.join(", ");
  }

  return token.source || "unknown";
}

function getMainScore(token = {}) {
  return Number(token.pipelineScore || token.marketRankScore || 0);
}

function printHeader(discovery = {}, memeGate = {}, ranked = [], summary = {}) {
  console.clear();

  console.log("═══════════════════════════════════════════════════════════════");
  console.log("           🚀 CRYPTO LAUNCH INTELLIGENCE");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`Scanned At................. ${discovery.scannedAt || new Date().toISOString()}`);
  console.log(`Sources.................... ${discovery.sourcesUsed?.join(", ") || "unknown"}`);
  console.log(`Discovered................. ${discovery.discoveredCount || 0}`);
  console.log(`Discovery Accepted......... ${discovery.acceptedCount || 0}`);
  console.log(`Discovery Rejected......... ${discovery.rejectedCount || 0}`);
  console.log(`Meme Filter Accepted....... ${memeGate.acceptedCount || 0}`);
  console.log(`Meme Filter Rejected....... ${memeGate.rejectedCount || 0}`);
  console.log(`Ranked Projects............ ${ranked.length}`);

  console.log("---------------------------------------------------------------");
  console.log(`Institutional Alpha........ ${summary.institutionalAlphaCount || 0}`);
  console.log(`A+ Opportunities........... ${summary.aPlusOpportunityCount || 0}`);
  console.log(`Strong Watchlist........... ${summary.strongWatchlistCount || 0}`);
  console.log(`High Pre-Pump.............. ${summary.highPrePumpCount || 0}`);
  console.log(`Already Pumped............. ${summary.alreadyPumpedCount || 0}`);
  console.log(`Late Chase................. ${summary.lateChaseCount || 0}`);
  console.log("---------------------------------------------------------------");
}

function printReasons(title, reasons = []) {
  if (!Array.isArray(reasons) || !reasons.length) return;

  console.log(`\n${title}:`);

  reasons.slice(0, 5).forEach(reason => {
    console.log(`✓ ${reason}`);
  });
}

function printToken(token = {}, index = 0) {
  const score = getMainScore(token);

  console.log(`\n#${index + 1} ${token.name || "Unknown"} (${token.symbol || "UNKNOWN"})`);
  console.log("---------------------------------------------------------------");

  console.log(`Sources..................... ${getSources(token)}`);
  console.log(`Chain....................... ${token.chain || "unknown"}`);
  console.log(`DEX / Venue................. ${token.dex || token.exchange || "unknown"}`);
  console.log(`Price....................... $${token.priceUsd || token.price || 0}`);
  console.log(`Liquidity / Market Cap...... ${formatMoney(token.liquidityUsd || token.marketCap)}`);
  console.log(`24h Volume.................. ${formatMoney(token.volume24h)}`);
  console.log(`24h Price Change............ ${formatNumber(token.priceChange24h)}%`);

  console.log(`Pipeline Score.............. ${formatNumber(token.pipelineScore)}`);
  console.log(`Pipeline Tier............... ${token.pipelineTier || "Unknown"}`);
  console.log(`Market Rank Score........... ${token.marketRankScore || 0}/100`);
  console.log(`Market Rank Level........... ${token.marketRankLevel || "unknown"}`);

  console.log(`Pre-Pump Score.............. ${formatNumber(token.prePump?.score)}/100`);
  console.log(`Pre-Pump Status............. ${prePumpLabel(token)}`);

  console.log(`Rich Token Score............ ${token.richTokenScore || 0}`);
  console.log(`Momentum Shift.............. ${token.momentumShiftScore || 0}`);
  console.log(`Relative Strength........... ${token.relativeStrengthScore || 0}`);
  console.log(`Buy Pressure................ ${token.buyPressureScore || 0}`);
  console.log(`Liquidity Score............. ${token.liquidityScore || 0}`);
  console.log(`Narrative Score............. ${token.narrativeScore || 0}`);
  console.log(`Narrative Forecast.......... ${token.narrativeForecastScore || 0}`);
  console.log(`Smart Money Accumulation.... ${token.smartMoneyAccumulationScore || 0}`);
  console.log(`Catalyst Calendar........... ${token.catalystCalendarScore || 0}`);
  console.log(`Confidence.................. ${confidenceLabel(score)}`);

  if (token.masterIntelligence?.market) {
    const market = token.masterIntelligence.market;

    console.log("\nMarket Data Health:");
    console.log(`Status...................... ${market.status || "unknown"}`);
    console.log(`Source...................... ${market.source || "unknown"}`);
    console.log(`Confidence.................. ${market.confidence || 0}`);
    console.log(`Cache Hit................... ${market.cacheHit ? "yes" : "no"}`);
  }

  printReasons("Pre-Pump Reasons", token.prePump?.reasons || []);
  printReasons("Alerts", token.alerts || []);

  if (token.url) {
    console.log(`\nChart / Source.............. ${token.url}`);
  }
}

async function main() {
  const discovery = await runDiscoveryManager({
    maxTokens: Number(process.env.MAX_TOKENS || 300),
    coinGeckoPerPage: Number(process.env.COINGECKO_PER_PAGE || 250),
    freeLimit: Number(process.env.FREE_SOURCE_LIMIT || 200)
  });

  const candidates = Array.isArray(discovery.candidates)
    ? discovery.candidates
    : [];

  const memeGate =
    process.env.EXCLUDE_MEMES === "false"
      ? {
          accepted: candidates,
          rejected: [],
          acceptedCount: candidates.length,
          rejectedCount: 0
        }
      : filterMemes(candidates);

  const ranked = await runIntelligencePipeline(memeGate.accepted, {
    saveMemory: false
  });

  const summary = summarizePipelineResults(ranked);

  printHeader(discovery, memeGate, ranked, summary);

  console.log("\n🏆 TOP FULL-PIPELINE RANKED PROJECTS");
  console.log("---------------------------------------------------------------");

  ranked.slice(0, 25).forEach(printToken);

  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("Research tool only. Not financial advice.");
  console.log("═══════════════════════════════════════════════════════════════");
}

main().catch(error => {
  console.error("❌ showTokens failed:", error.message);
  process.exit(1);
});
