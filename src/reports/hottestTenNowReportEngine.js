import fs from "fs";
import path from "path";
import { analyzeUtilityQuality } from "../engines/utilityQualityEngine.js";
import { isLiveExecutionReady } from "../execution/routeTruthV2.js";
import { resolveStrictCandidateGate } from "../execution/routeResolver.js";
import {
  aggregateIdentityReason,
  isGenericMarketIdentity,
  isLikelyAggregateCandidate,
  isLikelyMemeIdentity,
} from "../identity/displayIdentityGuard.js";

const TARGET_COUNT = 10;
const MAX_AUDIT_ROWS = 50;
const MAX_UTILITY_SMALL_CAP_USD = Number(process.env.HOTTEST_TEN_MAX_MARKET_CAP_USD || 75_000_000);
const HARD_SAFETY_BLOCKER_PATTERN =
  /honeypot|verified scam|scam confirmed|identity conflict|contract mismatch|chain mismatch|cannot sell|sell restricted|sell blocked|blacklist|freeze authority|critical safety|malicious|trap token/i;
const ROUTE_GAP_PATTERN = /route|quote|sell path|buy path|execution|slippage|order depth|market depth/i;

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
  return active.reduce((sum, value) => sum + value, 0) / active.length;
}

function upper(value = "") {
  return String(value || "").toUpperCase();
}

function normalizeDisplayText(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter(
      (part) =>
        part &&
        ![
          "coin",
          "dao",
          "dex",
          "exchange",
          "finance",
          "network",
          "official",
          "protocol",
          "swap",
          "token",
        ].includes(part)
    )
    .join(" ")
    .trim();
}

function displayFamilyKey(project = {}) {
  const strictGate = project.strictCandidateGate || resolveStrictCandidateGate(project);
  if (strictGate.canonicalId) return strictGate.canonicalId;
  const symbol = upper(first([project.symbol, project.rawCandidate?.symbol, project.marketData?.symbol])).replace(/[^A-Z0-9]/g, "");
  const name = normalizeDisplayText(first([project.name, project.projectName, project.rawCandidate?.name, project.marketData?.name]));
  if (symbol && name) return `${symbol}:${name}`;
  if (symbol) return `${symbol}:${normalizeDisplayText(first([project.chain, project.canonicalChain, project.chainId])) || "unknown-chain"}`;
  if (name) return `name:${name}`;
  return "";
}

function takeUniqueDisplayFamilies(projects = [], limit = TARGET_COUNT) {
  const selected = [];
  const seen = new Set();
  for (const project of projects) {
    const key = displayFamilyKey(project);
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    selected.push(project);
    if (selected.length >= limit) break;
  }
  return selected;
}

function priceUsd(project = {}) {
  return num(first([project.priceUsd, project.price, project.marketData?.priceUsd, project.rawCandidate?.priceUsd]));
}

function marketCapUsd(project = {}) {
  return num(
    first([
      project.sevenDayTenXMarketCap,
      project.circulatingMarketCapUsd,
      project.marketCapUsd,
      project.marketCap,
      project.estimatedMarketCapUsd,
      project.marketData?.marketCapUsd,
      project.rawCandidate?.marketCapUsd,
    ])
  );
}

function liquidityUsd(project = {}) {
  return num(
    first([
      project.sevenDayTenXLiquidityUsd,
      project.stableExitLiquidityUsd,
      project.dexLiquidityUsd,
      project.liquidityUsd,
      project.activeLiquidityUsd,
      project.marketData?.liquidityUsd,
      project.rawCandidate?.liquidityUsd,
    ])
  );
}

function priceChange24hPct(project = {}) {
  return num(
    first([
      project.sevenDayTenXPriceExtension?.priceChange24hPct,
      project.priceChange24hPct,
      project.priceChange24h,
      project.marketData?.priceChange24hPct,
      project.rawCandidate?.priceChange24hPct,
    ])
  );
}

