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
      forwardQuoteBroker: { quoteProvider: async (request) => rawQuote(request) },
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
