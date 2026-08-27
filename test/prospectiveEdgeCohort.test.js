import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  appendProspectiveEdgeCohorts,
  buildProspectiveStrategyFingerprint,
  freezeProspectiveEdgeCohort,
  loadProspectiveEdgeCohorts,
  prospectiveControlDistance,
  sealProspectiveEdgeEpisode,
} from "../src/production/prospectiveEdgeCohortLedger.js";
import {
  gradeProspectiveEdgeCohorts,
  resolveProspectiveEpisodeOutcome,
} from "../src/production/prospectiveEdgeCohortGrader.js";
import { stableHash } from "../src/production/productionMath.js";
import { mergeProductionShadowSourceCandidates } from "../src/ops/runProductionShadowCycle.js";
import { buildExactMarketObservation } from "../src/production/exactMarketObservationLedger.js";

function address(value) {
  return `0x${Number(value).toString(16).padStart(40, "0")}`;
}

function candidate(index, overrides = {}) {
  return {
    chain: "base",
    tokenAddress: address(index),
    poolAddress: address(index + 100_000),
    symbol: `T${index}`,
    priceUsd: 1,
    marketCapUsd: 10_000_000,
    liquidityUsd: 500_000,
    volume24hUsd: 1_000_000,
    evidenceCoveragePct: 80,
    riskScore: 20,
    priceChange24hPct: 3,
    roundTripExecutionCostBps: 100,
    executionReferenceSizeUsd: 500,
    executionCostProvenance: "SYNTHETIC_FROZEN_ESTIMATE",
    ...overrides,
  };
}

function freezeOptions(overrides = {}) {
  return {
    now: "2026-01-01T00:10:00.000Z",
    sourceObservedAt: "2026-01-01T00:00:00.000Z",
    existingEpisodes: [],
    maximumSourceAgeMinutes: 30,
    maxControls: 2,
    codeCommitSha: "0123456789abcdef0123456789abcdef01234567",
    ...overrides,
  };
}

