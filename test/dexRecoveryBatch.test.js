import test from "node:test";
import assert from "node:assert/strict";
import { getTokenPairsBatch } from "../src/data/dexScreenerConnector.js";
import { createActiveEvidenceExecutionState, executeActiveEvidenceProviderRequests, prepareDexRecoveryBatches }
  from "../src/data/activeEvidenceProviderExecutor.js";
import { analyzeActiveEvidenceRecoveryBatch, createActiveEvidenceRecoveryState }
  from "../src/engines/activeEvidenceRecoveryEngine.js";

const NOW = Date.parse("2026-10-24T12:00:00Z");
const SOL_TOKEN = "So11111111111111111111111111111111111111112";
const SOL_POOL = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const address = number => `0x${number.toString(16).padStart(40, "0")}`;
const item = (field = "priceUsd", source = "DexScreener") => ({ canonicalField: field, recoverable: true,
  requiresFreshObservation: true, evidenceClass: "CORE", blockingResearch: true, targetSources: [{ source }] });
const entries = [{ field: "priceUsd", item: item() }];
const candidate = (number, patch = {}) => ({ chain: "base", tokenAddress: address(number),
  contractAddress: address(number), poolAddress: address(number + 1000),
  deepEvaluationState: "DEEP_EVALUATED", valueOfInformationScore: 1000 - number,
  targetedEnrichmentPlan: { items: [item()] }, ...patch });
const pair = (token, chain = "base", pool = address(Number(BigInt(token)) + 1000)) => ({ chainId: chain,
  pairAddress: pool, baseToken: { address: token, symbol: "SAME" }, quoteToken: { address: address(9999) },
  priceUsd: "1.25", liquidity: { usd: 200000 }, volume: { h24: 100000 }, txns: { h24: { buys: 13, sells: 4 } } });
const options = patch => ({ now: () => Date.now(), useCache: false, walletHistory: false,
  wave1Max: 500, wave2Max: 0, wave3Max: 0, concurrency: 6, maxProviderRequests: 500,
  timeBudgetMs: 30000, ...patch });

function batchFetch(t, respond = (tokens, chain) => tokens.map(token => pair(token, chain))) {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, init) => {
    const parsed = new URL(url);
    assert.equal(parsed.origin, "https://api.dexscreener.com");
    const [, endpoint, version, chain, tokens] = parsed.pathname.split("/");
    assert.equal(endpoint, "tokens");
    assert.equal(version, "v1");
    assert.equal(init.redirect, "error");
    const addresses = tokens.split(",");
    assert.ok(addresses.length <= 30);
    calls.push({ chain, addresses, signal: init.signal });
    return { ok: true, json: async () => respond(addresses, chain, calls.length) };
  });
  return calls;
}

async function run(t, projects, patch = {}, respond) {
  t.mock.timers.enable({ apis: ["Date"], now: NOW });
  const calls = batchFetch(t, respond);
  const opts = options(patch);
  const state = createActiveEvidenceRecoveryState(opts);
  const results = await analyzeActiveEvidenceRecoveryBatch(projects, { ...opts, executionState: state });
  assert.equal([...state.providers.values()].filter(row => row.provider === "dexscreener")
    .reduce((sum, row) => sum + row.attempts, 0), calls.length);
  assert.equal(results.length, projects.length);
  assert.equal(results.some(project => project.finalSelectionQualified === true), false);
  return { calls, state, results };
}

