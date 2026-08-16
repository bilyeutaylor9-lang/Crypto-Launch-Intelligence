import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { buildCommittedLoadedVacuumObservation, appendCommittedLoadedVacuumObservations, loadCommittedLoadedVacuumObservations } from "../src/learning/committedLoadedVacuumObservationStore.js";
import { selectMatchedControls, __matchedControlHooks } from "../src/learning/matchedControlSelector.js";
import { buildCommittedLoadedVacuumValidation, resolveValidationOutcome, __committedLoadedVacuumValidationHooks } from "../src/learning/committedLoadedVacuumValidationLab.js";

function obs(id, hour, overrides = {}) {
  return {
    identityKey: `base:${id}`,
    observedAt: new Date(Date.UTC(2026, 0, 1, hour)).toISOString(),
    scanRunId: `scan-${hour}`,
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
    ...overrides,
  };
}
function snap(key, hour, price) {
  return { key, timestamp: new Date(Date.UTC(2026, 0, 1, hour)).toISOString(), priceUsd: price };
}

test("observation freezes v10 arrival and supply state without production influence", () => {
  const row = buildCommittedLoadedVacuumObservation({
    chain: "base", tokenAddress: "0x0000000000000000000000000000000000000001", symbol: "AAA", priceUsd: 1,
    capitalArrivalIntelligence: { state: "COMMITTED_LOADED_VACUUM_SHADOW", sixHourExpectedArrivalUsd: 50000, sixHourExpectedArrivalToIgnitionRatio: 1.2, ignitionCapitalUsd: 42000, supplyVacuumSupported: true },
    ignitionTwin: { state: "ARMED", evidenceCoveragePct: 88 }, finalScore: 75,
  }, "2026-01-01T00:00:00Z");
  assert.equal(row.treatment, true);
  assert.equal(row.sixHourExpectedArrivalToIgnitionRatio, 1.2);
  assert.equal(row.rankingInfluence, false);
});

test("observation store persists point-in-time rows", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "clv-v11-"));
  const file = path.join(tmp, "rows.jsonl");
  appendCommittedLoadedVacuumObservations([{ chain: "base", symbol: "AAA", priceUsd: 1 }], { file, observedAt: "2026-01-01T00:00:00Z" });
  assert.equal(loadCommittedLoadedVacuumObservations({ file }).length, 1);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("control matcher never uses a future control observation", () => {
  const treated = obs("t", 5, { treatment: true, capitalArrivalState: "COMMITTED_LOADED_VACUUM_SHADOW" });
  const future = obs("future", 6);
  const past = obs("past", 4);
  const controls = selectMatchedControls(treated, [future, past]);
  assert.deepEqual(controls.map((x) => x.identityKey), ["base:past"]);
});

test("control matcher refuses cross-code-version matching by default", () => {
  const treated = obs("t", 5, { treatment: true });
  const other = obs("c", 4, { codeCommitSha: "different" });
  assert.equal(selectMatchedControls(treated, [other]).length, 0);
});

test("control matcher prefers supply-vacuum near misses", () => {
  const treated = obs("t", 5, { treatment: true });
  const vacuum = obs("v", 4, { supplyVacuumSupported: true, productionScore: 60 });
  const noVacuum = obs("n", 4, { supplyVacuumSupported: false, productionScore: 72 });
  const controls = selectMatchedControls(treated, [noVacuum, vacuum], { maxControls: 1 });
  assert.equal(controls[0].identityKey, "base:v");
});

test("matching distance is smaller for closer pre-signal market covariates", () => {
  const target = obs("t", 5);
  const close = obs("c", 4, { marketCapUsd: 11_000_000, liquidityUsd: 520_000 });
  const far = obs("f", 4, { marketCapUsd: 1_000_000, liquidityUsd: 40_000 });
  assert.ok(__matchedControlHooks.featureDistance(target, close) < __matchedControlHooks.featureDistance(target, far));
});

test("outcome resolution detects +25 before -15 from future snapshots only", () => {
  const treatment = obs("t", 0, { treatment: true });
  const outcome = resolveValidationOutcome(treatment, [snap("base:t", 1, 1.1), snap("base:t", 3, 1.3), snap("base:t", 8, 0.8)]);
  assert.equal(outcome.plus25BeforeMinus15, true);
  assert.equal(outcome.timeToPlus25Hours, 3);
});

test("outcome resolution detects -15 first", () => {
  const treatment = obs("t", 0, { treatment: true });
  const outcome = resolveValidationOutcome(treatment, [snap("base:t", 1, 0.8), snap("base:t", 3, 1.4)]);
  assert.equal(outcome.plus25BeforeMinus15, false);
});

test("outcome resolution never uses a snapshot at the exact signal timestamp", () => {
  const treatment = obs("t", 0, { treatment: true });
  const outcome = resolveValidationOutcome(treatment, [snap("base:t", 0, 2), snap("base:t", 1, 1.05)]);
  assert.equal(outcome.maxFavorableExcursionPct, 5);
});

