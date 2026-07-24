// src/data/coinGeckoConnector.js

import { normalizeChainId, normalizeTokenAddress } from "../identity/strictIdentityValidators.js";

/**
 * Crypto Launch Intelligence
 * CoinGecko Connector v2
 *
 * Upgrade:
 * - Scans trending coins
 * - Scans top volume market pages
 * - Scans multiple CoinGecko categories
 * - Supports higher perPage/page depth
 * - Adds deduplication
 * - Adds safer fetch timeout
 */

const COINGECKO_PUBLIC_BASE = "https://api.coingecko.com/api/v3";
const COINGECKO_PRO_BASE = "https://pro-api.coingecko.com/api/v3";

const DEFAULT_CATEGORIES = [
  "artificial-intelligence",
  "real-world-assets-rwa",
  "gaming",
  "depin",
  "base-ecosystem",
  "solana-ecosystem",
  "ethereum-ecosystem",
  "layer-1",
  "layer-2",
  "meme-token",
  "zero-knowledge-zk"
];

const COINGECKO_PLATFORM_CHAIN_ALIASES = Object.freeze({
  ethereum: "ethereum",
  base: "base",
  "binance-smart-chain": "bsc",
  "bnb-smart-chain": "bsc",
  "arbitrum-one": "arbitrum",
  "polygon-pos": "polygon",
  "optimistic-ethereum": "optimism",
  avalanche: "avalanche",
  solana: "solana",
  sui: "sui",
  "the-open-network": "ton",
  aptos: "aptos",
  osmosis: "osmosis",
  tron: "tron",
  "near-protocol": "near",
  fantom: "fantom",
  linea: "linea",
  scroll: "scroll",
  "zksync-era": "zksync",
  mantle: "mantle",
  blast: "blast",
  ronin: "ronin",
  "mode-network": "mode",
  berachain: "berachain",
  sonic: "sonic",
});

function sleep(ms = 750) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class CoinGeckoRateLimitError extends Error {
  constructor(message, retryAfterMs = 0) {
    super(message);
    this.name = "CoinGeckoRateLimitError";
    this.rateLimited = true;
    this.retryAfterMs = retryAfterMs;
  }
}

function boolEnv(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  return !["false", "0", "no", "off"].includes(String(value).toLowerCase());
}

function coinGeckoAuthConfig(env = process.env) {
  const tier = String(env.COINGECKO_API_TIER || env.COINGECKO_PLAN || "").toLowerCase();
  const proKey = tier === "demo" ? "" : env.COINGECKO_PRO_API_KEY || (tier === "pro" ? env.COINGECKO_API_KEY : "");
  const demoKey = tier === "pro" ? "" : env.COINGECKO_DEMO_API_KEY || env.COINGECKO_API_KEY || "";

  if (proKey) {
    return {
      tier: "pro",
      key: proKey,
      headerName: "x-cg-pro-api-key",
      baseUrl: env.COINGECKO_BASE_URL || COINGECKO_PRO_BASE,
    };
  }

  if (demoKey) {
    return {
      tier: "demo",
      key: demoKey,
      headerName: "x-cg-demo-api-key",
      baseUrl: env.COINGECKO_BASE_URL || COINGECKO_PUBLIC_BASE,
    };
  }

  return {
    tier: "public",
    key: "",
    headerName: null,
    baseUrl: env.COINGECKO_BASE_URL || COINGECKO_PUBLIC_BASE,
  };
}

function coinGeckoHeaders() {
  const auth = coinGeckoAuthConfig();
  return {
    accept: "application/json",
    ...(auth.key && auth.headerName ? { [auth.headerName]: auth.key } : {}),
  };
}

function coinGeckoBaseUrl() {
  return coinGeckoAuthConfig().baseUrl;
}

function requestDelayMs(options = {}) {
  if (options.delayMs !== undefined) return Number(options.delayMs);
  if (process.env.COINGECKO_DELAY_MS) return Number(process.env.COINGECKO_DELAY_MS);

  const rpm = Number(process.env.COINGECKO_REQUESTS_PER_MINUTE || 0);
  if (rpm > 0) {
    const safetyMargin = Number(process.env.COINGECKO_RATE_LIMIT_SAFETY_MARGIN || 0.85);
    const safeRpm = Math.max(1, Math.floor(rpm * Math.min(1, Math.max(0.1, safetyMargin))));
    return Math.ceil(60000 / safeRpm);
  }

  return 3500;
}

async function fetchJson(url, options = {}) {
  const timeoutMs = Number(options.timeoutMs || 15000);
  const controller = new AbortController();

  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: coinGeckoHeaders(),
    });

    if (response.status === 429) {
      const retryAfter = Number(response.headers.get("retry-after") || 0);
      throw new CoinGeckoRateLimitError(
        `CoinGecko rate limited this scan. Retry later or lower COINGECKO_* limits.`,
        retryAfter > 0 ? retryAfter * 1000 : Number(options.rateLimitPauseMs || 60000)
      );
    }

    if (!response.ok) {
      throw new Error(`CoinGecko request failed: ${response.status} ${url}`);
    }

    return response.json();
  } finally {
    clearTimeout(timer);
  }
}

