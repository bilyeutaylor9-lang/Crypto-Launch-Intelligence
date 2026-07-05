// src/engines/richTokenIntelligenceEngine.js

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

function calculateTokenAgeHours(project = {}) {
  const createdAt = project.pairCreatedAt || project.createdAt || project.launchDate;
  if (!createdAt) return null;

  const created = new Date(createdAt).getTime();
  if (!Number.isFinite(created)) return null;

  return Math.max(0, (Date.now() - created) / 1000 / 60 / 60);
}

function calculateLiquidityToVolumeRatio(project = {}) {
  const liquidity = num(project.liquidityUsd ?? project.liquidity);
  const volume = num(project.volume24h ?? project.volume);
  return volume > 0 ? liquidity / volume : 0;
}

function calculateBuySellRatio(project = {}) {
  const buys = num(project.buyTransactions24h);
  const sells = num(project.sellTransactions24h);
  return sells > 0 ? buys / sells : buys;
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
  const liquidity = num(project.liquidityUsd ?? project.liquidity);

  if (liquidity >= 1_000_000) return "deep";
  if (liquidity >= 250_000) return "strong";
  if (liquidity >= 50_000) return "developing";
  if (liquidity >= 10_000) return "thin";
  return "very thin";
}

function classifyVolume(project = {}) {
  const volume = num(project.volume24h ?? project.volume);

  if (volume >= 5_000_000) return "explosive";
  if (volume >= 1_000_000) return "very high";
  if (volume >= 250_000) return "high";
  if (volume >= 50_000) return "active";
  return "low";
}

function buildReasons(intel = {}) {
  const reasons = [];

  if (intel.isNewLaunch) reasons.push("Token appears to be a new or early launch.");
  if (intel.isHighVolume) reasons.push("24h volume is meaningful.");
  if (intel.isLiquidEnough) reasons.push("Liquidity is sufficient for early screening.");
  if (intel.isBuyDominant) reasons.push("Buy activity is stronger than sell activity.");
  if (intel.hasChart) reasons.push("Chart/source URL is available.");
  if (intel.hasPairAddress) reasons.push("Pair address is available.");
  if (intel.hasTokenAddress) reasons.push("Token address is available.");
  if (intel.isMomentumCandidate) reasons.push("Price, volume, and liquidity show momentum setup.");
  if (intel.liquidityToVolumeRatio < 0.05 && intel.volume24h > 100000) {
    reasons.push("Volume is high relative to liquidity; volatility risk may be elevated.");
  }

  if (!reasons.length) reasons.push("Token profile is still thin or incomplete.");

  return reasons;
}

function levelForScore(score = 0) {
  if (score >= 85) return "institutional watch";
  if (score >= 70) return "strong candidate";
  if (score >= 50) return "developing candidate";
  if (score >= 30) return "early watch";
  return "low quality";
}

export function analyzeRichTokenIntelligence(project = {}) {
  const tokenAgeHours = calculateTokenAgeHours(project);
  const liquidityToVolumeRatio = calculateLiquidityToVolumeRatio(project);
  const buySellRatio = calculateBuySellRatio(project);

  const volume24h = num(project.volume24h ?? project.volume);
  const liquidityUsd = num(project.liquidityUsd ?? project.liquidity);
  const priceChange24h = num(project.priceChange24h);

  const richTokenIntelligence = {
    tokenAgeHours,
    tokenAgeLabel: classifyTokenAge(tokenAgeHours),
    liquidityClass: classifyLiquidity(project),
    volumeClass: classifyVolume(project),
    liquidityToVolumeRatio,
    buySellRatio,
    volume24h,
    liquidityUsd,
    priceChange24h,
    hasChart: Boolean(project.url),
    hasPairAddress: Boolean(project.pairAddress),
    hasTokenAddress: Boolean(project.address || project.tokenAddress),
    isNewLaunch: tokenAgeHours !== null && tokenAgeHours <= 72,
    isHighVolume: volume24h >= 250000,
    isLiquidEnough: liquidityUsd >= 50000,
    isBuyDominant: buySellRatio >= 1.25,
    isMomentumCandidate:
      priceChange24h > 20 &&
      volume24h >= 50000 &&
      liquidityUsd >= 10000,
  };

  let richTokenScore = 0;

  if (richTokenIntelligence.isNewLaunch) richTokenScore += 14;
  if (tokenAgeHours !== null && tokenAgeHours > 72 && tokenAgeHours <= 720) richTokenScore += 8;
  if (richTokenIntelligence.isHighVolume) richTokenScore += 18;
  else if (volume24h >= 50000) richTokenScore += 10;

  if (richTokenIntelligence.isLiquidEnough) richTokenScore += 18;
  else if (liquidityUsd >= 10000) richTokenScore += 8;

  if (richTokenIntelligence.isBuyDominant) richTokenScore += 14;
  if (buySellRatio >= 2) richTokenScore += 8;

  if (richTokenIntelligence.hasChart) richTokenScore += 8;
  if (richTokenIntelligence.hasPairAddress) richTokenScore += 8;
  if (richTokenIntelligence.hasTokenAddress) richTokenScore += 6;
  if (richTokenIntelligence.isMomentumCandidate) richTokenScore += 12;

  if (liquidityToVolumeRatio < 0.03 && volume24h > 250000) richTokenScore -= 8;
  if (liquidityUsd < 5000) richTokenScore -= 10;

  richTokenScore = clamp(Math.round(richTokenScore));

  const richTokenLevel = levelForScore(richTokenScore);
  const reasons = buildReasons(richTokenIntelligence);

  return {
    ...project,

    richTokenIntelligence,
    richTokenScore,
    richTokenLevel,
    richTokenReasons: reasons,

    intelligenceSignals: {
      ...(project.intelligenceSignals || {}),
      richToken: {
        score: richTokenScore,
        level: richTokenLevel,
        profile: richTokenIntelligence,
        reasons,
      },
    },

    evidence: [
      ...(project.evidence || []),
      {
        engine: "Rich Token Intelligence Engine",
        signal: "Token quality profile",
        score: richTokenScore,
        confidence: clamp(richTokenScore / 100, 0, 1),
        impact:
          richTokenScore >= 70
            ? "Strong Positive"
            : richTokenScore >= 50
            ? "Positive"
            : "Neutral",
        reasons,
      },
    ],

    alerts: [
      ...(project.alerts || []),
      ...(richTokenScore >= 85
        ? ["Institutional-grade rich token profile detected."]
        : richTokenScore >= 70
        ? ["Rich token profile detected."]
        : []),
    ],
  };
}

export function analyzeRichTokenIntelligenceBatch(projects = []) {
  return projects
    .map(analyzeRichTokenIntelligence)
    .sort(
      (a, b) => Number(b.richTokenScore || 0) - Number(a.richTokenScore || 0)
    );
}
