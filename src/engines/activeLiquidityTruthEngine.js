const SELL_TESTS = [1_000, 10_000, 100_000, 1_000_000];

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

function firstNumber(project = {}, paths = []) {
  for (const path of paths) {
    const value = path.split(".").reduce((acc, part) => (acc ? acc[part] : undefined), project);
    if (Number.isFinite(Number(value)) && Number(value) > 0) return Number(value);
  }
  return 0;
}

export function simulateMassExit(project = {}, sellSizes = SELL_TESTS) {
  const lifecycle = project.nativeLifecycle || {};
  const state = lifecycle.liquidityState || {};
  const displayedLiquidityUsd = firstNumber(project, [
    "displayedLiquidityUsd",
    "liquidityUsd",
    "liquidity",
    "nativeLifecycle.liquidityState.displayedLiquidityUsd",
  ]);
  const activeLiquidityUsd = firstNumber(project, [
    "activeLiquidityUsd",
    "nativeLifecycle.liquidityState.activeLiquidityUsd",
  ]) || displayedLiquidityUsd * 0.62;
  const stableExitLiquidityUsd = firstNumber(project, [
    "stableExitLiquidityUsd",
    "hardExitLiquidityUsd",
    "nativeLifecycle.liquidityState.stableExitLiquidityUsd",
  ]) || activeLiquidityUsd * 0.48;
  const protocolControlledLiquidityPct = clamp(
    firstNumber(project, [
      "protocolControlledLiquidityPct",
      "protocolOwnedLiquidityPct",
      "nativeLifecycle.liquidityState.protocolControlledLiquidityPct",
    ])
  );
  const usableLiquidityRatio = displayedLiquidityUsd > 0 ? stableExitLiquidityUsd / displayedLiquidityUsd : 0;

  return {
    displayedLiquidityUsd: Math.round(displayedLiquidityUsd),
    activeLiquidityUsd: Math.round(activeLiquidityUsd),
    stableExitLiquidityUsd: Math.round(stableExitLiquidityUsd),
    usableLiquidityRatio: Number(usableLiquidityRatio.toFixed(3)),
    protocolControlledLiquidityPct: Math.round(protocolControlledLiquidityPct),
    sellTests: sellSizes.map((sellUsd) => {
      const depth = Math.max(1, stableExitLiquidityUsd);
      const impact = clamp((sellUsd / depth) * 42 + Math.max(0, sellUsd - depth) / depth * 58, 0, 99);
      return {
        sellUsd,
        estimatedPriceImpactPct: Number(impact.toFixed(2)),
        executable: sellUsd <= depth * 1.35,
      };
    }),
  };
}

export function analyzeActiveLiquidityTruth(project = {}) {
  const simulation = simulateMassExit(project);
  const usableScore = clamp(simulation.usableLiquidityRatio * 100);
  const depthScore = clamp(Math.log10(Math.max(10, simulation.stableExitLiquidityUsd)) * 10);
  const controlPenalty = simulation.protocolControlledLiquidityPct >= 80
    ? 25
    : simulation.protocolControlledLiquidityPct >= 50
    ? 14
    : simulation.protocolControlledLiquidityPct >= 25
    ? 6
    : 0;
  const millionExit = simulation.sellTests.find((test) => test.sellUsd === 1_000_000);
  const impactPenalty = millionExit?.estimatedPriceImpactPct >= 80 ? 14 : millionExit?.estimatedPriceImpactPct >= 50 ? 8 : 0;
  const score = Math.round(clamp(28 + usableScore * 0.42 + depthScore - controlPenalty - impactPenalty));
  const liquidityControlRisk = Math.round(
    clamp(
      (1 - Math.min(1, simulation.usableLiquidityRatio)) * 45 +
        simulation.protocolControlledLiquidityPct * 0.4 +
        (millionExit?.estimatedPriceImpactPct || 0) * 0.28
    )
  );

  return {
    ...project,
    activeLiquidityTruthScore: score,
    liquidityControlRisk,
    activeLiquidityTruthVerdict:
      score >= 75 ? "Usable Exit Liquidity Confirmed" : score >= 50 ? "Developing Liquidity Truth" : "Displayed Liquidity Risk",
    activeLiquidityTruth: simulation,
    hardExitLiquidityUsd: simulation.stableExitLiquidityUsd,
    stableExitLiquidityUsd: simulation.stableExitLiquidityUsd,
    activeLiquidityUsd: simulation.activeLiquidityUsd,
  };
}

export function analyzeActiveLiquidityTruthBatch(projects = []) {
  return projects.map((project) => analyzeActiveLiquidityTruth(project));
}
