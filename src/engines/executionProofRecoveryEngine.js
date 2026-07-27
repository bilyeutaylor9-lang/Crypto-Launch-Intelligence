import { canonicalChainForAlias, SUPPORTED_CHAIN_REGISTRY } from "../data/chainAliasRegistry.js";
import {
  normalizeChainId,
  normalizePoolAddress,
  normalizeTokenAddress,
} from "../identity/strictIdentityValidators.js";
import { routeQuoteFresh } from "../execution/routeTruthV2.js";

const SOLANA_USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const SOLANA_SOL_MINT = "So11111111111111111111111111111111111111112";

const EVM_USDC_BY_CHAIN = {
  ethereum: { chainId: 1, address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6 },
  base: { chainId: 8453, address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6 },
  bsc: { chainId: 56, address: "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d", decimals: 18 },
  arbitrum: { chainId: 42161, address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", decimals: 6 },
  polygon: { chainId: 137, address: "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359", decimals: 6 },
  optimism: { chainId: 10, address: "0x0b2c639c533813f4aa9d7837caf62653d097ff85", decimals: 6 },
  avalanche: { chainId: 43114, address: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E", decimals: 6 },
};

const DEFAULT_OPTIONS = {
  enabled: true,
  maxCandidates: 25,
  tradeSizesUsd: [25, 100],
  timeoutMs: 300_000,
  requestTimeoutMs: 8_000,
  concurrency: 2,
};

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clean(value = "") {
  return String(value ?? "").trim();
}

function lower(value = "") {
  return clean(value).toLowerCase();
}

function upper(value = "") {
  return clean(value).toUpperCase();
}

function first(values = []) {
  return values.find((value) => value !== undefined && value !== null && value !== "") ?? null;
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function boolEnv(value, fallback = true) {
  if (value === undefined || value === null || value === "") return fallback;
  return /^(true|1|yes|on)$/i.test(String(value));
}

function intEnv(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function tradeSizes(value = "", fallback = DEFAULT_OPTIONS.tradeSizesUsd) {
  const parsed = String(value || "")
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item) && item > 0);
  return parsed.length ? parsed : fallback;
}

function resolveOptions(options = {}) {
  const env = options.env || process.env;
  return {
    enabled: options.enabled ?? boolEnv(env.EXECUTION_RECOVERY_ENABLED, DEFAULT_OPTIONS.enabled),
    maxCandidates: options.maxCandidates ?? intEnv(env.EXECUTION_RECOVERY_MAX_CANDIDATES, DEFAULT_OPTIONS.maxCandidates),
    tradeSizesUsd: options.tradeSizesUsd || tradeSizes(env.EXECUTION_RECOVERY_TRADE_SIZES_USD),
    timeoutMs: options.timeoutMs ?? intEnv(env.EXECUTION_RECOVERY_TIMEOUT_MS, DEFAULT_OPTIONS.timeoutMs),
    requestTimeoutMs: options.requestTimeoutMs ?? intEnv(env.EXECUTION_RECOVERY_REQUEST_TIMEOUT_MS, DEFAULT_OPTIONS.requestTimeoutMs),
    concurrency: Math.max(1, options.concurrency ?? intEnv(env.EXECUTION_RECOVERY_CONCURRENCY, DEFAULT_OPTIONS.concurrency)),
    jupiterApiKey: options.jupiterApiKey ?? env.JUPITER_API_KEY ?? "",
    zeroxApiKey: options.zeroxApiKey ?? env.ZEROX_API_KEY ?? "",
    fetchJson: options.fetchJson || defaultFetchJson,
    now: options.now || (() => new Date()),
  };
}

async function defaultFetchJson(url, init = {}) {
  const timeoutMs = init.timeoutMs || DEFAULT_OPTIONS.requestTimeoutMs;
  const controller = new AbortController();
  const onAbort = () => controller.abort(init.signal?.reason);
  if (init.signal) init.signal.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(() => controller.abort("request timed out"), timeoutMs);
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: init.headers || {},
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} ${url}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
    if (init.signal) init.signal.removeEventListener("abort", onAbort);
  }
}

function chainOf(project = {}) {
  return normalizeChainId(first([
    project.canonicalChain,
    project.finalChain,
    project.chain,
    project.network,
    project.chainId,
    project.canonicalExecutionRoute?.chain,
  ])) || canonicalChainForAlias(first([project.chain, project.network, project.chainId])) || null;
}

function chainDefinition(chain = "") {
  return SUPPORTED_CHAIN_REGISTRY[chain] || null;
}

function tokenAddressOf(project = {}) {
  const chain = chainOf(project);
  const raw = first([
    project.tokenAddress,
    project.contractAddress,
    project.canonicalAddress,
    project.finalContractAddress,
    project.address,
    project.baseToken?.address,
    project.canonicalExecutionRoute?.contractAddress,
  ]);
  return normalizeTokenAddress(raw, chain) || null;
}

