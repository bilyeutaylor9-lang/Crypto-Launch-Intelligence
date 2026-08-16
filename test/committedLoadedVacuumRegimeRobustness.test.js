import test from "node:test";
import assert from "node:assert/strict";

import { buildCommittedLoadedVacuumRegimeRobustness, PRE_REGISTERED_REGIME_STATES, __committedLoadedVacuumRegimeRobustnessHooks } from "../src/learning/committedLoadedVacuumRegimeRobustnessLab.js";

function at(day, hour = 0) { return new Date(Date.UTC(2026, 0, 1 + day, hour)).toISOString(); }
function obs(id, day, overrides = {}) {
  return {
    schemaVersion: 3,
    signalDefinitionVersion: "V10_COMMITTED_LOADED_VACUUM_V1",
    identityKey: `base:${id}`,
    observedAt: at(day),
    scanRunId: `scan-${day}`,
    codeCommitSha: "abc",
    chain: "base",
    symbol: id,
    priceUsd: 1,
    marketCapUsd: 10_000_000,
    liquidityUsd: 500_000,
    volume24hUsd: 1_000_000,
    priceChange24hPct: 2,
    productionScore: 72,
    riskScore: 20,
    ignitionState: "ARMED",
    capitalArrivalState: "ARRIVAL_PRESSURE_BUILDING_SHADOW",
    treatment: false,
    sixHourExpectedArrivalToIgnitionRatio: 0.8,
    supplyVacuumSupported: true,
    evidenceCoveragePct: 80,
    globalMarketRegimeState: "NEUTRAL_SELECTIVE",
    ...overrides,
  };
}
function snap(key, iso, price) { return { key, timestamp: iso, priceUsd: price }; }
function future(row, winner) {
  const t = Date.parse(row.observedAt);
  return [
    snap(row.identityKey, new Date(t + 1 * 3_600_000).toISOString(), winner ? 1.3 : 0.8),
    snap(row.identityKey, new Date(t + 168 * 3_600_000).toISOString(), winner ? 1.4 : 0.7),
  ];
}
function dataset(regimes = ["RISK_ON_EXPANSION", "NEUTRAL_SELECTIVE", "RISK_OFF_STRESS"], pairsPerRegime = 5, negativeRegime = null) {
  const observations = [];
  const snapshots = [];
  let index = 0;
  for (const regime of regimes) {
    for (let j = 0; j < pairsPerRegime; j += 1) {
      const day = 2 + index * 2;
      const treatedWins = regime !== negativeRegime;
      const treated = obs(`t${index}`, day, { treatment: true, capitalArrivalState: "COMMITTED_LOADED_VACUUM_SHADOW", sixHourExpectedArrivalToIgnitionRatio: 1.4, globalMarketRegimeState: regime });
      const control = obs(`c${index}`, day, { treatment: false, globalMarketRegimeState: regime });
      observations.push(treated, control);
      snapshots.push(...future(treated, treatedWins), ...future(control, !treatedWins));
      index += 1;
    }
  }
  return { observations, snapshots };
}

test("regime policy is pre-registered and includes unknown states", () => {
  assert.ok(PRE_REGISTERED_REGIME_STATES.includes("RISK_OFF_STRESS"));
  assert.ok(PRE_REGISTERED_REGIME_STATES.includes("UNKNOWN"));
});

test("unrecognized regime is kept as UNKNOWN rather than guessed", () => {
  assert.equal(__committedLoadedVacuumRegimeRobustnessHooks.regimeOf({ globalMarketRegimeState: "mystery" }), "UNKNOWN");
});

test("liquidity tiers use fixed cut points", () => {
  assert.equal(__committedLoadedVacuumRegimeRobustnessHooks.liquidityTier({ liquidityUsd: 200000 }), "LT_250K");
  assert.equal(__committedLoadedVacuumRegimeRobustnessHooks.liquidityTier({ liquidityUsd: 500000 }), "250K_TO_1M");
  assert.equal(__committedLoadedVacuumRegimeRobustnessHooks.liquidityTier({ liquidityUsd: 2000000 }), "GTE_1M");
});

