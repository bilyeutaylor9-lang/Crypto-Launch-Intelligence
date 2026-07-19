import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { classifyAddressState } from "../src/identity/strictIdentityValidators.js";
import { normalizeCapitalFlowObservation } from "../src/data/capitalFlowNormalizer.js";
import { analyzeCapitalFlowBaseline } from "../src/engines/capitalFlowBaselineEngine.js";
import { analyzeCapitalMigrationCore } from "../src/engines/capitalMigrationCoreEngine.js";
import { buildCapitalRotationMap } from "../src/engines/capitalRotationMapEngine.js";
import { openSqliteFallbackStore } from "../src/db/sqliteFallbackStore.js";
import { evaluatePredictionHorizons } from "../src/learning/exactOutcomeHorizonLab.js";
import { forwardReturnPct, maximumDrawdownPct } from "../src/math/timeSeriesMetrics.js";
import { ewma, robustZScore } from "../src/math/robustStatistics.js";
import { safeDivide } from "../src/math/numericSafety.js";

const TOKEN = "0x1111111111111111111111111111111111111111";
const POOL = "0x2222222222222222222222222222222222222222";
const START = "2026-07-19T00:00:00.000Z";

function flowProject(overrides = {}) {
  return {
    name: "Capital Flow Candidate",
    symbol: "CFC",
    chain: "base",
    source: "dexscreener",
    tokenAddress: TOKEN,
    contractAddress: TOKEN,
    poolAddress: POOL,
    pairAddress: POOL,
    priceUsd: 0.1,
    marketCap: 2_000_000,
    dexLiquidityUsd: 100_000,
    liquidityUsd: 100_000,
    dexVolumeUsd: 60_000,
    buyVolumeUsd: 42_000,
    sellVolumeUsd: 12_000,
    netFlowUsd: 30_000,
    buyTransactions: 70,
    sellTransactions: 25,
    uniqueBuyers: 55,
    walletConcentrationPct: 22,
    executionStatus: "VERIFIED",
    instantSafetyStatus: "PASS",
    sourceTimestamp: START,
    observedAt: START,
    ...overrides,
  };
}

function baselineProject(overrides = {}) {
  return {
    ...flowProject(),
    capitalFlowObservation: {
      canonicalProjectId: `base:${TOKEN}`,
      chainId: "base",
      tokenAddress: TOKEN,
      poolAddress: POOL,
      priceUsd: 0.1,
      dexLiquidityUsd: 100_000,
      circulatingMarketCapUsd: 2_000_000,
      netFlowUsd: 30_000,
      uniqueBuyers: 55,
      walletConcentrationPct: 22,
      missingFields: [],
    },
    capitalFlowBaseline: {
      observationCount: 4,
      netFlowUsd: 30_000,
      flowToLiquidityPct: 30,
      flowToMarketCapPct: 1.5,
      uniqueBuyerGrowthPct: 60,
      buyerSellerRatio: 2.8,
      normalizedFlowAcceleration: 0.00012,
      liquidityGrowthPct: 22,
      liquidityRemovalPct: 0,
      priceFlowGap: 2.2,
      flowPersistence: {
        positiveWindowRatio: 0.85,
        consecutivePositiveWindows: 4,
        exponentiallyWeightedNetFlow: 22_000,
        flowReversalFrequency: 0,
      },
    },
    ...overrides,
  };
}

test("math helpers keep missing values unknown and compute core path metrics", () => {
  assert.equal(forwardReturnPct(null, 2), null);
  assert.equal(forwardReturnPct(1, null), null);
  assert.equal(forwardReturnPct(1, 1.5), 50);
  assert.equal(safeDivide(10, 0), null);
  assert.equal(maximumDrawdownPct([10, 12, 6, 9]), -50);
  assert.ok(Math.abs(ewma([10, 20, 30], { halfLife: 2 }) - 17.9289) < 0.01);
  assert.ok(Math.abs(robustZScore(1000, [10, 11, 12, 13, 1000])) > 50);
});

