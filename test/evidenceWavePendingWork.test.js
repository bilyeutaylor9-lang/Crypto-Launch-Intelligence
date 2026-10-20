import test from "node:test";
import assert from "node:assert/strict";
import { shouldRerunEngineForRecoveredProject } from "../src/intelligencePipeline.js";
import {
  analyzeActiveEvidenceRecoveryBatch,
  buildActiveEvidenceRecoveryWaves,
  createActiveEvidenceRecoveryState,
} from "../src/engines/activeEvidenceRecoveryEngine.js";
import { analyzeDataStarvationRootCause } from "../src/engines/dataStarvationRootCauseEngine.js";
import { analyzeValueOfInformation } from "../src/engines/valueOfInformationEngine.js";
import { evaluateEngineDataReadiness } from "../src/engines/engineDataReadinessEngine.js";
import { getEngineContracts } from "../src/kernel/engineContractManifest.js";

const NOW = Date.parse("2026-10-19T17:00:00Z");
const AT = new Date(NOW).toISOString();
const HOLDER = "0xdddddddddddddddddddddddddddddddddddddddd";
const CREATOR = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
const CONTRACTS = getEngineContracts().filter(contract => ["walletCluster", "deployerReputation"].includes(contract.id));
const WALLET_CONTRACT = CONTRACTS.find(contract => contract.id === "walletCluster");
const address = index => `0x${index.toString(16).padStart(40, "0")}`;

test.beforeEach(t => {
  let httpAttempts = 0;
  t.mock.method(globalThis, "fetch", async () => { httpAttempts++; assert.fail("Live HTTP is forbidden"); });
  t.after(() => assert.equal(httpAttempts, 0, "No live HTTP may be attempted"));
});

function candidate(index = 1, patch = {}) {
  return { symbol: `P${index}`, chain: "base", tokenAddress: address(index), contractAddress: address(index),
    poolAddress: address(index + 1000), deepEvaluationState: "DEEP_EVALUATED", ...patch };
}

function demand(canonicalField, patch = {}) {
  return { canonicalField, rootCause: "RAW_SOURCE_MISSING", recoverable: true, evidenceClass: "CORE",
    blockingResearch: true, valueOfInformationScore: 0.1,
    targetSources: [{ source: "block explorers" }], ...patch };
}

function holderProof(project, patch = {}) {
  return { provider: "goplus", status: "EVIDENCE_AVAILABLE", chain: project.chain, address: project.tokenAddress,
    responseIdentityVerified: true, observedAt: AT, confidence: 85,
    raw: { holders: [{ address: HOLDER, balance: "1" }] }, ...patch };
}

function options(calls = { cheap: [], creator: [], deep: [] }, patch = {}) {
  return { now: () => NOW, wave1Max: 500, wave2Max: 150, wave3Max: 0, maxProviderRequests: 2000,
    concurrency: 6, timeBudgetMs: 60000, providerTimeoutMs: 500, useCache: false, walletHistory: false,
    nativeDeploymentHistory: false, useRpcWalletFallback: false,
    providers: {
      getGoPlusWalletEvidence: async project => {
        calls.cheap.push(project.symbol);
        return Number(project.symbol.slice(1)) <= 150 ? holderProof(project) : { status: "UNKNOWN" };
      },
      getBlockscoutDeployerEvidence: async project => {
        calls.creator.push(project.symbol);
        return { provider: "blockscout", status: "EVIDENCE_AVAILABLE", chain: project.chain,
          address: project.tokenAddress, creatorAddress: CREATOR, observedAt: AT, confidence: 0.9 };
      },
      getBlockscoutWalletEvidence: async project => {
        calls.deep.push(project.symbol);
        return { status: "EVIDENCE_AVAILABLE", chain: project.chain, tokenAddress: project.tokenAddress,
          observedAt: AT, wallets: [HOLDER], holderAddresses: [HOLDER], walletTransactions: [{ hash: "injected-tx" }] };
      },
      getRpcWalletEvidence: async () => assert.fail("No RPC fallback expected"),
    }, ...patch };
}

function plannedCandidate(index, fromContracts) {
  const raw = candidate(index, index <= 150 ? {} : { creator: CREATOR, deployer: CREATOR });
  if (fromContracts) return analyzeValueOfInformation(analyzeDataStarvationRootCause(raw,
    { contracts: CONTRACTS, now: new Date(NOW), disableSemanticScan: true }));
  const fields = index <= 150 ? ["wallets", "holderAddresses", "creator"] : ["wallets", "holderAddresses"];
  const missing = fields.map(field => demand(field, {
    producingEngine: field === "creator" ? "deployerReputation" : "walletCluster",
  }));
  return analyzeValueOfInformation({ ...raw, coreDataStarved: true, coreMissingEvidence: missing,
    dataStarvationMissingEvidence: missing, dataStarvationBlockingResearchCount: missing.length });
}

function localCandidate() {
  return { symbol: "LOCAL", chain: "base", deepEvaluationState: "DEEP_EVALUATED",
    rawCandidate: { tokenAddress: address(1), pairAddress: address(1001) }, marketData: { liquidityUsd: 125000 },
    canonicalAliases: { tokenAddress: null, poolAddress: null, liquidityUsd: null },
    targetedEnrichmentPlan: { items: [demand("tokenAddress"), demand("poolAddress"), demand("liquidityUsd")] } };
}

