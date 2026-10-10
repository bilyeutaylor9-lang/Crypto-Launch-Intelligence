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
import { getBlockscoutDeployerEvidence } from "../src/data/security/blockscoutConnector.js";

const TOKEN = "0x1111111111111111111111111111111111111111";
const POOL = "0x2222222222222222222222222222222222222222";
const CREATOR = "0x3333333333333333333333333333333333333333";
const BUYER = "0x4444444444444444444444444444444444444444";

test("exact persistent creator cache is reused before exhausted provider budgets", async (t) => {
  t.mock.method(globalThis, "fetch", () => { throw new Error("cached proof must not trigger HTTP"); });
  const state = createActiveEvidenceExecutionState({ maxProviderRequests: 1, timeBudgetMs: 0 });
  state.requestsUsed = 1;
  const result = await executeActiveEvidenceProviderRequests({ chain: "base", tokenAddress: TOKEN },
    [request("creatorAddress", "block explorers")], {
      readCachedSecurityEvidence: (source) => source === "goplus" ? {
        provider: "goplus", status: "EVIDENCE_AVAILABLE", responseIdentityVerified: true,
        chain: "base", address: TOKEN, creatorAddress: CREATOR,
        observedAt: new Date().toISOString(), confidence: 80,
      } : null,
    }, state);
  assert.equal(result.observations.find((item) => item.field === "creatorAddress")?.value, CREATOR);
  assert.equal(result.attempts[0].status, "LOCAL_EVIDENCE_AVAILABLE");
  assert.equal(state.requestsUsed, 1);
});

test("persistent creator cache cannot override exact identity or legacy proof rejection", async () => {
  for (const patch of [{ address: POOL }, { chain: "ethereum" }, { responseIdentityVerified: false }, { creatorAddress: `0x${"0".repeat(40)}` }]) {
    const result = await executeActiveEvidenceProviderRequests({ chain: "base", tokenAddress: TOKEN },
      [request("creatorAddress", "block explorers")], {
        timeBudgetMs: 0,
        readCachedSecurityEvidence: (source) => source === "goplus" ? {
          provider: "goplus", status: "EVIDENCE_AVAILABLE", responseIdentityVerified: true,
          chain: "base", address: TOKEN, creatorAddress: CREATOR, ...patch,
        } : null,
      });
    assert.equal(result.observations.length, 0);
    assert.ok(result.attempts.some((item) => item.status === "TIME_BUDGET_EXHAUSTED"));
  }
});

test("recovery deadline retains completed proof and reports unattempted evidence unknown", async () => {
  let now = 0;
  let calls = 0;
  const projects = [TOKEN, POOL].map((tokenAddress) => ({
    chain: "base", tokenAddress,
    targetedEnrichmentPlan: { items: [{ canonicalField: "creatorAddress", recoverable: true }] },
  }));
  const result = await analyzeActiveEvidenceRecoveryBatch(projects, {
    now: () => now, timeBudgetMs: 10, concurrency: 1,
    providers: { getDeployerEvidence: async (project) => {
      calls += 1;
      now = 11;
      return { chain: project.chain, address: project.tokenAddress, creatorAddress: CREATOR };
    } },
  });
  assert.equal(calls, 1);
  assert.equal(result[0].creatorAddress, CREATOR);
  assert.equal(result[1].creatorAddress, undefined);
  assert.ok(result[1].activeEvidenceRecovery.providerAttempts.some((item) => item.status === "TIME_BUDGET_EXHAUSTED"));
  assert.equal(result[1].activeEvidenceRecovery.batchSummary.timeBudgetExceeded, true);
  assert.ok(result[1].activeEvidenceRecovery.unrecoveredFields.includes("creatorAddress"));
  assert.equal(result[1].activeEvidenceRecovery.batchSummary.deepEvaluatedCandidates, 2);
});

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

