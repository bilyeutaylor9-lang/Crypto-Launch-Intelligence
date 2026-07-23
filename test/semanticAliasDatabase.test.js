import test from "node:test";
import assert from "node:assert/strict";

import { resolveCanonicalAliases } from "../src/data/canonicalAliasResolver.js";
import { analyzeDataStarvationRootCause } from "../src/engines/dataStarvationRootCauseEngine.js";
import { analyzeEngineDataReadiness, evaluateEngineDataReadiness } from "../src/engines/engineDataReadinessEngine.js";
import { normalizeBooleanVocabulary, normalizeStatusVocabulary } from "../src/data/statusVocabularyNormalizer.js";
import { normalizeVenue, parseVenueProtocolVersion } from "../src/data/venueVocabularyRegistry.js";
import { normalizeQuoteAsset, parseMarketPair } from "../src/data/semanticAliasNormalizer.js";
import { summarizeAliasResolution } from "../src/reports/aliasResolutionReportEngine.js";

const EVM = "0x1111111111111111111111111111111111111111";
const POOL = "0x2222222222222222222222222222222222222222";
const SOL_MINT = "So11111111111111111111111111111111111111112";

test("semantic aliases resolve market cap while FDV stays separate", () => {
  const aliases = resolveCanonicalAliases(
    {
      source: "CoinGecko API",
      "market_cap": 5_000_000,
      fdv: 40_000_000,
    },
    { fields: ["circulatingMarketCapUsd", "fullyDilutedValuationUsd"] }
  );

  assert.equal(aliases.resolved.circulatingMarketCapUsd, 5_000_000);
  assert.equal(aliases.resolved.fullyDilutedValuationUsd, 40_000_000);

  const fdvOnly = resolveCanonicalAliases({ fdv: 40_000_000 }, { fields: ["circulatingMarketCapUsd"] });
  assert.equal(fdvOnly.resolved.circulatingMarketCapUsd, null);
});

test("pool aliases cannot become token addresses and mint is chain-aware", () => {
  const poolOnly = resolveCanonicalAliases(
    {
      chain: "base",
      pairAddress: POOL,
    },
    { fields: ["tokenAddress", "poolAddress"] }
  );
  assert.equal(poolOnly.resolved.poolAddress, POOL.toLowerCase());
  assert.equal(poolOnly.resolved.tokenAddress, null);

  const solanaMint = resolveCanonicalAliases({ chain: "solana", mint: SOL_MINT }, { fields: ["tokenAddress"] });
  assert.equal(solanaMint.resolved.tokenAddress, SOL_MINT);

  const evmMint = resolveCanonicalAliases({ chain: "base", mint: EVM }, { fields: ["tokenAddress"] });
  assert.equal(evmMint.resolved.tokenAddress, null);
});

test("ticker and fuzzy identity misspellings never become token addresses", () => {
  const aliases = resolveCanonicalAliases(
    {
      chain: "base",
      ticker: EVM,
      tokenAdress: EVM,
    },
    { fields: ["tokenAddress"] }
  );

  assert.equal(aliases.resolved.tokenAddress, null);
});

test("route status verbiage keeps detected and untested negative states conservative", () => {
  assert.equal(normalizeStatusVocabulary("detected"), "PARTIALLY_VERIFIED");
  assert.notEqual(normalizeStatusVocabulary("detected"), "VERIFIED");

  const notDetected = normalizeBooleanVocabulary("not detected");
  assert.equal(notDetected.status, "UNKNOWN");
  assert.equal(notDetected.value, null);
});

test("wrapped quote assets preserve distinct asset and family relationships", () => {
  const wethPair = parseMarketPair("AKE/WETH");
  const eth = normalizeQuoteAsset("ETH");
  const usdce = normalizeQuoteAsset("USDC.e");
  const usdc = normalizeQuoteAsset("USDC");

  assert.equal(wethPair.quoteAsset, "WETH");
  assert.equal(wethPair.quoteAssetFamily, "ETH");
  assert.equal(eth.asset, "ETH");
  assert.equal(eth.wrapped, false);
  assert.equal(usdce.asset, "USDC_E");
  assert.equal(usdce.family, "USDC");
  assert.equal(usdc.asset, "USDC");
});

test("venue aliases preserve exchange and DEX distinctions", () => {
  assert.equal(normalizeVenue("Binance"), "binance");
  assert.equal(normalizeVenue("Binance.US"), "binance_us");
  assert.notEqual(normalizeVenue("Binance"), normalizeVenue("Binance.US"));

  assert.equal(normalizeVenue("Uniswap V2"), "uniswap");
  assert.equal(parseVenueProtocolVersion("Uniswap V2"), "v2");
  assert.equal(parseVenueProtocolVersion("Uniswap V4"), "v4");
});

test("market-pair parser separates spot from perpetual derivatives", () => {
  const spot = parseMarketPair("AKEUSDT");
  const dashed = parseMarketPair("AKE-USDT-SPOT");
  const perp = parseMarketPair("AKEUSDT.P");

  assert.deepEqual(
    { base: spot.baseAsset, quote: spot.quoteAsset, type: spot.marketType },
    { base: "AKE", quote: "USDT", type: "SPOT" }
  );
  assert.equal(dashed.baseAsset, "AKE");
  assert.equal(dashed.quoteAsset, "USDT");
  assert.equal(perp.baseAsset, "AKE");
  assert.equal(perp.quoteAsset, "USDT");
  assert.equal(perp.marketType, "PERPETUAL");
});

