import test from "node:test";
import assert from "node:assert/strict";
import { getSolanaRpcWalletEvidence, normalizeSolanaWalletTransaction } from "../src/data/solanaRpcWalletEvidenceConnector.js";
import { createActiveEvidenceExecutionState, executeActiveEvidenceProviderRequests } from "../src/data/activeEvidenceProviderExecutor.js";
import { analyzeActiveEvidenceRecoveryBatch } from "../src/engines/activeEvidenceRecoveryEngine.js";
import { analyzeWalletCluster } from "../src/engines/walletClusterEngine.js";
import { analyzeOrganicBuyerClassifier } from "../src/engines/organicBuyerClassifierEngine.js";
import { analyzeSmartWallets } from "../src/engines/smartWalletEngine.js";

const MINT = "3HLhtXNCVh1VbCrpwACoZWwHoNeoCB7hRAPcYN2jjUiL";
const POOL = "DN5Eq6ELcvUcC69VNbNW5pNbnt3bvtVGfHpBWb8pAcoF";
const OWNER = "DJsZxM4LKDSZEEjE6RL8s7WAT8hUE4gtuuJKooEyhBhw";
const POOL_ACCOUNT = "7tSUtKPMVTDBYLiJzZVx6JZcbVyDNid7gpt9ZXZYFH3m";
const OWNER_ACCOUNT = "5wHAdpzn8zYstzGYPX5GqWCuE3J4MEfqWGFYvzy2i4Am";
const PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
const GENESIS = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";
const SIGNATURE = "3y8x7AyRWddecZXgup1zhVzQS6asK3RWxwRYyuhasE3tpWNY6iyWaF9PPEEB8keWksCicpm35NaShCnCCSk6bn37";
const NOW = Date.parse("2026-10-18T05:40:00Z");
const HEAD = NOW / 1000;
const project = { chain: "solana", tokenAddress: MINT, poolAddress: POOL };
const context = { headSlot: 200, headTimestamp: HEAD };
const info = { signature: SIGNATURE, slot: 150, blockTime: HEAD - 60, err: null, confirmationStatus: "confirmed" };

function balance(accountIndex, owner, amount) {
  return { accountIndex, owner, mint: MINT, programId: PROGRAM, uiTokenAmount: { amount, decimals: 6 } };
}

function transaction(version = 1) {
  return { version, slot: info.slot, blockTime: info.blockTime,
    meta: { err: null, preTokenBalances: [balance(1, POOL, "1000"), balance(2, OWNER, "60")],
      postTokenBalances: [balance(1, POOL, "1060"), balance(2, OWNER, "0")] },
    transaction: { signatures: [SIGNATURE], message: { accountKeys: [POOL, POOL_ACCOUNT, OWNER_ACCOUNT],
      ...(version === 1 ? { transactionConfig: { computeUnitLimit: 30000 } } : {}) } } };
}

function transport(changes = {}, calls = []) {
  return async (_url, method, params, options) => {
    calls.push({ method, params, options });
    const value = Object.hasOwn(changes, method) ? changes[method]
      : { getGenesisHash: GENESIS, getSlot: context.headSlot, getBlockTime: HEAD,
        getSignaturesForAddress: [info], getTransaction: transaction() }[method];
    if (value instanceof Error) throw value;
    return typeof value === "function" ? value(params) : value;
  };
}

function options(changes = {}, calls = [], extra = {}) {
  return { now: () => NOW, solanaRpcUrl: "https://solana.invalid", jsonRpc: transport(changes, calls), ...extra };
}

for (const version of ["legacy", 0, 1]) {
  test(`exact ${version} transactions prove historical owner changes, not current holders or swaps`, () => {
    const rows = normalizeSolanaWalletTransaction(transaction(version), info, project, context);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].ownerAddress, OWNER);
    assert.equal(rows[0].tokenDeltaRaw, "-60");
    assert.equal(rows[0].tokenAmountAfterRaw, "0");
    assert.equal(rows[0].direction, "BALANCE_CHANGE");
    assert.equal(rows[0].tradeClassification, "UNKNOWN");
    assert.equal(rows[0].currentHoldingVerified, false);
    assert.equal(rows[0].timestamp, new Date(info.blockTime * 1000).toISOString());
  });
}

test("wrong or ambiguous mint, chain and pool identities cannot make RPC requests", async () => {
  for (const changes of [{ chain: "base" }, { tokenAddress: null }, { poolAddress: null },
    { contractAddress: OWNER }, { network: "base" }, { pairAddress: OWNER }, { contractAddress: [] }]) {
    const calls = [];
    const result = await getSolanaRpcWalletEvidence({ ...project, ...changes }, options({}, calls));
    assert.equal(result.status, "UNKNOWN");
    assert.equal(calls.length, 0);
  }
});

