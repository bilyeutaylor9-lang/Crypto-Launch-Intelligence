import { normalizeChainId, normalizePoolAddress, normalizeTokenAddress } from "./strictIdentityValidators.js";

const present = (value) => value !== undefined && value !== null && String(value).trim() !== "";

function exactKey(value) {
  const match = String(value ?? "").trim().match(/^([^:]+):(?:token:)?(.+)$/i);
  if (!match) return null;
  const chain = normalizeChainId(match[1]);
  const tokenAddress = chain && normalizeTokenAddress(match[2], chain);
  return tokenAddress ? { chain, tokenAddress } : null;
}

// A bare legacy id or symbol cannot establish token identity. Structured aliases
// and any address-bearing id must agree; old stored ids are never rewritten.
export function exactScanHistoryIdentity(value = {}) {
  if (typeof value === "string") {
    const parsed = exactKey(value);
    return parsed ? { ...parsed, key: `${parsed.chain}:${parsed.tokenAddress}`, poolAddress: null } : null;
  }
  if (!value || typeof value !== "object" || value.historyIdentityStatus === "UNRESOLVED_OR_CONFLICTING_V1") return null;

  const asserted = [];
  for (const key of [value.identityKey, value.projectKey, value.permanentProjectKey].filter(present)) {
    const parsed = exactKey(key);
    if (!parsed) return null;
    asserted.push(parsed);
  }
  const rawId = present(value.id) ? String(value.id).trim() : "";
  if (rawId.includes(":")) {
    const parsed = exactKey(rawId);
    if (!parsed) return null;
    asserted.push(parsed);
  }
  const chains = [
    value.chain, value.network, value.chainId, value.baseToken?.chain,
    value.marketData?.chain, value.pointInTime?.identity?.chain,
  ].filter((item) => present(item) && String(item).trim().toLowerCase() !== "unknown").map(normalizeChainId);
  if (chains.some((chain) => !chain)) return null;
  chains.push(...asserted.map((item) => item.chain));
  if (!chains.length || new Set(chains).size !== 1) return null;
  const chain = chains[0];
  const addresses = [
    value.tokenAddress, value.contractAddress, value.canonicalAddress, value.address,
    value.baseToken?.address, value.marketData?.tokenAddress, value.pointInTime?.identity?.tokenAddress,
  ].filter(present).map((address) => normalizeTokenAddress(address, chain));
  if (addresses.some((address) => !address)) return null;
  addresses.push(...asserted.map((item) => item.tokenAddress));
  if (!addresses.length || new Set(addresses).size !== 1) return null;
  const tokenAddress = addresses[0];
  // Generic provider ids are metadata, not joins. A syntactically valid address
  // id, however, is an identity assertion and must not name another token.
  if (rawId && !rawId.includes(":") && (normalizeTokenAddress(rawId) || /^0x/i.test(rawId) || /^[A-Za-z0-9]{32,44}$/.test(rawId))) {
    if (normalizeTokenAddress(rawId, chain) !== tokenAddress) return null;
  }
  const pools = [
    value.poolAddress, value.pairAddress, value.primaryTradablePool,
    value.marketData?.poolAddress, value.pointInTime?.identity?.poolAddress,
  ].filter(present).map((pool) => normalizePoolAddress(pool, chain));
  if (pools.some((pool) => !pool) || new Set(pools).size > 1) return null;
  return { chain, tokenAddress, key: `${chain}:${tokenAddress}`, poolAddress: pools[0] || null };
}
