// src/engines/buyPressureEngine.js

/**
 * Buy Pressure Engine v3
 *
 * Detects real buy-side demand using:
 * - buy transaction count
 * - buy/sell transaction ratio
 * - buy/sell volume ratio
 * - price + volume confirmation
 * - sell pressure penalties
 */

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function ratio(part = 0, total = 0) {
  const p = num(part);
  const t = num(total);
  return t > 0 ? p / t : 0;
}

function scoreRatio(value = 0, weight = 1) {
  if (value >= 0.8) return 25 * weight;
  if (value >= 0.7) return 20 * weight;
  if (value >= 0.6) return 14 * weight;
  if (value >= 0.55) return 8 * weight;
  if (value <= 0.4) return -8 * weight;
  return 0;
}

function scoreActivity(value = 0, weight = 1) {
  const n = num(value);

  if (n >= 500) return 20 * weight;
  if (n >= 250) return 16 * weight;
  if (n >= 100) return 12 * weight;
  if (n >= 25) return 8 * weight;
  if (n >= 10) return 4 * weight;

  return 0;
}

function levelForScore(score = 0) {
  if (score >= 85) return "extreme buy pressure";
  if (score >= 70) return "strong buy pressure";
  if (score >= 50) return "developing buy pressure";
  if (score >= 30) return "early buy pressure";
  return "weak buy pressure";
}

function buildReasons(metrics = {}) {
  const reasons = [];

  if (metrics.buyTransactions24h >= 100) {
    reasons.push("Buy transaction count is elevated.");
  }

  if (metrics.buyTxnRatio >= 0.6) {
    reasons.push("Buy transactions are outpacing sell transactions.");
  }

  if (metrics.buyVolumeRatio >= 0.6) {
    reasons.push("Buy volume is stronger than sell volume.");
  }

  if (metrics.priceChange24h > 10 && metrics.volume24h >= 100000) {
    reasons.push("Price is rising with meaningful volume confirmation.");
  }

  if (metrics.sellVolumeRatio >= 0.6) {
    reasons.push("Sell volume remains elevated and may cap upside.");
  }

  if (!reasons.length) {
    reasons.push("No major buy-side demand imbalance detected.");
  }

  return reasons;
}

export function calculateBuyPressureScore(project = {}) {
  const buys = num(project.buyTransactions24h);
  const sells = num(project.sellTransactions24h);
  const buyVolume = num(project.buyVolume24h);
  const sellVolume = num(project.sellVolume24h);
  const volume24h = num(project.volume24h);
  const priceChange24h = num(project.priceChange24h);

  const totalTxns = buys + sells;
  const totalTradeVolume = buyVolume + sellVolume;

  const buyTxnRatio = ratio(buys, totalTxns);
  const sellTxnRatio = ratio(sells, totalTxns);
  const buyVolumeRatio = ratio(buyVolume, totalTradeVolume);
  const sellVolumeRatio = ratio(sellVolume, totalTradeVolume);

  let score = 0;

  score += scoreActivity(buys, 1.1);
  score += scoreRatio(buyTxnRatio, 1.25);
  score += scoreRatio(buyVolumeRatio, 1.35);

  if (priceChange24h > 10 && volume24h >= 100000) score += 10;
  if (priceChange24h > 25 && volume24h >= 250000) score += 10;
  if (priceChange24h > 50 && volume24h >= 500000) score += 10;

  if (sellTxnRatio >= 0.65) score -= 12;
  if (sellVolumeRatio >= 0.65) score -= 15;

  return clamp(Math.round(score));
}

export function analyzeBuyPressure(project = {}) {
  const buys = num(project.buyTransactions24h);
  const sells = num(project.sellTransactions24h);
  const buyVolume = num(project.buyVolume24h);
  const sellVolume = num(project.sellVolume24h);
  const volume24h = num(project.volume24h);
  const priceChange24h = num(project.priceChange24h);

  const totalTxns = buys + sells;
  const totalTradeVolume = buyVolume + sellVolume;

  const buyPressureMetrics = {
    buyTransactions24h: buys,
    sellTransactions24h: sells,
    buyVolume24h: buyVolume,
    sellVolume24h: sellVolume,
    volume24h,
    priceChange24h,
    buyTxnRatio: ratio(buys, totalTxns),
    sellTxnRatio: ratio(sells, totalTxns),
    buyVolumeRatio: ratio(buyVolume, totalTradeVolume),
    sellVolumeRatio: ratio(sellVolume, totalTradeVolume),
  };

  const buyPressureScore = calculateBuyPressureScore(project);
  const buyPressureLevel = levelForScore(buyPressureScore);
  const reasons = buildReasons(buyPressureMetrics);

  return {
    ...project,

    buyPressureMetrics,
    buyPressureScore,
    buyPressureLevel,
    buyPressureReasons: reasons,

    intelligenceSignals: {
      ...(project.intelligenceSignals || {}),
      buyPressure: {
        score: buyPressureScore,
        level: buyPressureLevel,
        metrics: buyPressureMetrics,
        reasons,
      },
    },

    evidence: [
      ...(project.evidence || []),
      {
        engine: "Buy Pressure Engine v3",
        signal: "Buy-side demand imbalance",
        score: buyPressureScore,
        confidence: clamp(buyPressureScore / 100, 0, 1),
        impact:
          buyPressureScore >= 70
            ? "Strong Positive"
            : buyPressureScore >= 50
            ? "Positive"
            : "Neutral",
        reasons,
      },
    ],

    alerts: [
      ...(project.alerts || []),
      ...(buyPressureScore >= 85
        ? ["Extreme buy pressure detected."]
        : buyPressureScore >= 70
        ? ["Strong buy pressure detected."]
        : []),
    ],
  };
}

export function analyzeBuyPressureBatch(projects = []) {
  return projects
    .map(analyzeBuyPressure)
    .sort(
      (a, b) =>
        Number(b.buyPressureScore || 0) - Number(a.buyPressureScore || 0)
    );
}
