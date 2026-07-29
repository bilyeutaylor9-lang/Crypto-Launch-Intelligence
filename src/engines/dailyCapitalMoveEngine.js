import { isLiveExecutionReady, executionTruthState } from "../execution/routeTruthV2.js";
import { resolveStrictCandidateGate } from "../execution/routeResolver.js";
import {
  hasCleanDisplayIdentity,
  isLikelyAggregateCandidate,
  isLikelyMemeIdentity,
} from "../identity/displayIdentityGuard.js";

const TARGET_BACKUPS = 4;
const TARGET_WATCHLIST = 10;
const MAX_PRICE_CHANGE_24H_PCT = Number(process.env.DAILY_CAPITAL_MAX_PRICE_CHANGE_24H_PCT || 85);
const MAX_PRICE_CHANGE_7D_PCT = Number(process.env.DAILY_CAPITAL_MAX_PRICE_CHANGE_7D_PCT || 220);
const MIN_LIQUIDITY_USD = Number(process.env.DAILY_CAPITAL_MIN_LIQUIDITY_USD || 25000);
const MAX_MARKET_CAP_USD = Number(process.env.DAILY_CAPITAL_MAX_MARKET_CAP_USD || 75000000);

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

function priceUsd(project = {}) {
  return num(first([project.priceUsd, project.price, project.marketData?.priceUsd, project.rawCandidate?.priceUsd]));
}

function marketCapUsd(project = {}) {
  return num(first([
    project.circulatingMarketCapUsd,
    project.marketCapUsd,
    project.marketCap,
    project.estimatedMarketCapUsd,
    project.sevenDayTenXMarketCap,
    project.marketData?.marketCapUsd,
    project.rawCandidate?.marketCapUsd,
  ]));
}

function liquidityUsd(project = {}) {
  return num(first([
    project.stableExitLiquidityUsd,
    project.dexLiquidityUsd,
    project.liquidityUsd,
    project.activeLiquidityUsd,
    project.sevenDayTenXLiquidityUsd,
    project.marketData?.liquidityUsd,
    project.rawCandidate?.liquidityUsd,
  ]));
}

function priceChange24hPct(project = {}) {
  return num(first([
    project.priceChange24hPct,
    project.priceChange24h,
    project.sevenDayTenXPriceExtension?.priceChange24hPct,
    project.marketData?.priceChange24hPct,
  ]));
}

function priceChange7dPct(project = {}) {
  return num(first([
    project.priceChange7dPct,
    project.priceChange7d,
    project.sevenDayTenXPriceExtension?.priceChange7dPct,
    project.marketData?.priceChange7dPct,
  ]));
}

function hasIdentity(project = {}) {
  return resolveStrictCandidateGate(project).strictIdentityVerified === true;
}

function hardSafetyBlocked(project = {}) {
  const blockers = [
    ...(project.finalSelectionBlockers || []),
    ...(project.sniperIntegrityBlockers || []),
    ...(project.scalpMicrostructureBlockers || []),
    ...(project.blockers || []),
  ].join(" ");
  return Boolean(
    project.honeypotDetected === true ||
      project.verifiedScam === true ||
      project.sellRestricted === true ||
      project.identityConflict === true ||
      project.canonicalIdentityHardBlock === true ||
      upper(project.instantSafetyStatus) === "CRITICAL" ||
      upper(project.highUpsideScalpLane) === "SCALP_NO_TRADE_SAFETY_BLOCK" ||
      (upper(project.finalSelectionState || project.finalState) === "BLOCKED" && /risk|trap|safety|honeypot|proofverdict/i.test(blockers)) ||
      num(project.riskScore) >= 80 ||
      num(project.trapRiskScore) >= 70 ||
      num(project.contractAuthorityRiskScore) >= 70 ||
      num(project.liquidityControlRiskScore) >= 75 ||
      num(project.washTradingRiskScore) >= 75 ||
      /honeypot|scam|identity conflict|contract mismatch|cannot sell|sell restricted|blacklist|freeze authority|critical safety|malicious/i.test(blockers)
  );
}

function lateChase(project = {}) {
  const state = upper([
    project.sevenDayTenXLateChaseStatus,
    project.preBreakoutMomentumStage,
    project.prePump?.status,
    project.candidateLifecycleStage,
    project.preBreakoutRadarLane,
    project.hottestTenNowLane,
  ].join(" "));
  return Boolean(
    /ALREADY_10X|LATE_CHASE|ALREADY_PUMPED|EXTENDED|OVERHEATED/.test(state) ||
      priceChange24hPct(project) >= MAX_PRICE_CHANGE_24H_PCT ||
      priceChange7dPct(project) >= MAX_PRICE_CHANGE_7D_PCT
  );
}

