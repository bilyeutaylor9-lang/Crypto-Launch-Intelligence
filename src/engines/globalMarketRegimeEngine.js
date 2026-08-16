import { mean, num } from "../edge/edgeMath.js";

export function analyzeGlobalMarketRegimeSnapshot(snapshot = {}) {
  const inputs = {
    btcReturn24hPct: num(snapshot.btcReturn24hPct),
    ethReturn24hPct: num(snapshot.ethReturn24hPct),
    altBreadthPct: num(snapshot.altBreadthPct),
    dexVolumeChangePct: num(snapshot.dexVolumeChangePct),
    stablecoinLiquidityChangePct: num(snapshot.stablecoinLiquidityChangePct),
    marketVolatilityPercentile: num(snapshot.marketVolatilityPercentile),
    newPoolFormationChangePct: num(snapshot.newPoolFormationChangePct),
  };
  const observed = Object.values(inputs).filter((value) => value !== null).length;
  if (observed < 4) {
    return {
      state: "UNOBSERVED",
      confidence: 0,
      observedInputs: observed,
      inputs,
      reason: "Global regime requires at least four explicit market-wide observations; per-token returns are not substituted.",
      shadowOnly: true,
    };
  }

  const directional = mean([
    inputs.btcReturn24hPct === null ? null : 50 + inputs.btcReturn24hPct * 3,
    inputs.ethReturn24hPct === null ? null : 50 + inputs.ethReturn24hPct * 3,
    inputs.altBreadthPct,
    inputs.dexVolumeChangePct === null ? null : 50 + inputs.dexVolumeChangePct,
    inputs.stablecoinLiquidityChangePct === null ? null : 50 + inputs.stablecoinLiquidityChangePct * 4,
    inputs.newPoolFormationChangePct === null ? null : 50 + inputs.newPoolFormationChangePct,
  ]);
  const stress = inputs.marketVolatilityPercentile ?? 50;
  const state = directional >= 65 && stress < 80
    ? "RISK_ON_EXPANSION"
    : directional >= 58
      ? "RISK_ON_FRAGILE"
      : directional <= 38 || stress >= 90
        ? "RISK_OFF_STRESS"
        : "NEUTRAL_SELECTIVE";
  return {
    state,
    confidence: Math.round(Math.min(100, observed / 7 * 100)),
    observedInputs: observed,
    inputs,
    directionalScore: Math.round(directional || 0),
    shadowOnly: true,
  };
}

export function attachGlobalMarketRegimeBatch(projects = [], options = {}) {
  const snapshot = options.globalSnapshot || projects?.[0]?.globalMarketSnapshot || {};
  const regime = analyzeGlobalMarketRegimeSnapshot(snapshot);
  return (Array.isArray(projects) ? projects : []).map((project) => ({
    ...project,
    globalMarketRegime: regime,
    globalMarketRegimeState: regime.state,
  }));
}
