import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createJupiterExecutableQuoteProvider, JUPITER_USDC, JUPITER_SOL } from "../src/execution/jupiterExecutableQuoteProvider.js";
import { captureForwardExecutionCosts } from "../src/production/forwardExecutionCostCapture.js";
import { normalizeExecutableQuote, quoteProviderFromEnvironment } from "../src/canary/executableQuoteTruthEngine.js";

const TOKEN = "8T2nkC9HQkgd2yjxc7Yn1LAietmXyZKbv1vR4FXDbonk";
const POOL = "FLjduG53HF2T9WuJLsZuwJKAVm8Gs91h3NqkGb1dy6gi";
const NOW = "2026-10-21T12:00:00.000Z";
const FIXTURE_API_KEY = "nonsecret-jupiter-fixture-key";
const request = (side = "BUY") => ({ operation: "QUOTE_ONLY", side, chain: "solana", tokenAddress: TOKEN, poolAddress: POOL,
  requestedNotionalUsd: 100, allowOrderSubmission: false, allowTransactionSubmission: false });

function fixture(mutate = () => {}, options = {}) {
  let ms = Date.parse(NOW);
  const calls = [];
  const clock = () => new Date(ms).toISOString();
  const providerOptions = { apiKey: FIXTURE_API_KEY, clock, budget: { requests: [], nextAt: 0 },
    sleep: async (delay) => { ms += delay; },
    fetch: async (url, init) => {
      calls.push({ url: new URL(url), init, at: ms });
      assert.equal(init.method, "GET");
      assert.equal(init.body, undefined);
      const u = new URL(url);
      assert.equal(u.searchParams.has("taker"), false);
      assert.equal(u.searchParams.has("payer"), false);
      ms += 10;
      let payload;
      if (u.pathname === "/price/v3") payload = {
        [JUPITER_USDC]: { usdPrice: 1, decimals: 6, blockId: 100 },
        [JUPITER_SOL]: { usdPrice: 100, decimals: 9, blockId: 100 },
        [TOKEN]: { usdPrice: 2, decimals: 6, blockId: 100 },
      };
      else {
        assert.equal(u.pathname, "/swap/v2/order");
        const buy = u.searchParams.get("inputMint") === JUPITER_USDC;
        payload = { inputMint: u.searchParams.get("inputMint"), outputMint: u.searchParams.get("outputMint"),
          inAmount: u.searchParams.get("amount"), outAmount: buy ? "50000000" : "98000000",
          otherAmountThreshold: buy ? "49750000" : "97510000", swapMode: "ExactIn", slippageBps: 50,
          inUsdValue: 100, outUsdValue: buy ? 99 : 98, priceImpact: -0.2, feeBps: 5,
          signatureFeeLamports: 0, prioritizationFeeLamports: 0, rentFeeLamports: 0,
          transaction: null, taker: null, requestId: buy ? "buy" : "sell" };
        payload.routePlan = [{ percent: 100, bps: 10000, swapInfo: { ammKey: POOL,
          inputMint: payload.inputMint, outputMint: payload.outputMint, inAmount: payload.inAmount, outAmount: payload.outAmount } }];
      }
      mutate(payload, u);
      return { ok: true, status: 200, headers: new Headers(), text: async () => JSON.stringify(payload) };
    }, ...options };
  return { provider: createJupiterExecutableQuoteProvider(providerOptions), providerOptions, calls, clock };
}

test("GET-only authenticated paired quotes bind the same exact Solana route, raw amounts and conservative costs", async () => {
  const f = fixture();
  const result = await captureForwardExecutionCosts([{ ...request(), priceUsd: 2, sourceObservedAt: NOW }], {
    now: NOW, clock: f.clock, quoteProvider: f.provider,
  });
  assert.equal(result.audit.accepted, 1);
  assert.equal(f.calls.length, 3);
  assert.equal(f.calls[2].url.searchParams.get("amount"), "50000000");
  assert.ok(f.calls.every((call) => call.init.headers["x-api-key"] === FIXTURE_API_KEY));
  assert.equal(f.provider.requiresKey, true);
  assert.equal(f.provider.keyless, false);
  assert.equal(f.provider.availabilityState, "CONFIGURED");
  assert.equal(result.audit.keylessProvider, false);
  const row = result.projects[0];
  assert.equal(row.roundTripExecutionCostBps, 401.672);
  assert.equal(row.executionReferenceSizeUsd, 100);
  const p = row.executionCostProvenance;
  assert.equal(p.entryQuote.poolAddress, POOL);
  assert.equal(p.entryQuote.outputTokenAmountAtomic, "50000000");
  assert.equal(p.exitQuote.route.pairedBuyEvidenceHash, p.entryQuote.rawEvidenceHash);
  assert.equal(p.entryQuote.route.networkFeesAreEstimates, true);
  assert.ok(p.entryQuote.gasUsd > 0);
  assert.equal(p.entryQuote.rawEvidenceHash, crypto.createHash("sha256").update(p.entryQuote.route.quoteEvidence.raw).digest("hex"));
  assert.ok(Date.parse(p.entryQuote.capturedAt) > Date.parse(NOW));
  assert.equal(normalizeExecutableQuote({ ...request(), poolAddress: POOL }, request()).tokenAddress, TOKEN);
});

