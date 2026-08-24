import { clamp, finite, mean, median } from "./productionMath.js";

function pct(value) {
  const n = finite(value);
  return n === null ? null : n;
}

function candidateReturn(row = {}) {
  return pct(row.priceChange24hPct ?? row.marketData?.priceChange24hPct);
}

function liquidityChange(row = {}) {
  return pct(row.liquidityGrowthPct ?? row.capitalFlowBaseline?.liquidityGrowthPct);
}

function volumeChange(row = {}) {
  return pct(row.volumeAccelerationPct ?? row.capitalFlowBaseline?.volumeGrowthPct);
}

function cap(row = {}) {
  return finite(row.marketCapUsd ?? row.marketCap ?? row.circulatingMarketCapUsd);
}

function crossSection(projects = []) {
  const rows = Array.isArray(projects) ? projects : [];
  const returns = rows.map(candidateReturn).filter((v) => v !== null);
  const liquidity = rows.map(liquidityChange).filter((v) => v !== null);
  const volume = rows.map(volumeChange).filter((v) => v !== null);
  const breadth = returns.length ? returns.filter((v) => v > 0).length / returns.length : null;
  const strongBreadth = returns.length ? returns.filter((v) => v >= 10).length / returns.length : null;
  const microcaps = rows.filter((row) => {
    const value = cap(row);
    return value !== null && value <= 50_000_000;
  });
  const microReturns = microcaps.map(candidateReturn).filter((v) => v !== null);
  return {
    candidates: rows.length,
    breadthPct: breadth === null ? null : breadth * 100,
    strongBreadthPct: strongBreadth === null ? null : strongBreadth * 100,
    medianReturn24hPct: median(returns),
    medianLiquidityChangePct: median(liquidity),
    medianVolumeChangePct: median(volume),
    microcapBreadthPct: microReturns.length
      ? microReturns.filter((v) => v > 0).length / microReturns.length * 100
      : null,
  };
}

function dispersion(values = []) {
  const active = values.map(finite).filter((v) => v !== null);
  if (active.length < 2) return null;
  const center = mean(active);
  return Math.sqrt(mean(active.map((v) => (v - center) ** 2)) || 0);
}

export function buildMarketRegimeBrain(snapshot = {}, projects = [], options = {}) {
  const section = crossSection(projects);
  const returns = (Array.isArray(projects) ? projects : []).map(candidateReturn).filter((v) => v !== null);
  const baseState = String(
    snapshot.state ?? snapshot.globalMarketRegimeState ?? snapshot.globalMarketRegime?.state ?? "UNOBSERVED"
  ).toUpperCase();
  const btc = pct(snapshot.btcReturn24hPct ?? snapshot.inputs?.btcReturn24hPct);
  const stable = pct(snapshot.stablecoinLiquidityChangePct ?? snapshot.inputs?.stablecoinLiquidityChangePct);
  const dex = pct(snapshot.dexVolumeChangePct ?? snapshot.inputs?.dexVolumeChangePct);
  const volatility = pct(snapshot.marketVolatilityPercentile ?? snapshot.inputs?.marketVolatilityPercentile);
  const breadth = pct(snapshot.altBreadthPct ?? snapshot.inputs?.altBreadthPct ?? section.breadthPct);
  const liquidity = section.medianLiquidityChangePct;
  const volume = section.medianVolumeChangePct;
  const returnDispersion = dispersion(returns);

  const riskOnScore = mean([
    btc === null ? null : clamp((btc + 8) / 16) * 100,
    breadth,
    dex === null ? volume === null ? null : clamp((volume + 20) / 80) * 100 : clamp((dex + 20) / 80) * 100,
    stable === null ? null : clamp((stable + 3) / 8) * 100,
    liquidity === null ? null : clamp((liquidity + 20) / 80) * 100,
    section.microcapBreadthPct,
  ]);
  const stressScore = mean([
    volatility,
    btc === null ? null : clamp((-btc + 2) / 12) * 100,
    stable === null ? null : clamp((-stable + 1) / 6) * 100,
    liquidity === null ? null : clamp((-liquidity + 5) / 45) * 100,
  ]);

  let state = "NEUTRAL_SELECTIVE";
  if ((stressScore ?? 0) >= 75 || baseState === "RISK_OFF_STRESS") state = "VOLATILITY_SHOCK";
  else if ((liquidity ?? 0) <= -15 || ((stable ?? 0) < -1 && (dex ?? volume ?? 0) < -10)) state = "LIQUIDITY_CONTRACTION";
  else if ((riskOnScore ?? 0) >= 72 && (breadth ?? 0) >= 60 && (stressScore ?? 100) < 65) state = "LIQUIDITY_EXPANSION_RISK_ON";
  else if ((riskOnScore ?? 0) >= 62 && (breadth ?? 0) >= 52) state = "TRENDING_RISK_ON";
  else if ((breadth ?? 50) < 48 && (returnDispersion ?? 0) >= 12) state = "SELECTIVE_ROTATION";

  const confidenceInputs = [btc, breadth, stable, dex ?? volume, volatility, liquidity].filter((v) => v !== null).length;
  const confidence = clamp(confidenceInputs / 6) * (projects.length >= 20 ? 1 : 0.75);

  return {
    schemaVersion: 1,
    generatedAt: options.now || new Date().toISOString(),
    state,
    baseRegimeState: baseState,
    confidence: Number(confidence.toFixed(4)),
    confidencePct: Number((confidence * 100).toFixed(2)),
    riskOnScore: riskOnScore === null ? null : Number(riskOnScore.toFixed(2)),
    stressScore: stressScore === null ? null : Number(stressScore.toFixed(2)),
    returnDispersionPct: returnDispersion === null ? null : Number(returnDispersion.toFixed(2)),
    crossSection: section,
    inputs: { btcReturn24hPct: btc, stablecoinLiquidityChangePct: stable, dexVolumeChangePct: dex, marketVolatilityPercentile: volatility, altBreadthPct: breadth },
    specialistBias: specialistBiasForRegime(state),
    policy: { researchOnly: true, automaticTrading: false, perTokenReturnsDoNotReplaceGlobalInputs: true },
  };
}