function pairedEvidence({
  strategyFingerprint = "strategy-a",
  strategyVersion = "strategy-a-v1",
  startIndex = 1,
  cohortCount = 36,
  pairsPerCohort = 7,
  treatmentMultiplier = 1.41,
  controlMultiplier = 1.06,
  startDay = 1,
  costBps = 100,
  costReferenceSizeUsd = 500,
  costProvenance = "SYNTHETIC_FROZEN_ESTIMATE",
} = {}) {
  const strategy = buildProspectiveStrategyFingerprint({
    strategyVersion,
    codeCommitSha: "0123456789abcdef0123456789abcdef01234567",
    configFingerprint: strategyFingerprint,
    maximumSelections: cohortCount * pairsPerCohort,
    maxControls: 1,
    maximumSourceAgeMinutes: 90,
    requireRowSourceObservedAt: true,
    evaluationPolicy: {
      primaryHorizonHours: 24,
      outcomeToleranceHours: 1,
      targetReturnPct: 25,
      catastrophicReturnPct: -50,
      conservativeMissingCostBps: 200,
      minimumResolvedPairs: 6,
      minimumUniqueProjects: 6,
      minimumCohorts: 3,
      replicationWindowDays: 1,
      minimumReplicationWindows: 3,
      minimumPairsPerReplicationWindow: 2,
      minimumPairCaptureRate: 0.95,
      minimumEpisodeCaptureRate: 0.95,
      minimumExplicitExecutionCostCoverage: 0.8,
      maximumP90MatchDistance: 0.5,
      minimumReturnEdgePct: 3,
      minimumHitRateEdge: 0.03,
      maximumCatastropheDelta: 0.02,
      bootstrapIterations: 1000,
      bootstrapSeed: 81073,
    },
  });
  const actualStrategyFingerprint = strategy.fingerprint;
  const episodes = [];
  const observations = [];
  let cursor = startIndex;
  for (let cohortIndex = 0; cohortIndex < cohortCount; cohortIndex += 1) {
    const decisionAt = new Date(Date.UTC(2026, 0, startDay + cohortIndex * 2)).toISOString();
    const outcomeAt = new Date(Date.parse(decisionAt) + 24 * 3_600_000).toISOString();
    const runId = `${strategyFingerprint}-run-${cohortIndex}`;
    const cohortId = stableHash([
      "PROSPECTIVE_EDGE_COHORT_V1",
      decisionAt,
      actualStrategyFingerprint,
      runId,
    ].join("|")).slice(0, 40);
    for (let pairIndex = 0; pairIndex < pairsPerCohort; pairIndex += 1) {
      const treatment = candidate(cursor);
      const control = candidate(cursor + 50_000);
      const treatmentRouteKey = `${treatment.chain}:${treatment.tokenAddress}:${treatment.poolAddress}`;
      const controlRouteKey = `${control.chain}:${control.tokenAddress}:${control.poolAddress}`;
      const treatmentEpisodeId = stableHash([
        "PROSPECTIVE_EDGE_COHORT_MEMBER_V1",
        cohortId,
        "TREATMENT",
        treatmentRouteKey,
        "ROOT",
      ].join("|")).slice(0, 40);
      const controlEpisodeId = stableHash([
        "PROSPECTIVE_EDGE_COHORT_MEMBER_V1",
        cohortId,
        "CONTROL_MATCHED",
        controlRouteKey,
        treatmentEpisodeId,
      ].join("|")).slice(0, 40);
      const sourceObservedAt = new Date(Date.parse(decisionAt) - 10 * 60_000).toISOString();
      episodes.push(sealProspectiveEdgeEpisode({
        schemaVersion: 1,
        experimentDesign: "FROZEN_PROSPECTIVE_MATCHED_COHORT_V1",
        cohortId,
        episodeId: treatmentEpisodeId,
        role: "TREATMENT",
        parentTreatmentEpisodeId: null,
        decisionAt,
        sourceObservedAt,
        sourceAgeMinutesAtDecision: 10,
        runId,
        codeCommitSha: strategy.definition.codeCommitSha,
        strategyVersion,
        strategyFingerprint: actualStrategyFingerprint,
        strategyDefinition: strategy.definition,
        chain: treatment.chain,
        tokenAddress: treatment.tokenAddress,
        poolAddress: treatment.poolAddress,
        identityKey: `${treatment.chain}:${treatment.tokenAddress}`,
        routeKey: treatmentRouteKey,
        signalPriceUsd: 1,
        frozenRoundTripExecutionCostBps: costBps,
        frozenExecutionReferenceSizeUsd: costReferenceSizeUsd,
        frozenExecutionCostProvenance: costProvenance,
        outcomeHorizonsHours: [24, 168],
        exactIdentityVerified: true,
        controlsFrozenBeforeOutcomes: true,
        outcomeKnownAtFreeze: false,
        shadowOnly: true,
        productionInfluence: false,
        automaticTrading: false,
        automaticPromotion: false,
      }));
      episodes.push(sealProspectiveEdgeEpisode({
        schemaVersion: 1,
        experimentDesign: "FROZEN_PROSPECTIVE_MATCHED_COHORT_V1",
        cohortId,
        episodeId: controlEpisodeId,
        role: "CONTROL_MATCHED",
        parentTreatmentEpisodeId: treatmentEpisodeId,
        decisionAt,
        sourceObservedAt,
        sourceAgeMinutesAtDecision: 10,
        runId,
        codeCommitSha: strategy.definition.codeCommitSha,
        strategyVersion,
        strategyFingerprint: actualStrategyFingerprint,
        strategyDefinition: strategy.definition,
        chain: control.chain,
        tokenAddress: control.tokenAddress,
        poolAddress: control.poolAddress,
        identityKey: `${control.chain}:${control.tokenAddress}`,
        routeKey: controlRouteKey,
        signalPriceUsd: 1,
        frozenRoundTripExecutionCostBps: costBps,
        frozenExecutionReferenceSizeUsd: costReferenceSizeUsd,
        frozenExecutionCostProvenance: costProvenance,
        matchDistance: 0.1,
        comparableMatchFeatures: 6,
        outcomeHorizonsHours: [24, 168],
        exactIdentityVerified: true,
        controlsFrozenBeforeOutcomes: true,
        outcomeKnownAtFreeze: false,
        shadowOnly: true,
        productionInfluence: false,
        automaticTrading: false,
        automaticPromotion: false,
      }));
      observations.push({
        chain: treatment.chain,
        tokenAddress: treatment.tokenAddress,
        poolAddress: treatment.poolAddress,
        observedAt: outcomeAt,
        priceUsd: treatmentMultiplier,
      });
      observations.push({
        chain: control.chain,
        tokenAddress: control.tokenAddress,
        poolAddress: control.poolAddress,
        observedAt: outcomeAt,
        priceUsd: controlMultiplier,
      });
      cursor += 1;
    }
  }
  return { episodes, observations, strategyFingerprint: actualStrategyFingerprint };
}

