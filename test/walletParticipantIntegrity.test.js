import test from "node:test";
import assert from "node:assert/strict";
import { securityHolderObservations, securityWalletEvidencePatch } from "../src/data/security/securityWalletEvidence.js";
import { normalizeBlockscoutWalletEvidence } from "../src/data/blockscoutWalletConnector.js";
import { getRpcWalletEvidence } from "../src/data/rpcWalletEvidenceConnector.js";
import { createEvmWalletParticipantFilter } from "../src/data/walletParticipantPolicy.js";
import { ERC20_TRANSFER_TOPIC, encodeAddressWord } from "../src/sensors/evmAbi.js";

const ZERO = `0x${"0".repeat(40)}`;
const DEAD = "0x000000000000000000000000000000000000dead";
const TOKEN = `0x${"1".repeat(40)}`;
const POOL = `0x${"2".repeat(40)}`;
const WALLET = `0x${"3".repeat(40)}`;
const OTHER = `0x${"4".repeat(40)}`;
const PAIR = `0x${"5".repeat(40)}`;
const HASH = `0x${"a".repeat(64)}`;
const NOW = new Date("2026-10-17T12:00:00.000Z");
const TIMESTAMP = "2026-10-17T11:59:00.000Z";
const PROJECT = { chain: "bsc", tokenAddress: TOKEN, poolAddress: POOL, pairAddress: PAIR };
const MAX_UINT256 = (2n ** 256n - 1n).toString();
const word = (amount) => `0x${BigInt(amount).toString(16).padStart(64, "0")}`;
const uppercase = (address) => address.toUpperCase().replace("0X", "0x");

function goPlus(holders) {
  return { provider: "goplus", status: "EVIDENCE_AVAILABLE", responseIdentityVerified: true,
    chain: "bsc", address: TOKEN, observedAt: TIMESTAMP, confidence: 85, raw: { holders } };
}

function explorerTransfer(patch = {}) {
  return { token: { address_hash: TOKEN, decimals: "0" }, from: POOL, to: WALLET,
    transaction_hash: HASH, timestamp: TIMESTAMP, value: "5", ...patch };
}

function blockscout(items = [], holders = [], token = {}) {
  return normalizeBlockscoutWalletEvidence({ transfers: { items }, holders: { items: holders }, token },
    PROJECT, { chain: "bsc", tokenAddress: TOKEN, poolAddress: POOL, now: NOW });
}

function rpcLog(patch = {}) {
  return { address: TOKEN, transactionHash: HASH, blockNumber: "0x100", logIndex: "0x0",
    data: word(5), topics: [ERC20_TRANSFER_TOPIC, `0x${encodeAddressWord(POOL)}`, `0x${encodeAddressWord(WALLET)}`],
    ...patch };
}

function logEndpoints(from, to, index = 0, amount = 5) {
  return rpcLog({ topics: [ERC20_TRANSFER_TOPIC, `0x${encodeAddressWord(from)}`, `0x${encodeAddressWord(to)}`],
    logIndex: `0x${index.toString(16)}`, data: word(amount) });
}

async function rpc(logs, { project = PROJECT, balance = word(0), ...extra } = {}) {
  const calls = [];
  const result = await getRpcWalletEvidence(project, { rpcUrl: "https://rpc.invalid", now: () => NOW,
    walletRpcMaxBalanceProbes: 0, ...extra,
    jsonRpc: async (url, method, params) => {
      calls.push({ method, params });
      assert.equal(url, "https://rpc.invalid");
      switch (method) {
        case "eth_chainId": return "0x38";
        case "eth_getBlockByNumber": return { number: "0x100", hash: HASH,
          timestamp: `0x${(NOW.getTime() / 1000 - 10).toString(16)}` };
        case "eth_getLogs": return logs;
        case "eth_call": return balance;
        default: assert.fail(`Unexpected RPC method: ${method}`);
      }
    } });
  return { result, calls };
}

function assertTransferOnly(result) {
  for (const row of result.walletTransactions) {
    assert.equal(row.direction, "TRANSFER");
    assert.equal(row.smartWallet, null);
    assert.equal(row.participant ?? null, null);
    assert.equal(row.accountType, undefined);
  }
  for (const field of ["uniqueBuyers24h", "buyTransactions24h", "sellTransactions24h", "smartWallets", "trackedWallets"]) {
    assert.equal(result[field], null, field);
  }
}

