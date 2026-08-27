
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  DEFAULT_CANARY_POLICY,
  normalizeCanaryPolicy,
  hashCanaryPolicy,
  buildCanaryPolicyEnvelope,
  armCanaryPolicy,
  loadCanaryPolicy,
} from "../src/canary/canaryPolicyStore.js";
import {
  normalizeExecutableQuote,
  buildCapacityFrontier,
  collectExecutableQuoteCurve,
} from "../src/canary/executableQuoteTruthEngine.js";
import {
  evaluateCanaryDecision,
  buildCanaryTicket,
  appendCanaryTickets,
  loadCanaryTickets,
} from "../src/canary/canaryTicketStore.js";
import { selectContemporaneousCanaryControls } from "../src/canary/canaryControlSelector.js";
import {
  paperPnlPct,
  resolvePrimaryPaperOutcome,
  estimateExecutionHeadroomHalfLife,
  falsePositiveAutopsy,
  buildExecutableEdgeCanaryLab,
} from "../src/canary/executableEdgeCanaryLab.js";
import { captureExecutableEdgeCanary } from "../src/canary/canaryCoordinator.js";

const governance = { state: "SHADOW_EDGE_SUPPORTED_FOR_CANARY_DESIGN_REVIEW" };
function at(ms = 0) { return new Date(Date.UTC(2026, 7, 15, 18, 0, 0) + ms).toISOString(); }
function project(symbol = "AAA", overrides = {}) {
  return {
    chain: "base",
    symbol,
    tokenAddress: `0x${symbol.toLowerCase().charCodeAt(0).toString(16).padStart(2, "0").repeat(20)}`.slice(0, 42),
    poolAddress: `0x${"1".repeat(40)}`,
    observedAt: at(0),
    priceUsd: 1,
    liquidityUsd: 600_000,
    marketCapUsd: 8_000_000,
    capitalArrivalState: "COMMITTED_LOADED_VACUUM_SHADOW",
    supplyVacuumSupported: true,
    ...overrides,
  };
}
function policyEnvelope(overrides = {}) {
  return buildCanaryPolicyEnvelope({
    ...DEFAULT_CANARY_POLICY,
    quoteNotionalsUsd: [250, 1000, 5000],
    primaryNotionalUsd: 1000,
    ...overrides,
  }, governance, { frozenAt: at(0) });
}
function quote(size = 1000, overrides = {}) {
  return {
    requestedNotionalUsd: size,
    inputUsd: size,
    outputUsd: size * 0.98,
    outputTokenAmount: size * 0.98,
    referencePriceUsd: 1,
    priceImpactBps: 70,
    protocolFeeBps: 30,
    gasUsd: 1,
    allInCostBps: 120,
    provider: "TEST_EXECUTABLE_ROUTER",
    route: "USDC->AAA",
    blockNumber: "0x123",
    capturedAt: at(1000),
    executable: true,
    ...overrides,
  };
}
function curve(envelope, overrides = {}) {
  const rows = envelope.policy.quoteNotionalsUsd.map((size) =>
    normalizeExecutableQuote(quote(size, overrides[size] || {}), {
      side: "BUY",
      chain: "base",
      tokenAddress: project().tokenAddress,
      candidateKey: "base:aaa",
      requestedNotionalUsd: size,
      signalObservedAt: at(0),
    })
  );
  return { state: "EXECUTABLE_QUOTE_CURVE_OBSERVED", signalObservedAt: at(0), quotes: rows, capacity: buildCapacityFrontier(rows, envelope.policy) };
}

test("v14 policy is paper-only and Base-only by default", () => {
  const p = normalizeCanaryPolicy({});
  assert.deepEqual(p.allowedChains, ["base"]);
  assert.equal(p.mode, "PAPER_ONLY");
  assert.equal(p.realMoneyAllowed, false);
  assert.equal(p.leverageAllowed, false);
  assert.equal(p.automaticLiveTrading, false);
});

test("policy hash is deterministic regardless of object key order", () => {
  assert.equal(hashCanaryPolicy({ b: 2, a: 1 }), hashCanaryPolicy({ a: 1, b: 2 }));
});

test("policy cannot freeze before v13 evidence governor eligibility", () => {
  const p = buildCanaryPolicyEnvelope({}, { state: "SHADOW_EVIDENCE_STACK_INCOMPLETE" });
  assert.equal(p.state, "CANARY_NOT_ELIGIBLE");
  assert.equal(p.frozen, false);
});

test("eligible governance freezes a pre-registered policy", () => {
  const p = policyEnvelope();
  assert.equal(p.state, "CANARY_POLICY_FROZEN");
  assert.equal(p.frozen, true);
  assert.equal(p.automaticLiveTrading, false);
});

