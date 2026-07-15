// src/data/freeMarketDataConnector.js

/**
 * Crypto Launch Intelligence
 * Free Market Data Connector Pack
 *
 * Purpose:
 * Adds free/no-key market-wide sources.
 */

import { runConcurrent, runWithTimeBudget } from "../discovery/discoveryExecutionGrid.js";

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    Number(options.timeoutMs || process.env.MARKET_PROVIDER_TIMEOUT_MS || 12_000)
  );

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { accept: "application/json" }
    });

    if (!response.ok) {
      const error = new Error(`Request failed: ${response.status} ${url}`);
      error.status = response.status;
      error.url = url;
      throw error;
    }

    return response.json();
  } finally {
    clearTimeout(timer);
  }
}

function n(value = 0) {
  return Number(value || 0);
}

function nullableNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeSymbol(symbol = "") {
  return String(symbol || "").replace("USDT", "").replace("USD", "").toUpperCase();
}

function splitQuotePair(symbol = "") {
  const normalized = String(symbol || "").toUpperCase();
  const quote = ["USDT", "USDC", "USD", "BUSD"].find((item) => normalized.endsWith(item)) || "";
  const base = quote ? normalized.slice(0, -quote.length) : normalized;

  return {
    baseSymbol: base,
    quoteSymbol: quote,
  };
}

function classifyProviderStatus(error = {}) {
  const status = Number(error.status || error.httpStatus || 0);
  const message = String(error.message || "").toLowerCase();

  if (error.code === "DISCOVERY_SOURCE_TIMEOUT" || message.includes("time budget")) {
    return "temporarily_unavailable";
  }
  if (status === 401 || message.includes("unauthorized") || message.includes("authentication")) {
    return "authentication_required";
  }
  if (status === 429 || message.includes("rate limit")) return "rate_limited";
  if (status === 403 || status === 451 || message.includes("region") || message.includes("blocked")) {
    return "region_blocked";
  }
  if (status >= 500 || message.includes("timeout") || message.includes("fetch failed")) {
    return "temporarily_unavailable";
  }
  return "degraded";
}

function providerEnvelope({
  source = "unknown",
  status = "healthy",
  startedAt = Date.now(),
  candidates = [],
  attempted = true,
  httpStatus = 200,
  errorCode = null,
  errorMessage = null,
} = {}) {
  return {
    source,
    status,
    attempted,
    candidates,
    candidateCount: candidates.length,
    durationMs: Date.now() - startedAt,
    attempts: attempted ? 1 : 0,
    httpStatus,
    errorCode,
    errorMessage,
  };
}

async function runProvider(source = "", fn, options = {}) {
  const startedAt = Date.now();

  try {
    const candidates = await runWithTimeBudget(fn, {
      label: source,
      timeoutMs: Number(options.timeoutMs || process.env.MARKET_PROVIDER_TIMEOUT_MS || 12_000),
    });
    return providerEnvelope({ source, startedAt, candidates });
  } catch (error) {
    const status = classifyProviderStatus(error);
    return providerEnvelope({
      source,
      status,
      startedAt,
      candidates: [],
      attempted: true,
      httpStatus: error.status || null,
      errorCode: status,
      errorMessage: error.message,
    });
  }
}

// CoinPaprika
export async function getCoinPaprikaCandidates(options = {}) {
  const limit = Number(options.limit || 100);
  const tickers = await fetchJson("https://api.coinpaprika.com/v1/tickers");

  return tickers.slice(0, limit).map(coin => ({
    name: coin.name || "Unknown",
    symbol: coin.symbol || "UNKNOWN",
    chain: "coinpaprika",
    address: null,
    pairAddress: coin.id || null,
    dex: "market",
    url: `https://coinpaprika.com/coin/${coin.id}/`,
    priceUsd: n(coin.quotes?.USD?.price),
    liquidityUsd: n(coin.quotes?.USD?.market_cap),
    volume24h: n(coin.quotes?.USD?.volume_24h),
    priceChange24h: n(coin.quotes?.USD?.percent_change_24h),
    marketCap: n(coin.quotes?.USD?.market_cap),
    source: "coinpaprika",
    description: `${coin.name || ""} ${coin.symbol || ""} coinpaprika market data`
  }));
}

