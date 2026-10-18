import test from "node:test";
import assert from "node:assert/strict";
import { createActiveEvidenceExecutionState, executeActiveEvidenceProviderRequests } from "../src/data/activeEvidenceProviderExecutor.js";
import { sourcesForField as enrichmentSourcesForField } from "../src/data/enrichmentSourceRegistry.js";
import { getGoPlusSecurityEvidence } from "../src/data/security/goplusSecurityConnector.js";
import { createGoPlusRequestLimiter } from "../src/data/security/goplusRequestLimiter.js";

const TOKEN = "0x1111111111111111111111111111111111111111";
const POOL = "0x2222222222222222222222222222222222222222";
const HOLDER = "0x3333333333333333333333333333333333333333";
const NOW = Date.parse("2026-10-18T05:00:00Z");
const project = { chain: "bsc", tokenAddress: TOKEN, poolAddress: POOL,
  creatorAddress: HOLDER, deployerAddress: HOLDER };
const proof = { provider: "goplus", status: "EVIDENCE_AVAILABLE", chain: "bsc", address: TOKEN,
  observedAt: new Date(NOW - 1000).toISOString(), confidence: 85, responseIdentityVerified: true,
  honeypot: true, raw: { holders: [{ address: HOLDER, balance: "12.5" }], is_honeypot: "1" } };
const request = (field, source = "block explorers") => ({ field, item: { canonicalField: field, targetSources: [{ source }] } });
const options = (provider, extra = {}) => ({ now: () => NOW, walletHistory: false, useCache: false,
  useRpcWalletFallback: false, providers: { getBlockscoutWalletEvidence: async () => ({ status: "UNKNOWN" }),
    getGoPlusWalletEvidence: provider }, ...extra });

test("wallet-only gaps actually invoke GoPlus despite an already-known creator", async () => {
  let calls = 0;
  const state = createActiveEvidenceExecutionState({ maxProviderRequests: 4, now: () => NOW });
  const result = await executeActiveEvidenceProviderRequests(project, [request("wallets")], options(async () => { calls++; return proof; }), state);
  assert.equal(calls, 1);
  assert.equal(state.requestsUsed, 1);
  assert.deepEqual(result.observations.find((item) => item.field === "wallets").value, [HOLDER]);
  const observed = result.observations.find((item) => item.field === "wallets");
  assert.equal(observed.source, "goplus");
  assert.equal(observed.sourceTimestamp, proof.observedAt);
  assert.equal(observed.verificationStatus, "VERIFIED_PROVIDER_OBSERVATION");
  assert.equal(observed.holderSampleOnly, true);
  assert.equal(observed.completeHolderCoverage, false);
  assert.equal(observed.buyerClassificationAvailable, false);
  assert.equal(observed.identityVerifiedOnChain, false);
  assert.equal(observed.snapshotTimestampVerified, false);
  assert.equal(observed.sourceTimestampMeaning, "PROVIDER_RECEIPT_TIME_NOT_CHAIN_SNAPSHOT_TIME");
  for (const field of ["uniqueBuyers24h", "smartWalletScore", "smartWallets", "independentBuyers24h"]) {
    assert.equal(result.observations.some((item) => item.field === field), false);
  }
});

test("GoPlus capability is offered for EVM holder inputs, not smart labels or Solana", () => {
  for (const field of ["wallets", "holderAddresses"]) {
    assert.ok(enrichmentSourcesForField(field, project).some((item) => item.source === "GoPlus"));
    for (const chain of ["solana", "zksync", "robinhood-chain"]) {
      assert.equal(enrichmentSourcesForField(field, { chain }).some((item) => item.source === "GoPlus"), false);
    }
  }
  for (const field of ["smartWallets", "smartWalletBuyCount", "walletTransactions"]) {
    assert.equal(enrichmentSourcesForField(field, project).some((item) => item.source === "GoPlus"), false);
  }
});

test("an explicit GoPlus wallet source is executable and saves later RPC calls", async () => {
  let rpcCalls = 0;
  const opts = options(async () => proof);
  opts.useRpcWalletFallback = true;
  opts.providers.getRpcWalletEvidence = async () => { rpcCalls++; return { status: "UNKNOWN" }; };
  const result = await executeActiveEvidenceProviderRequests(project, [request("wallets", "GoPlus")], opts);
  assert.deepEqual(result.observations.find((item) => item.field === "wallets").value, [HOLDER]);
  assert.equal(rpcCalls, 0);
});

test("new holder acquisition carries genuine security risk into the dependent security pass", async () => {
  let securityCalls = 0;
  const opts = options(async () => proof);
  opts.providers.getFreeSecurityEvidence = async () => { securityCalls++; throw new Error("existing new proof should be reused"); };
  const result = await executeActiveEvidenceProviderRequests(project, [request("wallets"), request("honeypotDetected", "GoPlus")], opts);
  assert.equal(result.observations.find((item) => item.field === "honeypotDetected").value, true);
  assert.equal(securityCalls, 0);
  assert.ok(result.projectPatch.securityEvidence.some((item) => item === proof));
  assert.equal(result.projectPatch.liveExecutionReady, undefined);
  assert.equal(result.projectPatch.finalSelectionQualified, undefined);
});

test("wrong identity, unknown, stale, future and low-confidence holder responses stay unresolved", async () => {
  for (const patch of [{ address: HOLDER }, { chain: "ethereum" }, { responseIdentityVerified: false },
    { status: "UNKNOWN" }, { confidence: 0.1 }, { observedAt: new Date(NOW + 1000).toISOString() },
    { observedAt: new Date(NOW - 7 * 3600_000).toISOString() }]) {
    const result = await executeActiveEvidenceProviderRequests(project, [request("wallets")], options(async () => ({ ...proof, ...patch })));
    assert.equal(result.observations.some((item) => item.field === "wallets"), false);
    assert.equal(result.observations.some((item) => item.field === "honeypotDetected"), false);
  }
});

