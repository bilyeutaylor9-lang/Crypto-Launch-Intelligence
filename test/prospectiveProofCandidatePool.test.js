import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  PROSPECTIVE_PROOF_CANDIDATE_STATE,
  buildProspectiveProofCandidatePool,
  classifyProspectiveProofCandidate,
} from "../src/production/prospectiveProofCandidatePool.js";
import {
  buildProspectiveMatchabilityIndex,
  buildProspectiveStrategyFingerprint,
  freezeProspectiveEdgeCohort,
  freezeProspectiveSelection,
  selectMatchableProspectiveTreatments,
} from "../src/production/prospectiveEdgeCohortLedger.js";
import { captureForwardProofQuotes } from "../src/production/forwardQuoteBroker.js";
import { runProductionShadowCycle } from "../src/ops/runProductionShadowCycle.js";
import { buildEdgeCandidateDescriptor } from "../src/data/edgeCandidateUniverseStore.js";

const NOW = "2026-08-27T16:00:00.000Z";

function address(value) {
  return `0x${Number(value).toString(16).padStart(40, "0")}`;
}

function candidate(index, overrides = {}) {
  return {
    chain: "base",
    tokenAddress: address(index),
    poolAddress: address(index + 100_000),
    sourceObservedAt: "2026-08-27T15:55:00.000Z",
    pairCreatedAt: "2026-08-25T16:00:00.000Z",
    priceUsd: 1,
    liquidityUsd: 500_000,
    marketCapUsd: 10_000_000,
    volume24hUsd: 1_000_000,
    evidenceCoveragePct: 80,
    riskScore: 20,
    priceChange24hPct: 5,
    combinedResearchScore: 72 - index,
    finalSelectionQualified: false,
    liveExecutionReady: false,
    ...overrides,
  };
}

function matchOptions(overrides = {}) {
  return {
    now: NOW,
    sourceObservedAt: NOW,
    codeCommitSha: "0123456789abcdef0123456789abcdef01234567",
    requireRowSourceObservedAt: true,
    maximumSourceAgeMinutes: 90,
    maximumCandidates: 10,
    maximumSelections: 2,
    maxControls: 1,
    existingEpisodes: [],
    ...overrides,
  };
}

function rawQuote(request) {
  const buy = request.side === "BUY";
  return {
    side: request.side,
    chain: request.chain,
    tokenAddress: request.tokenAddress,
    poolAddress: request.poolAddress,
    requestedNotionalUsd: request.requestedNotionalUsd,
    inputUsd: 100,
    outputUsd: buy ? 99 : 98,
    outputTokenAmount: buy ? 99 : null,
    inputTokenAmount: buy ? null : 99,
    allInCostBps: 100,
    priceImpactBps: 25,
    provider: "TEST_READ_ONLY_PROVIDER",
    quoteId: `${request.candidateKey}-${request.side}`,
    capturedAt: NOW,
    rawEvidenceHash: "a".repeat(64),
    routeIdentityVerified: true,
  };
}

test("a fresh exact scientific pool survives empty live synthesis", () => {
  const rows = [candidate(1), candidate(2), candidate(3)];
  const pool = buildProspectiveProofCandidatePool(rows, { now: NOW });

  assert.equal(pool.eligible.length, 3);
  assert.equal(pool.audit.quoteAvailabilityInfluencesSelection, false);
  assert.equal(pool.audit.outcomeFieldsReadDuringSelection, false);
  assert.equal(pool.audit.automaticTrading, false);
  assert.equal(pool.audit.automaticPromotion, false);
  assert.equal(pool.eligible.every((row) => row.finalSelectionQualified === false), true);
});

test("the exact universe retains pre-outcome score and deterministic safety evidence", () => {
  const descriptor = buildEdgeCandidateDescriptor(candidate(1, {
    portfolioResearchScore: 81,
    finalBlockingReasons: ["confirmed honeypot"],
  }));
  assert.equal(descriptor.portfolioResearchScore, 81);
  assert.deepEqual(descriptor.finalBlockingReasons, ["confirmed honeypot"]);
  assert.equal(
    classifyProspectiveProofCandidate(descriptor, { now: NOW }).state,
    PROSPECTIVE_PROOF_CANDIDATE_STATE.SIGNAL_HARD_REJECTED,
  );
});

