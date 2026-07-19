import { numberOrNull } from "../math/numericSafety.js";

function text(value = "") {
  return String(value || "").trim() || "unknown";
}

function netFlow(project = {}) {
  return numberOrNull(project.capitalFlowBaseline?.netFlowUsd ?? project.capitalFlowObservation?.netFlowUsd ?? project.netFlowUsd);
}

function liquidity(project = {}) {
  return numberOrNull(project.capitalFlowObservation?.dexLiquidityUsd ?? project.dexLiquidityUsd ?? project.liquidityUsd);
}

function marketCap(project = {}) {
  return numberOrNull(project.capitalFlowObservation?.circulatingMarketCapUsd ?? project.circulatingMarketCapUsd ?? project.marketCap);
}

function narrative(project = {}) {
  return text(
    project.primaryNarrative ||
      project.narrative ||
      project.category ||
      project.matchedNarratives?.[0]?.group ||
      project.alphaTags?.[0]
  ).toLowerCase();
}

function capBucket(cap) {
  const value = numberOrNull(cap);
  if (value === null) return "unknown-cap";
  if (value < 10_000_000) return "micro-cap";
  if (value < 100_000_000) return "small-cap";
  if (value < 1_000_000_000) return "mid-cap";
  return "large-cap";
}

function aggregate(projects = [], keyFor = () => "unknown") {
  const map = new Map();
  for (const project of projects) {
    const key = keyFor(project);
    const current = map.get(key) || {
      key,
      projects: 0,
      netFlowUsd: 0,
      positiveProjects: 0,
      negativeProjects: 0,
      totalLiquidityUsd: 0,
      leaders: [],
    };
    const flow = netFlow(project);
    const liq = liquidity(project);
    current.projects += 1;
    if (flow !== null) {
      current.netFlowUsd += flow;
      if (flow > 0) current.positiveProjects += 1;
      if (flow < 0) current.negativeProjects += 1;
    }
    if (liq !== null) current.totalLiquidityUsd += liq;
    current.leaders.push({
      symbol: project.symbol || "UNKNOWN",
      name: project.name || "Unknown",
      score: project.capitalMigrationScore || 0,
      netFlowUsd: flow,
      lane: project.capitalMigrationLane || "NOT_RUN",
    });
    map.set(key, current);
  }
  return [...map.values()]
    .map((row) => ({
      ...row,
      flowToLiquidityPct: row.totalLiquidityUsd > 0 ? (row.netFlowUsd / row.totalLiquidityUsd) * 100 : null,
      leaders: row.leaders
        .sort((a, b) => (b.score || 0) - (a.score || 0))
        .slice(0, 10),
    }))
    .sort((a, b) => b.netFlowUsd - a.netFlowUsd);
}

export function buildCapitalRotationMap(projects = []) {
  const safe = Array.isArray(projects) ? projects : [];
  const chainRotation = aggregate(safe, (project) => text(project.chain || project.chainId).toLowerCase());
  const narrativeRotation = aggregate(safe, narrative);
  const marketCapRotation = aggregate(safe, (project) => capBucket(marketCap(project)));
  const topChainReceivingCapital = chainRotation[0] ? { ...chainRotation[0], chain: chainRotation[0].key } : null;
  const topNarrativeReceivingCapital = narrativeRotation[0] ? { ...narrativeRotation[0], narrative: narrativeRotation[0].key } : null;
  const fastestImprovingMarketCapBucket = marketCapRotation[0]
    ? { ...marketCapRotation[0], marketCapBucket: marketCapRotation[0].key }
    : null;
  const outflowWatch = safe
    .filter((project) => (netFlow(project) || 0) < 0 || project.capitalMigrationLane === "CAPITAL_OUTFLOW")
    .sort((a, b) => (netFlow(a) || 0) - (netFlow(b) || 0))
    .slice(0, 50)
    .map((project, index) => ({
      rank: index + 1,
      symbol: project.symbol || "UNKNOWN",
      name: project.name || "Unknown",
      chain: project.chain || project.chainId || null,
      netFlowUsd: netFlow(project),
      liquidityUsd: liquidity(project),
      lane: project.capitalMigrationLane || "NOT_RUN",
      warnings: project.capitalMigrationWarnings || [],
    }));

  return {
    generatedAt: new Date().toISOString(),
    projectsAnalyzed: safe.length,
    topChainReceivingCapital,
    topNarrativeReceivingCapital,
    fastestImprovingMarketCapBucket,
    chainRotation,
    narrativeRotation,
    marketCapRotation,
    outflowWatch,
    researchOnlyBeforeSocialAttention: safe
      .filter((project) => (project.capitalMigrationScore || 0) >= 50 && (project.socialAccelerationScore || 0) < 40)
      .sort((a, b) => (b.capitalMigrationScore || 0) - (a.capitalMigrationScore || 0))
      .slice(0, 25)
      .map((project, index) => ({
        rank: index + 1,
        symbol: project.symbol || "UNKNOWN",
        score: project.capitalMigrationScore || 0,
        lane: project.capitalMigrationLane || "NOT_RUN",
      })),
  };
}

export function analyzeCapitalRotationMapBatch(projects = []) {
  const rotation = buildCapitalRotationMap(projects);
  return (Array.isArray(projects) ? projects : []).map((project) => ({
    ...project,
    capitalRotationMap: rotation,
  }));
}
