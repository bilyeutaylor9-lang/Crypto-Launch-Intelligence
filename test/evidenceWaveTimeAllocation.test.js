import test from "node:test";
import assert from "node:assert/strict";
import { createEvidenceHydrationSchedule } from "../src/data/evidenceHydrationSchedule.js";
import { analyzeActiveEvidenceRecoveryBatch, createActiveEvidenceRecoveryState } from "../src/engines/activeEvidenceRecoveryEngine.js";

const NOW = 1800000000000;
const state = () => ({ now: () => NOW, deadlineAt: NOW + 23 * 60000, requestsUsed: 12, maxRequests: 2000 });
const work = { wave1: true, wave2: true, cheapMetadata: true, otherWave1: true };

test("raw cohorts reserve independent fallback and selected Wave2 time within the existing window", () => {
  const s = state();
  assert.deepEqual(createEvidenceHydrationSchedule(s, { phaseDeadlineAt: NOW + 20 * 60000 }, work), {
    rawDeadlineAt: NOW + 1200000, wave1DeadlineAt: NOW + 960000,
    cheapMetadataDeadlineAt: NOW + 480000, wave2ReserveMs: 240000,
  });
  assert.equal(s.deadlineAt, NOW + 1380000);
  assert.equal(s.requestsUsed, 12);
  assert.equal(s.maxRequests, 2000);
});

test("short windows remain bounded and explicit caller deadlines cannot be widened", () => {
  const schedule = createEvidenceHydrationSchedule(state(), { phaseDeadlineAt: NOW + 900 }, work);
  assert.equal(schedule.wave2ReserveMs, 300);
  assert.equal(schedule.wave1DeadlineAt, NOW + 600);
  assert.equal(schedule.cheapMetadataDeadlineAt, NOW + 300);
  const expired = createEvidenceHydrationSchedule(state(), { phaseDeadlineAt: NOW - 1 }, work);
  assert.equal(expired.wave1DeadlineAt, NOW - 1);
  assert.equal(expired.cheapMetadataDeadlineAt, NOW - 1);
});

test("unused cohorts do not reserve time and limits can only reduce an existing allowance", () => {
  const s = state();
  assert.equal(createEvidenceHydrationSchedule(s, {}, { wave1: true }).wave1DeadlineAt, s.deadlineAt);
  const noFallback = createEvidenceHydrationSchedule(s, {}, { ...work, otherWave1: false });
  assert.equal(noFallback.cheapMetadataDeadlineAt, noFallback.wave1DeadlineAt);
  const explicit = createEvidenceHydrationSchedule(s, { wave2ReserveMs: 500, cheapMetadataTimeBudgetMs: 200 }, work);
  assert.equal(explicit.wave2ReserveMs, 500);
  assert.equal(explicit.cheapMetadataDeadlineAt, NOW + 200);
  const disabled = createEvidenceHydrationSchedule(s, { wave2ReserveMs: 0 }, work);
  assert.equal(disabled.wave1DeadlineAt, s.deadlineAt);
});

test("invalid reserve configuration falls back to bounded defaults", () => {
  assert.deepEqual(createEvidenceHydrationSchedule(state(), { wave2ReserveMs: NaN, cheapMetadataTimeBudgetMs: -1 }, work),
    createEvidenceHydrationSchedule(state(), {}, work));
});

