// src/dataSourceRegistry.js

/**
 * Crypto Launch Intelligence
 * Data Source Registry
 *
 * Purpose:
 * Defines all live data sources the platform can eventually use.
 * Sources are grouped by intelligence category so the scanner can
 * expand without becoming messy.
 */

export const DATA_SOURCES = {
  market: [
    "dexscreener",
    "geckoterminal",
    "coingecko",
    "coinmarketcap",
    "defillama",
    "birdeye",
    "dextools"
  ],

  launch: [
    "dexscreener-latest",
    "dexscreener-boosted",
    "dexscreener-trending",
    "coinmarketcap-new",
    "coingecko-new",
    "launchpads",
    "airdrop-trackers",
    "tge-calendars"
  ],

  chains: [
    "etherscan",
    "basescan",
    "bscscan",
    "arbiscan",
    "polygonscan",
    "solscan",
    "suiscan",
    "aptoscan"
  ],

  security: [
    "goplus",
    "rugcheck",
    "tokensniffer",
    "honeypot-checker",
    "de.fi-scanner"
  ],

  developer: [
    "github",
    "github-trending",
    "npm",
    "package-registries",
    "docs-sites"
  ],

  social: [
    "x-twitter",
    "telegram",
    "discord",
    "reddit",
    "google-trends",
    "youtube",
    "medium",
    "mirror"
  ],

  funding: [
    "cryptorank",
    "defillama-raises",
    "vc-announcements",
    "ecosystem-grants",
    "launchpad-raises"
  ],

  wallets: [
    "smart-wallets",
    "whale-wallets",
    "exchange-wallets",
    "deployer-wallets",
    "insider-wallets"
  ],

  news: [
    "rss-feeds",
    "crypto-news",
    "official-blogs",
    "press-releases",
    "partnership-announcements"
  ]
};

export function getAllDataSources() {
  return Object.values(DATA_SOURCES).flat();
}

export function getDataSourceCount() {
  return getAllDataSources().length;
}

export function getDataSourceSummary() {
  return {
    totalSources: getDataSourceCount(),
    categories: Object.keys(DATA_SOURCES),
    sources: DATA_SOURCES
  };
}
