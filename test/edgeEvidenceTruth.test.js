import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  buildCommittedLoadedVacuumObservation,
} from "../src/learning/committedLoadedVacuumObservationStore.js";
import {
  appendEdgeProductionEpisodes,
  buildFrozenEdgeProductionEpisode,
  freezeEdgeProductionEpisodes,
} from "../src/learning/edgeProductionEpisodeStore.js";
import {
  runEdgeEvidenceProbe,
  selectDueEdgeEvidence,
} from "../src/learning/edgeEvidenceProbe.js";
import { buildEdgeEvidenceHealth } from "../src/learning/edgeEvidenceHealthGovernor.js";
import {
  buildEdgeEvidenceOutcomeLab,
  resolveTerminal168Outcome,
} from "../src/learning/edgeEvidenceOutcomeLab.js";
import { buildEdgeFailureAutopsy } from "../src/learning/edgeFailureAutopsy.js";
import { buildEdgeMechanismContrast } from "../src/learning/edgeMechanismContrastLab.js";
import { buildEdgeDiscoveryLoop } from "../src/learning/edgeDiscoveryLoop.js";
import { buildEdgeResearchAutopilot } from "../src/learning/edgeResearchAutopilot.js";
import { evaluateThreeClockObservations } from "../src/learning/threeClockOutcomeLab.js";

function address(value) {
  return `0x${Number(value).toString(16).padStart(40, "0")}`;
}

function observation(index, overrides = {}) {
  return {
    schemaVersion: 4,
    signalDefinitionVersion: "V10_COMMITTED_LOADED_VACUUM_V1",
    identityKey: `base:${address(index)}`,
    exactIdentityKey: `base:${address(index)}`,
    exactIdentityVerified: true,
    observedAt: "2026-01-01T00:00:00.000Z",
    scanRunId: "scan-1",
    codeCommitSha: "abc",
    chain: "base",
    tokenAddress: address(index),
    poolAddress: address(index + 10_000),
    symbol: `T${index}`,
    priceUsd: 1,
    marketCapUsd: 10_000_000,
    liquidityUsd: 500_000,
    volume24hUsd: 1_000_000,
    productionScore: 70,
    riskScore: 20,
    capitalArrivalState: "ARRIVAL_PRESSURE_BUILDING_SHADOW",
    treatment: false,
    sixHourExpectedArrivalToIgnitionRatio: 0.8,
    supplyVacuumSupported: true,
    sellerExhaustionScore: 65,
    buyerReplacementScore: 65,
    roundTripExecutionCostBps: 100,
    ...overrides,
  };
}

function episode(index, overrides = {}) {
  const signalObservedAt = overrides.signalObservedAt || "2026-01-01T00:00:00.000Z";
  return {
    schemaVersion: 1,
    experimentVersion: "EDGE_PRODUCTION_V1",
    episodeId: overrides.episodeId || `episode-${index}`,
    role: overrides.role || "TREATMENT",
    parentTreatmentEpisodeId: overrides.parentTreatmentEpisodeId || null,
    signalObservedAt,
    frozenAt: signalObservedAt,
    chain: "base",
    tokenAddress: overrides.tokenAddress || address(index),
    poolAddress: overrides.poolAddress === undefined ? address(index + 10_000) : overrides.poolAddress,
    identityKey: `base:${overrides.tokenAddress || address(index)}`,
    routeKey: `base:${overrides.tokenAddress || address(index)}:${overrides.poolAddress || address(index + 10_000)}`,
    signalPriceUsd: 1,
    frozenRoundTripExecutionCostBps: overrides.frozenRoundTripExecutionCostBps === undefined ? 100 : overrides.frozenRoundTripExecutionCostBps,
    frozenFeatures: {
      sixHourExpectedArrivalToIgnitionRatio: 1.2,
      supplyVacuumSupported: true,
      sellerExhaustionScore: 70,
      buyerReplacementScore: 70,
      ...overrides.frozenFeatures,
    },
    outcomeHorizonsHours: [6, 24, 72, 168],
    shadowOnly: true,
    rankingInfluence: false,
  };
}

