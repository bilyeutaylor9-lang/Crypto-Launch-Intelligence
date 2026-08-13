// src/data/dexScreenerConnector.js

import {
  normalizeChainId,
  normalizePoolAddress,
  normalizeTokenAddress,
} from "../identity/strictIdentityValidators.js";
import { normalizeProviderLinks } from "./providerLinkNormalizer.js";

/**
 * DEX Screener Connector
 *
 * Purpose:
 * Pulls live token and pair data from DEX Screener.
 */

const BASE_URL = "https://api.dexscreener.com";
const DEX_SCREENER_CHAIN_IDS = {
  "robinhood-chain": "robinhood",
};

export function resolveDexScreenerChainId(chainId = "") {
  const canonical = normalizeChainId(chainId);
  return DEX_SCREENER_CHAIN_IDS[canonical] || canonical || String(chainId || "").trim();
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, { signal: options.signal });

  if (!response.ok) {
    throw new Error(`DEX Screener request failed: ${response.status}`);
  }

  return response.json();
}

function nullableNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
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

export async function getTokenPairs(chainId, tokenAddress, options = {}) {
  const providerChainId = resolveDexScreenerChainId(chainId);
  return fetchJson(`${BASE_URL}/token-pairs/v1/${providerChainId}/${tokenAddress}`, options);
}

export async function getPairByAddress(chainId, pairAddress, options = {}) {
  const providerChainId = resolveDexScreenerChainId(chainId);
  return fetchJson(`${BASE_URL}/latest/dex/pairs/${providerChainId}/${pairAddress}`, options);
}

export async function searchDexPairs(query) {
  return fetchJson(`${BASE_URL}/latest/dex/search?q=${encodeURIComponent(query)}`);
}

export function normalizeDexPair(pair = {}) {
  const chain = normalizeChainId(pair.chainId);
  const tokenAddress = normalizeTokenAddress(pair.baseToken?.address, chain);
  const quoteTokenAddress = normalizeTokenAddress(pair.quoteToken?.address, chain);
  const poolAddress = normalizePoolAddress(pair.pairAddress, chain);
  const providerLinks = normalizeProviderLinks(pair, {
    source: "dexscreener",
    sourceUrl: pair.url,
  });

  return {
    name: pair.baseToken?.name || "Unknown",
    symbol: pair.baseToken?.symbol || "UNKNOWN",
    chain,
    declaredChain: pair.chainId || null,
    address: tokenAddress,
    tokenAddress,
    quoteTokenAddress,
    poolAddress,
    pairAddress: poolAddress,
    dex: pair.dexId || "unknown",
    url: pair.url || null,
    ...providerLinks,
    source: "dexscreener",
    evidenceSourceFamily: "dexscreener",
    boostActivity: pair.boosts || null,
    paidBoostEvidence: Boolean(pair.boosts),
    organicDemandEvidence: false,

    priceUsd: nullableNumber(pair.priceUsd),
    liquidityUsd: nullableNumber(pair.liquidity?.usd),
    marketCap: nullableNumber(pair.marketCap),
    circulatingMarketCapUsd: nullableNumber(pair.marketCap),
    fdv: nullableNumber(pair.fdv),
    fullyDilutedValuationUsd: nullableNumber(pair.fdv),

    volume24h: nullableNumber(pair.volume?.h24),
    volume24hUsd: nullableNumber(pair.volume?.h24),
    volume6h: nullableNumber(pair.volume?.h6),
    volume1h: nullableNumber(pair.volume?.h1),

    priceChange24h: nullableNumber(pair.priceChange?.h24),
    priceChange6h: nullableNumber(pair.priceChange?.h6),
    priceChange1h: nullableNumber(pair.priceChange?.h1),

    buyTransactions24h: nullableNumber(pair.txns?.h24?.buys),
    sellTransactions24h: nullableNumber(pair.txns?.h24?.sells),

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
