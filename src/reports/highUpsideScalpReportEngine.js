import fs from "fs";
import path from "path";
import { isLiveExecutionReady } from "../execution/routeTruthV2.js";
import { resolveStrictCandidateGate } from "../execution/routeResolver.js";
import {
  HIGH_UPSIDE_SCALP_LANES,
  HIGH_UPSIDE_SCALP_REQUIRED_FIELD_NAMES,
  classifyHighUpsideScalpProject,
  isHighUpsideDeepStageDeferred,
  markHighUpsideScalpResearchDeferred,
} from "../engines/highUpsideScalpClassificationEngine.js";

const MAX_REPORT_ROWS = 50;

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

function first(values = []) {
  return values.find((value) => value !== undefined && value !== null && value !== "") ?? null;
}

function average(values = []) {
  const active = values.map(num).filter((value) => value > 0);
  if (!active.length) return 0;
  return Math.round(active.reduce((sum, value) => sum + value, 0) / active.length);
}

function marketCap(project = {}) {
  return num(first([
    project.sevenDayTenXMarketCap,
    project.circulatingMarketCapUsd,
    project.marketCap,
    project.marketCapUsd,
    project.estimatedMarketCapUsd,
  ]));
}

function liquidity(project = {}) {
  return num(first([
    project.sevenDayTenXLiquidityUsd,
    project.stableExitLiquidityUsd,
    project.dexLiquidityUsd,
    project.liquidityUsd,
    project.activeLiquidityUsd,
  ]));
}

function priceUsd(project = {}) {
  return num(first([project.priceUsd, project.price, project.marketData?.priceUsd]));
}

function priceChange24h(project = {}) {
  return num(first([project.sevenDayTenXPriceExtension?.priceChange24hPct, project.priceChange24hPct, project.priceChange24h]));
}

function priceChange7d(project = {}) {
  return num(first([project.sevenDayTenXPriceExtension?.priceChange7dPct, project.priceChange7dPct, project.priceChange7d]));
}

function routeReady(project = {}) {
  return resolveStrictCandidateGate(project).strictRankEligible === true && isLiveExecutionReady({
    ...project,
    routeTruthStatus: "LIVE_EXECUTION_READY",
  });
}

function deterministicSafetyBlocked(project = {}) {
  const blockers = [
    ...(project.sevenDayTenXBlockers || []),
    ...(project.finalSelectionBlockers || []),
    ...(project.sniperIntegrityBlockers || []),
  ]
    .join(" ")
    .toLowerCase();
  return Boolean(
    project.honeypotDetected ||
      project.verifiedScam ||
      project.sellRestricted ||
      project.identityConflict ||
      project.canonicalIdentityHardBlock ||
      project.finalSelectionState === "BLOCKED" ||
      project.instantSafetyStatus === "CRITICAL" ||
      num(project.contractAuthorityRiskScore) >= 70 ||
      num(project.liquidityControlRiskScore) >= 75 ||
      num(project.washTradingRiskScore) >= 75 ||
      /honeypot|verified scam|identity conflict|contract mismatch|chain mismatch|cannot sell|sell restricted/.test(blockers)
  );
}

function lateChase(project = {}) {
  const status = String(project.sevenDayTenXLateChaseStatus || project.preBreakoutMomentumStage || project.prePump?.status || "");
  return /ALREADY_10X|LATE_CHASE|ALREADY_PUMPED|EXTENDED/.test(status) || priceChange24h(project) >= 85 || priceChange7d(project) >= 220;
}

function utilityBlocked(project = {}) {
  return project.memeOnlySpeculative === true || project.utilityClassification === "MEME_SPECULATION";
}

