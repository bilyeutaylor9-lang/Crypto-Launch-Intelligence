// src/liveMarketScanner.js

import {
  runIntelligencePipeline,
  summarizePipelineResults
} from "./intelligencePipeline.js";

import { filterDiscoveryCandidates } from "./engines/discoveryFilterEngine.js";

const DEXSCREENER_BASE = "https://api.dexscreener.com";

async function fetchJson(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${url}`);
  }

  return response.json();
}

async function fetchLatestTokenProfiles() {
  return fetchJson(`${DEXSCREENER_BASE}/token-profiles/latest/v1`);
}

async function fetchBoostedTokens() {
  return fetchJson(`${DEXSCREENER_BASE}/token-boosts/latest/v1`);
}

async function fetchTokenPairs(chainId, tokenAddress) {
  return fetchJson(
    `${DEXSCREENER_BASE}/token-pairs/v1/${chainId}/${tokenAddress}`
  );
}

function normalizeDexScreenerPair(pair = {}) {
  return {
    name: pair.baseToken?.name || "Unknown",
    symbol: pair.baseToken?.symbol || "UNKNOWN",
    chain: pair.chainId || "unknown",
    address: pair.baseToken?.address || null,
    pairAddress: pair.pairAddress || null,
    dex: pair.dexId || "unknown",
    url: pair.url || null,

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

export async function scanLiveMarket(options = {}) {
  const maxTokens = Number(options.maxTokens || 50);

  const profiles = await fetchLatestTokenProfiles();
  const boosted = await fetchBoostedTokens();

  const candidates = [...profiles, ...boosted]
    .filter(token => token.chainId && token.tokenAddress)
    .slice(0, maxTokens);

  const allPairs = [];

  for (const token of candidates) {
    try {
      const pairs = await fetchTokenPairs(token.chainId, token.tokenAddress);
      allPairs.push(...pairs.map(normalizeDexScreenerPair));
    } catch (error) {
      console.warn(`Skipped ${token.tokenAddress}: ${error.message}`);
    }
  }

  const discovery = filterDiscoveryCandidates(allPairs, {
    minLiquidityUsd: Number(process.env.MIN_LIQUIDITY_USD || 10000),
    minVolume24h: Number(process.env.MIN_VOLUME_24H || 1000),
    minBuyTransactions24h: Number(process.env.MIN_BUYS_24H || 5),
    maxSellPressureRatio: Number(process.env.MAX_SELL_PRESSURE || 0.85)
  });

  const results = await runIntelligencePipeline(discovery.accepted);
  const summary = summarizePipelineResults(results);

  return {
    scannedAt: new Date().toISOString(),
    source: "DEX Screener",
    discoveredTokens: allPairs.length,
    scannedTokens: discovery.acceptedCount,
    rejectedTokens: discovery.rejectedCount,
    filters: discovery.filters,
    summary,
    results,
    rejected: discovery.rejected.slice(0, 25)
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const report = await scanLiveMarket({
    maxTokens: Number(process.env.MAX_TOKENS || 50)
  });

  console.log(JSON.stringify(report, null, 2));
}
