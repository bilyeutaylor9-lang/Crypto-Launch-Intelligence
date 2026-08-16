
import { collectExecutableQuoteCurve, collectReplayQuote } from "./executableQuoteTruthEngine.js";
import { buildCanaryTicket, appendCanaryTickets } from "./canaryTicketStore.js";
import { appendCanaryReplayQuotes } from "./canaryReplayStore.js";
import { selectContemporaneousCanaryControls } from "./canaryControlSelector.js";

export async function captureExecutableEdgeCanary(projects = [], policyEnvelope = {}, governance = {}, options = {}) {
  const policy = policyEnvelope.policy || {};
  const candidates = (Array.isArray(projects) ? projects : []).filter((project) => {
    const state = project.capitalArrivalIntelligence?.state || project.capitalArrivalState;
    return state === policy.signalState;
  });
  const tickets = [];
  for (const project of candidates.slice(0, Math.max(1, Number(options.maxCandidates || 20)))) {
    const signalObservedAt = project.observedAt || project.scannedAt || options.signalObservedAt || new Date().toISOString();
    const quoteCurve = await collectExecutableQuoteCurve(project, policy, {
      ...options,
      signalObservedAt,
    });
    const treatmentTicket = buildCanaryTicket(project, quoteCurve, policyEnvelope, governance, { signalObservedAt, role: "TREATMENT" });
    tickets.push(treatmentTicket);

    if (options.captureControls !== false) {
      const controls = selectContemporaneousCanaryControls(project, projects, options);
      for (const selected of controls) {
        const controlProject = { ...selected.project, observedAt: signalObservedAt };
        const controlCurve = await collectExecutableQuoteCurve(controlProject, policy, { ...options, signalObservedAt });
        tickets.push(buildCanaryTicket(controlProject, controlCurve, policyEnvelope, governance, {
          signalObservedAt,
          role: selected.role,
          parentTreatmentTicketId: treatmentTicket.ticketId,
        }));
      }
    }
  }
  const saved = options.persist === false ? { saved: 0, tickets: [] } : appendCanaryTickets(tickets, options);
  return {
    state: tickets.length ? "CANARY_TICKETS_CAPTURED" : "NO_ELIGIBLE_SIGNAL_CANDIDATES",
    candidates: candidates.length,
    tickets,
    saved: saved.saved || 0,
    paperOnly: true,
    realMoneyOrders: 0,
  };
}

export async function replayExecutableEdgeCanary(tickets = [], policyEnvelope = {}, options = {}) {
  const policy = policyEnvelope.policy || {};
  const now = options.now || new Date().toISOString();
  const nowMs = Date.parse(now);
  const rows = [];
  for (const ticket of (Array.isArray(tickets) ? tickets : []).filter((row) => ["PAPER_EXECUTE", "PAPER_CONTROL_EXECUTE"].includes(row.decisionState))) {
    const entryMs = Date.parse(ticket.primaryEntryQuote?.capturedAt || ticket.signalObservedAt || "");
    if (!Number.isFinite(entryMs) || !Number.isFinite(nowMs) || nowMs < entryMs) continue;
    const elapsedSec = Math.floor((nowMs - entryMs) / 1000);
    for (const delay of policy.replayDelaysSeconds || []) {
      if (elapsedSec >= Number(delay)) {
        const already = (options.existingReplays || []).some((row) =>
          row.ticketId === ticket.ticketId && row.kind === "ENTRY_DELAY_BUY" && Number(row.delaySeconds) === Number(delay)
        );
        if (!already) rows.push(await collectReplayQuote(ticket, "ENTRY_DELAY_BUY", Number(delay), options));
      }
    }
    rows.push(await collectReplayQuote(ticket, "EXIT_MARK", elapsedSec, options));
  }
  const saved = options.persist === false ? { saved: 0 } : appendCanaryReplayQuotes(rows, options);
  return { state: rows.length ? "CANARY_REPLAY_QUOTES_CAPTURED" : "NO_ACTIVE_PAPER_TICKETS", rows, saved: saved.saved || 0, paperOnly: true };
}
