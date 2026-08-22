import test from "node:test";
import assert from "node:assert/strict";

import {
  FINAL_EVIDENCE_ENGINE_SEQUENCE,
  shouldRerunEngineForEvidenceFamilies,
} from "../src/intelligencePipeline.js";
import {
  analyzeEngineDataReadiness,
  summarizeEngineDataReadiness,
} from "../src/engines/engineDataReadinessEngine.js";
import {
  analyzeActiveEvidenceRecoveryBatch,
  buildActiveEvidenceRecoveryWaves,
} from "../src/engines/activeEvidenceRecoveryEngine.js";
import {
  createActiveEvidenceExecutionState,
  executeActiveEvidenceProviderRequests,
} from "../src/data/activeEvidenceProviderExecutor.js";
import {
  normalizeBlockscoutWalletEvidence,
} from "../src/data/blockscoutWalletConnector.js";
import { analyzeSmartWallets } from "../src/engines/smartWalletEngine.js";
import { fieldApplicability } from "../src/engines/dataStarvationRootCauseEngine.js";
import { summarizeEvidenceFunnel } from "../src/kernel/evidenceFunnelSummary.js";
import { emptyExecutionLabel } from "../src/reports/githubPagesPublisher.js";
import { buildScannerSemanticHealth } from "../src/index.js";

const TOKEN = "0x1111111111111111111111111111111111111111";
const POOL = "0x2222222222222222222222222222222222222222";
const CREATOR = "0x3333333333333333333333333333333333333333";
const BUYER = "0x4444444444444444444444444444444444444444";

function request(field, source) {
  return {
    field,
    item: {
      canonicalField: field,
      targetSources: [{ source }],
    },
  };
}

function contract({ advisory = false } = {}) {
  return {
    id: advisory ? "smartWalletAdvisory" : "finalDecisionCore",
    phase: "test",
    affectsFinalDecision: !advisory,
    canBlockCandidate: !advisory,
    inputContract: { requiredAny: [[advisory ? "smartWalletBuys24h" : "liquidityUsd"]] },
  };
}

test("utility producers run before final readiness and final scoring", () => {
  const utility = FINAL_EVIDENCE_ENGINE_SEQUENCE.indexOf("Utility Quality");
  const readiness = FINAL_EVIDENCE_ENGINE_SEQUENCE.indexOf("Engine Data Readiness");
  const scoring = FINAL_EVIDENCE_ENGINE_SEQUENCE.indexOf("Post-Evidence Final Scoring");
  const integrity = FINAL_EVIDENCE_ENGINE_SEQUENCE.indexOf("Final Selection Integrity");
  assert.ok(utility < readiness);
  assert.ok(readiness < scoring);
  assert.ok(scoring < integrity);
});

test("advisory smart-wallet gaps do not create core starvation", () => {
  const result = analyzeEngineDataReadiness({}, { contracts: [contract({ advisory: true })] });
  assert.equal(result.engineDataReadinessStatus, "CORE_READY");
  assert.equal(result.engineDataReadiness.coreDataStarved, false);
  assert.equal(result.advisoryDataGaps, true);
  assert.equal(result.advisoryMissingFields[0].fields, "smartWalletBuys24h");
});

test("missing final-decision evidence creates core starvation", () => {
  const result = analyzeEngineDataReadiness({}, { contracts: [contract()] });
  assert.equal(result.engineDataReadinessStatus, "CORE_DATA_STARVED");
  assert.equal(result.engineDataReadiness.coreDataStarved, true);
  assert.equal(result.coreMissingFields[0].fields, "liquidityUsd");
});

test("Blockscout creator evidence is promoted with provenance", async () => {
  let calls = 0;
  const [result] = await analyzeActiveEvidenceRecoveryBatch([{
    chain: "base",
    tokenAddress: TOKEN,
    targetedEnrichmentPlan: {
      items: [{ canonicalField: "creatorAddress", recoverable: true, valueOfInformationScore: 1, targetSources: [{ source: "block explorers" }] }],
    },
  }], {
    providers: {
      getDeployerEvidence: async () => {
        calls += 1;
        return { creatorAddress: CREATOR, confidence: 84, observedAt: "2026-08-12T00:00:00.000Z" };
      },
    },
  });
  assert.equal(calls, 1);
  assert.equal(result.creatorAddress, CREATOR);
  assert.equal(result.deployerAddress, CREATOR);
  assert.equal(result.creator, CREATOR);
  assert.equal(result.deployer, CREATOR);
  assert.equal(result.fieldProvenance.creatorAddress.source, "blockscout");
  assert.equal(result.fieldProvenance.deployer.source, "blockscout");
  assert.equal(result.fieldProvenance.creatorAddress.verificationStatus, "VERIFIED_PROVIDER_OBSERVATION");
});

