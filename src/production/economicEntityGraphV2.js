import { clamp, finite, stableHash, timestamp } from "./productionMath.js";

class UnionFind {
  constructor(values = []) {
    this.parent = new Map(values.map((value) => [value, value]));
  }
  find(value) {
    if (!this.parent.has(value)) this.parent.set(value, value);
    const parent = this.parent.get(value);
    if (parent !== value) this.parent.set(value, this.find(parent));
    return this.parent.get(value);
  }
  union(left, right) {
    const a = this.find(left);
    const b = this.find(right);
    if (a !== b) this.parent.set(b, a);
  }
}

function actor(row = {}) {
  return String(row.actorAddress || row.walletAddress || row.economicActorAddress || "").trim().toLowerCase() || null;
}

export function buildEconomicEntityGraph(events = [], outcomes = [], options = {}) {
  const actors = [...new Set((Array.isArray(events) ? events : []).map(actor).filter(Boolean))];
  const uf = new UnionFind(actors);
  const relations = [];

  for (const event of Array.isArray(events) ? events : []) {
    const a = actor(event);
    if (!a) continue;
    for (const linked of [
      event.fundedBy,
      event.bridgeOriginAddress,
      event.commonFundingAddress,
      event.lpOwnerAddress,
      ...(Array.isArray(event.relatedWallets) ? event.relatedWallets : []),
    ].filter(Boolean)) {
      const b = String(linked).toLowerCase();
      const confidence = finite(event.entityLinkConfidencePct ?? event.actorResolutionConfidencePct) ?? 70;
      relations.push({ left: a, right: b, confidence, type: event.linkType || "OBSERVED_RELATION" });
      if (confidence >= Number(options.minimumMergeConfidencePct || 80)) uf.union(a, b);
    }
  }

  const clusters = new Map();
  for (const value of new Set([...actors, ...relations.flatMap((r) => [r.left, r.right])])) {
    const root = uf.find(value);
    clusters.set(root, [...(clusters.get(root) || []), value]);
  }

  const outcomeRows = Array.isArray(outcomes) ? outcomes : [];
  const entities = [...clusters.values()].map((wallets) => {
    const walletSet = new Set(wallets);
    const matched = outcomeRows.filter((row) => walletSet.has(actor(row)));
    const resolved = matched
      .map((row) => finite(row.realizedReturnPct ?? row.returnPct))
      .filter((v) => v !== null);
    const wins = resolved.filter((v) => v >= 25).length;
    const hitRate = resolved.length ? wins / resolved.length : null;
    const medianLeadHours = matched
      .map((row) => finite(row.leadTimeHours))
      .filter((v) => v !== null)
      .sort((a, b) => a - b);
    const medianLead = medianLeadHours.length
      ? medianLeadHours[Math.floor(medianLeadHours.length / 2)]
      : null;
    const reputationScore = clamp(
      (hitRate ?? 0.5) * 65 +
      Math.min(20, resolved.length * 0.75) +
      (medianLead !== null ? Math.min(15, medianLead * 1.5) : 0),
      0, 100
    );
    return {
      entityId: `entity:${stableHash(wallets.sort()).slice(0, 20)}`,
      wallets: wallets.sort(),
      walletCount: wallets.length,
      forwardSamples: resolved.length,
      hitRate25: hitRate,
      medianLeadTimeHours: medianLead,
      reputationScore,
    };
  });

  return {
    schemaVersion: 2,
    generatedAt: options.now || new Date().toISOString(),
    entities: entities.sort((a, b) => b.reputationScore - a.reputationScore),
    relations,
    policy: {
      highConfidenceMergeOnly: true,
      entityReputationForwardEvidenceOnly: true,
      automaticTrading: false,
    },
  };
}
