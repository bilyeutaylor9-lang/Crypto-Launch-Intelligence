function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

function clean(value = "") {
  return String(value ?? "").trim();
}

function lower(value = "") {
  return clean(value).toLowerCase();
}

function firstValue(values = []) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function compact(items = []) {
  return items.filter(Boolean);
}

function projectKey(project = {}) {
  const chain = lower(project.chain || project.finalChain || project.network || project.chainId || "unknown");
  const address = lower(
    firstValue([
      project.permanentProjectKey,
      project.finalProjectKey,
      project.projectKey,
      project.contractAddress,
      project.tokenAddress,
      project.address,
      project.baseToken?.address,
      project.pairAddress,
      project.poolAddress,
      project.coinGeckoId,
      project.symbol,
    ]) || "unknown"
  );
  if (String(address).includes(":")) return address;
  return `${chain}:${address}`;
}

function sourceCount(project = {}) {
  const sources = new Set(
    compact([
      project.source,
      project.dex,
      project.exchange,
      ...array(project.sources),
      ...array(project.discoverySources),
      ...array(project.evidence).map((item) => item.source || item.engine),
      ...(project.institutionalDataProvenance?.sourceSummary?.sources || []),
      ...(project.sourceTruth?.sources || []),
    ])
      .map(lower)
      .filter(Boolean)
  );

  return Math.max(
    sources.size,
    num(project.institutionalDataSourceCount),
    num(project.institutionalDataProvenance?.sourceSummary?.sourceCount),
    num(project.sourceTruth?.sourceCount),
    num(project.internetResearch?.sourceCount)
  );
}

function identity(project = {}) {
  const confidence = Math.max(
    num(project.identityResolutionScore),
    num(project.projectIdentityScore),
    project.identityVerified || project.contractVerified ? 90 : 0,
    ["VERIFIED_CONTRACT", "VERIFIED_LISTING", "VERIFIED_EXCHANGE_ASSET"].includes(
      project.finalIdentityState || project.identityState
    )
      ? 92
      : 0
  );

  return {
    name: project.name || project.projectName || "Unknown",
    symbol: project.symbol || "UNKNOWN",
    chain: project.chain || project.finalChain || project.network || "unknown",
    contractAddress:
      firstValue([
        project.contractAddress,
        project.tokenAddress,
        project.address,
        project.baseToken?.address,
        project.finalContractAddress,
      ]) || null,
    confidence: Math.round(clamp(confidence)),
  };
}

function scoreFields(project = {}) {
  return {
    opportunity: Math.round(clamp(project.progressiveOpportunityScore ?? project.opportunityScoreV2 ?? project.pipelineScore)),
    timing: Math.round(clamp(project.opportunityTimingScore)),
    trust: Math.round(clamp(project.trustScore ?? project.progressiveTrustScore)),
    attentionGap: Math.round(clamp(project.attentionGapScore)),
    marketOpportunityRank: Math.round(clamp(project.marketOpportunityRank ?? project.marketOpportunityRankScore)),
    execution: Math.round(clamp(project.executionScore ?? project.progressiveExecutionScore)),
    moneyRank: Math.round(clamp(project.moneyRankScore)),
    localAIConsensus: Math.round(clamp(project.localAIConsensusScore)),
    evidenceCoverage: Math.round(clamp(project.opportunityEvidenceCoverage ?? project.sniperEvidenceConfidence)),
  };
}

function addSignal(signals, label, score, category, sourceEngine, detail = "") {
  if (num(score) < 55) return;
  signals.push({
    type: category,
    label,
    score: Math.round(clamp(score)),
    sourceEngine,
    detail,
  });
}

