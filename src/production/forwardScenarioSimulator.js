import { clamp, finite, seededRandom } from "./productionMath.js";

function normal(random) {
  const u = Math.max(1e-12, random());
  const v = Math.max(1e-12, random());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function simulateForwardDistribution(candidate = {}, options = {}) {
  const paths = Math.max(250, Number(options.paths || 4096));
  const random = seededRandom(Number(options.seed || 1729));
  const start = Math.max(1e-12, finite(candidate.priceUsd) ?? 1);
  const p50 = clamp((finite(candidate.probability50Pct ?? candidate.ignitionGenome?.probability50Pct) ?? 25) / 100);
  const pFailure = clamp((finite(candidate.failureProbabilityPct ?? candidate.ignitionGenome?.failureProbabilityPct) ?? 20) / 100);
  const convergence = clamp((finite(candidate.convergenceStrengthPct ?? candidate.convergence?.convergenceStrengthPct) ?? 0) / 100);
  const liquidity = Math.max(1, finite(candidate.liquidityUsd) ?? 100_000);
  const slippagePct = Math.min(25, 100_000 / liquidity);

  const returns = [];
  let hit25BeforeLoss15 = 0;
  let hit50 = 0;
  let hit100 = 0;
  let loss20 = 0;

  for (let i = 0; i < paths; i += 1) {
    const latentEdge = (p50 - 0.25) * 0.9 + convergence * 0.35 - pFailure * 0.55;
    const volatility = 0.28 + pFailure * 0.45;
    const shock = normal(random) * volatility;
    const tail = random() < pFailure * 0.25 ? -(0.4 + random() * 0.5) : 0;
    const positiveTail = random() < p50 * 0.22 ? 0.5 + random() * 1.3 : 0;
    const gross = Math.exp(latentEdge + shock + tail + positiveTail) - 1;
    const net = gross - slippagePct / 100;
    returns.push(net * 100);
    if (net >= 0.25) hit25BeforeLoss15 += 1;
    if (net >= 0.50) hit50 += 1;
    if (net >= 1.00) hit100 += 1;
    if (net <= -0.20) loss20 += 1;
  }

  returns.sort((a, b) => a - b);
  const pick = (q) => returns[Math.min(returns.length - 1, Math.floor(q * (returns.length - 1)))];

  return {
    paths,
    probability25Pct: Number((hit25BeforeLoss15 / paths * 100).toFixed(2)),
    probability50Pct: Number((hit50 / paths * 100).toFixed(2)),
    probability100Pct: Number((hit100 / paths * 100).toFixed(2)),
    probabilityLoss20Pct: Number((loss20 / paths * 100).toFixed(2)),
    returnP10Pct: Number(pick(0.10).toFixed(2)),
    returnMedianPct: Number(pick(0.50).toFixed(2)),
    returnP90Pct: Number(pick(0.90).toFixed(2)),
    assumedRoundTripSlippagePct: Number(slippagePct.toFixed(3)),
    state: "RESEARCH_SCENARIO_DISTRIBUTION",
    calibratedForecast: false,
    automaticTrading: false,
  };
}
