import fs from "fs";
import path from "path";
import { attachCanonicalIdentityBatch } from "../identity/canonicalIdentityResolver.js";
import { normalizeMetricTruthBatch, sourceFamiliesForProject } from "../data/metricTruthNormalizer.js";

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
  const status = project.executionProof?.executionStatus || project.executionStatus;
  return Boolean(
    ["VERIFIED", "PARTIALLY_VERIFIED"].includes(status) ||
      project.purchaseRouteConfirmed === true ||
      project.executionRouteAvailable === true ||
      project.purchaseRoute?.purchasable === true ||
      project.smallCapHunter?.purchaseRoute?.purchasable === true ||
      project.proofOfAlphaExecutionTwinSelected === true ||
      project.proofOfAlphaExecutionTwin?.route?.detected === true
  );
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

function contributionTrace(components = {}) {
  return BREAKOUT_WEIGHTS.map(([component, weightPct]) => {
    const componentScore = clamp(components[component]);
    return {
      component,
      weightPct,
      componentScore,
      contribution: Number(((componentScore * weightPct) / 100).toFixed(2)),
    };
  });
}

function riskPenalties(project = {}) {
  const penalties = [];
  const add = (label, score, maxPenalty, reason) => {
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
  add("Identity uncertainty", 100 - clamp(project.identityConfidence ?? project.identityResolutionScore ?? 0), 12, "Identity evidence is weak or conflicting.");
  add("Missing critical evidence", 100 - evidenceCompleteness(project), 10, "Critical proof is incomplete.");
  add("Late chase risk", project.lateChaseRiskScore ?? (project.prePump?.status === "LATE_CHASE" ? 85 : 0), 14, "Move may be too mature for early-breakout ranking.");
  add("Already-pumped risk", project.alreadyPumpedRiskScore ?? (project.prePump?.status === "ALREADY_PUMPED" ? 92 : 0), 20, "Price has already expanded beyond the early setup.");
  add("Source disagreement", project.sourceDisagreementRiskScore ?? project.institutionalDataProvenance?.components?.contradictionRisk, 12, "Sources disagree or evidence contradicts itself.");

  return penalties;
}

function hardBlocks(project = {}) {
  return unique([
    ...array(project.opportunityHardBlockers),
    ...array(project.hardBlockers),
    ...array(project.finalBlockingReasons),
    ...array(project.sniperBlockingReasons),
    ...array(project.preConsensusHardBlockers),
    ...array(project.economicIntegrityBlockers),
    ...(project.canonicalIdentityHardBlock ? ["Canonical identity conflict."] : []),
    ...(project.honeypotDetected || project.verifiedScam || project.scamDetected ? ["Verified scam, honeypot, or rug-risk evidence."] : []),
    ...(project.deployerSelling === true || num(project.deployerNetFlow) < -10_000 ? ["Deployer selling into demand."] : []),
    ...(num(project.liquidityRemovalRiskScore) >= 80 || num(project.lpRemovalUsd) > 0 ? ["Liquidity removal risk is active."] : []),
  ]);
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

function missingEvidence(project = {}) {
  const missing = [];
  if (!chain(project)) missing.push("Verified chain is missing.");
  if (!tokenAddress(project)) missing.push("Verified token contract address is missing.");
  if (!poolAddress(project)) missing.push("Primary tradable pool is missing.");
  if (!routeVerified(project)) missing.push("Verified Coinbase, MetaMask, DEX, or aggregator execution route is missing.");
  if (!dexLiquidity(project)) missing.push("DEX liquidity or stable exit liquidity is missing.");
  if (independentEvidenceFamilies(project).length < 2) missing.push("Needs at least two independent evidence families.");
  if (!(project.instantSafetyStatus === "PASS" || project.contractVerified || project.contractSafetyVerified)) {
    missing.push("Contract safety evidence is unknown, not safe.");
  }
  if (project.researchOnly || project.tradableCandidate === false) {
    missing.push("Research-only source must be resolved to a tradable token identity.");
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
  const components = componentScores(project);
  const trace = contributionTrace(components);
  const rawScore = Number(trace.reduce((sum, item) => sum + item.contribution, 0).toFixed(2));
  const penalties = riskPenalties(project);
  const totalPenalty = Number(penalties.reduce((sum, item) => sum + item.penalty, 0).toFixed(2));
  const readinessScore = Math.round(clamp(rawScore - totalPenalty));
  const blockers = hardBlocks(project);
  const missing = missingEvidence(project);
  const completeness = evidenceCompleteness(project);
  const families = independentEvidenceFamilies(project);
  const qualified =
    blockers.length === 0 &&
    readinessScore >= 70 &&
    completeness >= 60 &&
    families.length >= 2 &&
    Boolean(tokenAddress(project)) &&
    Boolean(poolAddress(project)) &&
    Boolean(chain(project)) &&
    Boolean(dexLiquidity(project)) &&
    routeVerified(project);

  return {
    rank,
    projectId: project.canonicalProjectId || project.projectId || project.permanentProjectKey || null,
    projectName: project.name || project.canonicalName || "Unknown",
    symbol: project.symbol || project.canonicalSymbol || "UNKNOWN",
    chain: chain(project) || null,
    verifiedContractAddress: tokenAddress(project) || null,
    primaryTradablePool: poolAddress(project) || null,
    currentPrice: first([project.priceUsd, project.price]) ?? null,
    dexLiquidity: dexLiquidity(project),
    stableExitLiquidity: stableExitLiquidity(project),
    marketCap: money(first([project.circulatingMarketCapUsd, project.marketCap, project.estimatedMarketCapUsd])),
    fdv: money(first([project.fullyDilutedValueUsd, project.fdv, project.fullyDilutedValue])),
    poolAge: first([project.poolAge, project.poolAgeHours, project.pairCreatedAt, project.poolCreatedAt]) ?? null,
    breakoutStage: breakoutStage(project, readinessScore),
    breakoutReadinessScore: readinessScore,
    confidence: confidence(readinessScore, completeness, families.length, blockers),
    evidenceCompleteness: completeness,
    independentEvidenceFamilies: families,
    qualified,
    qualificationState: blockers.length ? "BLOCKED" : qualified ? "QUALIFIED" : readinessScore >= 55 ? "CONDITIONAL_WATCH" : "RESEARCH_ONLY",
    scoreContributionTrace: trace,
    rawScore,
    penalties,
    totalPenalty,
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
    missingEvidence: missing,
    hardBlocks: blockers,
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
      num(b.breakoutReadinessScore) - num(a.breakoutReadinessScore) ||
      num(b.evidenceCompleteness) - num(a.evidenceCompleteness) ||
      num(b.dexLiquidity) - num(a.dexLiquidity)
  );
}

function emptySlots(count = 0, reason = "") {
  return Array.from({ length: Math.max(0, count) }, (_, index) => ({
    slot: index + 1,
    status: "EMPTY",
    reason,
  }));
}

function buildStageSummary(projects = [], finalists = [], qualified = [], conditional = [], blocked = []) {
  return {
    discoveryUniverseObserved: projects.length,
    targetCapacityIsNotCoverage: true,
    fastTriageReviewed: projects.length,
    standardAnalysisCandidates: projects.length,
    deepResearchFinalists: finalists.length,
    breakoutFinalists: finalists.length,
    qualifiedTop10Picks: qualified.length,
    conditionalWatchCandidates: conditional.length,
    blockedFinalists: blocked.length,
    note: "Counts report actual observed candidates passed into the Top 10 funnel, not configured target capacity.",
  };
}

export function buildTop10BreakoutReport(projects = [], meta = {}) {
  const normalized = attachCanonicalIdentityBatch(normalizeMetricTruthBatch(projects));
  const records = normalized.map((project) => candidateRecord(project));
  const ranked = rankRecords(records);
  const finalists = ranked.slice(0, 25);
  const qualified = finalists.filter((record) => record.qualified).slice(0, 10);
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
    mode: "PRIVATE_EVIDENCE_DRIVEN_TOP_10_BREAKOUT_FUNNEL",
    meta,
    stageSummary: buildStageSummary(projects, finalists, rankedQualified, conditional, blocked),
    scoringDesign: {
      weights: Object.fromEntries(BREAKOUT_WEIGHTS.map(([name, weight]) => [name, weight])),
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
        qualificationState: record.qualificationState,
        hardBlocks: record.hardBlocks,
        missingEvidence: record.missingEvidence,
      })),
    bestOpportunityNow:
      rankedQualified[0] && rankedQualified[0].breakoutReadinessScore >= 75
        ? rankedQualified[0]
        : null,
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
  const rows = (report.top10Slots || [])
    .map((record) => {
      if (record.status === "EMPTY") {
        return `<tr><td>${record.slot}</td><td colspan="7">${record.reason}</td></tr>`;
      }
      return `<tr><td>${record.rank}</td><td>${record.projectName}</td><td>${record.symbol}</td><td>${record.chain || ""}</td><td>${record.breakoutReadinessScore}</td><td>${record.confidence}</td><td>${record.qualificationState}</td><td>${record.missingEvidence.slice(0, 2).join("; ")}</td></tr>`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Private Top 10 Breakout Picks</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 24px; color: #172026; background: #f7f8fa; }
    h1 { font-size: 24px; margin-bottom: 4px; }
    .meta { color: #5d6875; margin-bottom: 18px; }
    table { border-collapse: collapse; width: 100%; background: white; }
    th, td { border: 1px solid #d9dee7; padding: 8px; text-align: left; vertical-align: top; }
    th { background: #edf1f7; }
    .note { margin-top: 18px; color: #5d6875; }
  </style>
</head>
<body>
  <h1>Private Top 10 Breakout Picks</h1>
  <div class="meta">Generated ${report.generatedAt}. Research signals only.</div>
  <table>
    <thead><tr><th>Rank</th><th>Project</th><th>Symbol</th><th>Chain</th><th>Score</th><th>Confidence</th><th>State</th><th>Missing Evidence</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="note">${report.disclaimer}</div>
</body>
</html>`;
}

export function writeTop10BreakoutReports(projects = [], meta = {}) {
  const reportsDir = path.resolve("reports");
  fs.mkdirSync(reportsDir, { recursive: true });
  const report = buildTop10BreakoutReport(projects, meta);

  const top10Path = path.join(reportsDir, "top-10-breakout-picks.json");
  const htmlPath = path.join(reportsDir, "top-10-breakout-picks.html");
  const csvPath = path.join(reportsDir, "top-10-breakout-picks.csv");
  const explanationsPath = path.join(reportsDir, "top-10-breakout-explanations.json");
  const excludedPath = path.join(reportsDir, "top-10-excluded-finalists.json");
  const bestNowPath = path.join(reportsDir, "best-opportunity-now.json");

  writeJson(top10Path, report);
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
    htmlPath,
    csvPath,
    explanationsPath,
    excludedPath,
    bestNowPath,
    report,
  };
}
