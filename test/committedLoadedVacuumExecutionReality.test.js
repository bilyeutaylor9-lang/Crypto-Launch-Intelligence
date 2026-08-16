import test from "node:test";
import assert from "node:assert/strict";

import { buildCommittedLoadedVacuumObservation, __committedLoadedVacuumObservationHooks } from "../src/learning/committedLoadedVacuumObservationStore.js";
import { buildCommittedLoadedVacuumExecutionReality, resolveNetExecutionOutcome, PRE_REGISTERED_COST_MULTIPLIERS, __committedLoadedVacuumExecutionRealityHooks } from "../src/learning/committedLoadedVacuumExecutionRealityLab.js";
import { buildCommittedLoadedVacuumEvidenceGovernor } from "../src/learning/committedLoadedVacuumEvidenceGovernor.js";

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
    roundTripExecutionCostBps: 100,
    executionCostProvenance: "TEST_FROZEN_QUOTE",
    ...overrides,
  };
}
function snap(key, iso, price) { return { key, timestamp: iso, priceUsd: price }; }
function future(row, winner, modest = false) {
  const t = Date.parse(row.observedAt);
  const up = modest ? 1.27 : 1.4;
  return [
    snap(row.identityKey, new Date(t + 1 * 3_600_000).toISOString(), winner ? up : 0.8),
    snap(row.identityKey, new Date(t + 168 * 3_600_000).toISOString(), winner ? up : 0.7),
  ];
}
function strongDataset(n = 6, costBps = 100) {
  const observations = [];
  const snapshots = [];
  for (let i = 0; i < n; i += 1) {
    const day = 2 + i * 2;
    const treated = obs(`t${i}`, day, { treatment: true, capitalArrivalState: "COMMITTED_LOADED_VACUUM_SHADOW", sixHourExpectedArrivalToIgnitionRatio: 1.4, roundTripExecutionCostBps: costBps });
    const control = obs(`c${i}`, day, { treatment: false, roundTripExecutionCostBps: costBps });
    observations.push(treated, control);
    snapshots.push(...future(treated, true), ...future(control, false));
  }
  return { observations, snapshots };
}

test("observation freezes explicit round-trip execution cost", () => {
  const row = buildCommittedLoadedVacuumObservation({
    chain: "base", symbol: "AAA", priceUsd: 1,
    capitalArrivalIntelligence: { state: "COMMITTED_LOADED_VACUUM_SHADOW" },
    executionReality: { roundTripExecutionCostBps: 85, provenance: "FROZEN_QUOTE" },
    globalMarketRegime: { state: "NEUTRAL_SELECTIVE", inputs: { marketVolatilityPercentile: 55 } },
  }, at(0));
  assert.equal(row.schemaVersion, 3);
  assert.equal(row.roundTripExecutionCostBps, 85);
  assert.equal(row.executionCostProvenance, "FROZEN_QUOTE");
  assert.equal(row.globalMarketRegimeState, "NEUTRAL_SELECTIVE");
});

test("round-trip cost can be composed only when every required component is known", () => {
  const project = { executionReality: { entrySlippageBps: 10, exitSlippageBps: 20, entryProtocolFeeBps: 30, exitProtocolFeeBps: 30, gasCostBps: 5 } };
  assert.equal(__committedLoadedVacuumObservationHooks.explicitRoundTripExecutionCostBps(project), 95);
  delete project.executionReality.gasCostBps;
  assert.equal(__committedLoadedVacuumObservationHooks.explicitRoundTripExecutionCostBps(project), null);
});

test("unknown execution cost never becomes zero", () => {
  const outcome = resolveNetExecutionOutcome({ ...obs("a", 0), roundTripExecutionCostBps: null }, future(obs("a", 0), true));
  assert.equal(outcome.state, "EXECUTION_COST_UNKNOWN");
});

test("net outcome subtracts the frozen round-trip cost", () => {
  const row = obs("a", 0, { roundTripExecutionCostBps: 200 });
  const outcome = resolveNetExecutionOutcome(row, future(row, true));
  assert.equal(outcome.state, "NET_EXECUTION_OUTCOME_RESOLVED");
  assert.equal(outcome.appliedRoundTripExecutionCostBps, 200);
  assert.equal(outcome.fixedHorizonNetReturnPct["168"], 38);
});

test("2x stress doubles frozen cost rather than observing future liquidity", () => {
  const row = obs("a", 0, { roundTripExecutionCostBps: 150 });
  const outcome = resolveNetExecutionOutcome(row, future(row, true), { costMultiplier: 2 });
  assert.equal(outcome.appliedRoundTripExecutionCostBps, 300);
});

