// src/data/freeMarketDataConnector.js

/**
 * Crypto Launch Intelligence
 * Free Market Data Connector Pack
 *
 * Purpose:
 * Adds free/no-key market-wide sources.
 */

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { accept: "application/json" }
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${url}`);
  }

  return response.json();
}

function n(value = 0) {
  return Number(value || 0);
}

function normalizeSymbol(symbol = "") {
  return String(symbol || "").replace("USDT", "").replace("USD", "").toUpperCase();
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

// Binance Spot
export async function getBinanceTickerCandidates(options = {}) {
  const limit = Number(options.limit || 100);
  const tickers = await fetchJson("https://api.binance.com/api/v3/ticker/24hr");

  return tickers
    .filter(t => String(t.symbol || "").endsWith("USDT"))
    .sort((a, b) => n(b.quoteVolume) - n(a.quoteVolume))
    .slice(0, limit)
    .map(ticker => ({
      name: normalizeSymbol(ticker.symbol),
      symbol: normalizeSymbol(ticker.symbol),
      chain: "binance",
      address: null,
      pairAddress: ticker.symbol,
      dex: "cex",
      url: `https://www.binance.com/en/trade/${normalizeSymbol(ticker.symbol)}_USDT`,
      priceUsd: n(ticker.lastPrice),
      liquidityUsd: n(ticker.quoteVolume),
      volume24h: n(ticker.quoteVolume),
      priceChange24h: n(ticker.priceChangePercent),
      source: "binance",
      description: `${ticker.symbol} Binance 24h market data`
    }));
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

export async function getFreeMarketDataCandidates(options = {}) {
  const limit = Number(options.limit || 100);

  const sourceCalls = [
    ["coinpaprika", () => getCoinPaprikaCandidates({ limit })],
    ["defillama", () => getDefiLlamaProtocolCandidates({ limit })],
    ["defillama-chain", () => getDefiLlamaChainCandidates({ limit: 50 })],
    ["binance", () => getBinanceTickerCandidates({ limit })],
    ["kucoin", () => getKuCoinTickerCandidates({ limit })],
    ["coinbase", () => getCoinbaseProductCandidates({ limit })],
    ["kraken", () => getKrakenTickerCandidates({ limit: 50 })]
  ];

  const all = [];

  for (const [name, fn] of sourceCalls) {
    try {
      const results = await fn();
      all.push(...results);
    } catch (error) {
      console.warn(`${name} skipped: ${error.message}`);
    }
  }

  return all;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const candidates = await getFreeMarketDataCandidates({ limit: 50 });
  console.log(JSON.stringify(candidates.slice(0, 50), null, 2));
}
