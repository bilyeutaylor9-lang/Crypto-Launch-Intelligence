import { isLiveExecutionReady } from "../execution/routeTruthV2.js";
import { resolveStrictCandidateGate } from "../execution/routeResolver.js";
import { isLikelyAggregateCandidate } from "../identity/displayIdentityGuard.js";
import { deterministicCandidateBlocks } from "../kernel/candidateTruthState.js";

export const HIGH_UPSIDE_SCALP_LANES = [
  "SCALP_READY_RESEARCH",
  "HIGH_UPSIDE_WATCH",
  "RESEARCH_ONLY_ROUTE_MISSING",
  "MANUAL_REVIEW",
  "HIGH_UPSIDE_RESEARCH_DEFERRED",
  "LATE_CHASE_REJECTED",
  "MEME_SPECULATION_EXCLUDED",
  "SCALP_NO_TRADE_HIGH_COST",
  "SCALP_NO_TRADE_THIN_DEPTH",
  "SCALP_NO_TRADE_STALE_QUOTE",
  "SCALP_NO_TRADE_ROUTE_UNVERIFIED",
  "SCALP_NO_TRADE_UNFAVORABLE_MICROSTRUCTURE",
  "SAFETY_BLOCKED",
  "LOWER_PRIORITY",
  "DATA_STARVED",
  "INVALID_OR_AGGREGATE_IDENTITY",
  "QUARANTINED_IDENTITY_OR_ROUTE",
  "MARKET_BENCHMARK",
];

const MAX_MISSING_FIELDS = 80;
const MIN_DATA_COVERAGE_PCT = 42;

const COMPONENT_WEIGHTS = {
  upside: 0.25,
  flow: 0.22,
  quality: 0.18,
  proof: 0.13,
  safety: 0.12,
  route: 0.1,
};

const HARD_IDENTITY_QUARANTINE_REASONS = new Set([
  "CONTRACT_MISSING",
  "SYMBOL_AMBIGUOUS",
  "UNSUPPORTED_CHAIN",
  "NATIVE_ASSET_MISMATCH",
  "WRAPPED_ASSET_UNVERIFIED",
]);

function hasHardIdentityQuarantine(strictGate = {}) {
  return (strictGate.candidateQuarantineReasons || []).some((reason) =>
    HARD_IDENTITY_QUARANTINE_REASONS.has(reason)
  );
}

export const HIGH_UPSIDE_SCALP_COMPONENTS = {
  upside: [
    ["sevenDayTenXScore"],
    ["preBreakoutRadarScore"],
    [
      "preConsensusBreakoutScore",
      "preConsensusOpportunityScore",
      "regimeAdjustedOpportunityScore",
      "preConsensusBreakoutHunter.preConsensusBreakoutScore",
      "preConsensusBreakoutHunter.preConsensusOpportunityScore",
      "preConsensusBreakoutHunter.regimeAdjustedOpportunityScore",
    ],
    ["earlyAsymmetryResearchPriorityScore"],
  ],
  flow: [
    ["capitalMigrationScore"],
    ["capitalFlowScore"],
    ["walletFlowScore"],
    ["buyerBreadthAccelerationScore"],
    ["buyPressureScore"],
    ["liquidityFormationScore"],
    ["liquidityExpansionScore"],
  ],
  quality: [
    ["utilityQualityScore"],
    ["realUtilityScore"],
    ["developerAccelerationScore"],
    ["developerActivityScore"],
    ["ecosystemIntegrationScore"],
    ["tokenomicsScore"],
  ],
  proof: [
    ["sourceTruthScore"],
    ["sourceReliabilityScore"],
    ["institutionalDataProvenanceScore"],
    ["evidenceCoverageScore"],
    ["opportunityEvidenceCoverage"],
  ],
  safety: [
    ["instantSafetyScore"],
    ["contractAuthoritySafetyScore"],
    ["liquidityControlSafetyScore"],
    [
      "sniperIntegrityScore",
      "confidenceAdjustedSniperScore",
      "sniperScore",
      "sniperIntegrityGate.sniperIntegrityScore",
      "sniperIntegrityGate.confidenceAdjustedSniperScore",
      "sniperIntegrityGate.score",
    ],
    ["finalIntegrityScore"],
  ],
  route: [
    ["routeTruthStatus", "executionProofState", "executionStatus", "canonicalExecutionRoute.status"],
    ["scalpMicrostructureScore"],
  ],
  risk: [
    ["trapRiskScore"],
    ["contractAuthorityRiskScore"],
    ["liquidityControlRiskScore"],
    ["washTradingRiskScore"],
    ["walletClusterRiskScore"],
    ["deployerRiskScore"],
    ["sellPressureScore"],
  ],
};

