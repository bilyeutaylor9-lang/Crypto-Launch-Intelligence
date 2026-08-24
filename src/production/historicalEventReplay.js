import { timestamp } from "./productionMath.js";
import { normalizeMarketEvent } from "./streamingEventRouter.js";

export function auditReplayEvents(events = [], options = {}) {
  const cutoff = timestamp(options.cutoff || "9999-12-31T23:59:59.999Z");
  const normalized=[]; const rejected=[];
  for (const raw of Array.isArray(events) ? events : []) {
    try {
      const event=normalizeMarketEvent(raw); const at=timestamp(event.observedAt);
      if (cutoff !== null && at > cutoff) rejected.push({ eventId:event.eventId, reason:"FUTURE_EVENT_AFTER_REPLAY_CUTOFF", observedAt:event.observedAt });
      else normalized.push(event);
    } catch (error) { rejected.push({ eventId: raw?.eventId || null, reason:error.message || "INVALID_EVENT" }); }
  }
  normalized.sort((a,b)=>timestamp(a.observedAt)-timestamp(b.observedAt) || a.eventId.localeCompare(b.eventId));
  return { valid: rejected.length===0, events:normalized, rejected };
}

export function replayMarketEvents(events = [], reducer, initialState = {}, options = {}) {
  const audit=auditReplayEvents(events, options); let state=structuredClone(initialState); const trace=[];
  for (const event of audit.events) {
    state = typeof reducer === "function" ? reducer(state, event) : state;
    trace.push({ eventId:event.eventId, observedAt:event.observedAt, type:event.type, state: options.captureState === false ? undefined : structuredClone(state) });
  }
  return { schemaVersion:1, cutoff:options.cutoff || null, audit:{ valid:audit.valid, rejected:audit.rejected, replayedEvents:audit.events.length }, finalState:state, trace };
}
