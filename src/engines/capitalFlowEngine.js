// src/engines/capitalFlowEngine.js

/**
 * Capital Flow Engine
 *
 * Purpose:
 * Measures whether money is flowing into or out of a project
 * by comparing buy volume, sell volume, liquidity growth,
 * whale flow, and smart-wallet flow.
 */

export function calculateCapitalFlow(project = {}) {
  const buyVolume = Number(project.buyVolume24h || 0);
  const sellVolume = Number(project.sellVolume24h || 0);
  const liquidityGrowth = Number(project.liquidityGrowth24h || 0);
  const whaleNetFlow = Number(project.whaleActivity?.whaleNetFlowUsd || project.whaleNetFlowUsd || 0);
  const smartWalletNetFlow =
    Number(project.smartWalletSignal?.smartWalletNetFlowUsd || project.smartWalletNetFlowUsd || 0);

  const netRetailFlow = buyVolume - sellVolume;
  const totalNetFlow = netRetailFlow + whaleNetFlow + smartWalletNetFlow;

  return {
    buyVolume,
    sellVolume,
    netRetailFlow,
    whaleNetFlow,
    smartWalletNetFlow,
    liquidityGrowth,
    totalNetFlow
  };
}

export function scoreCapitalFlow(project = {}) {
  const flow = calculateCapitalFlow(project);

  let score = 0;

  if (flow.netRetailFlow > 0) score += 20;
  if (flow.totalNetFlow > 10000) score += 20;
  if (flow.totalNetFlow > 50000) score += 20;
  if (flow.liquidityGrowth >= 10) score += 15;
  if (flow.liquidityGrowth >= 30) score += 15;
  if (flow.smartWalletNetFlow > 0) score += 10;

  return Math.max(0, Math.min(100, score));
}

export function analyzeCapitalFlow(project = {}) {
  const capitalFlow = calculateCapitalFlow(project);
  const capitalFlowScore = scoreCapitalFlow(project);

  return {
    ...project,
    capitalFlow,
    capitalFlowScore,
    capitalFlowLevel:
      capitalFlowScore >= 80 ? "strong inflow" :
      capitalFlowScore >= 60 ? "positive inflow" :
      capitalFlowScore >= 40 ? "mixed flow" :
      "weak or negative flow",

    evidence: [
      ...(project.evidence || []),
      {
        engine: "Capital Flow Engine",
        signal: "Net capital flow",
        confidence: Math.min(capitalFlowScore / 100, 1),
        impact: capitalFlow.totalNetFlow > 0 ? "Positive" : "Negative"
      }
    ],

    alerts: [
      ...(project.alerts || []),
      ...(capitalFlowScore >= 75 ? ["Strong capital inflow detected."] : [])
    ]
  };
}

export function analyzeCapitalFlowBatch(projects = []) {
  return projects
    .map(analyzeCapitalFlow)
    .sort((a, b) => b.capitalFlowScore - a.capitalFlowScore);
}
