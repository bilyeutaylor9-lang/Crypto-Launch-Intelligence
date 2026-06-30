// src/engines/sellPressureEngine.js

/**
 * Sell Pressure Engine
 *
 * Purpose:
 * Measures whether sellers are increasingly dominating
 * the market and whether distribution risk is rising.
 */

export function calculateSellPressure(project = {}) {
  const buys = Number(project.buyTransactions24h || 0);
  const sells = Number(project.sellTransactions24h || 0);
  const buyVolume = Number(project.buyVolume24h || 0);
  const sellVolume = Number(project.sellVolume24h || 0);

  const sellRatio =
    buys + sells === 0 ? 0 : sells / (buys + sells);

  const sellVolumeRatio =
    buyVolume + sellVolume === 0
      ? 0
      : sellVolume / (buyVolume + sellVolume);

  return {
    buys,
    sells,
    buyVolume,
    sellVolume,
    sellRatio,
    sellVolumeRatio
  };
}

export function scoreSellPressure(project = {}) {
  const pressure = calculateSellPressure(project);

  let score = 0;

  if (pressure.sellRatio >= 0.55) score += 20;
  if (pressure.sellRatio >= 0.65) score += 20;
  if (pressure.sellVolumeRatio >= 0.60) score += 20;
  if (pressure.sellVolumeRatio >= 0.75) score += 20;
  if (project.whaleActivity?.whaleSells24h > project.whaleActivity?.whaleBuys24h) score += 10;
  if (project.smartWalletSignal?.smartWalletSells24h > project.smartWalletSignal?.smartWalletBuys24h) score += 10;

  return Math.max(0, Math.min(100, score));
}

export function analyzeSellPressure(project = {}) {
  const sellPressure = calculateSellPressure(project);
  const sellPressureScore = scoreSellPressure(project);

  return {
    ...project,

    sellPressure,
    sellPressureScore,

    sellPressureLevel:
      sellPressureScore >= 85 ? "extreme distribution" :
      sellPressureScore >= 65 ? "strong selling" :
      sellPressureScore >= 45 ? "building selling" :
      "low selling",

    evidence: [
      ...(project.evidence || []),
      {
        engine: "Sell Pressure Engine",
        signal: "Seller dominance",
        confidence: Math.min(sellPressureScore / 100, 1),
        impact: sellPressureScore >= 60 ? "Negative" : "Neutral"
      }
    ],

    alerts: [
      ...(project.alerts || []),
      ...(sellPressureScore >= 80
        ? ["Strong sell pressure detected."]
        : [])
    ]
  };
}

export function analyzeSellPressureBatch(projects = []) {
  return projects
    .map(analyzeSellPressure)
    .sort((a, b) => b.sellPressureScore - a.sellPressureScore);
}