function geckoPool({ tokenAddress = TOKEN, poolAddress = POOL } = {}) {
  return {
    data: {
      id: `base_${poolAddress}`,
      attributes: {
        address: poolAddress,
        name: "Gecko Recovery / USDC",
        base_token_price_usd: "0.42",
        reserve_in_usd: "240000",
        volume_usd: { h24: "81000" },
      },
      relationships: {
        network: { data: { id: "base" } },
        base_token: { data: { id: `base_${tokenAddress}` } },
        quote_token: { data: { id: `base_${BUYER}` } },
      },
    },
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

test("cheap exact GoPlus creator proof completes recovery within one request", async () => {
  const state = createActiveEvidenceExecutionState({ maxProviderRequests: 1 });
  const result = await executeActiveEvidenceProviderRequests(
    { chain: "bsc", tokenAddress: TOKEN },
    [request("creator", "security providers")],
    { providers: { getGoPlusDeployerEvidence: async () => ({
      chain: "bsc", address: TOKEN, creatorAddress: CREATOR,
      status: "EVIDENCE_AVAILABLE", provider: "goplus",
    }) } },
    state
  );
  assert.equal(result.observations.find((item) => item.field === "creator")?.value, CREATOR);
  assert.equal(state.requestsUsed, 1);
  assert.deepEqual(result.attempts.map((item) => item.provider), ["goplus-deployer"]);
});

test("GoPlus queue time does not consume the HTTP recovery timeout", async (t) => {
  t.mock.method(globalThis, "fetch", async () => ({ ok: true, json: async () => ({
    result: { [TOKEN]: { creator_address: CREATOR, is_open_source: "1" } },
  }) }));
  const state = createActiveEvidenceExecutionState({ maxProviderRequests: 2 });
  const results = await Promise.all([0, 1].map(() => executeActiveEvidenceProviderRequests(
    { chain: "bsc", tokenAddress: TOKEN }, [request("creator", "security providers")],
    { useCache: false, providerTimeoutMs: 250 }, state
  )));
  assert.equal(state.requestsUsed, 2);
  for (const result of results) {
    assert.equal(result.observations.find((item) => item.field === "creator")?.value, CREATOR);
    assert.equal(result.attempts[0].status, "SUCCESS");
  }
});

test("GoPlus queued requests recheck the shared budget before issuing HTTP calls", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls += 1;
    return { ok: true, json: async () => ({ result: { [TOKEN]: { creator_address: CREATOR } } }) };
  });
  const state = createActiveEvidenceExecutionState({ maxProviderRequests: 1 });
  const results = await Promise.all([0, 1].map(() => executeActiveEvidenceProviderRequests(
    { chain: "bsc", tokenAddress: TOKEN }, [request("creator", "security providers")],
    { useCache: false, providerTimeoutMs: 250 }, state
  )));
  assert.equal(calls, 1);
  assert.equal(state.requestsUsed, 1);
  assert.equal(results.filter((result) => result.attempts[0].status === "REQUEST_BUDGET_EXHAUSTED").length, 1);
});

test("Blockscout HTTP failures returned as UNKNOWN still open the provider circuit", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls += 1;
    return { ok: false, status: 403, statusText: "Forbidden" };
  });
  const state = createActiveEvidenceExecutionState({ maxProviderRequests: 10, circuitFailureThreshold: 1 });
  const options = { useCache: false, providers: { getDeployerEvidence: getBlockscoutDeployerEvidence } };
  const project = { chain: "base", tokenAddress: TOKEN };
  const first = await executeActiveEvidenceProviderRequests(project, [request("creator", "block explorers")], options, state);
  const second = await executeActiveEvidenceProviderRequests(project, [request("creator", "block explorers")], options, state);
  assert.equal(first.attempts[0].status, "FAILED");
  assert.equal(second.attempts[0].status, "CIRCUIT_OPEN");
  assert.equal(calls, 2);
  assert.equal(first.observations.length, 0);
  assert.equal(second.observations.length, 0);
});

test("healthy missing creator lookup does not open a provider circuit", async () => {
  const state = createActiveEvidenceExecutionState({ maxProviderRequests: 10, circuitFailureThreshold: 1 });
  const options = { providers: { getDeployerEvidence: async () => ({ status: "UNKNOWN", creatorAddress: null }) } };
  for (let i = 0; i < 2; i += 1) {
    const result = await executeActiveEvidenceProviderRequests(
      { chain: "base", tokenAddress: TOKEN }, [request("creator", "block explorers")], options, state
    );
    assert.equal(result.attempts[0].status, "SUCCESS");
    assert.equal(result.observations.length, 0);
  }
});

