// src/engines/richTokenIntelligenceEngine.js

/**
 * Crypto Launch Intelligence
 * Rich Token Intelligence Engine
 *
 * Purpose:
 * Adds deeper token intelligence fields used for better ranking,
 * filtering, reporting, and future AI scoring.
 */

function number(value = 0) {
  return Number(value || 0);
}

function calculateTokenAgeHours(project = {}) {
  if (!project.pairCreatedAt) return null;

  const created = new Date(project.pairCreatedAt).getTime();
  if (!created || Number.isNaN(created)) return null;

  return Math.max(0, (Date.now() - created) / 1000 / 60 / 60);
}

function calculateLiquidityToVolumeRatio(project = {}) {
  const liquidity = number(project.liquidityUsd);
  const volume = number(project.volume24h);

  if (volume <= 0) return 0;

  return liquidity / volume;
}

function calculateBuySellRatio(project = {}) {
  const buys = number(project.buyTransactions24h);
  const sells = number(project.sellTransactions24h);

  if (sells <= 0) return buys;

  return buys / sells;
}

function classifyTokenAge(ageHours) {
  if (ageHours === null) return "unknown";
  if (ageHours <= 6) return "brand new";
  if (ageHours <= 24) return "new launch";
  if (ageHours <= 72) return "early";
  if (ageHours <= 720) return "recent";
  return "established";
}

function classifyLiquidity(project = {}) {
  const liquidity = number(project.liquidityUsd);

  if (liquidity >= 1_000_000) return "deep";
  if (liquidity >= 250_000) return "strong";
  if (liquidity >= 50_000) return "developing";
  if (liquidity >= 10_000) return "thin";
  return "very thin";
}

function classifyVolume(project = {}) {
  const volume = number(project.volume24h);

  if (volume >= 5_000_000) return "explosive";
  if (volume >= 1_000_000) return "very high";
  if (volume >= 250_000) return "high";
  if (volume >= 50_000) return "active";
  return "low";
}

export function analyzeRichTokenIntelligence(project = {}) {
  const tokenAgeHours = calculateTokenAgeHours(project);
  const liquidityToVolumeRatio = calculateLiquidityToVolumeRatio(project);
  const buySellRatio = calculateBuySellRatio(project);

  const richTokenIntelligence = {
    tokenAgeHours,
    tokenAgeLabel: classifyTokenAge(tokenAgeHours),
    liquidityClass: classifyLiquidity(project),
    volumeClass: classifyVolume(project),
    liquidityToVolumeRatio,
    buySellRatio,
    hasChart: Boolean(project.url),
    hasPairAddress: Boolean(project.pairAddress),
    hasTokenAddress: Boolean(project.address),
    isNewLaunch: tokenAgeHours !== null && tokenAgeHours <= 72,
    isHighVolume: number(project.volume24h) >= 250_000,
    isLiquidEnough: number(project.liquidityUsd) >= 50_000,
    isBuyDominant: buySellRatio >= 1.25,
    isMomentumCandidate:
      number(project.priceChange24h) > 20 &&
      number(project.volume24h) >= 50_000 &&
      number(project.liquidityUsd) >= 10_000
  };

  let richTokenScore = 0;

  if (richTokenIntelligence.isNewLaunch) richTokenScore += 15;
  if (richTokenIntelligence.isHighVolume) richTokenScore += 20;
  if (richTokenIntelligence.isLiquidEnough) richTokenScore += 20;
  if (richTokenIntelligence.isBuyDominant) richTokenScore += 15;
  if (richTokenIntelligence.hasChart) richTokenScore += 10;
  if (richTokenIntelligence.hasPairAddress) richTokenScore += 10;
  if (richTokenIntelligence.isMomentumCandidate) richTokenScore += 10;

  richTokenScore = Math.max(0, Math.min(100, richTokenScore));

  return {
    ...project,
    richTokenIntelligence,
    richTokenScore,
    richTokenLevel:
      richTokenScore >= 85 ? "institutional watch" :
      richTokenScore >= 70 ? "strong candidate" :
      richTokenScore >= 50 ? "developing candidate" :
      richTokenScore >= 30 ? "early watch" :
      "low quality",

    evidence: [
      ...(project.evidence || []),
      {
        engine: "Rich Token Intelligence Engine",
        signal: "Token quality profile",
        confidence: Math.min(richTokenScore / 100, 1),
        impact: richTokenScore >= 60 ? "Positive" : "Neutral"
      }
    ],

    alerts: [
      ...(project.alerts || []),
      ...(richTokenScore >= 80 ? ["Rich token profile detected."] : [])
    ]
  };
}

export function analyzeRichTokenIntelligenceBatch(projects = []) {
  return projects
    .map(analyzeRichTokenIntelligence)
    .sort((a, b) => b.richTokenScore - a.richTokenScore);
}
