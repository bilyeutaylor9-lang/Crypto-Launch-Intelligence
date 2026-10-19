import test from "node:test";
import assert from "node:assert/strict";
import { analyzeActiveEvidenceRecoveryBatch, buildActiveEvidenceRecoveryWaves,
  createActiveEvidenceRecoveryState } from "../src/engines/activeEvidenceRecoveryEngine.js";

const NOW = Date.parse("2026-10-18T05:00:00Z");
const HOLDER = "0xdddddddddddddddddddddddddddddddddddddddd";
function candidate(index = 1, patch = {}) {
  const tokenAddress = `0x${index.toString(16).padStart(40, "0")}`;
  return { symbol: `CH${index}`, chain: "base", tokenAddress, contractAddress: tokenAddress,
    poolAddress: `0x${(index + 1000).toString(16).padStart(40, "0")}`,
    deepEvaluationState: "DEEP_EVALUATED", coreDataStarved: true,
    executionProof: { routeType: "DEX", safetyVerified: true, buyQuoteVerified: false, sellQuoteVerified: false },
    targetedEnrichmentPlan: { items: [{ canonicalField: "wallets", recoverable: true,
      evidenceClass: "CORE", blockingResearch: true, targetSources: [{ source: "GoPlus" }] }] }, ...patch };
}
function proof(project, patch = {}) {
  return { provider: "goplus", status: "EVIDENCE_AVAILABLE", chain: project.chain, address: project.tokenAddress,
    responseIdentityVerified: true, observedAt: new Date(NOW).toISOString(), confidence: 85,
    raw: { holders: [{ address: HOLDER, balance: "1" }] }, ...patch };
}
function options(collect, patch = {}) {
  return { now: () => NOW, wave1Max: 500, wave2Max: 0, wave3Max: 0,
    maxProviderRequests: 500, useCache: false, walletHistory: false,
    providers: { getGoPlusWalletEvidence: collect,
      getBlockscoutWalletEvidence: async () => assert.fail("Cheap Wave1 cannot invoke the explorer fallback"),
      getRpcWalletEvidence: async () => assert.fail("Cheap Wave1 cannot invoke wallet RPC") }, ...patch };
}

test("core holder gaps get a cheap Wave1 metadata attempt without expanding deeper Wave2 selection", () => {
  const projects = Array.from({ length: 500 }, (_, index) => candidate(index + 1));
  const waves = buildActiveEvidenceRecoveryWaves(projects, { wave3Max: 0 }).waves;
  assert.equal(waves.WAVE1.length, 500);
  assert.equal(waves.WAVE2.length, 150);
  for (const entry of waves.WAVE1.flatMap(row => row.entries)) {
    assert.equal(entry.field, "holderAddresses");
    assert.equal(entry.item.cheapHolderMetadataOnly, true);
    assert.equal(entry.item.recoveryDisposition, "RAW_RECOVERABLE");
    assert.deepEqual(entry.item.targetSources.map(row => row.source), ["GoPlus"]);
  }
});

test("500 core gaps can recover exact holder samples under 500 requests without buyer or smart-wallet fabrication", async (t) => {
  t.mock.method(globalThis, "fetch", async () => assert.fail("No live HTTP allowed"));
  let calls = 0;
  const projects = Array.from({ length: 500 }, (_, index) => candidate(index + 1));
  const results = await analyzeActiveEvidenceRecoveryBatch(projects, options(async project => { calls++; return proof(project); }));
  assert.equal(calls, 500);
  assert.equal(results[0].activeEvidenceRecovery.batchSummary.providerRequestsUsed, 500);
  assert.equal(results[0].activeEvidenceRecovery.batchSummary.selectedWaveCounts.WAVE2, 0);
  for (const result of results) {
    assert.deepEqual(result.holderAddresses, [HOLDER]);
    const source = result.fieldProvenance.holderAddresses;
    assert.equal(source.source, "goplus");
    assert.equal(source.sourceTimestamp, new Date(NOW).toISOString());
    assert.equal(source.recoveryRun, true);
    assert.equal(source.holderSampleOnly, true);
    assert.equal(source.completeHolderCoverage, false);
    assert.equal(source.buyerClassificationAvailable, false);
    assert.ok(result.activeEvidenceRecovery.changedEvidenceFamilies.includes("WALLETS"));
    for (const field of ["uniqueBuyers24h", "smartWallets", "smartWalletScore", "smartMoneyAccumulationScore"]) {
      assert.equal(result[field], undefined);
    }
    assert.notEqual(result.finalSelectionQualified, true);
  }
});