test("safety, stale PIT evidence, and missing exact route remain fail-closed", () => {
  assert.equal(
    classifyProspectiveProofCandidate(candidate(1, { honeypotDetected: true }), { now: NOW }).state,
    PROSPECTIVE_PROOF_CANDIDATE_STATE.SIGNAL_HARD_REJECTED,
  );
  const stale = classifyProspectiveProofCandidate(
    candidate(2, { sourceObservedAt: "2026-08-27T12:00:00.000Z" }),
    { now: NOW },
  );
  assert.equal(stale.state, PROSPECTIVE_PROOF_CANDIDATE_STATE.SIGNAL_RESEARCH_ONLY);
  assert.equal(stale.reason, "STALE_POINT_IN_TIME_SOURCE");
  assert.equal(
    classifyProspectiveProofCandidate(candidate(3, { poolAddress: null }), { now: NOW }).state,
    PROSPECTIVE_PROOF_CANDIDATE_STATE.SIGNAL_HARD_REJECTED,
  );
});

test("treatment/control reservation occurs before read-only quote acquisition", async () => {
  const pool = buildProspectiveProofCandidatePool(
    [candidate(1), candidate(2), candidate(3), candidate(4)],
    { now: NOW },
  );
  const index = buildProspectiveMatchabilityIndex(pool.eligible, {
    ...matchOptions(),
    controlCandidates: pool.eligible,
  });
  const selection = selectMatchableProspectiveTreatments(index, {
    maximumSelections: 1,
    maxControls: 1,
  });
  assert.equal(selection.selected.length, 1);
  assert.equal(selection.reservations.length, 1);

  const selectedRoute = `${selection.selected[0].chain}:${selection.selected[0].tokenAddress}:${selection.selected[0].poolAddress}`;
  const controlRoute = selection.reservations[0].controlRouteKey;
  const control = pool.eligible.find((row) =>
    `${row.chain}:${row.tokenAddress}:${row.poolAddress}` === controlRoute,
  );
  const calls = [];
  const quotes = await captureForwardProofQuotes({
    treatments: selection.selected,
    controls: [control],
    now: NOW,
    clock: () => NOW,
    quoteProvider: async (request) => {
      calls.push({ candidateKey: request.candidateKey, side: request.side });
      return rawQuote(request);
    },
  });

  assert.deepEqual(calls.map((call) => call.candidateKey), [
    selection.selected[0].chain + ":" + selection.selected[0].tokenAddress,
    selection.selected[0].chain + ":" + selection.selected[0].tokenAddress,
    control.chain + ":" + control.tokenAddress,
    control.chain + ":" + control.tokenAddress,
  ]);
  assert.equal(quotes.audit.pairedQuotesAccepted, 2);
  assert.equal(quotes.audit.netProofEligible, 2);
  assert.equal(quotes.audit.quoteAttempts.every((attempt) => attempt.quoteOnly), true);
  assert.equal(quotes.audit.quoteAttempts.every((attempt) => attempt.transactionSubmissionAllowed === false), true);
  assert.equal(quotes.audit.quoteAttempts.every((attempt) => attempt.rawEvidenceHash === "a".repeat(64)), true);
  assert.equal(selectedRoute === controlRoute, false);
});

test("a sealed pre-quote route selection rejects post-freeze rewriting", () => {
  const rows = [candidate(1), candidate(2), candidate(3)];
  const options = matchOptions();
  const strategy = buildProspectiveStrategyFingerprint(options);
  const frozenSelection = freezeProspectiveSelection([rows[0]], [{
    treatmentRouteKey: `${rows[0].chain}:${rows[0].tokenAddress}:${rows[0].poolAddress}`,
    controlRouteKey: `${rows[1].chain}:${rows[1].tokenAddress}:${rows[1].poolAddress}`,
    distance: 0.1,
  }], { now: NOW, strategyFingerprint: strategy.fingerprint });
  const result = freezeProspectiveEdgeCohort([rows[2]], rows, {
    ...options,
    preQuoteSelection: frozenSelection,
  });
  assert.equal(result.state, "COHORT_REJECTED_PRE_QUOTE_SELECTION_INTEGRITY");
  assert.equal(result.episodes.length, 0);
});

