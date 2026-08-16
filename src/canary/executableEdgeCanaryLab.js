
import fs from "node:fs";
import path from "node:path";
import { median } from "../edge/edgeMath.js";

const REPORT = path.resolve("reports", "ignition-executable-edge-canary.json");

function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
function ts(value) { const ms = Date.parse(value || ""); return Number.isFinite(ms) ? ms : null; }
function round(value, digits = 4) { const n = finite(value); return n === null ? null : Number(n.toFixed(digits)); }
function percent(n, d) { return d ? round((n / d) * 100, 2) : null; }
function mean(values = []) {
  const rows = values.map(finite).filter((v) => v !== null);
  return rows.length ? rows.reduce((s, v) => s + v, 0) / rows.length : null;
}

export function paperPnlPct(ticket = {}, replay = {}) {
  const entry = ticket.primaryEntryQuote || {};
  const notional = finite(entry.requestedNotionalUsd ?? ticket.paperExecution?.notionalUsd);
  const exitUsd = finite(replay.outputUsd);
  if (notional === null || notional <= 0 || exitUsd === null) return null;
  return ((exitUsd - notional) / notional) * 100;
}

export function resolvePrimaryPaperOutcome(ticket = {}, replayRows = [], policy = {}) {
  if (!["PAPER_EXECUTE", "PAPER_CONTROL_EXECUTE"].includes(ticket.decisionState)) return { state: "NOT_EXECUTED", reason: ticket.decisionBlockers || [] };
  const entryMs = ts(ticket.primaryEntryQuote?.capturedAt || ticket.signalObservedAt);
  if (!entryMs) return { state: "DATA_INTEGRITY_FAILURE", reason: "ENTRY_TIMESTAMP_MISSING" };
  const exitPolicy = policy.primaryExitPolicy || {};
  const tp = finite(exitPolicy.takeProfitPct);
  const sl = finite(exitPolicy.stopLossPct);
  const maxHours = finite(exitPolicy.maxHoldingHours) ?? 168;
  const marks = replayRows
    .filter((row) => row.ticketId === ticket.ticketId && row.kind === "EXIT_MARK" && row.status === "EXECUTABLE_QUOTE_OBSERVED" && ts(row.capturedAt) >= entryMs)
    .map((row) => ({ ...row, pnlPct: paperPnlPct(ticket, row) }))
    .filter((row) => row.pnlPct !== null)
    .sort((a, b) => ts(a.capturedAt) - ts(b.capturedAt));
  if (!marks.length) return { state: "WAITING_FOR_EXECUTABLE_EXIT_MARKS", marks: 0 };
  let exit = null;
  let reason = null;
  for (const mark of marks) {
    const elapsedHours = (ts(mark.capturedAt) - entryMs) / 3_600_000;
    if (tp !== null && mark.pnlPct >= tp) { exit = mark; reason = "TAKE_PROFIT"; break; }
    if (sl !== null && mark.pnlPct <= sl) { exit = mark; reason = "STOP_LOSS"; break; }
    if (elapsedHours >= maxHours) { exit = mark; reason = "MAX_HOLD"; break; }
  }
  const coverageHours = (ts(marks.at(-1).capturedAt) - entryMs) / 3_600_000;
  const pnlRows = marks.map((row) => row.pnlPct);
  if (!exit) {
    return {
      state: "PAPER_OUTCOME_OPEN",
      marks: marks.length,
      coverageHours: round(coverageHours, 3),
      maxFavorableExcursionPct: round(Math.max(...pnlRows), 4),
      maxAdverseExcursionPct: round(Math.min(...pnlRows), 4),
    };
  }
  const throughExit = marks.filter((row) => ts(row.capturedAt) <= ts(exit.capturedAt)).map((row) => row.pnlPct);
  return {
    state: "PAPER_OUTCOME_RESOLVED",
    reason,
    exitCapturedAt: exit.capturedAt,
    netReturnPct: round(exit.pnlPct, 4),
    holdingHours: round((ts(exit.capturedAt) - entryMs) / 3_600_000, 4),
    marks: marks.length,
    maxFavorableExcursionPct: round(Math.max(...throughExit), 4),
    maxAdverseExcursionPct: round(Math.min(...throughExit), 4),
    executableExitEvidence: true,
  };
}

