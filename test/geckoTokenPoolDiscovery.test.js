import test from "node:test";
import assert from "node:assert/strict";
import {
  createActiveEvidenceExecutionState,
  executeActiveEvidenceProviderRequests,
} from "../src/data/activeEvidenceProviderExecutor.js";
import { getGeckoTokenPools } from "../src/data/geckoTokenPoolDiscovery.js";
import { analyzeActiveEvidenceRecoveryBatch } from "../src/engines/activeEvidenceRecoveryEngine.js";

const TOKEN = "0x1111111111111111111111111111111111111111";
const POOL = "0x2222222222222222222222222222222222222222";
const QUOTE = "0x3333333333333333333333333333333333333333";
const NOW = Date.parse("2026-10-21T22:00:00.000Z");
const request = (field = "poolAddress") => ({ field,
  item: { canonicalField: field, targetSources: [{ source: "GeckoTerminal" }] } });
const candidate = (patch = {}) => ({ chain: "base", tokenAddress: TOKEN, ...patch });
function pool({ network = "base", token = TOKEN, quote = QUOTE, address = POOL } = {}) {
  return { type: "pool", id: `${network}_${address}`, attributes: {
    address, name: "EXACT / USDC", base_token_price_usd: "0.42", reserve_in_usd: "240000",
    volume_usd: { h24: "81000" },
  }, relationships: {
    base_token: { data: { type: "token", id: `${network}_${token}` } },
    quote_token: { data: { type: "token", id: `${network}_${quote}` } },
  } };
}

test("missing pool acquires one exact GeckoTerminal token pool without execution proof", async t => {
  t.mock.method(globalThis, "fetch", async () => assert.fail("No live HTTP allowed"));
  let calls = 0;
  const state = createActiveEvidenceExecutionState({ now: () => NOW, maxProviderRequests: 1 });
  const result = await executeActiveEvidenceProviderRequests(candidate(), [request()], {
    providers: {
      getGeckoTokenPools: async (chain, token, options) => {
        calls++;
        assert.equal(chain, "base");
        assert.equal(token, TOKEN);
        assert.equal(options.maxAttempts, 1);
        return { data: [pool()] };
      },
      getGeckoPoolByAddress: async () => assert.fail("No known pool to refresh"),
    },
  }, state);
  assert.equal(calls, 1);
  assert.equal(state.requestsUsed, 1);
  assert.equal(result.observations.find(row => row.field === "poolAddress")?.value, POOL);
  assert.equal(result.observations.find(row => row.field === "priceUsd")?.value, 0.42);
  assert.equal(result.observations.find(row => row.field === "poolAddress")?.source, "geckoterminal");
  assert.equal(result.observations.find(row => row.field === "poolAddress")?.marketEvidenceOnly, true);
  assert.equal(result.observations.some(row => /Quote|RouteConfirmed|sellRoute/.test(row.field)), false);
  assert.equal(result.projectPatch.buyQuoteVerified, undefined);
  assert.equal(result.attempts[0].matchedIdentity, `base:${TOKEN}:${POOL}`);
  const observation = result.observations.find(row => row.field === "poolAddress");
  assert.equal(observation.identityMatchMode, "exact-token-pools");
  assert.equal(observation.sourceTimestamp, new Date(NOW).toISOString());
  assert.equal(observation.tokenSide, "base");
  assert.equal(observation.chain, "base");
  assert.equal(observation.tokenAddress, TOKEN);
  assert.equal(observation.poolAddress, POOL);
});