test("500 selected candidates hydrate through 17 real batch transports, with unchanged counts and no inferred evidence", async t => {
  const projects = Array.from({ length: 500 }, (_, index) => candidate(index + 1));
  const { calls, state, results } = await run(t, projects);
  assert.equal(calls.length, 17);
  assert.equal(state.requestsUsed, 17);
  assert.deepEqual(calls.map(call => call.addresses.length), [...Array(16).fill(30), 20]);
  assert.equal(state.maxRequests, 500);
  assert.equal(state.providers.get("dexscreener:base").attempts, 17);
  const attempts = results.flatMap(project => project.activeEvidenceRecovery.providerAttempts);
  assert.equal(attempts.reduce((sum, attempt) => sum + attempt.requestCost, 0), 17);
  assert.equal(new Set(attempts.map(attempt => attempt.batchRequestId)).size, 17);
  for (const result of results) {
    assert.equal(result.priceUsd, 1.25);
    assert.equal(result.buyTransactions24h, 13);
    for (const field of ["uniqueBuyers24h", "uniqueSmartBuyers24h", "holders", "holderCount", "holderAddresses",
      "creator", "executionQuote", "buyQuoteVerified", "sellQuoteVerified", "purchaseRouteConfirmed", "sellRouteAvailable", "securityEvidence"])
      assert.equal(result[field], undefined);
    assert.equal(result.fieldProvenance.priceUsd.source, "dexscreener");
    assert.equal(result.fieldProvenance.priceUsd.sourceTimestamp, new Date(NOW).toISOString());
    assert.equal(result.fieldProvenance.priceUsd.chain, result.chain);
    assert.equal(result.fieldProvenance.priceUsd.tokenAddress, result.tokenAddress);
    assert.equal(result.fieldProvenance.priceUsd.poolAddress, result.poolAddress);
    assert.equal(result.activeEvidenceRecovery.batchSummary.deepEvaluatedCandidates, 500);
    assert.equal(result.activeEvidenceRecovery.batchSummary.selectedWaveCounts.WAVE1, 500);
  }
  let singularCalls = 0;
  const baseline = await analyzeActiveEvidenceRecoveryBatch(projects, options({ providers: {
    getTokenPairs: async (_chain, token) => { singularCalls++; return [pair(token)]; },
  } }));
  assert.equal(singularCalls, 500);
  assert.deepEqual(results.map(project => project.priceUsd), baseline.map(project => project.priceUsd));
  assert.deepEqual(results.map(project => project.poolAddress), baseline.map(project => project.poolAddress));
});

test("connector enforces documented bound, chain and address syntax before any transport", async t => {
  const calls = batchFetch(t);
  for (const [chain, tokens] of [["base", []], ["base", Array(31).fill(address(1))], ["unknown", [address(1)]],
    ["base", ["SAME"]], ["base", [address(0)]], ["solana", [address(1)]], ["solana", [`Abc${"1".repeat(29)}`]]]) {
    await assert.rejects(getTokenPairsBatch(chain, tokens), TypeError);
  }
  assert.equal(calls.length, 0);
  await getTokenPairsBatch("Base", [address(10).toUpperCase().replace("0X", "0x"), address(10)]);
  assert.deepEqual(calls[0].addresses, [address(10)]);
});

test("valid Solana case-distinct tokens stay separate in the encoded batch endpoint", async t => {
  const calls = batchFetch(t, () => []);
  await getTokenPairsBatch("solana", [SOL_TOKEN, SOL_TOKEN.toLowerCase()]);
  assert.deepEqual(calls[0].addresses, [SOL_TOKEN, SOL_TOKEN.toLowerCase()]);
});

test("batches stay same-chain, use frozen exact pools, and preserve adverse facts", async t => {
  const adverse = { honeypot: true, sellRestricted: true, buyTax: 0.9, securityEvidence: [{ status: "UNSAFE" }] };
  const projects = [candidate(1, adverse), candidate(1, { poolAddress: address(9001) }),
    candidate(2, { chain: "ethereum" })];
  const { calls, results } = await run(t, projects, {}, (tokens, chain) => tokens.flatMap(token => [
    pair(token, chain), pair(token, chain, address(9001)),
    { ...pair(token, chain, address(9002)), priceUsd: "9000", liquidity: { usd: 999999999 } },
  ]));
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0].addresses, [address(1)]);
  assert.equal(results[0].poolAddress, address(1001));
  assert.equal(results[1].poolAddress, address(9001));
  for (const [key, value] of Object.entries(adverse)) assert.deepEqual(results[0][key], value);
});