const smallVerificationPolicy = {
  asOf: "2026-05-01T00:00:00.000Z",
  horizonHours: 24,
  toleranceHours: 1,
  minimumResolvedPairs: 6,
  minimumUniqueProjects: 6,
  minimumCohorts: 3,
  minimumReplicationWindows: 3,
  minimumPairsPerReplicationWindow: 2,
  replicationWindowDays: 1,
  minimumPairCaptureRate: 0.95,
  minimumEpisodeCaptureRate: 0.95,
  minimumExplicitExecutionCostCoverage: 0.8,
  maximumP90MatchDistance: 0.5,
  minimumReturnEdgePct: 3,
  minimumHitRateEdge: 0.03,
  maximumCatastropheDelta: 0.02,
  iterations: 500,
};

test("prospective cohort capture rejects future and stale source evidence", () => {
  const selections = [candidate(1)];
  const universe = [candidate(2)];
  const future = freezeProspectiveEdgeCohort(selections, universe, freezeOptions({
    sourceObservedAt: "2026-01-01T00:11:00.000Z",
  }));
  const stale = freezeProspectiveEdgeCohort(selections, universe, freezeOptions({
    sourceObservedAt: "2025-12-31T22:00:00.000Z",
  }));
  assert.equal(future.state, "COHORT_REJECTED_FUTURE_SOURCE");
  assert.equal(stale.state, "COHORT_REJECTED_STALE_SOURCE");
  assert.deepEqual(future.episodes, []);
  assert.deepEqual(stale.episodes, []);
});

test("production cohort capture requires fresh per-candidate market timestamps", () => {
  const missing = freezeProspectiveEdgeCohort([candidate(1)], [candidate(2)], freezeOptions({
    requireRowSourceObservedAt: true,
  }));
  assert.equal(missing.state, "NO_MATCHABLE_PROSPECTIVE_SELECTIONS");
  assert.equal(missing.audit.selectionsRejectedForCandidateSourceFreshness, 1);
  const fresh = freezeProspectiveEdgeCohort(
    [candidate(1, { sourceObservedAt: "2026-01-01T00:01:00.000Z" })],
    [candidate(2, { sourceObservedAt: "2026-01-01T00:02:00.000Z" })],
    freezeOptions({ requireRowSourceObservedAt: true }),
  );
  assert.equal(fresh.state, "PROSPECTIVE_EDGE_COHORT_FROZEN");
  assert.deepEqual(
    fresh.episodes.map((row) => row.sourceObservedAt),
    ["2026-01-01T00:01:00.000Z", "2026-01-01T00:02:00.000Z"],
  );
  const grade = gradeProspectiveEdgeCohorts(fresh.episodes, [], {
    asOf: "2026-01-01T00:10:00.000Z",
    horizonHours: 24,
  });
  assert.equal(grade.inputAudit.currentStrategyLedgerIntegrityPass, true);
});

test("control source timestamps must remain inside the frozen co-scan skew limit", () => {
  const frozen = freezeProspectiveEdgeCohort(
    [candidate(1, { sourceObservedAt: "2026-01-01T00:00:00.000Z" })],
    [candidate(2, { sourceObservedAt: "2026-01-01T00:10:00.000Z" })],
    freezeOptions({
      now: "2026-01-01T00:20:00.000Z",
      sourceObservedAt: "2026-01-01T00:00:00.000Z",
      requireRowSourceObservedAt: true,
      maximumControlSourceSkewMinutes: 5,
    }),
  );
  const grade = gradeProspectiveEdgeCohorts(frozen.episodes, [], {
    asOf: "2026-01-01T00:20:00.000Z",
    horizonHours: 24,
  });
  assert.equal(grade.inputAudit.currentStrategyLedgerIntegrityPass, false);
  assert.equal(
    grade.inputAudit.episodeIntegrityFailureCounts.CONTROL_PARENT_SOURCE_TIME_SKEW_EXCEEDED,
    1,
  );
});

test("prospective cohort capture rejects symbol-only selections and controls", () => {
  const symbolOnly = { chain: "base", symbol: "SAME", priceUsd: 1, liquidityUsd: 500_000 };
  const result = freezeProspectiveEdgeCohort([symbolOnly], [symbolOnly], freezeOptions());
  assert.equal(result.state, "NO_MATCHABLE_PROSPECTIVE_SELECTIONS");
  assert.equal(result.audit.exactSelections, 0);
  assert.deepEqual(result.episodes, []);
});

