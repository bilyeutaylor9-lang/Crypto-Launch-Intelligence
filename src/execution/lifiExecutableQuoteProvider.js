import crypto from "node:crypto";

import { SUPPORTED_CHAIN_REGISTRY } from "../data/chainAliasRegistry.js";
import {
  normalizeChainId,
  normalizePoolAddress,
  normalizeTokenAddress,
} from "../identity/strictIdentityValidators.js";

const LIFI_BASE_URL = "https://li.quest/v1";
const DEFAULT_QUOTE_ADDRESS = "0x0000000000000000000000000000000000000001";
const DEFAULT_KEYLESS_REQUEST_BUDGET = 70;
const DEFAULT_KEYLESS_WINDOW_MS = 2 * 60 * 60 * 1_000;

export const LIFI_STABLE_QUOTE_TOKENS = Object.freeze({
  ethereum: { chainId: 1, address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6, symbol: "USDC", priceUsd: 1 },
  base: { chainId: 8453, address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6, symbol: "USDC", priceUsd: 1 },
  bsc: { chainId: 56, address: "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d", decimals: 18, symbol: "USDC", priceUsd: 1 },
  arbitrum: { chainId: 42161, address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", decimals: 6, symbol: "USDC", priceUsd: 1 },
  polygon: { chainId: 137, address: "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359", decimals: 6, symbol: "USDC", priceUsd: 1 },
  optimism: { chainId: 10, address: "0x0b2c639c533813f4aa9d7837caf62653d097ff85", decimals: 6, symbol: "USDC", priceUsd: 1 },
  avalanche: { chainId: 43114, address: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E", decimals: 6, symbol: "USDC", priceUsd: 1 },
});

const sharedKeylessBudget = {
  windowStartedAtMs: 0,
  requests: 0,
};

function text(value = "") {
  return String(value ?? "").trim();
}

function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function sha256(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function currentDate(options = {}) {
  const value = typeof options.now === "function" ? options.now() : options.now;
  const date = value instanceof Date ? value : value ? new Date(value) : new Date();
  return Number.isFinite(date.getTime()) ? date : new Date();
}

function decimalFromAtomic(value, decimals) {
  try {
    const units = BigInt(String(value));
    const places = Number(decimals);
    if (!Number.isInteger(places) || places < 0 || places > 36 || units < 0n) return null;
    const scale = 10n ** BigInt(places);
    const whole = units / scale;
    const remainder = (units % scale).toString().padStart(places, "0").replace(/0+$/, "");
    const parsed = Number(remainder ? `${whole}.${remainder}` : String(whole));
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function atomicFromDecimal(value, decimals) {
  const number = finite(value);
  const places = Number(decimals);
  if (number === null || number <= 0 || !Number.isInteger(places) || places < 0 || places > 36) return null;
  const fixed = number.toFixed(places);
  const [whole, fraction = ""] = fixed.split(".");
  try {
    return String(BigInt(whole) * 10n ** BigInt(places) + BigInt(fraction.padEnd(places, "0") || "0"));
  } catch {
    return null;
  }
}

function sumUsd(rows = []) {
  return (Array.isArray(rows) ? rows : []).reduce((sum, row) => sum + (finite(row?.amountUSD) || 0), 0);
}

function nonNegativeBps(inputUsd, outputUsd, gasUsd = 0) {
  const input = finite(inputUsd);
  const output = finite(outputUsd);
  const gas = finite(gasUsd) || 0;
  if (input === null || input <= 0 || output === null) return null;
  const bps = ((input - (output - gas)) / input) * 10_000;
  return Number.isFinite(bps) && bps >= 0 ? Number(bps.toFixed(3)) : null;
}

function tokenIdentity(token = {}, chain = null) {
  const tokenChain = normalizeChainId(token.chainId || chain);
  const address = normalizeTokenAddress(token.address, tokenChain);
  const decimals = Number(token.decimals);
  if (!tokenChain || !address || !Number.isInteger(decimals) || decimals < 0 || decimals > 36) return null;
  return {
    chain: tokenChain,
    chainId: SUPPORTED_CHAIN_REGISTRY[tokenChain]?.chainId ?? token.chainId,
    address,
    decimals,
    symbol: token.symbol || null,
    priceUsd: finite(token.priceUSD ?? token.priceUsd),
  };
}

export function extractLiFiRoutePoolAddresses(payload = {}, chain = null) {
  const found = new Set();
  const seen = new Set();
  const visit = (value, depth = 0) => {
    if (!value || depth > 8) return;
    if (typeof value !== "object") return;
    if (seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
      for (const item of value) visit(item, depth + 1);
      return;
    }
    for (const [key, item] of Object.entries(value)) {
      if (["pooladdress", "pairaddress", "routepooladdress", "ammkey"].includes(key.toLowerCase())) {
        const address = normalizePoolAddress(item, chain);
        if (address) found.add(address);
      }
      if (["includedsteps", "estimate", "data", "protocols", "route", "routes", "swapinfo"].includes(key.toLowerCase())) {
        visit(item, depth + 1);
      }
    }
  };
  visit(payload);
  return [...found];
}

function requestBudget(options = {}) {
  return options.rateBudget || sharedKeylessBudget;
}

function consumeKeylessBudget(options = {}) {
  if (options.apiKey) return;
  const nowMs = currentDate(options).getTime();
  const windowMs = Math.max(60_000, Number(options.keylessWindowMs || process.env.LIFI_KEYLESS_WINDOW_MS || DEFAULT_KEYLESS_WINDOW_MS));
  const maximum = Math.max(1, Number(options.keylessRequestBudget || process.env.LIFI_KEYLESS_REQUEST_BUDGET || DEFAULT_KEYLESS_REQUEST_BUDGET));
  const budget = requestBudget(options);
  if (!budget.windowStartedAtMs || nowMs - budget.windowStartedAtMs >= windowMs) {
    budget.windowStartedAtMs = nowMs;
    budget.requests = 0;
  }
  if (budget.requests >= maximum) {
    const error = new Error("LI.FI keyless request budget exhausted for the current rate-limit window.");
    error.code = "LIFI_KEYLESS_BUDGET_EXHAUSTED";
    error.retryAt = new Date(budget.windowStartedAtMs + windowMs).toISOString();
    throw error;
  }
  budget.requests += 1;
}

async function fetchLiFiJson(url, options = {}) {
  consumeKeylessBudget(options);
  if (options.fetchJson) return options.fetchJson(url, { headers: options.headers || {}, adapter: "lifi-keyless-forward" });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(500, Number(options.timeoutMs || 8_000)));
  try {
    const response = await (options.fetchImpl || fetch)(url, {
      headers: options.headers || {},
      signal: controller.signal,
    });
    if (!response.ok) {
      const error = new Error(`LI.FI request failed: HTTP ${response.status}`);
      error.code = response.status === 429 ? "RATE_LIMITED" : `HTTP_${response.status}`;
      throw error;
    }
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function resolveQuoteToken(chain, options = {}) {
  const staticToken = LIFI_STABLE_QUOTE_TOKENS[chain];
  if (staticToken) return { ...staticToken, address: normalizeTokenAddress(staticToken.address, chain) };
  const definition = SUPPORTED_CHAIN_REGISTRY[chain];
  if (!definition || definition.kind !== "evm" || !Number.isInteger(definition.chainId)) return null;
  const cacheKey = `${definition.chainId}:usdc`;
  if (options.tokenCache.has(cacheKey)) return options.tokenCache.get(cacheKey);
  const url = new URL(`${options.baseUrl}/token`);
  url.searchParams.set("chain", String(definition.chainId));
  url.searchParams.set("token", "USDC");
  const raw = await fetchLiFiJson(url.toString(), options);
  const token = tokenIdentity(raw, chain);
  const resolved = token ? { ...token, priceUsd: token.priceUsd || 1 } : null;
  options.tokenCache.set(cacheKey, resolved);
  return resolved;
}

async function resolveTargetToken(chain, address, payload, side, options = {}) {
  const actionToken = side === "BUY" ? payload?.action?.toToken : payload?.action?.fromToken;
  const actionIdentity = tokenIdentity(actionToken, chain);
  if (actionIdentity?.address === address) {
    options.tokenCache.set(`${chain}:${address}`, actionIdentity);
    return actionIdentity;
  }
  const cacheKey = `${chain}:${address}`;
  if (options.tokenCache.has(cacheKey)) return options.tokenCache.get(cacheKey);
  const definition = SUPPORTED_CHAIN_REGISTRY[chain];
  if (!definition || !Number.isInteger(definition.chainId)) return null;
  const url = new URL(`${options.baseUrl}/token`);
  url.searchParams.set("chain", String(definition.chainId));
  url.searchParams.set("token", address);
  const raw = await fetchLiFiJson(url.toString(), options);
  const token = tokenIdentity(raw, chain);
  const resolved = token?.address === address ? token : null;
  options.tokenCache.set(cacheKey, resolved);
  return resolved;
}

function verifyActionIdentity(payload = {}, expected = {}) {
  const fromToken = tokenIdentity(payload.action?.fromToken, expected.chain);
  const toToken = tokenIdentity(payload.action?.toToken, expected.chain);
  if (!fromToken || !toToken || fromToken.chain !== expected.chain || toToken.chain !== expected.chain) {
    throw new Error("LI.FI quote response is missing exact same-chain token identity.");
  }
  if (expected.side === "BUY") {
    if (fromToken.address !== expected.quoteTokenAddress || toToken.address !== expected.tokenAddress) {
      throw new Error("LI.FI BUY quote response identity does not match the requested contracts.");
    }
  } else if (fromToken.address !== expected.tokenAddress || toToken.address !== expected.quoteTokenAddress) {
    throw new Error("LI.FI SELL quote response identity does not match the requested contracts.");
  }
  return { fromToken, toToken };
}

function normalizeLiFiQuote(payload = {}, request = {}, identity = {}, tokens = {}, context = {}) {
  const { fromToken, toToken } = tokens;
  const fromAmountAtomic = payload.estimate?.fromAmount || payload.action?.fromAmount;
  const toAmountAtomic = payload.estimate?.toAmount;
  const inputTokenAmount = decimalFromAtomic(fromAmountAtomic, fromToken.decimals);
  const outputTokenAmount = decimalFromAtomic(toAmountAtomic, toToken.decimals);
  const inputPriceUsd = fromToken.priceUsd ?? (request.side === "SELL" ? finite(request.referencePriceUsd) : 1);
  const outputPriceUsd = toToken.priceUsd ?? (request.side === "BUY" ? finite(request.referencePriceUsd) : 1);
  const inputUsd = finite(payload.estimate?.fromAmountUSD) ?? (
    inputTokenAmount !== null && inputPriceUsd !== null ? inputTokenAmount * inputPriceUsd : null
  );
  const outputUsd = finite(payload.estimate?.toAmountUSD) ?? (
    outputTokenAmount !== null && outputPriceUsd !== null ? outputTokenAmount * outputPriceUsd : null
  );
  const gasUsd = sumUsd(payload.estimate?.gasCosts);
  const protocolFeeUsd = sumUsd(payload.estimate?.feeCosts);
  const priceImpactBps = nonNegativeBps(inputUsd, outputUsd, 0);
  const allInCostBps = nonNegativeBps(inputUsd, outputUsd, gasUsd);
  const protocolFeeBps = inputUsd && inputUsd > 0
    ? Number(((protocolFeeUsd / inputUsd) * 10_000).toFixed(3))
    : null;
  const pools = extractLiFiRoutePoolAddresses(payload, identity.chain);
  const exactRequestedPool = pools.find((pool) => pool === request.poolAddress) || null;
  const capturedAt = currentDate(context).toISOString();
  const sourceUrl = context.sourceUrl || null;
  return {
    side: request.side,
    chain: identity.chain,
    chainId: identity.chainId,
    tokenAddress: identity.tokenAddress,
    fromTokenAddress: fromToken.address,
    toTokenAddress: toToken.address,
    poolAddress: exactRequestedPool,
    routePoolAddresses: pools,
    routeIdentityVerified: Boolean(exactRequestedPool),
    requestedNotionalUsd: finite(request.requestedNotionalUsd),
    inputUsd,
    outputUsd,
    inputTokenAmount,
    outputTokenAmount,
    referencePriceUsd: finite(request.referencePriceUsd),
    priceImpactBps,
    protocolFeeBps,
    gasUsd,
    allInCostBps,
    provider: "LI.FI Keyless",
    quoteId: payload.id || null,
    capturedAt,
    route: {
      provider: "LI.FI",
      tool: payload.tool || payload.estimate?.tool || null,
      fromTokenAddress: fromToken.address,
      toTokenAddress: toToken.address,
      poolAddress: exactRequestedPool,
      poolAddresses: pools,
      exactRequestedPoolObserved: Boolean(exactRequestedPool),
      sourceUrl,
      rawEvidenceHash: sha256(payload),
    },
    sourceUrl,
    rawEvidenceHash: sha256(payload),
    rawEvidence: payload,
    quoteOnly: true,
    unsigned: true,
    transactionSubmitted: false,
    automaticTrading: false,
    shadowOnly: true,
    rankingInfluence: false,
  };
}

export function createLiFiExecutableQuoteProvider(factoryOptions = {}) {
  const tokenCache = factoryOptions.tokenCache || new Map();
  const baseUrl = text(factoryOptions.baseUrl || process.env.LIFI_BASE_URL || LIFI_BASE_URL).replace(/\/$/, "");
  const apiKey = text(factoryOptions.apiKey ?? process.env.LIFI_API_KEY);
  const takerAddress = normalizeTokenAddress(
    factoryOptions.takerAddress || process.env.EXECUTION_QUOTE_TAKER_ADDRESS || DEFAULT_QUOTE_ADDRESS,
    "ethereum",
  );
  if (!takerAddress) return null;
  const integrator = text(factoryOptions.integrator || process.env.LIFI_INTEGRATOR || "crypto-launch-intel")
    .replace(/[^A-Za-z0-9._-]/g, "-")
    .slice(0, 23) || "crypto-launch-intel";
  const common = {
    ...factoryOptions,
    apiKey,
    baseUrl,
    tokenCache,
    headers: {
      accept: "application/json",
      ...(apiKey ? { "x-lifi-api-key": apiKey } : {}),
      ...(factoryOptions.headers || {}),
    },
  };

  const provider = async (request = {}) => {
    if (request.operation && request.operation !== "QUOTE_ONLY") throw new Error("LI.FI provider only permits QUOTE_ONLY requests.");
    if (request.allowOrderSubmission === true || request.allowTransactionSubmission === true) {
      throw new Error("LI.FI provider refuses transaction or order submission.");
    }
    const side = text(request.side || "BUY").toUpperCase();
    if (!["BUY", "SELL"].includes(side)) throw new Error("LI.FI quote side must be BUY or SELL.");
    const chain = normalizeChainId(request.chain);
    const definition = SUPPORTED_CHAIN_REGISTRY[chain];
    const tokenAddress = normalizeTokenAddress(request.tokenAddress, chain);
    if (!chain || definition?.kind !== "evm" || !Number.isInteger(definition.chainId) || !tokenAddress) {
      throw new Error("LI.FI keyless forward quotes require an exact EVM chain and token contract.");
    }
    const quoteToken = await resolveQuoteToken(chain, common);
    if (!quoteToken) throw new Error(`LI.FI has no verified stable quote token for ${chain}.`);

    let fromToken;
    let toToken;
    let fromAmount;
    if (side === "BUY") {
      const quoteTokenPrice = quoteToken.priceUsd || 1;
      fromAmount = atomicFromDecimal(finite(request.requestedNotionalUsd) / quoteTokenPrice, quoteToken.decimals);
      fromToken = quoteToken.address;
      toToken = tokenAddress;
    } else {
      const cachedTarget = tokenCache.get(`${chain}:${tokenAddress}`);
      const targetToken = cachedTarget || await resolveTargetToken(chain, tokenAddress, {}, side, common);
      if (!targetToken) throw new Error("LI.FI could not verify target-token decimals for the SELL quote.");
      fromAmount = atomicFromDecimal(request.inputTokenAmount, targetToken.decimals);
      fromToken = tokenAddress;
      toToken = quoteToken.address;
    }
    if (!fromAmount) throw new Error("LI.FI quote amount could not be represented in token units.");

    const url = new URL(`${baseUrl}/quote`);
    url.searchParams.set("fromChain", String(definition.chainId));
    url.searchParams.set("toChain", String(definition.chainId));
    url.searchParams.set("fromToken", fromToken);
    url.searchParams.set("toToken", toToken);
    url.searchParams.set("fromAmount", fromAmount);
    url.searchParams.set("fromAddress", takerAddress);
    url.searchParams.set("toAddress", takerAddress);
    url.searchParams.set("slippage", String(factoryOptions.slippage || 0.01));
    url.searchParams.set("integrator", integrator);
    const payload = await fetchLiFiJson(url.toString(), common);
    const tokens = verifyActionIdentity(payload, {
      side,
      chain,
      tokenAddress,
      quoteTokenAddress: quoteToken.address,
    });
    if (side === "BUY") tokenCache.set(`${chain}:${tokenAddress}`, tokens.toToken);
    return normalizeLiFiQuote(payload, { ...request, side }, {
      chain,
      chainId: definition.chainId,
      tokenAddress,
    }, tokens, {
      ...common,
      sourceUrl: url.toString(),
    });
  };

  provider.providerName = apiKey ? "LI.FI" : "LI.FI Keyless";
  provider.transport = "LIFI_READ_ONLY_QUOTE_API";
  provider.endpoint = `${baseUrl}/quote`;
  provider.keyless = !apiKey;
  provider.quoteOnly = true;
  return provider;
}

export const __lifiExecutableQuoteHooks = {
  atomicFromDecimal,
  decimalFromAtomic,
  nonNegativeBps,
  normalizeLiFiQuote,
  routePoolAddresses: extractLiFiRoutePoolAddresses,
  verifyActionIdentity,
  consumeKeylessBudget,
  currentDate,
};
