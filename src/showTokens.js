// src/showTokens.js

import { runDiscoveryManager } from "./discoveryManager.js";
import { filterMemes } from "./engines/memeFilterEngine.js";
import { runIntelligencePipeline } from "./intelligencePipeline.js";

function formatMoney(value = 0) {
  const n = Number(value || 0);
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(2)}K`;
  return `$${n.toFixed(2)}`;
}

function formatNumber(value = 0) {
  return Number(value || 0).toFixed(2);
}

function confidenceLabel(score = 0) {
  if (score >= 90) return "★★★★★ Institutional";
  if (score >= 80) return "★★★★ A Grade";
  if (score >= 70) return "★★★ B Grade";
  if (score >= 60) return "★★ Watchlist";
  if (score >= 45) return "★ Early Candidate";
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

function printHeader(discovery, memeGate, ranked) {
  console.clear();

  console.log("═══════════════════════════════════════════════════════════════");
  console.log("           🚀 CRYPTO LAUNCH INTELLIGENCE");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`Scanned At................. ${discovery.scannedAt}`);
  console.log(`Sources.................... ${discovery.sourcesUsed?.join(", ") || "unknown"}`);
  console.log(`Discovered................. ${discovery.discoveredCount}`);
  console.log(`Discovery Accepted......... ${discovery.acceptedCount}`);
  console.log(`Discovery Rejected......... ${discovery.rejectedCount}`);
  console.log(`Meme Filter Accepted....... ${memeGate.acceptedCount}`);
  console.log(`Meme Filter Rejected....... ${memeGate.rejectedCount}`);
  console.log(`Ranked Projects............ ${ranked.length}`);
  console.log("---------------------------------------------------------------");
}

function printReasons(title, reasons = []) {
  if (!reasons.length) return;

  console.log(`\n${title}:`);
  reasons.slice(0, 5).forEach(reason => {
    console.log(`✓ ${reason}`);
  });
}

function printToken(token, index) {
  const sources = token.discoverySources?.join(", ") || token.source || "unknown";
  const score = token.marketRankScore || token.pipelineScore || 0;

  console.log(`\n#${index + 1} ${token.name || "Unknown"} (${token.symbol || "UNKNOWN"})`);
  console.log("---------------------------------------------------------------");

  console.log(`Sources..................... ${sources}`);
  console.log(`Chain....................... ${token.chain || "unknown"}`);
  console.log(`DEX / Venue................. ${token.dex || "unknown"}`);
  console.log(`Price....................... $${token.priceUsd || 0}`);
  console.log(`Liquidity / Market Cap...... ${formatMoney(token.liquidityUsd || token.marketCap)}`);
  console.log(`24h Volume.................. ${formatMoney(token.volume24h)}`);
  console.log(`24h Price Change............ ${formatNumber(token.priceChange24h)}%`);

  console.log(`Pipeline Score.............. ${formatNumber(token.pipelineScore)}`);
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

  const memeGate =
    process.env.EXCLUDE_MEMES === "false"
      ? {
          accepted: discovery.candidates,
          rejected: [],
          acceptedCount: discovery.candidates.length,
          rejectedCount: 0
        }
      : filterMemes(discovery.candidates);

  const ranked = await runIntelligencePipeline(memeGate.accepted, {
    saveMemory: false
  });

  printHeader(discovery, memeGate, ranked);

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
