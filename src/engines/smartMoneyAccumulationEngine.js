// src/engines/smartMoneyAccumulationEngine.js

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function analyzeSmartMoneyAccumulation(project = {}) {
  const smartWalletNetFlow = num(project.smartWalletNetFlowUsd);
  const smartWalletBuys = num(project.smartWalletBuyCount);
  const smartWalletSells = num(project.smartWalletSellCount);
  const accumulationDays = num(project.accumulationDays);
  const holderGrowth = num(project.holderGrowthScore);
  const whaleRisk = num(project.whaleRiskScore);
  const volume24h = num(project.volume24h);
  const marketCap = num(project.marketCap);

  const buySellRatio =
    smartWalletSells > 0 ? smartWalletBuys / smartWalletSells : smartWalletBuys;

  const flowScore =
    marketCap > 0
      ? clamp((smartWalletNetFlow / marketCap) * 5000)
      : clamp(smartWalletNetFlow / 25_000);

  const buyPressureScore = clamp(buySellRatio * 20);
  const accumulationDurationScore = clamp(accumulationDays * 10);
  const holderSupportScore = clamp(holderGrowth);
  const volumeSupportScore = marketCap > 0 ? clamp((volume24h / marketCap) * 300) : 30;
  const whalePenalty = clamp(whaleRisk * 0.35);

  const smartMoneyAccumulationScore = clamp(
    flowScore * 0.3 +
      buyPressureScore * 0.25 +
      accumulationDurationScore * 0.2 +
      holderSupportScore * 0.15 +
      volumeSupportScore * 0.1 -
      whalePenalty
  );

  const smartMoneyAccumulationLevel =
    smartMoneyAccumulationScore >= 85
      ? "heavy smart money accumulation"
      : smartMoneyAccumulationScore >= 70
        ? "clear accumulation"
        : smartMoneyAccumulationScore >= 50
          ? "early accumulation"
          : "no strong accumulation";

  const alerts = [...(project.alerts || [])];

  if (smartMoneyAccumulationScore >= 80) {
    alerts.push("Smart money accumulation is strengthening.");
  }

  return {
    ...project,
    smartMoneyAccumulationScore,
    smartMoneyAccumulationLevel,
    alerts
  };
}

export function analyzeSmartMoneyAccumulationBatch(projects = []) {
  return projects.map(analyzeSmartMoneyAccumulation);
}