test("unknown Blockscout creator remains null", async () => {
  const result = await executeActiveEvidenceProviderRequests(
    { chain: "base", tokenAddress: TOKEN },
    [request("creatorAddress", "block explorers")],
    { providers: { getDeployerEvidence: async () => ({ creatorAddress: null, confidence: 0 }) } }
  );
  assert.equal(result.observations.length, 0);
});

test("active recovery invokes the deployer provider path", async () => {
  let calls = 0;
  await executeActiveEvidenceProviderRequests(
    { chain: "base", tokenAddress: TOKEN },
    [request("deployerAddress", "block explorers")],
    { providers: { getDeployerEvidence: async () => { calls += 1; return { creatorAddress: CREATOR, confidence: 80 }; } } }
  );
  assert.equal(calls, 1);
});

test("deployer recovery promotes exact Sourcify deployment evidence before explorer fallbacks", async () => {
  let blockscoutCalls = 0;
  const result = await executeActiveEvidenceProviderRequests(
    { chain: "bsc", tokenAddress: TOKEN },
    [request("creatorAddress", "Sourcify")],
    {
      providers: {
        getSourcifySecurityEvidence: async () => ({
          status: "EVIDENCE_AVAILABLE",
          chain: "bsc",
          address: TOKEN,
          creatorAddress: CREATOR,
          deploymentTransactionHash: `0x${"5".repeat(64)}`,
          creationBlockNumber: 123,
          confidence: 90,
        }),
        getBlockscoutDeployerEvidence: async () => {
          blockscoutCalls += 1;
          return {};
        },
      },
    }
  );
  assert.equal(blockscoutCalls, 0);
  assert.equal(
    result.observations.find((item) => item.field === "creatorAddress")?.value,
    CREATOR
  );
  assert.equal(
    result.observations.find((item) => item.field === "creatorAddress")?.source,
    "sourcify-v2"
  );
  assert.equal(
    result.observations.find((item) => item.field === "creationBlockNumber")?.value,
    123
  );
});

test("deployer recovery falls back to exact GoPlus creator evidence", async () => {
  const result = await executeActiveEvidenceProviderRequests(
    { chain: "base", tokenAddress: TOKEN },
    [request("creatorAddress", "security providers")],
    {
      providers: {
        getBlockscoutDeployerEvidence: async () => ({
          status: "UNKNOWN",
          chain: "base",
          address: TOKEN,
          creatorAddress: null,
        }),
        getGoPlusDeployerEvidence: async () => ({
          status: "EVIDENCE_AVAILABLE",
          chain: "base",
          address: TOKEN,
          creatorAddress: CREATOR,
          confidence: 78,
        }),
      },
    }
  );
  const creator = result.observations.find((item) => item.field === "creatorAddress");
  assert.equal(creator?.value, CREATOR);
  assert.equal(creator?.source, "goplus");
  assert.equal(creator?.verificationStatus, "VERIFIED_PROVIDER_OBSERVATION");
});

test("missing Etherscan credentials do not consume provider request budget", async () => {
  const state = createActiveEvidenceExecutionState({ maxProviderRequests: 10 });
  const result = await executeActiveEvidenceProviderRequests(
    { chain: "base", tokenAddress: TOKEN },
    [request("creatorAddress", "block explorers")],
    {
      env: {},
      providers: {
        getBlockscoutDeployerEvidence: async () => ({
          status: "UNKNOWN",
          chain: "base",
          address: TOKEN,
          creatorAddress: null,
        }),
      },
    },
    state
  );
  assert.equal(state.requestsUsed, 1);
  assert.equal(
    result.attempts.find((item) => item.provider === "etherscan-v2-deployer")?.status,
    "PROVIDER_UNAVAILABLE"
  );
});

