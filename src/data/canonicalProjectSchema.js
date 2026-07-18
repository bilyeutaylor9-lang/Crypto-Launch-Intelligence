import { canonicalSourceId } from "../config/sourceManifest.js";

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

export const INVALID_CHAIN_VALUES = new Set([
  "binance",
  "binance-us",
  "coinbase",
  "coingecko",
  "coingecko-trending",
  "coinpaprika",
  "defillama",
  "defillama-chain",
  "dexscreener",
  "github",
  "github-project-discovery",
  "google-news",
  "google news",
  "kraken",
  "kucoin",
  "market",
  "research-seed",
  "research seed",
  "top-volume",
  "trending",
]);

const CHAIN_ALIASES = {
  "1": "ethereum",
  eth: "ethereum",
  ethereum: "ethereum",
  mainnet: "ethereum",
  "8453": "base",
  base: "base",
  "56": "bsc",
  bnb: "bsc",
  bsc: "bsc",
  "42161": "arbitrum",
  arb: "arbitrum",
  arbitrum: "arbitrum",
  "137": "polygon",
  matic: "polygon",
  polygon: "polygon",
  "10": "optimism",
  op: "optimism",
  optimism: "optimism",
  "43114": "avalanche",
  avax: "avalanche",
  avalanche: "avalanche",
  "101": "solana",
  sol: "solana",
  solana: "solana",
};

export function nullableNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function clean(value = "") {
  return String(value ?? "").trim();
}

function lower(value = "") {
  return clean(value).toLowerCase();
}

export function normalizeChainId(value = "") {
  const key = lower(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!key || INVALID_CHAIN_VALUES.has(key)) return null;
  return CHAIN_ALIASES[key] || key;
}

export function normalizeAddress(value = "") {
  const raw = clean(value);
  if (!raw) return null;
  const lowered = raw.toLowerCase();
  if (/^0x[a-f0-9]{40}$/.test(lowered)) return lowered;
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(raw)) return raw;
  return raw;
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
  const chainId = normalizeChainId(first([
    raw.chainId,
    raw.finalChainId,
    raw.finalChain,
    raw.network,
    raw.chain,
  ]));
  const tokenAddress = normalizeAddress(first([
    raw.finalContractAddress,
    raw.contractAddress,
    raw.tokenAddress,
    raw.address,
    raw.baseToken?.address,
  ]));
  const poolAddress = normalizeAddress(first([
    raw.poolAddress,
    raw.pairAddress,
    raw.pair?.address,
  ]));
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
    ...(!chainId && raw.chain ? [`Ignored non-chain value in chain field: ${raw.chain}`] : []),
    ...(tokenAddress && poolAddress && tokenAddress === poolAddress
      ? ["Token address equals pool address; token identity requires verification."]
      : []),
  ];

  return {
    ...raw,
    projectId: projectId || raw.projectId || null,
    parentProjectId: raw.parentProjectId || null,
    chainId,
    tokenAddress: tokenAddress && tokenAddress !== poolAddress ? tokenAddress : null,
    poolAddress,
    deployerAddress: normalizeAddress(raw.deployerAddress || raw.deployer || raw.creatorAddress),
    officialDomain,
    officialRepositories,
    coinGeckoId: raw.coinGeckoId || raw.coingeckoId || null,
    coinPaprikaId: raw.coinPaprikaId || null,
    exchangeAssetIds,
    exchangeMarkets,
    symbol: raw.symbol || raw.ticker || raw.baseToken?.symbol || "UNKNOWN",
    name: raw.name || raw.baseToken?.name || "Unknown",
    identityConfidence: raw.identityConfidence ?? raw.identityResolutionScore ?? (identityEvidence.length ? 55 + Math.min(35, identityEvidence.length * 8) : 15),
    identityEvidence,
    identityConflicts,
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