test("locally recovered inputs rerun their dependent engines without an external wave marker", () => {
  const project = { deepEvaluationState: "DEEP_EVALUATED", activeEvidenceRecovery: {
    waves: [], changedEvidenceFamiliesThisPhase: ["WALLETS"], changedEvidenceFamilies: ["WALLETS"],
  } };
  assert.equal(shouldRerunEngineForRecoveredProject("Wallet Cluster", project), true);
  assert.equal(shouldRerunEngineForRecoveredProject("Smart Wallet", project), true);
  assert.equal(shouldRerunEngineForRecoveredProject("Utility Quality", project), true);
  assert.equal(shouldRerunEngineForRecoveredProject("Execution Proof", project), false);
});

test("cleared current-phase changes do not replay historical local or provider evidence", () => {
  assert.equal(shouldRerunEngineForRecoveredProject("Wallet Cluster", { activeEvidenceRecovery: {
    waves: ["WAVE1"], changedEvidenceFamiliesThisPhase: [], changedEvidenceFamilies: ["WALLETS"],
  } }), false);
  assert.equal(shouldRerunEngineForRecoveredProject("Wallet Cluster", {}), false);
});

test("deferred candidates remain outside dependency reruns even if a stale change marker is present", () => {
  assert.equal(shouldRerunEngineForRecoveredProject("Wallet Cluster", { deepEvaluationState: "DEFERRED_BEFORE_DEEP",
    activeEvidenceRecovery: { changedEvidenceFamiliesThisPhase: ["WALLETS"] } }), false);
});

test("nested observed inputs promote locally with original provenance and no external slots or requests", async () => {
  const project = localCandidate();
  project.fieldProvenance = { liquidityUsd: { source: "existing-market-feed", sourceTimestamp: AT,
    confidence: 0.72, verificationStatus: "OBSERVED" } };
  const snapshot = structuredClone(project);
  const calls = { cheap: [], creator: [], deep: [] };
  const opts = options(calls, { maxProviderRequests: 0, timeBudgetMs: 0, maxFieldsPerCandidate: 1 });
  const state = createActiveEvidenceRecoveryState(opts);
  const [result] = await analyzeActiveEvidenceRecoveryBatch([project], { ...opts, executionState: state });
  assert.equal(result.activeEvidenceRecoveryStatus, "RECOVERED");
  assert.equal(result.tokenAddress, address(1));
  assert.equal(result.poolAddress, address(1001));
  assert.equal(result.liquidityUsd, 125000);
  assert.deepEqual(result.activeEvidenceRecoveryRecoveredFields, ["tokenAddress", "poolAddress", "liquidityUsd"]);
  assert.deepEqual(result.canonicalAliases, { tokenAddress: address(1), poolAddress: address(1001), liquidityUsd: 125000 });
  assert.deepEqual(new Set(result.activeEvidenceRecovery.changedEvidenceFamiliesThisPhase), new Set(["IDENTITY", "MARKET"]));
  assert.deepEqual(result.activeEvidenceRecovery.waves, []);
  assert.deepEqual(result.activeEvidenceRecovery.batchSummary.selectedWaveCounts, { WAVE1: 0, WAVE2: 0, WAVE3: 0 });
  assert.equal(result.activeEvidenceRecovery.batchSummary.recoveryCandidatesAttempted, 0);
  assert.equal(result.activeEvidenceRecovery.plannedRequestCost, 0);
  assert.equal(state.requestsUsed, 0);
  assert.equal(calls.cheap.length + calls.creator.length + calls.deep.length, 0);
  assert.equal(result.fieldProvenance.tokenAddress.source, "existing-provider-observation");
  assert.equal(result.fieldProvenance.tokenAddress.verificationStatus, "RECOVERED_EXISTING_OBSERVATION");
  assert.equal(result.fieldProvenance.tokenAddress.sourceTimestamp, null);
  assert.deepEqual(result.fieldProvenance.liquidityUsd, { ...project.fieldProvenance.liquidityUsd, value: 125000, recoveryRun: true });
  assert.deepEqual(project, snapshot);
});

test("alias-only changes persist on local-only rows and unchanged inputs are not replayed", async () => {
  const project = { ...localCandidate(), tokenAddress: address(1), contractAddress: address(1), address: address(1),
    poolAddress: address(1001), pairAddress: address(1001), liquidityUsd: 125000 };
  const opts = options(undefined, { maxProviderRequests: 0 });
  const state = createActiveEvidenceRecoveryState(opts);
  const [first] = await analyzeActiveEvidenceRecoveryBatch([project], { ...opts, executionState: state });
  assert.deepEqual(first.activeEvidenceRecoveryRecoveredFields, ["tokenAddress", "poolAddress", "liquidityUsd"]);
  const [resumed] = await analyzeActiveEvidenceRecoveryBatch([first], { ...opts, executionState: state, resumeRecovery: true });
  assert.deepEqual(resumed.activeEvidenceRecovery.changedEvidenceFamiliesThisPhase, []);
  assert.deepEqual(resumed.activeEvidenceRecovery.attempts, first.activeEvidenceRecovery.attempts);
  assert.deepEqual(resumed.fieldProvenance, first.fieldProvenance);
  const [fresh] = await analyzeActiveEvidenceRecoveryBatch([first], opts);
  assert.equal(fresh.activeEvidenceRecoveryStatus, "NOT_SELECTED");
  assert.deepEqual(fresh.activeEvidenceRecovery.recoveredFields, []);
  assert.deepEqual(fresh.activeEvidenceRecovery.changedEvidenceFamiliesThisPhase, []);
  assert.deepEqual(fresh.canonicalAliases, first.canonicalAliases);
  assert.deepEqual(fresh.fieldProvenance, first.fieldProvenance);
});