function scoreProject(project = {}) {
  const preConsensusScore = first([
    project.preConsensusBreakoutScore,
    project.preConsensusOpportunityScore,
    project.regimeAdjustedOpportunityScore,
    project.preConsensusBreakoutHunter?.preConsensusBreakoutScore,
    project.preConsensusBreakoutHunter?.preConsensusOpportunityScore,
    project.preConsensusBreakoutHunter?.regimeAdjustedOpportunityScore,
  ]);
  const sniperIntegrityScore = first([
    project.sniperIntegrityScore,
    project.confidenceAdjustedSniperScore,
    project.sniperScore,
    project.sniperIntegrityGate?.sniperIntegrityScore,
    project.sniperIntegrityGate?.confidenceAdjustedSniperScore,
    project.sniperIntegrityGate?.score,
  ]);
  const upside = average([
    project.sevenDayTenXScore,
    project.preBreakoutRadarScore,
    preConsensusScore,
    project.earlyAsymmetryResearchPriorityScore,
  ]);
  const flow = average([
    project.capitalMigrationScore,
    project.capitalFlowScore,
    project.buyerBreadthAccelerationScore,
    project.buyPressureScore,
    project.liquidityFormationScore,
    project.liquidityExpansionScore,
  ]);
  const quality = average([
    project.utilityQualityScore,
    project.realUtilityScore,
    project.developerAccelerationScore,
    project.developerActivityScore,
    project.ecosystemIntegrationScore,
    project.tokenomicsScore,
  ]);
  const proof = average([
    project.sourceTruthScore,
    project.sourceReliabilityScore,
    project.institutionalDataProvenanceScore,
    project.evidenceCoverageScore,
    project.opportunityEvidenceCoverage,
  ]);
  const safety = average([
    project.instantSafetyScore,
    project.contractAuthoritySafetyScore,
    project.liquidityControlSafetyScore,
    sniperIntegrityScore,
    project.finalIntegrityScore,
  ]);
  const route = average([routeReady(project) ? 85 : 35, project.scalpMicrostructureScore]);
  const riskPenalty = average([
    project.trapRiskScore,
    project.contractAuthorityRiskScore,
    project.liquidityControlRiskScore,
    project.washTradingRiskScore,
    project.walletClusterRiskScore,
    project.deployerRiskScore,
    project.sellPressureScore,
  ]);
  const latePenalty = lateChase(project) ? 28 : 0;
  const memePenalty = utilityBlocked(project) ? 24 : 0;

  return Math.round(
    clamp(
      upside * 0.25 +
        flow * 0.22 +
        quality * 0.18 +
        proof * 0.13 +
        safety * 0.12 +
        route * 0.1 -
        riskPenalty * 0.24 -
        latePenalty -
        memePenalty
    )
  );
}

function lane(project = {}, score = 0) {
  const strictGate = resolveStrictCandidateGate(project);
  if (strictGate.strictCandidateLane === "MARKET_BENCHMARK") return "MARKET_BENCHMARK";
  if (!strictGate.strictRankEligible) return "QUARANTINED_IDENTITY_OR_ROUTE";
  if (deterministicSafetyBlocked(project)) return "SAFETY_BLOCKED";
  if (lateChase(project)) return "LATE_CHASE_REJECTED";
  if (utilityBlocked(project)) return "MEME_SPECULATION_EXCLUDED";
  if (String(project.scalpMicrostructureLane || "").startsWith("SCALP_NO_TRADE")) return project.scalpMicrostructureLane;
  if (!routeReady(project)) return "RESEARCH_ONLY_ROUTE_MISSING";
  if (project.scalpMicrostructureLane === "SCALP_WATCHLIST") return "HIGH_UPSIDE_WATCH";
  if (score >= 72) return "SCALP_READY_RESEARCH";
  if (score >= 58) return "HIGH_UPSIDE_WATCH";
  return "LOWER_PRIORITY";
}

function debugMissingProof(project = {}) {
  return [
    ...(project.dailyCapitalMoveMissingProof || []),
    project.highUpsideScalpNextProofNeeded,
    ...(project.highUpsideScalpMissingProof || []),
    ...(project.highUpsideScalpRouteChecklist?.missing || []),
    ...(project.walletFlowMissingProof || []),
    ...(project.walletFlowWarnings || []),
    ...(project.highUpsideScalpMissingFields || []),
    ...(project.missingInfoNeeded || []),
    ...(project.missingRouteEvidence || []),
    ...(project.sevenDayTenXMissingEvidence || []),
    ...(project.scalpMicrostructureBlockers || []),
  ].filter(Boolean);
}