test("default free Gecko transport uses one documented token page and captures original bytes", async t => {
  t.mock.method(globalThis, "fetch", async () => assert.fail("No live HTTP allowed"));
  let calls = 0, receipt;
  const bytes = Buffer.from(JSON.stringify({ data: [pool()] }));
  const state = createActiveEvidenceExecutionState({ now: () => NOW, maxProviderRequests: 1 });
  const result = await executeActiveEvidenceProviderRequests(candidate(), [request()], {
    fetchImpl: async (url, options) => {
      calls++;
      assert.equal(url, `https://api.geckoterminal.com/api/v2/networks/base/tokens/${TOKEN}/pools?page=1`);
      assert.equal(options.headers.accept, "application/json;version=20230203");
      assert.equal(options.redirect, "error");
      assert.ok(options.signal instanceof AbortSignal);
      return new Response(bytes, { status: 200 });
    },
    onResponseBytes: value => { receipt = value; },
  }, state);
  assert.equal(calls, 1);
  assert.equal(state.requestsUsed, 1);
  assert.equal(result.observations.find(row => row.field === "poolAddress")?.value, POOL);
  assert.deepEqual(receipt.rawBytes, bytes);
  assert.equal(receipt.provider, "geckoterminal");
  assert.equal(receipt.requestedAt, new Date(NOW).toISOString());
  assert.equal(receipt.receivedAt, new Date(NOW).toISOString());
});

test("recovery applies the exact discovery observation and provenance without promoting route proof", async t => {
  t.mock.method(globalThis, "fetch", async () => assert.fail("No live HTTP allowed"));
  const [result] = await analyzeActiveEvidenceRecoveryBatch([candidate({ deepEvaluationState: "DEEP_EVALUATED",
    targetedEnrichmentPlan: { items: [{ canonicalField: "poolAddress", recoverable: true,
      targetSources: [{ source: "GeckoTerminal" }] }] },
  })], {
    now: () => NOW, maxProviderRequests: 1, wave1Max: 1, wave2Max: 0, wave3Max: 0,
    useCache: false, walletHistory: false,
    providers: { getGeckoTokenPools: async () => ({ data: [pool()] }) },
  });
  assert.equal(result.poolAddress, POOL);
  assert.equal(result.pairAddress, POOL);
  assert.equal(result.activeEvidenceRecovery.batchSummary.providerRequestsUsed, 1);
  assert.equal(result.fieldProvenance.poolAddress.source, "geckoterminal");
  assert.equal(result.fieldProvenance.poolAddress.identityMatchMode, "exact-token-pools");
  assert.equal(result.fieldProvenance.poolAddress.recoveryRun, true);
  assert.equal(result.fieldProvenance.poolAddress.sourceTimestamp, new Date(NOW).toISOString());
  assert.ok(result.activeEvidenceRecovery.changedEvidenceFamilies.includes("IDENTITY"));
  assert.notEqual(result.buyQuoteVerified, true);
  assert.notEqual(result.sellQuoteVerified, true);
  assert.notEqual(result.liveExecutionReady, true);
  assert.notEqual(result.finalSelectionQualified, true);
});

test("the existing network mapper and EVM address normalization bind the discovery endpoint", async t => {
  t.mock.method(globalThis, "fetch", async () => assert.fail("No live HTTP allowed"));
  const lower = `0x${"ab".repeat(20)}`;
  const upper = `0x${"AB".repeat(20)}`;
  const result = await executeActiveEvidenceProviderRequests({ chain: "1", tokenAddress: upper,
    contractAddress: lower }, [request()], {
    maxProviderRequests: 1, fetchImpl: async url => {
      assert.equal(url, `https://api.geckoterminal.com/api/v2/networks/eth/tokens/${lower}/pools?page=1`);
      return new Response(JSON.stringify({ data: [pool({ network: "eth", token: upper })] }), { status: 200 });
    },
  });
  assert.equal(result.observations.find(row => row.field === "tokenAddress")?.value, lower);
  assert.equal(result.attempts[0].matchedIdentity, `ethereum:${lower}:${POOL}`);
});