export const HIGH_UPSIDE_SCALP_REQUIRED_FIELD_NAMES = Object.values(HIGH_UPSIDE_SCALP_COMPONENTS)
  .flat()
  .map((paths) => paths[0]);

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

function getPath(object = {}, path = "") {
  return String(path || "")
    .split(".")
    .reduce((value, key) => (value && Object.hasOwn(value, key) ? value[key] : undefined), object);
}

function firstPresentPath(project = {}, paths = []) {
  for (const path of paths) {
    const value = getPath(project, path);
    if (value !== undefined && value !== null && value !== "") return { path, value };
  }
  return { path: paths[0] || "unknown", value: undefined };
}

function explicitNumber(project = {}, paths = []) {
  const candidate = firstPresentPath(project, paths);
  if (candidate.value === undefined) {
    return { available: false, field: paths[0] || "unknown", value: null };
  }
  const parsed = Number(candidate.value);
  if (!Number.isFinite(parsed)) {
    return { available: false, field: candidate.path, value: null };
  }
  return { available: true, field: candidate.path, value: parsed };
}

function hasAnyPath(project = {}, paths = []) {
  return paths.some((path) => {
    const value = getPath(project, path);
    return value !== undefined && value !== null && value !== "";
  });
}

function hasObservedSafetyEvidence(project = {}) {
  const summary = project.securityEvidenceSummary || project.freeSecurityEvidence?.summary || {};
  const evidence = Array.isArray(project.securityEvidence)
    ? project.securityEvidence
    : Array.isArray(project.freeSecurityEvidence?.evidence)
      ? project.freeSecurityEvidence.evidence
      : [];
  const sources = [
    ...(project.securityEvidenceSources || []),
    ...(summary.knownProviders || []),
    ...(summary.providers || []),
  ].filter(Boolean);
  const status = String(
    project.safetyProofStatus ||
      project.safetyProofLane ||
      project.securityEvidenceStatus ||
      summary.status ||
      ""
  ).toUpperCase();

  return Boolean(
    evidence.length ||
      sources.length ||
      project.contractSafetyVerified === true ||
      (project.instantSafetyStatus === "PASS" && project.instantSafetyScore !== undefined) ||
      (status && !/UNKNOWN|NOT_TESTED|PROVIDER_UNAVAILABLE/.test(status))
  );
}

function hasObservedRouteEvidence(project = {}) {
  const route = project.executionProofRecoveryRoute || project.canonicalExecutionRoute || {};
  const proof = project.executionProof || {};
  return Boolean(
    Object.keys(route).length ||
      Object.keys(proof).length ||
      project.executionRecoverySource ||
      project.exactIdentityVerified === true ||
      project.buyQuoteVerified !== undefined ||
      project.sellQuoteVerified !== undefined ||
      project.quoteTimestamp ||
      project.quoteAgeSeconds !== undefined ||
      project.orderBookDepthUsd !== undefined ||
      project.estimatedRoundTripSlippagePct !== undefined
  );
}

