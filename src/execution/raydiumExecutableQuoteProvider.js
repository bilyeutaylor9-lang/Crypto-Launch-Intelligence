import { normalizeChainId, normalizePoolAddress, normalizeTokenAddress } from "../identity/strictIdentityValidators.js";
import { createProviderRequestAdmission, PROVIDER_REQUEST_ADMISSION } from "./providerRequestAdmission.js";

const QUOTE_URL = "https://transaction-v1.raydium.io/compute/swap-base-in";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const QUOTE_TTL_MS = 30_000;
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 100;
const sharedBudget = { startedAt: null, requests: 0, retryAt: 0 };

function quantity(value) {
  if (typeof value !== "string" || !/^\d{1,20}$/.test(value)) return null;
  const parsed = BigInt(value);
  return parsed > 0n && parsed <= 2n ** 64n - 1n ? parsed : null;
}

function identity(values, normalize) {
  const supplied = values.filter(value => value !== undefined && value !== null && value !== "");
  const normalized = supplied.map(normalize);
  return normalized.length && normalized.every(Boolean) && new Set(normalized).size === 1 ? normalized[0] : null;
}

function candidateIdentity(project) {
  const chain = identity([project.chain, project.chainId, project.canonicalExecutionRoute?.chain], normalizeChainId);
  const token = identity([project.tokenAddress, project.contractAddress, project.mintAddress,
    project.canonicalExecutionRoute?.contractAddress], value => normalizeTokenAddress(value, "solana"));
  const pool = identity([project.poolAddress, project.pairAddress, project.canonicalExecutionRoute?.poolAddress,
    project.canonicalExecutionRoute?.pairAddress], value => normalizePoolAddress(value, "solana"));
  return chain === "solana" && token && pool && token !== pool ? { chain, token, pool } : null;
}

function unattested(message) {
  const error = new Error(message);
  error.code = "IDENTITY_OR_POOL_UNATTESTED";
  throw error;
}

// The path must attest the requested mint pair and the token-adjacent pool, not just contain a pool string.
export function verifyRaydiumQuote(quote, { fromToken, toToken, fromAmount, poolAddress } = {}) {
  const data = quote?.data;
  if (quote?.success !== true || typeof quote.id !== "string" || !quote.id.trim() ||
      !data || data.swapType !== "BaseIn" || data.inputMint !== fromToken || data.outputMint !== toToken ||
      normalizeTokenAddress(fromToken, "solana") !== fromToken || normalizeTokenAddress(toToken, "solana") !== toToken ||
      fromToken === toToken || (data.chainId !== undefined && normalizeChainId(data.chainId) !== "solana") ||
      quantity(fromAmount) === null || quantity(data.inputAmount) !== quantity(fromAmount) ||
      quantity(data.outputAmount) === null || quantity(data.otherAmountThreshold) === null ||
      quantity(data.otherAmountThreshold) > quantity(data.outputAmount) || data.slippageBps !== 100 ||
      !Array.isArray(data.routePlan) || !data.routePlan.length || data.routePlan.length > 8) {
    unattested("Raydium quote did not attest the requested exact mint pair and atomic amounts.");
  }
  let previous = fromToken;
  const visitedMints = new Set([fromToken]);
  const pools = [];
  for (const step of data.routePlan) {
    if (!step || normalizePoolAddress(step.poolId, "solana") !== step.poolId ||
        normalizeTokenAddress(step.inputMint, "solana") !== step.inputMint ||
        normalizeTokenAddress(step.outputMint, "solana") !== step.outputMint ||
        step.inputMint !== previous || visitedMints.has(step.outputMint) || pools.includes(step.poolId)) {
      unattested("Raydium quote contains an invalid or disconnected pool path.");
    }
    visitedMints.add(step.outputMint);
    pools.push(step.poolId);
    previous = step.outputMint;
  }
  if (previous !== toToken || (poolAddress && !data.routePlan.some(step => step.poolId === poolAddress &&
      (step.inputMint === fromToken && fromToken !== USDC || step.outputMint === toToken && toToken !== USDC)))) {
    unattested("Raydium quote does not independently attest the requested token-adjacent pool.");
  }
  return { data, pools };
}

