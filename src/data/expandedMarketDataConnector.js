// src/data/expandedMarketDataConnector.js

const HOT_SEARCH_TERMS = [
  "ai",
  "agent",
  "rwa",
  "depin",
  "stablecoin",
  "prediction",
  "zk",
  "privacy",
  "perp",
  "modular",
  "restaking",
  "launchpad",
  "base",
  "solana",
];

function n(value = 0) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function sleep(ms = 200) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeSymbol(symbol = "") {
  return String(symbol || "")
    .replace(/^X/, "")
    .replace(/^Z/, "")
    .replace(/USDT$/i, "")
    .replace(/USD$/i, "")
    .replace(/-USD$/i, "")
    .replace("-USDT", "")
    .toUpperCase();
}

function fromPair(pair = "") {
  return normalizeSymbol(
    String(pair || "")
      .split("_")[0]
      .split("-")[0]
      .split("/")[0]
      .replace("USDT", "")
      .replace("USD", "")
  );
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number(options.timeoutMs || 12000));

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        accept: "application/json",
        "user-agent": "Crypto-Launch-Intelligence/0.5",
      },
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

function candidate(base = {}) {
  return {
    name: base.name || "Unknown",
    symbol: normalizeSymbol(base.symbol || base.name || "UNKNOWN"),
    chain: String(base.chain || base.source || "market").toLowerCase(),
    address: base.address || null,
    pairAddress: base.pairAddress || base.id || null,
    dex: base.dex || "market",
    url: base.url || null,
    priceUsd: n(base.priceUsd),
    liquidityUsd: n(base.liquidityUsd ?? base.marketCap ?? base.tvl),
    volume24h: n(base.volume24h),
    priceChange24h: n(base.priceChange24h),
    marketCap: n(base.marketCap),
    fdv: n(base.fdv ?? base.marketCap),
    tvl: n(base.tvl),
    category: base.category || "",
    source: base.source || "expanded-market",
    description: [base.description, base.name, base.symbol, base.category, base.source]
      .filter(Boolean)
      .join(" "),
  };
}

export async function getCoinCapCandidates(options = {}) {
  const limit = Number(options.limit || 100);
  const response = await fetchJson(`https://api.coincap.io/v2/assets?limit=${limit}`);

  return (response.data || []).map((asset) =>
    candidate({
      name: asset.name,
      symbol: asset.symbol,
      chain: "coincap",
      id: asset.id,
      url: `https://coincap.io/assets/${asset.id}`,
      priceUsd: asset.priceUsd,
      liquidityUsd: asset.marketCapUsd,
      volume24h: asset.volumeUsd24Hr,
      priceChange24h: asset.changePercent24Hr,
      marketCap: asset.marketCapUsd,
      source: "coincap",
      description: `${asset.name || ""} ${asset.symbol || ""} CoinCap market data`,
    })
  );
}

export async function getCoinLoreCandidates(options = {}) {
  const limit = Number(options.limit || 100);
  const pageSize = Math.min(100, Number(options.pageSize || process.env.COINLORE_PAGE_SIZE || 100));
  const maxPages = Number(
    options.maxPages ||
      process.env.COINLORE_MAX_PAGES ||
      Math.ceil(limit / pageSize)
  );
  const all = [];

  for (let page = 0; page < maxPages && all.length < limit; page++) {
    const start = page * pageSize;
    const response = await fetchJson(
      `https://api.coinlore.net/api/tickers/?start=${start}&limit=${pageSize}`
    );
    const data = response.data || [];

    if (!data.length) break;

    all.push(...data);
    await sleep(Number(options.delayMs || process.env.COINLORE_DELAY_MS || 150));
  }

  return all.slice(0, limit).map((asset) =>
    candidate({
      name: asset.name,
      symbol: asset.symbol,
      chain: "coinlore",
      id: asset.id,
      url: `https://www.coinlore.com/coin/${asset.nameid || asset.id}`,
      priceUsd: asset.price_usd,
      liquidityUsd: asset.market_cap_usd,
      volume24h: asset.volume24,
      priceChange24h: asset.percent_change_24h,
      marketCap: asset.market_cap_usd,
      source: "coinlore",
      description: `${asset.name || ""} ${asset.symbol || ""} CoinLore market data`,
    })
  );
}

