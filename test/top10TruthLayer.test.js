import test from "node:test";
import assert from "node:assert/strict";

import { normalizeCoinGeckoMarket } from "../src/data/coinGeckoConnector.js";
import { normalizeGeckoPool } from "../src/data/geckoTerminalConnector.js";
import { candidateFromArticle, symbolFromTitle } from "../src/data/googleNewsDiscoveryConnector.js";
import { normalizeRepo } from "../src/data/githubProjectDiscoveryConnector.js";
import { normalizeMetricTruth, sourceFamiliesForProject } from "../src/data/metricTruthNormalizer.js";
import { summarizeAutonomousAlphaOS } from "../src/engines/autonomousAlphaOSEngine.js";
import { buildTop10BreakoutReport, buildTop10CandidateInput } from "../src/reports/top10BreakoutReportEngine.js";
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

test("expanded aggregate providers preserve market cap through manifest-backed normalization", () => {
  const coinLore = normalizeMetricTruth({
    name: "CoinLore Alpha",
    symbol: "CLA",
    source: "coinlore-assets",
    providerAssetId: "77",
    marketKey: "coinlore-assets:77",
    dex: "market",
    priceUsd: 0.018,
    marketCap: 8_400_000,
    volume24h: 2_100_000,
  });

  assert.equal(coinLore.sourceType, "aggregate-market");
  assert.equal(coinLore.circulatingMarketCapUsd, 8_400_000);
  assert.equal(coinLore.marketCap, 8_400_000);
  assert.equal(coinLore.liquidityUsd, null);
  assert.ok(coinLore.metricTruth.measurementWarnings.some((warning) => /Aggregate market cap/i.test(warning)));
});

test("unknown provider market cap is preserved as estimated evidence instead of erased", () => {
  const unknown = normalizeMetricTruth({
    name: "Unknown Provider Alpha",
    symbol: "UPA",
    source: "new-provider-beta",
    priceUsd: 0.02,
    marketCap: 4_200_000,
    volume24h: 900_000,
  });

  assert.equal(unknown.sourceType, "unknown");
  assert.equal(unknown.estimatedMarketCapUsd, 4_200_000);
  assert.equal(unknown.marketCap, 4_200_000);
  assert.equal(unknown.volume24h, 900_000);
  assert.ok(unknown.metricTruth.measurementWarnings.some((warning) => /preserved as estimated/i.test(warning)));
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
  assert.equal(article.pairAddress, null);
  assert.match(article.claimId, /^google-news-/);
  assert.equal(repo.tradableCandidate, false);
  assert.equal(repo.symbol, "UNRESOLVED");
  assert.equal(repo.repositoryCode, "ALPHAPRO");
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
    utilityQualityScore: 82,
    realUtilityScore: 82,
    utilityClassification: "REAL_UTILITY",
    realUtilityQualified: true,
    utilityEvidenceFamilies: ["PRODUCT", "DEVELOPMENT", "ADOPTION"],
    memeOnlySpeculative: false,
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
  assert.equal(report.qualifiedExecutableBuys.length, 1);
  assert.equal(report.top10ResearchOpportunities.length, 1);
  assert.equal(report.top10Slots.length, 10);
  assert.equal(report.top10Slots.filter((slot) => slot.status === "EMPTY").length, 9);
  assert.equal(report.qualifiedPicks[0].symbol, "AKE");
  assert.equal(report.qualifiedPicks[0].scoreContributionTrace.length, 10);
  assert.ok(report.excludedFinalists.some((item) => item.symbol === "NEWS"));
  assert.equal(report.failureWaterfall.projectsAnalyzed, 2);
  assert.equal(report.failureWaterfall.fullyExecutableTop10, 1);
});

test("Top 10 research opportunities stay visible when only live sell-route proof is missing", () => {
  const report = buildTop10BreakoutReport([
    strongProject({
      symbol: "ROUTE",
      sellQuoteVerified: false,
      routeTruthStatus: "SELL_QUOTE_VERIFIED_PENDING",
      executionProofState: "SELL_QUOTE_VERIFIED_PENDING",
      executionStatus: "PARTIALLY_VERIFIED",
      executionRoute: {
        ...strongProject().executionRoute,
        sellRouteAvailable: false,
        sellQuoteVerified: false,
      },
      executionProof: {
        ...strongProject().executionProof,
        sellQuoteVerified: false,
        executionProofState: "SELL_QUOTE_VERIFIED_PENDING",
        routeTruthStatus: "SELL_QUOTE_VERIFIED_PENDING",
      },
    }),
  ]);

  assert.equal(report.qualifiedPicks.length, 0);
  assert.equal(report.top10ResearchOpportunities.length, 1);
  assert.equal(report.top10ResearchOpportunities[0].symbol, "ROUTE");
  assert.equal(report.top10ResearchOpportunities[0].researchStatus, "RESEARCH_WORTHY_ROUTE_PENDING");
  assert.equal(report.top10ResearchOpportunities[0].executionReady, false);
  assert.ok(report.failureWaterfall.topRejectionReasons.some((item) => item.reason === "SELL_ROUTE_FAILED"));
});

