import test from "node:test";
import assert from "node:assert/strict";
import { getRpcWalletEvidence } from "../src/data/rpcWalletEvidenceConnector.js";
import { getBlockscoutWalletEvidence, normalizeBlockscoutWalletEvidence } from "../src/data/blockscoutWalletConnector.js";
import { createActiveEvidenceExecutionState, executeActiveEvidenceProviderRequests } from "../src/data/activeEvidenceProviderExecutor.js";
import { ERC20_TRANSFER_TOPIC, encodeAddressWord } from "../src/sensors/evmAbi.js";

const TOKEN = "0x1111111111111111111111111111111111111111";
const POOL = "0x2222222222222222222222222222222222222222";
const WALLET = "0x3333333333333333333333333333333333333333";
const project = { chain: "base", tokenAddress: TOKEN, poolAddress: POOL };
const log = { address: TOKEN, transactionHash: `0x${"a".repeat(64)}`, blockNumber: "0x100",
  logIndex: "0x0", data: `0x${"0".repeat(63)}5`, topics: [ERC20_TRANSFER_TOPIC,
    `0x${encodeAddressWord(POOL)}`, `0x${encodeAddressWord(WALLET)}`] };
function fixture(overrides = {}, calls = []) {
  return async (url, method, params) => {
    calls.push({ method, params });
    if (overrides[method] instanceof Error) throw overrides[method];
    return overrides[method] ?? { eth_chainId: "0x2105", eth_getBlockByNumber: { number: "0x100", timestamp: "0x10000" }, eth_getLogs: [log] }[method];
  };
}
const options = (overrides, calls) => ({ rpcUrl: "https://rpc.invalid", jsonRpc: fixture(overrides, calls) });
const meta = { tokenAddress: TOKEN, poolAddress: POOL, now: new Date("2026-10-10T10:00:00Z") };

test("missing transfers cannot become measured zero daily or smart-wallet activity", () => {
  const result = normalizeBlockscoutWalletEvidence({ holders: { items: [{ address: WALLET }] } },
    { trackedWallets: [WALLET] }, meta);
  assert.equal(result.status, "EVIDENCE_AVAILABLE");
  for (const field of ["uniqueBuyers24h", "buyTransactions24h", "sellTransactions24h", "smartWalletBuyCount", "smartWalletSellCount"]) assert.equal(result[field], null);
});
test("complete empty transfer response is distinct from missing coverage", () => {
  const result = normalizeBlockscoutWalletEvidence({ transfers: { items: [] } }, {}, meta);
  assert.equal(result.buyTransactions24h, 0);
  assert.equal(result.transferCoverage.complete24h, true);
  assert.equal(result.status, "EVIDENCE_AVAILABLE");
});
test("pagination or invalid event times cannot manufacture complete daily totals", () => {
  const transfer = { token: { address_hash: TOKEN }, from: POOL, to: WALLET,
    timestamp: "2026-10-10T09:00:00Z" };
  for (const raw of [{ items: [transfer], next_page_params: { block: 1 } },
    { items: [{ ...transfer, timestamp: null }] }, { items: [{ ...transfer, timestamp: "2026-10-11T10:00:00Z" }] },
    { items: [{ ...transfer, token: { address_hash: WALLET } }] }]) {
    assert.equal(normalizeBlockscoutWalletEvidence({ transfers: raw }, {}, meta).uniqueBuyers24h, null);
  }
});
test("current prices cannot masquerade as measured historical trade volume", () => {
  const result = normalizeBlockscoutWalletEvidence({ transfers: { items: [{ token: { address_hash: TOKEN, decimals: 0 },
    from: POOL, to: WALLET, value: "5", timestamp: "2026-10-10T09:00:00Z" }] } }, { priceUsd: 2 }, meta);
  assert.equal(result.buyVolumeUsd, null);
  assert.equal(result.walletTransactions[0].estimatedCurrentValueUsd, 10);
});
test("total explorer transport failure is visible to the circuit breaker", async () => {
  const result = await getBlockscoutWalletEvidence(project, { fetchJson: async () => { throw new Error("HTTP 403"); } });
  assert.equal(result.providerFailure, true);
  assert.equal(result.buyTransactions24h, null);
});
test("RPC recovery uses three bounded requests and exact token participation only", async () => {
  const calls = [];
  const result = await getRpcWalletEvidence(project, options({}, calls));
  assert.equal(calls.length, 3);
  assert.equal(calls[2].params[0].address, TOKEN);
  assert.equal(calls[2].params[0].toBlock, "0x100");
  assert.equal(result.status, "EVIDENCE_AVAILABLE");
  assert.ok(result.wallets.includes(WALLET));
  assert.ok(!result.wallets.includes(POOL));
  assert.equal(result.walletTransactions[0].tokenAmountRaw, "5");
  assert.equal(result.walletTransactions[0].direction, "TRANSFER");
  assert.equal(result.walletTransactions[0].timestamp, null);
  assert.equal(result.uniqueBuyers24h, null);
  assert.equal(result.smartWallets, null);
  assert.equal(result.transferCoverage.complete24h, false);
});
test("wrong chain, foreign token, malformed logs and out-of-range evidence remain unknown", async () => {
  for (const override of [{ eth_chainId: "0x1" }, { eth_getLogs: [{ ...log, address: WALLET }] },
    { eth_getLogs: [{ ...log, data: "0x" }] }, { eth_getLogs: [{ ...log, blockNumber: "0x101" }] },
    { eth_getLogs: new Error("RPC unavailable") }, { eth_getLogs: [] }]) {
    const result = await getRpcWalletEvidence(project, options(override));
    assert.equal(result.status, "UNKNOWN");
    assert.ok(!result.wallets?.length);
  }
});
test("RPC fallback actually promotes raw companions with provenance but not smart labels", async () => {
  const proof = await getRpcWalletEvidence(project, options({}));
  const result = await executeActiveEvidenceProviderRequests(project, [{ field: "smartWallets" }], {
    providers: { getBlockscoutWalletEvidence: async () => ({ status: "UNKNOWN" }), getRpcWalletEvidence: async () => proof },
  });
  assert.ok(result.observations.some((item) => item.field === "wallets" && item.source === "rpc-wallets"));
  assert.ok(result.observations.every((item) => item.verificationStatus === "VERIFIED_PROVIDER_OBSERVATION"));
  assert.ok(!result.observations.some((item) => item.field === "smartWallets"));
});
test("fallback cannot exceed the shared request budget or accept foreign proof", async () => {
  let calls = 0;
  const state = createActiveEvidenceExecutionState({ maxProviderRequests: 5 });
  await executeActiveEvidenceProviderRequests(project, [{ field: "wallets" }], {
    providers: { getBlockscoutWalletEvidence: async () => ({ status: "UNKNOWN" }), getRpcWalletEvidence: async () => { calls++; return {}; } },
  }, state);
  assert.equal(calls, 0);
  assert.equal(state.requestsUsed, 3);
  const proof = await getRpcWalletEvidence(project, options({}));
  const result = await executeActiveEvidenceProviderRequests(project, [{ field: "wallets" }], {
    providers: { getBlockscoutWalletEvidence: async () => ({ status: "UNKNOWN" }), getRpcWalletEvidence: async () => ({ ...proof, tokenAddress: WALLET }) },
  });
  assert.equal(result.observations.length, 0);
});