function poolAddressOf(project = {}) {
  const chain = chainOf(project);
  const raw = first([
    project.poolAddress,
    project.pairAddress,
    project.primaryTradablePool,
    project.finalPairAddress,
    project.canonicalExecutionRoute?.pairAddress,
  ]);
  return normalizePoolAddress(raw, chain) || null;
}

function liquidityUsd(project = {}) {
  return Math.max(
    num(project.stableExitLiquidityUsd),
    num(project.dexLiquidityUsd),
    num(project.liquidityUsd),
    num(project.activeLiquidityUsd),
    num(project.canonicalExecutionRoute?.liquidityUsd),
    num(project.marketData?.liquidityUsd),
    num(project.rawCandidate?.liquidityUsd)
  );
}

function priceUsd(project = {}) {
  return Math.max(
    num(project.priceUsd),
    num(project.price),
    num(project.canonicalExecutionRoute?.priceUsd),
    num(project.marketData?.priceUsd),
    num(project.rawCandidate?.priceUsd)
  );
}

function marketPairOf(project = {}) {
  return first([
    project.marketPair,
    project.canonicalExecutionRoute?.marketPair,
    project.marketData?.marketPair,
    project.rawCandidate?.marketPair,
  ]);
}

function symbolOf(project = {}) {
  return clean(first([project.symbol, project.ticker, project.baseToken?.symbol, project.rawCandidate?.symbol])) || "UNKNOWN";
}

function nameOf(project = {}) {
  return clean(first([project.name, project.projectName, project.rawCandidate?.name])) || symbolOf(project);
}

function opportunityScore(project = {}) {
  return Math.max(
    num(project.dailyCapitalMoveScore),
    num(project.highUpsideScalpScore),
    num(project.hottestTenNowScore),
    num(project.earlyAsymmetryResearchPriorityScore),
    num(project.progressiveOpportunityScore),
    num(project.preBreakoutRadarScore),
    num(project.preConsensusBreakoutScore),
    num(project.capitalMigrationScore),
    num(project.marketOpportunityScore),
    num(project.pipelineScore)
  );
}

function hardBlocked(project = {}) {
  const text = [
    project.executionStatus,
    project.executionProofState,
    project.finalSelectionState,
    project.highUpsideScalpLane,
    ...(project.finalSelectionBlockers || []),
    ...(project.sniperIntegrityBlockers || []),
    ...(project.blockers || []),
  ].join(" ");
  return Boolean(
    project.honeypotDetected === true ||
      project.verifiedScam === true ||
      project.sellRestricted === true ||
      project.identityConflict === true ||
      project.canonicalIdentityHardBlock === true ||
      upper(project.instantSafetyStatus) === "CRITICAL" ||
      /HONEYPOT_RISK|CONTRACT_MISMATCH|CHAIN_MISMATCH|SAFETY_BLOCK|cannot sell|honeypot|scam|contract mismatch/i.test(text)
  );
}

function needsRecoveredExecution(project = {}) {
  const hasFreshQuotes = project.buyQuoteVerified === true &&
    project.sellQuoteVerified === true &&
    routeQuoteFresh(project, 3600);
  const state = upper(first([project.routeTruthStatus, project.executionProofState, project.canonicalExecutionRoute?.routeTruthStatus]));
  return !hasFreshQuotes || ["UNVERIFIED", "UNKNOWN", "MARKET_OBSERVED", "PAIR_IDENTITY_VERIFIED", "BUY_QUOTE_VERIFIED"].includes(state);
}

function identityKey(project = {}) {
  const chain = chainOf(project) || "unknown";
  const token = tokenAddressOf(project);
  const pool = poolAddressOf(project);
  const pair = marketPairOf(project);
  if (token) return `${chain}:token:${token}`;
  if (pool) return `${chain}:pool:${pool}`;
  if (pair) return `${chain}:pair:${String(pair).toUpperCase()}`;
  return `${chain}:display:${symbolOf(project).toUpperCase()}:${nameOf(project).toLowerCase()}`;
}