function memeOnly(project = {}) {
  const realUtilityOverride =
    project.realUtilityQualified === true ||
    project.utilityClassification === "REAL_UTILITY" ||
    utilityScore(project) >= 65 ||
    (Array.isArray(project.utilityEvidenceFamilies) && project.utilityEvidenceFamilies.length >= 3);
  return Boolean(
    project.memeOnlySpeculative === true ||
      project.utilityClassification === "MEME_SPECULATION" ||
      project.utilityQualityVerdict === "Meme-only speculation" ||
      (isLikelyMemeIdentity(project) && !realUtilityOverride)
  );
}

function utilityScore(project = {}) {
  return average([
    project.utilityQualityScore,
    project.realUtilityScore,
    project.developerAccelerationScore,
    project.developerActivityScore,
    project.githubProScore,
    project.ecosystemIntegrationScore,
    project.tokenomicsScore,
  ]);
}

function opportunityScore(project = {}) {
  const preConsensusScore = first([
    project.preConsensusBreakoutScore,
    project.preConsensusOpportunityScore,
    project.regimeAdjustedOpportunityScore,
    project.preConsensusBreakoutHunter?.preConsensusBreakoutScore,
    project.preConsensusBreakoutHunter?.preConsensusOpportunityScore,
    project.preConsensusBreakoutHunter?.regimeAdjustedOpportunityScore,
  ]);
  return average([
    project.highUpsideScalpScore,
    project.hottestTenNowScore,
    project.sevenDayTenXScore,
    project.preBreakoutRadarScore,
    project.earlyAsymmetryResearchPriorityScore,
    preConsensusScore,
    project.progressiveOpportunityScore,
    project.moneyRankScore,
  ]);
}

function flowScore(project = {}) {
  return average([
    project.capitalMigrationScore,
    project.capitalFlowScore,
    project.buyerBreadthAccelerationScore,
    project.buyPressureScore,
    project.liquidityFormationScore,
    project.liquidityExpansionScore,
    project.organicDemandIntegrityScore,
  ]);
}

function proofScore(project = {}) {
  return average([
    project.sourceTruthScore,
    project.sourceReliabilityScore,
    project.institutionalDataProvenanceScore,
    project.evidenceCoverageScore,
    project.opportunityEvidenceCoverage,
    project.sniperEvidenceCoverage,
  ]);
}

function riskPenalty(project = {}) {
  return average([
    project.trapRiskScore,
    project.contractAuthorityRiskScore,
    project.liquidityControlRiskScore,
    project.washTradingRiskScore,
    project.walletClusterRiskScore,
    project.deployerRiskScore,
    project.sellPressureScore,
  ]);
}

function missingProof(project = {}) {
  const strictGate = resolveStrictCandidateGate(project);
  const missing = [];
  missing.push(...(strictGate.strictCandidateMissingProof || []));
  if (!hasIdentity(project)) missing.push("canonical identity");
  if (!first([project.chain, project.canonicalChain, project.chainId])) missing.push("canonical chain");
  if (!first([project.tokenAddress, project.contractAddress, project.canonicalAddress])) missing.push("token contract");
  if (!first([project.poolAddress, project.pairAddress, project.primaryTradablePool, project.marketPair])) missing.push("pool or market");
  if (liquidityUsd(project) < MIN_LIQUIDITY_USD) missing.push("executable liquidity");
  if (marketCapUsd(project) <= 0) missing.push("circulating market cap");
  if (!strictGate.strictRankEligible || !isLiveExecutionReady({ ...project, routeTruthStatus: "LIVE_EXECUTION_READY" })) {
    missing.push("fresh verified buy and sell route");
  }
  if (!proofScore(project)) missing.push("independent source provenance");
  if (!utilityScore(project)) missing.push("real utility, roadmap, or developer proof");
  if (!flowScore(project)) missing.push("capital flow, buyer breadth, or liquidity formation");
  if (!first([project.instantSafetyStatus, project.contractAuthoritySafetyScore, project.securityEvidenceSummary])) missing.push("free safety proof");
  return [...new Set(missing)].slice(0, 12);
}

