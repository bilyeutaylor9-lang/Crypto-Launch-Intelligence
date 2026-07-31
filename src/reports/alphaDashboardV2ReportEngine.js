import fs from "fs";
import path from "path";
import { summarizePaperTradingOutcomeLab } from "../engines/paperTradingOutcomeLabEngine.js";
import { summarizeAutoLearningWeightOptimizer } from "../engines/autoLearningWeightOptimizerEngine.js";
import { summarizeSourceTruth } from "../engines/sourceTruthEngine.js";
import { summarizeGithubIntelligencePro } from "../engines/githubIntelligenceProEngine.js";
import { summarizeAutonomousAlphaOS } from "../engines/autonomousAlphaOSEngine.js";
import { summarizeSmallCapHunter } from "../engines/smallCapHunterEngine.js";
import { summarizeProofOfAlphaExecutionTwin } from "../engines/proofOfAlphaExecutionTwinEngine.js";
import { summarizeOrganicDemandIntegrity } from "../engines/organicDemandIntegrityEngine.js";
import { summarizeInstitutionalDataProvenance } from "../kernel/institutionalDataProvenanceLedger.js";
import { summarizeProgressiveOpportunityRanking } from "../engines/progressiveOpportunityRankingEngine.js";
import { summarizeMarketOpportunity } from "./marketOpportunityReportEngine.js";

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function maxRisk(project = {}) {
  return Math.max(
    num(project.trapRiskScore),
    num(project.sellPressureScore),
    num(project.externalRiskScore),
    num(project.tokenUnlockRiskScore),
    num(project.vestingPressureScore),
    num(project.falsePositiveSimilarity)
  );
}

