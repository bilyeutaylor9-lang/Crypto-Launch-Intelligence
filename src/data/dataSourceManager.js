// src/data/dataSourceManager.js

import "../config/loadEnv.js";
import { DATA_SOURCES } from "./dataSourceRegistry.js";

/**
 * Crypto Launch Intelligence
 * Data Source Manager v3
 *
 * Purpose:
 * Controls which sources are active, which need API keys,
 * which can run for free, and which should be prioritized.
 *
 * Upgrade:
 * - Adds more source coverage
 * - Adds source tiers and priorities
 * - Adds API-key environment detection
 * - Adds chain-specific source support
 * - Adds source health tracking
 * - Adds runtime enable/disable controls
 * - Adds fallback planning for discovery scans
 */

const sourceHealth = new Map();

export const SOURCE_STATUS = {
  // =========================
  // Tier 1 Free Market Sources
  // =========================
  dexScreener: {
    enabled: true,
    requiresKey: false,
    tier: 1,
    priority: 100,
    category: "market",
    chains: ["ethereum", "base", "solana", "arbitrum", "optimism", "polygon", "bsc", "avalanche"]
  },

  geckoTerminal: {
    enabled: true,
    requiresKey: false,
    tier: 1,
    priority: 98,
    category: "market",
    chains: ["ethereum", "base", "solana", "arbitrum", "optimism", "polygon", "bsc", "avalanche"]
  },

  coinGecko: {
    enabled: true,
    requiresKey: false,
    tier: 1,
    priority: 95,
    category: "market",
    chains: ["market"]
  },

  defiLlama: {
    enabled: true,
    requiresKey: false,
    tier: 1,
    priority: 90,
    category: "market",
    chains: ["ethereum", "base", "solana", "arbitrum", "optimism", "polygon", "bsc", "avalanche"]
  },

  coinPaprika: {
    enabled: true,
    requiresKey: false,
    tier: 2,
    priority: 78,
    category: "market",
    chains: ["market"]
  },

  coinLore: {
    enabled: true,
    requiresKey: false,
    tier: 2,
    priority: 74,
    category: "market",
    chains: ["market"]
  },

  binance: {
    enabled: true,
    requiresKey: false,
    tier: 2,
    priority: 73,
    category: "market",
    chains: ["market"]
  },

  kuCoin: {
    enabled: true,
    requiresKey: false,
    tier: 2,
    priority: 72,
    category: "market",
    chains: ["market"]
  },

  coinbase: {
    enabled: true,
    requiresKey: false,
    tier: 2,
    priority: 71,
    category: "market",
    chains: ["market"]
  },

  kraken: {
    enabled: true,
    requiresKey: false,
    tier: 2,
    priority: 70,
    category: "market",
    chains: ["market"]
  },

  okx: {
    enabled: true,
    requiresKey: false,
    tier: 2,
    priority: 69,
    category: "market",
    chains: ["market"]
  },

  bybit: {
    enabled: process.env.MARKET_REGION !== "US",
    requiresKey: false,
    tier: 2,
    priority: 68,
    category: "market",
    chains: ["market"]
  },

  gate: {
    enabled: true,
    requiresKey: false,
    tier: 2,
    priority: 67,
    category: "market",
    chains: ["market"]
  },

  mexc: {
    enabled: true,
    requiresKey: false,
    tier: 2,
    priority: 66,
    category: "market",
    chains: ["market"]
  },

  bitget: {
    enabled: true,
    requiresKey: false,
    tier: 2,
    priority: 65,
    category: "market",
    chains: ["market"]
  },

  htx: {
    enabled: true,
    requiresKey: false,
    tier: 2,
    priority: 64,
    category: "market",
    chains: ["market"]
  },

  bitfinex: {
    enabled: true,
    requiresKey: false,
    tier: 2,
    priority: 63,
    category: "market",
    chains: ["market"]
  },

  bitstamp: {
    enabled: true,
    requiresKey: false,
    tier: 2,
    priority: 62,
    category: "market",
    chains: ["market"]
  },

  gemini: {
    enabled: true,
    requiresKey: false,
    tier: 2,
    priority: 61,
    category: "market",
    chains: ["market"]
  },

  // =========================
  // Premium Market Sources
  // =========================
  birdeye: {
    enabled: Boolean(process.env.BIRDEYE_API_KEY),
    requiresKey: true,
    envKey: "BIRDEYE_API_KEY",
    tier: 1,
    priority: 96,
    category: "market",
    chains: ["solana", "base", "ethereum", "arbitrum", "polygon", "bsc"]
  },

  coinMarketCap: {
    enabled: Boolean(process.env.COINMARKETCAP_API_KEY),
    requiresKey: true,
    envKey: "COINMARKETCAP_API_KEY",
    tier: 2,
    priority: 80,
    category: "market",
    chains: ["market"]
  },

  coinCap: {
    enabled: Boolean(process.env.COINCAP_API_KEY),
    requiresKey: true,
    envKey: "COINCAP_API_KEY",
    tier: 2,
    priority: 79,
    category: "market",
    chains: ["market"]
  },

  dexTools: {
    enabled: Boolean(process.env.DEXTOOLS_API_KEY),
    requiresKey: true,
    envKey: "DEXTOOLS_API_KEY",
    tier: 2,
    priority: 76,
    category: "market",
    chains: ["ethereum", "base", "arbitrum", "polygon", "bsc"]
  },

  cryptoCompare: {
    enabled: Boolean(process.env.CRYPTOCOMPARE_API_KEY),
    requiresKey: true,
    envKey: "CRYPTOCOMPARE_API_KEY",
    tier: 3,
    priority: 65,
    category: "market",
    chains: ["market"]
  },

  messari: {
    enabled: Boolean(process.env.MESSARI_API_KEY),
    requiresKey: true,
    envKey: "MESSARI_API_KEY",
    tier: 3,
    priority: 62,
    category: "market",
    chains: ["market"]
  },

  mobula: {
    enabled: Boolean(process.env.MOBULA_API_KEY),
    requiresKey: true,
    envKey: "MOBULA_API_KEY",
    tier: 3,
    priority: 60,
    category: "market",
    chains: ["ethereum", "base", "arbitrum", "polygon", "bsc"]
  },

  // =========================
  // Chain / Explorer Sources
  // =========================
  etherscan: {
    enabled: Boolean(process.env.ETHERSCAN_API_KEY),
    requiresKey: true,
    envKey: "ETHERSCAN_API_KEY",
    tier: 2,
    priority: 82,
    category: "explorer",
    chains: ["ethereum"]
  },

  basescan: {
    enabled: Boolean(process.env.BASESCAN_API_KEY),
    requiresKey: true,
    envKey: "BASESCAN_API_KEY",
    tier: 2,
    priority: 82,
    category: "explorer",
    chains: ["base"]
  },

  bscscan: {
    enabled: Boolean(process.env.BSCSCAN_API_KEY),
    requiresKey: true,
    envKey: "BSCSCAN_API_KEY",
    tier: 2,
    priority: 80,
    category: "explorer",
    chains: ["bsc"]
  },

  arbiscan: {
    enabled: Boolean(process.env.ARBISCAN_API_KEY),
    requiresKey: true,
    envKey: "ARBISCAN_API_KEY",
    tier: 2,
    priority: 80,
    category: "explorer",
    chains: ["arbitrum"]
  },

  optimisticEtherscan: {
    enabled: Boolean(process.env.OPTIMISTIC_ETHERSCAN_API_KEY),
    requiresKey: true,
    envKey: "OPTIMISTIC_ETHERSCAN_API_KEY",
    tier: 2,
    priority: 78,
    category: "explorer",
    chains: ["optimism"]
  },

  polygonscan: {
    enabled: Boolean(process.env.POLYGONSCAN_API_KEY),
    requiresKey: true,
    envKey: "POLYGONSCAN_API_KEY",
    tier: 2,
    priority: 78,
    category: "explorer",
    chains: ["polygon"]
  },

  snowtrace: {
    enabled: Boolean(process.env.SNOWTRACE_API_KEY),
    requiresKey: true,
    envKey: "SNOWTRACE_API_KEY",
    tier: 2,
    priority: 75,
    category: "explorer",
    chains: ["avalanche"]
  },

  solscan: {
    enabled: Boolean(process.env.SOLSCAN_API_KEY),
    requiresKey: true,
    envKey: "SOLSCAN_API_KEY",
    tier: 2,
    priority: 80,
    category: "explorer",
    chains: ["solana"]
  },

  blockscout: {
    enabled: true,
    requiresKey: false,
    tier: 3,
    priority: 60,
    category: "explorer",
    chains: ["ethereum", "base", "optimism", "arbitrum", "polygon", "bsc"]
  },

  // =========================
  // Developer / GitHub Sources
  // =========================
  github: {
    enabled: true,
    requiresKey: false,
    tier: 1,
    priority: 88,
    category: "developer",
    chains: ["all"]
  },

  githubTrending: {
    enabled: true,
    requiresKey: false,
    tier: 1,
    priority: 86,
    category: "developer",
    chains: ["all"]
  },

  npm: {
    enabled: true,
    requiresKey: false,
    tier: 2,
    priority: 70,
    category: "developer",
    chains: ["all"]
  },

  // =========================
  // Narrative / Social Sources
  // =========================
  reddit: {
    enabled: false,
    requiresKey: true,
    envKey: "REDDIT_API_KEY",
    tier: 2,
    priority: 75,
    category: "social",
    chains: ["all"]
  },

  googleTrends: {
    enabled: true,
    requiresKey: false,
    tier: 2,
    priority: 72,
    category: "social",
    chains: ["all"]
  },

  xTwitter: {
    enabled: Boolean(process.env.X_API_KEY || process.env.TWITTER_API_KEY || process.env.X_BEARER_TOKEN || process.env.TWITTER_BEARER_TOKEN),
    requiresKey: true,
    envKey: "X_BEARER_TOKEN",
    alternateEnvKeys: ["TWITTER_BEARER_TOKEN", "X_API_KEY", "TWITTER_API_KEY"],
    tier: 1,
    priority: 92,
    category: "social",
    chains: ["all"]
  },

  telegram: {
    enabled: Boolean(process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_API_KEY),
    requiresKey: true,
    envKey: "TELEGRAM_BOT_TOKEN",
    alternateEnvKeys: ["TELEGRAM_API_KEY"],
    tier: 2,
    priority: 74,
    category: "social",
    chains: ["all"]
  },

  discord: {
    enabled: Boolean(process.env.DISCORD_BOT_TOKEN),
    requiresKey: true,
    envKey: "DISCORD_BOT_TOKEN",
    tier: 2,
    priority: 74,
    category: "social",
    chains: ["all"]
  },

  cryptoPanic: {
    enabled: Boolean(process.env.CRYPTOPANIC_API_KEY),
    requiresKey: true,
    envKey: "CRYPTOPANIC_API_KEY",
    tier: 2,
    priority: 76,
    category: "news",
    chains: ["all"]
  },

  rssNews: {
    enabled: true,
    requiresKey: false,
    tier: 3,
    priority: 58,
    category: "news",
    chains: ["all"]
  },

  // =========================
  // Risk / Safety Sources
  // =========================
  goPlus: {
    enabled: true,
    requiresKey: false,
    tier: 1,
    priority: 88,
    category: "risk",
    chains: ["ethereum", "base", "arbitrum", "optimism", "polygon", "bsc"]
  },

  honeypotChecker: {
    enabled: true,
    requiresKey: false,
    tier: 1,
    priority: 86,
    category: "risk",
    chains: ["ethereum", "base", "arbitrum", "polygon", "bsc"]
  },

  rugCheck: {
    enabled: true,
    requiresKey: false,
    tier: 1,
    priority: 86,
    category: "risk",
    chains: ["solana"]
  },

  tokenSniffer: {
    enabled: Boolean(process.env.TOKENSNIFFER_API_KEY),
    requiresKey: true,
    envKey: "TOKENSNIFFER_API_KEY",
    tier: 2,
    priority: 75,
    category: "risk",
    chains: ["ethereum", "base", "arbitrum", "polygon", "bsc"]
  },

  // =========================
  // Wallet / Smart Money Sources
  // =========================
  debank: {
    enabled: Boolean(process.env.DEBANK_API_KEY),
    requiresKey: true,
    envKey: "DEBANK_API_KEY",
    tier: 2,
    priority: 77,
    category: "wallet",
    chains: ["ethereum", "base", "arbitrum", "optimism", "polygon", "bsc"]
  },

  zerion: {
    enabled: Boolean(process.env.ZERION_API_KEY),
    requiresKey: true,
    envKey: "ZERION_API_KEY",
    tier: 3,
    priority: 62,
    category: "wallet",
    chains: ["ethereum", "base", "arbitrum", "optimism", "polygon", "bsc"]
  },

  arkham: {
    enabled: Boolean(process.env.ARKHAM_API_KEY),
    requiresKey: true,
    envKey: "ARKHAM_API_KEY",
    tier: 2,
    priority: 79,
    category: "wallet",
    chains: ["ethereum", "base", "arbitrum", "optimism", "polygon", "bsc"]
  },

  nansen: {
    enabled: Boolean(process.env.NANSEN_API_KEY),
    requiresKey: true,
    envKey: "NANSEN_API_KEY",
    tier: 1,
    priority: 94,
    category: "wallet",
    chains: ["ethereum", "base", "arbitrum", "optimism", "polygon", "bsc"]
  }
};

