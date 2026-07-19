// src/engines/masterIntelligenceBuilder.js

import { getTokenData } from "../data/dataOrchestrator.js";

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

function compactObject(value = {}) {
  return Object.fromEntries(
    Object.entries(value || {}).filter(([, v]) => v !== undefined && v !== null)
  );
}

function hasData(value = {}) {
  return value && typeof value === "object" && Object.keys(value).length > 0;
}

function buildHealth(data = {}) {
  return {
    marketReady: data.market?.status === "SUCCESS",
    socialReady: hasData(data.social),
    githubReady: hasData(data.github),
    onchainReady: hasData(data.onchain),
    newsReady: hasData(data.news),
    walletReady: hasData(data.wallets),
  };
}

function calculateCoverage(health = {}) {
  const values = Object.values(health);
  const ready = values.filter(Boolean).length;
  const total = values.length || 1;

  return {
    ready,
    total,
    percent: Math.round((ready / total) * 100),
  };
}

function statusFromCoverage(coverage = {}, market = {}) {
  if (market?.status !== "SUCCESS") return "LIMITED";
  if (coverage.percent >= 80) return "READY";
  if (coverage.percent >= 35) return "PARTIAL";
  return "MARKET_ONLY";
}

function extractMarketFields(token = {}, market = {}) {
  const source = market?.data || market?.token || market || {};

  return compactObject({
    id: token.id || source.id,
    name: token.name || source.name,
    symbol: token.symbol || source.symbol,
    chain: token.chain || source.chain,
    address: token.address || token.tokenAddress || source.address,
    pairAddress: token.pairAddress || source.pairAddress,
    dex: token.dex || source.dex,
    exchange: token.exchange || source.exchange,

    priceUsd: source.priceUsd ?? source.price,
    marketCap: source.marketCap ?? source.circulatingMarketCap ?? source.circulatingMarketCapUsd,
    fdv: source.fdv,
    liquidityUsd: source.liquidityUsd ?? source.liquidity,
    volume24h: source.volume24h ?? source.volume,
    priceChange24h: source.priceChange24h,
    txns24h: source.txns24h,
    holders: source.holders ?? source.holderCount,

    url: token.url || source.url,
  });
}

function buildQualityFlags({ market = {}, coverage = {} }) {
  const confidence = num(market?.confidence);

  return {
    lowMarketConfidence: confidence > 0 && confidence < 70,
    marketMissing: market?.status !== "SUCCESS",
    lowCoverage: coverage.percent < 35,
    marketOnly: coverage.ready <= 1,
  };
}

function buildWarnings(flags = {}) {
  const warnings = [];

  if (flags.marketMissing) warnings.push("Market data is unavailable or incomplete.");
  if (flags.lowMarketConfidence) warnings.push("Market data confidence is below preferred threshold.");
  if (flags.lowCoverage) warnings.push("Cross-source intelligence coverage is limited.");
  if (flags.marketOnly) warnings.push("Only market data is currently available.");

  return warnings;
}

export async function buildMasterIntelligence(token = {}, options = {}) {
  const startedAt = new Date();

  const market = await getTokenData(token, {
    limit: options.limit ?? 250,
    minConfidence: options.minConfidence ?? 70,
    forceRefresh: options.forceRefresh ?? false,
  });

  const social = options.social || token.social || {};
  const github = options.github || token.githubData || token.github || {};
  const onchain = options.onchain || token.onchain || {};
  const news = options.news || token.newsData || {};
  const wallets = options.wallets || token.wallets || {};

  const data = {
    market,
    social,
    github,
    onchain,
    news,
    wallets,
  };

  const health = buildHealth(data);
  const coverage = calculateCoverage(health);
  const status = statusFromCoverage(coverage, market);
  const normalizedMarket = extractMarketFields(token, market);

  const qualityFlags = buildQualityFlags({ market, coverage });
  const warnings = buildWarnings(qualityFlags);

  const engineInput = {
    ...token,
    ...normalizedMarket,

    masterIntelligence: {
      status,
      coverage,
      health,
      qualityFlags,
      warnings,
      market,
      social,
      github,
      onchain,
      news,
      wallets,
    },

    market,
    social,
    github,
    onchain,
    news,
    wallets,
  };

  return {
    token,
    version: "3.0",
    status,
    coverage,
    health,
    qualityFlags,
    warnings,
    data,
    normalizedMarket,
    engineInput,

    metadata: {
      generatedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt.getTime(),
      marketStatus: market?.status || "UNKNOWN",
      marketSource: market?.source || null,
      marketConfidence: clamp(market?.confidence),
      cacheHit: Boolean(market?.cacheHit),
    },
  };
}

export async function buildMasterIntelligenceBatch(tokens = [], options = {}) {
  const concurrency = Math.max(1, Number(options.concurrency || 5));
  const queue = [...tokens];
  const results = [];

  async function worker() {
    while (queue.length) {
      const token = queue.shift();

      try {
        const intelligence = await buildMasterIntelligence(token, options);
        results.push(intelligence.engineInput);
      } catch (error) {
        results.push({
          ...token,
          masterIntelligence: {
            status: "FAILED",
            error: error.message,
            generatedAt: new Date().toISOString(),
          },
          alerts: [
            ...(token.alerts || []),
            `Master intelligence failed: ${error.message}`,
          ],
        });
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));

  return results;
}

export default buildMasterIntelligence;
