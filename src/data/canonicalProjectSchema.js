import { canonicalSourceId } from "../config/sourceManifest.js";
import {
  REJECTED_CHAIN_VALUES,
  SUPPORTED_CHAIN_REGISTRY,
  addressRejectionReason,
  chainRejectionReason,
  classifyAddressState,
  normalizeAddress,
  normalizeChainId,
  normalizePoolAddress,
  normalizeTokenAddress,
  normalizeWalletAddress,
} from "../identity/strictIdentityValidators.js";

export const CANONICAL_PROJECT_FIELDS = [
  "projectId",
  "parentProjectId",
  "chainId",
  "tokenAddress",
  "poolAddress",
  "deployerAddress",
  "officialDomain",
  "officialRepositories",
  "coinGeckoId",
  "coinPaprikaId",
  "exchangeAssetIds",
  "exchangeMarkets",
  "symbol",
  "name",
  "identityConfidence",
  "identityEvidence",
  "identityConflicts",
  "priceUsd",
  "dexLiquidityUsd",
  "stableExitLiquidityUsd",
  "protocolTvlUsd",
  "cexVolume24hUsd",
  "dexVolume24hUsd",
  "cexOrderBookDepthUsd",
  "circulatingMarketCapUsd",
  "estimatedMarketCapUsd",
  "fullyDilutedValueUsd",
  "circulatingSupply",
  "totalSupply",
  "maxSupply",
  "holderCount",
  "observationTimestamp",
  "sourceTimestamp",
  "evidenceSources",
  "fieldProvenance",
  "evidenceConfidence",
];

export const INVALID_CHAIN_VALUES = REJECTED_CHAIN_VALUES;
export {
  SUPPORTED_CHAIN_REGISTRY,
  normalizeAddress,
  normalizeChainId,
  normalizePoolAddress,
  normalizeTokenAddress,
  normalizeWalletAddress,
};

export function nullableNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function clean(value = "") {
  return String(value ?? "").trim();
}

export function officialDomainFrom(value = "") {
  const raw = clean(value);
  if (!raw) return null;
  try {
    return new URL(raw).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    const match = raw.match(/(?:https?:\/\/)?(?:www\.)?([a-z0-9.-]+\.[a-z]{2,})/i);
    return match ? match[1].toLowerCase() : null;
  }
}

function unique(values = []) {
  return [...new Set(values.filter((value) => value !== null && value !== undefined && value !== ""))];
}

function first(values = []) {
  return values.find((value) => value !== undefined && value !== null && value !== "") ?? null;
}

export function provenanceRecord({
  value,
  source = "unknown",
  observedAt = new Date().toISOString(),
  sourceTimestamp = null,
  confidence = 50,
  measurementType = "unknown",
  endpoint = null,
} = {}) {
  return {
    value,
    source: canonicalSourceId(source),
    observedAt,
    sourceTimestamp,
    confidence: Math.max(0, Math.min(100, Number(confidence) || 0)),
    measurementType,
    endpoint,
  };
}

export function preferProvenance(existing = null, incoming = null) {
  if (!incoming) return existing;
  if (!existing) return incoming;
  if (Number(incoming.confidence || 0) > Number(existing.confidence || 0)) return incoming;
  if (Number(incoming.confidence || 0) < Number(existing.confidence || 0)) return existing;

  const incomingTime = Date.parse(incoming.observedAt || "");
  const existingTime = Date.parse(existing.observedAt || "");
  if (Number.isFinite(incomingTime) && Number.isFinite(existingTime)) {
    return incomingTime >= existingTime ? incoming : existing;
  }

  return existing;
}

export function applyProvenance(project = {}, field = "", record = null) {
  if (!field || !record) return project;
  const existing = project.fieldProvenance?.[field] || null;
  const preferred = preferProvenance(existing, record);

  return {
    ...project,
    [field]: preferred?.value ?? project[field] ?? null,
    fieldProvenance: {
      ...(project.fieldProvenance || {}),
      [field]: preferred,
    },
  };
}