test("disabled raw waves do not locally promote their roots, aliases or change families", async () => {
  for (const project of [localCandidate(), candidate(1, { walletList: [HOLDER], canonicalAliases: { wallets: null },
    targetedEnrichmentPlan: { items: [demand("wallets", { evidenceClass: "ADVISORY" })] } })]) {
    const [result] = await analyzeActiveEvidenceRecoveryBatch([project], options(undefined,
      { wave1Max: 0, wave2Max: 0, wave3Max: 0, maxProviderRequests: 0 }));
    assert.equal(result.tokenAddress, project.tokenAddress);
    assert.equal(result.poolAddress, project.poolAddress);
    assert.equal(result.liquidityUsd, project.liquidityUsd);
    assert.equal(result.wallets, undefined);
    assert.deepEqual(result.canonicalAliases, project.canonicalAliases);
    assert.equal(result.fieldProvenance, undefined);
    assert.deepEqual(result.activeEvidenceRecovery.changedEvidenceFamiliesThisPhase, []);
  }
});

for (const wave of ["WAVE1", "WAVE2"]) {
  test(`local normalization leaves the sole external ${wave} slot for a genuine gap`, async () => {
    const local = { ...localCandidate(), valueOfInformationScore: 1000 };
    const gap = candidate(200, { targetedEnrichmentPlan: { items: [demand(wave === "WAVE1" ? "priceUsd" : "walletTransactions",
      { targetSources: [{ source: wave === "WAVE1" ? "DexScreener" : "block explorers" }] })] } });
    const calls = { cheap: [], creator: [], deep: [] };
    let marketCalls = 0;
    const opts = options(calls, { wave1Max: 1, wave2Max: 1, maxProviderRequests: 3, maxFieldsPerCandidate: 1 });
    const pair = { chainId: "base", pairAddress: gap.poolAddress, baseToken: { address: gap.tokenAddress },
      priceUsd: "1", liquidity: { usd: 100000 } };
    opts.providers.getPairByAddress = async () => { marketCalls++; return pair; };
    opts.providers.getTokenPairs = async () => { marketCalls++; return [pair]; };
    const results = await analyzeActiveEvidenceRecoveryBatch([local, gap], opts);
    assert.equal(results[0].activeEvidenceRecoveryStatus, "RECOVERED");
    assert.deepEqual(results[0].activeEvidenceRecovery.waves, []);
    assert.deepEqual(results[1].activeEvidenceRecovery.waves, [wave]);
    assert.equal(results[0].activeEvidenceRecovery.batchSummary.selectedWaveCounts[wave], 1);
    assert.equal(results[0].activeEvidenceRecovery.batchSummary.recoveryCandidatesAttempted, 1);
    assert.equal(marketCalls, wave === "WAVE1" ? 1 : 0);
    assert.equal(calls.deep.length, wave === "WAVE2" ? 1 : 0);
    assert.equal(results[0].activeEvidenceRecovery.batchSummary.providerRequestsUsed, wave === "WAVE1" ? 1 : 3);
  });
}

