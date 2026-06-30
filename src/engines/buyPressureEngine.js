// src/engines/buyPressureEngine.js

/**
 * Buy Pressure Engine v2
 *
 * Purpose:
 * Detects real buying pressure using buy/sell transactions,
 * buy/sell volume, and price/volume confirmation.
 */

function num(value = 0) {
  return Number(value || 0);
}

export function calculateBuyPressureScore(project = {}) {
  let score = 0;

  const buys = num(project.buyTransactions24h);
  const sells = num(project.sellTransactions24h);
  const buyVolume = num(project.buyVolume24h);
  const sellVolume = num(project.sellVolume24h);
  const volume24h = num(project.volume24h);
  const priceChange24h = num(project.priceChange24h);

  const totalTxns = buys + sells;
  const buyTxnRatio = totalTxns > 0 ? buys / totalTxns : 0;

  const totalTradeVolume = buyVolume + sellVolume;
  const buyVolumeRatio =
    totalTradeVolume > 0 ? buyVolume / totalTradeVolume : 0;

  if (buys >= 25) score += 10;
  if (buys >= 100) score += 15;
  if (buys >= 250) score += 15;

  if (buyTxnRatio >= 0.55) score += 10;
  if (buyTxnRatio >= 0.65) score += 15;
  if (buyTxnRatio >= 0.75) score += 15;

  if (buyVolumeRatio >= 0.55) score += 10;
  if (buyVolumeRatio >= 0.65) score += 10;

  if (priceChange24h > 10 && volume24h >= 100000) score += 10;
  if (priceChange24h > 50 && volume24h >= 250000) score += 10;

  return Math.max(0, Math.min(100, Math.round(score)));
}

export function analyzeBuyPressure(project = {}) {
  const buyPressureScore = calculateBuyPressureScore(project);

  return {
    ...project,
    buyPressureScore,
    buyPressureLevel:
      buyPressureScore >= 85 ? "extreme buy pressure" :
      buyPressureScore >= 70 ? "strong buy pressure" :
      buyPressureScore >= 50 ? "developing buy pressure" :
      buyPressureScore >= 30 ? "early buy pressure" :
      "weak buy pressure",

    evidence: [
      ...(project.evidence || []),
      {
        engine: "Buy Pressure Engine v2",
        signal: "Buy-side demand",
        confidence: Math.min(buyPressureScore / 100, 1),
        impact: buyPressureScore >= 50 ? "Positive" : "Neutral"
      }
    ],

    alerts: [
      ...(project.alerts || []),
      ...(buyPressureScore >= 70 ? ["Strong buy pressure detected."] : [])
    ]
  };
}

export function analyzeBuyPressureBatch(projects = []) {
  return projects
    .map(analyzeBuyPressure)
    .sort((a, b) => b.buyPressureScore - a.buyPressureScore);
}
