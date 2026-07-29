import { normalizeChainId } from "./strictIdentityValidators.js";
import { SUPPORTED_CHAIN_REGISTRY } from "../data/chainAliasRegistry.js";

const WRAPPED_TERMS = /\b(wrapped|bridged|wormhole|portal|layerzero|omnichain|wrapped asset|bridge)\b/i;

export const ESTABLISHED_NATIVE_ASSETS = Object.freeze({
  BTC: {
    symbol: "BTC",
    name: "Bitcoin",
    nativeChain: "bitcoin",
    nativeChainId: "bitcoin",
    benchmarkLane: "MARKET_BENCHMARK",
  },
  ETH: {
    symbol: "ETH",
    name: "Ethereum",
    nativeChain: "ethereum",
    nativeChainId: SUPPORTED_CHAIN_REGISTRY.ethereum.chainId,
    benchmarkLane: "MARKET_BENCHMARK",
  },
  BNB: {
    symbol: "BNB",
    name: "BNB",
    nativeChain: "bsc",
    nativeChainId: SUPPORTED_CHAIN_REGISTRY.bsc.chainId,
    benchmarkLane: "MARKET_BENCHMARK",
  },
  SOL: {
    symbol: "SOL",
    name: "Solana",
    nativeChain: "solana",
    nativeChainId: SUPPORTED_CHAIN_REGISTRY.solana.chainId,
    benchmarkLane: "MARKET_BENCHMARK",
  },
});

function clean(value = "") {
  return String(value ?? "").trim();
}

function upper(value = "") {
  return clean(value).toUpperCase();
}

function textFor(project = {}) {
  return [
    project.name,
    project.projectName,
    project.tokenName,
    project.description,
    project.variant,
    project.bridge,
    project.rawCandidate?.name,
    project.marketData?.name,
  ]
    .filter(Boolean)
    .join(" ");
}

export function nativeAssetForSymbol(symbol = "") {
  return ESTABLISHED_NATIVE_ASSETS[upper(symbol)] || null;
}

export function nativeAssetChainId(asset = null) {
  if (!asset) return null;
  const normalized = normalizeChainId(asset.nativeChain);
  return normalized ? SUPPORTED_CHAIN_REGISTRY[normalized]?.chainId ?? asset.nativeChainId : asset.nativeChainId;
}

export function classifyNativeAssetVariant(project = {}) {
  const symbol = upper(project.symbol || project.ticker || project.baseToken?.symbol || project.rawCandidate?.symbol);
  const nativeAsset = nativeAssetForSymbol(symbol);
  const rawChain = clean(project.chain || project.canonicalChain || project.chainId || project.network).toLowerCase();
  const observedChain = normalizeChainId(rawChain) || rawChain || null;

  if (!nativeAsset) {
    return {
      isEstablishedNativeAsset: false,
      nativeAsset: null,
      observedChain,
      variantType: null,
      benchmarkLane: null,
      quarantineReason: null,
      requiresWrappedAssetVerification: false,
    };
  }

  const nativeChain = normalizeChainId(nativeAsset.nativeChain) || nativeAsset.nativeChain;
  const sameNativeChain = observedChain && observedChain === nativeChain;
  const hasContract = Boolean(
    project.tokenAddress ||
      project.contractAddress ||
      project.canonicalAddress ||
      project.finalContractAddress ||
      project.baseToken?.address
  );
  const wrappedLanguage = WRAPPED_TERMS.test(textFor(project));
  const wrappedVerified = project.wrappedAssetVerified === true || project.bridgeVerified === true || project.nativeAssetWrapperVerified === true;

  if (sameNativeChain) {
    return {
      isEstablishedNativeAsset: true,
      nativeAsset,
      observedChain,
      nativeChain,
      nativeChainId: nativeAssetChainId(nativeAsset),
      variantType: hasContract || wrappedLanguage ? "WRAPPED_NATIVE_OR_GAS_WRAPPER" : "NATIVE",
      benchmarkLane: nativeAsset.benchmarkLane,
      quarantineReason: null,
      requiresWrappedAssetVerification: false,
    };
  }

  const variantType = wrappedLanguage ? "WRAPPED_OR_BRIDGED" : hasContract ? "IMITATION_OR_UNVERIFIED_WRAPPER" : "NATIVE_ASSET_MISMATCH";
  return {
    isEstablishedNativeAsset: true,
    nativeAsset,
    observedChain,
    nativeChain,
    nativeChainId: nativeAssetChainId(nativeAsset),
    variantType,
    benchmarkLane: null,
    quarantineReason: wrappedLanguage && !wrappedVerified ? "WRAPPED_ASSET_UNVERIFIED" : "NATIVE_ASSET_MISMATCH",
    requiresWrappedAssetVerification: !wrappedVerified,
  };
}