test("shared EVM participant policy excludes only canonical sinks and supplied contracts, without proving EOA", () => {
  const eligible = createEvmWalletParticipantFilter(uppercase(TOKEN), POOL, PAIR);
  for (const address of [ZERO, DEAD, uppercase(DEAD), ` ${DEAD} `, TOKEN, POOL, PAIR,
    null, undefined, [], [WALLET], {}, "0xdead", "invalid"]) assert.equal(eligible(address), false, String(address));
  for (const address of [WALLET, OTHER, ` ${WALLET} `, `0x${"d".repeat(40)}`]) {
    assert.equal(eligible(address), true, address);
  }
});

test("GoPlus exact BSC burn-only holder inventory leaves generic wallets unknown", () => {
  const evidence = goPlus([{ address: uppercase(DEAD), balance: "100" }, { address: ZERO, balance: "100" }]);
  const before = structuredClone(evidence);
  const observations = securityHolderObservations(PROJECT, [evidence], { now: NOW });
  assert.deepEqual(observations.map(({ field }) => field), ["holderAddresses"]);
  assert.deepEqual(observations[0].value, [DEAD]);
  const patch = securityWalletEvidencePatch(PROJECT, [evidence], { now: NOW });
  assert.equal(patch.wallets, undefined);
  assert.equal(patch.canonicalAliasProvenance.wallets, undefined);
  assert.deepEqual(evidence, before);
});

test("GoPlus mixed holders retain inventory but exclude zero, dead, token and both pool aliases from wallets", () => {
  const evidence = goPlus([ZERO, DEAD, TOKEN, POOL, PAIR, WALLET, uppercase(WALLET)]
    .map((address) => ({ address, balance: "0.00000000000000000000000001" })));
  const observations = securityHolderObservations(PROJECT, [evidence], { now: NOW });
  assert.deepEqual(observations[0].value, [DEAD, TOKEN, POOL, PAIR, WALLET]);
  assert.deepEqual(observations[1].value, [WALLET]);
  assert.equal(observations[1].source, "goplus");
  assert.equal(observations[1].sourceTimestamp, TIMESTAMP);
  assert.equal(observations[1].confidence, 0.85);
  assert.equal(observations[1].holderSampleOnly, true);
  assert.equal(observations[1].completeHolderCoverage, false);
  assert.equal(observations[1].buyerClassificationAvailable, false);
});

test("GoPlus token and pool holders alone do not provide generic wallets or alter balance eligibility", () => {
  const evidence = goPlus([TOKEN, POOL, PAIR].map((address) => ({ address, balance: "1" }))
    .concat([{ address: WALLET, balance: "0" }, { address: OTHER, balance: "malformed" }]));
  const observations = securityHolderObservations(PROJECT, [evidence], { now: NOW });
  assert.deepEqual(observations.map(({ field }) => field), ["holderAddresses"]);
  assert.deepEqual(observations[0].value, [TOKEN, POOL, PAIR]);
});

test("Blockscout burn-only inventory and transfer records survive without generic participant wallets", () => {
  const items = [explorerTransfer({ from: ZERO, to: DEAD }), explorerTransfer({ from: DEAD, to: ZERO })];
  const before = structuredClone(items);
  const result = blockscout(items, [{ address: uppercase(DEAD), value: "5" }]);
  assert.deepEqual(result.wallets, []);
  assert.deepEqual(result.holderAddresses, [DEAD]);
  assert.deepEqual(result.walletTransactions.map(({ from, to }) => [from, to]), [[ZERO, DEAD], [DEAD, ZERO]]);
  assert.deepEqual(result.walletParticipationHistory, result.walletTransactions);
  assert.deepEqual(items, before);
  assertTransferOnly(result);
});

test("Blockscout excludes token and both pool aliases without removing raw holders or transfer endpoints", () => {
  const result = blockscout([explorerTransfer({ from: TOKEN, to: POOL }),
    explorerTransfer({ from: PAIR, to: TOKEN })], [DEAD, TOKEN, POOL, PAIR].map((address) => ({ address, value: "5" })));
  assert.deepEqual(result.holderAddresses, [DEAD, TOKEN, POOL, PAIR]);
  assert.deepEqual(result.wallets, []);
  assert.equal(result.walletTransactions.length, 2);
  assert.equal(result.walletTransactions[1].from, PAIR);
  assert.equal(result.exactTokenIdentity, true);
  assert.equal(result.exactPoolIdentity, true);
});

