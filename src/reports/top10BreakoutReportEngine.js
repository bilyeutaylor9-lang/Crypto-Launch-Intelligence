import fs from "fs";
import path from "path";
import { attachCanonicalIdentityBatch } from "../identity/canonicalIdentityResolver.js";
import { normalizeMetricTruthBatch, sourceFamiliesForProject } from "../data/metricTruthNormalizer.js";
import {
  hasExactRouteIdentity,
  hasVerifiedBuyQuote,
  hasVerifiedRouteDepth,
  hasVerifiedRouteSlippage,
  hasVerifiedSellQuote,
  isLiveExecutionReady,
  routeQuoteFresh,
} from "../execution/routeTruthV2.js";
import { resolveStrictCandidateGate } from "../execution/routeResolver.js";

const BREAKOUT_WEIGHTS = [
  ["earlyAcceleration", 18],
  ["liquidityFormation", 14],
  ["organicBuyerQuality", 12],
  ["smartWalletArrival", 10],
  ["verifiedCatalystStrength", 10],
  ["developerAcceleration", 8],
  ["relativeMarketStrength", 8],
  ["executionQuality", 8],
  ["independentEvidenceQuality", 7],
  ["valuationOpportunity", 5],
];

const RESEARCH_OPPORTUNITY_WEIGHTS = [
  ["earlyAcceleration", 20],
  ["liquidityFormation", 16],
  ["organicBuyerQuality", 14],
  ["smartWalletArrival", 12],
  ["verifiedCatalystStrength", 11],
  ["developerAcceleration", 10],
  ["relativeMarketStrength", 8],
  ["valuationOpportunity", 6],
  ["independentEvidenceQuality", 3],
];

const EXECUTION_READINESS_WEIGHTS = [
  ["exactRouteIdentity", 16],
  ["verifiedContract", 13],
  ["verifiedSafety", 14],
  ["verifiedLiquidityDepth", 14],
  ["freshBuyQuote", 12],
  ["freshSellQuote", 14],
  ["verifiedSlippage", 9],
  ["routeFreshness", 8],
];

const IDENTITY_ROUTE_REASONS = new Set([
  "CONTRACT_MISSING",
  "SYMBOL_AMBIGUOUS",
  "UNSUPPORTED_CHAIN",
  "WRAPPED_ASSET_UNVERIFIED",
  "NATIVE_ASSET_MISMATCH",
]);

const ROUTE_ONLY_REASONS = new Set([
  "PAIR_NOT_FOUND",
  "NO_ACTIVE_LIQUIDITY",
  "BUY_ROUTE_FAILED",
  "SELL_ROUTE_FAILED",
  "STALE_MARKET_DATA",
  "REGION_UNVERIFIED",
]);

const DETERMINISTIC_BLOCK_PATTERNS = [
  /honeypot/i,
  /scam/i,
  /rug/i,
  /contract (conflict|mismatch)/i,
  /identity conflict/i,
  /chain mismatch/i,
  /sell (restricted|blocked|failure)/i,
  /cannot sell/i,
  /liquidity (removal|rug|drain)/i,
  /lp (removal|withdraw)/i,
  /blacklist/i,
  /freeze authority/i,
  /mint authority/i,
  /deployer selling/i,
  /wash[-\s]?trading/i,
  /manipulation/i,
  /malicious/i,
];

const NON_DETERMINISTIC_BLOCK_PATTERNS = [
  /missing/i,
  /insufficient/i,
  /unknown/i,
  /unverified/i,
  /route/i,
  /low score/i,
  /research/i,
  /model/i,
  /ai rejection/i,
  /uncertain/i,
  /watch/i,
];

const TOP10_CANDIDATE_INPUT_FIELDS = [
  "canonicalProjectId",
  "projectId",
  "permanentProjectKey",
  "name",
  "canonicalName",
  "symbol",
  "canonicalSymbol",
  "canonicalChain",
  "chainId",
  "finalChain",
  "chain",
  "network",
  "targetChain",
  "declaredChain",
  "expectedChain",
  "lifecycleStage",
  "projectLifecycleStage",
  "launchStatus",
  "launchDate",
  "tokenLaunchDate",
  "testnetActivity",
  "mainnetActivity",
  "finalContractAddress",
  "canonicalAddress",
  "tokenAddress",
  "contractAddress",
  "address",
  "verifiedContractAddress",
  "primaryTradablePool",
  "poolAddress",
  "pairAddress",
  "finalPairAddress",
  "verifiedPairAddress",
  "dex",
  "dexName",
  "exchange",
  "quoteAsset",
  "quoteTokenAddress",
  "source",
  "sources",
  "discoverySources",
  "evidenceSources",
  "evidence",
  "baseToken",
  "quoteToken",
  "marketData",
  "rawCandidate",
  "priceUsd",
  "price",
  "priceChange24h",
  "liquidityUsd",
  "dexLiquidityUsd",
  "finalLiquidityUsd",
  "activeLiquidityUsd",
  "stableExitLiquidityUsd",
  "hardExitLiquidityUsd",
  "exitLiquidityUsd",
  "circulatingMarketCapUsd",
  "marketCap",
  "estimatedMarketCapUsd",
  "fullyDilutedValueUsd",
  "fdv",
  "fullyDilutedValue",
  "poolAge",
  "poolAgeHours",
  "pairCreatedAt",
  "poolCreatedAt",
  "earlyAccelerationScore",
  "accelerationScore",
  "preBreakoutMomentumScore",
  "momentumShiftScore",
  "velocityScore",
  "projectChangeScore",
  "liquidityFormationScore",
  "liquidityExpansionScore",
  "activeLiquidityTruthScore",
  "liquidityPersistenceScore",
  "organicBuyerScore",
  "buyerRetentionScore",
  "buyPressureScore",
  "unrelatedBuyerClusters",
  "independentBuyers24h",
  "uniqueBuyers24h",
  "sameFunderBuyers24h",
  "smartWalletArrivalScore",
  "smartWalletPerformanceScore",
  "smartMoneyAccumulationScore",
  "smartWalletDiversityScore",
  "unrelatedSmartWalletCount",
  "liveCatalystRadarScore",
  "catalystCalendarScore",
  "catalystScore",
  "roadmapCatalystProfitScore",
  "exchangeProbabilityScore",
  "liveCatalystEvents",
  "catalystWindow",
  "developerActivityScore",
  "githubProScore",
  "githubVelocityScore",
  "releaseAcceleration",
  "commitQualityScore",
  "github",
  "githubUrl",
  "website",
  "websiteUrl",
  "docsUrl",
  "roadmap",
  "description",
  "githubPushedAt",
  "githubStars",
  "relativeStrengthScore",
  "marketRankScore",
  "preConsensusOpportunityScore",
  "prePumpPatternScore",
  "executionScore",
  "executableTradeSizeUsd",
  "proofOfAlphaExecutionTwinScore",
  "smallCapPurchaseRouteScore",
  "sourceTruthScore",
  "sourceReliabilityScore",
  "opportunityEvidenceCoverage",
  "evidenceConfidence",
  "sniperEvidenceFamilyList",
  "valuationOpportunityScore",
  "smallCapHunterScore",
  "attentionGapScore",
  "contractRiskScore",
  "honeypotRiskScore",
  "manipulationRiskScore",
  "washTradingRiskScore",
  "activityAuthenticityRiskScore",
  "deployerRiskScore",
  "holderConcentrationRiskScore",
  "walletClusterRiskScore",
  "insiderDistributionRisk",
  "liquidityRemovalRiskScore",
  "liquidityControlRisk",
  "liquidityManipulationRisk",
  "identityConfidence",
  "identityResolutionScore",
  "lateChaseRiskScore",
  "alreadyPumpedRiskScore",
  "sourceDisagreementRiskScore",
  "opportunityHardBlockers",
  "hardBlockers",
  "finalBlockingReasons",
  "sniperBlockingReasons",
  "preConsensusHardBlockers",
  "economicIntegrityBlockers",
  "canonicalIdentityHardBlock",
  "honeypotDetected",
  "verifiedScam",
  "scamDetected",
  "deployerSelling",
  "deployerNetFlow",
  "lpRemovalUsd",
  "contractVerified",
  "contractSafetyVerified",
  "instantSafetyStatus",
  "researchOnly",
  "tradableCandidate",
  "missingEvidence",
  "nextVerificationActions",
  "moneyRankDrivers",
  "opportunityWhyNowSignals",
  "entryCondition",
  "invalidationConditions",
  "lateChaseThreshold",
  "maximumAcceptableSlippage",
  "observationTimestamp",
  "discoveredAt",
  "sourceTimestamp",
  "updatedAt",
  "lastUpdatedAt",
  "finalSelectionQualified",
  "finalSelectionState",
  "routeTruthStatus",
  "executionProofState",
  "executionStatus",
  "exactIdentityVerified",
  "buyQuoteVerified",
  "sellQuoteVerified",
  "orderBookDepthVerified",
  "orderBookDepthUsd",
  "estimatedRoundTripSlippagePct",
  "quoteTimestamp",
  "quoteAgeSeconds",
  "purchaseRouteConfirmed",
  "executionRouteAvailable",
  "executionRoute",
  "executionRoutes",
  "purchaseRoute",
  "canonicalExecutionRoute",
  "executionProofRecoveryRoute",
  "executionProofRecoveryRoutes",
  "executionProof",
  "smallCapHunter",
  "proofOfAlphaExecutionTwin",
  "institutionalDataProvenance",
  "prePump",
  "opportunityRankingTier",
  "sniperState",
  "progressiveLane",
];

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function first(values = []) {
  return values.find((value) => value !== undefined && value !== null && value !== "") ?? null;
}