function routeReady(project = {}) {
  return resolveStrictCandidateGate(project).strictRankEligible === true && isLiveExecutionReady({
    ...project,
    routeTruthStatus: "LIVE_EXECUTION_READY",
  });
}

function hasRouteIdentity(project = {}) {
  const route = project.canonicalExecutionRoute || project.executionProofRecoveryRoute || {};
  const routeType = String(route.routeType || project.routeType || "").toUpperCase();
  const aggregatorRoute = routeType === "AGGREGATOR" || routeType === "DEX_AGGREGATOR";
  if (project.exactIdentityVerified === true || route.exactIdentityVerified === true) return true;
  if (routeType === "CEX") return Boolean((route.venue || project.exchange) && (route.marketPair || project.marketPair));
  return Boolean(
    (project.chain || project.canonicalChain || route.chain) &&
      (project.tokenAddress || project.contractAddress || route.tokenAddress || route.contractAddress) &&
      (project.poolAddress || project.pairAddress || route.poolAddress || route.pairAddress || aggregatorRoute)
  );
}

function routeProofChecklist(project = {}) {
  const route = project.executionProofRecoveryRoute || project.canonicalExecutionRoute || {};
  const proof = project.executionProof || {};
  const strictGate = resolveStrictCandidateGate(project);
  const quoteAge = first([
    project.quoteAgeSeconds,
    route.quoteAgeSeconds,
    proof.quoteAgeSeconds,
    proof.quoteFreshnessSeconds,
  ]);
  const slippage = first([
    project.estimatedRoundTripSlippagePct,
    route.estimatedRoundTripSlippagePct,
    proof.estimatedRoundTripSlippagePct,
    project.estimatedSlippagePct,
    route.estimatedSlippagePct,
    proof.estimatedSlippagePct,
  ]);
  const depth = first([
    project.orderBookDepthUsd,
    project.executableDepthUsd,
    project.verifiedTradeSizeUsd,
    route.orderBookDepthUsd,
    route.executableDepthUsd,
    route.verifiedTradeSizeUsd,
    proof.orderBookDepthUsd,
    proof.executableDepthUsd,
    proof.verifiedTradeSizeUsd,
    project.stableExitLiquidityUsd,
    project.dexLiquidityUsd,
    project.liquidityUsd,
    route.liquidityUsd,
    proof.liquidityUsd,
  ]);
  const hasBuyQuote = project.buyQuoteVerified === true || route.buyQuoteVerified === true || proof.buyQuoteVerified === true;
  const hasSellQuote = project.sellQuoteVerified === true || route.sellQuoteVerified === true || proof.sellQuoteVerified === true;
  const quoteFresh = quoteAge !== null && Number.isFinite(Number(quoteAge)) && Number(quoteAge) <= 3600;
  const hasSlippage = slippage !== null && Number.isFinite(Number(slippage)) && project.slippageIsHeuristic !== true && route.slippageIsHeuristic !== true && proof.slippageIsHeuristic !== true;
  const hasDepth = Number.isFinite(Number(depth)) && Number(depth) > 0;
  const region = first([project.regionStatus, route.regionStatus, project.routeAccessibility?.regionStatus]);
  const routeType = String(route.routeType || project.routeType || "").toUpperCase();
  const cexRoute = routeType === "CEX";
  const regionStatus = String(region || "").toUpperCase();
  const regionAvailable = cexRoute
    ? regionStatus === "CONFIRMED_AVAILABLE"
    : !["CONFIRMED_RESTRICTED", "REGION_RESTRICTED", "RESTRICTED", "UNAVAILABLE"].includes(regionStatus);
  const checks = [
    { field: "exact route identity", passed: hasRouteIdentity(project) },
    { field: "fresh buy quote", passed: hasBuyQuote && quoteFresh },
    { field: "fresh sell quote", passed: hasSellQuote && quoteFresh },
    { field: "liquidity or order-book depth", passed: hasDepth },
    { field: "non-heuristic slippage", passed: hasSlippage },
    { field: "region availability", passed: regionAvailable },
    { field: "sellability safety", passed: !deterministicSafetyBlocked(project) && project.sellRestricted !== true && project.honeypotDetected !== true },
  ];
  const missing = [
    ...strictGate.candidateQuarantineReasons,
    ...checks.filter((check) => !check.passed).map((check) => check.field),
  ].filter(Boolean);
  return {
    checks,
    missing: [...new Set(missing)],
    nextSingleProofNeeded: missing[0] || null,
    buyQuoteVerified: hasBuyQuote,
    sellQuoteVerified: hasSellQuote,
    quoteFresh,
    depthVerified: hasDepth,
    slippageVerified: hasSlippage,
    regionAvailable,
    strictCandidateLane: strictGate.strictCandidateLane,
    quarantineReason: strictGate.candidateQuarantineReason,
    routeVerificationStatus: strictGate.routeVerificationStatus,
  };
}

