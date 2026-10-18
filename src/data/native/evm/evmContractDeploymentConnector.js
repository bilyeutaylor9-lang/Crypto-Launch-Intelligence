import { NativePoolAdapter, NATIVE_EVENT_TYPES } from "../NativePoolAdapter.js";
import { recordNativeEvents, updateNativeCheckpoint } from "../nativeEventStore.js";
import {
  normalizeChainId,
  normalizeAddress,
  SUPPORTED_CHAIN_REGISTRY,
} from "../../../identity/strictIdentityValidators.js";
import { jsonRpc } from "../../../sensors/rpcJsonClient.js";

const DEFAULT_LIMITS = { maxBlocks: 4, maxReceipts: 16, maxRequests: 32, maxTransactionsPerBlock: 2_000, timeBudgetMs: 8_000, rpcTimeoutMs: 2_500 };
const HARD_LIMITS = { maxBlocks: 32, maxReceipts: 128, maxRequests: 256, maxTransactionsPerBlock: 10_000, timeBudgetMs: 30_000, rpcTimeoutMs: 5_000 };
const HASH = /^0x[0-9a-f]{64}$/i;

function hash(value) {
  return typeof value === "string" && HASH.test(value) && !/^0x0{64}$/i.test(value)
    ? value.toLowerCase() : null;
}

