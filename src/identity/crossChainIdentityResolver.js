import {
  normalizeChainId,
  normalizeTokenAddress,
} from "./strictIdentityValidators.js";

function lower(value = "") {
  return String(value || "").trim().toLowerCase();
}

function normalizeContract(item = {}, fallbackChain = "") {
  if (typeof item === "string") {
    const chain = normalizeChainId(fallbackChain) || "";
    return { chain: chain || "unknown", address: normalizeTokenAddress(item, chain) || "" };
  }

  const chain = normalizeChainId(item.chain || item.network || fallbackChain) || "";
  return {
    chain: chain || "unknown",
    address: normalizeTokenAddress(item.address || item.tokenAddress || item.contractAddress, chain) || "",
    bridge: lower(item.bridge || item.source || ""),
  };
}

export function resolveCrossChainIdentity(project = {}) {
  const primary = normalizeContract(
    {
      chain: project.chain,
      address: project.address || project.tokenAddress || project.contractAddress,
    },
    project.chain
  );
  const bridged = [
    ...(Array.isArray(project.bridgedContracts) ? project.bridgedContracts : []),
    ...(Array.isArray(project.crossChainAddresses) ? project.crossChainAddresses : []),
    ...(Array.isArray(project.tokenContracts) ? project.tokenContracts : []),
  ]
    .map((item) => normalizeContract(item, project.chain))
    .filter((item) => item.address);
  const contracts = [...new Map([primary, ...bridged].filter((item) => item.address).map((item) => [`${item.chain}:${item.address}`, item])).values()];
  const chains = [...new Set(contracts.map((item) => item.chain).filter(Boolean))];
  const bridgeCount = new Set(contracts.map((item) => item.bridge).filter(Boolean)).size;
  const score = Math.round(Math.min(100, contracts.length * 18 + chains.length * 12 + bridgeCount * 8));

  return {
    contracts,
    chains,
    bridgeCount,
    crossChainIdentityScore: score,
    warnings: [
      ...(contracts.length > 1 && bridgeCount === 0 ? ["cross-chain contracts lack bridge provenance"] : []),
      ...(contracts.length === 0 ? ["no token contract identity"] : []),
    ],
  };
}
