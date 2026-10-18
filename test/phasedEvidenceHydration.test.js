import test from "node:test";
import assert from "node:assert/strict";
import {
  analyzeActiveEvidenceRecoveryBatch,
  createActiveEvidenceRecoveryState,
} from "../src/engines/activeEvidenceRecoveryEngine.js";
import {securityWalletEvidencePatch} from "../src/data/security/securityWalletEvidence.js";

const START = Date.parse("2026-10-18T12:00:00Z");
const TOKEN = `0x${"11".repeat(20)}`;
const POOL = `0x${"22".repeat(20)}`;
const OTHER_TOKEN = `0x${"33".repeat(20)}`;
const OTHER_POOL = `0x${"44".repeat(20)}`;
const USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";

function project(overrides = {}) {
  return { name: "Phased utility fixture", symbol: "PHASE", chain: "base", tokenAddress: TOKEN,
    contractAddress: TOKEN, poolAddress: POOL, deepEvaluationState: "DEEP_EVALUATED",
    executionProof: {routeType: "DEX", buyQuoteVerified: false, sellQuoteVerified: false, liveExecutionReady: false},
    targetedEnrichmentPlan: {items: [{canonicalField: "priceUsd", requiresFreshObservation: true,
      targetSources: [{source: "DexScreener"}], recoverable: true, evidenceClass: "CORE"}]}, ...overrides };
}

function quote(url) {
  const params = new URL(url).searchParams;
  const from = params.get("fromToken").toLowerCase();
  const to = params.get("toToken").toLowerCase();
  return {tool: "aerodrome", action: {fromChainId: 8453, toChainId: 8453,
    fromAmount: params.get("fromAmount"), fromToken: {chainId: 8453, address: from, decimals: from === USDC ? 6 : 18},
    toToken: {chainId: 8453, address: to, decimals: to === USDC ? 6 : 18}},
  estimate: {tool: "aerodrome", toAmount: to === USDC ? "24750000" : "5000000000000000000",
    data: {protocols: [{poolAddress: (to === USDC ? from : to) === OTHER_TOKEN ? OTHER_POOL : POOL}]}}};
}

function options(clock, events, overrides = {}) {
  return {now: clock, maxProviderRequests: 3, concurrency: 1, useCache: false, walletHistory: false,
    wave1Max: 1, wave2Max: 0, wave3Max: 0, providerTimeoutMs: 500,
    providers: {fetch: async () => assert.fail("External HTTP is forbidden"), getTokenPairs: async (_chain, token) => {
      events.push("MARKET");
      return [{chainId: "base", pairAddress: token === OTHER_TOKEN ? OTHER_POOL : POOL, baseToken: {address: token}, quoteToken: {address: USDC},
        priceUsd: "1.1", liquidity: {usd: 200000}, volume: {h24: 100000}}];
    }}, executionRecovery: {env: {}, lifiEnabled: true, jupiterApiKey: "", zeroxApiKey: "", tradeSizesUsd: [25],
      lifiRateBudget: {windowStartedAtMs: START, requests: 0}, fetchJson: async url => {
        events.push("QUOTE"); return quote(url);
      }}, ...overrides };
}

