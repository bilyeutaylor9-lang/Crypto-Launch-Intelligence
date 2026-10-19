import test from "node:test";
import assert from "node:assert/strict";
import {
  createActiveEvidenceExecutionState,
  executeActiveEvidenceProviderRequests,
  recoverDeployerEvidence,
  recoverExecutionEvidence,
} from "../src/data/activeEvidenceProviderExecutor.js";

const NOW = Date.parse("2026-10-18T12:00:00Z");
const TOKEN = `0x${"1".repeat(40)}`;
const CREATOR = `0x${"2".repeat(40)}`;
const TX = `0x${"a".repeat(64)}`;
const SOL = "So11111111111111111111111111111111111111112";
const MINT = "So11111111111111111111111111111111111111113";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const POOL = "11111111111111111111111111111111";
const OTHER_POOL = "So11111111111111111111111111111111111111114";

test.beforeEach((t) => {
  let networkCalls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    networkCalls++;
    throw new Error("Network forbidden in acquisition regressions");
  });
  t.after(() => assert.equal(networkCalls, 0));
});

function creatorEvidence(overrides = {}) {
  return { provider: "goplus", status: "EVIDENCE_AVAILABLE", responseIdentityVerified: true,
    chain: "base", address: TOKEN, creatorAddress: CREATOR, confidence: 80,
    observedAt: new Date(NOW - 60_000).toISOString(),
    provenance: { source: "stored-creator", blockNumber: 12 }, ...overrides };
}

function deployerProviders(overrides = {}) {
  return { preferGoPlusDeployer: true, defaultGoPlusDeployerProvider: false,
    useGoPlusDeployerFallback: true, useSourcifyDeployerFallback: true,
    getGoPlusDeployerEvidence: async () => assert.fail("Creator-only lookup cannot fill deployment metadata"),
    getSourcifyDeployerEvidence: async () => creatorEvidence({ provider: "sourcify-v2",
      deploymentTransactionHash: TX, observedAt: new Date(NOW).toISOString() }),
    getBlockscoutDeployerEvidence: async () => assert.fail("Resolved deployment needs no further lookup"),
    ...overrides };
}

test("creator-only local evidence does not suppress missing deployment acquisition or replace its provenance", async () => {
  const existing = creatorEvidence();
  const project = { chain: "base", tokenAddress: TOKEN, securityEvidence: [existing] };
  const original = structuredClone(project);
  const state = createActiveEvidenceExecutionState({ maxRequests: 1 });
  let calls = 0;
  const result = await recoverDeployerEvidence(project, ["creatorAddress", "deploymentTransactionHash"],
    deployerProviders({ getSourcifyDeployerEvidence: async () => {
      calls++;
      return creatorEvidence({ provider: "sourcify-v2", deploymentTransactionHash: TX,
        observedAt: new Date(NOW).toISOString(), confidence: 95 });
    } }), { useCache: false, env: {} }, state);
  assert.equal(calls, 1);
  assert.equal(state.requestsUsed, 1);
  const creator = result.observations.find((item) => item.field === "creatorAddress");
  assert.equal(creator.value, CREATOR);
  assert.equal(creator.source, "goplus");
  assert.equal(creator.sourceTimestamp, existing.observedAt);
  assert.deepEqual(creator.sourceProvenance, existing.provenance);
  assert.equal(result.observations.find((item) => item.field === "deploymentTransactionHash")?.value, TX);
  assert.equal(result.observations.find((item) => item.field === "deploymentTransactionHash")?.source, "sourcify-v2");
  assert.equal(result.projectPatch.goplusDeployerEvidence, existing);
  assert.deepEqual(project, original);
});

test("all exact local envelopes are merged before any supported unresolved lookup", async () => {
  const state = createActiveEvidenceExecutionState({ maxRequests: 0 });
  const result = await recoverDeployerEvidence({ chain: "base", tokenAddress: TOKEN,
    securityEvidence: [creatorEvidence(), creatorEvidence({ provider: "sourcify-v2", deploymentTransactionHash: TX })] },
  ["deploymentTransactionHash"], deployerProviders(), { useCache: false, env: {} }, state);
  assert.equal(result.observations.find((item) => item.field === "deploymentTransactionHash")?.value, TX);
  assert.equal(state.requestsUsed, 0);
  assert.ok(result.attempts.every((item) => item.status === "LOCAL_EVIDENCE_AVAILABLE"));
});

