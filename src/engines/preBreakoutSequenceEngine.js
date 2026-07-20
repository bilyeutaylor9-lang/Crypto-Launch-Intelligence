function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

function avg(values = []) {
  const finite = values.filter((value) => Number.isFinite(Number(value)));
  return finite.length ? finite.reduce((sum, value) => sum + Number(value), 0) / finite.length : 0;
}

export function classifyPreBreakoutTiming(project = {}) {
  const priceReturn1h = num(project.priceReturn1h ?? project.priceChange1hPct ?? project.priceChange1h);
  const priceReturn6h = num(project.priceReturn6h ?? project.priceChange6hPct ?? project.priceChange6h);
  const priceReturn24h = num(project.priceReturn24h ?? project.priceChange24hPct ?? project.priceChange24h);
  const priceReturn3d = num(project.priceReturn3d ?? project.priceChange3dPct ?? project.priceChange3d);
  const priceReturn7d = num(project.priceReturn7d ?? project.priceChange7dPct ?? project.priceChange7d);
  const realizedVolatility = num(project.realizedVolatility ?? project.realizedVolatilityScore);
  const volatilityCompression = clamp(project.volatilityCompression ?? project.volatilityCompressionScore ?? project.momentumCompressionScore);
  const rangeCompression = clamp(project.rangeCompression ?? project.rangeCompressionScore);
  const volumeAcceleration = clamp(project.volumeAcceleration ?? project.volumeAccelerationScore ?? project.volumeChange24hPct);
  const liquidityAcceleration = clamp(project.liquidityAcceleration ?? project.liquidityFormationScore ?? project.liquidityExpansionScore);
  const buyerAcceleration = clamp(project.buyerAcceleration ?? project.buyerBreadthAccelerationScore ?? project.buyerGrowthAcceleration);
  const holderAcceleration = clamp(project.holderAcceleration ?? project.holderGrowthScore);
  const developerAcceleration = clamp(project.developerAcceleration ?? project.developerAccelerationV2Score);
  const socialAcceleration = clamp(project.socialAcceleration ?? project.socialAccelerationScore ?? project.xSocialScore);
  const priceExtension = Math.max(Math.abs(priceReturn24h), Math.abs(priceReturn3d) * 0.8, Math.abs(priceReturn7d) * 0.55);
  const constructiveAcceleration = avg([volumeAcceleration, liquidityAcceleration, buyerAcceleration, holderAcceleration, developerAcceleration]);
  const compression = avg([volatilityCompression, rangeCompression, clamp(100 - realizedVolatility)]);

  let state = "DISCOVERED";
  if (priceReturn24h <= -25 || priceReturn7d <= -60) state = "BREAKDOWN";
  else if (constructiveAcceleration < 15 && volumeAcceleration < 10 && num(project.liquidityUsd) <= 0) state = "DEAD";
  else if (priceExtension >= 180 || priceReturn7d >= 350) state = "LATE_CHASE";
  else if (priceExtension >= 90) state = "EXTENDED";
  else if (priceReturn24h >= 35 && constructiveAcceleration >= 55) state = "BREAKOUT_CONFIRMATION";
  else if (compression >= 55 && buyerAcceleration >= 55 && liquidityAcceleration >= 45 && priceExtension <= 65) state = "PRE_BREAKOUT";
  else if (constructiveAcceleration >= 45 && priceExtension <= 80) state = "EARLY_TRACTION";
  else if (compression >= 45 && priceExtension <= 30) state = "QUIET_ACCUMULATION";

  return {
    priceReturn1h,
    priceReturn6h,
    priceReturn24h,
    priceReturn3d,
    priceReturn7d,
    realizedVolatility,
    volatilityCompression,
    rangeCompression,
    volumeAcceleration,
    liquidityAcceleration,
    buyerAcceleration,
    holderAcceleration,
    developerAcceleration,
    socialAcceleration,
    priceExtension: Math.round(priceExtension),
    constructiveAcceleration: Math.round(constructiveAcceleration),
    compression: Math.round(compression),
    timingState: state,
  };
}

export function analyzePreBreakoutSequence(project = {}) {
  const sequence = classifyPreBreakoutTiming(project);
  return {
    ...project,
    ...sequence,
    preBreakoutTimingState: sequence.timingState,
    preBreakoutSequenceScore: Math.round(clamp(
      sequence.compression * 0.22 +
        sequence.buyerAcceleration * 0.22 +
        sequence.liquidityAcceleration * 0.2 +
        sequence.developerAcceleration * 0.14 +
        clamp(100 - sequence.priceExtension) * 0.22
    )),
  };
}

export function analyzePreBreakoutSequenceBatch(projects = []) {
  return (Array.isArray(projects) ? projects : []).map(analyzePreBreakoutSequence);
}