function priceChange7dPct(project = {}) {
  return num(
    first([
      project.sevenDayTenXPriceExtension?.priceChange7dPct,
      project.priceChange7dPct,
      project.priceChange7d,
      project.marketData?.priceChange7dPct,
      project.rawCandidate?.priceChange7dPct,
    ])
  );
}

function executionState(project = {}) {
  return upper(project.executionProofState || project.executionProof?.executionProofState || project.executionProof?.executionStatus || project.executionStatus || "");
}

function executionTier(project = {}) {
  const state = executionState(project);
  if (state === "LIVE_EXECUTION_READY") return 100;
  if (state === "SELL_SIMULATION_PASSED") return 92;
  if (["TAXES_VERIFIED", "ORDER_BOOK_DEPTH_VERIFIED"].includes(state)) return 84;
  if (state === "SELL_QUOTE_VERIFIED") return 76;
  if (state === "BUY_QUOTE_VERIFIED") return 58;
  if (state === "PAIR_IDENTITY_VERIFIED") return 42;
  if (state === "MARKET_OBSERVED") return 25;
  if (state === "VERIFIED") return 72;
  if (state === "PARTIALLY_VERIFIED") return 55;
  return 0;
}

function buySellRouteVerified(project = {}) {
  const strictGate = project.strictCandidateGate || resolveStrictCandidateGate(project);
  return strictGate.strictRankEligible === true && isLiveExecutionReady({
    ...project,
    routeTruthStatus: "LIVE_EXECUTION_READY",
  });
}

function combinedBlockers(project = {}) {
  return [
    ...(project.sevenDayTenXBlockers || []),
    ...(project.finalSelectionBlockers || []),
    ...(project.sniperIntegrityBlockers || []),
    ...(project.scalpMicrostructureBlockers || []),
    ...(project.blockers || []),
    ...(project.failureReasons || []),
  ]
    .filter(Boolean)
    .join(" ");
}

function deterministicSafetyBlocked(project = {}) {
  const blockers = combinedBlockers(project);
  return Boolean(
    project.honeypotDetected === true ||
      project.verifiedScam === true ||
      project.sellRestricted === true ||
      project.identityConflict === true ||
      project.canonicalIdentityHardBlock === true ||
      project.instantSafetyStatus === "CRITICAL" ||
      num(project.contractAuthorityRiskScore) >= 70 ||
      num(project.liquidityControlRiskScore) >= 75 ||
      num(project.washTradingRiskScore) >= 75 ||
      HARD_SAFETY_BLOCKER_PATTERN.test(blockers)
  );
}

function lateChase(project = {}) {
  const stage = upper(
    [
      project.sevenDayTenXLateChaseStatus,
      project.preBreakoutMomentumStage,
      project.prePump?.status,
      project.candidateLifecycleStage,
    ].join(" ")
  );
  return Boolean(
    project.highUpsideScalpLane === "LATE_CHASE_REJECTED" ||
      project.scalpMicrostructureLane === "SCALP_NO_TRADE_LATE_CHASE" ||
    /ALREADY_10X|LATE_CHASE|ALREADY_PUMPED|EXTENDED|OVERHEATED/.test(stage) ||
      priceChange24hPct(project) >= 85 ||
      priceChange7dPct(project) >= 220
  );
}

function utilityBlocked(project = {}) {
  const strongMemeUtilityOverride =
    project.realUtilityQualified === true ||
    project.utilityClassification === "REAL_UTILITY" ||
    (num(project.utilityQualityScore) >= 65 &&
      Array.isArray(project.utilityEvidenceFamilies) &&
      project.utilityEvidenceFamilies.length >= 3);
  const memeIdentityWithoutUtility = isLikelyMemeIdentity(project) && !strongMemeUtilityOverride;
  return Boolean(
    project.memeOnlySpeculative === true ||
      project.utilityClassification === "MEME_SPECULATION" ||
      project.utilityQualityVerdict === "Meme-only speculation" ||
      memeIdentityWithoutUtility
  );
}