export function estimateExecutionHeadroomHalfLife(ticket = {}, replayRows = [], policy = {}) {
  const initialCost = finite(ticket.primaryEntryQuote?.allInCostBps);
  const maxCost = finite(policy.maxAllInEntryCostBps);
  if (initialCost === null || maxCost === null || initialCost >= maxCost) return null;
  const initialHeadroom = maxCost - initialCost;
  const targetHeadroom = initialHeadroom / 2;
  const entryMs = ts(ticket.primaryEntryQuote?.capturedAt || ticket.signalObservedAt);
  const delayed = replayRows
    .filter((row) => row.ticketId === ticket.ticketId && row.kind === "ENTRY_DELAY_BUY" && row.status === "EXECUTABLE_QUOTE_OBSERVED" && finite(row.allInCostBps) !== null && ts(row.capturedAt) >= entryMs)
    .sort((a, b) => ts(a.capturedAt) - ts(b.capturedAt));
  const crossed = delayed.find((row) => maxCost - row.allInCostBps <= targetHeadroom);
  if (!crossed) return null;
  return round((ts(crossed.capturedAt) - entryMs) / 1000, 3);
}

export function falsePositiveAutopsy(ticket = {}, outcome = {}, later = []) {
  if (outcome?.state !== "PAPER_OUTCOME_RESOLVED" || finite(outcome.netReturnPct) === null || outcome.netReturnPct >= 0) {
    return { state: "AUTOPSY_NOT_APPLICABLE", primaryFailure: null };
  }
  const rows = (Array.isArray(later) ? later : []).filter(Boolean).sort((a, b) => ts(a.observedAt || a.timestamp) - ts(b.observedAt || b.timestamp));
  for (const row of rows) {
    const capitalState = row.capitalArrivalIntelligence?.state || row.capitalArrivalState;
    const vacuum = row.capitalArrivalIntelligence?.supplyVacuumSupported ?? row.supplyVacuumSupported;
    const lineage = row.supplyLineageIntelligence?.vacuumIntegrityState || row.vacuumIntegrityState;
    const refill = row.liquidityRefillState || row.ignitionTwin?.liquidityRefillState;
    if (vacuum === false || String(lineage).includes("THREATENED")) return { state: "AUTOPSY_RESOLVED", primaryFailure: "SUPPLY_REPLENISHED", observedAt: row.observedAt || row.timestamp || null };
    if (capitalState && capitalState !== "COMMITTED_LOADED_VACUUM_SHADOW") return { state: "AUTOPSY_RESOLVED", primaryFailure: "CAPITAL_COMMITMENT_DECAY", observedAt: row.observedAt || row.timestamp || null };
    if (String(refill).includes("FAST") || String(refill).includes("REFILL")) return { state: "AUTOPSY_RESOLVED", primaryFailure: "LIQUIDITY_REPLENISHED", observedAt: row.observedAt || row.timestamp || null };
    if (row.globalMarketRegimeState === "RISK_OFF_STRESS") return { state: "AUTOPSY_RESOLVED", primaryFailure: "REGIME_DOWNSHIFT", observedAt: row.observedAt || row.timestamp || null };
  }
  return { state: "AUTOPSY_UNRESOLVED", primaryFailure: "UNKNOWN_OR_UNOBSERVED" };
}

function blockerRate(tickets = [], name) {
  const rows = tickets.filter((ticket) => (ticket.decisionBlockers || []).includes(name)).length;
  return percent(rows, tickets.length);
}