function sourceList(project = {}) {
  return [
    project.executionRecoverySource,
    project.executionProofRecovery?.executionRecoverySource,
    project.executionProofRecoveryRoute?.source,
    project.canonicalExecutionRoute?.supportingSources?.[0],
    project.executionProof?.supportingSources?.[0],
    ...(project.discoverySources || []),
    project.source,
    project.exchange,
    project.dex,
  ].filter(Boolean);
}

function failedSourceList(project = {}) {
  return [
    ...(project.executionRecoveryFailures || []),
    ...(project.executionProofRecovery?.executionRecoveryFailures || []),
    ...(project.providerFailures || []),
    ...(project.discoveryProviderFailures || []),
    ...(project.canonicalExecutionRoute?.failureReasons || []),
    ...(project.executionProof?.failureReasons || []),
  ].filter(Boolean);
}

function plainLanguageLane(project = {}) {
  const laneValue = String(project.highUpsideScalpLane || "");
  if (laneValue === "SCALP_READY_RESEARCH") return "SCALP_READY";
  if (laneValue === "HIGH_UPSIDE_WATCH") return "HIGH_UPSIDE_WATCHLIST";
  if (laneValue === "RESEARCH_ONLY_ROUTE_MISSING") return "ROUTE_PENDING";
  if (laneValue === "MANUAL_REVIEW") return "MANUAL_REVIEW";
  if (laneValue === "DATA_STARVED" || laneValue === "HIGH_UPSIDE_RESEARCH_DEFERRED") return "DEEP_DEFERRED";
  if (laneValue === "MARKET_BENCHMARK") return "MARKET_BENCHMARK";
  if (laneValue === "QUARANTINED_IDENTITY_OR_ROUTE") return "QUARANTINED";
  if (/safety|manual|wallet|proof|unknown/i.test(debugMissingProof(project).join(" "))) return "MANUAL_REVIEW";
  if (laneValue.startsWith("SCALP_NO_TRADE") || ["SAFETY_BLOCKED", "LATE_CHASE_REJECTED", "MEME_SPECULATION_EXCLUDED"].includes(laneValue)) {
    return "REJECTED";
  }
  return laneValue || "MANUAL_REVIEW";
}

