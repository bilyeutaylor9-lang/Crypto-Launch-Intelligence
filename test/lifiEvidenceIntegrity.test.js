import test from "node:test";
import assert from "node:assert/strict";
import { recoverLiFiRoute } from "../src/engines/executionProofRecoveryEngine.js";
import { createLiFiExecutableQuoteProvider, fetchLiFiJson, verifyActionIdentity } from "../src/execution/lifiExecutableQuoteProvider.js";

const TOKEN = "0x1111111111111111111111111111111111111111";
const POOL = "0x2222222222222222222222222222222222222222";
const OTHER = "0x3333333333333333333333333333333333333333";
const USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
const NOW = new Date("2026-10-10T12:00:00Z");
const project = { chain: "base", tokenAddress: TOKEN, poolAddress: POOL };
function quote(url) {
  const params = new URL(url).searchParams;
  const buy = params.get("fromToken").toLowerCase() === USDC;
  return { tool: "aerodrome", action: { fromChainId: 8453, toChainId: 8453,
    fromAmount: params.get("fromAmount"),
    fromToken: { chainId: 8453, address: buy ? USDC : TOKEN, decimals: buy ? 6 : 18 },
    toToken: { chainId: 8453, address: buy ? TOKEN : USDC, decimals: buy ? 18 : 6 } },
    estimate: { toAmount: buy ? "1000000000000000000" : "25000000", data: { protocols: [{ poolAddress: POOL }] } } };
}
function opts(fetchJson, budget = { windowStartedAtMs: NOW.getTime(), requests: 0 }) {
  return { lifiEnabled: true, tradeSizesUsd: [25], lifiTokenCache: new Map(),
    lifiRateBudget: budget, now: () => NOW, executionQuoteTakerAddress: OTHER, fetchJson };
}

test("valid exact quote metadata still recovers a verified buy/sell route", async () => {
  const result = await recoverLiFiRoute(project, opts(async (url) => quote(url)));
  assert.equal(result.status, "ROUTE_RECOVERED");
  assert.equal(result.route.exactIdentityVerified, true);
});
test("expected pool cannot validate foreign chain, token, missing identity or wrong amount", async () => {
  const mutations = [
    (q) => { q.action.fromToken.chainId = 1; },
    (q) => { q.action.toToken.address = OTHER; },
    (q) => { delete q.action.toToken; },
    (q) => { delete q.action.fromToken.chainId; delete q.action.fromChainId; },
    (q) => { q.action.fromChainId = 1; },
    (q) => { q.action.fromAmount = "1"; },
    (q) => { q.action.toToken.decimals = null; },
    (q) => { q.estimate.fromAmount = "1"; },
  ];
  for (const mutate of mutations) {
    let calls = 0;
    const result = await recoverLiFiRoute(project, opts(async (url) => { calls++; const q = quote(url); mutate(q); return q; }));
    assert.equal(result.status, "PROVIDER_FAILED");
    assert.equal(result.route, undefined);
    assert.equal(calls, 1);
  }
});
test("sell quote identity must be independently proven", async () => {
  let calls = 0;
  const result = await recoverLiFiRoute(project, opts(async (url) => {
    const q = quote(url);
    if (++calls === 2) q.action.fromToken.address = OTHER;
    return q;
  }));
  assert.equal(calls, 2);
  assert.equal(result.status, "PROVIDER_FAILED");
  assert.equal(result.route, undefined);
});
test("explicit action chain identity can attest tokens without duplicate chain fields", () => {
  const q = quote(`https://li.quest/v1/quote?fromToken=${USDC}&fromAmount=25000000`);
  delete q.action.fromToken.chainId;
  delete q.action.toToken.chainId;
  assert.equal(verifyActionIdentity(q, { side: "BUY", chain: "base", tokenAddress: TOKEN,
    quoteTokenAddress: USDC, fromAmount: "25000000" }).toToken.chain, "base");
});
test("legacy and forward quote paths consume the same request state", async () => {
  const budget = { windowStartedAtMs: NOW.getTime(), requests: 0 };
  const recovered = await recoverLiFiRoute(project, opts(async (url) => quote(url), budget));
  assert.equal(recovered.status, "ROUTE_RECOVERED");
  assert.equal(budget.requests, 2);
  let calls = 0;
  const forward = createLiFiExecutableQuoteProvider({ now: () => NOW, rateBudget: budget,
    keylessRequestBudget: 2, fetchJson: async () => { calls++; return {}; } });
  await assert.rejects(forward({ operation: "QUOTE_ONLY", chain: "base", tokenAddress: TOKEN,
    side: "BUY", requestedNotionalUsd: 25 }), /budget exhausted/);
  assert.equal(calls, 0);
});
test("Retry-After cooldown prevents provider calls until its actual deadline", async () => {
  let now = 0;
  let calls = 0;
  const budget = { windowStartedAtMs: 0, requests: 0 };
  const options = { now: () => new Date(now), rateBudget: budget, fetchImpl: async () => {
    calls++;
    return calls === 1 ? { ok: false, status: 429, headers: new Headers({ "retry-after": "60" }) } : { ok: true, json: async () => ({ ok: true }) };
  } };
  await assert.rejects(fetchLiFiJson("https://li.quest/v1/quote", options), { code: "RATE_LIMITED" });
  now = 59_000;
  await assert.rejects(fetchLiFiJson("https://li.quest/v1/quote", options), { code: "RATE_LIMITED" });
  assert.equal(calls, 1);
  assert.equal(budget.requests, 1);
  now = 60_000;
  assert.deepEqual(await fetchLiFiJson("https://li.quest/v1/quote", options), { ok: true });
  assert.equal(calls, 2);
});
test("injected transport rate rejection shares cooldown with recovery", async () => {
  const budget = { windowStartedAtMs: NOW.getTime(), requests: 0 };
  let calls = 0;
  const options = opts(async () => { calls++; const error = new Error("HTTP 429"); error.retryAfter = "120"; throw error; }, budget);
  const rejected = await recoverLiFiRoute(project, options);
  assert.equal(rejected.providerFailureCode, "RATE_LIMITED");
  assert.equal(rejected.retryAt, new Date(NOW.getTime() + 120_000).toISOString());
  await recoverLiFiRoute(project, options);
  assert.equal(calls, 1);
  assert.equal(budget.cooldownUntilMs, NOW.getTime() + 120_000);
});