test("legacy researchOnly cannot misclassify a live token as prelaunch", () => {
  const report = buildTop10BreakoutReport([
    strongProject({
      symbol: "LIVEONLY",
      researchOnly: true,
      tradableCandidate: false,
      sellQuoteVerified: false,
      routeTruthStatus: "SELL_QUOTE_VERIFIED_PENDING",
      executionProofState: "SELL_QUOTE_VERIFIED_PENDING",
      executionRoute: {
        ...strongProject().executionRoute,
        sellRouteAvailable: false,
        sellQuoteVerified: false,
      },
      executionProof: {
        ...strongProject().executionProof,
        sellQuoteVerified: false,
      },
    }),
  ]);

  assert.equal(report.prelaunchResearchCandidates.length, 0);
  assert.equal(report.top10ResearchOpportunities.length, 1);
  assert.equal(report.top10ResearchOpportunities[0].symbol, "LIVEONLY");
});

test("missing identity confidence score does not become maximum identity risk", () => {
  const report = buildTop10BreakoutReport([
    strongProject({
      symbol: "NOID",
      identityConfidence: undefined,
      identityResolutionScore: undefined,
    }),
  ]);

  assert.equal(report.qualifiedPicks.length, 1);
  assert.equal(
    report.qualifiedPicks[0].penalties.some((penalty) => penalty.label === "Identity uncertainty"),
    false
  );
});

test("generic upstream uncertainty is a warning, not a research hard block", () => {
  const report = buildTop10BreakoutReport([
    strongProject({
      symbol: "WARN",
      sellQuoteVerified: false,
      finalBlockingReasons: ["Insufficient evidence from optional AI model.", "Missing route confirmation."],
      executionRoute: {
        ...strongProject().executionRoute,
        sellRouteAvailable: false,
        sellQuoteVerified: false,
      },
      executionProof: {
        ...strongProject().executionProof,
        sellQuoteVerified: false,
      },
    }),
  ]);

  assert.equal(report.qualifiedPicks.length, 0);
  assert.equal(report.top10ResearchOpportunities[0].symbol, "WARN");
  assert.equal(report.top10ResearchOpportunities[0].hardBlocks.length, 0);
  assert.ok(report.top10ResearchOpportunities[0].nonDeterministicBlockWarnings.length >= 1);
});

test("deterministic safety blockers still remove candidates from research", () => {
  const report = buildTop10BreakoutReport([
    strongProject({
      symbol: "RUG",
      hardBlockers: ["Verified honeypot evidence."],
    }),
  ]);

  assert.equal(report.qualifiedPicks.length, 0);
  assert.equal(report.top10ResearchOpportunities.length, 0);
  assert.equal(report.excludedFinalists[0].qualificationState, "BLOCKED");
});

test("malformed aggregate display identities cannot enter either top 10", () => {
  const report = buildTop10BreakoutReport([
    strongProject({
      name: "WHAT IS THE TICKER? ".repeat(20),
      symbol: "BTCETHSOLUSDC".repeat(20),
    }),
  ]);

  assert.equal(report.qualifiedExecutableBuys.length, 0);
  assert.equal(report.top10ResearchOpportunities.length, 0);
});

test("meme-only candidates cannot enter utility research or executable top 10", () => {
  const report = buildTop10BreakoutReport([
    strongProject({
      name: "Artificial Inu",
      symbol: "AINU",
      utilityClassification: "MEME_SPECULATION",
      realUtilityQualified: false,
      memeOnlySpeculative: true,
      utilityEvidenceFamilies: [],
    }),
  ]);

  assert.equal(report.qualifiedExecutableBuys.length, 0);
  assert.equal(report.top10ResearchOpportunities.length, 0);
});