test("identity validator classifies placeholders without returning raw fake addresses", () => {
  const placeholder = classifyAddressState("research-seed-pool-123", "base");
  const malformed = classifyAddressState("AKE", "base");
  const valid = classifyAddressState(TOKEN, "base");

  assert.equal(placeholder.state, "SYNTHETIC_PLACEHOLDER");
  assert.equal(placeholder.normalized, null);
  assert.equal(malformed.state, "MALFORMED_ADDRESS");
  assert.equal(malformed.normalized, null);
  assert.equal(valid.state, "SYNTACTICALLY_VALID_UNVERIFIED");
  assert.equal(valid.normalized, TOKEN);
});

test("capital flow observations preserve nulls instead of inventing missing market data", () => {
  const observation = normalizeCapitalFlowObservation(flowProject({
    priceUsd: null,
    netFlowUsd: null,
    buyVolumeUsd: null,
    sellVolumeUsd: null,
  }));

  assert.equal(observation.priceUsd, null);
  assert.equal(observation.netFlowUsd, null);
  assert.ok(observation.missingFields.includes("priceUsd"));
  assert.ok(observation.missingFields.includes("netFlowUsd"));
});

test("SQLite fallback stores capital observations idempotently and preserves null fields", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "capital-migration-store-"));
  const store = openSqliteFallbackStore({ dbPath: path.join(dir, "capital.sqlite") });
  const observation = normalizeCapitalFlowObservation(flowProject({
    priceUsd: null,
    observedAt: START,
  }));

  const first = store.saveCapitalFlowObservations([observation]);
  const second = store.saveCapitalFlowObservations([observation]);
  const rows = store.loadCapitalFlowObservations({ canonicalProjectId: observation.canonicalProjectId });

  assert.equal(first.saved, 1);
  assert.equal(second.saved, 0);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].priceUsd, null);
  store.close();
});

test("baseline math uses real previous observations for buyer and transaction growth", () => {
  const previous = normalizeCapitalFlowObservation(flowProject({
    observedAt: "2026-07-18T23:50:00.000Z",
    uniqueBuyers: 20,
    buyTransactions: 30,
    sellTransactions: 20,
    netFlowUsd: 5_000,
    priceUsd: 0.08,
  }));
  const current = analyzeCapitalFlowBaseline(flowProject({
    observedAt: START,
    uniqueBuyers: 50,
    buyTransactions: 80,
    sellTransactions: 20,
    netFlowUsd: 25_000,
    priceUsd: 0.1,
  }), { observations: [previous] });

  assert.equal(current.capitalFlowBaseline.uniqueBuyerGrowthPct, 150);
  assert.equal(current.capitalFlowBaseline.transactionGrowthPct, 100);
});

test("relative capital flow lets smaller verified projects outrank equal absolute flow into larger projects", () => {
  const small = analyzeCapitalMigrationCore(baselineProject({
    symbol: "SMALL",
    capitalFlowBaseline: {
      ...baselineProject().capitalFlowBaseline,
      netFlowUsd: 30_000,
      flowToLiquidityPct: 30,
      flowToMarketCapPct: 1.5,
    },
  }));
  const large = analyzeCapitalMigrationCore(baselineProject({
    symbol: "LARGE",
    capitalFlowBaseline: {
      ...baselineProject().capitalFlowBaseline,
      netFlowUsd: 30_000,
      flowToLiquidityPct: 0.3,
      flowToMarketCapPct: 0.03,
    },
  }));

  assert.ok(small.capitalMigrationScore > large.capitalMigrationScore);
  assert.ok(small.capitalMigrationScore >= 70);
});