function nextSources(missing = []) {
  const sourceMap = {
    "canonical identity": ["DexScreener", "GeckoTerminal", "official website", "block explorer"],
    "canonical chain": ["DexScreener", "GeckoTerminal", "official docs"],
    "token contract": ["DexScreener", "GeckoTerminal", "official website", "Etherscan V2", "Blockscout"],
    "pool or market": ["DexScreener", "GeckoTerminal", "Jupiter", "DEX quote adapter", "CEX order book"],
    "executable liquidity": ["DexScreener", "GeckoTerminal", "Jupiter", "DEX quote adapter"],
    "circulating market cap": ["CoinGecko", "CoinPaprika", "CoinLore", "supply explorer"],
    "fresh verified buy and sell route": ["Jupiter", "0x", "1inch", "chain-native DEX quote", "CEX order book"],
    "independent source provenance": ["source truth router", "official links", "independent market provider"],
    "real utility, roadmap, or developer proof": ["GitHub", "official docs", "project website", "package registry"],
    "capital flow, buyer breadth, or liquidity formation": ["GeckoTerminal trades", "native RPC", "block explorer"],
    "free safety proof": ["GoPlus", "Honeypot.is", "RugCheck", "Sourcify", "Blockscout", "Etherscan V2"],
  };
  return [...new Set(missing.flatMap((item) => sourceMap[item] || []))].slice(0, 12);
}

function invalidationTriggers(project = {}) {
  return [
    "Fresh sell quote disappears or becomes stale.",
    "Price enters late-chase/extended thresholds before manual entry.",
    "Liquidity drops below the intended exit-capacity requirement.",
    "Safety provider flags honeypot, blacklist, freeze, mint, or sell restriction.",
    "Identity source conflict appears between contract, chain, pool, or venue.",
    ...(num(project.walletClusterRiskScore) >= 50 ? ["Wallet concentration or linked-cluster risk worsens."] : []),
  ];
}

export function analyzeDailyCapitalMove(project = {}) {
  const strictGate = resolveStrictCandidateGate(project);
  const liveReady = strictGate.strictRankEligible === true && isLiveExecutionReady({
    ...project,
    routeTruthStatus: "LIVE_EXECUTION_READY",
  });
  const missing = missingProof(project);
  const score = Math.round(clamp(
    opportunityScore(project) * 0.3 +
      flowScore(project) * 0.22 +
      utilityScore(project) * 0.18 +
      proofScore(project) * 0.14 +
      (liveReady ? 90 : 35) * 0.16 -
      riskPenalty(project) * 0.24 +
      (priceUsd(project) > 0 && priceUsd(project) < 0.01 ? 4 : 0) +
      (marketCapUsd(project) > 0 && marketCapUsd(project) <= MAX_MARKET_CAP_USD ? 4 : 0)
  ));
  let lane = "WATCH";
  let reason = "Needs more confirmation before capital move research.";

  if (hardSafetyBlocked(project)) {
    lane = "BLOCKED";
    reason = "Deterministic safety, identity, or sell-risk block.";
  } else if (!hasCleanDisplayIdentity(project) || isLikelyAggregateCandidate(project)) {
    lane = "BLOCKED";
    reason = "Malformed or aggregate project identity cannot be used for daily capital research.";
  } else if (strictGate.strictCandidateLane === "MARKET_BENCHMARK") {
    lane = "MARKET_BENCHMARK";
    reason = "Established native asset is market benchmark context, not an early utility-small-cap capital candidate.";
  } else if (!strictGate.strictRankEligible) {
    lane = "QUARANTINED_IDENTITY_OR_ROUTE";
    reason = `Strict identity/route proof is incomplete: ${strictGate.candidateQuarantineReason || "missing proof"}.`;
  } else if (lateChase(project)) {
    lane = "LATE_CHASE_DO_NOT_CHASE";
    reason = "Move is already extended for the configured 1-7 day scalp window.";
  } else if (memeOnly(project)) {
    lane = "MEME_ONLY_EXCLUDED";
    reason = "Utility-small-cap mode excludes meme-only speculation.";
  } else if (!liveReady) {
    lane = score >= 35 ? "NEEDS_PROOF" : "WATCH";
    reason = score >= 35
      ? "Research-worthy only until a fresh buy and sell route is verified."
      : "Interesting but below the daily proof-recovery priority threshold.";
  } else if (liquidityUsd(project) < MIN_LIQUIDITY_USD) {
    lane = "NEEDS_PROOF";
    reason = "Executable liquidity is below the daily capital threshold.";
  } else if (marketCapUsd(project) > MAX_MARKET_CAP_USD) {
    lane = "WATCH";
    reason = "Market cap is above the utility small-cap daily mode.";
  } else if (score >= 72 && missing.length === 0) {
    lane = "CAPITAL_MOVE_RESEARCH";
    reason = "Highest evidence-backed candidate for manual capital-move research.";
  }

  return {
    ...project,
    dailyCapitalMoveScore: score,
    dailyCapitalMoveLane: lane,
    dailyCapitalMoveReason: reason,
    dailyCapitalMoveMissingProof: missing,
    dailyCapitalMoveMissingProofCount: missing.length,
    dailyCapitalMoveNextSources: nextSources(missing),
    dailyCapitalMoveInvalidationTriggers: invalidationTriggers(project),
    dailyCapitalMoveConfidence:
      lane === "CAPITAL_MOVE_RESEARCH" && proofScore(project) >= 70
        ? "HIGH"
        : score >= 58
          ? "MEDIUM"
          : "LOW",
    dailyCapitalMoveExecutionReady: liveReady,
    dailyCapitalMoveExecutionTruthState: liveReady ? "LIVE_EXECUTION_READY" : strictGate.routeVerificationStatus || executionTruthState(project),
    dailyCapitalMoveSafetyStatus: hardSafetyBlocked(project) ? "BLOCKED" : "NO_DETERMINISTIC_BLOCK",
    dailyCapitalMoveQuarantineReason: strictGate.candidateQuarantineReason,
    routeVerificationStatus: strictGate.routeVerificationStatus,
    strictCandidateGate: strictGate,
    ...strictGate,
    dailyCapitalMoveOpportunityScore: opportunityScore(project),
    dailyCapitalMoveUtilityScore: utilityScore(project),
    dailyCapitalMoveFlowScore: flowScore(project),
    dailyCapitalMoveProofScore: proofScore(project),
    dailyCapitalMoveRiskPenalty: riskPenalty(project),
  };
}