function average(values = []) {
  const active = values.map(num).filter((value) => value > 0);
  if (!active.length) return 0;
  return Math.round(clamp(active.reduce((sum, value) => sum + value, 0) / active.length));
}

function weighted(values = []) {
  let weightedTotal = 0;
  let weightTotal = 0;
  for (const item of values) {
    const value = first([item.score]);
    if (value === null) continue;
    weightedTotal += clamp(value) * num(item.weight || 1);
    weightTotal += num(item.weight || 1);
  }
  return weightTotal ? Math.round(clamp(weightedTotal / weightTotal)) : 0;
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean).map(String))];
}

function money(value) {
  const number = num(value);
  return number > 0 ? Math.round(number) : null;
}

function measuredNumber(value) {
  return value !== undefined && value !== null && value !== "" && Number.isFinite(Number(value))
    ? Number(value)
    : null;
}

function tokenAddress(project = {}) {
  return first([
    project.finalContractAddress,
    project.canonicalAddress,
    project.tokenAddress,
    project.contractAddress,
    project.address,
    project.baseToken?.address,
  ]);
}

function poolAddress(project = {}) {
  return first([project.primaryTradablePool, project.poolAddress, project.pairAddress, project.finalPairAddress]);
}

function chain(project = {}) {
  return first([project.canonicalChain, project.chainId, project.finalChain, project.chain, project.network]);
}

function routeVerified(project = {}) {
  const gate = resolveStrictCandidateGate(project);
  return Boolean(gate.strictRankEligible && isLiveExecutionReady({ ...project, ...gate }));
}

function routeTruth(project = {}, gate = resolveStrictCandidateGate(project)) {
  const subject = { ...project, ...gate };
  return {
    exactRouteIdentityVerified: hasExactRouteIdentity(subject),
    buyQuoteVerified: hasVerifiedBuyQuote(subject),
    sellQuoteVerified: hasVerifiedSellQuote(subject),
    routeDepthVerified: hasVerifiedRouteDepth(subject),
    routeSlippageVerified: hasVerifiedRouteSlippage(subject),
    routeQuoteFresh: routeQuoteFresh(subject),
    liveExecutionReady: Boolean(gate.strictRankEligible && isLiveExecutionReady(subject)),
  };
}

function sourceList(project = {}) {
  return unique([
    project.source,
    project.dex,
    project.exchange,
    ...array(project.sources),
    ...array(project.discoverySources),
    ...array(project.evidenceSources),
    ...array(project.evidence).map((item) => item.source || item.engine),
    ...(project.institutionalDataProvenance?.sourceSummary?.sources || []),
  ]);
}

function independentEvidenceFamilies(project = {}) {
  return unique([
    ...sourceFamiliesForProject(project),
    ...array(project.sniperEvidenceFamilyList).map((item) => item.family || item.name),
    ...(project.sourceTruthScore >= 60 ? ["source-truth"] : []),
    ...(project.githubProScore >= 60 ? ["developer-activity"] : []),
    ...(project.organicBuyerScore >= 60 ? ["buyer-activity"] : []),
    ...(project.smartWalletArrivalScore >= 60 ? ["wallet-activity"] : []),
  ]);
}

function dexLiquidity(project = {}) {
  return money(first([
    project.dexLiquidityUsd,
    project.liquidityUsd,
    project.finalLiquidityUsd,
    project.activeLiquidityUsd,
    project.marketData?.liquidityUsd,
    project.proofOfAlphaExecutionTwin?.quote?.liquidityUsd,
    project.smallCapHunter?.execution?.liquidityUsd,
  ]));
}

function stableExitLiquidity(project = {}) {
  return money(first([
    project.stableExitLiquidityUsd,
    project.hardExitLiquidityUsd,
    project.exitLiquidityUsd,
    project.marketData?.stableExitLiquidityUsd,
  ]));
}