export async function getCryptoCompareCandidates(options = {}) {
  const limit = Number(options.limit || 100);
  const apiKey = process.env.CRYPTOCOMPARE_API_KEY || "";
  const allowNoKey = process.env.CRYPTOCOMPARE_ALLOW_NO_KEY === "true";

  if (!apiKey && !allowNoKey) {
    return [];
  }

  const params = new URLSearchParams({
    limit: String(limit),
    tsym: "USD",
  });

  if (apiKey) params.set("api_key", apiKey);

  const response = await fetchJson(`https://min-api.cryptocompare.com/data/top/mktcapfull?${params}`);

  return (response.Data || []).map((row) => {
    const coin = row.CoinInfo || {};
    const raw = row.RAW?.USD || {};

    return candidate({
      name: coin.FullName || coin.Name,
      symbol: coin.Name,
      chain: "cryptocompare",
      id: coin.Id || coin.Name,
      url: coin.Url ? `https://www.cryptocompare.com${coin.Url}` : null,
      priceUsd: raw.PRICE,
      liquidityUsd: raw.MKTCAP,
      volume24h: raw.TOTALVOLUME24HTO,
      priceChange24h: raw.CHANGEPCT24HOUR,
      marketCap: raw.MKTCAP,
      source: "cryptocompare",
      description: `${coin.FullName || ""} ${coin.Name || ""} CryptoCompare market data`,
    });
  });
}

export async function getDefiLlamaYieldCandidates(options = {}) {
  const limit = Number(options.limit || 100);
  const response = await fetchJson("https://yields.llama.fi/pools");

  return (response.data || [])
    .filter((pool) => n(pool.tvlUsd) > 0)
    .sort((a, b) => n(b.tvlUsd) - n(a.tvlUsd))
    .slice(0, limit)
    .map((pool) =>
      candidate({
        name: pool.project || pool.symbol,
        symbol: pool.symbol || pool.project,
        chain: pool.chain || "defillama-yields",
        id: pool.pool,
        dex: "yield-pool",
        url: pool.url || "https://defillama.com/yields",
        priceUsd: 0,
        liquidityUsd: pool.tvlUsd,
        volume24h: 0,
        priceChange24h: pool.apyPct1D,
        tvl: pool.tvlUsd,
        category: "yield staking defi",
        source: "defillama-yields",
        description: `${pool.project || ""} ${pool.symbol || ""} ${pool.chain || ""} APY ${pool.apy || 0} TVL ${pool.tvlUsd || 0} staking yield DeFiLlama`,
      })
    );
}

export async function getDefiLlamaStablecoinCandidates(options = {}) {
  const limit = Number(options.limit || 100);
  const response = await fetchJson("https://stablecoins.llama.fi/stablecoins?includePrices=true");

  return (response.peggedAssets || [])
    .slice(0, limit)
    .map((asset) =>
      candidate({
        name: asset.name,
        symbol: asset.symbol,
        chain: "stablecoins",
        id: asset.id,
        url: "https://defillama.com/stablecoins",
        priceUsd: asset.price,
        liquidityUsd: asset.circulating?.peggedUSD,
        volume24h: 0,
        marketCap: asset.circulating?.peggedUSD,
        category: "stablecoin payments settlement",
        source: "defillama-stablecoins",
        description: `${asset.name || ""} ${asset.symbol || ""} stablecoin payments settlement DeFiLlama`,
      })
    );
}