test("deployer recovery reuses exact existing security evidence without a provider request", async () => {
  let calls = 0;
  const result = await executeActiveEvidenceProviderRequests(
    {
      chain: "bsc",
      tokenAddress: TOKEN,
      securityEvidence: [{
        provider: "goplus",
        status: "EVIDENCE_AVAILABLE",
        chain: "bsc",
        address: TOKEN,
        creatorAddress: CREATOR,
        confidence: 78,
        observedAt: "2026-08-12T00:00:00.000Z",
      }],
    },
    [request("creatorAddress", "security providers")],
    { providers: { getDeployerEvidence: async () => { calls += 1; return {}; } } }
  );
  assert.equal(calls, 0);
  assert.equal(result.observations.find((item) => item.field === "creatorAddress")?.value, CREATOR);
  assert.equal(result.observations.find((item) => item.field === "creatorAddress")?.source, "goplus");
});

test("deployer recovery rejects existing creator evidence for a different contract", async () => {
  const result = await executeActiveEvidenceProviderRequests(
    {
      chain: "base",
      tokenAddress: TOKEN,
      securityEvidence: [{
        provider: "goplus",
        status: "EVIDENCE_AVAILABLE",
        chain: "base",
        address: BUYER,
        creatorAddress: CREATOR,
      }],
    },
    [request("creatorAddress", "security providers")],
    {
      maxProviderRequests: 1,
      providers: { getDeployerEvidence: async () => ({ creatorAddress: null }) },
    }
  );
  assert.equal(result.observations.length, 0);
});

test("active recovery invokes the wallet provider path", async () => {
  let calls = 0;
  const result = await executeActiveEvidenceProviderRequests(
    { chain: "base", tokenAddress: TOKEN, poolAddress: POOL },
    [request("uniqueBuyers24h", "block explorers")],
    {
      providers: {
        getWalletEvidence: async () => {
          calls += 1;
          return { status: "EVIDENCE_AVAILABLE", uniqueBuyers24h: 3, observedAt: "2026-08-12T00:00:00.000Z", exactPoolIdentity: true, poolAddress: POOL };
        },
      },
    }
  );
  assert.equal(calls, 1);
  assert.equal(result.observations[0].value, 3);
});

test("derived fields are never sent to external providers", async () => {
  let calls = 0;
  const result = await executeActiveEvidenceProviderRequests(
    { chain: "base", tokenAddress: TOKEN },
    [request("utilityQualityScore", "DexScreener")],
    { providers: { getTokenPairs: async () => { calls += 1; return []; } } }
  );
  assert.equal(calls, 0);
  assert.deepEqual(result.attempts, []);
});

test("wave 2 only includes the configured top value-of-information candidates", () => {
  const candidates = Array.from({ length: 5 }, (_, index) => ({
    symbol: `W${index}`,
    valueOfInformationScore: index,
    targetedEnrichmentPlan: {
      items: [{ canonicalField: "uniqueBuyers24h", recoverable: true, valueOfInformationScore: index, targetSources: [{ source: "block explorers" }] }],
    },
  }));
  const result = buildActiveEvidenceRecoveryWaves(candidates, { wave2Max: 2 });
  assert.equal(result.waves.WAVE2.length, 2);
  assert.deepEqual(result.waves.WAVE2.map((item) => item.project.symbol), ["W4", "W3"]);
});

test("wave 3 only includes the configured top execution candidates", () => {
  const candidates = Array.from({ length: 5 }, (_, index) => ({
    symbol: `E${index}`,
    preliminaryOpportunityScore: index * 10,
    targetedEnrichmentPlan: {
      items: [{ canonicalField: "purchaseRouteConfirmed", recoverable: true, valueOfInformationScore: 1, targetSources: [{ source: "Jupiter" }] }],
    },
  }));
  const result = buildActiveEvidenceRecoveryWaves(candidates, { wave3Max: 2 });
  assert.equal(result.waves.WAVE3.length, 2);
  assert.deepEqual(result.waves.WAVE3.map((item) => item.project.symbol), ["E4", "E3"]);
});

