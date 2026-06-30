// src/engines/liquidityExpansionEngine.js

/**
 * Liquidity Expansion Engine v2
 *
 * Purpose:
 * Detects liquidity quality and expansion potential even when
 * previous liquidity snapshots are not yet available.
 */

function num(value = 0) {
  return Number(value || 0);
}

export function calculateLiquidityExpansion(project = {}) {
  const currentLiquidity = num(project.liquidityUsd);
  const previousLiquidity = num(project.previousLiquidityUsd);

  const expansionRate =
    previousLiquidity > 0
      ? ((currentLiquidity - previousLiquidity) / previousLiquidity) * 100
      : 0;

  return {
    currentLiquidity,
    previousLiquidity,
    expansionRate
  };
}

export function scoreLiquidityExpansion(project = {}) {
  const liquidity = calculateLiquidityExpansion(project);
  let score = 0;

  if (liquidity.currentLiquidity >= 25000) score += 10;
  if (liquidity.currentLiquidity >= 100000) score += 20;
  if (liquidity.currentLiquidity >= 250000) score += 20;
  if (liquidity.currentLiquidity >= 1000000) score += 20;

  if (liquidity.expansionRate >= 10) score += 10;
  if (liquidity.expansionRate >= 25) score += 10;
  if (liquidity.expansionRate >= 50) score += 10;

  if (num(project.volume24h) >= 250000 && liquidity.currentLiquidity >= 50000) {
    score += 10;
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

export function analyzeLiquidityExpansion(project = {}) {
  const liquidityExpansion = calculateLiquidityExpansion(project);
  const liquidityExpansionScore = scoreLiquidityExpansion(project);

  return {
    ...project,
    liquidityExpansion,
    liquidityExpansionScore,
    liquidityExpansionLevel:
      liquidityExpansionScore >= 85 ? "institutional liquidity" :
      liquidityExpansionScore >= 70 ? "strong liquidity" :
      liquidityExpansionScore >= 50 ? "developing liquidity" :
      liquidityExpansionScore >= 30 ? "early liquidity" :
      "thin liquidity",

    evidence: [
      ...(project.evidence || []),
      {
        engine: "Liquidity Expansion Engine v2",
        signal: "Liquidity quality and expansion",
        confidence: Math.min(liquidityExpansionScore / 100, 1),
        impact: liquidityExpansionScore >= 50 ? "Positive" : "Neutral"
      }
    ],

    alerts: [
      ...(project.alerts || []),
      ...(liquidityExpansionScore >= 70
        ? ["Strong liquidity profile detected."]
        : [])
    ]
  };
}

export function analyzeLiquidityExpansionBatch(projects = []) {
  return projects
    .map(analyzeLiquidityExpansion)
    .sort((a, b) => b.liquidityExpansionScore - a.liquidityExpansionScore);
}