function normalize(value = "") {
  return String(value || "").trim();
}

function normalizeKey(value = "") {
  return normalize(value).toLowerCase();
}

function getEnvValue(config = {}) {
  const keys = [config.envKey, ...(config.alternateEnvKeys || [])].filter(Boolean);

  for (const key of keys) {
    if (process.env[key]) {
      return process.env[key];
    }
  }

  return null;
}

function hasRequiredKey(config = {}) {
  if (!config.requiresKey) return true;
  return Boolean(getEnvValue(config));
}

function cloneSourceConfig(name, config = {}) {
  const envPresent = hasRequiredKey(config);

  return {
    name,
    enabled: Boolean(config.enabled && envPresent),
    configuredEnabled: Boolean(config.enabled),
    requiresKey: Boolean(config.requiresKey),
    hasKey: envPresent,
    envKey: config.envKey || null,
    alternateEnvKeys: config.alternateEnvKeys || [],
    tier: Number(config.tier || 3),
    priority: Number(config.priority || 0),
    category: config.category || "other",
    chains: config.chains || ["all"]
  };
}

function sortSources(a, b) {
  if (a.tier !== b.tier) return a.tier - b.tier;
  return b.priority - a.priority;
}

function sourceSupportsChain(source = {}, chain = "all") {
  const requestedChain = normalizeKey(chain || "all");
  const chains = (source.chains || []).map(normalizeKey);

  return (
    requestedChain === "all" ||
    chains.includes("all") ||
    chains.includes("market") ||
    chains.includes(requestedChain)
  );
}