function compact(project = {}) {
  return {
    rank: project.autonomousAlphaOSRank || project.pipelineRank || 0,
    name: project.name || "Unknown",
    symbol: project.symbol || "UNKNOWN",
    chain: project.chain || "unknown",
    pipelineScore: project.pipelineScore || 0,
    marketOpportunityRank: project.marketOpportunityRank || project.marketOpportunityRankScore || 0,
    marketOpportunityRankLevel: project.marketOpportunityRankLevel || "Unknown",
    opportunityLane: project.opportunityLane || "UNKNOWN",
    recommendedHorizon: project.recommendedHorizon || "RESEARCH_ONLY",
    progressiveOpportunityScore: project.progressiveOpportunityScore || project.opportunityScoreV2 || 0,
    trustScore: project.trustScore || project.progressiveTrustScore || 0,
    executionScore: project.executionScore || project.progressiveExecutionScore || 0,
    moneyRankScore: project.moneyRankScore || 0,
    moneyRank: project.moneyRank || null,
    moneyRankEligible: Boolean(project.moneyRankEligible),
    executableTradeSizeUsd: project.executableTradeSizeUsd || 0,
    opportunityRankingTier: project.opportunityRankingTier || "UNKNOWN",
    bestAvailableRank: project.bestAvailableRank || null,
    opportunityConfidence: project.opportunityConfidence || "Unknown",
    opportunityWhyNowSignals: (project.opportunityWhyNowSignals || []).slice(0, 5),
    missingEvidence: (project.missingEvidence || []).slice(0, 5),
    opportunityHardBlockers: (project.opportunityHardBlockers || []).slice(0, 5),
    finalSelectionState: project.finalSelectionState || "UNKNOWN",
    finalSelectionQualified: Boolean(project.finalSelectionQualified),
    finalIntegrityScore: project.finalIntegrityScore || 0,
    finalIntegrityVerdict: project.finalIntegrityVerdict || "Unknown",
    finalBlockingReasons: project.finalBlockingReasons || [],
    finalIdentityState: project.finalIdentityState || "UNKNOWN",
    permanentProjectKey: project.permanentProjectKey || "",
    alphaOSScore: project.autonomousAlphaOSScore || 0,
    alphaOSVerdict: project.autonomousAlphaOSVerdict || "Unknown",
    autoLearningWeightScore: project.autoLearningWeightScore || 0,
    alphaKnowledgeGraphScore: project.alphaKnowledgeGraphScore || 0,
    alphaKnowledgeGraphVerdict: project.alphaKnowledgeGraphVerdict || "Unknown",
    causalMarketTwinScore: project.causalMarketTwinScore || 0,
    causalMarketTwinVerdict: project.causalMarketTwinVerdict || "Unknown",
    causalMarketTwinExpectedReturnPct: project.causalMarketTwinExpectedReturnPct || 0,
    smallCapHunterSelected: Boolean(project.smallCapHunterSelected),
    smallCapHunterSelectionRank: project.smallCapHunterSelectionRank || null,
    smallCapHunterScore: project.smallCapHunterScore || 0,
    smallCapHunterVerdict: project.smallCapHunterVerdict || "Unknown",
    smallCapBand: project.smallCapBand || "Unknown",
    smallCapPurchaseRoute: project.smallCapHunter?.purchaseRoute?.preferredRoute || "Unavailable",
    smallCapPurchaseRouteStatus: project.smallCapHunter?.purchaseRoute?.status || "Unknown",
    executionTwinScore: project.proofOfAlphaExecutionTwinScore || 0,
    executionTwinVerdict: project.proofOfAlphaExecutionTwinVerdict || "Unknown",
    executionTwinRoute: project.proofOfAlphaExecutionTwinRoute || "Unavailable",
    executionTwinSlippagePct: project.proofOfAlphaExecutionTwinSlippagePct ?? null,
    organicIntegrityScore: project.organicEconomicIntegrityScore || 0,
    organicDemandVerdict: project.organicDemandVerdict || "Unknown",
    economicIntegrityRiskScore: project.economicIntegrityRiskScore || 0,
    activityAuthenticityRiskScore: project.activityAuthenticityRiskScore || 0,
    supplyIntegrityRiskScore: project.supplyIntegrityRiskScore || 0,
    economicIntegrityScoreCap: project.economicIntegrityScoreCap ?? null,
    organicDemandPromotionBlocked: Boolean(project.organicDemandPromotionBlocked),
    organicDemandManualReviewLabel: project.organicDemandManualReviewLabel || "Unknown",
    economicIntegrityResearchTaskCount: (project.economicIntegrityResearchTasks || []).length,
    economicIntegrityResearchTasks: (project.economicIntegrityResearchTasks || []).slice(0, 5),
    hardExitLiquidityUsd: project.hardExitLiquidityUsd || 0,
    paperOutcomeLabScore: project.paperOutcomeLabScore || 0,
    paperOutcomeLabVerdict: project.paperOutcomeLabVerdict || "Unknown",
    strategy: project.bestAutonomousStrategy?.name || "No Strategy",
    strategyWinRate: project.paperStrategyWinRate || 0,
    causalDriver: project.causalSignalGraph?.primaryDriver?.label || "Unknown",
    sourceTruthScore: project.sourceTruthScore || 0,
    sourceTruthVerdict: project.sourceTruthVerdict || "Unknown",
    institutionalDataProvenanceScore: project.institutionalDataProvenanceScore || project.institutionalDataProvenance?.score || 0,
    institutionalDataReadiness:
      project.institutionalDataReadiness ||
      project.institutionalDataProvenance?.institutionalReadiness ||
      "Unknown",
    githubProScore: project.githubProScore || 0,
    githubProVerdict: project.githubProVerdict || "Unknown",
    risk: maxRisk(project),
    nextActions: project.autonomousAlphaOSNextActions || [],
  };
}

