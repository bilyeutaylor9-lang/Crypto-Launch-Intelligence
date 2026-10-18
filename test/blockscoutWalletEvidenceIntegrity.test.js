import test from "node:test";
import assert from "node:assert/strict";
import { getBlockscoutWalletEvidence, normalizeBlockscoutWalletEvidence } from "../src/data/blockscoutWalletConnector.js";

const TOKEN = `0x${"1".repeat(40)}`;
const POOL = `0x${"2".repeat(40)}`;
const WALLET = `0x${"3".repeat(40)}`;
const OTHER = `0x${"4".repeat(40)}`;
const ZERO = `0x${"0".repeat(40)}`;
const NOW = new Date("2026-10-10T10:00:00.000Z");
const META = { chain: "base", tokenAddress: TOKEN, poolAddress: POOL, now: NOW };
const TRANSFER = {
  token: { address_hash: TOKEN, decimals: "0" },
  from: { hash: POOL },
  to: { hash: WALLET },
  transaction_hash: `0x${"a".repeat(64)}`,
  value: "5",
  timestamp: "2026-10-10T09:00:00.000Z",
};

function normalize(raw = {}, project = {}, meta = META) {
  return normalizeBlockscoutWalletEvidence(raw, project, meta);
}

function transferResult(transfer = TRANSFER, project = {}) {
  return normalize({ transfers: { items: [transfer] } }, project);
}

function assertNoParticipation(result) {
  assert.deepEqual(result.walletTransactions, []);
  assert.deepEqual(result.walletParticipationHistory, []);
  assert.deepEqual(result.wallets, []);
  assert.equal(result.transferCoverage.complete24h, false);
  assert.equal(result.transferCoverage.observedTransfers24h, null);
}

test("transfers require their own matching token identity, including all supplied aliases", () => {
  for (const transfer of [
    { ...TRANSFER, token: { decimals: 0 } },
    { ...TRANSFER, token: null },
    { ...TRANSFER, token: { address_hash: OTHER, decimals: 0 } },
    { ...TRANSFER, token_address: OTHER },
    { ...TRANSFER, token_address_hash: "not-an-address" },
    { ...TRANSFER, token: { ...TRANSFER.token, address: OTHER } },
  ]) {
    assertNoParticipation(transferResult(transfer));
  }
});

test("invalid holder addresses and the zero address cannot establish holder evidence", () => {
  const result = normalize({ holders: { items: [
    { address: "not-an-address" }, { address: ZERO }, { address: [WALLET] },
    { address: { hash: WALLET, address: OTHER } }, { address: {} },
  ] } });
  assert.deepEqual(result.holderAddresses, []);
  assert.deepEqual(result.wallets, []);
  assert.equal(result.holderCount, null);
  assert.equal(result.status, "UNKNOWN");
});

test("valid holders are normalized and deduplicated without inventing a census", () => {
  const result = normalize({ holders: { items: [
    { address: { hash: WALLET.toUpperCase().replace("0X", "0x") } },
    { address: WALLET }, { address: ZERO }, { address: "invalid" },
  ] } });
  assert.deepEqual(result.holderAddresses, [WALLET]);
  assert.deepEqual(result.wallets, [WALLET]);
  assert.equal(result.holderCount, null);
  assert.equal(result.status, "EVIDENCE_AVAILABLE");
});

test("explicit invalid or zero holder balances and conflicting holder tokens are not ownership proof", () => {
  const result = normalize({ holders: { items: [
    ...["0", 0, true, false, [], [5], "-5", "0x10", "1.5", (2n ** 256n).toString()]
      .map((value) => ({ address: WALLET, value })),
    { address: WALLET, token_address: OTHER, value: "5" },
  ] } });
  assert.deepEqual(result.holderAddresses, []);
  assert.deepEqual(result.wallets, []);
  assert.equal(result.status, "UNKNOWN");
  const valid = normalize({ holders: { items: [{ address: WALLET, value: "5" }] } });
  assert.deepEqual(valid.holderAddresses, [WALLET]);
});

test("malformed transfer endpoints cannot leak into participation or complete coverage", () => {
  for (const patch of [
    { from: "invalid" }, { to: null }, { to: [WALLET] },
    { from: { hash: POOL, address: OTHER } },
  ]) assertNoParticipation(transferResult({ ...TRANSFER, ...patch }));
});

test("malformed raw amounts remain unknown instead of being coerced into token units", () => {
  for (const value of [true, false, [], [5], {}, " ", "0x10", "1e3", "-5", -5,
    "1.5", 1.5, Infinity, "Infinity", "NaN", Number.MAX_SAFE_INTEGER + 1,
    (2n ** 256n).toString()]) {
    const result = transferResult({ ...TRANSFER, value }, { priceUsd: 2 });
    assert.equal(result.walletTransactions[0].tokenAmount, null, String(value));
    assert.equal(result.walletTransactions[0].estimatedCurrentValueUsd, null, String(value));
  }
});