function sourceSupportsCategory(source = {}, category = null) {
  if (!category) return true;
  return normalizeKey(source.category) === normalizeKey(category);
}

export function getSourceConfig(sourceName = "") {
  const key = Object.keys(SOURCE_STATUS).find(
    source => normalizeKey(source) === normalizeKey(sourceName)
  );

  if (!key) return null;

  return cloneSourceConfig(key, SOURCE_STATUS[key]);
}

export function getAllSources(options = {}) {
  const chain = options.chain || "all";
  const category = options.category || null;
  const includeDisabled = options.includeDisabled !== false;

  return Object.entries(SOURCE_STATUS)
    .map(([name, config]) => cloneSourceConfig(name, config))
    .filter(source => includeDisabled || source.enabled)
    .filter(source => sourceSupportsChain(source, chain))
    .filter(source => sourceSupportsCategory(source, category))
    .sort(sortSources);
}

export function getEnabledSources(options = {}) {
  return getAllSources({
    ...options,
    includeDisabled: false
  }).map(source => source.name);
}

export function getFreeSources(options = {}) {
  return getAllSources({
    ...options,
    includeDisabled: false
  })
    .filter(source => !source.requiresKey)
    .map(source => source.name);
}

export function getPremiumSources(options = {}) {
  const includeDisabled = options.includeDisabled !== false;

  return getAllSources({
    ...options,
    includeDisabled
  })
    .filter(source => source.requiresKey)
    .map(source => source.name);
}