test("cohort capture attributes every control-matching rejection without weakening the match policy", () => {
  const treatment = candidate(1, { sourceObservedAt: "2026-01-01T00:00:00.000Z" });
  const differentChain = candidate(2, { chain: "ethereum", sourceObservedAt: "2026-01-01T00:00:00.000Z" });
  const insufficientFeatures = candidate(3, {
    sourceObservedAt: "2026-01-01T00:00:00.000Z",
    marketCapUsd: null,
    liquidityUsd: null,
    volume24hUsd: null,
    evidenceCoveragePct: null,
    riskScore: null,
    priceChange24hPct: null,
  });
  const distant = candidate(4, {
    sourceObservedAt: "2026-01-01T00:00:00.000Z",
    marketCapUsd: 1e30,
    liquidityUsd: 1,
    volume24hUsd: 1,
    evidenceCoveragePct: 0,
    riskScore: 100,
    priceChange24hPct: 1000,
    narrative: "unrelated",
    sector: "unrelated",
  });
  const result = freezeProspectiveEdgeCohort(
    [treatment],
    [differentChain, insufficientFeatures, distant],
    freezeOptions({ requireRowSourceObservedAt: true }),
  );

  assert.equal(result.state, "NO_MATCHABLE_PROSPECTIVE_SELECTIONS");
  assert.equal(result.audit.treatmentsFrozen, 0);
  assert.equal(result.audit.matchingRejectionCounts.CONTROL_DIFFERENT_CHAIN, 1);
  assert.equal(result.audit.matchingRejectionCounts.INSUFFICIENT_COMPARABLE_FEATURES, 1);
  assert.equal(result.audit.matchingRejectionCounts.MATCH_DISTANCE_EXCEEDS_MAXIMUM, 1);
  assert.equal(result.audit.selectionDiagnostics[0].state, "NO_ELIGIBLE_CONTROLS");
});

test("prospective cohort capture rejects an unversioned strategy", () => {
  const priorGitHubSha = process.env.GITHUB_SHA;
  const priorEdgeCodeVersion = process.env.EDGE_CODE_VERSION;
  delete process.env.GITHUB_SHA;
  delete process.env.EDGE_CODE_VERSION;
  try {
    const result = freezeProspectiveEdgeCohort([candidate(1)], [candidate(2)], freezeOptions({
      codeCommitSha: null,
    }));
    assert.equal(result.state, "COHORT_REJECTED_UNVERSIONED_STRATEGY");
    assert.deepEqual(result.episodes, []);
  } finally {
    if (priorGitHubSha === undefined) delete process.env.GITHUB_SHA;
    else process.env.GITHUB_SHA = priorGitHubSha;
    if (priorEdgeCodeVersion === undefined) delete process.env.EDGE_CODE_VERSION;
    else process.env.EDGE_CODE_VERSION = priorEdgeCodeVersion;
  }
});

test("production shadow restores point-in-time market and execution fields before cohort capture", () => {
  const source = candidate(1, {
    priceUsd: 1.25,
    liquidityUsd: 750_000,
    roundTripExecutionCostBps: 135,
  });
  const otherPool = candidate(1, {
    poolAddress: address(999_001),
    priceUsd: 99,
    liquidityUsd: 1,
  });
  const synthesis = [{
    chain: source.chain,
    tokenAddress: source.tokenAddress,
    poolAddress: source.poolAddress,
    identityKey: `${source.chain}:${source.tokenAddress}`,
    priceUsd: 999,
    combinedResearchScore: 88,
  }];
  const [merged] = mergeProductionShadowSourceCandidates(synthesis, [otherPool, source]);
  assert.equal(merged.priceUsd, 1.25);
  assert.equal(merged.liquidityUsd, 750_000);
  assert.equal(merged.roundTripExecutionCostBps, 135);
  assert.equal(merged.executionReferenceSizeUsd, 500);
  assert.equal(merged.executionCostProvenance, "SYNTHETIC_FROZEN_ESTIMATE");
  assert.equal(merged.combinedResearchScore, 88);
});

test("controls are exact, same-chain, frozen before outcomes, and outcome fields are ignored", () => {
  const treatment = candidate(1, { realizedReturnPct: 500 });
  const controls = [
    candidate(2, { realizedReturnPct: -99 }),
    candidate(3, { chain: "ethereum", realizedReturnPct: 1000 }),
  ];
  const result = freezeProspectiveEdgeCohort([treatment], controls, freezeOptions({ maxControls: 1 }));
  assert.equal(result.state, "PROSPECTIVE_EDGE_COHORT_FROZEN");
  assert.equal(result.audit.treatmentsFrozen, 1);
  assert.equal(result.audit.controlsFrozen, 1);
  assert.equal(result.audit.outcomeFieldsReadDuringFreeze, false);
  assert.equal(result.episodes[1].chain, "base");
  assert.equal(result.episodes[1].parentTreatmentEpisodeId, result.episodes[0].episodeId);
  assert.equal("realizedReturnPct" in result.episodes[0], false);
  assert.equal("realizedReturnPct" in result.episodes[1], false);
  assert.equal(result.episodes.every((row) => row.controlsFrozenBeforeOutcomes), true);
});

