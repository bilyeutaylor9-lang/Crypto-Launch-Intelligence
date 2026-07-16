import test from "node:test";
import assert from "node:assert/strict";

import { analyzeOpportunityTimingBatch } from "../src/engines/opportunityTimingEngine.js";
import { analyzeAttentionGapBatch } from "../src/engines/attentionGapEngine.js";
import { analyzeMarketOpportunityRankBatch } from "../src/engines/marketOpportunityRankEngine.js";
import { assembleOpportunityEvidence } from "../src/opportunity/opportunityEvidenceAssembler.js";
import { summarizeMarketOpportunity } from "../src/reports/marketOpportunityReportEngine.js";

function candidate(overrides = {}) {
  return {
    name: "Authoritative Alpha",
    symbol: "AUTH",
    chain: "base",
    contractAddress: "0xauth",
    source: "dexscreener",
    discoverySources: ["dexscreener", "geckoterminal", "github"],
    progressiveOpportunityScore: 88,
    trustScore: 76,
    executionScore: 78,
    opportunityEvidenceCoverage: 78,
    opportunityRankingTier: "EARLY_HIGH_CONVICTION",
    opportunityHardBlockers: [],
    accelerationScore: 86,
    velocityScore: 82,
    buyPressureScore: 82,
    liquidityExpansionScore: 86,
    activeLiquidityTruthScore: 80,
    earlyBreakoutScore: 80,
    momentumCompressionScore: 78,
    smartWalletArrivalScore: 84,
    smartMoneyAccumulationScore: 80,
    liveCatalystRadarScore: 82,
    catalystCalendarScore: 76,
    roadmapCatalystProfitScore: 78,
    narrativeForecastScore: 72,
    developerActivityScore: 82,
    githubProScore: 80,
    projectChangeScore: 78,
    sourceTruthScore: 82,
    institutionalDataProvenanceScore: 78,
    localAIStatus: "COMPLETE",
    localAIVerdict: "EVIDENCE_SUPPORTED",
    localAIConfidence: 82,
    localAICoverage: 78,
    sniperEvidenceFamilyList: [
      { family: "liquidity", familyScore: 78, evidence: ["usable liquidity"] },
      { family: "development", familyScore: 80, evidence: ["repo activity"] },
      { family: "source-truth", familyScore: 82, evidence: ["three sources"] },
    ],
    ...overrides,
  };
}

test("opportunity timing rewards early setup and penalizes late chase", () => {
  const [early, chased] = analyzeOpportunityTimingBatch([
    candidate({ symbol: "EARLY", priceChange24h: 2, priceChange7d: 8, socialAccelerationScore: 20 }),
    candidate({ symbol: "CHASE", priceChange24h: 120, priceChange7d: 260, socialAccelerationScore: 95 }),
  ]);

  assert.equal(early.symbol, "EARLY");
  assert.ok(early.opportunityTimingScore > chased.opportunityTimingScore);
  assert.ok(chased.lateChaseRiskScore >= 70);
});

test("attention gap favors fundamentals before market attention", () => {
  const [quiet, crowded] = analyzeAttentionGapBatch([
    candidate({ symbol: "QUIET", priceChange24h: 1, xSocialScore: 15, externalSignalScore: 10 }),
    candidate({ symbol: "CROWD", priceChange24h: 95, xSocialScore: 92, externalSignalScore: 88 }),
  ]);

  assert.equal(quiet.symbol, "QUIET");
  assert.ok(quiet.attentionGapScore > crowded.attentionGapScore);
  assert.ok(quiet.attentionGapSignals.length > 0);
});

test("market opportunity rank creates one canonical evidence record", () => {
  const [ranked] = analyzeMarketOpportunityRankBatch([
    candidate({ opportunityTimingScore: 84, attentionGapScore: 80 }),
  ]);
  const record = assembleOpportunityEvidence(ranked);

  assert.ok(ranked.marketOpportunityRank >= 80);
  assert.equal(record.projectKey, "base:0xauth");
  assert.equal(record.scores.marketOpportunityRank, ranked.marketOpportunityRank);
  assert.equal(record.opportunityLane, ranked.opportunityLane);
  assert.ok(record.signals.some((signal) => signal.type === "MARKET_RANK"));
});

test("authoritative report declares a clear leader only when the top candidate has a real gap", () => {
  const ranked = analyzeMarketOpportunityRankBatch([
    candidate({ symbol: "LEAD", contractAddress: "0xlead", opportunityTimingScore: 88, attentionGapScore: 84 }),
    candidate({
      symbol: "RUN",
      contractAddress: "0xrun",
      progressiveOpportunityScore: 76,
      trustScore: 65,
      opportunityTimingScore: 68,
      attentionGapScore: 62,
    }),
  ]);
  const report = summarizeMarketOpportunity(ranked);

  assert.equal(report.verdict, "CLEAR_MARKET_LEADER");
  assert.equal(report.bestOpportunityNow.identity.symbol, "LEAD");
  assert.equal(report.topFiveOpportunities.length, 2);
  assert.ok(report.finalistComparison.clearLeaderGap >= 5);
});

test("authoritative report refuses to manufacture certainty when leaders are too close", () => {
  const ranked = analyzeMarketOpportunityRankBatch([
    candidate({ symbol: "ONE", contractAddress: "0xone", opportunityTimingScore: 82, attentionGapScore: 78 }),
    candidate({ symbol: "TWO", contractAddress: "0xtwo", opportunityTimingScore: 81, attentionGapScore: 77 }),
  ]);
  const report = summarizeMarketOpportunity(ranked);

  assert.equal(report.verdict, "NO_CLEAR_MARKET_LEADER");
  assert.equal(report.bestOpportunityNow, null);
  assert.ok(report.noClearLeaderReason.includes("too closely ranked"));
});