function signals(project = {}) {
  const items = [];
  addSignal(items, "Opportunity strength", project.progressiveOpportunityScore, "OPPORTUNITY", "Progressive Opportunity Ranking");
  addSignal(items, "Timing window", project.opportunityTimingScore, "TIMING", "Opportunity Timing Engine");
  addSignal(items, "Attention gap", project.attentionGapScore, "ATTENTION_GAP", "Attention Gap Engine");
  addSignal(items, "Market opportunity rank", project.marketOpportunityRank, "MARKET_RANK", "Market Opportunity Rank Engine");
  addSignal(items, "Smart-wallet arrival", project.smartWalletArrivalScore, "SMART_MONEY", "Smart Wallet Arrival");
  addSignal(items, "Liquidity expansion", project.liquidityExpansionScore, "LIQUIDITY", "Liquidity Expansion");
  addSignal(items, "Buyer acceleration", project.buyPressureScore, "BUYERS", "Buy Pressure");
  addSignal(items, "Roadmap catalyst", project.roadmapCatalystProfitScore, "CATALYST", "Roadmap Catalyst Profit");
  addSignal(items, "Developer acceleration", project.developerActivityScore ?? project.githubProScore, "DEVELOPMENT", "Developer/GitHub");
  addSignal(items, "Source truth", project.sourceTruthScore, "SOURCE_TRUTH", "Source Truth");

  for (const signal of array(project.opportunityWhyNowSignals)) {
    addSignal(items, signal.label || "Why-now signal", signal.score, "WHY_NOW", "Progressive Opportunity Ranking", signal.detail || "");
  }

  return items.slice(0, 18);
}

function riskItems(project = {}) {
  const risks = [];
  const riskFields = [
    ["Contract risk", project.contractRiskScore, "CONTRACT"],
    ["Honeypot risk", project.honeypotRiskScore, "CONTRACT"],
    ["Wash-trading risk", project.washTradingRiskScore, "MARKET_STRUCTURE"],
    ["Wallet-cluster risk", project.walletClusterRiskScore, "WALLETS"],
    ["Insider distribution risk", project.insiderDistributionRisk, "WALLETS"],
    ["Liquidity manipulation risk", project.liquidityManipulationRisk, "LIQUIDITY"],
    ["Sell pressure", project.sellPressureScore, "SELL_PRESSURE"],
    ["Late-chase risk", project.lateChaseRiskScore, "TIMING"],
    ["Trap risk", project.trapRiskScore, "TRAP"],
  ];

  for (const [label, score, family] of riskFields) {
    if (num(score) >= 45) {
      risks.push({ label, score: Math.round(clamp(score)), family });
    }
  }

  for (const reason of compact([
    ...array(project.finalWarningReasons),
    ...array(project.sniperWarningReasons),
    ...array(project.economicIntegrityWarnings),
  ])) {
    risks.push({ label: String(reason), score: 60, family: "WARNING" });
  }

  return risks.slice(0, 16);
}

function hardBlocks(project = {}) {
  return [
    ...array(project.opportunityHardBlockers),
    ...array(project.hardBlockers),
    ...array(project.finalBlockingReasons),
    ...array(project.sniperBlockingReasons),
    ...array(project.preConsensusHardBlockers),
    ...array(project.economicIntegrityBlockers),
  ]
    .map(String)
    .filter(Boolean)
    .filter((value, index, list) => list.indexOf(value) === index)
    .slice(0, 12);
}

function missingEvidence(project = {}) {
  return [
    ...array(project.missingEvidence),
    ...array(project.nextVerificationActions),
    ...array(project.economicIntegrityResearchTasks),
    ...array(project.aiResearchCommanderTasks).map((task) => task.task || task.label),
  ]
    .map(String)
    .filter(Boolean)
    .filter((value, index, list) => list.indexOf(value) === index)
    .slice(0, 14);
}

function evidenceFamilies(project = {}) {
  const families = [];
  const add = (family, score, evidence = []) => {
    if (num(score) <= 0 && !array(evidence).length) return;
    families.push({
      family,
      score: Math.round(clamp(score)),
      evidence: array(evidence).slice(0, 5),
    });
  };

  for (const item of array(project.sniperEvidenceFamilyList)) {
    add(item.family || item.name || item.label, item.familyScore ?? item.score, item.evidence || item.examples || []);
  }

  const summary = project.sniperEvidenceFamilySummary || {};
  for (const family of compact([
    ...(summary.independentLeadingFamiliesAtOrAbove70 || []),
    ...(summary.onChainConfirmingFamilies || []),
    ...(summary.productConfirmingFamilies || []),
  ])) {
    add(family, 75, ["Confirmed by sniper evidence family summary"]);
  }

  add("source-truth", project.sourceTruthScore, [`${sourceCount(project)} independent source(s)`]);
  add("execution", project.executionScore, project.executionTradeSizeChecks || []);
  add("institutional-provenance", project.institutionalDataProvenanceScore, project.institutionalDataProvenance?.findings || []);

  return families
    .filter((value, index, list) => list.findIndex((item) => item.family === value.family) === index)
    .slice(0, 12);
}

