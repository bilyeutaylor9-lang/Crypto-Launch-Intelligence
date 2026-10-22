import test from "node:test";
import assert from "node:assert/strict";
import { createActiveEvidenceExecutionState, executeActiveEvidenceProviderRequests } from "../src/data/activeEvidenceProviderExecutor.js";
import { analyzeDataStarvationRootCause } from "../src/engines/dataStarvationRootCauseEngine.js";

const TOKEN = "0x1111111111111111111111111111111111111111";
const PROJECT = { chain: "base", tokenAddress: TOKEN };
const FIELDS = ["holderAddresses", "contractVerified"];

function analyze(attempts, fields = FIELDS, project = {}) {
  const contracts = fields.map(field => ({ id: `test_${field}`, phase: "test", affectsFinalDecision: true,
    canBlockCandidate: true, inputContract: { requiredAny: [[field]] } }));
  return analyzeDataStarvationRootCause({ ...PROJECT, ...project, activeEvidenceRecovery: {
    attemptedFields: fields, providerAttempts: attempts,
    ...project.activeEvidenceRecovery,
  } }, { contracts, disableSemanticScan: true });
}

function statuses(project) {
  return Object.fromEntries(project.dataStarvationMissingEvidence.map(item => [item.canonicalField, item.providerStatus]));
}

test.beforeEach(t => {
  let networkCalls = 0;
  t.mock.method(globalThis, "fetch", async () => { networkCalls++; throw new Error("Network forbidden in attribution regressions"); });
  t.after(() => assert.equal(networkCalls, 0));
});

async function executeMixed(circuitFamily) {
  const state = createActiveEvidenceExecutionState({ maxRequests: 10 });
  const provider = circuitFamily === "WALLETS" ? "blockscout-wallets" : "free-security";
  state.providers.set(`${provider}:base`, { provider, circuitScope: "base", attempts: 0, successes: 0,
    failures: 3, skipped: 0, circuitOpen: true, lastError: `${circuitFamily} circuit only` });
  const calls = { wallet: 0, security: 0 };
  const result = await executeActiveEvidenceProviderRequests(PROJECT, FIELDS.map(field => ({ field,
    item: { canonicalField: field, cheapHolderMetadataOnly: field === "holderAddresses",
      targetSources: [{ source: field === "holderAddresses" ? "block explorers" : "GoPlus" }] } })), {
    env: {}, useCache: false, walletHistory: false, useCheapBlockscoutHolderMetadata: true,
    useGoPlusWalletFallback: false, useRpcWalletFallback: false,
    providers: {
      getBlockscoutWalletEvidence: async () => { calls.wallet++; throw new Error("wallet-only failure"); },
      getFreeSecurityEvidence: async () => { calls.security++; throw new Error("security-only failure"); },
    },
  }, state);
  return { result, state, calls };
}

test("actual executor wallet circuit cannot relabel an independent security failure", async () => {
  const { result, state, calls } = await executeMixed("WALLETS");
  assert.deepEqual(calls, { wallet: 0, security: 1 }); assert.equal(state.requestsUsed, 4);
  assert.deepEqual(result.observations, []);
  assert.deepEqual(result.attempts.map(({ provider, family, status, requestedFields }) => ({ provider, family, status, requestedFields })), [
    { provider: "blockscout-wallets", family: "WALLETS", status: "CIRCUIT_OPEN", requestedFields: ["holderAddresses"] },
    { provider: "free-security", family: undefined, status: "FAILED", requestedFields: ["contractVerified"] },
  ]);
  const output = analyze(result.attempts);
  assert.deepEqual(statuses(output), { holderAddresses: "PROVIDER_CIRCUIT_OPEN", contractVerified: "PROVIDER_UNAVAILABLE" });
  assert.equal(output.dataStarvationMissingEvidence.length, 2);
  assert.equal(output.contractVerified, undefined); assert.equal(output.coreDataStarved, true);
});

test("actual executor security circuit cannot relabel an independent wallet failure", async () => {
  const { result, state, calls } = await executeMixed("SECURITY");
  assert.deepEqual(calls, { wallet: 1, security: 0 }); assert.equal(state.requestsUsed, 2);
  assert.deepEqual(statuses(analyze(result.attempts)), {
    holderAddresses: "PROVIDER_UNAVAILABLE", contractVerified: "PROVIDER_CIRCUIT_OPEN",
  });
});

