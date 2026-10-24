import test from "node:test";
import assert from "node:assert/strict";
import {
  recoverLiFiRoute,
  recoverSolanaJupiterRoute,
  recoverZeroXRoute,
} from "../src/engines/executionProofRecoveryEngine.js";
import {
  createActiveEvidenceExecutionState,
  recoverExecutionEvidence,
} from "../src/data/activeEvidenceProviderExecutor.js";

const NOW = new Date("2026-10-18T06:00:00.000Z");
const TOKEN = `0x${"11".repeat(20)}`;
const POOL = `0x${"22".repeat(20)}`;
const OTHER = `0x${"33".repeat(20)}`;
// Using SOL as the requested token also excludes the existing optional SOL-quote fallback.
const SOL_TOKEN = "So11111111111111111111111111111111111111112";
const SOL_POOL = "11111111111111111111111111111111";
const SOL_OTHER = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const PROJECT = { name: "Exact utility", symbol: "EXU", chain: "base", tokenAddress: TOKEN,
  contractAddress: TOKEN, poolAddress: POOL, priceUsd: 1, liquidityUsd: 200_000,
  identityVerified: true, contractVerified: true, instantSafetyStatus: "PASS" };

const adapters = [
  { name: "lifi", recover: recoverLiFiRoute, project: PROJECT, pool: POOL, other: OTHER },
  { name: "0x", recover: recoverZeroXRoute, project: PROJECT, pool: POOL, other: OTHER },
  { name: "jupiter", recover: recoverSolanaJupiterRoute,
    project: { ...PROJECT, chain: "solana", tokenAddress: SOL_TOKEN, contractAddress: SOL_TOKEN,
      poolAddress: SOL_POOL }, pool: SOL_POOL, other: SOL_OTHER },
];

function options(fetchJson, extra = {}) {
  return { env: {}, enabled: true, maxCandidates: 1, concurrency: 1, tradeSizesUsd: [25],
    requestTimeoutMs: 500, lifiEnabled: true, lifiApiKey: "", lifiIntegrator: "offline-fixture",
    executionQuoteTakerAddress: `0x${"00".repeat(19)}01`, lifiTokenCache: new Map(),
    lifiRateBudget: { windowStartedAtMs: NOW.getTime(), requests: 0 },
    zeroxApiKey: "fixture-key", jupiterApiKey: "fixture-key", now: () => NOW,
    fetchJson, ...extra };
}

function quote(url, adapter, pool) {
  const params = new URL(url).searchParams;
  if (adapter === "lifi") {
    const buy = params.get("toToken").toLowerCase() === TOKEN;
    return { tool: "aerodrome", action: { fromChainId: 8453, toChainId: 8453,
      fromAmount: params.get("fromAmount"),
      fromToken: { chainId: 8453, address: params.get("fromToken"), decimals: buy ? 6 : 18 },
      toToken: { chainId: 8453, address: params.get("toToken"), decimals: buy ? 18 : 6 } },
    estimate: { toAmount: buy ? "1000000000000000000" : "24750000",
      ...(pool ? { data: { protocols: [{ poolAddress: pool }] } } : {}) } };
  }
  if (adapter === "0x") {
    return { chainId: 8453, sellToken: params.get("sellToken"), buyToken: params.get("buyToken"),
      sellAmount: params.get("sellAmount"), buyAmount: "25000000", priceImpactPct: 0.2,
      ...(pool ? { route: { fills: [{ poolAddress: pool }] } } : {}) };
  }
  return { inputMint: params.get("inputMint"), outputMint: params.get("outputMint"),
    inAmount: params.get("amount"), outAmount: "1000000000", priceImpactPct: "0.2",
    routePlan: [{ swapInfo: { label: "fixture", ...(pool ? { ammKey: pool } : {}) } }] };
}

