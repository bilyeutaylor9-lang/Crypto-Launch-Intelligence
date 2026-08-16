import { mean, num } from "../edge/edgeMath.js";

function latestObservedWindow(project = {}) {
  const windows = project.realTimeTradeFlow?.windows || {};
  return windows["5m"] || windows["15m"] || windows["1m"] || null;
}

export function analyzeLocalMarketState(project = {}) {
  const flow = project.realTimeTradeFlow || {};
  const window = latestObservedWindow(project);
  if (!window || flow.evidenceMode !== "OBSERVED_TRADE_TAPE") {
    return {
      ...project,
      localMarketState: {
        state: "UNKNOWN",
        confidence: 0,
        evidenceMode: flow.evidenceMode || "UNOBSERVED",
        shadowOnly: true,
      },
      localMarketStateName: "UNKNOWN",
    };
  }

  const ofi = num(window.orderFlowImbalance) || 0;
  const liquidity = num(window.liquidityDeltaPct) || 0;
  const price = num(window.priceDeltaPct) || 0;
  const response = num(window.priceResponseEfficiency);
  const repeated = num(window.repeatedWalletSharePct) || 0;

  let state = "BALANCED";
  if (ofi >= 0.25 && liquidity >= 2 && price >= 0 && repeated < 55) state = "HEALTHY_ACCUMULATION";
  else if (ofi >= 0.25 && liquidity < 0) state = "FRAGILE_BUYING";
  else if (ofi >= 0.35 && response !== null && Math.abs(response) < 0.25) state = "ABSORPTION";
  else if (ofi <= -0.25 && price >= -1) state = "DISTRIBUTION";
  else if (liquidity <= -8) state = "LIQUIDITY_WITHDRAWAL";
  else if (ofi >= 0.2 && price >= 3 && liquidity >= 0) state = "BREAKOUT_ACCEPTANCE";
  else if (price >= 5 && liquidity < -2) state = "FRAGILE_BREAKOUT";
  else if (liquidity >= 8 && Math.abs(price) < 3) state = "LIQUIDITY_EXPANSION";

  const confidence = Math.round(mean([
    window.evidenceCoveragePct,
    flow.windowCount >= 3 ? 90 : flow.windowCount === 2 ? 72 : 55,
    repeated < 60 ? 80 : 45,
  ]) || 0);

  return {
    ...project,
    localMarketState: {
      state,
      confidence,
      evidenceMode: "OBSERVED_TRADE_TAPE",
      evidence: {
        orderFlowImbalance: window.orderFlowImbalance,
        liquidityDeltaPct: window.liquidityDeltaPct,
        priceDeltaPct: window.priceDeltaPct,
        priceResponseEfficiency: window.priceResponseEfficiency,
        repeatedWalletSharePct: window.repeatedWalletSharePct,
      },
      shadowOnly: true,
      rankingInfluence: false,
    },
    localMarketStateName: state,
    localMarketStateConfidence: confidence,
  };
}

export function analyzeLocalMarketStateBatch(projects = []) {
  return (Array.isArray(projects) ? projects : []).map(analyzeLocalMarketState);
}