test("partial live creator results continue through budgeted metadata providers", async () => {
  const state = createActiveEvidenceExecutionState({ maxRequests: 2 });
  const calls = [];
  const result = await recoverDeployerEvidence({ chain: "base", tokenAddress: TOKEN },
    ["creatorAddress", "deploymentTransactionHash"], deployerProviders({
      getGoPlusDeployerEvidence: async () => { calls.push("goplus"); return creatorEvidence(); },
      getSourcifyDeployerEvidence: async () => { calls.push("sourcify"); return creatorEvidence({
        provider: "sourcify-v2", deploymentTransactionHash: TX }); },
    }), { useCache: false, env: {} }, state);
  assert.deepEqual(calls, ["goplus", "sourcify"]);
  assert.equal(state.requestsUsed, 2);
  assert.equal(result.observations.find((item) => item.field === "deploymentTransactionHash")?.value, TX);
  assert.equal(result.observations.find((item) => item.field === "creatorAddress")?.source, "goplus");
});

test("creator-only local proof survives exhausted metadata budgets without inventing deployment history", async () => {
  for (const limits of [{ maxRequests: 0 }, { maxRequests: 3, timeBudgetMs: 0 }]) {
    const state = createActiveEvidenceExecutionState(limits);
    const result = await recoverDeployerEvidence({ chain: "base", tokenAddress: TOKEN,
      securityEvidence: [creatorEvidence()] }, ["deploymentTransactionHash", "priorDeployments"],
    deployerProviders(), { useCache: false, env: {} }, state);
    assert.equal(state.requestsUsed, 0);
    assert.equal(result.observations.find((item) => item.field === "creatorAddress")?.value, CREATOR);
    for (const field of ["deploymentTransactionHash", "priorDeployments", "deployerHistory", "walletAgeDays"]) {
      assert.equal(result.observations.some((item) => item.field === field), false);
    }
    assert.ok(result.attempts.some((item) => ["REQUEST_BUDGET_EXHAUSTED", "TIME_BUDGET_EXHAUSTED"].includes(item.status)));
  }
});

test("history-only gaps do not spend explorer calls that cannot supply history", async () => {
  const state = createActiveEvidenceExecutionState({ maxRequests: 10 });
  const result = await recoverDeployerEvidence({ chain: "base", tokenAddress: TOKEN },
    ["priorDeployments", "walletAgeDays", "deployerHistory"], deployerProviders(),
    { useCache: false, env: {} }, state);
  assert.equal(state.requestsUsed, 0);
  assert.deepEqual(result.observations, []);
});

test("known creator proof plus unsupported history gaps never triggers additional provider calls", async () => {
  for (const field of ["priorDeployments", "walletAgeDays", "deployerHistory"]) {
    const state = createActiveEvidenceExecutionState({ maxRequests: 10 });
    const result = await recoverDeployerEvidence({ chain: "base", tokenAddress: TOKEN,
      securityEvidence: [creatorEvidence()] }, ["creatorAddress", field], deployerProviders(),
    { useCache: false, env: {} }, state);
    assert.equal(state.requestsUsed, 0);
    assert.equal(result.observations.find((item) => item.field === "creatorAddress")?.value, CREATOR);
    assert.equal(result.observations.some((item) => item.field === field), false);
    assert.ok(result.attempts.every((item) => item.status === "LOCAL_EVIDENCE_AVAILABLE"));
  }
});

