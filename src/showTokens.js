// src/showTokens.js

import { runDiscoveryManager } from "./discoveryManager.js";
import { filterMemes } from "./engines/memeFilterEngine.js";
import { runIntelligencePipeline } from "./intelligencePipeline.js";

function formatMoney(value = 0) {
  const number = Number(value || 0);

  if (number >= 1_000_000_000) return `$${(number / 1_000_000_000).toFixed(2)}B`;
  if (number >= 1_000_000) return `$${(number / 1_000_000).toFixed(2)}M`;
  if (number >= 1_000) return `$${(number / 1_000).toFixed(2)}K`;

  return `$${number.toFixed(2)}`;
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
  console.log(`Scanned At: ${discovery.scannedAt}`);
  console.log(`Sources: ${discovery.sourcesUsed?.join(", ") || "unknown"}`);
  console.log(`Discovered: ${discovery.discoveredCount}`);
  console.log(`Discovery Accepted: ${discovery.acceptedCount}`);
  console.log(`Discovery Rejected: ${discovery.rejectedCount}`);
  console.log(`Meme Filter Accepted: ${memeGate.acceptedCount}`);
  console.log(`Meme Filter Rejected: ${memeGate.rejectedCount}`);
  console.log(`Ranked Projects: ${ranked.length}`);
  console.log("---------------------------------------------------------------");
}

function printReasons(token) {
  const reasons = token.prePump?.reasons || [];

  if (!reasons.length) return;

  console.log("\nPre-Pump Reasons:");
  reasons.slice(0, 5).forEach(reason => {
    console.log(`✓ ${reason}`);
  });
}

function printToken(token, index) {
  const sources = token.discoverySources?.join(", ") || token.source || "unknown";

  console.log(`\n#${index + 1} ${token.name || "Unknown"} (${token.symbol || "UNKNOWN"})`);
  console.log("---------------------------------------------------------------");
  console.log(`Sources..................... ${sources}`);
  console.log(`Chain....................... ${token.chain || "unknown"}`);
  console.log(`DEX / Venue................. ${token.dex || "unknown"}`);
  console.log(`Price....................... $${token.priceUsd || 0}`);
  console.log(`Liquidity / Market Cap...... ${formatMoney(token.liquidityUsd || token.marketCap)}`);
  console.log(`24h Volume.................. ${formatMoney(token.volume24h)}`);
  console.log(`24h Price Change............ ${token.priceChange24h || 0}%`);

  console.log(`Pipeline Score.............. ${Number(token.pipelineScore || 0).toFixed(2)}`);
  console.log(`Market Rank Score........... ${token.marketRankScore || 0}/100`);
  console.log(`Market Rank Level........... ${token.marketRankLevel || "unknown"}`);

  console.log(`Pre-Pump Score.............. ${Number(token.prePump?.score || 0).toFixed(2)}/100`);
  console.log(`Pre-Pump Status............. ${prePumpLabel(token)}`);

  console.log(`Rich Token Score............ ${token.richTokenScore || 0}`);
  console.log(`Momentum Shift.............. ${token.momentumShiftScore || 0}`);
  console.log(`Relative Strength........... ${token.relativeStrengthScore || 0}`);
  console.log(`Buy Pressure................ ${token.buyPressureScore || 0}`);
  console.log(`Liquidity Score............. ${token.liquidityScore || 0}`);
  console.log(`Narrative Score............. ${token.narrativeScore || 0}`);
  console.log(`Confidence.................. ${confidenceLabel(token.marketRankScore || token.pipelineScore || 0)}`);

  printReasons(token);

  if (token.url) {
    console.log(`\nChart / Source.............. ${token.url}`);
  }

  if (token.alerts?.length) {
    console.log("\nAlerts:");
    token.alerts.slice(0, 5).forEach(alert => {
      console.log(`✓ ${alert}`);
    });
  }
}

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

const ranked = runIntelligencePipeline(memeGate.accepted, {
  saveMemory: false
});

printHeader(discovery, memeGate, ranked);

console.log("\n🏆 TOP FULL-PIPELINE RANKED PROJECTS");
console.log("---------------------------------------------------------------");

ranked.slice(0, 25).forEach(printToken);

console.log("\n═══════════════════════════════════════════════════════════════");
console.log("Research tool only. Not financial advice.");
console.log("═══════════════════════════════════════════════════════════════");
