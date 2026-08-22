import { resolveAnalysisFunnelConfig } from "../config/analysisFunnelConfig.js";
import {
  chainKind,
  normalizeChainId,
  normalizeTokenAddress,
} from "../identity/strictIdentityValidators.js";
import { analyzePreIntelligenceFeaturesBatch } from "./preIntelligenceFeatureEngine.js";
import { allocateCandidateLanes } from "./candidateLaneAllocator.js";

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function compareByScore(field, fallback = "preIntelligenceOpportunityScore") {
  return (left, right) =>
    num(right[field]) - num(left[field]) ||
    num(right[fallback]) - num(left[fallback]) ||
    String(left.standardSelectionIdentityKey || left.symbol || left.name).localeCompare(
      String(right.standardSelectionIdentityKey || right.symbol || right.name)
    );
}

function selectionKey(project = {}) {
  return project.standardSelectionIdentityKey ||
    project.projectId ||
    `${project.chain}:${project.symbol}:${project.name}`;
}

export function hasFinalDecisionIdentity(project = {}) {
  const chain = normalizeChainId(
    project.chain || project.chainId || project.network || project.canonicalChain
  );
  if (!chain) return false;
  return Boolean(normalizeTokenAddress(
    project.tokenAddress ||
      project.contractAddress ||
      project.canonicalAddress ||
      project.baseToken?.address ||
      project.address,
    chain
  ));
}

const CORE_EVIDENCE_ACQUISITION_CHAINS = new Set([
  "ethereum",
  "optimism",
  "bsc",
  "polygon",
  "arbitrum",
  "avalanche",
  "base",
  "zksync",
]);

export function hasFinalDecisionEvidenceRoute(project = {}) {
  if (!hasFinalDecisionIdentity(project)) return false;
  const chain = normalizeChainId(
    project.chain || project.chainId || project.network || project.canonicalChain
  );
  const family = chainKind(chain);
  if (family === "solana") return true;
  return family === "evm" && CORE_EVIDENCE_ACQUISITION_CHAINS.has(chain);
}

function stageScore(project = {}, stage = "advanced") {
  const components = project.preIntelligenceComponents || {};
  const signals = project.preIntelligenceSignals || {};
  if (stage === "deep") {
    return Math.round(
      num(project.explosionReadinessScore) * 0.24 +
        num(project.preIntelligenceOpportunityScore) * 0.2 +
        num(components.timing) * 0.13 +
        num(components.attentionGap) * 0.12 +
        num(signals.liquidityAcceleration) * 0.1 +
        num(signals.buyerAcceleration) * 0.1 +
        num(components.catalystDeveloperChange) * 0.07 +
        num(components.identityEvidenceStrength) * 0.04
    );
  }
  if (stage === "crawler") {
    return Math.round(
      num(project.preIntelligenceOpportunityScore) * 0.3 +
        (project.preIntelligenceMissingEvidence?.length ? 20 : 0) +
        num(components.catalystDeveloperChange) * 0.2 +
        num(components.attentionGap) * 0.18 +
        num(signals.rankImprovement) * 0.12
    );
  }
  if (stage === "llama") {
    return Math.round(
      num(project.preIntelligenceOpportunityScore) * 0.32 +
        num(components.attentionGap) * 0.2 +
        num(components.timing) * 0.18 +
        num(components.identityEvidenceStrength) * 0.12 +
        (project.preIntelligenceMissingEvidence?.length ? 12 : 0) +
        num(project.preIntelligenceConfidence) * 0.06
    );
  }
  if (stage === "debate") {
    return Math.round(
      num(project.llama3SelectionScore || project.advancedSelectionScore) * 0.6 +
        num(components.attentionGap) * 0.16 +
        num(components.timing) * 0.14 +
        num(components.identityEvidenceStrength) * 0.1
    );
  }
  if (stage === "finalist") {
    return Math.round(
      num(project.debateSelectionScore || project.llama3SelectionScore) * 0.52 +
        num(project.preIntelligenceOpportunityScore) * 0.2 +
        num(components.timing) * 0.12 +
        num(components.attentionGap) * 0.1 +
        num(components.identityEvidenceStrength) * 0.06
    );
  }
  return Math.round(
    num(project.explosionReadinessScore) * 0.25 +
      num(project.preIntelligenceOpportunityScore) * 0.25 +
      num(components.acceleration) * 0.14 +
      num(components.timing) * 0.12 +
      num(components.attentionGap) * 0.1 +
      num(components.identityEvidenceStrength) * 0.08 +
      num(signals.rankImprovement) * 0.06
  );
}