test("multiple pools are ambiguous regardless of response order or liquidity", async t => {
  t.mock.method(globalThis, "fetch", async () => assert.fail("No live HTTP allowed"));
  const second = pool({ address: QUOTE, quote: POOL });
  second.attributes.reserve_in_usd = "999999999";
  for (const data of [[pool(), second], [second, pool()], [pool(), pool()]]) {
    let calls = 0;
    const state = createActiveEvidenceExecutionState({ maxProviderRequests: 1 });
    const result = await executeActiveEvidenceProviderRequests(candidate(), [request()], {
      providers: { getGeckoTokenPools: async () => { calls++; return { data }; } },
    }, state);
    assert.equal(calls, 1);
    assert.equal(state.requestsUsed, 1);
    assert.deepEqual(result.observations, []);
    assert.equal(result.attempts[0].status, "AMBIGUOUS_POOL_MATCH");
  }
});

test("full, oversized or continued pages never masquerade as unique complete discovery", async t => {
  t.mock.method(globalThis, "fetch", async () => assert.fail("No live HTTP allowed"));
  for (const payload of [
    { data: Array.from({ length: 20 }, () => pool()) },
    { data: Array.from({ length: 21 }, () => pool()) },
    { data: [pool()], links: { next: "https://untrusted.invalid/page/2" } },
    { data: [pool()], meta: { next_page: 2 } },
    { data: [pool()], meta: { has_more: true } },
  ]) {
    let calls = 0;
    const result = await executeActiveEvidenceProviderRequests(candidate(), [request()], {
      maxProviderRequests: 1, providers: { getGeckoTokenPools: async () => { calls++; return payload; } },
    });
    assert.equal(calls, 1);
    assert.equal(result.attempts[0].status, "POOL_DISCOVERY_INCOMPLETE");
    assert.deepEqual(result.observations, []);
  }
});

test("wrong chain, token side and inconsistent response identities never produce a pool", async t => {
  t.mock.method(globalThis, "fetch", async () => assert.fail("No live HTTP allowed"));
  const wrongId = pool(); wrongId.id = `base_${QUOTE}`;
  const wrongNetwork = pool(); wrongNetwork.relationships.network = { data: { id: "eth" } };
  const wrongTokenNetwork = pool(); wrongTokenNetwork.relationships.base_token.data.id = `eth_${TOKEN}`;
  const wrongQuoteNetwork = pool(); wrongQuoteNetwork.relationships.quote_token.data.id = `eth_${QUOTE}`;
  const noBase = pool(); delete noBase.relationships.base_token;
  for (const data of [[pool({ network: "eth" })], [pool({ token: QUOTE })],
    [pool({ token: QUOTE, quote: TOKEN })], [pool({ address: "malformed-pool" })],
    [pool({ address: `0x${"0".repeat(40)}` })], [wrongId], [wrongNetwork], [wrongTokenNetwork],
    [wrongQuoteNetwork], [noBase], [pool(), wrongId]]) {
    const state = createActiveEvidenceExecutionState({ maxProviderRequests: 1 });
    const result = await executeActiveEvidenceProviderRequests(candidate(), [request()], {
      providers: { getGeckoTokenPools: async () => ({ data }) },
    }, state);
    assert.equal(result.attempts[0].status, "NO_EXACT_POOL_MATCH");
    assert.deepEqual(result.observations, []);
    assert.equal(state.requestsUsed, 1);
  }
});