test("Blockscout mixed burn and ordinary endpoints recover only ordinary participants, not buyers", () => {
  const result = blockscout([explorerTransfer({ from: uppercase(DEAD), to: WALLET }),
    explorerTransfer({ from: OTHER, to: ZERO }), explorerTransfer({ from: TOKEN, to: PAIR })],
  [DEAD, TOKEN, POOL, PAIR, WALLET].map((address) => ({ address, value: "5" })));
  assert.deepEqual(result.wallets, [WALLET, OTHER]);
  assert.equal(result.walletTransactions.length, 3);
  assert.equal(result.walletTransactions[0].from, DEAD);
  assert.equal(result.walletTransactions[0].tokenAmountRaw, "5");
  assert.equal(result.transferCoverage.observedTransfers24h, 3);
  assertTransferOnly(result);
});

test("Blockscout exact zero raw transfers remain records but cannot establish participants", () => {
  for (const value of [0, "0", "0000"]) {
    const result = blockscout([explorerTransfer({ from: WALLET, to: OTHER, value })]);
    assert.deepEqual(result.wallets, [], String(value));
    assert.equal(result.walletTransactions.length, 1);
    assert.equal(result.walletTransactions[0].tokenAmountRaw, "0");
    assert.equal(result.walletTransactions[0].tokenAmount, 0);
    assert.equal(result.transferCoverage.complete24h, true);
    assertTransferOnly(result);
  }
});

test("Blockscout missing, malformed and conflicting raw transfer amounts cannot invent participants", () => {
  const patches = [undefined, null, true, false, [], [5], {}, "", " ", "0x10", "1e3", "-1", -1,
    "1.5", 1.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1, (2n ** 256n).toString()]
    .map((value) => ({ value }));
  patches.push({ amount: "6" }, { total: { value: "6", decimals: "0" } }, { token: { address_hash: TOKEN, value: "6" } });
  for (const patch of patches) {
    const result = blockscout([explorerTransfer({ from: WALLET, to: OTHER, ...patch })]);
    assert.deepEqual(result.wallets, [], JSON.stringify(patch));
    assert.equal(result.walletTransactions.length, 1);
    assert.equal(result.walletTransactions[0].tokenAmountRaw, null);
    assert.equal(result.walletTransactions[0].tokenAmount, null);
    assert.equal(result.walletTransactions[0].estimatedCurrentValueUsd, null);
  }
});

test("Blockscout positive raw uint256 proves participation independently of decimal display units", () => {
  for (const value of ["1", "9007199254740993", MAX_UINT256]) {
    for (const decimals of [undefined, null, "malformed", 37]) {
      const result = blockscout([explorerTransfer({ value, token: { address_hash: TOKEN, decimals } })]);
      assert.deepEqual(result.wallets, [WALLET]);
      assert.equal(result.walletTransactions[0].tokenAmountRaw, value);
      assert.equal(result.walletTransactions[0].tokenAmount, null);
      assert.equal(result.walletTransactions[0].estimatedCurrentValueUsd, null);
    }
  }
  const conflict = blockscout([explorerTransfer({ total: { value: "5", decimals: "18" } })]);
  assert.deepEqual(conflict.wallets, [WALLET]);
  assert.equal(conflict.walletTransactions[0].tokenAmountRaw, "5");
  assert.equal(conflict.walletTransactions[0].tokenAmount, null);
});

test("Blockscout matching positive raw aliases preserve exact amounts and do not change holder proof", () => {
  const result = blockscout([explorerTransfer({ value: "0005", amount: 5, total: { value: "5", decimals: "0" } }),
    explorerTransfer({ from: OTHER, to: PAIR, value: "0" }),
    explorerTransfer({ from: OTHER, to: TOKEN, value: "unknown" })], [{ address: WALLET, value: "1" }]);
  assert.deepEqual(result.wallets, [WALLET]);
  assert.deepEqual(result.holderAddresses, [WALLET]);
  assert.equal(result.walletTransactions[0].tokenAmountRaw, "5");
  assert.equal(result.walletTransactions[0].tokenAmount, 5);
  assert.equal(result.walletTransactions.length, 3);
});

test("RPC burn-only and token/pool-only transfers retain raw semantics without generic participants", async () => {
  const logs = [logEndpoints(ZERO, DEAD), logEndpoints(DEAD, ZERO, 1), logEndpoints(TOKEN, POOL, 2),
    logEndpoints(PAIR, TOKEN, 3)];
  const before = structuredClone(logs);
  const { result, calls } = await rpc(logs);
  assert.deepEqual(result.wallets, []);
  assert.deepEqual(result.holderAddresses, []);
  assert.equal(result.walletTransactions.length, 4);
  assert.deepEqual(result.walletTransactions.map(({ from, to }) => [from, to]),
    [[ZERO, DEAD], [DEAD, ZERO], [TOKEN, POOL], [PAIR, TOKEN]]);
  assert.deepEqual(result.walletParticipationHistory, result.walletTransactions);
  assert.deepEqual(logs, before);
  assert.equal(calls.length, 3);
  assertTransferOnly(result);
});

