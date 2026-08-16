import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { capitalCommitmentFeatureVector, __capitalCommitmentFeatureHooks } from "../src/learning/capitalCommitmentFeatureExtractor.js";
import { trainCapitalCommitmentModel, predictCapitalCommitment, __capitalCommitmentModelHooks } from "../src/learning/capitalCommitmentModel.js";
import { buildCapitalConservationLedger } from "../src/engines/capitalConservationLedgerEngine.js";
import { attachCapitalArrivalIntelligence } from "../src/engines/capitalArrivalCurveEngine.js";
import { runCapitalCommitmentWalkForwardLab, __capitalCommitmentWalkForwardHooks } from "../src/learning/capitalCommitmentWalkForwardLab.js";
import { processCapitalCommitmentLearning } from "../src/learning/capitalCommitmentCoordinator.js";

const A = "0x00000000000000000000000000000000000000a1";
const B = "0x00000000000000000000000000000000000000b1";
const R = "0x00000000000000000000000000000000000000c1";
const S = "0x00000000000000000000000000000000000000d1";

function feature(i = 0, overrides = {}) {
  return {
    schemaVersion: 2,
    snapshotId: `snap-${i}`,
    chain: "base",
    walletAddress: `0x${(1000 + i).toString(16).padStart(40, "0")}`,
    featureObservedAt: new Date(Date.UTC(2026, 0, 1, i % 24)).toISOString(),
    executionReadyCapitalUsd: 100000,
    inflowSizeBucket: "100K_500K",
    fundingSourceCountBucket: "TWO",
    fundingConcentrationBucket: "DISTRIBUTED",
    stablecoinMix: "USDC",
    genericRouteKey: R,
    fundingToApprovalLatencyBucket: "2M_10M",
    nativeGasReady: true,
    newlyDiscovered: true,
    explicitDestinationAbsent: true,
    ...overrides,
  };
}

function example(i, outcomeType, hours, frac = null, overrides = {}) {
  const f = feature(i, overrides.feature || {});
  return {
    snapshotId: f.snapshotId,
    feature: f,
    outcomeType,
    destinationProjectKey: outcomeType === "TARGET_BUY" ? "base:token-a" : null,
    outcomeObservedAt: new Date(Date.parse(f.featureObservedAt) + hours * 3600000).toISOString(),
    timeToOutcomeHours: hours,
    deployedUsd: frac === null ? null : f.executionReadyCapitalUsd * frac,
    deploymentFraction: frac,
    episodeKey: `${f.chain}|${f.walletAddress}|${f.featureObservedAt}`,
  };
}

test("funding source fingerprint is deterministic and address-order independent", () => {
  const one = __capitalCommitmentFeatureHooks.fundingSourceFingerprint({ fundingSources: [{ address: A }, { address: B }] });
  const two = __capitalCommitmentFeatureHooks.fundingSourceFingerprint({ fundingSources: [{ address: B }, { address: A }] });
  assert.equal(one, two);
  assert.ok(one);
});

test("commitment feature keeps pre-destination capital and correlation evidence", () => {
  const row = capitalCommitmentFeatureVector({
    address: A, executionPrepared: true, executionReadyCapitalUsd: 50000, nativeGasReady: true,
    fundingSources: [{ address: S, amountUsd: 50000 }],
    approvalEvents: [{ spender: R, targetCandidateKeys: [], eventTime: "2026-01-01T00:05:00Z" }],
    fundingEvents: [{ eventTime: "2026-01-01T00:00:00Z" }],
  }, { chain: "base", observedAt: "2026-01-01T00:10:00Z" });
  assert.equal(row.executionReadyCapitalUsd, 50000);
  assert.equal(row.explicitDestinationAbsent, true);
  assert.ok(row.fundingSourceFingerprint);
});

test("model abstains with thin history", () => {
  const model = trainCapitalCommitmentModel([example(1, "TARGET_BUY", 1, 0.5)]);
  const p = predictCapitalCommitment(feature(99), model);
  assert.equal(p.state, "ABSTAIN_INSUFFICIENT_COMMITMENT_HISTORY");
});