// DeFiLlama Protocols
export async function getDefiLlamaProtocolCandidates(options = {}) {
  const limit = Number(options.limit || 100);
  const protocols = await fetchJson("https://api.llama.fi/protocols");

  return protocols
    .filter(p => n(p.tvl) > 0)
    .slice(0, limit)
    .map(protocol => ({
      name: protocol.name || "Unknown",
      symbol: protocol.symbol || protocol.name || "UNKNOWN",
      chain: protocol.chain || "defillama",
      address: null,
      pairAddress: protocol.slug || protocol.name || null,
      dex: "protocol",
      url: protocol.url || `https://defillama.com/protocol/${protocol.slug}`,
      priceUsd: 0,
      liquidityUsd: n(protocol.tvl),
      volume24h: n(protocol.volume24h || protocol.volume_24h || 0),
      priceChange24h: n(protocol.change_1d || 0),
      tvl: n(protocol.tvl),
      category: protocol.category || "DeFi",
      source: "defillama",
      description: `${protocol.name || ""} ${protocol.category || ""} DeFiLlama protocol TVL`
    }));
}

// DeFiLlama Chains
export async function getDefiLlamaChainCandidates(options = {}) {
  const limit = Number(options.limit || 50);
  const chains = await fetchJson("https://api.llama.fi/v2/chains");

  return chains.slice(0, limit).map(chain => ({
    name: chain.name || "Unknown Chain",
    symbol: chain.name || "CHAIN",
    chain: chain.name || "defillama-chain",
    address: null,
    pairAddress: `defillama-chain-${chain.name}`,
    dex: "chain-tvl",
    url: `https://defillama.com/chain/${encodeURIComponent(chain.name)}`,
    priceUsd: 0,
    liquidityUsd: n(chain.tvl),
    volume24h: 0,
    priceChange24h: n(chain.change_1d || 0),
    tvl: n(chain.tvl),
    source: "defillama-chain",
    description: `${chain.name || ""} DeFiLlama chain TVL`
  }));
}

// Binance / Binance.US Spot
export function getBinanceMarketConfig(options = {}) {
  const region = String(options.region || process.env.MARKET_REGION || "").toUpperCase();
  const market = String(options.market || process.env.BINANCE_MARKET || "").toUpperCase();
  const useUs = region === "US" || market === "US";

  return {
    source: useUs ? "binance-us" : "binance",
    exchange: useUs ? "Binance.US" : "Binance",
    baseUrl: useUs
      ? options.baseUrl || process.env.BINANCE_US_BASE_URL || "https://api.binance.us"
      : options.baseUrl || process.env.BINANCE_BASE_URL || "https://api.binance.com",
    tradeUrlBase: useUs ? "https://www.binance.us/trade" : "https://www.binance.com/en/trade",
    useUs,
  };
}

export async function getBinanceTickerCandidates(options = {}) {
  const limit = Number(options.limit || 100);
  const config = getBinanceMarketConfig(options);
  const tickers = await fetchJson(`${config.baseUrl}/api/v3/ticker/24hr`);

  return tickers
    .filter(t => /USD(T|C)?$/i.test(String(t.symbol || "")))
    .sort((a, b) => n(b.quoteVolume) - n(a.quoteVolume))
    .slice(0, limit)
    .map(ticker => {
      const { baseSymbol, quoteSymbol } = splitQuotePair(ticker.symbol);

      return {
        name: baseSymbol || normalizeSymbol(ticker.symbol),
        symbol: baseSymbol || normalizeSymbol(ticker.symbol),
        baseSymbol,
        quoteSymbol,
        chain: null,
        exchange: config.exchange,
        address: null,
        pairAddress: ticker.symbol,
        marketKey: `${config.source}:${ticker.symbol}`,
        assetKey: `symbol:${baseSymbol || normalizeSymbol(ticker.symbol)}`,
        dex: "cex",
        url: config.useUs
          ? `${config.tradeUrlBase}/${ticker.symbol}`
          : `${config.tradeUrlBase}/${baseSymbol}_${quoteSymbol || "USDT"}`,
        priceUsd: nullableNumber(ticker.lastPrice),
        liquidityUsd: null,
        volume24h: nullableNumber(ticker.quoteVolume),
        priceChange24h: nullableNumber(ticker.priceChangePercent),
        marketCap: null,
        fullyDilutedValue: null,
        fdv: null,
        source: config.source,
        description: `${ticker.symbol} ${config.exchange} 24h market data`
      };
    });
}

