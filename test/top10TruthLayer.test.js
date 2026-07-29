import test from "node:test";
import assert from "node:assert/strict";

import { normalizeCoinGeckoMarket } from "../src/data/coinGeckoConnector.js";
import { normalizeGeckoPool } from "../src/data/geckoTerminalConnector.js";
import { candidateFromArticle, symbolFromTitle } from "../src/data/googleNewsDiscoveryConnector.js";
import { normalizeRepo } from "../src/data/githubProjectDiscoveryConnector.js";
import { normalizeMetricTruth, sourceFamiliesForProject } from "../src/data/metricTruthNormalizer.js";
import { buildTop10BreakoutReport } from "../src/reports/top10BreakoutReportEngine.js";
import { createProjectObservation } from "../src/learning/projectObservationStore.js";

const TOKEN = "0x0000000000000000000000000000000000000a11";
const POOL = "0x0000000000000000000000000000000000000b11";

test("CoinGecko category cannot become chain and market cap is not liquidity", () => {
  const candidate = normalizeCoinGeckoMarket(
    {
      id: "alpha-token",
      name: "Alpha Token",
      symbol: "ake",
      current_price: 0.11,
      market_cap: 1_250_000,
      total_volume: 180_000,
      fully_diluted_valuation: 5_000_000,
    },
    { category: "gaming" }
  );
  const normalized = normalizeMetricTruth(candidate);

  assert.equal(candidate.chain, null);
  assert.equal(normalized.chainId, null);
  assert.equal(normalized.category, "gaming");
  assert.equal(normalized.liquidityUsd, null);
  assert.equal(normalized.dexLiquidityUsd, null);
  assert.equal(normalized.circulatingMarketCapUsd, 1_250_000);
});

test("invalid raw chain and address strings are null with explicit identity conflicts", () => {
  const normalized = normalizeMetricTruth({
    name: "Bad Identity",
    symbol: "BAD",
    source: "coingecko",
    chain: "gaming",
    address: "alpha-token",
    tokenAddress: "coingecko:alpha-token",
    contractAddress: "BAD",
    pairAddress: "https://dexscreener.com/base/alpha",
    poolAddress: "top-volume",
    marketCap: 900_000,
  });

  assert.equal(normalized.chainId, null);
  assert.equal(normalized.chain, null);
  assert.equal(normalized.address, null);
  assert.equal(normalized.tokenAddress, null);
  assert.equal(normalized.contractAddress, null);
  assert.equal(normalized.pairAddress, null);
  assert.equal(normalized.poolAddress, null);
  assert.ok(normalized.identityConflicts.some((reason) => reason.includes("Rejected non-chain value")));
  assert.ok(normalized.identityConflicts.some((reason) => reason.includes("Rejected token address")));
  assert.ok(normalized.identityConflicts.some((reason) => reason.includes("Rejected pool address")));
  assert.equal(normalized.circulatingMarketCapUsd, 900_000);
  assert.equal(normalized.dexLiquidityUsd, null);
});

test("GeckoTerminal pool address cannot be mistaken for token address", () => {
  const normalized = normalizeGeckoPool({
    id: `base_${POOL}`,
    attributes: {
      address: POOL,
      name: "Alpha / WETH",
      base_token_price_usd: "0.05",
      reserve_in_usd: "75000",
      volume_usd: { h24: "100000" },
      transactions: { h24: { buys: 90, sells: 30 } },
    },
    relationships: {
      network: { data: { id: "base" } },
      base_token: { data: { id: `base_${TOKEN}` } },
    },
  });
  const truth = normalizeMetricTruth(normalized);

  assert.equal(truth.tokenAddress, TOKEN);
  assert.equal(truth.poolAddress, POOL);
  assert.notEqual(truth.tokenAddress, truth.poolAddress);
  assert.equal(truth.dexLiquidityUsd, 75_000);
});

test("token address equal to pool address is flagged and token identity is withheld", () => {
  const truth = normalizeMetricTruth({
    name: "Same Address",
    symbol: "SAME",
    chain: "base",
    source: "dexscreener",
    address: TOKEN,
    tokenAddress: TOKEN,
    pairAddress: TOKEN,
    poolAddress: TOKEN,
    liquidityUsd: 25_000,
  });

  assert.equal(truth.tokenAddress, null);
  assert.equal(truth.contractAddress, null);
  assert.equal(truth.poolAddress, TOKEN);
  assert.ok(truth.identityConflicts.some((reason) => reason.includes("Token address equals pool address")));
});

test("CEX volume and DeFiLlama TVL do not become token DEX liquidity", () => {
  const cex = normalizeMetricTruth({
    name: "Alpha",
    symbol: "AKE",
    source: "coinbase",
    exchange: "Coinbase",
    dex: "cex",
    volume24h: 9_000_000,
  });
  const tvl = normalizeMetricTruth({
    name: "Alpha Protocol",
    symbol: "AKE",
    source: "defillama",
    tvl: 22_000_000,
    liquidityUsd: 22_000_000,
  });

  assert.equal(cex.dexLiquidityUsd, null);
  assert.equal(cex.cexVolume24hUsd, 9_000_000);
  assert.equal(tvl.dexLiquidityUsd, null);
  assert.equal(tvl.protocolTvlUsd, 22_000_000);
});

test("news and repository discovery remain unresolved research until identity is matched", () => {
  const article = candidateFromArticle(
    { title: "New chain project launches mainnet - Example News", url: "https://example.com/a" },
    "crypto token launch"
  );
  const repo = normalizeRepo({
    full_name: "builder/alpha-protocol",
    name: "alpha-protocol",
    html_url: "https://github.com/builder/alpha-protocol",
    description: "Base DeFi protocol",
    pushed_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    stargazers_count: 40,
    forks_count: 5,
  });

  assert.equal(symbolFromTitle("New chain project launches mainnet"), null);
  assert.equal(article.tradableCandidate, false);
  assert.equal(article.liquidityUsd, null);
  assert.equal(repo.tradableCandidate, false);
  assert.equal(repo.commits30d, null);
  assert.equal(repo.contributors, null);
});