test("competing-risk model learns deployment probability by horizon", () => {
  const rows = [];
  for (let i = 0; i < 20; i++) rows.push(example(i, i < 12 ? "TARGET_BUY" : "NO_DEPLOYMENT_EXPIRED", i < 12 ? 2 : 72, i < 12 ? 0.5 : 0));
  const model = trainCapitalCommitmentModel(rows);
  const p = predictCapitalCommitment(feature(200), model, { minSupport: 10, minUniqueWallets: 8, minWilsonLower: 0.1, minFractionSupport: 5 });
  assert.equal(p.state, "COMMITMENT_CURVE_SHADOW");
  const six = p.arrivalCurve.find((r) => r.horizonHours === 6);
  assert.equal(six.deploymentProbabilityPct, 60);
  assert.equal(p.expectedDeploymentFraction, 0.5);
});

test("external exits reduce deployment probability rather than count as buys", () => {
  const rows = [];
  for (let i = 0; i < 10; i++) rows.push(example(i, "TARGET_BUY", 2, 0.4));
  for (let i = 10; i < 20; i++) rows.push(example(i, "CEX_DEPOSIT", 1, null));
  const stats = __capitalCommitmentModelHooks.groupStats({ examples: rows });
  assert.equal(stats.byHorizon["6"].deploymentProbability, 0.5);
});

test("deployment fraction uses robust median", () => {
  assert.equal(__capitalCommitmentModelHooks.median([0.1, 0.4, 0.5, 0.9, 1]), 0.5);
});

test("capital ledger conserves every observed dollar", () => {
  const c = [{ feature: feature(1), commitment: { arrivalCurve: [{ horizonHours: 6, deploymentProbabilityPct: 50 }], expectedDeploymentFraction: 0.5 } }];
  const p = [{ feature: feature(1), prediction: { state: "PREDICTED_DESTINATION_SHADOW", probabilities: [{ projectKey: "base:token-a", probability: 0.6 }, { projectKey: "base:token-b", probability: 0.2 }] } }];
  const ledger = buildCapitalConservationLedger(c, p, { horizonHours: 6 });
  assert.equal(ledger.conservationSatisfied, true);
  assert.equal(ledger.candidateExpectedArrivalUsd["base:token-a"], 15000);
  assert.ok(ledger.probabilityMassCapitalUsd <= ledger.observedCapitalUsd);
});

test("shared funding fingerprint applies correlation discount without identity claim", () => {
  const shared = "same-source-hash";
  const c = [1, 2, 3, 4].map((i) => ({ feature: feature(i, { fundingSourceFingerprint: shared }), commitment: { arrivalCurve: [{ horizonHours: 6, deploymentProbabilityPct: 100 }], expectedDeploymentFraction: 1 } }));
  const p = c.map((row) => ({ feature: row.feature, prediction: { state: "PREDICTED_DESTINATION_SHADOW", probabilities: [{ projectKey: "base:token-a", probability: 1 }] } }));
  const ledger = buildCapitalConservationLedger(c, p, { horizonHours: 6 });
  assert.equal(ledger.wallets[0].fundingCorrelationGroupSize, 4);
  assert.equal(ledger.wallets[0].correlationWeight, 0.5);
  assert.equal(ledger.candidateExpectedArrivalUsd["base:token-a"], 200000);
});

test("missing deployment fraction produces no invented arriving capital", () => {
  const c = [{ feature: feature(1), commitment: { arrivalCurve: [{ horizonHours: 6, deploymentProbabilityPct: 80 }], expectedDeploymentFraction: null } }];
  const p = [{ feature: feature(1), prediction: { state: "PREDICTED_DESTINATION_SHADOW", probabilities: [{ projectKey: "base:token-a", probability: 0.8 }] } }];
  const ledger = buildCapitalConservationLedger(c, p, { horizonHours: 6 });
  assert.equal(ledger.candidateExpectedArrivalUsd["base:token-a"], 0);
  assert.equal(ledger.wallets[0].independenceAdjustedDeployableUsd, 0);
});