export function isHighUpsideDeepStageDeferred(project = {}) {
  if (project.highUpsideScalpLane) return false;
  if (!Array.isArray(project.progressivePipelineStages)) return false;
  return !project.progressivePipelineStages.includes("deep");
}

export function markHighUpsideScalpResearchDeferred(project = {}) {
  return {
    ...project,
    highUpsideScalpScore: 0,
    highUpsideScalpLane: "HIGH_UPSIDE_RESEARCH_DEFERRED",
    highUpsideScalpComponentScores: {},
    highUpsideScalpComponentCoverage: {},
    highUpsideScalpDataCoverage: null,
    highUpsideScalpMissingFields: [],
    highUpsideScalpClassificationReason:
      "Project was not selected into the deep high-upside scalp evidence stage this scan; this is funnel deferral, not missing evidence.",
    highUpsideScalpDiagnostics: {
      routeReady: routeReady(project),
      lateChase: lateChase(project),
      utilityBlocked: utilityBlocked(project),
      deterministicSafetyBlocked: deterministicSafetyBlocked(project),
      deferredByFunnel: true,
      selectedStages: project.progressivePipelineStages || [],
      missingFieldCount: 0,
      componentCoveragePct: null,
      componentScoreMedian: 0,
    },
  };
}

function routeComponent(project = {}, paths = []) {
  if (!hasAnyPath(project, paths) || !hasObservedRouteEvidence(project)) {
    return { available: false, field: paths[0] || "routeTruthStatus", value: null };
  }
  return {
    available: true,
    field: paths.find((path) => hasAnyPath(project, [path])) || paths[0] || "routeTruthStatus",
    value: routeReady(project) ? 85 : 35,
  };
}

function familyScore(project = {}, family = "", specs = []) {
  const components = specs.map((paths) =>
    family === "route" && paths.includes("routeTruthStatus")
      ? routeComponent(project, paths)
      : family === "safety" && !hasObservedSafetyEvidence(project)
        ? { available: false, field: paths[0] || "safetyProofStatus", value: null }
        : explicitNumber(project, paths)
  );
  const available = components.filter((component) => component.available);
  const missingFields = components
    .filter((component) => !component.available)
    .map((component) => component.field);
  const score = available.length
    ? Math.round(available.reduce((sum, component) => sum + clamp(component.value), 0) / available.length)
    : null;

  return {
    score,
    available: available.length,
    expected: components.length,
    coveragePct: components.length ? Math.round((available.length / components.length) * 100) : 100,
    missingFields,
    sourceFields: available.map((component) => component.field),
  };
}

function average(values = []) {
  const active = values.filter((value) => Number.isFinite(Number(value))).map(Number);
  if (!active.length) return 0;
  return Math.round(active.reduce((sum, value) => sum + value, 0) / active.length);
}

function first(values = []) {
  return values.find((value) => value !== undefined && value !== null && value !== "") ?? null;
}

