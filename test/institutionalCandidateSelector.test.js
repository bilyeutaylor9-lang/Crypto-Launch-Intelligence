import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";

import { resolveAnalysisFunnelConfig } from "../src/config/analysisFunnelConfig.js";
import { planResearchQueue } from "../src/index.js";
import { planInstitutionalCandidateSelection } from "../src/discovery/institutionalCandidateSelector.js";
import {
  calculatePreIntelligenceFeatures,
  hasDeepResolvableIdentity,
} from "../src/discovery/preIntelligenceFeatureEngine.js";
import { identityKeyForProject } from "../src/discovery/projectIdentityGraph.js";

function evmAddress(index = 0) {
  return `0x${String(index).padStart(40, "0")}`;
}

function base58Seed(seed = 0) {
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let value = Math.max(1, Number(seed) || 1);
  let encoded = "";
  while (value > 0) {
    encoded = alphabet[value % alphabet.length] + encoded;
    value = Math.floor(value / alphabet.length);
  }
  return encoded || "1";
}

function solanaAddress(index = 0) {
  return `So${base58Seed(index).padStart(40, "1")}`;
}

function candidate(index = 0, overrides = {}) {
  const chain = overrides.chain || (index % 5 === 0 ? "solana" : "base");
  return {
    name: `Candidate ${index}`,
    symbol: `C${index}`,
    chain,
    address: chain === "solana" ? solanaAddress(index) : evmAddress(index),
    source: index % 7 === 0 ? "github" : "dexscreener",
    discoverySources: [index % 7 === 0 ? "github" : "dexscreener"],
    liquidityUsd: 80_000 + index * 10,
    volume24h: 40_000 + index * 8,
    marketCap: 2_000_000 + index * 1000,
    priceChange24h: 2,
    priceChange7d: 6,
    volumeChange24hPct: 8,
    liquidityChange24hPct: 7,
    buyersChange24hPct: 8,
    holderGrowthScore: 45,
    developerActivityScore: 40,
    sourceTruthScore: 55,
    identityResolutionScore: 60,
    discoveryPriorityScore: 10000 - index,
    ...overrides,
  };
}

test("normal analysis funnel defaults to 4,000 standard intelligence candidates", () => {
  const config = resolveAnalysisFunnelConfig({});

  assert.equal(config.discoveryTargetCandidates, 39_000);
  assert.equal(config.standardIntelligenceLimit, 4_000);
  assert.equal(config.advancedIntelligenceLimit, 1_500);
  assert.equal(config.deepIntelligenceLimit, 500);
  assert.equal(config.crawlerResearchLimit, 300);
  assert.equal(config.localAITopProjectLimit, 100);
  assert.equal(config.finalistDebateLimit, 25);
  assert.equal(config.finalistComparisonLimit, 5);
  assert.equal(config.laneBudgets.freshDiscoveryReserve, 200);
});

test("package scripts expose scan:4000 and free-max uses 4,000", () => {
  const pkg = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));

  assert.ok(pkg.scripts["scan:4000"].includes("STANDARD_INTELLIGENCE_LIMIT=4000"));
  assert.ok(pkg.scripts["scan:free-max"].includes("INTELLIGENCE_PIPELINE_LIMIT=4000"));
  assert.ok(!pkg.scripts["scan:free-max"].includes("INTELLIGENCE_PIPELINE_LIMIT=1500"));
});

test("full discovery can stay 39,000 while standard intelligence remains 4,000", () => {
  const projects = Array.from({ length: 4_500 }, (_, index) => candidate(index));
  const plan = planResearchQueue(projects, {
    env: {
      DISCOVERY_TARGET_CANDIDATES: "39000",
      STANDARD_INTELLIGENCE_LIMIT: "4000",
    },
  });

  assert.equal(plan.report.funnel.discoveryUniverse, 4_500);
  assert.equal(plan.report.funnel.standardIntelligenceSelected, 4_000);
  assert.equal(plan.report.funnel.advancedIntelligenceSelected, 1_500);
  assert.equal(plan.report.funnel.deepIntelligenceSelected, 500);
  assert.equal(plan.report.funnel.llama3Selected, 100);
});