test("missing, malformed or conflicting decimals and amount aliases stay unknown", () => {
  for (const transfer of [
    { ...TRANSFER, token: { address_hash: TOKEN } },
    ...[true, false, [], [0], " ", "0x0", "1e0", "0.0", -1, 37, 0.5]
      .map((decimals) => ({ ...TRANSFER, token: { address_hash: TOKEN, decimals } })),
    { ...TRANSFER, total: { value: "5", decimals: "18" } },
    { ...TRANSFER, amount: "6" },
  ]) {
    assert.equal(transferResult(transfer).walletTransactions[0].tokenAmount, null);
  }
});

test("current price estimates cannot contain coerced, negative or overflowing values", () => {
  for (const priceUsd of [true, false, [], [2], " ", "0x10", -1, "-1", Infinity, 1e308]) {
    const result = transferResult(TRANSFER, { priceUsd });
    assert.equal(result.walletTransactions[0].tokenAmount, 5);
    assert.equal(result.walletTransactions[0].estimatedCurrentValueUsd, null, String(priceUsd));
    assert.equal(result.walletTransactions[0].volumeUsd, null);
  }
});

test("invalid, ambiguous, future and stale timestamps cannot establish daily participation", () => {
  for (const timestamp of [null, "", true, [], ["2026-10-10T09:00:00Z"],
    "2026-10-10", "2026-10-10T09:00:00", "10/10/2026 09:00:00 GMT",
    "2026-10-09T24:00:00Z", "2026-02-30T09:00:00Z",
    "2026-10-10T11:00:00Z", "2026-10-09T09:59:59Z"]) {
    const result = transferResult({ ...TRANSFER, timestamp });
    assert.deepEqual(result.walletTransactions, [], String(timestamp));
    assert.deepEqual(result.wallets, [], String(timestamp));
    if (timestamp !== "2026-10-09T09:59:59Z") {
      assert.equal(result.transferCoverage.complete24h, false, String(timestamp));
      assert.equal(result.transferCoverage.observedTransfers24h, null, String(timestamp));
    }
  }
  assertNoParticipation(transferResult({ ...TRANSFER, block_timestamp: "2026-10-10T08:00:00Z" }));
});

test("conflicting or malformed token metadata quarantines the response", () => {
  for (const token of [
    { address_hash: OTHER, holders_count: "100" },
    { address_hash: "invalid", holders_count: "100" },
    { address_hash: TOKEN, address: OTHER, holders_count: "100" },
  ]) {
    const result = normalize({ token, transfers: { items: [TRANSFER] },
      holders: { items: [{ address: WALLET }] } });
    assertNoParticipation(result);
    assert.deepEqual(result.holderAddresses, []);
    assert.equal(result.holderCount, null);
    assert.equal(result.exactTokenIdentity, false);
    assert.equal(result.status, "UNKNOWN");
  }
});

test("conflicting token-level decimals cannot supply a concrete transfer amount", () => {
  const result = normalize({ token: { address_hash: TOKEN, decimals: "18" },
    transfers: { items: [TRANSFER] } });
  assert.equal(result.walletTransactions[0].tokenAmount, null);
});

test("holder counts must be explicit nonnegative safe integers with no conflicts", () => {
  for (const holders_count of [true, false, [], [7], {}, " ", "0x10", "1e3", "2.5", 2.5,
    -1, "-1", Infinity, "Infinity", Number.MAX_SAFE_INTEGER + 1, "9007199254740993"]) {
    const result = normalize({ token: { holders_count } });
    assert.equal(result.holderCount, null, String(holders_count));
    assert.equal(result.status, "UNKNOWN", String(holders_count));
  }
  for (const raw of [
    { token: { holders_count: "5", holder_count: "6" } },
    { token: { holders_count: "5" }, holders: { total_count: "6" } },
    { token: { holders_count: true, holder_count: "5" } },
  ]) assert.equal(normalize(raw).holderCount, null);
  assert.equal(normalize({ token: { holders_count: "0" },
    holders: { items: [{ address: WALLET, value: "5" }] } }).holderCount, null);
  for (const count of [0, "0", 7, "7"]) {
    const result = normalize({ token: { address_hash: TOKEN, holders_count: count } });
    assert.equal(result.holderCount, Number(count));
    assert.equal(result.status, "EVIDENCE_AVAILABLE");
  }
});

test("explicit non-EVM or malformed chains cannot carry exact wallet evidence", () => {
  for (const chain of ["solana", "unknown-chain", true, ["base"]]) {
    const result = normalize({ transfers: { items: [TRANSFER] },
      holders: { items: [{ address: WALLET }] }, token: { holders_count: "5" } }, {}, { ...META, chain });
    assertNoParticipation(result);
    assert.equal(result.exactTokenIdentity, false);
    assert.equal(result.holderCount, null);
    assert.equal(result.status, "UNKNOWN");
  }
});

