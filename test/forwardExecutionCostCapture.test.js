import test from "node:test";
import assert from "node:assert/strict";

import { buildEdgeCandidateDescriptor } from "../src/data/edgeCandidateUniverseStore.js";
import { captureForwardExecutionCosts as captureCosts } from "../src/production/forwardExecutionCostCapture.js";

const TOKEN = "0x1111111111111111111111111111111111111111";
const POOL = "0x2222222222222222222222222222222222222222";
const NOW = "2026-08-24T12:00:00.000Z";
const captureForwardExecutionCosts = (rows, options) => captureCosts(rows, { clock: () => NOW, ...options });

test("live quotes use actual post-response clocks, not the frozen pre-request decision time", async () => {
  let ms = Date.parse(NOW);
  const result = await captureCosts([candidate()], { now: NOW, clock: () => new Date(ms).toISOString(),
    quoteProvider: async (request) => { ms += 1000; return observedQuote(request.side, { capturedAt: new Date(ms).toISOString() }); } });
  assert.equal(result.audit.accepted, 1);
  assert.equal(result.projects[0].executionCostProvenance.entryQuote.capturedAt, "2026-08-24T12:00:01.000Z");
  assert.equal(result.projects[0].executionCostProvenance.exitQuote.capturedAt, "2026-08-24T12:00:02.000Z");
});

test("future, stale, invalid and backwards receipt clocks fail without inventing timestamps", async () => {
  for (const config of [
    { clock: () => NOW, capturedAt: "2026-08-24T12:00:00.001Z", reason: "QUOTE_OUTSIDE_FRESHNESS_WINDOW" },
    { clock: () => NOW, capturedAt: "2026-08-24T11:59:29.999Z", reason: "QUOTE_OUTSIDE_FRESHNESS_WINDOW" },
    { clock: () => "invalid", capturedAt: NOW, reason: "INVALID_QUOTE_RECEIPT_CLOCK" },
    { clock: () => "2026-08-24T11:59:59.999Z", capturedAt: NOW, reason: "INVALID_QUOTE_RECEIPT_CLOCK" },
  ]) {
    let calls = 0;
    const result = await captureCosts([candidate()], { now: NOW, clock: config.clock,
      quoteProvider: async (request) => { calls++; return observedQuote(request.side, { capturedAt: config.capturedAt }); } });
    assert.equal(result.audit.accepted, 0);
    assert.equal(result.audit.rejectionReasons[config.reason], 1);
    assert.equal(calls, 1);
  }
});

test("a delayed sell never refreshes the original buy quote freshness", async () => {
  let ms = Date.parse(NOW);
  const result = await captureCosts([candidate()], { now: NOW, clock: () => new Date(ms).toISOString(),
    quoteProvider: async (request) => { ms += request.side === "BUY" ? 1000 : 31000; return observedQuote(request.side, { capturedAt: new Date(ms).toISOString() }); } });
  assert.equal(result.audit.accepted, 0);
  assert.equal(result.audit.rejectionReasons.QUOTE_OUTSIDE_FRESHNESS_WINDOW, 1);
});

function candidate(overrides = {}) {
  return {
    chain: "base",
    tokenAddress: TOKEN,
    poolAddress: POOL,
    priceUsd: 2,
    sourceObservedAt: "2026-08-24T11:59:55.000Z",
    score: 91,
    pipelineRank: 1,
    ...overrides,
  };
}

function observedQuote(side, overrides = {}) {
  return {
    side,
    chain: "base",
    tokenAddress: TOKEN,
    poolAddress: POOL,
    requestedNotionalUsd: 100,
    inputUsd: 100,
    outputUsd: side === "BUY" ? 99.2 : 99,
    outputTokenAmount: side === "BUY" ? 50 : null,
    inputTokenAmount: side === "SELL" ? 50 : null,
    allInCostBps: side === "BUY" ? 80 : 100,
    priceImpactBps: side === "BUY" ? 35 : 45,
    protocolFeeBps: 30,
    gasUsd: 0.02,
    provider: "TEST_EXECUTION_QUOTE_PROVIDER",
    quoteId: `${side}-quote-1`,
    blockNumber: 123,
    capturedAt: NOW,
    ...overrides,
  };
}

