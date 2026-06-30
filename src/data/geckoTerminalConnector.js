// src/data/geckoTerminalConnector.js

/**
 * Crypto Launch Intelligence
 * GeckoTerminal Connector
 *
 * Purpose:
 * Pulls live trending pool data from GeckoTerminal.
 * This expands discovery beyond DexScreener.
 */

const GECKO_TERMINAL_BASE = "https://api.geckoterminal.com/api/v2";

async function fetchJson(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`GeckoTerminal request failed: ${response.status} ${url}`);
  }

  return response.json();
}

export async function getTrendingPools() {
  return fetchJson(`${GECKO_TERMINAL_BASE}/networks/trending_pools`);
}

export function normalizeGeckoPool(pool = {}) {
  const attr = pool.attributes || {};

  return {
    name: attr.name || "Unknown",
    symbol: attr.name?.split(" / ")?.[0] || "UNKNOWN",
    chain: pool.relationships?.network?.data?.id || "unknown",
    address: pool.id || null,
    pairAddress: pool.id || null,
    dex: attr.dex_id || "geckoterminal",
    url: attr.gt_score ? `https://www.geckoterminal.com/` : null,

    priceUsd: Number(attr.base_token_price_usd || 0),
    liquidityUsd: Number(attr.reserve_in_usd || 0),
    volume24h: Number(attr.volume_usd?.h24 || 0),
    volume6h: Number(attr.volume_usd?.h6 || 0),
    volume1h: Number(attr.volume_usd?.h1 || 0),

    priceChange24h: Number(attr.price_change_percentage?.h24 || 0),
    priceChange6h: Number(attr.price_change_percentage?.h6 || 0),
    priceChange1h: Number(attr.price_change_percentage?.h1 || 0),

    buyTransactions24h: Number(attr.transactions?.h24?.buys || 0),
    sellTransactions24h: Number(attr.transactions?.h24?.sells || 0),

    pairCreatedAt: attr.pool_created_at || null,

    source: "geckoterminal",

    description: [
      attr.name,
      attr.dex_id,
      pool.relationships?.network?.data?.id
    ]
      .filter(Boolean)
      .join(" ")
  };
}

export async function getGeckoTerminalCandidates() {
  const response = await getTrendingPools();
  const pools = response.data || [];

  return pools.map(normalizeGeckoPool);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const candidates = await getGeckoTerminalCandidates();
  console.log(JSON.stringify(candidates.slice(0, 25), null, 2));
}
