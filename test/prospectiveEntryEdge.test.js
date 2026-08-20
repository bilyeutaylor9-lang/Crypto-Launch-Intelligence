import test from "node:test";
import assert from "node:assert/strict";

import { buildEdgeCandidateDescriptor } from "../src/data/edgeCandidateUniverseStore.js";
import {
  buildProspectiveEntryEdgeCohort,
} from "../src/learning/prospectiveEntryEdgeEpisodeStore.js";
import {
  buildProspectiveEntryEdgeReport,
} from "../src/learning/prospectiveEntryEdgeLab.js";
import {
  classifyProspectiveEntryTrialRecord,
  PROSPECTIVE_ENTRY_EDGE_TRIALS,
} from "../src/learning/prospectiveEntryEdgeTrialRegistry.js";

const TOKEN = "0x1111111111111111111111111111111111111111";
const POOL = "0x2222222222222222222222222222222222222222";

function record(index = 1, overrides = {}) {
  const tokenAddress = `0x${index.toString(16).padStart(40, "0")}`;
  const poolAddress = `0x${(1000 + index).toString(16).padStart(40, "0")}`;
  return {
    identityKey: `base:${tokenAddress}`,
    chain: "base",
    tokenAddress,
    poolAddress,
    scannedAt: "2026-08-21T00:00:00.000Z",
    market: { priceUsd: 1, marketCap: 1_000_000 + index, liquidityUsd: 100_000, volume24h: 200_000 },
    scores: { liveCatalystRadar: 70, richToken: 40 },
    pointInTime: {
      identity: { resolved: true, status: "VERIFIED" },
      safety: { status: "SAFETY_VERIFIED_CLEAN", deterministicBlocks: [] },
      execution: {
        buyQuoteVerified: true,
        sellQuoteVerified: true,
        quoteTimestamp: "2026-08-21T00:00:00.000Z",
        routeTruthStatus: "SELL_QUOTE_VERIFIED",
        estimatedRoundTripSlippagePct: 0.5,
      },
    },
    ...overrides,
  };
}

test("edge candidate universe rejects symbol-only identity", () => {
  assert.equal(buildEdgeCandidateDescriptor({ chain: "base", symbol: "AAA" }), null);
  assert.ok(buildEdgeCandidateDescriptor({ chain: "base", tokenAddress: TOKEN, poolAddress: POOL }));
});

test("prospective entry rule rejects pre-declaration records", () => {
  const classified = classifyProspectiveEntryTrialRecord(record(1, {
    scannedAt: "2026-08-20T14:00:00.000Z",
  }));
  assert.equal(classified, null);
});

test("verified avoidance boundary cannot enter the prospective treatment", () => {
  assert.equal(classifyProspectiveEntryTrialRecord(record(1, {
    scores: { liveCatalystRadar: 80, richToken: 60 },
  })), null);
});

test("missing execution proof remains signal-only", () => {
  const classified = classifyProspectiveEntryTrialRecord(record(1, {
    pointInTime: {
      identity: { resolved: true, status: "VERIFIED" },
      safety: { status: "SAFETY_VERIFIED_CLEAN", deterministicBlocks: [] },
      execution: { buyQuoteVerified: true, sellQuoteVerified: false, quoteTimestamp: null },
    },
  }));
  assert.equal(classified.role, "TREATMENT");
  assert.equal(classified.executableAtSignal, false);
});

test("prospective cohort freezes matched controls without ranking influence", () => {
  const cohort = buildProspectiveEntryEdgeCohort([
    record(1),
    record(2, { scores: { liveCatalystRadar: 50, richToken: 40 } }),
    record(3, { scores: { liveCatalystRadar: 45, richToken: 35 } }),
  ]);
  assert.equal(cohort.matchedTreatments, 1);
  assert.equal(cohort.matchedControls, 2);
  assert.ok(cohort.episodes.every((episode) => episode.rankingInfluence === false));
  assert.ok(cohort.episodes.every((episode) => episode.exactIdentityFrozen === true));
});

test("trial waits rather than promoting historical discovery", () => {
  const report = buildProspectiveEntryEdgeReport({ episodes: [], examples: [], memory: [], writeReport: false });
  assert.equal(report.state, "PROSPECTIVE_ENTRY_TRIAL_WAITING_FOR_FIRST_SCAN");
  assert.equal(report.historicalDiscovery.mayVerifyEntryEdge, false);
  assert.equal(report.automaticProductionPromotion, false);
});

