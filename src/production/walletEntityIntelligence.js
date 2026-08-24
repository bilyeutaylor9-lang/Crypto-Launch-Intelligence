import { clamp, finite, mean, stableHash, timestamp, wilsonLowerBound } from "./productionMath.js";

class UnionFind {
  constructor(values = []) { this.parent = new Map(values.map((v) => [v, v])); }
  find(value) {
    if (!this.parent.has(value)) this.parent.set(value, value);
    const p = this.parent.get(value);
    if (p !== value) this.parent.set(value, this.find(p));
    return this.parent.get(value);
  }
  union(a, b) { const ra = this.find(a); const rb = this.find(b); if (ra !== rb) this.parent.set(rb, ra); }
}

function walletOf(event = {}) { return String(event.wallet || event.from || "").trim(); }
function counterpartyOf(event = {}) { return String(event.counterparty || event.to || "").trim(); }
function typeOf(event = {}) { return String(event.type || event.eventType || "OTHER").toUpperCase(); }
function isFundingType(type = "") { return /CEX|EXCHANGE|BRIDGE|STABLE|FUND|TRANSFER/.test(type); }
function isBuyType(type = "") { return /BUY|SWAP_IN/.test(type); }
function isSellType(type = "") { return /SELL|SWAP_OUT/.test(type); }

export function buildWalletEntityGraph(events = [], options = {}) {
  const rows = (Array.isArray(events) ? events : []).filter((event) => walletOf(event));
  const wallets = [...new Set(rows.map(walletOf))];
  const uf = new UnionFind(wallets);
  const byCounterparty = new Map();

  for (const event of rows) {
    const wallet = walletOf(event);
    const counterparty = counterpartyOf(event);
    const type = typeOf(event);
    if (!counterparty || !isFundingType(type)) continue;
    if (!byCounterparty.has(counterparty)) byCounterparty.set(counterparty, []);
    byCounterparty.get(counterparty).push({ wallet, at: timestamp(event.timestamp || event.observedAt), type });
  }

  const sharedFundingWindowMinutes = Math.max(1, Number(options.sharedFundingWindowMinutes || 90));
  for (const linked of byCounterparty.values()) {
    for (let i = 0; i < linked.length; i += 1) {
      for (let j = i + 1; j < linked.length; j += 1) {
        const a = linked[i]; const b = linked[j];
        if (a.wallet === b.wallet || a.at === null || b.at === null) continue;
        if (Math.abs(a.at - b.at) <= sharedFundingWindowMinutes * 60_000) uf.union(a.wallet, b.wallet);
      }
    }
  }

  for (const event of rows) {
    const wallet = walletOf(event);
    const counterparty = counterpartyOf(event);
    if (counterparty && wallets.includes(counterparty) && /TRANSFER/.test(typeOf(event))) uf.union(wallet, counterparty);
  }

  const clusters = new Map();
  for (const wallet of wallets) {
    const root = uf.find(wallet);
    if (!clusters.has(root)) clusters.set(root, []);
    clusters.get(root).push(wallet);
  }

  const entities = [...clusters.values()].map((members) => {
    const memberSet = new Set(members);
    const entityEvents = rows.filter((event) => memberSet.has(walletOf(event)));
    const fundingCounterparties = [...new Set(entityEvents.filter((event) => isFundingType(typeOf(event))).map(counterpartyOf).filter(Boolean))];
    const buyUsd = entityEvents.filter((event) => isBuyType(typeOf(event))).reduce((sum, row) => sum + Math.abs(finite(row.amountUsd) ?? 0), 0);
    const sellUsd = entityEvents.filter((event) => isSellType(typeOf(event))).reduce((sum, row) => sum + Math.abs(finite(row.amountUsd) ?? 0), 0);
    const netObservedUsd = entityEvents.reduce((sum, row) => sum + (finite(row.amountUsd) ?? 0), 0);
    const entityId = `entity:${stableHash([...members].sort()).slice(0, 16)}`;
    return {
      entityId,
      wallets: [...members].sort(),
      walletCount: members.length,
      eventCount: entityEvents.length,
      fundingCounterparties,
      buyUsd,
      sellUsd,
      netObservedUsd,
      buySellRatio: sellUsd > 0 ? buyUsd / sellUsd : buyUsd > 0 ? null : 0,
      firstObservedAt: entityEvents.map((e) => timestamp(e.timestamp || e.observedAt)).filter((v) => v !== null).sort((a,b)=>a-b).map((v)=>new Date(v).toISOString())[0] || null,
      lastObservedAt: entityEvents.map((e) => timestamp(e.timestamp || e.observedAt)).filter((v) => v !== null).sort((a,b)=>a-b).map((v)=>new Date(v).toISOString()).at(-1) || null,
    };
  }).sort((a, b) => b.netObservedUsd - a.netObservedUsd);

  const walletToEntity = Object.fromEntries(entities.flatMap((entity) => entity.wallets.map((wallet) => [wallet, entity.entityId])));
  return { schemaVersion: 1, entities, walletToEntity, events: rows.length, wallets: wallets.length };
}

export function scoreWalletEntityReputation(entity = {}, forwardRows = [], options = {}) {
  const rows = (Array.isArray(forwardRows) ? forwardRows : []).filter((row) => row.entityId === entity.entityId);
  const target = Number(options.targetReturnPct || 25);
  const returns = rows.map((row) => finite(row.realizedReturnPct ?? row.returnPct)).filter((v) => v !== null);
  const wins = returns.filter((v) => v >= target).length;
  const losses = returns.filter((v) => v <= Number(options.failureReturnPct || -20)).length;
  const lower = wilsonLowerBound(wins, returns.length);
  const average = mean(returns);
  const sampleCredibility = clamp(returns.length / Number(options.fullCredibilitySamples || 50));
  const score = clamp((lower * 0.65 + clamp(((average ?? 0) + 20) / 80) * 0.25 + (1 - (returns.length ? losses / returns.length : 0)) * 0.10) * sampleCredibility) * 100;
  return {
    entityId: entity.entityId,
    samples: returns.length,
    wins,
    losses,
    hitRate: returns.length ? wins / returns.length : null,
    wilsonLowerBound: lower,
    averageReturnPct: average,
    reputationScore: Number(score.toFixed(2)),
    state: returns.length < 10 ? "INSUFFICIENT_FORWARD_HISTORY" : score >= 65 ? "HIGH_QUALITY_ENTITY" : score >= 45 ? "MIXED_ENTITY" : "LOW_CONFIDENCE_ENTITY",
  };
}

export function attachWalletEntitiesToEvents(events = [], graph = {}) {
  return (Array.isArray(events) ? events : []).map((event) => ({ ...event, entityId: graph.walletToEntity?.[walletOf(event)] || null }));
}