test("explicitly disabled free quotes are inert and leave candidate execution cost unknown", async () => {
  const project = candidate();
  const result = await captureForwardExecutionCosts([project], {
    endpoint: "",
    freeProviderQuotesEnabled: false,
  });

  assert.equal(result.state, "DISABLED_EXECUTABLE_QUOTE_PROVIDER_UNAVAILABLE");
  assert.notStrictEqual(result.projects[0], project);
  const descriptor = buildEdgeCandidateDescriptor(result.projects[0]);
  assert.equal(descriptor.roundTripExecutionCostBps, null);
  assert.equal(descriptor.executionReferenceSizeUsd, null);
  assert.equal(descriptor.executionCostProvenance, null);
  assert.equal(result.projects[0].executionProofEligibility.state, "RESEARCH_ONLY_EXECUTION_EVIDENCE_UNAVAILABLE");
});

test("a fresh paired executable quote freezes observed round-trip cost, size, and provenance after scoring", async () => {
  const requests = [];
  const project = candidate();
  const result = await captureForwardExecutionCosts([project], {
    endpoint: "https://quotes.example.invalid",
    now: NOW,
    quoteProvider: async (request) => {
      requests.push(request);
      return observedQuote(request.side);
    },
  });

  assert.equal(result.state, "PAIRED_EXECUTABLE_ROUND_TRIP_COSTS_CAPTURED");
  assert.equal(result.audit.attempted, 1);
  assert.equal(result.audit.accepted, 1);
  assert.equal(requests.length, 2);
  assert.equal(requests[0].side, "BUY");
  assert.equal(requests[1].side, "SELL");
  assert.equal(requests[1].inputTokenAmount, 50);
  for (const request of requests) {
    assert.equal(request.operation, "QUOTE_ONLY");
    assert.equal(request.executionIntent, "READ_ONLY_QUOTE");
    assert.equal(request.allowOrderSubmission, false);
    assert.equal(request.allowTransactionSubmission, false);
  }

  const captured = result.projects[0];
  assert.notStrictEqual(captured, project);
  assert.equal(captured.score, 91);
  assert.equal(captured.pipelineRank, 1);
  assert.equal(captured.roundTripExecutionCostBps, 180);
  assert.equal(captured.executionReferenceSizeUsd, 100);
  assert.equal(captured.executionCostProvenance.kind, "PAIRED_EXECUTABLE_QUOTES_V1");
  assert.equal(captured.executionCostProvenance.provider, "TEST_EXECUTION_QUOTE_PROVIDER");
  assert.equal(captured.executionCostProvenance.entryQuote.quoteId, "BUY-quote-1");
  assert.equal(captured.executionCostProvenance.exitQuote.quoteId, "SELL-quote-1");
  assert.equal(captured.executionCostCaptureRankingInfluence, false);
  assert.equal(captured.executionCostCaptureAutomaticTrading, false);
  assert.equal(captured.executionProofEligibility.state, "NET_PROOF_ELIGIBLE");

  const descriptor = buildEdgeCandidateDescriptor(captured);
  assert.equal(descriptor.roundTripExecutionCostBps, 180);
  assert.equal(descriptor.executionReferenceSizeUsd, 100);
  assert.equal(descriptor.executionCostProvenance.kind, "PAIRED_EXECUTABLE_QUOTES_V1");
  assert.equal(descriptor.executionProofEligibility.state, "NET_PROOF_ELIGIBLE");
});

