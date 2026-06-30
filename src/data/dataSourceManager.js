// src/data/dataSourceManager.js

import { DATA_SOURCES } from "./dataSourceRegistry.js";

/**
 * Data Source Manager
 *
 * Purpose:
 * Controls which sources are active, which need API keys,
 * and which can run for free.
 */

export const SOURCE_STATUS = {
  dexScreener: { enabled: true, requiresKey: false },
  coinGecko: { enabled: true, requiresKey: false },
  defiLlama: { enabled: true, requiresKey: false },

  coinMarketCap: { enabled: false, requiresKey: true },
  dexTools: { enabled: false, requiresKey: true },

  etherscan: { enabled: false, requiresKey: true },
  basescan: { enabled: false, requiresKey: true },
  bscscan: { enabled: false, requiresKey: true },
  arbiscan: { enabled: false, requiresKey: true },
  polygonscan: { enabled: false, requiresKey: true },
  solscan: { enabled: false, requiresKey: true },

  github: { enabled: true, requiresKey: false },
  githubTrending: { enabled: true, requiresKey: false },

  xTwitter: { enabled: false, requiresKey: true },
  telegram: { enabled: false, requiresKey: true },
  discord: { enabled: false, requiresKey: true },
  reddit: { enabled: false, requiresKey: true },
  googleTrends: { enabled: false, requiresKey: false },

  goPlus: { enabled: true, requiresKey: false },
  tokenSniffer: { enabled: false, requiresKey: true },
  honeypotChecker: { enabled: true, requiresKey: false },
  rugCheck: { enabled: true, requiresKey: false }
};

export function getEnabledSources() {
  return Object.entries(SOURCE_STATUS)
    .filter(([, config]) => config.enabled)
    .map(([source]) => source);
}

export function getFreeSources() {
  return Object.entries(SOURCE_STATUS)
    .filter(([, config]) => config.enabled && !config.requiresKey)
    .map(([source]) => source);
}

export function getPremiumSources() {
  return Object.entries(SOURCE_STATUS)
    .filter(([, config]) => config.requiresKey)
    .map(([source]) => source);
}

export function getSourcePlan() {
  return {
    categories: DATA_SOURCES,
    enabledSources: getEnabledSources(),
    freeSources: getFreeSources(),
    premiumSources: getPremiumSources()
  };
}
