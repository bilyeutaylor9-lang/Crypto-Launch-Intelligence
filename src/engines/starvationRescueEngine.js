function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

function deterministicBlockers(project = {}) {
  const blockers = [];
  if (project.identityConflict === true || project.identityRescueStatus === "IDENTITY_CONFLICT_BLOCKS_RESCUE") blockers.push("IDENTITY_CONFLICT");
  if (project.honeypotDetected === true || project.sellRestricted === true || project.instantSafetyStatus === "CRITICAL") blockers.push("HONEYPOT_OR_SELL_RESTRICTION");
  if (num(project.washTradingRiskScore) >= 80) blockers.push("HIGH_WASH_TRADING_RISK");
  if (num(project.walletClusterRiskScore) >= 85) blockers.push("HIGH_WALLET_CLUSTER_RISK");
  if (num(project.liquidityControlRiskScore ?? project.liquidityControlRisk) >= 85) blockers.push("HIGH_LIQUIDITY_CONTROL_RISK");
  if (["LATE_CHASE", "DEAD", "BREAKDOWN"].includes(project.preBreakoutTimingState)) blockers.push(project.preBreakoutTimingState);
  return blockers;
}

function observedSignals(project = {}) {
  return [
    ["RELATIVE_CAPITAL_FLOW", project.earlyAsymmetryComponents?.RELATIVE_CAPITAL_FLOW],
    ["BUYER_BREADTH_ACCELERATION", project.buyerBreadthAccelerationScore],
    ["LIQUIDITY_FORMATION", project.liquidityFormationScore],
    ["PRICE_COMPRESSION", project.earlyAsymmetryComponents?.PRICE_COMPRESSION],
    ["ATTENTION_GAP", project.attentionGapV2Score],
    ["SMART_WALLET_NOVELTY", project.smartWalletNoveltyScore],
    ["DEVELOPER_ACCELERATION", project.developerAccelerationV2Score],
    ["CATALYST_VERIFICATION", project.catalystScore ?? project.liveCatalystRadarScore],
    ["SOURCE_DIVERSITY", project.earlyAsymmetryComponents?.SOURCE_DIVERSITY],
    ["IDENTITY_CONFIDENCE", project.earlyAsymmetryComponents?.IDENTITY_CONFIDENCE],
  ]
    .filter(([, score]) => num(score) >= 45)
    .map(([family, score]) => ({ family, score: Math.round(clamp(score)) }));
}

function laneFor(project = {}, voiScore = 0) {
  const missing = project.dataStarvationMissingEvidence || [];
  if (missing.some((item) => ["tokenAddress", "poolAddress", "chain", "honeypotDetected", "sellRestricted"].includes(item.canonicalField))) {
    return "P0_IDENTITY_AND_SAFETY_RESCUE";
  }
  if (num(project.earlyAsymmetryResearchPriorityScore) >= 65) return "P1_EARLY_ASYMMETRY_RESCUE";
  if (num(project.capitalMigrationScore ?? project.capitalFlowScore) >= 60) return "P2_CAPITAL_FLOW_RESCUE";
  if (num(project.developerAccelerationV2Score) >= 55 || num(project.catalystScore) >= 55) return "P3_DEVELOPER_CATALYST_RESCUE";
  if (voiScore >= 0.4) return "P4_COVERAGE_DIVERSITY_RESCUE";
  return missing.length ? "BACKGROUND_ENRICHMENT" : "DO_NOT_ENRICH";
}

export function analyzeStarvationRescue(project = {}) {
  const blockers = deterministicBlockers(project);
  const recoverableMissing = (project.dataStarvationMissingEvidence || []).filter((item) => item.recoverable && item.rootCause !== "NOT_APPLICABLE");
  const signals = observedSignals(project);
  const voi = clamp(project.valueOfInformationScore, 0, 100);
  const researchPriorityScore = clamp(project.earlyAsymmetryResearchPriorityScore ?? project.preIntelligenceOpportunityScore);
  const hasEnoughIdentity = Boolean(project.identityRescueStatus === "DISTINGUISHABLE_IDENTITY" || project.tokenAddress || project.poolAddress || project.projectId);
  const eligible =
    blockers.length === 0 &&
    hasEnoughIdentity &&
    signals.length >= 2 &&
    recoverableMissing.length > 0 &&
    researchPriorityScore >= 35;
  const rescueScore = Math.round(clamp(researchPriorityScore * 0.58 + voi * 0.24 + Math.min(100, signals.length * 14) * 0.18));
  const lane = eligible ? laneFor(project, voi / 100) : "DO_NOT_ENRICH";

  return {
    ...project,
    starvationRescueEligible: eligible,
    starvationRescueScore: rescueScore,
    rescueLane: lane,
    rescueRank: null,
    researchPriorityScore,
    valueOfInformationScore: project.valueOfInformationScore || 0,
    observedSignals: signals,
    missingSignals: recoverableMissing.map((item) => item.canonicalField),
    targetSources: [...new Set(recoverableMissing.flatMap((item) => (item.targetSources || []).map((source) => source.source)))].slice(0, 12),
    estimatedRequests: recoverableMissing.reduce((sum, item) => sum + (item.targetSources?.length || 0), 0),
    estimatedTime: project.starvationRecoveryPlan?.estimatedTimeMs || 0,
    reasonForRescue: eligible
      ? "Promising early evidence exists but recoverable proof is missing."
      : null,
    reasonNotQualified: blockers.length
      ? `Blocked by ${blockers.join(", ")}.`
      : !hasEnoughIdentity
        ? "Identity is not distinct enough to rescue safely."
        : signals.length < 2
          ? "Fewer than two observed opportunity families."
          : !recoverableMissing.length
            ? "No recoverable missing evidence."
            : researchPriorityScore < 35
              ? "Research priority is below rescue floor."
              : "Not eligible for rescue.",
    hardBlockers: blockers,
    researchOnly: true,
    executionReady: project.executionReady === true,
    finalSelectionQualified: project.finalSelectionQualified === true ? project.finalSelectionQualified : false,
  };
}

export function analyzeStarvationRescueBatch(projects = []) {
  const analyzed = (Array.isArray(projects) ? projects : []).map(analyzeStarvationRescue);
  const ranked = analyzed
    .filter((project) => project.starvationRescueEligible)
    .sort((a, b) => num(b.starvationRescueScore) - num(a.starvationRescueScore));
  const rankByKey = new Map(ranked.map((project, index) => [project.projectId || project.symbol || `${index}`, index + 1]));
  return analyzed.map((project) => ({
    ...project,
    rescueRank: project.starvationRescueEligible
      ? rankByKey.get(project.projectId || project.symbol) || null
      : null,
  }));
}
