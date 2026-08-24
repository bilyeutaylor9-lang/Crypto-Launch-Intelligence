import { clamp, finite, mean, percentile, strictIdentityKey, timestamp } from "./productionMath.js";

function side(event = {}) {
  return String(event.side || "").toUpperCase();
}

function notional(event = {}) {
  return Math.max(0, finite(event.usdNotional ?? event.amountUsd ?? event.quoteAmountUsd) || 0);
}

function groupByIdentity(events = []) {
  const groups = new Map();
  for (const event of events) {
    const key = strictIdentityKey(event);
    if (!key) continue;
    groups.set(key, [...(groups.get(key) || []), event]);
  }
  return groups;
}

export function analyzeMicrostructure(events = [], options = {}) {
  const groups = groupByIdentity(Array.isArray(events) ? events : []);
  const rows = [];

  for (const [identityKey, raw] of groups) {
    const ordered = raw
      .filter((e) => timestamp(e.observedAt || e.eventTime) !== null)
      .sort((a, b) => timestamp(a.observedAt || a.eventTime) - timestamp(b.observedAt || b.eventTime));
    const buys = ordered.filter((e) => side(e) === "BUY");
    const sells = ordered.filter((e) => side(e) === "SELL");
    const buyUsd = buys.reduce((sum, e) => sum + notional(e), 0);
    const sellUsd = sells.reduce((sum, e) => sum + notional(e), 0);
    const totalUsd = buyUsd + sellUsd;
    const buyShare = totalUsd ? buyUsd / totalUsd : 0.5;
    const sizes = ordered.map(notional).filter((v) => v > 0);
    const largeThreshold = percentile(sizes, 0.8) || 0;
    const largeBuys = buys.filter((e) => notional(e) >= largeThreshold).length;

    const impacts = ordered
      .map((e) => finite(e.priceImpactBps ?? e.estimatedPriceImpactBps))
      .filter((v) => v !== null);
    const refill = ordered
      .map((e) => finite(e.liquidityRefillPct ?? e.liquidityRefillScore))
      .filter((v) => v !== null);
    const sellerRefill = ordered
      .map((e) => finite(e.sellerReplenishmentPct ?? e.sellLiquidityRefillPct))
      .filter((v) => v !== null);

    const absorptionScore = clamp(
      buyShare * 55 +
      Math.min(25, largeBuys * 3) +
      clamp((mean(refill) ?? 50) / 100, 0, 1) * 20,
      0, 100
    );
    const sellerDepletionScore = clamp(
      60 +
      (buyShare - 0.5) * 60 -
      (mean(sellerRefill) ?? 35) * 0.5,
      0, 100
    );
    const toxicityScore = clamp(
      (1 - buyShare) * 35 +
      Math.max(0, (mean(impacts) ?? 20) - 20) * 0.7 +
      Math.max(0, (mean(sellerRefill) ?? 35) - 50) * 0.5,
      0, 100
    );

    let state = "BALANCED";
    if (absorptionScore >= 70 && sellerDepletionScore >= 65 && toxicityScore <= 45) {
      state = "PRE_BREAKOUT_ABSORPTION";
    } else if (toxicityScore >= 65) {
      state = "TOXIC_FLOW";
    } else if (buyShare >= 0.62) {
      state = "BUYER_DOMINANT";
    } else if (buyShare <= 0.38) {
      state = "SELLER_DOMINANT";
    }

    rows.push({
      identityKey,
      samples: ordered.length,
      buyUsd,
      sellUsd,
      netFlowUsd: buyUsd - sellUsd,
      buyShare,
      medianTradeUsd: percentile(sizes, 0.5),
      largeBuyCount: largeBuys,
      averagePriceImpactBps: mean(impacts),
      averageLiquidityRefill: mean(refill),
      averageSellerReplenishment: mean(sellerRefill),
      absorptionScore,
      sellerDepletionScore,
      toxicityScore,
      state,
      researchOnly: true,
    });
  }

  return {
    schemaVersion: 1,
    generatedAt: options.now || new Date().toISOString(),
    projects: rows.sort((a, b) => b.absorptionScore - a.absorptionScore),
    policy: { automaticTrading: false, calibratedForecast: false },
  };
}
