import { identityKey, stableHash, timestamp } from "./productionMath.js";

export function normalizeMarketEvent(event = {}, options = {}) {
  const at = event.observedAt || event.timestamp || options.now || new Date().toISOString();
  const parsed = timestamp(at);
  if (parsed === null) throw new Error("INVALID_EVENT_TIMESTAMP");
  return {
    eventId: event.eventId || `evt:${stableHash({ ...event, at }).slice(0,20)}`,
    observedAt: new Date(parsed).toISOString(),
    type: String(event.type || event.eventType || "UNKNOWN").toUpperCase(),
    identityKey: event.identityKey || (event.tokenAddress || event.symbol ? identityKey(event) : null),
    chain: event.chain || null,
    tokenAddress: event.tokenAddress || event.contractAddress || null,
    poolAddress: event.poolAddress || event.pairAddress || null,
    wallet: event.wallet || event.from || null,
    counterparty: event.counterparty || event.to || null,
    amountUsd: event.amountUsd ?? null,
    priceUsd: event.priceUsd ?? null,
    liquidityUsd: event.liquidityUsd ?? null,
    source: event.source || "unknown",
    payload: event.payload || null,
  };
}

export function routeMarketEvent(event = {}, indexes = {}) {
  const normalized = normalizeMarketEvent(event);
  const impacted = new Set();
  if (normalized.identityKey) impacted.add(normalized.identityKey);
  const walletEntities = indexes.walletToEntity || {};
  const entityId = normalized.wallet ? walletEntities[normalized.wallet] : null;
  if (entityId) for (const key of indexes.entityProjects?.[entityId] || []) impacted.add(key);
  if (normalized.chain) for (const key of indexes.chainProjects?.[String(normalized.chain).toLowerCase()] || []) impacted.add(key);
  return { event: normalized, entityId: entityId || null, impactedIdentityKeys: [...impacted], routingState: impacted.size ? "ROUTED" : "UNROUTED" };
}
