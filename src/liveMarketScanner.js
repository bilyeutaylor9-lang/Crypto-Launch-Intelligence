// src/liveMarketScanner.js

import { runIntelligencePipeline, summarizePipelineResults } from "./intelligencePipeline.js";

const DEXSCREENER_BASE = "https://api.dexscreener.com";

async function fetchJson(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${url}`);
  }

  return response.json();
}

export async function fetchLatestTokenProfiles() {
  return fetchJson(`${DEXSCREENER_BASE}/token-profiles/latest/v1`);
}

export async function fetchBoostedTokens() {
  return fetchJson(`${DEXSCREENER_BASE}/token-boosts/latest/v1`);
}

export async function fetchTokenPairs(chainId, tokenAddress) {
  return fetchJson(`${DEXSCREENER_BASE}/token-pairs/v1/${chainId}/${tokenAddress}`);
}

export function normalizeDexScreenerPair(pair = {}) {
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
      pair.baseT// src/liveMarketScanner.js

import { runIntelligencePipeline, summarizePipelineResults } from "./intelligencePipeline.js";

const DEXSCREENER_BASE = "https://api.dexscreener.com";

async function fetchJson(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${url}`);
  }

  return response.json();
}

export async function fetchLatestTokenProfiles() {
  return fetchJson(`${DEXSCREENER_BASE}/token-profiles/latest/v1`);
}

export async function fetchBoostedTokens() {
  return fetchJson(`${DEXSCREENER_BASE}/token-boosts/latest/v1`);
}

export async function fetchTokenPairs(chainId, tokenAddress) {
  return fetchJson(`${DEXSCREENER_BASE}/token-pairs/v1/${chainId}/${tokenAddress}`);
}

export function normalizeDexScreenerPair(pair = {}) {
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
    ].filter(Boolean).join(" ")
  };
}

export async function scanLiveMarket(options = {}) {
  const maxTokens = options.maxTokens || 25;

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

  const results = runIntelligencePipeline(allPairs);
  const summary = summarizePipelineResults(results);

  return {
    scannedAt: new Date().toISOString(),
    source: "DEX Screener",
    summary,
    results
  };
}

const liveReport = await scanLiveMarket({ maxTokens: 25 });

console.log(JSON.stringify(liveReport, null, 2));oken?.symbol,
      pair.chainId,
      pair.dexId
    ].filter(Boolean).join(" ")
  };
}

export async function scanLiveMarket(options = {}) {
  const maxTokens = options.maxTokens || 25;

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

  const results = runIntelligencePipeline(allPairs);
  const summary = summarizePipelineResults(results);

  return {
    scannedAt: new Date().toISOString(),
    source: "DEX Screener",
    summary,
    results
  };
}

const liveReport = await scanLiveMarket({ maxTokens: 25 });

console.log(JSON.stringify(liveReport, null, 2));
