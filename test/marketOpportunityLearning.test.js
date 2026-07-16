import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

import { analyzeMarketOpportunityLearningBatch } from "../src/engines/marketOpportunityLearningEngine.js";
import { analyzeMarketOpportunityRankBatch } from "../src/engines/marketOpportunityRankEngine.js";
import {
  loadMarketOpportunityLearningStore,
  recordMarketOpportunitySnapshot,
  saveMarketOpportunityLearningStore,
  summarizeMarketOpportunityLearning,
} from "../src/learning/marketOpportunityLearningStore.js";

function tempMemory(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cli-market-learning-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return path.join(dir, "memory.json");
}

function candidate(overrides = {}) {
  return {
    name: "Learning Alpha",
    symbol: "LEARN",
    chain: "base",
    contractAddress: "0xlearn",
    source: "dexscreener",
    discoverySources: ["dexscreener", "geckoterminal", "github"],
    priceUsd: 1,
    liquidityUsd: 120000,
    marketCap: 3500000,
    progressiveOpportunityScore: 88,
    trustScore: 76,
    executionScore: 78,
    opportunityEvidenceCoverage: 78,
    opportunityHardBlockers: [],
    accelerationScore: 86,
    velocityScore: 82,
    buyPressureScore: 82,
    liquidityExpansionScore: 86,
    activeLiquidityTruthScore: 80,
    earlyBreakoutScore: 80,
    smartWalletArrivalScore: 84,
    smartMoneyAccumulationScore: 80,
    liveCatalystRadarScore: 82,
    catalystCalendarScore: 76,
    roadmapCatalystProfitScore: 78,
    narrativeForecastScore: 72,
    developerActivityScore: 82,
    githubProScore: 80,
    sourceTruthScore: 82,
    opportunityTimingScore: 84,
    attentionGapScore: 80,
    localAIStatus: "COMPLETE",
    localAIVerdict: "EVIDENCE_SUPPORTED",
    localAIConfidence: 82,
    localAICoverage: 78,
    localAIConsensusScore: 82,
    sniperEvidenceFamilyList: [
      { family: "liquidity", familyScore: 78, evidence: ["usable liquidity"] },
      { family: "development", familyScore: 80, evidence: ["repo activity"] },
      { family: "source-truth", familyScore: 82, evidence: ["three sources"] },
    ],
    ...overrides,
  };
}

test("market opportunity learning records top ranked opportunity receipts", (t) => {
  const filePath = tempMemory(t);
  const ranked = analyzeMarketOpportunityRankBatch([
    candidate({ symbol: "ONE", contractAddress: "0xone" }),
    candidate({ symbol: "TWO", contractAddress: "0xtwo", progressiveOpportunityScore: 76 }),
    candidate({ symbol: "THREE", contractAddress: "0xthree", progressiveOpportunityScore: 60 }),
  ]);

  const result = recordMarketOpportunitySnapshot(ranked, {
    filePath,
    now: "2026-07-01T00:00:00.000Z",
    topN: 2,
  });
  const memory = loadMarketOpportunityLearningStore(filePath);

  assert.equal(result.opened, 2);
  assert.equal(memory.records.length, 2);
  assert.equal(memory.records[0].rankAtPrediction, 1);
  assert.ok(memory.records[0].marketOpportunityRankAtPrediction >= memory.records[1].marketOpportunityRankAtPrediction);
});

test("market opportunity learning grades later outcomes when price data exists", (t) => {
  const filePath = tempMemory(t);
  const [ranked] = analyzeMarketOpportunityRankBatch([
    candidate({ symbol: "WIN", contractAddress: "0xwin", priceUsd: 1, liquidityUsd: 100000 }),
  ]);

  recordMarketOpportunitySnapshot([ranked], {
    filePath,
    now: "2026-07-01T00:00:00.000Z",
    topN: 1,
  });

  const [current] = analyzeMarketOpportunityRankBatch([
    candidate({ symbol: "WIN", contractAddress: "0xwin", priceUsd: 1.42, liquidityUsd: 180000 }),
  ]);
  const summary = summarizeMarketOpportunityLearning([current], {
    filePath,
    now: "2026-07-02T00:00:00.000Z",
  });

  assert.equal(summary.records, 1);
  assert.equal(summary.evaluated, 1);
  assert.equal(summary.winners, 1);
  assert.ok(summary.averageReturnPct >= 40);
  assert.ok(summary.signalFamilyStats.some((stat) => stat.id === "TIMING"));
});

test("market opportunity learning attaches bounded hints and cannot promote blocked candidates", (t) => {
  const filePath = tempMemory(t);
  saveMarketOpportunityLearningStore(
    {
      version: 1,
      updatedAt: "2026-07-03T00:00:00.000Z",
      records: [1, 2, 3].map((index) => ({
        projectKey: `base:0xwinner${index}`,
        symbol: `WIN${index}`,
        openedAt: "2026-07-01T00:00:00.000Z",
        updatedAt: "2026-07-03T00:00:00.000Z",
        rankAtPrediction: index,
        marketOpportunityRankAtPrediction: 82,
        recommendedHorizon: "7_14_DAYS",
        opportunityLane: "CATALYST_WINDOW",
        scores: {
          timing: 82,
          attentionGap: 80,
          localAIConsensus: 78,
          marketOpportunityRank: 82,
        },
        signalFamilies: ["TIMING", "ATTENTION_GAP", "LIQUIDITY"],
        latestReturnPct: 35 + index,
        liquidityChangePct: 20,
        maxRisePct: 35 + index,
        maxDrawdownPct: 0,
        currentHardBlocks: [],
        evaluated: true,
        outcomeLabel: "Winner",
      })),
    },
    filePath
  );

  const [ranked] = analyzeMarketOpportunityRankBatch([
    candidate({ contractAddress: "0xfresh", recommendedHorizon: "7_14_DAYS" }),
  ]);
  const [learned] = analyzeMarketOpportunityLearningBatch([ranked], { filePath });

  assert.ok(learned.marketOpportunityLearningAdjustment > 0);
  assert.ok(learned.marketOpportunityLearningAdjustment <= 4);
  assert.ok(learned.learnedMarketOpportunityRank >= learned.marketOpportunityRank);
  assert.ok(learned.marketOpportunityLearningHints.length > 0);

  const [blocked] = analyzeMarketOpportunityLearningBatch(
    [
      {
        ...ranked,
        symbol: "BLOCK",
        contractAddress: "0xblock",
        hardBlockers: ["critical contract risk"],
      },
    ],
    { filePath }
  );

  assert.ok(blocked.marketOpportunityLearningAdjustment <= 0);
});
