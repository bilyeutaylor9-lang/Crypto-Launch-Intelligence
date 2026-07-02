// src/engines/prePumpDetectionEngine.js

/**
 * Crypto Launch Intelligence
 * Pre-Pump Detection Engine
 *
 * Purpose:
 * Finds early crypto opportunities BEFORE they have already pumped.
 *
 * It rewards:
 * - Quiet price action
 * - Rising volume
 * - Early narrative strength
 * - Healthy liquidity growth
 * - Developer/community acceleration
 *
 * It penalizes:
 * - Coins that already had a major move
 * - Vertical charts
 * - Thin liquidity
 * - Whale dump risk
 */

const DEFAULT_THRESHOLDS = {
  max24hPump: 40,
  max7dPump: 100,
  max30dPump: 250,

  idealMarketCapMax: 150_000_000,
  microCapBonusMax: 50_000_000,

  minLiquidityUsd: 50_000,
  idealLiquidityUsd: 500_000,

  volumeWakeupRatio: 1.5,
  strongVolumeWakeupRatio: 3,

  maxWhaleRisk: 70
};

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function scoreEarlyPriceAction(token) {
  const change24h = safeNumber(token.priceChange24h);
  const change7d = safeNumber(token.priceChange7d);
  const change30d = safeNumber(token.priceChange30d);

  let score = 25;

  if (change24h > 40) score -= 20;
  else if (change24h > 25) score -= 10;
  else if (change24h >= 5 && change24h <= 20) score += 10;

  if (change7d > 100) score -= 30;
  else if (change7d > 60) score -= 15;
  else if (change7d >= 10 && change7d <= 45) score += 15;

  if (change30d > 250) score -= 25;
  else if (change30d >= 20 && change30d <= 120) score += 10;

  return clamp(score);
}

function scoreVolumeWakeup(token) {
  const volume24h = safeNumber(token.volume24h);
  const avgVolume7d = safeNumber(token.avgVolume7d);
  const priceChange24h = Math.abs(safeNumber(token.priceChange24h));

  if (!volume24h || !avgVolume7d) return 30;

  const volumeRatio = volume24h / avgVolume7d;

  let score = 30;

  if (volumeRatio >= 3) score += 35;
  else if (volumeRatio >= 1.5) score += 20;
  else if (volumeRatio >= 1.1) score += 10;
  else score -= 10;

  if (volumeRatio > 1.5 && priceChange24h < 20) {
    score += 20;
  }

  return clamp(score);
}

function scoreMarketCap(token, thresholds) {
  const marketCap = safeNumber(token.marketCap);

  if (!marketCap) return 40;

  if (marketCap <= thresholds.microCapBonusMax) return 90;
  if (marketCap <= thresholds.idealMarketCapMax) return 75;
  if (marketCap <= 500_000_000) return 45;

  return 20;
}

function scoreLiquidity(token, thresholds) {
  const liquidity = safeNumber(token.liquidityUsd);

  if (!liquidity) return 20;
  if (liquidity < thresholds.minLiquidityUsd) return 15;
  if (liquidity >= thresholds.idealLiquidityUsd) return 85;

  return clamp((liquidity / thresholds.idealLiquidityUsd) * 80);
}

function scoreNarrative(token) {
  const narrativeScore = safeNumber(token.narrativeScore);
  const socialGrowth = safeNumber(token.socialGrowth24h);
  const searchTrend = safeNumber(token.searchTrendScore);

  let score = 30;

  score += narrativeScore * 0.4;
  score += socialGrowth * 0.3;
  score += searchTrend * 0.3;

  return clamp(score);
}

function scoreDeveloperActivity(token) {
  const commits7d = safeNumber(token.githubCommits7d);
  const commits30d = safeNumber(token.githubCommits30d);
  const releases30d = safeNumber(token.githubReleases30d);

  let score = 25;

  if (commits7d >= 10) score += 25;
  else if (commits7d >= 3) score += 15;

  if (commits30d >= 30) score += 25;
  else if (commits30d >= 10) score += 15;

  if (releases30d >= 1) score += 15;

  return clamp(score);
}