test("policy store is immutable once armed", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "v14-policy-"));
  const file = path.join(dir, "policy.json");
  const first = armCanaryPolicy({ primaryNotionalUsd: 1000 }, governance, { file, frozenAt: at(0) });
  const second = armCanaryPolicy({ primaryNotionalUsd: 2500 }, governance, { file, frozenAt: at(0) });
  assert.equal(first.state, "CANARY_POLICY_FROZEN");
  assert.equal(second.state, "CANARY_POLICY_IMMUTABLE_CONFLICT");
  assert.equal(loadCanaryPolicy({ file }).specificationHash, first.specificationHash);
});

test("executable quote normalization preserves actual cost evidence", () => {
  const q = normalizeExecutableQuote(quote(), {
    side: "BUY", chain: "base", tokenAddress: project().tokenAddress,
    candidateKey: "base:aaa", requestedNotionalUsd: 1000, signalObservedAt: at(0),
  });
  assert.equal(q.status, "EXECUTABLE_QUOTE_OBSERVED");
  assert.equal(q.allInCostBps, 120);
  assert.equal(q.signalToQuoteLatencyMs, 1000);
  assert.equal(q.provider, "TEST_EXECUTABLE_ROUTER");
});

test("incomplete quote does not become executable", () => {
  const q = normalizeExecutableQuote({ requestedNotionalUsd: 1000, capturedAt: at(500) }, {
    side: "BUY", requestedNotionalUsd: 1000, signalObservedAt: at(0),
  });
  assert.equal(q.status, "EXECUTABLE_QUOTE_INCOMPLETE");
  assert.equal(q.executable, false);
});

test("capacity frontier respects fixed impact and all-in cost gates", () => {
  const p = policyEnvelope().policy;
  const rows = [
    normalizeExecutableQuote(quote(250), { side: "BUY", requestedNotionalUsd: 250, signalObservedAt: at(0) }),
    normalizeExecutableQuote(quote(1000), { side: "BUY", requestedNotionalUsd: 1000, signalObservedAt: at(0) }),
    normalizeExecutableQuote(quote(5000, { priceImpactBps: 400 }), { side: "BUY", requestedNotionalUsd: 5000, signalObservedAt: at(0) }),
  ];
  const c = buildCapacityFrontier(rows, p);
  assert.equal(c.maximumExecutableNotionalUsd, 1000);
  assert.equal(c.capacityLimited, true);
});

test("quote curve fails closed when no executable quote provider exists", async () => {
  const p = policyEnvelope().policy;
  const out = await collectExecutableQuoteCurve(project(), p, {
    signalObservedAt: at(0),
    endpoint: null,
    freeProviderQuotesEnabled: false,
  });
  assert.equal(out.state, "EXECUTABLE_QUOTE_CURVE_UNAVAILABLE");
  assert.ok(out.quotes.every((q) => q.executable === false));
});

test("eligible signal with fresh executable quote becomes paper execution only", () => {
  const env = policyEnvelope();
  const qcurve = curve(env);
  const d = evaluateCanaryDecision(project(), qcurve, env, governance);
  assert.equal(d.state, "PAPER_EXECUTE");
  assert.equal(d.realMoneyOrderCreated, false);
});

test("stale quote rejects the canary instead of assuming entry", () => {
  const env = policyEnvelope({ maxQuoteAgeMs: 5000 });
  const qcurve = curve(env, {
    1000: { capturedAt: at(10_000) },
  });
  const d = evaluateCanaryDecision(project(), qcurve, env, governance);
  assert.equal(d.state, "NO_TRADE");
  assert.ok(d.blockers.includes("PRIMARY_QUOTE_STALE"));
});

test("non-Base candidate is ineligible under frozen Base-only canary", () => {
  const env = policyEnvelope();
  const qcurve = curve(env);
  const d = evaluateCanaryDecision(project("AAA", { chain: "ethereum" }), qcurve, env, governance);
  assert.ok(d.blockers.includes("CHAIN_NOT_CANARY_ELIGIBLE"));
});

test("entry impact gate rejects an otherwise eligible signal", () => {
  const env = policyEnvelope({ maxEntryImpactBps: 100 });
  const qcurve = curve(env, { 1000: { priceImpactBps: 150 } });
  const d = evaluateCanaryDecision(project(), qcurve, env, governance);
  assert.ok(d.blockers.includes("ENTRY_IMPACT_EXCEEDS_POLICY"));
});

