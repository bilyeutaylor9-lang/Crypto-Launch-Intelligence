import { resolveNativeRpcUrl } from "./native/nativePoolConfig.js";
import { normalizeChainId, normalizeTokenAddress } from "../identity/strictIdentityValidators.js";
import { EVM_CHAIN_IDS } from "./security/securityEvidenceUtils.js";
import { jsonRpc } from "../sensors/rpcJsonClient.js";
import { ERC20_TRANSFER_TOPIC, addressFromTopic, hexNumber } from "../sensors/evmAbi.js";

const ZERO = `0x${"0".repeat(40)}`;
const WORD = /^0x[0-9a-f]{64}$/i;
const ADDRESS_TOPIC = /^0x0{24}[0-9a-f]{40}$/i;
const HASH = /^0x[0-9a-f]{64}$/i;
const HEX = /^0x[0-9a-f]+$/i;

export async function getRpcWalletEvidence(project = {}, options = {}) {
  const chain = normalizeChainId(project.chain || project.chainId || project.network);
  const tokenAddress = normalizeTokenAddress(project.tokenAddress || project.contractAddress, chain);
  const poolAddress = normalizeTokenAddress(project.poolAddress || project.pairAddress, chain);
  const excluded = new Set([ZERO, tokenAddress, poolAddress]);
  const chainId = EVM_CHAIN_IDS[chain];
  const rpcUrl = options.rpcUrl || resolveNativeRpcUrl({ chain }, options).rpcUrl;
  const unknown = (reason, providerFailure = false) => ({ provider: "rpc-wallets", status: "UNKNOWN",
    chain, tokenAddress, observedAt: new Date().toISOString(), providerFailure, warnings: [reason] });
  if (!chainId || !tokenAddress || !rpcUrl) return unknown("Exact supported EVM identity and RPC are required.");
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
    const lookback = Math.max(1, Math.min(1_000, Number(options.walletRpcLookbackBlocks || 256)));
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
    const observedAt = new Date().toISOString();
    return { provider: "rpc-wallets", status: transactions.length ? "EVIDENCE_AVAILABLE" : "UNKNOWN",
      chain, tokenAddress, exactTokenIdentity: true, observedAt, sourceTimestamp: observedAt,
      confidence: 0.85, verificationStatus: "VERIFIED_PROVIDER_OBSERVATION",
      wallets: [...wallets], walletTransactions: transactions, walletParticipationHistory: transactions,
      transferCoverage: { fromBlock, toBlock, observedBlockTimestamp, complete24h: false, sampled: true },
      uniqueBuyers24h: null, buyTransactions24h: null, sellTransactions24h: null,
      smartWallets: null, trackedWallets: null,
      warnings: ["Bounded raw transfer participation only; no complete daily totals, holder census, trade classification or smart-wallet labels are established."] };
  } catch (error) {
    return unknown(error?.message || "Wallet RPC failed.", true);
  }
}