test("control matching accounts for opportunity age and narrative when available", () => {
  const treatment = candidate(1, {
    narrative: "DeFi",
    pairCreatedAt: "2025-12-31T12:00:00.000Z",
  });
  const close = candidate(2, {
    narrative: "defi",
    pairCreatedAt: "2025-12-31T13:00:00.000Z",
  });
  const far = candidate(3, {
    narrative: "Gaming",
    pairCreatedAt: "2025-12-01T00:00:00.000Z",
  });
  const options = { asOf: "2026-01-01T00:00:00.000Z" };
  assert.ok(
    prospectiveControlDistance(treatment, close, options).distance <
    prospectiveControlDistance(treatment, far, options).distance
  );
});

test("strategy-scoped cooldown prevents repeated treatment capture", () => {
  const first = freezeProspectiveEdgeCohort([candidate(1)], [candidate(2)], freezeOptions());
  const second = freezeProspectiveEdgeCohort([candidate(1)], [candidate(3)], freezeOptions({
    now: "2026-01-02T00:10:00.000Z",
    sourceObservedAt: "2026-01-02T00:00:00.000Z",
    existingEpisodes: first.episodes,
  }));
  assert.equal(second.audit.cooldownSkipped, 1);
  assert.equal(second.audit.treatmentsFrozen, 0);
});

test("a prior strategy identity cannot be recycled as a later matched control", () => {
  const first = freezeProspectiveEdgeCohort([candidate(1)], [candidate(2)], freezeOptions({ maxControls: 1 }));
  const second = freezeProspectiveEdgeCohort([candidate(3)], [candidate(2), candidate(4)], freezeOptions({
    now: "2026-01-02T00:10:00.000Z",
    sourceObservedAt: "2026-01-02T00:00:00.000Z",
    existingEpisodes: first.episodes,
    maxControls: 1,
  }));
  const control = second.episodes.find((row) => row.role === "CONTROL_MATCHED");
  assert.equal(control.tokenAddress, candidate(4).tokenAddress);
  assert.equal(second.audit.priorStrategyIdentitiesExcludedFromControlPool, 2);
});

test("strategy fingerprint separates immutable code versions", () => {
  const left = buildProspectiveStrategyFingerprint({ codeCommitSha: "a".repeat(40) });
  const right = buildProspectiveStrategyFingerprint({ codeCommitSha: "b".repeat(40) });
  assert.notEqual(left.fingerprint, right.fingerprint);
});

test("prospective cohort ledger appends immutably and deduplicates episode ids", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "prospective-edge-"));
  const file = path.join(directory, "cohorts.jsonl");
  const frozen = freezeProspectiveEdgeCohort([candidate(1)], [candidate(2)], freezeOptions());
  assert.equal(appendProspectiveEdgeCohorts(frozen.episodes, { file }).saved, 2);
  assert.equal(appendProspectiveEdgeCohorts(frozen.episodes, { file }).saved, 0);
  const rejected = appendProspectiveEdgeCohorts([
    { ...frozen.episodes[0], signalPriceUsd: 999 },
  ], { file });
  assert.equal(rejected.rejectedIntegrity, 1);
  assert.equal(loadProspectiveEdgeCohorts({ file }).length, 2);
  fs.rmSync(directory, { recursive: true, force: true });
});

test("malformed prospective-ledger lines remain visible to fail-closed grading", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "prospective-edge-malformed-"));
  const file = path.join(directory, "cohorts.jsonl");
  fs.writeFileSync(file, "{not-json}\n");
  const loaded = loadProspectiveEdgeCohorts({ file });
  assert.equal(loaded.length, 1);
  assert.equal(loaded[0].__prospectiveLedgerParseFailure, true);
  const report = gradeProspectiveEdgeCohorts(loaded, [], {
    asOf: "2026-05-01T00:00:00.000Z",
  });
  assert.equal(report.edgeState, "UNVERIFIED_PROSPECTIVE_LEDGER_INTEGRITY");
  fs.rmSync(directory, { recursive: true, force: true });
});