function reserveRequest(budget, now) {
  if (budget.startedAt === null || now >= budget.startedAt + WINDOW_MS) {
    budget.startedAt = now;
    budget.requests = 0;
  }
  if (now < budget.retryAt || now < budget.startedAt || budget.requests >= MAX_REQUESTS) {
    const error = new Error("Raydium quote request allowance is exhausted; no request was sent.");
    error.code = "RATE_BUDGET_EXHAUSTED";
    error.retryAt = new Date(Math.max(budget.retryAt || 0, budget.startedAt + WINDOW_MS)).toISOString();
    throw error;
  }
  budget.requests++;
  const reservationWindow = budget.startedAt;
  return () => {
    if (budget.startedAt === reservationWindow && budget.requests > 0) budget.requests--;
  };
}

async function quoteLeg({ fromToken, toToken, fromAmount, poolAddress, options, signal }) {
  if (signal?.aborted) throw new Error("Raydium quote aborted before start.");
  const startedAt = options.now().getTime();
  if (!Number.isFinite(startedAt) || startedAt <= 0) throw new Error("Raydium quote requires a valid observation clock.");
  const budget = options.raydiumRateBudget || sharedBudget;
  const admission = createProviderRequestAdmission(reserveRequest(budget, startedAt));
  const url = new URL(QUOTE_URL);
  for (const [key, value] of Object.entries({ inputMint: fromToken, outputMint: toToken, amount: fromAmount,
    slippageBps: "100", txVersion: "V0" })) url.searchParams.set(key, value);
  let response;
  try {
    response = await options.fetchJson(url.toString(), { method: "GET", adapter: "raydium",
      timeoutMs: options.requestTimeoutMs, signal, [PROVIDER_REQUEST_ADMISSION]: admission });
  } catch (error) {
    if (error?.status === 429) {
      const seconds = Number(error.retryAfter);
      const date = Date.parse(error.retryAfter);
      budget.retryAt = Number.isFinite(seconds) && seconds > 0 ? startedAt + seconds * 1000
        : Number.isFinite(date) && date > startedAt ? date : startedAt + WINDOW_MS;
    }
    throw error;
  }
  const receivedAt = options.now().getTime();
  if (signal?.aborted || !Number.isFinite(receivedAt) || receivedAt < startedAt || receivedAt >= startedAt + QUOTE_TTL_MS) {
    throw new Error("Raydium quote response arrived after its validity window.");
  }
  if (response?.success === false) return { unavailable: true,
    reason: typeof response.msg === "string" ? response.msg.slice(0, 500) : "Raydium reports no quote for this request." };
  const verified = verifyRaydiumQuote(response, { fromToken, toToken, fromAmount, poolAddress });
  return { ...verified, id: response.id, startedAt, expiresAt: startedAt + QUOTE_TTL_MS };
}

function roundTripCost(input, output) {
  const amount = quantity(input);
  const returned = quantity(output);
  if (amount === null || returned === null) return null;
  return returned >= amount ? 0 : Number(((amount - returned) * 1_000_000n + amount / 2n) / amount) / 10_000;
}

function impact(value) {
  if (typeof value !== "number" && (typeof value !== "string" || !/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value))) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function rawLeg(leg) {
  return { verified: true, timestamp: new Date(leg.startedAt).toISOString(), expiresAt: new Date(leg.expiresAt).toISOString(),
    quoteId: leg.id, inputMint: leg.data.inputMint, outputMint: leg.data.outputMint,
    inputAmount: leg.data.inputAmount, outAmount: leg.data.outputAmount,
    otherAmountThreshold: leg.data.otherAmountThreshold, routePoolAddresses: leg.pools };
}