function componentScores(project = {}) {
  return {
    earlyAcceleration: weighted([
      { score: project.earlyAccelerationScore ?? project.accelerationScore, weight: 1.2 },
      { score: project.preBreakoutMomentumScore, weight: 1.0 },
      { score: project.momentumShiftScore, weight: 1.0 },
      { score: project.velocityScore, weight: 0.8 },
      { score: project.projectChangeScore, weight: 0.7 },
    ]),
    liquidityFormation: weighted([
      { score: project.liquidityFormationScore, weight: 1.2 },
      { score: project.liquidityExpansionScore, weight: 1.1 },
      { score: project.activeLiquidityTruthScore, weight: 1.0 },
      { score: dexLiquidity(project) ? Math.min(95, Math.log10(dexLiquidity(project)) * 18) : 0, weight: 0.9 },
      { score: project.liquidityPersistenceScore, weight: 0.8 },
    ]),
    organicBuyerQuality: weighted([
      { score: project.organicBuyerScore, weight: 1.1 },
      { score: project.buyerRetentionScore, weight: 1.0 },
      { score: project.buyPressureScore, weight: 0.9 },
      { score: project.unrelatedBuyerClusters, weight: 0.9 },
      { score: project.independentBuyers24h ? Math.min(92, Math.log10(num(project.independentBuyers24h) + 1) * 32) : 0, weight: 0.8 },
    ]),
    smartWalletArrival: weighted([
      { score: project.smartWalletArrivalScore, weight: 1.2 },
      { score: project.smartWalletPerformanceScore, weight: 1.0 },
      { score: project.smartMoneyAccumulationScore, weight: 1.0 },
      { score: project.smartWalletDiversityScore, weight: 0.8 },
      { score: project.unrelatedSmartWalletCount ? Math.min(90, Math.log10(num(project.unrelatedSmartWalletCount) + 1) * 44) : 0, weight: 0.7 },
    ]),
    verifiedCatalystStrength: weighted([
      { score: project.liveCatalystRadarScore, weight: 1.1 },
      { score: project.catalystCalendarScore, weight: 1.0 },
      { score: project.catalystScore, weight: 0.9 },
      { score: project.roadmapCatalystProfitScore, weight: 0.9 },
      { score: project.exchangeProbabilityScore, weight: 0.5 },
    ]),
    developerAcceleration: weighted([
      { score: project.developerActivityScore, weight: 1.1 },
      { score: project.githubProScore, weight: 1.0 },
      { score: project.githubVelocityScore, weight: 0.9 },
      { score: project.releaseAcceleration, weight: 0.7 },
      { score: project.commitQualityScore, weight: 0.7 },
    ]),
    relativeMarketStrength: weighted([
      { score: project.relativeStrengthScore, weight: 1.0 },
      { score: project.marketRankScore, weight: 0.8 },
      { score: project.preConsensusOpportunityScore, weight: 0.8 },
      { score: project.prePumpPatternScore, weight: 0.7 },
      { score: project.priceChange24h > 0 && project.priceChange24h <= 120 ? 55 + Math.min(30, project.priceChange24h / 4) : 0, weight: 0.5 },
    ]),
    executionQuality: weighted([
      { score: project.executionScore, weight: 1.2 },
      { score: routeVerified(project) ? 90 : 0, weight: 1.0 },
      { score: project.executableTradeSizeUsd >= 100 ? 82 : project.executableTradeSizeUsd >= 25 ? 58 : 0, weight: 0.7 },
      { score: project.proofOfAlphaExecutionTwinScore, weight: 0.8 },
      { score: project.smallCapPurchaseRouteScore ?? project.smallCapHunter?.purchaseRoute?.score, weight: 0.6 },
    ]),
    independentEvidenceQuality: weighted([
      { score: Math.min(95, independentEvidenceFamilies(project).length * 18), weight: 1.0 },
      { score: project.sourceTruthScore, weight: 1.0 },
      { score: project.sourceReliabilityScore, weight: 0.8 },
      { score: project.opportunityEvidenceCoverage, weight: 0.8 },
      { score: project.evidenceConfidence, weight: 0.7 },
    ]),
    valuationOpportunity: weighted([
      { score: project.valuationOpportunityScore, weight: 1.0 },
      { score: project.smallCapHunterScore, weight: 0.8 },
      { score: project.circulatingMarketCapUsd || project.marketCap ? marketCapOpportunity(project) : 0, weight: 0.7 },
      { score: project.attentionGapScore, weight: 0.7 },
    ]),
  };
}

function marketCapOpportunity(project = {}) {
  const cap = num(first([project.circulatingMarketCapUsd, project.marketCap, project.estimatedMarketCapUsd]));
  if (cap <= 0) return 0;
  if (cap <= 2_000_000) return 92;
  if (cap <= 10_000_000) return 82;
  if (cap <= 50_000_000) return 68;
  if (cap <= 250_000_000) return 50;
  return 28;
}

function contributionTrace(components = {}, weights = BREAKOUT_WEIGHTS) {
  return weights.map(([component, weightPct]) => {
    const componentScore = clamp(components[component]);
    return {
      component,
      weightPct,
      componentScore,
      contribution: Number(((componentScore * weightPct) / 100).toFixed(2)),
    };
  });
}

function scoreFromTrace(trace = []) {
  return Number(trace.reduce((sum, item) => sum + num(item.contribution), 0).toFixed(2));
}

function executionReadinessTrace(project = {}, gate = resolveStrictCandidateGate(project)) {
  const truth = routeTruth(project, gate);
  const deterministicBlocks = deterministicHardBlocks(project);
  const safetyPass = deterministicBlocks.length === 0 &&
    (project.instantSafetyStatus === "PASS" || project.contractVerified || project.contractSafetyVerified);
  const liquidityUsd = Math.max(num(dexLiquidity(project)), num(stableExitLiquidity(project)), num(gate.routeDepthUsd));
  const components = {
    exactRouteIdentity: truth.exactRouteIdentityVerified && gate.strictIdentityVerified ? 100 : 0,
    verifiedContract: tokenAddress(project) ? 100 : 0,
    verifiedSafety: safetyPass ? 100 : 0,
    verifiedLiquidityDepth: truth.routeDepthVerified && liquidityUsd > 0 ? 100 : liquidityUsd > 0 ? 55 : 0,
    freshBuyQuote: truth.buyQuoteVerified ? 100 : 0,
    freshSellQuote: truth.sellQuoteVerified ? 100 : 0,
    verifiedSlippage: truth.routeSlippageVerified ? 100 : 0,
    routeFreshness: truth.routeQuoteFresh ? 100 : 0,
  };
  return contributionTrace(components, EXECUTION_READINESS_WEIGHTS);
}

function identityUncertaintyRisk(project = {}, gate = resolveStrictCandidateGate(project)) {
  if (project.canonicalIdentityHardBlock) return 100;
  if (array(project.identityConflicts).length || array(project.canonicalIdentityConflicts).length) return 90;
  const explicit = measuredNumber(first([project.identityConfidence, project.identityResolutionScore]));
  if (explicit !== null) return 100 - clamp(explicit);
  if (gate.strictIdentityVerified || (chain(project) && tokenAddress(project))) return null;
  return null;
}