test("production shadow can freeze scientific cohorts when synthesis is empty", async () => {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "prospective-proof-v4-"));
  const priorDirectory = process.cwd();
  const rows = [candidate(1), candidate(2), candidate(3), candidate(4)];
  try {
    process.chdir(temporaryDirectory);
    const result = await runProductionShadowCycle({
      now: NOW,
      clock: () => NOW,
      codeCommitSha: "0123456789abcdef0123456789abcdef01234567",
      observations: [],
      adaptive: { registry: {} },
      synthesis: { candidates: [] },
      universe: {
        availabilityState: "EDGE_CANDIDATE_UNIVERSE_AVAILABLE",
        generatedAt: NOW,
        codeCommitSha: "0123456789abcdef0123456789abcdef01234567",
        exactCandidates: rows.length,
        exactCandidatesWithSourceTimestamp: rows.length,
        candidates: rows,
      },
      prospectiveCohortEpisodes: [],
      prospectiveCohortFile: path.join(temporaryDirectory, "data", "prospective-edge-cohorts.jsonl"),
      forwardQuoteBroker: { clock: () => NOW, quoteProvider: async (request) => rawQuote(request) },
    });
    const report = JSON.parse(fs.readFileSync("reports/prospective-proof-acquisition.json", "utf8"));

    assert.ok(result.prospectiveCohort.audit.treatmentsFrozen > 0);
    assert.ok(result.prospectiveCohort.audit.controlsFrozen > 0);
    assert.equal(report.signalEligible, rows.length);
    assert.ok(report.pairedQuotesAccepted > 0);
    assert.equal(report.automaticTrading, false);
    assert.equal(report.automaticPromotion, false);
  } finally {
    process.chdir(priorDirectory);
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});

test("cost-complete admission retains every reserved control or blocks the entire new cohort", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cost-complete-cohort-"));
  const before = process.cwd();
  const rows = [candidate(1), candidate(2), candidate(3), candidate(4)];
  try {
    process.chdir(dir);
    const settings = { now: NOW, clock: () => NOW, codeCommitSha: "0123456789abcdef0123456789abcdef01234567",
      requireCompleteExecutionCosts: true, observations: [], adaptive: { registry: {} }, synthesis: { candidates: [] },
      universe: { availabilityState: "EDGE_CANDIDATE_UNIVERSE_AVAILABLE", generatedAt: NOW,
        exactCandidates: rows.length, candidates: rows }, prospectiveCohortEpisodes: [],
      prospectiveCohortFile: path.join(dir, "cohorts.jsonl") };
    const denied = await runProductionShadowCycle({ ...settings,
      forwardQuoteBroker: { clock: () => NOW, quoteProvider: async (request) => {
        const seal = JSON.parse(fs.readFileSync("reports/prospective-pre-quote-selection.json"));
        assert.ok(seal.selectionFreezeHash);
        const controls = seal.reservations.map((r) => r.controlRouteKey);
        if (controls.includes(`${request.chain}:${request.tokenAddress}:${request.poolAddress}`)) throw Error("missing control quote");
        return rawQuote(request);
      } } });
    assert.equal(denied.prospectiveCohort.state, "PROSPECTIVE_COHORT_NOT_CAPTURED_EXECUTION_COSTS_INCOMPLETE");
    assert.equal(denied.prospectiveCohort.persistence.saved, 0);
    assert.equal(fs.existsSync(settings.prospectiveCohortFile), false);
    const attempt = JSON.parse(fs.readFileSync(`reports/prospective-cost-attempts/${denied.manifest.runId}.json`));
    assert.equal(attempt.quotedProjects.length, denied.shadowReport.forwardQuoteBroker.captureAudit.attempted);
    assert.ok(attempt.quotedProjects.some((row) => row.executionCostProvenance?.entryQuote?.rawEvidenceHash));
    const sealedRoutes = JSON.parse(fs.readFileSync("reports/prospective-pre-quote-selection.json"));
    const accepted = await runProductionShadowCycle({ ...settings,
      forwardQuoteBroker: { clock: () => NOW, quoteProvider: async (request) => rawQuote(request) } });
    assert.ok(accepted.prospectiveCohort.audit.controlsFrozen > 0);
    assert.ok(accepted.prospectiveCohort.audit.treatmentsFrozen > 0);
    assert.equal(accepted.shadowReport.forwardQuoteBroker.explicitCostCoveragePct, 100);
    assert.deepEqual(accepted.shadowReport.preQuoteSelection, sealedRoutes);
    const bytes = fs.readFileSync(settings.prospectiveCohortFile, "utf8");
    const episodes = bytes.trim().split("\n").map(JSON.parse);
    assert.equal(episodes.length, accepted.prospectiveCohort.audit.controlsFrozen + accepted.prospectiveCohort.audit.treatmentsFrozen);
    assert.ok(episodes.every((row) => row.frozenExecutionCostProvenance?.kind === "PAIRED_EXECUTABLE_QUOTES_V1"));
  } finally { process.chdir(before); fs.rmSync(dir, { recursive: true, force: true }); }
});