function strongProject(overrides = {}) {
  const quoteTimestamp = new Date().toISOString();
  return {
    name: "Alpha Keeper",
    symbol: "AKE",
    chain: "base",
    contractAddress: TOKEN,
    tokenAddress: TOKEN,
    poolAddress: POOL,
    pairAddress: POOL,
    dex: "Uniswap",
    dexName: "Uniswap",
    quoteAsset: "USDC",
    source: "dexscreener",
    discoverySources: ["dexscreener", "dexscreener-boosts", "geckoterminal", "github-project-discovery"],
    priceUsd: 0.08,
    liquidityUsd: 180_000,
    dexLiquidityUsd: 180_000,
    stableExitLiquidityUsd: 90_000,
    circulatingMarketCapUsd: 1_800_000,
    fdv: 8_500_000,
    finalSelectionQualified: true,
    finalSelectionState: "QUALIFIED",
    identityVerified: true,
    contractVerified: true,
    instantSafetyStatus: "PASS",
    routeTruthStatus: "LIVE_EXECUTION_READY",
    executionProofState: "LIVE_EXECUTION_READY",
    executionStatus: "LIVE_EXECUTION_READY",
    exactIdentityVerified: true,
    buyQuoteVerified: true,
    sellQuoteVerified: true,
    orderBookDepthVerified: true,
    orderBookDepthUsd: 180_000,
    estimatedRoundTripSlippagePct: 1.8,
    quoteTimestamp,
    quoteAgeSeconds: 60,
    purchaseRouteConfirmed: true,
    executionRouteAvailable: true,
    executionRoute: {
      venue: "Uniswap",
      routeType: "DEX",
      chain: "base",
      tokenAddress: TOKEN,
      contract: TOKEN,
      poolAddress: POOL,
      pairAddress: POOL,
      quoteAsset: "USDC",
      buyRouteAvailable: true,
      sellRouteAvailable: true,
      buyQuoteVerified: true,
      sellQuoteVerified: true,
      quoteTimestamp,
      quoteAgeSeconds: 60,
      liquidityUsd: 180_000,
      volume24hUsd: 95_000,
      estimatedRoundTripSlippagePct: 1.8,
      slippageIsHeuristic: false,
      regionStatus: "CONFIRMED_AVAILABLE",
    },
    executionProof: {
      executionStatus: "LIVE_EXECUTION_READY",
      executionProofState: "LIVE_EXECUTION_READY",
      routeTruthStatus: "LIVE_EXECUTION_READY",
      buyQuoteVerified: true,
      sellQuoteVerified: true,
      orderBookDepthVerified: true,
      observedSlippagePct: 1.8,
      quoteTimestamp,
      quoteAgeSeconds: 60,
      exactIdentityVerified: true,
    },
    accelerationScore: 84,
    preBreakoutMomentumScore: 82,
    momentumShiftScore: 80,
    liquidityFormationScore: 82,
    liquidityExpansionScore: 84,
    activeLiquidityTruthScore: 80,
    organicBuyerScore: 82,
    buyerRetentionScore: 78,
    buyPressureScore: 80,
    unrelatedBuyerClusters: 82,
    smartWalletArrivalScore: 78,
    smartWalletPerformanceScore: 76,
    smartMoneyAccumulationScore: 80,
    liveCatalystRadarScore: 76,
    catalystCalendarScore: 74,
    roadmapCatalystProfitScore: 72,
    developerActivityScore: 78,
    githubProScore: 76,
    relativeStrengthScore: 78,
    marketRankScore: 74,
    executionScore: 84,
    sourceTruthScore: 82,
    sourceReliabilityScore: 80,
    opportunityEvidenceCoverage: 78,
    identityConfidence: 92,
    ...overrides,
  };
}

test("Top 10 funnel qualifies only evidence-backed projects and includes score traces", () => {
  const report = buildTop10BreakoutReport([
    strongProject(),
    strongProject({
      symbol: "NEWS",
      name: "News Only",
      contractAddress: null,
      tokenAddress: null,
      poolAddress: null,
      pairAddress: "google-news-1",
      source: "google-news",
      researchOnly: true,
      tradableCandidate: false,
      purchaseRouteConfirmed: false,
      executionRouteAvailable: false,
    }),
  ]);

  assert.equal(report.qualifiedPicks.length, 1);
  assert.equal(report.top10Slots.length, 10);
  assert.equal(report.top10Slots.filter((slot) => slot.status === "EMPTY").length, 9);
  assert.equal(report.qualifiedPicks[0].symbol, "AKE");
  assert.equal(report.qualifiedPicks[0].scoreContributionTrace.length, 10);
  assert.ok(report.excludedFinalists.some((item) => item.symbol === "NEWS"));
});

test("duplicate provider variants do not multiply independent evidence confidence", () => {
  const families = sourceFamiliesForProject({
    source: "dexscreener",
    discoverySources: ["dexscreener", "dexscreener-boosts", "dexscreener-profiles"],
  });

  assert.deepEqual(families, ["market-aggregator"]);
});

test("project observation store preserves unknown as null instead of zero", () => {
  const observation = createProjectObservation({
    name: "Unknown Liquidity",
    symbol: "UNK",
    source: "coinbase",
    volume24h: 1_000_000,
  });

  assert.equal(observation.dexLiquidityUsd, null);
  assert.equal(observation.cexVolume24hUsd, 1_000_000);
});