test("outcomes require exact identity, enforce pool when known, and reject future observations", () => {
  const frozen = freezeProspectiveEdgeCohort([candidate(1)], [candidate(2)], freezeOptions({ maxControls: 1 }));
  const episode = frozen.episodes[0];
  const targetAt = "2026-01-02T00:10:00.000Z";
  const wrongPool = { ...episode, poolAddress: address(999_999), observedAt: targetAt, priceUsd: 2 };
  const symbolOnly = { chain: "base", symbol: episode.symbol, observedAt: targetAt, priceUsd: 10 };
  const exact = { ...episode, observedAt: targetAt, priceUsd: 1.5 };
  assert.equal(resolveProspectiveEpisodeOutcome(episode, [wrongPool, symbolOnly], {
    asOf: targetAt,
    horizonHours: 24,
    toleranceHours: 1,
  }), null);
  assert.equal(resolveProspectiveEpisodeOutcome(episode, [exact], {
    asOf: "2026-01-01T23:00:00.000Z",
    horizonHours: 24,
    toleranceHours: 1,
  }), null);
  const resolved = resolveProspectiveEpisodeOutcome(episode, [exact], {
    asOf: targetAt,
    horizonHours: 24,
    toleranceHours: 1,
  });
  assert.equal(Number(resolved.netReturnPct.toFixed(2)), 49);
});

test("strong net prospective separation can verify only after all forward gates pass", () => {
  const evidence = pairedEvidence();
  const report = gradeProspectiveEdgeCohorts(evidence.episodes, evidence.observations, smallVerificationPolicy);
  assert.equal(report.edgeState, "VERIFIED_FORWARD_EDGE");
  assert.equal(report.certificateEligible, true);
  assert.equal(report.current.gates.enoughData, true);
  assert.equal(report.current.capture.pass, true);
  assert.equal(report.current.executionCosts.pass, true);
  assert.equal(report.current.matchQuality.pass, true);
  assert.equal(report.current.replication.pass, true);
  assert.ok(report.current.performance.averageNetReturnEdgePct.lower > 0);
  assert.ok(report.current.performance.hitRateEdge.lower > 0);
  assert.equal(report.current.policy.evaluationPolicyFrozenBeforeOutcomes, true);
  assert.equal(report.current.sample.totalResolvedMatchedPairs, 252);
  assert.equal(report.current.sequentialInference.checkpointPairCount, 250);
  assert.equal(report.current.sequentialInference.nextCheckpointPairCount, 500);
  assert.equal(report.current.sequentialInference.strategyTrialOrdinal, 1);
  assert.equal(Number(report.current.sequentialInference.allocatedAlpha.toFixed(4)), 0.0125);
});

test("economic edge threshold must be cleared by the confidence bound, not only the point estimate", () => {
  const evidence = pairedEvidence();
  let treatmentIndex = 0;
  const noisyObservations = evidence.observations.map((row, index) => {
    if (index % 2) return row;
    const multiplier = treatmentIndex % 2 ? 0.60 : 1.60;
    treatmentIndex += 1;
    return { ...row, priceUsd: multiplier };
  });
  const report = gradeProspectiveEdgeCohorts(evidence.episodes, noisyObservations, smallVerificationPolicy);
  assert.ok(report.current.performance.averageNetReturnEdgePct.estimate >= 3);
  assert.ok(report.current.performance.averageNetReturnEdgePct.lower < 3);
  assert.equal(report.current.gates.returnVerified, false);
  assert.equal(report.certificateEligible, false);
});

test("post-checkpoint evidence can revoke but never opportunistically grant a certificate", () => {
  const evidence = pairedEvidence({
    cohortCount: 100,
    pairsPerCohort: 5,
    treatmentMultiplier: 1.31,
    controlMultiplier: 1.06,
  });
  const episodes = evidence.episodes.slice(0, -2);
  let treatmentIndex = 0;
  const observations = evidence.observations.slice(0, -2).map((row, index) => {
    if (index % 2) return row;
    const priceUsd = treatmentIndex >= 250 ? 0.01 : row.priceUsd;
    treatmentIndex += 1;
    return { ...row, priceUsd };
  });
  const report = gradeProspectiveEdgeCohorts(episodes, observations, {
    ...smallVerificationPolicy,
    asOf: "2026-09-01T00:00:00.000Z",
  });
  assert.equal(report.current.sample.totalResolvedMatchedPairs, 499);
  assert.equal(report.current.sequentialInference.checkpointPairCount, 250);
  assert.equal(report.current.gates.returnVerified, true);
  assert.equal(report.current.interimSafety.pass, false);
  assert.ok(report.current.blockers.includes("INTERIM_FORWARD_SAFETY_REVOCATION"));
  assert.equal(report.certificateEligible, false);
});

