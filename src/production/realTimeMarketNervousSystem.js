import { finite, stableHash, strictIdentity, timestamp } from "./productionMath.js";

function eventTime(event = {}) {
  return timestamp(event.observedAt || event.eventTime || event.blockTime || event.timestamp);
}

function eventType(event = {}) {
  return String(event.type || event.eventType || event.kind || "UNKNOWN").toUpperCase();
}

export function normalizeMarketEvent(event = {}, options = {}) {
  const identity = strictIdentity(event);
  const at = eventTime(event);
  if (!identity || at === null) return null;

  const normalized = {
    schemaVersion: 1,
    eventId: event.eventId || event.txHash || stableHash({
      routeKey: identity.routeKey,
      at,
      type: eventType(event),
      side: event.side || null,
      usdNotional: finite(event.usdNotional ?? event.amountUsd ?? event.quoteAmountUsd),
    }).slice(0, 32),
    observedAt: new Date(at).toISOString(),
    type: eventType(event),
    side: String(event.side || "").toUpperCase() || null,
    ...identity,
    actorAddress: event.economicActorAddress || event.actorAddress || event.walletAddress || null,
    entityId: event.entityId || null,
    usdNotional: finite(event.usdNotional ?? event.amountUsd ?? event.quoteAmountUsd),
    priceUsd: finite(event.priceUsd ?? event.price),
    liquidityUsd: finite(event.liquidityUsd ?? event.activeLiquidityUsd),
    source: event.source || options.source || null,
    provenance: event.provenance || null,
    researchOnly: true,
  };
  return normalized;
}

export function buildRealtimeEventFabric(events = [], options = {}) {
  const cutoffMs = timestamp(options.asOf || new Date().toISOString());
  const maxEvents = Math.max(1, Number(options.maxEvents || 50_000));
  const deduped = new Map();

  for (const event of Array.isArray(events) ? events : []) {
    const normalized = normalizeMarketEvent(event, options);
    if (!normalized) continue;
    const at = timestamp(normalized.observedAt);
    if (cutoffMs !== null && at > cutoffMs) continue;
    if (!deduped.has(normalized.eventId)) deduped.set(normalized.eventId, normalized);
  }

  const ordered = [...deduped.values()]
    .sort((a, b) => timestamp(a.observedAt) - timestamp(b.observedAt))
    .slice(-maxEvents);

  const affected = new Map();
  for (const event of ordered) {
    const bucket = affected.get(event.identityKey) || {
      identityKey: event.identityKey,
      routeKeys: new Set(),
      eventCount: 0,
      lastObservedAt: null,
      eventTypes: new Map(),
      netQualifiedFlowUsd: 0,
    };
    bucket.routeKeys.add(event.routeKey);
    bucket.eventCount += 1;
    bucket.lastObservedAt = event.observedAt;
    bucket.eventTypes.set(event.type, (bucket.eventTypes.get(event.type) || 0) + 1);
    const notional = finite(event.usdNotional) || 0;
    if (event.side === "BUY") bucket.netQualifiedFlowUsd += notional;
    if (event.side === "SELL") bucket.netQualifiedFlowUsd -= notional;
    affected.set(event.identityKey, bucket);
  }

  const affectedProjects = [...affected.values()].map((row) => ({
    ...row,
    routeKeys: [...row.routeKeys],
    eventTypes: Object.fromEntries(row.eventTypes),
  }));

  return {
    schemaVersion: 1,
    generatedAt: options.asOf || new Date().toISOString(),
    state: ordered.length ? "REALTIME_EVENT_FABRIC_ACTIVE" : "NO_EXACT_EVENTS",
    acceptedEvents: ordered.length,
    affectedProjects: affectedProjects.length,
    events: ordered,
    projectUpdates: affectedProjects,
    policy: {
      exactIdentityRequired: true,
      futureEventsRejected: true,
      incrementalUpdatePreferred: true,
      automaticTrading: false,
    },
  };
}