export async function getDexScreenerSearchCandidates(options = {}) {
  const limit = Number(options.limit || 120);
  const terms = options.terms || HOT_SEARCH_TERMS;
  const perTerm = Math.max(5, Math.ceil(limit / terms.length));
  const maxFailures = Number(options.maxFailures || process.env.DEXSCREENER_SEARCH_MAX_FAILURES || 3);
  const all = [];
  let failures = 0;

  for (const term of terms) {
    if (failures >= maxFailures) {
      console.warn(`dexscreener-search paused after ${failures} failed term requests.`);
      break;
    }

    try {
      const response = await fetchJson(
        `https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(term)}`
      );
      all.push(
        ...(response.pairs || []).slice(0, perTerm).map((pair) =>
          candidate({
            name: pair.baseToken?.name,
            symbol: pair.baseToken?.symbol,
            chain: pair.chainId,
            address: pair.baseToken?.address,
            pairAddress: pair.pairAddress,
            dex: pair.dexId,
            url: pair.url,
            priceUsd: pair.priceUsd,
            liquidityUsd: pair.liquidity?.usd,
            volume24h: pair.volume?.h24,
            priceChange24h: pair.priceChange?.h24,
            marketCap: pair.marketCap,
            fdv: pair.fdv,
            category: term,
            source: "dexscreener-search",
            description: `${pair.baseToken?.name || ""} ${pair.baseToken?.symbol || ""} ${term} DexScreener search`,
          })
        )
      );
    } catch (error) {
      failures += 1;
      if (failures === 1) {
        console.warn(`dexscreener-search unavailable: ${error.message}`);
      }
    }
  }

  return all.slice(0, limit);
}

export async function getOkxTickerCandidates(options = {}) {
  const limit = Number(options.limit || 100);
  const response = await fetchJson("https://www.okx.com/api/v5/market/tickers?instType=SPOT");

  return (response.data || [])
    .filter((ticker) => String(ticker.instId || "").endsWith("-USDT"))
    .sort((a, b) => n(b.volCcy24h) - n(a.volCcy24h))
    .slice(0, limit)
    .map((ticker) =>
      candidate({
        name: fromPair(ticker.instId),
        symbol: fromPair(ticker.instId),
        chain: "okx",
        id: ticker.instId,
        dex: "cex",
        url: `https://www.okx.com/trade-spot/${String(ticker.instId || "").toLowerCase()}`,
        priceUsd: ticker.last,
        liquidityUsd: ticker.volCcy24h,
        volume24h: ticker.volCcy24h,
        priceChange24h: 0,
        source: "okx",
        description: `${ticker.instId || ""} OKX 24h spot market data`,
      })
    );
}

export async function getBybitTickerCandidates(options = {}) {
  const limit = Number(options.limit || 100);
  const response = await fetchJson("https://api.bybit.com/v5/market/tickers?category=spot");

  return (response.result?.list || [])
    .filter((ticker) => String(ticker.symbol || "").endsWith("USDT"))
    .sort((a, b) => n(b.turnover24h) - n(a.turnover24h))
    .slice(0, limit)
    .map((ticker) =>
      candidate({
        name: fromPair(ticker.symbol),
        symbol: fromPair(ticker.symbol),
        chain: "bybit",
        id: ticker.symbol,
        dex: "cex",
        url: `https://www.bybit.com/trade/spot/${ticker.symbol}`,
        priceUsd: ticker.lastPrice,
        liquidityUsd: ticker.turnover24h,
        volume24h: ticker.turnover24h,
        priceChange24h: n(ticker.price24hPcnt) * 100,
        source: "bybit",
        description: `${ticker.symbol || ""} Bybit 24h spot market data`,
      })
    );
}

export async function getGateTickerCandidates(options = {}) {
  const limit = Number(options.limit || 100);
  const tickers = await fetchJson("https://api.gateio.ws/api/v4/spot/tickers");

  return (tickers || [])
    .filter((ticker) => String(ticker.currency_pair || "").endsWith("_USDT"))
    .sort((a, b) => n(b.quote_volume) - n(a.quote_volume))
    .slice(0, limit)
    .map((ticker) =>
      candidate({
        name: fromPair(ticker.currency_pair),
        symbol: fromPair(ticker.currency_pair),
        chain: "gate",
        id: ticker.currency_pair,
        dex: "cex",
        url: `https://www.gate.io/trade/${ticker.currency_pair}`,
        priceUsd: ticker.last,
        liquidityUsd: ticker.quote_volume,
        volume24h: ticker.quote_volume,
        priceChange24h: ticker.change_percentage,
        source: "gate",
        description: `${ticker.currency_pair || ""} Gate.io 24h spot market data`,
      })
    );
}

