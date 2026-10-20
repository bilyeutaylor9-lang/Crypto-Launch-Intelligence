// src/data/geckoTerminalConnector.js

/**
 * Crypto Launch Intelligence
 * GeckoTerminal Connector v2
 *
 * Purpose:
 * Pulls live trending pool data from GeckoTerminal.
 * Adds retry handling, pagination, safer normalization, and better pool URLs.
 */

import { providerReceiptTimestamp, readProviderJson } from "./providerResponseReceipt.js";

const GECKO_TERMINAL_BASE = "https://api.geckoterminal.com/api/v2";
const GECKO_TERMINAL_NETWORK_IDS = {
  ethereum: "eth",
  base: "base",
  arbitrum: "arbitrum",
  bsc: "bsc",
  polygon: "polygon_pos",
  optimism: "optimism",
  avalanche: "avax",
  solana: "solana",
  "robinhood-chain": "robinhood",
};

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

function parseRelationshipTokenId(tokenId = "") {
  const [network, ...rest] = String(tokenId || "").split("_");
  const address = rest.join("_");
  return {
    network: network || null,
    address: address || tokenId || null,
  };
}

async function fetchJson(url, retries = 3, options = {}) {
  let lastError;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const requestedAt = options.requestedAt || providerReceiptTimestamp(options);
      const response = await (options.fetchImpl || fetch)(url, {
        headers: {
          accept: "application/json"
        },
        signal: options.signal,
      });
      try {
        return await readProviderJson(response, { provider: "geckoterminal", url, requestedAt }, options);
      } catch (error) {
        if (error?.responseReceiptCaptureFailure) throw error;
        if (error?.statusCode === 429 && attempt < retries) {
          await sleep(Math.max(error.retryAfterMs || 0, 1000 * attempt * attempt));
          continue;
        }
        throw error;
      }
    } catch (error) {
      lastError = error;

      if (error?.responseReceiptCaptureFailure) throw error;

      if (attempt < retries) {
        await sleep(750 * attempt);
      }
    }
  }

  throw lastError;
}

export function resolveGeckoTerminalNetworkId(chain = "") {
  return GECKO_TERMINAL_NETWORK_IDS[String(chain || "").trim().toLowerCase()] || null;
}

export async function getGeckoPoolByAddress(chain, poolAddress, options = {}) {
  const network = resolveGeckoTerminalNetworkId(chain);
  if (!network || !poolAddress) return null;
  const url = `${GECKO_TERMINAL_BASE}/networks/${encodeURIComponent(network)}/pools/${encodeURIComponent(poolAddress)}`;
  const maxAttempts = Math.max(1, Number(options.maxAttempts ?? 3));
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = options.signal ? null : new AbortController();
    const timeout = controller
      ? setTimeout(() => controller.abort(), Number(options.timeoutMs || 8_000))
      : null;
    const requestedAt = options.requestedAt || providerReceiptTimestamp(options);
    const response = await (options.fetchImpl || fetch)(url, {
      signal: options.signal || controller.signal,
      headers: { accept: "application/json" },
    }).finally(() => {
      if (timeout) clearTimeout(timeout);
    });
    try {
      return await readProviderJson(response, { provider: "geckoterminal", url, requestedAt }, options);
    } catch (error) {
      if (error?.responseReceiptCaptureFailure) throw error;
      if (error?.statusCode === 404) return null;
      if (error?.statusCode === 429 && attempt < maxAttempts) {
        await sleep(Math.max(error.retryAfterMs || 0, attempt * 1_000));
        continue;
      }
      throw error;
    }
  }
  return null;
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
  const baseToken = parseRelationshipTokenId(relationships.base_token?.data?.id);
  const quoteToken = parseRelationshipTokenId(relationships.quote_token?.data?.id);

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

    address: baseToken.address || null,
    tokenAddress: baseToken.address || null,
    quoteTokenAddress: quoteToken.address || null,
    poolAddress,
    pairAddress: poolAddress,
    rawPoolId: pool.id || null,
    geckoTerminalNetwork: network,
    geckoTerminalPoolId: pool.id || null,

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
    poolCreatedAt: attr.pool_created_at || null,
    endpoint: `${GECKO_TERMINAL_BASE}/networks/trending_pools`,

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
