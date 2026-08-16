import fs from "fs";
import path from "path";
import {
  appendThreeClockObservations,
  historyForThreeClockProject,
  loadThreeClockObservations,
} from "../data/threeClockEdgeObservationStore.js";

const REPORT_FILE = path.resolve("reports", "three-clock-edge.json");

function num(value = null) {
  if (value === null || value === undefined || value === "") return null;
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function clamp(value = 0, min = 0, max = 100) {
  const n = num(value);
  return Math.max(min, Math.min(max, n === null ? 0 : n));
}

function getPath(source = {}, dotted = "") {
  return String(dotted).split(".").reduce(
    (value, key) => value === undefined || value === null ? undefined : value[key],
    source
  );
}

function first(project = {}, paths = []) {
  for (const field of paths) {
    const value = getPath(project, field);
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return null;
}

function measured(project = {}, paths = []) {
  return num(first(project, paths));
}

function averageMeasured(values = []) {
  const active = values.map(num).filter((value) => value !== null);
  if (!active.length) return null;
  return active.reduce((sum, value) => sum + value, 0) / active.length;
}

function weightedMeasured(items = []) {
  const active = items.filter((item) => num(item.value) !== null && Number(item.weight) > 0);
  if (!active.length) return null;
  const weight = active.reduce((sum, item) => sum + Number(item.weight), 0);
  return active.reduce((sum, item) => sum + Number(item.value) * Number(item.weight), 0) / weight;
}

function median(values = []) {
  const active = values.map(num).filter((value) => value !== null).sort((a, b) => a - b);
  if (!active.length) return null;
  const mid = Math.floor(active.length / 2);
  return active.length % 2 ? active[mid] : (active[mid - 1] + active[mid]) / 2;
}

function robustZ(current, historical = []) {
  const value = num(current);
  const history = historical.map(num).filter((v) => v !== null);
  if (value === null || history.length < 5) return null;
  const center = median(history);
  const mad = median(history.map((v) => Math.abs(v - center)));
  if (center === null || mad === null) return null;
  return (value - center) / Math.max(1e-9, 1.4826 * mad);
}

function surpriseScore(z) {
  const value = num(z);
  return value === null ? null : clamp(50 + value * 12.5);
}

function scoreState(score, labels = {}) {
  const value = clamp(score);
  if (value >= 80) return labels.high || "HIGH";
  if (value >= 62) return labels.medium || "RISING";
  if (value >= 42) return labels.low || "DEVELOPING";
  return labels.quiet || "QUIET";
}

function safetyBlocked(project = {}) {
  const text = [
    ...(project.finalBlockingReasons || []),
    ...(project.finalSelectionBlockers || []),
    ...(project.scamRiskReasons || []),
    ...(project.sniperBlockingReasons || []),
  ].join(" ").toLowerCase();
  return Boolean(
    project.honeypotDetected === true ||
    project.verifiedScam === true ||
    project.sellRestricted === true ||
    project.identityConflict === true ||
    project.canonicalIdentityHardBlock === true ||
    project.instantSafetyStatus === "CRITICAL" ||
    /honeypot|verified scam|cannot sell|malicious contract|owner can drain/.test(text)
  );
}

function projectClock(project = {}, history = []) {
  const changeState = String(project.projectChangeState || "").toLowerCase();
  const changeStateScore =
    changeState === "accelerating" ? 92 :
    changeState === "improving" ? 76 :
    changeState === "stable" ? 45 :
    changeState === "deteriorating" ? 15 : null;
  const deploymentFlag = Boolean(
    project.newDeploymentDetected || project.newChainDeployment ||
    project.contractDeploymentDetected || project.nativeDeploymentDetected ||
    project.projectChange?.newDeployment
  );
  const currentDev = measured(project, [
    "developerAccelerationScore", "developerAccelerationV2Score", "developerActivityScore",
  ]);
  const devSurpriseZ = robustZ(currentDev, history.map((row) => row.developerAccelerationScore));
  const raw = weightedMeasured([
    { value: currentDev, weight: 1.4 },
    { value: project.projectChangeScore, weight: 1.15 },
    { value: changeStateScore, weight: 1.0 },
    { value: project.githubProScore, weight: 0.75 },
    { value: project.ecosystemIntegrationScore, weight: 0.8 },
    { value: project.liveCatalystRadarScore, weight: 0.75 },
    { value: project.nativeDiscoveryScore, weight: 0.55 },
    { value: deploymentFlag ? 95 : null, weight: 0.8 },
    { value: surpriseScore(devSurpriseZ), weight: 0.55 },
  ]);
  const score = raw === null ? 0 : Math.round(clamp(raw));
  const evidence = {
    developerAccelerationScore: currentDev,
    projectChangeScore: num(project.projectChangeScore),
    projectChangeState: changeState || null,
    githubProScore: num(project.githubProScore),
    ecosystemIntegrationScore: num(project.ecosystemIntegrationScore),
    liveCatalystRadarScore: num(project.liveCatalystRadarScore),
    deploymentFlag: deploymentFlag || null,
    developerSurpriseZ: devSurpriseZ === null ? null : Number(devSurpriseZ.toFixed(2)),
  };
  const available = Object.values(evidence).filter((value) => value !== null && value !== false && value !== "").length;
  return {
    score,
    state: scoreState(score, {
      high: "PROJECT_STATE_CHANGE_ACCELERATING",
      medium: "PROJECT_CHANGE_RISING",
      low: "PROJECT_CHANGE_DEVELOPING",
      quiet: "PROJECT_CHANGE_QUIET",
    }),
    evidenceCoveragePct: Math.round((available / 8) * 100),
    developerSurpriseZ: evidence.developerSurpriseZ,
    evidence,
  };
}

function capitalClock(project = {}, history = []) {
  const stablecoinInflow = measured(project, [
    "stablecoinInflowUsd", "walletFundingUsd", "capitalIntent.stablecoinInflowUsd", "bridgeInflowUsd",
  ]);
  const priorityUrgency = measured(project, [
    "priorityFeePercentile", "executionUrgencyScore", "gasPremiumScore", "capitalIntent.priorityUrgencyScore",
  ]);
  const approvalActivity = measured(project, [
    "approvalActivityScore", "routerPreparationScore", "capitalIntent.approvalActivityScore",
  ]);
  const currentCapital = averageMeasured([
    project.capitalMigrationScore, project.capitalFlowScore, project.smartWalletNoveltyScore,
    project.smartWalletArrivalScore, project.smartMoneyAccumulationScore,
  ]);
  const capitalHistory = history.map((row) => averageMeasured([
    row.capitalMigrationScore, row.capitalFlowScore, row.smartWalletNoveltyScore,
    row.smartWalletArrivalScore, row.smartMoneyAccumulationScore,
  ])).filter((value) => value !== null);
  const capitalSurpriseZ = robustZ(currentCapital, capitalHistory);
  const raw = weightedMeasured([
    { value: project.smartWalletNoveltyScore, weight: 1.2 },
    { value: project.smartWalletArrivalScore, weight: 1.15 },
    { value: project.smartMoneyAccumulationScore, weight: 1.15 },
    { value: project.capitalMigrationScore, weight: 1.0 },
    { value: project.capitalFlowScore, weight: 1.0 },
    { value: project.buyerBreadthAccelerationScore, weight: 0.85 },
    { value: project.buyPressureScore, weight: 0.7 },
    { value: project.whaleActivityScore ?? project.whaleScore, weight: 0.55 },
    { value: priorityUrgency, weight: 0.45 },
    { value: approvalActivity, weight: 0.45 },
    { value: surpriseScore(capitalSurpriseZ), weight: 0.55 },
  ]);
  const score = raw === null ? 0 : Math.round(clamp(raw));
  const directPreparationEvidence = [stablecoinInflow, priorityUrgency, approvalActivity].filter((v) => v !== null).length;
  return {
    score,
    state: scoreState(score, {
      high: directPreparationEvidence ? "CAPITAL_PREPOSITIONING_HIGH" : "CAPITAL_INTEREST_HIGH",
      medium: directPreparationEvidence ? "CAPITAL_PREPOSITIONING_RISING" : "CAPITAL_INTEREST_RISING",
      low: "CAPITAL_ACTIVITY_DEVELOPING",
      quiet: "CAPITAL_ACTIVITY_QUIET",
    }),
    evidenceMode: directPreparationEvidence >= 2 ? "DIRECT_PREPARATION_PLUS_DERIVED" : "DERIVED_SIGNAL_FALLBACK",
    directPreparationEvidenceCount: directPreparationEvidence,
    capitalSurpriseZ: capitalSurpriseZ === null ? null : Number(capitalSurpriseZ.toFixed(2)),
    evidence: {
      smartWalletNoveltyScore: num(project.smartWalletNoveltyScore),
      smartWalletArrivalScore: num(project.smartWalletArrivalScore),
      smartMoneyAccumulationScore: num(project.smartMoneyAccumulationScore),
      capitalMigrationScore: num(project.capitalMigrationScore),
      capitalFlowScore: num(project.capitalFlowScore),
      buyerBreadthAccelerationScore: num(project.buyerBreadthAccelerationScore),
      buyPressureScore: num(project.buyPressureScore),
      stablecoinInflowUsd: stablecoinInflow,
      priorityUrgencyScore: priorityUrgency,
      approvalActivityScore: approvalActivity,
    },
  };
}

function priceAttentionScore(project = {}) {
  const c24 = measured(project, ["priceChange24hPct", "priceChange24h", "marketData.priceChange24hPct", "rawCandidate.priceChange24hPct"]);
  const c7 = measured(project, ["priceChange7dPct", "priceChange7d", "marketData.priceChange7dPct"]);
  return averageMeasured([
    c24 === null ? null : clamp(Math.max(0, c24) * 1.25),
    c7 === null ? null : clamp(Math.max(0, c7) * 0.45),
  ]);
}

function attentionClock(project = {}, history = []) {
  const priceAttention = priceAttentionScore(project);
  const currentSocial = averageMeasured([project.socialAccelerationScore, project.xSocialScore, project.narrativeHeatScore]);
  const socialSurpriseZ = robustZ(currentSocial, history.map((row) => averageMeasured([row.socialAccelerationScore, row.narrativeHeatScore])));
  const raw = weightedMeasured([
    { value: project.socialAccelerationScore, weight: 1.2 },
    { value: project.xSocialScore, weight: 0.8 },
    { value: project.narrativeHeatScore, weight: 1.0 },
    { value: project.communityGrowthScore, weight: 0.65 },
    { value: project.holderGrowthScore, weight: 0.6 },
    { value: project.volumeAccelerationScore, weight: 0.75 },
    { value: priceAttention, weight: 1.1 },
    { value: surpriseScore(socialSurpriseZ), weight: 0.45 },
  ]);
  const score = raw === null ? 0 : Math.round(clamp(raw));
  const evidence = {
    socialAccelerationScore: num(project.socialAccelerationScore),
    xSocialScore: num(project.xSocialScore),
    narrativeHeatScore: num(project.narrativeHeatScore),
    communityGrowthScore: num(project.communityGrowthScore),
    holderGrowthScore: num(project.holderGrowthScore),
    volumeAccelerationScore: num(project.volumeAccelerationScore),
    priceAttentionScore: priceAttention,
  };
  return {
    score,
    quietScore: 100 - score,
    state: scoreState(score, {
      high: "ATTENTION_CROWDED",
      medium: "ATTENTION_FORMING",
      low: "ATTENTION_EARLY",
      quiet: "ATTENTION_QUIET",
    }),
    socialSurpriseZ: socialSurpriseZ === null ? null : Number(socialSurpriseZ.toFixed(2)),
    evidence,
  };
}

function normalizedBands(project = {}) {
  const raw = first(project, ["liquidityBands", "liquidityTopography.bands", "uniswapV3.liquidityBands", "poolLiquidityBands"]);
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((band) => {
    const lower = num(band.lowerPrice ?? band.priceLow ?? band.minPrice);
    const upper = num(band.upperPrice ?? band.priceHigh ?? band.maxPrice);
    const liquidityUsd = num(band.liquidityUsd ?? band.depthUsd ?? band.activeLiquidityUsd ?? band.usdLiquidity);
    return lower !== null && upper !== null && liquidityUsd !== null && upper > lower && liquidityUsd >= 0
      ? [{ lower, upper, liquidityUsd }]
      : [];
  }).sort((a, b) => a.lower - b.lower);
}

function liquidityUsd(project = {}) {
  return measured(project, [
    "stableExitLiquidityUsd", "hardExitLiquidityUsd", "dexLiquidityUsd", "activeLiquidityUsd",
    "liquidityUsd", "liquidity", "executionProof.liquidityUsd", "canonicalExecutionRoute.liquidityUsd",
  ]);
}

function currentPrice(project = {}) {
  return measured(project, ["priceUsd", "price", "marketData.priceUsd", "rawCandidate.priceUsd"]);
}

function liquidityTopography(project = {}) {
  const bands = normalizedBands(project);
  const price = currentPrice(project);
  const currentLiquidity = liquidityUsd(project);
  if (!bands.length || price === null || price <= 0) {
    return {
      mode: "UNOBSERVED", confidence: 0, currentLiquidityUsd: currentLiquidity, currentPriceUsd: price,
      upsideDepth0To5PctUsd: null, upsideDepth5To10PctUsd: null, upsideDepth10To20PctUsd: null,
      upsideVacuumScore: null, bandsObserved: 0,
      reason: "No explicit concentrated-liquidity range data was present; no topography is inferred from TVL alone.",
    };
  }
  const depthInRange = (lowMultiplier, highMultiplier) => {
    const low = price * lowMultiplier;
    const high = price * highMultiplier;
    return bands.reduce((sum, band) => {
      const overlapLow = Math.max(low, band.lower);
      const overlapHigh = Math.min(high, band.upper);
      if (overlapHigh <= overlapLow) return sum;
      return sum + band.liquidityUsd * ((overlapHigh - overlapLow) / (band.upper - band.lower));
    }, 0);
  };
  const near = depthInRange(1.0, 1.05);
  const next = depthInRange(1.05, 1.10);
  const farther = depthInRange(1.10, 1.20);
  const vacuumRatio = Math.max(0, 1 - (next + farther * 0.5) / Math.max(near, 1));
  const vacuumScore = Math.round(clamp(vacuumRatio * 100));
  return {
    mode: "EXPLICIT_RANGE_TOPOGRAPHY",
    confidence: Math.round(clamp(55 + Math.min(35, bands.length * 2))),
    currentLiquidityUsd: currentLiquidity,
    currentPriceUsd: price,
    upsideDepth0To5PctUsd: Math.round(near),
    upsideDepth5To10PctUsd: Math.round(next),
    upsideDepth10To20PctUsd: Math.round(farther),
    upsideVacuumScore: vacuumScore,
    bandsObserved: bands.length,
    reason: vacuumScore >= 65
      ? "Observed liquidity thins materially above the current price."
      : "No major upside liquidity vacuum was observed in the supplied range map.",
  };
}

function constantProductImpactPct(liquidity, demandUsd) {
  const L = num(liquidity);
  const d = num(demandUsd);
  if (L === null || L <= 0 || d === null || d <= 0) return null;
  const quoteReserve = L / 2;
  const ratio = 1 + d / Math.max(quoteReserve, 1);
  return (ratio * ratio - 1) * 100;
}

function asymmetricPressureTwin(project = {}, topography = {}) {
  const liquidity = liquidityUsd(project);
  const scenarios = [10_000, 25_000, 50_000, 100_000].map((demandUsd) => {
    const baseImpact = constantProductImpactPct(liquidity, demandUsd);
    if (baseImpact === null) return { demandUsd, estimatedImpactPct: null };
    const vacuumAdjustment = topography.mode === "EXPLICIT_RANGE_TOPOGRAPHY" && num(topography.upsideVacuumScore) !== null
      ? 1 + clamp(topography.upsideVacuumScore) / 200
      : 1;
    return { demandUsd, estimatedImpactPct: Number((baseImpact * vacuumAdjustment).toFixed(2)) };
  });
  const valid = scenarios.filter((row) => row.estimatedImpactPct !== null);
  return {
    mode: topography.mode === "EXPLICIT_RANGE_TOPOGRAPHY"
      ? "RANGE_AWARE_CONSTANT_PRODUCT_HEURISTIC"
      : liquidity && liquidity > 0 ? "CONSTANT_PRODUCT_HEURISTIC" : "UNAVAILABLE",
    shadowOnly: true,
    executableQuote: false,
    scenarios,
    asymmetryScore: valid.length
      ? Math.round(clamp(averageMeasured(valid.map((row) => Math.min(100, row.estimatedImpactPct * 3)))))
      : 0,
    warning: "Counterfactual impact is a research heuristic, not a quote, forecast, or expected return. Execution adapters remain the source of truth for tradability and slippage.",
  };
}

function divergence(p = {}, c = {}, a = {}) {
  const projectScore = clamp(p.score);
  const capitalScore = clamp(c.score);
  const attentionScore = clamp(a.score);
  const quiet = 100 - attentionScore;
  const latentPressure = Math.sqrt(projectScore * capitalScore);
  const score = Math.round(clamp(latentPressure * (0.45 + 0.55 * quiet / 100)));
  let state = "NO_DIVERGENCE";
  if (projectScore >= 62 && capitalScore >= 58 && attentionScore <= 38 && score >= 58) state = "PRE_CONSENSUS_DIVERGENCE";
  else if (projectScore >= 58 && capitalScore >= 50 && attentionScore <= 55) state = "EARLY_DIVERGENCE_WATCH";
  else if (projectScore >= 55 && capitalScore >= 55 && attentionScore >= 60) state = "CONSENSUS_FORMING";
  else if (attentionScore >= 78) state = "ATTENTION_CROWDED";
  return { score, state, latentPressure: Math.round(latentPressure), quietAttentionScore: quiet };
}

function leadSequence(project = {}, clocks = {}, history = []) {
  const p = clocks.projectClock?.score || 0;
  const c = clocks.capitalClock?.score || 0;
  const a = clocks.attentionClock?.score || 0;
  const d = clocks.divergence?.score || 0;
  const buyer = num(project.buyerBreadthAccelerationScore) || 0;
  const buyPressure = num(project.buyPressureScore) || 0;
  const priceChange24h = measured(project, ["priceChange24hPct", "priceChange24h", "marketData.priceChange24hPct"]) || 0;
  let stage = 0;
  let label = "NO_SEQUENCE";
  if (p >= 58) { stage = 1; label = "PROJECT_CHANGE"; }
  if (p >= 58 && c >= 48) { stage = 2; label = "CAPITAL_FORMING"; }
  if (d >= 55 && a <= 48) { stage = 3; label = "PRE_CONSENSUS_DIVERGENCE"; }
  if (stage >= 2 && (buyer >= 60 || buyPressure >= 68)) { stage = Math.max(stage, 4); label = "BUYER_ACCELERATION"; }
  if (stage >= 2 && a >= 55) { stage = Math.max(stage, 5); label = "ATTENTION_EXPANSION"; }
  if (stage >= 3 && priceChange24h >= 25) { stage = 6; label = "PRICE_BREAKOUT"; }
  const previousStage = history.length ? num(history.at(-1)?.leadStage) : null;
  return {
    stage, label, previousStage,
    transition: previousStage === null ? "FIRST_OBSERVATION" : stage > previousStage ? "ADVANCING" : stage < previousStage ? "REGRESSING" : "UNCHANGED",
    historicalObservations: history.length,
  };
}

export function analyzeThreeClockEdge(project = {}, options = {}) {
  const history = Array.isArray(options.history) ? options.history : [];
  const pClock = projectClock(project, history);
  const cClock = capitalClock(project, history);
  const aClock = attentionClock(project, history);
  const div = divergence(pClock, cClock, aClock);
  const topo = liquidityTopography(project);
  const twin = asymmetricPressureTwin(project, topo);
  const blocked = safetyBlocked(project);
  const sequence = leadSequence(project, { projectClock: pClock, capitalClock: cClock, attentionClock: aClock, divergence: div }, history);
  const attentionCoverage = Object.values(aClock.evidence).filter((v) => v !== null).length / 7 * 100;
  const confidence = Math.round(clamp(averageMeasured([
    pClock.evidenceCoveragePct,
    cClock.evidenceMode === "DIRECT_PREPARATION_PLUS_DERIVED" ? 80 : 48,
    attentionCoverage,
    topo.confidence,
  ]) || 0));
  const shadowState = blocked
    ? "SAFETY_BLOCKED_SHADOW"
    : div.state === "PRE_CONSENSUS_DIVERGENCE" && confidence >= 35
      ? "HIGH_PRIORITY_SHADOW"
      : div.state === "EARLY_DIVERGENCE_WATCH" ? "WATCH_SHADOW" : "OBSERVE_SHADOW";
  const threeClockEdge = {
    version: "three-clock-edge-v1",
    shadowOnly: true,
    rankingInfluence: false,
    safetyState: blocked ? "BLOCKED" : "NOT_BLOCKED_BY_EXISTING_DETERMINISTIC_FLAGS",
    confidence,
    projectClock: pClock,
    capitalClock: cClock,
    attentionClock: aClock,
    divergence: blocked ? { ...div, state: "SAFETY_BLOCKED" } : div,
    liquidityTopography: topo,
    asymmetricPressureTwin: twin,
    leadSequence: sequence,
    shadowState,
    promotionRule: "No ranking influence until point-in-time walk-forward validation shows independent incremental lift after costs and evidence-lineage correlation checks.",
  };
  return {
    ...project,
    threeClockEdge,
    threeClockEdgeScore: blocked ? 0 : div.score,
    threeClockEdgeState: shadowState,
    threeClockDivergenceScore: blocked ? 0 : div.score,
    threeClockDivergenceState: blocked ? "SAFETY_BLOCKED" : div.state,
    projectClockScore: pClock.score,
    capitalClockScore: cClock.score,
    attentionClockScore: aClock.score,
    liquidityTopographyMode: topo.mode,
    liquidityVacuumScore: topo.upsideVacuumScore,
    asymmetricPressureScore: twin.asymmetryScore,
    threeClockLeadStage: sequence.stage,
    threeClockRankingInfluence: false,
  };
}

function compactCandidate(project = {}, rank = null) {
  const edge = project.threeClockEdge || {};
  return {
    rank,
    symbol: project.symbol || "UNKNOWN",
    name: project.name || "Unknown",
    chain: project.chain || project.canonicalChain || "unknown",
    tokenAddress: project.tokenAddress || project.contractAddress || null,
    poolAddress: project.poolAddress || project.pairAddress || null,
    threeClockEdgeScore: project.threeClockEdgeScore || 0,
    threeClockEdgeState: project.threeClockEdgeState || "OBSERVE_SHADOW",
    divergenceState: project.threeClockDivergenceState || "NO_DIVERGENCE",
    projectClock: edge.projectClock || null,
    capitalClock: edge.capitalClock || null,
    attentionClock: edge.attentionClock || null,
    liquidityTopography: edge.liquidityTopography || null,
    asymmetricPressureTwin: edge.asymmetricPressureTwin || null,
    leadSequence: edge.leadSequence || null,
  };
}

function writeReport(projects = [], meta = {}) {
  fs.mkdirSync(path.dirname(REPORT_FILE), { recursive: true });
  const ranked = [...projects].filter((project) => project?.threeClockEdge)
    .sort((a, b) => (b.threeClockEdgeScore || 0) - (a.threeClockEdgeScore || 0));
  const byState = ranked.reduce((acc, project) => {
    const state = project.threeClockDivergenceState || "UNKNOWN";
    acc[state] = (acc[state] || 0) + 1;
    return acc;
  }, {});
  const report = {
    status: "SHADOW_MODE",
    generatedAt: meta.observedAt || new Date().toISOString(),
    version: "three-clock-edge-v1",
    analyzed: ranked.length,
    byState,
    topCandidates: ranked.slice(0, 25).map((project, index) => compactCandidate(project, index + 1)),
    warning: "Three-Clock Edge does not affect production ranking. Counterfactual pressure is heuristic until independently validated.",
  };
  fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));
}

export function analyzeThreeClockEdgeBatch(projects = [], options = {}) {
  const safeProjects = Array.isArray(projects) ? projects : [];
  const historical = loadThreeClockObservations(options.store || {});
  const meta = {
    observedAt: options.observedAt || new Date().toISOString(),
    scanRunId: options.scanRunId || process.env.GITHUB_RUN_ID || null,
    codeCommitSha: options.codeCommitSha || process.env.GITHUB_SHA || null,
  };
  const analyzed = safeProjects.map((project) => analyzeThreeClockEdge(project, {
    ...options,
    history: historyForThreeClockProject(project, historical, options.history || {}),
  }));
  if (options.persist !== false) appendThreeClockObservations(analyzed, meta, options.store || {});
  if (options.writeReport !== false) writeReport(analyzed, meta);
  return analyzed;
}
