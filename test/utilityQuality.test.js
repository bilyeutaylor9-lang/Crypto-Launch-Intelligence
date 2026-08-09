import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { analyzeProgressiveOpportunityRankingBatch } from "../src/engines/progressiveOpportunityRankingEngine.js";
import { analyzeUtilityQualityBatch, summarizeUtilityQuality } from "../src/engines/utilityQualityEngine.js";
import { writeUtilityQualityReport } from "../src/reports/utilityQualityReportEngine.js";

const CONTRACT = "0x1111111111111111111111111111111111111111";
const POOL = "0x2222222222222222222222222222222222222222";

function base(overrides = {}) {
  return {
    name: "Base Candidate",
    symbol: "BASE",
    chain: "base",
    tokenAddress: CONTRACT,
    poolAddress: POOL,
    liquidityUsd: 160_000,
    sourceTruthScore: 78,
    sourceReliabilityScore: 74,
    identityResolutionScore: 82,
    projectIdentityScore: 80,
    contractVerified: true,
    instantSafetyStatus: "PASS",
    activeLiquidityTruthScore: 72,
    organicBuyerScore: 62,
    buyerRetentionScore: 58,
    executionStatus: "VERIFIED",
    purchaseRouteConfirmed: true,
    executionRouteAvailable: true,
    quoteAgeSeconds: 90,
    executionSlippagePct: 1.2,
    ...overrides,
  };
}

test("utility quality separates real utility from meme-only speculation", () => {
  const [utility, meme] = analyzeUtilityQualityBatch([
    base({
      name: "ComputeNet",
      symbol: "CMP",
      category: "AI infrastructure",
      description: "AI compute protocol with SDK, API, mainnet app, developer docs, revenue fees, staking utility and enterprise users.",
      website: "https://compute.example",
      docsUrl: "https://docs.compute.example",
      githubRepo: "https://github.com/compute/protocol",
      developerActivityScore: 84,
      githubProScore: 80,
      ecosystemIntegrationScore: 78,
      tokenomicsScore: 76,
      liveCatalystRadarScore: 72,
      discoverySources: ["dexscreener", "github", "official-docs"],
    }),
    base({
      name: "Cat Rocket",
      symbol: "CATR",
      category: "meme-token",
      description: "Viral cat meme coin community coin with dog cat meme culture and no product docs.",
      narrativeHeatScore: 96,
      socialAccelerationScore: 92,
      accelerationScore: 82,
      developerActivityScore: 0,
      githubProScore: 0,
      tokenomicsScore: 0,
      ecosystemIntegrationScore: 0,
      discoverySources: ["dexscreener"],
    }),
  ]);

  assert.equal(utility.realUtilityQualified, true);
  assert.equal(utility.utilityClassification, "REAL_UTILITY");
  assert.equal(meme.memeOnlySpeculative, true);
  assert.equal(meme.utilityClassification, "MEME_SPECULATION");
});

test("single-token meme branding is enough to exclude obvious launch memes", () => {
  for (const identity of [
    { name: "Midas Toad", symbol: "TOAD" },
    { name: "Pump Guy", symbol: "GUY" },
    { name: "dogshit", symbol: "DS" },
    { name: "Rave Cat", symbol: "RAVE" },
  ]) {
    const [result] = analyzeUtilityQualityBatch([
      base({
        ...identity,
        description: "Community launch token.",
        developerActivityScore: 0,
        githubProScore: 0,
        tokenomicsScore: 0,
        ecosystemIntegrationScore: 0,
        discoverySources: ["dexscreener"],
        alerts: ["Relative strength leadership detected.", "Contract risk warning detected."],
      }),
    ]);

    assert.equal(result.memeBrandingDetected, true, identity.name);
    assert.equal(result.memeOnlySpeculative, true, identity.name);
    assert.equal(result.utilityClassification, "MEME_SPECULATION", identity.name);
    assert.deepEqual(result.alerts, ["Contract risk warning detected."], identity.name);
    assert.equal(result.suppressedOpportunityAlertCount, 1, identity.name);
  }
});