function riskPenalties(project = {}, options = {}) {
  const gate = options.gate || resolveStrictCandidateGate(project);
  const penalties = [];
  const add = (label, score, maxPenalty, reason) => {
    if (score === null || score === undefined || score === "") return;
    const value = clamp(score);
    if (value < 45) return;
    penalties.push({
      label,
      riskScore: Math.round(value),
      penalty: Number(((value / 100) * maxPenalty).toFixed(2)),
      reason,
    });
  };

  add("Contract risk", project.contractRiskScore ?? project.honeypotRiskScore, 18, "Contract, honeypot, tax, or unsafe control risk.");
  add("Manipulation risk", project.manipulationRiskScore ?? project.washTradingRiskScore ?? project.activityAuthenticityRiskScore, 16, "Activity may be inorganic or wash-driven.");
  add("Deployer risk", project.deployerRiskScore, 14, "Deployer history or active deployer flow is unfavorable.");
  add("Holder concentration risk", project.holderConcentrationRiskScore ?? project.walletClusterRiskScore ?? project.insiderDistributionRisk, 14, "Holder or wallet cluster concentration is elevated.");
  add("Liquidity-removal risk", project.liquidityRemovalRiskScore ?? project.liquidityControlRisk ?? project.liquidityManipulationRisk, 16, "Liquidity may be removable, thin, or manipulated.");
  add("Identity uncertainty", identityUncertaintyRisk(project, gate), 12, "Identity evidence is weak or conflicting.");
  if (options.includeMissingCriticalEvidence !== false) {
    add("Missing critical evidence", 100 - evidenceCompleteness(project), 10, "Critical proof is incomplete.");
  }
  add("Late chase risk", project.lateChaseRiskScore ?? (project.prePump?.status === "LATE_CHASE" ? 85 : 0), 14, "Move may be too mature for early-breakout ranking.");
  add("Already-pumped risk", project.alreadyPumpedRiskScore ?? (project.prePump?.status === "ALREADY_PUMPED" ? 92 : 0), 20, "Price has already expanded beyond the early setup.");
  add("Source disagreement", project.sourceDisagreementRiskScore ?? project.institutionalDataProvenance?.components?.contradictionRisk, 12, "Sources disagree or evidence contradicts itself.");

  return penalties;
}

function importedBlockers(project = {}) {
  return unique([
    ...array(project.opportunityHardBlockers),
    ...array(project.hardBlockers),
    ...array(project.finalBlockingReasons),
    ...array(project.sniperBlockingReasons),
    ...array(project.preConsensusHardBlockers),
    ...array(project.economicIntegrityBlockers),
  ]);
}

function deterministicBlocker(reason = "") {
  const text = String(reason);
  if (NON_DETERMINISTIC_BLOCK_PATTERNS.some((pattern) => pattern.test(text)) &&
      !DETERMINISTIC_BLOCK_PATTERNS.some((pattern) => pattern.test(text))) {
    return false;
  }
  return DETERMINISTIC_BLOCK_PATTERNS.some((pattern) => pattern.test(text));
}

function deterministicHardBlocks(project = {}) {
  return unique([
    ...importedBlockers(project).filter(deterministicBlocker),
    ...(project.canonicalIdentityHardBlock ? ["Canonical identity conflict."] : []),
    ...(project.honeypotDetected || project.verifiedScam || project.scamDetected ? ["Verified scam, honeypot, or rug-risk evidence."] : []),
    ...(project.deployerSelling === true || num(project.deployerNetFlow) < -10_000 ? ["Deployer selling into demand."] : []),
    ...(num(project.liquidityRemovalRiskScore) >= 80 || num(project.lpRemovalUsd) > 0 ? ["Liquidity removal risk is active."] : []),
    ...(num(project.contractRiskScore ?? project.honeypotRiskScore) >= 90 ? ["Severe contract or honeypot risk."] : []),
    ...(num(project.manipulationRiskScore ?? project.washTradingRiskScore) >= 90 ? ["Severe wash-trading or manipulation risk."] : []),
  ]);
}

function nonDeterministicBlockWarnings(project = {}) {
  const deterministic = new Set(deterministicHardBlocks(project));
  return importedBlockers(project).filter((blocker) => !deterministic.has(blocker));
}