test("temporary GoPlus rate limits do not permanently open the creator circuit", async () => {
  const state = createActiveEvidenceExecutionState({ maxProviderRequests: 10, circuitFailureThreshold: 1 });
  const options = { providers: {
    getDeployerEvidence: async () => ({}),
    getGoPlusDeployerEvidence: async () => ({ status: "UNKNOWN", providerFailure: true, rateLimited: true, warnings: ["quota reached"] }),
  } };
  for (let i = 0; i < 2; i += 1) {
    const result = await executeActiveEvidenceProviderRequests(
      { chain: "base", tokenAddress: TOKEN }, [request("creator", "security providers")], options, state
    );
    assert.equal(result.attempts.find((attempt) => attempt.provider === "goplus-deployer")?.status, "RATE_LIMITED");
    assert.equal(result.observations.length, 0);
  }
  assert.equal(state.providers.get("goplus-deployer:base").circuitOpen, false);
});

test("Blockscout contract-not-found responses preserve a healthy provider circuit", async (t) => {
  t.mock.method(globalThis, "fetch", async () => ({ ok: false, status: 404, statusText: "Not Found" }));
  const state = createActiveEvidenceExecutionState({ maxProviderRequests: 10, circuitFailureThreshold: 1 });
  for (let i = 0; i < 2; i += 1) {
    const result = await executeActiveEvidenceProviderRequests(
      { chain: "base", tokenAddress: TOKEN }, [request("creator", "block explorers")],
      { useCache: false, providers: { getDeployerEvidence: getBlockscoutDeployerEvidence } }, state
    );
    assert.equal(result.attempts[0].status, "SUCCESS");
    assert.equal(result.observations.length, 0);
  }
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
        responseIdentityVerified: true,
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

test("deployer recovery reuses exact cached Sourcify and Etherscan creator evidence", async () => {
  for (const [field, provider] of [
    ["sourcifyDeployerEvidence", "sourcify-v2"],
    ["etherscanDeployerEvidence", "etherscan-v2"],
  ]) {
    let calls = 0;
    const result = await executeActiveEvidenceProviderRequests(
      {
        chain: "base",
        tokenAddress: TOKEN,
        [field]: {
          provider,
          status: "EVIDENCE_AVAILABLE",
          chain: "base",
          address: TOKEN,
          creatorAddress: CREATOR,
          observedAt: "2026-08-12T00:00:00.000Z",
        },
      },
      [request("creatorAddress", "block explorers")],
      { providers: { getDeployerEvidence: async () => { calls += 1; return {}; } } }
    );
    assert.equal(calls, 0);
    assert.equal(result.observations.find((item) => item.field === "creatorAddress")?.value, CREATOR);
    assert.equal(result.observations.find((item) => item.field === "creatorAddress")?.source, provider);
  }
});

test("deployer recovery does not reuse cached creator without exact identity", async () => {
  for (const cached of [
    { chain: "base", address: BUYER },
    { chain: "ethereum", address: TOKEN },
    { chain: null, address: TOKEN },
  ]) {
    const result = await executeActiveEvidenceProviderRequests(
      {
        chain: "base",
        tokenAddress: TOKEN,
        sourcifyDeployerEvidence: {
          provider: "sourcify-v2",
          status: "EVIDENCE_AVAILABLE",
          creatorAddress: CREATOR,
          ...cached,
        },
      },
      [request("creatorAddress", "block explorers")],
      {
        maxProviderRequests: 1,
        providers: { getDeployerEvidence: async () => ({ creatorAddress: null }) },
      }
    );
    assert.equal(result.observations.length, 0);
  }
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

test("creator and security recovery share one exact GoPlus observation", async () => {
  let creatorCalls = 0;
  let securityCalls = 0;
  const state = createActiveEvidenceExecutionState({ maxProviderRequests: 1 });
  const result = await executeActiveEvidenceProviderRequests(
    { chain: "bsc", tokenAddress: TOKEN },
    [request("creator", "security providers"), request("honeypotDetected", "GoPlus")],
    { providers: {
      getGoPlusDeployerEvidence: async () => {
        creatorCalls += 1;
        return { provider: "goplus", status: "EVIDENCE_AVAILABLE", responseIdentityVerified: true,
          chain: "bsc", address: TOKEN, creatorAddress: CREATOR, honeypot: false,
          raw: { is_honeypot: "0" }, confidence: 78 };
      },
      getFreeSecurityEvidence: async () => { securityCalls += 1; return {}; },
    } }, state
  );
  assert.equal(creatorCalls, 1);
  assert.equal(securityCalls, 0);
  assert.equal(state.requestsUsed, 1);
  assert.equal(result.observations.find((item) => item.field === "honeypotDetected")?.value, false);
  assert.equal(result.observations.find((item) => item.field === "honeypotDetected")?.tokenAddress, TOKEN);
  assert.deepEqual(result.projectPatch.securityEvidenceSummary.knownProviders, ["goplus"]);
  assert.ok(result.projectPatch.securityEvidenceSummary.unknownChecks.includes("goplus.is_mintable"));
});

test("creator-only recovery forwards actual companion safety proof without another provider request", async () => {
  const state = createActiveEvidenceExecutionState({ maxProviderRequests: 1 });
  const result = await executeActiveEvidenceProviderRequests(
    { chain: "base", tokenAddress: TOKEN }, [request("creator", "security providers")],
    { providers: { getGoPlusDeployerEvidence: async () => ({ provider: "goplus",
      status: "EVIDENCE_AVAILABLE", responseIdentityVerified: true, chain: "base", address: TOKEN,
      creatorAddress: CREATOR, honeypot: false, raw: { is_honeypot: "0" } }) } }, state
  );
  assert.equal(state.requestsUsed, 1);
  assert.equal(result.observations.find((item) => item.field === "honeypotDetected")?.value, false);
  assert.ok(result.projectPatch.securityEvidenceSummary.unknownChecks.length > 0);
});

test("an absent GoPlus safety flag cannot be recovered as a clean negative", async () => {
  const result = await executeActiveEvidenceProviderRequests(
    { chain: "bsc", tokenAddress: TOKEN },
    [request("creator", "security providers"), request("honeypotDetected", "GoPlus")],
    { maxProviderRequests: 1, providers: {
      getGoPlusDeployerEvidence: async () => ({ provider: "goplus", status: "EVIDENCE_AVAILABLE",
        responseIdentityVerified: true, chain: "bsc", address: TOKEN,
        creatorAddress: CREATOR, honeypot: false, raw: { is_open_source: "1" } }),
      getFreeSecurityEvidence: async () => { throw new Error("No budget should remain"); },
    } }
  );
  assert.equal(result.observations.some((item) => item.field === "honeypotDetected"), false);
});

test("legacy GoPlus creator caches without response identity proof are refreshed", async () => {
  const result = await executeActiveEvidenceProviderRequests(
    { chain: "base", tokenAddress: TOKEN, goplusDeployerEvidence: {
      provider: "goplus", status: "EVIDENCE_AVAILABLE", chain: "base", address: TOKEN, creatorAddress: CREATOR,
    } },
    [request("creator", "block explorers")],
    { maxProviderRequests: 1, providers: { getDeployerEvidence: async () => ({ creatorAddress: null }) } }
  );
  assert.equal(result.observations.length, 0);
  assert.notEqual(result.attempts[0].status, "LOCAL_EVIDENCE_AVAILABLE");
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

test("GeckoTerminal recovers only exact-pool market evidence after DexScreener has no match", async () => {
  let dexCalls = 0;
  let geckoCalls = 0;
  const result = await executeActiveEvidenceProviderRequests(
    { chain: "base", tokenAddress: TOKEN, poolAddress: POOL },
    [
      request("priceUsd", "DexScreener"),
      request("liquidityUsd", "GeckoTerminal"),
      request("volume24hUsd", "GeckoTerminal"),
    ],
    {
      providers: {
        getTokenPairs: async () => {
          dexCalls += 1;
          return [];
        },
        getGeckoPoolByAddress: async (chain, poolAddress, options) => {
          geckoCalls += 1;
          assert.equal(chain, "base");
          assert.equal(poolAddress, POOL);
          assert.equal(options.maxAttempts, 1);
          return geckoPool();
        },
      },
    },
  );

  assert.equal(dexCalls, 1);
  assert.equal(geckoCalls, 1);
  assert.equal(result.observations.find((item) => item.field === "priceUsd")?.value, 0.42);
  assert.equal(result.observations.find((item) => item.field === "liquidityUsd")?.value, 240000);
  assert.equal(result.observations.find((item) => item.field === "volume24hUsd")?.value, 81000);
  assert.equal(result.observations.find((item) => item.field === "priceUsd")?.source, "geckoterminal");
  assert.equal(result.observations.find((item) => item.field === "priceUsd")?.identityMatchMode, "exact-pool");
  assert.equal(result.observations.find((item) => item.field === "priceUsd")?.marketEvidenceOnly, true);
  assert.equal(result.observations.some((item) => item.field === "stableExitLiquidityUsd"), false);
});

test("GeckoTerminal rejects a base-token or pool mismatch", async () => {
  const result = await executeActiveEvidenceProviderRequests(
    { chain: "base", tokenAddress: TOKEN, poolAddress: POOL },
    [request("priceUsd", "GeckoTerminal")],
    {
      providers: {
        getGeckoPoolByAddress: async () => geckoPool({ tokenAddress: BUYER }),
      },
    },
  );

  assert.equal(result.observations.length, 0);
  assert.equal(result.attempts[0]?.status, "NO_EXACT_POOL_MATCH");
});

test("GeckoTerminal is not called when DexScreener returns exact requested market fields", async () => {
  let geckoCalls = 0;
  const result = await executeActiveEvidenceProviderRequests(
    { chain: "base", tokenAddress: TOKEN, poolAddress: POOL },
    [
      request("priceUsd", "DexScreener"),
      request("liquidityUsd", "GeckoTerminal"),
      request("volume24hUsd", "GeckoTerminal"),
    ],
    {
      providers: {
        getTokenPairs: async () => [{
          chainId: "base",
          pairAddress: POOL,
          baseToken: { address: TOKEN, symbol: "GEO", name: "Gecko Recovery" },
          quoteToken: { address: BUYER, symbol: "USDC" },
          liquidity: { usd: 240000 },
          volume: { h24: 81000 },
          priceUsd: "0.42",
        }],
        getGeckoPoolByAddress: async () => {
          geckoCalls += 1;
          return geckoPool();
        },
      },
    },
  );

  assert.equal(geckoCalls, 0);
  assert.equal(result.observations.find((item) => item.field === "priceUsd")?.source, "dexscreener");
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

test("wave 1 prioritizes recoverable core blockers over advisory value of information", () => {
  const candidates = [
    {
      symbol: "ADVISORY_HIGH_VOI",
      valueOfInformationScore: 100,
      targetedEnrichmentPlan: {
        items: [{ canonicalField: "priceUsd", recoverable: true, valueOfInformationScore: 100, targetSources: [{ source: "DexScreener" }] }],
      },
    },
    {
      symbol: "CORE_DEPLOYER_GAP",
      coreDataStarved: true,
      dataStarvationBlockingResearchCount: 1,
      targetedEnrichmentPlan: {
        items: [{ canonicalField: "deployer", recoverable: true, valueOfInformationScore: 0.1, targetSources: [{ source: "block explorers" }] }],
      },
    },
  ];

  const result = buildActiveEvidenceRecoveryWaves(candidates, { wave1Max: 1 });
  assert.deepEqual(result.waves.WAVE1.map((item) => item.project.symbol), ["CORE_DEPLOYER_GAP"]);
});

test("candidate field limits preserve core creator recovery ahead of advisory market fields", () => {
  const result = buildActiveEvidenceRecoveryWaves([{
    chain: "base", tokenAddress: TOKEN,
    targetedEnrichmentPlan: { items: [
      { canonicalField: "priceUsd", recoverable: true, evidenceClass: "ADVISORY", valueOfInformationScore: 99 },
      { canonicalField: "creator", recoverable: true, evidenceClass: "CORE", valueOfInformationScore: 0.1 },
    ] },
  }], { maxFieldsPerCandidate: 1 });
  assert.deepEqual(result.waves.WAVE1[0].entries.map((entry) => entry.field), ["creator"]);
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
