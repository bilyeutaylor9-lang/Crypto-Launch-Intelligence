import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeExecutableQuote, collectExecutableQuoteCurve, collectReplayQuote,
} from "../src/canary/executableQuoteTruthEngine.js";
import { captureForwardExecutionCosts } from "../src/production/forwardExecutionCostCapture.js";

const TOKEN = "9a98oQHtxfqmr4EyzsP6wfw69uYAK3JbUeVEuNW1pump";
const POOL = "D9NCkN3unPTVLtA56Y68J2cXisje9yyYe61gMM2HCHwJ";
const NOW = "2026-10-20T22:00:00.000Z";
const IDENTITY = { chain: "solana", tokenAddress: TOKEN, poolAddress: POOL };
function quote(overrides = {}) {
  return { ...IDENTITY, requestedNotionalUsd: 100, inputUsd: 100, outputUsd: 99,
    inputTokenAmount: 50, outputTokenAmount: 50, allInCostBps: 100, priceImpactBps: 10,
    provider: "OFFLINE_FIXTURE", capturedAt: NOW, routeIdentityVerified: true, ...overrides };
}

test("quote normalization retains exact Solana token/pool identity and original input", () => {
  const raw = quote();
  const before = structuredClone(raw);
  const normalized = normalizeExecutableQuote(raw, { ...IDENTITY, side: "BUY" });
  assert.equal(normalized.status, "EXECUTABLE_QUOTE_OBSERVED");
  assert.equal(normalized.tokenAddress, TOKEN);
  assert.equal(normalized.poolAddress, POOL);
  assert.equal(normalized.capturedAt, NOW);
  assert.deepEqual(raw, before);
});

test("case-distinct Solana quote identities do not collapse during normalization", () => {
  const variant = { tokenAddress: TOKEN.replace("a", "A"), poolAddress: POOL.replace(/^D/, "d") };
  const original = normalizeExecutableQuote(quote());
  const other = normalizeExecutableQuote(quote(variant));
  assert.notEqual(original.tokenAddress, other.tokenAddress);
  assert.notEqual(original.poolAddress, other.poolAddress);
  assert.equal(other.tokenAddress, variant.tokenAddress);
  assert.equal(other.poolAddress, variant.poolAddress);
});

test("quote-curve requests preserve Solana addresses without extra requests", async () => {
  const requests = [];
  const result = await collectExecutableQuoteCurve({ ...IDENTITY, observedAt: NOW, priceUsd: 2 },
    { quoteNotionalsUsd: [25, 100] }, { quoteProvider: async request => {
      requests.push(request);
      return quote({ requestedNotionalUsd: request.requestedNotionalUsd, inputUsd: request.requestedNotionalUsd });
    } });
  assert.equal(requests.length, 2);
  for (const request of requests) {
    assert.equal(request.tokenAddress, TOKEN);
    assert.equal(request.poolAddress, POOL);
    assert.equal(request.candidateKey, `solana:${TOKEN}`);
  }
  assert.ok(result.quotes.every(row => row.tokenAddress === TOKEN && row.poolAddress === POOL));
  assert.equal(result.shadowOnly, true);
  assert.equal(result.rankingInfluence, false);
});

test("replay quote normalization retains the supplied ticket's exact identity", async () => {
  let calls = 0;
  const result = await collectReplayQuote({ ...IDENTITY, ticketId: "offline-ticket",
    identityKey: `solana:${TOKEN}`, primaryEntryQuote: quote(), signalObservedAt: NOW, signalPriceUsd: 2 },
  "EXIT_MARK", 0, { quoteProvider: async request => {
    calls++;
    assert.equal(request.tokenAddress, TOKEN);
    assert.equal(request.poolAddress, POOL);
    return quote({ side: request.side });
  } });
  assert.equal(calls, 1);
  assert.equal(result.tokenAddress, TOKEN);
  assert.equal(result.poolAddress, POOL);
});

test("valid EVM quote addresses keep their existing lowercase canonical form", () => {
  const token = `0x${"Ab".repeat(20)}`, pool = `0x${"Cd".repeat(20)}`;
  const normalized = normalizeExecutableQuote(quote({ chain: "base", tokenAddress: token, poolAddress: pool }));
  assert.equal(normalized.tokenAddress, token.toLowerCase());
  assert.equal(normalized.poolAddress, pool.toLowerCase());
  assert.equal(normalized.allInCostBps, 100);
});

test("accepted production quote pairs preserve exact pools while mismatched raw pools remain rejected", async () => {
  const project = { ...IDENTITY, priceUsd: 2, observedAt: NOW };
  const before = structuredClone(project);
  let calls = 0;
  const result = await captureForwardExecutionCosts([project], { now: NOW, clock: () => NOW, quoteProvider: async request => {
    calls++;
    return quote({ side: request.side });
  } });
  assert.equal(calls, 2);
  assert.equal(result.audit.accepted, 1);
  const provenance = result.projects[0].executionCostProvenance;
  assert.equal(provenance.routeKey, `solana:${TOKEN}:${POOL}`);
  assert.equal(provenance.entryQuote.poolAddress, POOL);
  assert.equal(provenance.exitQuote.poolAddress, POOL);
  assert.deepEqual(project, before);
  calls = 0;
  const wrong = await captureForwardExecutionCosts([project], { now: NOW, clock: () => NOW, quoteProvider: async request => {
    calls++;
    return quote({ side: request.side, poolAddress: POOL.replace(/^D/, "d") });
  } });
  assert.equal(calls, 1, "a mismatched raw BUY must not trigger a SELL");
  assert.equal(wrong.audit.accepted, 0);
  assert.equal(wrong.audit.rejectionReasons.RAW_QUOTE_IDENTITY_MISMATCH, 1);
});
