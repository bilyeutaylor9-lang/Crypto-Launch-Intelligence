import { createHash } from "node:crypto";
import { resolveNativeRpcUrl } from "./native/nativePoolConfig.js";
import { normalizeChainId, normalizeTokenAddress } from "../identity/strictIdentityValidators.js";
import { EVM_CHAIN_IDS } from "./security/securityEvidenceUtils.js";
import { jsonRpc } from "../sensors/rpcJsonClient.js";
import { ERC20_TRANSFER_TOPIC, addressFromTopic, encodeAddressWord, hexNumber } from "../sensors/evmAbi.js";

const ZERO = `0x${"0".repeat(40)}`;
const WORD = /^0x[0-9a-f]{64}$/i;
const ADDRESS_TOPIC = /^0x0{24}[0-9a-f]{40}$/i;
const HASH = /^0x[0-9a-f]{64}$/i;
const HEX = /^0x[0-9a-f]+$/i;

export function walletRpcEndpointId(url) {
  return createHash("sha256").update(String(url)).digest("hex");
}

export async function getRpcWalletEvidence(project = {}, options = {}) {
  const chain = normalizeChainId(project.chain || project.chainId || project.network);
  const explicitUrls = [options.rpcUrl, ...(Array.isArray(options.rpcUrls) ? options.rpcUrls : [])]
    .filter((url) => typeof url === "string" && url.trim()).map((url) => url.trim());
  const resolved = explicitUrls.length ? explicitUrls : resolveNativeRpcUrl({ chain }, options).rpcUrls;
  const configuredMax = Number(options.walletRpcMaxEndpoints ?? 2);
  const maxEndpoints = Number.isSafeInteger(configuredMax) && configuredMax > 0 ? Math.min(2, configuredMax) : 1;
  const urls = [...new Set(resolved)].slice(0, maxEndpoints);
  if (!urls.length) return getRpcWalletEvidenceFromEndpoint(project, options);
  const attempts = [];
  let result;
  for (const rpcUrl of urls) {
    // Restart the entire chain/block observation; never splice evidence across RPC endpoints.
    result = await getRpcWalletEvidenceFromEndpoint(project, { ...options, rpcUrl });
    attempts.push({ endpointId: walletRpcEndpointId(rpcUrl), status: result.status,
      providerFailure: result.providerFailure === true, providerFailureCode: result.providerFailureCode || null });
    if (result.providerFailure !== true ||
        ["REQUEST_BUDGET_EXHAUSTED", "TIME_BUDGET_EXHAUSTED"].includes(result.providerFailureCode)) break;
  }
  return { ...result, rpcEndpointId: attempts.at(-1).endpointId, rpcEndpointAttempts: attempts };
}