test("meme symbol matching does not reject innocent substrings", () => {
  const [utility] = analyzeUtilityQualityBatch([
    base({
      name: "Education Catalyst Protocol",
      symbol: "CATALYST",
      category: "developer infrastructure",
      description: "Protocol app with SDK API mainnet developer docs users revenue fees integrations staking utility.",
      website: "https://catalyst.example",
      docsUrl: "https://docs.catalyst.example",
      githubRepo: "https://github.com/catalyst/protocol",
      developerActivityScore: 82,
      ecosystemIntegrationScore: 78,
      tokenomicsScore: 75,
      liveCatalystRadarScore: 72,
      discoverySources: ["dexscreener", "github", "official-docs"],
    }),
  ]);

  assert.equal(utility.memeBrandingDetected, false);
  assert.equal(utility.realUtilityQualified, true);
});

test("strong utility evidence cannot override the default no-meme operating policy", () => {
  const previous = process.env.EXCLUDE_MEME_CANDIDATES;
  process.env.EXCLUDE_MEME_CANDIDATES = "true";
  try {
    const [mixed] = analyzeUtilityQualityBatch([
      base({
        name: "Pepe Compute Protocol",
        symbol: "PEPE",
        category: "AI infrastructure",
        description: "AI compute protocol with SDK API mainnet developer docs users revenue fees integrations and staking utility.",
        website: "https://pepe-compute.example",
        docsUrl: "https://docs.pepe-compute.example",
        githubRepo: "https://github.com/example/pepe-compute",
        developerActivityScore: 84,
        githubProScore: 80,
        ecosystemIntegrationScore: 78,
        tokenomicsScore: 76,
        liveCatalystRadarScore: 72,
        discoverySources: ["dexscreener", "github", "official-docs"],
      }),
    ]);
    const report = summarizeUtilityQuality([mixed]);

    assert.equal(mixed.memeBrandingDetected, true);
    assert.equal(mixed.memePolicyExcluded, true);
    assert.equal(mixed.realUtilityQualified, false);
    assert.equal(mixed.utilityClassification, "MIXED_MEME_UTILITY");
    assert.equal(report.topRealUtilityResearch.length, 0);
  } finally {
    if (previous === undefined) delete process.env.EXCLUDE_MEME_CANDIDATES;
    else process.env.EXCLUDE_MEME_CANDIDATES = previous;
  }
});

test("utility quality uses canonical aliases for provider-style product evidence", () => {
  const [utility] = analyzeUtilityQualityBatch([
    base({
      name: "AliasCompute",
      symbol: "ACMP",
      category: "AI infrastructure",
      metadata: {
        description: "AI compute protocol with SDK API mainnet app developer docs revenue fees staking utility enterprise users integrations.",
      },
      links: {
        website: "https://aliascompute.example",
        github: "https://github.com/aliascompute/protocol",
      },
      commitCount30d: 34,
      uniqueContributors30d: 6,
      ecosystemIntegrationScore: 78,
      tokenomicsScore: 76,
      liveCatalystRadarScore: 72,
      discoverySources: ["dexscreener", "github", "official-docs"],
    }),
  ]);

  assert.equal(utility.website, "https://aliascompute.example");
  assert.equal(utility.githubRepo, "https://github.com/aliascompute/protocol");
  assert.equal(utility.commits30d, 34);
  assert.equal(utility.contributors30d, 6);
  assert.equal(utility.realUtilityQualified, true);
  assert.equal(utility.utilityClassification, "REAL_UTILITY");
});