test("GoPlus wallet requests cannot exceed the shared budget", async () => {
  let calls = 0;
  const state = createActiveEvidenceExecutionState({ maxProviderRequests: 3, now: () => NOW });
  state.requestsUsed = 3;
  const result = await executeActiveEvidenceProviderRequests(project, [request("wallets")], options(async () => { calls++; return proof; }), state);
  assert.equal(calls, 0);
  assert.equal(state.requestsUsed, 3);
  assert.deepEqual(result.observations, []);
  assert.ok(result.attempts.some((item) => item.status === "REQUEST_BUDGET_EXHAUSTED"));
});

test("GoPlus failure opens its circuit but never suppresses independent RPC recovery", async () => {
  let calls = 0;
  let rpcCalls = 0;
  const state = createActiveEvidenceExecutionState({ maxProviderRequests: 20, circuitFailureThreshold: 1, now: () => NOW });
  const opts = options(async () => { calls++; throw new Error("GoPlus unavailable"); });
  opts.useRpcWalletFallback = true;
  opts.providers.getRpcWalletEvidence = async () => { rpcCalls++; return { status: "EVIDENCE_AVAILABLE",
    exactTokenIdentity: true, chain: "bsc", tokenAddress: TOKEN, sourceTimestamp: proof.observedAt,
    confidence: 0.85, wallets: [HOLDER] }; };
  for (let i = 0; i < 2; i++) {
    const result = await executeActiveEvidenceProviderRequests(project, [request("wallets")], opts, state);
    assert.equal(result.observations.find((item) => item.field === "wallets").source, "rpc-wallets");
  }
  assert.equal(calls, 1);
  assert.equal(rpcCalls, 2);
  assert.equal(state.providers.get("goplus-wallets:bsc").circuitOpen, true);
});

test("existing exact holder payloads and unsupported transaction fields avoid redundant GoPlus calls", async () => {
  let calls = 0;
  for (const [field, explorer] of [["wallets", { wallets: [HOLDER] }], ["walletTransactions", {}]]) {
    const opts = options(async () => { calls++; return proof; });
    opts.providers.getBlockscoutWalletEvidence = async () => ({ status: "EVIDENCE_AVAILABLE", chain: "bsc", tokenAddress: TOKEN, ...explorer });
    await executeActiveEvidenceProviderRequests(field === "wallets" ? { ...project, securityEvidence: [proof] } : project, [request(field)], opts);
  }
  assert.equal(calls, 0);
});

test("the actual default GoPlus connector reserves the shared limiter and spends one request", async (t) => {
  let calls = 0;
  let reservations = 0;
  const original = global.fetch;
  t.after(() => { global.fetch = original; });
  global.fetch = async (url) => {
    calls++;
    assert.ok(String(url).includes(`/token_security/56?contract_addresses=${TOKEN}`));
    return { ok: true, json: async () => ({ result: { [TOKEN]: { holders: [{ address: HOLDER, balance: "1" }], is_honeypot: "1" } } }) };
  };
  const opts = options(getGoPlusSecurityEvidence, { now: Date.now, goPlusRateLimiter: async ({ waitForCooldown }) => {
    reservations++;
    assert.equal(waitForCooldown, false);
    return true;
  } });
  const state = createActiveEvidenceExecutionState({ maxProviderRequests: 1 });
  const result = await executeActiveEvidenceProviderRequests(project, [request("wallets", "GoPlus")], opts, state);
  assert.equal(calls, 1);
  assert.equal(reservations, 1);
  assert.equal(state.requestsUsed, 1);
  assert.deepEqual(result.observations.find((item) => item.field === "wallets").value, [HOLDER]);
  assert.equal(result.observations.find((item) => item.field === "honeypotDetected").value, true);
});

test("GoPlus cooldown is shared with wallet recovery without blocking an independent fallback", async (t) => {
  let httpCalls = 0;
  let rpcCalls = 0;
  const original = global.fetch;
  t.after(() => { global.fetch = original; });
  global.fetch = async () => { httpCalls++; return { ok: false, status: 429 }; };
  const limiter = createGoPlusRequestLimiter({ now: () => 1000, sleep: async () => { throw new Error("must not wait for cooldown"); } });
  const opts = options(getGoPlusSecurityEvidence, { now: Date.now, goPlusRateLimiter: limiter, useRpcWalletFallback: true });
  opts.providers.getRpcWalletEvidence = async () => { rpcCalls++; return { status: "EVIDENCE_AVAILABLE",
    exactTokenIdentity: true, chain: "bsc", tokenAddress: TOKEN, sourceTimestamp: new Date().toISOString(), confidence: 0.85, wallets: [HOLDER] }; };
  const state = createActiveEvidenceExecutionState({ maxProviderRequests: 20 });
  for (let i = 0; i < 2; i++) {
    const result = await executeActiveEvidenceProviderRequests(project, [request("wallets")], opts, state);
    assert.equal(result.observations.find((item) => item.field === "wallets").source, "rpc-wallets");
    assert.ok(result.attempts.some((item) => item.status === (i ? "PROVIDER_COOLDOWN" : "RATE_LIMITED")));
  }
  assert.equal(httpCalls, 1);
  assert.equal(rpcCalls, 2);
  assert.equal(state.requestsUsed, 13);
});