function matureFixture({ executable = true, exact = true } = {}) {
  const episodes = [];
  const examples = [];
  for (let index = 0; index < 30; index += 1) {
    const cohort = Math.floor(index / 6);
    const scannedAt = new Date(Date.UTC(2026, 7, 21 + cohort * 4)).toISOString();
    const treatmentKey = `base:0x${(10_000 + index).toString(16).padStart(40, "0")}`;
    const treatmentId = `treatment-${index}`;
    episodes.push({
      episodeId: treatmentId,
      role: "TREATMENT",
      identityKey: treatmentKey,
      signalObservedAt: scannedAt,
      executableAtSignal: executable,
      estimatedRoundTripSlippagePct: 1,
    });
    examples.push({
      key: treatmentKey,
      scannedAt,
      outcomeAt: new Date(Date.parse(scannedAt) + 168 * 3_600_000).toISOString(),
      primaryChangePct: 20,
      scores: {},
      outcomeProvenance: { verificationStatus: exact ? "EXACT_CHAIN_TOKEN_POOL_MATCH" : "UNVERIFIED" },
    });
    for (let control = 0; control < 2; control += 1) {
      const controlKey = `base:0x${(20_000 + index * 2 + control).toString(16).padStart(40, "0")}`;
      episodes.push({
        episodeId: `control-${index}-${control}`,
        role: "CONTROL_MATCHED",
        parentTreatmentEpisodeId: treatmentId,
        identityKey: controlKey,
        signalObservedAt: scannedAt,
        executableAtSignal: executable,
        estimatedRoundTripSlippagePct: 1,
      });
      examples.push({
        key: controlKey,
        scannedAt,
        outcomeAt: new Date(Date.parse(scannedAt) + 168 * 3_600_000).toISOString(),
        primaryChangePct: 0,
        scores: {},
        outcomeProvenance: { verificationStatus: exact ? "EXACT_CHAIN_TOKEN_MATCH" : "UNVERIFIED" },
      });
    }
  }
  return { episodes, examples };
}

test("unknown outcomes cannot verify a prospective entry edge", () => {
  const fixture = matureFixture({ exact: false });
  const report = buildProspectiveEntryEdgeReport({ ...fixture, memory: [], bootstrapReplicates: 800 });
  assert.equal(report.state, "PROSPECTIVE_ENTRY_TRIAL_WARMING");
  assert.equal(report.prospectiveExecutableCohort.resolvedTreatments, 0);
});

test("signal-only evidence cannot verify an executable entry edge", () => {
  const fixture = matureFixture({ executable: false });
  const report = buildProspectiveEntryEdgeReport({ ...fixture, memory: [], bootstrapReplicates: 800 });
  assert.equal(report.state, "PROSPECTIVE_ENTRY_TRIAL_WARMING");
  assert.equal(report.prospectiveSignalCohort.resolvedTreatments, 30);
  assert.equal(report.prospectiveExecutableCohort.resolvedTreatments, 0);
});

test("mature exact executable matched evidence can verify the fixed entry rule", () => {
  const fixture = matureFixture();
  const report = buildProspectiveEntryEdgeReport({ ...fixture, memory: [], bootstrapReplicates: 800 });
  assert.equal(report.state, "VERIFIED_PROSPECTIVE_ENTRY_EDGE");
  assert.equal(report.prospectiveExecutableCohort.resolvedTreatments, 30);
  assert.equal(report.prospectiveExecutableCohort.resolvedControls, 60);
  assert.ok(report.prospectiveExecutableCohort.bootstrap95.lower95Pct > 0);
  assert.equal(report.picksForced, false);
  assert.equal(report.automaticTrading, false);
});

test("trial declaration is immutable and post-hoc by construction", () => {
  const trial = PROSPECTIVE_ENTRY_EDGE_TRIALS[0];
  assert.equal(Object.isFrozen(trial), true);
  assert.equal(trial.discoveryClass, "POST_HOC_DISCOVERY_REQUIRES_PROSPECTIVE_CONFIRMATION");
});