test("RPC mixed ordinary and burn endpoints establish only positive-value ordinary participants", async () => {
  const { result, calls } = await rpc([logEndpoints(DEAD, WALLET), logEndpoints(OTHER, ZERO, 1, MAX_UINT256),
    logEndpoints(TOKEN, PAIR, 2), logEndpoints(POOL, PAIR, 3)]);
  assert.equal(result.status, "EVIDENCE_AVAILABLE");
  assert.deepEqual(result.wallets, [WALLET, OTHER]);
  assert.equal(result.walletTransactions[1].tokenAmountRaw, MAX_UINT256);
  assert.equal(result.chain, "bsc");
  assert.equal(result.sourceTimestamp, new Date(NOW.getTime() - 10_000).toISOString());
  assert.equal(result.confidence, 0.85);
  assert.equal(result.transferCoverage.complete24h, false);
  assert.equal(calls.length, 3);
  assertTransferOnly(result);
});

test("RPC zero-value transfers remain raw records without creating participants", async () => {
  const { result, calls } = await rpc([logEndpoints(WALLET, OTHER, 0, 0)]);
  assert.deepEqual(result.wallets, []);
  assert.deepEqual(result.holderAddresses, []);
  assert.equal(result.walletTransactions.length, 1);
  assert.equal(result.walletTransactions[0].tokenAmountRaw, "0");
  assert.equal(calls.length, 3);
  assertTransferOnly(result);
});

test("RPC malformed, absent, oversized or coerced raw amounts stay UNKNOWN", async () => {
  for (const data of [undefined, null, "0x", "0x1", "0x-1", "5", "0x" + "f".repeat(65),
    "0x" + "g".repeat(64), [word(1)], {}, true, 0]) {
    const { result, calls } = await rpc([rpcLog({ data })]);
    assert.equal(result.status, "UNKNOWN", String(data));
    assert.equal(result.wallets?.length || 0, 0);
    assert.equal(result.walletTransactions?.length || 0, 0);
    assert.equal(calls.length, 3);
  }
});

test("RPC one positive raw unit is sufficient without inventing decimals or account labels", async () => {
  const { result } = await rpc([logEndpoints(POOL, WALLET, 0, 1)]);
  assert.deepEqual(result.wallets, [WALLET]);
  assert.equal(result.walletTransactions[0].tokenAmountRaw, "1");
  assert.equal(result.walletTransactions[0].tokenAmount, undefined);
  assertTransferOnly(result);
});

test("RPC sink and contract seed labels cannot become holders or consume balance probes", async () => {
  const { result, calls } = await rpc([], { walletRpcMaxBalanceProbes: 3, balance: word(1),
    walletRpcHolderSeeds: [ZERO, uppercase(DEAD), TOKEN, POOL, PAIR] });
  assert.equal(result.status, "UNKNOWN");
  assert.deepEqual(result.wallets, []);
  assert.deepEqual(result.holderAddresses, []);
  assert.equal(result.holderCoverage.balanceProbeAttempts, 0);
  assert.equal(calls.length, 3);
});

test("RPC eligible positive seeded balance remains ownership evidence, not zero-transfer activity", async () => {
  const { result, calls } = await rpc([logEndpoints(OTHER, POOL, 0, 0)], {
    walletRpcMaxBalanceProbes: 2, walletRpcHolderSeeds: [DEAD, TOKEN, POOL, PAIR, WALLET], balance: word(7),
  });
  assert.deepEqual(result.wallets, [WALLET]);
  assert.deepEqual(result.holderAddresses, [WALLET]);
  assert.equal(result.holderBalanceEvidence[0].balanceRaw, "7");
  assert.equal(result.holderBalanceEvidence[0].accountType, "UNKNOWN");
  assert.equal(result.holderBalanceEvidence[0].role, "UNKNOWN");
  assert.equal(result.walletTransactions[0].tokenAmountRaw, "0");
  assert.deepEqual(calls[3].params, [{ to: TOKEN, data: "0x70a08231" + encodeAddressWord(WALLET) },
    { blockHash: HASH, requireCanonical: true }]);
  assert.equal(calls.length, 4);
});