test("quote-only resumption retains local history without replaying or renormalizing old holder inputs", async t => {
  t.mock.method(Date, "now", () => NOW);
  const provenance = { source: "existing-holder-feed", sourceTimestamp: new Date(NOW - 60000).toISOString(),
    confidence: 0.7, verificationStatus: "OBSERVED" };
  const project = candidate(1, { priceUsd: 1, wallets: [HOLDER], holderAddresses: [HOLDER],
    canonicalAliases: { wallets: null, holderAddresses: null },
    fieldProvenance: { wallets: provenance, holderAddresses: provenance },
    targetedEnrichmentPlan: { items: [demand("wallets", { evidenceClass: "ADVISORY" }),
      demand("holderAddresses", { evidenceClass: "ADVISORY" })] } });
  const calls = { cheap: [], creator: [], deep: [] };
  const opts = options(calls, { wave1Max: 0, wave2Max: 1, maxProviderRequests: 2 });
  const state = createActiveEvidenceRecoveryState(opts);
  const [early] = await analyzeActiveEvidenceRecoveryBatch([project], { ...opts, executionState: state });
  assert.equal(early.activeEvidenceRecoveryStatus, "RECOVERED");
  assert.deepEqual(early.activeEvidenceRecovery.waves, []);
  assert.deepEqual(early.activeEvidenceRecovery.changedEvidenceFamiliesThisPhase, ["WALLETS"]);
  assert.equal(state.requestsUsed, 0);
  const late = { ...early, canonicalAliases: { ...early.canonicalAliases, wallets: null, holderAddresses: null },
    targetedEnrichmentPlan: project.targetedEnrichmentPlan,
    executionProof: { routeType: "DEX", buyQuoteVerified: false, sellQuoteVerified: false, liveExecutionReady: false } };
  const snapshot = structuredClone(late);
  let quotes = 0;
  const USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
  const [result] = await analyzeActiveEvidenceRecoveryBatch([late], { ...opts, executionState: state,
    resumeRecovery: true, wave1Max: 0, wave2Max: 0, wave3Max: 1, maxProviderRequests: 999,
    executionRecovery: { env: {}, lifiEnabled: true, jupiterApiKey: "", zeroxApiKey: "", tradeSizesUsd: [25],
      lifiRateBudget: { windowStartedAtMs: NOW, requests: 0 }, fetchJson: async url => {
        quotes++;
        const params = new URL(url).searchParams;
        const from = params.get("fromToken").toLowerCase(), to = params.get("toToken").toLowerCase();
        return { tool: "aerodrome", action: { fromChainId: 8453, toChainId: 8453, fromAmount: params.get("fromAmount"),
          fromToken: { chainId: 8453, address: from, decimals: from === USDC ? 6 : 18 },
          toToken: { chainId: 8453, address: to, decimals: to === USDC ? 6 : 18 } },
        estimate: { tool: "aerodrome", toAmount: to === USDC ? "24750000" : "5000000000000000000",
          data: { protocols: [{ poolAddress: project.poolAddress }] } } };
      } } });
  assert.equal(quotes, 2);
  assert.equal(state.maxRequests, 2);
  assert.equal(state.requestsUsed, 2);
  assert.deepEqual(result.activeEvidenceRecovery.changedEvidenceFamiliesThisPhase, ["EXECUTION"]);
  assert.deepEqual(result.activeEvidenceRecovery.waves, ["WAVE3"]);
  assert.deepEqual(result.activeEvidenceRecovery.batchSummary.selectedWaveCounts, { WAVE1: 0, WAVE2: 0, WAVE3: 1 });
  assert.deepEqual(result.wallets, early.wallets);
  assert.deepEqual(result.holderAddresses, early.holderAddresses);
  assert.equal(result.canonicalAliases.wallets, null);
  assert.equal(result.canonicalAliases.holderAddresses, null);
  assert.deepEqual(result.canonicalAliasProvenance.wallets, early.canonicalAliasProvenance.wallets);
  assert.deepEqual(result.fieldProvenance.wallets, early.fieldProvenance.wallets);
  assert.equal(result.activeEvidenceRecovery.attempts.filter(attempt => attempt.wave === "LOCAL").length,
    early.activeEvidenceRecovery.attempts.length);
  assert.equal(calls.cheap.length + calls.creator.length + calls.deep.length, 0);
  assert.deepEqual(late, snapshot);
});

test("local identity promotion cannot conceal conflicting nested observations from Wave3", async () => {
  const project = localCandidate();
  project.marketData.tokenAddress = CREATOR;
  project.targetedEnrichmentPlan.items.push(demand("quoteTimestamp", { requiresFreshObservation: true,
    targetSources: [{ source: "LI.FI keyless quote" }] }));
  const [result] = await analyzeActiveEvidenceRecoveryBatch([project], options(undefined, { wave3Max: 1, maxProviderRequests: 0 }));
  assert.equal(result.tokenAddress, address(1));
  assert.equal(result.marketData.tokenAddress, CREATOR);
  assert.equal(result.activeEvidenceRecovery.batchSummary.executionIdentityDeferredCandidates, 1);
  assert.equal(result.activeEvidenceRecovery.batchSummary.selectedWaveCounts.WAVE3, 0);
  assert.equal(result.activeEvidenceRecovery.batchSummary.providerRequestsUsed, 0);
});

test("500-row quote-only recovery never traverses PRE/raw planning records before or after quotes", async t => {
  t.mock.method(Date, "now", () => NOW);
  let rawTraversals = 0;
  const rawRecords = new Proxy([demand("walletTransactions")], { get(target, key, receiver) {
    if (["map", "filter", Symbol.iterator].includes(key)) {
      rawTraversals++;
      assert.fail("Disabled raw planning must not run around short-lived quotes");
    }
    return Reflect.get(target, key, receiver);
  } });
  const projects = Array.from({ length: 500 }, (_, index) => candidate(index + 1, {
    preliminaryOpportunityScore: index === 0 ? 100 : 0,
    dataStarvationMissingEvidence: rawRecords, coreMissingEvidence: rawRecords,
    executionProof: { routeType: "DEX", buyQuoteVerified: false, sellQuoteVerified: false },
    targetedEnrichmentPlan: { items: [demand("walletTransactions"), demand("quoteTimestamp", {
      requiresFreshObservation: true, targetSources: [{ source: "LI.FI keyless quote" }],
    })] },
  }));
  let quotes = 0;
  const USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
  const results = await analyzeActiveEvidenceRecoveryBatch(projects, options(undefined, {
    wave1Max: 0, wave2Max: 0, wave3Max: 1, maxProviderRequests: 2,
    executionRecovery: { env: {}, lifiEnabled: true, jupiterApiKey: "", zeroxApiKey: "", tradeSizesUsd: [25],
      lifiRateBudget: { windowStartedAtMs: NOW, requests: 0 }, fetchJson: async url => {
        quotes++;
        const params = new URL(url).searchParams;
        const from = params.get("fromToken").toLowerCase(), to = params.get("toToken").toLowerCase();
        return { tool: "aerodrome", action: { fromChainId: 8453, toChainId: 8453, fromAmount: params.get("fromAmount"),
          fromToken: { chainId: 8453, address: from, decimals: from === USDC ? 6 : 18 },
          toToken: { chainId: 8453, address: to, decimals: to === USDC ? 6 : 18 } },
        estimate: { tool: "aerodrome", toAmount: to === USDC ? "24750000" : "5000000000000000000",
          data: { protocols: [{ poolAddress: projects[0].poolAddress }] } } };
      } },
  }));
  assert.equal(quotes, 2);
  assert.equal(rawTraversals, 0);
  assert.deepEqual(results[0].activeEvidenceRecovery.batchSummary.selectedWaveCounts, { WAVE1: 0, WAVE2: 0, WAVE3: 1 });
  assert.equal(results[0].activeEvidenceRecovery.batchSummary.providerRequestsUsed, 2);
  assert.deepEqual(results[0].activeEvidenceRecovery.changedEvidenceFamiliesThisPhase, ["EXECUTION"]);
  assert.equal(results[0].dataStarvationMissingEvidence, rawRecords);
  assert.equal(results[0].engineDataReadiness, undefined);
});