test("a frozen pool in canonical route claims constrains batch selection even without a top-level pool", async t => {
  const { results } = await run(t, [candidate(1, { poolAddress: null,
    canonicalExecutionRoute: { chain: "base", tokenAddress: address(1), poolAddress: address(9001) },
  })], {}, tokens => [pair(tokens[0], "base", address(9001)), {
    ...pair(tokens[0]), priceUsd: "9000", liquidity: { usd: 999999999 },
  }]);
  assert.equal(results[0].poolAddress, address(9001));
  assert.equal(results[0].priceUsd, 1.25);
});

test("incomplete and foreign payloads leave absent targets unknown and still use independent fallbacks", async t => {
  let fallbacks = 0;
  const projects = [candidate(1), candidate(2), candidate(3, {
    targetedEnrichmentPlan: { items: [item("priceUsd", "DexScreener, GeckoTerminal")] },
  })];
  const { calls, results, state } = await run(t, projects, { providers: {
    getGeckoPoolByAddress: async () => { fallbacks++; return { data: {
      type: "pool", id: `base_${address(1003)}`, attributes: { address: address(1003), base_token_price_usd: "2" },
      relationships: { base_token: { data: { type: "token", id: `base_${address(3)}` } },
        quote_token: { data: { type: "token", id: `base_${address(9999)}` } } },
    } }; },
  } }, tokens => [pair(tokens[0]), pair(tokens[1], "ethereum"), pair(address(999))]);
  assert.equal(calls.length, 1);
  assert.equal(fallbacks, 1);
  assert.equal(state.requestsUsed, 2);
  assert.equal(results[0].priceUsd, 1.25);
  assert.equal(results[1].priceUsd, undefined);
  assert.equal(results[2].priceUsd, 2);
  assert.equal(results[2].fieldProvenance.priceUsd.source, "geckoterminal");
});

test("malformed rows cannot abort the shared cohort or discard unrelated exact observations", async t => {
  const { results, calls } = await run(t, [candidate(1), candidate(2)], {}, tokens => [
    null, "not a pair", {}, [], { ...pair(tokens[1]), pairCreatedAt: "invalid timestamp" }, pair(tokens[0]),
  ]);
  assert.equal(calls.length, 1);
  assert.equal(results[0].priceUsd, 1.25);
  assert.equal(results[1].priceUsd, undefined);
});

test("ambiguous, invalid, symbol-only and conflicting aliases cannot enter a batch", () => {
  const projects = [candidate(1), candidate(2, { identityConflict: true }), candidate(3, { rawCandidate: { chain: "ethereum" } }),
    candidate(4, { marketData: { tokenAddress: address(99) } }), candidate(5, { poolAddress: address(0) }),
    { chain: "base", symbol: "SAME" }, { chain: "unresolved", tokenAddress: address(6) },
    candidate(7, { tokenAddress: "SAME", contractAddress: "SAME" }),
    candidate(8, { canonicalChainId: 1 }), candidate(9, { finalChainId: 1 }),
    candidate(10, { baseToken: { chain: "ethereum" } }), candidate(11, { verifiedContractAddress: address(99) }),
    candidate(12, { verifiedPairAddress: address(99) }), candidate(13, { baseTokenAddress: address(99) }),
    { canonicalAliases: { chain: "base", tokenAddress: address(14) }, symbol: "SAME" }];
  const bindings = prepareDexRecoveryBatches(projects.map((project, projectIndex) => ({ project, projectIndex, entries })));
  assert.deepEqual([...bindings.keys()], [0]);
});