export async function recoverSolanaRaydiumRoute(project = {}, options = {}, signal = null) {
  const result = { adapter: "raydium" };
  if (options.raydiumEnabled === false) return { ...result, status: "DISABLED" };
  const exact = candidateIdentity(project);
  if (!exact) return { ...result, status: "MISSING_OR_CONFLICTING_IDENTITY" };
  if (exact.token === USDC) return { ...result, status: "NOT_APPLICABLE", reason: "USDC is the quote asset, not a speculative target." };
  const tradeUsd = (options.tradeSizesUsd || [25]).find(value => Number.isFinite(value) && value > 0 && value <= 1000);
  if (!tradeUsd) return { ...result, status: "INVALID_TRADE_SIZE" };
  const amount = String(Math.round(tradeUsd * 1e6));
  if (quantity(amount) === null) return { ...result, status: "INVALID_TRADE_SIZE" };
  let buy;
  try {
    buy = await quoteLeg({ fromToken: USDC, toToken: exact.token, fromAmount: amount,
      poolAddress: exact.pool, options, signal });
    if (buy.unavailable) return { ...result, status: "NO_BUY_QUOTE", buyQuoteVerified: false, reason: buy.reason };
    const sell = await quoteLeg({ fromToken: exact.token, toToken: USDC, fromAmount: buy.data.outputAmount,
      poolAddress: exact.pool, options, signal });
    if (sell.unavailable) return { ...result, status: "NO_SELL_QUOTE", buyQuoteVerified: true, sellQuoteVerified: false, reason: sell.reason };
    const expiresAt = Math.min(buy.expiresAt, sell.expiresAt);
    if (options.now().getTime() >= expiresAt) return { ...result, status: "STALE_QUOTES" };
    const slippage = roundTripCost(amount, sell.data.outputAmount);
    if (slippage === null) return { ...result, status: "INVALID_SLIPPAGE_PROOF" };
    const impacts = [impact(buy.data.priceImpactPct), impact(sell.data.priceImpactPct)];
    return { ...result, status: "ROUTE_RECOVERED", route: {
      source: "raydium", provider: "Raydium Trade API", venue: "Raydium", routeType: "DEX",
      chain: "solana", tokenAddress: exact.token, contractAddress: exact.token, baseTokenAddress: exact.token,
      poolAddress: exact.pool, routePoolAddresses: [...new Set([...buy.pools, ...sell.pools])],
      quoteAsset: "USDC", quoteTokenAddress: USDC,
      buyRouteAvailable: true, sellRouteAvailable: true, buyQuoteVerified: true, sellQuoteVerified: true, quoteVerified: true,
      quoteTimestamp: new Date(buy.startedAt).toISOString(), quoteExpiresAt: new Date(expiresAt).toISOString(),
      quoteAgeSeconds: Math.max(0, (options.now().getTime() - buy.startedAt) / 1000),
      slippagePct: slippage, estimatedRoundTripSlippagePct: slippage, slippageIsHeuristic: false,
      ...(impacts.every(value => value !== null) ? { priceImpactPct: impacts[0] + impacts[1] } : {}),
      quoteCostIncludesNetworkFees: false, quoteCostScope: "QUOTED_SWAP_ROUND_TRIP_EXCLUDES_NETWORK_FEES",
      verifiedTradeSizeUsd: tradeUsd, executableDepthUsd: tradeUsd, verifiedDepthSource: "live-buy-sell-quote",
      exactIdentityVerified: true, identityVerificationState: "EXACT_CHAIN_CONTRACT_POOL_ATTESTED",
      routeTruthStatus: "SELL_QUOTE_VERIFIED", status: "SELL_QUOTE_VERIFIED", verificationStatus: "PARTIALLY_VERIFIED",
      executionRecoverySource: "raydium", buyQuote: rawLeg(buy), sellQuote: rawLeg(sell),
    } };
  } catch (error) {
    return { ...result, status: error?.code === "IDENTITY_OR_POOL_UNATTESTED" ? error.code : "PROVIDER_FAILED",
      buyQuoteVerified: Boolean(buy), sellQuoteVerified: false,
      failures: [error?.message || "Raydium quote failed."], providerFailureCode: error?.code || null, retryAt: error?.retryAt || null };
  }
}
