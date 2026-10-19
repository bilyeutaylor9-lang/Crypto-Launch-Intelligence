import test from "node:test";
import assert from "node:assert/strict";
import { analyzeActiveEvidenceRecoveryBatch, createActiveEvidenceRecoveryState, reserveExecutionRecoveryWindow } from "../src/engines/activeEvidenceRecoveryEngine.js";
import { createGoPlusRequestLimiter } from "../src/data/security/goplusRequestLimiter.js";
import { getGoPlusSecurityEvidence } from "../src/data/security/goplusSecurityConnector.js";

const NOW = Date.parse("2026-10-18T05:00:00Z");
const TOKEN = "0x1111111111111111111111111111111111111111";
const POOL = "0x2222222222222222222222222222222222222222";
const HOLDER = "0x3333333333333333333333333333333333333333";
const USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
const candidate = () => ({ chain: "base", tokenAddress: TOKEN, contractAddress: TOKEN, poolAddress: POOL,
  priceUsd: 1, liquidityUsd: 260000, deepEvaluationState: "DEEP_EVALUATED", coreDataStarved: true,
  executionProof: { routeType: "DEX", safetyVerified: true, buyQuoteVerified: false, sellQuoteVerified: false },
  targetedEnrichmentPlan: { items: [{ canonicalField: "wallets", recoverable: true, evidenceClass: "CORE",
    blockingResearch: true, targetSources: [{ source: "GoPlus" }] }] } });
const proof = () => ({ provider: "goplus", status: "EVIDENCE_AVAILABLE", chain: "base", address: TOKEN,
  responseIdentityVerified: true, observedAt: new Date().toISOString(), confidence: 85,
  raw: { holders: [{ address: HOLDER, balance: "1" }] } });
const options = collect => ({ now: () => Date.now(), timeBudgetMs: 10000, maxProviderRequests: 3,
  wave2Max: 0, wave3Max: 0, useCache: false, walletHistory: false,
  providers: { getGoPlusWalletEvidence: collect,
    getBlockscoutWalletEvidence: async () => assert.fail("No explorer fallback in cheap metadata"),
    getRpcWalletEvidence: async () => assert.fail("No RPC in cheap metadata") } });

test.beforeEach(t => {
  t.mock.timers.enable({ apis: ["Date"], now: NOW });
  t.mock.method(globalThis, "fetch", async () => assert.fail("Live HTTP is forbidden"));
});

test("normal pipeline reservation uses existing time only, honors disablement and cannot widen a caller window", () => {
  const state = createActiveEvidenceRecoveryState({ now: () => NOW, timeBudgetMs: 23 * 60000, maxRequests: 20 });
  const deadline = state.deadlineAt;
  assert.deepEqual(reserveExecutionRecoveryWindow(state, { wave3Max: 50, executionReserveMs: 180000 }),
    { phaseDeadlineAt: NOW + 20 * 60000 });
  assert.equal(state.executionTimeReserveMs, 180000);
  assert.equal(state.deadlineAt, deadline);
  assert.equal(state.maxRequests, 20);
  assert.deepEqual(reserveExecutionRecoveryWindow(state, { wave3Max: 0 }), {});
  assert.deepEqual(reserveExecutionRecoveryWindow(state, { executionReserveMs: 0 }), {});
  assert.deepEqual(reserveExecutionRecoveryWindow(state, { phaseDeadlineAt: NOW + 1000 }), { phaseDeadlineAt: NOW + 1000 });
  const short = createActiveEvidenceRecoveryState({ now: () => NOW, timeBudgetMs: 1000 });
  assert.deepEqual(reserveExecutionRecoveryWindow(short, { executionReserveMs: 180000 }), { phaseDeadlineAt: NOW + 750 });
  assert.equal(short.deadlineAt, NOW + 1000);
  const expired = createActiveEvidenceRecoveryState({ now: () => NOW, timeBudgetMs: 0 });
  assert.deepEqual(reserveExecutionRecoveryWindow(expired), {});
  assert.equal(expired.deadlineAt, NOW);
});