test("high cost can prevent a gross +25 move from becoming a net +25 event", () => {
  const row = obs("a", 0, { roundTripExecutionCostBps: 300 });
  const outcome = resolveNetExecutionOutcome(row, future(row, true, true));
  assert.equal(outcome.plus25BeforeMinus15Net, null);
  assert.equal(outcome.fixedHorizonNetReturnPct["168"], 24);
});

test("cost stress multipliers are fixed in advance", () => {
  assert.deepEqual([...PRE_REGISTERED_COST_MULTIPLIERS], [1, 1.5, 2]);
});

test("strong net separation can pass execution-reality shadow gate", () => {
  const { observations, snapshots } = strongDataset();
  const report = buildCommittedLoadedVacuumExecutionReality(observations, snapshots, { maxControls: 1, minCostCoveredTreatments: 5, minNetMatchedPairs: 5, minExecutionCostCoveragePct: 80 });
  assert.equal(report.state, "EXECUTION_REALITY_SUPPORTED_SHADOW");
  assert.ok(report.costStress.every((row) => row.matchedNetPrimaryRiskDifferencePct > 0));
});

test("missing cost coverage stays collecting rather than assuming zero", () => {
  const { observations, snapshots } = strongDataset();
  observations.forEach((row) => { row.roundTripExecutionCostBps = null; });
  const report = buildCommittedLoadedVacuumExecutionReality(observations, snapshots, { maxControls: 1, minCostCoveredTreatments: 2, minNetMatchedPairs: 2, minExecutionCostCoveragePct: 50 });
  assert.equal(report.state, "EXECUTION_REALITY_COLLECTING");
  assert.equal(report.coverage.missingCostIsZero, false);
});

test("net pair difference averages only controls with resolved cost-aware outcomes", () => {
  const treatedObs = obs("t", 0);
  const c1 = obs("c1", 0);
  const c2 = obs("c2", 0);
  const pair = { treated: { observation: treatedObs }, controls: [{ observation: c1 }, { observation: c2 }] };
  const map = new Map([
    [treatedObs, { state: "NET_EXECUTION_OUTCOME_RESOLVED", plus25BeforeMinus15Net: true }],
    [c1, { state: "NET_EXECUTION_OUTCOME_RESOLVED", plus25BeforeMinus15Net: true }],
    [c2, { state: "NET_EXECUTION_OUTCOME_RESOLVED", plus25BeforeMinus15Net: false }],
  ]);
  assert.equal(__committedLoadedVacuumExecutionRealityHooks.netPairDifference(pair, map), 0.5);
});

test("execution reality remains shadow-only", () => {
  const report = buildCommittedLoadedVacuumExecutionReality([], [], {});
  assert.equal(report.shadowOnly, true);
  assert.equal(report.rankingInfluence, false);
  assert.equal(report.automaticProductionPromotion, false);
});

test("governor requires the complete evidence stack", () => {
  const report = buildCommittedLoadedVacuumEvidenceGovernor({
    validation: { promotion: { state: "REVIEW_FOR_INDEPENDENT_REPLICATION" } },
    attribution: { readiness: { state: "ATTRIBUTION_READY_FOR_REPLICATION_REVIEW" } },
    replication: { state: "INDEPENDENT_REPLICATION_SUPPORTED_SHADOW" },
    regimeRobustness: { state: "REGIME_ROBUSTNESS_SUPPORTED_SHADOW" },
    executionReality: { state: "EXECUTION_REALITY_SUPPORTED_SHADOW" },
  });
  assert.equal(report.state, "SHADOW_EDGE_SUPPORTED_FOR_CANARY_DESIGN_REVIEW");
  assert.equal(report.canaryDesignReviewEligible, true);
});

test("governor treats failed replication as a stop state", () => {
  const report = buildCommittedLoadedVacuumEvidenceGovernor({ replication: { state: "INDEPENDENT_REPLICATION_FAILED" } });
  assert.equal(report.state, "EDGE_REPLICATION_FAILED_STOP");
  assert.equal(report.automaticCanaryLaunch, false);
});

test("governor treats regime fragility as a stop state", () => {
  const report = buildCommittedLoadedVacuumEvidenceGovernor({ replication: { state: "INDEPENDENT_REPLICATION_SUPPORTED_SHADOW" }, regimeRobustness: { state: "REGIME_FRAGILE_SHADOW" } });
  assert.equal(report.state, "EDGE_REGIME_FRAGILE_STOP");
});

test("governor treats lack of net executability as a stop state", () => {
  const report = buildCommittedLoadedVacuumEvidenceGovernor({ replication: { state: "INDEPENDENT_REPLICATION_SUPPORTED_SHADOW" }, regimeRobustness: { state: "REGIME_ROBUSTNESS_SUPPORTED_SHADOW" }, executionReality: { state: "EXECUTION_REALITY_NOT_SUPPORTED_SHADOW" } });
  assert.equal(report.state, "EDGE_NOT_NET_EXECUTABLE_STOP");
});