for (const scenario of [
  { name: "moving clocks", delay: 0, requireComplete: true, captured: true, explicit: true },
  { name: "expired quotes", delay: 31000, requireComplete: true, captured: false, explicit: false },
  { name: "future quotes", fixedCutoff: NOW, requireComplete: true, captured: false, explicit: false },
  { name: "research-only expired quotes", delay: 31000, requireComplete: false, captured: true, explicit: false },
]) {
  test(`cohort cutoff preserves actual quote clocks: ${scenario.name}`, async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cohort-cost-cutoff-"));
    const before = process.cwd();
    let ms = Date.parse(NOW), requests = 0;
    const rows = [candidate(1), candidate(2), candidate(3), candidate(4)];
    try {
      process.chdir(dir);
      const result = await runProductionShadowCycle({
        now: NOW,
        clock: () => scenario.fixedCutoff || new Date(ms + scenario.delay).toISOString(),
        codeCommitSha: "0123456789abcdef0123456789abcdef01234567",
        requireCompleteExecutionCosts: scenario.requireComplete,
        observations: [], adaptive: { registry: {} }, synthesis: { candidates: [] },
        universe: { availabilityState: "EDGE_CANDIDATE_UNIVERSE_AVAILABLE", generatedAt: NOW,
          exactCandidates: rows.length, candidates: rows },
        prospectiveCohortEpisodes: [], prospectiveCohortFile: path.join(dir, "cohorts.jsonl"),
        forwardQuoteBroker: {
          clock: () => new Date(ms).toISOString(),
          quoteProvider: async (request) => {
            requests += 1;
            ms += 1000;
            return { ...rawQuote(request), capturedAt: new Date(ms).toISOString() };
          },
        },
      });
      const episodes = result.prospectiveCohort.episodes;
      assert.equal(episodes.length > 0, scenario.captured);
      const audit = result.shadowReport.decisionCostAudit;
      assert.ok(audit.quotesAcceptedAtCapture > 0);
      assert.equal(audit.quotesUsableAtDecision > 0, scenario.explicit);
      assert.equal(requests, audit.quotesAcceptedAtCapture * 2, "Revalidation must never refetch quotes");
      for (const episode of episodes) {
        assert.equal(episode.decisionAt, audit.decisionAt);
        assert.ok(episode.preQuoteSelectionFreezeHash);
        if (scenario.explicit) {
          const proof = episode.frozenExecutionCostProvenance;
          assert.ok(Date.parse(proof.entryQuote.capturedAt) > Date.parse(NOW));
          assert.ok(Date.parse(proof.exitQuote.capturedAt) <= Date.parse(episode.decisionAt));
          assert.ok(episode.frozenRoundTripExecutionCostBps > 0);
        } else {
          assert.equal(episode.frozenRoundTripExecutionCostBps, null);
          assert.equal(episode.frozenExecutionCostProvenance, null);
        }
      }
      const predictionFile = "data/production-shadow-predictions.jsonl";
      if (!scenario.captured) assert.equal(fs.existsSync(predictionFile), false);
      const predictions = fs.existsSync(predictionFile) ? fs.readFileSync(predictionFile, "utf8")
        .split("\n").filter(Boolean).map(JSON.parse) : [];
      assert.equal(predictions.length, episodes.filter((row) => row.role === "TREATMENT").length);
      for (const prediction of predictions) {
        const episode = episodes.find((row) => row.episodeId === prediction.prospectiveEdgeEpisodeId);
        assert.ok(episode);
        assert.equal(prediction.decisionAt, episode.decisionAt);
        assert.equal(prediction.generatedAt, episode.decisionAt);
        assert.equal(prediction.sourceAgeMinutesAtDecision, episode.sourceAgeMinutesAtDecision);
      }
      const original = JSON.parse(fs.readFileSync(`reports/prospective-cost-attempts/${result.manifest.runId}.json`));
      assert.ok(original.quotedProjects.every((row) => row.executionCostProvenance?.entryQuote?.capturedAt));
      assert.equal(original.preQuoteSelection.generatedAt || original.preQuoteSelection.decisionAt, NOW);
    } finally {
      process.chdir(before);
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
}

test("a reserved control expiring during quotes rejects the whole sealed cohort", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cohort-membership-cutoff-"));
  const before = process.cwd();
  let ms = Date.parse(NOW);
  const nearBoundary = new Date(ms - 89 * 60000 - 50000).toISOString();
  const rows = [candidate(1, { sourceObservedAt: nearBoundary }),
    candidate(2, { sourceObservedAt: nearBoundary }), candidate(3, {
    sourceObservedAt: new Date(ms - 89 * 60000 - 59000).toISOString(),
  })];
  const clock = () => new Date(ms).toISOString();
  try {
    process.chdir(dir);
    const result = await runProductionShadowCycle({
      now: NOW, clock, codeCommitSha: "0123456789abcdef0123456789abcdef01234567",
      requireCompleteExecutionCosts: true, maxProspectiveControls: 2,
      observations: [], adaptive: { registry: {} }, synthesis: { candidates: [] },
      universe: { availabilityState: "EDGE_CANDIDATE_UNIVERSE_AVAILABLE", generatedAt: NOW,
        exactCandidates: rows.length, candidates: rows },
      prospectiveCohortEpisodes: [], prospectiveCohortFile: path.join(dir, "cohorts.jsonl"),
      forwardQuoteBroker: { clock, quoteProvider: async (request) => {
        ms += 1000;
        return { ...rawQuote(request), capturedAt: clock() };
      } },
    });
    assert.equal(result.shadowReport.preQuoteSelection.treatments.length, 1);
    assert.equal(result.shadowReport.preQuoteSelection.reservations.length, 2);
    assert.equal(result.shadowReport.decisionCostAudit.quotesUsableAtDecision, 3);
    assert.equal(result.prospectiveCohort.state, "COHORT_REJECTED_PRE_QUOTE_MEMBERSHIP_CHANGED");
    assert.deepEqual(result.prospectiveCohort.episodes, []);
    assert.equal(result.prospectiveCohort.persistence.saved, 0);
    assert.equal(fs.existsSync(path.join(dir, "cohorts.jsonl")), false);
    assert.equal(fs.existsSync("data/production-shadow-predictions.jsonl"), false);
    const attempts = JSON.parse(fs.readFileSync(`reports/prospective-cost-attempts/${result.manifest.runId}.json`));
    assert.equal(attempts.quotedProjects.length, 3);
    assert.deepEqual(attempts.preQuoteSelection, result.shadowReport.preQuoteSelection);
  } finally {
    process.chdir(before);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
