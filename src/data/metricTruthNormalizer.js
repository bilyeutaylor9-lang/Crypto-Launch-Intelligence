import { canonicalSourceId, evidenceFamilyForSource, truthKindForSource } from "../config/sourceManifest.js";
import {
  applyProvenance,
  buildCanonicalProject,
  normalizeChainId,
  nullableNumber,
  provenanceRecord,
} from "./canonicalProjectSchema.js";
import { chainRejectionReason } from "../identity/strictIdentityValidators.js";

const SOURCE_CONFIDENCE = {
  dexscreener: 76,
  geckoterminal: 78,
  nativeDiscoveryMesh: 86,
  "native-discovery-mesh": 86,
  coingecko: 72,
  "coingecko-trending": 66,
  coinpaprika: 70,
  coinlore: 68,
  "coinlore-assets": 66,
  "coinlore-movers": 64,
  coincap: 64,
  cryptocompare: 64,
  defillama: 74,
  "defillama-chain": 68,
  "defillama-exact-price": 78,
  binance: 72,
  "binance-us": 72,
  coinbase: 76,
  kraken: 72,
  kucoin: 68,
  okx: 68,
  bybit: 62,
  gate: 64,
  mexc: 62,
  bitget: 64,
  htx: 60,
  bitfinex: 62,
  bitstamp: 64,
  gemini: 68,
  "google-news": 38,
  "github-project-discovery": 42,
};

function num(value) {
  return nullableNumber(value);
}

function first(values = []) {
  return values.find((value) => value !== undefined && value !== null && value !== "") ?? null;
}

function sourceConfidence(source = "unknown") {
  return SOURCE_CONFIDENCE[source] ?? 50;
}

function sourceGroup(source = "unknown", project = {}) {
  const canonical = canonicalSourceId(source);
  const manifestKind = truthKindForSource(canonical);
  const hasPoolAndToken =
    (project.poolAddress || project.pairAddress || project.pair?.address) &&
    (project.tokenAddress || project.contractAddress || project.address || project.baseToken?.address);
  if (manifestKind === "aggregate-market") return "aggregate-market";
  if (manifestKind === "cex") return "cex";
  if (manifestKind === "protocol-tvl") return "protocol-tvl";
  if (manifestKind === "unresolved-news" || canonical === "googleNewsDiscovery" || canonical === "google-news") return "unresolved-news";
  if (manifestKind === "unresolved-repository" || canonical === "githubProjectDiscovery" || canonical === "github-project-discovery") return "unresolved-repository";
  if (manifestKind !== "unknown" && manifestKind !== "dex") return manifestKind;
  if (
    manifestKind === "dex" ||
    project.dex === "dex" ||
    (project.dex && project.dex !== "cex" && project.dex !== "market-aggregate" && project.dex !== "internet-research") ||
    hasPoolAndToken
  ) return "dex";
  if (project.dex === "cex" || project.exchange) return "cex";
  return "unknown";
}