function compact(project = {}, rank = null) {
  const score = project.highUpsideScalpScore ?? 0;
  const missingProof = [...new Set(debugMissingProof(project))].slice(0, 12);
  const strictGate = project.strictCandidateGate || resolveStrictCandidateGate(project);
  return {
    rank,
    symbol: project.symbol || "UNKNOWN",
    name: project.name || "Unknown",
    tokenName: strictGate.tokenName || project.tokenName || project.name || "Unknown",
    chain: strictGate.normalizedChain || project.chain || project.canonicalChain || project.chainId || "unknown",
    chainId: strictGate.canonicalChainId ?? project.chainId ?? null,
    canonicalId: strictGate.canonicalId || project.canonicalId || project.canonicalProjectId || null,
    tokenAddress: strictGate.tokenAddress || project.tokenAddress || project.contractAddress || project.canonicalAddress || null,
    contractAddress: strictGate.contractAddress || project.contractAddress || project.tokenAddress || project.canonicalAddress || null,
    poolAddress: strictGate.pairAddress || project.poolAddress || project.pairAddress || project.primaryTradablePool || null,
    pairAddress: strictGate.pairAddress || project.pairAddress || project.poolAddress || project.primaryTradablePool || null,
    dexName: strictGate.dexName || project.dexName || project.dex || project.canonicalExecutionRoute?.dexName || project.canonicalExecutionRoute?.venue || null,
    baseTokenAddress: strictGate.baseTokenAddress || project.baseTokenAddress || project.baseToken?.address || null,
    quoteTokenAddress: strictGate.quoteTokenAddress || project.quoteTokenAddress || project.quoteToken?.address || null,
    provenance: strictGate.provenance || project.discoverySources || [],
    lastVerifiedAt: strictGate.lastVerifiedAt || project.lastVerifiedAt || project.quoteTimestamp || null,
    routeVerificationStatus: strictGate.routeVerificationStatus || project.routeVerificationStatus || project.routeTruthStatus || "UNKNOWN",
    quarantineReason: strictGate.candidateQuarantineReason || project.highUpsideScalpQuarantineReason || null,
    quarantineReasons: strictGate.candidateQuarantineReasons || [],
    strictIdentityVerified: strictGate.strictIdentityVerified === true,
    strictRouteVerified: strictGate.strictRouteVerified === true,
    strictRankEligible: strictGate.strictRankEligible === true,
    highUpsideScalpScore: score,
    lane: project.highUpsideScalpLane || "UNCLASSIFIED",
    readableLane: plainLanguageLane(project),
    highUpsideScalpDataCoverage: project.highUpsideScalpDataCoverage ?? null,
    highUpsideScalpMissingFields: project.highUpsideScalpMissingFields || [],
    highUpsideScalpMissingProof: project.highUpsideScalpMissingProof || [],
    highUpsideScalpNextProofNeeded: project.highUpsideScalpNextProofNeeded || missingProof[0] || null,
    highUpsideScalpProofCategory: project.highUpsideScalpProofCategory || "unknown",
    routeProofChecklist: project.highUpsideScalpRouteChecklist || null,
    highUpsideScalpClassificationReason: project.highUpsideScalpClassificationReason || "No classification reason recorded.",
    promotionDebug: {
      whyFailedPromotion: project.highUpsideScalpClassificationReason || project.dailyCapitalMoveReason || "Promotion requirements are not fully proven yet.",
      missingProof,
      nextSingleProofToPromote: project.highUpsideScalpNextProofNeeded || missingProof[0] || null,
      sourcesUsed: [...new Set(sourceList(project))].slice(0, 10),
      sourcesFailed: [...new Set(failedSourceList(project))].slice(0, 10),
    },
    priceUsd: priceUsd(project),
    subCent: priceUsd(project) > 0 && priceUsd(project) < 0.01,
    marketCapUsd: marketCap(project),
    liquidityUsd: liquidity(project),
    priceChange24hPct: priceChange24h(project),
    priceChange7dPct: priceChange7d(project),
    routeReady: routeReady(project),
    executionStatus: project.executionStatus || "UNKNOWN",
    scalpMicrostructureScore: project.scalpMicrostructureScore || 0,
    scalpMicrostructureLane: project.scalpMicrostructureLane || "NOT_RUN",
    scalpEstimatedTotalCostPct: project.scalpEstimatedTotalCostPct || 0,
    scalpTradeSizeUsd: project.scalpTradeSizeUsd || 100,
    scalpTradeSizeToDepthPct: project.scalpTradeSizeToDepthPct || 0,
    scalpQuoteAgeSeconds: project.scalpQuoteAgeSeconds ?? null,
    scalpMicrostructureBlockers: project.scalpMicrostructureBlockers || [],
    scalpMicrostructureWarnings: project.scalpMicrostructureWarnings || [],
    utilityClassification: project.utilityClassification || "UNKNOWN_UTILITY",
    realUtilityQualified: Boolean(project.realUtilityQualified),
    lateChaseStatus: project.sevenDayTenXLateChaseStatus || "UNKNOWN",
    sevenDayTenXScore: project.sevenDayTenXScore || 0,
    preBreakoutRadarScore: project.preBreakoutRadarScore || 0,
    preConsensusBreakoutScore: first([
      project.preConsensusBreakoutScore,
      project.preConsensusOpportunityScore,
      project.regimeAdjustedOpportunityScore,
      project.preConsensusBreakoutHunter?.preConsensusBreakoutScore,
      project.preConsensusBreakoutHunter?.preConsensusOpportunityScore,
      project.preConsensusBreakoutHunter?.regimeAdjustedOpportunityScore,
    ]) || 0,
    earlyAsymmetryResearchPriorityScore: project.earlyAsymmetryResearchPriorityScore || 0,
    buyerBreadthAccelerationScore: project.buyerBreadthAccelerationScore || 0,
    walletFlowScore: project.walletFlowScore || 0,
    walletFlowLane: project.walletFlowLane || "NOT_RUN",
    walletFlowWarnings: project.walletFlowWarnings || [],
    walletFlowMissingProof: project.walletFlowMissingProof || [],
    liquidityFormationScore: project.liquidityFormationScore || 0,
    utilityQualityScore: project.utilityQualityScore || 0,
    sourceTruthScore: project.sourceTruthScore || 0,
    sniperIntegrityScore: first([
      project.sniperIntegrityScore,
      project.confidenceAdjustedSniperScore,
      project.sniperScore,
      project.sniperIntegrityGate?.sniperIntegrityScore,
      project.sniperIntegrityGate?.confidenceAdjustedSniperScore,
      project.sniperIntegrityGate?.score,
    ]) || 0,
    blockers: project.sevenDayTenXBlockers || [],
    missingEvidence: project.sevenDayTenXMissingEvidence || [],
    reasons: project.sevenDayTenX?.reasons || project.moneyRankDrivers || [],
    confirmBeforeScalping: [
      "Verify token, chain, pool, and official project links.",
      "Confirm fresh buy and sell route, taxes, slippage, and fees with a tiny test quote.",
      "Reject if the move is already extended or sell pressure spikes.",
      "Use position sizing and stop/invalidation rules outside this scanner.",
    ],
  };
}