test("unknown, foreign, stale, future and low-confidence cheap holder data stops without unbudgeted fallbacks", async (t) => {
  t.mock.method(globalThis, "fetch", async () => assert.fail("No live HTTP allowed"));
  for (const patch of [{ status: "UNKNOWN" }, { chain: "ethereum" }, { address: HOLDER },
    { responseIdentityVerified: false }, { confidence: 0.1 },
    { observedAt: new Date(NOW - 7 * 3600_000).toISOString() }, { observedAt: new Date(NOW + 1000).toISOString() },
    { raw: { holders: [{ address: HOLDER, balance: "UNKNOWN" }] } }]) {
    let calls = 0;
    const [result] = await analyzeActiveEvidenceRecoveryBatch([candidate()], options(async project => {
      calls++; return proof(project, patch);
    }));
    assert.equal(calls, 1);
    assert.equal(result.holderAddresses, undefined);
    assert.equal(result.wallets, undefined);
    assert.notEqual(result.finalSelectionQualified, true);
  }
});

test("cheap holder metadata excludes advisory-only, deferred, CEX, unsupported and conflicting identities", () => {
  const advisory = { items: [{ canonicalField: "wallets", recoverable: true, evidenceClass: "ADVISORY",
    targetSources: [{ source: "GoPlus" }] }] };
  for (const patch of [{ deepEvaluationState: "DEFERRED_BEFORE_DEEP" },
    { targetedEnrichmentPlan: advisory }, { chain: "zksync" }, { chainId: "ethereum" },
    { canonicalChainId: "ethereum" }, { baseTokenAddress: HOLDER }, { contractAddress: HOLDER },
    { canonicalExecutionRoute: { routeType: "CEX" } }, { routeType: "CEX" },
    { tokenAddress: "bad", contractAddress: "bad" }, { honeypotDetected: true }]) {
    assert.equal(buildActiveEvidenceRecoveryWaves([candidate(1, patch)]).waves.WAVE1.length, 0, JSON.stringify(patch));
  }
  advisory.items[0].blockingExecution = true;
  assert.equal(buildActiveEvidenceRecoveryWaves([candidate(1, { targetedEnrichmentPlan: advisory })]).waves.WAVE1.length, 0);
});

test("cheap metadata obeys the same request budget, deadline and provider circuit", async (t) => {
  t.mock.method(globalThis, "fetch", async () => assert.fail("No live HTTP allowed"));
  for (const limits of [{ maxProviderRequests: 0 }, { timeBudgetMs: 0 }]) {
    let calls = 0;
    const [result] = await analyzeActiveEvidenceRecoveryBatch([candidate()], options(async () => { calls++; }, limits));
    assert.equal(calls, 0);
    assert.equal(result.activeEvidenceRecovery.providerExecution.requestsUsed, 0);
  }
  let calls = 0;
  const opts = options(async () => { calls++; throw new Error("Injected provider outage"); }, { concurrency: 1, circuitFailureThreshold: 1 });
  const state = createActiveEvidenceRecoveryState(opts);
  const deadline = state.deadlineAt;
  const results = await analyzeActiveEvidenceRecoveryBatch([candidate(1), candidate(2)], { ...opts, executionState: state });
  assert.equal(calls, 1);
  assert.equal(state.requestsUsed, 1);
  assert.equal(state.deadlineAt, deadline);
  assert.ok(results[1].activeEvidenceRecovery.providerAttempts.some(row => row.status === "CIRCUIT_OPEN"));
});