function genericMarketLabelWithoutProjectProof(project = {}) {
  if (!isGenericMarketIdentity(project)) return false;
  const hasProjectProof =
    utilityEvidenceStrong(project) ||
    Boolean(first([project.website, project.docsUrl, project.githubRepo, project.roadmap, project.productEvidence]));
  const hasSpecificTradableAnchor = Boolean(
    first([project.tokenAddress, project.contractAddress, project.canonicalAddress]) &&
      first([project.poolAddress, project.pairAddress, project.primaryTradablePool, project.marketPair])
  );
  return !(hasProjectProof && hasSpecificTradableAnchor);
}

function withUtilityAnalysis(project = {}) {
  const analyzed = analyzeUtilityQuality(project);
  if (project.memeOnlySpeculative === true || project.utilityClassification === "MEME_SPECULATION") {
    return {
      ...analyzed,
      memeOnlySpeculative: true,
      utilityClassification: "MEME_SPECULATION",
    };
  }
  return analyzed;
}

function utilityEvidenceStrong(project = {}) {
  return Boolean(
    project.realUtilityQualified === true ||
      ["REAL_UTILITY", "UTILITY_RESEARCH", "MIXED_MEME_UTILITY"].includes(project.utilityClassification) ||
      num(project.utilityQualityScore) >= 45 ||
      num(project.realUtilityScore) >= 45 ||
      (Array.isArray(project.utilityEvidenceFamilies) && project.utilityEvidenceFamilies.length >= 2)
  );
}

function hardRejectionReason(project = {}) {
  if (deterministicSafetyBlocked(project)) return "DETERMINISTIC_SAFETY_OR_SCALP_BLOCK";
  if (isLikelyAggregateCandidate(project)) return "MALFORMED_OR_AGGREGATE_IDENTITY";
  if (lateChase(project)) return "ALREADY_EXTENDED_OR_LATE_CHASE";
  if (marketCapUsd(project) > MAX_UTILITY_SMALL_CAP_USD) return "TOO_LARGE_FOR_UTILITY_SMALL_CAP_BOARD";
  if (utilityBlocked(project)) return "MEME_ONLY_OR_NO_VERIFIED_UTILITY";
  if (genericMarketLabelWithoutProjectProof(project)) return "GENERIC_MARKET_LABEL_NEEDS_PROJECT_PROOF";
  const strictGate = project.strictCandidateGate || resolveStrictCandidateGate(project);
  if (strictGate.strictCandidateLane === "MARKET_BENCHMARK") return "MARKET_BENCHMARK";
  if (!strictGate.strictRankEligible) return "QUARANTINED_IDENTITY_OR_ROUTE";
  return "";
}

function routeEvidenceMissing(project = {}) {
  const scalpLane = upper(project.scalpMicrostructureLane);
  const blockers = combinedBlockers(project);
  return Boolean(
    !buySellRouteVerified(project) ||
      /ROUTE|QUOTE|THIN_LIQUIDITY|NO_TRADE/.test(scalpLane) ||
      ROUTE_GAP_PATTERN.test(blockers)
  );
}

function hasIdentityHint(project = {}) {
  return Boolean(
    first([
      project.symbol,
      project.name,
      project.projectName,
      project.tokenAddress,
      project.contractAddress,
      project.canonicalAddress,
      project.projectId,
      project.coingeckoId,
      project.rawCandidate?.symbol,
      project.rawCandidate?.name,
    ])
  );
}

function hasMarketHint(project = {}) {
  return Boolean(
    priceUsd(project) > 0 ||
      marketCapUsd(project) > 0 ||
      liquidityUsd(project) > 0 ||
      num(first([project.volume24hUsd, project.volume24h, project.marketData?.volume24h, project.rawCandidate?.volume24h])) > 0
  );
}

function hasSecurityHint(project = {}) {
  return Boolean(
    project.securityEvidenceSummary ||
      project.securityEvidence ||
      project.instantSafetyStatus ||
      project.contractVerified === true ||
      project.honeypotDetected === false ||
      num(project.contractAuthorityRiskScore) > 0 ||
      num(project.trapRiskScore) > 0
  );
}