export function selectExecutionRecoveryCandidates(projects = [], options = {}) {
  const resolved = resolveOptions(options);
  const deduped = new Map();
  const sorted = (Array.isArray(projects) ? projects : [])
    .filter((project) => project && typeof project === "object")
    .filter((project) => !hardBlocked(project))
    .filter((project) => needsRecoveredExecution(project))
    .map((project, index) => ({
      project,
      index,
      score: opportunityScore(project),
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index);

  for (const item of sorted) {
    const key = identityKey(item.project);
    if (!deduped.has(key)) deduped.set(key, item);
    if (deduped.size >= resolved.maxCandidates) break;
  }

  return [...deduped.values()].map((item, recoveryRank) => ({
    ...item,
    recoveryRank: recoveryRank + 1,
  }));
}

function quoteAgeSeconds(timestamp = "", now = new Date()) {
  const parsed = Date.parse(timestamp);
  return Number.isFinite(parsed) ? Math.max(0, Math.round((now.getTime() - parsed) / 1000)) : null;
}

function quoteTimestamp(options = {}) {
  return options.now().toISOString();
}

function amountUnits(usd = 25, decimals = 6) {
  return String(Math.max(1, Math.round(Number(usd) * 10 ** decimals)));
}

function routePlanPool(quote = {}) {
  return first(array(quote.routePlan).map((step) => step?.swapInfo?.ammKey || step?.swapInfo?.label));
}

function priceImpactPct(...quotes) {
  return Math.round(
    quotes.reduce((sum, quote) => sum + Math.max(0, num(quote?.priceImpactPct)), 0) * 10_000
  ) / 10_000;
}

function validJupiterQuote(quote = {}) {
  return Boolean(quote && BigInt(String(quote.outAmount || "0")) > 0n && array(quote.routePlan).length);
}

function jupiterHeaders(options = {}) {
  return options.jupiterApiKey ? { "x-api-key": options.jupiterApiKey } : {};
}

async function fetchJupiterQuote({ inputMint, outputMint, amount, options, signal }) {
  if (signal?.aborted) throw new Error("Jupiter request aborted before start.");
  const url = new URL("https://api.jup.ag/swap/v1/quote");
  url.searchParams.set("inputMint", inputMint);
  url.searchParams.set("outputMint", outputMint);
  url.searchParams.set("amount", String(amount));
  url.searchParams.set("slippageBps", "100");
  url.searchParams.set("restrictIntermediateTokens", "true");
  const quote = await options.fetchJson(url.toString(), {
    headers: jupiterHeaders(options),
    timeoutMs: options.requestTimeoutMs,
    signal,
    adapter: "jupiter",
  });
  return quote;
}

export async function recoverSolanaJupiterRoute(project = {}, options = {}, signal = null) {
  const chain = chainOf(project);
  const tokenAddress = tokenAddressOf(project);
  if (chain !== "solana") return { adapter: "jupiter", status: "NOT_APPLICABLE", reason: "Project is not on Solana." };
  if (!tokenAddress) return { adapter: "jupiter", status: "MISSING_IDENTITY", reason: "Solana token mint is missing or invalid." };

  const timestamp = quoteTimestamp(options);
  const failures = [];
  const tradeUsd = options.tradeSizesUsd[0] || 25;
  const tryQuoteAsset = async (quoteMint, quoteAsset, amount) => {
    const buy = await fetchJupiterQuote({
      inputMint: quoteMint,
      outputMint: tokenAddress,
      amount,
      options,
      signal,
    });
    if (!validJupiterQuote(buy)) return { status: "NO_BUY_QUOTE", buy };
    const sellAmount = String(BigInt(String(buy.outAmount || "0")) * 95n / 100n);
    const sell = await fetchJupiterQuote({
      inputMint: tokenAddress,
      outputMint: quoteMint,
      amount: sellAmount,
      options,
      signal,
    });
    if (!validJupiterQuote(sell)) return { status: "NO_SELL_QUOTE", buy, sell };
    return { status: "ROUTE_RECOVERED", buy, sell, quoteAsset };
  };

  let recovered = null;
  try {
    recovered = await tryQuoteAsset(SOLANA_USDC_MINT, "USDC", amountUnits(tradeUsd, 6));
  } catch (error) {
    failures.push(`Jupiter USDC quote failed: ${error.message}`);
  }

  const primaryAttempt = recovered;
  if ((!recovered || recovered.status === "NO_BUY_QUOTE") && !signal?.aborted) {
    try {
      const fallback = await tryQuoteAsset(SOLANA_SOL_MINT, "SOL", "100000000");
      if (fallback.status === "ROUTE_RECOVERED" || !primaryAttempt) recovered = fallback;
    } catch (error) {
      failures.push(`Jupiter SOL fallback failed: ${error.message}`);
    }
  }

  if (!recovered || recovered.status !== "ROUTE_RECOVERED") {
    return {
      adapter: "jupiter",
      status: recovered?.status || "PROVIDER_FAILED",
      buyQuoteVerified: recovered?.buy ? validJupiterQuote(recovered.buy) : false,
      sellQuoteVerified: false,
      failures,
      rawStatus: recovered?.status || null,
    };
  }

  const slippage = priceImpactPct(recovered.buy, recovered.sell);
  const route = {
    source: "jupiter",
    provider: "Jupiter",
    venue: "Jupiter",
    routeType: "DEX_AGGREGATOR",
    chain: "solana",
    tokenAddress,
    contractAddress: tokenAddress,
    poolAddress: poolAddressOf(project) || routePlanPool(recovered.buy) || routePlanPool(recovered.sell) || null,
    quoteAsset: recovered.quoteAsset,
    buyRouteAvailable: true,
    sellRouteAvailable: true,
    buyQuoteVerified: true,
    sellQuoteVerified: true,
    quoteVerified: true,
    quoteTimestamp: timestamp,
    quoteAgeSeconds: quoteAgeSeconds(timestamp, options.now()),
    priceImpactPct: slippage,
    estimatedRoundTripSlippagePct: slippage,
    slippagePct: slippage,
    slippageIsHeuristic: false,
    liquidityUsd: liquidityUsd(project) || null,
    priceUsd: priceUsd(project) || null,
    routeTruthStatus: "SELL_QUOTE_VERIFIED",
    status: "SELL_QUOTE_VERIFIED",
    verificationStatus: "PARTIALLY_VERIFIED",
    regionStatus: "UNKNOWN",
    executionRecoverySource: "jupiter",
    executionRecoveryFailures: failures,
    buyQuote: { verified: true, timestamp, outAmount: recovered.buy.outAmount, routePlanCount: array(recovered.buy.routePlan).length },
    sellQuote: { verified: true, timestamp, outAmount: recovered.sell.outAmount, routePlanCount: array(recovered.sell.routePlan).length },
  };

  return { adapter: "jupiter", status: "ROUTE_RECOVERED", route, failures };
}

async function fetchZeroXPrice({ chainId, sellToken, buyToken, sellAmount, options, signal }) {
  if (signal?.aborted) throw new Error("0x request aborted before start.");
  const url = new URL("https://api.0x.org/swap/allowance-holder/price");
  url.searchParams.set("chainId", String(chainId));
  url.searchParams.set("sellToken", sellToken);
  url.searchParams.set("buyToken", buyToken);
  url.searchParams.set("sellAmount", String(sellAmount));
  const quote = await options.fetchJson(url.toString(), {
    headers: {
      "0x-api-key": options.zeroxApiKey,
      "0x-version": "v2",
    },
    timeoutMs: options.requestTimeoutMs,
    signal,
    adapter: "0x",
  });
  return quote;
}

function tokenOutAmount(quote = {}) {
  return first([quote.buyAmount, quote.toAmount, quote.outAmount, quote.sellAmount]);
}

export async function recoverZeroXRoute(project = {}, options = {}, signal = null) {
  const chain = chainOf(project);
  const definition = chainDefinition(chain);
  const tokenAddress = tokenAddressOf(project);
  const quoteToken = EVM_USDC_BY_CHAIN[chain];
  if (!definition || definition.kind !== "evm") return { adapter: "0x", status: "NOT_APPLICABLE", reason: "Project is not on an EVM chain." };
  if (!options.zeroxApiKey) return { adapter: "0x", status: "OPTIONAL_KEY_MISSING", missingKey: "ZEROX_API_KEY", reason: "0x recovery is optional and was skipped because ZEROX_API_KEY is missing." };
  if (!tokenAddress || !quoteToken) return { adapter: "0x", status: "MISSING_IDENTITY", reason: "EVM token or default quote token is unavailable." };

  const timestamp = quoteTimestamp(options);
  const tradeUsd = options.tradeSizesUsd[0] || 25;
  try {
    const buy = await fetchZeroXPrice({
      chainId: quoteToken.chainId,
      sellToken: quoteToken.address,
      buyToken: tokenAddress,
      sellAmount: amountUnits(tradeUsd, quoteToken.decimals),
      options,
      signal,
    });
    const buyAmount = tokenOutAmount(buy);
    if (!buyAmount || String(buyAmount) === "0") {
      return { adapter: "0x", status: "NO_BUY_QUOTE", buyQuoteVerified: false, sellQuoteVerified: false };
    }
    const sellAmount = String(BigInt(String(buyAmount)) * 95n / 100n);
    const sell = await fetchZeroXPrice({
      chainId: quoteToken.chainId,
      sellToken: tokenAddress,
      buyToken: quoteToken.address,
      sellAmount,
      options,
      signal,
    });
    if (!tokenOutAmount(sell) || String(tokenOutAmount(sell)) === "0") {
      return { adapter: "0x", status: "NO_SELL_QUOTE", buyQuoteVerified: true, sellQuoteVerified: false };
    }

    const slippage = Math.max(num(buy.estimatedPriceImpact || buy.priceImpactPct), num(sell.estimatedPriceImpact || sell.priceImpactPct));
    const route = {
      source: "0x",
      provider: "0x Swap API",
      venue: "0x",
      routeType: "DEX_AGGREGATOR",
      chain,
      tokenAddress,
      contractAddress: tokenAddress,
      poolAddress: poolAddressOf(project),
      quoteAsset: "USDC",
      buyRouteAvailable: true,
      sellRouteAvailable: true,
      buyQuoteVerified: true,
      sellQuoteVerified: true,
      quoteVerified: true,
      quoteTimestamp: timestamp,
      quoteAgeSeconds: quoteAgeSeconds(timestamp, options.now()),
      priceImpactPct: slippage,
      estimatedRoundTripSlippagePct: slippage,
      slippagePct: slippage,
      slippageIsHeuristic: false,
      liquidityUsd: liquidityUsd(project) || null,
      priceUsd: priceUsd(project) || null,
      routeTruthStatus: "SELL_QUOTE_VERIFIED",
      status: "SELL_QUOTE_VERIFIED",
      verificationStatus: "PARTIALLY_VERIFIED",
      regionStatus: "UNKNOWN",
      executionRecoverySource: "0x",
      executionRecoveryFailures: [],
      buyQuote: { verified: true, timestamp },
      sellQuote: { verified: true, timestamp },
    };
    return { adapter: "0x", status: "ROUTE_RECOVERED", route, failures: [] };
  } catch (error) {
    return { adapter: "0x", status: "PROVIDER_FAILED", failures: [error.message] };
  }
}

function parseMarketPair(project = {}) {
  const explicit = clean(marketPairOf(project));
  const symbol = symbolOf(project).replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  const pair = explicit ? explicit.toUpperCase().replace(/[^A-Z0-9]/g, "") : "";
  const quoteAssets = ["USDT", "USDC", "USD"];
  if (pair) {
    for (const quote of quoteAssets) {
      if (pair.endsWith(quote) && pair.length > quote.length) {
        return { base: pair.slice(0, -quote.length), quote, compact: pair };
      }
    }
  }
  return symbol && symbol !== "UNKNOWN" ? { base: symbol, quote: "USDT", compact: `${symbol}USDT` } : null;
}

function orderLevels(value = []) {
  if (!Array.isArray(value)) return [];
  return value.map((level) => {
    if (Array.isArray(level)) return { price: num(level[0]), size: num(level[1]) };
    if (level && typeof level === "object") return { price: num(level.price || level.p), size: num(level.size || level.quantity || level.q || level.amount) };
    return { price: 0, size: 0 };
  }).filter((level) => level.price > 0 && level.size > 0);
}

function extractOrderBook(data = {}) {
  if (data.result && typeof data.result === "object" && !Array.isArray(data.result)) {
    const firstResult = Object.values(data.result)[0];
    if (firstResult?.bids || firstResult?.asks) return { bids: orderLevels(firstResult.bids), asks: orderLevels(firstResult.asks) };
  }
  return {
    bids: orderLevels(data.bids),
    asks: orderLevels(data.asks),
  };
}

function depthUsd(levels = [], limitUsd = 100) {
  let total = 0;
  for (const level of levels) {
    total += level.price * level.size;
    if (total >= limitUsd) break;
  }
  return Math.round(total * 100) / 100;
}

async function tryCexBook(provider, product, options, signal) {
  if (signal?.aborted) throw new Error("CEX order-book request aborted before start.");
  const urls = {
    coinbase: `https://api.exchange.coinbase.com/products/${product.base}-${product.quote === "USDT" ? "USD" : product.quote}/book?level=2`,
    kraken: `https://api.kraken.com/0/public/Depth?pair=${product.base}${product.quote}&count=25`,
    gate: `https://api.gateio.ws/api/v4/spot/order_book?currency_pair=${product.base}_${product.quote}&limit=20`,
    mexc: `https://api.mexc.com/api/v3/depth?symbol=${product.base}${product.quote}&limit=20`,
  };
  const data = await options.fetchJson(urls[provider], {
    timeoutMs: options.requestTimeoutMs,
    signal,
    adapter: provider,
  });
  const book = extractOrderBook(data);
  const bestBid = book.bids[0]?.price || 0;
  const bestAsk = book.asks[0]?.price || 0;
  if (!bestBid || !bestAsk) return { status: "EMPTY_BOOK", provider };
  const bidDepthUsd = depthUsd(book.bids, 500);
  const askDepthUsd = depthUsd(book.asks, 500);
  const mid = (bestBid + bestAsk) / 2;
  const spreadPct = mid > 0 ? Math.round(((bestAsk - bestBid) / mid) * 10_000) / 100 : null;
  return {
    status: "ORDER_BOOK_RECOVERED",
    provider,
    bidDepthUsd,
    askDepthUsd,
    orderBookDepthUsd: Math.min(bidDepthUsd, askDepthUsd),
    spreadPct,
  };
}

export async function recoverCexOrderBookRoute(project = {}, options = {}, signal = null) {
  const product = parseMarketPair(project);
  if (!product) return { adapter: "cex-order-book", status: "MISSING_MARKET_PAIR", reason: "No exact spot market pair could be inferred." };
  const timestamp = quoteTimestamp(options);
  const failures = [];
  for (const provider of ["coinbase", "kraken", "gate", "mexc"]) {
    try {
      const book = await tryCexBook(provider, product, options, signal);
      if (book.status !== "ORDER_BOOK_RECOVERED") {
        failures.push(`${provider}: ${book.status}`);
        continue;
      }
      const route = {
        source: provider,
        provider,
        venue: provider === "mexc" ? "MEXC" : provider === "gate" ? "Gate" : provider === "kraken" ? "Kraken" : "Coinbase",
        routeType: "CEX",
        chain: null,
        marketPair: `${product.base}-${product.quote}`,
        quoteAsset: product.quote,
        buyRouteAvailable: true,
        sellRouteAvailable: true,
        buyQuoteVerified: true,
        sellQuoteVerified: true,
        orderBookDepthVerified: true,
        quoteVerified: true,
        quoteTimestamp: timestamp,
        quoteAgeSeconds: quoteAgeSeconds(timestamp, options.now()),
        bidDepthUsd: book.bidDepthUsd,
        askDepthUsd: book.askDepthUsd,
        orderBookDepthUsd: book.orderBookDepthUsd,
        spreadPct: book.spreadPct,
        estimatedRoundTripSlippagePct: book.spreadPct,
        slippagePct: book.spreadPct,
        slippageIsHeuristic: false,
        routeTruthStatus: "ORDER_BOOK_DEPTH_VERIFIED",
        status: "ORDER_BOOK_DEPTH_VERIFIED",
        verificationStatus: "PARTIALLY_VERIFIED",
        regionStatus: "UNKNOWN",
        exactIdentityVerified: false,
        executionRecoverySource: provider,
        executionRecoveryFailures: failures,
        buyQuote: { verified: true, timestamp },
        sellQuote: { verified: true, timestamp },
      };
      return { adapter: "cex-order-book", status: "ROUTE_RECOVERED", route, failures };
    } catch (error) {
      failures.push(`${provider}: ${error.message}`);
    }
  }
  return { adapter: "cex-order-book", status: "PROVIDER_FAILED", failures };
}

function rankRoute(route = {}) {
  const statusScore = {
    LIVE_EXECUTION_READY: 100,
    ORDER_BOOK_DEPTH_VERIFIED: 82,
    SELL_QUOTE_VERIFIED: 78,
    BUY_QUOTE_VERIFIED: 48,
  }[route.routeTruthStatus] || 0;
  return statusScore + Math.min(20, num(route.orderBookDepthUsd || route.liquidityUsd) / 25_000);
}

async function recoverProject(project = {}, recoveryMeta = {}, options = {}, signal = null) {
  const adapterResults = [];
  const routeFailures = [];
  const chain = chainOf(project);
  const adapters = [];
  if (chain === "solana") adapters.push(recoverSolanaJupiterRoute);
  if (chainDefinition(chain)?.kind === "evm") adapters.push(recoverZeroXRoute);
  adapters.push(recoverCexOrderBookRoute);

  for (const adapter of adapters) {
    if (signal?.aborted) {
      adapterResults.push({ adapter: adapter.name, status: "TIMED_OUT" });
      break;
    }
    const result = await adapter(project, options, signal);
    adapterResults.push(result);
    if (result.status === "ROUTE_RECOVERED" && result.route) break;
    if (signal?.aborted) {
      adapterResults.push({ adapter: adapter.name, status: "TIMED_OUT" });
      break;
    }
    routeFailures.push(...array(result.failures), result.reason || result.status);
  }

  const recoveredRoutes = adapterResults.map((item) => item.route).filter(Boolean);
  const bestRoute = recoveredRoutes.sort((a, b) => rankRoute(b) - rankRoute(a))[0] || null;
  const buyOnly = adapterResults.some((item) => item.buyQuoteVerified === true && item.sellQuoteVerified !== true);
  const optionalGaps = adapterResults
    .filter((item) => item.status === "OPTIONAL_KEY_MISSING")
    .map((item) => ({ source: item.adapter, missingKey: item.missingKey, reason: item.reason }));
  const collectedFailures = [
    ...routeFailures,
    ...adapterResults.flatMap((item) => array(item.failures)),
    ...adapterResults.map((item) => item.reason || item.status),
  ].filter(Boolean);

  const status = bestRoute
    ? "ROUTE_RECOVERED"
    : buyOnly
      ? "BUY_ONLY_ROUTE"
      : adapterResults.some((item) => item.status === "OPTIONAL_KEY_MISSING") && adapterResults.length === 1
        ? "OPTIONAL_SOURCE_SKIPPED"
        : "NO_ROUTE_RECOVERED";

  const executionProofRecovery = {
    status,
    attempted: true,
    selected: true,
    recoveryRank: recoveryMeta.recoveryRank,
    recoveryScore: Math.round(recoveryMeta.score),
    candidateKey: identityKey(project),
    adapterResults: adapterResults.map((item) => ({
      adapter: item.adapter,
      status: item.status,
      missingKey: item.missingKey || null,
      reason: item.reason || null,
      failures: array(item.failures).slice(0, 5),
    })),
    executionRecoverySource: bestRoute?.executionRecoverySource || null,
    executionRecoveryFailures: [...new Set(collectedFailures)].slice(0, 12),
    optionalSourceGaps: optionalGaps,
    buyQuoteVerified: bestRoute?.buyQuoteVerified === true || buyOnly,
    sellQuoteVerified: bestRoute?.sellQuoteVerified === true,
    routeTruthStatus: bestRoute?.routeTruthStatus || null,
    quoteTimestamp: bestRoute?.quoteTimestamp || null,
    quoteAgeSeconds: bestRoute?.quoteAgeSeconds ?? null,
    newlyPromotedToExecutionReview: Boolean(bestRoute?.buyQuoteVerified && bestRoute?.sellQuoteVerified),
  };

  if (!bestRoute) {
    return {
      ...project,
      executionProofRecovery,
      executionRecoverySourceGaps: optionalGaps,
    };
  }

  const existingRoutes = array(project.executionRoutes);
  const canonicalExecutionRoute = {
    ...(project.canonicalExecutionRoute || {}),
    status: bestRoute.status || project.canonicalExecutionRoute?.status || "PARTIALLY_VERIFIED",
    venue: bestRoute.venue || project.canonicalExecutionRoute?.venue || "UNKNOWN",
    routeType: bestRoute.routeType || project.canonicalExecutionRoute?.routeType || "UNKNOWN",
    chain: bestRoute.chain || project.canonicalExecutionRoute?.chain || chainOf(project),
    contractAddress: bestRoute.contractAddress || bestRoute.tokenAddress || project.canonicalExecutionRoute?.contractAddress || tokenAddressOf(project),
    pairAddress: bestRoute.poolAddress || bestRoute.pairAddress || project.canonicalExecutionRoute?.pairAddress || poolAddressOf(project),
    quoteAsset: bestRoute.quoteAsset || project.canonicalExecutionRoute?.quoteAsset || null,
    buyRouteAvailable: bestRoute.buyRouteAvailable === true,
    sellRouteAvailable: bestRoute.sellRouteAvailable === true,
    buyQuoteVerified: bestRoute.buyQuoteVerified === true,
    sellQuoteVerified: bestRoute.sellQuoteVerified === true,
    exactIdentityVerified: bestRoute.exactIdentityVerified === true ||
      Boolean(bestRoute.routeType !== "CEX" && bestRoute.chain && bestRoute.tokenAddress && (bestRoute.poolAddress || bestRoute.routeType === "DEX_AGGREGATOR")),
    routeTruthStatus: bestRoute.routeTruthStatus || "SELL_QUOTE_VERIFIED",
    liquidityUsd: bestRoute.liquidityUsd ?? liquidityUsd(project) ?? null,
    priceUsd: bestRoute.priceUsd ?? priceUsd(project) ?? null,
    quoteTimestamp: bestRoute.quoteTimestamp || null,
    quoteAgeSeconds: bestRoute.quoteAgeSeconds ?? null,
    marketPair: bestRoute.marketPair || project.canonicalExecutionRoute?.marketPair || null,
    supportingSources: [...new Set([
      ...array(project.canonicalExecutionRoute?.supportingSources),
      bestRoute.source,
      bestRoute.provider,
      bestRoute.venue,
    ].filter(Boolean))],
    failureReasons: bestRoute.executionRecoveryFailures || [],
  };
  return {
    ...project,
    executionProofRecovery,
    canonicalExecutionRoute,
    canonicalExecutionRouteStatus: canonicalExecutionRoute.status,
    canonicalExecutionRouteVenue: canonicalExecutionRoute.venue,
    canonicalExecutionRouteType: canonicalExecutionRoute.routeType,
    canonicalRouteBuyAvailable: canonicalExecutionRoute.buyRouteAvailable,
    canonicalRouteSellAvailable: canonicalExecutionRoute.sellRouteAvailable,
    executionProofRecoveryRoute: bestRoute,
    executionProofRecoveryRoutes: recoveredRoutes,
    executionRoute: bestRoute,
    executionRoutes: [bestRoute, ...existingRoutes],
    purchaseRoute: project.purchaseRoute || bestRoute,
    buyQuoteVerified: bestRoute.buyQuoteVerified === true,
    sellQuoteVerified: bestRoute.sellQuoteVerified === true,
    quoteTimestamp: bestRoute.quoteTimestamp,
    quoteAgeSeconds: bestRoute.quoteAgeSeconds,
    estimatedRoundTripSlippagePct: bestRoute.estimatedRoundTripSlippagePct,
    priceImpactPct: bestRoute.priceImpactPct,
    slippagePct: bestRoute.slippagePct,
    slippageIsHeuristic: false,
    orderBookDepthUsd: Math.max(num(project.orderBookDepthUsd), num(bestRoute.orderBookDepthUsd)),
    bidDepthUsd: Math.max(num(project.bidDepthUsd), num(bestRoute.bidDepthUsd)),
    askDepthUsd: Math.max(num(project.askDepthUsd), num(bestRoute.askDepthUsd)),
    routeTruthStatus: bestRoute.routeTruthStatus,
    executionRecoverySource: bestRoute.executionRecoverySource,
    executionRecoveryFailures: bestRoute.executionRecoveryFailures,
    evidence: [
      ...(project.evidence || []),
      {
        engine: "Execution Proof Recovery",
        source: bestRoute.executionRecoverySource || "execution-proof-recovery",
        family: "execution",
        signal: bestRoute.routeTruthStatus,
        score: Math.min(92, 55 + rankRoute(bestRoute) / 2),
        confidence: 0.74,
        impact: "Risk Control",
        reasons: [
          `Recovered ${bestRoute.venue || bestRoute.provider || "route"} ${bestRoute.routeType || "route"} evidence.`,
          bestRoute.sellQuoteVerified
            ? "Fresh buy and sell quote evidence was recovered for execution review."
            : "Buy evidence recovered, but sell proof remains missing.",
        ],
      },
    ],
  };
}

async function mapLimit(items = [], limit = 2, iterator) {
  const output = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      output[index] = await iterator(items[index], index);
    }
  });
  await Promise.all(workers);
  return output;
}

