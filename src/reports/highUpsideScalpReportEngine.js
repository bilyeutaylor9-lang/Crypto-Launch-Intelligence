import fs from "fs";
import path from "path";
import { isLiveExecutionReady } from "../execution/routeTruthV2.js";

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
  return isLiveExecutionReady(project);
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
  const upside = average([
    project.sevenDayTenXScore,
    project.preBreakoutRadarScore,
    project.preConsensusBreakoutScore,
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
    project.sniperIntegrityScore,
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

function compact(project = {}, rank = null) {
  const score = project.highUpsideScalpScore ?? scoreProject(project);
  return {
    rank,
    symbol: project.symbol || "UNKNOWN",
    name: project.name || "Unknown",
    chain: project.chain || project.canonicalChain || project.chainId || "unknown",
    tokenAddress: project.tokenAddress || project.contractAddress || project.canonicalAddress || null,
    poolAddress: project.poolAddress || project.pairAddress || project.primaryTradablePool || null,
    highUpsideScalpScore: score,
    lane: project.highUpsideScalpLane || lane(project, score),
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
    earlyAsymmetryResearchPriorityScore: project.earlyAsymmetryResearchPriorityScore || 0,
    buyerBreadthAccelerationScore: project.buyerBreadthAccelerationScore || 0,
    liquidityFormationScore: project.liquidityFormationScore || 0,
    utilityQualityScore: project.utilityQualityScore || 0,
    sourceTruthScore: project.sourceTruthScore || 0,
    sniperIntegrityScore: project.sniperIntegrityScore || 0,
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

export function summarizeHighUpsideScalpResearch(projects = [], meta = {}) {
  const scored = (Array.isArray(projects) ? projects : [])
    .map((project) => {
      const score = scoreProject(project);
      return {
        ...project,
        highUpsideScalpScore: score,
        highUpsideScalpLane: lane(project, score),
      };
    })
    .sort((a, b) => num(b.highUpsideScalpScore) - num(a.highUpsideScalpScore));

  const top = scored.filter((project) => project.highUpsideScalpLane === "SCALP_READY_RESEARCH");
  const watch = scored.filter((project) => project.highUpsideScalpLane === "HIGH_UPSIDE_WATCH" || project.highUpsideScalpLane === "RESEARCH_ONLY_ROUTE_MISSING");
  const late = scored.filter((project) => project.highUpsideScalpLane === "LATE_CHASE_REJECTED");
  const meme = scored.filter((project) => project.highUpsideScalpLane === "MEME_SPECULATION_EXCLUDED");
  const microstructureRejected = scored.filter((project) => String(project.highUpsideScalpLane || "").startsWith("SCALP_NO_TRADE"));

  return {
    generatedAt: new Date().toISOString(),
    scanRunId: meta.scanRunId || meta.runId || process.env.GITHUB_RUN_ID || null,
    codeCommitSha: meta.codeCommitSha || process.env.GITHUB_SHA || null,
    status: scored.length ? "PASS" : "NO_PROJECTS",
    mode: "HIGH_UPSIDE_SCALP_RESEARCH",
    objective:
      "Surface pre-extension, real-utility, route-verified asymmetric candidates for manual scalping research.",
    disclaimer:
      "Research output only. Not financial advice, not a buy/sell recommendation, and not a profit guarantee.",
    projectsAnalyzed: scored.length,
    scalpReadyCount: top.length,
    highUpsideWatchCount: watch.length,
    lateChaseRejectedCount: late.length,
    memeSpeculationExcludedCount: meme.length,
    microstructureRejectedCount: microstructureRejected.length,
    topScalpResearchCandidates: top.slice(0, 10).map((project, index) => compact(project, index + 1)),
    highUpsideWatchlist: watch.slice(0, MAX_REPORT_ROWS).map((project, index) => compact(project, index + 1)),
    lateChaseRejected: late.slice(0, MAX_REPORT_ROWS).map((project, index) => compact(project, index + 1)),
    memeSpeculationExcluded: meme.slice(0, MAX_REPORT_ROWS).map((project, index) => compact(project, index + 1)),
    microstructureRejected: microstructureRejected.slice(0, MAX_REPORT_ROWS).map((project, index) => compact(project, index + 1)),
    operatingRules: [
      "Do not chase assets that already completed a 10x-style move.",
      "Do not treat meme-only attention as real utility.",
      "Do not mark a coin scalp-ready without a verified sell route.",
      "Keep incomplete but promising projects visible as research-only watchlist candidates.",
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