function hasUtilityHint(project = {}) {
  return Boolean(
    utilityEvidenceStrong(project) ||
      project.developerActivityScore ||
      project.developerAccelerationScore ||
      project.githubProScore ||
      project.githubRepo ||
      project.repository ||
      project.website ||
      project.roadmap ||
      project.productEvidence ||
      project.ecosystemIntegrationScore
  );
}

function hasBuyerOrWalletHint(project = {}) {
  return Boolean(
    first([
      project.buyers24h,
      project.uniqueBuyers24h,
      project.buyerBreadthAccelerationScore,
      project.buyPressureScore,
      project.holderGrowthScore,
      project.walletClusterRiskScore,
      project.smartWalletScore,
      project.smartWalletArrivalScore,
    ])
  );
}

function missingInfoNeeded(project = {}) {
  const strictGate = project.strictCandidateGate || resolveStrictCandidateGate(project);
  const missing = [];
  missing.push(...(strictGate.strictCandidateMissingProof || []));
  if (!first([project.chain, project.canonicalChain, project.chainId, project.marketData?.chain])) {
    missing.push("canonical chain");
  }
  if (!first([project.tokenAddress, project.contractAddress, project.canonicalAddress, project.marketData?.tokenAddress])) {
    missing.push("canonical token contract");
  }
  if (!first([project.poolAddress, project.pairAddress, project.primaryTradablePool, project.marketData?.poolAddress])) {
    missing.push("verified pool or market");
  }
  if (liquidityUsd(project) <= 0) missing.push("executable liquidity");
  if (marketCapUsd(project) <= 0) missing.push("circulating market cap");
  if (routeEvidenceMissing(project)) missing.push("fresh buy quote and sell route");
  if (!hasSecurityHint(project)) missing.push("free safety proof");
  if (!hasBuyerOrWalletHint(project)) missing.push("buyer breadth and wallet flow");
  if (!hasUtilityHint(project)) missing.push("real utility, roadmap, or developer proof");
  if (
    !first([
      project.sourceTruthScore,
      project.sourceReliabilityScore,
      project.institutionalDataProvenanceScore,
      project.evidenceCoverageScore,
      project.opportunityEvidenceCoverage,
    ])
  ) {
    missing.push("independent source provenance");
  }
  return missing.slice(0, 12);
}

function nextSourcesNeeded(project = {}) {
  const missing = missingInfoNeeded(project);
  const sourceMap = {
    "canonical chain": ["DexScreener", "GeckoTerminal", "official docs"],
    "canonical token contract": ["DexScreener", "GeckoTerminal", "official website", "block explorer"],
    "verified pool or market": ["DexScreener", "GeckoTerminal", "DEX aggregator"],
    "executable liquidity": ["DexScreener", "GeckoTerminal", "DEX quote adapter"],
    "circulating market cap": ["CoinGecko", "CoinPaprika", "CoinLore", "supply explorer"],
    "fresh buy quote and sell route": ["LI.FI keyless quote", "chain-native DEX quote", "CEX public order book", "Jupiter (API key required)", "0x (API key required)"],
    "free safety proof": ["GoPlus", "RugCheck", "Sourcify", "Blockscout", "Etherscan-compatible explorer"],
    "buyer breadth and wallet flow": ["GeckoTerminal trades", "native RPC", "block explorer"],
    "real utility, roadmap, or developer proof": ["GitHub", "official docs", "project website", "package registry"],
    "independent source provenance": ["source truth router", "official links", "independent market provider"],
  };
  return [...new Set(missing.flatMap((item) => sourceMap[item] || []))].slice(0, 12);
}