export function buildCanonicalProject(raw = {}, options = {}) {
  const observedAt = options.observedAt || raw.observationTimestamp || raw.discoveredAt || new Date().toISOString();
  const source = canonicalSourceId(options.source || raw.source || raw.discoverySource || raw.provider || "unknown");
  const rawChain = first([
    raw.chainId,
    raw.finalChainId,
    raw.finalChain,
    raw.network,
    raw.chain,
  ]);
  const chainId = normalizeChainId(rawChain);
  const rawTokenAddress = first([
    raw.finalContractAddress,
    raw.contractAddress,
    raw.tokenAddress,
    raw.address,
    raw.baseToken?.address,
  ]);
  const rawPoolAddress = first([
    raw.poolAddress,
    raw.pairAddress,
    raw.pair?.address,
  ]);
  const rawDeployerAddress = first([raw.deployerAddress, raw.deployer, raw.creatorAddress]);
  const normalizedTokenAddress = normalizeTokenAddress(rawTokenAddress, chainId);
  const poolAddress = normalizePoolAddress(rawPoolAddress, chainId);
  const tokenAddress = normalizedTokenAddress && normalizedTokenAddress !== poolAddress ? normalizedTokenAddress : null;
  const deployerAddress = normalizeWalletAddress(rawDeployerAddress, chainId);
  const tokenAddressState = classifyAddressState(rawTokenAddress, chainId);
  const poolAddressState = classifyAddressState(rawPoolAddress, chainId);
  const chainStatus = chainId ? "SUPPORTED_CHAIN" : rawChain ? "UNSUPPORTED_OR_REJECTED_CHAIN" : "MISSING_CHAIN";
  const projectId = first([
    raw.canonicalProjectId,
    raw.permanentProjectKey,
    raw.finalProjectKey,
    raw.projectId,
    chainId && tokenAddress ? `${chainId}:${tokenAddress}` : null,
    chainId && poolAddress ? `${chainId}:pool:${poolAddress}` : null,
    raw.coinGeckoId ? `coingecko:${raw.coinGeckoId}` : null,
    raw.coinPaprikaId ? `coinpaprika:${raw.coinPaprikaId}` : null,
  ]);
  const officialDomain = first([
    raw.officialDomain,
    officialDomainFrom(raw.website),
    officialDomainFrom(raw.projectUrl),
    officialDomainFrom(raw.url),
    officialDomainFrom(raw.links?.website),
  ]);
  const officialRepositories = unique([
    raw.github,
    raw.githubUrl,
    raw.repository,
    ...(Array.isArray(raw.repositories) ? raw.repositories : []),
  ]);
  const exchangeMarkets = unique([
    raw.marketKey,
    raw.pairAddress && raw.dex === "cex" ? raw.pairAddress : null,
    ...(Array.isArray(raw.exchangeMarkets) ? raw.exchangeMarkets : []),
  ]);
  const exchangeAssetIds = unique([
    raw.exchangeAssetId,
    raw.assetKey,
    raw.coinbaseAssetId,
    raw.binanceAssetId,
    raw.krakenAssetId,
    ...(Array.isArray(raw.exchangeAssetIds) ? raw.exchangeAssetIds : []),
  ]);
  const identityEvidence = unique([
    ...(tokenAddress ? ["token-contract"] : []),
    ...(poolAddress ? ["pool-address"] : []),
    ...(officialDomain ? ["official-domain"] : []),
    ...(officialRepositories.length ? ["official-repository"] : []),
    ...(raw.coinGeckoId || raw.coingeckoId ? ["coingecko-id"] : []),
    ...(raw.coinPaprikaId ? ["coinpaprika-id"] : []),
    ...(exchangeMarkets.length || exchangeAssetIds.length ? ["exchange-market"] : []),
  ]);
  const identityConflicts = [
    ...(Array.isArray(raw.identityConflicts) ? raw.identityConflicts : []),
    chainRejectionReason(rawChain),
    addressRejectionReason(rawTokenAddress, "token address", chainId),
    addressRejectionReason(rawPoolAddress, "pool address", chainId),
    addressRejectionReason(rawDeployerAddress, "deployer address", chainId),
    ...(normalizedTokenAddress && poolAddress && normalizedTokenAddress === poolAddress
      ? ["Token address equals pool address; token identity requires verification."]
      : []),
  ].filter(Boolean);

  return {
    ...raw,
    projectId: projectId || raw.projectId || null,
    parentProjectId: raw.parentProjectId || null,
    chainId,
    chain: chainId,
    address: tokenAddress,
    contractAddress: tokenAddress,
    tokenAddress,
    pairAddress: poolAddress,
    poolAddress,
    deployerAddress,
    officialDomain,
    officialRepositories,
    coinGeckoId: raw.coinGeckoId || raw.coingeckoId || null,
    coinPaprikaId: raw.coinPaprikaId || null,
    exchangeAssetIds,
    exchangeMarkets,
    symbol: raw.symbol || raw.ticker || raw.baseToken?.symbol || "UNKNOWN",
    name: raw.name || raw.baseToken?.name || "Unknown",
    identityConfidence: raw.identityConfidence ?? raw.identityResolutionScore ?? (identityEvidence.length ? 55 + Math.min(35, identityEvidence.length * 8) : 15),
    identityStatus:
      tokenAddress && poolAddress && !identityConflicts.length
        ? "VALIDATED_ADDRESS"
        : identityEvidence.length
          ? "SYNTACTICALLY_VALID_UNVERIFIED"
          : "MISSING_ADDRESS",
    identityEvidence,
    identityConflicts,
    tokenAddressStatus: tokenAddress ? "SYNTACTICALLY_VALID_UNVERIFIED" : tokenAddressState.state,
    poolAddressStatus: poolAddress ? "SYNTACTICALLY_VALID_UNVERIFIED" : poolAddressState.state,
    rawTokenAddress: rawTokenAddress || null,
    rawPoolAddress: rawPoolAddress || null,
    chainStatus,
    priceUsd: nullableNumber(raw.priceUsd ?? raw.price),
    dexLiquidityUsd: nullableNumber(raw.dexLiquidityUsd),
    stableExitLiquidityUsd: nullableNumber(raw.stableExitLiquidityUsd ?? raw.hardExitLiquidityUsd),
    protocolTvlUsd: nullableNumber(raw.protocolTvlUsd ?? raw.tvl),
    cexVolume24hUsd: nullableNumber(raw.cexVolume24hUsd),
    dexVolume24hUsd: nullableNumber(raw.dexVolume24hUsd),
    cexOrderBookDepthUsd: nullableNumber(raw.cexOrderBookDepthUsd),
    circulatingMarketCapUsd: nullableNumber(raw.circulatingMarketCapUsd ?? raw.circulatingMarketCap ?? raw.verifiedMarketCap),
    estimatedMarketCapUsd: nullableNumber(raw.estimatedMarketCapUsd ?? raw.estimatedMarketCap),
    fullyDilutedValueUsd: nullableNumber(raw.fullyDilutedValueUsd ?? raw.fdv ?? raw.fullyDilutedValue),
    circulatingSupply: nullableNumber(raw.circulatingSupply),
    totalSupply: nullableNumber(raw.totalSupply),
    maxSupply: nullableNumber(raw.maxSupply),
    holderCount: nullableNumber(raw.holderCount ?? raw.holders),
    observationTimestamp: observedAt,
    sourceTimestamp: raw.sourceTimestamp || raw.updatedAt || raw.lastUpdatedAt || null,
    evidenceSources: unique([...(Array.isArray(raw.evidenceSources) ? raw.evidenceSources : []), source]),
    fieldProvenance: raw.fieldProvenance || {},
    evidenceConfidence: Math.max(
      0,
      Math.min(100, Number(raw.evidenceConfidence ?? raw.dataConfidenceScore ?? raw.sourceTruthScore ?? 50) || 0)
    ),
  };
}
