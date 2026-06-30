// src/engines/smartMoneyRotationEngine.js

/**
 * Smart Money Rotation Engine
 *
 * Purpose:
 * Detects whether high-signal wallets appear to be rotating
 * capital into a project, chain, ecosystem, or narrative.
 */

export function calculateSmartMoneyRotation(project = {}) {
  const smartWalletNetFlow =
    Number(project.smartWalletSignal?.smartWalletNetFlowUsd || project.smartWalletNetFlowUsd || 0);

  const previousSmartWalletNetFlow =
    Number(project.previousSmartWalletNetFlowUsd || 0);

  const smartWalletBuys24h =
    Number(project.smartWalletSignal?.smartWalletBuys24h || project.smartWalletBuys24h || 0);

  const previousSmartWalletBuys24h =
    Number(project.previousSmartWalletBuys24h || 0);

  const netFlowDelta = smartWalletNetFlow - previousSmartWalletNetFlow;
  const buyCountDelta = smartWalletBuys24h - previousSmartWalletBuys24h;

  return {
    smartWalletNetFlow,
    previousSmartWalletNetFlow,
    netFlowDelta,
    smartWalletBuys24h,
    previousSmartWalletBuys24h,
    buyCountDelta
  };
}

export function scoreSmartMoneyRotation(project = {}) {
  const rotation = calculateSmartMoneyRotation(project);

  let score = 0;

  if (rotation.smartWalletNetFlow > 0) score += 20;
  if (rotation.netFlowDelta > 5000) score += 20;
  if (rotation.netFlowDelta > 25000) score += 20;
  if (rotation.buyCountDelta > 0) score += 15;
  if (rotation.smartWalletBuys24h >= 5) score += 15;
  if (project.narrativeScore >= 70) score += 10;

  return Math.max(0, Math.min(100, score));
}

export function analyzeSmartMoneyRotation(project = {}) {
  const smartMoneyRotation = calculateSmartMoneyRotation(project);
  const smartMoneyRotationScore = scoreSmartMoneyRotation(project);

  return {
    ...project,
    smartMoneyRotation,
    smartMoneyRotationScore,

    smartMoneyRotationLevel:
      smartMoneyRotationScore >= 85 ? "major rotation" :
      smartMoneyRotationScore >= 65 ? "confirmed rotation" :
      smartMoneyRotationScore >= 45 ? "early rotation" :
      "no clear rotation",

    evidence: [
      ...(project.evidence || []),
      {
        engine: "Smart Money Rotation Engine",
        signal: "Smart money rotation",
        confidence: Math.min(smartMoneyRotationScore / 100, 1),
        impact: smartMoneyRotationScore >= 60 ? "Positive" : "Neutral"
      }
    ],

    alerts: [
      ...(project.alerts || []),
      ...(smartMoneyRotationScore >= 80
        ? ["Smart-money rotation detected."]
        : [])
    ]
  };
}

export function analyzeSmartMoneyRotationBatch(projects = []) {
  return projects
    .map(analyzeSmartMoneyRotation)
    .sort((a, b) => b.smartMoneyRotationScore - a.smartMoneyRotationScore);
}