test("only selected Wave2 candidates can use deeper fallback after cheap metadata is unavailable", async (t) => {
  t.mock.method(globalThis, "fetch", async () => assert.fail("No live HTTP allowed"));
  let cheap = 0;
  const explorer = [];
  const projects = [candidate(1, { valueOfInformationScore: 10 }), candidate(2, { valueOfInformationScore: 90 }),
    candidate(3, { valueOfInformationScore: 30 })];
  const opts = options(async () => { cheap++; return { status: "UNKNOWN" }; }, { wave2Max: 1, maxProviderRequests: 10 });
  opts.providers.getBlockscoutWalletEvidence = async project => {
    explorer.push(project.tokenAddress);
    return { status: "EVIDENCE_AVAILABLE", exactTokenIdentity: true, chain: project.chain,
      tokenAddress: project.tokenAddress, sourceTimestamp: new Date(NOW).toISOString(), confidence: 0.9, wallets: [HOLDER] };
  };
  const results = await analyzeActiveEvidenceRecoveryBatch(projects, opts);
  assert.equal(cheap, 4);
  assert.deepEqual(explorer, [projects[1].tokenAddress]);
  assert.equal(results[0].holderAddresses, undefined);
  assert.deepEqual(results[1].wallets, [HOLDER]);
  assert.equal(results[0].activeEvidenceRecovery.batchSummary.selectedWaveCounts.WAVE2, 1);
});

test("a holder-only plan retains its distinct deeper Wave2 fallback", () => {
  const project = candidate();
  project.targetedEnrichmentPlan.items[0].canonicalField = "holderAddresses";
  const waves = buildActiveEvidenceRecoveryWaves([project]).waves;
  assert.equal(waves.WAVE1.length, 1);
  assert.equal(waves.WAVE1[0].entries[0].item.cheapHolderMetadataOnly, true);
  assert.equal(waves.WAVE2.length, 1);
  assert.notEqual(waves.WAVE2[0].entries[0].item.cheapHolderMetadataOnly, true);
});

test("all cheap metadata is hydrated before creator fallback work and its patches reach later consumers", async (t) => {
  t.mock.method(globalThis, "fetch", async () => assert.fail("No live HTTP allowed"));
  const order = [];
  const projects = [candidate(1), candidate(2), candidate(3)];
  for (const project of projects) project.targetedEnrichmentPlan.items.push({ canonicalField: "creator",
    recoverable: true, evidenceClass: "CORE", targetSources: [{ source: "block explorers" }] });
  const opts = options(async project => { order.push(`holder:${project.tokenAddress}`); return proof(project); });
  opts.providers.getBlockscoutDeployerEvidence = async project => {
    order.push(`creator:${project.tokenAddress}`);
    assert.ok(project.securityEvidence.some(item => item.provider === "goplus"));
    return { chain: project.chain, address: project.tokenAddress, creatorAddress: HOLDER,
      status: "EVIDENCE_AVAILABLE", observedAt: new Date(NOW).toISOString(), confidence: 0.9 };
  };
  const results = await analyzeActiveEvidenceRecoveryBatch(projects, opts);
  assert.ok(order.slice(0, 3).every(item => item.startsWith("holder:")));
  assert.ok(order.slice(3).every(item => item.startsWith("creator:")));
  assert.equal(order.length, 6);
  assert.ok(results.every(project => project.creator === HOLDER));
  assert.ok(results.every(project => project.holderAddresses.includes(HOLDER)));
});

test("exact adverse and creator metadata survives even if GoPlus has no holder sample", async (t) => {
  t.mock.method(globalThis, "fetch", async () => assert.fail("No live HTTP allowed"));
  const [result] = await analyzeActiveEvidenceRecoveryBatch([candidate()], options(async project => proof(project, {
    creatorAddress: HOLDER, honeypot: true, raw: { holders: [], is_honeypot: "1", creator_address: HOLDER },
  })));
  assert.equal(result.holderAddresses, undefined);
  assert.equal(result.honeypotDetected, true);
  assert.equal(result.fieldProvenance.honeypotDetected.source, "goplus");
  assert.equal(result.securityEvidence[0].creatorAddress, HOLDER);
  assert.notEqual(result.finalSelectionQualified, true);
});

test("old root wallet arrays cannot satisfy a still-missing core metadata plan", async (t) => {
  t.mock.method(globalThis, "fetch", async () => assert.fail("No live HTTP allowed"));
  const oldWallet = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
  let calls = 0;
  const [result] = await analyzeActiveEvidenceRecoveryBatch([candidate(1, { wallets: [oldWallet],
    fieldProvenance: { wallets: { source: "goplus", sourceTimestamp: new Date(NOW - 7 * 3600000).toISOString() } },
  })], options(async project => { calls++; return proof(project); }));
  assert.equal(calls, 1);
  assert.deepEqual(result.wallets, [HOLDER]);
  assert.deepEqual(result.holderAddresses, [HOLDER]);
  assert.equal(result.fieldProvenance.wallets.sourceTimestamp, new Date(NOW).toISOString());
});
