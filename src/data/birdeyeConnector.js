// src/data/birdeyeConnector.js

/**
 * Crypto Launch Intelligence
 * Birdeye Connector
 *
 * Purpose:
 * Adds Solana-focused market intelligence using Birdeye.
 *
 * Notes:
 * - Birdeye generally requires an API key.
 * - Add your key as:
 *   export BIRDEYE_API_KEY="your_key_here"
 */

const BIRDEYE_BASE = "https://public-api.birdeye.so";

function hasBirdeyeKey() {
  return Boolean(process.env.BIRDEYE_API_KEY);
}

async function fetchBirdeyeJson(url) {
  if (!hasBirdeyeKey()) {
    throw new Error("Missing BIRDEYE_API_KEY");
  }

  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "X-API-KEY": process.env.BIRDEYE_API_KEY,
      "x-chain": "solana"
    }
  });

  if (!response.ok) {
    throw new Error(`Birdeye request failed: ${response.status} ${url}`);
  }

  return response.json();
}

export async function getBirdeyeTrendingTokens(options = {}) {
  const limit = Number(options.limit || 50);

  return fetchBirdeyeJson(
    `${BIRDEYE_BASE}/defi/token_trending?sort_by=rank&sort_type=asc&offset=0&limit=${limit}`
  );
}

export function normalizeBirdeyeToken(token = {}) {
  return {
    name: token.name || "Unknown",
    symbol: token.symbol || "UNKNOWN",
    chain: "solana",
    address: token.address || token.tokenAddress || null,
    pairAddress: token.address || token.tokenAddress || null,
    dex: "birdeye",
    url: token.address
      ? `https://birdeye.so/token/${token.address}?chain=solana`
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
      "birdeye solana trending"
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

  return tokens.map(normalizeBirdeyeToken);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const candidates = await getBirdeyeCandidates({ limit: 25 });
  console.log(JSON.stringify(candidates, null, 2));
}