function priceChange24h(project = {}) {
  return num(first([project.sevenDayTenXPriceExtension?.priceChange24hPct, project.priceChange24hPct, project.priceChange24h]));
}

function priceChange7d(project = {}) {
  return num(first([project.sevenDayTenXPriceExtension?.priceChange7dPct, project.priceChange7dPct, project.priceChange7d]));
}

function lateChase(project = {}) {
  const status = String(project.sevenDayTenXLateChaseStatus || project.preBreakoutMomentumStage || project.prePump?.status || "");
  return /ALREADY_10X|LATE_CHASE|ALREADY_PUMPED|EXTENDED/.test(status) || priceChange24h(project) >= 85 || priceChange7d(project) >= 220;
}

function utilityBlocked(project = {}) {
  return project.memeOnlySpeculative === true || project.utilityClassification === "MEME_SPECULATION";
}

function deterministicSafetyBlocked(project = {}) {
  return deterministicCandidateBlocks(project).length > 0;
}

function routeOnlyScalpBlock(project = {}) {
  return /ROUTE|QUOTE|STALE/i.test(String(project.scalpMicrostructureLane || ""));
}

function walletFlowMissing(project = {}) {
  return ![
    project.walletFlowScore,
    project.buyerBreadthAccelerationScore,
    project.smartWalletNoveltyScore,
    project.smartWalletArrivalScore,
    project.freshBuyerCount,
    project.rawUniqueBuyers,
    project.uniqueBuyers24h,
    project.buyers24h,
  ].some((value) => value !== undefined && value !== null && value !== "");
}

function hasPromisingEarlySignal(project = {}, score = 0, componentScores = {}) {
  const familyScores = ["upside", "flow", "quality", "proof"]
    .map((family) => componentScores[family]?.score)
    .filter((value) => Number.isFinite(Number(value)));
  const preConsensusScore = first([
    project.preConsensusBreakoutScore,
    project.preConsensusOpportunityScore,
    project.regimeAdjustedOpportunityScore,
    project.preConsensusBreakoutHunter?.preConsensusBreakoutScore,
    project.preConsensusBreakoutHunter?.preConsensusOpportunityScore,
    project.preConsensusBreakoutHunter?.regimeAdjustedOpportunityScore,
  ]);
  return Boolean(
    score >= 45 ||
      familyScores.some((value) => Number(value) >= 62) ||
      [
        project.sevenDayTenXScore,
        project.preBreakoutRadarScore,
        preConsensusScore,
        project.earlyAsymmetryResearchPriorityScore,
        project.capitalMigrationScore,
        project.liquidityFormationScore,
        project.utilityQualityScore,
      ].some((value) => Number.isFinite(Number(value)) && Number(value) >= 62)
  );
}

function scoreFromFamilies(componentScores = {}, dataCoveragePct = 0) {
  let weightedScore = 0;
  let activeWeight = 0;

  for (const [family, weight] of Object.entries(COMPONENT_WEIGHTS)) {
    const score = componentScores[family]?.score;
    if (!Number.isFinite(Number(score))) continue;
    weightedScore += Number(score) * weight;
    activeWeight += weight;
  }

  const baseScore = activeWeight > 0 ? weightedScore / activeWeight : 0;
  const riskPenalty = Number.isFinite(Number(componentScores.risk?.score))
    ? Number(componentScores.risk.score) * 0.24
    : 0;
  const coveragePenalty = dataCoveragePct < 70 ? (70 - dataCoveragePct) * 0.2 : 0;
  return Math.round(clamp(baseScore - riskPenalty - coveragePenalty));
}