function exactOutcome(row, horizonHours, priceUsd, observedAt) {
  return {
    observationId: `${row.episodeId}:${horizonHours}h`,
    episodeId: row.episodeId,
    role: row.role,
    parentTreatmentEpisodeId: row.parentTreatmentEpisodeId,
    chain: row.chain,
    tokenAddress: row.tokenAddress,
    poolAddress: row.poolAddress,
    horizonHours,
    targetAt: new Date(Date.parse(row.signalObservedAt) + horizonHours * 3_600_000).toISOString(),
    observedAt: observedAt || new Date(Date.parse(row.signalObservedAt) + horizonHours * 3_600_000).toISOString(),
    priceUsd,
    provenance: {
      source: "dexscreener",
      verificationStatus: "EXACT_BASE_TOKEN_POOL_MATCH",
      confidence: 1,
    },
  };
}

test("committed observation freezes explicit exact token and pool identity", () => {
  const row = buildCommittedLoadedVacuumObservation({
    chain: "base",
    tokenAddress: address(1).toUpperCase().replace("0X", "0x"),
    poolAddress: address(2),
    priceUsd: 1,
  }, "2026-01-01T00:00:00.000Z");
  assert.equal(row.schemaVersion, 3);
  assert.equal(row.exactIdentitySchemaVersion, 1);
  assert.equal(row.tokenAddress, address(1));
  assert.equal(row.poolAddress, address(2));
  assert.equal(row.exactIdentityVerified, true);
});

test("symbol-only observation never becomes exact identity evidence", () => {
  const row = buildCommittedLoadedVacuumObservation({ chain: "base", symbol: "EDGE", priceUsd: 1 });
  assert.equal(row.exactIdentityKey, null);
  assert.equal(row.exactIdentityVerified, false);
  assert.equal(row.tokenAddress, null);
});

test("episode freezer captures treatment and matched control without ranking influence", () => {
  const rows = [
    observation(1, { treatment: true, capitalArrivalState: "COMMITTED_LOADED_VACUUM_SHADOW" }),
    observation(2),
  ];
  const frozen = freezeEdgeProductionEpisodes(rows, { existingEpisodes: [], maxControls: 1 });
  assert.equal(frozen.length, 2);
  assert.equal(frozen[0].role, "TREATMENT");
  assert.equal(frozen[1].role, "CONTROL_MATCHED");
  assert.equal(frozen[1].parentTreatmentEpisodeId, frozen[0].episodeId);
  assert.equal(frozen[0].rankingInfluence, false);
});

test("episode freezer rejects invalid or non-Base identity", () => {
  assert.equal(buildFrozenEdgeProductionEpisode(observation(1, { chain: "ethereum" }), { role: "TREATMENT" }), null);
  assert.equal(buildFrozenEdgeProductionEpisode(observation(1, { tokenAddress: "EDGE" }), { role: "TREATMENT" }), null);
});

test("frozen episode preserves exact pool identity when present", () => {
  const frozen = buildFrozenEdgeProductionEpisode(observation(1, { treatment: true }), { role: "TREATMENT" });
  assert.equal(frozen.poolAddress, address(10_001));
  assert.equal(frozen.identityVerificationStatus, "EXACT_BASE_TOKEN_POOL_FROZEN");
});

test("episode store is immutable by deterministic episode id", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "edge-production-"));
  const file = path.join(directory, "episodes.jsonl");
  const frozen = buildFrozenEdgeProductionEpisode(observation(1, { treatment: true }), { role: "TREATMENT" });
  assert.equal(appendEdgeProductionEpisodes([frozen], { file }).saved, 1);
  assert.equal(appendEdgeProductionEpisodes([frozen], { file }).saved, 0);
  fs.rmSync(directory, { recursive: true, force: true });
});

test("probe candidate selection reads frozen episodes instead of scan memory", () => {
  const due = selectDueEdgeEvidence([episode(1)], [], { now: "2026-01-01T07:00:00.000Z" });
  assert.equal(due.length, 1);
  assert.equal(due[0].dueEpisodes.length, 1);
  assert.equal(due[0].dueEpisodes[0].horizonHours, 6);
});

