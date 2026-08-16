import test from "node:test";
import assert from "node:assert/strict";

import { analyzeRealTimeTradeFlow } from "../src/engines/realTimeTradeFlowEngine.js";
import { analyzeLocalMarketState } from "../src/engines/localMarketStateEngine.js";
import { analyzeSupplyShock } from "../src/engines/supplyShockEngine.js";
import { analyzeCapitalIntentGraph } from "../src/engines/capitalIntentGraphEngine.js";
import { analyzeWalletTemporalFingerprint } from "../src/engines/walletTemporalFingerprintEngine.js";
import { analyzeDownstreamAdoptionGraph } from "../src/engines/downstreamAdoptionGraphEngine.js";
import { analyzeFakeMomentumFirewall } from "../src/engines/fakeMomentumFirewallEngine.js";
import { analyzeMarketChangePointRadar } from "../src/engines/marketChangePointRadarEngine.js";
import { buildResidualBlindspotModel, analyzeResidualAlpha } from "../src/learning/residualAlphaMiner.js";
import { buildLeadTimeOutcomeLab } from "../src/learning/leadTimeOutcomeLab.js";
import { analyzeBreakoutHazard } from "../src/engines/breakoutHazardEngine.js";
import { buildHistoricalSequences, analyzeEventSequenceDNA } from "../src/engines/eventSequenceDNAEngine.js";
import { analyzeEdgeHalfLife } from "../src/engines/edgeHalfLifeEngine.js";
import { analyzeEdgeUncertainty } from "../src/engines/edgeUncertaintyEngine.js";
import { analyzeGlobalMarketRegimeSnapshot } from "../src/engines/globalMarketRegimeEngine.js";
import { analyzeAsymmetricEdgeSuiteBatch } from "../src/engines/asymmetricEdgeSuiteEngine.js";

function project(overrides = {}) {
  return {
    name: "Edge Protocol",
    symbol: "EDGE",
    chain: "base",
    tokenAddress: "0x0000000000000000000000000000000000000001",
    poolAddress: "0x0000000000000000000000000000000000000002",
    priceUsd: 1,
    liquidityUsd: 500_000,
    volume24h: 150_000,
    developerAccelerationScore: 88,
    projectChangeScore: 84,
    projectChangeState: "accelerating",
    githubProScore: 78,
    ecosystemIntegrationScore: 75,
    smartWalletNoveltyScore: 82,
    smartWalletArrivalScore: 80,
    smartMoneyAccumulationScore: 79,
    capitalMigrationScore: 76,
    capitalFlowScore: 78,
    buyerBreadthAccelerationScore: 66,
    buyPressureScore: 70,
    socialAccelerationScore: 18,
    xSocialScore: 20,
    narrativeHeatScore: 22,
    communityGrowthScore: 25,
    holderGrowthScore: 25,
    priceChange24hPct: 4,
    priceChange7dPct: 7,
    sourceTruthScore: 80,
    trapRiskScore: 15,
    ...overrides,
  };
}

test("observed trade tape is distinguished from derived fallback", () => {
  const observed = analyzeRealTimeTradeFlow(project({
    marketMicrostructure: {
      windows: {
        "5m": {
          buyVolumeUsd: 40_000,
          sellVolumeUsd: 12_000,
          buyCount: 32,
          sellCount: 14,
          uniqueBuyers: 24,
          uniqueSellers: 11,
          liquidityStartUsd: 500_000,
          liquidityEndUsd: 530_000,
          priceStartUsd: 1,
          priceEndUsd: 1.03,
          repeatedWalletSharePct: 12,
        },
      },
    },
  }));
  assert.equal(observed.realTimeTradeFlowEvidenceMode, "OBSERVED_TRADE_TAPE");
  assert.ok(observed.realTimeTradeFlow.windows["5m"].orderFlowImbalance > 0);

  const fallback = analyzeRealTimeTradeFlow(project());
  assert.equal(fallback.realTimeTradeFlowEvidenceMode, "DERIVED_FALLBACK_ONLY");
});

test("local market state requires observed tape", () => {
  const fallback = analyzeLocalMarketState(analyzeRealTimeTradeFlow(project()));
  assert.equal(fallback.localMarketStateName, "UNKNOWN");

  const observed = analyzeLocalMarketState(analyzeRealTimeTradeFlow(project({
    marketMicrostructure: { windows: { "5m": {
      buyVolumeUsd: 50_000, sellVolumeUsd: 10_000, buyCount: 30, sellCount: 8,
      uniqueBuyers: 24, uniqueSellers: 7, liquidityStartUsd: 500_000,
      liquidityEndUsd: 530_000, priceStartUsd: 1, priceEndUsd: 1.02,
    } } },
  })));
  assert.equal(observed.localMarketStateName, "HEALTHY_ACCUMULATION");
});