function reasonNotQualified(project = {}, score = 0) {
  const strictGate = project.strictCandidateGate || resolveStrictCandidateGate(project);
  if (strictGate.strictCandidateLane === "MARKET_BENCHMARK") return "MARKET_BENCHMARK_CONTEXT_NOT_EARLY_DISCOVERY";
  if (!strictGate.strictRankEligible) return strictGate.candidateQuarantineReason || "STRICT_IDENTITY_OR_ROUTE_PROOF_MISSING";
  const hardReason = hardRejectionReason(project);
  if (hardReason === "MALFORMED_OR_AGGREGATE_IDENTITY") return aggregateIdentityReason(project) || hardReason;
  if (hardReason) return hardReason;
  if (!buySellRouteVerified(project)) return "NEEDS_FRESH_BUY_AND_SELL_ROUTE";
  if (missingInfoNeeded(project).length) return "NEEDS_MISSING_INFO_CONFIRMATION";
  if (score < 58) return "LOWER_PRIORITY_THAN_CURRENT_BOARD";
  return "";
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
  const asymmetry = average([
    project.sevenDayTenXScore,
    project.preBreakoutRadarScore,
    preConsensusScore,
    project.earlyAsymmetryResearchPriorityScore,
    project.progressiveOpportunityScore,
  ]);
  const capitalFlow = average([
    project.capitalMigrationScore,
    project.capitalFlowScore,
    project.buyerBreadthAccelerationScore,
    project.buyPressureScore,
    project.liquidityFormationScore,
    project.liquidityExpansionScore,
    project.organicDemandIntegrityScore,
  ]);
  const utility = average([
    project.utilityQualityScore,
    project.realUtilityScore,
    project.developerAccelerationScore,
    project.developerActivityScore,
    project.githubProScore,
    project.ecosystemIntegrationScore,
    project.tokenomicsScore,
  ]);
  const proof = average([
    project.sourceTruthScore,
    project.sourceReliabilityScore,
    project.institutionalDataProvenanceScore,
    project.evidenceCoverageScore,
    project.opportunityEvidenceCoverage,
    project.sniperEvidenceCoverage,
  ]);
  const execution = average([
    executionTier(project),
    project.scalpMicrostructureScore,
    project.moneyScore,
  ]);
  const riskPenalty = average([
    project.trapRiskScore,
    project.contractAuthorityRiskScore,
    project.liquidityControlRiskScore,
    project.washTradingRiskScore,
    project.walletClusterRiskScore,
    project.deployerRiskScore,
    project.sellPressureScore,
  ]);
  const subCentBonus = priceUsd(project) > 0 && priceUsd(project) < 0.01 ? 4 : 0;
  const smallCapBonus = marketCapUsd(project) > 0 && marketCapUsd(project) <= 75_000_000 ? 4 : 0;
  const utilityProofAdjustment = utilityEvidenceStrong(project) ? 5 : -7;

  return Math.round(
    clamp(
      asymmetry * 0.27 +
        capitalFlow * 0.22 +
        utility * 0.18 +
        proof * 0.14 +
        execution * 0.19 -
        riskPenalty * 0.24 +
        subCentBonus +
        smallCapBonus +
        utilityProofAdjustment
    )
  );
}

function lane(project = {}, score = 0) {
  const hardReason = hardRejectionReason(project);
  if (hardReason) return hardReason;
  const strictGate = project.strictCandidateGate || resolveStrictCandidateGate(project);
  if (strictGate.strictCandidateLane === "MARKET_BENCHMARK") return "MARKET_BENCHMARK";
  if (!strictGate.strictRankEligible) return "QUARANTINED_IDENTITY_OR_ROUTE";
  if (project.liveExecutionReady === true || project.executionProof?.liveExecutionReady === true) return "LIVE_EXECUTION_READY_RESEARCH";
  if (buySellRouteVerified(project) && score >= 72) return "CURRENT_HIGH_UPSIDE_RESEARCH";
  if (buySellRouteVerified(project) && score >= 58) return "WATCHLIST_NEEDS_MORE_CONFIRMATION";
  if (hasIdentityHint(project) && hasMarketHint(project) && score > 0) return "RESEARCH_BOARD_NEEDS_MISSING_INFO";
  return "LOWER_PRIORITY";
}