test("Solana token and pool case variants, quote-only hits and foreign chains are not exact matches", async t => {
  const token = SOL_TOKEN, pool = SOL_POOL;
  const project = { chain: "solana", tokenAddress: token, poolAddress: pool };
  const opts = options({ providers: { getTokenPairsBatch: async () => [
    pair(token.toLowerCase(), "solana", pool), pair(token, "solana", pool.toLowerCase()),
    pair(token, "base", pool), { ...pair(`Ghi${"1".repeat(29)}`, "solana", pool), quoteToken: { address: token } },
  ] } });
  t.mock.method(globalThis, "fetch", () => { throw new Error("No live calls"); });
  const bindings = prepareDexRecoveryBatches([{ project, projectIndex: 0, entries }], opts);
  const result = await executeActiveEvidenceProviderRequests(project, entries, { ...opts, dexRecoveryBatch: bindings.get(0) });
  assert.deepEqual(result.observations, []);
  assert.equal(result.attempts[0].status, "AMBIGUOUS_OR_NO_EXACT_MATCH");
  opts.providers.getTokenPairsBatch = async () => [pair(token, "solana", pool)];
  const exactBindings = prepareDexRecoveryBatches([{ project, projectIndex: 0, entries }], opts);
  const exact = await executeActiveEvidenceProviderRequests(project, entries, { ...opts, dexRecoveryBatch: exactBindings.get(0) });
  assert.equal(exact.observations.find(row => row.field === "priceUsd").value, 1.25);
});

test("custom singular providers remain singular and cannot trigger the default batch transport", async t => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", () => { throw new Error("No live calls"); });
  const results = await analyzeActiveEvidenceRecoveryBatch([candidate(1), candidate(2)], options({ providers: {
    getTokenPairs: async (_chain, token) => { calls++; return [pair(token)]; },
  } }));
  assert.equal(calls, 2);
  assert.ok(results.every(project => project.priceUsd === 1.25));
});

for (const [label, patch] of [["zero global budget", { maxProviderRequests: 0 }],
  ["zero phase budget", { phaseRequestLimit: 0 }], ["expired absolute deadline", { timeBudgetMs: 0 }],
  ["expired caller phase deadline", { phaseDeadlineAt: NOW }]]) {
  test(`${label} admits no batch HTTP and preserves all candidates`, async t => {
    const { calls, results } = await run(t, [candidate(1), candidate(2)], patch);
    assert.equal(calls.length, 0);
    assert.ok(results.every(project => project.priceUsd === undefined));
  });
}

test("one remaining request hydrates only its bound 30 targets without spending 30 budget units", async t => {
  const { calls, results } = await run(t, Array.from({ length: 61 }, (_, index) => candidate(index + 1)),
    { maxProviderRequests: 1, concurrency: 1 });
  assert.equal(calls.length, 1);
  assert.equal(results.filter(project => project.priceUsd === 1.25).length, 30);
  assert.equal(results.filter(project => project.priceUsd === undefined).length, 31);
});

test("positive phase allowance limits actual HTTP without changing the absolute request budget", async t => {
  const { calls, results, state } = await run(t, Array.from({ length: 61 }, (_, index) => candidate(index + 1)),
    { phaseRequestLimit: 1, concurrency: 6 });
  assert.equal(calls.length, 1);
  assert.equal(state.maxRequests, 500);
  assert.equal(state.phaseRequestBudgetExceeded, true);
  assert.equal(results.filter(project => project.priceUsd === 1.25).length, 30);
});

test("only selected, unresolved, deep candidates are bound into batch HTTP", async t => {
  const { calls, results } = await run(t, [candidate(1), candidate(2), candidate(3, {
    deepEvaluationState: "DEFERRED_BEFORE_DEEP",
  })], { wave1Max: 1 });
  assert.deepEqual(calls[0].addresses, [address(1)]);
  assert.equal(results[1].priceUsd, undefined);
  assert.equal(results[2].priceUsd, undefined);
  assert.equal(results[0].activeEvidenceRecovery.batchSummary.selectedWaveCounts.WAVE1, 1);
});

test("one failed batch opens one shared chain circuit, not 30 failures", async t => {
  const { calls, state, results } = await run(t, Array.from({ length: 61 }, (_, index) => candidate(index + 1)),
    { circuitFailureThreshold: 1, concurrency: 1 }, () => { throw new Error("Injected outage"); });
  assert.equal(calls.length, 1);
  assert.equal(state.providers.get("dexscreener:base").failures, 1);
  assert.equal(state.providers.get("dexscreener:base").circuitOpen, true);
  assert.ok(results.slice(30).every(project => project.activeEvidenceRecovery.providerAttempts[0].status === "CIRCUIT_OPEN"));
});

