// src/data/expandedMarketDataConnector.js

import { runConcurrent, runWithTimeBudget } from "../discovery/discoveryExecutionGrid.js";
import {
  normalizeChainId,
  normalizePoolAddress,
  normalizeTokenAddress,
} from "../identity/strictIdentityValidators.js";
import { normalizeProviderLinks } from "./providerLinkNormalizer.js";

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

function nullableNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function sleep(ms = 200) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const KRAKEN_LEGACY_PREFIX_EXCEPTIONS = new Set(["XRP", "XLM", "XMR", "ZEC"]);

export function normalizeSymbol(symbol = "", options = {}) {
  const raw = String(symbol || "").trim();
  const upper = raw.toUpperCase();
  const krakenAsset =
    options.krakenAsset === true &&
    /^[XZ][A-Z0-9]{2,8}$/.test(upper) &&
    !KRAKEN_LEGACY_PREFIX_EXCEPTIONS.has(upper);

  return String(krakenAsset ? upper.slice(1) : raw)
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

function normalizeProviderChain(value = "") {
  return normalizeChainId(value);
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    Number(options.timeoutMs || process.env.MARKET_PROVIDER_TIMEOUT_MS || 12_000)
  );

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        accept: "application/json",
        "user-agent": "Crypto-Launch-Intelligence/0.5",
        ...(options.headers || {}),
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

export function classifyProviderStatus(error = {}) {
  const status = Number(error.status || error.httpStatus || 0);
  const message = String(error.message || error.errorMessage || "").toLowerCase();

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
    return providerEnvelope({
      source,
      status: candidates.length ? "healthy" : "success_empty",
      startedAt,
      candidates,
    });
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

async function runProviderResult(source = "", fn, options = {}) {
  const startedAt = Date.now();

  try {
    return await runWithTimeBudget(fn, {
      label: source,
      timeoutMs: Number(options.timeoutMs || process.env.MARKET_PROVIDER_TIMEOUT_MS || 12_000),
    });
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

function candidate(base = {}) {
  const rawChain =
    base.chain === null || base.chain === undefined
      ? null
      : String(base.chain).toLowerCase();
  const chain = normalizeProviderChain(rawChain);
  const marketCap = nullableNumber(base.marketCap);
  const fullyDilutedValue = nullableNumber(base.fullyDilutedValue ?? base.fdv);
  const address = normalizeTokenAddress(base.address, chain);
  const pairAddress = normalizePoolAddress(base.pairAddress, chain);
  const providerAssetId = base.providerAssetId || base.id || null;
  const providerLinks = normalizeProviderLinks(base, {
    source: base.source || "expanded-market",
    sourceUrl: base.url,
  });

  return {
    name: base.name || "Unknown",
    symbol: normalizeSymbol(base.symbol || base.name || "UNKNOWN"),
    chain,
    declaredChain: base.declaredChain || rawChain,
    exchange: base.exchange || null,
    baseSymbol: base.baseSymbol || normalizeSymbol(base.symbol || base.name || "UNKNOWN"),
    quoteSymbol: base.quoteSymbol || null,
    assetKey:
      base.assetKey ||
      (address && chain ? `${chain}:${String(address).toLowerCase()}` : null) ||
      (providerAssetId ? `${base.source || "provider"}:${providerAssetId}` : null) ||
      `symbol:${normalizeSymbol(base.symbol || base.name || "UNKNOWN")}:${String(base.name || "").toLowerCase()}`,
    marketKey: base.marketKey || (providerAssetId ? `${base.source || "expanded-market"}:${providerAssetId}` : null),
    providerAssetId,
    address,
    pairAddress,
    dex: base.dex || "market",
    url: base.url || null,
    ...providerLinks,
    priceUsd: nullableNumber(base.priceUsd),
    liquidityUsd: nullableNumber(base.liquidityUsd),
    volume24h: nullableNumber(base.volume24h),
    volume6h: nullableNumber(base.volume6h),
    volume1h: nullableNumber(base.volume1h),
    priceChange24h: nullableNumber(base.priceChange24h),
    priceChange6h: nullableNumber(base.priceChange6h),
    priceChange1h: nullableNumber(base.priceChange1h),
    priceChange7d: nullableNumber(base.priceChange7d),
    marketCap,
    fullyDilutedValue,
    fdv: fullyDilutedValue,
    tvlUsd: nullableNumber(base.tvlUsd ?? base.tvl),
    tvl: nullableNumber(base.tvlUsd ?? base.tvl),
    attentionSpendUsd: nullableNumber(base.attentionSpendUsd),
    boostAmount: nullableNumber(base.boostAmount),
    totalBoostAmount: nullableNumber(base.totalBoostAmount),
    adType: base.adType || null,
    claimDate: base.claimDate || null,
    category: base.category || "",
    source: base.source || "expanded-market",
    description: [base.description, base.name, base.symbol, base.category, base.source]
      .filter(Boolean)
      .join(" "),
  };
}

export async function getCoinCapCandidates(options = {}) {
  const limit = Number(options.limit || 100);
  const apiKey = options.apiKey !== undefined ? options.apiKey : process.env.COINCAP_API_KEY || "";

  if (!apiKey) return [];

  const baseUrl = options.baseUrl || process.env.COINCAP_BASE_URL || "https://rest.coincap.io/v3";
  const response = await fetchJson(`${baseUrl}/assets?limit=${limit}`, {
    headers: {
      authorization: `Bearer ${apiKey}`,
    },
  });

  return (response.data || []).map((asset) =>
    candidate({
      name: asset.name,
      symbol: asset.symbol,
      chain: null,
      id: asset.id,
      url: `https://coincap.io/assets/${asset.id}`,
      priceUsd: asset.priceUsd,
      liquidityUsd: null,
      volume24h: asset.volumeUsd24Hr,
      priceChange24h: asset.changePercent24Hr,
      marketCap: asset.marketCapUsd,
      fullyDilutedValue: null,
      source: "coincap",
      description: `${asset.name || ""} ${asset.symbol || ""} CoinCap market data`,
    })
  );
}

export async function getCoinCapProviderResult(options = {}) {
  const startedAt = Date.now();
  const apiKey = options.apiKey !== undefined ? options.apiKey : process.env.COINCAP_API_KEY || "";

  if (!apiKey) {
    return {
      source: "coincap",
      status: "authentication_required",
      attempted: false,
      candidates: [],
      durationMs: 0,
      attempts: 0,
      httpStatus: null,
      errorCode: "missing_api_key",
      errorMessage: "COINCAP_API_KEY is required for CoinCap V3.",
    };
  }

  try {
    const candidates = await getCoinCapCandidates(options);
    return {
      source: "coincap",
      status: candidates.length ? "healthy" : "success_empty",
      attempted: true,
      candidates,
      durationMs: Date.now() - startedAt,
      attempts: 1,
      httpStatus: 200,
      errorCode: null,
      errorMessage: null,
    };
  } catch (error) {
    return {
      source: "coincap",
      status: classifyProviderStatus(error),
      attempted: true,
      candidates: [],
      durationMs: Date.now() - startedAt,
      attempts: 1,
      httpStatus: error.status || null,
      errorCode: classifyProviderStatus(error),
      errorMessage: error.message,
    };
  }
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
      chain: null,
      id: asset.id,
      url: `https://www.coinlore.com/coin/${asset.nameid || asset.id}`,
      priceUsd: asset.price_usd,
      liquidityUsd: null,
      volume24h: asset.volume24,
      priceChange24h: asset.percent_change_24h,
      marketCap: asset.market_cap_usd,
      source: "coinlore",
      description: `${asset.name || ""} ${asset.symbol || ""} CoinLore market data`,
    })
  );
}

export async function getCoinLoreAssetsCandidates(options = {}) {
  const limit = Number(options.limit || 1000);
  const assets = await fetchJson("https://api.coinlore.net/api/assets/");

  return (Array.isArray(assets) ? assets : [])
    .slice(0, limit)
    .map((asset) =>
      candidate({
        name: asset.name,
        symbol: asset.symbol,
        chain: null,
        id: asset.id,
        url: `https://www.coinlore.com/coin/${asset.nameid || asset.id}`,
        priceUsd: null,
        liquidityUsd: null,
        volume24h: null,
        priceChange24h: null,
        marketCap: null,
        category: "coinlore asset universe",
        source: "coinlore-assets",
        description: `${asset.name || ""} ${asset.symbol || ""} CoinLore asset directory rank ${asset.rank || "unknown"}`,
      })
    );
}

export async function getCoinLoreMoversCandidates(options = {}) {
  const limit = Number(options.limit || 120);
  const sortWindows = options.sortWindows || ["1h", "24h", "7d"];
  const rows = [];

  for (const sort of sortWindows) {
    const response = await fetchJson(`https://api.coinlore.net/api/movers/?sort=${encodeURIComponent(sort)}`);
    const data = response.data || {};
    for (const direction of ["winners", "losers"]) {
      rows.push(
        ...((data[direction] || []).map((asset) =>
          candidate({
            name: asset.name,
            symbol: asset.symbol,
            chain: null,
            id: asset.id,
            url: `https://www.coinlore.com/coin/${asset.nameid || asset.id}`,
            priceUsd: asset.price_usd,
            liquidityUsd: null,
            volume24h: asset.volume24,
            priceChange24h: asset.percent_change_24h,
            priceChange1h: asset.percent_change_1h,
            priceChange7d: asset.percent_change_7d,
            marketCap: asset.market_cap_usd,
            category: `coinlore ${sort} ${direction}`,
            source: "coinlore-movers",
            description: `${asset.name || ""} ${asset.symbol || ""} CoinLore ${sort} ${direction} mover`,
          })
        ))
      );
    }
  }

  return rows.slice(0, limit);
}

export async function getCryptoCompareCandidates(options = {}) {
  const limit = Number(options.limit || 100);
  const freeOnly = options.freeOnly ?? process.env.FREE_ONLY_MODE === "true";
  const apiKey = freeOnly ? "" : process.env.CRYPTOCOMPARE_API_KEY || "";
  const allowNoKey = freeOnly || process.env.CRYPTOCOMPARE_ALLOW_NO_KEY === "true";

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
      chain: null,
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
        chain: normalizeProviderChain(pool.chain),
        declaredChain: pool.chain || null,
        id: pool.pool,
        dex: "yield-pool",
        url: pool.url || "https://defillama.com/yields",
        priceUsd: null,
        liquidityUsd: pool.tvlUsd,
        volume24h: null,
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
  const response = await fetchJson("https://stablecoins.llama.fi/stablecoins?includePrices=true", options);

  return (response.peggedAssets || [])
    .slice(0, limit)
    .map((asset) =>
      candidate({
        name: asset.name,
        symbol: asset.symbol,
        chain: null,
        id: asset.id,
        url: "https://defillama.com/stablecoins",
        priceUsd: asset.price,
        liquidityUsd: asset.circulating?.peggedUSD,
        volume24h: null,
        marketCap: asset.circulating?.peggedUSD,
        category: "stablecoin payments settlement",
        source: "defillama-stablecoins",
        description: `${asset.name || ""} ${asset.symbol || ""} stablecoin payments settlement DeFiLlama`,
      })
    );
}

export async function getDefiLlamaStablecoinSnapshot(options = {}) {
  const response = await fetchJson(
    options.baseUrl || "https://stablecoins.llama.fi/stablecoins?includePrices=true",
    options
  );
  const assets = Array.isArray(response?.peggedAssets) ? response.peggedAssets : [];
  const totalSupplyUsd = assets.reduce((sum, asset) => {
    const supply = nullableNumber(asset?.circulating?.peggedUSD);
    return supply === null || supply < 0 ? sum : sum + supply;
  }, 0);

  return {
    source: "defillama-stablecoins",
    observedAt: options.now || new Date().toISOString(),
    totalSupplyUsd: assets.length ? totalSupplyUsd : null,
    assetCount: assets.length,
  };
}

export async function getDexScreenerCommunityTakeoverCandidates(options = {}) {
  const limit = Number(options.limit || 100);
  const rows = await fetchJson("https://api.dexscreener.com/community-takeovers/latest/v1");

  return (rows || []).slice(0, limit).map((takeover) =>
    candidate({
      name: takeover.header || takeover.description || takeover.tokenAddress,
      symbol: takeover.header || takeover.tokenAddress,
      chain: takeover.chainId,
      address: takeover.tokenAddress,
      pairAddress: null,
      dex: "community-takeover",
      url: takeover.url,
      links: takeover.links,
      websites: takeover.websites,
      socials: takeover.socials,
      priceUsd: null,
      liquidityUsd: null,
      volume24h: null,
      priceChange24h: null,
      claimDate: takeover.claimDate,
      category: "community takeover social catalyst",
      source: "dexscreener-community-takeovers",
      description: [
        takeover.header,
        takeover.description,
        takeover.claimDate,
        "DexScreener community takeover discovery",
      ]
        .filter(Boolean)
        .join(" "),
    })
  );
}

export async function getDexScreenerAdCandidates(options = {}) {
  const limit = Number(options.limit || 100);
  const rows = await fetchJson("https://api.dexscreener.com/ads/latest/v1");

  return (rows || []).slice(0, limit).map((ad) =>
    candidate({
      name: ad.header || ad.description || ad.tokenAddress,
      symbol: ad.header || ad.tokenAddress,
      chain: ad.chainId,
      address: ad.tokenAddress,
      pairAddress: null,
      dex: "token-ad",
      url: ad.url,
      links: ad.links,
      websites: ad.websites,
      socials: ad.socials,
      priceUsd: null,
      liquidityUsd: null,
      volume24h: null,
      priceChange24h: null,
      adType: ad.type,
      category: "paid ad attention discovery",
      source: "dexscreener-ads",
      description: [
        ad.header,
        ad.description,
        ad.type,
        ad.date,
        ad.durationHours ? `duration ${ad.durationHours}h` : "",
        ad.impressions ? `impressions ${ad.impressions}` : "",
        "DexScreener ad discovery",
      ]
        .filter(Boolean)
        .join(" "),
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
            info: pair.info,
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

export async function getDexScreenerTokenProfileCandidates(options = {}) {
  const limit = Number(options.limit || 100);
  const profiles = await fetchJson("https://api.dexscreener.com/token-profiles/latest/v1");

  return (profiles || []).slice(0, limit).map((profile) =>
    candidate({
      name: profile.header || profile.description || profile.tokenAddress,
      symbol: profile.header || profile.tokenAddress,
      chain: profile.chainId,
      address: profile.tokenAddress,
      pairAddress: null,
      dex: "token-profile",
      url: profile.url,
      links: profile.links,
      websites: profile.websites,
      socials: profile.socials,
      priceUsd: null,
      liquidityUsd: null,
      volume24h: null,
      priceChange24h: null,
      category: "new token profile discovery",
      source: "dexscreener-profiles",
      description: [
        profile.header,
        profile.description,
        "latest DexScreener token profile launch discovery",
      ]
        .filter(Boolean)
        .join(" "),
    })
  );
}

export async function getDexScreenerBoostCandidates(options = {}) {
  const limit = Number(options.limit || 100);
  const [latest, top] = await Promise.allSettled([
    fetchJson("https://api.dexscreener.com/token-boosts/latest/v1"),
    fetchJson("https://api.dexscreener.com/token-boosts/top/v1"),
  ]);
  const rows = [
    ...(latest.status === "fulfilled" ? latest.value || [] : []),
    ...(top.status === "fulfilled" ? top.value || [] : []),
  ];

  return rows.slice(0, limit).map((boost) =>
    candidate({
      name: boost.header || boost.description || boost.tokenAddress,
      symbol: boost.header || boost.tokenAddress,
      chain: boost.chainId,
      address: boost.tokenAddress,
      pairAddress: null,
      dex: "token-boost",
      url: boost.url,
      links: boost.links,
      websites: boost.websites,
      socials: boost.socials,
      priceUsd: null,
      liquidityUsd: null,
      volume24h: null,
      priceChange24h: null,
      boostAmount: boost.amount,
      totalBoostAmount: boost.totalAmount,
      attentionSpendUsd: n(boost.totalAmount) * 1000,
      category: "boosted token launch marketing discovery",
      source: "dexscreener-boosts",
      description: [
        boost.header,
        boost.description,
        `boost amount ${boost.amount || 0}`,
        `total boost ${boost.totalAmount || 0}`,
        "DexScreener token boost discovery",
      ]
        .filter(Boolean)
        .join(" "),
    })
  );
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
        chain: null,
        exchange: "OKX",
        baseSymbol: fromPair(ticker.instId),
        quoteSymbol: "USDT",
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
  if (String(options.region || process.env.MARKET_REGION || "").toUpperCase() === "US") {
    return [];
  }

  const response = await fetchJson("https://api.bybit.com/v5/market/tickers?category=spot");

  return (response.result?.list || [])
    .filter((ticker) => String(ticker.symbol || "").endsWith("USDT"))
    .sort((a, b) => n(b.turnover24h) - n(a.turnover24h))
    .slice(0, limit)
    .map((ticker) =>
      candidate({
        name: fromPair(ticker.symbol),
        symbol: fromPair(ticker.symbol),
        chain: null,
        exchange: "Bybit",
        baseSymbol: fromPair(ticker.symbol),
        quoteSymbol: "USDT",
        id: ticker.symbol,
        dex: "cex",
        url: `https://www.bybit.com/trade/spot/${ticker.symbol}`,
        priceUsd: ticker.lastPrice,
        liquidityUsd: null,
        volume24h: ticker.turnover24h,
        priceChange24h: n(ticker.price24hPcnt) * 100,
        source: "bybit",
        description: `${ticker.symbol || ""} Bybit 24h spot market data`,
      })
    );
}

export async function getBybitProviderResult(options = {}) {
  const startedAt = Date.now();

  if (String(options.region || process.env.MARKET_REGION || "").toUpperCase() === "US") {
    return {
      source: "bybit",
      status: "region_blocked",
      attempted: false,
      candidates: [],
      durationMs: 0,
      attempts: 0,
      httpStatus: null,
      errorCode: "region_blocked",
      errorMessage: "Bybit is skipped in MARKET_REGION=US.",
    };
  }

  try {
    const candidates = await getBybitTickerCandidates(options);
    return {
      source: "bybit",
      status: candidates.length ? "healthy" : "success_empty",
      attempted: true,
      candidates,
      durationMs: Date.now() - startedAt,
      attempts: 1,
      httpStatus: 200,
      errorCode: null,
      errorMessage: null,
    };
  } catch (error) {
    return {
      source: "bybit",
      status: classifyProviderStatus(error),
      attempted: true,
      candidates: [],
      durationMs: Date.now() - startedAt,
      attempts: 1,
      httpStatus: error.status || null,
      errorCode: classifyProviderStatus(error),
      errorMessage: error.message,
    };
  }
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
        chain: null,
        exchange: "Gate",
        baseSymbol: fromPair(ticker.currency_pair),
        quoteSymbol: "USDT",
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
        chain: null,
        exchange: "MEXC",
        baseSymbol: fromPair(ticker.symbol),
        quoteSymbol: "USDT",
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
        chain: null,
        exchange: "Bitget",
        baseSymbol: fromPair(ticker.symbol),
        quoteSymbol: "USDT",
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
        chain: null,
        exchange: "HTX",
        baseSymbol: fromPair(ticker.symbol.toUpperCase()),
        quoteSymbol: "USDT",
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
        chain: null,
        exchange: "Bitfinex",
        baseSymbol: fromPair(pair),
        quoteSymbol: "USD",
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
        chain: null,
        exchange: "Bitstamp",
        baseSymbol: fromPair(ticker.pair),
        quoteSymbol: "USD",
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
  const priceFeed = await fetchJson(options.priceFeedUrl || "https://api.gemini.com/v1/pricefeed");

  return (priceFeed || [])
    .filter((ticker) => String(ticker.pair || "").toUpperCase().endsWith("USD"))
    .slice(0, limit)
    .map((ticker) => {
      const pair = String(ticker.pair || "").toUpperCase();
      return candidate({
        name: fromPair(pair),
        symbol: fromPair(pair),
        chain: null,
        exchange: "Gemini",
        baseSymbol: fromPair(pair),
        quoteSymbol: "USD",
        id: pair,
        dex: "cex",
        url: `https://www.gemini.com/prices/${fromPair(pair).toLowerCase()}`,
        priceUsd: ticker.price,
        liquidityUsd: null,
        volume24h: null,
        priceChange24h: ticker.percentChange24h,
        marketCap: null,
        fullyDilutedValue: null,
        source: "gemini",
        description: `${pair} Gemini bulk public price feed`,
      });
    });
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

export async function getExpandedMarketDataProviderBatch(options = {}) {
  const limit = Number(options.limit || 100);
  const configuredBudgets = options.providerBudgets || {};
  const maximumBudgets = {
    coincap: 2_000,
    coinlore: 2_500,
    "coinlore-assets": 2_500,
    "coinlore-movers": 120,
    cryptocompare: 500,
    "defillama-yields": 1_000,
    "defillama-stablecoins": 500,
    "dexscreener-search": 300,
    "dexscreener-profiles": 500,
    "dexscreener-boosts": 500,
    "dexscreener-community-takeovers": 300,
    "dexscreener-ads": 300,
    okx: 1_000,
    bybit: 1_000,
    gate: 1_000,
    mexc: 1_000,
    bitget: 1_000,
    htx: 1_000,
    bitfinex: 1_000,
    bitstamp: 1_000,
    gemini: 1_000,
  };
  const budget = (source) =>
    Math.max(1, Math.min(limit, Number(configuredBudgets[source] || maximumBudgets[source] || 1_000)));
  const freeOnly = options.freeOnly ?? process.env.FREE_ONLY_MODE === "true";
  const providerConcurrency = Math.max(
    1,
    Math.min(8, Number(options.providerConcurrency || process.env.MARKET_PROVIDER_CONCURRENCY || 4))
  );
  const sourceCalls = [
    ["coincap", () => getCoinCapProviderResult({ limit: budget("coincap") }), true, true],
    ["coinlore", () => getCoinLoreCandidates({ limit: budget("coinlore") })],
    ["coinlore-assets", () => getCoinLoreAssetsCandidates({ limit: budget("coinlore-assets") })],
    ["coinlore-movers", () => getCoinLoreMoversCandidates({ limit: budget("coinlore-movers") })],
    ["cryptocompare", () => getCryptoCompareCandidates({ limit: budget("cryptocompare"), freeOnly })],
    ["defillama-yields", () => getDefiLlamaYieldCandidates({ limit: budget("defillama-yields") })],
    ["defillama-stablecoins", () => getDefiLlamaStablecoinCandidates({ limit: budget("defillama-stablecoins") })],
    ["dexscreener-search", () => getDexScreenerSearchCandidates({ limit: budget("dexscreener-search") })],
    ["dexscreener-profiles", () => getDexScreenerTokenProfileCandidates({ limit: budget("dexscreener-profiles") })],
    ["dexscreener-boosts", () => getDexScreenerBoostCandidates({ limit: budget("dexscreener-boosts") })],
    ["dexscreener-community-takeovers", () => getDexScreenerCommunityTakeoverCandidates({ limit: budget("dexscreener-community-takeovers") })],
    ["dexscreener-ads", () => getDexScreenerAdCandidates({ limit: budget("dexscreener-ads") })],
    ["okx", () => getOkxTickerCandidates({ limit: budget("okx") })],
    ["bybit", () => getBybitProviderResult({ limit: budget("bybit") }), true],
    ["gate", () => getGateTickerCandidates({ limit: budget("gate") })],
    ["mexc", () => getMexcTickerCandidates({ limit: budget("mexc") })],
    ["bitget", () => getBitgetTickerCandidates({ limit: budget("bitget") })],
    ["htx", () => getHtxTickerCandidates({ limit: budget("htx") })],
    ["bitfinex", () => getBitfinexTickerCandidates({ limit: budget("bitfinex") })],
    ["bitstamp", () => getBitstampTickerCandidates({ limit: budget("bitstamp") })],
    ["gemini", () => getGeminiTickerCandidates({ limit: budget("gemini") })],
  ].filter(([, , , requiresKey]) => !(freeOnly && requiresKey));
  const providers = await runConcurrent(
    sourceCalls,
    async ([name, fn, returnsProviderResult]) => {
      const result = returnsProviderResult
        ? await runProviderResult(name, fn, options)
        : await runProvider(name, fn, options);

      if (result.status !== "healthy") {
        const message = result.errorMessage || result.errorCode || result.status;
        console.warn(`${name} skipped: ${message}`);
      }

      return result;
    },
    { concurrency: providerConcurrency }
  );

  return {
    candidates: dedupe(providers.flatMap((provider) => provider.candidates || [])),
    providers: providers.map(({ candidates, ...provider }) => provider),
    providerBudgets: Object.fromEntries(sourceCalls.map(([source]) => [source, budget(source)])),
  };
}

export async function getExpandedMarketDataProviderResults(options = {}) {
  const batch = await getExpandedMarketDataProviderBatch(options);
  return batch.providers;
}

export async function getExpandedMarketDataCandidates(options = {}) {
  const batch = await getExpandedMarketDataProviderBatch(options);
  return batch.candidates;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const candidates = await getExpandedMarketDataCandidates({ limit: 50 });
  console.log(JSON.stringify(candidates.slice(0, 50), null, 2));
}