export function analyzeDailyCapitalMoveBatch(projects = []) {
  return (Array.isArray(projects) ? projects : []).map(analyzeDailyCapitalMove);
}

function compact(project = {}, rank = null) {
  return {
    rank,
    symbol: project.symbol || "UNKNOWN",
    name: project.name || project.projectName || "Unknown",
    chain: project.chain || project.canonicalChain || "unknown",
    chainId: project.canonicalChainId ?? project.chainId ?? null,
    canonicalId: project.canonicalId || project.canonicalProjectId || null,
    tokenName: project.tokenName || project.name || project.projectName || "Unknown",
    tokenAddress: project.tokenAddress || project.contractAddress || project.canonicalAddress || null,
    contractAddress: project.contractAddress || project.tokenAddress || project.canonicalAddress || null,
    poolAddress: project.poolAddress || project.pairAddress || project.primaryTradablePool || null,
    pairAddress: project.pairAddress || project.poolAddress || project.primaryTradablePool || null,
    dexName: project.dexName || project.dex || project.canonicalExecutionRoute?.dexName || project.canonicalExecutionRoute?.venue || null,
    provenance: project.provenance || project.discoverySources || [],
    lastVerifiedAt: project.lastVerifiedAt || project.quoteTimestamp || null,
    routeVerificationStatus: project.routeVerificationStatus || project.routeTruthStatus || "UNKNOWN",
    quarantineReason: project.candidateQuarantineReason || project.dailyCapitalMoveQuarantineReason || null,
    strictIdentityVerified: project.strictIdentityVerified === true,
    strictRouteVerified: project.strictRouteVerified === true,
    strictRankEligible: project.strictRankEligible === true,
    priceUsd: priceUsd(project),
    marketCapUsd: marketCapUsd(project),
    liquidityUsd: liquidityUsd(project),
    priceChange24hPct: priceChange24hPct(project),
    priceChange7dPct: priceChange7dPct(project),
    score: project.dailyCapitalMoveScore || 0,
    lane: project.dailyCapitalMoveLane || "WATCH",
    reason: project.dailyCapitalMoveReason || "",
    confidence: project.dailyCapitalMoveConfidence || "LOW",
    executionReady: project.dailyCapitalMoveExecutionReady === true,
    executionTruthState: project.dailyCapitalMoveExecutionTruthState || "UNKNOWN",
    safetyStatus: project.dailyCapitalMoveSafetyStatus || "UNKNOWN",
    missingProof: project.dailyCapitalMoveMissingProof || [],
    missingProofCount: num(project.dailyCapitalMoveMissingProofCount),
    nextSources: project.dailyCapitalMoveNextSources || [],
    invalidationTriggers: project.dailyCapitalMoveInvalidationTriggers || [],
    componentScores: {
      opportunity: project.dailyCapitalMoveOpportunityScore || 0,
      flow: project.dailyCapitalMoveFlowScore || 0,
      utility: project.dailyCapitalMoveUtilityScore || 0,
      proof: project.dailyCapitalMoveProofScore || 0,
      riskPenalty: project.dailyCapitalMoveRiskPenalty || 0,
    },
  };
}

