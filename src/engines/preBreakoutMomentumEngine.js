function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

function average(values = []) {
  const active = values.map(num).filter((value) => value > 0);
  if (!active.length) return 0;
  return Math.round(active.reduce((sum, value) => sum + value, 0) / active.length);
}

function maxMove(project = {}) {
  return Math.max(
    Math.abs(num(project.priceChange1h)),
    Math.abs(num(project.priceChange24h)),
    Math.abs(num(project.priceChange7d)),
    Math.abs(num(project.recentPriceMovePct))
  );
}

function fundamentalGrowth(project = {}) {
  return average([
    project.liquidityFormationScore,
    project.liquidityExpansionScore,
    project.developerActivityScore ?? project.developerScore,
    project.githubProScore,
    project.adoptionAccelerationScore,
    project.organicBuyerScore,
    project.holderGrowthScore,
    project.smartMoneyAccumulationScore,
    project.buyerRetentionScore,
    project.liveCatalystRadarScore,
  ]);
}

function chasePenalty(project = {}, fundamentals = 0) {
  const move = maxMove(project);
  const verticalCandle = project.verticalCandle === true || num(project.verticalCandleScore) >= 65;
  const socialLate = num(project.socialAccelerationScore || project.xSocialScore) >= 75 && fundamentals < 55;
  const liquidityThin = num(project.liquidityUsd) > 0 && num(project.liquidityUsd) < 25_000;
  const volumeCollapse = num(project.volumeCollapseScore) >= 60;
  const insiderDistribution = num(project.insiderDistributionScore) >= 55;

  return clamp(
    (move > 40 && fundamentals < 55 ? 30 : 0) +
      (move > 100 ? 25 : 0) +
      (verticalCandle ? 20 : 0) +
      (socialLate ? 16 : 0) +
      (liquidityThin ? 12 : 0) +
      (volumeCollapse ? 16 : 0) +
      (insiderDistribution ? 18 : 0) +
      Math.max(num(project.trapRiskScore) - 55, 0) * 0.45
  );
}

function stageFor(project = {}, score = 0, penalty = 0, fundamentals = 0) {
  const move = maxMove(project);
  const prePumpStatus = project.prePump?.status || project.preBreakoutStatus;

  if (prePumpStatus === "ALREADY_PUMPED" || move >= 140 || (move >= 90 && fundamentals < 55)) {
    return "ALREADY_PUMPED";
  }
  if (prePumpStatus === "LATE_CHASE" || penalty >= 55 || (move >= 55 && fundamentals < 50)) {
    return "LATE_CHASE";
  }
  if (project.falseBreakout === true || num(project.volumeCollapseScore) >= 70 || project.preBreakoutFailure === true) {
    return "FAILED_BREAKOUT";
  }
  if (score >= 76 && move < 55) return "BREAKOUT_STARTING";
  if (score >= 62) return "CONFIRMED_EARLY";
  if (score >= 42) return "EARLY_FORMATION";
  return "FAILED_BREAKOUT";
}

export function analyzePreBreakoutMomentum(project = {}) {
  const fundamentals = fundamentalGrowth(project);
  const move = maxMove(project);
  const expansion = average([
    project.momentumShiftScore,
    project.earlyBreakoutScore,
    project.accelerationScore,
    project.velocityScore,
    project.buyPressureScore,
    project.relativeStrengthScore,
    project.holderGrowthScore,
    project.uniqueBuyerGrowth,
    project.volatilityCompressionScore,
    project.liquidityFormationScore,
  ]);
  const pricePosition =
    move <= 15
      ? 72
      : move <= 35
      ? 68
      : move <= 55
      ? 46
      : move <= 90
      ? 24
      : 8;
  const penalty = chasePenalty(project, fundamentals);
  const preBreakoutMomentumScore = Math.round(
    clamp(
      expansion * 0.42 +
        fundamentals * 0.32 +
        pricePosition * 0.16 +
        num(project.volatilityCompressionScore) * 0.1 -
        penalty * 0.72
    )
  );
  const stage = stageFor(project, preBreakoutMomentumScore, penalty, fundamentals);

  return {
    ...project,
    preBreakoutMomentumScore,
    preBreakoutMomentumStage: stage,
    preBreakoutChasePenalty: Math.round(penalty),
    preBreakoutFundamentalGrowthScore: Math.round(fundamentals),
    preBreakoutPriceMovePct: Number(move.toFixed(2)),
    preBreakoutMomentum: {
      stage,
      score: preBreakoutMomentumScore,
      fundamentalGrowth: Math.round(fundamentals),
      priceMovePct: Number(move.toFixed(2)),
      chasePenalty: Math.round(penalty),
      reasons: [
        expansion >= 60 ? "Momentum expansion is forming across volume, buyers, liquidity, or relative strength." : "",
        fundamentals >= 60 ? "Fundamental growth supports the early momentum." : "",
        pricePosition >= 60 ? "Price has not yet moved far enough to classify as a chase." : "",
      ].filter(Boolean),
      warnings: [
        penalty >= 40 ? "Chase risk is elevated." : "",
        stage === "ALREADY_PUMPED" ? "Price action is already extended." : "",
        stage === "LATE_CHASE" ? "Move is late relative to fundamentals." : "",
        stage === "FAILED_BREAKOUT" ? "Momentum structure failed or lacks confirmation." : "",
      ].filter(Boolean),
    },
  };
}

export function analyzePreBreakoutMomentumBatch(projects = []) {
  return (Array.isArray(projects) ? projects : []).map(analyzePreBreakoutMomentum);
}