export function buildAlphaDashboardV2(projects = [], meta = {}) {
  const safeProjects = Array.isArray(projects) ? projects : [];
  const alphaOS = summarizeAutonomousAlphaOS(safeProjects, meta);
  const paperLab = summarizePaperTradingOutcomeLab(safeProjects);
  const optimizer = summarizeAutoLearningWeightOptimizer(safeProjects);
  const sourceTruth = summarizeSourceTruth(safeProjects);
  const githubPro = summarizeGithubIntelligencePro(safeProjects);
  const smallCapHunter = summarizeSmallCapHunter(safeProjects);
  const executionTwin = summarizeProofOfAlphaExecutionTwin(safeProjects);
  const organicIntegrity = summarizeOrganicDemandIntegrity(safeProjects);
  const institutionalDataProvenance = summarizeInstitutionalDataProvenance(safeProjects);
  const progressiveOpportunities = summarizeProgressiveOpportunityRanking(safeProjects);
  const marketOpportunity = summarizeMarketOpportunity(safeProjects);
  const qualifiedCandidates = safeProjects.filter((project) => project.finalSelectionState === "QUALIFIED");
  const blockedCandidates = safeProjects.filter((project) => project.finalSelectionState === "BLOCKED");
  const identityConflicts = safeProjects.filter((project) => project.finalSelectionState === "IDENTITY_CONFLICT");
  const insufficientData = safeProjects.filter((project) => project.finalSelectionState === "INSUFFICIENT_DATA");
  const topCandidates = [...safeProjects]
    .sort(
      (a, b) =>
        num(b.marketOpportunityRank || b.marketOpportunityRankScore) -
          num(a.marketOpportunityRank || a.marketOpportunityRankScore) ||
        num(b.moneyRankScore) -
          num(a.moneyRankScore) ||
        num(b.progressiveOpportunityScore || b.opportunityScoreV2) -
          num(a.progressiveOpportunityScore || a.opportunityScoreV2) ||
        num(b.executionScore) - num(a.executionScore) ||
        num(b.trustScore) - num(a.trustScore) ||
        num(b.autoLearningWeightScore || b.autonomousAlphaOSScore) -
        num(a.autoLearningWeightScore || a.autonomousAlphaOSScore) ||
        num(b.causalMarketTwinScore || b.alphaKnowledgeGraphScore) -
          num(a.causalMarketTwinScore || a.alphaKnowledgeGraphScore)
    )
    .slice(0, 50)
    .map(compact);

  return {
    generatedAt: new Date().toISOString(),
    totalProjects: safeProjects.length,
    headline: {
      topCandidate: topCandidates[0] || null,
      bestOpportunityNow: marketOpportunity.bestOpportunityNow,
      marketLeaderVerdict: marketOpportunity.verdict,
      marketLeaderHeadline: marketOpportunity.headline,
      noClearLeaderReason: marketOpportunity.noClearLeaderReason,
      topFiveOpportunities: marketOpportunity.topFiveOpportunities,
      alphaOSBrief: alphaOS.commanderBrief,
      paperWinRate: paperLab.memory?.winRate || 0,
      evaluatedPaperTrades: paperLab.memory?.evaluatedRecords || 0,
      bestSource: sourceTruth.sources?.[0] || null,
      institutionalDataReady: institutionalDataProvenance.counts?.institutionalReady || 0,
      bestGithubProject: githubPro.topRepositories?.[0] || null,
      smallCapResearchPicks: smallCapHunter.topTwo || [],
      executionTwinPicks: executionTwin.topExecutions || [],
      qualifiedCandidates: qualifiedCandidates.map(compact).slice(0, 10),
      bestAvailableOpportunities: progressiveOpportunities.bestAvailableOpportunities || [],
      marketOpportunityLeaders: marketOpportunity.topFiveOpportunities || [],
      institutionalMoneyRank: progressiveOpportunities.institutionalMoneyRank || [],
      executionReady: progressiveOpportunities.executionReady || [],
      emergingSignals: progressiveOpportunities.emergingRadar || [],
      speculativeSignals: progressiveOpportunities.speculativeSignals || [],
      organicIntegrityBlocks: organicIntegrity.institutionalBlocks || 0,
    },
    counts: {
      sniperReady: progressiveOpportunities.counts?.sniperReady || 0,
      marketOpportunityTopFive: marketOpportunity.topFiveOpportunities?.length || 0,
      clearMarketLeader: marketOpportunity.verdict === "CLEAR_MARKET_LEADER" ? 1 : 0,
      earlyHighConviction: progressiveOpportunities.counts?.earlyHighConviction || 0,
      emergingRadar: progressiveOpportunities.counts?.emergingRadar || 0,
      speculativeSignal: progressiveOpportunities.counts?.speculativeSignal || 0,
      bestAvailableOpportunities: progressiveOpportunities.counts?.bestAvailable || 0,
      institutionalMoneyRank: progressiveOpportunities.counts?.moneyRanked || 0,
      executionReady: progressiveOpportunities.counts?.executionReady || 0,
      emergingDiscoveryAI: progressiveOpportunities.counts?.emergingDiscoveryAI || 0,
      missingEvidenceQueue: progressiveOpportunities.counts?.missingEvidence || 0,
      alphaOSStrongBuy: alphaOS.counts?.strongBuyResearch || 0,
      alphaOSBestAvailable: alphaOS.counts?.bestAvailable || 0,
      alphaOSPriority: alphaOS.counts?.priorityResearch || 0,
      graphPriority: safeProjects.filter((project) => project.alphaKnowledgeGraphVerdict === "Knowledge Graph Priority Research").length,
      twinPriority: safeProjects.filter((project) => project.causalMarketTwinVerdict === "Twin Priority Research").length,
      twinStrongBuyResearch: safeProjects.filter(
        (project) => project.causalMarketTwinVerdict === "Twin Strong Buy Research Candidate"
      ).length,
      paperPromotions: paperLab.promoteStrategyCount || 0,
      paperDowngrades: paperLab.downgradeStrategyCount || 0,
      verifiedSourceStacks: sourceTruth.verifiedStacks || 0,
      weakSourceStacks: sourceTruth.weakStacks || 0,
      institutionalDataReady: institutionalDataProvenance.counts?.institutionalReady || 0,
      provenanceReviewReady: institutionalDataProvenance.counts?.reviewReady || 0,
      provenanceBlocked: institutionalDataProvenance.counts?.blocked || 0,
      eliteGithubSignals: githubPro.eliteBuilderSignals || 0,
      healthyGithubSignals: githubPro.healthyBuilderSignals || 0,
      smallCapHunterPicks: smallCapHunter.selectedCount || 0,
      smallCapHunterWatch: smallCapHunter.watchCount || 0,
      smallCapHunterRiskBlocks: smallCapHunter.riskBlocks || 0,
      smallCapHunterPurchaseRouteBlocks: smallCapHunter.purchaseRouteBlocks || 0,
      executionTwinPicks: executionTwin.selectedCount || 0,
      executionTwinRouteBlocks: executionTwin.routeBlocks || 0,
      executionTwinSafetyBlocks: executionTwin.safetyBlocks || 0,
      finalQualifiedCandidates: qualifiedCandidates.length,
      finalBlockedCandidates: blockedCandidates.length,
      finalIdentityConflicts: identityConflicts.length,
      finalInsufficientData: insufficientData.length,
      organicDemandConfirmed: organicIntegrity.confirmedOrganicDemand || 0,
      organicIntegrityBlocks: organicIntegrity.institutionalBlocks || 0,
      tradableAnomalies: organicIntegrity.tradableAnomalies || 0,
    },
    topCandidates,
    bestOpportunityNow: marketOpportunity.bestOpportunityNow,
    topFiveOpportunities: marketOpportunity.topFiveOpportunities,
    finalistComparison: marketOpportunity.finalistComparison,
    timeHorizonLeaders: marketOpportunity.timeHorizonLeaders,
    opportunityLaneLeaders: marketOpportunity.opportunityLaneLeaders,
    finalQualifiedCandidates: progressiveOpportunities.sniperReady || [],
    institutionalMoneyRank: progressiveOpportunities.institutionalMoneyRank || [],
    bestAvailableOpportunities: progressiveOpportunities.bestAvailableOpportunities || [],
    executionReady: progressiveOpportunities.executionReady || [],
    emergingSignals: progressiveOpportunities.emergingRadar || [],
    speculativeSignals: progressiveOpportunities.speculativeSignals || [],
    blockedProjects: progressiveOpportunities.blockedProjects || [],
    localAIActivity: progressiveOpportunities.localAIActivity || {},
    missingEvidenceQueue: progressiveOpportunities.missingEvidenceQueue || [],
    predictionPerformance: progressiveOpportunities.predictionPerformance || {},
    progressiveOpportunities,
    marketOpportunity,
    smallCapHunter,
    executionTwin,
    organicIntegrity,
    institutionalDataProvenance,
    paperTradingOutcomeLab: paperLab,
    autoLearningWeightOptimizer: optimizer,
    sourceTruth,
    githubIntelligencePro: githubPro,
    operatorNotes: [
      "Treat every Alpha OS call as research until paper outcome history confirms the strategy.",
      "Increase trust only when source truth, causal driver, and paper outcome evidence agree.",
      "A best-available candidate is not a buy signal; it is the strongest candidate when the field is weak.",
      "Final Selection Integrity is the source of truth for qualified candidates.",
      "Research leads are not picks until final identity, liquidity, route, execution, risk, and purchase checks pass.",
      "Small-Cap Hunter and Execution Twin selections are evidence only when finalSelectionQualified is false.",
      "Organic Integrity blocks protect against raw holder, transaction, liquidity, yield, and admin-control illusions.",
    ],
  };
}