function selectStage(projects = [], limit = 0, scoreField = "", stage = "") {
  const ranked = projects
    .map((project) => ({ ...project, [scoreField]: stageScore(project, stage) }))
    .sort(compareByScore(scoreField));
  return ranked.slice(0, Math.max(0, Math.min(limit, ranked.length))).map((project, index) => ({
    ...project,
    [`${stage}SelectionRank`]: index + 1,
    [`${stage}SelectionState`]: "SELECTED",
  }));
}

function isStarvationRescueCandidate(project = {}) {
  return Boolean(
    project.starvationRescueEligible === true ||
      project.standardSelectionReason === "STARVATION_RESCUE_RESERVE" ||
      ((project.dataStarvationMissingEvidence || project.preIntelligenceMissingEvidence || []).length &&
        num(project.earlyAsymmetryResearchPriorityScore || project.preIntelligenceOpportunityScore) >= 35)
  );
}

function isUnderrepresentedCandidate(project = {}) {
  return ["solana", "sui", "ton", "cosmos", "osmosis", "sei", "aptos"].includes(String(project.chain || "").toLowerCase()) ||
    ["github", "google-news", "coinlore"].includes(String(project.source || "").toLowerCase());
}

function isIdentityResolutionCandidate(project = {}) {
  return Boolean(project.identityRescueNeeded || (project.preIntelligenceMissingEvidence || []).some((item) => /identity|contract|pool/i.test(String(item))));
}

function isMissedWinnerPatternCandidate(project = {}) {
  return Boolean(
    project.missedWinnerPatternMatch === true ||
      project.preBreakoutTimingState === "LATE_CHASE" ||
      project.prePump?.status === "ALREADY_PUMPED" ||
      num(project.prePumpPatternScore) >= 70
  );
}

function selectStageWithAllocation(projects = [], limit = 0, scoreField = "", stage = "", allocation = {}) {
  const target = Math.max(0, Math.min(limit, projects.length));
  if (!target) return [];
  const requestedTotal = Object.values(allocation).reduce((sum, value) => sum + num(value), 0);
  const scale = requestedTotal > target ? target / requestedTotal : 1;
  const budget = Object.fromEntries(
    Object.entries(allocation).map(([key, value]) => [key, Math.max(0, Math.floor(num(value) * scale))])
  );
  const scored = projects
    .map((project) => ({ ...project, [scoreField]: stageScore(project, stage) }))
    .sort(compareByScore(scoreField));
  const selected = [];
  const keys = new Set();
  const take = (pool = [], count = 0, lane = "") => {
    for (const project of pool) {
      if (selected.length >= target || selected.filter((item) => item[`${stage}SelectionLane`] === lane).length >= count) break;
      const key = selectionKey(project);
      if (keys.has(key)) continue;
      keys.add(key);
      selected.push({
        ...project,
        [`${stage}SelectionLane`]: lane,
      });
    }
  };

  take(scored, budget.leaders ?? target, "LEADERS");
  take(scored.filter(isStarvationRescueCandidate), budget.starvationRescue || 0, "STARVATION_RESCUE");
  take(scored.filter(isUnderrepresentedCandidate), budget.underrepresented || 0, "UNDERREPRESENTED_CHAIN_OR_SOURCE");
  take(scored.filter(isIdentityResolutionCandidate), budget.identityResolution || 0, "IDENTITY_RESOLUTION");
  take(scored.filter(isMissedWinnerPatternCandidate), budget.missedWinnerPatterns || budget.redTeamOrMissedWinner || 0, "MISSED_WINNER_OR_RED_TEAM");
  take(
    scored
      .filter((project) => !keys.has(selectionKey(project)))
      .sort((a, b) => String(a.standardSelectionIdentityKey || a.symbol).localeCompare(String(b.standardSelectionIdentityKey || b.symbol))),
    budget.randomizedAudit || budget.randomizedControl || 0,
    "DETERMINISTIC_AUDIT_CONTROL"
  );
  take(scored, target, "MERIT_FILL");

  return selected.slice(0, target).map((project, index) => ({
    ...project,
    [`${stage}SelectionRank`]: index + 1,
    [`${stage}SelectionState`]: "SELECTED",
  }));
}