function side(url, adapter) {
  const params = new URL(url).searchParams;
  const toToken = params.get(adapter === "lifi" ? "toToken" : adapter === "0x" ? "buyToken" : "outputMint");
  return toToken.toLowerCase() === (adapter === "jupiter" ? SOL_TOKEN.toLowerCase() : TOKEN) ? "BUY" : "SELL";
}

function forbidNetwork(t) {
  t.mock.method(globalThis, "fetch", async () => assert.fail("Real provider HTTP is forbidden."));
}

for (const fixture of adapters) {
  test(`${fixture.name} rejects an unattested BUY before spending a SELL request`, async (t) => {
    forbidNetwork(t);
    for (const buyPool of [undefined, fixture.other]) {
      const ledger = [];
      const receipts = [];
      const opts = options(async (url, { adapter }) => {
        const leg = side(url, adapter);
        ledger.push({ adapter, leg });
        const value = quote(url, adapter, leg === "BUY" ? buyPool : fixture.pool);
        // Model the existing transport callback retaining the original response before validation.
        receipts.push({ value, bytes: Buffer.from(JSON.stringify(value)) });
        return value;
      });
      const result = await fixture.recover(fixture.project, opts);
      assert.deepEqual(ledger, [{ adapter: fixture.name, leg: "BUY" }]);
      assert.equal(result.status, "IDENTITY_OR_POOL_UNATTESTED");
      assert.match(result.reason, /Both quotes must independently attest the requested exact pool/);
      assert.equal(result.route, undefined);
      assert.equal(result.buyQuoteVerified, false);
      assert.equal(result.sellQuoteVerified, false);
      assert.equal(receipts.length, 1);
      assert.deepEqual(Buffer.from(JSON.stringify(receipts[0].value)), receipts[0].bytes);
      assert.equal(opts.lifiRateBudget.requests, fixture.name === "lifi" ? 1 : 0);
    }
  });

  test(`${fixture.name} still requires and counts two exact quote legs`, async (t) => {
    forbidNetwork(t);
    const ledger = [];
    const opts = options(async (url, { adapter }) => {
      ledger.push({ adapter, leg: side(url, adapter) });
      return quote(url, adapter, fixture.pool);
    });
    const result = await fixture.recover(fixture.project, opts);
    assert.deepEqual(ledger, ["BUY", "SELL"].map(leg => ({ adapter: fixture.name, leg })));
    assert.equal(result.status, "ROUTE_RECOVERED");
    assert.equal(result.route.poolAddress, fixture.pool);
    assert.equal(result.route.exactIdentityVerified, true);
    assert.equal(result.route.buyQuoteVerified, true);
    assert.equal(result.route.sellQuoteVerified, true);
    assert.equal(opts.lifiRateBudget.requests, fixture.name === "lifi" ? 2 : 0);
  });

  test(`${fixture.name} cannot substitute an unattested SELL after an exact BUY`, async (t) => {
    forbidNetwork(t);
    for (const sellPool of [undefined, fixture.other]) {
      const ledger = [];
      const result = await fixture.recover(fixture.project, options(async (url, { adapter }) => {
        const leg = side(url, adapter);
        ledger.push(leg);
        return quote(url, adapter, leg === "BUY" ? fixture.pool : sellPool);
      }));
      assert.deepEqual(ledger, ["BUY", "SELL"]);
      assert.equal(result.status, "IDENTITY_OR_POOL_UNATTESTED");
      assert.equal(result.route.poolAddress, null);
      assert.equal(result.route.exactIdentityVerified, false);
    }
  });

  test(`${fixture.name} retains BUY token-identity rejection before SELL`, async (t) => {
    forbidNetwork(t);
    const ledger = [];
    const result = await fixture.recover(fixture.project, options(async (url, { adapter }) => {
      ledger.push(side(url, adapter));
      const value = quote(url, adapter, fixture.pool);
      if (adapter === "lifi") value.action.toToken.address = OTHER;
      else if (adapter === "0x") value.buyToken = OTHER;
      else value.outputMint = SOL_OTHER;
      return value;
    }));
    assert.deepEqual(ledger, ["BUY"]);
    assert.equal(result.status, "PROVIDER_FAILED");
    assert.match(result.failures.join(" "), /identity/i);
    assert.equal(result.route, undefined);
  });

  test(`${fixture.name} does not reclassify post-BUY cancellation as missing pool`, async (t) => {
    forbidNetwork(t);
    const controller = new AbortController();
    const ledger = [];
    const receipts = [];
    const opts = options(async (url, { adapter }) => {
      ledger.push(side(url, adapter));
      const value = quote(url, adapter);
      receipts.push(value);
      controller.abort();
      return value;
    });
    const result = await fixture.recover(fixture.project, opts, controller.signal);
    assert.deepEqual(ledger, ["BUY"]);
    assert.equal(receipts.length, 1);
    assert.equal(result.status, "PROVIDER_FAILED");
    assert.match(result.failures.join(" "), /aborted/i);
    assert.equal(result.route, undefined);
    assert.equal(opts.lifiRateBudget.requests, fixture.name === "lifi" ? 1 : 0);
  });

  test(`${fixture.name} preserves response-callback failures without a SELL or pool verdict`, async (t) => {
    forbidNetwork(t);
    const ledger = [];
    const receipts = [];
    const opts = options(async (url, { adapter }) => {
      ledger.push(side(url, adapter));
      receipts.push(Buffer.from(JSON.stringify(quote(url, adapter))));
      throw new Error("Injected response receipt storage failed.");
    });
    const result = await fixture.recover(fixture.project, opts);
    assert.deepEqual(ledger, ["BUY"]);
    assert.equal(receipts.length, 1);
    assert.equal(result.status, "PROVIDER_FAILED");
    assert.match(result.failures.join(" "), /Injected response receipt storage failed/);
    assert.equal(result.route, undefined);
    assert.equal(opts.lifiRateBudget.requests, fixture.name === "lifi" ? 1 : 0);
  });
}