export function specialistBiasForRegime(state = "") {
  const key = String(state).toUpperCase();
  const defaults = { genome: 1, wallet: 1, capital: 1, narrative: 1, execution: 1, safety: 1 };
  if (key === "LIQUIDITY_EXPANSION_RISK_ON") return { ...defaults, capital: 1.25, wallet: 1.20, genome: 1.15, narrative: 1.10, execution: 0.95 };
  if (key === "TRENDING_RISK_ON") return { ...defaults, genome: 1.20, capital: 1.15, wallet: 1.10 };
  if (key === "SELECTIVE_ROTATION") return { ...defaults, narrative: 1.25, wallet: 1.20, execution: 1.10, capital: 1.10 };
  if (key === "VOLATILITY_SHOCK") return { ...defaults, safety: 1.35, execution: 1.30, genome: 0.75, narrative: 0.70, capital: 0.80 };
  if (key === "LIQUIDITY_CONTRACTION") return { ...defaults, safety: 1.30, execution: 1.25, capital: 0.75, genome: 0.85, wallet: 0.90 };
  return defaults;
}

export function learnRegimeSpecialistReliability(rows = [], options = {}) {
  const minimumSamples = Math.max(5, Number(options.minimumSamples || 20));
  const groups = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const regime = String(row.regime || row.globalMarketRegimeState || "UNKNOWN").toUpperCase();
    const expert = String(row.expert || row.modelName || "UNKNOWN");
    const probability = finite(row.probability);
    const actual = row.actual === true || Number(row.actual) === 1 ? 1 : row.actual === false || Number(row.actual) === 0 ? 0 : null;
    if (probability === null || actual === null) continue;
    const key = `${regime}::${expert}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ probability: clamp(probability), actual });
  }
  const result = {};
  for (const [key, values] of groups) {
    const [regime, expert] = key.split("::");
    const brier = mean(values.map((v) => (v.probability - v.actual) ** 2));
    const reliability = values.length < minimumSamples ? 0.25 * values.length / minimumSamples : clamp(1 - (brier ?? 1) / 0.35);
    result[regime] ||= {};
    result[regime][expert] = { samples: values.length, brierScore: brier, reliability: Number(reliability.toFixed(4)) };
  }
  return result;
}