export function writeAlphaDashboardV2Report(projects = [], meta = {}) {
  const reportsDir = path.resolve("reports");
  fs.mkdirSync(reportsDir, { recursive: true });

  const report = buildAlphaDashboardV2(projects, meta);
  const filePath = path.join(reportsDir, "alpha-dashboard-v2.json");
  const paperLabPath = path.join(reportsDir, "paper-trading-lab.json");
  const weightOptimizerPath = path.join(reportsDir, "weight-optimizer.json");
  const sourceTruthPath = path.join(reportsDir, "source-truth.json");
  const githubProPath = path.join(reportsDir, "github-intelligence-pro.json");
  const provenancePath = path.join(reportsDir, "institutional-data-provenance-dashboard.json");

  fs.writeFileSync(filePath, JSON.stringify(report, null, 2));
  fs.writeFileSync(paperLabPath, JSON.stringify(report.paperTradingOutcomeLab, null, 2));
  fs.writeFileSync(weightOptimizerPath, JSON.stringify(report.autoLearningWeightOptimizer, null, 2));
  fs.writeFileSync(sourceTruthPath, JSON.stringify(report.sourceTruth, null, 2));
  fs.writeFileSync(githubProPath, JSON.stringify(report.githubIntelligencePro, null, 2));
  fs.writeFileSync(provenancePath, JSON.stringify({
    generatedAt: report.generatedAt,
    status: "CANONICAL_REPORT_REFERENCE",
    canonicalReport: "institutional-data-provenance.json",
    totalProjects: report.institutionalDataProvenance?.totalProjects || 0,
    averageProvenanceScore: report.institutionalDataProvenance?.averageProvenanceScore || 0,
    counts: report.institutionalDataProvenance?.counts || {},
    note: "The canonical provenance report contains the bounded project ledger. This dashboard companion intentionally avoids duplicating it.",
  }, null, 2));

  return {
    filePath,
    paperLabPath,
    weightOptimizerPath,
    sourceTruthPath,
    githubProPath,
    provenancePath,
    report,
  };
}