test("late batch responses cannot extend frozen duty windows or poison outage circuits", async t => {
  const { calls, state, results } = await run(t, [candidate(1), candidate(2)], { timeBudgetMs: 1000 }, tokens => {
    t.mock.timers.tick(1000);
    return tokens.map(token => pair(token));
  });
  assert.equal(calls.length, 1);
  assert.equal(state.deadlineAt, NOW + 1000);
  assert.equal(state.providers.get("dexscreener:base").failures, 0);
  assert.ok(results.every(project => project.priceUsd === undefined));
});

test("cached batch observations keep their receipt clock and expire without being restamped", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: NOW });
  const calls = batchFetch(t);
  const opts = options({ deadlineAt: Infinity });
  const state = createActiveEvidenceExecutionState(opts);
  const projects = [candidate(1), candidate(2)];
  const bindings = prepareDexRecoveryBatches(projects.map((project, projectIndex) => ({ project, projectIndex, entries })), opts);
  const first = await executeActiveEvidenceProviderRequests(projects[0], entries, { ...opts, dexRecoveryBatch: bindings.get(0) }, state);
  assert.equal(first.observations.find(row => row.field === "priceUsd").sourceTimestamp, new Date(NOW).toISOString());
  t.mock.timers.tick(31 * 60000);
  const second = await executeActiveEvidenceProviderRequests(projects[1], entries, { ...opts, dexRecoveryBatch: bindings.get(1) }, state);
  assert.equal(second.observations.some(row => row.field === "priceUsd"), false);
  assert.equal(second.attempts[0].receiptObservedAt, new Date(NOW).toISOString());
  assert.equal(calls.length, 1);
});

test("shared successful payload cannot hydrate a changed or unbound target", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: NOW });
  let singularCalls = 0;
  const calls = batchFetch(t, tokens => [...tokens.map(token => pair(token)), pair(address(99))]);
  const opts = options({ providers: {
    getTokenPairsBatch,
    getTokenPairs: async () => { singularCalls++; return []; },
  } });
  const state = createActiveEvidenceExecutionState(opts);
  const projects = [candidate(1), candidate(2)];
  const bindings = prepareDexRecoveryBatches(projects.map((project, projectIndex) => ({ project, projectIndex, entries })), opts);
  await executeActiveEvidenceProviderRequests(projects[0], entries, { ...opts, dexRecoveryBatch: bindings.get(0) }, state);
  const foreign = await executeActiveEvidenceProviderRequests(candidate(99), entries,
    { ...opts, dexRecoveryBatch: bindings.get(1) }, state);
  const changedPool = await executeActiveEvidenceProviderRequests(candidate(2, { poolAddress: address(999) }), entries,
    { ...opts, dexRecoveryBatch: bindings.get(1) }, state);
  assert.deepEqual(foreign.observations, []);
  assert.deepEqual(changedPool.observations, []);
  assert.equal(calls.length, 1);
  assert.equal(singularCalls, 2);
  assert.equal(state.requestsUsed, 3);
});

test("a reused success cannot cross the consumer's tighter phase deadline", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: NOW });
  const calls = batchFetch(t);
  const opts = options();
  const state = createActiveEvidenceExecutionState(opts);
  const projects = [candidate(1), candidate(2)];
  const bindings = prepareDexRecoveryBatches(projects.map((project, projectIndex) => ({ project, projectIndex, entries })), opts);
  await executeActiveEvidenceProviderRequests(projects[0], entries, { ...opts, dexRecoveryBatch: bindings.get(0) }, state);
  t.mock.timers.tick(500);
  const second = await executeActiveEvidenceProviderRequests(projects[1], entries,
    { ...opts, phaseDeadlineAt: NOW + 500, dexRecoveryBatch: bindings.get(1) }, state);
  assert.deepEqual(second.observations, []);
  assert.equal(second.attempts[0].status, "PHASE_TIME_BUDGET_EXHAUSTED");
  assert.equal(state.deadlineAt, NOW + 30000);
  assert.equal(state.timeBudgetExceeded, false);
  assert.equal(calls.length, 1);
});

