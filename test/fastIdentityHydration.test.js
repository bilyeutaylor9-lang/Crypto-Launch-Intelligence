import test from "node:test";
import assert from "node:assert/strict";
import { analyzeActiveEvidenceRecoveryBatch, createActiveEvidenceRecoveryState }
  from "../src/engines/activeEvidenceRecoveryEngine.js";

const NOW = Date.parse("2026-10-21T23:00:00Z");
const address = number => `0x${number.toString(16).padStart(40, "0")}`;
const HOLDER = address(999);
const item = (canonicalField, source) => ({ canonicalField, recoverable: true,
  requiresFreshObservation: true, evidenceClass: "CORE", blockingResearch: true,
  targetSources: [{ source }] });
const candidate = (number, items, patch = {}) => ({ chain: "base", tokenAddress: address(number),
  contractAddress: address(number), poolAddress: address(number + 1000),
  deepEvaluationState: "DEEP_EVALUATED", valueOfInformationScore: 100 - number,
  targetedEnrichmentPlan: { items }, ...patch });

async function runFixture(t, patch = {}) {
  t.mock.timers.enable({ apis: ["Date"], now: NOW });
  let externalCalls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    externalCalls++;
    throw new Error("Live network forbidden");
  });
  const events = [];
  const providers = {
    getTokenPairs: async (_chain, token) => {
      events.push(`identity:${token}`);
      if (patch.identityFailure) throw new Error("Injected exact market provider outage");
      return patch.noIdentity ? [] : [{ chainId: "base", pairAddress: address(Number(BigInt(token)) + 1000),
        baseToken: { address: token }, quoteToken: { address: HOLDER },
        priceUsd: "1.1", liquidity: { usd: 200000 }, volume: { h24: 100000 } }];
    },
    getGoPlusWalletEvidence: async () => {
      events.push("holder");
      t.mock.timers.tick(3500);
      return { status: "UNKNOWN" };
    },
    getBlockscoutDeployerEvidence: async project => {
      events.push("creator");
      return { chain: "base", address: project.tokenAddress, creatorAddress: HOLDER,
        status: "EVIDENCE_AVAILABLE", observedAt: new Date().toISOString(), confidence: 0.9 };
    },
    getBlockscoutWalletEvidence: async project => {
      events.push("deep-wallet");
      return { chain: "base", tokenAddress: project.tokenAddress, exactTokenIdentity: true,
        status: "EVIDENCE_AVAILABLE", wallets: [HOLDER],
        walletTransactions: [{ hash: "observed-transfer-not-a-buy" }], observedAt: new Date().toISOString() };
    },
    getRpcWalletEvidence: async () => { throw new Error("No wallet RPC needed"); },
  };
  const opts = { now: () => Date.now(), useCache: false, walletHistory: false,
    wave1Max: 5, wave2Max: 1, wave3Max: 0, concurrency: 1, maxProviderRequests: 20,
    timeBudgetMs: 9000, phaseDeadlineAt: NOW + 9000, wave2ReserveMs: 3000,
    providers, ...patch };
  const projects = [candidate(1, [item("wallets", "GoPlus"), item("creator", "block explorers"),
    item("walletTransactions", "GoPlus")]),
  candidate(2, [item("poolAddress", "DexScreener"), item("priceUsd", "DexScreener")], { poolAddress: null }),
  candidate(3, [item("priceUsd", "DexScreener")]),
  candidate(4, [item("poolAddress", "DexScreener")], { deepEvaluationState: "DEFERRED_BEFORE_DEEP" })];
  if (patch.mixedIdentity) {
    projects[0].poolAddress = null;
    projects[0].targetedEnrichmentPlan.items.push(item("poolAddress", "DexScreener"));
  }
  const state = createActiveEvidenceRecoveryState(opts);
  const results = await analyzeActiveEvidenceRecoveryBatch(projects, { ...opts, executionState: state });
  assert.equal(externalCalls, 0);
  assert.equal(state.deadlineAt, NOW + opts.timeBudgetMs);
  assert.ok(state.requestsUsed <= opts.maxProviderRequests);
  assert.notEqual(results.some(project => project.finalSelectionQualified === true), true);
  return { events, results, state };
}