export async function getMexcTickerCandidates(options = {}) {
  const limit = Number(options.limit || 100);
  const tickers = await fetchJson("https://api.mexc.com/api/v3/ticker/24hr");

  return (tickers || [])
    .filter((ticker) => String(ticker.symbol || "").endsWith("USDT"))
    .sort((a, b) => n(b.quoteVolume) - n(a.quoteVolume))
    .slice(0, limit)
    .map((ticker) =>
      candidate({
        name: fromPair(ticker.symbol),
        symbol: fromPair(ticker.symbol),
        chain: "mexc",
        id: ticker.symbol,
        dex: "cex",
        url: `https://www.mexc.com/exchange/${ticker.symbol}`,
        priceUsd: ticker.lastPrice,
        liquidityUsd: ticker.quoteVolume,
        volume24h: ticker.quoteVolume,
        priceChange24h: ticker.priceChangePercent,
        source: "mexc",
        description: `${ticker.symbol || ""} MEXC 24h spot market data`,
      })
    );
}

export async function getBitgetTickerCandidates(options = {}) {
  const limit = Number(options.limit || 100);
  const response = await fetchJson("https://api.bitget.com/api/v2/spot/market/tickers");

  return (response.data || [])
    .filter((ticker) => String(ticker.symbol || "").endsWith("USDT"))
    .sort((a, b) => n(b.usdtVolume) - n(a.usdtVolume))
    .slice(0, limit)
    .map((ticker) =>
      candidate({
        name: fromPair(ticker.symbol),
        symbol: fromPair(ticker.symbol),
        chain: "bitget",
        id: ticker.symbol,
        dex: "cex",
        url: `https://www.bitget.com/spot/${ticker.symbol}`,
        priceUsd: ticker.close,
        liquidityUsd: ticker.usdtVolume,
        volume24h: ticker.usdtVolume,
        priceChange24h: n(ticker.changeUtc24h) * 100,
        source: "bitget",
        description: `${ticker.symbol || ""} Bitget 24h spot market data`,
      })
    );
}

export async function getHtxTickerCandidates(options = {}) {
  const limit = Number(options.limit || 100);
  const response = await fetchJson("https://api.huobi.pro/market/tickers");

  return (response.data || [])
    .filter((ticker) => String(ticker.symbol || "").endsWith("usdt"))
    .sort((a, b) => n(b.vol) - n(a.vol))
    .slice(0, limit)
    .map((ticker) =>
      candidate({
        name: fromPair(ticker.symbol.toUpperCase()),
        symbol: fromPair(ticker.symbol.toUpperCase()),
        chain: "htx",
        id: ticker.symbol,
        dex: "cex",
        url: `https://www.htx.com/trade/${ticker.symbol}`,
        priceUsd: ticker.close,
        liquidityUsd: ticker.vol,
        volume24h: ticker.vol,
        priceChange24h: 0,
        source: "htx",
        description: `${ticker.symbol || ""} HTX 24h spot market data`,
      })
    );
}

export async function getBitfinexTickerCandidates(options = {}) {
  const limit = Number(options.limit || 100);
  const tickers = await fetchJson("https://api-pub.bitfinex.com/v2/tickers?symbols=ALL");

  return (tickers || [])
    .filter((ticker) => String(ticker[0] || "").startsWith("t") && String(ticker[0] || "").endsWith("USD"))
    .sort((a, b) => n(b[8]) - n(a[8]))
    .slice(0, limit)
    .map((ticker) => {
      const pair = String(ticker[0] || "").replace(/^t/, "");
      return candidate({
        name: fromPair(pair),
        symbol: fromPair(pair),
        chain: "bitfinex",
        id: pair,
        dex: "cex",
        url: "https://trading.bitfinex.com",
        priceUsd: ticker[7],
        liquidityUsd: n(ticker[8]) * n(ticker[7]),
        volume24h: n(ticker[8]) * n(ticker[7]),
        priceChange24h: n(ticker[6]) * 100,
        source: "bitfinex",
        description: `${pair} Bitfinex 24h spot market data`,
      });
    });
}

