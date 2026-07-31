// src/engines/smartWalletPerformanceEngine.js

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function avg(values = []) {
  const nums = values.map(Number).filter(Number.isFinite);
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function measured(value) {
  return value !== undefined && value !== null && value !== "" && Number.isFinite(Number(value));
}

export function analyzeSmartWalletPerformance(project = {}) {
  const wallets = project.smartWallets || project.trackedWallets || [];

  const winRates = wallets
    .map((wallet) => wallet.winRate ?? wallet.successRate)
    .filter(measured);
  const avgReturns = wallets
    .map((wallet) => wallet.avgReturn ?? wallet.averageReturn)
    .filter(measured);
  const holdingDays = wallets
    .map((wallet) => wallet.avgHoldingDays ?? wallet.holdingDays)
    .filter(measured);

  const walletCount = wallets.length;
  const observedComponents = [
    winRates.length ? ["winRate", clamp(avg(winRates)), 0.35] : null,
    avgReturns.length ? ["averageReturn", clamp(avg(avgReturns)), 0.3] : null,
    holdingDays.length ? ["holdingDuration", clamp(avg(holdingDays) * 3), 0.15] : null,
    walletCount ? ["walletParticipation", clamp(walletCount * 12), 0.2] : null,
  ].filter(Boolean);
  const expectedComponents = ["winRate", "averageReturn", "holdingDuration", "walletParticipation"];
  const smartWalletPerformanceCoverage = {
    observedComponentCount: observedComponents.length,
    expectedComponentCount: expectedComponents.length,
    coveragePct: Math.round((observedComponents.length / expectedComponents.length) * 100),
    observedValues: Object.fromEntries(observedComponents.map(([field, value]) => [field, value])),
    missingValues: expectedComponents.filter(
      (field) => !observedComponents.some(([observed]) => observed === field)
    ),
    sourceFamilies: observedComponents.length ? ["wallet-history"] : [],
  };

  if (!observedComponents.length || (!winRates.length && !avgReturns.length && !holdingDays.length)) {
    return {
      ...project,
      smartWalletPerformanceScore: null,
      smartWalletPerformanceLevel: "unmeasured",
      smartWalletPerformanceCoverage,
    };
  }

  const observedWeight = observedComponents.reduce((sum, [, , weight]) => sum + weight, 0);
  const smartWalletPerformanceScore = clamp(
    observedComponents.reduce((sum, [, value, weight]) => sum + value * weight, 0) /
      Math.max(observedWeight, 0.01)
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
    smartWalletPerformanceLevel,
    smartWalletPerformanceCoverage,
  };
}

export function analyzeSmartWalletPerformanceBatch(projects = []) {
  return projects.map(analyzeSmartWalletPerformance);
}