// KuCoin
export async function getKuCoinTickerCandidates(options = {}) {
  const limit = Number(options.limit || 100);
  const response = await fetchJson("https://api.kucoin.com/api/v1/market/allTickers");
  const tickers = response?.data?.ticker || [];

  return tickers
    .filter(t => String(t.symbol || "").endsWith("-USDT"))
    .sort((a, b) => n(b.volValue) - n(a.volValue))
    .slice(0, limit)
    .map(ticker => {
      const symbol = String(ticker.symbol).replace("-USDT", "");

      return {
        name: symbol,
        symbol,
        chain: "kucoin",
        address: null,
        pairAddress: ticker.symbol,
        dex: "cex",
        url: `https://www.kucoin.com/trade/${ticker.symbol}`,
        priceUsd: n(ticker.last),
        liquidityUsd: n(ticker.volValue),
        volume24h: n(ticker.volValue),
        priceChange24h: n(ticker.changeRate) * 100,
        source: "kucoin",
        description: `${ticker.symbol} KuCoin 24h market data`
      };
    });
}

// Coinbase
export async function getCoinbaseProductCandidates(options = {}) {
  const limit = Number(options.limit || 100);
  const products = await fetchJson("https://api.exchange.coinbase.com/products");

  return products
    .filter(p => String(p.id || "").endsWith("-USD") && !p.trading_disabled)
    .slice(0, limit)
    .map(product => {
      const symbol = String(product.base_currency || "").toUpperCase();

      return {
        name: symbol,
        symbol,
        chain: "coinbase",
        address: null,
        pairAddress: product.id,
        dex: "cex",
        url: `https://www.coinbase.com/price/${String(product.base_currency || "").toLowerCase()}`,
        priceUsd: 0,
        liquidityUsd: 0,
        volume24h: 0,
        priceChange24h: 0,
        source: "coinbase",
        description: `${product.id} Coinbase listed market`
      };
    });
}

// Kraken
export async function getKrakenTickerCandidates(options = {}) {
  const limit = Number(options.limit || 100);
  const pairsResponse = await fetchJson("https://api.kraken.com/0/public/AssetPairs");
  const pairs = Object.entries(pairsResponse?.result || {})
    .filter(([, pair]) => String(pair.wsname || "").endsWith("/USD"))
    .slice(0, limit);

  const pairKeys = pairs.map(([key]) => key).join(",");
  if (!pairKeys) return [];

  const tickerResponse = await fetchJson(`https://api.kraken.com/0/public/Ticker?pair=${pairKeys}`);

  return Object.entries(tickerResponse?.result || {}).map(([key, ticker]) => {
    const pair = pairs.find(([pairKey]) => pairKey === key)?.[1];
    const symbol = String(pair?.base || key).replace("X", "").replace("Z", "");

    return {
      name: symbol,
      symbol,
      chain: "kraken",
      address: null,
      pairAddress: key,
      dex: "cex",
      url: "https://www.kraken.com/prices",
      priceUsd: n(ticker.c?.[0]),
      liquidityUsd: n(ticker.v?.[1]) * n(ticker.c?.[0]),
      volume24h: n(ticker.v?.[1]) * n(ticker.c?.[0]),
      priceChange24h: 0,
      source: "kraken",
      description: `${symbol} Kraken 24h market data`
    };
  });
}

export async function getFreeMarketDataProviderBatch(options = {}) {
  const limit = Number(options.limit || 100);
  const providerConcurrency = Math.max(
    1,
    Math.min(8, Number(options.providerConcurrency || process.env.MARKET_PROVIDER_CONCURRENCY || 4))
  );

  const sourceCalls = [
    ["coinpaprika", () => getCoinPaprikaCandidates({ limit })],
    ["defillama", () => getDefiLlamaProtocolCandidates({ limit })],
    ["defillama-chain", () => getDefiLlamaChainCandidates({ limit: 50 })],
    ["binance", () => getBinanceTickerCandidates({ limit })],
    ["kucoin", () => getKuCoinTickerCandidates({ limit })],
    ["coinbase", () => getCoinbaseProductCandidates({ limit })],
    ["kraken", () => getKrakenTickerCandidates({ limit: 50 })]
  ];

  const providers = await runConcurrent(
    sourceCalls,
    async ([name, fn]) => {
      const result = await runProvider(name, fn, options);

      if (result.status !== "healthy") {
        console.warn(`${name} skipped: ${result.errorMessage || result.status}`);
      }

      return result;
    },
    { concurrency: providerConcurrency }
  );

  return {
    candidates: providers.flatMap((provider) => provider.candidates || []),
    providers: providers.map(({ candidates, ...provider }) => provider),
  };
}

export async function getFreeMarketDataProviderResults(options = {}) {
  const batch = await getFreeMarketDataProviderBatch(options);
  return batch.providers;
}

export async function getFreeMarketDataCandidates(options = {}) {
  const batch = await getFreeMarketDataProviderBatch(options);
  return batch.candidates;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const candidates = await getFreeMarketDataCandidates({ limit: 50 });
  console.log(JSON.stringify(candidates.slice(0, 50), null, 2));
}
