// src/data/dexScreenerConnector.js

import {
  normalizeChainId,
  normalizePoolAddress,
  normalizeTokenAddress,
} from "../identity/strictIdentityValidators.js";
import { normalizeProviderLinks } from "./providerLinkNormalizer.js";
import { providerReceiptTimestamp, readProviderJson } from "./providerResponseReceipt.js";

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
  const requestedAt = options.requestedAt || providerReceiptTimestamp(options);
  const response = await (options.fetchImpl || fetch)(url, {
    signal: options.signal, ...(options.redirect ? { redirect: options.redirect } : {}),
  });
  return readProviderJson(response, { provider: "dexscreener", url, requestedAt }, options);
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

export function normalizeDexBatchAddress(value, chainId) {
  const chain = normalizeChainId(chainId);
  const address = chain && typeof value === "string" ? normalizeTokenAddress(value, chain) : null;
  if (!address || /^0x0{40}$/.test(address)) return null;
  if (chain === "solana") {
    // Solana public keys must decode to 32 bytes, not merely look like base58.
    const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    let decoded = 0n;
    for (const char of address) decoded = decoded * 58n + BigInt(alphabet.indexOf(char));
    const bytes = decoded === 0n ? 0 : Math.ceil(decoded.toString(16).length / 2);
    if (address.match(/^1*/)[0].length + bytes !== 32) return null;
  }
  return address;
}

// Documented batch bound: https://docs.dexscreener.com/api/reference#get-tokens-v1-chainid-tokenaddresses
export async function getTokenPairsBatch(chainId, tokenAddresses, options = {}) {
  const chain = normalizeChainId(chainId);
  if (!chain || !Array.isArray(tokenAddresses) || !tokenAddresses.length || tokenAddresses.length > 30) {
    throw new TypeError("DEX token batches require a known chain and 1-30 token addresses.");
  }
  const addresses = tokenAddresses.map((value) => normalizeDexBatchAddress(value, chain));
  if (addresses.some((value) => !value)) {
    throw new TypeError("DEX token batches require valid exact token addresses.");
  }
  const providerChainId = resolveDexScreenerChainId(chain);
  return fetchJson(`${BASE_URL}/tokens/v1/${providerChainId}/${[...new Set(addresses)].map(encodeURIComponent).join(",")}`,
    { ...options, redirect: "error" });
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
