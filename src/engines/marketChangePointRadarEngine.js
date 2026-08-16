import { clamp, mean, num, robustZ } from "../edge/edgeMath.js";

const METRICS = [
  ["projectClockScore", (project) => num(project.projectClockScore ?? project.threeClockEdge?.projectClock?.score)],
  ["capitalClockScore", (project) => num(project.capitalClockScore ?? project.threeClockEdge?.capitalClock?.score)],
  ["attentionClockScore", (project) => num(project.attentionClockScore ?? project.threeClockEdge?.attentionClock?.score)],
  ["liquidityUsd", (project) => num(project.liquidityUsd ?? project.dexLiquidityUsd ?? project.stableExitLiquidityUsd)],
  ["volume24hUsd", (project) => num(project.volume24hUsd ?? project.volume24h ?? project.volume)],
  ["buyerCount", (project) => num(project.uniqueBuyers24h ?? project.buyers24h)],
];

export function analyzeMarketChangePointRadar(project = {}, options = {}) {
  const history = Array.isArray(options.history) ? options.history : [];
  if (history.length < 6) {
    return {
      ...project,
      marketChangePointRadar: {
        state: "INSUFFICIENT_HISTORY",
        score: 0,
        historyCount: history.length,
        changedMetrics: [],
        shadowOnly: true,
      },
      structuralBreakScore: 0,
      structuralBreakState: "INSUFFICIENT_HISTORY",
    };
  }

  const metrics = METRICS.map(([name, getter]) => {
    const current = getter(project);
    const historical = history.map((row) => num(row[name])).filter((value) => value !== null);
    const z = robustZ(current, historical);
    return { name, current, z };
  }).filter((item) => item.current !== null && item.z !== null);

  const changed = metrics.filter((item) => Math.abs(item.z) >= 2.5);
  const directional = metrics.filter((item) => item.z >= 2.5);
  const intensity = mean(metrics.map((item) => Math.min(8, Math.abs(item.z)))) || 0;
  const score = Math.round(clamp(changed.length * 18 + directional.length * 7 + intensity * 5));
  const state = changed.length >= 3 && score >= 65
    ? "MULTIVARIATE_STRUCTURAL_BREAK"
    : changed.length >= 2
      ? "CHANGE_POINT_WATCH"
      : changed.length === 1
        ? "SINGLE_AXIS_BREAK"
        : "NO_MATERIAL_CHANGE_POINT";

  return {
    ...project,
    marketChangePointRadar: {
      state,
      score,
      historyCount: history.length,
      changedMetrics: changed.map((item) => ({
        metric: item.name,
        z: Number(item.z.toFixed(2)),
        current: item.current,
      })),
      metricDiagnostics: metrics.map((item) => ({
        metric: item.name,
        z: Number(item.z.toFixed(2)),
      })),
      shadowOnly: true,
    },
    structuralBreakScore: score,
    structuralBreakState: state,
  };
}

export function analyzeMarketChangePointRadarBatch(projects = [], options = {}) {
  const histories = options.histories || new Map();
  return (Array.isArray(projects) ? projects : []).map((project) => {
    const key = options.identityKey?.(project);
    return analyzeMarketChangePointRadar(project, {
      ...options,
      history: key ? histories.get(key) || [] : options.history || [],
    });
  });
}