function calculateAlreadyPumpedPenalty(token, thresholds) {
  const change24h = safeNumber(token.priceChange24h);
  const change7d = safeNumber(token.priceChange7d);
  const change30d = safeNumber(token.priceChange30d);

  let penalty = 0;

  if (change24h > thresholds.max24hPump) penalty += 30;
  if (change7d > thresholds.max7dPump) penalty += 45;
  if (change30d > thresholds.max30dPump) penalty += 35;

  if (change24h > 50 && change7d > 120) penalty += 30;

  return clamp(penalty);
}

function calculateWhaleRiskPenalty(token, thresholds) {
  const whaleRisk = safeNumber(token.whaleRiskScore);

  if (!whaleRisk) return 0;
  if (whaleRisk >= thresholds.maxWhaleRisk) return 35;
  if (whaleRisk >= 50) return 20;
  if (whaleRisk >= 30) return 10;

  return 0;
}

function classifyPrePumpStatus(score, alreadyPumpedPenalty) {
  if (alreadyPumpedPenalty >= 60) return "ALREADY_PUMPED";
  if (score >= 80) return "EARLY_HIGH_CONVICTION";
  if (score >= 65) return "EARLY_WATCHLIST";
  if (score >= 50) return "NEUTRAL";
  return "LOW_PRIORITY";
}

export function prePumpDetectionEngine(tokens = [], options = {}) {
  const thresholds = {
    ...DEFAULT_THRESHOLDS,
    ...(options.thresholds || {})
  };

  const results = tokens.map((token) => {
    const earlyPriceScore = scoreEarlyPriceAction(token);
    const volumeWakeupScore = scoreVolumeWakeup(token);
    const marketCapScore = scoreMarketCap(token, thresholds);
    const liquidityScore = scoreLiquidity(token, thresholds);
    const narrativeScore = scoreNarrative(token);
    const developerScore = scoreDeveloperActivity(token);

    const alreadyPumpedPenalty = calculateAlreadyPumpedPenalty(token, thresholds);
    const whaleRiskPenalty = calculateWhaleRiskPenalty(token, thresholds);

    const rawScore =
      earlyPriceScore * 0.22 +
      volumeWakeupScore * 0.22 +
      marketCapScore * 0.16 +
      liquidityScore * 0.14 +
      narrativeScore * 0.16 +
      developerScore * 0.10 -
      alreadyPumpedPenalty -
      whaleRiskPenalty;

    const prePumpScore = clamp(rawScore);

    const status = classifyPrePumpStatus(prePumpScore, alreadyPumpedPenalty);

    return {
      ...token,
      prePump: {
        score: prePumpScore,
        status,
        breakdown: {
          earlyPriceScore,
          volumeWakeupScore,
          marketCapScore,
          liquidityScore,
          narrativeScore,
          developerScore,
          alreadyPumpedPenalty,
          whaleRiskPenalty
        },
        reasons: buildReasons({
          token,
          prePumpScore,
          status,
          earlyPriceScore,
          volumeWakeupScore,
          marketCapScore,
          liquidityScore,
          narrativeScore,
          developerScore,
          alreadyPumpedPenalty,
          whaleRiskPenalty
        })
      }
    };
  });

  return results.sort((a, b) => b.prePump.score - a.prePump.score);
}

function buildReasons(data) {
  const reasons = [];

  if (data.status === "ALREADY_PUMPED") {
    reasons.push("Rejected because price action suggests the token may have already pumped.");
  }

  if (data.volumeWakeupScore >= 70) {
    reasons.push("Volume is waking up before extreme price movement.");
  }

  if (data.earlyPriceScore >= 70) {
    reasons.push("Price action is still early and not overly extended.");
  }

  if (data.marketCapScore >= 75) {
    reasons.push("Market cap is still within an early upside zone.");
  }

  if (data.liquidityScore >= 70) {
    reasons.push("Liquidity appears strong enough to support early trading interest.");
  }

  if (data.narrativeScore >= 70) {
    reasons.push("Narrative and social momentum are improving.");
  }

  if (data.developerScore >= 70) {
    reasons.push("Developer activity is increasing.");
  }

  if (data.whaleRiskPenalty >= 20) {
    reasons.push("Whale concentration may create dump risk.");
  }

  if (!reasons.length) {
    reasons.push("No strong pre-pump edge detected yet.");
  }

  return reasons;
}

export default prePumpDetectionEngine;