function preserveDeepIdentityCapacity(
  selected = [],
  candidates = [],
  requiredCount = 0,
  scoreField = "advancedSelectionScore"
) {
  const target = selected.length;
  const required = Math.min(
    target,
    Math.max(0, requiredCount),
    candidates.filter(hasFinalDecisionEvidenceRoute).length
  );
  const selectedIdentityCount = selected.filter(hasFinalDecisionEvidenceRoute).length;
  const deficit = Math.max(0, required - selectedIdentityCount);
  if (!deficit) return selected;

  const selectedKeys = new Set(selected.map(selectionKey));
  const additions = candidates
    .filter((project) => hasFinalDecisionEvidenceRoute(project) && !selectedKeys.has(selectionKey(project)))
    .map((project) => ({
      ...project,
      [scoreField]: stageScore(project, "advanced"),
      advancedSelectionLane: "DOWNSTREAM_FINAL_IDENTITY_CAPACITY",
    }))
    .sort(compareByScore(scoreField))
    .slice(0, deficit);
  const retained = [
    ...selected.filter(hasFinalDecisionEvidenceRoute),
    ...selected.filter((project) => !hasFinalDecisionEvidenceRoute(project)).slice(
      0,
      Math.max(0, target - selectedIdentityCount - additions.length)
    ),
    ...additions,
  ]
    .sort(compareByScore(scoreField))
    .slice(0, target);

  return retained.map((project, index) => ({
    ...project,
    advancedSelectionRank: index + 1,
    advancedSelectionState: "SELECTED",
  }));
}

function compact(project = {}) {
  return {
    name: project.name || "Unknown",
    symbol: project.symbol || "UNKNOWN",
    chain: project.chain || project.network || "unknown",
    source: project.source || "unknown",
    score: project.preIntelligenceOpportunityScore || 0,
    confidence: project.preIntelligenceConfidence || 0,
    reason: project.standardSelectionReason || "",
    lane: project.standardSelectionLane || "",
    nearMissLane: project.standardSelectionNearMissLane || "",
    missingEvidence: project.preIntelligenceMissingEvidence || [],
    components: project.preIntelligenceComponents || {},
    riskPenalty: project.preIntelligenceRiskPenalty || 0,
    explosionReadinessScore: project.explosionReadinessScore || 0,
    explosionReadinessState: project.explosionReadinessState || "INSUFFICIENT_EVIDENCE",
    explosionReadinessCoverage: project.explosionReadinessCoverage || 0,
    explosionReadinessReasons: project.explosionReadinessReasons || [],
  };
}

function buildShadowAudit(selected = [], deferred = []) {
  const selectedKeys = new Set(selected.map((project) => project.standardSelectionIdentityKey));
  const exclusions = deferred.filter((project) => !selectedKeys.has(project.standardSelectionIdentityKey));
  const topExcluded = [...exclusions]
    .sort((a, b) => num(b.preIntelligenceOpportunityScore) - num(a.preIntelligenceOpportunityScore))
    .slice(0, 250)
    .map(compact);
  const randomSample = exclusions
    .filter((_, index) => index % Math.max(1, Math.floor(exclusions.length / 100)) === 0)
    .slice(0, 100)
    .map(compact);
  const accelerationAnomalies = exclusions
    .filter((project) => num(project.preIntelligenceComponents?.acceleration) >= 85)
    .slice(0, 250)
    .map(compact);

  return {
    topExcluded,
    randomSample,
    accelerationAnomalies,
    selectedCount: selected.length,
    excludedCount: exclusions.length,
  };
}

function buildMissedOpportunityAudit(shadowAudit = {}) {
  return {
    generatedAt: new Date().toISOString(),
    status: "COLD_START",
    evaluatedHistoricalScans: 0,
    missedWinners: [],
    potentialMisses: shadowAudit.topExcluded.slice(0, 25),
    recommendedBoundedChanges: [
      "Collect later price/liquidity outcomes for excluded candidates before changing selector weights.",
      "Review high-acceleration and high-attention-gap exclusions after each scan.",
    ],
    leakagePolicy: "Future outcomes are not used in current selection. Historical selections are never rewritten.",
  };
}