test("a raw phase can expire without resetting or exhausting the shared absolute deadline", async t => {
  const opts = options(async () => { t.mock.timers.tick(1001); return proof(); });
  const state = createActiveEvidenceRecoveryState(opts);
  const deadline = state.deadlineAt;
  const [early] = await analyzeActiveEvidenceRecoveryBatch([candidate()], { ...opts, executionState: state, phaseDeadlineAt: NOW + 1000 });
  assert.equal(early.holderAddresses, undefined, "Late raw observations cannot be promoted");
  assert.equal(state.requestsUsed, 1);
  assert.equal(state.phaseTimeBudgetExceeded, true);
  assert.equal(state.timeBudgetExceeded, false);
  assert.equal(state.deadlineAt, deadline);
  assert.ok(early.activeEvidenceRecovery.providerAttempts.some(row => row.status === "PHASE_TIME_BUDGET_EXHAUSTED"));
  let quotes = 0;
  const [late] = await analyzeActiveEvidenceRecoveryBatch([early], { ...opts, executionState: state,
    resumeRecovery: true, wave1Max: 0, wave3Max: 1, maxProviderRequests: 999,
    executionRecovery: { env: {}, lifiEnabled: true, jupiterApiKey: "", zeroxApiKey: "", lifiApiKey: "", tradeSizesUsd: [25],
      lifiRateBudget: { windowStartedAtMs: Date.now(), requests: 0 }, fetchJson: async url => {
        quotes++;
        const q = new URL(url).searchParams;
        const buy = q.get("fromToken").toLowerCase() === USDC;
        return { tool: "aerodrome", action: { fromChainId: 8453, toChainId: 8453, fromAmount: q.get("fromAmount"),
          fromToken: { chainId: 8453, address: q.get("fromToken"), decimals: buy ? 6 : 18 },
          toToken: { chainId: 8453, address: q.get("toToken"), decimals: buy ? 18 : 6 } },
          estimate: { tool: "aerodrome", toAmount: buy ? "1000000000000000000" : "24750000",
            data: { protocols: [{ poolAddress: POOL }] } } };
      } },
  });
  assert.equal(quotes, 2);
  assert.equal(state.requestsUsed, 3);
  assert.equal(state.maxRequests, 3);
  assert.equal(state.deadlineAt, deadline);
  assert.equal(state.timeBudgetExceeded, false);
  assert.equal(late.executionProofRecoveryRoute.buyQuoteVerified, true);
  assert.equal(late.executionProofRecoveryRoute.sellQuoteVerified, true);
  assert.notEqual(late.finalSelectionQualified, true);
});

test("expired phase admission spends no requests and cannot open a provider circuit", async () => {
  let calls = 0;
  const opts = options(async () => { calls++; return proof(); });
  const state = createActiveEvidenceRecoveryState(opts);
  const [result] = await analyzeActiveEvidenceRecoveryBatch([candidate()], { ...opts, executionState: state, phaseDeadlineAt: NOW });
  assert.equal(calls, 0);
  assert.equal(state.requestsUsed, 0);
  assert.equal(state.timeBudgetExceeded, false);
  assert.equal(state.phaseTimeBudgetExceeded, true);
  assert.ok(state.phaseTimeBudgetSkippedCalls > 0);
  assert.ok(result.activeEvidenceRecovery.providerExecution.providers.every(row => !row.circuitOpen && row.failures === 0));
});