function materialChanges(project = {}) {
  const changes = [
    ...array(project.materialChanges),
    ...array(project.projectChanges),
    ...array(project.changeEvents),
    ...array(project.internetResearch?.materialChanges),
    ...array(project.liveCatalystEvents).map((event) => ({
      type: event.type || event.catalystType || "CATALYST",
      claim: event.title || event.name || "Catalyst detected",
      sourceFamily: "catalyst-radar",
      reliability: event.confidence || project.liveCatalystRadarScore || 60,
    })),
  ];

  return changes
    .map((change) =>
      typeof change === "string"
        ? { type: "CHANGE", claim: change, sourceFamily: "unknown", reliability: 50 }
        : {
            type: change.type || change.label || "CHANGE",
            claim: change.claim || change.title || change.description || "",
            sourceFamily: change.sourceFamily || change.source || "unknown",
            reliability: Math.round(clamp(change.reliability ?? change.confidence ?? 50)),
            url: change.url || change.sourceUrl || null,
          }
    )
    .filter((change) => change.claim || change.type)
    .slice(0, 16);
}

function localAI(project = {}) {
  return {
    status: project.localAIStatus || project.localAIExecutionStatus || "UNKNOWN",
    verdict: project.localAIVerdict || project.aiDecision || "Pending",
    researchDecision: project.localAIResearchDecision || "PENDING",
    confidence: Math.round(clamp(project.localAIConfidence)),
    coverage: Math.round(clamp(project.localAICoverage)),
    adjustment: Math.round(num(project.localAITrustAdjustment ?? project.localAIAdjustment)),
    consensusScore: Math.round(clamp(project.localAIConsensusScore)),
    promotionBlocked: Boolean(project.localAIPromotionBlocked || project.localAIPromotionBlock),
  };
}

function opportunityLane(project = {}, scores = scoreFields(project)) {
  if (hardBlocks(project).length) return "BLOCKED";
  if (project.opportunityRankingTier === "SNIPER_READY") return "SNIPER_READY";
  if (scores.timing >= 78 && scores.attentionGap >= 65) return "EARLY_BREAKOUT";
  if (scores.attentionGap >= 75) return "UNDER_THE_RADAR";
  if (scores.timing >= 75) return "CATALYST_WINDOW";
  if (num(project.developerActivityScore || project.githubProScore) >= 70) return "BUILDER_MOMENTUM";
  if (scores.opportunity >= 70) return "HIGH_OPPORTUNITY_RESEARCH";
  return "MONITOR";
}

function timeHorizons(project = {}) {
  return {
    "24_72_HOURS": Math.round(clamp(project.timeHorizonScores?.["24_72_HOURS"] ?? project.horizon24h72hScore)),
    "7_14_DAYS": Math.round(clamp(project.timeHorizonScores?.["7_14_DAYS"] ?? project.horizon7d14dScore)),
    "30_90_DAYS": Math.round(clamp(project.timeHorizonScores?.["30_90_DAYS"] ?? project.horizon30d90dScore)),
    recommended: project.recommendedHorizon || project.marketOpportunityRecommendedHorizon || "RESEARCH_ONLY",
  };
}

export function assembleOpportunityEvidence(project = {}) {
  const scores = scoreFields(project);
  return {
    projectKey: projectKey(project),
    identity: identity(project),
    scores,
    signals: signals(project),
    risks: riskItems(project),
    hardBlocks: hardBlocks(project),
    missingEvidence: missingEvidence(project),
    evidenceFamilies: evidenceFamilies(project),
    materialChanges: materialChanges(project),
    localAI: localAI(project),
    timeHorizons: timeHorizons(project),
    opportunityLane: project.opportunityLane || opportunityLane(project, scores),
    sourceCoverage: {
      sourceCount: sourceCount(project),
      sourceTruthScore: Math.round(clamp(project.sourceTruthScore)),
      provenanceScore: Math.round(clamp(project.institutionalDataProvenanceScore)),
    },
    execution: {
      routeVerified: Boolean(project.purchaseRouteConfirmed || project.executionRouteAvailable),
      executableTradeSizeUsd: num(project.executableTradeSizeUsd),
      tradeSizeChecks: array(project.executionTradeSizeChecks).slice(0, 4),
    },
    disclaimer: "Research signal only. This is not financial advice or a profit promise.",
  };
}

export function assembleOpportunityEvidenceBatch(projects = []) {
  return (Array.isArray(projects) ? projects : []).map(assembleOpportunityEvidence);
}

export { projectKey as buildOpportunityProjectKey };
