import { clamp, mean, num } from "../edge/edgeMath.js";

function normalizeWindow(raw = {}) {
  const buyVolumeUsd = num(raw.buyVolumeUsd ?? raw.buyVolume ?? raw.volumeBuyUsd);
  const sellVolumeUsd = num(raw.sellVolumeUsd ?? raw.sellVolume ?? raw.volumeSellUsd);
  const buyCount = num(raw.buyCount ?? raw.buySwaps ?? raw.buys ?? raw.buyTransactions);
  const sellCount = num(raw.sellCount ?? raw.sellSwaps ?? raw.sells ?? raw.sellTransactions);
  const uniqueBuyers = num(raw.uniqueBuyers ?? raw.buyers);
  const uniqueSellers = num(raw.uniqueSellers ?? raw.sellers);
  const liquidityStartUsd = num(raw.liquidityStartUsd ?? raw.startLiquidityUsd);
  const liquidityEndUsd = num(raw.liquidityEndUsd ?? raw.endLiquidityUsd);
  const priceStartUsd = num(raw.priceStartUsd ?? raw.startPriceUsd);
  const priceEndUsd = num(raw.priceEndUsd ?? raw.endPriceUsd);
  const repeatedWalletSharePct = num(raw.repeatedWalletSharePct);
  const largestBuyerSharePct = num(raw.largestBuyerSharePct);

  const totalFlow = (buyVolumeUsd ?? 0) + (sellVolumeUsd ?? 0);
  const netAggressiveVolumeUsd = buyVolumeUsd !== null && sellVolumeUsd !== null
    ? buyVolumeUsd - sellVolumeUsd
    : null;
  const orderFlowImbalance = totalFlow > 0 && netAggressiveVolumeUsd !== null
    ? netAggressiveVolumeUsd / totalFlow
    : null;
  const liquidityDeltaPct = liquidityStartUsd && liquidityEndUsd
    ? ((liquidityEndUsd - liquidityStartUsd) / liquidityStartUsd) * 100
    : null;
  const priceDeltaPct = priceStartUsd && priceEndUsd
    ? ((priceEndUsd - priceStartUsd) / priceStartUsd) * 100
    : null;
  const referenceLiquidity = mean([liquidityStartUsd, liquidityEndUsd]);
  const liquidityAdjustedImpulse = referenceLiquidity && netAggressiveVolumeUsd !== null
    ? (netAggressiveVolumeUsd / referenceLiquidity) * 100
    : null;
  const priceResponseEfficiency = liquidityAdjustedImpulse && priceDeltaPct !== null
    ? priceDeltaPct / Math.max(Math.abs(liquidityAdjustedImpulse), 0.0001)
    : null;

  const coverage = [
    buyVolumeUsd,
    sellVolumeUsd,
    buyCount,
    sellCount,
    uniqueBuyers,
    uniqueSellers,
    liquidityStartUsd,
    liquidityEndUsd,
    priceStartUsd,
    priceEndUsd,
  ].filter((value) => value !== null).length / 10;

  return {
    buyVolumeUsd,
    sellVolumeUsd,
    buyCount,
    sellCount,
    uniqueBuyers,
    uniqueSellers,
    repeatedWalletSharePct,
    largestBuyerSharePct,
    liquidityStartUsd,
    liquidityEndUsd,
    priceStartUsd,
    priceEndUsd,
    netAggressiveVolumeUsd,
    orderFlowImbalance,
    liquidityDeltaPct,
    priceDeltaPct,
    liquidityAdjustedImpulse,
    priceResponseEfficiency,
    evidenceCoveragePct: Math.round(coverage * 100),
  };
}

function rawWindows(project = {}) {
  const source = project.marketMicrostructure?.windows || project.tradeFlowWindows || project.realTimeTradeFlow?.rawWindows || {};
  return {
    "1m": source["1m"] || source.m1 || null,
    "5m": source["5m"] || source.m5 || null,
    "15m": source["15m"] || source.m15 || null,
  };
}

export function analyzeRealTimeTradeFlow(project = {}) {
  const source = rawWindows(project);
  const windows = Object.fromEntries(
    Object.entries(source).flatMap(([key, raw]) => raw && typeof raw === "object" ? [[key, normalizeWindow(raw)]] : [])
  );
  const observed = Object.values(windows).filter((window) => window.evidenceCoveragePct >= 40);

  if (!observed.length) {
    const fallback = mean([
      project.capitalFlowScore,
      project.buyPressureScore,
      project.buyerBreadthAccelerationScore,
      project.liquidityExpansionScore,
    ]);
    return {
      ...project,
      realTimeTradeFlow: {
        state: fallback === null ? "UNOBSERVED" : "DERIVED_FALLBACK_ONLY",
        evidenceMode: fallback === null ? "NO_TRADE_TAPE" : "DERIVED_EXISTING_SCORES",
        flowScore: fallback === null ? null : Math.round(fallback),
        windows: {},
        shadowOnly: true,
      },
      realTimeTradeFlowScore: fallback === null ? 0 : Math.round(fallback),
      realTimeTradeFlowEvidenceMode: fallback === null ? "UNOBSERVED" : "DERIVED_FALLBACK_ONLY",
    };
  }

  const flowScores = observed.map((window) => {
    const imbalance = window.orderFlowImbalance === null ? 50 : clamp(50 + window.orderFlowImbalance * 50);
    const impulse = window.liquidityAdjustedImpulse === null ? 50 : clamp(50 + window.liquidityAdjustedImpulse * 2.5);
    const liquidity = window.liquidityDeltaPct === null ? 50 : clamp(50 + window.liquidityDeltaPct * 2);
    const concentrationPenalty = Math.max(
      num(window.repeatedWalletSharePct) || 0,
      num(window.largestBuyerSharePct) || 0
    );
    return clamp(mean([imbalance, impulse, liquidity]) - concentrationPenalty * 0.25);
  });
  const flowScore = Math.round(mean(flowScores) || 0);
  const state = flowScore >= 72 ? "OBSERVED_BUY_FLOW_STRONG" : flowScore >= 58 ? "OBSERVED_BUY_FLOW_POSITIVE" : flowScore <= 38 ? "OBSERVED_SELL_FLOW_DOMINANT" : "OBSERVED_FLOW_BALANCED";

  return {
    ...project,
    realTimeTradeFlow: {
      state,
      evidenceMode: "OBSERVED_TRADE_TAPE",
      flowScore,
      windows,
      windowCount: observed.length,
      shadowOnly: true,
      rankingInfluence: false,
    },
    realTimeTradeFlowScore: flowScore,
    realTimeTradeFlowEvidenceMode: "OBSERVED_TRADE_TAPE",
  };
}

export function analyzeRealTimeTradeFlowBatch(projects = []) {
  return (Array.isArray(projects) ? projects : []).map(analyzeRealTimeTradeFlow);
}