export function summarizeDailyCapitalMoves(projects = [], meta = {}) {
  const analyzed = (Array.isArray(projects) ? projects : [])
    .map((project) => project.dailyCapitalMoveLane ? project : analyzeDailyCapitalMove(project))
    .sort((a, b) => num(b.dailyCapitalMoveScore) - num(a.dailyCapitalMoveScore));
  const ready = analyzed.filter((project) => project.dailyCapitalMoveLane === "CAPITAL_MOVE_RESEARCH");
  const needsProof = analyzed.filter((project) => project.dailyCapitalMoveLane === "NEEDS_PROOF");
  const watch = analyzed.filter((project) => project.dailyCapitalMoveLane === "WATCH");
  const quarantined = analyzed.filter((project) => project.dailyCapitalMoveLane === "QUARANTINED_IDENTITY_OR_ROUTE");
  const marketBenchmarks = analyzed.filter((project) => project.dailyCapitalMoveLane === "MARKET_BENCHMARK");
  const blocked = analyzed.filter((project) =>
    ["BLOCKED", "LATE_CHASE_DO_NOT_CHASE", "MEME_ONLY_EXCLUDED"].includes(project.dailyCapitalMoveLane)
  );
  const best = ready[0] || null;
  const backupPool = ready.slice(1, TARGET_BACKUPS + 1);
  const watchlist = [...needsProof, ...watch].slice(0, TARGET_WATCHLIST);

  return {
    generatedAt: new Date().toISOString(),
    scanRunId: meta.scanRunId || meta.runId || process.env.GITHUB_RUN_ID || null,
    codeCommitSha: meta.codeCommitSha || process.env.GITHUB_SHA || null,
    status: best ? "CAPITAL_MOVE_RESEARCH_READY" : (watchlist.length || quarantined.length) ? "NO_VALID_MOVE_TODAY_RESEARCH_ONLY" : analyzed.length ? "NO_VALID_MOVE_TODAY" : "NO_PROJECTS",
    mode: "AGGRESSIVE_1_TO_7_DAY_UTILITY_SMALL_CAP",
    objective: "Select one daily capital-move research candidate only when strict utility, safety, and execution proof exists.",
    disclaimer: "Research output only. Not financial advice, not a buy/sell recommendation, and not a profit guarantee.",
    projectsAnalyzed: analyzed.length,
    bestCandidate: best ? compact(best, 1) : null,
    backupCandidates: backupPool.map((project, index) => compact(project, index + 2)),
    watchlist: watchlist.map((project, index) => compact(project, index + 1)),
    needsProof: needsProof.slice(0, TARGET_WATCHLIST).map((project, index) => compact(project, index + 1)),
    quarantinedIdentityOrRoute: quarantined.slice(0, TARGET_WATCHLIST).map((project, index) => compact(project, index + 1)),
    marketBenchmarks: marketBenchmarks.slice(0, TARGET_WATCHLIST).map((project, index) => compact(project, index + 1)),
    blockedOrRejected: blocked.slice(0, TARGET_WATCHLIST).map((project, index) => compact(project, index + 1)),
    countsByLane: analyzed.reduce((counts, project) => {
      counts[project.dailyCapitalMoveLane] = (counts[project.dailyCapitalMoveLane] || 0) + 1;
      return counts;
    }, {}),
    noMoveReason: best ? "" : "No candidate has all required fresh execution, safety, identity, utility, and evidence proof.",
    operatingRules: [
      "No forced daily pick.",
      "Unknown route remains research-only.",
      "Safety, identity, and sell-route proof override scores.",
      "Already-extended moves are not daily capital-move candidates.",
    ],
  };
}