export function getSourcesByCategory(category = "", options = {}) {
  return getAllSources({
    ...options,
    category
  });
}

export function getMarketSources(options = {}) {
  return getSourcesByCategory("market", options);
}

export function getRiskSources(options = {}) {
  return getSourcesByCategory("risk", options);
}

export function getSocialSources(options = {}) {
  return getSourcesByCategory("social", options);
}

export function getDeveloperSources(options = {}) {
  return getSourcesByCategory("developer", options);
}

export function getExplorerSources(options = {}) {
  return getSourcesByCategory("explorer", options);
}

export function getWalletSources(options = {}) {
  return getSourcesByCategory("wallet", options);
}

export function getNewsSources(options = {}) {
  return getSourcesByCategory("news", options);
}

export function enableSource(sourceName = "") {
  const config = getSourceConfig(sourceName);

  if (!config) {
    return {
      status: "NOT_FOUND",
      source: sourceName,
      enabled: false,
      message: `Unknown source: ${sourceName}`
    };
  }

  const key = config.name;
  SOURCE_STATUS[key].enabled = true;

  const hasKey = hasRequiredKey(SOURCE_STATUS[key]);

  return {
    status: hasKey ? "SUCCESS" : "MISSING_KEY",
    source: key,
    enabled: hasKey,
    requiresKey: Boolean(SOURCE_STATUS[key].requiresKey),
    envKey: SOURCE_STATUS[key].envKey || null,
    message: hasKey
      ? `${key} enabled`
      : `${key} enabled in config but missing required API key`
  };
}

