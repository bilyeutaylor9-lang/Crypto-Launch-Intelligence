import { buildStrictCanonicalId } from "../execution/routeResolver.js";
import { chainKind, normalizeChainId, normalizeTokenAddress } from "./strictIdentityValidators.js";

const present = (values) => values.filter((value) => value !== undefined && value !== null && value !== "");

// A legacy lowercase ID is evidence only when independent chain/address fields agree.
export function resolveCanonicalHistoryIdentity(row = {}, idFields = ["canonicalProjectId", "canonicalId"]) {
  const unknown = { status: "UNKNOWN", canonicalId: null };
  if (!row || typeof row !== "object" || Array.isArray(row)) return unknown;
  if (row.historyIdentityStatus === "UNKNOWN" || row.canonicalIdentityHardBlock || row.identityConflict ||
      row.identityStatus === "CONTRACT_CONFLICT") return unknown;
  const chains = present([row.chain, row.chainId, row.network, row.canonicalChain]).map(normalizeChainId);
  if (!chains.length || chains.some((chain) => !chain || chain !== chains[0])) return unknown;
  const chain = chains[0];
  const addresses = present([
    row.tokenAddress, row.contractAddress, row.canonicalAddress, row.finalContractAddress,
    row.verifiedContractAddress, row.address, row.baseToken?.address,
  ]).map((address) => normalizeTokenAddress(address, chain));
  if (!addresses.length || addresses.some((address) => !address || address !== addresses[0])) return unknown;
  const address = addresses[0];
  const ids = present([...idFields.map((field) => row[field]), row.identityKey]).map(String);
  if (!ids.length) return unknown;
  const evm = chainKind(chain) === "evm";
  for (const id of ids) {
    const separator = id.indexOf(":");
    const suffix = id.slice(separator + 1);
    const idChain = separator > 0 ? normalizeChainId(id.slice(0, separator)) : null;
    // EVM IDs did not change; retain trusted opaque IDs backed by exact fields.
    if (evm && !idChain && id !== row.identityKey) continue;
    if (!idChain || idChain !== chain) return unknown;
    if (evm ? normalizeTokenAddress(suffix, chain) !== address :
      suffix !== address && suffix !== address.toLowerCase()) return unknown;
  }
  const canonicalId = buildStrictCanonicalId(chain, address);
  return {
    status: evm ? "UNCHANGED" : ids.every((id) => id === canonicalId) ? "EXACT_ADDRESS_MATCH" : "LEGACY_ADDRESS_MATCH",
    canonicalId,
  };
}