function laneForReport(project = {}) {
  const laneValue = String(project.highUpsideScalpLane || "");
  if (HIGH_UPSIDE_SCALP_LANES.includes(laneValue) || laneValue.startsWith("SCALP_NO_TRADE")) {
    return laneValue;
  }
  return "UNCLASSIFIED";
}

function classifyForReport(project = {}) {
  if (Object.hasOwn(project, "highUpsideScalpLane")) return project;
  if (isHighUpsideDeepStageDeferred(project)) return markHighUpsideScalpResearchDeferred(project);
  return classifyHighUpsideScalpProject(project);
}

function countByLane(projects = []) {
  return projects.reduce((counts, project) => {
    const laneValue = laneForReport(project);
    counts[laneValue] = (counts[laneValue] || 0) + 1;
    return counts;
  }, {});
}

function distributionTotal(distribution = {}) {
  return Object.values(distribution).reduce((sum, count) => sum + num(count), 0);
}

function frequency(values = []) {
  const counts = new Map();
  for (const value of values.filter(Boolean)) {
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 50)
    .map(([field, count]) => ({ field, count }));
}

function promotionBlockerSummary({
  scored = [],
  top = [],
  watch = [],
  routeMissing = [],
  quarantined = [],
  invalidIdentity = [],
  dataStarved = [],
} = {}) {
  const quarantineReasons = frequency(
    quarantined.flatMap((project) => {
      const strictGate = project.strictCandidateGate || resolveStrictCandidateGate(project);
      return strictGate.candidateQuarantineReasons || [];
    })
  );
  const nextProofNeeded = frequency(
    scored.flatMap((project) => [
      project.highUpsideScalpNextProofNeeded,
      project.dailyCapitalMoveMissingProof?.[0],
      project.strictCandidateGate?.candidateQuarantineReason,
      resolveStrictCandidateGate(project).candidateQuarantineReason,
    ])
  );
  const failedSources = frequency(scored.flatMap(failedSourceList));
  const promoted = top.length + watch.length + routeMissing.length;
  const primaryFailureMode =
    promoted > 0
      ? "SOME_RESEARCH_CANDIDATES_PROMOTING"
      : quarantined.length
        ? "STRICT_IDENTITY_OR_ROUTE_PROOF_MISSING"
        : dataStarved.length
          ? "DATA_STARVED"
          : invalidIdentity.length
            ? "INVALID_OR_AGGREGATE_IDENTITY"
            : "NO_ACTIONABLE_PROMOTION";

  return {
    primaryFailureMode,
    explanation:
      primaryFailureMode === "STRICT_IDENTITY_OR_ROUTE_PROOF_MISSING"
        ? "Candidates have research signals, but they are not allowed into scalp-ready/watch lanes until contract, pool/market, liquidity, fresh buy quote, fresh sell quote, and route freshness are proven."
        : primaryFailureMode === "DATA_STARVED"
          ? "Candidates are missing required evidence families before classification can be trusted."
          : primaryFailureMode === "SOME_RESEARCH_CANDIDATES_PROMOTING"
            ? "At least one candidate reached a visible research lane; remaining candidates are still gated by proof."
            : "No promotion-ready candidate exists under the current safety and proof rules.",
    promotedCount: promoted,
    quarantinedCount: quarantined.length,
    invalidIdentityCount: invalidIdentity.length,
    dataStarvedCount: dataStarved.length,
    topQuarantineReasons: quarantineReasons.slice(0, 12),
    topNextProofNeeded: nextProofNeeded.slice(0, 12),
    topFailedSources: failedSources.slice(0, 12),
    recommendedFixOrder: [
      "Restore route-identity sources: DexScreener and GeckoTerminal first.",
      "Resolve token contract and pool/pair address before quote recovery.",
      "Recover fresh buy and sell quotes with Jupiter for Solana and 0x or DEX adapters for EVM.",
      "Only then evaluate wallet flow, buyer breadth, utility proof, and final capital-move eligibility.",
    ],
  };
}

