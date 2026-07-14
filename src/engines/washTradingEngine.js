function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

export function analyzeWashTrading(project = {}) {
  const buyVolume = num(project.buyVolumeUsd || project.organicBuyerClassifier?.buyVolumeUsd || project.nativeLifecycle?.buyerState?.buyVolumeUsd);
  const sellVolume = num(project.sellVolumeUsd || project.organicBuyerClassifier?.sellVolumeUsd || project.nativeLifecycle?.buyerState?.sellVolumeUsd);
  const liquidity = num(project.liquidityUsd || project.activeLiquidityUsd || project.stableExitLiquidityUsd);
  const repetitiveScore = num(project.repetitiveTransactionScore || project.transactionPatternRisk);
  const selfTradeWallets = num(project.selfTradeWallets || project.washTradeWallets);
  const roundTripRatio = Math.min(buyVolume, sellVolume) / Math.max(1, Math.max(buyVolume, sellVolume));
  const volumeLiquidityRatio = liquidity > 0 ? (buyVolume + sellVolume) / liquidity : 0;
  const washTradingRiskScore = Math.round(
    clamp(roundTripRatio * 38 + repetitiveScore * 0.42 + selfTradeWallets * 4 + (volumeLiquidityRatio > 8 ? 18 : volumeLiquidityRatio > 4 ? 9 : 0))
  );
  const washTradingScore = Math.round(clamp(82 - washTradingRiskScore * 0.8 + (buyVolume > sellVolume * 1.35 ? 8 : 0)));

  return {
    ...project,
    washTradingRiskScore,
    washTradingScore,
    washTradingVerdict:
      washTradingRiskScore >= 75 ? "Likely Wash Trading" : washTradingRiskScore >= 45 ? "Wash Trading Watch" : "No Dominant Wash Pattern",
    washTrading: {
      buyVolumeUsd: buyVolume,
      sellVolumeUsd: sellVolume,
      roundTripRatio: Number(roundTripRatio.toFixed(3)),
      volumeLiquidityRatio: Number(volumeLiquidityRatio.toFixed(2)),
      repetitiveScore,
      selfTradeWallets,
    },
  };
}

export function analyzeWashTradingBatch(projects = []) {
  return projects.map((project) => analyzeWashTrading(project));
}