test("market cap tiers use fixed cut points", () => {
  assert.equal(__committedLoadedVacuumRegimeRobustnessHooks.marketCapTier({ marketCapUsd: 5_000_000 }), "LT_10M");
  assert.equal(__committedLoadedVacuumRegimeRobustnessHooks.marketCapTier({ marketCapUsd: 25_000_000 }), "10M_TO_50M");
  assert.equal(__committedLoadedVacuumRegimeRobustnessHooks.marketCapTier({ marketCapUsd: 100_000_000 }), "GTE_50M");
});

test("pair primary difference averages matched controls", () => {
  const pair = { treated: { outcome: { plus25BeforeMinus15: true } }, controls: [{ outcome: { plus25BeforeMinus15: true } }, { outcome: { plus25BeforeMinus15: false } }] };
  assert.equal(__committedLoadedVacuumRegimeRobustnessHooks.pairPrimaryDifference(pair), 0.5);
});

test("strong separation across three regimes reaches shadow robustness support", () => {
  const { observations, snapshots } = dataset();
  const report = buildCommittedLoadedVacuumRegimeRobustness(observations, snapshots, { maxControls: 1, minPairsPerStratum: 5, minQualifiedRegimes: 3, minPositiveRegimePct: 67 });
  assert.equal(report.state, "REGIME_ROBUSTNESS_SUPPORTED_SHADOW");
  assert.equal(report.decision.qualifiedRegimes, 3);
});

test("a materially negative qualified regime is a stop condition", () => {
  const { observations, snapshots } = dataset(undefined, 5, "RISK_OFF_STRESS");
  const report = buildCommittedLoadedVacuumRegimeRobustness(observations, snapshots, { maxControls: 1, minPairsPerStratum: 5, minQualifiedRegimes: 3, minPositiveRegimePct: 67, maxWorstRegimeRiskDifferencePct: -5 });
  assert.equal(report.state, "REGIME_FRAGILE_SHADOW");
  assert.ok(report.decision.blockers.includes("WORST_REGIME_EFFECT_TOO_NEGATIVE"));
});

test("insufficient regime coverage stays collecting", () => {
  const { observations, snapshots } = dataset(["RISK_ON_EXPANSION"], 5);
  const report = buildCommittedLoadedVacuumRegimeRobustness(observations, snapshots, { maxControls: 1, minPairsPerStratum: 5, minQualifiedRegimes: 3 });
  assert.equal(report.state, "REGIME_ROBUSTNESS_COLLECTING");
});

test("unknown regime is reported but not counted as qualified evidence", () => {
  const { observations, snapshots } = dataset(["UNKNOWN"], 5);
  const report = buildCommittedLoadedVacuumRegimeRobustness(observations, snapshots, { maxControls: 1, minPairsPerStratum: 5, minQualifiedRegimes: 1 });
  assert.ok(report.byGlobalMarketRegime.UNKNOWN);
  assert.equal(report.decision.qualifiedRegimes, 0);
});

test("leave-one-regime-out excludes one known regime at a time", () => {
  const { observations, snapshots } = dataset();
  const report = buildCommittedLoadedVacuumRegimeRobustness(observations, snapshots, { maxControls: 1, minPairsPerStratum: 5 });
  assert.equal(report.leaveOneRegimeOut.length, 3);
  assert.ok(report.leaveOneRegimeOut.every((row) => row.excludedRegime !== "UNKNOWN"));
});

test("chain and arrival-tier diagnostics are emitted without changing the signal", () => {
  const { observations, snapshots } = dataset();
  const report = buildCommittedLoadedVacuumRegimeRobustness(observations, snapshots, { maxControls: 1, minPairsPerStratum: 5 });
  assert.ok(report.byChain.base);
  assert.ok(report.bySixHourArrivalTier["1_25_TO_1_75"]);
});

test("regime robustness remains shadow-only", () => {
  const report = buildCommittedLoadedVacuumRegimeRobustness([], [], {});
  assert.equal(report.shadowOnly, true);
  assert.equal(report.rankingInfluence, false);
  assert.equal(report.automaticProductionPromotion, false);
});