function classificationReason(lane = "", project = {}, score = 0, coveragePct = 0, routeChecklist = {}) {
  if (lane === "MARKET_BENCHMARK") {
    return "Established native asset is benchmark context, not an early-discovery scalp candidate.";
  }
  if (lane === "QUARANTINED_IDENTITY_OR_ROUTE") {
    return `Candidate is quarantined until strict identity and route proof are complete: ${routeChecklist.quarantineReason || routeChecklist.missing?.[0] || "missing proof"}.`;
  }
  if (lane === "INVALID_OR_AGGREGATE_IDENTITY") {
    return "Provider row is malformed or appears to describe an aggregate market instead of a tradable token.";
  }
  if (lane === "SAFETY_BLOCKED") return "Deterministic safety, identity, or manipulation blocker prevents scalp research.";
  if (lane === "LATE_CHASE_REJECTED") return "Price action is already extended for high-upside scalp mode.";
  if (lane === "MEME_SPECULATION_EXCLUDED") return "Meme-only speculation is excluded from the real-utility scalp lane.";
  if (String(lane).startsWith("SCALP_NO_TRADE")) return "Scalp microstructure engine rejected current trade conditions.";
  if (lane === "HIGH_UPSIDE_RESEARCH_DEFERRED") {
    return "Project was not selected into the deep high-upside scalp evidence stage this scan.";
  }
  if (lane === "RESEARCH_ONLY_ROUTE_MISSING") {
    return `Candidate stays visible for research, but execution proof is incomplete: ${(routeChecklist.missing || []).slice(0, 3).join(", ") || "fresh route proof"}.`;
  }
  if (lane === "MANUAL_REVIEW") return "Candidate has enough early signal to stay visible, but wallet, buyer, or proof coverage needs manual review before promotion.";
  if (lane === "DATA_STARVED") return `Only ${coveragePct}% of expected high-upside scalp evidence is available.`;
  if (lane === "SCALP_READY_RESEARCH") return "Full high-upside scalp evidence and route checks are strong enough for manual research.";
  if (lane === "HIGH_UPSIDE_WATCH") return "Evidence is developing but remains below scalp-ready thresholds.";
  if (lane === "LOWER_PRIORITY") return `Score ${score} is below the high-upside watch threshold.`;
  return "No primary high-upside scalp lane could be assigned.";
}

function primaryLane(project = {}, score = 0, dataCoveragePct = 0, componentScores = {}, routeChecklist = {}) {
  const strictGate = resolveStrictCandidateGate(project);
  if (isLikelyAggregateCandidate(project)) return "INVALID_OR_AGGREGATE_IDENTITY";
  if (deterministicSafetyBlocked(project)) return "SAFETY_BLOCKED";
  if (strictGate.strictCandidateLane === "MARKET_BENCHMARK") return "MARKET_BENCHMARK";
  if (!strictGate.strictRankEligible) {
    return hasHardIdentityQuarantine(strictGate)
      ? "QUARANTINED_IDENTITY_OR_ROUTE"
      : "RESEARCH_ONLY_ROUTE_MISSING";
  }
  if (lateChase(project)) return "LATE_CHASE_REJECTED";
  if (utilityBlocked(project)) return "MEME_SPECULATION_EXCLUDED";
  if (routeOnlyScalpBlock(project)) {
    return hasPromisingEarlySignal(project, score, componentScores)
      ? "RESEARCH_ONLY_ROUTE_MISSING"
      : dataCoveragePct < MIN_DATA_COVERAGE_PCT
      ? "DATA_STARVED"
      : "LOWER_PRIORITY";
  }
  if (String(project.scalpMicrostructureLane || "").startsWith("SCALP_NO_TRADE")) return project.scalpMicrostructureLane;
  if (!routeReady(project) && hasPromisingEarlySignal(project, score, componentScores)) return "RESEARCH_ONLY_ROUTE_MISSING";
  if (walletFlowMissing(project) && hasPromisingEarlySignal(project, score, componentScores)) return "MANUAL_REVIEW";
  if (dataCoveragePct < MIN_DATA_COVERAGE_PCT) return "DATA_STARVED";
  if (project.scalpMicrostructureLane === "SCALP_WATCHLIST") return "HIGH_UPSIDE_WATCH";
  if (score >= 72) return "SCALP_READY_RESEARCH";
  if (score >= 58) return "HIGH_UPSIDE_WATCH";
  return "LOWER_PRIORITY";
}