function safeNumber(value = 0) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function keyForCoin(project = {}) {
  return String(project.coinGeckoId || project.marketKey || project.symbol || project.name || "")
    .toLowerCase()
    .trim();
}

function normalizeCoinGeckoPlatform(platform = "") {
  const mapped = COINGECKO_PLATFORM_CHAIN_ALIASES[String(platform || "").toLowerCase()] || platform;
  return normalizeChainId(mapped);
}

function dedupeProjects(projects = []) {
  const seen = new Map();

  for (const project of projects) {
    const key = keyForCoin(project);
    if (!key) continue;

    if (!seen.has(key)) {
      seen.set(key, project);
      continue;
    }

    const existing = seen.get(key);

    seen.set(key, {
      ...existing,
      ...project,
      sources: Array.from(
        new Set([...(existing.sources || []), ...(project.sources || [])])
      )
    });
  }

  return Array.from(seen.values());
}

export async function getTrendingCoins() {
  return fetchJson(`${coinGeckoBaseUrl()}/search/trending`);
}

export async function getMarkets(options = {}) {
  const currency = options.currency || "usd";
  const perPage = Number(options.perPage || 250);
  const page = Number(options.page || 1);
  const category = options.category || "";

  const params = new URLSearchParams({
    vs_currency: currency,
    order: options.order || "volume_desc",
    per_page: String(perPage),
    page: String(page),
    sparkline: "false",
    price_change_percentage: "1h,24h,7d"
  });

  if (category) params.set("category", category);

  return fetchJson(`${coinGeckoBaseUrl()}/coins/markets?${params.toString()}`);
}

export async function getCoinList(options = {}) {
  const includePlatform = options.includePlatform ?? true;
  const params = new URLSearchParams({
    include_platform: includePlatform ? "true" : "false",
  });
  return fetchJson(`${coinGeckoBaseUrl()}/coins/list?${params.toString()}`, options);
}

export function normalizeCoinGeckoMarket(coin = {}, meta = {}) {
  return {
    name: coin.name || "Unknown",
    symbol: coin.symbol?.toUpperCase() || "UNKNOWN",
    chain: null,
    coinGeckoId: coin.id || null,
    providerAssetId: coin.id || null,
    marketKey: coin.id ? `coingecko:${coin.id}` : null,
    address: null,
    pairAddress: null,
    dex: "market-aggregate",
    url: coin.id ? `https://www.coingecko.com/en/coins/${coin.id}` : null,
    category: meta.category || null,
    narrativeCategory: meta.category || null,
    narrativeCategories: meta.category ? [meta.category] : [],

    priceUsd: safeNumber(coin.current_price),
    liquidityUsd: null,
    volume24h: safeNumber(coin.total_volume),

    priceChange1h: safeNumber(coin.price_change_percentage_1h_in_currency),
    priceChange24h: safeNumber(coin.price_change_percentage_24h),
    priceChange7d: safeNumber(coin.price_change_percentage_7d_in_currency),

    marketCap: safeNumber(coin.market_cap),
    circulatingMarketCapUsd: safeNumber(coin.market_cap),
    fdv: safeNumber(coin.fully_diluted_valuation),
    fullyDilutedValueUsd: safeNumber(coin.fully_diluted_valuation),
    circulatingSupply: safeNumber(coin.circulating_supply),
    totalSupply: safeNumber(coin.total_supply),
    marketCapRank: safeNumber(coin.market_cap_rank),

    source: "coingecko",
    sources: ["coingecko"],

    description: [
      coin.name,
      coin.symbol,
      meta.category,
      "coingecko market data"
    ]
      .filter(Boolean)
      .join(" ")
  };
}

export function normalizeCoinGeckoTrending(item = {}) {
  const coin = item.item || item;

  return {
    name: coin.name || "Unknown",
    symbol: coin.symbol?.toUpperCase() || "UNKNOWN",
    chain: null,
    coinGeckoId: coin.id || null,
    providerAssetId: coin.id || null,
    marketKey: coin.id ? `coingecko:${coin.id}` : null,
    address: null,
    pairAddress: null,
    dex: "trending",
    url: coin.id ? `https://www.coingecko.com/en/coins/${coin.id}` : null,

    priceUsd: safeNumber(coin.data?.price),
    liquidityUsd: null,
    volume24h: safeNumber(coin.data?.total_volume),

    marketCapRank: safeNumber(coin.market_cap_rank),
    marketCap: safeNumber(coin.data?.market_cap),
    circulatingMarketCapUsd: safeNumber(coin.data?.market_cap),

    source: "coingecko-trending",
    sources: ["coingecko-trending"],

    description: [
      coin.name,
      coin.symbol,
      "coingecko trending"
    ]
      .filter(Boolean)
      .join(" ")
  };
}

