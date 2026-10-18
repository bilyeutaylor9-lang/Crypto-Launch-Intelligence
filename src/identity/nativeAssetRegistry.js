import { normalizeChainId, normalizeTokenAddress } from "./strictIdentityValidators.js";
import { SUPPORTED_CHAIN_REGISTRY } from "../data/chainAliasRegistry.js";
import { normalizeVenue, venueType } from "../data/venueVocabularyRegistry.js";

const WRAPPED_TERMS = /\b(wrapped|bridged|wormhole|portal|layerzero|omnichain|wrapped asset|bridge)\b/i;
const WRAPPED_NATIVE_ADDRESSES = {
  SOL: { solana: "So11111111111111111111111111111111111111112" },
  ETH: {
    ethereum: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
    base: "0x4200000000000000000000000000000000000006",
    optimism: "0x4200000000000000000000000000000000000006",
    arbitrum: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1",
  },
  BNB: { bsc: "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c" },
};

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
  const key = upper(symbol);
  return ESTABLISHED_NATIVE_ASSETS[({ WSOL: "SOL", WETH: "ETH", WBNB: "BNB" })[key] || key] || null;
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
  const supplied = (values) => values.filter((value) => value !== undefined && value !== null && value !== "");
  const chains = supplied([project.chain, project.chainId, project.canonicalChain, project.network,
    project.finalChain, project.normalizedChain])
    .map((value) => normalizeChainId(value) || clean(value).toLowerCase());
  const chainAgrees = chains.length > 0 && chains.every((chain) => chain && chain === observedChain);
  const contracts = supplied([project.tokenAddress, project.contractAddress, project.canonicalAddress,
    project.finalContractAddress, project.verifiedContractAddress, project.baseTokenAddress, project.baseToken?.address]);
  const hasContract = contracts.length > 0;
  const expectedWrapper = WRAPPED_NATIVE_ADDRESSES[nativeAsset.symbol]?.[observedChain];
  const exactWrapper = chainAgrees && expectedWrapper && hasContract &&
    contracts.every((address) => normalizeTokenAddress(address, observedChain) === expectedWrapper);
  const listingIds = supplied([project.verifiedExchangeAssetId, project.exchangeAssetId]);
  const listingVenues = supplied([project.exchange, project.venue, project.dexName]).map(normalizeVenue);
  const listingVenue = listingVenues[0];
  const listingSources = supplied([project.source, project.provider]).map(normalizeVenue);
  const exactListingIds = listingIds.length > 0 && listingIds.every((id) => {
    const parts = clean(id).split(":");
    return parts.length === 2 && normalizeVenue(parts[0]) === listingVenue && upper(parts[1]) === nativeAsset.symbol;
  });
  const listingPair = new RegExp(`^${nativeAsset.symbol}[-_/:]?(USD[TC]?|BTC|ETH|BNB|SOL)$`);
  // A root listing flag is not provider identity; require the connector's scoped asset ID.
  const exactNativeListing = chainAgrees && sameNativeChain && !hasContract &&
    venueType(listingVenue) === "cex" && listingSources.length > 0 &&
    listingSources.every((source) => source === listingVenue) &&
    listingVenues.every((venue) => venue === listingVenue) &&
    project.listingVerified !== false && project.exchangeListingVerified !== false &&
    (project.listingVerified === true || project.exchangeListingVerified === true) &&
    exactListingIds && listingPair.test(upper(project.marketPair));
  const wrappedLanguage = WRAPPED_TERMS.test(textFor(project));

  if (exactWrapper || exactNativeListing) {
    return {
      isEstablishedNativeAsset: true,
      nativeAsset,
      observedChain,
      nativeChain,
      nativeChainId: nativeAssetChainId(nativeAsset),
      variantType: exactWrapper ? "WRAPPED_NATIVE_OR_GAS_WRAPPER" : "NATIVE",
      benchmarkLane: nativeAsset.benchmarkLane,
      quarantineReason: null,
      requiresWrappedAssetVerification: false,
    };
  }

  const variantType = wrappedLanguage ? "WRAPPED_OR_BRIDGED" : hasContract ? "IMITATION_OR_UNVERIFIED_WRAPPER" : "NATIVE_ASSET_MISMATCH";
  return {
    isEstablishedNativeAsset: false,
    nativeAsset,
    observedChain,
    nativeChain,
    nativeChainId: nativeAssetChainId(nativeAsset),
    variantType,
    benchmarkLane: null,
    quarantineReason: wrappedLanguage ? "WRAPPED_ASSET_UNVERIFIED" : "NATIVE_ASSET_MISMATCH",
    requiresWrappedAssetVerification: true,
  };
}