export async function analyzeExecutionProofRecoveryBatch(projects = [], options = {}) {
  const resolved = resolveOptions(options);
  const safe = Array.isArray(projects) ? projects : [];
  if (!resolved.enabled || !safe.length) {
    return safe.map((project) => ({
      ...project,
      executionProofRecovery: {
        status: resolved.enabled ? "NO_PROJECTS" : "DISABLED",
        attempted: false,
        selected: false,
      },
    }));
  }

  const selected = selectExecutionRecoveryCandidates(safe, resolved);
  const selectedByIndex = new Map(selected.map((item) => [item.index, item]));
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  if (options.signal) {
    if (options.signal.aborted) controller?.abort(options.signal.reason);
    else options.signal.addEventListener("abort", () => controller?.abort(options.signal.reason), { once: true });
  }
  const timer = controller ? setTimeout(() => controller.abort("execution proof recovery timed out"), resolved.timeoutMs) : null;
  const recoveredByIndex = new Map();

  try {
    await mapLimit(selected, resolved.concurrency, async (item) => {
      const recovered = await recoverProject(item.project, item, resolved, controller?.signal || options.signal);
      recoveredByIndex.set(item.index, recovered);
    });
  } finally {
    if (timer) clearTimeout(timer);
  }

  const recoveredCount = [...recoveredByIndex.values()].filter((project) => project.executionProofRecovery?.status === "ROUTE_RECOVERED").length;
  const stage = {
    stageStatus: selected.length ? "COMPLETE" : "NO_CANDIDATES",
    selectedCandidates: selected.length,
    attemptedCandidates: recoveredByIndex.size,
    recoveredRoutes: recoveredCount,
    buyOnlyRoutes: [...recoveredByIndex.values()].filter((project) => project.executionProofRecovery?.status === "BUY_ONLY_ROUTE").length,
    optionalSourceGapCount: [...recoveredByIndex.values()].flatMap((project) => project.executionProofRecovery?.optionalSourceGaps || []).length,
    maxCandidates: resolved.maxCandidates,
    concurrency: resolved.concurrency,
  };

  return safe.map((project, index) => {
    const recovered = recoveredByIndex.get(index);
    if (recovered) return { ...recovered, executionProofRecoveryStage: stage };
    const selectedMeta = selectedByIndex.get(index);
    return {
      ...project,
      executionProofRecovery: {
        status: selectedMeta ? "NOT_ATTEMPTED" : "NOT_SELECTED",
        attempted: false,
        selected: Boolean(selectedMeta),
        reason: selectedMeta
          ? "Recovery ended before this selected candidate was attempted."
          : "Outside the execution recovery budget or did not need execution proof recovery.",
      },
      executionProofRecoveryStage: stage,
    };
  });
}
