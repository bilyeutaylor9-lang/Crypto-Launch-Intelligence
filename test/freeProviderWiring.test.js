import test from "node:test";
import assert from "node:assert/strict";

import {
  getDefiLlamaExactPrice,
  normalizeDefiLlamaExactPrice,
  resolveDefiLlamaCoinIdentity,
} from "../src/data/defiLlamaExactPriceConnector.js";
import {
  createActiveEvidenceExecutionState,
  executeActiveEvidenceProviderRequests,
} from "../src/data/activeEvidenceProviderExecutor.js";
import {
  createLiFiExecutableQuoteProvider,
} from "../src/execution/lifiExecutableQuoteProvider.js";
import { captureForwardExecutionCosts } from "../src/production/forwardExecutionCostCapture.js";
import { getSourceById } from "../src/config/sourceManifest.js";
import { getCryptoCompareCandidates } from "../src/data/expandedMarketDataConnector.js";
import { analyzeExecutionProofRecoveryBatch } from "../src/engines/executionProofRecoveryEngine.js";

const TOKEN = "0x1111111111111111111111111111111111111111";
const POOL = "0x2222222222222222222222222222222222222222";
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const NOW = "2026-08-27T12:00:00.000Z";

function response(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return payload; },
  };
}

function request(field, source) {
  return {
    field,
    item: { canonicalField: field, targetSources: [{ source }] },
  };
}

function lifiPayload(side, { poolAddress = POOL } = {}) {
  const buy = side === "BUY";
  return {
    id: `${side.toLowerCase()}-quote`,
    tool: "aerodrome",
    action: {
      fromChainId: 8453,
      toChainId: 8453,
      fromAmount: buy ? "100000000" : "49000000000000000000",
      fromToken: buy
        ? { chainId: 8453, address: USDC, decimals: 6, symbol: "USDC", priceUSD: "1" }
        : { chainId: 8453, address: TOKEN, decimals: 18, symbol: "FREE", priceUSD: "2" },
      toToken: buy
        ? { chainId: 8453, address: TOKEN, decimals: 18, symbol: "FREE", priceUSD: "2" }
        : { chainId: 8453, address: USDC, decimals: 6, symbol: "USDC", priceUSD: "1" },
    },
    estimate: {
      fromAmount: buy ? "100000000" : "49000000000000000000",
      toAmount: buy ? "49000000000000000000" : "97000000",
      gasCosts: [{ amountUSD: "0.10" }],
      feeCosts: [{ amountUSD: "0.05" }],
      data: {
        protocols: poolAddress ? [{ name: "AERODROME", poolAddress }] : [{ name: "AERODROME" }],
      },
    },
  };
}

test("DeFiLlama exact-price connector only accepts exact chain-contract records", () => {
  const identity = resolveDefiLlamaCoinIdentity("base", TOKEN);
  assert.equal(identity.providerCoinKey, `base:${TOKEN}`);
  const observed = normalizeDefiLlamaExactPrice({
    coins: {
      [`base:${TOKEN.toUpperCase()}`]: { price: 0.42, timestamp: 1787831900, confidence: 0.98 },
    },
  }, identity, { observedAt: NOW, sourceUrl: "https://api.llama.fi/prices/current/exact" });
  assert.equal(observed.status, "EXACT_PRICE_OBSERVED");
  assert.equal(observed.priceUsd, 0.42);
  assert.equal(observed.identityKey, `base:${TOKEN}`);
  assert.equal(observed.rawEvidenceHash.length, 64);

  const mismatch = normalizeDefiLlamaExactPrice({
    coins: { "base:0x3333333333333333333333333333333333333333": { price: 9 } },
  }, identity, { observedAt: NOW });
  assert.equal(mismatch.status, "UNKNOWN");
  assert.equal(mismatch.priceUsd, null);
  assert.equal(resolveDefiLlamaCoinIdentity("base", "FREE"), null);
});