test("funnel accounting separates rankable assets from identity-enrichment research rows", () => {
  const projects = [
    candidate(1, { name: "Rankable Alpha", symbol: "RALPHA" }),
    {
      name: "builder/alpha-protocol",
      symbol: "UNRESOLVED",
      chain: "base",
      source: "github-project-discovery",
      repository: "builder/alpha-protocol",
      github: "https://github.com/builder/alpha-protocol",
      researchOnly: true,
      tradableCandidate: false,
      discoveryLane: "identity-only",
    },
  ];
  const plan = planInstitutionalCandidateSelection(projects, {
    standardIntelligenceLimit: 2,
    laneBudgets: { identityEnrichmentReserve: 1 },
  });

  assert.equal(plan.report.funnel.deduplicatedUniverse, 2);
  assert.equal(plan.report.funnel.rankablePreIntelligenceUniverse, 1);
  assert.equal(plan.report.funnel.identityEnrichmentUniverse, 1);
  assert.equal(plan.report.funnel.standardRankableSelected, 1);
  assert.equal(plan.report.funnel.identityEnrichmentSelected, 1);
  assert.equal(plan.report.funnel.preIntelligenceLeader, "RALPHA");
  assert.equal(plan.report.funnel.leaderStatus, "PRELIMINARY_RESEARCH_ROUTING_ONLY");
  assert.equal(plan.report.funnel.bestOpportunity, undefined);
});

test("market data cannot promote unresolved chain or symbol-only identity into deep selection", () => {
  const unresolved = calculatePreIntelligenceFeatures({
    name: "Unresolved Market Row",
    symbol: "UMR",
    source: "dexscreener",
    liquidityUsd: 100_000,
    volume24h: 50_000,
    priceUsd: 1,
  });
  const unsupported = calculatePreIntelligenceFeatures({
    name: "Unsupported Chain Row",
    symbol: "UCR",
    chain: "not-a-chain",
    tokenAddress: evmAddress(88),
    source: "dexscreener",
    liquidityUsd: 100_000,
    volume24h: 50_000,
    priceUsd: 1,
  });

  assert.equal(unresolved.preIntelligenceLane, "identity-only");
  assert.equal(unresolved.preIntelligenceRankEligible, false);
  assert.equal(unsupported.preIntelligenceLane, "identity-only");
  assert.equal(unsupported.preIntelligenceRankEligible, false);
  assert.equal(hasDeepResolvableIdentity(unresolved), false);
});

test("verified CEX identity remains eligible without an on-chain token address", () => {
  assert.equal(hasDeepResolvableIdentity({
    sourceType: "cex",
    marketPair: "BTC-USDT",
  }), true);
});

test("selector does not choose the first records merely by discovery order", () => {
  const weakEarly = Array.from({ length: 20 }, (_, index) =>
    candidate(index, {
      symbol: `WEAK${index}`,
      liquidityUsd: 10_000,
      volume24h: 5_000,
      priceChange24h: 180,
      priceChange7d: 350,
      honeypotRiskScore: 0,
      sourceTruthScore: 20,
      identityResolutionScore: 20,
    })
  );
  const strongLate = candidate(200, {
    symbol: "LATESTRONG",
    liquidityChange24hPct: 80,
    buyersChange24hPct: 90,
    developerActivityScore: 92,
    sourceTruthScore: 90,
    identityResolutionScore: 92,
  });
  const plan = planInstitutionalCandidateSelection([...weakEarly, strongLate], {
    standardIntelligenceLimit: 5,
    advancedIntelligenceLimit: 5,
    deepIntelligenceLimit: 5,
    crawlerResearchLimit: 5,
    localAITopProjectLimit: 5,
    finalistDebateLimit: 5,
    finalistComparisonLimit: 5,
  });

  assert.ok(plan.selected.some((project) => project.symbol === "LATESTRONG"));
});

