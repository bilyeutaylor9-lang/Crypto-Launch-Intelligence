import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { appendWalletParticipationHistory, loadWalletParticipationHistory, walletParticipationHistoryFor } from "../src/data/walletParticipationHistoryStore.js";
import { createActiveEvidenceExecutionState, executeActiveEvidenceProviderRequests } from "../src/data/activeEvidenceProviderExecutor.js";
import { packScannerState, restoreScannerState } from "../src/ops/scannerStateBundle.js";
import { getRpcWalletEvidence } from "../src/data/rpcWalletEvidenceConnector.js";
import { ERC20_TRANSFER_TOPIC, encodeAddressWord } from "../src/sensors/evmAbi.js";

const TOKEN = `0x${"1".repeat(40)}`;
const WALLET = `0x${"2".repeat(40)}`;
const POOL = `0x${"3".repeat(40)}`;
const HASH = `0x${"4".repeat(64)}`;
const PROJECT = { chain: "base", tokenAddress: TOKEN, poolAddress: POOL };
const NOW = Date.parse("2026-10-09T12:00:00Z");
function proof(overrides = {}) {
  return { provider: "blockscout-wallets", status: "EVIDENCE_AVAILABLE", chain: "base",
    tokenAddress: TOKEN, poolAddress: POOL, exactTokenIdentity: true,
    observedAt: "2026-10-09T10:00:00Z", walletTransactions: [{ transactionHash: HASH,
      timestamp: "2026-10-09T09:00:00Z", from: POOL, to: WALLET, direction: "BUY",
      tokenAmount: 3, volumeUsd: 999, smartWallet: true }], ...overrides };
}
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "wallet-history-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { root, file: path.join(root, "data/wallet-participation-history.jsonl"), nowMs: NOW };
}
const request = (field) => ({ field, targetSources: [{ source: "wallet-history database" }] });

test("wallet history preserves exact raw provenance without storing inferred trades, volumes or smart labels", (t) => {
  const options = fixture(t);
  assert.equal(appendWalletParticipationHistory(PROJECT, proof(), options).appended, 1);
  const history = walletParticipationHistoryFor(PROJECT, options);
  assert.equal(history.length, 1);
  assert.equal(history[0].source, "blockscout-wallets");
  assert.equal(history[0].sourceTimestamp, "2026-10-09T10:00:00.000Z");
  assert.equal(history[0].timestamp, "2026-10-09T09:00:00.000Z");
  assert.equal(history[0].direction, "TRANSFER");
  assert.equal(history[0].volumeUsd, null);
  assert.equal(history[0].smartWallet, null);
  assert.equal(history[0].historicalOnly, true);
  assert.equal(history[0].verificationStatus, "EXACT_CHAIN_TOKEN_TRANSFER_OBSERVATION");
  assert.equal(walletParticipationHistoryFor({ ...PROJECT, chain: "8453" }, options).length, 1);
});

test("history rejects cross-chain, wrong-token and symbol-only identity", (t) => {
  const options = fixture(t);
  appendWalletParticipationHistory(PROJECT, proof(), options);
  for (const project of [{ ...PROJECT, chain: "ethereum" }, { ...PROJECT, tokenAddress: WALLET }, { symbol: "ABC" }]) {
    assert.deepEqual(walletParticipationHistoryFor(project, options), []);
  }
  assert.equal(appendWalletParticipationHistory(PROJECT, proof({ chain: "ethereum" }), options).appended, 0);
  assert.equal(appendWalletParticipationHistory(PROJECT, proof({ tokenAddress: WALLET }), options).appended, 0);
});

test("historical recovery preserves weaker provider confidence and rejects zero-confidence proof", async (t) => {
  const options = fixture(t);
  appendWalletParticipationHistory(PROJECT, proof({ confidence: 65 }), options);
  const result = await executeActiveEvidenceProviderRequests(PROJECT, [request("walletParticipationHistory")], { walletHistory: options });
  assert.equal(result.observations[0].confidence, 0.65);
  assert.equal(result.observations[0].value[0].confidence, 0.65);
  for (const confidence of [0, -1, NaN, "invalid", 101, true, false, [], {}, null, ""]) {
    assert.equal(appendWalletParticipationHistory(PROJECT, proof({ confidence }), options).appended, 0);
  }
});

test("unknown, unpinned and unsupported provider evidence never enters wallet memory", (t) => {
  const options = fixture(t);
  for (const patch of [{ status: "UNKNOWN" }, { exactTokenIdentity: false }, { provider: "untrusted" },
    { chain: null }, { tokenAddress: null }, { observedAt: null }]) {
    assert.equal(appendWalletParticipationHistory(PROJECT, proof(patch), options).appended, 0);
  }
  assert.equal(fs.existsSync(options.file), false);
});

