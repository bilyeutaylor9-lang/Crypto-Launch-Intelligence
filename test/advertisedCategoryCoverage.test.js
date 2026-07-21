import test from "node:test";
import assert from "node:assert/strict";

import {
  summarizeAdvertisedCategoryCoverage,
} from "../src/reports/advertisedCategoryCoverageReportEngine.js";

function candidate(overrides = {}) {
  return {
    name: "Category Candidate",
    symbol: "CAT",
    chain: "base",
    progressiveOpportunityScore: 66,
    moneyRankScore: 58,
    pipelineScore: 54,
    confidenceAdjustedScore: 60,
    opportunityRankingTier: "MONITOR_ONLY",
    earlyAsymmetryResearchPriorityScore: 66,
    smallCapHunterScore: 66,
    smallCapUpsideScore: 68,
    smallCapPreHitPressureScore: 64,
    smallCapHunter: {
      executionReady: false,
      missingEvidence: ["verified fresh buy/sell route"],
      warnings: ["Research-only until route is verified."],
      blockers: [],
    },
    preBreakoutRadarScore: 66,
    preBreakoutSequenceScore: 64,
    preBreakoutMomentumScore: 65,
    preBreakoutRadarLane: "WATCH",
    capitalMigrationScore: 64,
    capitalFlowScore: 68,
    capitalMigrationLane: "FLOW_ACCELERATING",
    quantumOpportunityScore: 66,
    quantumOutcomeField: {
      positiveProbability: 62,
      collapseProbability: 12,
    },
    liveCatalystRadarScore: 66,
    catalystScore: 64,
    githubProScore: 66,
    developerActivityScore: 64,
    organicDemandIntegrityScore: 64,
    organicBuyerScore: 66,
    sourceTruthScore: 66,
    sourceReliabilityScore: 64,
    identityResolutionScore: 73,
    executionScore: 24,
    executionStatus: "UNKNOWN",
    finalSelectionState: "INSUFFICIENT_DATA",
    finalSelectionQualified: false,
    missingEvidence: ["execution route", "identity freshness"],
    ...overrides,
  };
}

test("advertised categories publish research fallbacks when strict gates are empty", () => {
  const report = summarizeAdvertisedCategoryCoverage([candidate()]);

  assert.equal(report.status, "ALL_ADVERTISED_CATEGORIES_HAVE_RESULTS");
  assert.equal(report.emptyCategories, 0);
  assert.ok(report.categoriesUsingResearchFallback > 0);
  assert.ok(report.categories.every((category) => category.displayedResults.length >= 1));
  assert.ok(report.categories.every((category) => category.displayedResults[0].researchOnly));
  assert.ok(report.categories.every((category) => category.displayedResults[0].whyShown.includes("Best available")));
});

test("advertised category fallbacks never include deterministic safety blocks", () => {
  const report = summarizeAdvertisedCategoryCoverage([
    candidate({ symbol: "SAFE" }),
    candidate({
      symbol: "BAD",
      honeypotDetected: true,
      finalSelectionState: "BLOCKED",
      finalBlockingReasons: ["Honeypot detected"],
    }),
  ]);

  for (const category of report.categories) {
    assert.ok(!category.displayedResults.some((project) => project.symbol === "BAD"));
  }
  assert.ok(report.categories.some((category) => category.displayedResults.some((project) => project.symbol === "SAFE")));
});

test("advertised categories backfill safe candidates when category-specific evidence is absent", () => {
  const report = summarizeAdvertisedCategoryCoverage([
    candidate({
      symbol: "BACKFILL",
      earlyAsymmetryResearchPriorityScore: 0,
      smallCapHunterScore: 0,
      smallCapUpsideScore: 0,
      smallCapPreHitPressureScore: 0,
      smallCapHunter: null,
      preBreakoutRadarScore: 0,
      preBreakoutSequenceScore: 0,
      preBreakoutMomentumScore: 0,
      capitalMigrationScore: 0,
      capitalFlowScore: 0,
      capitalMigrationLane: "",
      quantumOpportunityScore: 0,
      quantumOutcomeField: null,
      liveCatalystRadarScore: 0,
      catalystScore: 0,
      githubProScore: 0,
      developerActivityScore: 0,
      organicDemandIntegrityScore: 0,
      organicBuyerScore: 0,
      sourceTruthScore: 0,
      sourceReliabilityScore: 0,
      executionScore: 0,
    }),
  ]);

  assert.equal(report.emptyCategories, 0);
  assert.ok(report.categoriesUsingResearchBackfill > 0);
  assert.ok(report.categories.some((category) => category.status === "RESEARCH_BACKFILL"));
  assert.ok(
    report.categories
      .filter((category) => category.status === "RESEARCH_BACKFILL")
      .every((category) => category.displayedResults[0].whyShown.includes("No category-specific result"))
  );
});

test("advertised categories prefer strict results when available", () => {
  const report = summarizeAdvertisedCategoryCoverage([
    candidate({ symbol: "FALLBACK" }),
    candidate({
      symbol: "STRICT",
      opportunityRankingTier: "SNIPER_READY",
      sniperQualified: true,
      executionStatus: "VERIFIED",
      executionScore: 84,
      purchaseRouteConfirmed: true,
      finalSelectionState: "QUALIFIED",
      finalSelectionQualified: true,
    }),
  ]);
  const sniper = report.categories.find((category) => category.key === "sniperReady");
  const execution = report.categories.find((category) => category.key === "executionReady");

  assert.equal(sniper.status, "STRICT_RESULTS");
  assert.equal(sniper.displayedResults[0].symbol, "STRICT");
  assert.equal(sniper.displayedResults[0].displayMode, "STRICT");
  assert.equal(execution.status, "STRICT_RESULTS");
  assert.equal(execution.displayedResults[0].symbol, "STRICT");
});
