// src/engines/smartWalletPerformanceEngine.js

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function avg(values = []) {
  const nums = values.map(Number).filter(Number.isFinite);
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export function analyzeSmartWalletPerformance(project = {}) {
  const wallets = project.smartWallets || project.trackedWallets || [];

  const winRates = wallets.map(w => w.winRate || w.successRate || 0);
  const avgReturns = wallets.map(w => w.avgReturn || w.averageReturn || 0);
  const holdingDays = wallets.map(w => w.avgHoldingDays || w.holdingDays || 0);

  const walletCount = wallets.length;
  const winRateScore = clamp(avg(winRates));
  const returnScore = clamp(avg(avgReturns));
  const holdingScore = clamp(avg(holdingDays) * 3);
  const participationScore = clamp(walletCount * 12);

  const smartWalletPerformanceScore = clamp(
    winRateScore * 0.35 +
      returnScore * 0.3 +
      holdingScore * 0.15 +
      participationScore * 0.2
  );

  const smartWalletPerformanceLevel =
    smartWalletPerformanceScore >= 85
      ? "elite wallet signal"
      : smartWalletPerformanceScore >= 70
        ? "strong wallet signal"
        : smartWalletPerformanceScore >= 50
          ? "moderate wallet signal"
          : "weak wallet signal";

  return {
    ...project,
    smartWalletPerformanceScore,
    smartWalletPerformanceLevel
  };
}

export function analyzeSmartWalletPerformanceBatch(projects = []) {
  return projects.map(analyzeSmartWalletPerformance);
}
