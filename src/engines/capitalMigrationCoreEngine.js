import { analyzeCapitalFlowBaseline } from "./capitalFlowBaselineEngine.js";
import { missingValuePenalty } from "../math/missingValuePolicy.js";
import { clamp, numberOrNull } from "../math/numericSafety.js";

const COMPONENT_WEIGHTS = Object.freeze({
  relativeNetFlow: 0.25,
  flowAcceleration: 0.20,
  buyerBreadth: 0.20,
  liquidityExpansion: 0.15,
  flowPersistence: 0.10,
  priceFlowAttentionGap: 0.10,
});

function scoreFromRange(value, center = 0, scale = 1) {
  const number = numberOrNull(value);
  if (number === null) return null;
  return clamp(50 + ((number - center) / scale) * 50, 0, 100);
}

function componentScores(project = {}) {
  const baseline = project.capitalFlowBaseline || {};
  const persistence = baseline.flowPersistence || {};
  const concentration = numberOrNull(
    project.walletConcentrationPct ??
      project.largestWalletFlowSharePct ??
      project.capitalFlowObservation?.walletConcentrationPct
  );
  const buyerGrowth = numberOrNull(baseline.uniqueBuyerGrowthPct);
  const buyerRatio = numberOrNull(baseline.buyerSellerRatio);
  const positiveWindowRatio = numberOrNull(persistence.positiveWindowRatio);
  const consecutivePositive = numberOrNull(persistence.consecutivePositiveWindows);
  const reversalFrequency = numberOrNull(persistence.flowReversalFrequency);
  const flowToLiquidity = numberOrNull(baseline.flowToLiquidityPct);
  const flowToMarketCap = numberOrNull(baseline.flowToMarketCapPct);
  const acceleration = numberOrNull(baseline.normalizedFlowAcceleration ?? baseline.flowAcceleration);
  const liquidityGrowth = numberOrNull(baseline.liquidityGrowthPct);
  const liquidityRemoval = numberOrNull(baseline.liquidityRemovalPct);
  const gap = numberOrNull(baseline.priceFlowGap);

  const relativeNetFlow = flowToLiquidity === null && flowToMarketCap === null
    ? null
    : Math.max(
        scoreFromRange(flowToLiquidity, 0, 4) ?? 0,
        scoreFromRange(flowToMarketCap, 0, 1.5) ?? 0
      );
  const flowAcceleration = acceleration === null ? null : scoreFromRange(acceleration, 0, 0.0001);
  const buyerBreadth = buyerGrowth === null && buyerRatio === null && concentration === null
    ? null
    : clamp(
        (scoreFromRange(buyerGrowth, 0, 30) ?? 45) * 0.35 +
          (scoreFromRange(buyerRatio, 1, 2) ?? 45) * 0.35 +
          (concentration === null ? 45 : 100 - Math.min(100, concentration)) * 0.30
      );
  const liquidityExpansion = liquidityGrowth === null && liquidityRemoval === null
    ? null
    : clamp((scoreFromRange(liquidityGrowth, 0, 20) ?? 45) - Math.max(0, liquidityRemoval || 0) * 2);
  const flowPersistence = positiveWindowRatio === null && consecutivePositive === null
    ? null
    : clamp(
        (positiveWindowRatio === null ? 45 : positiveWindowRatio * 100) * 0.4 +
          Math.min(100, (consecutivePositive || 0) * 20) * 0.25 +
          (numberOrNull(persistence.exponentiallyWeightedNetFlow) !== null && persistence.exponentiallyWeightedNetFlow > 0 ? 80 : 35) * 0.2 +
          (reversalFrequency === null ? 45 : 100 - reversalFrequency * 100) * 0.15
      );
  const priceFlowAttentionGap = gap === null
    ? null
    : scoreFromRange(gap, 0, 2);

  return {
    relativeNetFlow,
    flowAcceleration,
    buyerBreadth,
    liquidityExpansion,
    flowPersistence,
    priceFlowAttentionGap,
  };
}

function weightedScore(components = {}, minimumRequiredCoveragePct = 70) {
  const valid = Object.entries(COMPONENT_WEIGHTS).filter(([key]) => numberOrNull(components[key]) !== null);
  const availableWeight = valid.reduce((sum, [, weight]) => sum + weight, 0);
  const rawAvailableScore = availableWeight
    ? valid.reduce((sum, [key, weight]) => sum + components[key] * weight, 0) / availableWeight
    : null;
  const observationCoveragePct = Math.round((availableWeight / Object.values(COMPONENT_WEIGHTS).reduce((sum, weight) => sum + weight, 0)) * 100);
  const coveragePenalty = missingValuePenalty(observationCoveragePct, minimumRequiredCoveragePct);
  return {
    score: rawAvailableScore === null ? 0 : Math.round(rawAvailableScore * coveragePenalty),
    rawAvailableScore: rawAvailableScore === null ? null : Math.round(rawAvailableScore),
    availableWeight,
    observationCoveragePct,
    coveragePenalty,
  };
}