for (const fromContracts of [false, true]) {
  test(`500 candidates: 150 satisfied rows free Wave2 for 150 of 350 core gaps (${fromContracts ? "manifest" : "targeted"} plans)`, async () => {
    const projects = Array.from({ length: 500 }, (_, index) => plannedCandidate(index + 1, fromContracts));
    const snapshot = structuredClone(projects);
    assert.ok(projects[0].valueOfInformationScore > projects[150].valueOfInformationScore);
    if (fromContracts) assert.equal(projects[0].canonicalAliases.wallets, null);
    const calls = { cheap: [], creator: [], deep: [] };
    const opts = options(calls);
    const state = createActiveEvidenceRecoveryState(opts);
    const deadline = state.deadlineAt;
    const results = await analyzeActiveEvidenceRecoveryBatch(projects, { ...opts, executionState: state });
    const selected = results.filter(project => project.activeEvidenceRecovery.waves.includes("WAVE2"));
    assert.equal(selected.length, 150);
    assert.ok(selected.every(project => Number(project.symbol.slice(1)) > 150));
    assert.equal(calls.creator.length, 150);
    assert.equal(calls.cheap.length, 650);
    assert.equal(calls.deep.length, 150);
    assert.deepEqual(new Set(calls.deep), new Set(selected.map(project => project.symbol)));
    assert.equal(results.filter(project => evaluateEngineDataReadiness(project, WALLET_CONTRACT).missingRequiredGroups.length).length, 200);
    for (const project of results.slice(0, 150)) {
      assert.deepEqual(project.wallets, [HOLDER]);
      assert.deepEqual(project.holderAddresses, [HOLDER]);
      assert.deepEqual(project.canonicalAliases.wallets, [HOLDER]);
      assert.deepEqual(project.canonicalAliases.holderAddresses, [HOLDER]);
      assert.equal(project.creator, CREATOR);
      assert.equal(project.coreDataStarved, false);
      assert.equal(project.coreMissingEvidence.length, 0);
      assert.equal(project.dataStarvationBlockingResearchCount, 0);
      assert.equal(project.valueOfInformationScore, 0);
      assert.equal(project.deployerHistory, undefined);
      assert.ok(project.targetedEnrichmentPlan.items.every(item => !["deployerHistory", "nativeLifecycle"].includes(item.canonicalField)));
    }
    const summary = results[0].activeEvidenceRecovery.batchSummary;
    assert.deepEqual(summary.selectedWaveCounts, { WAVE1: 500, WAVE2: 150, WAVE3: 0 });
    assert.equal(summary.providerRequestsUsed, 1250);
    assert.equal(state.maxRequests, 2000);
    assert.equal(state.deadlineAt, deadline);
    assert.equal(summary.timeBudgetExceeded, false);
    assert.equal(summary.timeBudgetSkippedCalls, 0);
    assert.equal(summary.recoveredFieldsByFamily.UNKNOWN, undefined);
    for (const project of results) {
      assert.equal(project.uniqueBuyers24h, undefined);
      assert.notEqual(project.finalSelectionQualified, true);
    }
    assert.deepEqual(projects, snapshot);
  });
}

test("known values and stale null aliases are removed before scoring and the field cap", () => {
  const project = candidate(1, { coreDataStarved: true, valueOfInformationScore: 100,
    wallets: [HOLDER], holderAddresses: [HOLDER], holderCount: 1,
    canonicalAliases: { wallets: null, holderAddresses: null, holderCount: null },
    targetedEnrichmentPlan: { items: [demand("wallets", { valueOfInformationScore: 100 }),
      demand("holderAddresses", { valueOfInformationScore: 90 }), demand("holderCount", { valueOfInformationScore: 80 }),
      demand("walletTransactions", { valueOfInformationScore: 0.01 })] } });
  const snapshot = structuredClone(project);
  const waves = buildActiveEvidenceRecoveryWaves([project], { maxFieldsPerCandidate: 1, wave3Max: 0 }).waves;
  assert.ok(waves.WAVE1[0].entries.every(entry => entry.item.cheapHolderMetadataOnly && entry.item.requiresFreshObservation));
  assert.deepEqual(waves.WAVE2[0].entries.map(entry => entry.field), ["walletTransactions"]);
  assert.ok(waves.WAVE2[0].project.valueOfInformationScore < 100);
  assert.deepEqual(project, snapshot);
});