test("usable explorer participation does not trigger redundant RPC hydration", async () => {
  let calls = 0;
  const result = await executeActiveEvidenceProviderRequests(project, [{ field: "wallets" }], {
    providers: { getBlockscoutWalletEvidence: async () => ({ status: "EVIDENCE_AVAILABLE", chain: "base", tokenAddress: TOKEN, wallets: [WALLET] }),
      getRpcWalletEvidence: async () => { calls++; return {}; } },
  });
  assert.equal(calls, 0);
  assert.equal(result.observations[0].source, "blockscout-wallets");
});

test("wallet transport failures open the existing chain-scoped circuit", async () => {
  let rpcCalls = 0;
  const state = createActiveEvidenceExecutionState({ maxProviderRequests: 30, circuitFailureThreshold: 1 });
  const opts = { circuitFailureThreshold: 1, providers: {
    getBlockscoutWalletEvidence: async () => ({ status: "UNKNOWN", providerFailure: true }),
    getRpcWalletEvidence: async () => { rpcCalls++; return { status: "UNKNOWN", providerFailure: true }; },
  } };
  await executeActiveEvidenceProviderRequests(project, [{ field: "wallets" }], opts, state);
  await executeActiveEvidenceProviderRequests(project, [{ field: "wallets" }], opts, state);
  assert.equal(rpcCalls, 1);
});

test("holder-only explorer proof cannot prevent recovery of requested transaction evidence", async () => {
  const proof = await getRpcWalletEvidence(project, options({}));
  const result = await executeActiveEvidenceProviderRequests(project, [{ field: "walletTransactions" }], {
    providers: { getBlockscoutWalletEvidence: async () => ({ status: "EVIDENCE_AVAILABLE", chain: "base", tokenAddress: TOKEN,
      wallets: [TOKEN, WALLET], holderAddresses: [WALLET] }), getRpcWalletEvidence: async () => proof },
  });
  assert.equal(result.observations.find((item) => item.field === "walletTransactions").source, "rpc-wallets");
  assert.deepEqual(result.observations.find((item) => item.field === "wallets").value, [TOKEN, WALLET]);
});