test("a shared cooldown stops at the raw phase deadline and leaves remaining time available", async t => {
  let requests = 0;
  const limiter = createGoPlusRequestLimiter({ now: () => Date.now(), sleep: async ms => t.mock.timers.tick(ms) });
  limiter.defer(2000);
  t.mock.method(globalThis, "fetch", async url => {
    requests++;
    assert.ok(String(url).includes(`/token_security/8453?contract_addresses=${TOKEN}`));
    return { ok: true, json: async () => ({ result: { [TOKEN]: { holders: [{ address: HOLDER, balance: "1" }] } } }) };
  });
  const opts = { ...options(getGoPlusSecurityEvidence), goPlusRateLimiter: limiter };
  const state = createActiveEvidenceRecoveryState(opts);
  await analyzeActiveEvidenceRecoveryBatch([candidate()], { ...opts, executionState: state, phaseDeadlineAt: NOW + 1000 });
  assert.equal(Date.now(), NOW + 1000);
  assert.equal(requests, 0);
  assert.equal(state.requestsUsed, 0);
  assert.equal(state.timeBudgetExceeded, false);
  const [later] = await analyzeActiveEvidenceRecoveryBatch([candidate()], { ...opts, executionState: state });
  assert.equal(Date.now(), NOW + 2000);
  assert.equal(requests, 1);
  assert.deepEqual(later.holderAddresses, [HOLDER]);
  assert.equal(state.deadlineAt, NOW + 10000);
});

test("deadline-owned timers cannot reopen a phase even when the wall clock is frozen", async () => {
  let calls = 0;
  const opts = options(async () => { calls++; return calls === 1 ? new Promise(() => {}) : proof(); });
  const state = createActiveEvidenceRecoveryState(opts);
  const [early] = await analyzeActiveEvidenceRecoveryBatch([candidate()], { ...opts, executionState: state, phaseDeadlineAt: NOW + 10 });
  assert.equal(state.phaseTimeBudgetExceeded, true);
  assert.equal(state.timeBudgetExceeded, false);
  assert.equal(state.providers.get("goplus-wallets:base").circuitOpen, false);
  assert.equal(early.holderAddresses, undefined);
  await analyzeActiveEvidenceRecoveryBatch([candidate()], { ...opts, executionState: state, phaseDeadlineAt: NOW + 10 });
  assert.equal(calls, 1);
  const [later] = await analyzeActiveEvidenceRecoveryBatch([candidate()], { ...opts, executionState: state });
  assert.equal(calls, 2);
  assert.deepEqual(later.holderAddresses, [HOLDER]);
});

test("absolute deadline expiry remains terminal across later phases and caller allowances", async t => {
  let calls = 0;
  const opts = options(async () => { calls++; t.mock.timers.tick(10000); return proof(); });
  const state = createActiveEvidenceRecoveryState(opts);
  const [early] = await analyzeActiveEvidenceRecoveryBatch([candidate()], { ...opts, executionState: state, phaseDeadlineAt: NOW + 1000 });
  assert.equal(early.holderAddresses, undefined);
  assert.equal(state.timeBudgetExceeded, true);
  const [later] = await analyzeActiveEvidenceRecoveryBatch([candidate()], { ...opts, executionState: state, maxProviderRequests: 999 });
  assert.equal(calls, 1);
  assert.equal(state.requestsUsed, 1);
  assert.equal(state.maxRequests, 3);
  assert.equal(state.deadlineAt, NOW + 10000);
  assert.equal(later.holderAddresses, undefined);
});

test("a timer that owns the absolute deadline cannot be converted into a reusable phase", async () => {
  let calls = 0;
  const opts = { ...options(async () => { calls++; return new Promise(() => {}); }), timeBudgetMs: 10 };
  const state = createActiveEvidenceRecoveryState(opts);
  await analyzeActiveEvidenceRecoveryBatch([candidate()], { ...opts, executionState: state });
  assert.equal(state.timeBudgetExceeded, true);
  await analyzeActiveEvidenceRecoveryBatch([candidate()], { ...opts, executionState: state, phaseDeadlineAt: NOW + 100000 });
  assert.equal(calls, 1);
  assert.equal(state.deadlineAt, NOW + 10);
  assert.equal(state.requestsUsed, 1);
});
