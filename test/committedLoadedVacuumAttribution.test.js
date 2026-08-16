import test from "node:test";
import assert from "node:assert/strict";

import { buildCommittedLoadedVacuumObservation } from "../src/learning/committedLoadedVacuumObservationStore.js";
import { buildCommittedLoadedVacuumAttribution, buildAttributionDataset, __committedLoadedVacuumAttributionHooks } from "../src/learning/committedLoadedVacuumAttributionLab.js";

function at(day, hour = 0) { return new Date(Date.UTC(2026, 0, 1 + day, hour)).toISOString(); }
function observation(i, overrides = {}) {
  return {
    schemaVersion: 2,
    signalDefinitionVersion: "V10_COMMITTED_LOADED_VACUUM_V1",
    identityKey: `base:token-${i}`,
    observedAt: at(i),
    scanRunId: `scan-${i}`,
    codeCommitSha: "abc",
    chain: "base",
    priceUsd: 1,
    marketCapUsd: 10_000_000,
    liquidityUsd: 500_000,
    volume24hUsd: 1_000_000,
    priceChange24hPct: 1,
    productionScore: 70,
    riskScore: 20,
    evidenceCoveragePct: 85,
    ignitionState: "ARMED",
    supplyVacuumSupported: false,
    sellerExhaustionScore: 50,
    marginalSellerInventoryBurnPct: 0,
    oneHourExpectedArrivalToIgnitionRatio: 0.1,
    sixHourExpectedArrivalToIgnitionRatio: 0.2,
    twentyFourHourExpectedArrivalToIgnitionRatio: 0.3,
    sixHourExpectedArrivalUsd: 10_000,
    ignitionCapitalUsd: 50_000,
    buyerReplacementScore: 50,
    liquidityConvexityIndex: 1,
    reflexivityMechanismStrengthScore: 50,
    pressureWithoutMovement: false,
    treatment: false,
    capitalArrivalState: "ARRIVAL_EVIDENCE_SHADOW",
    ...overrides,
  };
}
function snapshotsFor(row, winner) {
  const start = Date.parse(row.observedAt);
  return [
    { key: row.identityKey, timestamp: new Date(start + 3_600_000).toISOString(), priceUsd: winner ? 1.3 : 0.8 },
    { key: row.identityKey, timestamp: new Date(start + 168 * 3_600_000).toISOString(), priceUsd: winner ? 1.4 : 0.7 },
  ];
}

function synthetic(n = 140) {
  const observations = [];
  const snapshots = [];
  for (let i = 0; i < n; i += 1) {
    const winner = i % 2 === 0;
    const row = observation(i, winner ? {
      supplyVacuumSupported: true,
      sellerExhaustionScore: 85,
      marginalSellerInventoryBurnPct: 30,
      sixHourExpectedArrivalToIgnitionRatio: 1.25,
      oneHourExpectedArrivalToIgnitionRatio: 0.5,
      twentyFourHourExpectedArrivalToIgnitionRatio: 1.6,
      treatment: true,
      capitalArrivalState: "COMMITTED_LOADED_VACUUM_SHADOW",
    } : {});
    observations.push(row);
    snapshots.push(...snapshotsFor(row, winner));
  }
  return { observations, snapshots };
}

test("v13 frozen observation preserves arrival horizons while extending schema v3 context", () => {
  const row = buildCommittedLoadedVacuumObservation({
    chain: "base", tokenAddress: "0x0000000000000000000000000000000000000001", priceUsd: 1,
    capitalArrivalIntelligence: {
      state: "COMMITTED_LOADED_VACUUM_SHADOW", supplyVacuumSupported: true,
      arrivalCurve: [
        { horizonHours: 1, expectedArrivingCapitalUsd: 1000, expectedArrivalToIgnitionRatio: 0.1 },
        { horizonHours: 6, expectedArrivingCapitalUsd: 12000, expectedArrivalToIgnitionRatio: 1.2 },
        { horizonHours: 24, expectedArrivingCapitalUsd: 18000, expectedArrivalToIgnitionRatio: 1.8 },
      ],
      sixHourExpectedArrivalUsd: 12000, sixHourExpectedArrivalToIgnitionRatio: 1.2,
    },
  }, at(0));
  assert.equal(row.schemaVersion, 3);
  assert.equal(row.oneHourExpectedArrivalToIgnitionRatio, 0.1);
  assert.equal(row.twentyFourHourExpectedArrivalToIgnitionRatio, 1.8);
  assert.equal(row.treatment, true);
});

test("unknown pressure state remains null rather than false", () => {
  const row = buildCommittedLoadedVacuumObservation({ chain: "base", symbol: "AAA" }, at(0));
  assert.equal(row.pressureWithoutMovement, null);
});