test("informative missing outcomes must pass a maximally adverse sensitivity bound", () => {
  const evidence = pairedEvidence({ cohortCount: 37, pairsPerCohort: 7 });
  const treatmentObservations = evidence.observations.filter((_, index) => index % 2 === 0);
  const omittedTreatmentRoutes = new Set(
    treatmentObservations.slice(-6).map((row) => `${row.chain}:${row.tokenAddress}:${row.poolAddress}`),
  );
  const observations = evidence.observations.filter((row) =>
    !omittedTreatmentRoutes.has(`${row.chain}:${row.tokenAddress}:${row.poolAddress}`)
  );
  const report = gradeProspectiveEdgeCohorts(evidence.episodes, observations, smallVerificationPolicy);
  assert.equal(report.current.sample.totalResolvedMatchedPairs, 253);
  assert.equal(report.current.sequentialInference.checkpointPairCount, 250);
  assert.equal(report.current.capture.pass, true);
  assert.equal(report.current.missingnessSensitivity.pass, false);
  assert.ok(report.current.blockers.includes("MISSING_OUTCOME_WORST_CASE_SENSITIVITY_FAILED"));
  assert.equal(report.certificateEligible, false);
});

test("runtime options cannot weaken the evaluation policy frozen before outcomes", () => {
  const evidence = pairedEvidence({ cohortCount: 1, pairsPerCohort: 1 });
  const report = gradeProspectiveEdgeCohorts(evidence.episodes, evidence.observations, {
    ...smallVerificationPolicy,
    minimumResolvedPairs: 1,
    minimumUniqueProjects: 1,
    minimumCohorts: 1,
    minimumReplicationWindows: 1,
    minimumPairsPerReplicationWindow: 1,
  });
  assert.equal(report.current.gates.minimumResolvedPairs, 250);
  assert.equal(report.current.gates.minimumCohorts, 30);
  assert.equal(report.current.gates.enoughData, false);
  assert.equal(report.certificateEligible, false);
});

test("missing frozen execution estimates block verification despite conservative net estimates", () => {
  const evidence = pairedEvidence({ costBps: null });
  const report = gradeProspectiveEdgeCohorts(evidence.episodes, evidence.observations, smallVerificationPolicy);
  assert.equal(report.certificateEligible, false);
  assert.equal(report.current.executionCosts.pass, false);
  assert.ok(report.current.blockers.includes("EXPLICIT_EXECUTION_COST_COVERAGE_BELOW_MINIMUM"));
});

test("execution-cost numbers without a frozen notional and provenance are not explicit evidence", () => {
  const evidence = pairedEvidence({ costReferenceSizeUsd: null, costProvenance: null });
  const report = gradeProspectiveEdgeCohorts(evidence.episodes, evidence.observations, smallVerificationPolicy);
  assert.equal(report.current.executionCosts.explicitCoverage, 0);
  assert.equal(report.current.executionCosts.pass, false);
  assert.equal(report.certificateEligible, false);
});

test("tampered current-strategy cohort evidence fails closed", () => {
  const evidence = pairedEvidence();
  const tampered = evidence.episodes.map((row, index) => index === 0
    ? { ...row, outcomeKnownAtFreeze: true }
    : row);
  const report = gradeProspectiveEdgeCohorts(tampered, evidence.observations, smallVerificationPolicy);
  assert.equal(report.edgeState, "UNVERIFIED_PROSPECTIVE_LEDGER_INTEGRITY");
  assert.equal(report.certificateEligible, false);
  assert.equal(report.inputAudit.currentStrategyLedgerIntegrityPass, false);
  assert.ok(report.current.blockers.includes("PROSPECTIVE_COHORT_LEDGER_INTEGRITY_FAILURE"));
});

test("frozen episode content hash detects price tampering", () => {
  const evidence = pairedEvidence();
  const tampered = evidence.episodes.map((row, index) => index === 0
    ? { ...row, signalPriceUsd: 0.01 }
    : row);
  const report = gradeProspectiveEdgeCohorts(tampered, evidence.observations, smallVerificationPolicy);
  assert.equal(report.edgeState, "UNVERIFIED_PROSPECTIVE_LEDGER_INTEGRITY");
  assert.equal(report.certificateEligible, false);
  assert.equal(report.inputAudit.episodeIntegrityFailureCounts.FROZEN_EPISODE_CONTENT_HASH_MISMATCH, 1);
});

