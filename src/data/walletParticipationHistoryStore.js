import path from "node:path";
import { appendMemorySidecar, readMemorySidecarTail } from "../learning/boundedMemoryStore.js";
import { chainKind, normalizeChainId, normalizeTokenAddress } from "../identity/strictIdentityValidators.js";

export const WALLET_PARTICIPATION_HISTORY_FILE = path.resolve("data/wallet-participation-history.jsonl");
const PROVIDERS = new Set(["blockscout-wallets", "rpc-wallets"]);

function identity(project = {}) {
  const chain = normalizeChainId(project.chain || project.chainId || project.network);
  const tokenAddress = normalizeTokenAddress(project.tokenAddress || project.contractAddress || project.address, chain);
  return chainKind(chain) === "evm" && tokenAddress ? { chain, tokenAddress } : null;
}

function instant(value) {
  const ms = typeof value === "string" && value ? Date.parse(value) : NaN;
  return Number.isFinite(ms) ? ms : null;
}

function fileOf(options = {}) {
  return options.file || WALLET_PARTICIPATION_HISTORY_FILE;
}

function observedNumber(value) {
  if (!["number", "string"].includes(typeof value) || String(value).trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function normalizeWalletParticipationObservation(project = {}, evidence = {}, options = {}) {
  const expected = identity(project);
  const actual = identity(evidence);
  const observedMs = instant(evidence.observedAt);
  const now = options.nowMs ?? Date.now();
  const rawConfidence = evidence.confidence === undefined ? 0.82 : observedNumber(evidence.confidence);
  const confidence = rawConfidence === null ? NaN : rawConfidence > 1 ? rawConfidence / 100 : rawConfidence;
  if (!expected || !actual || expected.chain !== actual.chain || expected.tokenAddress !== actual.tokenAddress ||
      !PROVIDERS.has(evidence.provider) || evidence.status !== "EVIDENCE_AVAILABLE" ||
      evidence.exactTokenIdentity !== true || observedMs === null || observedMs > now ||
      !Number.isFinite(confidence) || confidence <= 0 || confidence > 1) return null;
  const poolAddress = normalizeTokenAddress(evidence.poolAddress, expected.chain);
  const transferCoverage = evidence.transferCoverage || null;
  const transactions = (Array.isArray(evidence.walletTransactions) ? evidence.walletTransactions : [])
    .slice(0, 200).flatMap((row) => {
      const transactionHash = String(row.transactionHash || "").toLowerCase();
      const timestamp = instant(row.timestamp);
      const blockNumber = observedNumber(row.blockNumber);
      const blockPinned = evidence.provider === "rpc-wallets" && Number.isSafeInteger(blockNumber) &&
        Number.isSafeInteger(transferCoverage?.fromBlock) && transferCoverage.fromBlock >= 0 &&
        Number.isSafeInteger(transferCoverage?.toBlock) && transferCoverage.toBlock >= transferCoverage.fromBlock &&
        blockNumber >= transferCoverage.fromBlock && blockNumber <= transferCoverage.toBlock;
      const from = normalizeTokenAddress(row.from, expected.chain);
      const to = normalizeTokenAddress(row.to, expected.chain);
      if (!/^0x[0-9a-f]{64}$/.test(transactionHash) || (timestamp === null && !blockPinned) ||
        (timestamp !== null && timestamp > observedMs) || !from || !to) return [];
      const index = observedNumber(row.logIndex);
      const logIndex = Number.isSafeInteger(index) && index >= 0 ? index : null;
      const amount = observedNumber(row.reportedTokenAmount ?? row.tokenAmount);
      const rawAmount = typeof row.tokenAmountRaw === "string" && /^\d{1,78}$/.test(row.tokenAmountRaw) &&
        BigInt(row.tokenAmountRaw) < 2n ** 256n ? row.tokenAmountRaw : null;
      // A transfer is historical participation, not a verified swap or wallet label.
      return [{ transactionHash, logIndex, timestamp: timestamp === null ? null : new Date(timestamp).toISOString(),
        blockNumber: Number.isSafeInteger(blockNumber) && blockNumber >= 0 ? blockNumber : null, from, to,
        tokenAmount: null, tokenAmountUnitsVerified: false, tokenAmountRaw: rawAmount,
        reportedTokenAmount: Number.isFinite(amount) && amount >= 0 ? amount : null, direction: "TRANSFER",
        volumeUsd: null, smartWallet: null }];
    });
  if (!transactions.length) return null;
  return { schemaVersion: 1, ...actual, poolAddress, provider: evidence.provider,
    confidence: Math.min(0.82, confidence),
    observedAt: new Date(observedMs).toISOString(), status: "EVIDENCE_AVAILABLE", exactTokenIdentity: true,
    transferCoverage, walletTransactions: transactions };
}

export function loadWalletParticipationHistory(options = {}) {
  const file = fileOf(options);
  return readMemorySidecarTail(file, { sidecarPath: file, limit: 5000, maxBytes: 8 * 1024 * 1024 })
    .flatMap((row) => normalizeWalletParticipationObservation(row, row, options) || []);
}

export function appendWalletParticipationHistory(project = {}, evidence = {}, options = {}) {
  const row = normalizeWalletParticipationObservation(project, evidence, options);
  if (!row) return { appended: 0, observation: null };
  const file = fileOf(options);
  const result = appendMemorySidecar(file, [row], { sidecarPath: file, recordType: "wallet-participation",
    env: { ...process.env, MEMORY_SIDECAR_MAX_MB: "32" } });
  return { ...result, observation: row };
}

export function walletParticipationHistoryFor(project = {}, options = {}) {
  const expected = identity(project);
  if (!expected) return [];
  const records = options.records || loadWalletParticipationHistory(options);
  const events = new Map();
  for (const raw of records) {
    const row = normalizeWalletParticipationObservation(project, raw, options);
    if (!row) continue;
    for (const transaction of row.walletTransactions) {
      const key = JSON.stringify([transaction.transactionHash, transaction.logIndex, transaction.from,
        transaction.to, transaction.timestamp, transaction.blockNumber, transaction.reportedTokenAmount, transaction.tokenAmountRaw]);
      const current = events.get(key);
      if (current && current.sourceTimestamp <= row.observedAt) continue;
      events.set(key, { ...transaction, ...expected, poolAddress: row.poolAddress,
        source: row.provider, sourceTimestamp: row.observedAt, confidence: row.confidence,
        verificationStatus: "EXACT_CHAIN_TOKEN_TRANSFER_OBSERVATION", historicalOnly: true });
    }
  }
  return [...events.values()].sort((a, b) => (a.timestamp || a.sourceTimestamp).localeCompare(b.timestamp || b.sourceTimestamp)).slice(-1000);
}
