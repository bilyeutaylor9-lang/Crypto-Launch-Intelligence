import fs from "fs";
import path from "path";

const TARGET_COUNT = 10;
const MAX_AUDIT_ROWS = 50;

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
  return Boolean(
    project.liveExecutionReady === true ||
      project.executionProof?.liveExecutionReady === true ||
      ["LIVE_EXECUTION_READY", "SELL_SIMULATION_PASSED", "TAXES_VERIFIED", "ORDER_BOOK_DEPTH_VERIFIED", "SELL_QUOTE_VERIFIED"].includes(executionState(project)) ||
      (project.executionProof?.buyRouteAvailable === true && project.executionProof?.sellRouteAvailable === true) ||
      (project.purchaseRouteConfirmed === true && (project.sellRouteAvailable === true || project.purchaseRoute?.sellable === true))
  );
}

function deterministicSafetyBlocked(project = {}) {
  const blockers = [
    ...(project.sevenDayTenXBlockers || []),
    ...(project.finalSelectionBlockers || []),
    ...(project.sniperIntegrityBlockers || []),
    ...(project.scalpMicrostructureBlockers || []),
  ]
    .join(" ")
    .toLowerCase();
  return Boolean(
    project.honeypotDetected === true ||
      project.verifiedScam === true ||
      project.sellRestricted === true ||
      project.identityConflict === true ||
      project.canonicalIdentityHardBlock === true ||
      project.finalSelectionState === "BLOCKED" ||
      project.scalpNoTrade === true ||
      project.instantSafetyStatus === "CRITICAL" ||
      num(project.contractAuthorityRiskScore) >= 70 ||
      num(project.liquidityControlRiskScore) >= 75 ||
      num(project.washTradingRiskScore) >= 75 ||
      /honeypot|verified scam|identity conflict|contract mismatch|chain mismatch|cannot sell|sell restricted/.test(blockers)
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
    /ALREADY_10X|LATE_CHASE|ALREADY_PUMPED|EXTENDED|OVERHEATED/.test(stage) ||
      priceChange24hPct(project) >= 85 ||
      priceChange7dPct(project) >= 220
  );
}

function utilityBlocked(project = {}) {
  return Boolean(
    project.memeOnlySpeculative === true ||
      project.utilityClassification === "MEME_SPECULATION" ||
      project.utilityQualityVerdict === "Meme-only speculation"
  );
}

function rejectionReason(project = {}) {
  if (deterministicSafetyBlocked(project)) return "DETERMINISTIC_SAFETY_OR_SCALP_BLOCK";
  if (lateChase(project)) return "ALREADY_EXTENDED_OR_LATE_CHASE";
  if (utilityBlocked(project)) return "MEME_ONLY_OR_NO_VERIFIED_UTILITY";
  if (!buySellRouteVerified(project)) return "BUY_AND_SELL_ROUTE_NOT_VERIFIED";
  return "";
}

function scoreProject(project = {}) {
  const asymmetry = average([
    project.sevenDayTenXScore,
    project.preBreakoutRadarScore,
    project.preConsensusBreakoutScore,
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

  return Math.round(
    clamp(
      asymmetry * 0.27 +
        capitalFlow * 0.22 +
        utility * 0.18 +
        proof * 0.14 +
        execution * 0.19 -
        riskPenalty * 0.24 +
        subCentBonus +
        smallCapBonus
    )
  );
}

function lane(project = {}, score = 0) {
  const reason = rejectionReason(project);
  if (reason) return reason;
  if (project.liveExecutionReady === true || project.executionProof?.liveExecutionReady === true) return "LIVE_EXECUTION_READY_RESEARCH";
  if (score >= 72) return "CURRENT_HIGH_UPSIDE_RESEARCH";
  if (score >= 58) return "WATCHLIST_NEEDS_MORE_CONFIRMATION";
  return "LOWER_PRIORITY";
}

function compactCandidate(project = {}, rank = null) {
  const score = project.hottestTenNowScore ?? scoreProject(project);
  return {
    rank,
    symbol: project.symbol || "UNKNOWN",
    name: project.name || "Unknown",
    chain: project.chain || project.canonicalChain || project.chainId || "unknown",
    tokenAddress: project.tokenAddress || project.contractAddress || project.canonicalAddress || null,
    poolAddress: project.poolAddress || project.pairAddress || project.primaryTradablePool || null,
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
    missingEvidence: (project.sevenDayTenXMissingEvidence || project.moneyMissingEvidence || []).slice(0, 12),
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
      const score = scoreProject(project);
      return {
        ...project,
        hottestTenNowScore: score,
        hottestTenNowLane: lane(project, score),
        hottestTenNowRejectionReason: rejectionReason(project),
      };
    })
    .sort((a, b) => num(b.hottestTenNowScore) - num(a.hottestTenNowScore));

  const qualified = scored.filter((project) =>
    ["LIVE_EXECUTION_READY_RESEARCH", "CURRENT_HIGH_UPSIDE_RESEARCH"].includes(project.hottestTenNowLane)
  );
  const watchlist = scored.filter((project) => project.hottestTenNowLane === "WATCHLIST_NEEDS_MORE_CONFIRMATION");
  const rejected = scored.filter((project) => project.hottestTenNowRejectionReason);
  const topTen = qualified.slice(0, TARGET_COUNT);
  const topTenBoard = [...qualified, ...watchlist].slice(0, TARGET_COUNT);

  return {
    generatedAt: new Date().toISOString(),
    scanRunId: meta.scanRunId || meta.runId || process.env.GITHUB_RUN_ID || null,
    codeCommitSha: meta.codeCommitSha || process.env.GITHUB_SHA || null,
    status: topTen.length ? "PASS" : scored.length ? "NO_CURRENT_BUY_READY_RESEARCH" : "NO_PROJECTS",
    mode: "ALWAYS_HIGH_UPSIDE_CURRENT_MOMENT",
    objective:
      "Rank the strongest current high-upside research candidates while excluding late-chase, meme-only, unsafe, and route-unverified names.",
    disclaimer:
      "Research output only. Not financial advice, not a buy/sell recommendation, and not a profit guarantee.",
    projectsAnalyzed: scored.length,
    targetCount: TARGET_COUNT,
    qualifiedNowCount: qualified.length,
    returnedCount: topTen.length,
    currentResearchBoardCount: topTenBoard.length,
    shortfallToTen: Math.max(0, TARGET_COUNT - topTen.length),
    researchBoardShortfallToTen: Math.max(0, TARGET_COUNT - topTenBoard.length),
    confirmationGapCount: topTenBoard.filter((project) => project.hottestTenNowLane === "WATCHLIST_NEEDS_MORE_CONFIRMATION").length,
    notForced: true,
    topTenCurrentResearchBoard: topTenBoard.map((project, index) => compactCandidate(project, index + 1)),
    topTenHighestRatedNow: topTen.map((project, index) => compactCandidate(project, index + 1)),
    watchlistNeedsMoreConfirmation: watchlist.slice(0, MAX_AUDIT_ROWS).map((project, index) => compactCandidate(project, index + 1)),
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
      "Do not chase coins already up hundreds of percent.",
      "Do not rank meme-only hype above real-utility candidates.",
      "Do not call a route current-moment ready without buy and sell path evidence.",
    ],
    missingInfoRecoverySources: [
      "DexScreener and GeckoTerminal for live pools, liquidity, price, volume, and pair identity.",
      "Jupiter, 0x, 1inch, and chain-native DEX quote APIs for buy/sell quote confirmation where available.",
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
