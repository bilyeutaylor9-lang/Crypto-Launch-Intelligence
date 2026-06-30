// src/showTokens.js

import { runDiscoveryManager } from "./discoveryManager.js";

function formatMoney(value = 0) {
  const number = Number(value || 0);

  if (number >= 1_000_000_000) return `$${(number / 1_000_000_000).toFixed(2)}B`;
  if (number >= 1_000_000) return `$${(number / 1_000_000).toFixed(2)}M`;
  if (number >= 1_000) return `$${(number / 1_000).toFixed(2)}K`;

  return `$${number.toFixed(2)}`;
}

function scoreToken(token = {}) {
  return Math.round(
    Number(token.momentumShiftScore || 0) * 0.35 +
    Number(token.liquidityExpansionScore || 0) * 0.20 +
    Number(token.earlyBreakoutScore || 0) * 0.20 +
    Number(token.relativeStrengthScore || 0) * 0.15 +
    Number(token.buyPressureScore || 0) * 0.10
  );
}

function confidenceLabel(score = 0) {
  if (score >= 85) return "★★★★★ Very High";
  if (score >= 70) return "★★★★ High";
  if (score >= 55) return "★★★ Medium";
  if (score >= 40) return "★★ Early Watch";
  return "★ Low";
}

function printHeader(discovery) {
  console.clear();

  console.log("═══════════════════════════════════════════════════════════════");
  console.log("           🚀 CRYPTO LAUNCH INTELLIGENCE");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`Scanned At: ${discovery.scannedAt}`);
  console.log(`Sources: ${discovery.sourcesUsed.join(", ")}`);
  console.log(`Discovered: ${discovery.discoveredCount}`);
  console.log(`Accepted: ${discovery.acceptedCount}`);
  console.log(`Rejected: ${discovery.rejectedCount}`);
  console.log("---------------------------------------------------------------");
}

function printToken(token, index) {
  const overallScore = scoreToken(token);
  const sources = token.discoverySources?.join(", ") || token.source || "unknown";

  console.log(`\n#${index + 1} ${token.name} (${token.symbol})`);
  console.log("---------------------------------------------------------------");
  console.log(`Sources..................... ${sources}`);
  console.log(`Chain....................... ${token.chain}`);
  console.log(`DEX......................... ${token.dex || "unknown"}`);
  console.log(`Price....................... $${token.priceUsd}`);
  console.log(`Liquidity / Market Cap...... ${formatMoney(token.liquidityUsd)}`);
  console.log(`24h Volume.................. ${formatMoney(token.volume24h)}`);
  console.log(`24h Price Change............ ${token.priceChange24h || 0}%`);
  console.log(`Momentum Shift.............. ${token.momentumShiftScore || 0}`);
  console.log(`Liquidity Expansion......... ${token.liquidityExpansionScore || 0}`);
  console.log(`Early Breakout.............. ${token.earlyBreakoutScore || 0}`);
  console.log(`Relative Strength........... ${token.relativeStrengthScore || 0}`);
  console.log(`Buy Pressure................ ${token.buyPressureScore || 0}`);
  console.log(`Overall Opportunity......... ${overallScore}/100`);
  console.log(`Confidence.................. ${confidenceLabel(overallScore)}`);

  if (token.url) {
    console.log(`Chart / Source.............. ${token.url}`);
  }

  if (token.alerts?.length) {
    console.log("\nAlerts:");
    token.alerts.slice(0, 5).forEach(alert => {
      console.log(`✓ ${alert}`);
    });
  }
}

const discovery = await runDiscoveryManager({
  maxTokens: Number(process.env.MAX_TOKENS || 50),
  coinGeckoPerPage: Number(process.env.COINGECKO_PER_PAGE || 50)
});

const ranked = [...discovery.candidates]
  .map(token => ({
    ...token,
    overallOpportunityScore: scoreToken(token)
  }))
  .sort((a, b) => b.overallOpportunityScore - a.overallOpportunityScore);

printHeader(discovery);

console.log("\n🏆 TOP MULTI-SOURCE OPPORTUNITIES");
console.log("---------------------------------------------------------------");

ranked.slice(0, 25).forEach(printToken);

console.log("\n═══════════════════════════════════════════════════════════════");
console.log("Research tool only. Not financial advice.");
console.log("═══════════════════════════════════════════════════════════════");