export function buildExecutableEdgeCanaryLab(tickets = [], replays = [], policyEnvelope = {}, options = {}) {
  const policy = policyEnvelope.policy || {};
  const paper = tickets.filter((row) => row.decisionState === "PAPER_EXECUTE" && row.role === "TREATMENT");
  const controls = tickets.filter((row) => row.decisionState === "PAPER_CONTROL_EXECUTE");
  const rejected = tickets.filter((row) => !["PAPER_EXECUTE", "PAPER_CONTROL_EXECUTE"].includes(row.decisionState));
  const outcomes = paper.map((ticket) => ({ ticket, outcome: resolvePrimaryPaperOutcome(ticket, replays, policy) }));
  const controlOutcomes = controls.map((ticket) => ({ ticket, outcome: resolvePrimaryPaperOutcome(ticket, replays, policy) }));
  const resolved = outcomes.filter((row) => row.outcome.state === "PAPER_OUTCOME_RESOLVED");
  const resolvedControls = controlOutcomes.filter((row) => row.outcome.state === "PAPER_OUTCOME_RESOLVED");
  const returns = resolved.map((row) => row.outcome.netReturnPct).filter((v) => v !== null);
  const falseIgnitions = resolved.filter((row) =>
    finite(row.outcome.maxFavorableExcursionPct) !== null &&
    row.outcome.maxFavorableExcursionPct < Number(policy.primaryExitPolicy?.takeProfitPct ?? 25) &&
    finite(row.outcome.maxAdverseExcursionPct) !== null &&
    row.outcome.maxAdverseExcursionPct <= Number(policy.primaryExitPolicy?.stopLossPct ?? -15)
  ).length;
  const halfLives = paper.map((ticket) => estimateExecutionHeadroomHalfLife(ticket, replays, policy)).filter((v) => v !== null);
  const capacities = paper.map((ticket) => finite(ticket.capacityFrontier?.maximumExecutableNotionalUsd)).filter((v) => v !== null);
  const quoteLatencies = paper.map((ticket) => finite(ticket.primaryEntryQuote?.signalToQuoteLatencyMs)).filter((v) => v !== null);
  const entryCosts = paper.map((ticket) => finite(ticket.primaryEntryQuote?.allInCostBps)).filter((v) => v !== null);
  const uniqueProjects = new Set(paper.map((row) => row.identityKey).filter(Boolean)).size;
  const quoteCovered = tickets.filter((row) => row.primaryEntryQuote?.status === "EXECUTABLE_QUOTE_OBSERVED").length;
  const dataFailures = outcomes.filter((row) => row.outcome.state === "DATA_INTEGRITY_FAILURE").length;
  const matchedControlLifts = [];
  for (const row of resolved) {
    const matching = resolvedControls.filter((control) => control.ticket.parentTreatmentTicketId === row.ticket.ticketId);
    const controlReturns = matching.map((control) => finite(control.outcome.netReturnPct)).filter((v) => v !== null);
    if (controlReturns.length) matchedControlLifts.push(row.outcome.netReturnPct - mean(controlReturns));
  }

  const metrics = {
    tickets: tickets.length,
    paperExecutions: paper.length,
    rejected: rejected.length,
    paperControls: controls.length,
    resolvedPaperExecutions: resolved.length,
    resolvedPaperControls: resolvedControls.length,
    uniqueProjects,
    executableQuoteCoveragePct: percent(quoteCovered, tickets.length),
    dataIntegrityFailurePct: percent(dataFailures, paper.length),
    medianPaperNetReturnPct: round(median(returns), 4),
    meanPaperNetReturnPct: round(mean(returns), 4),
    medianMatchedControlNetReturnLiftPct: round(median(matchedControlLifts), 4),
    winRatePct: percent(returns.filter((v) => v > 0).length, returns.length),
    falseIgnitionPct: percent(falseIgnitions, resolved.length),
    medianMaximumExecutableNotionalUsd: round(median(capacities), 2),
    medianSignalToQuoteLatencyMs: round(median(quoteLatencies), 2),
    medianEntryCostBps: round(median(entryCosts), 2),
    medianExecutionHeadroomHalfLifeSeconds: round(median(halfLives), 2),
    rejectionRatesPct: {
      quoteMissing: blockerRate(tickets, "PRIMARY_EXECUTABLE_QUOTE_MISSING"),
      quoteStale: blockerRate(tickets, "PRIMARY_QUOTE_STALE"),
      impact: blockerRate(tickets, "ENTRY_IMPACT_EXCEEDS_POLICY"),
      cost: blockerRate(tickets, "ENTRY_COST_EXCEEDS_POLICY"),
      liquidity: blockerRate(tickets, "LIQUIDITY_BELOW_POLICY_MINIMUM"),
    },
  };

  const maturity = [];
  if (paper.length < Number(policy.minPaperExecutionsForReview || 50)) maturity.push("NEED_MORE_PAPER_EXECUTIONS");
  if (resolved.length < Number(policy.minResolvedPaperExecutionsForReview || 30)) maturity.push("NEED_MORE_RESOLVED_PAPER_EXECUTIONS");
  if (uniqueProjects < Number(policy.minUniqueProjectsForReview || 20)) maturity.push("NEED_MORE_UNIQUE_PROJECTS");
  if (matchedControlLifts.length < Number(policy.minResolvedMatchedControlPairsForReview ?? 20)) maturity.push("NEED_MORE_RESOLVED_MATCHED_CONTROLS");
  if (metrics.executableQuoteCoveragePct === null || metrics.executableQuoteCoveragePct < Number(policy.minExecutableQuoteCoveragePct || 80)) maturity.push("EXECUTABLE_QUOTE_COVERAGE_TOO_LOW");

  const evidence = [];
  if (!maturity.length) {
    if (metrics.dataIntegrityFailurePct !== null && metrics.dataIntegrityFailurePct > Number(policy.maxDataIntegrityFailurePct || 2)) evidence.push("CANARY_DATA_INTEGRITY_STOP");
    if (metrics.medianSignalToQuoteLatencyMs !== null && metrics.medianSignalToQuoteLatencyMs > Number(policy.maxMedianEntryQuoteLatencyMs || 3000)) evidence.push("CANARY_EDGE_DECAY_TOO_FAST_STOP");
    if (metrics.medianEntryCostBps === null || metrics.medianEntryCostBps > Number(policy.maxMedianExecutionCostBps || 500)) evidence.push("CANARY_EXECUTION_COST_FAILURE_STOP");
    if (metrics.medianMaximumExecutableNotionalUsd === null || metrics.medianMaximumExecutableNotionalUsd < Number(policy.primaryNotionalUsd || 1000)) evidence.push("CANARY_CAPACITY_INSUFFICIENT_STOP");
    if (metrics.medianPaperNetReturnPct === null || metrics.medianPaperNetReturnPct <= Number(policy.minMedianPaperNetReturnPct || 0)) evidence.push("CANARY_SIGNAL_NOT_REPLICATED_STOP");
    if (resolvedControls.length && (metrics.medianMatchedControlNetReturnLiftPct === null || metrics.medianMatchedControlNetReturnLiftPct <= 0)) evidence.push("CANARY_MATCHED_CONTROL_EDGE_NOT_POSITIVE_STOP");
    if (metrics.falseIgnitionPct !== null && metrics.falseIgnitionPct > Number(policy.maxPaperFalseIgnitionPct || 45)) evidence.push("CANARY_DRAWDOWN_STOP");
  }

  let state = "PAPER_CANARY_COLLECTING";
  if (!maturity.length && !evidence.length) state = "PAPER_CANARY_EDGE_SUPPORTED";
  else if (!maturity.length && evidence.length) state = evidence[0];
  else if (paper.length >= Number(policy.minPaperExecutionsForReview || 50)) state = "PAPER_CANARY_MIN_SAMPLE_REACHED";

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    state,
    policyHash: policyEnvelope.specificationHash || null,
    metrics,
    maturityBlockers: maturity,
    evidenceBlockers: evidence,
    canaryReviewState: state === "PAPER_CANARY_EDGE_SUPPORTED" ? "MICRO_LIVE_CANARY_DESIGN_REVIEW" : null,
    paperOnly: true,
    realMoneyOrders: 0,
    automaticLiveTrading: false,
    rankingInfluence: false,
    warning: "Paper outcomes use observed executable quote evidence. They are not guarantees of live fills and cannot authorize real-money trading.",
  };
}

export function runExecutableEdgeCanaryLab(tickets = [], replays = [], policyEnvelope = {}, options = {}) {
  const report = buildExecutableEdgeCanaryLab(tickets, replays, policyEnvelope, options);
  if (options.writeReport !== false) {
    fs.mkdirSync(path.dirname(REPORT), { recursive: true });
    fs.writeFileSync(REPORT, JSON.stringify(report, null, 2) + "\n");
  }
  return report;
}

export const EXECUTABLE_EDGE_CANARY_REPORT = REPORT;
export const __executableEdgeCanaryHooks = { finite, ts, round, percent, mean, blockerRate };
