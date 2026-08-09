import { loadScanMemory } from "../learning/scanMemoryStore.js";
import {
  discoveryLaneForProject,
  evidenceFamiliesForProject,
  hasConcreteMarketEvidence,
} from "./discoveryCoverageEngine.js";

function present(value) {
  return value !== undefined && value !== null && value !== "";
}

function numberOrNull(value) {
  if (!present(value)) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function firstNumber(...values) {
  for (const value of values) {
    const parsed = numberOrNull(value);
    if (parsed !== null) return parsed;
  }
  return null;
}

function firstPositiveNumber(...values) {
  const value = firstNumber(...values);
  return value !== null && value > 0 ? value : null;
}

function clamp(value = 0, min = 0, max = 100) {
  const parsed = Number(value);
  return Math.max(min, Math.min(max, Number.isFinite(parsed) ? parsed : 0));
}

function scorePositiveGrowth(value, fullScale) {
  return value === null ? null : clamp((Math.max(0, value) / fullScale) * 100);
}

function growthPct(current, previous) {
  if (current === null || previous === null || previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}

function averageKnown(values = []) {
  const known = values.filter((value) => value !== null && value !== undefined);
  if (!known.length) return null;
  return known.reduce((sum, value) => sum + Number(value), 0) / known.length;
}

function memoryIdForProject(project = {}) {
  return String(
    project.address ||
      project.tokenAddress ||
      project.pairAddress ||
      `${project.chain || "unknown"}:${project.symbol || project.name || "unknown"}`
  ).toLowerCase();
}

function marketFromRecord(record = {}) {
  return {
    liquidity: firstNumber(
      record.pointInTime?.liquidity?.liquidityUsd,
      record.market?.liquidityUsd
    ),
    volume: firstNumber(
      record.pointInTime?.market?.volume24hUsd,
      record.market?.volume24h
    ),
    price: firstNumber(record.pointInTime?.market?.priceUsd, record.market?.priceUsd),
    buyers: firstNumber(
      record.pointInTime?.buyers?.clusterAdjustedUniqueBuyers24h,
      record.pointInTime?.buyers?.uniqueBuyers24h
    ),
  };
}

function currentMarket(project = {}) {
  return {
    liquidity: firstPositiveNumber(project.liquidityUsd, project.liquidity, project.marketData?.liquidityUsd),
    volume: firstPositiveNumber(project.volume24h, project.volume, project.marketData?.volume24h),
    price: firstPositiveNumber(project.priceUsd, project.price, project.marketData?.priceUsd),
    buyers: firstNumber(
      project.clusterAdjustedUniqueBuyers24h,
      project.independentBuyers24h,
      project.uniqueBuyers24h,
      project.buyers24h,
      project.marketData?.buyers24h
    ),
  };
}

function explicitOrObservedGrowth(explicitValues, current, prior) {
  const explicit = firstNumber(...explicitValues);
  return explicit === null ? growthPct(current, prior) : explicit;
}

function hardDangerReasons(project = {}) {
  const reasons = [];
  if (project.honeypot === true || project.honeypotDetected === true || firstNumber(project.honeypotRiskScore) >= 85) {
    reasons.push("confirmed honeypot danger");
  }
  if (project.identityConflict === true || firstNumber(project.identityRiskScore) >= 85) {
    reasons.push("confirmed identity conflict");
  }
  if (project.contractMismatch === true || project.chainContractMismatch === true) {
    reasons.push("chain/contract mismatch");
  }
  if (firstNumber(project.liquidityManipulationRisk) >= 90 || firstNumber(project.washTradingRiskScore) >= 90) {
    reasons.push("severe manipulation evidence");
  }
  return reasons;
}

function identityEvidencePresent(project = {}) {
  return Boolean(
    project.address ||
      project.tokenAddress ||
      project.contractAddress ||
      project.pairAddress ||
      project.poolAddress ||
      project.marketKey ||
      project.verifiedExchangeAssetId
  );
}

function buildHistoryIndex(records = []) {
  const index = new Map();
  for (const record of Array.isArray(records) ? records : []) {
    const id = String(record?.id || "").toLowerCase();
    if (!id) continue;
    if (!index.has(id)) index.set(id, []);
    index.get(id).push(record);
  }
  for (const history of index.values()) {
    history.sort((left, right) => new Date(left.scannedAt || 0) - new Date(right.scannedAt || 0));
  }
  return index;
}

function componentReason(label, value, threshold, reasons) {
  if (value !== null && value >= threshold) reasons.push(label);
}

export function calculateExplosionReadiness(project = {}, context = {}) {
  const history = Array.isArray(context.history) ? context.history : [];
  const latest = history.at(-1) || null;
  const previous = history.at(-2) || null;
  const current = currentMarket(project);
  const prior = latest ? marketFromRecord(latest) : {};
  const priorToPrior = previous ? marketFromRecord(previous) : {};

  const liquidityGrowthPct = explicitOrObservedGrowth(
    [project.liquidityChange24hPct, project.liquidityGrowth24hPct, project.liquidityGrowthPct, project.liquidityFormationPct],
    current.liquidity,
    firstNumber(prior.liquidity, project.previousLiquidityUsd, project.priorLiquidityUsd)
  );
  const buyerGrowthPct = explicitOrObservedGrowth(
    [project.buyersChange24hPct, project.buyerGrowth24hPct, project.buyerBreadthAccelerationPct, project.independentBuyerAccelerationPct],
    current.buyers,
    firstNumber(prior.buyers, project.previousClusterAdjustedUniqueBuyers24h, project.priorIndependentBuyers24h)
  );
  const volumeGrowthPct = explicitOrObservedGrowth(
    [project.volumeChange24hPct, project.volumeGrowth24hPct, project.volumeAccelerationPct, project.volumeGrowthPct],
    current.volume,
    firstNumber(prior.volume, project.previousVolume24h, project.priorVolume24h)
  );

  const liquidityFormation = scorePositiveGrowth(liquidityGrowthPct, 60);
  const buyerBreadthAcceleration = scorePositiveGrowth(buyerGrowthPct, 80);
  const volumeAcceleration = scorePositiveGrowth(volumeGrowthPct, 160);
  const priceChange24h = firstNumber(project.priceChange24h, project.marketData?.priceChange24h);
  const priceExtension = priceChange24h === null ? null : clamp((Math.max(0, priceChange24h) / 90) * 100);
  const capitalLead = averageKnown([liquidityFormation, buyerBreadthAcceleration]);
  const capitalBeforePrice =
    capitalLead === null || priceExtension === null
      ? null
      : clamp(capitalLead * 0.72 + (100 - priceExtension) * 0.28);

  const developerChangePct = firstNumber(
    project.developerActivityChangePct,
    project.githubCommitsChange30dPct,
    project.githubCommitGrowthPct,
    project.githubStarsChange30dPct
  );
  const recentBuilderActivity = averageKnown([
    scorePositiveGrowth(developerChangePct, 100),
    present(project.githubCommits30d) ? clamp((firstNumber(project.githubCommits30d) / 60) * 100) : null,
    present(project.githubStars30d) ? clamp((firstNumber(project.githubStars30d) / 100) * 100) : null,
  ]);
  const verifiedCatalyst =
    project.verifiedCatalyst === true ||
    project.strongestCatalyst?.verified === true ||
    project.nextCatalyst?.verified === true
      ? 80
      : null;
  const builderCatalystChange = averageKnown([recentBuilderActivity, verifiedCatalyst]);

  const builderStrength = averageKnown([
    firstNumber(project.developerActivityScore),
    firstNumber(project.githubProScore),
    firstNumber(project.productUsageScore, project.ecosystemAdoptionScore),
    liquidityFormation,
    buyerBreadthAcceleration,
  ]);
  const socialAttention = averageKnown([
    firstNumber(project.socialAccelerationScore),
    firstNumber(project.xSocialScore),
    firstNumber(project.narrativeHeatScore),
  ]);
  const attentionGap =
    builderStrength === null || socialAttention === null
      ? null
      : clamp(50 + (builderStrength - socialAttention) * 0.75);

  const priorLiquidityGrowth = growthPct(prior.liquidity ?? null, priorToPrior.liquidity ?? null);
  const priorBuyerGrowth = growthPct(prior.buyers ?? null, priorToPrior.buyers ?? null);
  const priorVolumeGrowth = growthPct(prior.volume ?? null, priorToPrior.volume ?? null);
  const persistentSeries = [
    [liquidityGrowthPct, priorLiquidityGrowth],
    [buyerGrowthPct, priorBuyerGrowth],
    [volumeGrowthPct, priorVolumeGrowth],
  ].filter(([now, before]) => now !== null && before !== null);
  const positivePersistent = persistentSeries.filter(([now, before]) => now > 0 && before > 0).length;
  const persistence = history.length < 2 || !persistentSeries.length
    ? null
    : clamp(35 + Math.min(3, positivePersistent) * 20 + Math.min(3, history.length - 2) * 5);

  const evidenceFamilies = evidenceFamiliesForProject(project).filter((family) => family !== "unknown");
  const evidenceDiversity = evidenceFamilies.length
    ? clamp((Math.min(4, evidenceFamilies.length) / 4) * 100)
    : null;
  const components = {
    liquidityFormation,
    buyerBreadthAcceleration,
    volumeAcceleration,
    capitalBeforePrice,
    builderCatalystChange,
    attentionGap,
    persistence,
    evidenceDiversity,
  };
  const weights = {
    liquidityFormation: 0.22,
    buyerBreadthAcceleration: 0.22,
    volumeAcceleration: 0.12,
    capitalBeforePrice: 0.14,
    builderCatalystChange: 0.12,
    attentionGap: 0.08,
    persistence: 0.06,
    evidenceDiversity: 0.04,
  };
  const coverage = Object.values(components).filter((value) => value !== null).length / Object.keys(components).length;
  const weightedEvidence = Object.entries(weights).reduce(
    (sum, [key, weight]) => sum + (components[key] === null ? 0 : components[key] * weight),
    0
  );

  const volumeLiquidityRatio =
    current.volume !== null && current.liquidity !== null && current.liquidity > 0
      ? current.volume / current.liquidity
      : null;
  const fakeVolumeConcern = Boolean(
    volumeLiquidityRatio !== null &&
      volumeLiquidityRatio >= 15 &&
      ((current.buyers !== null && current.buyers < 25) ||
        (liquidityGrowthPct !== null && liquidityGrowthPct <= 0 && buyerGrowthPct !== null && buyerGrowthPct <= 0))
  );
  const riskValues = [
    project.trapRiskScore,
    project.riskScore,
    project.honeypotRiskScore,
    project.identityRiskScore,
    project.walletClusterRiskScore,
    project.washTradingRiskScore,
    project.liquidityManipulationRisk,
    project.sellPressureScore,
    project.tokenUnlockRiskScore,
    project.vestingPressureScore,
  ].map(numberOrNull).filter((value) => value !== null);
  const measuredRiskPenalty = riskValues.length ? Math.max(...riskValues) * 0.3 : 0;
  const extensionPenalty = priceExtension === null ? 0 : Math.max(0, priceExtension - 45) * 0.35;
  const fakeVolumePenalty = fakeVolumeConcern ? 28 : 0;
  const riskPenalty = Math.round(Math.min(55, measuredRiskPenalty + extensionPenalty + fakeVolumePenalty));
  const evidenceAdjusted = weightedEvidence * (0.35 + coverage * 0.65);
  const score = Math.round(clamp(evidenceAdjusted - riskPenalty));
  const hardBlockers = hardDangerReasons(project);
  const lane = project.discoveryLane || discoveryLaneForProject(project);
  const hasMarketEvidence = hasConcreteMarketEvidence(project);
  const hasIdentityEvidence = identityEvidencePresent(project);
  const accelerationSignals = [liquidityFormation, buyerBreadthAcceleration, volumeAcceleration]
    .filter((value) => value !== null && value >= 45).length;
  const missingEvidence = [];
  if (!hasIdentityEvidence) missingEvidence.push("contract, pool, or verified market identity");
  if (!hasMarketEvidence) missingEvidence.push("measured market evidence");
  if (liquidityFormation === null) missingEvidence.push("liquidity change across time");
  if (buyerBreadthAcceleration === null) missingEvidence.push("independent buyer breadth change");
  if (volumeAcceleration === null) missingEvidence.push("volume change across time");
  if (priceExtension === null) missingEvidence.push("price extension measurement");
  if (history.length < 2) missingEvidence.push("multi-scan persistence");
  if (evidenceFamilies.length < 2) missingEvidence.push("two independent source families");

  const rankEligible = Boolean(
    !hardBlockers.length &&
      lane !== "identity-only" &&
      hasIdentityEvidence &&
      hasMarketEvidence &&
      coverage >= 0.5 &&
      accelerationSignals >= 2 &&
      evidenceFamilies.length >= 2 &&
      !fakeVolumeConcern
  );
  let state = "INSUFFICIENT_EVIDENCE";
  if (hardBlockers.length) state = "RISK_BLOCKED";
  else if ((priceExtension !== null && priceExtension >= 72) || fakeVolumeConcern) state = "LATE_OR_DISTORTED";
  else if (rankEligible && score >= 75 && coverage >= 0.65) state = "COILED_ACCELERATION";
  else if (rankEligible && score >= 60) state = "EARLY_ACCELERATION";
  else if (hasMarketEvidence && hasIdentityEvidence && coverage >= 0.375) state = "WATCH";

  const reasons = [];
  componentReason("liquidity is expanding ahead of the move", liquidityFormation, 55, reasons);
  componentReason("independent buyer breadth is accelerating", buyerBreadthAcceleration, 55, reasons);
  componentReason("volume is accelerating with corroborating evidence", volumeAcceleration, 55, reasons);
  componentReason("capital formation is leading price extension", capitalBeforePrice, 60, reasons);
  componentReason("builder activity or a verified catalyst is changing", builderCatalystChange, 55, reasons);
  componentReason("fundamentals are stronger than measured attention", attentionGap, 65, reasons);
  componentReason("acceleration persists across multiple scans", persistence, 60, reasons);
  if (fakeVolumeConcern) reasons.push("volume is disproportionate to liquidity or independent buyers");

  return {
    explosionReadinessScore: hardBlockers.length ? 0 : score,
    explosionReadinessState: state,
    explosionReadinessCoverage: Number(coverage.toFixed(3)),
    explosionReadinessRankEligible: rankEligible,
    explosionReadinessComponents: Object.fromEntries(
      Object.entries(components).map(([key, value]) => [key, value === null ? null : Math.round(clamp(value))])
    ),
    explosionReadinessObservedDeltas: {
      liquidityGrowthPct: liquidityGrowthPct === null ? null : Number(liquidityGrowthPct.toFixed(2)),
      buyerBreadthGrowthPct: buyerGrowthPct === null ? null : Number(buyerGrowthPct.toFixed(2)),
      volumeGrowthPct: volumeGrowthPct === null ? null : Number(volumeGrowthPct.toFixed(2)),
      priceChange24hPct: priceChange24h,
    },
    explosionReadinessMissingEvidence: [...new Set(missingEvidence)],
    explosionReadinessReasons: reasons,
    explosionReadinessRiskPenalty: riskPenalty,
    explosionReadinessFakeVolumeConcern: fakeVolumeConcern,
    explosionReadinessHistoryCount: history.length,
    explosionReadinessEvidenceFamilies: evidenceFamilies,
    explosionReadinessPolicy:
      "Research prioritization score from measured temporal evidence; it is not a probability, guarantee, or automatic trade signal.",
  };
}

export function analyzeExplosionReadinessBatch(projects = [], options = {}) {
  const records = Array.isArray(options.historyRecords)
    ? options.historyRecords
    : options.loadHistory === false
      ? []
      : loadScanMemory();
  const historyIndex = buildHistoryIndex(records);

  return (Array.isArray(projects) ? projects : []).map((project) => ({
    ...project,
    ...calculateExplosionReadiness(project, {
      ...options,
      history: historyIndex.get(memoryIdForProject(project)) || [],
    }),
  }));
}