test("failure waterfall requires positive buy and sell quote proof", () => {
  const report = buildTop10BreakoutReport([
    strongProject({
      symbol: "NOQUOTE",
      buyQuoteVerified: false,
      sellQuoteVerified: false,
      executionRoute: {
        ...strongProject().executionRoute,
        buyQuoteVerified: false,
        sellQuoteVerified: false,
      },
      executionProof: {
        ...strongProject().executionProof,
        buyQuoteVerified: false,
        sellQuoteVerified: false,
      },
    }),
  ]);

  assert.equal(report.failureWaterfall.passedBuyRouteVerification, 0);
  assert.equal(report.failureWaterfall.passedSellRouteVerification, 0);
  assert.equal(report.qualifiedPicks.length, 0);
});

test("prelaunch projects without contracts enter a separate research lane", () => {
  const report = buildTop10BreakoutReport([
    {
      name: "Builder Protocol",
      symbol: "BUILD",
      chain: "base",
      source: "github",
      discoverySources: ["github-project-discovery", "google-news"],
      researchOnly: true,
      tradableCandidate: false,
      lifecycleStage: "PRELAUNCH",
      github: "https://github.com/builder/protocol",
      website: "https://builder.example",
      developerActivityScore: 86,
      githubProScore: 84,
      githubVelocityScore: 80,
      liveCatalystRadarScore: 82,
      catalystCalendarScore: 78,
      sourceTruthScore: 72,
      sourceReliabilityScore: 70,
      earlyAccelerationScore: 66,
      relativeStrengthScore: 58,
    },
  ]);

  assert.equal(report.top10ResearchOpportunities.length, 0);
  assert.equal(report.prelaunchResearchCandidates.length, 1);
  assert.equal(report.prelaunchResearchCandidates[0].symbol, "BUILD");
  assert.equal(report.prelaunchResearchCandidates[0].executionReady, false);
});

test("Top 10 candidate input preserves scoring fields before generic report compaction", () => {
  const noisy = {
    ...strongProject(),
    ignoredLargeBlob: "x".repeat(10_000),
    rawCandidate: { payload: "r".repeat(1_000_000) },
    evidence: Array.from({ length: 100 }, (_, index) => ({
      source: `source-${index}`,
      payload: "e".repeat(10_000),
    })),
    executionProofRecovery: {
      adapterResults: Array.from({ length: 100 }, (_, index) => ({
        provider: `provider-${index}`,
        payload: "q".repeat(10_000),
      })),
    },
    institutionalDataProvenance: {
      score: 82,
      institutionalReadiness: "REVIEW_READY",
      sourceSummary: {
        sourceCount: 20,
        sourceFamilyCount: 8,
        sources: Array.from({ length: 50 }, (_, index) => `source-${index}`),
      },
      components: {
        contradictionRisk: 8,
        sourceAgreement: 84,
        freshness: 91,
      },
      records: Array.from({ length: 100 }, (_, index) => ({
        field: `field-${index}`,
        payload: "p".repeat(10_000),
      })),
    },
  };
  for (let index = 0; index < 120; index += 1) noisy[`extra_${index}`] = index;

  const input = buildTop10CandidateInput([noisy], { scanRunId: "test" });

  assert.equal(input.schemaVersion, "top10-candidate-input-v1");
  assert.equal(input.projectCount, 1);
  assert.equal(input.projects[0].symbol, "AKE");
  assert.equal(input.projects[0].liquidityFormationScore, 82);
  assert.equal(input.projects[0].executionRoute.buyQuoteVerified, true);
  assert.equal(input.projects[0].ignoredLargeBlob, undefined);
  assert.equal(input.projects[0].rawCandidate, undefined);
  assert.equal(input.projects[0].evidence, undefined);
  assert.equal(input.projects[0].executionProofRecovery, undefined);
  assert.equal(input.projects[0].institutionalDataProvenance.records, undefined);
  assert.equal(input.projects[0].institutionalDataProvenance.components.sourceAgreement, 84);
  assert.ok(Buffer.byteLength(JSON.stringify(input)) < 150_000);
});

test("Alpha OS summary reports skipped profile instead of fake zero candidates", () => {
  const summary = summarizeAutonomousAlphaOS([{ name: "Route Candidate", symbol: "ROUTE" }], {
    engineProfile: { id: "tenx" },
  });

  assert.equal(summary.status, "SKIPPED_BY_ENGINE_PROFILE");
  assert.equal(summary.totalProjects, 1);
  assert.equal(summary.topCandidates.length, 0);
  assert.match(summary.commanderBrief, /skipped by the tenx profile/i);
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