export function disableSource(sourceName = "") {
  const config = getSourceConfig(sourceName);

  if (!config) {
    return {
      status: "NOT_FOUND",
      source: sourceName,
      enabled: false,
      message: `Unknown source: ${sourceName}`
    };
  }

  const key = config.name;
  SOURCE_STATUS[key].enabled = false;

  return {
    status: "SUCCESS",
    source: key,
    enabled: false,
    message: `${key} disabled`
  };
}

export function setSourceEnabled(sourceName = "", enabled = true) {
  return enabled ? enableSource(sourceName) : disableSource(sourceName);
}

export function recordSourceSuccess(sourceName = "", meta = {}) {
  const source = normalizeKey(sourceName);
  const existing = sourceHealth.get(source) || {
    successes: 0,
    failures: 0,
    lastSuccessAt: null,
    lastFailureAt: null,
    lastError: null,
    totalExecutionMs: 0,
    averageExecutionMs: 0
  };

  existing.successes += 1;
  existing.lastSuccessAt = new Date().toISOString();
  existing.lastError = null;
  existing.totalExecutionMs += Number(meta.executionTimeMs || 0);
  existing.averageExecutionMs = Math.round(
    existing.totalExecutionMs / Math.max(1, existing.successes)
  );

  sourceHealth.set(source, existing);

  return existing;
}

export function recordSourceFailure(sourceName = "", error = null, meta = {}) {
  const source = normalizeKey(sourceName);
  const existing = sourceHealth.get(source) || {
    successes: 0,
    failures: 0,
    lastSuccessAt: null,
    lastFailureAt: null,
    lastError: null,
    totalExecutionMs: 0,
    averageExecutionMs: 0
  };

  existing.failures += 1;
  existing.lastFailureAt = new Date().toISOString();
  existing.lastError = error?.message || String(error || "Unknown error");
  existing.totalExecutionMs += Number(meta.executionTimeMs || 0);

  const totalRuns = existing.successes + existing.failures;
  existing.averageExecutionMs = Math.round(
    existing.totalExecutionMs / Math.max(1, totalRuns)
  );

  sourceHealth.set(source, existing);

  return existing;
}

export function getSourceHealth(sourceName = "") {
  if (!sourceName) {
    return Object.fromEntries(sourceHealth.entries());
  }

  return sourceHealth.get(normalizeKey(sourceName)) || null;
}

