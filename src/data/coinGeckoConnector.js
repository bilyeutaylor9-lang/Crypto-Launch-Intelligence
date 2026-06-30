// src/data/coinGeckoConnector.js

/**
 * Crypto Launch Intelligence
 * CoinGecko Connector
 *
 * Purpose:
 * Pulls trending crypto market data from CoinGecko.
 * This expands discovery beyond DEX-only data.
 */

const COINGECKO_BASE = "https://api.coingecko.com/api/v3";

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`CoinGecko request failed: ${response.status} ${url}`);
  }

  return response.json();
}

export async function getTrendingCoins() {
  return fetchJson(`${COINGECKO_BASE}/search/trending`);
}

export async function getTopMarkets(options = {}) {
  const currency = options.currency || "usd";
  const perPage = Number(options.perPage || 50);

  return fetchJson(
    `${COINGECKO_BASE}/coins/markets?vs_currency=${currency}&order=volume_desc&per_page=${perPage}&page=1&sparkline=false&price_change_percentage=24h`
  );
}

export function normalizeCoinGeckoMarket(coin = {}) {
  return {
    name: coin.name || "Unknown",
    symbol: coin.symbol?.toUpperCase() || "UNKNOWN",
    chain: "coingecko",
    address: null,
    pairAddress: coin.id || null,
    dex: "market",
    url: `https://www.coingecko.com/en/coins/${coin.id}`,

    priceUsd: Number(coin.current_price || 0),
    liquidityUsd: Number(coin.market_cap || 0),
    volume24h: Number(coin.total_volume || 0),

    priceChange24h: Number(coin.price_change_percentage_24h || 0),

    marketCap: Number(coin.market_cap || 0),
    fdv: Number(coin.fully_diluted_valuation || 0),
    circulatingSupply: Number(coin.circulating_supply || 0),
    totalSupply: Number(coin.total_supply || 0),

    source: "coingecko",

    description: [
      coin.name,
      coin.symbol,
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
    chain: "coingecko",
    address: null,
    pairAddress: coin.id || null,
    dex: "trending",
    url: `https://www.coingecko.com/en/coins/${coin.id}`,

    priceUsd: Number(coin.data?.price || 0),
    liquidityUsd: Number(coin.data?.market_cap || 0),
    volume24h: Number(coin.data?.total_volume || 0),

    marketCapRank: Number(coin.market_cap_rank || 0),

    source: "coingecko-trending",

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
  const perPage = Number(options.perPage || 50);

  const candidates = [];

  try {
    const trending = await getTrendingCoins();
    const trendingCoins = trending.coins || [];

    candidates.push(
      ...trendingCoins.map(normalizeCoinGeckoTrending)
    );
  } catch (error) {
    console.warn(`CoinGecko trending skipped: ${error.message}`);
  }

  try {
    const markets = await getTopMarkets({ perPage });

    candidates.push(
      ...markets.map(normalizeCoinGeckoMarket)
    );
  } catch (error) {
    console.warn(`CoinGecko markets skipped: ${error.message}`);
  }

  return candidates;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const candidates = await getCoinGeckoCandidates();
  console.log(JSON.stringify(candidates.slice(0, 25), null, 2));
}
