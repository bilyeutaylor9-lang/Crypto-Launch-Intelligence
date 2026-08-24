import test from "node:test";
import assert from "node:assert/strict";

import { buildCalibrationReport } from "../src/production/probabilityCalibrationEngine.js";
import { evaluateEdgeDecay } from "../src/production/edgeDecayMonitor.js";
import { routeResearchBudget } from "../src/production/informationGainRouter.js";
import { combineExpertPredictions } from "../src/production/expertPortfolioEngine.js";
import { compareChampionChallenger } from "../src/production/championChallengerGovernor.js";
import { evaluateProductionReadiness } from "../src/production/productionReadinessGate.js";
import { simulateForwardDistribution } from "../src/production/forwardScenarioSimulator.js";
import { evaluateProviderHealth } from "../src/production/providerReliabilityGovernor.js";

test("calibration engine recognizes calibrated probabilities", () => {
  const predictions = [];
  for (let i = 0; i < 200; i += 1) {
    const p = i % 2 ? 0.8 : 0.2;
    predictions.push({ probability: p, actual: i % 5 !== 0 ? (p === 0.8 ? 1 : 0) : (p === 0.8 ? 0 : 1) });
  }
  const report = buildCalibrationReport(predictions, { minimumSamples: 100, maximumEce: 0.25 });
  assert.equal(report.samples, 200);
  assert.ok(report.brierScore !== null);
});

test("edge decay detects deterioration", () => {
  const now = Date.parse("2026-08-22T00:00:00Z");
  const history = [];
  for (let i = 0; i < 80; i += 1) {
    history.push({
      generatedAt: new Date(now - (35 + (i % 60)) * 86400000).toISOString(),
      hit: i % 5 !== 0,
      returnPct: 20,
    });
  }
  for (let i = 0; i < 40; i += 1) {
    history.push({
      generatedAt: new Date(now - (i % 25) * 86400000).toISOString(),
      hit: i % 4 === 0,
      returnPct: -5,
    });
  }
  const result = evaluateEdgeDecay(history, { now: new Date(now).toISOString(), minimumRecentSamples: 20, minimumPriorSamples: 30 });
  assert.ok(["WEAKENING", "DECAYING"].includes(result.state));
});

test("information gain spends finite research budget", () => {
  const result = routeResearchBudget([
    { symbol: "A", combinedResearchScore: 64, confidencePct: 20, evidenceCoveragePct: 40, estimatedResearchCostUnits: 2 },
    { symbol: "B", combinedResearchScore: 90, confidencePct: 90, evidenceCoveragePct: 95, estimatedResearchCostUnits: 2 },
  ], { budgetUnits: 2 });
  assert.equal(result.selected.length, 1);
  assert.ok(result.spentUnits <= 2);
});

test("expert portfolio weights reliable experts", () => {
  const result = combineExpertPredictions([
    { name: "good", probability: 0.8, hitRate: 0.75, calibrationError: 0.04, samples: 200 },
    { name: "weak", probability: 0.2, hitRate: 0.4, calibrationError: 0.25, samples: 20 },
  ]);
  assert.ok(result.probability > 0.5);
});

test("champion challenger never automatically promotes", () => {
  const result = compareChampionChallenger(
    { averageReturnPct: 5, precision: 0.3, catastrophicLossRate: 0.05 },
    { averageReturnPct: 12, precision: 0.4, catastrophicLossRate: 0.04, samples: 300 }
  );
  assert.equal(result.state, "CANARY_ELIGIBLE");
  assert.equal(result.automaticPromotion, false);
});

test("readiness blocks incomplete infrastructure", () => {
  const report = evaluateProductionReadiness({
    environment: { state: "ENVIRONMENT_READY" },
    remotePersistence: { state: "REMOTE_READ_HEALTHY", serverWriteCapable: true },
    remoteBackup: { pass: true, state: "REMOTE_BACKUP_ATTESTED" },
    security: { pass: true, state: "SECURITY_AUDIT_PASS" },
    edgeVerification: { verified: true, edgeState: "VERIFIED_FORWARD_EDGE" },
    alphaLab: { policy: { prospectiveFreezeRequired: true, discoverySampleCannotValidateSameHypothesis: true, automaticPromotion: false } },
    leakageAudit: { status: "PASS" },
    walkForward: { audit: { status: "PASS" } },
    observability: { healthScore: 95 },
    calibration: { state: "CALIBRATED" },
    challenger: { samples: 300, state: "CHAMPION_ELIGIBLE", automaticPromotion: false },
    outcomeHealth: { captureRate: 0.99 },
    identityHealth: { exactIdentityRate: 0.999 },
    reproducibility: { pass: false },
    backupRestore: { pass: true },
    faultInjection: { pass: true },
  });
  assert.equal(report.state, "NOT_PRODUCTION_READY");
  assert.ok(report.blockers.includes("REPRODUCIBILITY"));
});

test("scenario simulator is deterministic under fixed seed", () => {
  const candidate = {
    priceUsd: 1,
    liquidityUsd: 500000,
    ignitionGenome: { probability50Pct: 55, failureProbabilityPct: 15 },
    convergence: { convergenceStrengthPct: 70 },
  };
  const a = simulateForwardDistribution(candidate, { paths: 500, seed: 7 });
  const b = simulateForwardDistribution(candidate, { paths: 500, seed: 7 });
  assert.equal(a.probability50Pct, b.probability50Pct);
  assert.equal(a.automaticTrading, false);
});

test("provider governor opens circuit on repeated failure", () => {
  const now = "2026-08-22T00:00:00Z";
  const events = Array.from({ length: 20 }, (_, i) => ({
    at: new Date(Date.parse(now) - i * 60000).toISOString(),
    ok: i < 5,
    statusCode: i < 5 ? 200 : 429,
    latencyMs: 100,
  }));
  const result = evaluateProviderHealth(events, { now });
  assert.equal(result.state, "CIRCUIT_OPEN");
});
