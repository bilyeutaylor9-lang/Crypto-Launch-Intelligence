import { clamp, num } from "../edge/edgeMath.js";
import { normalizeIgnitionSignals } from "../ignition/ignitionSignalNormalizer.js";

function sortedNumericEntries(object = {}) {
  return Object.entries(object || {})
    .map(([key, value]) => [Number(key), num(value)])
    .filter(([key, value]) => Number.isFinite(key) && value !== null && key > 0 && value >= 0)
    .sort((a, b) => a[0] - b[0]);
}

function interpolate(points = [], x = null) {
  const target = num(x);
  if (target === null || !points.length) return null;
  if (target <= points[0][0]) {
    const [px, py] = points[0];
    return px > 0 ? py * (target / px) : py;
  }
  for (let index = 1; index < points.length; index += 1) {
    const [x1, y1] = points[index - 1];
    const [x2, y2] = points[index];
    if (target <= x2) {
      const t = (target - x1) / Math.max(1e-9, x2 - x1);
      return y1 + (y2 - y1) * t;
    }
  }
  const [x1, y1] = points.at(-2) || points.at(-1);
  const [x2, y2] = points.at(-1);
  if (x2 === x1) return y2;
  const slope = (y2 - y1) / (x2 - x1);
  return Math.max(0, y2 + slope * (target - x2));
}

function constantProductDepth(liquidityUsd, movePct) {
  const liquidity = num(liquidityUsd);
  const move = num(movePct);
  if (liquidity === null || move === null || liquidity <= 0 || move <= 0) return null;
  const quoteReserveUsd = liquidity / 2;
  return quoteReserveUsd * (Math.sqrt(1 + move / 100) - 1);
}

function constantProductImpact(liquidityUsd, notionalUsd) {
  const liquidity = num(liquidityUsd);
  const notional = num(notionalUsd);
  if (liquidity === null || notional === null || liquidity <= 0 || notional < 0) return null;
  const quoteReserveUsd = liquidity / 2;
  const ratio = 1 + notional / quoteReserveUsd;
  return (ratio * ratio - 1) * 100;
}

function curveMode(signals = {}) {
  const depth = sortedNumericEntries(signals.liquidity?.depthByMovePct || {});
  if (depth.length) return "EXPLICIT_DEPTH_CURVE";
  const impact = sortedNumericEntries(signals.liquidity?.impactByNotionalUsd || {});
  if (impact.length) return "EXPLICIT_IMPACT_CURVE";
  const liquidity = num(signals.liquidity?.activeLiquidityUsd ?? signals.market?.liquidityUsd);
  return liquidity && liquidity > 0 ? "CONSTANT_PRODUCT_HEURISTIC" : "UNOBSERVED";
}

export function depthForMovePct(geometry = {}, movePct = null) {
  const move = num(movePct);
  if (move === null || move <= 0) return null;
  const depthPoints = sortedNumericEntries(geometry.depthByMovePct || {});
  if (depthPoints.length) return interpolate(depthPoints, move);
  if (geometry.mode === "CONSTANT_PRODUCT_HEURISTIC") return constantProductDepth(geometry.referenceLiquidityUsd, move);
  return null;
}

export function impactForNotionalUsd(geometry = {}, notionalUsd = null) {
  const notional = num(notionalUsd);
  if (notional === null || notional < 0) return null;
  const impactPoints = sortedNumericEntries(geometry.impactByNotionalUsd || {});
  if (impactPoints.length) return interpolate(impactPoints, notional);
  const depthPoints = sortedNumericEntries(geometry.depthByMovePct || {});
  if (depthPoints.length) {
    // Invert the depth curve by interpolation. Depth x-axis becomes the notional.
    const inverted = depthPoints.map(([move, depth]) => [depth, move]).sort((a, b) => a[0] - b[0]);
    return interpolate(inverted, notional);
  }
  if (geometry.mode === "CONSTANT_PRODUCT_HEURISTIC") return constantProductImpact(geometry.referenceLiquidityUsd, notional);
  return null;
}