test("tampered exact market observations cannot grade a certificate", () => {
  const evidence = pairedEvidence();
  const sealedObservations = evidence.observations.map((row) => buildExactMarketObservation(row, {
    source: "test",
    asOf: smallVerificationPolicy.asOf,
  }));
  const tampered = sealedObservations.map((row, index) => index === 0
    ? { ...row, priceUsd: 999 }
    : row);
  const report = gradeProspectiveEdgeCohorts(evidence.episodes, tampered, {
    ...smallVerificationPolicy,
    requireObservationLedgerIntegrity: true,
  });
  assert.equal(report.edgeState, "UNVERIFIED_MARKET_OBSERVATION_LEDGER_INTEGRITY");
  assert.equal(report.certificateEligible, false);
  assert.equal(report.inputAudit.rejectionReasons.integrityFailure, 1);
});

test("control-parent topology tampering cannot qualify a cohort", () => {
  const evidence = pairedEvidence();
  const tampered = evidence.episodes.map((row, index) => index === 1
    ? sealProspectiveEdgeEpisode({ ...row, matchDistance: 2 })
    : row);
  const report = gradeProspectiveEdgeCohorts(tampered, evidence.observations, smallVerificationPolicy);
  assert.equal(report.edgeState, "UNVERIFIED_PROSPECTIVE_LEDGER_INTEGRITY");
  assert.equal(report.certificateEligible, false);
  assert.equal(report.inputAudit.episodeIntegrityFailureCounts.CONTROL_MATCH_POLICY_VIOLATION, 1);
});

test("grader evaluates the latest strategy instead of selecting the best historical strategy", () => {
  const oldStrong = pairedEvidence({ strategyFingerprint: "old-strong", startDay: 1 });
  const latestWeak = pairedEvidence({
    strategyFingerprint: "latest-weak",
    startIndex: 80_000,
    startDay: 100,
    treatmentMultiplier: 0.91,
    controlMultiplier: 1.06,
  });
  const report = gradeProspectiveEdgeCohorts(
    [...oldStrong.episodes, ...latestWeak.episodes],
    [...oldStrong.observations, ...latestWeak.observations],
    { ...smallVerificationPolicy, asOf: "2026-08-01T00:00:00.000Z" },
  );
  assert.equal(report.latestStrategyFingerprint, latestWeak.strategyFingerprint);
  assert.equal(report.current.sequentialInference.strategyTrialOrdinal, 2);
  assert.ok(report.current.sequentialInference.allocatedAlpha < 0.005);
  assert.notEqual(report.current.edgeState, "VERIFIED_FORWARD_EDGE");
  assert.equal(report.certificateEligible, false);
  assert.equal(report.strategies[oldStrong.strategyFingerprint].edgeState, "VERIFIED_FORWARD_EDGE");
});

test("damage in an older append-only cohort blocks a newer strategy certificate", () => {
  const old = pairedEvidence({ strategyFingerprint: "old-damaged", startDay: 1 });
  const latest = pairedEvidence({ strategyFingerprint: "latest-strong", startIndex: 80_000, startDay: 100 });
  const damagedOld = old.episodes.map((row, index) => index === 0
    ? { ...row, signalPriceUsd: 0.01 }
    : row);
  const report = gradeProspectiveEdgeCohorts(
    [...damagedOld, ...latest.episodes],
    [...old.observations, ...latest.observations],
    { ...smallVerificationPolicy, asOf: "2026-08-01T00:00:00.000Z" },
  );
  assert.equal(report.latestStrategyFingerprint, latest.strategyFingerprint);
  assert.equal(report.edgeState, "UNVERIFIED_PROSPECTIVE_LEDGER_INTEGRITY");
  assert.equal(report.certificateEligible, false);
});

test("input audit separates future observations from other rejected evidence", () => {
  const evidence = pairedEvidence({ cohortCount: 1, pairsPerCohort: 1 });
  const attempted = [
    ...evidence.observations,
    { chain: "base", symbol: "NO_ID", observedAt: "2026-01-02T00:00:00.000Z", priceUsd: 2 },
    { ...candidate(999), observedAt: "2026-02-01T00:00:00.000Z", priceUsd: 2 },
  ];
  const report = gradeProspectiveEdgeCohorts(evidence.episodes, attempted, {
    ...smallVerificationPolicy,
    asOf: "2026-01-10T00:00:00.000Z",
  });
  assert.equal(report.inputAudit.rejectionReasons.invalidIdentity, 1);
  assert.equal(report.inputAudit.rejectionReasons.futureTimestamp, 1);
});