test("required-any creator recovery retires history alternatives but preserves an independent history request", () => {
  const generated = plannedCandidate(1, true);
  const project = { ...generated, creator: CREATOR, deployer: CREATOR, wallets: [HOLDER], holderAddresses: [HOLDER] };
  project.targetedEnrichmentPlan = { ...generated.targetedEnrichmentPlan,
    items: [...generated.targetedEnrichmentPlan.items, demand("deployerHistory", { producingEngine: undefined }),
      demand("walletTransactions")] };
  const waves = buildActiveEvidenceRecoveryWaves([project], { wave3Max: 0 }).waves;
  assert.ok(waves.WAVE1[0].entries.every(entry => entry.item.cheapHolderMetadataOnly && entry.item.requiresFreshObservation));
  assert.deepEqual(new Set(waves.WAVE2[0].entries.map(entry => entry.field)), new Set(["deployerHistory", "walletTransactions"]));
  assert.ok(waves.WAVE2[0].entries.every(entry => !entry.item.producingEngine));
  assert.equal(waves.WAVE2[0].project.coreMissingEvidence.length, 0);
});

test("independently demanded transaction history is acquired after holder companions satisfy wallets", async () => {
  const calls = { cheap: [], creator: [], deep: [] };
  const project = candidate(1, { targetedEnrichmentPlan: { items: [demand("wallets"), demand("walletTransactions")] } });
  const [result] = await analyzeActiveEvidenceRecoveryBatch([project], options(calls));
  assert.equal(calls.cheap.length, 1);
  assert.equal(calls.deep.length, 1);
  assert.deepEqual(result.walletTransactions, [{ hash: "injected-tx" }]);
  assert.deepEqual(result.activeEvidenceRecovery.attempts.filter(attempt => attempt.wave === "WAVE2").map(attempt => attempt.field), ["walletTransactions"]);
  assert.equal(result.activeEvidenceRecovery.batchSummary.providerRequestsUsed, 4);
});

test("an explicit advisory gap remains visible without stale core priority or blocker promotion", async () => {
  const generated = plannedCandidate(1, true);
  const advisory = demand("deployerHistory", { producingEngine: "deployerReputation", evidenceClass: "ADVISORY", blockingResearch: true,
    blockingExecution: true, valueOfInformationScore: 100 });
  const satisfied = { ...generated, creator: CREATOR, deployer: CREATOR, wallets: [HOLDER], holderAddresses: [HOLDER],
    dataStarvationMissingEvidence: [...generated.dataStarvationMissingEvidence, advisory],
    advisoryMissingEvidence: [advisory],
    targetedEnrichmentPlan: { items: [...generated.targetedEnrichmentPlan.items, advisory] } };
  const gap = candidate(200, { targetedEnrichmentPlan: { items: [demand("walletTransactions")] } });
  const selected = buildActiveEvidenceRecoveryWaves([satisfied, gap], { wave1Max: 0, wave2Max: 1, wave3Max: 0 }).waves.WAVE2;
  assert.equal(selected[0].projectIndex, 1);
  const advisoryOnly = buildActiveEvidenceRecoveryWaves([satisfied], { wave3Max: 0 }).waves.WAVE2[0];
  assert.equal(advisoryOnly.coreRecoveryPriority, 0);
  assert.equal(advisoryOnly.entries[0].coreEvidence, false);
  assert.equal(advisoryOnly.project.coreDataStarved, false);
  assert.equal(advisoryOnly.project.dataStarvationBlockingResearchCount, 0);
  assert.equal(advisoryOnly.project.dataStarvationBlockingExecutionCount, 0);
  assert.deepEqual(advisoryOnly.project.advisoryMissingEvidence, [advisory]);
  const [result] = await analyzeActiveEvidenceRecoveryBatch([satisfied], options(undefined,
    { wave1Max: 0, wave2Max: 0, maxProviderRequests: 0 }));
  assert.ok(result.targetedEnrichmentPlan.items.some(item => item.evidenceClass === "ADVISORY"));
});

test("fresh observations survive satisfied groups and duplicate plans even when a higher-VOI copy is known", async () => {
  const calls = { cheap: [], creator: [], deep: [] };
  const generated = plannedCandidate(1, true);
  const project = { ...generated, wallets: [HOLDER], holderAddresses: [HOLDER], creator: CREATOR,
    walletTransactions: [{ hash: "old" }],
    targetedEnrichmentPlan: { items: [...generated.targetedEnrichmentPlan.items,
      demand("walletTransactions", { valueOfInformationScore: 100 }),
      demand("deployerHistory", { producingEngine: "deployerReputation", requiresFreshObservation: true })] },
    valueOfInformationItems: [demand("walletTransactions", { requiresFreshObservation: true })] };
  const waves = buildActiveEvidenceRecoveryWaves([project], { wave3Max: 0 }).waves;
  const entries = waves.WAVE2[0].entries;
  assert.equal(entries.find(entry => entry.field === "walletTransactions").item.requiresFreshObservation, true);
  assert.equal(entries.find(entry => entry.field === "walletTransactions").item.valueOfInformationScore, 100);
  assert.equal(entries.find(entry => entry.field === "deployerHistory").item.requiresFreshObservation, true);
  const [result] = await analyzeActiveEvidenceRecoveryBatch([project], options(calls, { wave1Max: 0 }));
  assert.equal(calls.deep.length, 1);
  assert.deepEqual(result.walletTransactions, [{ hash: "injected-tx" }]);
  assert.ok(result.activeEvidenceRecovery.attempts.some(attempt => attempt.field === "deployerHistory" &&
    attempt.status === "PROVIDER_RECOVERY_QUEUED"));
});