test("foreign, future, stale, failed and mismatched transactions remain unknown", () => {
  const patches = [
    (tx) => { tx.version = 2; },
    (tx) => { delete tx.transaction.message.transactionConfig; },
    (tx) => { tx.meta.err = { failed: true }; },
    (tx) => { delete tx.meta.err; },
    (tx) => { tx.slot++; },
    (tx) => { tx.blockTime++; },
    (tx) => { tx.transaction.signatures[0] = SIGNATURE.toLowerCase(); },
    (tx) => { tx.transaction.message.accountKeys[0] = OWNER; },
    (tx) => { tx.transaction.message.accountKeys[2] = POOL_ACCOUNT; },
    (tx) => { tx.meta.postTokenBalances[0].uiTokenAmount.amount = "1000"; },
    (tx) => { tx.meta.postTokenBalances[1].uiTokenAmount.amount = "60"; },
    (tx) => { tx.meta.postTokenBalances[1].owner = POOL; },
    (tx) => { tx.meta.postTokenBalances[1].mint = MINT.toLowerCase(); },
    (tx) => { tx.meta.postTokenBalances[1].programId = OWNER; },
    (tx) => { tx.meta.postTokenBalances[1].uiTokenAmount.amount = 0; },
    (tx) => { tx.meta.postTokenBalances[1].uiTokenAmount.amount = "-1"; },
    (tx) => { tx.meta.postTokenBalances[1].uiTokenAmount.amount = (2n ** 64n).toString(); },
    (tx) => { tx.meta.postTokenBalances[1].uiTokenAmount.decimals = 9; },
    (tx) => { tx.meta.preTokenBalances.push(tx.meta.preTokenBalances[1]); },
    (tx) => { tx.meta.preTokenBalances.splice(1); },
  ];
  for (const patch of patches) {
    const tx = transaction();
    patch(tx);
    assert.deepEqual(normalizeSolanaWalletTransaction(tx, info, project, context), [], patch.toString());
  }
  for (const patch of [{ err: {} }, { confirmationStatus: "processed" }, { blockTime: HEAD + 1 }, { slot: 201 }]) {
    assert.deepEqual(normalizeSolanaWalletTransaction(transaction(), { ...info, ...patch }, project, context), []);
  }
  assert.deepEqual(normalizeSolanaWalletTransaction(transaction(), info, project, { ...context, headTimestamp: HEAD + 86401 }), []);
});

test("bounded mainnet recovery pins a fresh head and requests version 1 without holder or buyer claims", async () => {
  const calls = [];
  const result = await getSolanaRpcWalletEvidence(project, options({}, calls));
  assert.deepEqual(calls.map((call) => call.method), ["getGenesisHash", "getSlot", "getBlockTime", "getSignaturesForAddress", "getTransaction"]);
  assert.equal(calls[3].params[1].minContextSlot, context.headSlot);
  assert.equal(calls[4].params[1].maxSupportedTransactionVersion, 1);
  assert.equal(calls[4].params[1].encoding, "jsonParsed");
  assert.equal(result.status, "EVIDENCE_AVAILABLE");
  assert.deepEqual(result.wallets, [OWNER]);
  assert.equal(result.sourceTimestamp, new Date(NOW).toISOString());
  assert.equal(result.walletTransactions[0].timestamp, new Date(info.blockTime * 1000).toISOString());
  assert.equal(result.transferCoverage.complete24h, false);
  assert.equal(result.transferCoverage.sampled, true);
  for (const field of ["holderAddresses", "holderCount", "uniqueBuyers24h", "smartWallets", "deployer", "creator", "purchaseRouteConfirmed"]) {
    assert.equal(result[field], undefined, field);
  }
  const scored = analyzeSmartWallets(analyzeWalletCluster(analyzeOrganicBuyerClassifier({ ...project, ...result })));
  assert.equal(scored.organicBuyerScore, null);
  assert.equal(scored.walletClusterScore, null);
  assert.equal(scored.smartWalletScore, null);
});

test("wrong-chain, invalid or stale heads stop before signature enumeration", async () => {
  for (const changes of [{ getGenesisHash: "testnet" }, { getSlot: "200" }, { getBlockTime: HEAD - 301 },
    { getBlockTime: HEAD + 1 }, { getBlockTime: null }]) {
    const calls = [];
    const result = await getSolanaRpcWalletEvidence(project, options(changes, calls));
    assert.equal(result.status, "UNKNOWN");
    assert.equal(calls.some((call) => call.method === "getSignaturesForAddress"), false);
  }
});

test("signature selection is bounded and rejects duplicates, failed and old entries", async () => {
  const calls = [];
  const signatures = [info, { ...info }, { ...info, err: "failed" }, { ...info, blockTime: HEAD - 86401 }];
  const result = await getSolanaRpcWalletEvidence(project, options({ getSignaturesForAddress: signatures }, calls));
  assert.equal(result.status, "EVIDENCE_AVAILABLE");
  assert.equal(calls.filter((call) => call.method === "getTransaction").length, 1);
  const oversized = await getSolanaRpcWalletEvidence(project, options({ getSignaturesForAddress: [...signatures, info] }));
  assert.equal(oversized.status, "UNKNOWN");
});

const request = { field: "wallets", item: { canonicalField: "wallets", targetSources: [{ source: "chain RPC" }] } };
function activeOptions(calls = [], extra = {}) {
  return { ...options({}, calls), walletHistory: false, useCache: false, useSolanaRpcWalletFallback: true,
    providers: { getSolanaWalletEvidence: async () => ({ status: "UNKNOWN" }) }, ...extra };
}