test("probe saves exact frozen pool observation with provenance", async () => {
  let saved = [];
  let exactSaved = [];
  const row = episode(1);
  const report = await runEdgeEvidenceProbe({
    now: "2026-01-01T07:00:00.000Z",
    episodes: [row],
    outcomes: [],
    providers: {
      getPairByAddress: async () => ({ pairs: [{
        chainId: "base",
        pairAddress: row.poolAddress,
        baseToken: { address: row.tokenAddress, symbol: "EDGE" },
        quoteToken: { address: address(99), symbol: "USDC" },
        priceUsd: "1.10",
        liquidity: { usd: 100_000 },
      }] }),
      getTokenPairs: async () => [],
    },
    saveOutcomes: (outcomes) => { saved = outcomes; return { saved: outcomes.length }; },
    saveExactObservations: (outcomes) => {
      exactSaved = outcomes;
      return { saved: outcomes.length, rejected: 0 };
    },
    writeReport: false,
  });
  assert.equal(report.state, "EDGE_EVIDENCE_PROBE_PASS");
  assert.equal(saved[0].poolAddress, row.poolAddress);
  assert.equal(saved[0].provenance.verificationStatus, "EXACT_BASE_TOKEN_POOL_MATCH");
  assert.equal(saved[0].scoringOrSelectionAllowed, false);
  assert.equal(report.exactLedgerObservationsSaved, 1);
  assert.equal(exactSaved.length, 1);
});

test("probe rejects a mismatched provider token for the frozen pool", async () => {
  const row = episode(1);
  const report = await runEdgeEvidenceProbe({
    now: "2026-01-01T07:00:00.000Z",
    episodes: [row], outcomes: [], writeReport: false,
    providers: {
      getPairByAddress: async () => ({ pairs: [{
        chainId: "base", pairAddress: row.poolAddress,
        baseToken: { address: address(999), symbol: "WRONG" }, priceUsd: "1.1",
      }] }),
      getTokenPairs: async () => [],
    },
    saveOutcomes: () => assert.fail("mismatched identity must not persist"),
  });
  assert.equal(report.state, "EDGE_EVIDENCE_PROVIDER_DEGRADED");
  assert.equal(report.observationsSaved, 0);
});

test("probe enforces request budget across frozen routes", async () => {
  let requests = 0;
  const rows = [episode(1), episode(2)];
  const report = await runEdgeEvidenceProbe({
    now: "2026-01-01T07:00:00.000Z",
    episodes: rows, outcomes: [], maxRequests: 1, writeReport: false,
    providers: {
      getPairByAddress: async (_chain, pool) => {
        requests += 1;
        const row = rows.find((item) => item.poolAddress === pool);
        return [{ chain: "base", tokenAddress: row.tokenAddress, poolAddress: row.poolAddress, priceUsd: 1.1 }];
      },
      getTokenPairs: async () => [],
    },
    saveOutcomes: (outcomes) => ({ saved: outcomes.length }),
    saveExactObservations: (outcomes) => ({ saved: outcomes.length, rejected: 0 }),
  });
  assert.equal(requests, 1);
  assert.equal(report.providerRequestsUsed, 1);
  assert.equal(report.dueRoutes, 2);
});

test("expired missing observations remain UNKNOWN and can block autopilot coverage", () => {
  const health = buildEdgeEvidenceHealth([episode(1), episode(2)], [], { now: "2026-01-20T00:00:00.000Z" });
  assert.equal(health.state, "AUTOPILOT_EVIDENCE_COVERAGE_BLOCKED");
  assert.equal(health.resolved, 0);
  assert.ok(health.missedUnknown > 0);
});

test("currently due observations are pending and excluded from the mature denominator", () => {
  const health = buildEdgeEvidenceHealth([episode(1)], [], { now: "2026-01-01T06:30:00.000Z" });
  assert.equal(health.state, "AUTOPILOT_EVIDENCE_WARMING");
  assert.equal(health.matureExpected, 0);
  assert.equal(health.byHorizon["6h"].pending, 1);
});

test("168h no-hit remains UNKNOWN when terminal observation is missing", () => {
  const row = episode(1);
  const result = resolveTerminal168Outcome(row, [exactOutcome(row, 6, 1.05)]);
  assert.equal(result.plus25BeforeMinus15, null);
  assert.equal(result.state, "UNKNOWN_TERMINAL_168H_OBSERVATION_MISSING");
});