test("a slow cheap-holder cohort cannot consume creator fallback and selected Wave2 time", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: NOW });
  t.mock.method(globalThis, "fetch", async () => assert.fail("No live requests"));
  const token = "0x1111111111111111111111111111111111111111";
  const holder = "0xdddddddddddddddddddddddddddddddddddddddd";
  const calls = [];
  const project = { chain: "base", tokenAddress: token, deepEvaluationState: "DEEP_EVALUATED",
    targetedEnrichmentPlan: { items: ["wallets", "creator", "walletTransactions"].map(canonicalField => ({
      canonicalField, recoverable: true, evidenceClass: "CORE", blockingResearch: true,
      targetSources: [{ source: canonicalField === "creator" ? "block explorers" : "GoPlus" }],
    })) } };
  const opts = { now: () => Date.now(), useCache: false, walletHistory: false,
    wave1Max: 1, wave2Max: 1, wave3Max: 0, concurrency: 1, maxProviderRequests: 10,
    timeBudgetMs: 9000, phaseDeadlineAt: NOW + 9000, wave2ReserveMs: 3000,
    providers: {
      getGoPlusWalletEvidence: async () => {
        calls.push("cheap");
        if (calls.length === 1) t.mock.timers.tick(3500);
        return { status: "UNKNOWN" };
      },
      getBlockscoutDeployerEvidence: async () => {
        calls.push("creator");
        return { chain: "base", address: token, creatorAddress: holder, status: "EVIDENCE_AVAILABLE",
          observedAt: new Date().toISOString(), confidence: 0.9 };
      },
      getBlockscoutWalletEvidence: async () => {
        calls.push("deep-wallet");
        return { chain: "base", tokenAddress: token, exactTokenIdentity: true,
          status: "EVIDENCE_AVAILABLE", wallets: [holder], walletTransactions: [{ hash: "exact-observed-transfer" }],
          observedAt: new Date().toISOString() };
      },
      getRpcWalletEvidence: async () => assert.fail("No RPC necessary"),
    } };
  const executionState = createActiveEvidenceRecoveryState(opts);
  const [result] = await analyzeActiveEvidenceRecoveryBatch([project], { ...opts, executionState });
  assert.ok(calls.includes("creator"));
  assert.ok(calls.includes("deep-wallet"));
  assert.equal(result.creator, holder);
  assert.equal(result.walletTransactions.length, 1);
  assert.equal(executionState.phaseTimeBudgetExceeded, true);
  assert.equal(executionState.timeBudgetExceeded, false);
  assert.equal(executionState.deadlineAt, NOW + 9000);
  assert.ok(executionState.requestsUsed <= 10);
  assert.equal(result.activeEvidenceRecovery.batchSummary.selectedWaveCounts.WAVE2, 1);
});

test("the default creator cohort uses independent metadata before GoPlus network admission", async t => {
  const token = "0x1111111111111111111111111111111111111111";
  const creator = "0xdddddddddddddddddddddddddddddddddddddddd";
  const calls = [];
  t.mock.method(globalThis, "fetch", async url => {
    calls.push(String(url));
    assert.ok(String(url).startsWith(`https://sourcify.dev/server/v2/contract/8453/${token}?fields=deployment`));
    return { ok: true, json: async () => ({ match: "exact_match", deployment: { deployer: creator } }) };
  });
  const [result] = await analyzeActiveEvidenceRecoveryBatch([{
    chain: "base", tokenAddress: token, deepEvaluationState: "DEEP_EVALUATED",
    targetedEnrichmentPlan: { items: [{ canonicalField: "creator", recoverable: true, evidenceClass: "CORE",
      targetSources: [{ source: "security providers" }, { source: "block explorers" }] }] },
  }], { useCache: false, nativeDeploymentHistory: false, walletHistory: false,
    wave1Max: 1, wave2Max: 0, wave3Max: 0, maxProviderRequests: 4,
    goPlusRateLimiter: async () => assert.fail("Recovered creator metadata does not need GoPlus admission") });
  assert.equal(calls.length, 1);
  assert.equal(result.creator, creator);
  assert.equal(result.activeEvidenceRecovery.batchSummary.providerRequestsUsed, 1);
  assert.equal(result.fieldProvenance.creator.source, "sourcify-v2");
  assert.notEqual(result.finalSelectionQualified, true);
});

test("unavailable independent creator metadata can skip GoPlus cooldown without inventing a creator", async t => {
  const token = "0x1111111111111111111111111111111111111111";
  let http = 0, limiterCalls = 0;
  t.mock.method(globalThis, "fetch", async url => {
    http++;
    assert.ok(/sourcify\.dev|base\.blockscout\.com/.test(String(url)));
    return { ok: false, status: 404 };
  });
  const [result] = await analyzeActiveEvidenceRecoveryBatch([{
    chain: "base", tokenAddress: token, deepEvaluationState: "DEEP_EVALUATED",
    targetedEnrichmentPlan: { items: [{ canonicalField: "creator", recoverable: true, evidenceClass: "CORE",
      targetSources: [{ source: "security providers" }, { source: "block explorers" }] }] },
  }], { env: {}, useCache: false, nativeDeploymentHistory: false, walletHistory: false,
    wave1Max: 1, wave2Max: 0, wave3Max: 0, maxProviderRequests: 4,
    goPlusRateLimiter: async options => {
      limiterCalls++;
      assert.equal(options.waitForCooldown, false);
      return false;
    } });
  assert.equal(limiterCalls, 1);
  assert.equal(http, 3);
  assert.equal(result.creator, undefined);
  assert.equal(result.activeEvidenceRecovery.batchSummary.providerRequestsUsed, 3);
  assert.ok(result.activeEvidenceRecovery.providerAttempts.some(row => row.status === "PROVIDER_COOLDOWN"));
  assert.notEqual(result.finalSelectionQualified, true);
});