async function getRpcWalletEvidenceFromEndpoint(project = {}, options = {}) {
  const chain = normalizeChainId(project.chain || project.chainId || project.network);
  const tokenAddress = normalizeTokenAddress(project.tokenAddress || project.contractAddress, chain);
  const poolAddress = normalizeTokenAddress(project.poolAddress || project.pairAddress, chain);
  const excluded = new Set([ZERO, tokenAddress, poolAddress]);
  const chainId = EVM_CHAIN_IDS[chain];
  const rpcUrl = options.rpcUrl || resolveNativeRpcUrl({ chain }, options).rpcUrl;
  const unknown = (reason, providerFailure = false) => ({ provider: "rpc-wallets", status: "UNKNOWN",
    chain, tokenAddress, observedAt: new Date().toISOString(), providerFailure, warnings: [reason] });
  if (!chainId || !tokenAddress || !rpcUrl) return unknown("Exact supported EVM identity and RPC are required.");
  const requestedLookback = Number(options.walletRpcLookbackBlocks ?? 256);
  if (!Number.isSafeInteger(requestedLookback) || requestedLookback <= 0) return unknown("Wallet RPC lookback must be a positive safe integer.");
  const maxHeadAgeSeconds = Number(options.walletRpcMaxHeadAgeSeconds ?? 300);
  if (!Number.isSafeInteger(maxHeadAgeSeconds) || maxHeadAgeSeconds <= 0) return unknown("Wallet RPC head age limit must be a positive safe integer.");
  const rpc = options.jsonRpc || jsonRpc;
  const rpcOptions = { timeoutMs: options.timeoutMs || 5_000, retries: 0 };
  try {
    const returnedChain = await rpc(rpcUrl, "eth_chainId", [], rpcOptions);
    if (!HEX.test(returnedChain || "") || BigInt(returnedChain) !== BigInt(chainId)) return unknown("RPC chain identity mismatch.");
    const block = await rpc(rpcUrl, "eth_getBlockByNumber", ["latest", false], rpcOptions);
    if (!HEX.test(block?.number || "") || !HEX.test(block?.timestamp || "")) return unknown("Missing observation block.");
    const toBlock = Number(BigInt(block.number));
    const observedBlockTimestamp = Number(BigInt(block.timestamp));
    if (!Number.isSafeInteger(toBlock) || toBlock <= 0 || !Number.isSafeInteger(observedBlockTimestamp) || observedBlockTimestamp <= 0) return unknown("Invalid observation block.");
    const nowMs = new Date(typeof options.now === "function" ? options.now() : options.now ?? Date.now()).getTime();
    if (!Number.isFinite(nowMs)) return unknown("Observation clock is invalid.");
    if (observedBlockTimestamp > nowMs / 1000 + 120) return unknown("Observation block timestamp is in the future.");
    if (nowMs / 1000 - observedBlockTimestamp > maxHeadAgeSeconds) return {
      ...unknown("RPC head is stale; no current wallet observation was established.", true), providerFailureCode: "STALE_RPC_HEAD",
    };
    const lookback = Math.min(1000, requestedLookback);
    const fromBlock = Math.max(0, toBlock - Math.floor(lookback) + 1);
    const logs = await rpc(rpcUrl, "eth_getLogs", [{ address: tokenAddress,
      fromBlock: hexNumber(fromBlock), toBlock: block.number, topics: [ERC20_TRANSFER_TOPIC] }], rpcOptions);
    if (!Array.isArray(logs) || logs.length > 5_000) return unknown("Missing or oversized bounded transfer response.");
    const transactions = [];
    const seen = new Set();
    const wallets = new Set();
    for (const log of logs) {
      if (log?.removed === true) continue;
      if (normalizeTokenAddress(log?.address, chain) !== tokenAddress ||
        log?.topics?.length !== 3 || log.topics[0]?.toLowerCase() !== ERC20_TRANSFER_TOPIC ||
        !ADDRESS_TOPIC.test(log.topics[1]) || !ADDRESS_TOPIC.test(log.topics[2]) ||
        !WORD.test(log.data || "") || !HASH.test(log.transactionHash || "") ||
        !HEX.test(log.blockNumber || "") || !HEX.test(log.logIndex || "")) return unknown("Transfer response identity or shape mismatch.");
      const number = Number(BigInt(log.blockNumber));
      if (!Number.isSafeInteger(number) || number < fromBlock || number > toBlock) return unknown("Transfer outside pinned block range.");
      const key = `${log.transactionHash.toLowerCase()}:${BigInt(log.logIndex)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const from = addressFromTopic(log.topics[1]);
      const to = addressFromTopic(log.topics[2]);
      for (const address of [from, to]) if (!excluded.has(address)) wallets.add(address);
      transactions.push({ transactionHash: log.transactionHash.toLowerCase(), logIndex: log.logIndex,
        blockNumber: number, timestamp: null, from, to, tokenAmountRaw: BigInt(log.data).toString(),
        tokenAddress, direction: "TRANSFER", smartWallet: null });
    }
    const holderBalanceEvidence = [];
    const warnings = [];
    let balanceProbes = 0;
    let balanceResponsesReceived = 0;
    let balanceFailures = 0;
    let balanceFailureCode = null;
    if (!wallets.size) {
      const blockHash = HASH.test(block.hash || "") && !/^0x0{64}$/i.test(block.hash)
        ? block.hash.toLowerCase() : null;
      const configuredMax = Number(options.walletRpcMaxBalanceProbes ?? 2);
      const maxProbes = blockHash && Number.isSafeInteger(configuredMax) && configuredMax >= 0 ? Math.min(3, configuredMax) : 0;
      if (!blockHash) warnings.push("Missing exact block hash; no seeded holder balance proof was attempted.");
      // These addresses are query seeds, not proof of their role or token ownership.
      const seeds = [...new Set([
        ...(Array.isArray(options.walletRpcHolderSeeds) ? options.walletRpcHolderSeeds : []),
        ...(Array.isArray(project.holderAddresses) ? project.holderAddresses : []),
        project.deployerAddress, project.creatorAddress, project.deployer, project.creator, project.ownerAddress,
      ].map((value) => normalizeTokenAddress(typeof value === "string" ? value : value?.address, chain))
        .filter((address) => address && !excluded.has(address)))].slice(0, maxProbes);
      for (const address of seeds) {
        balanceProbes++;
        try {
          const balance = await rpc(rpcUrl, "eth_call", [{ to: tokenAddress,
            data: "0x70a08231" + encodeAddressWord(address) }, { blockHash, requireCanonical: true }], rpcOptions);
          balanceResponsesReceived++;
          if (!WORD.test(balance || "")) {
            warnings.push("A seeded balanceOf response was malformed; ownership remains unknown.");
            continue;
          }
          if (BigInt(balance) === 0n) continue;
          wallets.add(address);
          holderBalanceEvidence.push({ address, tokenAddress, chain, balanceRaw: BigInt(balance).toString(),
            observedBlockNumber: toBlock, observedBlockTimestamp,
            blockHash,
            method: "balanceOf", accountType: "UNKNOWN", role: "UNKNOWN" });
        } catch (error) {
          balanceFailures++;
          balanceFailureCode = error?.code || null;
          warnings.push("A seeded balanceOf request failed; no ownership was inferred from its address label.");
        }
      }
    }
    const observedAt = new Date().toISOString();
    const sourceTimestamp = new Date(observedBlockTimestamp * 1000).toISOString();
    const providerFailure = !transactions.length && !holderBalanceEvidence.length && balanceFailures > 0 && balanceResponsesReceived === 0;
    return { provider: "rpc-wallets", status: transactions.length || holderBalanceEvidence.length ? "EVIDENCE_AVAILABLE" : "UNKNOWN",
      providerFailure, providerFailureCode: providerFailure ? balanceFailureCode : null,
      chain, tokenAddress, exactTokenIdentity: true, observedAt, sourceTimestamp,
      confidence: 0.85, verificationStatus: "VERIFIED_PROVIDER_OBSERVATION",
      wallets: [...wallets], walletTransactions: transactions, walletParticipationHistory: transactions,
      holderAddresses: holderBalanceEvidence.map((item) => item.address), holderBalanceEvidence,
      holderCount: null, holderCoverage: { sampled: true, complete: false, balanceProbeAttempts: balanceProbes, balanceResponsesReceived,
        semantics: "CONTRACT_REPORTED_POSITIVE_BALANCES_AT_PINNED_BLOCK_NOT_HOLDER_CENSUS" },
      transferCoverage: { fromBlock, toBlock, observedBlockTimestamp, complete24h: false, sampled: true },
      uniqueBuyers24h: null, buyTransactions24h: null, sellTransactions24h: null,
      smartWallets: null, trackedWallets: null,
      warnings: [...warnings, "Bounded transfer participation and positive balance samples only; no complete daily totals, holder census, trade classification, creator role or smart-wallet labels are established."] };
  } catch (error) {
    return { ...unknown(error?.message || "Wallet RPC failed.", true),
      providerFailureCode: error?.code || null };
  }
}