test("protocol TVL, daily volume, and token accounts cannot impersonate stronger evidence", () => {
  const protocolTvl = resolveCanonicalAliases(
    {
      source: "defillama",
      protocol: {
        tvlUsd: 9_000_000,
      },
    },
    { fields: ["liquidityUsd"] }
  );
  assert.equal(protocolTvl.resolved.liquidityUsd, null);
  assert.equal(protocolTvl.provenance.liquidityUsd?.validationStatus, undefined);

  const depth = resolveCanonicalAliases({ dailyVolume: 2_000_000 }, { fields: ["orderBookDepthUsd"] });
  assert.equal(depth.resolved.orderBookDepthUsd, null);

  const holders = resolveCanonicalAliases({ tokenAccounts: 500 }, { fields: ["holderCount"] });
  assert.equal(holders.resolved.holderCount, null);
});

test("safe fuzzy aliases can recover non-identity data, but not address fields", () => {
  const liquidity = resolveCanonicalAliases({ liqudity_usdd: 123_000 }, { fields: ["liquidityUsd"] });
  assert.equal(liquidity.resolved.liquidityUsd, 123_000);
  assert.match(liquidity.provenance.liquidityUsd.normalizationRule, /FUZZY_ALIAS/);

  const address = resolveCanonicalAliases({ chain: "base", tokenAdress: EVM }, { fields: ["tokenAddress"] });
  assert.equal(address.resolved.tokenAddress, null);
});

test("internal output gaps and provider-specific nested fields are classified correctly", () => {
  const missingInternal = analyzeDataStarvationRootCause(
    {
      symbol: "MISSRANK",
      engineResults: { marketOpportunityRank: { status: "SUCCESS" } },
    },
    {
      contracts: [
        {
          id: "rank",
          phase: "ranking",
          affectsFinalDecision: true,
          canBlockCandidate: false,
          inputContract: { requiredAny: [["marketOpportunityRank"]], optional: [] },
        },
      ],
    }
  );
  assert.equal(missingInternal.dataStarvationMissingEvidence[0].rootCause, "PIPELINE_OUTPUT_MISSING");

  const readiness = evaluateEngineDataReadiness(
    { source: "dexscreener", pair: { liquidity: { usd: 75_000 } } },
    {
      id: "liquidity",
      affectsFinalDecision: true,
      canBlockCandidate: true,
      inputContract: { requiredAny: [["liquidityUsd"]], optional: [] },
    }
  );
  assert.equal(readiness.status, "READY");
});

test("safe semantic aliases feed readiness and starvation recovery", () => {
  const project = {
    source: "dexscreener",
    chain: "base",
    liqudity_usdd: 123_000,
  };
  const contract = {
    id: "semanticLiquidity",
    phase: "market",
    affectsFinalDecision: true,
    canBlockCandidate: true,
    inputContract: { requiredAny: [["liquidityUsd"]], optional: [] },
  };

  const readiness = analyzeEngineDataReadiness(project, { contracts: [contract] });
  assert.equal(readiness.engineDataReadinessStatus, "CORE_READY");

  const starvation = analyzeDataStarvationRootCause(project, { contracts: [contract] });
  assert.equal(starvation.dataStarvationStatus, "ENOUGH_EVIDENCE_TO_RANK");
  assert.equal(starvation.liquidityUsd, 123_000);
  assert.equal(starvation.dataStarvationBlockingResearchCount, 0);
});

test("alias unresolved-verbiage report ignores internal engine metadata noise", () => {
  const summary = summarizeAliasResolution([
    {
      symbol: "NOISE",
      source: "dexscreener",
      engineResults: {
        one: {
          score: 72,
          status: "OK",
          warnings: [],
          engineName: "Noise Engine",
          engineVersion: "1.0.0",
        },
      },
      providerPayload: {
        strangeProviderLiquidityName: 55_000,
      },
    },
  ]);

  assert.equal(summary.unknownFields.some((item) => item.field === "score"), false);
  assert.equal(summary.unknownFields.some((item) => item.field === "status"), false);
  assert.equal(summary.unknownFields.some((item) => item.field === "strangeProviderLiquidityName"), true);
});

test("conflicting aliases are reported instead of silently selecting the bullish value", () => {
  const aliases = resolveCanonicalAliases(
    {
      source: "dexscreener",
      marketCap: 3_000_000,
      marketData: {
        marketCap: 9_000_000,
      },
    },
    { fields: ["circulatingMarketCapUsd"] }
  );

  assert.equal(aliases.provenance.circulatingMarketCapUsd.conflictStatus, "CONFLICTED");
  assert.equal(aliases.conflicts.circulatingMarketCapUsd.length, 1);
});

test("every accepted alias preserves original field, provider, timestamp, and units", () => {
  const aliases = resolveCanonicalAliases(
    {
      source: "DexScreener",
      sourceTimestamp: "2026-07-19T00:00:00.000Z",
      liquidityUsd: "1000",
    },
    { fields: ["liquidityUsd"], sourceUnit: "US dollar" }
  );
  const record = aliases.provenance.liquidityUsd;

  assert.equal(record.canonicalField, "liquidityUsd");
  assert.equal(record.resolvedValue, 1000);
  assert.equal(record.originalField, "liquidityUsd");
  assert.equal(record.originalValue, "1000");
  assert.equal(record.provider, "dexscreener");
  assert.equal(record.sourceTimestamp, "2026-07-19T00:00:00.000Z");
  assert.equal(record.unitBefore, "usd");
  assert.equal(record.unitAfter, "usd");
});
