function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

function present(value) {
  return value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
}

function scoreFromRatio(value, low = 0, high = 1) {
  if (!Number.isFinite(Number(value))) return null;
  return clamp(((Number(value) - low) / Math.max(0.000001, high - low)) * 100);
}

function metric(project = {}, keys = []) {
  for (const key of keys) {
    const value = key.split(".").reduce((current, part) => (current ? current[part] : undefined), project);
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return null;
}

function independentSourceCount(project = {}) {
  return new Set([project.source, ...(project.sources || []), ...(project.discoverySources || []), ...(project.evidenceSources || [])].filter(Boolean).map((source) => String(source).toLowerCase())).size;
}

export function earlyAsymmetryComponents(project = {}) {
  const marketCap = num(metric(project, ["circulatingMarketCapUsd", "marketCap", "marketData.marketCap", "rawCandidate.marketCap"]));
  const liquidity = num(metric(project, ["stableExitLiquidityUsd", "liquidityUsd", "dexLiquidityUsd", "marketData.liquidityUsd", "rawCandidate.liquidityUsd"]));
  const volume = num(metric(project, ["volume24hUsd", "volume24h", "marketData.volume24h", "rawCandidate.volume24h"]));
  const flowToLiquidity = liquidity ? volume / liquidity : null;
  const flowToMarketCap = marketCap ? volume / marketCap : null;
  const priceChange = Math.max(Math.abs(num(project.priceChange24hPct ?? project.priceChange24h)), Math.abs(num(project.priceChange7dPct ?? project.priceChange7d)) * 0.6);
  const priceCompression = clamp(100 - scoreFromRatio(priceChange, 20, 160));
  const sourceDiversity = clamp(independentSourceCount(project) * 22);
  const safetyConfidence = clamp(
    project.instantSafetyStatus === "PASS" ? 88 :
      project.honeypotDetected === true || project.sellRestricted === true ? 0 :
        project.instantSafetyScore ?? project.contractAuthoritySafetyScore ?? 45
  );
  const identityConfidence = clamp(project.identityResolutionScore ?? project.identityConfidence ?? (project.tokenAddress || project.poolAddress ? 62 : 20));

  return {
    RELATIVE_CAPITAL_FLOW: scoreFromRatio(Math.max(flowToLiquidity ?? 0, (flowToMarketCap ?? 0) * 10), 0.05, 2),
    BUYER_BREADTH_ACCELERATION: metric(project, ["buyerBreadthAccelerationScore", "organicBuyerScore", "buyPressureScore"]),
    LIQUIDITY_FORMATION: metric(project, ["liquidityFormationScore", "liquidityExpansionScore", "activeLiquidityTruthScore"]),
    PRICE_COMPRESSION: priceCompression,
    ATTENTION_GAP: metric(project, ["attentionGapV2Score", "attentionGapScore", "informationAdvantageScore"]),
    SMART_WALLET_NOVELTY: metric(project, ["smartWalletNoveltyScore", "smartWalletArrivalScore", "smartWalletScore"]),
    DEVELOPER_ACCELERATION: metric(project, ["developerAccelerationV2Score", "developerActivityScore", "githubProScore"]),
    CATALYST_VERIFICATION: metric(project, ["catalystScore", "liveCatalystRadarScore", "roadmapProfitabilityScore"]),
    SOURCE_DIVERSITY: sourceDiversity,
    SUPPLY_QUALITY: clamp(100 - Math.max(num(project.supplyIntegrityRiskScore), num(project.vestingPressureScore), num(project.tokenUnlockRiskScore))),
    IDENTITY_CONFIDENCE: identityConfidence,
    SAFETY_CONFIDENCE: safetyConfidence,
  };
}

const WEIGHTS = Object.freeze({
  RELATIVE_CAPITAL_FLOW: 0.16,
  BUYER_BREADTH_ACCELERATION: 0.15,
  LIQUIDITY_FORMATION: 0.13,
  ATTENTION_GAP: 0.11,
  SMART_WALLET_NOVELTY: 0.10,
  DEVELOPER_ACCELERATION: 0.09,
  PRICE_COMPRESSION: 0.08,
  CATALYST_VERIFICATION: 0.07,
  SOURCE_DIVERSITY: 0.05,
  SUPPLY_QUALITY: 0.03,
  IDENTITY_CONFIDENCE: 0.02,
  SAFETY_CONFIDENCE: 0.01,
});

function penalties(project = {}) {
  return {
    lateChasePenalty: ["LATE_CHASE", "EXTENDED"].includes(project.preBreakoutTimingState) ? (project.preBreakoutTimingState === "LATE_CHASE" ? 35 : 18) : 0,
    identityConflictPenalty: project.identityConflict === true || (project.canonicalAliasConflicts && Object.keys(project.canonicalAliasConflicts).length) ? 40 : 0,
    washTradingPenalty: clamp(project.washTradingRiskScore) * 0.25,
    walletConcentrationPenalty: clamp(project.walletClusterRiskScore ?? project.largestClusterShare) * 0.2,
    liquidityControlPenalty: clamp(project.liquidityControlRiskScore ?? project.liquidityControlRisk) * 0.22,
    deployerRiskPenalty: clamp(project.deployerRiskScore) * 0.2,
    supplyUnlockPenalty: clamp(project.supplyIntegrityRiskScore ?? project.vestingPressureScore ?? project.tokenUnlockRiskScore) * 0.18,
    sourceConflictPenalty: clamp(project.sourceConflictRiskScore ?? (project.sourceTruthVerdict === "CONFLICTED" ? 80 : 0)) * 0.16,
    staleDataPenalty: clamp(project.staleEvidenceCount || (project.dataStarvationRootCauses?.STALE_DATA || 0) * 10) * 0.14,
  };
}

export function analyzeEarlyAsymmetryTriage(project = {}) {
  const components = earlyAsymmetryComponents(project);
  const observed = Object.entries(components).filter(([, value]) => present(value));
  const missingEvidence = Object.entries(components)
    .filter(([, value]) => !present(value))
    .map(([family]) => family);
  const weightTotal = observed.reduce((sum, [family]) => sum + WEIGHTS[family], 0);
  const rawScore = weightTotal
    ? observed.reduce((sum, [family, value]) => sum + clamp(value) * WEIGHTS[family], 0) / weightTotal
    : 0;
  const coveragePct = Math.round((observed.length / Object.keys(WEIGHTS).length) * 100);
  const coveragePenalty = coveragePct >= 75 ? 0 : coveragePct >= 50 ? 6 : coveragePct >= 30 ? 14 : 28;
  const riskPenalties = penalties(project);
  const riskPenalty = Math.round(Object.values(riskPenalties).reduce((sum, value) => sum + num(value), 0));
  const finalResearchPriorityScore = Math.round(clamp(rawScore - coveragePenalty - riskPenalty));
  const positive = observed
    .map(([family, value]) => ({ family, score: Math.round(clamp(value)), weightedContribution: Number((clamp(value) * WEIGHTS[family]).toFixed(2)) }))
    .sort((a, b) => b.weightedContribution - a.weightedContribution);
  const negative = Object.entries(riskPenalties)
    .filter(([, value]) => num(value) > 0)
    .map(([penalty, value]) => ({ penalty, value: Math.round(num(value)) }))
    .sort((a, b) => b.value - a.value);

  return {
    ...project,
    earlyAsymmetryResearchPriorityScore: finalResearchPriorityScore,
    earlyAsymmetryResearchPriorityRawScore: Math.round(rawScore),
    earlyAsymmetryCoveragePct: coveragePct,
    earlyAsymmetryIndependentEvidenceFamilies: observed.map(([family]) => family),
    earlyAsymmetryCorrelatedEvidenceFamilies: ["PRICE_VOLUME_TRANSACTION_DERIVED"],
    earlyAsymmetryCoveragePenalty: coveragePenalty,
    earlyAsymmetryRiskPenalty: riskPenalty,
    earlyAsymmetryConfidenceState: coveragePct >= 80 ? "HIGH" : coveragePct >= 55 ? "MEDIUM" : "LOW",
    earlyAsymmetryMissingEvidence: missingEvidence,
    earlyAsymmetryTopPositiveDrivers: positive.slice(0, 6),
    earlyAsymmetryTopNegativeDrivers: negative.slice(0, 6),
    earlyAsymmetryComponents: components,
    earlyAsymmetryPolicy:
      "Research-priority score only. It schedules enrichment and cannot produce a buy-qualified project without separate safety, identity, liquidity, and execution proof.",
  };
}

export function analyzeEarlyAsymmetryTriageBatch(projects = []) {
  return (Array.isArray(projects) ? projects : []).map(analyzeEarlyAsymmetryTriage);
}
