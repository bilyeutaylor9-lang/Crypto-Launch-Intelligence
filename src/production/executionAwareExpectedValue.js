import { clamp, finite } from "./productionMath.js";

function routeQuality(candidate = {}) {
  const status = String(
    candidate.routeTruthStatus ?? candidate.executionStatus ?? candidate.canonicalExecutionRoute?.status ?? "UNKNOWN"
  ).toUpperCase();
  if (/LIVE_EXECUTION_READY|VERIFIED/.test(status)) return 1;
  if (/DEGRADED|PARTIAL/.test(status)) return 0.55;
  if (/BLOCK|FAILED|UNAVAILABLE/.test(status)) return 0;
  return 0.25;
}

export function computeExecutionAwareEV(candidate = {}, options = {}) {
  const p25 = clamp((finite(candidate.probability25Pct ?? candidate.forwardScenario?.probability25Pct) ?? 0) / 100);
  const p50 = clamp((finite(candidate.probability50Pct ?? candidate.forwardScenario?.probability50Pct ?? candidate.ignitionGenome?.probability50Pct) ?? 0) / 100);
  const p100 = clamp((finite(candidate.probability100Pct ?? candidate.forwardScenario?.probability100Pct ?? candidate.ignitionGenome?.probability100Pct) ?? 0) / 100);
  const pLoss20 = clamp((finite(candidate.probabilityLoss20Pct ?? candidate.forwardScenario?.probabilityLoss20Pct ?? candidate.ignitionGenome?.failureProbabilityPct) ?? 0) / 100);
  const liquidity = Math.max(0, finite(candidate.liquidityUsd ?? candidate.activeLiquidityUsd ?? candidate.stableExitLiquidityUsd) ?? 0);
  const depth = Math.max(0, finite(candidate.orderBookDepthUsd ?? candidate.verifiedDepthUsd ?? candidate.canonicalExecutionRoute?.verifiedDepthUsd) ?? 0);
  const slippage = Math.max(0, finite(candidate.estimatedRoundTripSlippagePct ?? candidate.canonicalExecutionRoute?.estimatedRoundTripSlippagePct ?? candidate.forwardScenario?.assumedRoundTripSlippagePct) ?? 2.5);
  const quality = routeQuality(candidate);
  const sizeUsd = Math.max(1, Number(options.referenceSizeUsd || 500));
  const depthBase = Math.max(liquidity * 0.01, depth, 1);
  const sizeImpactPct = clamp(sizeUsd / depthBase) * Number(options.maxSizeImpactPct || 12);

  const incremental50 = Math.max(0, p50 - p100);
  const incremental25 = Math.max(0, p25 - p50);
  const residualPositive = Math.max(0, 1 - p25 - pLoss20);
  const grossEV = p100 * 100 + incremental50 * 50 + incremental25 * 25 + residualPositive * 5 - pLoss20 * 25;
  const friction = slippage + sizeImpactPct + (1 - quality) * Number(options.routePenaltyPct || 12);
  const captureableEV = grossEV - friction;
  const maxResearchNotional = Math.max(0, Math.min(
    finite(options.maxNotionalUsd) ?? 5_000,
    liquidity * Number(options.maxLiquidityShare || 0.003),
    depth > 0 ? depth * Number(options.maxDepthShare || 0.05) : Infinity
  ));

  return {
    grossExpectedValuePct: Number(grossEV.toFixed(2)),
    estimatedFrictionPct: Number(friction.toFixed(2)),
    captureableExpectedValuePct: Number(captureableEV.toFixed(2)),
    routeQuality: Number(quality.toFixed(3)),
    referenceSizeUsd: sizeUsd,
    estimatedSizeImpactPct: Number(sizeImpactPct.toFixed(2)),
    researchNotionalCeilingUsd: Number(maxResearchNotional.toFixed(2)),
    state: quality === 0 ? "EXECUTION_BLOCKED" : captureableEV >= 15 ? "HIGH_CAPTUREABLE_EV_RESEARCH" : captureableEV >= 5 ? "POSITIVE_CAPTUREABLE_EV_RESEARCH" : captureableEV < 0 ? "NEGATIVE_AFTER_FRICTION" : "MARGINAL_AFTER_FRICTION",
    policy: { researchEstimateOnly: true, executableQuote: false, automaticTrading: false },
  };
}