function quantity(value) {
  if (typeof value !== "string" || !/^0x(?:0|[1-9a-f][0-9a-f]*)$/i.test(value)) return null;
  const parsed = Number(BigInt(value));
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function blockNumber(value) {
  if (typeof value === "string" && value.startsWith("0x")) return quantity(value);
  if (typeof value !== "number" && !(typeof value === "string" && /^\d+$/.test(value))) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function address(value, chain) {
  const normalized = normalizeAddress(value, chain);
  return normalized && !/^0x0{40}$/.test(normalized) ? normalized : null;
}

function evmChain(value) {
  const chain = normalizeChainId(value);
  return SUPPORTED_CHAIN_REGISTRY[chain]?.kind === "evm" ? chain : null;
}

function stop(status, reason, limitReason = null) {
  const error = new Error(reason);
  Object.assign(error, { collectionStatus: status, limitReason });
  throw error;
}

function limitsFor(options) {
  const limits = {};
  for (const key of Object.keys(DEFAULT_LIMITS)) {
    const value = options[key] === undefined ? DEFAULT_LIMITS[key] : options[key];
    if ((typeof value !== "number" && typeof value !== "string") || String(value).trim() === "") return null;
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 0) return null;
    limits[key] = Math.min(parsed, HARD_LIMITS[key]);
  }
  limits.rpcTimeoutMs = Math.max(500, limits.rpcTimeoutMs);
  return limits;
}

function deploymentEvent(transaction, receipt, block, chain, codeChecked) {
  const contractAddress = address(receipt.contractAddress, chain);
  const deployer = address(transaction.from, chain);
  const chainId = SUPPORTED_CHAIN_REGISTRY[chain].chainId;
  const metadata = {
    chain, chainId, contractAddress, deployer, from: deployer, to: null,
    receiptStatus: "0x1", finalized: false,
    transactionHash: hash(transaction.hash), blockHash: hash(block.hash),
    creationBlockNumber: quantity(block.number),
    transactionIndex: quantity(transaction.transactionIndex),
    contractCreationTimestamp: new Date(quantity(block.timestamp) * 1000).toISOString(),
    creationKind: "TOP_LEVEL_CONTRACT_CREATION",
    tokenKind: "UNKNOWN", tokenVerificationStatus: "UNVERIFIED",
    tradabilityStatus: "UNKNOWN", safetyStatus: "UNKNOWN",
    quarantined: true, quarantineReason: "TOKEN_KIND_UNVERIFIED",
    codeStatus: codeChecked ? "NONEMPTY_AT_CREATION_BLOCK" : "NOT_CHECKED",
  };
  // Generic creations are raw observations, never TOKEN_DEPLOYED or token/pool candidates.
  return new NativePoolAdapter().normalize({
    eventType: NATIVE_EVENT_TYPES.CONTRACT_DEPLOYED, chain, chainId,
    protocol: "contract-deployment-radar", protocolVersion: "top-level-receipt-v1",
    projectId: `${chain}:contract:${contractAddress}`,
    creator: deployer, deployer, blockNumber: metadata.creationBlockNumber,
    transactionHash: metadata.transactionHash, eventIndex: metadata.transactionIndex,
    timestamp: metadata.contractCreationTimestamp, finalized: false,
    contractAddress, from: deployer, to: null, blockHash: metadata.blockHash,
    receiptStatus: metadata.receiptStatus, creationKind: metadata.creationKind,
    evidenceConfidence: 85,
    exactIdentityEvidence: { ...metadata, source: "EVM_TOP_LEVEL_CREATION_RECEIPT", receiptStatus: "0x1" },
    raw: metadata,
  });
}

export function nativeContractDeployerEvidence(project = {}, events = [], asOfMs = Date.now()) {
  if (typeof asOfMs !== "number" || !Number.isFinite(asOfMs) || asOfMs < 0) return null;
  const chain = evmChain(project.chain || project.chainId || project.network);
  if (!chain || [project.chain, project.chainId, project.network].some((value) => value != null && value !== "" && evmChain(value) !== chain)) return null;
  const targets = [project.tokenAddress, project.contractAddress, project.finalContractAddress, project.canonicalAddress, project.address]
    .filter((value) => value !== undefined && value !== null && value !== "");
  const target = address(targets[0], chain);
  if (!target || targets.some((value) => address(value, chain) !== target) || !Array.isArray(events)) return null;
  let evidence = null;
  for (const event of events) {
    if (event?.eventType !== NATIVE_EVENT_TYPES.CONTRACT_DEPLOYED || event.protocol !== "contract-deployment-radar" ||
        typeof event.finalized !== "boolean" || event.to !== null || event.factoryAddress || event.tokenAddress || event.poolAddress) continue;
    const raw = event.raw;
    const proof = event.exactIdentityEvidence;
    if (!raw || !proof || proof.source !== "EVM_TOP_LEVEL_CREATION_RECEIPT") continue;
    const sender = address(event.from, chain);
    const txHash = hash(event.transactionHash);
    const blockHash = hash(event.blockHash);
    const number = blockNumber(event.blockNumber);
    const index = blockNumber(event.eventIndex);
    const timestamp = Date.parse(event.timestamp);
    const observedAt = Date.parse(event.observedAt);
    if (!sender || !txHash || !blockHash || number === null || index === null ||
        typeof event.timestamp !== "string" || typeof event.observedAt !== "string" ||
        !Number.isFinite(timestamp) || !Number.isFinite(observedAt) || observedAt > asOfMs || timestamp > observedAt + 120_000 ||
        address(event.creator, chain) !== sender || address(event.deployer, chain) !== sender ||
        address(event.contractAddress, chain) !== target || event.projectId !== `${chain}:contract:${target}` ||
        evmChain(event.chain) !== chain || evmChain(event.chainId) !== chain ||
        event.creationKind !== "TOP_LEVEL_CONTRACT_CREATION" || quantity(event.receiptStatus) !== 1) continue;
    if ([raw, proof].some((item) => evmChain(item.chain) !== chain || evmChain(item.chainId) !== chain ||
        address(item.contractAddress, chain) !== target || address(item.from, chain) !== sender || address(item.deployer, chain) !== sender ||
        item.to !== null || item.factoryAddress || item.finalized !== false || item.creationKind !== "TOP_LEVEL_CONTRACT_CREATION" || quantity(item.receiptStatus) !== 1 ||
        hash(item.transactionHash) !== txHash || hash(item.blockHash) !== blockHash || blockNumber(item.creationBlockNumber) !== number ||
        blockNumber(item.transactionIndex) !== index || Date.parse(item.contractCreationTimestamp) !== timestamp)) continue;
    if (evidence && (evidence.creatorAddress !== sender || evidence.deploymentTransactionHash !== txHash ||
        evidence.provenance.blockHash !== blockHash || evidence.creationBlockNumber !== number ||
        evidence.provenance.transactionIndex !== index || Date.parse(evidence.contractCreationTimestamp) !== timestamp)) return null;
    evidence = {
      provider: "native-contract-deployment", status: "EVIDENCE_AVAILABLE", responseIdentityVerified: true,
      chain, chainId: SUPPORTED_CHAIN_REGISTRY[chain].chainId, address: target,
      creatorAddress: sender, deploymentTransactionHash: txHash, creationBlockNumber: number,
      contractCreationTimestamp: new Date(timestamp).toISOString(), observedAt: event.observedAt,
      confidence: 85, finalized: false, tokenKind: "UNKNOWN", safetyStatus: "UNKNOWN", tradabilityStatus: "UNKNOWN",
      provenance: {
        source: proof.source, eventId: event.eventId, chain, contractAddress: target, from: sender,
        transactionHash: txHash, blockHash, blockNumber: number, transactionIndex: index,
        creationKind: "TOP_LEVEL_CONTRACT_CREATION", receiptStatus: "0x1",
        finalized: false, finalityStatus: "UNFINALIZED", observedAt: event.observedAt,
        storedEventFinalized: event.finalized,
        contractCreationTimestamp: new Date(timestamp).toISOString(),
      },
      warnings: ["Unfinalized top-level creation receipt only; token kind, tradability, safety, and creator reputation remain unverified."],
    };
  }
  return evidence;
}

export async function fetchEvmContractDeployments(config = {}, options = {}) {
  const limits = limitsFor(options);
  const result = {
    status: "OK", events: [], chain: null, chainId: null,
    fromBlock: null, toBlock: null, targetToBlock: null, completedBlockHash: null,
    incompleteBlock: null, partial: false, limitReason: null, reason: null,
    requests: 0, blocksRead: 0, blocksCompleted: 0, receiptsRead: 0,
    failedCreations: 0, emptyCodeCreations: 0, limits,
  };
  if (options.collect === false) return { ...result, status: "COLLECTION_DISABLED" };
  if (!limits) return { ...result, status: "INVALID_LIMITS", reason: "Deployment limits must be finite nonnegative integers." };
  const rpcUrl = options.rpcUrl || options.rpcUrls?.[0] || config.rpcUrl || config.rpcUrls?.[0];
  if (!rpcUrl) return { ...result, status: "NOT_CONFIGURED", reason: "Contract deployment collection requires a configured RPC URL." };
  const now = options.now || Date.now;
  const deadline = now() + limits.timeBudgetMs;
  const rpc = options.jsonRpc || options.rpcCall || jsonRpc;

  function checkTime() {
    if (now() >= deadline) stop("PARTIAL", "Deployment collection time budget exhausted.", "TIME_BUDGET");
  }

  async function request(method, params) {
    if (result.requests >= limits.maxRequests) stop("PARTIAL", "Deployment request budget exhausted.", "MAX_REQUESTS");
    const remaining = deadline - now();
    if (remaining < 500) stop("PARTIAL", "Deployment collection time budget exhausted.", "TIME_BUDGET");
    const timeoutMs = Math.min(limits.rpcTimeoutMs, remaining);
    result.requests += 1;
    let timer;
    try {
      const value = await Promise.race([
        Promise.resolve().then(() => rpc(rpcUrl, method, params, { timeoutMs, retries: 0 })),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(Object.assign(new Error(`Deployment RPC ${method} timed out.`),
            { collectionStatus: "PARTIAL", limitReason: "RPC_TIMEOUT" })), timeoutMs);
        }),
      ]);
      checkTime();
      return value;
    } finally {
      clearTimeout(timer);
    }
  }

  try {
    if (limits.maxBlocks === 0) stop("PARTIAL", "Deployment block budget exhausted.", "MAX_BLOCKS");
    const chainId = quantity(await request("eth_chainId", []));
    const chain = chainId === null ? null : evmChain(String(chainId));
    const expected = [options.chain, config.chain === "multi-evm" ? null : config.chain, config.chainId].filter((value) => value != null);
    const chainFilter = String(options.chains || (options.env || process.env).NATIVE_DISCOVERY_CHAINS || "")
      .split(",").map((value) => value.trim()).filter(Boolean);
    if (!chain || expected.some((value) => evmChain(value) !== chain) ||
        (chainFilter.length && !chainFilter.includes("multi-evm") && !chainFilter.some((value) => evmChain(value) === chain))) {
      stop("IDENTITY_MISMATCH", "Deployment RPC chain does not match a supported configured EVM chain.");
    }
    result.chain = chain;
    result.chainId = chainId;
    const checkpoint = options.checkpoint;
    if (checkpoint && (evmChain(checkpoint.chain) !== chain || blockNumber(checkpoint.blockNumber) === null ||
        !hash(checkpoint.blockHash) || (checkpoint.chainId != null && evmChain(checkpoint.chainId) !== chain))) {
      stop("INVALID_CHECKPOINT", "Deployment checkpoint requires the same chain and an exact block identity.");
    }
    const latest = quantity(await request("eth_blockNumber", []));
    if (latest === null) stop("IDENTITY_MISMATCH", "Deployment RPC returned an invalid head block.");
    const target = options.toBlock === undefined ? latest : blockNumber(options.toBlock);
    const lookback = options.lookbackBlocks === undefined ? limits.maxBlocks : blockNumber(options.lookbackBlocks);
    if (target === null || target > latest || lookback === null || lookback < 1) {
      stop("INVALID_RANGE", "Deployment collection requires a valid bounded block range at or below the head.");
    }
    const start = options.fromBlock !== undefined ? blockNumber(options.fromBlock)
      : checkpoint ? blockNumber(checkpoint.blockNumber) + 1 : Math.max(0, target - Math.min(lookback, HARD_LIMITS.maxBlocks) + 1);
    if (start === null || !Number.isSafeInteger(start)) stop("INVALID_RANGE", "Invalid deployment starting block.");
    result.fromBlock = start;
    result.targetToBlock = target;
    let previousHash = checkpoint && start === blockNumber(checkpoint.blockNumber) + 1 ? hash(checkpoint.blockHash) : null;
    const end = Math.min(target, start + limits.maxBlocks - 1);
    for (let number = start; number <= end; number += 1) {
      result.incompleteBlock = number;
      const block = await request("eth_getBlockByNumber", [`0x${number.toString(16)}`, true]);
      result.blocksRead += 1;
      const timestamp = quantity(block?.timestamp);
      if (quantity(block?.number) !== number || !hash(block?.hash) || !Array.isArray(block?.transactions) ||
          timestamp === null || !Number.isFinite(new Date(timestamp * 1000).getTime()) || timestamp * 1000 > now() + 120_000 ||
          (block.chainId != null && quantity(block.chainId) !== chainId) ||
          (previousHash && hash(block.parentHash) !== previousHash)) {
        stop("IDENTITY_MISMATCH", "Deployment block identity, timestamp, parent, or full transactions are missing or mismatched.");
      }
      if (block.transactions.length > limits.maxTransactionsPerBlock) {
        stop("PARTIAL", "Deployment full block exceeds the transaction processing limit.", "MAX_TRANSACTIONS_PER_BLOCK");
      }
      const seen = new Set();
      for (const [index, transaction] of block.transactions.entries()) {
        checkTime();
        const txHash = hash(transaction?.hash);
        if (!txHash || seen.has(txHash) || quantity(transaction.blockNumber) !== number ||
            hash(transaction.blockHash) !== hash(block.hash) || quantity(transaction.transactionIndex) !== index ||
            (transaction.chainId != null && quantity(transaction.chainId) !== chainId) ||
            (transaction.to !== null && !normalizeAddress(transaction.to, chain))) {
          stop("IDENTITY_MISMATCH", "Deployment transaction identity does not match its full block.");
        }
        seen.add(txHash);
        if (transaction.to !== null) continue;
        if (!address(transaction.from, chain)) stop("IDENTITY_MISMATCH", "Top-level creation sender is missing or invalid.");
        if (result.receiptsRead >= limits.maxReceipts) stop("PARTIAL", "Deployment receipt budget exhausted.", "MAX_RECEIPTS");
        const receipt = await request("eth_getTransactionReceipt", [txHash]);
        result.receiptsRead += 1;
        if (hash(receipt?.transactionHash) !== txHash || hash(receipt?.blockHash) !== hash(block.hash) ||
            quantity(receipt?.blockNumber) !== number || quantity(receipt?.transactionIndex) !== index ||
            receipt?.to !== null || address(receipt?.from, chain) !== address(transaction.from, chain) ||
            (receipt?.chainId != null && quantity(receipt.chainId) !== chainId)) {
          stop("IDENTITY_MISMATCH", "Creation receipt does not match the exact transaction, block, and sender.");
        }
        if (quantity(receipt.status) === 0) {
          result.failedCreations += 1;
          continue;
        }
        if (quantity(receipt.status) !== 1 || !address(receipt.contractAddress, chain)) {
          stop("IDENTITY_MISMATCH", "Creation receipt lacks successful status or an exact contract address.");
        }
        if (options.verifyCode === true) {
          const code = await request("eth_getCode", [address(receipt.contractAddress, chain), { blockHash: hash(block.hash), requireCanonical: true }]);
          if (typeof code !== "string" || !/^0x(?:[0-9a-f]{2})*$/i.test(code)) {
            stop("IDENTITY_MISMATCH", "Creation code response is malformed.");
          }
          if (code === "0x") {
            result.emptyCodeCreations += 1;
            continue;
          }
        }
        checkTime();
        result.events.push(deploymentEvent(transaction, receipt, block, chain, options.verifyCode === true));
      }
      checkTime();
      result.toBlock = number;
      result.completedBlockHash = hash(block.hash);
      result.blocksCompleted += 1;
      previousHash = result.completedBlockHash;
      result.incompleteBlock = null;
    }
    if (end < target) stop("PARTIAL", "Deployment block budget exhausted before the requested head.", "MAX_BLOCKS");
  } catch (error) {
    result.status = error.collectionStatus || "RPC_FAILED";
    result.partial = result.fromBlock !== null || result.status === "PARTIAL";
    result.reason = error.collectionStatus ? error.message : "Deployment RPC acquisition failed; the incomplete block was not checkpointed.";
    result.limitReason = error.limitReason || null;
  }
  return result;
}

export class EvmContractDeploymentAdapter extends NativePoolAdapter {
  constructor(config = {}) {
    super({ ...config, family: "evm-deployment", protocol: "contract-deployment-radar" });
  }

  async backfill(options = {}) {
    const result = await fetchEvmContractDeployments(this.config, options);
    if (options.persist !== false) {
      if (result.events.length) recordNativeEvents(result.events, { confirmed: false, finalized: false });
      if (result.toBlock !== null) updateNativeCheckpoint(this.config.id || "evm-contract-deployments", {
        chain: result.chain, chainId: result.chainId, protocol: this.config.protocol,
        blockNumber: result.toBlock, blockHash: result.completedBlockHash, mode: "backfill",
      });
    }
    return { ...result, source: this.config.id || "evm-contract-deployments" };
  }
}