function evidenceCompleteness(project = {}) {
  const checks = [
    Boolean(chain(project)),
    Boolean(tokenAddress(project)),
    Boolean(poolAddress(project)),
    num(first([project.priceUsd, project.price])) > 0,
    num(dexLiquidity(project)) > 0,
    routeVerified(project),
    independentEvidenceFamilies(project).length >= 2,
    Boolean(project.instantSafetyStatus === "PASS" || project.contractVerified || project.contractSafetyVerified),
    num(project.sourceTruthScore || project.sourceReliabilityScore) >= 50,
    num(project.organicBuyerScore || project.buyPressureScore || project.buyerRetentionScore) >= 50,
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

function researchEvidenceCompleteness(project = {}, components = componentScores(project), families = independentEvidenceFamilies(project)) {
  const sources = sourceList(project);
  const checks = [
    Boolean(project.name || project.canonicalName || project.symbol || project.canonicalSymbol),
    Boolean(chain(project) || project.targetChain || project.declaredChain || project.expectedChain),
    sources.length > 0,
    families.length >= 1 || sources.length >= 2,
    components.earlyAcceleration > 0 || components.relativeMarketStrength > 0 || components.verifiedCatalystStrength > 0,
    components.liquidityFormation > 0 || components.developerAcceleration > 0 || project.researchOnly || project.tradableCandidate === false,
    components.organicBuyerQuality > 0 || components.smartWalletArrival > 0 || components.developerAcceleration > 0,
    components.verifiedCatalystStrength > 0 || components.developerAcceleration > 0 || components.independentEvidenceQuality > 0,
    deterministicHardBlocks(project).length === 0,
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

function prelaunchCandidate(project = {}) {
  const lifecycle = String(first([
    project.lifecycleStage,
    project.projectLifecycleStage,
    project.launchStatus,
    project.stage,
  ]) || "").toUpperCase();
  const sources = sourceList(project).map((source) => String(source).toLowerCase());
  return Boolean(
    project.researchOnly === true ||
    project.tradableCandidate === false ||
    /PRELAUNCH|PRE_LAUNCH|COMING_SOON|TGE_PENDING|TESTNET|MAINNET_PENDING/.test(lifecycle) ||
    (!tokenAddress(project) &&
      (project.github || project.githubUrl || project.website || project.websiteUrl || project.docsUrl || project.roadmap ||
        sources.some((source) => /github|google|news|official|roadmap|docs/.test(source))))
  );
}

function missingEvidence(project = {}) {
  const missing = [];
  if (!chain(project)) missing.push("Verified chain is missing.");
  if (!tokenAddress(project)) missing.push("Verified token contract address is missing.");
  if (!poolAddress(project)) missing.push("Primary tradable pool is missing.");
  if (!routeVerified(project)) missing.push("Verified fresh buy/sell execution route is missing.");
  if (!dexLiquidity(project)) missing.push("DEX liquidity or stable exit liquidity is missing.");
  if (independentEvidenceFamilies(project).length < 2) missing.push("Needs at least two independent evidence families.");
  if (!(project.instantSafetyStatus === "PASS" || project.contractVerified || project.contractSafetyVerified)) {
    missing.push("Contract safety evidence is unknown, not safe.");
  }
  if (project.researchOnly || project.tradableCandidate === false) {
    missing.push("Research-only source must be resolved to a tradable token identity.");
  }
  if (prelaunchCandidate(project)) {
    missing.push("Prelaunch research requires token launch, contract, pool, and execution proof before tradable ranking.");
  }
  return unique([...missing, ...array(project.missingEvidence), ...array(project.nextVerificationActions)]).slice(0, 12);
}

function confidence(score = 0, completeness = 0, familyCount = 0, blockers = []) {
  if (blockers.length) return "Blocked";
  const blended = score * 0.48 + completeness * 0.34 + Math.min(100, familyCount * 20) * 0.18;
  if (blended >= 78) return "High";
  if (blended >= 62) return "Medium";
  if (blended >= 45) return "Developing";
  return "Low";
}

function breakoutStage(project = {}, score = 0) {
  if (project.opportunityRankingTier === "SNIPER_READY" || project.sniperState === "ARMED") return "EXECUTION_READY_RESEARCH";
  if (project.progressiveLane === "BEST_AVAILABLE") return "BEST_AVAILABLE_RESEARCH";
  if (score >= 75) return "BREAKOUT_FINALIST";
  if (score >= 62) return "CONDITIONAL_WATCH";
  return "RESEARCH_ONLY";
}

function reasons(project = {}, components = {}) {
  return [
    ...(project.moneyRankDrivers || []),
    ...array(project.opportunityWhyNowSignals).map((signal) => `${signal.label}: ${signal.score}`),
    ...Object.entries(components)
      .filter(([, score]) => num(score) >= 65)
      .sort((a, b) => num(b[1]) - num(a[1]))
      .map(([component, score]) => `${component}: ${Math.round(score)}`),
  ].slice(0, 8);
}

function candidateRecord(project = {}, rank = null) {
  const gate = resolveStrictCandidateGate(project);
  const components = componentScores(project);
  const legacyTrace = contributionTrace(components);
  const researchTrace = contributionTrace(components, RESEARCH_OPPORTUNITY_WEIGHTS);
  const executionTrace = executionReadinessTrace(project, gate);
  const rawScore = scoreFromTrace(legacyTrace);
  const rawResearchScore = scoreFromTrace(researchTrace);
  const rawExecutionScore = scoreFromTrace(executionTrace);
  const penalties = riskPenalties(project, { gate });
  const researchPenalties = riskPenalties(project, { gate, includeMissingCriticalEvidence: false });
  const totalPenalty = Number(penalties.reduce((sum, item) => sum + item.penalty, 0).toFixed(2));
  const researchPenalty = Number(researchPenalties.reduce((sum, item) => sum + item.penalty, 0).toFixed(2));
  const legacyReadinessScore = Math.round(clamp(rawScore - totalPenalty));
  const researchOpportunityScore = Math.round(clamp(rawResearchScore - researchPenalty));
  const executionReadinessScore = Math.round(clamp(rawExecutionScore - totalPenalty));
  const route = routeTruth(project, gate);
  const blockers = deterministicHardBlocks(project);
  const warningBlocks = nonDeterministicBlockWarnings(project);
  const missing = missingEvidence(project);
  const completeness = evidenceCompleteness(project);
  const families = independentEvidenceFamilies(project);
  const researchCompleteness = researchEvidenceCompleteness(project, components, families);
  const qualified =
    blockers.length === 0 &&
    executionReadinessScore >= 70 &&
    researchOpportunityScore >= 55 &&
    completeness >= 60 &&
    families.length >= 2 &&
    Boolean(tokenAddress(project)) &&
    Boolean(poolAddress(project)) &&
    Boolean(chain(project)) &&
    Boolean(dexLiquidity(project)) &&
    gate.strictRankEligible &&
    route.liveExecutionReady;
  const isPrelaunch = prelaunchCandidate(project);

  return {
    rank,
    projectId: project.canonicalProjectId || project.projectId || project.permanentProjectKey || null,
    projectName: project.name || project.canonicalName || "Unknown",
    symbol: project.symbol || project.canonicalSymbol || "UNKNOWN",
    chain: chain(project) || null,
    canonicalId: gate.canonicalId,
    canonicalChainId: gate.canonicalChainId,
    tokenName: gate.tokenName || project.name || project.canonicalName || "Unknown",
    contractAddress: gate.contractAddress,
    pairAddress: gate.pairAddress,
    dexName: gate.dexName,
    routeVerificationStatus: gate.routeVerificationStatus,
    routeTruth: route,
    buyQuoteVerified: route.buyQuoteVerified,
    sellQuoteVerified: route.sellQuoteVerified,
    routeDepthVerified: route.routeDepthVerified,
    routeSlippageVerified: route.routeSlippageVerified,
    routeQuoteFresh: route.routeQuoteFresh,
    liveExecutionReady: route.liveExecutionReady,
    strictIdentityVerified: gate.strictIdentityVerified,
    strictRouteVerified: gate.strictRouteVerified,
    strictRankEligible: gate.strictRankEligible,
    candidateQuarantineReason: gate.candidateQuarantineReason,
    candidateQuarantineReasons: gate.candidateQuarantineReasons,
    verifiedContractAddress: tokenAddress(project) || null,
    primaryTradablePool: poolAddress(project) || null,
    currentPrice: first([project.priceUsd, project.price]) ?? null,
    dexLiquidity: dexLiquidity(project),
    stableExitLiquidity: stableExitLiquidity(project),
    marketCap: money(first([project.circulatingMarketCapUsd, project.marketCap, project.estimatedMarketCapUsd])),
    fdv: money(first([project.fullyDilutedValueUsd, project.fdv, project.fullyDilutedValue])),
    poolAge: first([project.poolAge, project.poolAgeHours, project.pairCreatedAt, project.poolCreatedAt]) ?? null,
    breakoutStage: isPrelaunch ? "PRELAUNCH_RESEARCH" : breakoutStage(project, researchOpportunityScore),
    breakoutReadinessScore: researchOpportunityScore,
    legacyBreakoutReadinessScore: legacyReadinessScore,
    researchOpportunityScore,
    executionReadinessScore,
    confidence: confidence(researchOpportunityScore, researchCompleteness, families.length, blockers),
    evidenceCompleteness: completeness,
    researchEvidenceCompleteness: researchCompleteness,
    independentEvidenceFamilies: families,
    qualified,
    qualificationState: blockers.length
      ? "BLOCKED"
      : gate.marketBenchmarkLane === "MARKET_BENCHMARK"
        ? "MARKET_BENCHMARK"
        : isPrelaunch
          ? "PRELAUNCH_RESEARCH"
        : !gate.strictRankEligible
          ? "QUARANTINED_IDENTITY_OR_ROUTE"
          : qualified
            ? "QUALIFIED"
            : researchOpportunityScore >= 55
              ? "CONDITIONAL_WATCH"
              : "RESEARCH_ONLY",
    scoreContributionTrace: legacyTrace,
    researchScoreContributionTrace: researchTrace,
    legacyScoreContributionTrace: legacyTrace,
    executionScoreContributionTrace: executionTrace,
    rawScore,
    rawResearchScore,
    rawExecutionScore,
    penalties,
    researchPenalties,
    totalPenalty,
    researchPenalty,
    whyItMayBreakOut: reasons(project, components),
    recentAcceleration: {
      score: components.earlyAcceleration,
      priceChange24h: project.priceChange24h ?? null,
      liquidityGrowthPct24h: project.liquidityGrowthPct24h ?? project.liquidityGrowthRate ?? null,
      volumeChange24hPct: project.volumeChange24hPct ?? null,
    },
    buyerQualityEvidence: {
      score: components.organicBuyerQuality,
      uniqueBuyers24h: project.uniqueBuyers24h ?? null,
      independentBuyers24h: project.independentBuyers24h ?? null,
      sameFunderBuyers24h: project.sameFunderBuyers24h ?? null,
      buyerRetentionScore: project.buyerRetentionScore ?? null,
    },
    smartWalletEvidence: {
      score: components.smartWalletArrival,
      unrelatedSmartWalletCount: project.unrelatedSmartWalletCount ?? null,
      smartWalletArrivalScore: project.smartWalletArrivalScore ?? null,
      smartWalletPerformanceScore: project.smartWalletPerformanceScore ?? null,
    },
    catalystEvidence: {
      score: components.verifiedCatalystStrength,
      catalystWindow: project.catalystWindow || "No verified near-term catalyst.",
      liveCatalystEvents: array(project.liveCatalystEvents).slice(0, 3),
    },
    developerEvidence: {
      score: components.developerAcceleration,
      github: project.github || project.githubUrl || null,
      githubPushedAt: project.githubPushedAt || null,
      githubStars: project.githubStars ?? null,
    },
    contractAndHolderRisk: {
      contractRiskScore: project.contractRiskScore ?? null,
      honeypotRiskScore: project.honeypotRiskScore ?? null,
      holderConcentrationRiskScore: project.holderConcentrationRiskScore ?? null,
      instantSafetyStatus: project.instantSafetyStatus || "UNKNOWN",
    },
    manipulationRisk: {
      washTradingRiskScore: project.washTradingRiskScore ?? null,
      walletClusterRiskScore: project.walletClusterRiskScore ?? null,
      liquidityManipulationRisk: project.liquidityManipulationRisk ?? null,
      activityAuthenticityRiskScore: project.activityAuthenticityRiskScore ?? null,
    },
    entryCondition: project.entryCondition || "Research only. Require fresh route, liquidity, safety, and invalidation checks before any decision.",
    invalidationCondition:
      array(project.invalidationConditions)[0] ||
      "Invalidate if identity, route, liquidity, organic buyer, or safety evidence deteriorates.",
    lateChaseThreshold: project.lateChaseThreshold || "Do not chase if price expansion outruns liquidity and buyer-quality confirmation.",
    maximumAcceptableSlippage: project.maximumAcceptableSlippage || (project.executableTradeSizeUsd >= 100 ? "Under 5% on a fresh route quote" : "Unknown until live route quote"),
    missingEvidence: gate.strictRankEligible
      ? missing
      : [...new Set([...(gate.candidateQuarantineReasons || []).map((reason) => `Strict identity/route proof missing: ${reason}.`), ...missing])],
    hardBlocks: blockers,
    nonDeterministicBlockWarnings: warningBlocks,
    prelaunchResearch: isPrelaunch,
    sourceList: sourceList(project),
    observationTimestamps: {
      observationTimestamp: project.observationTimestamp || project.discoveredAt || null,
      sourceTimestamp: project.sourceTimestamp || project.updatedAt || project.lastUpdatedAt || null,
    },
    disclaimer: "Research signal only. Not financial advice, not a profit promise.",
  };
}

function rankRecords(records = []) {
  return [...records].sort(
    (a, b) =>
      num(b.researchOpportunityScore) - num(a.researchOpportunityScore) ||
      num(b.researchEvidenceCompleteness) - num(a.researchEvidenceCompleteness) ||
      num(b.dexLiquidity) - num(a.dexLiquidity)
  );
}

function rankExecutableRecords(records = []) {
  return [...records].sort(
    (a, b) =>
      num(b.executionReadinessScore) - num(a.executionReadinessScore) ||
      num(b.researchOpportunityScore) - num(a.researchOpportunityScore) ||
      num(b.evidenceCompleteness) - num(a.evidenceCompleteness) ||
      num(b.dexLiquidity) - num(a.dexLiquidity)
  );
}

function hasOnlyRouteQuarantine(record = {}) {
  const reasons = array(record.candidateQuarantineReasons);
  return reasons.length > 0 && reasons.every((reason) => ROUTE_ONLY_REASONS.has(reason));
}

function hasIdentityQuarantine(record = {}) {
  return array(record.candidateQuarantineReasons).some((reason) => IDENTITY_ROUTE_REASONS.has(reason));
}

function researchEligible(record = {}) {
  if (record.qualificationState === "BLOCKED" || record.qualificationState === "MARKET_BENCHMARK") return false;
  if (record.prelaunchResearch) return false;
  if (record.hardBlocks?.length) return false;
  if (hasIdentityQuarantine(record)) return false;
  if (!record.chain || !record.verifiedContractAddress) return false;
  if (record.researchOpportunityScore < 45 && record.researchEvidenceCompleteness < 40) return false;
  return true;
}

function prelaunchEligible(record = {}) {
  if (!record.prelaunchResearch) return false;
  if (record.qualificationState === "BLOCKED" || record.qualificationState === "MARKET_BENCHMARK") return false;
  if (record.hardBlocks?.length) return false;
  if (record.verifiedContractAddress && record.primaryTradablePool) return false;
  if (record.researchOpportunityScore < 35 && record.researchEvidenceCompleteness < 45) return false;
  return true;
}

function countWhere(records = [], predicate = () => false) {
  return records.filter(predicate).length;
}

function reasonFrequency(records = []) {
  const counts = new Map();
  const add = (reason) => {
    if (!reason) return;
    const normalized = String(reason);
    counts.set(normalized, (counts.get(normalized) || 0) + 1);
  };
  for (const record of records) {
    array(record.candidateQuarantineReasons).forEach(add);
    array(record.hardBlocks).forEach(add);
    array(record.missingEvidence).forEach(add);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 25)
    .map(([reason, count]) => ({ reason, count }));
}

function buildFailureWaterfall(records = [], qualified = []) {
  const passedIdentity = (record = {}) =>
    Boolean(record.strictIdentityVerified || (record.chain && record.verifiedContractAddress && !hasIdentityQuarantine(record)));
  const passedPoolOrMarket = (record = {}) =>
    passedIdentity(record) &&
    Boolean(record.primaryTradablePool || record.dexName || record.routeTruth?.exactRouteIdentityVerified === true);
  const passedLiquidity = (record = {}) =>
    passedPoolOrMarket(record) &&
    (num(record.dexLiquidity) > 0 || num(record.stableExitLiquidity) > 0) &&
    record.routeTruth?.routeDepthVerified === true;
  const passedSafety = (record = {}) =>
    passedLiquidity(record) &&
    !record.hardBlocks?.length &&
    !array(record.missingEvidence).some((item) => /safety|honeypot|scam|rug/i.test(String(item)));
  const passedBuy = (record = {}) => passedSafety(record) && record.buyQuoteVerified === true;
  const passedSell = (record = {}) => passedBuy(record) && record.sellQuoteVerified === true;
  const passedEvidence = (record = {}) =>
    passedSell(record) && record.evidenceCompleteness >= 60 && record.independentEvidenceFamilies.length >= 2;
  const passedReadiness = (record = {}) => passedEvidence(record) && record.executionReadinessScore >= 70;

  return {
    projectsAnalyzed: records.length,
    passedIdentity: countWhere(records, passedIdentity),
    passedPoolOrMarketIdentity: countWhere(records, passedPoolOrMarket),
    passedActiveLiquidity: countWhere(records, passedLiquidity),
    passedContractSafety: countWhere(records, passedSafety),
    passedBuyRouteVerification: countWhere(records, passedBuy),
    passedSellRouteVerification: countWhere(records, passedSell),
    passedEvidenceCompleteness: countWhere(records, passedEvidence),
    readinessScoreAtLeast70: countWhere(records, passedReadiness),
    fullyExecutableTop10: qualified.length,
    topRejectionReasons: reasonFrequency(records),
  };
}

function emptySlots(count = 0, reason = "") {
  return Array.from({ length: Math.max(0, count) }, (_, index) => ({
    slot: index + 1,
    status: "EMPTY",
    reason,
  }));
}

function buildStageSummary(projects = [], finalists = [], qualified = [], conditional = [], blocked = [], research = []) {
  return {
    discoveryUniverseObserved: projects.length,
    targetCapacityIsNotCoverage: true,
    fastTriageReviewed: projects.length,
    standardAnalysisCandidates: projects.length,
    deepResearchFinalists: finalists.length,
    breakoutFinalists: finalists.length,
    qualifiedTop10Picks: qualified.length,
    researchOpportunityCandidates: research.length,
    conditionalWatchCandidates: conditional.length,
    blockedFinalists: blocked.length,
    note: "Counts report actual observed candidates passed into the Top 10 funnel, not configured target capacity.",
  };
}

function copyCandidateInputProject(project = {}) {
  const copy = {};
  for (const field of TOP10_CANDIDATE_INPUT_FIELDS) {
    const value = project[field];
    if (value !== undefined) copy[field] = value;
  }
  return copy;
}

export function buildTop10CandidateInput(projects = [], meta = {}) {
  const safeProjects = Array.isArray(projects) ? projects : [];
  return {
    generatedAt: new Date().toISOString(),
    schemaVersion: "top10-candidate-input-v1",
    source: "full-fidelity-analyzed-projects",
    description:
      "Curated project records preserving every field consumed by the Top 10 breakout scanner before generic report compaction.",
    meta,
    projectCount: safeProjects.length,
    fieldsPreserved: TOP10_CANDIDATE_INPUT_FIELDS,
    projects: safeProjects.map(copyCandidateInputProject),
  };
}

export function buildTop10BreakoutReport(projects = [], meta = {}) {
  const normalized = attachCanonicalIdentityBatch(normalizeMetricTruthBatch(projects));
  const records = normalized.map((project) => candidateRecord(project));
  const ranked = rankRecords(records);
  const executableRanked = rankExecutableRecords(records);
  const finalists = ranked.slice(0, 25);
  const qualified = executableRanked.filter((record) => record.qualified).slice(0, 10);
  const researchOpportunities = ranked
    .filter(researchEligible)
    .slice(0, 10)
    .map((record, index) => ({
      ...record,
      opportunityRank: index + 1,
      researchStatus: record.qualified
        ? "EXECUTABLE_RESEARCH_READY"
        : hasOnlyRouteQuarantine(record)
          ? "RESEARCH_WORTHY_ROUTE_PENDING"
          : "RESEARCH_WORTHY_PROOF_PENDING",
      executionReady: record.qualified,
    }));
  const prelaunchResearchCandidates = ranked
    .filter(prelaunchEligible)
    .slice(0, 10)
    .map((record, index) => ({
      ...record,
      prelaunchRank: index + 1,
      researchStatus: "PRELAUNCH_RESEARCH",
      executionReady: false,
      missingEvidence: unique([
        ...array(record.missingEvidence),
        "Prelaunch candidate is not tradable until token contract, pool, safety, and route proof exist.",
      ]),
    }));
  const conditional = finalists
    .filter((record) => !record.qualified && record.qualificationState === "CONDITIONAL_WATCH")
    .slice(0, 25);
  const blocked = finalists.filter((record) => record.qualificationState === "BLOCKED");
  const rankedQualified = qualified.map((record, index) => ({ ...record, rank: index + 1 }));
  const empty = emptySlots(
    10 - rankedQualified.length,
    rankedQualified.length
      ? "Remaining finalists lacked verified route, contract, liquidity, evidence completeness, or safety requirements."
      : "No finalist passed all Top 10 qualification requirements."
  );

  return {
    generatedAt: new Date().toISOString(),
    status: rankedQualified.length
      ? "PASS_WITH_EXECUTABLE_BUYS"
      : researchOpportunities.length
        ? "PASS_WITH_RESEARCH_OPPORTUNITIES"
        : records.length
          ? "PASS_NO_QUALIFIED_RESULTS"
          : "NO_PROJECTS",
    mode: "PRIVATE_EVIDENCE_DRIVEN_TOP_10_BREAKOUT_FUNNEL",
    meta,
    stageSummary: {
      ...buildStageSummary(projects, finalists, rankedQualified, conditional, blocked, researchOpportunities),
      prelaunchResearchCandidates: prelaunchResearchCandidates.length,
    },
    failureWaterfall: buildFailureWaterfall(records, rankedQualified),
    scoringDesign: {
      weights: Object.fromEntries(BREAKOUT_WEIGHTS.map(([name, weight]) => [name, weight])),
      researchOpportunityWeights: Object.fromEntries(RESEARCH_OPPORTUNITY_WEIGHTS.map(([name, weight]) => [name, weight])),
      executionReadinessWeights: Object.fromEntries(EXECUTION_READINESS_WEIGHTS.map(([name, weight]) => [name, weight])),
      penalties: [
        "contract risk",
        "manipulation risk",
        "deployer risk",
        "holder concentration risk",
        "liquidity-removal risk",
        "identity uncertainty",
        "missing critical evidence",
        "late-chase risk",
        "already-pumped risk",
        "source disagreement",
      ],
      noDoubleCounting: "Source confidence uses unique evidence families, so repeated DexScreener, CoinGecko, news, or AI-derived copies cannot multiply independent confirmation.",
    },
    top10ResearchOpportunities: researchOpportunities,
    prelaunchResearchCandidates,
    researchOpportunitySlots: [
      ...researchOpportunities,
      ...emptySlots(
        10 - researchOpportunities.length,
        researchOpportunities.length
          ? "Remaining research slots require stronger identity, safety, or evidence coverage."
          : "No research candidate passed minimum identity and evidence gates."
      ),
    ],
    qualifiedExecutableBuys: rankedQualified,
    qualifiedPicks: rankedQualified,
    top10Slots: [...rankedQualified, ...empty],
    conditionalWatchCandidates: conditional,
    excludedFinalists: finalists
      .filter((record) => !record.qualified)
      .map((record) => ({
        projectName: record.projectName,
        symbol: record.symbol,
        chain: record.chain,
        breakoutReadinessScore: record.breakoutReadinessScore,
        researchOpportunityScore: record.researchOpportunityScore,
        executionReadinessScore: record.executionReadinessScore,
        qualificationState: record.qualificationState,
        hardBlocks: record.hardBlocks,
        nonDeterministicBlockWarnings: record.nonDeterministicBlockWarnings,
        missingEvidence: record.missingEvidence,
      })),
    bestOpportunityNow:
      rankedQualified[0] && rankedQualified[0].breakoutReadinessScore >= 75
        ? rankedQualified[0]
        : null,
    bestResearchOpportunityNow: researchOpportunities[0] || null,
    emptySlots: empty,
    disclaimer: "Research signal only. Scores are not financial advice, not a buy recommendation, and not a profit guarantee.",
  };
}

function writeJson(filePath = "", value = {}) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function csvEscape(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function csvFor(records = []) {
  const headers = [
    "rank",
    "projectName",
    "symbol",
    "chain",
    "verifiedContractAddress",
    "primaryTradablePool",
    "breakoutReadinessScore",
    "confidence",
    "evidenceCompleteness",
    "qualificationState",
    "dexLiquidity",
    "stableExitLiquidity",
    "marketCap",
    "fdv",
  ];
  return [
    headers.join(","),
    ...records.map((record) => headers.map((header) => csvEscape(record[header])).join(",")),
  ].join("\n");
}

function htmlFor(report = {}) {
  const researchRows = (report.researchOpportunitySlots || [])
    .map((record) => {
      if (record.status === "EMPTY") {
        return `<tr><td>${record.slot}</td><td colspan="8">${record.reason}</td></tr>`;
      }
      return `<tr><td>${record.opportunityRank}</td><td>${record.projectName}</td><td>${record.symbol}</td><td>${record.chain || ""}</td><td>${record.breakoutReadinessScore}</td><td>${record.confidence}</td><td>${record.researchStatus}</td><td>${record.executionReady ? "yes" : "no"}</td><td>${record.missingEvidence.slice(0, 2).join("; ")}</td></tr>`;
    })
    .join("\n");

  const rows = (report.top10Slots || [])
    .map((record) => {
      if (record.status === "EMPTY") {
        return `<tr><td>${record.slot}</td><td colspan="7">${record.reason}</td></tr>`;
      }
      return `<tr><td>${record.rank}</td><td>${record.projectName}</td><td>${record.symbol}</td><td>${record.chain || ""}</td><td>${record.breakoutReadinessScore}</td><td>${record.confidence}</td><td>${record.qualificationState}</td><td>${record.missingEvidence.slice(0, 2).join("; ")}</td></tr>`;
    })
    .join("\n");
  const prelaunchRows = (report.prelaunchResearchCandidates || [])
    .map(
      (record) =>
        `<tr><td>${record.prelaunchRank}</td><td>${record.projectName}</td><td>${record.symbol}</td><td>${record.chain || ""}</td><td>${record.researchOpportunityScore}</td><td>${record.confidence}</td><td>${record.missingEvidence.slice(0, 2).join("; ")}</td></tr>`
    )
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Private Top 10 Breakout Research</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 24px; color: #172026; background: #f7f8fa; }
    h1 { font-size: 24px; margin-bottom: 4px; }
    h2 { font-size: 18px; margin: 24px 0 8px; }
    .meta { color: #5d6875; margin-bottom: 18px; }
    table { border-collapse: collapse; width: 100%; background: white; }
    th, td { border: 1px solid #d9dee7; padding: 8px; text-align: left; vertical-align: top; }
    th { background: #edf1f7; }
    .note { margin-top: 18px; color: #5d6875; }
  </style>
</head>
<body>
  <h1>Private Top 10 Breakout Research</h1>
  <div class="meta">Generated ${report.generatedAt}. Research signals only.</div>
  <h2>Top 10 Research Opportunities</h2>
  <table>
    <thead><tr><th>Rank</th><th>Project</th><th>Symbol</th><th>Chain</th><th>Score</th><th>Confidence</th><th>Status</th><th>Executable</th><th>Missing Evidence</th></tr></thead>
    <tbody>${researchRows}</tbody>
  </table>
  <h2>Qualified Executable Buys</h2>
  <table>
    <thead><tr><th>Rank</th><th>Project</th><th>Symbol</th><th>Chain</th><th>Score</th><th>Confidence</th><th>State</th><th>Missing Evidence</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <h2>Prelaunch Research</h2>
  <table>
    <thead><tr><th>Rank</th><th>Project</th><th>Symbol</th><th>Chain</th><th>Research Score</th><th>Confidence</th><th>Missing Evidence</th></tr></thead>
    <tbody>${prelaunchRows || '<tr><td colspan="7">No prelaunch research candidates passed the latest evidence checks.</td></tr>'}</tbody>
  </table>
  <div class="note">${report.disclaimer}</div>
</body>
</html>`;
}

export function writeTop10BreakoutReports(projects = [], meta = {}) {
  const reportsDir = path.resolve("reports");
  fs.mkdirSync(reportsDir, { recursive: true });
  const report = buildTop10BreakoutReport(projects, meta);
  const candidateInput = buildTop10CandidateInput(projects, meta);

  const top10Path = path.join(reportsDir, "top-10-breakout-picks.json");
  const candidateInputPath = path.join(reportsDir, "top10-candidate-input.json");
  const htmlPath = path.join(reportsDir, "top-10-breakout-picks.html");
  const csvPath = path.join(reportsDir, "top-10-breakout-picks.csv");
  const explanationsPath = path.join(reportsDir, "top-10-breakout-explanations.json");
  const excludedPath = path.join(reportsDir, "top-10-excluded-finalists.json");
  const bestNowPath = path.join(reportsDir, "best-opportunity-now.json");

  writeJson(top10Path, report);
  writeJson(candidateInputPath, candidateInput);
  fs.writeFileSync(htmlPath, htmlFor(report));
  fs.writeFileSync(csvPath, csvFor(report.qualifiedPicks));
  writeJson(explanationsPath, {
    generatedAt: report.generatedAt,
    picks: report.qualifiedPicks.map((pick) => ({
      rank: pick.rank,
      projectName: pick.projectName,
      symbol: pick.symbol,
      scoreContributionTrace: pick.scoreContributionTrace,
      penalties: pick.penalties,
      whyItMayBreakOut: pick.whyItMayBreakOut,
      risks: {
        contractAndHolderRisk: pick.contractAndHolderRisk,
        manipulationRisk: pick.manipulationRisk,
        hardBlocks: pick.hardBlocks,
      },
      invalidationCondition: pick.invalidationCondition,
      missingEvidence: pick.missingEvidence,
    })),
  });
  writeJson(excludedPath, {
    generatedAt: report.generatedAt,
    excludedFinalists: report.excludedFinalists,
  });
  writeJson(bestNowPath, {
    generatedAt: report.generatedAt,
    headline: report.bestOpportunityNow ? "BEST QUALIFIED TOP-10 OPPORTUNITY NOW" : "NO FULLY QUALIFIED BEST OPPORTUNITY",
    bestOpportunityNow: report.bestOpportunityNow,
    reason: report.bestOpportunityNow
      ? "The top candidate passed the private Top 10 evidence, route, liquidity, and safety minimums."
      : "No candidate passed all minimum evidence and execution requirements.",
    disclaimer: report.disclaimer,
  });

  return {
    top10Path,
    candidateInputPath,
    htmlPath,
    csvPath,
    explanationsPath,
    excludedPath,
    bestNowPath,
    report,
  };
}