test("malformed and future transfer observations remain unavailable", (t) => {
  const options = fixture(t);
  for (const patch of [{ observedAt: "invalid" }, { observedAt: "2026-10-10T00:00:00Z" },
    { walletTransactions: [{ ...proof().walletTransactions[0], timestamp: "2026-10-09T11:00:00Z" }] },
    { walletTransactions: [{ ...proof().walletTransactions[0], transactionHash: "unknown" }] }]) {
    assert.equal(appendWalletParticipationHistory(PROJECT, proof(patch), options).appended, 0);
  }
});

test("bounded RPC block observations survive without fabricating transaction time or token units", (t) => {
  const options = fixture(t);
  const evidence = proof({ provider: "rpc-wallets", transferCoverage: { fromBlock: 100, toBlock: 110, complete24h: false },
    walletTransactions: [{ ...proof().walletTransactions[0], timestamp: null, blockNumber: 105,
      logIndex: "0x2", tokenAmount: null, tokenAmountRaw: "1000000000000000000" }] });
  assert.equal(appendWalletParticipationHistory(PROJECT, evidence, options).appended, 1);
  const row = walletParticipationHistoryFor(PROJECT, options)[0];
  assert.equal(row.timestamp, null);
  assert.equal(row.blockNumber, 105);
  assert.equal(row.tokenAmount, null);
  assert.equal(row.tokenAmountRaw, "1000000000000000000");
  assert.equal(row.tokenAmountUnitsVerified, false);
  assert.equal(appendWalletParticipationHistory(PROJECT, { ...evidence, transferCoverage: null }, options).appended, 0);
  assert.equal(appendWalletParticipationHistory(PROJECT, { ...evidence, transferCoverage: { fromBlock: 106, toBlock: 110 } }, options).appended, 0);
});

test("repeated observations deduplicate participation without refreshing its original source time", (t) => {
  const options = fixture(t);
  appendWalletParticipationHistory(PROJECT, proof(), options);
  appendWalletParticipationHistory(PROJECT, proof({ observedAt: "2026-10-09T11:00:00Z" }), options);
  const history = walletParticipationHistoryFor(PROJECT, options);
  assert.equal(history.length, 1);
  assert.equal(history[0].sourceTimestamp, "2026-10-09T10:00:00.000Z");
});

test("actual active recovery saves live transfers and reuses history after execution-state restart", async (t) => {
  const historyOptions = fixture(t);
  let calls = 0;
  const options = { walletHistory: historyOptions, maxProviderRequests: 3,
    providers: { getWalletEvidence: async () => { calls += 1; return proof(); } } };
  const first = await executeActiveEvidenceProviderRequests(PROJECT, [request("walletParticipationHistory")], options);
  assert.equal(first.observations.find((item) => item.field === "walletParticipationHistory").value[0].direction, "TRANSFER");
  assert.equal(loadWalletParticipationHistory(historyOptions).length, 1);
  const state = createActiveEvidenceExecutionState(options);
  const replay = await executeActiveEvidenceProviderRequests(PROJECT, [request("walletParticipationHistory")], options, state);
  assert.equal(calls, 1);
  assert.equal(state.requestsUsed, 0);
  assert.equal(replay.observations.length, 1);
  assert.equal(replay.observations[0].source, "wallet-history database");
  assert.equal(replay.observations[0].historicalOnly, true);
  assert.equal(replay.projectPatch.walletHistory.smartWallets, null);
});

test("actual RPC fallback persists pinned transfers and replays them without provider requests", async (t) => {
  const historyOptions = { file: fixture(t).file };
  const rpcCalls = [];
  let explorerCalls = 0;
  const options = { walletHistory: historyOptions, maxProviderRequests: 6, providers: {
    getBlockscoutWalletEvidence: async () => { explorerCalls++; return { status: "UNKNOWN" }; },
    getRpcWalletEvidence: (project) => getRpcWalletEvidence(project, { rpcUrl: "https://rpc.invalid",
      jsonRpc: async (url, method) => {
        rpcCalls.push(method);
        return { eth_chainId: "0x2105", eth_getBlockByNumber: { number: "0x100", timestamp: "0x10000" },
          eth_getLogs: [{ address: TOKEN, transactionHash: HASH, blockNumber: "0x100", logIndex: "0x0",
            data: `0x${"0".repeat(63)}5`, topics: [ERC20_TRANSFER_TOPIC,
              `0x${encodeAddressWord(POOL)}`, `0x${encodeAddressWord(WALLET)}`] }] }[method];
      } }),
  } };
  const state = createActiveEvidenceExecutionState(options);
  const first = await executeActiveEvidenceProviderRequests(PROJECT, [request("walletParticipationHistory")], options, state);
  const history = first.observations.find((item) => item.field === "walletParticipationHistory");
  assert.equal(state.requestsUsed, 6);
  assert.deepEqual(rpcCalls, ["eth_chainId", "eth_getBlockByNumber", "eth_getLogs"]);
  assert.equal(history.verificationStatus, "VERIFIED_HISTORICAL_RAW_OBSERVATION");
  assert.equal(history.value[0].timestamp, null);
  assert.equal(history.value[0].blockNumber, 256);
  assert.equal(history.value[0].tokenAmountRaw, "5");
  assert.equal(history.value[0].tokenAmount, null);
  assert.equal(history.value[0].smartWallet, null);
  assert.equal(history.value[0].direction, "TRANSFER");
  assert.equal(loadWalletParticipationHistory(historyOptions)[0].provider, "rpc-wallets");
  const restarted = createActiveEvidenceExecutionState(options);
  const replay = await executeActiveEvidenceProviderRequests(PROJECT, [request("walletParticipationHistory")], options, restarted);
  assert.equal(restarted.requestsUsed, 0);
  assert.equal(explorerCalls, 1);
  assert.equal(rpcCalls.length, 3);
  assert.deepEqual(replay.observations[0].value, history.value);
  assert.equal(replay.observations.some((item) => item.field === "smartWallets" || item.field === "uniqueBuyers24h"), false);
});