test("provider retry message preserves the actual cooldown instead of assuming a full window", async () => {
  const budget = { windowStartedAtMs: NOW.getTime(), requests: 0 };
  await assert.rejects(fetchLiFiJson("https://li.quest/v1/quote", { now: () => NOW, rateBudget: budget,
    fetchImpl: async () => ({ ok: false, status: 429, headers: new Headers(),
      json: async () => ({ code: 1005, message: "Rate limit exceeded, retry in 23 minutes" }) }) }), { code: "RATE_LIMITED" });
  assert.equal(budget.cooldownUntilMs, NOW.getTime() + 23 * 60_000);
});
test("epoch-zero budgets cannot reset on each request", async () => {
  const options = { now: () => new Date(0), rateBudget: { windowStartedAtMs: 0, requests: 0 },
    keylessRequestBudget: 1, fetchJson: async () => ({ ok: true }) };
  await fetchLiFiJson("https://li.quest/v1/quote", options);
  await assert.rejects(fetchLiFiJson("https://li.quest/v1/quote", options), { code: "LIFI_KEYLESS_BUDGET_EXHAUSTED" });
});
test("pre-aborted calls spend no quota and transport receives a live timeout signal", async () => {
  const budget = { windowStartedAtMs: NOW.getTime(), requests: 0 };
  await assert.rejects(fetchLiFiJson("https://li.quest/v1/quote", { now: () => NOW, rateBudget: budget,
    signal: AbortSignal.abort(), fetchJson: async () => { throw new Error("must not run"); } }), /aborted before start/);
  assert.equal(budget.requests, 0);
  await assert.rejects(fetchLiFiJson("https://li.quest/v1/quote", { now: () => NOW, rateBudget: budget,
    timeoutMs: 500, fetchJson: async (url, { signal }) => new Promise((resolve, reject) => {
      signal.addEventListener("abort", () => reject(new Error("transport aborted")), { once: true });
    }) }), /transport aborted/);
});

test("dynamic stable-token metadata cannot silently inherit requested chain or decimals", async () => {
  for (const token of [{ address: USDC, decimals: 6 }, { chainId: 1, address: USDC, decimals: 6 },
    { chainId: 324, address: USDC, decimals: null }]) {
    let calls = 0;
    const result = await recoverLiFiRoute({ chain: "zksync", tokenAddress: TOKEN }, opts(async (url, init) => {
      calls++;
      assert.equal(init.adapter, "lifi-token");
      return token;
    }));
    assert.equal(calls, 1);
    assert.equal(result.status, "QUOTE_TOKEN_UNAVAILABLE");
    assert.equal(result.route, undefined);
  }
});

test("missing or malformed fee observations remain unknown rather than measured zero", async () => {
  for (const costs of [{}, { gasCosts: null, feeCosts: [] }, { gasCosts: [{ amountUSD: null }], feeCosts: [] },
    { gasCosts: [], feeCosts: [{ amountUSD: -1 }] }]) {
    const provider = createLiFiExecutableQuoteProvider({ now: () => NOW,
      rateBudget: { windowStartedAtMs: NOW.getTime(), requests: 0 }, fetchJson: async (url) => {
        const q = quote(url);
        q.estimate = { ...q.estimate, fromAmountUSD: "25", toAmountUSD: "24.5", ...costs };
        return q;
      } });
    const result = await provider({ side: "BUY", operation: "QUOTE_ONLY", chain: "base", tokenAddress: TOKEN,
      poolAddress: POOL, requestedNotionalUsd: 25 });
    assert.equal(result.allInCostBps, null);
  }
  const provider = createLiFiExecutableQuoteProvider({ now: () => NOW,
    rateBudget: { windowStartedAtMs: NOW.getTime(), requests: 0 }, fetchJson: async (url) => {
      const q = quote(url);
      q.estimate = { ...q.estimate, fromAmountUSD: "25", toAmountUSD: "24.5", gasCosts: [], feeCosts: [] };
      return q;
    } });
  const measured = await provider({ side: "BUY", operation: "QUOTE_ONLY", chain: "base", tokenAddress: TOKEN,
    poolAddress: POOL, requestedNotionalUsd: 25 });
  assert.equal(measured.gasUsd, 0);
  assert.equal(measured.allInCostBps, 200);
});

test("reference prices and an assumed dollar peg cannot become observed quote USD value", async () => {
  const provider = createLiFiExecutableQuoteProvider({ now: () => NOW,
    rateBudget: { windowStartedAtMs: NOW.getTime(), requests: 0 }, fetchJson: async (url) => {
      const q = quote(url); q.estimate.gasCosts = []; q.estimate.feeCosts = []; return q;
    } });
  const result = await provider({ side: "BUY", operation: "QUOTE_ONLY", chain: "base", tokenAddress: TOKEN,
    poolAddress: POOL, requestedNotionalUsd: 25, referencePriceUsd: 25 });
  assert.equal(result.inputUsd, null);
  assert.equal(result.outputUsd, null);
  assert.equal(result.allInCostBps, null);
});