test("incomplete or unverifiable quote evidence never produces a cost", async () => {
  const project = candidate();
  const result = await captureForwardExecutionCosts([project], {
    endpoint: "https://quotes.example.invalid",
    now: NOW,
    quoteProvider: async () => observedQuote("BUY", { capturedAt: null }),
  });

  assert.equal(result.state, "NO_PAIRED_EXECUTABLE_ROUND_TRIP_COSTS_CAPTURED");
  assert.equal(result.audit.accepted, 0);
  assert.equal(result.audit.rejectionReasons.MISSING_QUOTE_CAPTURE_TIMESTAMP, 1);
  assert.notStrictEqual(result.projects[0], project);
  const descriptor = buildEdgeCandidateDescriptor(result.projects[0]);
  assert.equal(descriptor.roundTripExecutionCostBps, null);
  assert.equal(descriptor.executionReferenceSizeUsd, null);
  assert.equal(descriptor.executionCostProvenance, null);
  assert.equal(result.projects[0].executionProofEligibility.state, "RESEARCH_ONLY_EXECUTION_EVIDENCE_UNAVAILABLE");
});

test("provider failures are contained and leave a candidate without synthetic execution cost", async () => {
  const project = candidate();
  const result = await captureForwardExecutionCosts([project], {
    endpoint: "https://quotes.example.invalid",
    now: NOW,
    quoteProvider: async () => {
      throw new Error("provider timeout");
    },
  });

  assert.equal(result.state, "NO_PAIRED_EXECUTABLE_ROUND_TRIP_COSTS_CAPTURED");
  assert.equal(result.audit.accepted, 0);
  assert.equal(result.audit.rejectionReasons.BUY_QUOTE_REQUEST_FAILED, 1);
  assert.notStrictEqual(result.projects[0], project);
  const descriptor = buildEdgeCandidateDescriptor(result.projects[0]);
  assert.equal(descriptor.roundTripExecutionCostBps, null);
  assert.equal(descriptor.executionReferenceSizeUsd, null);
});

test("symbol-only or malformed route identity is never sent to the quote provider", async () => {
  let providerCalls = 0;
  const project = candidate({ poolAddress: "not-a-pool" });
  const result = await captureForwardExecutionCosts([project], {
    endpoint: "https://quotes.example.invalid",
    now: NOW,
    quoteProvider: async () => {
      providerCalls += 1;
      return observedQuote("BUY");
    },
  });

  assert.equal(result.state, "NO_PAIRED_EXECUTABLE_ROUND_TRIP_COSTS_CAPTURED");
  assert.equal(result.audit.attempted, 0);
  assert.equal(providerCalls, 0);
  assert.notStrictEqual(result.projects[0], project);
});

test("a quote response with a mismatched identity is rejected before a cost can freeze", async () => {
  let providerCalls = 0;
  const project = candidate();
  const result = await captureForwardExecutionCosts([project], {
    endpoint: "https://quotes.example.invalid",
    now: NOW,
    quoteProvider: async () => {
      providerCalls += 1;
      return observedQuote("BUY", { tokenAddress: "0x3333333333333333333333333333333333333333" });
    },
  });

  assert.equal(providerCalls, 1);
  assert.equal(result.audit.accepted, 0);
  assert.equal(result.audit.rejectionReasons.RAW_QUOTE_IDENTITY_MISMATCH, 1);
  assert.notStrictEqual(result.projects[0], project);
  assert.equal(buildEdgeCandidateDescriptor(result.projects[0]).roundTripExecutionCostBps, null);
});

test("a quote response without raw chain, token, and pool identity is rejected", async () => {
  const project = candidate();
  const result = await captureForwardExecutionCosts([project], {
    endpoint: "https://quotes.example.invalid",
    now: NOW,
    quoteProvider: async () => observedQuote("BUY", {
      chain: null,
      tokenAddress: null,
      poolAddress: null,
    }),
  });

  assert.equal(result.audit.accepted, 0);
  assert.equal(result.audit.rejectionReasons.RAW_QUOTE_IDENTITY_MISSING, 1);
  assert.notStrictEqual(result.projects[0], project);
});