test("attribution feature definitions never include treatment label or future outcome", () => {
  const keys = __committedLoadedVacuumAttributionHooks.FEATURE_DEFINITIONS.map((d) => d.key);
  assert.ok(!keys.includes("treatment"));
  assert.ok(!keys.some((key) => /outcome|future|plus25/i.test(key)));
});

test("missing feature gets fold-local imputation plus an explicit missingness indicator", () => {
  const rows = [{ observation: observation(0, { sellerExhaustionScore: null }), y: 1 }, { observation: observation(1, { sellerExhaustionScore: 80 }), y: 0 }];
  const prep = __committedLoadedVacuumAttributionHooks.fitPreprocessor(rows, ["supply"]);
  const vec = __committedLoadedVacuumAttributionHooks.vectorize(rows[0], prep);
  const sellerIndex = prep.specs.findIndex((s) => s.key === "sellerExhaustionScore");
  assert.ok(sellerIndex >= 0);
  assert.equal(vec[sellerIndex * 2 + 1], 1);
});

test("outcome dataset uses only strictly future threshold-ordered outcomes", () => {
  const row = observation(0);
  const snaps = [{ key: row.identityKey, timestamp: row.observedAt, priceUsd: 2 }, ...snapshotsFor(row, true)];
  const data = buildAttributionDataset([row], snaps);
  assert.equal(data.length, 1);
  assert.equal(data[0].y, 1);
});

test("walk-forward excludes projects already seen in training by default", () => {
  const { observations, snapshots } = synthetic(70);
  observations[50] = { ...observations[50], identityKey: observations[0].identityKey };
  const data = buildAttributionDataset(observations, snapshots);
  const walk = __committedLoadedVacuumAttributionHooks.expandingWalkForward(data, { minTrainRows: 40, foldSize: 15 });
  const trainedIds = new Set(data.slice(0, 40).map((r) => r.observation.identityKey));
  const firstFoldPredictions = walk.predictions.filter((r) => r.foldIndex === 0);
  assert.ok(firstFoldPredictions.every((row) => !trainedIds.has(row.identityKey)));
});

test("full frozen-feature model beats market baseline on a strong synthetic supply signal", () => {
  const { observations, snapshots } = synthetic(140);
  const report = buildCommittedLoadedVacuumAttribution(observations, snapshots, { minTrainRows: 50, foldSize: 20, minResolvedRows: 20, minUniqueProjects: 20, minSpanDays: 1, minOutOfSampleRows: 20 });
  assert.ok(report.fullModel.brier < report.baselineOnly.brier);
  assert.ok(report.fullVsBaselineBrierImprovement > 0);
});

test("supply ablation detects incremental predictive association in synthetic data", () => {
  const { observations, snapshots } = synthetic(160);
  const report = buildCommittedLoadedVacuumAttribution(observations, snapshots, { minTrainRows: 50, foldSize: 20, bootstrapReplicates: 250, minResolvedRows: 20, minUniqueProjects: 20, minSpanDays: 1, minOutOfSampleRows: 20 });
  const supply = report.familyAttribution.find((row) => row.family === "supply");
  assert.ok(supply.brierDegradationWhenRemoved > 0);
});

test("threshold robustness grid is fixed before looking at results", () => {
  assert.deepEqual([...__committedLoadedVacuumAttributionHooks.PRE_REGISTERED_RATIO_THRESHOLDS], [0.75, 1, 1.25]);
});

test("attribution report remains shadow-only and cannot promote production", () => {
  const report = buildCommittedLoadedVacuumAttribution([], [], {});
  assert.equal(report.shadowOnly, true);
  assert.equal(report.rankingInfluence, false);
  assert.equal(report.productionPromotion, false);
});

test("cold start reports collection rather than inventing attribution", () => {
  const report = buildCommittedLoadedVacuumAttribution([], [], {});
  assert.equal(report.status, "COLLECTING_RESOLVED_OUTCOMES");
  assert.equal(report.fullModel.brier, null);
});

test("bootstrap attribution is deterministic for a fixed seed", () => {
  const rows = Array.from({ length: 20 }, (_, i) => ({ identityKey: `p${i}`, y: i % 2, pFull: i % 2 ? 0.8 : 0.2, pNoSupply: 0.5 }));
  const a = __committedLoadedVacuumAttributionHooks.bootstrapLossDifference(rows, "pNoSupply", "pFull", { bootstrapReplicates: 250, bootstrapSeed: 9 });
  const b = __committedLoadedVacuumAttributionHooks.bootstrapLossDifference(rows, "pNoSupply", "pFull", { bootstrapReplicates: 250, bootstrapSeed: 9 });
  assert.deepEqual(a, b);
});