export async function getBitstampTickerCandidates(options = {}) {
  const limit = Number(options.limit || 100);
  const tickers = await fetchJson("https://www.bitstamp.net/api/v2/ticker/");

  return (tickers || [])
    .filter((ticker) => String(ticker.pair || "").endsWith("/USD"))
    .sort((a, b) => n(b.volume) * n(b.last) - n(a.volume) * n(a.last))
    .slice(0, limit)
    .map((ticker) =>
      candidate({
        name: fromPair(ticker.pair),
        symbol: fromPair(ticker.pair),
        chain: "bitstamp",
        id: ticker.pair,
        dex: "cex",
        url: "https://www.bitstamp.net/markets/",
        priceUsd: ticker.last,
        liquidityUsd: n(ticker.volume) * n(ticker.last),
        volume24h: n(ticker.volume) * n(ticker.last),
        priceChange24h: ticker.percent_change_24,
        source: "bitstamp",
        description: `${ticker.pair || ""} Bitstamp 24h spot market data`,
      })
    );
}

export async function getGeminiTickerCandidates(options = {}) {
  const limit = Number(options.limit || 100);
  const symbols = await fetchJson("https://api.gemini.com/v1/symbols");
  const usdSymbols = (symbols || [])
    .filter((symbol) => String(symbol || "").endsWith("usd"))
    .slice(0, limit);
  const all = [];

  for (const symbol of usdSymbols) {
    try {
      const ticker = await fetchJson(`https://api.gemini.com/v2/ticker/${symbol}`);
      all.push(
        candidate({
          name: fromPair(symbol.toUpperCase()),
          symbol: fromPair(symbol.toUpperCase()),
          chain: "gemini",
          id: symbol,
          dex: "cex",
          url: `https://www.gemini.com/prices/${fromPair(symbol).toLowerCase()}`,
          priceUsd: ticker.close,
          liquidityUsd: n(ticker.volume?.USD),
          volume24h: n(ticker.volume?.USD),
          priceChange24h: n(ticker.changes?.at(-1)) - n(ticker.open),
          source: "gemini",
          description: `${symbol} Gemini 24h spot market data`,
        })
      );
    } catch (error) {
      console.warn(`gemini ${symbol} skipped: ${error.message}`);
    }
  }

  return all;
}

function dedupe(projects = []) {
  const seen = new Map();

  for (const project of projects) {
    const key = [
      String(project.chain || "").toLowerCase(),
      String(project.address || project.pairAddress || project.symbol || project.name || "").toLowerCase(),
    ].join(":");

    if (!seen.has(key)) seen.set(key, project);
  }

  return [...seen.values()];
}

export async function getExpandedMarketDataCandidates(options = {}) {
  const limit = Number(options.limit || 100);
  const sourceCalls = [
    ["coincap", () => getCoinCapCandidates({ limit })],
    ["coinlore", () => getCoinLoreCandidates({ limit })],
    ["cryptocompare", () => getCryptoCompareCandidates({ limit })],
    ["defillama-yields", () => getDefiLlamaYieldCandidates({ limit })],
    ["defillama-stablecoins", () => getDefiLlamaStablecoinCandidates({ limit })],
    ["dexscreener-search", () => getDexScreenerSearchCandidates({ limit })],
    ["okx", () => getOkxTickerCandidates({ limit })],
    ["bybit", () => getBybitTickerCandidates({ limit })],
    ["gate", () => getGateTickerCandidates({ limit })],
    ["mexc", () => getMexcTickerCandidates({ limit })],
    ["bitget", () => getBitgetTickerCandidates({ limit })],
    ["htx", () => getHtxTickerCandidates({ limit })],
    ["bitfinex", () => getBitfinexTickerCandidates({ limit })],
    ["bitstamp", () => getBitstampTickerCandidates({ limit })],
    ["gemini", () => getGeminiTickerCandidates({ limit: Math.min(30, limit) })],
  ];
  const all = [];

  for (const [name, fn] of sourceCalls) {
    try {
      all.push(...(await fn()));
    } catch (error) {
      const blocked = [401, 403, 451].includes(Number(error.status));
      const suffix = blocked
        ? `provider unavailable in this environment or requires access (${error.status})`
        : error.message;
      console.warn(`${name} skipped: ${suffix}`);
    }
  }

  return dedupe(all);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const candidates = await getExpandedMarketDataCandidates({ limit: 50 });
  console.log(JSON.stringify(candidates.slice(0, 50), null, 2));
}