test("existing provider cooldowns gate batch dispatch without new HTTP or circuit failures", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: NOW });
  const calls = batchFetch(t);
  const opts = options();
  const state = createActiveEvidenceExecutionState(opts);
  state.providers.set("dexscreener:base", { provider: "dexscreener", attempts: 0, successes: 0,
    failures: 0, skipped: 0, cooldownUntil: NOW + 60000 });
  const project = candidate(1);
  const bindings = prepareDexRecoveryBatches([{ project, projectIndex: 0, entries }], opts);
  const result = await executeActiveEvidenceProviderRequests(project, entries, { ...opts, dexRecoveryBatch: bindings.get(0) }, state);
  assert.equal(result.attempts[0].status, "PROVIDER_COOLDOWN");
  assert.equal(result.attempts[0].requestCost, 0);
  assert.equal(state.requestsUsed, 0);
  assert.equal(state.providers.get("dexscreener:base").failures, 0);
  assert.equal(calls.length, 0);
});

test("one batch rate-limit response installs the existing chain cooldown without 30 failures or retries", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: NOW });
  t.mock.method(globalThis, "fetch", () => { throw new Error("No live calls"); });
  let calls = 0;
  const opts = options({ concurrency: 1, providers: { getTokenPairsBatch: async () => {
    calls++;
    return { providerFailure: true, rateLimited: true, retryAfterMs: 60000 };
  } } });
  const state = createActiveEvidenceRecoveryState(opts);
  const results = await analyzeActiveEvidenceRecoveryBatch(Array.from({ length: 61 }, (_, index) => candidate(index + 1)),
    { ...opts, executionState: state });
  assert.equal(calls, 1);
  assert.equal(state.requestsUsed, 1);
  assert.equal(state.providers.get("dexscreener:base").failures, 0);
  assert.equal(state.providers.get("dexscreener:base").rateLimitResponses, 1);
  assert.equal(state.providers.get("dexscreener:base").cooldownUntil, NOW + 60000);
  assert.equal(results.length, 61);
  assert.ok(results.every(project => project.priceUsd === undefined));
});

test("hung transport is aborted once; an uncooperative delayed body cannot hydrate any batch target", async t => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: NOW });
  let release, dispatched;
  const body = new Promise(resolve => { release = resolve; });
  const started = new Promise(resolve => { dispatched = resolve; });
  const calls = batchFetch(t, () => { dispatched(); return body; });
  const opts = options({ providerTimeoutMs: 250 });
  const state = createActiveEvidenceExecutionState(opts);
  const projects = [candidate(1), candidate(2)];
  const bindings = prepareDexRecoveryBatches(projects.map((project, projectIndex) => ({ project, projectIndex, entries })), opts);
  const pending = executeActiveEvidenceProviderRequests(projects[0], entries, { ...opts, dexRecoveryBatch: bindings.get(0) }, state);
  await started;
  t.mock.timers.tick(250);
  const first = await pending;
  assert.deepEqual(first.observations, []);
  assert.equal(first.attempts[0].status, "FAILED");
  assert.equal(calls[0].signal.aborted, true);
  release(projects.map(project => pair(project.tokenAddress)));
  const second = await executeActiveEvidenceProviderRequests(projects[1], entries,
    { ...opts, dexRecoveryBatch: bindings.get(1) }, state);
  assert.deepEqual(second.observations, []);
  assert.equal(second.attempts[0].status, "FAILED");
  assert.equal(state.providers.get("dexscreener:base").failures, 1);
  assert.equal(calls.length, 1);
  assert.equal(state.requestsUsed, 1);
});
