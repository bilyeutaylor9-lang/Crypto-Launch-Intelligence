import { resolveNativeRpcUrl } from "./native/nativePoolConfig.js";
import { normalizeChainId, normalizeTokenAddress } from "../identity/strictIdentityValidators.js";
import { jsonRpc } from "../sensors/rpcJsonClient.js";
import { keccak256Hex } from "../sensors/keccak256.js";
import { encodeAddressWord } from "../sensors/evmAbi.js";
import { getCachedSecurityEvidence, setCachedSecurityEvidence } from "./security/securityEvidenceUtils.js";

// Base's factory attests initialization, not creator identity or contract safety.
// Interface: https://github.com/base/base-std/blob/main/src/interfaces/IB20Factory.sol
export const BASE_B20_FACTORY = "0xb20f000000000000000000000000000000000000";
const PROVIDER = "base-b20-native";
const INITIALIZED_SELECTOR = keccak256Hex("isB20Initialized(address)").slice(0, 10);

export function isBaseB20Candidate(project = {}) {
  const chain = normalizeChainId(project.chain || project.chainId || project.network);
  const address = normalizeTokenAddress(project.tokenAddress || project.contractAddress, chain);
  return chain === "base" && /^0xb2[0]{18}0[01][0-9a-f]{18}$/.test(address || "");
}

export function isVerifiedBaseB20Evidence(value = {}) {
  return value?.provider === PROVIDER && value.status === "EVIDENCE_AVAILABLE" &&
    value.responseIdentityVerified === true && isBaseB20Candidate(value) &&
    value.chain === "base" && value.address === value.tokenAddress &&
    value.nativeLifecycle?.protocol === "BASE_B20" &&
    value.nativeLifecycle?.initialized === true &&
    value.nativeLifecycle?.factoryAddress === BASE_B20_FACTORY &&
    value.nativeLifecycle?.chain === "base" && value.nativeLifecycle?.tokenAddress === value.address &&
    value.nativeLifecycle?.verificationStatus === "VERIFIED_PROVIDER_OBSERVATION" &&
    Number.isSafeInteger(value.nativeLifecycle?.observedBlockNumber) && value.nativeLifecycle.observedBlockNumber > 0;
}

export async function getBaseB20LifecycleEvidence(project = {}, options = {}) {
  const address = normalizeTokenAddress(project.tokenAddress || project.contractAddress, "base");
  const unknown = (reason, failure = false) => ({ provider: PROVIDER, status: "UNKNOWN",
    chain: "base", address, observedAt: new Date().toISOString(), nativeLifecycle: null,
    creatorAddress: null, warnings: [reason], ...(failure ? { providerFailure: true } : {}) });
  if (!isBaseB20Candidate(project)) return unknown("Not an exact Base B20 candidate.");
  if (options.useCache !== false) {
    const cached = getCachedSecurityEvidence(PROVIDER, "base", address, options.cacheTtlMs);
    if (isVerifiedBaseB20Evidence(cached) && cached.address === address) return cached;
  }
  const rpcUrl = options.rpcUrl || resolveNativeRpcUrl({ chain: "base" }, options).rpcUrl;
  if (!rpcUrl) return unknown("No Base RPC endpoint is available.");
  const rpc = options.jsonRpc || jsonRpc;
  const rpcOptions = { timeoutMs: options.timeoutMs || 5_000, retries: 0 };
  try {
    const chainId = await rpc(rpcUrl, "eth_chainId", [], rpcOptions);
    if (chainId !== "0x2105") return unknown("RPC chain identity does not match Base.");
    const block = await rpc(rpcUrl, "eth_blockNumber", [], rpcOptions);
    if (!/^0x[0-9a-f]+$/i.test(block || "")) return unknown("RPC block identity is missing.");
    const blockNumber = Number(BigInt(block));
    if (!Number.isSafeInteger(blockNumber) || blockNumber <= 0) return unknown("Invalid observation block.");
    const tokenCode = await rpc(rpcUrl, "eth_getCode", [address, block], rpcOptions);
    const initialized = await rpc(rpcUrl, "eth_call", [{ to: BASE_B20_FACTORY,
      data: INITIALIZED_SELECTOR + encodeAddressWord(address) }, block], rpcOptions);
    if (tokenCode !== "0xef" || initialized !== `0x${"0".repeat(63)}1`) {
      return unknown("Native factory/token initialization was not proven at the observation block.");
    }
    const observedAt = new Date().toISOString();
    const result = { provider: PROVIDER, status: "EVIDENCE_AVAILABLE", chain: "base", address,
      tokenAddress: address, responseIdentityVerified: true, observedAt, confidence: 90,
      creatorAddress: null, deploymentTransactionHash: null, creationBlockNumber: null,
      nativeLifecycle: { protocol: "BASE_B20", chain: "base", tokenAddress: address,
        factoryAddress: BASE_B20_FACTORY, initialized: true, observedBlockNumber: blockNumber,
        source: PROVIDER, sourceTimestamp: observedAt, confidence: 0.9,
        verificationStatus: "VERIFIED_PROVIDER_OBSERVATION", creator: null, deployer: null,
        contractCreationTimestamp: null, deploymentTransactionHash: null }, warnings: [
        "Factory initialization does not establish creator identity, deployment history, issuer trust or safety." ] };
    if (options.useCache !== false) setCachedSecurityEvidence(PROVIDER, "base", address, result);
    return result;
  } catch (error) {
    return unknown(error.message || "Base native lifecycle RPC failed.", true);
  }
}