test("supply shock never treats missing evidence as low risk", () => {
  const unknown = analyzeSupplyShock(project({ tokenUnlockRiskScore: undefined, vestingPressureScore: undefined }));
  assert.equal(unknown.supplyShockState, "UNKNOWN");

  const elevated = analyzeSupplyShock(project({ scheduledUnlockPct: 12, lpLiquidityRemovedPct: 8 }));
  assert.ok(elevated.supplyShockRiskScore >= 50);
});

test("capital intent graph can identify pre-positioning before buying", () => {
  const result = analyzeCapitalIntentGraph(project({
    walletTemporalEvents: [
      { type: "CEX_WITHDRAWAL", timestamp: "2026-08-13T10:00:00Z", wallet: "A", counterparty: "CEX", amountUsd: 30000 },
      { type: "BRIDGE_IN", timestamp: "2026-08-13T10:05:00Z", wallet: "A", counterparty: "Bridge", amountUsd: 30000 },
      { type: "APPROVAL", timestamp: "2026-08-13T10:07:00Z", wallet: "A", counterparty: "Router" },
    ],
    priorityFeePercentile: 95,
    approvalActivityScore: 90,
  }));
  assert.equal(result.capitalIntentGraphState, "PRE_POSITIONING_BEFORE_BUY");
});

test("wallet temporal fingerprint sees preparation motifs", () => {
  const result = analyzeWalletTemporalFingerprint(project({
    walletTemporalEvents: [
      { type: "CEX_WITHDRAWAL", timestamp: "2026-08-13T10:00:00Z", wallet: "A", counterparty: "CEX" },
      { type: "BRIDGE", timestamp: "2026-08-13T10:01:00Z", wallet: "A", counterparty: "Bridge" },
      { type: "APPROVAL", timestamp: "2026-08-13T10:02:00Z", wallet: "A", counterparty: "Router" },
      { type: "BUY", timestamp: "2026-08-13T10:03:00Z", wallet: "A", counterparty: "Pool" },
    ],
  }));
  assert.ok(result.walletPreparationScore >= 50);
  assert.notEqual(result.walletTemporalFingerprintState, "UNOBSERVED");
});

test("downstream adoption refuses to infer from internal GitHub score", () => {
  const result = analyzeDownstreamAdoptionGraph(project({ githubProScore: 99 }));
  assert.equal(result.downstreamAdoptionState, "UNOBSERVED");

  const observed = analyzeDownstreamAdoptionGraph(project({
    downstreamAdoptionEvents: Array.from({ length: 8 }, (_, index) => ({
      timestamp: `2026-08-13T1${index}:00:00Z`,
      repository: `org${index}/repo`,
      organization: `org${index}`,
      type: "SDK_IMPORT",
      productionEvidence: index < 3,
    })),
  }));
  assert.ok(observed.downstreamAdoptionScore >= 60);
});

test("fake momentum firewall catches transaction-count inflation without capital", () => {
  const result = analyzeFakeMomentumFirewall(project({
    transactionCountGrowthPct: 300,
    volumeGrowthPct: 5,
    buyerBreadthAccelerationPct: 2,
    repetitiveTransactionScore: 90,
    sameFunderBuyerSharePct: 70,
  }));
  assert.ok(result.fakeMomentumRiskScore >= 60);
});

test("change point radar requires multiple abnormal axes", () => {
  const history = Array.from({ length: 8 }, (_, index) => ({
    projectClockScore: 20 + index,
    capitalClockScore: 22 + index,
    attentionClockScore: 18 + index,
    liquidityUsd: 100_000 + index * 1000,
    volume24hUsd: 20_000 + index * 500,
    buyerCount: 10 + index,
  }));
  const result = analyzeMarketChangePointRadar(project({
    projectClockScore: 90,
    capitalClockScore: 88,
    attentionClockScore: 20,
    liquidityUsd: 600_000,
    volume24hUsd: 300_000,
    uniqueBuyers24h: 80,
  }), { history });
  assert.ok(result.structuralBreakScore >= 50);
  assert.notEqual(result.structuralBreakState, "NO_MATERIAL_CHANGE_POINT");
});