test("high acceleration can rescue a smaller project into the 4,000", () => {
  const projects = Array.from({ length: 60 }, (_, index) => candidate(index, { liquidityUsd: 1_000_000 + index }));
  const fastSmall = candidate(999, {
    symbol: "FASTSMALL",
    liquidityUsd: 25_000,
    marketCap: 750_000,
    priceChange24h: 20,
    priceChange7d: 30,
    liquidityChange24hPct: 500,
    buyersChange24hPct: 500,
    volumeChange24hPct: 500,
    liquidityExpansionScore: 100,
    buyPressureScore: 100,
    organicBuyerScore: 100,
    buyerRetentionScore: 100,
    holderGrowthScore: 100,
    developerActivityScore: 100,
    githubProScore: 100,
    sourceTruthScore: 0,
    identityResolutionScore: 0,
    riskScore: 60,
  });
  const plan = planInstitutionalCandidateSelection([...projects, fastSmall], {
    standardIntelligenceLimit: 25,
    advancedIntelligenceLimit: 25,
    deepIntelligenceLimit: 25,
    crawlerResearchLimit: 25,
    localAITopProjectLimit: 25,
    finalistDebateLimit: 25,
    finalistComparisonLimit: 5,
  });
  const selected = plan.selected.find((project) => project.symbol === "FASTSMALL");

  assert.ok(selected);
  assert.equal(selected.standardSelectionReason, "ACCELERATION_RESERVE");
});

test("attention gap can rescue an underrecognized project", () => {
  const projects = Array.from({ length: 60 }, (_, index) =>
    candidate(index, index < 10
      ? {
          socialAccelerationScore: 70,
          liquidityChange24hPct: 300,
          buyersChange24hPct: 300,
          volumeChange24hPct: 300,
          liquidityExpansionScore: 100,
          buyPressureScore: 100,
        }
      : { socialAccelerationScore: 70 })
  );
  const quietBuilder = candidate(998, {
    symbol: "QUIETBUILD",
    source: "github",
    discoverySources: ["github"],
    liquidityUsd: 25_000,
    volume24h: 10_000,
    marketCap: 750_000,
    socialAccelerationScore: 0,
    xSocialScore: 0,
    priceChange24h: 1,
    priceChange7d: 2,
    liquidityChange24hPct: 20,
    buyersChange24hPct: 20,
    volumeChange24hPct: 20,
    developerActivityScore: 100,
    githubProScore: 100,
    ecosystemAdoptionScore: 100,
    ecosystemIntegrationScore: 100,
    externalSignalScore: 0,
    narrativeHeatScore: 0,
    sourceTruthScore: 0,
    identityResolutionScore: 0,
    riskScore: 55,
  });
  const plan = planInstitutionalCandidateSelection([...projects, quietBuilder], {
    standardIntelligenceLimit: 25,
    advancedIntelligenceLimit: 25,
    deepIntelligenceLimit: 25,
    crawlerResearchLimit: 25,
    localAITopProjectLimit: 25,
    finalistDebateLimit: 25,
    finalistComparisonLimit: 5,
  });
  const selected = plan.selected.find((project) => project.symbol === "QUIETBUILD");

  assert.ok(selected);
  assert.equal(selected.standardSelectionReason, "ATTENTION_GAP_RESERVE");
});

test("raw liquidity alone cannot dominate selection and already pumped projects are penalized", () => {
  const liquidPumped = candidate(1, {
    symbol: "PUMPED",
    liquidityUsd: 50_000_000,
    volume24h: 20_000_000,
    priceChange24h: 240,
    priceChange7d: 500,
  });
  const steady = candidate(2, {
    symbol: "STEADY",
    liquidityUsd: 400_000,
    liquidityChange24hPct: 60,
    buyersChange24hPct: 70,
    priceChange24h: 3,
    priceChange7d: 8,
    developerActivityScore: 80,
  });
  const pumpedFeatures = calculatePreIntelligenceFeatures(liquidPumped);
  const steadyFeatures = calculatePreIntelligenceFeatures(steady);

  assert.ok(steadyFeatures.preIntelligenceComponents.timing > pumpedFeatures.preIntelligenceComponents.timing);
  assert.ok(steadyFeatures.preIntelligenceOpportunityScore > pumpedFeatures.preIntelligenceOpportunityScore);
});