test("terminal 168h observation can resolve an observed no-hit", () => {
  const row = episode(1);
  const result = resolveTerminal168Outcome(row, [exactOutcome(row, 168, 1.05)]);
  assert.equal(result.plus25BeforeMinus15, false);
  assert.equal(result.state, "NO_HIT_WITH_TERMINAL_168H_OBSERVATION");
});

test("actual downside threshold observation resolves failure without terminal imputation", () => {
  const row = episode(1);
  const result = resolveTerminal168Outcome(row, [exactOutcome(row, 6, 0.8)]);
  assert.equal(result.plus25BeforeMinus15, false);
  assert.equal(result.terminal168Observed, false);
  assert.equal(result.state, "DOWNSIDE_HIT_FIRST");
});

test("unknown frozen execution cost never becomes zero-cost net return", () => {
  const row = episode(1, { frozenRoundTripExecutionCostBps: null });
  const lab = buildEdgeEvidenceOutcomeLab([row], [exactOutcome(row, 168, 1.2)], { state: "AUTOPILOT_EVIDENCE_HEALTHY" }, { writeReport: false });
  assert.equal(lab.records[0].outcomes["168h"].state, "GROSS_OUTCOME_ONLY_EXECUTION_COST_UNKNOWN");
  assert.equal(lab.records[0].outcomes["168h"].netReturnPct, null);
});

test("net outcome subtracts execution cost frozen before the outcome", () => {
  const row = episode(1, { frozenRoundTripExecutionCostBps: 100 });
  const lab = buildEdgeEvidenceOutcomeLab([row], [exactOutcome(row, 168, 1.2)], { state: "AUTOPILOT_EVIDENCE_HEALTHY" }, { writeReport: false });
  assert.equal(lab.records[0].outcomes["168h"].grossReturnPct, 20);
  assert.equal(lab.records[0].outcomes["168h"].netReturnPct, 19);
});

test("small matched sample remains unverified", () => {
  const treated = episode(1);
  const control = episode(2, { role: "CONTROL_MATCHED", parentTreatmentEpisodeId: treated.episodeId });
  const outcomes = [exactOutcome(treated, 168, 1.2), exactOutcome(control, 168, 1.0)];
  const lab = buildEdgeEvidenceOutcomeLab([treated, control], outcomes, { state: "AUTOPILOT_EVIDENCE_HEALTHY" }, { writeReport: false });
  assert.equal(lab.verification.state, "EDGE_NOT_YET_VERIFIED");
  assert.ok(lab.verification.blockers.includes("NEED_MORE_MATCHED_168H_PAIRS"));
});

test("mature positive matched net evidence reaches verified edge state", () => {
  const episodes = [];
  const outcomes = [];
  for (let index = 0; index < 30; index += 1) {
    const signalObservedAt = new Date(Date.UTC(2025, 0, 1 + index * 2)).toISOString();
    const treatment = episode(index + 1, {
      episodeId: `treatment-${index}`,
      tokenAddress: address((index % 20) + 1),
      poolAddress: address((index % 20) + 10_001),
      signalObservedAt,
    });
    const control = episode(index + 101, {
      episodeId: `control-${index}`,
      role: "CONTROL_MATCHED",
      parentTreatmentEpisodeId: treatment.episodeId,
      signalObservedAt,
    });
    episodes.push(treatment, control);
    outcomes.push(exactOutcome(treatment, 168, 1.11), exactOutcome(control, 168, 1.0));
  }
  const lab = buildEdgeEvidenceOutcomeLab(episodes, outcomes, { state: "AUTOPILOT_EVIDENCE_HEALTHY" }, { writeReport: false, bootstrapReplicates: 500 });
  assert.equal(lab.verification.state, "VERIFIED_MATCHED_NET_EDGE");
  assert.ok(lab.byHorizon["168h"].clusteredBootstrap95.lower95Pct > 0);
  assert.equal(lab.rankingInfluence, false);
});

test("unhealthy collection overrides statistically positive evidence", () => {
  const lab = buildEdgeEvidenceOutcomeLab([], [], { state: "AUTOPILOT_EVIDENCE_COVERAGE_BLOCKED" }, { writeReport: false });
  assert.equal(lab.state, "AUTOPILOT_EVIDENCE_COVERAGE_BLOCKED");
  assert.ok(lab.verification.blockers.includes("EVIDENCE_COVERAGE_BLOCKED"));
});