function executionStatus(project = {}) {
  return project.executionStatus || project.executionProof?.executionStatus || project.canonicalExecutionRoute?.status || "UNKNOWN";
}

function safetyBlocked(project = {}) {
  return Boolean(
    project.honeypotDetected === true ||
      Number(project.honeypotRiskScore || 0) >= 85 ||
      ["CRITICAL", "RESTRICTED"].includes(project.instantSafetyStatus) ||
      Number(project.washTradingRiskScore || project.washTradingScore || 0) >= 75
  );
}

function routeVerified(project = {}) {
  return executionStatus(project) === "VERIFIED";
}

function identityVerified(project = {}) {
  return Boolean(
    project.capitalFlowObservation?.canonicalProjectId &&
      project.capitalFlowObservation?.tokenAddress &&
      project.capitalFlowObservation?.poolAddress &&
      !project.identityConflicts?.length
  );
}

function laneFor(project = {}, components = {}, score = 0) {
  const baseline = project.capitalFlowBaseline || {};
  const observation = project.capitalFlowObservation || {};
  const blockers = [];
  const warnings = [];
  const missing = [...(observation.missingFields || [])];
  const netFlow = numberOrNull(baseline.netFlowUsd);
  const positivePersistence = numberOrNull(baseline.flowPersistence?.positiveWindowRatio);
  const liquidityRemovalPct = numberOrNull(baseline.liquidityRemovalPct);
  const concentration = numberOrNull(observation.walletConcentrationPct ?? observation.largestWalletFlowSharePct);
  const priceFlowGapValue = numberOrNull(baseline.priceFlowGap);

  if (!identityVerified(project)) blockers.push("Canonical token and pool identity are not verified.");
  if (safetyBlocked(project)) blockers.push("Safety or manipulation gate is blocking the setup.");
  if (!routeVerified(project)) warnings.push("Execution route is not fully verified; keep research-only.");
  if (score === 0 || missing.length >= 4) return { lane: "INSUFFICIENT_DATA", blockers, warnings, missing };
  if (safetyBlocked(project) || (concentration !== null && concentration >= 65)) return { lane: "UNSAFE_OR_MANIPULATED", blockers, warnings, missing };
  if (netFlow !== null && netFlow < 0 && (positivePersistence === null || positivePersistence < 0.4)) return { lane: "CAPITAL_OUTFLOW", blockers, warnings, missing };
  if (priceFlowGapValue !== null && priceFlowGapValue < -1.25 && score >= 55) return { lane: "LATE_CHASE", blockers, warnings, missing };
  if (liquidityRemovalPct !== null && liquidityRemovalPct >= 20) return { lane: "UNSAFE_OR_MANIPULATED", blockers: [...blockers, "Liquidity removal pressure is too high."], warnings, missing };
  if (
    score >= 75 &&
    identityVerified(project) &&
    routeVerified(project) &&
    netFlow !== null &&
    netFlow > 0 &&
    positivePersistence !== null &&
    positivePersistence >= 0.6 &&
    (concentration === null || concentration < 45) &&
    !safetyBlocked(project)
  ) return { lane: "CONFIRMED_EARLY_FLOW", blockers, warnings, missing };
  if (score >= 70 && routeVerified(project)) return { lane: "TWO_X_ASYMMETRIC_WATCH", blockers, warnings, missing };
  if (score >= 60) return { lane: "FLOW_ACCELERATING", blockers, warnings, missing };
  if (score >= 35) return { lane: "EARLY_FLOW_RESEARCH", blockers, warnings, missing };
  return { lane: "INSUFFICIENT_DATA", blockers, warnings, missing };
}

