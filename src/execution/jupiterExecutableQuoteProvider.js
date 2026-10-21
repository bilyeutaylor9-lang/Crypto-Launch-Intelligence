import crypto from "node:crypto";
import { normalizeChainId, normalizeTokenAddress, normalizePoolAddress } from "../identity/strictIdentityValidators.js";

export const JUPITER_USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
export const JUPITER_SOL = "So11111111111111111111111111111111111111112";
const BASE = "https://api.jup.ag";
const sharedBudget = { nextAt: 0, requests: [] };
// Predeclared conservative allowances, NOT observed transaction fees. Quote-only
// orders have no taker and can report zero fees. Include two standard ATA rents,
// one signature and a 0.001 SOL priority allowance per leg; never call them free.
export const SOLANA_FEE_ALLOWANCE = Object.freeze({ signature: 5000, priority: 1000000, rent: 4078560 });
const hash = (raw) => crypto.createHash("sha256").update(raw).digest("hex");
function number(value) {
  if (typeof value !== "number" && (typeof value !== "string" || !/^\d+(?:\.\d+)?$/.test(value))) return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
function units(value) {
  if (typeof value !== "string" || !/^[1-9]\d{0,19}$/.test(value)) throw new Error("JUPITER_INVALID_ATOMIC_AMOUNT");
  const n = BigInt(value);
  if (n >= 2n ** 64n) throw new Error("JUPITER_INVALID_ATOMIC_AMOUNT");
  return n;
}
function verifyRoute(payload, request, inputMint, outputMint, amount) {
  if (payload.error || payload.errorCode || payload.transaction || payload.taker || payload.swapMode !== "ExactIn" ||
      payload.inputMint !== inputMint || payload.outputMint !== outputMint || payload.inAmount !== amount) {
    throw new Error("JUPITER_RESPONSE_BINDING_INVALID");
  }
  units(payload.inAmount); units(payload.outAmount);
  const plan = payload.routePlan;
  if (!Array.isArray(plan) || !plan.length || plan.length > 4) throw new Error("JUPITER_ROUTE_MISSING");
  let mint = inputMint;
  const pools = new Set();
  const mints = new Set([inputMint]);
  let priorOutput = amount;
  for (const leg of plan) {
    const info = leg?.swapInfo;
    if (!info || (leg.percent !== 100 && leg.bps !== 10000) ||
        (leg.percent !== undefined && leg.percent !== 100) || (leg.bps !== undefined && leg.bps !== 10000) ||
        info.inputMint !== mint || info.inAmount !== priorOutput || mints.has(info.outputMint) || !normalizeTokenAddress(info.outputMint, "solana") ||
        !normalizePoolAddress(info.ammKey, "solana") || pools.has(info.ammKey)) {
      throw new Error("JUPITER_ROUTE_TOPOLOGY_INVALID");
    }
    units(info.inAmount); units(info.outAmount);
    pools.add(info.ammKey);
    mints.add(info.outputMint);
    priorOutput = info.outAmount;
    mint = info.outputMint;
  }
  const gross = units(plan.at(-1).swapInfo.outAmount);
  const net = units(payload.outAmount);
  if (gross !== net) {
    // V2's top-level outAmount is net of the platform fee, while routePlan
    // describes the gross AMM output. Reconcile the explicit fee exactly, with
    // at most one atomic unit for provider rounding; never accept an arbitrary
    // amount discrepancy as an identity match.
    const feeBps = number(payload.feeBps);
    if (!Number.isInteger(feeBps) || feeBps <= 0 || feeBps >= 10000 || payload.platformFee?.feeBps !== feeBps) {
      throw new Error("JUPITER_OUTPUT_FEE_MISMATCH");
    }
    const numerator = gross * BigInt(10000 - feeBps);
    const floor = numerator / 10000n;
    const ceil = (numerator + 9999n) / 10000n;
    if (net !== floor && net !== ceil) throw new Error("JUPITER_OUTPUT_FEE_MISMATCH");
  }
  const targetLeg = request.side === "BUY" ? plan.at(-1).swapInfo : plan[0].swapInfo;
  if (mint !== outputMint || plan[0].swapInfo.inAmount !== amount ||
      targetLeg.ammKey !== request.poolAddress ||
      (request.side === "BUY" ? targetLeg.outputMint : targetLeg.inputMint) !== request.tokenAddress) {
    throw new Error("JUPITER_EXACT_POOL_MISMATCH");
  }
}

/** GET-only quotes. No wallet, signing, build, swap, or execute endpoint exists here. */
export function createJupiterExecutableQuoteProvider(options = {}) {
  const clock = options.clock || (() => new Date().toISOString());
  const transport = options.fetch || globalThis.fetch;
  const sleep = options.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const budget = options.budget || sharedBudget;
  const buys = new Map();
  let requests = 0;
  const nowMs = () => {
    const ms = Date.parse(clock());
    if (!Number.isFinite(ms)) throw new Error("JUPITER_INVALID_CLOCK");
    return ms;
  };
  async function get(path, params) {
    if (!["/price/v3", "/swap/v2/order"].includes(path)) throw new Error("JUPITER_NON_QUOTE_ENDPOINT");
    if (requests >= 70) throw new Error("JUPITER_RUN_BUDGET_EXHAUSTED");
    let now = nowMs();
    const wait = Math.max(0, budget.nextAt - now);
    if (wait > 60000) throw new Error("JUPITER_RATE_LIMITED");
    if (wait) await sleep(wait);
    now = nowMs();
    budget.requests = budget.requests.filter((at) => now - at < 60000);
    if (budget.requests.length >= 30 || now < budget.nextAt) throw new Error("JUPITER_RATE_LIMITED");
    budget.requests.push(now);
    budget.nextAt = now + 2100;
    requests += 1;
    const url = new URL(path, BASE);
    url.search = new URLSearchParams(params);
    const apiKey = options.apiKey ?? process.env.JUPITER_API_KEY;
    const response = await transport(url.toString(), {
      method: "GET", redirect: "error", signal: AbortSignal.timeout(8000),
      headers: { accept: "application/json", ...(apiKey ? { "x-api-key": apiKey } : {}) },
    });
    if (response.status === 429) {
      const reset = Number(response.headers.get("x-ratelimit-reset"));
      budget.nextAt = Math.max(budget.nextAt, Number.isFinite(reset) && reset > 0 ? reset * 1000 : nowMs() + 60000);
    }
    if (!response.ok) throw new Error(`JUPITER_HTTP_${response.status}`);
    const raw = await response.text();
    if (raw.length > 1000000) throw new Error("JUPITER_RESPONSE_TOO_LARGE");
    const receivedAt = clock();
    const receivedMs = Date.parse(receivedAt);
    if (!Number.isFinite(receivedMs) || receivedMs < now || receivedMs - now > 30000) throw new Error("JUPITER_INVALID_RECEIPT_CLOCK");
    return { payload: JSON.parse(raw), raw, rawEvidenceHash: hash(raw), requestedAt: new Date(now).toISOString(), receivedAt, sourceUrl: url.toString() };
  }
  const provider = async (request = {}) => {
    if (request.operation !== "QUOTE_ONLY" || request.allowOrderSubmission === true || request.allowTransactionSubmission === true ||
        request.taker || request.wallet || !["BUY", "SELL"].includes(request.side)) throw new Error("JUPITER_QUOTE_ONLY_REQUIRED");
    const token = normalizeTokenAddress(request.tokenAddress, "solana");
    const pool = normalizePoolAddress(request.poolAddress, "solana");
    const notional = number(request.requestedNotionalUsd);
    if (normalizeChainId(request.chain) !== "solana" || !token || !pool || token !== request.tokenAddress || pool !== request.poolAddress ||
        !notional || notional > 1000 || token === JUPITER_USDC) throw new Error("JUPITER_EXACT_REQUEST_REQUIRED");
    const key = `${token}:${pool}:${notional}`;
    let entry;
    if (request.side === "BUY") {
      buys.delete(key);
      const prices = await get("/price/v3", { ids: [JUPITER_USDC, JUPITER_SOL, token].join(",") });
      const usdc = prices.payload[JUPITER_USDC], sol = prices.payload[JUPITER_SOL], target = prices.payload[token];
      if (!usdc || !sol || !target || !number(usdc.usdPrice) || !number(sol.usdPrice) ||
          usdc.decimals !== 6 || sol.decimals !== 9 || !Number.isInteger(target.decimals) || target.decimals < 0 || target.decimals > 18 ||
          !Number.isSafeInteger(usdc.blockId) || usdc.blockId <= 0 || !Number.isSafeInteger(sol.blockId) || sol.blockId <= 0) {
        throw new Error("JUPITER_PRICE_OR_DECIMALS_MISSING");
      }
      entry = { prices, decimals: target.decimals, usdcUsd: usdc.usdPrice, solUsd: sol.usdPrice,
        buyAmount: String(Math.floor(notional / usdc.usdPrice * 1e6)) };
      units(entry.buyAmount);
    } else {
      entry = buys.get(key);
      buys.delete(key);
      if (!entry || request.inputTokenAmountAtomic !== entry.outAmount ||
          request.inputTokenAmount !== Number(entry.outAmount) / 10 ** entry.decimals ||
          nowMs() - Date.parse(entry.receivedAt) > 15000) throw new Error("JUPITER_SELL_NOT_BOUND_TO_BUY");
    }
    const inputMint = request.side === "BUY" ? JUPITER_USDC : token;
    const outputMint = request.side === "BUY" ? token : JUPITER_USDC;
    const amount = request.side === "BUY" ? entry.buyAmount : entry.outAmount;
    const result = await get("/swap/v2/order", { inputMint, outputMint, amount, swapMode: "ExactIn", slippageBps: "50", excludeRouters: "jupiterz,dflow,okx" });
    const payload = result.payload;
    try { verifyRoute(payload, request, inputMint, outputMint, amount); }
    catch (error) { error.quoteDiagnostic = result; throw error; }
    const priceAge = Date.parse(result.receivedAt) - Date.parse(entry.prices.receivedAt);
    if (priceAge < 0 || priceAge > 30000) throw new Error("JUPITER_PRICE_RECEIPT_EXPIRED");
    const feeFields = ["signatureFeeLamports", "prioritizationFeeLamports", "rentFeeLamports"];
    const fees = feeFields.map((field) => number(payload[field]));
    if (fees.some((n) => n === null || !Number.isSafeInteger(n)) || typeof payload.priceImpact !== "number" || !Number.isFinite(payload.priceImpact) ||
        payload.slippageBps !== 50 || units(payload.otherAmountThreshold) > units(payload.outAmount)) throw new Error("JUPITER_COST_COMPONENT_MISSING");
    const allowance = Object.values(SOLANA_FEE_ALLOWANCE);
    const feeLamports = fees.reduce((sum, fee, i) => sum + Math.max(fee, allowance[i]), 0);
    const gasUsd = feeLamports / 1e9 * entry.solUsd;
    const inputUsd = request.side === "BUY" ? Number(amount) / 1e6 * entry.usdcUsd : number(payload.inUsdValue);
    const outputUsd = request.side === "SELL" ? Number(payload.outAmount) / 1e6 * entry.usdcUsd : number(payload.outUsdValue);
    if (!inputUsd || !outputUsd) throw new Error("JUPITER_USD_VALUE_MISSING");
    // Attribute the complete USDC round-trip shortfall to the sell leg, avoiding
    // mid-price double counting. Add 50bps slippage reserve and network allowance
    // on EACH leg. Favorable moves never credit the execution-cost allowance.
    const shortfall = request.side === "SELL" ? Math.max(0, Number(entry.buyAmount) / 1e6 * entry.usdcUsd - outputUsd) : 0;
    const route = {
      poolAddress: pool, routePlan: payload.routePlan,
      costModel: "USDC_ROUND_TRIP_PLUS_SLIPPAGE_AND_NETWORK_ALLOWANCE_V1",
      slippageReserveBps: 50, networkFeeAllowanceLamports: SOLANA_FEE_ALLOWANCE,
      appliedNetworkFeeLamports: feeLamports, networkFeesAreEstimates: true,
      priceSourceTimeUnknown: true, priceEvidence: entry.prices,
      quoteEvidence: result, pairedBuyEvidenceHash: entry.buyHash || null,
      rawEvidenceHash: result.rawEvidenceHash, sourceUrl: result.sourceUrl,
    };
    if (request.side === "BUY") buys.set(key, { ...entry, outAmount: payload.outAmount, receivedAt: result.receivedAt, buyHash: result.rawEvidenceHash });
    return {
      side: request.side, chain: "solana", tokenAddress: token, poolAddress: pool,
      requestedNotionalUsd: notional, inputUsd, outputUsd,
      inputTokenAmount: request.side === "SELL" ? Number(amount) / 10 ** entry.decimals : null,
      outputTokenAmount: request.side === "BUY" ? Number(payload.outAmount) / 10 ** entry.decimals : null,
      outputTokenAmountAtomic: request.side === "BUY" ? payload.outAmount : null,
      priceImpactBps: Math.abs(payload.priceImpact) * 100, protocolFeeBps: number(payload.feeBps),
      gasUsd, allInCostBps: (shortfall + gasUsd) / notional * 10000 + 50,
      provider: "Jupiter Quote Only V2", capturedAt: result.receivedAt,
      quoteId: payload.requestId, route, routeIdentityVerified: true,
      rawEvidenceHash: result.rawEvidenceHash, sourceUrl: result.sourceUrl,
      quoteOnly: true, transactionSubmissionAllowed: false, orderSubmissionAllowed: false,
    };
  };
  provider.providerName = "Jupiter Quote Only V2";
  provider.transport = "JUPITER_GET_ORDER_WITHOUT_TAKER";
  provider.quoteOnly = true;
  return provider;
}