test("conflicting or malformed supplied identity is not treated as missing identity", async t => {
  t.mock.method(globalThis, "fetch", async () => assert.fail("No live HTTP allowed"));
  for (const patch of [
    { chain: "unsupported" }, { chainId: "ethereum" }, { tokenAddress: "SYMBOL" },
    { contractAddress: QUOTE }, { baseTokenAddress: QUOTE }, { poolAddress: "malformed-pool" },
    { poolAddress: POOL, pairAddress: QUOTE }, { poolAddress: POOL, finalPairAddress: QUOTE },
    { poolAddress: POOL, canonicalExecutionRoute: { poolAddress: QUOTE } },
    { poolAddress: POOL, rawCandidate: { pairAddress: "invalid" } },
    { identityConflict: true }, { canonicalIdentityHardBlock: true },
    { tokenAddress: undefined, symbol: "EXACT" },
  ]) {
    let calls = 0;
    const noCall = async () => { calls++; assert.fail("Conflicting identity must not dispatch"); };
    const state = createActiveEvidenceExecutionState({ maxProviderRequests: 1 });
    const result = await executeActiveEvidenceProviderRequests(candidate(patch), [request()], {
      providers: { getGeckoTokenPools: noCall, getGeckoPoolByAddress: noCall },
    }, state);
    assert.equal(calls, 0);
    assert.equal(state.requestsUsed, 0);
    assert.equal(result.attempts[0].status, "NOT_APPLICABLE");
    assert.deepEqual(result.observations, []);
  }
});

test("known-pool refresh stays exact and never switches to token discovery", async t => {
  t.mock.method(globalThis, "fetch", async () => assert.fail("No live HTTP allowed"));
  for (const [raw, accepted] of [[pool(), true], [pool({ address: QUOTE }), false],
    [pool({ token: QUOTE, quote: TOKEN }), false], [pool({ network: "eth" }), false]]) {
    let calls = 0;
    const state = createActiveEvidenceExecutionState({ maxProviderRequests: 1 });
    const result = await executeActiveEvidenceProviderRequests(candidate({ poolAddress: POOL }), [request()], {
      providers: {
        getGeckoTokenPools: async () => assert.fail("Known pool cannot be replaced by discovery"),
        getGeckoPoolByAddress: async (chain, address, options) => {
          calls++; assert.equal(chain, "base"); assert.equal(address, POOL);
          assert.equal(options.maxAttempts, 1); return { data: raw };
        },
      },
    }, state);
    assert.equal(calls, 1);
    assert.equal(state.requestsUsed, 1);
    assert.equal(Boolean(result.observations.length), accepted);
    if (accepted) assert.equal(result.observations[0].identityMatchMode, "exact-pool");
    else assert.equal(result.attempts[0].status, "NO_EXACT_POOL_MATCH");
  }
});

const SOL_TOKEN = "G8aVC4nk5oPWzTHp4PDm3kAuixCebv9WRQMD93h9pump";
const SOL_POOL = "D7rYGDh5RyP4UXPtW2dSUvg8BYkdPSB1ZdAdBKW1zqnX";
const SOL_QUOTE = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
test("Solana discovery preserves case and requires a decoded 32-byte mint and pool", async t => {
  t.mock.method(globalThis, "fetch", async () => assert.fail("No live HTTP allowed"));
  const base = { network: "solana", token: SOL_TOKEN, quote: SOL_QUOTE, address: SOL_POOL };
  for (const [raw, accepted] of [[pool(base), true],
    [pool({ ...base, token: SOL_TOKEN.replace(/^G/, "g") }), false],
    [pool({ ...base, address: "z".repeat(44) }), false],
    [pool({ ...base, quote: "0".repeat(32) }), false]]) {
    const result = await executeActiveEvidenceProviderRequests({ chain: "solana", tokenAddress: SOL_TOKEN }, [request()], {
      maxProviderRequests: 1, providers: { getGeckoTokenPools: async () => ({ data: [raw] }) },
    });
    assert.equal(Boolean(result.observations.length), accepted);
    if (accepted) {
      assert.equal(result.observations.find(row => row.field === "tokenAddress")?.value, SOL_TOKEN);
      assert.equal(result.observations.find(row => row.field === "poolAddress")?.value, SOL_POOL);
    }
  }
  for (const patch of [{ tokenAddress: "z".repeat(44) }, { tokenAddress: "0".repeat(32) },
    { tokenAddress: SOL_TOKEN, poolAddress: "z".repeat(44) }]) {
    const state = createActiveEvidenceExecutionState({ maxProviderRequests: 1 });
    const result = await executeActiveEvidenceProviderRequests({ chain: "solana", ...patch }, [request()], {
      providers: { getGeckoTokenPools: async () => assert.fail("Invalid Solana identity"),
        getGeckoPoolByAddress: async () => assert.fail("Invalid Solana pool") },
    }, state);
    assert.equal(state.requestsUsed, 0);
    assert.equal(result.attempts[0].status, "NOT_APPLICABLE");
  }
});