function convexityIndex(geometry = {}) {
  const reference = num(geometry.referenceLiquidityUsd);
  const probes = reference && reference > 0
    ? [reference * 0.005, reference * 0.01, reference * 0.02, reference * 0.04]
    : [10_000, 25_000, 50_000, 100_000];
  const impacts = probes.map((notional) => impactForNotionalUsd(geometry, notional));
  if (impacts.some((value) => value === null)) return null;
  const slopes = impacts.slice(1).map((impact, index) => {
    const priorImpact = impacts[index];
    const deltaNotional = probes[index + 1] - probes[index];
    return deltaNotional > 0 ? (impact - priorImpact) / deltaNotional : null;
  }).filter((value) => value !== null && Number.isFinite(value));
  if (slopes.length < 2 || slopes[0] <= 0) return null;
  return slopes.at(-1) / slopes[0];
}

export function analyzeLiquidityGeometry(project = {}, options = {}) {
  const signals = options.signals || normalizeIgnitionSignals(project);
  const mode = curveMode(signals);
  const referenceLiquidityUsd = num(signals.liquidity?.activeLiquidityUsd ?? signals.market?.liquidityUsd);
  const geometry = {
    mode,
    depthByMovePct: { ...(signals.liquidity?.depthByMovePct || {}) },
    impactByNotionalUsd: { ...(signals.liquidity?.impactByNotionalUsd || {}) },
    referenceLiquidityUsd,
    refillHalfLifeMinutes: num(signals.liquidity?.refillHalfLifeMinutes),
    lpInventoryStressScore: num(signals.liquidity?.lpInventoryStressScore),
    priceImpactPersistencePct: null,
    executableQuote: false,
    shadowOnly: true,
    rankingInfluence: false,
  };

  const initialImpact = num(signals.liquidity?.initialImpactPct);
  const residualImpact = num(signals.liquidity?.residualImpactPct);
  if (initialImpact !== null && residualImpact !== null && Math.abs(initialImpact) > 1e-9) {
    geometry.priceImpactPersistencePct = clamp((Math.abs(residualImpact) / Math.abs(initialImpact)) * 100, 0, 200);
  }

  geometry.depthTo10PctUsd = depthForMovePct(geometry, 10);
  geometry.depthTo25PctUsd = depthForMovePct(geometry, 25);
  geometry.depthTo50PctUsd = depthForMovePct(geometry, 50);
  geometry.depthTo100PctUsd = depthForMovePct(geometry, 100);
  geometry.convexityIndex = convexityIndex(geometry);
  geometry.convexityState = geometry.convexityIndex === null
    ? "UNOBSERVED"
    : geometry.convexityIndex >= 2.2
      ? "HIGHLY_CONVEX"
      : geometry.convexityIndex >= 1.35
        ? "CONVEX"
        : "ROUGHLY_LINEAR";
  geometry.refillState = geometry.refillHalfLifeMinutes === null
    ? "UNOBSERVED"
    : geometry.refillHalfLifeMinutes >= 60
      ? "VERY_SLOW_REFILL"
      : geometry.refillHalfLifeMinutes >= 20
        ? "SLOW_REFILL"
        : geometry.refillHalfLifeMinutes <= 5
          ? "FAST_REFILL"
          : "NORMAL_REFILL";
  geometry.caution = mode === "CONSTANT_PRODUCT_HEURISTIC"
    ? "Impact is a constant-product approximation from headline liquidity, not a protocol-aware executable quote or CLMM tick simulation."
    : mode === "UNOBSERVED"
      ? "No depth or liquidity input was available."
      : "Curve is only as reliable as the supplied depth/impact observations and their freshness.";

  return {
    ...project,
    liquidityGeometry: geometry,
    liquidityGeometryMode: mode,
    liquidityConvexityIndex: geometry.convexityIndex,
    liquidityConvexityState: geometry.convexityState,
  };
}

export function analyzeLiquidityGeometryBatch(projects = [], options = {}) {
  return (Array.isArray(projects) ? projects : []).map((project) => analyzeLiquidityGeometry(project, options));
}

export const __liquidityGeometryTestHooks = {
  constantProductDepth,
  constantProductImpact,
  interpolate,
};

export default analyzeLiquidityGeometry;