test("market, deployer, execution and parallel aggregate groups retain separate scopes under a zero request budget", async () => {
  const fields = ["priceUsd", "circulatingMarketCapUsd", "creatorAddress", "slippagePct"];
  const sources = ["DexScreener", "GeckoTerminal", "DeFiLlama Exact", "block explorers", "CoinGecko", "CoinPaprika", "LI.FI"];
  const state = createActiveEvidenceExecutionState({ maxRequests: 0 });
  const result = await executeActiveEvidenceProviderRequests({ ...PROJECT,
    poolAddress: "0x2222222222222222222222222222222222222222", coinGeckoId: "synthetic-id", coinPaprikaId: "synthetic-id" },
  fields.map(field => ({ field, item: { targetSources: sources.map(source => ({ source })) } })), {
    env: {}, useCache: false, providers: { getDeployerEvidence: async () => assert.fail("Exhausted budget cannot call a provider") },
  }, state);
  const byProvider = Object.fromEntries(result.attempts.map(item => [item.provider, item.requestedFields]));
  assert.deepEqual(byProvider.dexscreener, ["priceUsd", "circulatingMarketCapUsd"]);
  assert.deepEqual(byProvider.geckoterminal, ["priceUsd"]);
  assert.deepEqual(byProvider["defillama-exact-price"], ["priceUsd"]);
  assert.deepEqual(byProvider.lifi, ["slippagePct"]);
  assert.deepEqual(byProvider["execution-proof-recovery"], ["slippagePct"]);
  assert.deepEqual(byProvider["blockscout-deployer"], ["creatorAddress"]);
  assert.deepEqual(byProvider.coingecko, ["priceUsd", "circulatingMarketCapUsd"]);
  assert.deepEqual(byProvider.coinpaprika, ["priceUsd", "circulatingMarketCapUsd"]);
  assert.equal(state.requestsUsed, 0); assert.deepEqual(result.observations, []);
});

test("explicit requested fields take precedence over same-family attribution", () => {
  const output = analyze([
    { family: "SECURITY", requestedFields: ["contractVerified"], status: "CIRCUIT_OPEN" },
    { family: "SECURITY", requestedFields: ["buyTaxPct"], status: "FAILED" },
  ], ["contractVerified", "buyTaxPct", "ownerRenounced"]);
  assert.deepEqual(statuses(output), { contractVerified: "PROVIDER_CIRCUIT_OPEN", buyTaxPct: "PROVIDER_UNAVAILABLE",
    ownerRenounced: "PROVIDER_RETURNED_UNKNOWN" });
});

test("canonical aliases and case normalize attempted and scoped field names without broadening scope", () => {
  const output = analyze([
    { requestedFields: ["CONTRACT_VERIFIED"], family: "WALLETS", status: "FAILED" },
    { requestedFields: ["HOLDERADDRESSES"], status: "CIRCUIT_OPEN" },
  ], FIELDS, { activeEvidenceRecovery: { attemptedFields: ["CONTRACT_VERIFIED", "HOLDERADDRESSES"] } });
  assert.deepEqual(statuses(output), { holderAddresses: "PROVIDER_CIRCUIT_OPEN", contractVerified: "PROVIDER_UNAVAILABLE" });
});

test("legacy explicitly scoped families apply only to the same non-derived family", () => {
  assert.deepEqual(statuses(analyze([
    { family: "wallets", status: "CIRCUIT_OPEN" }, { family: "security", status: "FAILED" },
    { family: "MARKET", status: "REQUEST_BUDGET_EXHAUSTED" },
  ])), { holderAddresses: "PROVIDER_CIRCUIT_OPEN", contractVerified: "PROVIDER_UNAVAILABLE" });
});

test("unscoped legacy failures and malformed explicit scopes cannot blame individual fields", () => {
  const original = [
    { provider: "free-security", status: "FAILED" }, { provider: "blockscout-wallets", status: "CIRCUIT_OPEN" },
    { status: "REQUEST_BUDGET_EXHAUSTED" }, { family: "UNKNOWN", status: "FAILED" },
    { family: "SECURITY", requestedFields: [], status: "FAILED" },
    { family: "WALLETS", requestedFields: null, status: "CIRCUIT_OPEN" },
  ];
  const copy = structuredClone(original), output = analyze(original);
  assert.deepEqual(statuses(output), { holderAddresses: "PROVIDER_RETURNED_UNKNOWN", contractVerified: "PROVIDER_RETURNED_UNKNOWN" });
  assert.deepEqual(original, copy);
});

test("relevant request-budget and circuit outcomes retain current precedence without borrowing other fields", () => {
  const output = analyze([
    { requestedFields: ["holderAddresses"], status: "CIRCUIT_OPEN" },
    { requestedFields: ["contractVerified"], status: "FAILED" },
    { requestedFields: ["contractVerified"], status: "REQUEST_BUDGET_EXHAUSTED" },
  ]);
  assert.deepEqual(statuses(output), { holderAddresses: "PROVIDER_CIRCUIT_OPEN", contractVerified: "PROVIDER_BUDGET_EXHAUSTED" });
});

test("no request or successful empty response does not become a provider outage or recovered evidence", () => {
  for (const attempts of [[], [{ requestedFields: ["contractVerified"], status: "SUCCESS" }]]) {
    const output = analyze(attempts);
    assert.deepEqual(statuses(output), { holderAddresses: "PROVIDER_RETURNED_UNKNOWN", contractVerified: "PROVIDER_RETURNED_UNKNOWN" });
    assert.equal(output.coreDataStarved, true); assert.equal(output.dataStarvationMissingEvidence.length, 2);
  }
});

test("derived output failures remain internal even when a provider explicitly names the derived field", () => {
  const output = analyze([{ requestedFields: ["executionScore"], family: "EXECUTION", status: "CIRCUIT_OPEN" }], ["executionScore"],
    { engineResults: { executionProof: { status: "FAILED", failureReason: "producer failed" } } });
  assert.equal(output.dataStarvationMissingEvidence[0].rootCause, "PIPELINE_STAGE_FAILED");
  assert.equal(output.dataStarvationMissingEvidence[0].providerStatus, "UNKNOWN");
});