test("raw and live phases share one allowance while preserving old history, timestamps and phase-local changes", async (t) => {
  let now = START;
  t.mock.method(Date, "now", () => now);
  const events = [];
  const opts = options(() => now, events);
  const state = createActiveEvidenceRecoveryState(opts);
  const originalDeadline = state.deadlineAt;
  const first = await analyzeActiveEvidenceRecoveryBatch([project()], {...opts, executionState: state});
  assert.deepEqual(events, ["MARKET"]);
  assert.equal(state.requestsUsed, 1);
  assert.deepEqual(first[0].activeEvidenceRecovery.waves, ["WAVE1"]);
  assert.deepEqual(new Set(first[0].activeEvidenceRecovery.changedEvidenceFamiliesThisPhase), new Set(["MARKET", "IDENTITY"]));
  const marketTimestamp = first[0].fieldProvenance.priceUsd.sourceTimestamp;
  assert.ok(Number.isFinite(Date.parse(marketTimestamp)));
  const snapshot = structuredClone(first);
  now += 120_000;
  const [final] = await analyzeActiveEvidenceRecoveryBatch(first, {...opts, executionState: state, resumeRecovery: true,
    maxProviderRequests: 999, wave1Max: 0, wave2Max: 0, wave3Max: 1});
  assert.deepEqual(events, ["MARKET", "QUOTE", "QUOTE"]);
  assert.equal(state.requestsUsed, 3);
  assert.equal(state.maxRequests, 3);
  assert.equal(state.deadlineAt, originalDeadline);
  assert.equal(final.fieldProvenance.priceUsd.sourceTimestamp, marketTimestamp);
  assert.equal(final.fieldProvenance.quoteTimestamp.sourceTimestamp, new Date(now).toISOString());
  assert.deepEqual(final.activeEvidenceRecovery.waves, ["WAVE1", "WAVE3"]);
  assert.deepEqual(final.activeEvidenceRecovery.changedEvidenceFamiliesThisPhase, ["EXECUTION"]);
  assert.deepEqual(new Set(final.activeEvidenceRecovery.changedEvidenceFamilies), new Set(["MARKET", "IDENTITY", "EXECUTION"]));
  assert.deepEqual(final.activeEvidenceRecovery.batchSummary.selectedWaveCounts, {WAVE1: 1, WAVE2: 0, WAVE3: 1});
  assert.equal(final.activeEvidenceRecovery.batchSummary.recoveryCandidatesAttempted, 1);
  assert.equal(final.activeEvidenceRecovery.batchSummary.providerRequestsUsed, 3);
  assert.equal(final.activeEvidenceRecovery.batchSummary.recoveredFieldsByFamily.UNKNOWN, undefined);
  assert.deepEqual(first, snapshot);
});

test("late phase cannot reset an exhausted request allowance or promote a one-leg quote", async () => {
  const events = [];
  const opts = options(() => START, events, {maxProviderRequests: 2});
  const state = createActiveEvidenceRecoveryState(opts);
  const early = await analyzeActiveEvidenceRecoveryBatch([project()], {...opts, executionState: state});
  const [final] = await analyzeActiveEvidenceRecoveryBatch(early, {...opts, executionState: state, resumeRecovery: true,
    maxProviderRequests: 100, wave1Max: 0, wave2Max: 0, wave3Max: 1});
  assert.deepEqual(events, ["MARKET", "QUOTE"]);
  assert.equal(state.maxRequests, 2);
  assert.equal(state.requestsUsed, 2);
  assert.equal(final.executionProofRecoveryRoute, undefined);
  assert.ok(final.activeEvidenceRecovery.providerAttempts.some(a => a.status === "REQUEST_BUDGET_EXHAUSTED"));
  assert.deepEqual(final.activeEvidenceRecovery.changedEvidenceFamiliesThisPhase, []);
  assert.ok(final.activeEvidenceRecovery.recoveredFields.includes("priceUsd"));
});

test("absolute provider deadline remains expired across a delayed live phase", async () => {
  let now = START;
  const events = [];
  const opts = options(() => now, events, {timeBudgetMs: 1000});
  const state = createActiveEvidenceRecoveryState(opts);
  const early = await analyzeActiveEvidenceRecoveryBatch([project()], {...opts, executionState: state});
  now += 1001;
  const [final] = await analyzeActiveEvidenceRecoveryBatch(early, {...opts, executionState: state, resumeRecovery: true,
    timeBudgetMs: 1_000_000, wave1Max: 0, wave2Max: 0, wave3Max: 1});
  assert.equal(state.deadlineAt, START + 1000);
  assert.deepEqual(events, ["MARKET"]);
  assert.equal(final.executionProofRecoveryRoute, undefined);
  assert.equal(final.activeEvidenceRecovery.providerExecution.timeBudgetExceeded, true);
});