test("contemporaneous controls separate supply-only, capital-only, and baseline", () => {
  const t = project("T");
  const rows = [
    project("S", { capitalArrivalState: "ARRIVAL_EVIDENCE_SHADOW", supplyVacuumSupported: true }),
    project("C", { capitalArrivalState: "ARRIVAL_PRESSURE_BUILDING_SHADOW", supplyVacuumSupported: false }),
    project("B", { capitalArrivalState: "NO_CALIBRATED_ARRIVAL_EVIDENCE", supplyVacuumSupported: false }),
  ];
  const controls = selectContemporaneousCanaryControls(t, [t, ...rows]);
  assert.deepEqual(controls.map((x) => x.role), ["CONTROL_SUPPLY_ONLY", "CONTROL_CAPITAL_ONLY", "CONTROL_BASELINE"]);
});

test("control candidate can paper-execute without pretending it has the treatment signal", () => {
  const env = policyEnvelope();
  const c = project("S", { capitalArrivalState: "ARRIVAL_EVIDENCE_SHADOW", supplyVacuumSupported: true });
  const d = evaluateCanaryDecision(c, curve(env), env, governance, { role: "CONTROL_SUPPLY_ONLY" });
  assert.equal(d.state, "PAPER_CONTROL_EXECUTE");
});

test("canary ticket freezes policy hash, quote, and creates no real order", () => {
  const env = policyEnvelope();
  const ticket = buildCanaryTicket(project(), curve(env), env, governance);
  assert.equal(ticket.decisionState, "PAPER_EXECUTE");
  assert.equal(ticket.policyHash, env.specificationHash);
  assert.equal(ticket.paperExecution.state, "PAPER_ENTRY_FROZEN");
  assert.equal(ticket.realMoneyOrderCreated, false);
  assert.equal(ticket.shadowOnly, true);
});

test("ticket store deduplicates the same immutable event", () => {
  const env = policyEnvelope();
  const ticket = buildCanaryTicket(project(), curve(env), env, governance, { capturedAt: at(1200) });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "v14-ticket-"));
  const file = path.join(dir, "tickets.jsonl");
  const first = appendCanaryTickets([ticket], { file });
  const second = appendCanaryTickets([ticket], { file });
  assert.equal(first.saved, 1);
  assert.equal(second.saved, 0);
  assert.equal(loadCanaryTickets({ file }).length, 1);
});

test("paper pnl uses executable exit USD instead of chart price", () => {
  const env = policyEnvelope();
  const ticket = buildCanaryTicket(project(), curve(env), env, governance);
  assert.equal(paperPnlPct(ticket, { outputUsd: 1250 }), 25);
});

test("primary paper policy resolves take-profit from executable marks", () => {
  const env = policyEnvelope();
  const ticket = buildCanaryTicket(project(), curve(env), env, governance);
  const replays = [
    { ticketId: ticket.ticketId, kind: "EXIT_MARK", status: "EXECUTABLE_QUOTE_OBSERVED", outputUsd: 1100, capturedAt: at(3_600_000) },
    { ticketId: ticket.ticketId, kind: "EXIT_MARK", status: "EXECUTABLE_QUOTE_OBSERVED", outputUsd: 1260, capturedAt: at(7_200_000) },
  ];
  const out = resolvePrimaryPaperOutcome(ticket, replays, env.policy);
  assert.equal(out.state, "PAPER_OUTCOME_RESOLVED");
  assert.equal(out.reason, "TAKE_PROFIT");
  assert.equal(out.netReturnPct, 26);
});

test("primary paper policy resolves stop loss before later recovery", () => {
  const env = policyEnvelope();
  const ticket = buildCanaryTicket(project(), curve(env), env, governance);
  const replays = [
    { ticketId: ticket.ticketId, kind: "EXIT_MARK", status: "EXECUTABLE_QUOTE_OBSERVED", outputUsd: 840, capturedAt: at(3_600_000) },
    { ticketId: ticket.ticketId, kind: "EXIT_MARK", status: "EXECUTABLE_QUOTE_OBSERVED", outputUsd: 1400, capturedAt: at(7_200_000) },
  ];
  const out = resolvePrimaryPaperOutcome(ticket, replays, env.policy);
  assert.equal(out.reason, "STOP_LOSS");
  assert.equal(out.netReturnPct, -16);
});

test("execution headroom half-life is measured from delayed executable buy quotes", () => {
  const env = policyEnvelope({ maxAllInEntryCostBps: 500 });
  const ticket = buildCanaryTicket(project(), curve(env), env, governance);
  const replays = [
    { ticketId: ticket.ticketId, kind: "ENTRY_DELAY_BUY", status: "EXECUTABLE_QUOTE_OBSERVED", allInCostBps: 200, capturedAt: at(6_000) },
    { ticketId: ticket.ticketId, kind: "ENTRY_DELAY_BUY", status: "EXECUTABLE_QUOTE_OBSERVED", allInCostBps: 350, capturedAt: at(31_000) },
  ];
  assert.equal(estimateExecutionHeadroomHalfLife(ticket, replays, env.policy), 30);
});