function researchBoardBackfillEligible(project = {}) {
  return Boolean(
    project.strictRankEligible === true &&
    project.hottestTenNowLane === "LOWER_PRIORITY" &&
      project.hottestTenNowRejectionReason === "LOWER_PRIORITY" &&
      hasIdentityHint(project) &&
      missingInfoNeeded(project).length > 0 &&
      num(project.hottestTenNowScore) > 0
  );
}

function compactCandidate(project = {}, rank = null) {
  const score = project.hottestTenNowScore ?? scoreProject(project);
  const strictGate = project.strictCandidateGate || resolveStrictCandidateGate(project);
  return {
    rank,
    symbol: project.symbol || "UNKNOWN",
    name: project.name || strictGate.tokenName || "Unknown",
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
    quarantineReason: strictGate.candidateQuarantineReason || null,
    quarantineReasons: strictGate.candidateQuarantineReasons || [],
    strictIdentityVerified: strictGate.strictIdentityVerified === true,
    strictRouteVerified: strictGate.strictRouteVerified === true,
    strictRankEligible: strictGate.strictRankEligible === true,
    priceUsd: priceUsd(project),
    subCent: priceUsd(project) > 0 && priceUsd(project) < 0.01,
    marketCapUsd: marketCapUsd(project),
    liquidityUsd: liquidityUsd(project),
    priceChange24hPct: priceChange24hPct(project),
    priceChange7dPct: priceChange7dPct(project),
    hottestTenNowScore: score,
    lane: project.hottestTenNowLane || lane(project, score),
    executionProofState: executionState(project) || "UNKNOWN",
    liveExecutionReady: Boolean(project.liveExecutionReady || project.executionProof?.liveExecutionReady),
    buySellRouteVerified: buySellRouteVerified(project),
    reasonNotQualified: project.hottestTenNowReasonNotQualified || reasonNotQualified(project, score),
    missingInfoNeeded: missingInfoNeeded(project),
    nextSourcesNeeded: nextSourcesNeeded(project),
    scalpMicrostructureLane: project.scalpMicrostructureLane || "NOT_RUN",
    scalpEstimatedTotalCostPct: project.scalpEstimatedTotalCostPct || 0,
    sevenDayTenXScore: project.sevenDayTenXScore || 0,
    earlyAsymmetryResearchPriorityScore: project.earlyAsymmetryResearchPriorityScore || 0,
    preBreakoutRadarScore: project.preBreakoutRadarScore || 0,
    capitalMigrationScore: project.capitalMigrationScore || 0,
    buyerBreadthAccelerationScore: project.buyerBreadthAccelerationScore || 0,
    liquidityFormationScore: project.liquidityFormationScore || 0,
    utilityQualityScore: project.utilityQualityScore || 0,
    sourceTruthScore: project.sourceTruthScore || 0,
    riskSignals: {
      trapRiskScore: project.trapRiskScore || 0,
      washTradingRiskScore: project.washTradingRiskScore || 0,
      walletClusterRiskScore: project.walletClusterRiskScore || 0,
      sellPressureScore: project.sellPressureScore || 0,
    },
    reasons: (project.sevenDayTenX?.reasons || project.moneyRankDrivers || project.preBreakoutRadarReasons || []).slice(0, 8),
    analysisThesis: [
      project.utilityClassification ? `Utility: ${project.utilityClassification}` : null,
      project.preBreakoutRadarState ? `Timing: ${project.preBreakoutRadarState}` : null,
      project.routeVerificationStatus || strictGate.routeVerificationStatus ? `Route: ${strictGate.routeVerificationStatus || project.routeVerificationStatus}` : null,
      strictGate.candidateQuarantineReason ? `Quarantine: ${strictGate.candidateQuarantineReason}` : null,
    ].filter(Boolean),
    missingEvidence: [
      ...(project.sevenDayTenXMissingEvidence || []),
      ...(project.moneyMissingEvidence || []),
      ...missingInfoNeeded(project),
    ].slice(0, 12),
    requiredManualChecks: [
      "Confirm official token identity, chain, contract, and pool.",
      "Refresh buy quote and sell quote immediately before any manual trade.",
      "Check taxes, slippage, gas, order depth, holder concentration, and sell restrictions.",
      "Reject if the move becomes late-chase before entry.",
    ],
  };
}