test("chain-aware factory dispatches Solana to Jupiter, not the EVM adapter", async () => {
  const f = fixture();
  const provider = quoteProviderFromEnvironment({ endpoint: "", jupiter: f.providerOptions, lifi: { fetchJson: () => { throw Error("EVM MUST NOT RUN"); } } });
  assert.equal(provider.keyless, false);
  assert.equal(provider.forChain("solana").keyless, false);
  const quote = await provider(request());
  assert.equal(quote.provider, "Jupiter Quote Only V2");
  assert.equal(quote.tokenAddress, TOKEN);
  assert.equal(f.calls.length, 2);
});

test("missing, empty or whitespace Jupiter keys consume no requests, waits or budget", async (t) => {
  const previous = process.env.JUPITER_API_KEY;
  delete process.env.JUPITER_API_KEY;
  t.after(() => {
    if (previous === undefined) delete process.env.JUPITER_API_KEY;
    else process.env.JUPITER_API_KEY = previous;
  });
  for (const apiKey of [undefined, "", " \t\n"]) {
    const budget = { requests: [Date.parse(NOW)], nextAt: Date.parse(NOW) + 2100 };
    const before = structuredClone(budget);
    const f = fixture(() => {}, { apiKey, budget, sleep: async () => assert.fail("missing key must not wait") });
    const provider = quoteProviderFromEnvironment({ endpoint: "", jupiter: f.providerOptions, lifi: { apiKey: "" } });
    for (const source of [f.provider, provider, provider.forChain("solana")]) {
      await assert.rejects(source(request()), {
        message: "JUPITER_OPTIONAL_KEY_MISSING", code: "OPTIONAL_KEY_MISSING", missingKey: "JUPITER_API_KEY",
      });
    }
    assert.equal(f.provider.availabilityState, "OPTIONAL_KEY_MISSING");
    assert.equal(f.provider.missingKey, "JUPITER_API_KEY");
    assert.equal(f.provider.keyless, false);
    assert.equal(provider.keyless, false);
    assert.equal(provider.forChain("base").keyless, true);
    assert.equal(f.calls.length, 0);
    assert.deepEqual(budget, before);
    const result = await captureForwardExecutionCosts([{ ...request(), priceUsd: 2 }], {
      now: NOW, clock: f.clock, quoteProvider: provider,
    });
    assert.equal(result.audit.accepted, 0);
    assert.equal(result.audit.quoteAttempts[0].providerErrorCode, "JUPITER_OPTIONAL_KEY_MISSING");
    assert.equal(f.calls.length, 0);
    assert.deepEqual(budget, before);
  }
});

test("50bps minimum-output bounds use exact atomic rounding, including u64-sized amounts", async () => {
  for (const amount of ["50000000", "50000001", "18446744073709551615"]) {
    const output = BigInt(amount);
    const minimum = output * 9950n / 10000n;
    const ceiling = (output * 9950n + 9999n) / 10000n;
    const withThreshold = (threshold) => fixture((p, u) => {
      if (!u.pathname.endsWith("order")) return;
      p.outAmount = amount;
      p.routePlan[0].swapInfo.outAmount = amount;
      p.otherAmountThreshold = threshold.toString();
    });
    for (const threshold of new Set([minimum, ceiling, output])) {
      const f = withThreshold(threshold);
      assert.equal((await f.provider(request())).outputTokenAmountAtomic, amount);
    }
    for (const threshold of [1n, minimum - 1n]) {
      const f = withThreshold(threshold);
      await assert.rejects(f.provider(request()), /JUPITER_SLIPPAGE_THRESHOLD_MISMATCH/);
    }
    if (output < 2n ** 64n - 1n) {
      const f = withThreshold(output + 1n);
      await assert.rejects(f.provider(request()), /JUPITER_SLIPPAGE_THRESHOLD_MISMATCH/);
    }
  }
});

test("a permissive threshold on either leg cannot become paired cost evidence", async () => {
  for (const side of ["BUY", "SELL"]) {
    const f = fixture((p, u) => {
      if (u.pathname.endsWith("order") && p.requestId === side.toLowerCase()) p.otherAmountThreshold = "1";
    });
    const result = await captureForwardExecutionCosts([{ ...request(), priceUsd: 2 }], {
      now: NOW, clock: f.clock, quoteProvider: f.provider,
    });
    assert.equal(result.audit.accepted, 0);
    assert.equal(result.projects[0].executionCostProvenance, undefined);
    assert.equal(result.audit.quoteAttempts.at(-1).providerErrorCode, "JUPITER_SLIPPAGE_THRESHOLD_MISMATCH");
    assert.equal(f.calls.length, side === "BUY" ? 2 : 3);
  }
});