test("explicit stale observations stay pending rather than trusting a present scalar", () => {
  const project = candidate(1, { holderCount: 10, targetedEnrichmentPlan: { items: [demand("holderCount", { rootCause: "STALE_DATA" })] } });
  assert.equal(buildActiveEvidenceRecoveryWaves([project], { wave3Max: 0 }).waves.WAVE2[0].entries[0].field, "holderCount");
});

test("Wave3 keeps mandatory quotes fresh and preserves raw identity and transfer-risk exclusions", () => {
  const project = candidate(1, { buyQuoteVerified: true, sellQuoteVerified: true, quoteTimestamp: AT,
    targetedEnrichmentPlan: { items: [demand("quoteTimestamp", { requiresFreshObservation: true,
      targetSources: [{ source: "LI.FI keyless quote" }] }), demand("wallets")] },
    canonicalAliases: { wallets: null, tokenAddress: address(1), chain: "base" } });
  const opts = { wave1Max: 0, wave2Max: 0, wave3Max: 1 };
  const waves = buildActiveEvidenceRecoveryWaves([project], opts).waves;
  assert.equal(waves.WAVE3.length, 1);
  assert.equal(waves.WAVE3[0].entries[0].item.requiresFreshObservation, true);
  for (const patch of [{ contractAddress: CREATOR }, { chainId: "ethereum" }, { poolAddress: "bad" },
    { rawCandidate: { tokenAddress: CREATOR } }, { deepEvaluationState: "DEFERRED_BEFORE_DEEP" },
    ...["sellRestricted", "blacklistEnabled", "hiddenTransferRestriction", "transferRestricted", "blacklistAuthority", "canBlacklist"]
      .map(field => ({ [field]: true }))]) {
    const unsafe = { ...project, ...patch };
    const snapshot = structuredClone(unsafe);
    assert.equal(buildActiveEvidenceRecoveryWaves([unsafe], opts).waves.WAVE3.length, 0, JSON.stringify(patch));
    assert.deepEqual(unsafe, snapshot);
  }
});

test("mandatory paired authority demand survives deduplication of a known false raw authority", () => {
  const project = { chain: "solana", tokenAddress: "So11111111111111111111111111111111111111112",
    mintAuthorityEnabled: false, targetedEnrichmentPlan: { items: [demand("mintAuthorityEnabled", { valueOfInformationScore: 100 })] },
    valueOfInformationItems: [demand("mintAuthorityEnabled", { requiresAuthorityPair: true, requiresMintAccountEvidence: true })] };
  const entry = buildActiveEvidenceRecoveryWaves([project], { wave3Max: 0 }).waves.WAVE2[0].entries[0];
  assert.equal(entry.item.requiresAuthorityPair, true);
  assert.equal(entry.item.requiresMintAccountEvidence, true);
});

test("derived outputs never consume provider requests or displace pending raw fields", async () => {
  const calls = { cheap: [], creator: [], deep: [] };
  const project = candidate(1, { targetedEnrichmentPlan: { items: [
    demand("smartWalletScore", { valueOfInformationScore: 100, requiresFreshObservation: true }),
    demand("deployerReputationScore", { valueOfInformationScore: 100, requiresFreshObservation: true }),
    demand("walletTransactions"),
  ] } });
  const waves = buildActiveEvidenceRecoveryWaves([project], { wave3Max: 0, maxFieldsPerCandidate: 1 }).waves;
  assert.deepEqual(waves.WAVE2[0].entries.map(entry => entry.field), ["walletTransactions"]);
  const [result] = await analyzeActiveEvidenceRecoveryBatch([project], options(calls, { maxProviderRequests: 3 }));
  assert.equal(calls.deep.length, 1);
  assert.equal(result.activeEvidenceRecovery.batchSummary.providerRequestsUsed, 3);
  assert.equal(result.smartWalletScore, undefined);
  assert.equal(result.deployerReputationScore, undefined);
});