test("provider circuits stay open across live-phase continuations", async () => {
  const events = [];
  const opts = options(() => START, events, {maxProviderRequests: 10, circuitFailureThreshold: 1,
    wave1Max: 0, wave3Max: 1});
  opts.executionRecovery.fetchJson = async () => {events.push("FAILED_QUOTE"); throw new Error("Provider unavailable");};
  const state = createActiveEvidenceRecoveryState(opts);
  const early = await analyzeActiveEvidenceRecoveryBatch([project()], {...opts, executionState: state});
  const [final] = await analyzeActiveEvidenceRecoveryBatch(early, {...opts, executionState: state, resumeRecovery: true});
  assert.deepEqual(events, ["FAILED_QUOTE"]);
  assert.equal(state.requestsUsed, 1);
  assert.equal(state.providers.get("lifi:base").circuitOpen, true);
  assert.ok(final.activeEvidenceRecovery.providerAttempts.some(a => a.status === "CIRCUIT_OPEN"));
});

test("resumed phases follow project identity through reordering and never count deferred rows", async () => {
  const events = [];
  const opts = options(() => START, events, {wave1Max: 2, maxProviderRequests: 4});
  const state = createActiveEvidenceRecoveryState(opts);
  const early = await analyzeActiveEvidenceRecoveryBatch([project({name: "A", preliminaryOpportunityScore: 1}),
    project({name: "B", tokenAddress: OTHER_TOKEN, contractAddress: OTHER_TOKEN, poolAddress: OTHER_POOL,
      preliminaryOpportunityScore: 100}), project({deepEvaluationState: "DEFERRED_BEFORE_DEEP"})],
  {...opts, executionState: state});
  const final = await analyzeActiveEvidenceRecoveryBatch([early[1], early[2], early[0]],
    {...opts, executionState: state, resumeRecovery: true, wave1Max: 0, wave2Max: 0, wave3Max: 1});
  assert.equal(final[0].name, "B");
  assert.equal(final[0].executionProofRecoveryRoute.poolAddress, OTHER_POOL);
  assert.equal(final[2].name, "A");
  assert.equal(final[2].executionProofRecoveryRoute, undefined);
  assert.deepEqual(final[2].activeEvidenceRecovery.changedEvidenceFamiliesThisPhase, []);
  assert.equal(final[1].activeEvidenceRecovery.status, "DEFERRED_BEFORE_DEEP");
  assert.deepEqual(final[0].activeEvidenceRecovery.batchSummary.selectedWaveCounts, {WAVE1: 2, WAVE2: 0, WAVE3: 1});
  assert.equal(final[0].activeEvidenceRecovery.batchSummary.deepEvaluatedCandidates, 2);
  assert.equal(final[0].activeEvidenceRecovery.batchSummary.recoveryCandidatesAttempted, 2);
});

test("resume without a shared execution state cannot import historical acquisition accounting", async () => {
  const opts = options(() => START, []);
  const prior = await analyzeActiveEvidenceRecoveryBatch([project()], opts);
  const [freshCall] = await analyzeActiveEvidenceRecoveryBatch(prior,
    {...opts, resumeRecovery: true, maxProviderRequests: 0, wave1Max: 0, wave2Max: 0, wave3Max: 0});
  assert.equal(freshCall.activeEvidenceRecovery.batchSummary.providerRequestsUsed, 0);
  assert.equal(freshCall.activeEvidenceRecovery.batchSummary.recoveryCandidatesAttempted, 0);
  assert.deepEqual(freshCall.activeEvidenceRecovery.recoveredFields, []);
});

test("a new recovery state cannot import another scan's history by setting resume", async () => {
  const opts = options(() => START, []);
  const previousState = createActiveEvidenceRecoveryState(opts);
  const prior = await analyzeActiveEvidenceRecoveryBatch([project()], {...opts, executionState: previousState});
  const newOptions = {...opts, maxProviderRequests: 0, wave1Max: 0, wave2Max: 0, wave3Max: 0};
  const newState = createActiveEvidenceRecoveryState(newOptions);
  const [freshCall] = await analyzeActiveEvidenceRecoveryBatch(prior,
    {...newOptions, executionState: newState, resumeRecovery: true});
  assert.equal(freshCall.activeEvidenceRecovery.batchSummary.recoveryCandidatesAttempted, 0);
  assert.equal(freshCall.activeEvidenceRecovery.batchSummary.providerRequestsUsed, 0);
  assert.deepEqual(freshCall.activeEvidenceRecovery.recoveredFields, []);
});