test("wrong-contract metadata cannot supplement exact stored creator proof", async () => {
  const state = createActiveEvidenceExecutionState({ maxRequests: 1 });
  const result = await recoverDeployerEvidence({ chain: "base", tokenAddress: TOKEN,
    securityEvidence: [creatorEvidence()] }, ["deploymentTransactionHash"], deployerProviders({
      getSourcifyDeployerEvidence: async () => creatorEvidence({ provider: "sourcify-v2",
        address: CREATOR, deploymentTransactionHash: TX }),
    }), { useCache: false, env: {} }, state);
  assert.equal(state.requestsUsed, 1);
  assert.equal(result.observations.some((item) => item.field === "deploymentTransactionHash"), false);
});

test("public acquisition dispatch supplements creator evidence with raw transaction proof only", async () => {
  const result = await executeActiveEvidenceProviderRequests({ chain: "base", tokenAddress: TOKEN,
    securityEvidence: [creatorEvidence({ provider: "blockscout" })] }, [{ field: "deploymentTransactionHash" }], {
    useCache: false, env: {}, maxRequests: 1,
    providers: { getBlockscoutDeployerEvidence: async () => creatorEvidence({ provider: "blockscout",
      deploymentTransactionHash: TX }) },
  });
  assert.equal(result.observations.find((item) => item.field === "deploymentTransactionHash")?.value, TX);
  for (const field of ["priorDeployments", "deployerHistory", "walletAgeDays", "liveExecutionReady"]) {
    assert.equal(result.observations.some((item) => item.field === field), false);
  }
});

test("a known partial provider envelope is refreshed rather than replayed from its creator-only cache", async () => {
  let calls = 0;
  const state = createActiveEvidenceExecutionState({ maxRequests: 1 });
  const existing = creatorEvidence({ provider: "blockscout-deployer" });
  const result = await recoverDeployerEvidence({ chain: "base", tokenAddress: TOKEN,
    blockscoutDeployerEvidence: existing }, ["deploymentTransactionHash"], deployerProviders({
      preferGoPlusDeployer: false, useGoPlusDeployerFallback: false, useSourcifyDeployerFallback: false,
      blockscoutDeployerRequestCost: 1,
      getBlockscoutDeployerEvidence: async (_project, options) => {
        calls++;
        return options.useCache === false ? { ...existing, deploymentTransactionHash: TX } : existing;
      },
    }), { env: {}, useCache: true }, state);
  assert.equal(calls, 1);
  assert.equal(result.observations.find((item) => item.field === "deploymentTransactionHash")?.value, TX);
  assert.equal(result.observations.find((item) => item.field === "creatorAddress")?.sourceTimestamp, existing.observedAt);
  assert.equal(state.requestsUsed, 1);
});

test("timestamp-only gaps skip creator-only and transaction-only providers", async () => {
  const state = createActiveEvidenceExecutionState({ maxRequests: 2 });
  const timestamp = "2026-01-01T00:00:00Z";
  const result = await recoverDeployerEvidence({ chain: "base", tokenAddress: TOKEN },
    ["contractCreationTimestamp"], deployerProviders({
      getSourcifyDeployerEvidence: async () => assert.fail("Sourcify cannot supply deployment timestamps"),
      getBlockscoutDeployerEvidence: async () => creatorEvidence({ provider: "blockscout", contractCreationTimestamp: timestamp }),
    }), { useCache: false, env: {} }, state);
  assert.equal(state.requestsUsed, 2);
  assert.equal(result.observations.find((item) => item.field === "contractCreationTimestamp")?.value, timestamp);
  assert.deepEqual(result.attempts.map((item) => item.provider), ["blockscout-deployer"]);
});

test("metadata recovery continues through partial explorers and retains failed-provider diagnostics", async () => {
  const state = createActiveEvidenceExecutionState({ maxRequests: 6 });
  const result = await recoverDeployerEvidence({ chain: "base", tokenAddress: TOKEN,
    securityEvidence: [creatorEvidence()] }, ["deploymentTransactionHash"], deployerProviders({
      getSourcifyDeployerEvidence: async () => { throw new Error("explorer unavailable"); },
      getBlockscoutDeployerEvidence: async () => creatorEvidence({ provider: "blockscout" }),
      customEtherscanDeployerProvider: true,
      getEtherscanV2SecurityEvidence: async () => creatorEvidence({ provider: "etherscan-v2", creationTxHash: TX }),
    }), { useCache: false, env: {} }, state);
  assert.equal(state.requestsUsed, 6);
  assert.deepEqual(result.attempts.map((item) => item.status), ["LOCAL_EVIDENCE_AVAILABLE", "FAILED", "SUCCESS", "SUCCESS"]);
  assert.match(result.attempts[1].reason, /explorer unavailable/);
  assert.equal(result.observations.find((item) => item.field === "deploymentTransactionHash")?.source, "etherscan-v2");
  assert.equal(result.observations.find((item) => item.field === "creatorAddress")?.source, "goplus");
});