function scoreDistribution(projects = []) {
  const scores = projects
    .map((project) => num(project.highUpsideScalpScore))
    .filter((score) => Number.isFinite(score))
    .sort((a, b) => a - b);
  if (!scores.length) {
    return {
      minimumScore: 0,
      medianScore: 0,
      maximumScore: 0,
      scoreDistribution: { "0-19": 0, "20-39": 0, "40-57": 0, "58-71": 0, "72-100": 0 },
    };
  }

  const buckets = { "0-19": 0, "20-39": 0, "40-57": 0, "58-71": 0, "72-100": 0 };
  for (const score of scores) {
    if (score < 20) buckets["0-19"] += 1;
    else if (score < 40) buckets["20-39"] += 1;
    else if (score < 58) buckets["40-57"] += 1;
    else if (score < 72) buckets["58-71"] += 1;
    else buckets["72-100"] += 1;
  }

  return {
    minimumScore: scores[0],
    medianScore: scores[Math.floor(scores.length / 2)],
    maximumScore: scores[scores.length - 1],
    scoreDistribution: buckets,
  };
}

function componentCoverageSummary(projects = []) {
  const families = {};
  for (const project of projects) {
    const coverage = project.highUpsideScalpComponentCoverage || {};
    for (const [family, detail] of Object.entries(coverage)) {
      if (!families[family]) families[family] = { available: 0, expected: 0, projectsWithAnyCoverage: 0 };
      families[family].available += num(detail.available);
      families[family].expected += num(detail.expected);
      if (num(detail.available) > 0) families[family].projectsWithAnyCoverage += 1;
    }
  }

  return Object.fromEntries(
    Object.entries(families).map(([family, detail]) => [
      family,
      {
        ...detail,
        coveragePct: detail.expected ? Math.round((detail.available / detail.expected) * 100) : 100,
      },
    ])
  );
}

function reportStatus({
  projectsAnalyzed = 0,
  classificationEligibleCount = projectsAnalyzed,
  top = [],
  watch = [],
  routeMissing = [],
  manualReview = [],
  dataStarved = [],
  invariantPass = true,
  unclassified = [],
} = {}) {
  if (!projectsAnalyzed) return "NO_PROJECTS";
  if (!invariantPass || unclassified.length > 0) return "CLASSIFICATION_INCOMPLETE";
  if (top.length > 0) return "PASS_WITH_SCALP_READY";
  if (watch.length + routeMissing.length + manualReview.length > 0) return "PASS_WITH_WATCHLIST";
  if (classificationEligibleCount > 0 && dataStarved.length === classificationEligibleCount) return "DATA_STARVED";
  return "PASS_NO_ACTIONABLE_RESULTS";
}

