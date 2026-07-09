// src/data/coinGeckoConnector.js

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

const COINGECKO_BASE = "https://api.coingecko.com/api/v3";

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

async function fetchJson(url, options = {}) {
  const timeoutMs = Number(options.timeoutMs || 15000);
  const controller = new AbortController();

  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        accept: "application/json"
      }
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
  return String(project.pairAddress || project.symbol || project.name || "")
    .toLowerCase()
    .trim();
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
  return fetchJson(`${COINGECKO_BASE}/search/trending`);
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

  return fetchJson(`${COINGECKO_BASE}/coins/markets?${params.toString()}`);
}

export function normalizeCoinGeckoMarket(coin = {}, meta = {}) {
  return {
    name: coin.name || "Unknown",
    symbol: coin.symbol?.toUpperCase() || "UNKNOWN",
    chain: meta.category || "coingecko",
    address: null,
    pairAddress: coin.id || null,
    dex: meta.category ? `category:${meta.category}` : "market",
    url: coin.id ? `https://www.coingecko.com/en/coins/${coin.id}` : null,

    priceUsd: safeNumber(coin.current_price),
    liquidityUsd: safeNumber(coin.market_cap),
    volume24h: safeNumber(coin.total_volume),

    priceChange1h: safeNumber(coin.price_change_percentage_1h_in_currency),
    priceChange24h: safeNumber(coin.price_change_percentage_24h),
    priceChange7d: safeNumber(coin.price_change_percentage_7d_in_currency),

    marketCap: safeNumber(coin.market_cap),
    fdv: safeNumber(coin.fully_diluted_valuation),
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
    chain: "coingecko-trending",
    address: null,
    pairAddress: coin.id || null,
    dex: "trending",
    url: coin.id ? `https://www.coingecko.com/en/coins/${coin.id}` : null,

    priceUsd: safeNumber(coin.data?.price),
    liquidityUsd: safeNumber(coin.data?.market_cap),
    volume24h: safeNumber(coin.data?.total_volume),

    marketCapRank: safeNumber(coin.market_cap_rank),

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

export async function getCoinGeckoCandidates(options = {}) {
  const perPage = Number(options.perPage || process.env.COINGECKO_PER_PAGE || 100);
  const pages = Number(options.pages || process.env.COINGECKO_PAGES || 1);
  const categoryLimit = Number(options.categoryLimit || process.env.COINGECKO_CATEGORY_LIMIT || 4);
  const categories = (options.categories || DEFAULT_CATEGORIES).slice(0, categoryLimit);
  const delayMs = Number(options.delayMs || process.env.COINGECKO_DELAY_MS || 3500);
  const stopOnRateLimit = options.stopOnRateLimit ?? process.env.COINGECKO_STOP_ON_429 !== "false";

  const candidates = [];
  let rateLimited = false;

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

if (import.meta.url === `file://${process.argv[1]}`) {
  const candidates = await getCoinGeckoCandidates({
    perPage: 250,
    pages: 3
  });

  console.log(`CoinGecko candidates: ${candidates.length}`);
  console.log(JSON.stringify(candidates.slice(0, 25), null, 2));
}