test("three active HTTP slots admit unattested LI.FI BUY then exact independent 0x BUY and SELL", async (t) => {
  forbidNetwork(t);
  const ledger = [];
  const opts = { maxRequests: 3, providerTimeoutMs: 500, now: () => NOW.getTime(),
    executionRecovery: options(async (url, { adapter }) => {
      ledger.push({ adapter, leg: side(url, adapter) });
      return quote(url, adapter, adapter === "0x" ? POOL : undefined);
    }) };
  const state = createActiveEvidenceExecutionState(opts);
  const result = await recoverExecutionEvidence(PROJECT,
    ["purchaseRouteConfirmed", "sellRouteAvailable", "quoteTimestamp"], {}, opts, state);
  assert.deepEqual(ledger, [{ adapter: "lifi", leg: "BUY" },
    { adapter: "0x", leg: "BUY" }, { adapter: "0x", leg: "SELL" }]);
  assert.equal(state.requestsUsed, 3);
  assert.equal(opts.executionRecovery.lifiRateBudget.requests, 1);
  assert.deepEqual(result.attempts.map(({ provider, status }) => ({ provider, status })),
    ["lifi", "0x", "0x"].map(provider => ({ provider, status: "SUCCESS" })));
  assert.deepEqual(result.executionAdapterResults.map(({ adapter, status }) => ({ adapter, status })),
    [{ adapter: "lifi", status: "IDENTITY_OR_POOL_UNATTESTED" }, { adapter: "0x", status: "ROUTE_RECOVERED" }]);
  assert.equal(result.projectPatch.executionProofRecoveryRoute.source, "0x");
  assert.equal(result.projectPatch.executionProofRecoveryRoute.poolAddress, POOL);
  assert.equal(result.projectPatch.executionProofRecoveryRoute.exactIdentityVerified, true);
  assert.ok(result.observations.length > 0);
});