const HOLDER = `0x${"55".repeat(20)}`;
const NEWER_HOLDER = `0x${"66".repeat(20)}`;

function cachedHolderEvidence(timestamp = START) {
  return {provider: "goplus", status: "EVIDENCE_AVAILABLE", responseIdentityVerified: true,
    chain: "base", address: TOKEN, observedAt: new Date(timestamp).toISOString(), confidence: 0.9,
    raw: {holders: [{address: HOLDER, balance: "1"}]}};
}

test("execution-only recovery does not replay known holder inputs as new wallet evidence", async (t) => {
  t.mock.method(Date, "now", () => START);
  const events = [];
  const evidence = cachedHolderEvidence();
  const base = project({securityEvidence: [evidence]});
  const input = {...base, ...securityWalletEvidencePatch(base, [evidence], {now: () => START})};
  const original = structuredClone(input);
  const opts = options(() => START, events, {maxProviderRequests: 2, wave1Max: 0, wave2Max: 0, wave3Max: 1});
  const [result] = await analyzeActiveEvidenceRecoveryBatch([input], opts);
  assert.deepEqual(events, ["QUOTE", "QUOTE"]);
  assert.deepEqual(result.activeEvidenceRecovery.changedEvidenceFamiliesThisPhase, ["EXECUTION"]);
  assert.deepEqual(result.wallets, input.wallets);
  assert.deepEqual(result.holderAddresses, input.holderAddresses);
  assert.deepEqual(result.canonicalAliasProvenance.wallets, input.canonicalAliasProvenance.wallets);
  assert.equal(result.fieldProvenance?.wallets, undefined);
  assert.equal(result.activeEvidenceRecovery.batchSummary.providerRequestsUsed, 2);
  assert.deepEqual(input, original);
});

test("execution-only companions cannot overwrite a newer wallet sample with older cached holders", async (t) => {
  t.mock.method(Date, "now", () => START);
  const input = project({securityEvidence: [cachedHolderEvidence(START - 60_000)],
    wallets: [NEWER_HOLDER], holderAddresses: [NEWER_HOLDER],
    fieldProvenance: {wallets: {source: "chain-rpc", sourceTimestamp: new Date(START).toISOString(),
      confidence: 0.99, verificationStatus: "VERIFIED_PROVIDER_OBSERVATION", value: [NEWER_HOLDER]}}});
  const original = structuredClone(input);
  const opts = options(() => START, [], {maxProviderRequests: 2, wave1Max: 0, wave2Max: 0, wave3Max: 1});
  const [result] = await analyzeActiveEvidenceRecoveryBatch([input], opts);
  assert.deepEqual(result.wallets, [NEWER_HOLDER]);
  assert.deepEqual(result.holderAddresses, [NEWER_HOLDER]);
  assert.deepEqual(result.fieldProvenance.wallets, input.fieldProvenance.wallets);
  assert.deepEqual(result.activeEvidenceRecovery.changedEvidenceFamiliesThisPhase, ["EXECUTION"]);
  assert.deepEqual(input, original);
});

test("execution-only recovery still promotes a valid missing holder companion without extra requests", async (t) => {
  t.mock.method(Date, "now", () => START);
  const opts = options(() => START, [], {maxProviderRequests: 2, wave1Max: 0, wave2Max: 0, wave3Max: 1});
  const [result] = await analyzeActiveEvidenceRecoveryBatch([project({securityEvidence: [cachedHolderEvidence()]})], opts);
  assert.deepEqual(result.wallets, [HOLDER]);
  assert.deepEqual(result.holderAddresses, [HOLDER]);
  assert.equal(result.fieldProvenance.wallets.sourceTimestamp, new Date(START).toISOString());
  assert.deepEqual(new Set(result.activeEvidenceRecovery.changedEvidenceFamiliesThisPhase), new Set(["WALLETS", "EXECUTION"]));
  assert.equal(result.activeEvidenceRecovery.batchSummary.providerRequestsUsed, 2);
});