test("exhausted global and phase request/time allowances never dispatch discovery", async t => {
  t.mock.method(globalThis, "fetch", async () => assert.fail("No live HTTP allowed"));
  for (const [stateOptions, options, status] of [
    [{ maxProviderRequests: 0 }, {}, "REQUEST_BUDGET_EXHAUSTED"],
    [{ maxProviderRequests: 1 }, { phaseRequestLimit: 0 }, "PHASE_REQUEST_BUDGET_EXHAUSTED"],
    [{ maxProviderRequests: 1, timeBudgetMs: 0 }, {}, "TIME_BUDGET_EXHAUSTED"],
    [{ maxProviderRequests: 1 }, { phaseDeadlineAt: NOW }, "PHASE_TIME_BUDGET_EXHAUSTED"],
  ]) {
    const state = createActiveEvidenceExecutionState({ now: () => NOW, ...stateOptions });
    const result = await executeActiveEvidenceProviderRequests(candidate(), [request()], {
      ...options, providers: { getGeckoTokenPools: async () => assert.fail("No allowance") },
    }, state);
    assert.equal(state.requestsUsed, 0);
    assert.equal(result.attempts[0].status, status);
    assert.deepEqual(result.observations, []);
  }
});

test("the remaining unit after DexScreener is shared, not reset for discovery", async t => {
  t.mock.method(globalThis, "fetch", async () => assert.fail("No live HTTP allowed"));
  for (const budget of [1, 2]) {
    let calls = 0;
    const state = createActiveEvidenceExecutionState({ maxProviderRequests: budget });
    const result = await executeActiveEvidenceProviderRequests(candidate(), [request(),
      { field: "poolAddress", item: { targetSources: [{ source: "DexScreener" }] } }], {
      providers: { getTokenPairs: async () => [],
        getGeckoTokenPools: async () => { calls++; return { data: [pool()] }; } },
    }, state);
    assert.equal(calls, budget - 1);
    assert.equal(state.requestsUsed, budget);
    assert.equal(Boolean(result.observations.length), budget === 2);
  }
});

test("a discovery response arriving after the phase deadline remains unknown", async t => {
  t.mock.method(globalThis, "fetch", async () => assert.fail("No live HTTP allowed"));
  let now = NOW;
  const state = createActiveEvidenceExecutionState({ now: () => now, maxProviderRequests: 1, timeBudgetMs: 1000 });
  const originalDeadline = state.deadlineAt;
  const result = await executeActiveEvidenceProviderRequests(candidate(), [request()], {
    phaseDeadlineAt: NOW + 5,
    providers: { getGeckoTokenPools: async (chain, token, options) => {
      assert.ok(options.timeoutMs <= 5); now += 6; return { data: [pool()] };
    } },
  }, state);
  assert.equal(result.attempts[0].status, "PHASE_TIME_BUDGET_EXHAUSTED");
  assert.deepEqual(result.observations, []);
  assert.equal(state.requestsUsed, 1);
  assert.equal(state.deadlineAt, originalDeadline);
  assert.equal(state.providers.get("geckoterminal:base").failures, 0);
});