export function planInstitutionalCandidateSelection(projects = [], options = {}) {
  const config = options.config || resolveAnalysisFunnelConfig(options.env || process.env, options);
  const enriched = analyzePreIntelligenceFeaturesBatch(projects, options);
  const lanePlan = allocateCandidateLanes(enriched, config, options);
  const standard = lanePlan.selected;
  const rankableStandard = standard.filter(
    (project) =>
      project.preIntelligenceRankEligible === true &&
      (project.preIntelligenceLane || project.discoveryLane) !== "identity-only"
  );
  const initiallyAdvanced = selectStageWithAllocation(rankableStandard, config.advancedIntelligenceLimit, "advancedSelectionScore", "advanced", config.stageBudgets?.advanced || {});
  const advanced = preserveDeepIdentityCapacity(
    initiallyAdvanced,
    rankableStandard,
    config.deepIntelligenceLimit
  );
  const deepIdentityCandidates = advanced.filter(hasFinalDecisionIdentity);
  const deepEvidenceCandidates = advanced.filter(hasFinalDecisionEvidenceRoute);
  const deep = selectStageWithAllocation(deepEvidenceCandidates, config.deepIntelligenceLimit, "deepSelectionScore", "deep", config.stageBudgets?.deep || {});
  const crawler = selectStageWithAllocation(deep, config.crawlerResearchLimit, "crawlerSelectionScore", "crawler", config.stageBudgets?.crawler || {});
  const llama3 = selectStageWithAllocation(crawler, config.localAITopProjectLimit, "llama3SelectionScore", "llama", config.stageBudgets?.localAI || {});
  const debate = selectStage(llama3, config.finalistDebateLimit, "debateSelectionScore", "debate");
  const finalists = selectStage(debate, config.finalistComparisonLimit, "finalistSelectionScore", "finalist");
  const shadowAudit = buildShadowAudit(standard, lanePlan.deferred);
  const missedOpportunityAudit = buildMissedOpportunityAudit(shadowAudit);
  const preIntelligenceLeader = finalists[0] || rankableStandard[0] || null;
  const identityEnrichmentSelected = standard.filter(
    (project) => (project.preIntelligenceLane || project.discoveryLane) === "identity-only"
  );

  return {
    selected: standard,
    deferred: lanePlan.deferred,
    advanced,
    deep,
    crawler,
    llama3,
    debate,
    finalists,
    preIntelligenceLeader,
    winner: preIntelligenceLeader,
    selectedIdentityKeys: lanePlan.selectedIdentityKeys,
    selectionReasons: lanePlan.selectionReasons,
    rescued: lanePlan.rescued,
    shadowAudit,
    missedOpportunityAudit,
    report: {
      ...lanePlan.report,
      funnel: {
        discoveryUniverse: projects.length,
        deduplicatedUniverse: lanePlan.report.totalUniqueCandidateCount,
        rankablePreIntelligenceUniverse: lanePlan.report.rankableUniqueCandidateCount,
        identityEnrichmentUniverse: lanePlan.report.uniqueIdentityEnrichmentCandidateCount,
        eligiblePreIntelligenceUniverse: lanePlan.report.rankableUniqueCandidateCount,
        standardIntelligenceSelected: standard.length,
        standardRankableSelected: rankableStandard.length,
        identityEnrichmentSelected: identityEnrichmentSelected.length,
        standardIntelligenceLimit: config.standardIntelligenceLimit,
        advancedIntelligenceSelected: advanced.length,
        advancedIntelligenceLimit: config.advancedIntelligenceLimit,
        deepIntelligenceSelected: deep.length,
        deepIntelligenceLimit: config.deepIntelligenceLimit,
        deepFinalIdentityEligible: deepIdentityCandidates.length,
        deepCoreEvidenceAcquisitionEligible: deepEvidenceCandidates.length,
        deepIdentityDeferred: Math.max(0, advanced.length - deepIdentityCandidates.length),
        deepProviderDeferred: Math.max(0, deepIdentityCandidates.length - deepEvidenceCandidates.length),
        crawlerResearchSelected: crawler.length,
        crawlerResearchLimit: config.crawlerResearchLimit,
        llama3Selected: llama3.length,
        llama3Limit: config.localAITopProjectLimit,
        debateSelected: debate.length,
        debateLimit: config.finalistDebateLimit,
        finalists: finalists.length,
        finalistLimit: config.finalistComparisonLimit,
        preIntelligenceLeader: preIntelligenceLeader?.symbol || "no eligible leader",
        leaderStatus: "PRELIMINARY_RESEARCH_ROUTING_ONLY",
      },
      stageLeaders: {
        standard: standard.slice(0, 10).map(compact),
        advanced: advanced.slice(0, 10).map(compact),
        deep: deep.slice(0, 10).map(compact),
        crawler: crawler.slice(0, 10).map(compact),
        llama3: llama3.slice(0, 10).map(compact),
        debate: debate.slice(0, 10).map(compact),
        finalists: finalists.slice(0, 5).map(compact),
      },
      shadowAudit: {
        topExcludedCount: shadowAudit.topExcluded.length,
        randomSampleCount: shadowAudit.randomSample.length,
        accelerationAnomalyCount: shadowAudit.accelerationAnomalies.length,
      },
    },
  };
}
