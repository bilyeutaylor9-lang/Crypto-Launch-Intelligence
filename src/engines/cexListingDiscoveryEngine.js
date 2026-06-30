// src/engines/cexListingDiscoveryEngine.js

/**
 * CEX Listing Discovery Engine
 *
 * Purpose:
 * Detects signals that a project may be listed,
 * newly listed, or gaining exchange attention.
 */

const CEX_KEYWORDS = [
  "listed",
  "listing",
  "spot trading",
  "deposits open",
  "withdrawals open",
  "trading opens",
  "exchange listing",
  "mexc",
  "gate",
  "kucoin",
  "coinbase",
  "binance",
  "bybit",
  "okx",
  "kraken",
  "bitget"
];

export function detectCexListingSignal(project = {}) {
  const text = [
    project.description,
    project.announcement,
    project.twitterBio,
    project.exchange,
    project.news,
    project.tags
  ]
    .flat()
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return CEX_KEYWORDS.find(keyword => text.includes(keyword)) || null;
}

export function scoreCexListingSignal(project = {}) {
  let score = 0;

  if (detectCexListingSignal(project)) score += 35;
  if (project.exchange) score += 20;
  if (project.listingDate) score += 20;
  if (project.depositOpen) score += 10;
  if (project.tradingOpen) score += 10;
  if (project.marketMaker) score += 5;

  return Math.max(0, Math.min(100, score));
}

export function discoverCexListingProjects(projects = []) {
  return projects
    .map(project => ({
      ...project,
      stage: project.stage || "cex-listing",
      cexListingSignal: detectCexListingSignal(project),
      cexListingScore: scoreCexListingSignal(project),
      discoveryReason:
        "Centralized exchange listing or exchange attention signal detected."
    }))
    .filter(project => project.cexListingScore >= 35)
    .sort((a, b) => b.cexListingScore - a.cexListingScore);
}
