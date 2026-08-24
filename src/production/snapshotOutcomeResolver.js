import { finite, strictIdentityKey, strictRouteKey, timestamp } from "./productionMath.js";

function snapshotRoute(row = {}) {
  return strictRouteKey(row);
}

export function resolveSnapshotOutcomes(snapshots = [], options = {}) {
  const horizonHours = Number(options.horizonHours || 24);
  const toleranceHours = Number(options.toleranceHours || Math.max(1, horizonHours * 0.35));
  const byIdentity = new Map();

  for (const row of Array.isArray(snapshots) ? snapshots : []) {
    const key = snapshotRoute(row);
    const at = timestamp(row.timestamp || row.observedAt);
    const price = finite(row.priceUsd);
    if (!key || at === null || price === null || price <= 0) continue;
    if (!byIdentity.has(key)) byIdentity.set(key, []);
    byIdentity.get(key).push({ ...row, __at: at, __price: price });
  }
  for (const rows of byIdentity.values()) rows.sort((a, b) => a.__at - b.__at);

  const outcomes = [];
  for (const [key, rows] of byIdentity.entries()) {
    for (let index = 0; index < rows.length; index += 1) {
      const start = rows[index];
      const target = start.__at + horizonHours * 3_600_000;
      const max = target + toleranceHours * 3_600_000;
      const match = rows.find((row) => row.__at >= target && row.__at <= max);
      if (!match) continue;
      const returnPct = ((match.__price / start.__price) - 1) * 100;
      outcomes.push({
        identityKey: strictIdentityKey(start),
        routeKey: key,
        symbol: start.symbol || match.symbol || null,
        chain: start.chain || match.chain || null,
        tokenAddress: start.tokenAddress || match.tokenAddress || null,
        poolAddress: start.poolAddress || match.poolAddress || null,
        startAt: start.timestamp || start.observedAt,
        observedAt: match.timestamp || match.observedAt,
        horizonHours,
        startPriceUsd: start.__price,
        priceUsd: match.__price,
        liquidityUsd: finite(start.liquidityUsd ?? start.dexLiquidityUsd ?? start.activeLiquidityUsd),
        marketCapUsd: finite(start.marketCapUsd ?? start.marketCap ?? start.circulatingMarketCapUsd),
        volume24hUsd: finite(start.volume24hUsd ?? start.volume24h ?? start.dexVolumeUsd),
        evidenceCoveragePct: finite(start.evidenceCoveragePct ?? start.dataConfidence),
        globalMarketRegimeState: start.globalMarketRegimeState ?? start.marketRegime ?? null,
        returnPct,
      });
    }
  }
  return outcomes;
}