test("default institutional selection hard-blocks obvious meme branding before expensive intelligence", () => {
  const features = calculatePreIntelligenceFeatures(candidate(8, {
    name: "Midas Toad",
    symbol: "TOAD",
    category: "meme-token",
  }));

  assert.equal(features.preIntelligenceOpportunityScore, 0);
  assert.equal(features.preIntelligenceRankEligible, false);
  assert.ok(features.preIntelligenceHardBlockers.includes("meme branding excluded by scanner policy"));
});

test("missing noncritical data lowers confidence without zeroing opportunity", () => {
  const sparse = calculatePreIntelligenceFeatures(candidate(3, {
    symbol: "SPARSE",
    volume24h: undefined,
    liquidityUsd: undefined,
    holders: undefined,
  }));

  assert.ok(sparse.preIntelligenceOpportunityScore > 0);
  assert.ok(sparse.preIntelligenceConfidence < 80);
  assert.ok(sparse.preIntelligenceMissingEvidence.length >= 1);
});

test("confirmed identity conflict and honeypot danger remain hard blocks", () => {
  const plan = planInstitutionalCandidateSelection([
    candidate(1, { symbol: "SAFE" }),
    candidate(2, { symbol: "BADID", identityConflict: true, liquidityChange24hPct: 400 }),
    candidate(3, { symbol: "HONEYPOT", honeypotDetected: true, buyersChange24hPct: 400 }),
  ], { standardIntelligenceLimit: 3 });

  assert.ok(plan.selected.some((project) => project.symbol === "SAFE"));
  assert.ok(!plan.selected.some((project) => project.symbol === "BADID"));
  assert.ok(!plan.selected.some((project) => project.symbol === "HONEYPOT"));
  assert.ok(plan.deferred.some((project) => project.symbol === "BADID" && project.standardSelectionState === "BLOCKED"));
});

test("multi-lane selector deduplicates identities and reaches exactly 4,000 when enough exist", () => {
  const projects = Array.from({ length: 4_100 }, (_, index) => candidate(index));
  projects.push(candidate(10, { name: "Duplicate Ten", symbol: "DUPTEN", address: projects[10].address }));
  const plan = planInstitutionalCandidateSelection(projects, {
    standardIntelligenceLimit: 4_000,
  });

  assert.equal(plan.selected.length, 4_000);
  assert.equal(new Set(plan.selected.map((project) => project.standardSelectionIdentityKey)).size, 4_000);
  assert.ok(plan.report.duplicateIdentityCount >= 1);
});

test("deferred rotation is approximately 2.5 percent, not 20 percent", () => {
  const projects = Array.from({ length: 4_200 }, (_, index) => candidate(index));
  const plan = planInstitutionalCandidateSelection(projects, {
    standardIntelligenceLimit: 4_000,
  });

  assert.ok(plan.report.allocation.deferredRotation <= 110);
  assert.ok(plan.report.allocation.deferredRotation < 800);
});

test("fresh discovery reserve prevents never-queued projects from being permanently missed", () => {
  const known = Array.from({ length: 90 }, (_, index) => candidate(index));
  const hiddenUtility = candidate(999, {
    symbol: "NEVERSEEN",
    liquidityUsd: 12_000,
    volume24h: 1_500,
    marketCap: 900_000,
    priceChange24h: 1,
    priceChange7d: 1,
    liquidityChange24hPct: 1,
    buyersChange24hPct: 1,
    volumeChange24hPct: 1,
    sourceTruthScore: 30,
    identityResolutionScore: 35,
  });
  const history = {
    projects: Object.fromEntries(
      known.map((project) => [
        identityKeyForProject(project),
        {
          queuedCount: 3,
          deferredCount: 2,
          lastState: "SELECTED",
        },
      ])
    ),
  };

  const plan = planInstitutionalCandidateSelection([...known, hiddenUtility], {
    standardIntelligenceLimit: 40,
    advancedIntelligenceLimit: 40,
    deepIntelligenceLimit: 20,
    crawlerResearchLimit: 20,
    localAITopProjectLimit: 10,
    finalistDebateLimit: 5,
    finalistComparisonLimit: 5,
    history,
    runSequence: 7,
  });
  const selected = plan.selected.find((project) => project.symbol === "NEVERSEEN");

  assert.ok(selected);
  assert.equal(selected.standardSelectionReason, "FRESH_DISCOVERY_RESERVE");
  assert.equal(selected.standardSelectionRescueReason, "never queued by prior standard scans");
  assert.ok(plan.report.allocation.freshDiscoveryReserve >= 1);
});