test("historical participation cannot satisfy fresh buyer counts, volume or smart-wallet evidence", async (t) => {
  const historyOptions = fixture(t);
  appendWalletParticipationHistory(PROJECT, proof(), historyOptions);
  let calls = 0;
  const result = await executeActiveEvidenceProviderRequests(PROJECT,
    [request("uniqueBuyers24h"), request("smartWalletBuys24h"), request("buyVolumeUsd")],
    { walletHistory: historyOptions, providers: { getWalletEvidence: async () => { calls += 1; return { status: "UNKNOWN" }; } } });
  assert.equal(calls, 0);
  assert.deepEqual(result.observations, []);
  assert.equal(result.projectPatch.walletHistory, undefined);
});

test("history-only recovery uses no external provider even when request budget cannot fit a wallet call", async (t) => {
  const historyOptions = fixture(t);
  appendWalletParticipationHistory(PROJECT, proof(), historyOptions);
  const options = { walletHistory: historyOptions, maxProviderRequests: 1,
    providers: { getWalletEvidence: async () => { throw new Error("external call forbidden"); } } };
  const state = createActiveEvidenceExecutionState(options);
  const result = await executeActiveEvidenceProviderRequests(PROJECT, [request("walletParticipationHistory")], options, state);
  assert.equal(result.observations.length, 1);
  assert.equal(state.requestsUsed, 0);
  assert.equal(result.attempts[0].status, "LOCAL_EVIDENCE_AVAILABLE");
});

test("corrupt history lines do not fabricate records or erase valid observations", (t) => {
  const options = fixture(t);
  appendWalletParticipationHistory(PROJECT, proof(), options);
  fs.appendFileSync(options.file, "not-json\n{\n");
  assert.equal(loadWalletParticipationHistory(options).length, 1);
});

test("wallet-memory I/O failures stay visible without discarding valid live evidence", async (t) => {
  const options = fixture(t);
  fs.mkdirSync(options.file, { recursive: true });
  const result = await executeActiveEvidenceProviderRequests(PROJECT, [request("walletParticipationHistory")],
    { walletHistory: options, providers: { getWalletEvidence: async () => proof() } });
  assert.equal(result.observations[0].value.length, 1);
  assert.ok(result.attempts.some((row) => row.status === "MEMORY_READ_FAILED"));
  assert.ok(result.attempts.some((row) => row.status === "MEMORY_WRITE_FAILED"));
});

test("EVM transfer history cannot invent Solana creator or wallet semantics", (t) => {
  const options = fixture(t);
  const project = { chain: "solana", tokenAddress: "So11111111111111111111111111111111111111112" };
  assert.equal(appendWalletParticipationHistory(project, proof({ ...project }), options).appended, 0);
  assert.deepEqual(walletParticipationHistoryFor(project, options), []);
});

test("canonical state restores wallet history without changing evidence bytes or timestamps", (t) => {
  const options = fixture(t);
  appendWalletParticipationHistory(PROJECT, proof(), options);
  const bytes = fs.readFileSync(options.file, "utf8");
  packScannerState({ root: options.root, writeReport: false });
  fs.rmSync(path.join(options.root, "data"), { recursive: true });
  assert.equal(restoreScannerState({ root: options.root, writeReport: false }).restored, 1);
  assert.equal(fs.readFileSync(options.file, "utf8"), bytes);
  assert.equal(walletParticipationHistoryFor(PROJECT, options)[0].sourceTimestamp, "2026-10-09T10:00:00.000Z");
});