test("exact transaction-only metadata supplements creator proof without requiring another creator claim", async () => {
  const state = createActiveEvidenceExecutionState({ maxRequests: 1 });
  const result = await recoverDeployerEvidence({ chain: "base", tokenAddress: TOKEN,
    securityEvidence: [creatorEvidence()] }, ["deploymentTransactionHash"], deployerProviders({
      getSourcifyDeployerEvidence: async () => ({ provider: "sourcify-v2", status: "EVIDENCE_AVAILABLE",
        chain: "base", address: TOKEN, deploymentTransactionHash: TX, observedAt: new Date(NOW).toISOString() }),
    }), { useCache: false, env: {} }, state);
  assert.equal(state.requestsUsed, 1);
  assert.equal(result.observations.find((item) => item.field === "deploymentTransactionHash")?.value, TX);
  assert.equal(result.observations.find((item) => item.field === "creatorAddress")?.source, "goplus");
});

test("transaction-only metadata cannot imply a creator or omit its exact contract binding", async () => {
  for (const binding of [{ chain: "base", address: TOKEN }, { chain: "base" }, { address: TOKEN },
    { chain: "ethereum", address: TOKEN }, { chain: "base", address: CREATOR }]) {
    const state = createActiveEvidenceExecutionState({ maxRequests: 1 });
    const result = await recoverDeployerEvidence({ chain: "base", tokenAddress: TOKEN },
      ["deploymentTransactionHash"], deployerProviders({
        getSourcifyDeployerEvidence: async () => ({ ...binding, deploymentTransactionHash: TX }),
      }), { useCache: false, env: {} }, state);
    assert.equal(result.observations.some((item) => item.field === "deploymentTransactionHash"), binding.chain === "base" && binding.address === TOKEN);
    for (const field of ["creatorAddress", "creator", "deployer", "deployerHistory", "priorDeployments", "walletAgeDays"]) {
      assert.equal(result.observations.some((item) => item.field === field), false);
    }
  }
});

function solanaProject() {
  return { chain: "solana", tokenAddress: MINT, contractAddress: MINT, poolAddress: POOL,
    priceUsd: 0.01, liquidityUsd: 200_000, identityVerified: true,
    contractVerified: true, instantSafetyStatus: "PASS", liveExecutionReady: false };
}

function solanaOptions(mutate = () => {}, maxRequests = 3) {
  const calls = [];
  return { calls, now: () => NOW, useCache: false, maxRequests, providerTimeoutMs: 500,
    executionRecovery: { enabled: true, env: {}, lifiEnabled: false, raydiumEnabled: false,
      zeroxApiKey: "", jupiterApiKey: "offline-fixture", tradeSizesUsd: [25],
      fetchJson: async (url, init) => {
        assert.equal(init.adapter, "jupiter");
        const params = new URL(url).searchParams;
        const buy = params.get("inputMint") !== MINT;
        calls.push({ from: params.get("inputMint"), to: params.get("outputMint"), amount: params.get("amount") });
        if (params.get("inputMint") === USDC) return { outAmount: "0", routePlan: [],
          untrustedProof: { poolAddress: POOL, buyQuoteVerified: true, sellQuoteVerified: true } };
        const quote = { inputMint: params.get("inputMint"), outputMint: params.get("outputMint"),
          inAmount: params.get("amount"), outAmount: buy ? "1000000000" : "99000000",
          priceImpactPct: buy ? "0.2" : "0.3", routePlan: [{ swapInfo: { ammKey: POOL } }] };
        mutate(quote, buy);
        return quote;
      } },
  };
}