function withField(project = {}, field = "", value, source = "unknown", measurementType = "", confidence = null) {
  if (value === null || value === undefined || value === "") return project;
  return applyProvenance(
    project,
    field,
    provenanceRecord({
      value,
      source,
      observedAt: project.observationTimestamp || new Date().toISOString(),
      sourceTimestamp: project.sourceTimestamp || null,
      confidence: confidence ?? sourceConfidence(source),
      measurementType,
      endpoint: project.endpoint || project.requestUrl || null,
    })
  );
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

export function sourceFamiliesForProject(project = {}) {
  return unique([
    ...(Array.isArray(project.evidenceFamilies) ? project.evidenceFamilies : []),
    ...(Array.isArray(project.discoverySources) ? project.discoverySources : []),
    ...(Array.isArray(project.sources) ? project.sources : []),
    ...(Array.isArray(project.evidenceSources) ? project.evidenceSources : []),
    project.source,
    project.dex,
    project.exchange,
  ])
    .map((source) => evidenceFamilyForSource(source))
    .filter((family) => family && family !== "unknown")
    .filter((family, index, list) => list.indexOf(family) === index);
}

export function normalizeMetricTruth(raw = {}, options = {}) {
  const source = canonicalSourceId(options.source || raw.source || raw.discoverySource || raw.provider || "unknown");
  const group = sourceGroup(source, raw);
  let project = buildCanonicalProject(raw, { ...options, source });

  project = withField(project, "priceUsd", num(first([raw.priceUsd, raw.price])), source, "price");

  if (group === "dex") {
    project = withField(
      project,
      "dexLiquidityUsd",
      num(first([raw.dexLiquidityUsd, raw.liquidityUsd, raw.liquidity?.usd, raw.currentLiquidityUsd, raw.activeLiquidityUsd])),
      source,
      "dex_liquidity"
    );
    project = withField(
      project,
      "stableExitLiquidityUsd",
      num(first([raw.stableExitLiquidityUsd, raw.hardExitLiquidityUsd])),
      source,
      "stable_exit_liquidity"
    );
    project = withField(
      project,
      "dexVolume24hUsd",
      num(first([raw.dexVolume24hUsd, raw.volume24h, raw.volume?.h24, raw.volumeUsd24h])),
      source,
      "dex_volume_24h"
    );
  }

  if (group === "cex") {
    project = withField(
      project,
      "cexVolume24hUsd",
      num(first([raw.cexVolume24hUsd, raw.volume24h, raw.volume])),
      source,
      "cex_volume_24h"
    );
    project = withField(
      project,
      "cexOrderBookDepthUsd",
      num(first([raw.cexOrderBookDepthUsd, raw.orderBookDepthUsd, raw.depthUsd])),
      source,
      "cex_order_book_depth"
    );
  }

  if (group === "protocol-tvl") {
    project = withField(project, "protocolTvlUsd", num(first([raw.protocolTvlUsd, raw.tvl, raw.liquidityUsd])), source, "protocol_tvl");
  }

  if (group === "aggregate-market" || source === "coingecko" || source === "coinpaprika") {
    project = withField(
      project,
      "circulatingMarketCapUsd",
      num(first([raw.circulatingMarketCapUsd, raw.circulatingMarketCap, raw.marketCap, raw.market_cap])),
      source,
      "circulating_market_cap"
    );
    project = withField(
      project,
      "fullyDilutedValueUsd",
      num(first([raw.fullyDilutedValueUsd, raw.fdv, raw.fullyDilutedValue])),
      source,
      "fully_diluted_value"
    );
    project = withField(project, "circulatingSupply", num(raw.circulatingSupply), source, "circulating_supply");
    project = withField(project, "totalSupply", num(raw.totalSupply), source, "total_supply");
    project = withField(project, "maxSupply", num(raw.maxSupply), source, "max_supply");
  }

  if (group === "unknown") {
    project = withField(
      project,
      "estimatedMarketCapUsd",
      num(first([raw.estimatedMarketCapUsd, raw.estimatedMarketCap, raw.marketCap, raw.market_cap])),
      source,
      "estimated_market_cap",
      Math.min(sourceConfidence(source), 45)
    );
  }

  const preservedMarketCap = first([
    project.circulatingMarketCapUsd,
    project.estimatedMarketCapUsd,
    raw.marketCap,
    raw.market_cap,
    raw.marketData?.marketCap,
  ]);
  const preservedVolume24h = first([
    project.dexVolume24hUsd,
    project.cexVolume24hUsd,
    raw.volume24h,
    raw.volume,
    raw.volumeUsd24h,
    raw.marketData?.volume24h,
  ]);

  const rawChain = first([project.chainId, raw.chainId, raw.network, raw.chain]);
  const canonicalChain = normalizeChainId(rawChain);
  const chainWarnings = [
    ...(project.identityConflicts || []),
    chainRejectionReason(rawChain),
  ];
  const evidenceSources = unique([
    ...(Array.isArray(project.evidenceSources) ? project.evidenceSources : []),
    ...(Array.isArray(raw.discoverySources) ? raw.discoverySources.map(canonicalSourceId) : []),
    source,
  ]);

  return {
    ...project,
    chain: canonicalChain || null,
    chainId: canonicalChain,
    address: project.tokenAddress || null,
    tokenAddress: project.tokenAddress || null,
    contractAddress: project.tokenAddress || null,
    pairAddress: project.poolAddress || null,
    poolAddress: project.poolAddress || null,
    liquidityUsd: project.dexLiquidityUsd,
    marketCap: preservedMarketCap,
    volume24h: preservedVolume24h,
    fdv: project.fullyDilutedValueUsd,
    fullyDilutedValue: project.fullyDilutedValueUsd,
    protocolTvlUsd: project.protocolTvlUsd,
    sourceType: group,
    evidenceSources,
    evidenceSourceFamilies: unique([...sourceFamiliesForProject(project), evidenceFamilyForSource(source)]),
    identityConflicts: unique(chainWarnings),
    canonicalSchemaVersion: "top10-truth-v1",
    metricTruth: {
      source,
      sourceType: group,
      measurementWarnings: unique([
        ...(group === "aggregate-market" ? ["Aggregate market cap or total volume is not token DEX liquidity."] : []),
        ...(group === "unknown" && preservedMarketCap ? ["Unclassified source market cap preserved as estimated evidence; do not treat it as verified circulating supply."] : []),
        ...(group === "protocol-tvl" ? ["Protocol TVL is not token DEX liquidity."] : []),
        ...(group === "cex" ? ["CEX volume is not executable DEX liquidity."] : []),
        ...(group === "unresolved-news" ? ["News item is an unresolved claim until matched to a project identity."] : []),
        ...(group === "unresolved-repository" ? ["Repository is developer evidence only until matched to a tradable token identity."] : []),
      ]),
    },
  };
}

export function normalizeMetricTruthBatch(projects = [], options = {}) {
  return (Array.isArray(projects) ? projects : []).map((project) => normalizeMetricTruth(project, options));
}