test("progressive ranking lets utility outrank meme-only hype without hiding memes", () => {
  const candidates = analyzeUtilityQualityBatch([
    base({
      name: "Storage Protocol",
      symbol: "STOR",
      category: "DePIN infrastructure",
      description: "Decentralized storage network with active app, SDK, docs, staking utility, users, integrations, fees and roadmap.",
      website: "https://storage.example",
      docsUrl: "https://docs.storage.example",
      githubRepo: "https://github.com/storage/protocol",
      developerActivityScore: 82,
      githubProScore: 78,
      ecosystemIntegrationScore: 80,
      tokenomicsScore: 75,
      liveCatalystRadarScore: 72,
      accelerationScore: 66,
      momentumShiftScore: 64,
      liquidityExpansionScore: 68,
      discoverySources: ["dexscreener", "github", "official-docs"],
    }),
    base({
      name: "Pepe Rocket",
      symbol: "PEPR",
      category: "meme-token",
      description: "Pepe meme coin community culture token with viral meme narrative.",
      narrativeHeatScore: 98,
      socialAccelerationScore: 95,
      accelerationScore: 88,
      momentumShiftScore: 84,
      buyPressureScore: 78,
      developerActivityScore: 0,
      githubProScore: 0,
      ecosystemIntegrationScore: 0,
      tokenomicsScore: 0,
      discoverySources: ["dexscreener"],
    }),
  ]);

  const ranked = analyzeProgressiveOpportunityRankingBatch(candidates);
  const utility = ranked.find((project) => project.symbol === "STOR");
  const meme = ranked.find((project) => project.symbol === "PEPR");

  assert.ok(utility.moneyRankScore > meme.moneyRankScore);
  assert.ok(utility.opportunityRank < meme.opportunityRank);
  assert.equal(utility.realUtilityQualified, true);
  assert.equal(meme.memeOnlySpeculative, true);
  assert.notEqual(meme.opportunityRankingTier, "EARLY_HIGH_CONVICTION");
  assert.notEqual(meme.opportunityRankingTier, "SNIPER_READY");
});

test("utility report publishes real-utility and speculative-only lanes", () => {
  const projects = analyzeUtilityQualityBatch([
    base({
      symbol: "UTIL",
      description: "Protocol app with SDK API developers users staking fees integrations docs.",
      website: "https://util.example",
      docsUrl: "https://docs.util.example",
      developerActivityScore: 80,
      ecosystemIntegrationScore: 82,
      tokenomicsScore: 78,
      discoverySources: ["official-docs", "github", "dexscreener"],
    }),
    base({
      symbol: "MEME",
      category: "meme-token",
      description: "Meme cat dog pepe culture community coin.",
      narrativeHeatScore: 94,
      socialAccelerationScore: 90,
      developerActivityScore: 0,
      discoverySources: ["dexscreener"],
    }),
  ]);
  const summary = summarizeUtilityQuality(projects);
  const written = writeUtilityQualityReport(projects);
  const parsed = JSON.parse(fs.readFileSync(path.resolve("reports", "real-utility-opportunities.json"), "utf8"));

  assert.equal(summary.realUtilityQualifiedCount, 1);
  assert.equal(summary.memeSpeculationCount, 1);
  assert.equal(fs.existsSync(written.filePath), true);
  assert.equal(parsed.topRealUtilityResearch[0].symbol, "UTIL");
  assert.equal(parsed.memeSpeculationOnly[0].symbol, "MEME");
});

test("malformed aggregate identities cannot become real-utility leads", () => {
  const malformed = analyzeUtilityQualityBatch([
    base({
      name: "WHAT IS THE TICKER? ".repeat(20),
      symbol: "BTCETHSOLUSDC".repeat(40),
      description: "protocol sdk api mainnet developers users revenue fees integrations staking ".repeat(20),
      developerActivityScore: 99,
      ecosystemIntegrationScore: 99,
      tokenomicsScore: 99,
      discoverySources: ["defillama-category", "market-list"],
    }),
  ]);
  const summary = summarizeUtilityQuality(malformed);

  assert.equal(malformed[0].utilityIdentityEligible, false);
  assert.equal(malformed[0].utilityQualityScore, null);
  assert.equal(malformed[0].realUtilityQualified, false);
  assert.equal(malformed[0].utilityClassification, "INVALID_OR_AGGREGATE_IDENTITY");
  assert.equal(summary.realUtilityQualifiedCount, 0);
  assert.equal(summary.invalidOrAggregateIdentityCount, 1);
  assert.equal(summary.topRealUtilityResearch.length, 0);
});
