// src/data/dataSourceRegistry.js

/**
 * Crypto Launch Intelligence
 * Data Source Registry
 *
 * Purpose:
 * Central list of all external data sources the platform can use.
 */

export const DATA_SOURCES = {
  market: [
    "dexScreener",
    "coinGecko",
    "coinMarketCap",
    "defiLlama",
    "dexTools"
  ],

  chains: [
    "etherscan",
    "basescan",
    "bscscan",
    "arbiscan",
    "polygonscan",
    "solscan"
  ],

  social: [
    "xTwitter",
    "telegram",
    "discord",
    "reddit",
    "googleTrends"
  ],

  developer: [
    "github",
    "githubTrending",
    "npm",
    "packageRegistries"
  ],

  launch: [
    "launchpads",
    "tgeCalendars",
    "airdropTrackers",
    "presaleTrackers",
    "idoTrackers"
  ],

  news: [
    "rssFeeds",
    "cryptoNews",
    "medium",
    "mirror",
    "officialBlogs"
  ],

  wallets: [
    "whaleWallets",
    "smartWallets",
    "exchangeWallets",
    "deployerWallets"
  ],

  risk: [
    "goPlus",
    "tokenSniffer",
    "honeypotChecker",
    "rugCheck"
  ],

  funding: [
    "cryptoRank",
    "defiLlamaRaises",
    "vcAnnouncements",
    "ecosystemGrants"
  ]
};

export function getAllDataSources() {
  return Object.values(DATA_SOURCES).flat();
}

export function getDataSourceCount() {
  return getAllDataSources().length;
}

export function printDataSourceSummary() {
  return {
    totalSources: getDataSourceCount(),
    categories: Object.keys(DATA_SOURCES),
    sources: DATA_SOURCES
  };
}