test("a configured explorer cannot bypass exact EVM chain and token request gates", async () => {
  for (const project of [
    { tokenAddress: TOKEN }, { chain: "solana", tokenAddress: TOKEN },
    { chain: "unknown-chain", tokenAddress: TOKEN }, { chain: ["base"], tokenAddress: TOKEN },
    { chain: "base", tokenAddress: [TOKEN] }, { chain: "base", tokenAddress: ZERO },
  ]) {
    let calls = 0;
    const result = await getBlockscoutWalletEvidence(project, {
      blockscoutBaseUrl: "https://explorer.invalid",
      fetchJson: async () => { calls++; return { items: [], holders_count: "5" }; },
    });
    assert.equal(calls, 0);
    assert.equal(result.status, "UNKNOWN");
  }
});

test("malformed pagination and unordered cutoff rows cannot prove a complete day", () => {
  for (const next_page_params of [false, 0, "", true, "next", [], {}]) {
    const result = normalize({ transfers: { items: [TRANSFER], next_page_params } });
    assert.equal(result.transferCoverage.complete24h, false, String(next_page_params));
    assert.equal(result.transferCoverage.observedTransfers24h, null);
  }
  const result = normalize({ transfers: { items: [
    { ...TRANSFER, timestamp: "2026-10-09T09:00:00Z" }, TRANSFER,
  ], next_page_params: { block_number: 1 } } });
  assert.equal(result.transferCoverage.complete24h, false);
  assert.equal(result.transferCoverage.observedTransfers24h, null);
});

test("malformed requested identities cannot label evidence as exact", () => {
  for (const tokenAddress of ["", "invalid", ZERO, [TOKEN]]) {
    const result = normalize({ holders: { items: [{ address: WALLET }] },
      transfers: { items: [] }, token: { holders_count: "5" } }, {}, { ...META, tokenAddress });
    assertNoParticipation(result);
    assert.equal(result.exactTokenIdentity, false);
    assert.equal(result.holderCount, null);
    assert.equal(result.status, "UNKNOWN");
  }
  const result = normalize({}, {}, { ...META, poolAddress: "invalid" });
  assert.equal(result.poolAddress, null);
  assert.equal(result.exactPoolIdentity, false);
});

test("malformed response rows do not throw or become evidence", () => {
  const result = normalize({ transfers: { items: [null, true, [], "invalid"] },
    holders: { items: [null, true, [], "invalid"] } });
  assertNoParticipation(result);
  assert.deepEqual(result.holderAddresses, []);
  assert.equal(result.status, "UNKNOWN");
});

test("absent or malformed payloads stay unknown without throwing", () => {
  for (const raw of [null, true, [], "invalid", { transfers: null, holders: null, token: null }]) {
    const result = normalize(raw);
    assert.equal(result.status, "UNKNOWN");
    assert.equal(result.holderCount, null);
    assert.deepEqual(result.wallets, []);
    assert.deepEqual(result.walletTransactions, []);
    assert.equal(result.transferCoverage.complete24h, false);
  }
});

test("valid amount aliases, units and explicit zero amounts remain compatible", () => {
  for (const value of [0, "0", 5, "5"]) {
    const result = transferResult({ ...TRANSFER, value, amount: String(value),
      total: { value: String(value), decimals: "2" }, token: { address_hash: TOKEN, decimals: 2 } });
    assert.equal(result.walletTransactions[0].tokenAmount, Number(value) / 100);
    assert.equal(result.transferCoverage.complete24h, true);
  }
  const alternative = transferResult({ ...TRANSFER, token: null, token_address_hash: TOKEN,
    decimals: "0", from: POOL, to: WALLET });
  assert.equal(alternative.walletTransactions[0].tokenAmount, 5);
});

test("explicit offsets and the exact daily cutoff are accepted without using local time", () => {
  for (const timestamp of ["2026-10-10T02:00:00-07:00", "2026-10-09T10:00:00.000Z"]) {
    const result = transferResult({ ...TRANSFER, timestamp });
    assert.equal(result.walletTransactions.length, 1);
    assert.equal(result.walletTransactions[0].timestamp, new Date(timestamp).toISOString());
    assert.equal(result.transferCoverage.complete24h, true);
  }
  const result = normalize({ transfers: { items: [TRANSFER,
    { ...TRANSFER, timestamp: "2026-10-09T09:00:00Z" }], next_page_params: { block_number: 1 } } });
  assert.equal(result.transferCoverage.complete24h, true);
  assert.equal(result.transferCoverage.observedTransfers24h, 1);
  const invalidNow = normalize({ transfers: { items: [TRANSFER] } }, {}, { ...META, now: new Date(NaN) });
  assertNoParticipation(invalidNow);
});