for (const priorFinalAudit of [false, true]) {
  test(`pre-recovery planning leaves late producers waiting without creating or using a FINAL audit (${priorFinalAudit ? "old audit present" : "no final audit"})`, async () => {
    const generated = plannedCandidate(1, true);
    const waiting = ["utilityQualityScore", "researchReadinessScore"].map(canonicalField => demand(canonicalField, {
      producingEngine: canonicalField === "utilityQualityScore" ? "utilityQuality" : "researchReadiness",
      rootCause: "PIPELINE_STAGE_NOT_RUN", recoveryDisposition: "DERIVED_RECOMPUTE", recomputeAfterRecovery: true,
      blockingExecution: true, valueOfInformationScore: 1000,
    }));
    const preAudit = { auditPhase: "PRE_RECOVERY", status: "PARTIAL_INPUTS", engines: [{ engineId: "walletCluster" }] };
    const finalAudit = { auditPhase: "FINAL", coreDataStarved: true, coreMissingFields: ["utilityQualityScore"],
      engines: [{ engineId: "utilityQuality", status: "DATA_STARVED" }] };
    const project = { ...generated, preRecoveryEngineDataReadiness: preAudit,
      dataStarvationMissingEvidence: [...generated.dataStarvationMissingEvidence, ...waiting],
      coreMissingEvidence: [...generated.coreMissingEvidence, ...waiting],
      targetedEnrichmentPlan: { items: [...generated.targetedEnrichmentPlan.items, ...waiting] },
      valueOfInformationItems: [...generated.valueOfInformationItems, ...waiting],
      ...(priorFinalAudit ? { engineDataReadiness: finalAudit } : {}) };
    const snapshot = structuredClone(project);
    const calls = { cheap: [], creator: [], deep: [] };
    const [result] = await analyzeActiveEvidenceRecoveryBatch([project], options(calls));
    assert.equal(result.preRecoveryEngineDataReadiness, preAudit);
    assert.equal(result.engineDataReadiness, priorFinalAudit ? finalAudit : undefined);
    assert.equal(result.coreDataStarved, false);
    assert.equal(result.coreMissingEvidence.length, 0);
    assert.equal(result.dataStarvationBlockingResearchCount, 0);
    assert.equal(result.dataStarvationBlockingExecutionCount, 0);
    assert.equal(result.valueOfInformationScore, 0);
    assert.equal(result.activeEvidenceRecovery.batchSummary.selectedWaveCounts.WAVE2, 0);
    assert.equal(result.activeEvidenceRecovery.batchSummary.providerRequestsUsed, 2);
    assert.equal(calls.deep.length, 0);
    for (const item of waiting) {
      assert.equal(result[item.canonicalField], undefined);
      const recompute = result.dataStarvationMissingEvidence.find(record => record.canonicalField === item.canonicalField);
      assert.equal(recompute.recomputeAfterRecovery, true);
      assert.equal(recompute.recoverable, false);
      assert.equal(recompute.blockingResearch, false);
      assert.equal(recompute.blockingExecution, false);
      assert.ok(result.valueOfInformationItems.some(record => record.canonicalField === item.canonicalField));
      assert.ok(!result.activeEvidenceRecovery.attemptedFields.includes(item.canonicalField));
    }
    for (const field of ["engineDataReadinessScore", "coreEvidenceCoveragePct", "coreEvidenceState", "finalSelectionQualified"]) {
      assert.equal(Object.hasOwn(result, field), false, field);
    }
    assert.deepEqual(project, snapshot);
  });
}

for (const limits of [{ maxProviderRequests: 0 }, { timeBudgetMs: 0 }]) {
  test(`pending-work refresh cannot create request or deadline allowance: ${JSON.stringify(limits)}`, async () => {
    const calls = { cheap: [], creator: [], deep: [] };
    const opts = options(calls, limits);
    const state = createActiveEvidenceRecoveryState(opts);
    const deadline = state.deadlineAt;
    const projects = [plannedCandidate(1, true), plannedCandidate(200, true)];
    await analyzeActiveEvidenceRecoveryBatch(projects, { ...opts, executionState: state });
    assert.equal(calls.cheap.length + calls.creator.length + calls.deep.length, 0);
    assert.equal(state.requestsUsed, 0);
    assert.equal(state.deadlineAt, deadline);
    assert.equal(state.maxRequests, limits.maxProviderRequests ?? 2000);
  });
}

test("provider circuit remains open while refreshed pending gaps are selected", async () => {
  let calls = 0;
  const opts = options(undefined, { concurrency: 1, wave1Max: 0, circuitFailureThreshold: 1 });
  opts.providers.getBlockscoutWalletEvidence = async () => { calls++; throw new Error("Injected outage"); };
  const projects = [candidate(1), candidate(2)].map(project => ({ ...project,
    targetedEnrichmentPlan: { items: [demand("walletTransactions")] } }));
  const results = await analyzeActiveEvidenceRecoveryBatch(projects, opts);
  assert.equal(calls, 1);
  assert.equal(results[0].activeEvidenceRecovery.batchSummary.providerRequestsUsed, 3);
  assert.ok(results[1].activeEvidenceRecovery.providerAttempts.some(attempt => attempt.status === "CIRCUIT_OPEN"));
});

for (const patch of [{ address: CREATOR }, { chain: "ethereum" }, { responseIdentityVerified: false },
  { observedAt: new Date(NOW - 7 * 3600000).toISOString() }, { observedAt: new Date(NOW + 1000).toISOString() },
  { confidence: 0.1 }]) {
  test(`invalid holder metadata cannot satisfy core groups: ${JSON.stringify(patch)}`, async () => {
    const calls = { cheap: [], creator: [], deep: [] };
    const opts = options(calls);
    opts.providers.getGoPlusWalletEvidence = async project => holderProof(project, patch);
    const [result] = await analyzeActiveEvidenceRecoveryBatch([plannedCandidate(1, true)], opts);
    assert.ok(result.activeEvidenceRecovery.waves.includes("WAVE2"));
    assert.equal(calls.deep.length, 1);
    assert.equal(result.fieldProvenance.wallets.source, "blockscout-wallets");
    assert.notEqual(result.finalSelectionQualified, true);
  });
}