export function normalizeCoinGeckoListItem(coin = {}) {
  const platformEntries = Object.entries(coin.platforms || {})
    .map(([platform, address]) => {
      const chain = normalizeCoinGeckoPlatform(platform);
      const tokenAddress = chain ? normalizeTokenAddress(address, chain) : null;
      return {
        platform,
        chain,
        tokenAddress,
        accepted: Boolean(chain && tokenAddress),
      };
    })
    .filter((entry) => entry.accepted);
  const primaryPlatform = platformEntries[0] || null;

  return {
    name: coin.name || "Unknown",
    symbol: coin.symbol?.toUpperCase() || "UNKNOWN",
    chain: primaryPlatform?.chain || null,
    coinGeckoId: coin.id || null,
    providerAssetId: coin.id || null,
    marketKey: coin.id ? `coingecko:${coin.id}` : null,
    tokenAddress: primaryPlatform?.tokenAddress || null,
    address: primaryPlatform?.tokenAddress || null,
    pairAddress: null,
    dex: "identity-list",
    url: coin.id ? `https://www.coingecko.com/en/coins/${coin.id}` : null,
    category: "coingecko-identity",
    narrativeCategory: null,
    narrativeCategories: [],
    priceUsd: null,
    liquidityUsd: null,
    volume24h: null,
    marketCap: null,
    circulatingMarketCapUsd: null,
    coinGeckoPlatforms: platformEntries.map(({ platform, chain, tokenAddress }) => ({
      platform,
      chain,
      tokenAddress,
    })),
    source: "coingecko-list",
    sources: ["coingecko-list"],
    description: [coin.name, coin.symbol, "coingecko platform identity"]
      .filter(Boolean)
      .join(" "),
  };
}

export async function getCoinGeckoCandidates(options = {}) {
  const perPage = Number(options.perPage || process.env.COINGECKO_PER_PAGE || 100);
  const pages = Number(options.pages || process.env.COINGECKO_PAGES || 1);
  const categoryLimit = Number(options.categoryLimit || process.env.COINGECKO_CATEGORY_LIMIT || 4);
  const categories = (options.categories || DEFAULT_CATEGORIES).slice(0, categoryLimit);
  const delayMs = requestDelayMs(options);
  const stopOnRateLimit = options.stopOnRateLimit ?? process.env.COINGECKO_STOP_ON_429 !== "false";
  const includeCoinList =
    options.includeCoinList ??
    boolEnv(process.env.COINGECKO_INCLUDE_COIN_LIST, Boolean(coinGeckoAuthConfig().key));
  const coinListLimit = Number(options.coinListLimit || process.env.COINGECKO_COIN_LIST_LIMIT || 20000);

  const candidates = [];
  let rateLimited = false;

  if (includeCoinList) {
    try {
      const coins = await getCoinList({ timeoutMs: options.timeoutMs });
      candidates.push(
        ...coins
          .slice(0, coinListLimit > 0 ? coinListLimit : undefined)
          .map(normalizeCoinGeckoListItem)
      );
    } catch (error) {
      if (error.rateLimited) {
        rateLimited = true;
        console.warn(`CoinGecko paused during coin list: ${error.message}`);
      } else {
        console.warn(`CoinGecko coin list skipped: ${error.message}`);
      }
    }

    if (!rateLimited) await sleep(delayMs);
  }

  try {
    const trending = await getTrendingCoins();
    const trendingCoins = trending.coins || [];
    candidates.push(...trendingCoins.map(normalizeCoinGeckoTrending));
  } catch (error) {
    if (error.rateLimited) {
      rateLimited = true;
      console.warn(`CoinGecko paused: ${error.message}`);
    } else {
      console.warn(`CoinGecko trending skipped: ${error.message}`);
    }
  }

  for (let page = 1; page <= pages && !rateLimited; page++) {
    try {
      const markets = await getMarkets({ perPage, page });
      candidates.push(
        ...markets.map((coin) =>
          normalizeCoinGeckoMarket(coin, { category: "top-volume" })
        )
      );
    } catch (error) {
      if (error.rateLimited && stopOnRateLimit) {
        rateLimited = true;
        console.warn(`CoinGecko paused after page ${page}: ${error.message}`);
      } else {
        console.warn(`CoinGecko market page ${page} skipped: ${error.message}`);
      }
    }

    await sleep(delayMs);
  }

  for (const category of categories) {
    if (rateLimited) break;

    try {
      const markets = await getMarkets({
        perPage,
        page: 1,
        category,
        order: "volume_desc"
      });

      candidates.push(
        ...markets.map((coin) =>
          normalizeCoinGeckoMarket(coin, { category })
        )
      );
    } catch (error) {
      if (error.rateLimited && stopOnRateLimit) {
        rateLimited = true;
        console.warn(`CoinGecko paused before remaining categories: ${error.message}`);
      } else {
        console.warn(`CoinGecko category ${category} skipped: ${error.message}`);
      }
    }

    await sleep(delayMs);
  }

  return dedupeProjects(candidates);
}

export const __coinGeckoTestHooks = {
  coinGeckoAuthConfig,
  coinGeckoBaseUrl,
  coinGeckoHeaders,
  normalizeCoinGeckoPlatform,
  requestDelayMs,
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const candidates = await getCoinGeckoCandidates({
    perPage: 250,
    pages: 3
  });

  console.log(`CoinGecko candidates: ${candidates.length}`);
  console.log(JSON.stringify(candidates.slice(0, 25), null, 2));
}