test("fresh discovery reserve changes across run sequences", () => {
  const projects = Array.from({ length: 140 }, (_, index) => candidate(index, {
    liquidityUsd: 50_000,
    volume24h: 20_000,
    marketCap: 1_000_000,
    discoveryPriorityScore: 1000,
  }));
  const options = {
    standardIntelligenceLimit: 60,
    advancedIntelligenceLimit: 30,
    deepIntelligenceLimit: 20,
    crawlerResearchLimit: 10,
    localAITopProjectLimit: 5,
    finalistDebateLimit: 5,
    finalistComparisonLimit: 5,
  };
  const first = planInstitutionalCandidateSelection(projects, { ...options, runSequence: 11 });
  const second = planInstitutionalCandidateSelection(projects, { ...options, runSequence: 12 });
  const firstFresh = new Set(
    first.selected
      .filter((project) => project.standardSelectionReason === "FRESH_DISCOVERY_RESERVE")
      .map((project) => project.standardSelectionIdentityKey)
  );
  const secondFresh = new Set(
    second.selected
      .filter((project) => project.standardSelectionReason === "FRESH_DISCOVERY_RESERVE")
      .map((project) => project.standardSelectionIdentityKey)
  );
  const overlap = [...firstFresh].filter((key) => secondFresh.has(key)).length;

  assert.ok(firstFresh.size > 0);
  assert.ok(secondFresh.size > 0);
  assert.ok(overlap < Math.max(firstFresh.size, secondFresh.size));
});

test("stage reranking can promote a candidate into deep and Llama receives only top 100", () => {
  const projects = Array.from({ length: 220 }, (_, index) => candidate(index));
  const lateEvidence = candidate(1000, {
    symbol: "DEEPRERANK",
    liquidityChange24hPct: 120,
    buyersChange24hPct: 120,
    developerActivityScore: 100,
    githubProScore: 100,
    sourceTruthScore: 95,
    identityResolutionScore: 95,
    socialAccelerationScore: 0,
  });
  const plan = planInstitutionalCandidateSelection([...projects, lateEvidence], {
    standardIntelligenceLimit: 200,
    advancedIntelligenceLimit: 150,
    deepIntelligenceLimit: 50,
    crawlerResearchLimit: 40,
    localAITopProjectLimit: 20,
    finalistDebateLimit: 10,
    finalistComparisonLimit: 5,
  });

  assert.ok(plan.deep.some((project) => project.symbol === "DEEPRERANK"));
  assert.equal(plan.llama3.length, 20);
});

test("excluded candidate shadow audit cannot influence current ranking", () => {
  const projects = Array.from({ length: 80 }, (_, index) => candidate(index));
  const plan = planInstitutionalCandidateSelection(projects, {
    standardIntelligenceLimit: 25,
    advancedIntelligenceLimit: 10,
    deepIntelligenceLimit: 5,
    crawlerResearchLimit: 5,
    localAITopProjectLimit: 5,
    finalistDebateLimit: 5,
    finalistComparisonLimit: 5,
  });

  assert.equal(plan.shadowAudit.topExcluded.length, 55);
  assert.ok(plan.missedOpportunityAudit.leakagePolicy.includes("Future outcomes are not used"));
  assert.equal(plan.missedOpportunityAudit.status, "COLD_START");
});