test("provider request budget is enforced", async () => {
  let calls = 0;
  const state = createActiveEvidenceExecutionState({ maxProviderRequests: 1 });
  const options = { providers: { getTokenPairs: async () => { calls += 1; return []; } } };
  await executeActiveEvidenceProviderRequests({ chain: "base", tokenAddress: TOKEN }, [request("poolAddress", "DexScreener")], options, state);
  const second = await executeActiveEvidenceProviderRequests({ chain: "base", tokenAddress: TOKEN }, [request("poolAddress", "DexScreener")], options, state);
  assert.equal(calls, 1);
  assert.equal(second.attempts[0].status, "REQUEST_BUDGET_EXHAUSTED");
});

test("provider circuit breaker opens after repeated failures", async () => {
  const state = createActiveEvidenceExecutionState({ maxProviderRequests: 10, circuitFailureThreshold: 2 });
  const options = { providers: { getTokenPairs: async () => { throw new Error("provider down"); } } };
  await executeActiveEvidenceProviderRequests({ chain: "base", tokenAddress: TOKEN }, [request("poolAddress", "DexScreener")], options, state);
  await executeActiveEvidenceProviderRequests({ chain: "base", tokenAddress: TOKEN }, [request("poolAddress", "DexScreener")], options, state);
  const third = await executeActiveEvidenceProviderRequests({ chain: "base", tokenAddress: TOKEN }, [request("poolAddress", "DexScreener")], options, state);
  assert.equal(third.attempts[0].status, "CIRCUIT_OPEN");
});

test("provider circuit breakers are isolated by chain", async () => {
  const state = createActiveEvidenceExecutionState({
    maxProviderRequests: 20,
    circuitFailureThreshold: 1,
  });
  const options = {
    providers: {
      getDeployerEvidence: async (project) => {
        if (project.chain === "base") throw new Error("base explorer unavailable");
        return {
          chain: project.chain,
          address: project.tokenAddress,
          creatorAddress: CREATOR,
          confidence: 84,
        };
      },
      getEtherscanV2SecurityEvidence: async () => ({}),
    },
  };
  await executeActiveEvidenceProviderRequests(
    { chain: "base", tokenAddress: TOKEN },
    [request("creatorAddress", "block explorers")],
    options,
    state
  );
  const bsc = await executeActiveEvidenceProviderRequests(
    { chain: "bsc", tokenAddress: TOKEN },
    [request("creatorAddress", "block explorers")],
    options,
    state
  );
  assert.equal(
    bsc.observations.find((item) => item.field === "creatorAddress")?.value,
    CREATOR
  );
  assert.notEqual(bsc.attempts[0].status, "CIRCUIT_OPEN");
});

test("recovered evidence triggers only dependent engine reruns", () => {
  assert.equal(shouldRerunEngineForEvidenceFamilies("Wallet Cluster", ["WALLETS"]), true);
  assert.equal(shouldRerunEngineForEvidenceFamilies("Wallet Cluster", ["MARKET"]), false);
  assert.equal(shouldRerunEngineForEvidenceFamilies("Active Liquidity Truth", ["MARKET"]), true);
});

test("deferred candidates are excluded from recovery and starvation denominators", () => {
  const summary = summarizeEvidenceFunnel([
    { deepEvaluationState: "DEFERRED_BEFORE_DEEP", engineDataReadinessStatus: "CORE_DATA_STARVED" },
    { deepEvaluationState: "DEEP_EVALUATED", engineDataReadinessStatus: "CORE_READY", coreEvidenceCoveragePct: 90 },
  ]);
  assert.equal(summary.standardCandidates, 2);
  assert.equal(summary.deepDeferred, 1);
  assert.equal(summary.deepEvaluated, 1);
  assert.equal(summary.coreDataStarved, 0);
});

test("dashboard funnel cannot double-count deferred candidates as needing recovery", () => {
  const summary = summarizeEvidenceFunnel([
    { deepEvaluationState: "DEFERRED_BEFORE_DEEP", finalSelectionState: "INSUFFICIENT_DATA" },
    { deepEvaluationState: "DEFERRED_BEFORE_DEEP", finalSelectionState: "INSUFFICIENT_DATA" },
    { deepEvaluationState: "DEEP_EVALUATED", engineDataReadinessStatus: "CORE_DATA_STARVED" },
  ]);
  assert.equal(summary.deepDeferred, 2);
  assert.equal(summary.coreDataStarved, 1);
  assert.equal(summary.deepDeferred + summary.deepEvaluated, summary.standardCandidates);
});