test("absent Jupiter credentials cannot dispatch quote requests or publish route proof", async () => {
  const options = solanaOptions();
  options.executionRecovery.jupiterApiKey = "";
  const state = createActiveEvidenceExecutionState(options);
  const result = await recoverExecutionEvidence(solanaProject(), ["purchaseRouteConfirmed"], {}, options, state);
  assert.equal(options.calls.length, 0);
  assert.equal(state.requestsUsed, 0);
  assert.deepEqual(result.observations, []);
  assert.deepEqual(result.projectPatch, {});
  assert.ok(result.executionAdapterResults.some((item) => item.adapter === "jupiter" &&
    item.status === "OPTIONAL_KEY_MISSING" && item.missingKey === "JUPITER_API_KEY"));
});

test("Jupiter SOL pair survives an earlier USDC no-quote without losing measured cost", async () => {
  const options = solanaOptions();
  const state = createActiveEvidenceExecutionState(options);
  const project = solanaProject();
  const result = await recoverExecutionEvidence(project, ["purchaseRouteConfirmed", "slippagePct"], {}, options, state);
  assert.deepEqual(options.calls.map((item) => item.from), [USDC, SOL, MINT]);
  assert.equal(options.calls[2].amount, "950000000");
  assert.equal(state.requestsUsed, 3);
  const route = result.projectPatch.executionProofRecoveryRoute;
  assert.equal(route?.exactIdentityVerified, true);
  assert.equal(route.quoteTokenAddress, SOL);
  assert.equal(route.poolAddress, POOL);
  assert.equal(route.slippagePct, 0.5);
  assert.equal(route.priceImpactPct, 0.5);
  assert.equal(result.observations.find((item) => item.field === "purchaseRouteConfirmed")?.value, true);
  assert.equal(result.observations.find((item) => item.field === "slippagePct")?.value, 0.5);
  assert.equal(project.liveExecutionReady, false);
  assert.equal(route.liveExecutionReady, undefined);
});

for (const side of ["BUY", "SELL"]) {
  for (const [name, mutate] of [
    ["wrong input mint", (quote) => { quote.inputMint = USDC; }],
    ["wrong output mint", (quote) => { quote.outputMint = USDC; }],
    ["wrong amount", (quote) => { quote.inAmount = "1"; }],
    ["different pool", (quote) => { quote.routePlan[0].swapInfo.ammKey = OTHER_POOL; }],
    ["unattested pool", (quote) => { quote.routePlan = [{ swapInfo: {} }]; }],
  ]) {
    test(`earlier no-quote cannot lend proof to SOL ${side} with ${name}`, async () => {
      const options = solanaOptions((quote, buy) => { if (buy === (side === "BUY")) mutate(quote); });
      const result = await recoverExecutionEvidence(solanaProject(), ["purchaseRouteConfirmed"], {}, options);
      assert.deepEqual(result.observations, []);
      assert.deepEqual(result.projectPatch, {});
      assert.equal(result.executionAdapterResults.some((item) => item.status === "ROUTE_RECOVERED"), false);
    });
  }
}

test("Jupiter fallback cannot publish partial or unmeasured selected-pair proof", async () => {
  for (const maxRequests of [0, 1, 2]) {
    const options = solanaOptions(undefined, maxRequests);
    const state = createActiveEvidenceExecutionState(options);
    const result = await recoverExecutionEvidence(solanaProject(), ["purchaseRouteConfirmed"], {}, options, state);
    assert.deepEqual(result.observations, []);
    assert.equal(state.requestsUsed, maxRequests);
    assert.equal(options.calls.length, maxRequests);
  }
  const options = solanaOptions((quote, buy) => { if (!buy) delete quote.priceImpactPct; });
  const result = await recoverExecutionEvidence(solanaProject(), ["purchaseRouteConfirmed", "slippagePct"], {}, options);
  assert.equal(result.projectPatch.executionProofRecoveryRoute?.exactIdentityVerified, true);
  assert.equal(result.observations.some((item) => item.field === "slippagePct"), false);
});