test("V2 net output reconciles the explicit platform fee without relaxing exact pool checks", async () => {
  const feeResponse = (p, u) => {
    if (!u.pathname.endsWith("order")) return;
    p.feeBps = 10;
    p.platformFee = { feeBps: 10, feeMint: JUPITER_USDC };
    p.routePlan[0].swapInfo.outAmount = "50050050";
  };
  const f = fixture(feeResponse);
  const quote = await f.provider(request());
  assert.equal(quote.outputTokenAmountAtomic, "50000000");
  const wrong = fixture((p, u) => { feeResponse(p, u); if (u.pathname.endsWith("order")) p.routePlan[0].swapInfo.outAmount = "50150050"; });
  await assert.rejects(wrong.provider(request()), /OUTPUT_FEE_MISMATCH/);
  const pool = fixture((p, u) => { feeResponse(p, u); if (u.pathname.endsWith("order")) p.routePlan[0].swapInfo.ammKey = POOL[0].toLowerCase() + POOL.slice(1); });
  await assert.rejects(pool.provider(request()), /EXACT_POOL_MISMATCH/);
});

test("no signing, wallet, submission intent, wrong chain or invalid identity reaches HTTP", async () => {
  for (const change of [{ operation: "SWAP" }, { side: "EXECUTE" }, { allowTransactionSubmission: true }, { allowOrderSubmission: true },
    { taker: TOKEN }, { wallet: TOKEN }, { chain: "base" }, { poolAddress: "" }, { requestedNotionalUsd: null }]) {
    const f = fixture();
    await assert.rejects(f.provider({ ...request(), ...change }));
    assert.equal(f.calls.length, 0);
  }
});

test("wrong pool, Solana case, token, amounts, route splits and transaction responses fail closed", async () => {
  const mutations = [
    (p) => { p.routePlan[0].swapInfo.ammKey = POOL[0].toLowerCase() + POOL.slice(1); },
    (p) => { p.outputMint = TOKEN.toLowerCase(); },
    (p) => { p.inAmount = "1"; },
    (p) => { p.routePlan[0].percent = 50; },
    (p) => { p.routePlan = []; },
    (p) => { p.transaction = "unsigned-but-forbidden"; },
    (p) => { p.signatureFeeLamports = null; },
    (p) => { p.prioritizationFeeLamports = ""; },
    (p) => { p.rentFeeLamports = -1; },
    (p) => { p.otherAmountThreshold = "50000001"; },
    (p) => { p.outAmount = "18446744073709551616"; },
  ];
  for (const mutate of mutations) {
    const f = fixture((p, u) => { if (u.pathname.endsWith("order")) mutate(p); });
    await assert.rejects(f.provider(request()));
    assert.equal(f.calls.length, 2);
  }
});

test("unknown decimals or USD conversion never becomes zero-cost evidence", async () => {
  for (const change of [(p) => { delete p[TOKEN]; }, (p) => { p[JUPITER_SOL].usdPrice = null; },
    (p) => { p[TOKEN].decimals = 6.5; }, (p) => { delete p[JUPITER_USDC].blockId; }]) {
    const f = fixture((p, u) => { if (u.pathname === "/price/v3") change(p); });
    await assert.rejects(f.provider(request()), /PRICE_OR_DECIMALS/);
    assert.equal(f.calls.length, 1);
  }
});

test("sell cannot change the exact buy amount or reuse an old buy", async () => {
  const f = fixture();
  const buy = await f.provider(request());
  await assert.rejects(f.provider({ ...request("SELL"), inputTokenAmount: buy.outputTokenAmount, inputTokenAmountAtomic: "50000001" }), /SELL_NOT_BOUND/);
  assert.equal(f.calls.length, 2);
  await assert.rejects(f.provider({ ...request("SELL"), inputTokenAmount: buy.outputTokenAmount, inputTokenAmountAtomic: buy.outputTokenAmountAtomic }), /SELL_NOT_BOUND/);
});

test("429 stops acquisition without immediate retries", async () => {
  let calls = 0;
  const f = fixture(() => {}, { fetch: async () => { calls++; return { ok: false, status: 429, headers: new Headers({ "x-ratelimit-reset": String(Date.parse(NOW) / 1000 + 120) }) }; } });
  await assert.rejects(f.provider(request()), /HTTP_429/);
  await assert.rejects(f.provider(request()), /RATE_LIMITED/);
  assert.equal(calls, 1);
});

test("authenticated requests retain the 70-request run cap and 2100ms spacing", async () => {
  const f = fixture();
  for (let index = 0; index < 35; index++) await f.provider(request());
  await assert.rejects(f.provider(request()), /JUPITER_RUN_BUDGET_EXHAUSTED/);
  assert.equal(f.calls.length, 70);
  assert.ok(f.calls.slice(1).every((call, index) => call.at - f.calls[index].at >= 2100));
});

test("the shared 30-request minute cap rejects before HTTP", async () => {
  const budget = { requests: Array(30).fill(Date.parse(NOW)), nextAt: 0 };
  const f = fixture(() => {}, { budget });
  await assert.rejects(f.provider(request()), /JUPITER_RATE_LIMITED/);
  assert.equal(f.calls.length, 0);
  assert.equal(budget.requests.length, 30);
});