test("global regime stays unobserved without true market-wide inputs", () => {
  assert.equal(analyzeGlobalMarketRegimeSnapshot({ btcReturn24hPct: 2 }).state, "UNOBSERVED");
  const regime = analyzeGlobalMarketRegimeSnapshot({
    btcReturn24hPct: 4,
    ethReturn24hPct: 5,
    altBreadthPct: 72,
    dexVolumeChangePct: 22,
    stablecoinLiquidityChangePct: 2,
    marketVolatilityPercentile: 55,
  });
  assert.equal(regime.state, "RISK_ON_EXPANSION");
});

function residualFixture() {
  const memory = [];
  const snapshots = [];
  const start = Date.parse("2026-01-01T00:00:00Z");
  for (let i = 0; i < 40; i += 1) {
    const key = `base:0x${String(i).padStart(40, "0")}`;
    const score = i < 8 ? 30 + i : 45 + i;
    const futureReturn = i < 8 ? 150 + i * 5 : (i % 5) * 5;
    const scannedAt = new Date(start + i * 3_600_000).toISOString();
    memory.push({
      identityKey: key,
      tokenAddress: key.split(":")[1],
      chain: "base",
      scannedAt,
      market: { priceUsd: 1 },
      scores: {
        opportunity: score,
        pipeline: score,
        projectChange: i < 8 ? 90 : 40,
        capitalFlow: i < 8 ? 85 : 45,
        buyPressure: i < 8 ? 80 : 50,
        developer: i < 8 ? 88 : 45,
        githubPro: i < 8 ? 82 : 50,
        smartWalletArrival: i < 8 ? 85 : 45,
        smartMoneyAccumulation: i < 8 ? 84 : 45,
        liquidityExpansion: i < 8 ? 78 : 50,
        narrativeHeat: i < 8 ? 25 : 55,
        socialAcceleration: i < 8 ? 20 : 55,
        sourceTruth: 80,
        trapRisk: 10,
      },
    });
    snapshots.push({
      key,
      timestamp: new Date(Date.parse(scannedAt) + 168 * 3_600_000).toISOString(),
      priceUsd: 1 + futureReturn / 100,
    });
  }
  return { memory, snapshots };
}

test("residual miner finds systematic under-rated winners", () => {
  const { memory, snapshots } = residualFixture();
  const model = buildResidualBlindspotModel(memory, snapshots, { writeReport: false, horizonHours: 168 });
  assert.equal(model.status, "EXPLORATORY_MODEL_READY");
  assert.ok(model.blindspotExamples >= 5);
  const analyzed = analyzeResidualAlpha(project(), model);
  assert.ok(analyzed.residualBlindspotSimilarity >= 70);
});

test("lead-time lab preserves observed threshold ordering", () => {
  const edgeObservations = [{
    identityKey: "base:0x1",
    observedAt: "2026-01-01T00:00:00Z",
    priceUsd: 1,
    leadStage: 3,
    divergenceScore: 70,
    divergenceState: "PRE_CONSENSUS_DIVERGENCE",
  }];
  const snapshots = [
    { key: "base:0x1", timestamp: "2026-01-01T05:00:00Z", priceUsd: 1.3 },
    { key: "base:0x1", timestamp: "2026-01-01T10:00:00Z", priceUsd: 0.8 },
  ];
  const lab = buildLeadTimeOutcomeLab(edgeObservations, snapshots, { persist: false, writeReport: false, horizons: [24] });
  assert.equal(lab.records[0].outcomes["24"].firstThreshold, "UPSIDE");
});

test("hazard engine reports empirical sample instead of invented probability", () => {
  const lab = {
    records: Array.from({ length: 20 }, (_, index) => ({
      leadStage: 3,
      divergenceScore: 70,
      divergenceState: "PRE_CONSENSUS_DIVERGENCE",
      fakeMomentumRiskScore: 10,
      outcomes: {
        "6": { observations: 1, firstThreshold: index < 10 ? "UPSIDE" : "NEITHER_OBSERVED" },
        "24": { observations: 2, firstThreshold: index < 13 ? "UPSIDE" : index < 16 ? "DOWNSIDE" : "NEITHER_OBSERVED" },
        "72": { observations: 3, firstThreshold: index < 15 ? "UPSIDE" : "DOWNSIDE" },
        "168": { observations: 4, firstThreshold: index < 16 ? "UPSIDE" : "DOWNSIDE" },
      },
    })),
  };
  const result = analyzeBreakoutHazard(project({ threeClockLeadStage: 3, threeClockDivergenceScore: 70, threeClockDivergenceState: "PRE_CONSENSUS_DIVERGENCE" }), lab);
  assert.equal(result.breakoutHazard.horizons["24h"].sampleSize, 20);
  assert.ok(result.breakoutHazard.horizons["24h"].intervalLowPct !== null);
});