export function analyzeCapitalMigrationCore(project = {}, options = {}) {
  const withBaseline = project.capitalFlowBaseline
    ? project
    : analyzeCapitalFlowBaseline(project, options);
  const components = componentScores(withBaseline);
  const scoreParts = weightedScore(components, Number(options.minimumRequiredCoveragePct || 70));
  const lane = laneFor(withBaseline, components, scoreParts.score);
  const confidence =
    lane.lane === "CONFIRMED_EARLY_FLOW" ? "High" :
    scoreParts.observationCoveragePct >= 70 ? "Medium" :
    "Low";

  return {
    ...withBaseline,
    capitalMigrationScore: scoreParts.score,
    capitalMigrationConfidence: confidence,
    capitalMigrationLane: lane.lane,
    capitalMigrationComponents: components,
    capitalMigrationFormula: {
      weights: COMPONENT_WEIGHTS,
      rawAvailableScore: scoreParts.rawAvailableScore,
      availableWeight: scoreParts.availableWeight,
      coveragePenalty: scoreParts.coveragePenalty,
    },
    capitalMigrationReasons: [
      `Relative flow score: ${components.relativeNetFlow ?? "INSUFFICIENT_DATA"}`,
      `Buyer breadth score: ${components.buyerBreadth ?? "INSUFFICIENT_DATA"}`,
      `Flow persistence score: ${components.flowPersistence ?? "INSUFFICIENT_DATA"}`,
    ],
    capitalMigrationWarnings: lane.warnings,
    capitalMigrationBlockers: lane.blockers,
    capitalMigrationMissingEvidence: lane.missing,
    observationCoveragePct: scoreParts.observationCoveragePct,
    capitalMigrationResearchOnly: lane.lane !== "CONFIRMED_EARLY_FLOW" || !routeVerified(withBaseline),
    capitalMigrationExecutionReady: lane.lane === "CONFIRMED_EARLY_FLOW" && routeVerified(withBaseline),
    ...(!withBaseline.candidateProofState
      ? {
          researchOnly: lane.lane !== "CONFIRMED_EARLY_FLOW" || !routeVerified(withBaseline),
          executionReady: lane.lane === "CONFIRMED_EARLY_FLOW" && routeVerified(withBaseline),
        }
      : {}),
  };
}

export function analyzeCapitalMigrationCoreBatch(projects = [], options = {}) {
  return (Array.isArray(projects) ? projects : []).map((project) =>
    analyzeCapitalMigrationCore(project, options)
  );
}

export function summarizeCapitalMigration(projects = []) {
  const safe = Array.isArray(projects) ? projects : [];
  const sorted = [...safe].sort((a, b) => (b.capitalMigrationScore || 0) - (a.capitalMigrationScore || 0));
  const byLane = safe.reduce((acc, project) => {
    const lane = project.capitalMigrationLane || "NOT_RUN";
    acc[lane] = (acc[lane] || 0) + 1;
    return acc;
  }, {});
  const topCandidates = sorted.slice(0, 25).map((project, index) => ({
    rank: index + 1,
    symbol: project.symbol || "UNKNOWN",
    name: project.name || "Unknown",
    chain: project.chain || project.chainId || null,
    score: project.capitalMigrationScore || 0,
    confidence: project.capitalMigrationConfidence || "Low",
    lane: project.capitalMigrationLane || "NOT_RUN",
    researchOnly: project.capitalMigrationResearchOnly !== false,
    executionReady: project.capitalMigrationExecutionReady === true,
    blockers: project.capitalMigrationBlockers || [],
    missingEvidence: project.capitalMigrationMissingEvidence || [],
  }));
  return {
    generatedAt: new Date().toISOString(),
    status: safe.length ? "OK" : "NO_PROJECTS",
    projectsAnalyzed: safe.length,
    confirmedEarlyFlow: byLane.CONFIRMED_EARLY_FLOW || 0,
    researchOnlyFlow: (byLane.EARLY_FLOW_RESEARCH || 0) + (byLane.FLOW_ACCELERATING || 0),
    capitalOutflow: byLane.CAPITAL_OUTFLOW || 0,
    unsafeOrManipulated: byLane.UNSAFE_OR_MANIPULATED || 0,
    counts: {
      confirmedEarlyFlow: byLane.CONFIRMED_EARLY_FLOW || 0,
      earlyFlowResearch: byLane.EARLY_FLOW_RESEARCH || 0,
      flowAccelerating: byLane.FLOW_ACCELERATING || 0,
      asymmetricWatch: byLane.TWO_X_ASYMMETRIC_WATCH || 0,
      lateChase: byLane.LATE_CHASE || 0,
      capitalOutflow: byLane.CAPITAL_OUTFLOW || 0,
      unsafeOrManipulated: byLane.UNSAFE_OR_MANIPULATED || 0,
      insufficientData: byLane.INSUFFICIENT_DATA || 0,
    },
    lanes: byLane,
    topCandidates,
    topCapitalMigration: topCandidates,
  };
}
