// src/engines/smartWalletEngine.js

/**
 * Smart Wallet Engine
 *
 * Purpose:
 * Detects whether historically profitable or high-signal wallets
 * are entering a project early.
 */

export function calculateSmartWalletSignal(project = {}) {
  const smartWalletBuys24h = Number(project.smartWalletBuys24h || 0);
  const smartWalletSells24h = Number(project.smartWalletSells24h || 0);

  const smartWalletBuyVolumeUsd = Number(project.smartWalletBuyVolumeUsd || 0);
  const smartWalletSellVolumeUsd = Number(project.smartWalletSellVolumeUsd || 0);

  const smartWalletNetFlowUsd =
    smartWalletBuyVolumeUsd - smartWalletSellVolumeUsd;

  const smartWalletBuySellRatio =
    smartWalletSells24h > 0
      ? smartWalletBuys24h / smartWalletSells24h
      : smartWalletBuys24h;

  return {
    smartWalletBuys24h,
    smartWalletSells24h,
    smartWalletBuyVolumeUsd,
    smartWalletSellVolumeUsd,
    smartWalletNetFlowUsd,
    smartWalletBuySellRatio
  };
}

export function scoreSmartWalletSignal(project = {}) {
  const signal = calculateSmartWalletSignal(project);

  let score = 0;

  if (signal.smartWalletBuys24h >= 2) score += 20;
  if (signal.smartWalletBuys24h >= 5) score += 20;
  if (signal.smartWalletNetFlowUsd > 5000) score += 20;
  if (signal.smartWalletNetFlowUsd > 25000) score += 20;
  if (signal.smartWalletBuySellRatio >= 2) score += 10;
  if (signal.smartWalletSells24h > signal.smartWalletBuys24h) score -= 20;

  return Math.max(0, Math.min(100, score));
}

export function analyzeSmartWallets(project = {}) {
  const smartWalletSignal = calculateSmartWalletSignal(project);
  const smartWalletScore = scoreSmartWalletSignal(project);

  return {
    ...project,
    smartWalletSignal,
    smartWalletScore,
    smartWalletLevel:
      smartWalletScore >= 80 ? "strong smart-wallet accumulation" :
      smartWalletScore >= 60 ? "positive smart-wallet interest" :
      smartWalletScore >= 40 ? "early smart-wallet signal" :
      "weak",
    smartWalletReason:
      smartWalletScore >= 60
        ? "High-signal wallets appear to be accumulating."
        : "No strong smart-wallet accumulation detected yet."
  };
}

export function analyzeSmartWalletBatch(projects = []) {
  return projects
    .map(analyzeSmartWallets)
    .sort((a, b) => b.smartWalletScore - a.smartWalletScore);
}