test("capital migration blocks dominant-wallet and unsafe flow profiles", () => {
  const result = analyzeCapitalMigrationCore(baselineProject({
    capitalFlowObservation: {
      ...baselineProject().capitalFlowObservation,
      walletConcentrationPct: 82,
    },
  }));

  assert.equal(result.capitalMigrationLane, "UNSAFE_OR_MANIPULATED");
  assert.equal(result.executionReady, false);
});

test("late price chase and capital outflow get explicit lanes", () => {
  const late = analyzeCapitalMigrationCore(baselineProject({
    capitalFlowBaseline: {
      ...baselineProject().capitalFlowBaseline,
      priceFlowGap: -2.5,
    },
  }));
  const outflow = analyzeCapitalMigrationCore(baselineProject({
    capitalFlowBaseline: {
      ...baselineProject().capitalFlowBaseline,
      netFlowUsd: -15_000,
      flowToLiquidityPct: -15,
      flowToMarketCapPct: -0.8,
      flowPersistence: {
        ...baselineProject().capitalFlowBaseline.flowPersistence,
        positiveWindowRatio: 0.2,
      },
    },
  }));

  assert.equal(late.capitalMigrationLane, "LATE_CHASE");
  assert.equal(outflow.capitalMigrationLane, "CAPITAL_OUTFLOW");
});

test("unverified execution route keeps strong flow research-only", () => {
  const result = analyzeCapitalMigrationCore(baselineProject({ executionStatus: "UNKNOWN" }));

  assert.equal(result.executionReady, false);
  assert.equal(result.researchOnly, true);
  assert.notEqual(result.capitalMigrationLane, "CONFIRMED_EARLY_FLOW");
  assert.ok(result.capitalMigrationWarnings.some((warning) => warning.includes("Execution route")));
});

test("capital rotation map summarizes flow by chain, narrative, cap bucket, and outflow", () => {
  const projects = [
    analyzeCapitalMigrationCore(baselineProject({ symbol: "IN", primaryNarrative: "AI" })),
    analyzeCapitalMigrationCore(baselineProject({
      symbol: "OUT",
      chain: "ethereum",
      primaryNarrative: "Gaming",
      capitalFlowBaseline: {
        ...baselineProject().capitalFlowBaseline,
        netFlowUsd: -20_000,
        flowToLiquidityPct: -20,
        flowPersistence: {
          ...baselineProject().capitalFlowBaseline.flowPersistence,
          positiveWindowRatio: 0.1,
        },
      },
    })),
  ];
  const rotation = buildCapitalRotationMap(projects);

  assert.equal(rotation.projectsAnalyzed, 2);
  assert.equal(rotation.chainRotation[0].key, "base");
  assert.equal(rotation.narrativeRotation[0].key, "ai");
  assert.equal(rotation.marketCapRotation[0].key, "micro-cap");
  assert.equal(rotation.outflowWatch[0].symbol, "OUT");
});

test("exact outcome lab ignores pre-prediction observations and resolves fixed horizons only after prediction time", () => {
  const prediction = {
    predictionId: "pred-1",
    canonicalProjectId: `base:${TOKEN}`,
    predictedAt: START,
    entryPriceUsd: 1,
  };
  const before = {
    canonicalProjectId: `base:${TOKEN}`,
    observedAt: "2026-07-18T23:59:00.000Z",
    priceUsd: 100,
  };
  const after = {
    canonicalProjectId: `base:${TOKEN}`,
    observedAt: "2026-07-19T01:00:00.000Z",
    priceUsd: 1.25,
    dexLiquidityUsd: 20_000,
    executionStatus: "VERIFIED",
  };
  const evaluated = evaluatePredictionHorizons(prediction, [before, after], { tolerancePct: 0.01 });

  assert.equal(evaluated.status, "EVALUATED");
  assert.equal(evaluated.horizons["1h"].status, "RESOLVED");
  assert.equal(evaluated.horizons["1h"].forwardReturnPct, 25);
  assert.equal(evaluated.horizons["1h"].routeSurvival, true);
});