test("phase timeout aborts the default Gecko response body instead of leaving background work", async t => {
  t.mock.method(globalThis, "fetch", async () => assert.fail("No live HTTP allowed"));
  let aborted = false;
  const state = createActiveEvidenceExecutionState({ maxProviderRequests: 1, timeBudgetMs: 1000 });
  const result = await executeActiveEvidenceProviderRequests(candidate(), [request()], {
    phaseDeadlineAt: Date.now() + 50,
    fetchImpl: async (url, { signal }) => ({ ok: true, headers: { get: () => null },
      json: () => new Promise((resolve, reject) => {
        signal.addEventListener("abort", () => { aborted = true; reject(new Error("aborted body")); }, { once: true });
      }) }),
  }, state);
  assert.equal(aborted, true);
  assert.equal(result.attempts[0].status, "PHASE_TIME_BUDGET_EXHAUSTED");
  assert.deepEqual(result.observations, []);
  assert.equal(state.requestsUsed, 1);
});

test("discovery and known-pool refresh honor the same per-chain circuit", async t => {
  t.mock.method(globalThis, "fetch", async () => assert.fail("No live HTTP allowed"));
  let calls = 0;
  const state = createActiveEvidenceExecutionState({ maxProviderRequests: 3, circuitFailureThreshold: 1 });
  const options = { providers: {
    getGeckoTokenPools: async () => { calls++; throw new Error("offline provider outage"); },
    getGeckoPoolByAddress: async () => assert.fail("Open circuit must block refresh too"),
  } };
  const first = await executeActiveEvidenceProviderRequests(candidate(), [request()], options, state);
  const second = await executeActiveEvidenceProviderRequests(candidate(), [request()], options, state);
  const third = await executeActiveEvidenceProviderRequests(candidate({ poolAddress: POOL }), [request()], options, state);
  assert.equal(first.attempts[0].status, "FAILED");
  assert.equal(second.attempts[0].status, "CIRCUIT_OPEN");
  assert.equal(third.attempts[0].status, "CIRCUIT_OPEN");
  assert.equal(calls, 1);
  assert.equal(state.requestsUsed, 1);
});

test("missing market measurements are not fabricated from normalizer zero defaults", async t => {
  t.mock.method(globalThis, "fetch", async () => assert.fail("No live HTTP allowed"));
  const raw = pool();
  delete raw.attributes.base_token_price_usd;
  raw.attributes.reserve_in_usd = null;
  raw.attributes.volume_usd.h24 = "";
  const result = await executeActiveEvidenceProviderRequests(candidate(), [request()], {
    maxProviderRequests: 1, providers: { getGeckoTokenPools: async () => ({ data: [raw] }) },
  });
  assert.equal(result.observations.find(row => row.field === "poolAddress")?.value, POOL);
  assert.equal(result.observations.some(row => ["priceUsd", "liquidityUsd", "volume24hUsd"].includes(row.field)), false);
});

test("empty and malformed responses preserve raw bytes and never retry", async t => {
  t.mock.method(globalThis, "fetch", async () => assert.fail("No live HTTP allowed"));
  for (const [status, body] of [[404, '{"error":"not found"}'], [200, '{"data":[]}'],
    [200, '{"data":{}}'], [200, "{ definitely not JSON"], [429, '{"error":"rate limited"}']]) {
    let calls = 0, receipt;
    const state = createActiveEvidenceExecutionState({ maxProviderRequests: 1 });
    const result = await executeActiveEvidenceProviderRequests(candidate(), [request()], {
      fetchImpl: async () => { calls++; return new Response(body, { status }); },
      onResponseBytes: value => { receipt = value; },
    }, state);
    assert.equal(calls, 1);
    assert.equal(state.requestsUsed, 1);
    assert.equal(receipt.rawBytes.toString("utf8"), body);
    assert.deepEqual(result.observations, []);
    assert.equal(result.attempts[0].status, status === 429 || body === "{ definitely not JSON" ? "FAILED" : "NO_EXACT_POOL_MATCH");
  }
  let calls = 0;
  await assert.rejects(getGeckoTokenPools("base", TOKEN, {
    fetchImpl: async () => { calls++; return new Response('{"data":[]}', { status: 200 }); },
    onResponseBytes: () => { throw new Error("receipt storage failure"); },
  }), /receipt storage failure/);
  assert.equal(calls, 1);
});