test("valid wrapper requests remain bounded and normalize only injected offline responses", async () => {
  const calls = [];
  const result = await getBlockscoutWalletEvidence({ chainId: 8453, tokenAddress: TOKEN, poolAddress: POOL }, {
    blockscoutBaseUrl: "https://explorer.invalid/",
    now: () => NOW,
    fetchJson: async (url) => {
      calls.push(url);
      if (url.endsWith("/transfers?type=ERC-20")) return { items: [TRANSFER] };
      if (url.endsWith("/holders")) return { items: [{ address: WALLET, value: "5" }] };
      return { address_hash: TOKEN, holders_count: "1", decimals: "0" };
    },
  });
  assert.deepEqual(calls, [
    `https://explorer.invalid/api/v2/tokens/${TOKEN}/transfers?type=ERC-20`,
    `https://explorer.invalid/api/v2/tokens/${TOKEN}/holders`,
    `https://explorer.invalid/api/v2/tokens/${TOKEN}`,
  ]);
  assert.equal(result.status, "EVIDENCE_AVAILABLE");
  assert.equal(result.chain, "base");
  assert.equal(result.providerFailure, false);
  assert.equal(result.holderCount, 1);
  assert.deepEqual(result.wallets, [WALLET]);
  assert.equal(result.walletTransactions[0].direction, "TRANSFER");
});

test("injected transport failures stay visible without fabricating evidence", async () => {
  for (const failAll of [false, true]) {
    let calls = 0;
    const result = await getBlockscoutWalletEvidence({ chain: "base", tokenAddress: TOKEN }, {
      blockscoutBaseUrl: "https://explorer.invalid",
      now: () => NOW,
      fetchJson: async (url) => {
        calls++;
        if (!failAll && url.endsWith("/holders")) return { items: [{ address: WALLET, value: "5" }] };
        throw new Error("offline fixture failure");
      },
    });
    assert.equal(calls, 3);
    assert.equal(result.providerFailure, failAll);
    assert.equal(result.status, failAll ? "UNKNOWN" : "EVIDENCE_AVAILABLE");
    assert.equal(result.holderCount, null);
    assert.deepEqual(result.walletTransactions, []);
    assert.equal(result.transferCoverage.observedTransfers24h, null);
    assert.ok(result.warnings.some((warning) => warning.includes("offline fixture failure")));
  }
});

test("valid transfer evidence stays transfer-only, including mint and burn endpoints", () => {
  const result = normalize({ token: { address_hash: TOKEN, holders_count: "2", decimals: "0" },
    transfers: { items: [TRANSFER, { ...TRANSFER, from: ZERO }, { ...TRANSFER, to: ZERO }] } },
  { priceUsd: "2", trackedWallets: [WALLET], smartWallets: [WALLET] });
  assert.equal(result.exactTokenIdentity, true);
  assert.equal(result.exactPoolIdentity, true);
  assert.equal(result.holderCount, 2);
  assert.equal(result.transferCoverage.complete24h, true);
  assert.equal(result.transferCoverage.observedTransfers24h, 3);
  assert.deepEqual(result.wallets, [WALLET]);
  assert.equal(result.walletTransactions[0].poolMovement, "POOL_OUTFLOW");
  for (const row of result.walletTransactions) {
    assert.equal(row.direction, "TRANSFER");
    assert.equal(row.participant, null);
    assert.equal(row.smartWallet, null);
    assert.equal(row.tokenAmount, 5);
    assert.equal(row.estimatedCurrentValueUsd, 10);
    assert.equal(row.volumeUsd, null);
  }
  for (const field of ["buyerAddresses", "sellerAddresses", "uniqueBuyers24h", "buyTransactions24h",
    "sellTransactions24h", "buyVolumeUsd", "sellVolumeUsd", "smartWalletBuys24h", "smartWalletSells24h",
    "smartWalletBuyCount", "smartWalletSellCount", "smartWallets", "trackedWallets",
    "smartWalletBuyVolumeUsd", "smartWalletSellVolumeUsd"]) assert.equal(result[field], null, field);
  assert.deepEqual(result.tradeCoverage, { available: false, status: "UNKNOWN" });
});

test("known empty transfer coverage remains distinct from missing evidence", () => {
  assert.equal(normalize().status, "UNKNOWN");
  assert.equal(normalize().transferCoverage.observedTransfers24h, null);
  const empty = normalize({ transfers: { items: [] } });
  assert.equal(empty.status, "EVIDENCE_AVAILABLE");
  assert.equal(empty.transferCoverage.complete24h, true);
  assert.equal(empty.transferCoverage.observedTransfers24h, 0);
  assert.equal(empty.buyTransactions24h, null);
});