export function clearSourceHealth(sourceName = "") {
  if (!sourceName) {
    sourceHealth.clear();
    return {
      status: "SUCCESS",
      message: "All source health records cleared"
    };
  }

  sourceHealth.delete(normalizeKey(sourceName));

  return {
    status: "SUCCESS",
    source: sourceName,
    message: `${sourceName} health record cleared`
  };
}

export function getMissingApiKeys() {
  return Object.entries(SOURCE_STATUS)
    .map(([name, config]) => cloneSourceConfig(name, config))
    .filter(source => source.requiresKey && source.configuredEnabled && !source.hasKey)
    .map(source => ({
      source: source.name,
      envKey: source.envKey,
      alternateEnvKeys: source.alternateEnvKeys
    }));
}

export function getAvailableApiKeys() {
  return Object.entries(SOURCE_STATUS)
    .map(([name, config]) => cloneSourceConfig(name, config))
    .filter(source => source.requiresKey && source.hasKey)
    .map(source => ({
      source: source.name,
      envKey: source.envKey,
      alternateEnvKeys: source.alternateEnvKeys
    }));
}

export function buildSourceExecutionPlan(options = {}) {
  const chain = options.chain || "all";
  const includeDisabled = options.includeDisabled === true;

  const marketSources = getMarketSources({ chain, includeDisabled });
  const riskSources = getRiskSources({ chain, includeDisabled });
  const developerSources = getDeveloperSources({ chain, includeDisabled });
  const socialSources = getSocialSources({ chain, includeDisabled });
  const newsSources = getNewsSources({ chain, includeDisabled });
  const explorerSources = getExplorerSources({ chain, includeDisabled });
  const walletSources = getWalletSources({ chain, includeDisabled });

  const enabledMarketSources = marketSources.filter(source => source.enabled);
  const enabledRiskSources = riskSources.filter(source => source.enabled);
  const enabledDeveloperSources = developerSources.filter(source => source.enabled);
  const enabledSocialSources = socialSources.filter(source => source.enabled);
  const enabledNewsSources = newsSources.filter(source => source.enabled);
  const enabledExplorerSources = explorerSources.filter(source => source.enabled);
  const enabledWalletSources = walletSources.filter(source => source.enabled);

  return {
    chain,
    executionGroups: {
      discovery: enabledMarketSources.map(source => source.name),
      risk: enabledRiskSources.map(source => source.name),
      developer: enabledDeveloperSources.map(source => source.name),
      social: enabledSocialSources.map(source => source.name),
      news: enabledNewsSources.map(source => source.name),
      explorer: enabledExplorerSources.map(source => source.name),
      wallet: enabledWalletSources.map(source => source.name)
    },
    fallbackOrder: {
      market: enabledMarketSources.map(source => source.name),
      risk: enabledRiskSources.map(source => source.name),
      developer: enabledDeveloperSources.map(source => source.name),
      social: enabledSocialSources.map(source => source.name),
      news: enabledNewsSources.map(source => source.name),
      explorer: enabledExplorerSources.map(source => source.name),
      wallet: enabledWalletSources.map(source => source.name)
    },
    disabledSources: getAllSources({ chain, includeDisabled: true })
      .filter(source => !source.enabled)
      .map(source => ({
        name: source.name,
        category: source.category,
        requiresKey: source.requiresKey,
        hasKey: source.hasKey,
        envKey: source.envKey
      })),
    missingApiKeys: getMissingApiKeys(),
    health: getSourceHealth()
  };
}

export function getSourcePlan(options = {}) {
  return {
    categories: DATA_SOURCES,
    allSources: getAllSources({
      includeDisabled: true,
      chain: options.chain || "all"
    }),
    enabledSources: getEnabledSources(options),
    freeSources: getFreeSources(options),
    premiumSources: getPremiumSources({
      ...options,
      includeDisabled: true
    }),
    missingApiKeys: getMissingApiKeys(),
    availableApiKeys: getAvailableApiKeys(),
    executionPlan: buildSourceExecutionPlan(options),
    health: getSourceHealth()
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const chain = process.argv[2] || "all";
  const plan = getSourcePlan({ chain });

  console.log(JSON.stringify(plan, null, 2));
}