export function summarizeHighUpsideScalpResearch(projects = [], meta = {}) {
  const scored = (Array.isArray(projects) ? projects : [])
    .map(classifyForReport)
    .sort((a, b) => num(b.highUpsideScalpScore) - num(a.highUpsideScalpScore));

  const top = scored.filter((project) => laneForReport(project) === "SCALP_READY_RESEARCH");
  const watch = scored.filter((project) => laneForReport(project) === "HIGH_UPSIDE_WATCH");
  const routeMissing = scored.filter((project) => laneForReport(project) === "RESEARCH_ONLY_ROUTE_MISSING");
  const manualReview = scored.filter((project) => laneForReport(project) === "MANUAL_REVIEW");
  const researchDeferred = scored.filter((project) => laneForReport(project) === "HIGH_UPSIDE_RESEARCH_DEFERRED");
  const late = scored.filter((project) => laneForReport(project) === "LATE_CHASE_REJECTED");
  const meme = scored.filter((project) => laneForReport(project) === "MEME_SPECULATION_EXCLUDED");
  const microstructureRejected = scored.filter((project) => laneForReport(project).startsWith("SCALP_NO_TRADE"));
  const safetyBlocked = scored.filter((project) => laneForReport(project) === "SAFETY_BLOCKED");
  const lowerPriority = scored.filter((project) => laneForReport(project) === "LOWER_PRIORITY");
  const dataStarved = scored.filter((project) => laneForReport(project) === "DATA_STARVED");
  const invalidIdentity = scored.filter((project) => laneForReport(project) === "INVALID_OR_AGGREGATE_IDENTITY");
  const quarantined = scored.filter((project) => laneForReport(project) === "QUARANTINED_IDENTITY_OR_ROUTE");
  const marketBenchmarks = scored.filter((project) => laneForReport(project) === "MARKET_BENCHMARK");
  const unclassified = scored.filter((project) => laneForReport(project) === "UNCLASSIFIED");
  const laneDistribution = countByLane(scored);
  const classifiedProjectCount = scored.length - unclassified.length;
  const laneTotal = distributionTotal(laneDistribution);
  const invariantPass = laneTotal === scored.length && unclassified.length === 0;
  const compactionDetected = scored.some((project) => project.reportCompaction?.mode);
  const classificationEligible = scored.filter(
    (project) => laneForReport(project) !== "HIGH_UPSIDE_RESEARCH_DEFERRED"
  );
  const allMissingFields = classificationEligible.flatMap((project) => project.highUpsideScalpMissingFields || []);
  const omittedRequiredFields = compactionDetected
    ? HIGH_UPSIDE_SCALP_REQUIRED_FIELD_NAMES.filter((field) => allMissingFields.includes(field))
    : [];
  const scoreStats = scoreDistribution(classificationEligible);
  const blockers = promotionBlockerSummary({
    scored,
    top,
    watch,
    routeMissing,
    quarantined,
    invalidIdentity,
    dataStarved,
  });

  return {
    generatedAt: new Date().toISOString(),
    scanRunId: meta.scanRunId || meta.runId || process.env.GITHUB_RUN_ID || null,
    codeCommitSha: meta.codeCommitSha || process.env.GITHUB_SHA || null,
    status: reportStatus({
      projectsAnalyzed: scored.length,
      classificationEligibleCount: classificationEligible.length,
      top,
      watch,
      routeMissing,
      manualReview,
      dataStarved,
      invariantPass,
      unclassified,
    }),
    mode: "HIGH_UPSIDE_SCALP_RESEARCH",
    objective:
      "Surface pre-extension, real-utility, route-verified asymmetric candidates for manual scalping research.",
    disclaimer:
      "Research output only. Not financial advice, not a buy/sell recommendation, and not a profit guarantee.",
    projectsAnalyzed: scored.length,
    inputProjectCount: scored.length,
    classifiedProjectCount,
    classificationEligibleProjectCount: classificationEligible.length,
    unclassifiedProjectCount: unclassified.length,
    classificationCoveragePct: scored.length ? Math.round((classifiedProjectCount / scored.length) * 100) : 0,
    laneDistribution,
    classificationInvariant: {
      status: invariantPass ? "PASS" : "FAIL",
      laneTotal,
      projectsAnalyzed: scored.length,
      unexplainedCount: Math.max(0, scored.length - laneTotal) + unclassified.length,
    },
    scalpReadyCount: top.length,
    highUpsideWatchCount: watch.length,
    researchOnlyRouteMissingCount: routeMissing.length,
    manualReviewCount: manualReview.length,
    highUpsideResearchDeferredCount: researchDeferred.length,
    lateChaseRejectedCount: late.length,
    memeSpeculationExcludedCount: meme.length,
    microstructureRejectedCount: microstructureRejected.length,
    safetyBlockedCount: safetyBlocked.length,
    lowerPriorityCount: lowerPriority.length,
    dataStarvedCount: dataStarved.length,
    invalidOrAggregateIdentityCount: invalidIdentity.length,
    quarantinedIdentityOrRouteCount: quarantined.length,
    marketBenchmarkCount: marketBenchmarks.length,
    unclassifiedCount: unclassified.length,
    routeReadyCount: classificationEligible.filter((project) => project.highUpsideScalpDiagnostics?.routeReady === true || routeReady(project)).length,
    routeMissingCount: routeMissing.length,
    componentCoverageSummary: componentCoverageSummary(classificationEligible),
    promotionBlockerSummary: blockers,
    deferredFunnelSummary: {
      deferredCount: researchDeferred.length,
      reason:
        "These projects were part of the broad standard scan but were not selected into the deep high-upside scalp evidence stage. They are not counted as data-starved.",
      selectedForDeepEvidence: classificationEligible.length,
    },
    missingFieldFrequency: frequency(allMissingFields),
    compactionDetected,
    omittedRequiredFields,
    ...scoreStats,
    topScalpResearchCandidates: top.slice(0, 10).map((project, index) => compact(project, index + 1)),
    highUpsideWatchlist: watch.slice(0, MAX_REPORT_ROWS).map((project, index) => compact(project, index + 1)),
    researchOnlyRouteMissing: routeMissing.slice(0, MAX_REPORT_ROWS).map((project, index) => compact(project, index + 1)),
    manualReview: manualReview.slice(0, MAX_REPORT_ROWS).map((project, index) => compact(project, index + 1)),
    highUpsideResearchDeferred: researchDeferred.slice(0, MAX_REPORT_ROWS).map((project, index) => compact(project, index + 1)),
    lateChaseRejected: late.slice(0, MAX_REPORT_ROWS).map((project, index) => compact(project, index + 1)),
    memeSpeculationExcluded: meme.slice(0, MAX_REPORT_ROWS).map((project, index) => compact(project, index + 1)),
    microstructureRejected: microstructureRejected.slice(0, MAX_REPORT_ROWS).map((project, index) => compact(project, index + 1)),
    safetyBlocked: safetyBlocked.slice(0, MAX_REPORT_ROWS).map((project, index) => compact(project, index + 1)),
    lowerPriority: lowerPriority.slice(0, MAX_REPORT_ROWS).map((project, index) => compact(project, index + 1)),
    dataStarved: dataStarved.slice(0, MAX_REPORT_ROWS).map((project, index) => compact(project, index + 1)),
    invalidOrAggregateIdentity: invalidIdentity.slice(0, MAX_REPORT_ROWS).map((project, index) => compact(project, index + 1)),
    quarantinedIdentityOrRoute: quarantined.slice(0, MAX_REPORT_ROWS).map((project, index) => compact(project, index + 1)),
    marketBenchmarks: marketBenchmarks.slice(0, MAX_REPORT_ROWS).map((project, index) => compact(project, index + 1)),
    unclassified: unclassified.slice(0, MAX_REPORT_ROWS).map((project, index) => compact(project, index + 1)),
    operatingRules: [
      "Do not chase assets that already completed a 10x-style move.",
      "Do not treat meme-only attention as real utility.",
      "Do not mark a coin scalp-ready without a verified sell route.",
      "Keep incomplete but promising projects visible as quarantined recovery candidates, not ranked opportunities.",
    ],
  };
}

export function writeHighUpsideScalpReport(projects = [], meta = {}) {
  const reportsDir = path.resolve("reports");
  fs.mkdirSync(reportsDir, { recursive: true });
  const report = summarizeHighUpsideScalpResearch(projects, meta);
  const filePath = path.join(reportsDir, "high-upside-scalp-research.json");
  fs.writeFileSync(filePath, JSON.stringify(report, null, 2));
  return { filePath, report };
}
