// src/data/dexScreenerConnector.js

/**
 * DEX Screener Connector
 *
 * Purpose:
 * Pulls live token and pair data from DEX Screener.
 */

const BASE_URL = "https://api.dexscreener.com";

async function fetchJson(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`DEX Screener request failed: ${response.status}`);
  }

  return response.json();
}

export async function getLatestTokenProfiles() {
  return fetchJson(`${BASE_URL}/token-profiles/latest/v1`);
}

export async function getLatestBoostedTokens() {
  return fetchJson(`${BASE_URL}/token-boosts/latest/v1`);
}

export async function getTopBoostedTokens() {
  return fetchJson(`${BASE_URL}/token-boosts/top/v1`);
}

export async function getTokenPairs(chainId, tokenAddress) {
  return fetchJson(`${BASE_URL}/token-pairs/v1/${chainId}/${tokenAddress}`);
}

export async function searchDexPairs(query) {
  return fetchJson(`${BASE_URL}/latest/dex/search?q=${encodeURIComponent(query)}`);
}

export function normalizeDexPair(pair = {}) {
  return {
    name: pair.baseToken?.name || "Unknown",
    symbol: pair.baseToken?.symbol || "UNKNOWN",
    chain: pair.chainId || "unknown",
    address: pair.baseToken?.address || null,
    tokenAddress: pair.baseToken?.address || null,
    quoteTokenAddress: pair.quoteToken?.address || null,
    poolAddress: pair.pairAddress || null,
    pairAddress: pair.pairAddress || null,
    dex: pair.dexId || "unknown",
    url: pair.url || null,
    source: "dexscreener",
    evidenceSourceFamily: "dexscreener",
    boostActivity: pair.boosts || null,
    paidBoostEvidence: Boolean(pair.boosts),
    organicDemandEvidence: false,

    priceUsd: Number(pair.priceUsd || 0),
    liquidityUsd: Number(pair.liquidity?.usd || 0),

    volume24h: Number(pair.volume?.h24 || 0),
    volume6h: Number(pair.volume?.h6 || 0),
    volume1h: Number(pair.volume?.h1 || 0),

    priceChange24h: Number(pair.priceChange?.h24 || 0),
    priceChange6h: Number(pair.priceChange?.h6 || 0),
    priceChange1h: Number(pair.priceChange?.h1 || 0),

    buyTransactions24h: Number(pair.txns?.h24?.buys || 0),
    sellTransactions24h: Number(pair.txns?.h24?.sells || 0),

    pairCreatedAt: pair.pairCreatedAt
      ? new Date(pair.pairCreatedAt).toISOString()
      : null,

    description: [
      pair.baseToken?.name,
      pair.baseToken?.symbol,
      pair.chainId,
      pair.dexId
    ]
      .filter(Boolean)
      .join(" ")
  };
}

export async function getDexScreenerMarketCandidates(options = {}) {
  const maxTokens = options.maxTokens || 25;

  const latestProfiles = await getLatestTokenProfiles();
  const boostedTokens = await getLatestBoostedTokens();
  const topBoostedTokens = await getTopBoostedTokens();

  const candidates = [
    ...latestProfiles,
    ...boostedTokens,
    ...topBoostedTokens
  ]
    .filter(token => token.chainId && token.tokenAddress)
    .slice(0, maxTokens);

  const pairs = [];

  for (const token of candidates) {
    try {
      const tokenPairs = await getTokenPairs(token.chainId, token.tokenAddress);
      pairs.push(...tokenPairs.map(normalizeDexPair));
    } catch (error) {
      console.warn(`Skipped ${token.tokenAddress}: ${error.message}`);
    }
  }

  return pairs;
}
