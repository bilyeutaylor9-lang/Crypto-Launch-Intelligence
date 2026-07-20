function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

function firstNumber(values = []) {
  return values.find((value) => Number.isFinite(Number(value))) ?? null;
}

function growth(current, previous) {
  if (!num(previous)) return null;
  return ((num(current) - num(previous)) / Math.abs(num(previous))) * 100;
}

export function analyzeLiquidityFormation(project = {}) {
  const liquidity1h = firstNumber([project.liquidity1h, project.liquidityUsd1h, project.liquiditySequence?.h1]);
  const liquidity6h = firstNumber([project.liquidity6h, project.liquidityUsd6h, project.liquiditySequence?.h6]);
  const liquidity24h = firstNumber([project.liquidity24h, project.liquidityUsd24h, project.liquidityUsd, project.dexLiquidityUsd, project.liquiditySequence?.h24]);
  const liquidity3d = firstNumber([project.liquidity3d, project.liquidityUsd3d, project.liquiditySequence?.d3]);
  const liquidityGrowth = firstNumber([project.liquidityGrowth, project.liquidityGrowth24hPct, growth(liquidity24h, liquidity6h), project.liquidityChange24hPct]);
  const liquidityAcceleration = firstNumber([project.liquidityAcceleration, project.liquidityAccelerationScore, growth(liquidity6h, liquidity1h), project.liquidityExpansionScore]);
  const LPProviderCount = num(project.LPProviderCount ?? project.lpProviderCount ?? project.liquidityProviderCount);
  const largestLPShare = num(project.largestLPShare ?? project.largestLpSharePct ?? project.ownerLpSharePct);
  const top5LPShare = num(project.top5LPShare ?? project.top5LpSharePct);
  const removableLiquidityPct = num(project.removableLiquidityPct ?? project.ownerLpSharePct);
  const lockedLiquidityPct = num(project.lockedLiquidityPct ?? project.lpLockedPct);
  const burnedLiquidityPct = num(project.burnedLiquidityPct ?? project.lpBurnedPct);
  const stableExitLiquidityUsd = num(project.stableExitLiquidityUsd ?? project.hardExitLiquidityUsd ?? project.liquidityUsd);
  const marketCap = num(project.circulatingMarketCapUsd ?? project.marketCap);
  const volume = num(project.volume24hUsd ?? project.volume24h);
  const liquidityToMarketCap = marketCap ? Number((num(liquidity24h) / marketCap).toFixed(4)) : null;
  const volumeToLiquidity = num(liquidity24h) ? Number((volume / num(liquidity24h)).toFixed(4)) : null;
  const estimatedExitCapacity = stableExitLiquidityUsd * Math.max(0.2, 1 - removableLiquidityPct / 100);
  const formationScore = Math.round(clamp(
    clamp(num(liquidity24h), 0, 500000) * 0.00006 +
      clamp(liquidityGrowth ?? 0, -100, 200) * 0.16 +
      clamp(liquidityAcceleration ?? 0, -100, 200) * 0.14 +
      clamp(LPProviderCount, 0, 25) * 1.4 +
      clamp(lockedLiquidityPct + burnedLiquidityPct, 0, 100) * 0.18 +
      clamp(stableExitLiquidityUsd, 0, 300000) * 0.00008 -
      clamp(largestLPShare) * 0.22 -
      clamp(removableLiquidityPct) * 0.22
  ));
  const liquidityFormationState =
    !num(liquidity24h)
      ? "FAKE_OR_UNVERIFIED_LIQUIDITY"
      : removableLiquidityPct >= 65 || largestLPShare >= 75
        ? "REMOVABLE_LIQUIDITY"
        : top5LPShare >= 85
          ? "CONCENTRATED_LIQUIDITY"
          : liquidityGrowth >= 25 && liquidityAcceleration >= 20 && lockedLiquidityPct + burnedLiquidityPct >= 40
            ? "ORGANIC_LIQUIDITY_FORMATION"
            : liquidityGrowth >= 15
              ? "INCENTIVE_LIQUIDITY"
              : "TEMPORARY_LIQUIDITY";

  return {
    ...project,
    liquidity1h,
    liquidity6h,
    liquidity24h,
    liquidity3d,
    liquidityGrowth,
    liquidityAcceleration,
    persistentLiquidityGrowth: liquidityGrowth >= 15 && num(liquidity24h) >= num(liquidity6h || 0) && num(liquidity6h || 0) >= num(liquidity1h || 0),
    LPProviderCount,
    largestLPShare,
    top5LPShare,
    removableLiquidityPct,
    lockedLiquidityPct,
    burnedLiquidityPct,
    stableExitLiquidityUsd,
    liquidityToMarketCap,
    volumeToLiquidity,
    estimatedExitCapacity,
    liquidityFormationScore: formationScore,
    liquidityFormationState,
  };
}

export function analyzeLiquidityFormationBatch(projects = []) {
  return (Array.isArray(projects) ? projects : []).map(analyzeLiquidityFormation);
}