test("capital arrival intelligence remains shadow-only even when expected arrival exceeds ignition", () => {
  const projects = [{ canonicalProjectId: "base:token-a", symbol: "AAA", ignitionTwin: { ignitionCapitalUsd: 40000 }, supplyLineageIntelligence: { vacuumIntegrityState: "VACUUM_INTEGRITY_SUPPORTED" } }];
  const ledgers = { 6: { candidateExpectedArrivalUsd: { "base:token-a": 60000 } } };
  const out = attachCapitalArrivalIntelligence(projects, ledgers)[0];
  assert.equal(out.capitalArrivalIntelligence.state, "COMMITTED_LOADED_VACUUM_SHADOW");
  assert.equal(out.capitalArrivalIntelligence.loadedVacuumInfluence, false);
  assert.equal(out.capitalArrivalIntelligence.rankingInfluence, false);
});

test("arrival state does not claim committed vacuum when supply vacuum is unsupported", () => {
  const out = attachCapitalArrivalIntelligence([{ canonicalProjectId: "base:token-a", ignitionTwin: { ignitionCapitalUsd: 40000 } }], { 6: { candidateExpectedArrivalUsd: { "base:token-a": 60000 } } })[0];
  assert.equal(out.capitalArrivalIntelligence.state, "ARRIVAL_PRESSURE_BUILDING_SHADOW");
});

test("Brier and calibration metrics behave on perfect predictions", () => {
  assert.equal(__capitalCommitmentWalkForwardHooks.brier([{ p: 1, y: 1 }, { p: 0, y: 0 }]), 0);
  assert.equal(__capitalCommitmentWalkForwardHooks.calibrationError([{ p: 1, y: 1 }, { p: 0, y: 0 }]), 0);
});

test("walk-forward lab never auto-promotes on tiny samples", () => {
  const rows = Array.from({ length: 12 }, (_, i) => example(i, i % 2 ? "TARGET_BUY" : "NO_DEPLOYMENT_EXPIRED", i % 2 ? 2 : 72, i % 2 ? 0.5 : 0));
  const lab = runCapitalCommitmentWalkForwardLab(rows, { minPredictions: 50, minSupport: 4, minUniqueWallets: 3, minWilsonLower: 0 });
  assert.equal(lab.promotionState, "SHADOW_MODE");
});

test("coordinator cold start abstains rather than inventing capital", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "commitment-v10-"));
  const cwd = process.cwd();
  process.chdir(tmp);
  try {
    const radar = { chains: [{ chain: "base", observedAt: "2026-01-01T00:10:00Z", wallets: [{ address: A, executionPrepared: true, executionReadyCapitalUsd: 50000, nativeGasReady: true, fundingSources: [{ address: S, amountUsd: 50000 }], approvalEvents: [{ spender: R, targetCandidateKeys: [], eventTime: "2026-01-01T00:05:00Z" }], fundingEvents: [{ eventTime: "2026-01-01T00:00:00Z" }] }] }] };
    const result = processCapitalCommitmentLearning([{ canonicalProjectId: "base:token-a" }], radar, {}, { persist: false, writeReport: false, examples: [] });
    assert.equal(result.status, "INSUFFICIENT_COMMITMENT_HISTORY");
    assert.equal(result.projects[0].capitalArrivalIntelligence.state, "NO_CALIBRATED_ARRIVAL_EVIDENCE");
  } finally { process.chdir(cwd); fs.rmSync(tmp, { recursive: true, force: true }); }
});

test("conservation ledger leaves ambiguous path capital unassigned", () => {
  const c = [{ feature: feature(1), commitment: { arrivalCurve: [{ horizonHours: 6, deploymentProbabilityPct: 50 }], expectedDeploymentFraction: 0.5 } }];
  const p = [{ feature: feature(1), prediction: { state: "ABSTAIN_AMBIGUOUS", probabilities: [] } }];
  const ledger = buildCapitalConservationLedger(c, p, { horizonHours: 6 });
  assert.equal(Object.keys(ledger.candidateExpectedArrivalUsd).length, 0);
  assert.equal(ledger.wallets[0].outsideOrUnassignedUsd, 25000);
});

test("Wilson lower bound remains conservative for small samples", () => {
  const lower = __capitalCommitmentModelHooks.wilsonLower(4, 5);
  assert.ok(lower < 0.8 && lower > 0.2);
});
