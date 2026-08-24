import { clamp, finite, mean } from "./productionMath.js";

export function forecastLiquidityWeather(observations = [], options = {}) {
  const rows = Array.isArray(observations) ? observations : [];
  const stablecoin = mean(rows.map((r) => finite(r.stablecoinNetFlowUsd)));
  const bridge = mean(rows.map((r) => finite(r.bridgeNetFlowUsd)));
  const dexGrowth = mean(rows.map((r) => finite(r.dexVolumeChangePct)));
  const liquidityGrowth = mean(rows.map((r) => finite(r.liquidityChangePct)));
  const volatility = mean(rows.map((r) => finite(r.btcVolatilityPct)));

  const expansionScore = clamp(
    50 +
    Math.tanh((stablecoin || 0) / 10_000_000) * 18 +
    Math.tanh((bridge || 0) / 5_000_000) * 14 +
    Math.tanh((dexGrowth || 0) / 25) * 10 +
    Math.tanh((liquidityGrowth || 0) / 20) * 12 -
    Math.max(0, (volatility || 0) - 5) * 2,
    0, 100
  );

  const state = expansionScore >= 65 ? "EXPANDING"
    : expansionScore <= 35 ? "CONTRACTING"
    : "NEUTRAL";

  return {
    schemaVersion: 1,
    generatedAt: options.now || new Date().toISOString(),
    horizonHours: Number(options.horizonHours || 12),
    state,
    expansionProbability: expansionScore / 100,
    contractionProbability: (100 - expansionScore) / 100,
    drivers: { stablecoin, bridge, dexGrowth, liquidityGrowth, volatility },
    calibrated: false,
    automaticTrading: false,
  };
}
