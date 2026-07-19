// src/data/birdeyeConnector.js

import "../config/loadEnv.js";

/**
 * Crypto Launch Intelligence
 * Birdeye Connector
 *
 * Purpose:
 * Adds Solana-focused market intelligence using Birdeye.
 *
 * Notes:
 * - Birdeye generally requires an API key.
 * - Add your key to .env as:
 *   BIRDEYE_API_KEY=your_key_here
 */

const BIRDEYE_BASE = "https://public-api.birdeye.so";
const BIRDEYE_MAX_TRENDING_LIMIT = 50;

function hasBirdeyeKey() {
  return Boolean(process.env.BIRDEYE_API_KEY);
}

function birdeyeLimit(value = 50) {
  const limit = Number(value || 50);
  if (!Number.isFinite(limit)) return 50;
  return Math.max(1, Math.min(BIRDEYE_MAX_TRENDING_LIMIT, Math.round(limit)));
}

function friendlyBirdeyeError(status = 0, body = "", url = "") {
  const detail = body ? ` ${String(body).slice(0, 180)}` : "";

  if (status === 400) {
    return `Birdeye request failed: 400 bad request. Trending limit must be 1-${BIRDEYE_MAX_TRENDING_LIMIT}.${detail}`;
  }
  if (status === 401) {
    return `Birdeye request failed: 401 unauthorized. Check BIRDEYE_API_KEY.${detail}`;
  }
  if (status === 403) {
    return `Birdeye request failed: 403 forbidden. The key may not have access to this endpoint or chain.${detail}`;
  }
  if (status === 429) {
    return `Birdeye request failed: 429 rate limited. Lower BIRDEYE_LIMIT or retry later.${detail}`;
  }

  return `Birdeye request failed: ${status} ${url}${detail}`;
}

async function fetchBirdeyeJson(url, options = {}) {
  if (!hasBirdeyeKey()) {
    throw new Error("Missing BIRDEYE_API_KEY");
  }

  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "X-API-KEY": process.env.BIRDEYE_API_KEY,
      "x-chain": options.chain || "solana"
    }
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(friendlyBirdeyeError(response.status, body, url));
  }

  return response.json();
}

export async function getBirdeyeTrendingTokens(options = {}) {
  const limit = birdeyeLimit(options.limit || process.env.BIRDEYE_LIMIT || 50);
  const chain = options.chain || process.env.BIRDEYE_CHAIN || "solana";

  return fetchBirdeyeJson(
    `${BIRDEYE_BASE}/defi/token_trending?sort_by=rank&sort_type=asc&interval=24h&offset=0&limit=${limit}`,
    { chain }
  );
}

export function normalizeBirdeyeToken(token = {}, meta = {}) {
  const chain = meta.chain || token.chain || process.env.BIRDEYE_CHAIN || "solana";

  return {
    name: token.name || "Unknown",
    symbol: token.symbol || "UNKNOWN",
    chain,
    address: token.address || token.tokenAddress || null,
    pairAddress: token.pairAddress || token.poolAddress || null,
    poolAddress: token.poolAddress || token.pairAddress || null,
    dex: "birdeye",
    url: token.address
      ? `https://birdeye.so/token/${token.address}?chain=${encodeURIComponent(chain)}`
      : null,

    priceUsd: Number(token.price || token.priceUsd || 0),
    liquidityUsd: Number(token.liquidity || token.liquidityUsd || 0),
    volume24h: Number(token.volume24hUSD || token.volume24h || 0),

    priceChange24h: Number(token.price24hChangePercent || token.priceChange24h || 0),

    marketCap: Number(token.mc || token.marketCap || 0),
    fdv: Number(token.fdv || 0),

    source: "birdeye",

    description: [
      token.name,
      token.symbol,
      `birdeye ${chain} trending`
    ]
      .filter(Boolean)
      .join(" ")
  };
}

export async function getBirdeyeCandidates(options = {}) {
  if (!hasBirdeyeKey()) {
    console.warn("Birdeye skipped: missing BIRDEYE_API_KEY");
    return [];
  }

  const response = await getBirdeyeTrendingTokens(options);
  const tokens = response?.data?.tokens || response?.data || [];

  const chain = options.chain || process.env.BIRDEYE_CHAIN || "solana";

  return tokens.map((token) => normalizeBirdeyeToken(token, { chain }));
}

export const __birdeyeTestHooks = {
  birdeyeLimit,
  friendlyBirdeyeError,
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const candidates = await getBirdeyeCandidates({ limit: 25 });
  console.log(JSON.stringify(candidates, null, 2));
}