test("treatment episode extraction respects cooldown", () => {
  const rows = [obs("a", 0, { treatment: true }), obs("a", 1, { treatment: true }), obs("b", 2, { treatment: true })];
  assert.equal(__committedLoadedVacuumValidationHooks.firstTreatmentEpisodes(rows, { treatmentCooldownHours: 72 }).length, 2);
});

test("matched validation calculates treatment and control outcome stats", () => {
  const treated = obs("t", 1, { treatment: true, capitalArrivalState: "COMMITTED_LOADED_VACUUM_SHADOW" });
  const control = obs("c", 1, { treatment: false });
  const report = buildCommittedLoadedVacuumValidation([treated, control], [snap("base:t", 2, 1.3), snap("base:c", 2, 0.8)], { maxControls: 1, minResolvedTreatments: 100 });
  assert.equal(report.treatedPerformance.plus25BeforeMinus15Pct, 100);
  assert.equal(report.matchedControlPerformance.plus25BeforeMinus15Pct, 0);
  assert.equal(report.promotion.state, "SHADOW_VALIDATION_INCOMPLETE");
});

test("bootstrap risk difference is unavailable on tiny samples", () => {
  const result = __committedLoadedVacuumValidationHooks.clusterBootstrapRiskDifference([]);
  assert.equal(result.pointEstimatePct, null);
});

test("bootstrap returns positive interval for consistently superior clustered treatments", () => {
  const pairs = Array.from({ length: 20 }, (_, i) => ({
    treated: { observation: obs(`t${i}`, 1, { treatment: true }), outcome: { plus25BeforeMinus15: true } },
    controls: [{ observation: obs(`c${i}`, 1), outcome: { plus25BeforeMinus15: false } }],
  }));
  const result = __committedLoadedVacuumValidationHooks.clusterBootstrapRiskDifference(pairs, { bootstrapReplicates: 300 });
  assert.ok(result.lower95Pct > 0);
});

test("promotion remains blocked on short history even with strong synthetic separation", () => {
  const treatedStats = { resolved: 120, medianReturnPctByHorizon: { "168": 30 }, falseIgnitionPct: 5 };
  const controls = { resolved: 300, medianReturnPctByHorizon: { "168": 10 }, falseIgnitionPct: 8 };
  const bootstrap = { lower95Pct: 5 };
  const pairs = Array.from({ length: 120 }, (_, i) => ({ treated: { observation: obs(`t${i}`, i % 24, { treatment: true }), outcome: {} } }));
  const decision = __committedLoadedVacuumValidationHooks.promotionDecision(pairs, treatedStats, controls, bootstrap, [], { minSpanDays: 56 });
  assert.equal(decision.state, "SHADOW_VALIDATION_INCOMPLETE");
  assert.ok(decision.blockers.includes("NEED_LONGER_TIME_SPAN"));
});

test("state ladder is included for dose-response diagnostics", () => {
  const report = buildCommittedLoadedVacuumValidation([obs("a", 0), obs("b", 0, { capitalArrivalState: "ARRIVAL_EVIDENCE_SHADOW" })], [], {});
  assert.ok(Object.hasOwn(report.stateLadder, "ARRIVAL_EVIDENCE_SHADOW"));
  assert.ok(Object.hasOwn(report.stateLadder, "COMMITTED_LOADED_VACUUM_SHADOW"));
});

test("validation report remains shadow-only and cannot change ranking", () => {
  const report = buildCommittedLoadedVacuumValidation([], [], {});
  assert.equal(report.shadowOnly, true);
  assert.equal(report.rankingInfluence, false);
});

test("primary event reports discrete snapshot limitation", () => {
  const treatment = obs("t", 0, { treatment: true });
  const outcome = resolveValidationOutcome(treatment, [snap("base:t", 1, 1.3)]);
  assert.match(outcome.warning, /between snapshots/i);
});

test("false ignition counts no +25 and observed -15 drawdown", () => {
  const stats = __committedLoadedVacuumValidationHooks.outcomeStats([{ outcome: { plus25BeforeMinus15: false, maxFavorableExcursionPct: 10, maxAdverseExcursionPct: -20, fixedHorizonReturnPct: { "6": -5, "24": -10, "72": -20, "168": -15 }, timeToPlus25Hours: null } }]);
  assert.equal(stats.falseIgnitionPct, 100);
});

test("pair difference averages matched controls rather than multiplying control count", () => {
  const d = __committedLoadedVacuumValidationHooks.pairDifference({ treated: { outcome: { plus25BeforeMinus15: true } }, controls: [{ outcome: { plus25BeforeMinus15: true } }, { outcome: { plus25BeforeMinus15: false } }] });
  assert.equal(d, 0.5);
});
