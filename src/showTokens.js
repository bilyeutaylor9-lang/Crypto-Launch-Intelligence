// src/showTokens.js

import { runDiscoveryManager } from "./discoveryManager.js";
import { applyProjectQualityGate } from "./engines/projectQualityGateEngine.js";
import { applyHighRatingFilter } from "./engines/highRatingFilterEngine.js";
import { filterMemes } from "./engines/memeFilterEngine.js";

function formatMoney(value = 0) {
  const number = Number(value || 0);

  if (number >= 1_000_000_000) return `$${(number / 1_000_000_000).toFixed(2)}B`;
  if (number >= 1_000_000) return `$${(number / 1_000_000).toFixed(2)}M`;
  if (number >= 1_000) return `$${(number / 1_000).toFixed(2)}K`;

  return `$${number.toFixed(2)}`;
}

function scoreToken(token = {}) {
  return Math.round(
    Number(token.richTokenScore || 0) * 0.25 +
    Number(token.momentumShiftScore || 0) * 0.25 +
    Number(token.liquidityExpansionScore || 0) * 0.15 +
    Number(token.earlyBreakoutScore || 0) * 0.15 +
    Number(token.relativeStrengthScore || 0) * 0.10 +
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

function printHeader(discovery, memeGate, qualityGate, highRating) {
  console.clear();

  console.log("═══════════════════════════════════════════════════════════════");
  console.log("           🚀 CRYPTO LAUNCH INTELLIGENCE");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`Scanned At: ${discovery.scannedAt}`);
  console.log(`Sources: ${discovery.sourcesUsed.join(", ")}`);
  console.log(`Discovered: ${discovery.discoveredCount}`);
  console.log(`Discovery Accepted: ${discovery.acceptedCount}`);
  console.log(`Discovery Rejected: ${discovery.rejectedCount}`);
  console.log(`Meme Filter Accepted: ${memeGate.acceptedCount}`);
  console.log(`Meme Filter Rejected: ${memeGate.rejectedCount}`);
  console.log(`Quality Accepted: ${qualityGate.acceptedCount}`);
  console.log(`Quality Rejected: ${qualityGate.rejectedCount}`);
  console.log(`High Rating Accepted: ${highRating.acceptedCount}`);
  console.log(`High Rating Rejected: ${highRating.rejectedCount}`);
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
  console.log(`Rich Token Score............ ${token.richTokenScore || 0}`);
  console.log(`Rich Token Level............ ${token.richTokenLevel || "unknown"}`);
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
  maxTokens: Number(process.env.MAX_TOKENS || 200),
  coinGeckoPerPage: Number(process.env.COINGECKO_PER_PAGE || 250)
});

const scored = [...discovery.candidates].map(token => ({
  ...token,
  overallOpportunityScore: scoreToken(token)
}));

const memeGate =
  process.env.EXCLUDE_MEMES === "false"
    ? {
        accepted: scored,
        rejected: [],
        acceptedCount: scored.length,
        rejectedCount: 0
      }
    : filterMemes(scored);

const qualityGate = applyProjectQualityGate(memeGate.accepted, {
  minLiquidityUsd: Number(process.env.MIN_QUALITY_LIQUIDITY || 250000),
  minVolume24h: Number(process.env.MIN_QUALITY_VOLUME || 500000),
  minBuyTransactions24h: Number(process.env.MIN_QUALITY_BUYS || 25),
  minRichTokenScore: Number(process.env.MIN_RICH_TOKEN_SCORE || 30)
});

const highRating = applyHighRatingFilter(qualityGate.accepted, {
  minLiquidityUsd: Number(process.env.MIN_HIGH_LIQUIDITY || 500000),
  minVolume24h: Number(process.env.MIN_HIGH_VOLUME || 1000000),
  minRichTokenScore: Number(process.env.MIN_HIGH_RICH_SCORE || 50),
  minMomentumShiftScore: Number(process.env.MIN_HIGH_MOMENTUM || 20),
  minOverallOpportunityScore: Number(process.env.MIN_HIGH_OPPORTUNITY || 40),
  preferMultipleSources: process.env.PREFER_MULTIPLE_SOURCES === "true"
});

const ranked = [...highRating.accepted].sort(
  (a, b) => b.overallOpportunityScore - a.overallOpportunityScore
);

printHeader(discovery, memeGate, qualityGate, highRating);

console.log("\n🏆 TOP MARKET-WIDE HIGH-RATING OPPORTUNITIES");
console.log("---------------------------------------------------------------");

if (ranked.length === 0) {
  console.log("No projects passed the market-wide high-rating filter.");
  console.log("");
  console.log("Try softer filters:");
  console.log("MIN_HIGH_LIQUIDITY=100000 MIN_HIGH_VOLUME=250000 MIN_HIGH_MOMENTUM=0 npm run tokens");
  console.log("");
  console.log("Or allow memes:");
  console.log("EXCLUDE_MEMES=false npm run tokens");
} else {
  ranked.slice(0, 25).forEach(printToken);
}

console.log("\n═══════════════════════════════════════════════════════════════");
console.log("Research tool only. Not financial advice.");
console.log("═══════════════════════════════════════════════════════════════");