test("DeFiLlama exact-price request is keyless and preserves endpoint and raw provenance", async () => {
  let requestedUrl = null;
  const result = await getDefiLlamaExactPrice({ chain: "base", tokenAddress: TOKEN }, {
    now: NOW,
    fetchImpl: async (url, init) => {
      requestedUrl = url;
      assert.deepEqual(init.headers, { accept: "application/json" });
      assert.equal(Object.hasOwn(init.headers, "authorization"), false);
      return response({ coins: { [`base:${TOKEN}`]: { price: 0.5, timestamp: 1787832000 } } });
    },
  });
  assert.match(requestedUrl, /^https:\/\/api\.llama\.fi\/prices\/current\//);
  assert.equal(decodeURIComponent(new URL(requestedUrl).pathname).endsWith(`base:${TOKEN}`), true);
  assert.equal(result.status, "EXACT_PRICE_OBSERVED");
  assert.equal(result.sourceUrl, requestedUrl);
  assert.equal(result.observedAt, NOW);
  assert.equal(result.rawEvidence.record.price, 0.5);
});

test("active recovery uses DeFiLlama only as an exact price fallback", async () => {
  const state = createActiveEvidenceExecutionState({ maxProviderRequests: 2 });
  const result = await executeActiveEvidenceProviderRequests(
    { chain: "base", tokenAddress: TOKEN, poolAddress: POOL },
    [request("priceUsd", "DeFiLlama Exact Price")],
    {
      providers: {
        getDefiLlamaExactPrice: async () => ({
          status: "EXACT_PRICE_OBSERVED",
          chain: "base",
          tokenAddress: TOKEN,
          identityKey: `base:${TOKEN}`,
          providerCoinKey: `base:${TOKEN}`,
          priceUsd: 0.55,
          confidence: 0.97,
          observedAt: NOW,
          sourceTimestamp: NOW,
          sourceUrl: `https://api.llama.fi/prices/current/base:${TOKEN}`,
          rawEvidenceHash: "a".repeat(64),
          rawEvidence: { providerCoinKey: `base:${TOKEN}`, record: { price: 0.55 } },
        }),
      },
    },
    state,
  );
  assert.equal(state.requestsUsed, 1);
  assert.equal(result.observations.length, 1);
  assert.equal(result.observations[0].field, "priceUsd");
  assert.equal(result.observations[0].source, "defillama-exact-price");
  assert.equal(result.observations[0].identityMatchMode, "exact-chain-contract");
  assert.equal(result.observations[0].rawEvidenceHash, "a".repeat(64));
});

test("LI.FI keyless provider builds read-only exact-contract BUY and SELL requests", async () => {
  const urls = [];
  const provider = createLiFiExecutableQuoteProvider({
    now: NOW,
    rateBudget: { windowStartedAtMs: 0, requests: 0 },
    fetchJson: async (url, init) => {
      urls.push(url);
      assert.equal(init.adapter, "lifi-keyless-forward");
      assert.equal(Object.hasOwn(init.headers, "x-lifi-api-key"), false);
      const parsed = new URL(url);
      assert.equal(parsed.searchParams.get("fromChain"), "8453");
      assert.equal(parsed.searchParams.get("toChain"), "8453");
      assert.equal(parsed.searchParams.has("skipSimulation"), false);
      return lifiPayload(parsed.searchParams.get("fromToken").toLowerCase() === USDC.toLowerCase() ? "BUY" : "SELL");
    },
  });
  const baseRequest = {
    operation: "QUOTE_ONLY",
    executionIntent: "READ_ONLY_QUOTE",
    allowOrderSubmission: false,
    allowTransactionSubmission: false,
    chain: "base",
    tokenAddress: TOKEN,
    poolAddress: POOL,
    requestedNotionalUsd: 100,
    referencePriceUsd: 2,
  };
  const buy = await provider({ ...baseRequest, side: "BUY" });
  const sell = await provider({ ...baseRequest, side: "SELL", inputTokenAmount: buy.outputTokenAmount });
  assert.equal(urls.length, 2);
  assert.equal(buy.outputTokenAmount, 49);
  assert.equal(buy.poolAddress, POOL);
  assert.equal(buy.routeIdentityVerified, true);
  assert.equal(sell.inputTokenAmount, 49);
  assert.equal(sell.outputUsd, 97);
  assert.equal(sell.transactionSubmitted, false);
  assert.equal(provider.keyless, true);
  assert.equal(provider.quoteOnly, true);
});

test("LI.FI auto-provider feeds forward shadow costs only when the response attests the exact pool", async () => {
  const result = await captureForwardExecutionCosts([{
    chain: "base",
    tokenAddress: TOKEN,
    poolAddress: POOL,
    priceUsd: 2,
    sourceObservedAt: "2026-08-27T11:59:55.000Z",
  }], {
    endpoint: "",
    now: NOW,
    freeProviderQuotesEnabled: true,
    rateBudget: { windowStartedAtMs: 0, requests: 0 },
    fetchJson: async (url) => {
      const parsed = new URL(url);
      return lifiPayload(parsed.searchParams.get("fromToken").toLowerCase() === USDC.toLowerCase() ? "BUY" : "SELL");
    },
  });
  assert.equal(result.state, "PAIRED_EXECUTABLE_ROUND_TRIP_COSTS_CAPTURED");
  assert.equal(result.audit.endpointConfigured, false);
  assert.equal(result.audit.keylessProvider, true);
  assert.equal(result.audit.provider, "LI.FI Keyless");
  assert.equal(result.projects[0].executionCostProvenance.transport, "LIFI_READ_ONLY_QUOTE_API");
  assert.equal(result.projects[0].executionCostCaptureAutomaticTrading, false);

  const unattested = await captureForwardExecutionCosts([{
    chain: "base",
    tokenAddress: TOKEN,
    poolAddress: POOL,
    priceUsd: 2,
  }], {
    endpoint: "",
    now: NOW,
    freeProviderQuotesEnabled: true,
    rateBudget: { windowStartedAtMs: 0, requests: 0 },
    fetchJson: async (url) => {
      const parsed = new URL(url);
      return lifiPayload(
        parsed.searchParams.get("fromToken").toLowerCase() === USDC.toLowerCase() ? "BUY" : "SELL",
        { poolAddress: null },
      );
    },
  });
  assert.equal(unattested.audit.accepted, 0);
  assert.equal(unattested.audit.rejectionReasons.RAW_QUOTE_IDENTITY_MISSING, 1);
  assert.equal(unattested.projects[0].roundTripExecutionCostBps, undefined);
});

test("LI.FI keyless rate budget fails closed before exceeding the configured window", async () => {
  const provider = createLiFiExecutableQuoteProvider({
    now: NOW,
    keylessRequestBudget: 1,
    rateBudget: { windowStartedAtMs: 0, requests: 0 },
    fetchJson: async () => lifiPayload("BUY"),
  });
  const request = {
    operation: "QUOTE_ONLY",
    allowOrderSubmission: false,
    allowTransactionSubmission: false,
    side: "BUY",
    chain: "base",
    tokenAddress: TOKEN,
    poolAddress: POOL,
    requestedNotionalUsd: 100,
    referencePriceUsd: 2,
  };
  await provider(request);
  await assert.rejects(provider(request), /request budget exhausted/i);
});

test("key-required providers are not called in keyless mode", async () => {
  assert.deepEqual(await getCryptoCompareCandidates({ freeOnly: true, limit: 1 }), []);
  let calls = 0;
  const [solana] = await analyzeExecutionProofRecoveryBatch([{
    symbol: "SOLX",
    name: "Solana Key Gate",
    chain: "solana",
    tokenAddress: "So11111111111111111111111111111111111111112",
    poolAddress: "11111111111111111111111111111111",
    priceUsd: 1,
    liquidityUsd: 100_000,
    highUpsideScalpScore: 90,
  }], {
    jupiterApiKey: "",
    fetchJson: async () => { calls += 1; return {}; },
    now: () => new Date(NOW),
  });
  assert.equal(calls, 0);
  assert.equal(solana.executionProofRecovery.status, "OPTIONAL_SOURCE_SKIPPED");
  assert.equal(solana.executionProofRecovery.optionalSourceGaps[0].missingKey, "JUPITER_API_KEY");
});

test("free-only provider policy excludes services whose current APIs require keys", () => {
  assert.equal(getSourceById("lifi").requiresKey, false);
  assert.equal(getSourceById("defillama-exact-price").requiresKey, false);
  assert.equal(getSourceById("jupiter").requiresKey, true);
  assert.equal(getSourceById("zerox").requiresKey, true);
  assert.equal(getSourceById("cryptocompare").requiresKey, true);
  assert.equal(getSourceById("coincap").requiresKey, true);
});
