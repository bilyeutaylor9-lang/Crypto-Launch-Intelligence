// src/liveMarketScanner.js

import "./config/loadEnv.js";
import {
  runIntelligencePipeline,
  summarizePipelineResults
} from "./intelligencePipeline.js";
import { resolveLocalAIOptions } from "./brain/localAIOptions.js";

import { filterDiscoveryCandidates } from "./engines/discoveryFilterEngine.js";
import { runConcurrent } from "./discovery/discoveryExecutionGrid.js";
import { normalizeDexPair } from "./data/dexScreenerConnector.js";

const DEXSCREENER_BASE = "https://api.dexscreener.com";

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timeoutMs = Number(options.timeoutMs || process.env.DEXSCREENER_TIMEOUT_MS || 12_000);
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { signal: controller.signal });

    if (!response.ok) {
      throw new Error(`Request failed: ${response.status} ${url}`);
    }

    return response.json();
  } finally {
    clearTimeout(timer);
  }
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

export async function scanLiveMarket(options = {}) {
  const maxTokens = Number(options.maxTokens || 50);
  const pairConcurrency = Math.max(
    1,
    Math.min(16, Number(options.pairConcurrency || process.env.DEXSCREENER_PAIR_CONCURRENCY || 6))
  );
  const runIntelligence = options.runIntelligence ?? true;

  const profiles = await fetchLatestTokenProfiles();
  const boosted = await fetchBoostedTokens();

  const candidates = [...profiles, ...boosted]
    .filter(token => token.chainId && token.tokenAddress)
    .slice(0, maxTokens);

  const pairBatches = await runConcurrent(
    candidates,
    async (token) => {
      try {
        const pairs = await fetchTokenPairs(token.chainId, token.tokenAddress);
        return pairs.map(normalizeDexPair);
      } catch (error) {
        console.warn(`Skipped ${token.tokenAddress}: ${error.message}`);
        return [];
      }
    },
    { concurrency: pairConcurrency }
  );
  const allPairs = pairBatches.flat();

  const discovery = filterDiscoveryCandidates(allPairs, {
    minLiquidityUsd: Number(process.env.MIN_LIQUIDITY_USD || 10000),
    minVolume24h: Number(process.env.MIN_VOLUME_24H || 1000),
    minBuyTransactions24h: Number(process.env.MIN_BUYS_24H || 5),
    maxSellPressureRatio: Number(process.env.MAX_SELL_PRESSURE || 0.85)
  });

  const results = runIntelligence
    ? await runIntelligencePipeline(discovery.accepted, {
        localAI: options.localAI ?? resolveLocalAIOptions(),
      })
    : discovery.accepted;
  const summary = runIntelligence
    ? summarizePipelineResults(results)
    : {
        mode: "discovery-only",
        totalProjects: results.length,
      };

  return {
    scannedAt: new Date().toISOString(),
    source: "DEX Screener",
    discoveredTokens: allPairs.length,
    scannedTokens: discovery.acceptedCount,
    rejectedTokens: discovery.rejectedCount,
    filters: discovery.filters,
    summary,
    runIntelligence,
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