test("losing canary autopsy identifies supply replenishment without inventing an insider cause", () => {
  const env = policyEnvelope();
  const ticket = buildCanaryTicket(project(), curve(env), env, governance);
  const outcome = { state: "PAPER_OUTCOME_RESOLVED", netReturnPct: -16 };
  const result = falsePositiveAutopsy(ticket, outcome, [
    { observedAt: at(60_000), capitalArrivalState: "COMMITTED_LOADED_VACUUM_SHADOW", supplyVacuumSupported: false },
  ]);
  assert.equal(result.primaryFailure, "SUPPLY_REPLENISHED");
});

test("canary lab cold start stays collecting", () => {
  const env = policyEnvelope();
  const lab = buildExecutableEdgeCanaryLab([], [], env);
  assert.equal(lab.state, "PAPER_CANARY_COLLECTING");
  assert.equal(lab.realMoneyOrders, 0);
});

test("canary lab can support paper edge only after fixed maturity and execution gates", () => {
  const env = policyEnvelope({
    minPaperExecutionsForReview: 1,
    minResolvedPaperExecutionsForReview: 1,
    minUniqueProjectsForReview: 1,
    minResolvedMatchedControlPairsForReview: 1,
    minExecutableQuoteCoveragePct: 50,
    maxMedianEntryQuoteLatencyMs: 5000,
    maxMedianExecutionCostBps: 500,
    maxPaperFalseIgnitionPct: 100,
  });
  const ticket = buildCanaryTicket(project(), curve(env), env, governance);
  const controlProject = project("B", { capitalArrivalState: "NO_CALIBRATED_ARRIVAL_EVIDENCE", supplyVacuumSupported: false, observedAt: at(0) });
  const control = buildCanaryTicket(controlProject, curve(env), env, governance, { role: "CONTROL_BASELINE", parentTreatmentTicketId: ticket.ticketId });
  const replays = [
    { ticketId: ticket.ticketId, kind: "EXIT_MARK", status: "EXECUTABLE_QUOTE_OBSERVED", outputUsd: 1260, capturedAt: at(3_600_000) },
    { ticketId: control.ticketId, kind: "EXIT_MARK", status: "EXECUTABLE_QUOTE_OBSERVED", outputUsd: 840, capturedAt: at(3_600_000) },
  ];
  const lab = buildExecutableEdgeCanaryLab([ticket, control], replays, env);
  assert.equal(lab.state, "PAPER_CANARY_EDGE_SUPPORTED");
  assert.ok(lab.metrics.medianMatchedControlNetReturnLiftPct > 0);
  assert.equal(lab.canaryReviewState, "MICRO_LIVE_CANARY_DESIGN_REVIEW");
  assert.equal(lab.automaticLiveTrading, false);
});

test("negative mature canary evidence produces a stop state, not automatic retuning", () => {
  const env = policyEnvelope({
    minPaperExecutionsForReview: 1,
    minResolvedPaperExecutionsForReview: 1,
    minUniqueProjectsForReview: 1,
    minResolvedMatchedControlPairsForReview: 0,
    minExecutableQuoteCoveragePct: 50,
    maxMedianEntryQuoteLatencyMs: 5000,
    maxMedianExecutionCostBps: 500,
    maxPaperFalseIgnitionPct: 100,
  });
  const ticket = buildCanaryTicket(project(), curve(env), env, governance);
  const replays = [
    { ticketId: ticket.ticketId, kind: "EXIT_MARK", status: "EXECUTABLE_QUOTE_OBSERVED", outputUsd: 840, capturedAt: at(3_600_000) },
  ];
  const lab = buildExecutableEdgeCanaryLab([ticket], replays, env);
  assert.equal(lab.state, "CANARY_SIGNAL_NOT_REPLICATED_STOP");
  assert.equal(lab.automaticLiveTrading, false);
});

test("coordinator creates treatment and contemporaneous control tickets with no live orders", async () => {
  const env = policyEnvelope();
  const t = project("T");
  const b = project("B", { capitalArrivalState: "NO_CALIBRATED_ARRIVAL_EVIDENCE", supplyVacuumSupported: false });
  const provider = async (request) => quote(request.requestedNotionalUsd, { capturedAt: at(1000) });
  const out = await captureExecutableEdgeCanary([t, b], env, governance, { quoteProvider: provider, persist: false });
  assert.ok(out.tickets.some((row) => row.role === "TREATMENT"));
  assert.ok(out.tickets.some((row) => row.role === "CONTROL_BASELINE"));
  assert.equal(out.realMoneyOrders, 0);
});
