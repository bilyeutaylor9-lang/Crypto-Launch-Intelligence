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

function pctAbs(value = 0) {
  return Math.abs(num(value));
}

function liquidityFormationScore(project = {}) {
  const liquidityGrowthPct = Math.max(
    num(project.liquidityGrowth24h),
    num(project.liquidityGrowth7d),
    num(project.nativeLifecycle?.liquidityState?.liquidityExpansionUsd) > 0 ? 45 : 0
  );
  const depth = Math.log10(Math.max(10, num(project.liquidityUsd || project.activeLiquidityUsd))) * 12;
  const expansion = average([
    project.liquidityExpansionScore,
    project.activeLiquidityTruthScore,
    liquidityGrowthPct,
    depth,
  ]);

  return clamp(expansion);
}

function smartWalletScore(project = {}) {
  const gradualAccumulation = project.smartWalletAccumulationPattern === "gradual" ? 18 : 0;
  const holdBehavior = num(project.smartWalletHoldRatePct || project.repeatBuyerRetentionPct) * 0.5;
  const insiderPenalty =
    num(project.insiderWalletSharePct) >= 35 ||
    project.smartWalletVerdict === "Insider Dominated"
      ? 35
      : 0;

  return clamp(
    average([
      project.smartMoneyAccumulationScore,
      project.smartWalletPerformanceScore,
      project.smartWalletScore,
      project.buyerRetentionScore,
      project.whaleActivityScore ?? project.whaleScore,
      holdBehavior,
    ]) +
      gradualAccumulation -
      insiderPenalty
  );
}

function distributionRisk(project = {}) {
  return clamp(
    Math.max(
      num(project.sellPressureScore),
      num(project.insiderDistributionScore),
      num(project.topHolderConcentrationRisk),
      num(project.walletClusterRiskScore),
      num(project.washTradingRiskScore),
      num(project.bundledLaunchRiskScore),
      num(project.deployerRiskScore)
    )
  );
}

function controlledPriceScore(project = {}) {
  const move = Math.max(
    pctAbs(project.priceChange24h),
    pctAbs(project.priceChange7d),
    pctAbs(project.recentPriceMovePct)
  );
  const volatility = Math.max(num(project.volatilityScore), num(project.volatilityExpansionScore));

  if (move >= 120) return 5;
  if (move >= 60) return 24;
  if (move >= 35) return 46;
  if (move <= 18 && volatility <= 55) return 86;
  if (move <= 30) return 70;
  return 55;
}

function durationLabel(project = {}) {
  const days = Math.max(
    num(project.accumulationDays),
    num(project.signalPersistence?.days),
    num(project.projectWatchChange?.daysObserved),
    num(project.nativeLifecycle?.eventCount) >= 3 ? 2 : 0
  );

  if (days >= 21) return "multi-week";
  if (days >= 7) return "week-plus";
  if (days >= 2) return "multi-day";
  return "single-snapshot";
}

export function analyzeQuietAccumulation(project = {}) {
  const liquidityScore = liquidityFormationScore(project);
  const walletScore = smartWalletScore(project);
  const holderScore = average([
    project.holderGrowthScore,
    project.uniqueBuyerGrowth,
    project.buyerRetentionScore,
    project.repeatBuyerGrowthScore,
  ]);
  const volumeScore = average([
    project.volumeAccelerationScore,
    project.accelerationScore,
    project.buyPressureScore,
    project.capitalFlowScore,
  ]);
  const developerOrAdoption = average([
    project.developerActivityScore ?? project.developerScore,
    project.githubProScore,
    project.githubScore ?? project.githubQualityScore,
    project.adoptionAccelerationScore,
    project.organicBuyerScore,
    project.buyerRetentionScore,
  ]);
  const priceControl = controlledPriceScore(project);
  const socialAttention = Math.max(num(project.xSocialScore), num(project.socialAccelerationScore), num(project.influencerCoverageScore));
  const socialQuietBonus = socialAttention > 80 ? -12 : socialAttention < 45 ? 10 : 0;
  const risk = distributionRisk(project);
  const manipulationPenalty = Math.max(
    num(project.washTradingRiskScore),
    num(project.botClusterRiskScore),
    num(project.sybilRiskScore),
    num(project.insiderWalletSharePct) >= 45 ? 65 : 0
  );
  const quietAccumulationScore = Math.round(
    clamp(
      liquidityScore * 0.22 +
        walletScore * 0.2 +
        holderScore * 0.14 +
        volumeScore * 0.12 +
        developerOrAdoption * 0.16 +
        priceControl * 0.12 +
        socialQuietBonus -
        risk * 0.16 -
        manipulationPenalty * 0.18
    )
  );
  const breakoutReadinessScore = Math.round(
    clamp(
      quietAccumulationScore * 0.5 +
        liquidityScore * 0.18 +
        walletScore * 0.14 +
        developerOrAdoption * 0.12 +
        priceControl * 0.06 -
        risk * 0.1
    )
  );
  const accumulationStrength =
    quietAccumulationScore >= 78
      ? "Strong"
      : quietAccumulationScore >= 62
      ? "Developing"
      : quietAccumulationScore >= 45
      ? "Weak"
      : "Not Confirmed";
  const detected =
    quietAccumulationScore >= 60 &&
    liquidityScore >= 45 &&
    walletScore >= 40 &&
    priceControl >= 55 &&
    risk < 62 &&
    manipulationPenalty < 55;

  return {
    ...project,
    quietAccumulationDetected: detected,
    quietAccumulationScore,
    accumulationDuration: durationLabel(project),
    accumulationStrength,
    smartWalletAccumulationScore: Math.round(walletScore),
    liquidityFormationScore: Math.round(liquidityScore),
    distributionRisk: Math.round(risk),
    breakoutReadinessScore,
    quietAccumulation: {
      detected,
      score: quietAccumulationScore,
      duration: durationLabel(project),
      strength: accumulationStrength,
      moduleScores: {
        liquidityFormation: Math.round(liquidityScore),
        smartWalletAccumulation: Math.round(walletScore),
        holderGrowth: Math.round(holderScore),
        volumeFormation: Math.round(volumeScore),
        developerOrAdoption,
        controlledPrice: Math.round(priceControl),
        socialAttention: Math.round(socialAttention),
        distributionRisk: Math.round(risk),
        manipulationPenalty: Math.round(manipulationPenalty),
      },
      reasons: [
        liquidityScore >= 55 ? "Liquidity formation is improving before a confirmed price breakout." : "",
        walletScore >= 55 ? "Quality-wallet accumulation is building gradually." : "",
        priceControl >= 65 ? "Price action remains controlled instead of vertical." : "",
        socialAttention < 50 ? "Social attention remains low relative to fundamentals." : "",
      ].filter(Boolean),
      warnings: [
        risk >= 55 ? "Distribution risk is elevated." : "",
        manipulationPenalty >= 45 ? "Manipulation or insider-wallet risk needs review." : "",
        priceControl < 45 ? "Price action may already be too extended for quiet accumulation." : "",
      ].filter(Boolean),
    },
  };
}

export function analyzeQuietAccumulationBatch(projects = []) {
  return (Array.isArray(projects) ? projects : []).map(analyzeQuietAccumulation);
}