test("failure autopsy leaves unobserved mechanisms unresolved", () => {
  const row = episode(1, { frozenFeatures: {
    sixHourExpectedArrivalToIgnitionRatio: null,
    supplyVacuumSupported: null,
    sellerExhaustionScore: null,
    buyerReplacementScore: null,
  } });
  const outcomeLab = buildEdgeEvidenceOutcomeLab([row], [exactOutcome(row, 168, 0.9)], { state: "AUTOPILOT_EVIDENCE_HEALTHY" }, { writeReport: false });
  const autopsy = buildEdgeFailureAutopsy(outcomeLab, { writeReport: false });
  assert.equal(autopsy.records[0].primaryFailure, "UNKNOWN_OR_UNOBSERVED");
});

test("mechanism contrast cannot mature without both sides", () => {
  const row = episode(1);
  const outcomeLab = buildEdgeEvidenceOutcomeLab([row], [exactOutcome(row, 168, 1.1)], { state: "AUTOPILOT_EVIDENCE_HEALTHY" }, { writeReport: false });
  const contrast = buildEdgeMechanismContrast(outcomeLab, { writeReport: false });
  assert.equal(contrast.state, "MECHANISM_CONTRASTS_COLLECTING");
});

test("coverage failure directs discovery toward evidence restoration", () => {
  const discovery = buildEdgeDiscoveryLoop({
    health: { state: "AUTOPILOT_EVIDENCE_COVERAGE_BLOCKED" },
    outcomeLab: {}, autopsy: {}, contrast: {},
  }, { writeReport: false });
  assert.equal(discovery.nextExperiment.mechanism, "EVIDENCE_COVERAGE");
  assert.equal(discovery.hypothesisChanged, false);
});

test("autopilot blocks on evidence health and cannot force picks", () => {
  const autopilot = buildEdgeResearchAutopilot({
    health: { state: "AUTOPILOT_EVIDENCE_COVERAGE_BLOCKED" },
    outcomeLab: { verification: { state: "VERIFIED_MATCHED_NET_EDGE" } },
    discovery: {},
  }, { writeReport: false });
  assert.equal(autopilot.state, "AUTOPILOT_EVIDENCE_COVERAGE_BLOCKED");
  assert.equal(autopilot.picksForced, false);
  assert.equal(autopilot.verifiedEdge, null);
});

test("three-clock 168h lab does not treat an early partial path as terminal no-hit", () => {
  const observations = [
    { identityKey: "base:edge", chain: "base", observedAt: "2026-01-01T00:00:00.000Z", priceUsd: 1, qualifying: true },
    { identityKey: "base:edge", chain: "base", observedAt: "2026-01-01T06:00:00.000Z", priceUsd: 1.05, qualifying: false },
  ];
  const report = evaluateThreeClockObservations(observations);
  assert.equal(report.horizonSummary[168].resolvedEpisodes, 0);
  assert.equal(report.horizonSummary[168].plus25BeforeMinus15Rate, null);
});

test("hourly workflow serializes with production scan and runs the full truth cycle", () => {
  const workflow = fs.readFileSync(".github/workflows/edge-evidence-truth.yml", "utf8");
  const legacyEdgeWorkflow = fs.readFileSync(".github/workflows/edge-lab.yml", "utf8");
  assert.match(workflow, /schedule:/);
  assert.match(workflow, /group:\s*live-dashboard-scan-\$\{\{ github\.ref \}\}/);
  assert.match(workflow, /run:\s*npm run edge:evidence:probe/);
  assert.match(workflow, /run:\s*npm run edge:evidence:truth/);
  assert.match(workflow, /EDGE_EVIDENCE_MAX_REQUESTS:\s*60/);
  assert.match(workflow, /path: \.state\/scanner-learning-bundle\.json\.gz/);
  assert.match(workflow, /run:\s*npm run state:restore/);
  assert.match(workflow, /run:\s*npm run state:pack -- --require-exact-universe/);
  assert.doesNotMatch(workflow, /npm run scan/);
  assert.match(legacyEdgeWorkflow, /group:\s*live-dashboard-scan-\$\{\{ github\.ref \}\}/);
});