export function summarizeHottestTenNow(projects = [], meta = {}) {
  const scored = (Array.isArray(projects) ? projects : [])
    .map((project) => {
      const utilityAnalyzed = withUtilityAnalysis(project);
      const strictGate = resolveStrictCandidateGate(utilityAnalyzed);
      const strictAnalyzed = {
        ...utilityAnalyzed,
        ...strictGate,
        strictCandidateGate: strictGate,
      };
      const score = scoreProject(strictAnalyzed);
      return {
        ...strictAnalyzed,
        hottestTenNowScore: score,
        hottestTenNowLane: lane(strictAnalyzed, score),
        hottestTenNowRejectionReason: hardRejectionReason(strictAnalyzed) || (lane(strictAnalyzed, score) === "LOWER_PRIORITY" ? "LOWER_PRIORITY" : ""),
        hottestTenNowReasonNotQualified: reasonNotQualified(strictAnalyzed, score),
      };
    })
    .sort((a, b) => num(b.hottestTenNowScore) - num(a.hottestTenNowScore));

  const qualified = scored.filter((project) =>
    ["LIVE_EXECUTION_READY_RESEARCH", "CURRENT_HIGH_UPSIDE_RESEARCH"].includes(project.hottestTenNowLane)
  );
  const watchlist = scored.filter((project) =>
    ["WATCHLIST_NEEDS_MORE_CONFIRMATION"].includes(project.hottestTenNowLane)
  );
  const researchBackfill = scored.filter(researchBoardBackfillEligible);
  const quarantinedIdentityOrRoute = scored.filter((project) => project.hottestTenNowLane === "QUARANTINED_IDENTITY_OR_ROUTE");
  const marketBenchmarks = scored.filter((project) => project.hottestTenNowLane === "MARKET_BENCHMARK");
  const rejected = scored.filter((project) => project.hottestTenNowRejectionReason);
  const topTen = takeUniqueDisplayFamilies(qualified, TARGET_COUNT);
  const topTenBoard = takeUniqueDisplayFamilies([...qualified, ...watchlist, ...researchBackfill], TARGET_COUNT);
  const compactTopTenBoard = topTenBoard.map((project, index) => compactCandidate(project, index + 1));
  const compactQualified = topTen.map((project, index) => compactCandidate(project, index + 1));

  return {
    generatedAt: new Date().toISOString(),
    scanRunId: meta.scanRunId || meta.runId || process.env.GITHUB_RUN_ID || null,
    codeCommitSha: meta.codeCommitSha || process.env.GITHUB_SHA || null,
    dataCutoffTimestamp: meta.dataCutoffTimestamp || meta.completedAt || null,
    status: topTen.length
      ? "PASS"
      : topTenBoard.length
        ? "RESEARCH_BOARD_VERIFIED_NEEDS_CONFIRMATION"
        : quarantinedIdentityOrRoute.length
          ? "NO_RANKABLE_RESULTS_IDENTITY_ROUTE_QUARANTINE"
        : scored.length
          ? "NO_CURRENT_BUY_READY_RESEARCH"
          : "NO_PROJECTS",
    mode: "ALWAYS_HIGH_UPSIDE_CURRENT_MOMENT",
    objective:
      "Rank strict current high-upside candidates and keep a separate top-ten research board for non-danger names that still need missing proof.",
    disclaimer:
      "Research output only. Not financial advice, not a buy/sell recommendation, and not a profit guarantee.",
    projectsAnalyzed: scored.length,
    targetCount: TARGET_COUNT,
    qualifiedNowCount: qualified.length,
    qualifiedReturnedCount: topTen.length,
    buyReadyReturnedCount: topTen.length,
    researchReturnedCount: topTenBoard.length,
    returnedCount: topTenBoard.length,
    currentResearchBoardCount: topTenBoard.length,
    qualifiedShortfallToTen: Math.max(0, TARGET_COUNT - topTen.length),
    shortfallToTen: Math.max(0, TARGET_COUNT - topTenBoard.length),
    researchBoardShortfallToTen: Math.max(0, TARGET_COUNT - topTenBoard.length),
    confirmationGapCount: topTenBoard.filter((project) =>
      ["WATCHLIST_NEEDS_MORE_CONFIRMATION", "RESEARCH_BOARD_NEEDS_MISSING_INFO", "LOWER_PRIORITY"].includes(project.hottestTenNowLane)
    ).length,
    researchBoardMode: "STRICT_QUALIFIED_PLUS_MISSING_INFO_AND_BEST_AVAILABLE_RECOVERY",
    strictRankEligibilityRequired: true,
    notForced: true,
    topTenResearchWorthy: compactTopTenBoard,
    topTenCurrentResearchBoard: compactTopTenBoard,
    topTenQualifiedNow: compactQualified,
    topTenHighestRatedNow: compactQualified,
    watchlistNeedsMoreConfirmation: watchlist.slice(0, MAX_AUDIT_ROWS).map((project, index) => compactCandidate(project, index + 1)),
    quarantinedIdentityOrRoute: quarantinedIdentityOrRoute.slice(0, MAX_AUDIT_ROWS).map((project, index) => compactCandidate(project, index + 1)),
    marketBenchmarks: marketBenchmarks.slice(0, MAX_AUDIT_ROWS).map((project, index) => compactCandidate(project, index + 1)),
    rejectedOrNotCurrent: rejected.slice(0, MAX_AUDIT_ROWS).map((project, index) => ({
      ...compactCandidate(project, index + 1),
      rejectionReason: project.hottestTenNowRejectionReason,
    })),
    countsByLane: scored.reduce((counts, project) => {
      counts[project.hottestTenNowLane] = (counts[project.hottestTenNowLane] || 0) + 1;
      return counts;
    }, {}),
    operatingRules: [
      "Do not force ten candidates when fewer than ten have enough evidence.",
      "Do not let aggregate chain, category, protocol TVL, or malformed provider rows fill the research board.",
      "Do not let generic narrative or chain labels fill the research board without specific project proof.",
      "Do not chase coins already up hundreds of percent.",
      `Do not put projects above ${MAX_UTILITY_SMALL_CAP_USD.toLocaleString("en-US")} market cap on the utility-small-cap board.`,
      "Do not rank meme-only hype above real-utility candidates.",
      "Do not call a route current-moment ready without buy and sell path evidence.",
      "Do not rank symbol-only, contract-missing, pair-missing, stale, wrapped-unverified, or native-asset mismatch candidates.",
    ],
    missingInfoRecoverySources: [
      "DexScreener and GeckoTerminal for live pools, liquidity, price, volume, and pair identity.",
      "LI.FI keyless and chain-native DEX quote APIs for buy/sell confirmation; keyed Jupiter or 0x only when configured.",
      "Blockscout and Etherscan-compatible explorers for contract source, ABI, deployer, holders, and authority evidence.",
      "GoPlus, RugCheck, Sourcify, and explorer bytecode/source checks for free safety evidence.",
      "GitHub, official docs, package registries, and project websites for real-utility and roadmap confirmation.",
    ],
  };
}

export function writeHottestTenNowReport(projects = [], meta = {}) {
  const reportsDir = path.resolve("reports");
  fs.mkdirSync(reportsDir, { recursive: true });
  const report = summarizeHottestTenNow(projects, meta);
  const filePath = path.join(reportsDir, "hottest-ten-now.json");
  fs.writeFileSync(filePath, JSON.stringify(report, null, 2));
  return { filePath, report };
}
