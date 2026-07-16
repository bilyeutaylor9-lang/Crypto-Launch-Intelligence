import { resolveAnalysisFunnelConfig } from "../config/analysisFunnelConfig.js";
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

function stageScore(project = {}, stage = "advanced") {
  const components = project.preIntelligenceComponents || {};
  const signals = project.preIntelligenceSignals || {};
  if (stage === "deep") {
    return Math.round(
      num(project.preIntelligenceOpportunityScore) * 0.25 +
        num(components.timing) * 0.16 +
        num(components.attentionGap) * 0.16 +
        num(signals.liquidityAcceleration) * 0.12 +
        num(signals.buyerAcceleration) * 0.12 +
        num(components.catalystDeveloperChange) * 0.11 +
        num(components.identityEvidenceStrength) * 0.08
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
    num(project.preIntelligenceOpportunityScore) * 0.34 +
      num(components.acceleration) * 0.18 +
      num(components.timing) * 0.15 +
      num(components.attentionGap) * 0.15 +
      num(components.identityEvidenceStrength) * 0.1 +
      num(signals.rankImprovement) * 0.08
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
  const enriched = analyzePreIntelligenceFeaturesBatch(projects);
  const lanePlan = allocateCandidateLanes(enriched, config, options);
  const standard = lanePlan.selected;
  const advanced = selectStage(standard, config.advancedIntelligenceLimit, "advancedSelectionScore", "advanced");
  const deep = selectStage(advanced, config.deepIntelligenceLimit, "deepSelectionScore", "deep");
  const crawler = selectStage(deep, config.crawlerResearchLimit, "crawlerSelectionScore", "crawler");
  const llama3 = selectStage(crawler, config.localAITopProjectLimit, "llama3SelectionScore", "llama");
  const debate = selectStage(llama3, config.finalistDebateLimit, "debateSelectionScore", "debate");
  const finalists = selectStage(debate, config.finalistComparisonLimit, "finalistSelectionScore", "finalist");
  const shadowAudit = buildShadowAudit(standard, lanePlan.deferred);
  const missedOpportunityAudit = buildMissedOpportunityAudit(shadowAudit);

  return {
    selected: standard,
    deferred: lanePlan.deferred,
    advanced,
    deep,
    crawler,
    llama3,
    debate,
    finalists,
    winner: finalists[0] || standard[0] || null,
    selectedIdentityKeys: lanePlan.selectedIdentityKeys,
    selectionReasons: lanePlan.selectionReasons,
    rescued: lanePlan.rescued,
    shadowAudit,
    missedOpportunityAudit,
    report: {
      ...lanePlan.report,
      funnel: {
        discoveryUniverse: projects.length,
        deduplicatedUniverse: lanePlan.report.uniqueCandidateCount,
        eligiblePreIntelligenceUniverse: lanePlan.report.eligibleCandidateCount,
        standardIntelligenceSelected: standard.length,
        standardIntelligenceLimit: config.standardIntelligenceLimit,
        advancedIntelligenceSelected: advanced.length,
        advancedIntelligenceLimit: config.advancedIntelligenceLimit,
        deepIntelligenceSelected: deep.length,
        deepIntelligenceLimit: config.deepIntelligenceLimit,
        crawlerResearchSelected: crawler.length,
        crawlerResearchLimit: config.crawlerResearchLimit,
        llama3Selected: llama3.length,
        llama3Limit: config.localAITopProjectLimit,
        debateSelected: debate.length,
        debateLimit: config.finalistDebateLimit,
        finalists: finalists.length,
        finalistLimit: config.finalistComparisonLimit,
        bestOpportunity: finalists[0]?.symbol || standard[0]?.symbol || "no eligible leader",
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