test("sequence DNA compares event order, not just scores", () => {
  const observations = [];
  const lab = { records: [] };
  for (let i = 0; i < 6; i += 1) {
    const key = `base:seq${i}`;
    observations.push(
      { identityKey: key, observedAt: `2026-01-01T0${i}:00:00Z`, projectClockScore: 70, capitalClockScore: 20, attentionClockScore: 10, leadStage: 1 },
      { identityKey: key, observedAt: `2026-01-01T1${i}:00:00Z`, projectClockScore: 75, capitalClockScore: 70, attentionClockScore: 15, leadStage: 2 },
      { identityKey: key, observedAt: `2026-01-01T2${i}:00:00Z`, projectClockScore: 80, capitalClockScore: 75, attentionClockScore: 20, divergenceState: "PRE_CONSENSUS_DIVERGENCE", leadStage: 3 }
    );
    lab.records.push({ identityKey: key, outcomes: { "168": { observations: 2, firstThreshold: i < 5 ? "UPSIDE" : "DOWNSIDE" } } });
  }
  const historical = buildHistoricalSequences(observations, lab);
  const result = analyzeEventSequenceDNA(project(), {
    history: observations.slice(0, 2),
    currentObservation: observations[2],
    historicalSequences: historical,
  });
  assert.ok(result.eventSequenceSimilarity >= 70);
});

test("half-life is empirical and sample gated", () => {
  const lab = {
    records: Array.from({ length: 10 }, (_, index) => ({
      leadStage: 3,
      divergenceState: "PRE_CONSENSUS_DIVERGENCE",
      outcomes: { "168": { observations: 3, firstThreshold: "UPSIDE", firstUpsideHours: 8 + index } },
    })),
  };
  const result = analyzeEdgeHalfLife(project({ threeClockLeadStage: 3, threeClockDivergenceState: "PRE_CONSENSUS_DIVERGENCE" }), lab, { history: [] });
  assert.ok(result.edgeHalfLifeHours > 0);
  assert.match(result.edgeHalfLife.definition, /Empirical/);
});

test("uncertainty forces abstention on thin evidence", () => {
  const result = analyzeEdgeUncertainty(project({
    breakoutHazard: { horizons: { "24h": { sampleSize: 4, intervalLowPct: 5, intervalHighPct: 80 } } },
    eventSequenceDNA: { bestSimilarity: 40 },
    residualAlpha: { blindspotSimilarity: null },
    fakeMomentumFirewall: { riskScore: 10 },
  }));
  assert.equal(result.edgeAbstain, true);
});

test("full suite remains shadow-only even when many signals agree", async () => {
  const current = project({
    marketMicrostructure: { windows: { "5m": {
      buyVolumeUsd: 50_000, sellVolumeUsd: 10_000, buyCount: 30, sellCount: 8,
      uniqueBuyers: 24, uniqueSellers: 7, liquidityStartUsd: 500_000,
      liquidityEndUsd: 530_000, priceStartUsd: 1, priceEndUsd: 1.02,
    } } },
    downstreamAdoptionEvents: Array.from({ length: 8 }, (_, index) => ({
      timestamp: `2026-08-13T1${index}:00:00Z`, repository: `org${index}/repo`, organization: `org${index}`,
      type: "SDK_IMPORT", productionEvidence: index < 3,
    })),
  });
  const edgeObservations = Array.from({ length: 8 }, (_, index) => ({
    identityKey: "base:0x0000000000000000000000000000000000000001",
    observedAt: `2026-08-12T0${index}:00:00Z`,
    projectClockScore: 20 + index,
    capitalClockScore: 20 + index,
    attentionClockScore: 18 + index,
    liquidityUsd: 100_000 + index * 1000,
    volume24hUsd: 20_000 + index * 500,
    buyerCount: 10 + index,
    leadStage: 1,
    divergenceState: "NO_DIVERGENCE",
    fakeMomentumRiskScore: 0,
  }));
  const { memory, snapshots } = residualFixture();
  const result = await analyzeAsymmetricEdgeSuiteBatch([current], {
    persist: false,
    writeReport: false,
    edgeObservations,
    outcomeLab: { status: "INSUFFICIENT_SAMPLE", records: [] },
    memory,
    snapshots,
    residualAlpha: { writeReport: false },
    threeClock: { persist: false, writeReport: false },
  });
  assert.equal(result[0].asymmetricEdgeSuiteRankingInfluence, false);
  assert.equal(result[0].asymmetricEdgeSuite.shadowOnly, true);
});