export function classifyHighUpsideScalpProject(project = {}) {
  if (isHighUpsideDeepStageDeferred(project)) {
    return markHighUpsideScalpResearchDeferred(project);
  }

  const componentScores = Object.fromEntries(
    Object.entries(HIGH_UPSIDE_SCALP_COMPONENTS).map(([family, specs]) => [
      family,
      familyScore(project, family, specs),
    ])
  );
  const available = Object.values(componentScores).reduce((sum, family) => sum + family.available, 0);
  const expected = Object.values(componentScores).reduce((sum, family) => sum + family.expected, 0);
  const dataCoveragePct = expected ? Math.round((available / expected) * 100) : 100;
  const missingFields = Object.values(componentScores)
    .flatMap((family) => family.missingFields)
    .slice(0, MAX_MISSING_FIELDS);
  const score = scoreFromFamilies(componentScores, dataCoveragePct);
  const routeChecklist = routeProofChecklist(project);
  const strictGate = resolveStrictCandidateGate(project);
  const lane = primaryLane(project, score, dataCoveragePct, componentScores, routeChecklist);
  const walletMissing = walletFlowMissing(project);
  const highUpsideScalpMissingProof = [
    ...(strictGate.strictRankEligible ? [] : strictGate.candidateQuarantineReasons),
    ...(routeReady(project) ? [] : routeChecklist.missing),
    ...(walletMissing ? ["buyer breadth or wallet-flow proof"] : []),
    ...missingFields,
  ].filter(Boolean);

  return {
    ...project,
    highUpsideScalpScore: score,
    highUpsideScalpLane: lane,
    highUpsideScalpComponentScores: Object.fromEntries(
      Object.entries(componentScores).map(([family, value]) => [family, value.score])
    ),
    highUpsideScalpComponentCoverage: componentScores,
    highUpsideScalpDataCoverage: dataCoveragePct,
    highUpsideScalpMissingFields: missingFields,
    highUpsideScalpMissingProof: [...new Set(highUpsideScalpMissingProof)].slice(0, MAX_MISSING_FIELDS),
    highUpsideScalpRouteChecklist: routeChecklist,
    highUpsideScalpNextProofNeeded: highUpsideScalpMissingProof[0] || null,
    highUpsideScalpProofCategory:
      !strictGate.strictRankEligible ? "identity_route_quarantine" : !routeReady(project) ? "route" : walletMissing ? "wallet_flow" : dataCoveragePct < MIN_DATA_COVERAGE_PCT ? "data_coverage" : "none",
    highUpsideScalpClassificationReason: classificationReason(lane, project, score, dataCoveragePct, routeChecklist),
    highUpsideScalpQuarantineReason: strictGate.candidateQuarantineReason,
    highUpsideScalpRouteVerificationStatus: strictGate.routeVerificationStatus,
    strictCandidateGate: strictGate,
    ...strictGate,
    highUpsideScalpDiagnostics: {
      routeReady: routeReady(project),
      lateChase: lateChase(project),
      utilityBlocked: utilityBlocked(project),
      deterministicSafetyBlocked: deterministicSafetyBlocked(project),
      walletFlowMissing: walletMissing,
      routeProofMissing: routeChecklist.missing,
      nextSingleProofNeeded: highUpsideScalpMissingProof[0] || null,
      missingFieldCount: missingFields.length,
      componentCoveragePct: dataCoveragePct,
      componentScoreMedian: average(
        Object.values(componentScores)
          .map((family) => family.score)
          .filter((value) => Number.isFinite(Number(value)))
      ),
    },
  };
}

export function analyzeHighUpsideScalpClassificationBatch(projects = []) {
  return (Array.isArray(projects) ? projects : []).map((project) =>
    classifyHighUpsideScalpProject(project)
  );
}