test("active recovery invokes the exact Solana path and charges every actual method", async () => {
  const calls = [];
  const state = createActiveEvidenceExecutionState({ maxProviderRequests: 6 });
  const result = await executeActiveEvidenceProviderRequests(project, [request], activeOptions(calls), state);
  assert.equal(state.requestsUsed, 6);
  assert.equal(calls.length, 5);
  assert.deepEqual(result.observations.map((item) => item.field), ["wallets", "walletTransactions", "walletParticipationHistory"]);
  assert.deepEqual(result.observations[0].value, [OWNER]);
  assert.equal(result.observations[0].sourceTimestamp, new Date(NOW).toISOString());
  assert.equal(result.observations[0].buyerClassificationAvailable, false);
  assert.equal(result.observations[0].currentHoldingVerified, false);
  assert.equal(result.projectPatch.solanaRpcWalletEvidence.genesisHash, GENESIS);
});

test("shared budget cannot start an unfinishable Solana proof or overspend during reads", async () => {
  for (const maximum of [0, 1, 5]) {
    const calls = [];
    const state = createActiveEvidenceExecutionState({ maxProviderRequests: maximum });
    const result = await executeActiveEvidenceProviderRequests(project, [request], activeOptions(calls), state);
    assert.equal(result.observations.length, 0);
    assert.equal(calls.length, 0);
    assert.ok(state.requestsUsed <= maximum);
  }
});

test("a depleted shared budget stops before the next transaction request", async () => {
  const second = { ...info, signature: `4${SIGNATURE.slice(1)}` };
  const calls = [];
  const state = createActiveEvidenceExecutionState({ maxProviderRequests: 6 });
  const opts = activeOptions(calls, { jsonRpc: transport({ getSignaturesForAddress: [info, second],
    getTransaction: () => { const tx = transaction(); tx.meta.postTokenBalances = tx.meta.preTokenBalances; return tx; } }, calls) });
  const result = await executeActiveEvidenceProviderRequests(project, [request], opts, state);
  assert.equal(result.observations.length, 0);
  assert.equal(state.requestsUsed, 6);
  assert.equal(calls.filter((call) => call.method === "getTransaction").length, 1);
  assert.ok(result.attempts.some((attempt) => attempt.status === "REQUEST_BUDGET_EXHAUSTED"));
});

test("the default EVM history wrapper cannot discard verified Solana transaction history", async () => {
  const result = await executeActiveEvidenceProviderRequests(project, [request], activeOptions([], { walletHistory: true }),
    createActiveEvidenceExecutionState({ maxProviderRequests: 6 }));
  const history = result.observations.find((item) => item.field === "walletParticipationHistory");
  assert.equal(history.source, "solana-rpc-wallets");
  assert.equal(history.verificationStatus, "VERIFIED_PROVIDER_OBSERVATION");
  assert.equal(history.value[0].timestamp, new Date(info.blockTime * 1000).toISOString());
  assert.equal(history.value[0].currentHoldingVerified, false);
});

test("deadline and circuit failures stop RPC work without manufacturing wallet observations", async () => {
  const calls = [];
  const state = createActiveEvidenceExecutionState({ maxProviderRequests: 20, circuitFailureThreshold: 1 });
  const opts = activeOptions(calls, { jsonRpc: async (_url, method) => { calls.push(method); throw new Error("RPC refused"); } });
  const result = await executeActiveEvidenceProviderRequests(project, [request], opts, state);
  assert.equal(result.observations.length, 0);
  const used = state.requestsUsed;
  await executeActiveEvidenceProviderRequests(project, [request], opts, state);
  assert.ok(state.requestsUsed <= used + 1, "only the separate RugCheck attempt can consume another unit");
  assert.equal(calls.length, 1);
  const expired = createActiveEvidenceExecutionState({ maxProviderRequests: 20 });
  expired.deadlineAt = 0;
  const stopped = await executeActiveEvidenceProviderRequests(project, [request], activeOptions([]), expired);
  assert.equal(stopped.observations.length, 0);
  assert.equal(expired.requestsUsed, 0);
});

test("wave 2 marks genuine Solana participation as changed wallet evidence", async () => {
  const candidate = { ...project, projectId: "solana-history", valueOfInformationScore: 90,
    dataStarvationStatus: "CORE_DATA_STARVED", starvationRecoveryPlan: { items: [
      { canonicalField: "wallets", evidenceFamily: "WALLETS", targetSources: [{ source: "chain RPC" }], recoveryDisposition: "RAW_RECOVERABLE" },
    ] } };
  const results = await analyzeActiveEvidenceRecoveryBatch([candidate], { ...activeOptions(), maxProviderRequests: 6,
    wave1Max: 0, wave2Max: 1, wave3Max: 0 });
  assert.deepEqual(results[0].wallets, [OWNER]);
  assert.ok(results[0].activeEvidenceRecovery.changedEvidenceFamilies.includes("WALLETS"));
});