test("fast identity and market work dispatch before rate-limited holders spend the cheap window", async t => {
  const { events, results, state } = await runFixture(t);
  assert.deepEqual(events.slice(0, 2), [`identity:${address(2)}`, `identity:${address(3)}`]);
  assert.equal(events.filter(event => event === `identity:${address(2)}`).length, 1);
  assert.equal(events.filter(event => event === `identity:${address(3)}`).length, 1);
  assert.ok(events.indexOf("holder") < events.indexOf("creator"));
  assert.ok(events.includes("deep-wallet"));
  assert.equal(results[1].poolAddress, address(1002));
  assert.equal(results[1].priceUsd, 1.1);
  assert.equal(results[1].fieldProvenance.poolAddress.source, "dexscreener");
  assert.equal(results[1].fieldProvenance.poolAddress.sourceTimestamp, new Date(NOW).toISOString());
  assert.ok(results[1].activeEvidenceRecovery.changedEvidenceFamilies.includes("IDENTITY"));
  assert.equal(results[0].creator, HOLDER);
  assert.equal(results[0].walletTransactions.length, 1);
  assert.equal(results[0].uniqueBuyers24h, undefined);
  assert.equal(state.timeBudgetExceeded, false);
  assert.equal(results[0].activeEvidenceRecovery.batchSummary.deepEvaluatedCandidates, 3);
});

test("multiple workers do not duplicate fast requests or include deferred identities", async t => {
  const { events, results } = await runFixture(t, { concurrency: 3 });
  assert.deepEqual(events.slice(0, 2), [`identity:${address(2)}`, `identity:${address(3)}`]);
  assert.equal(events.filter(event => event.startsWith("identity:")).length, 2);
  assert.equal(events.includes(`identity:${address(4)}`), false);
  assert.equal(results[3].activeEvidenceRecovery.status, "DEFERRED_BEFORE_DEEP");
});

test("a shared request ceiling still admits no calls with a zero allowance", async t => {
  const { events, state } = await runFixture(t, { maxProviderRequests: 0 });
  assert.deepEqual(events, []);
  assert.equal(state.requestsUsed, 0);
});

test("an expired absolute deadline cannot be replaced by a fresh identity phase", async t => {
  const { events, state } = await runFixture(t, { timeBudgetMs: 0 });
  assert.deepEqual(events, []);
  assert.equal(state.timeBudgetExceeded, true);
});

test("the caller's exhausted phase allowance applies to all separated cohorts", async t => {
  const { events, state } = await runFixture(t, { phaseRequestLimit: 0 });
  assert.deepEqual(events, []);
  assert.equal(state.requestsUsed, 0);
  assert.equal(state.phaseRequestBudgetExceeded, true);
});

test("unavailable fast identity is not retried by later holder or creator cohorts", async t => {
  const { events, results } = await runFixture(t, { noIdentity: true });
  assert.equal(events.filter(event => event === `identity:${address(2)}`).length, 1);
  assert.equal(results[1].poolAddress, null);
  assert.equal(results[1].priceUsd, undefined);
  assert.notEqual(results[1].finalSelectionQualified, true);
});

test("splitting a mixed candidate carries its recovered identity into later evidence consumers", async t => {
  const { events, results } = await runFixture(t, { mixedIdentity: true });
  assert.equal(events[0], `identity:${address(1)}`);
  assert.equal(events.filter(event => event === `identity:${address(1)}`).length, 1);
  assert.equal(results[0].poolAddress, address(1001));
  assert.equal(results[0].creator, HOLDER);
  assert.ok(results[0].activeEvidenceRecovery.changedEvidenceFamilies.includes("IDENTITY"));
  assert.ok(results[0].activeEvidenceRecovery.changedEvidenceFamilies.includes("DEPLOYER"));
  assert.equal(results[0].fieldProvenance.poolAddress.sourceTimestamp, new Date(NOW).toISOString());
});

test("fast cohorts cannot enroll candidates outside the selected Wave1 set", async t => {
  const { events, results } = await runFixture(t, { wave1Max: 1 });
  assert.equal(events.some(event => event.startsWith("identity:")), false);
  assert.equal(results[1].poolAddress, null);
  assert.equal(results[0].activeEvidenceRecovery.batchSummary.selectedWaveCounts.WAVE1, 1);
});

test("a tighter caller phase deadline remains exhausted for fast work", async t => {
  const { events, state } = await runFixture(t, { phaseDeadlineAt: NOW });
  assert.deepEqual(events, []);
  assert.equal(state.requestsUsed, 0);
  assert.equal(state.timeBudgetExceeded, false);
  assert.equal(state.phaseTimeBudgetExceeded, true);
});

test("an opened market circuit stays shared across fast identities and later cohorts", async t => {
  const { events, results, state } = await runFixture(t, { identityFailure: true, circuitFailureThreshold: 1 });
  assert.equal(events.filter(event => event.startsWith("identity:")).length, 1);
  assert.ok(results[2].activeEvidenceRecovery.providerAttempts.some(attempt => attempt.status === "CIRCUIT_OPEN"));
  assert.equal(state.providers.get("dexscreener:base").circuitOpen, true);
  assert.equal(results[1].poolAddress, null);
});
