// src/data/geckoTerminalConnector.js

/**
 * Crypto Launch Intelligence
 * GeckoTerminal Connector v2
 *
 * Purpose:
 * Pulls live trending pool data from GeckoTerminal.
 * Adds retry handling, pagination, safer normalization, and better pool URLs.
 */

const GECKO_TERMINAL_BASE = "https://api.geckoterminal.com/api/v2";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function parsePoolId(poolId = "") {
  // Common format: "eth_0x..."
  const [network, ...rest] = String(poolId).split("_");
  return {
    network: network || null,
    poolAddress: rest.join("_") || poolId || null
  };
}

async function fetchJson(url, retries = 3) {
  let lastError;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          accept: "application/json"
        }
      });

      if (response.status === 429 && attempt < retries) {
        await sleep(1000 * attempt * attempt);
        continue;
      }

      if (!response.ok) {
        throw new Error(`GeckoTerminal request failed: ${response.status} ${url}`);
      }

      return response.json();
    } catch (error) {
      lastError = error;

      if (attempt < retries) {
        await sleep(750 * attempt);
      }
    }
  }

  throw lastError;
}

export async function getTrendingPools({ page = 1 } = {}) {
  const url = `${GECKO_TERMINAL_BASE}/networks/trending_pools?page=${page}`;
  return fetchJson(url);
}

export async function getTrendingPoolsPages({ pages = 1 } = {}) {
  const results = [];

  for (let page = 1; page <= pages; page++) {
    const response = await getTrendingPools({ page });
    results.push(...(response.data || []));

    // Public API rate safety
    await sleep(250);
  }

  return results;
}

export function normalizeGeckoPool(pool = {}) {
  const attr = pool.attributes || {};
  const relationships = pool.relationships || {};
  const parsed = parsePoolId(pool.id);

  const network =
    relationships.network?.data?.id ||
    parsed.network ||
    "unknown";

  const poolAddress =
    attr.address ||
    parsed.poolAddress ||
    pool.id ||
    null;

  const name = attr.name || "Unknown";
  const symbol = name.includes(" / ")
    ? name.split(" / ")[0]?.trim()
    : name;

  const buys24h = toNumber(attr.transactions?.h24?.buys);
  const sells24h = toNumber(attr.transactions?.h24?.sells);
  const totalTx24h = buys24h + sells24h;

  const buyPressure24h =
    totalTx24h > 0 ? Number((buys24h / totalTx24h).toFixed(4)) : 0;

  return {
    name,
    symbol: symbol || "UNKNOWN",
    chain: network,

    address: poolAddress,
    pairAddress: poolAddress,
    rawPoolId: pool.id || null,

    dex: attr.dex_id || "geckoterminal",
    url: network && poolAddress
      ? `https://www.geckoterminal.com/${network}/pools/${poolAddress}`
      : null,

    priceUsd: toNumber(attr.base_token_price_usd),
    quoteTokenPriceUsd: toNumber(attr.quote_token_price_usd),

    liquidityUsd: toNumber(attr.reserve_in_usd),
    fdvUsd: toNumber(attr.fdv_usd),
    marketCapUsd: toNumber(attr.market_cap_usd),

    volume24h: toNumber(attr.volume_usd?.h24),
    volume6h: toNumber(attr.volume_usd?.h6),
    volume1h: toNumber(attr.volume_usd?.h1),
    volume5m: toNumber(attr.volume_usd?.m5),

    priceChange24h: toNumber(attr.price_change_percentage?.h24),
    priceChange6h: toNumber(attr.price_change_percentage?.h6),
    priceChange1h: toNumber(attr.price_change_percentage?.h1),
    priceChange5m: toNumber(attr.price_change_percentage?.m5),

    buyTransactions24h: buys24h,
    sellTransactions24h: sells24h,
    totalTransactions24h: totalTx24h,
    buyPressure24h,

    pairCreatedAt: attr.pool_created_at || null,

    source: "geckoterminal",

    description: [
      name,
      attr.dex_id,
      network,
      `liquidity:${attr.reserve_in_usd || 0}`,
      `volume24h:${attr.volume_usd?.h24 || 0}`
    ]
      .filter(Boolean)
      .join(" ")
  };
}

export async function getGeckoTerminalCandidates(options = {}) {
  const { pages = 1, minLiquidityUsd = 0, minVolume24h = 0 } = options;

  const pools = await getTrendingPoolsPages({ pages });

  return pools
    .map(normalizeGeckoPool)
    .filter((pool) => pool.liquidityUsd >= minLiquidityUsd)
    .filter((pool) => pool.volume24h >= minVolume24h);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const candidates = await getGeckoTerminalCandidates({
    pages: 1,
    minLiquidityUsd: 1000,
    minVolume24h: 1000
  });

  console.log(JSON.stringify(candidates.slice(0, 25), null, 2));
}