test("dashboard never says no verified route when verified routes exist", () => {
  assert.equal(emptyExecutionLabel(3, 0), "NO FULLY QUALIFIED MOVE");
  assert.equal(emptyExecutionLabel(0, 0), "NO VERIFIED ROUTE");
});

test("unknown smart-wallet evidence cannot create a bullish score", () => {
  const result = analyzeSmartWallets({ symbol: "UNKNOWN" });
  assert.equal(result.smartWalletScore, null);
  assert.equal(result.smartWalletLevel, "unmeasured");
  assert.equal(result.smartWalletSignal, null);
});

test("ambiguous symbol-only identity remains rejected", async () => {
  const pair = (tokenAddress) => ({
    chainId: "base",
    pairAddress: tokenAddress === TOKEN ? POOL : CREATOR,
    baseToken: { address: tokenAddress, symbol: "SAME", name: "Same" },
    liquidity: { usd: 1000 },
  });
  const result = await executeActiveEvidenceProviderRequests(
    { symbol: "SAME", name: "Same" },
    [request("tokenAddress", "DexScreener")],
    { providers: { searchDexPairs: async () => [pair(TOKEN), pair(BUYER)] } }
  );
  assert.equal(result.observations.length, 0);
  assert.equal(result.attempts[0].status, "AMBIGUOUS_OR_NO_EXACT_MATCH");
});

test("Solana applicability does not require EVM deployer or tax semantics", () => {
  const project = { chain: "solana", tokenAddress: "So11111111111111111111111111111111111111112" };
  assert.equal(fieldApplicability(project, "deployerAddress", { id: "deployerReputation" }).status, "NOT_APPLICABLE");
  assert.equal(fieldApplicability(project, "buyTaxPct", { id: "instantSafetyGate" }).status, "NOT_APPLICABLE");
  assert.equal(fieldApplicability(project, "creator", { id: "deployerReputation" }).status, "NOT_APPLICABLE");
});

test("readiness summary excludes deferred candidates from all deep counters", () => {
  const summary = summarizeEngineDataReadiness([
    {
      deepEvaluationState: "DEEP_EVALUATED",
      engineDataReadiness: {},
      engineDataReadinessStatus: "CORE_READY",
      coreEvidenceCoveragePct: 90,
      advisoryEvidenceCoveragePct: 60,
    },
    {
      deepEvaluationState: "DEFERRED_BEFORE_DEEP",
    },
  ], { recomputeMissing: false });
  assert.equal(summary.deepEvaluatedCandidates, 1);
  assert.equal(summary.deferredBeforeDeepCandidates, 1);
  assert.equal(summary.statuses.UNKNOWN, undefined);
  assert.equal(summary.coreReady, 1);
});

test("healthy core evidence with no qualified token returns NO_EDGE_FOUND", () => {
  const health = buildScannerSemanticHealth([{
    deepEvaluationState: "DEEP_EVALUATED",
    engineDataReadinessStatus: "CORE_READY",
    coreEvidenceCoveragePct: 92,
    advisoryEvidenceCoveragePct: 50,
    finalSelectionState: "RESEARCH_ONLY",
  }]);
  assert.equal(health.status, "NO_EDGE_FOUND");
  assert.equal(health.coreDataStarved, 0);
  assert.equal(health.healthyCoreEvidence, true);
});

test("Blockscout wallet transfers become buys only with exact pool identity", () => {
  const transfer = {
    token: { address_hash: TOKEN, decimals: 0 },
    from: { hash: POOL },
    to: { hash: BUYER },
    value: "5",
    timestamp: "2026-08-12T00:00:00.000Z",
  };
  const exact = normalizeBlockscoutWalletEvidence(
    { transfers: { items: [transfer] } },
    { priceUsd: 2 },
    { tokenAddress: TOKEN, poolAddress: POOL, now: new Date("2026-08-12T01:00:00.000Z") }
  );
  const unknownPool = normalizeBlockscoutWalletEvidence(
    { transfers: { items: [transfer] } },
    { priceUsd: 2 },
    { tokenAddress: TOKEN, now: new Date("2026-08-12T01:00:00.000Z") }
  );
  assert.equal(exact.uniqueBuyers24h, 1);
  assert.equal(exact.buyVolumeUsd, 10);
  assert.equal(unknownPool.uniqueBuyers24h, null);
  assert.equal(unknownPool.walletTransactions[0].direction, "TRANSFER");
});
