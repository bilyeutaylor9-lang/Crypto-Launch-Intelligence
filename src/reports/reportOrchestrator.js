import { writeJsonReport } from "./jsonReportEngine.js";
import { writeCsvReport } from "./csvExportEngine.js";
import { writeWatchlist } from "./watchlistEngine.js";
import { writeSummaryReport } from "./summaryReportEngine.js";
import { writeHtmlReport } from "./htmlReportEngine.js";
import { writeQuantumFieldReport } from "./quantumFieldReportEngine.js";
import { writeQuantumSuiteHealthReport } from "./quantumSuiteHealthReportEngine.js";
import { writeCalibrationReport } from "./calibrationReportEngine.js";
import { writePrePumpPatternReport } from "./prePumpPatternReportEngine.js";
import { writeInstitutionalVNextReport } from "./institutionalVNextReportEngine.js";
import { writeWatchtowerReports } from "./watchtowerReportEngine.js";
import { writeWatchtowerPerformanceReport } from "./watchtowerPerformanceReportEngine.js";
import { writeStateOfArtReport } from "./stateOfArtReportEngine.js";
import { writeAICouncilReports } from "./aiCouncilReportEngine.js";
import { writeResearchOSReports } from "./researchOSReportEngine.js";
import { writeEngineAuditReport } from "./engineAuditReportEngine.js";
import { writeSimulationBrainReport } from "./simulationBrainReportEngine.js";
import { writeOutcomeJudgeReport } from "./outcomeJudgeReportEngine.js";
import { writeDossierSwarmReport } from "./dossierSwarmReportEngine.js";
import { writeLiveCatalystRadarReport } from "./liveCatalystRadarReportEngine.js";
import { writeRoadmapReport } from "./roadmapReportEngine.js";
import { writeAICommandCenterReport } from "./aiCommandCenterReportEngine.js";
import { writeAlphaOSReports } from "./alphaOSReportEngine.js";
import { writeAlphaDashboardV2Report } from "./alphaDashboardV2ReportEngine.js";
import { writeAutonomousResearchReport } from "./autonomousResearchReportEngine.js";
import { writeBreakoutBrainReport } from "./breakoutBrainReportEngine.js";
import { writeHighTechAlphaStackReport } from "./highTechAlphaStackReportEngine.js";
import { writeSelfEvolvingAlphaOSReport } from "./selfEvolvingAlphaOSReportEngine.js";
import { writeProofCarryingAlphaContractReport } from "./proofCarryingAlphaContractReportEngine.js";
import { writeAlphaEvolutionGovernorReport } from "./alphaEvolutionGovernorReportEngine.js";
import { writeKnowledgeGraphTwinReports } from "./knowledgeGraphTwinReportEngine.js";
import { writeAutonomousCausalAlphaNetworkReport } from "./autonomousCausalAlphaNetworkReportEngine.js";
import { writeSmallCapHunterReport } from "./smallCapHunterReportEngine.js";
import { writeProofOfAlphaExecutionTwinReport } from "./proofOfAlphaExecutionTwinReportEngine.js";
import { writeOrganicDemandIntegrityReport } from "./organicDemandIntegrityReportEngine.js";
import { writeDiscoveryTruthReport } from "./discoveryTruthReportEngine.js";
import { writeNativeDiscoveryMeshReport } from "./nativeDiscoveryMeshReportEngine.js";
import { writeDiscoveryDecisionReport } from "./discoveryDecisionReportEngine.js";
import { writePreConsensusBreakoutReport } from "./preConsensusBreakoutReportEngine.js";
import { writePreBreakoutRadarReport } from "./preBreakoutRadarReportEngine.js";
import { writeSniperReport } from "./sniperReportEngine.js";
import { writeUniverseLedgerReport } from "./universeLedgerReportEngine.js";
import { writeIntegrityStackReport } from "./integrityStackReportEngine.js";
import { writeInstitutionalDataProvenanceReport } from "./institutionalDataProvenanceReportEngine.js";
import { writeProgressiveOpportunityReport } from "./progressiveOpportunityReportEngine.js";
import { writeMarketOpportunityReports } from "./marketOpportunityReportEngine.js";
import { writeMarketOpportunityLearningReport } from "./marketOpportunityLearningReportEngine.js";
import { writeOpModeReadinessReport } from "../ops/opModeReadiness.js";
import { writeEvidenceCalibratedKernelReport } from "../kernel/evidenceCalibratedKernel.js";
import { writeSourceRouterReport } from "../data/adaptiveSourceRouter.js";
import { writeLocalAIResearchReport } from "./localAIResearchReportEngine.js";
import { writeTop10BreakoutReports } from "./top10BreakoutReportEngine.js";
import { writeSevenDayTenXResearchReport } from "./sevenDayTenXResearchReportEngine.js";
import { writeScannerVNextReport } from "./scannerVNextReportEngine.js";
import { writeAlphaTruthKernelReport } from "./alphaTruthKernelReportEngine.js";
import { writeEngineDataReadinessReport } from "./engineDataReadinessReportEngine.js";
import { writeCapitalMigrationReport } from "./capitalMigrationReportEngine.js";
import { writeCapitalRotationReports } from "./capitalRotationReportEngine.js";
import { writePipelineStageHealthReport } from "./pipelineStageHealthReportEngine.js";
import { writeExactOutcomeLabReport } from "./exactOutcomeLabReportEngine.js";
import { writeMathematicalValidationReport } from "./mathematicalValidationReportEngine.js";
import { writeRouteAccessibilityReports } from "./routeAccessibilityReportEngine.js";
import { writeDataStarvationRootCauseReports } from "./dataStarvationRootCauseReportEngine.js";
import { writeStarvationRescueQueueReport } from "./starvationRescueQueueReportEngine.js";
import { writeRecoveredOpportunityWatchlistReport } from "./recoveredOpportunityWatchlistReportEngine.js";
import { writeFirstSeenOpportunityReport } from "./firstSeenOpportunityReportEngine.js";
import { writeMissedWinnerReplayReport } from "./missedWinnerReplayReportEngine.js";
import { writeEarlyAsymmetryReport } from "./earlyAsymmetryReportEngine.js";
import { writeAliasResolutionReports } from "./aliasResolutionReportEngine.js";
import { writeAdvertisedCategoryCoverageReport } from "./advertisedCategoryCoverageReportEngine.js";
import {
  compactMetaForReportWriters,
  compactProjectsForReportWriters,
} from "./reportPayloadCompactor.js";

export function generateReports(projects = [], meta = {}) {
  projects = compactProjectsForReportWriters(projects);
  meta = compactMetaForReportWriters(meta);

  const jsonPath = writeJsonReport(projects, meta);
  const csvPath = writeCsvReport(projects);
  const { filePath: watchlistPath, watchlist } = writeWatchlist(projects);
  const summaryPath = writeSummaryReport(projects);
  const htmlPath = writeHtmlReport(projects);
  const quantumFieldPath = writeQuantumFieldReport(projects);
  const {
    healthPath: quantumSuiteHealthPath,
    reasoningPath: quantumReasoningBrainPath,
  } = writeQuantumSuiteHealthReport(projects);
  const calibrationPath = writeCalibrationReport();
  const prePumpPatternPath = writePrePumpPatternReport();
  const institutionalVNextPath = writeInstitutionalVNextReport(projects);
  const stateOfArtPath = writeStateOfArtReport(projects);
  const {
    councilPath: aiCouncilPath,
    performancePath: agentPerformancePath,
  } = writeAICouncilReports(projects);
  const {
    researchOSPath,
    alphaLabPath,
  } = writeResearchOSReports(projects);
  const {
    filePath: simulationBrainPath,
  } = writeSimulationBrainReport(projects);
  const {
    filePath: outcomeJudgePath,
  } = writeOutcomeJudgeReport(projects);
  const {
    filePath: catalystRadarPath,
  } = writeLiveCatalystRadarReport(projects);
  const {
    filePath: dossierSwarmPath,
  } = writeDossierSwarmReport(projects);
  const {
    filePath: roadmapPath,
  } = writeRoadmapReport();
  const {
    commandCenterPath,
    commanderPath,
    alphaPath: alphaInvestigatorPath,
    warRoomPath,
  } = writeAICommandCenterReport(projects);
  const {
    strategyLabPath,
    causalBrainPath,
    alphaOSPath,
  } = writeAlphaOSReports(projects);
  const {
    filePath: alphaDashboardV2Path,
    paperLabPath,
    weightOptimizerPath,
    sourceTruthPath,
    githubProPath,
  } = writeAlphaDashboardV2Report(projects);
  const {
    filePath: autonomousResearchPath,
  } = writeAutonomousResearchReport(projects);
  const {
    filePath: breakoutBrainPath,
  } = writeBreakoutBrainReport(projects);
  const {
    filePath: highTechAlphaStackPath,
  } = writeHighTechAlphaStackReport(projects);
  const {
    filePath: selfEvolvingAlphaOSPath,
    thesisPath: alphaThesesPath,
  } = writeSelfEvolvingAlphaOSReport(projects);
  const {
    filePath: alphaContractsPath,
    leaderboardPath: alphaContractLeaderboardPath,
    receiptsPath: alphaContractReceiptsPath,
  } = writeProofCarryingAlphaContractReport(projects);
  const {
    alphaKnowledgeGraphPath,
    causalMarketTwinPath,
  } = writeKnowledgeGraphTwinReports(projects);
  const {
    filePath: autonomousCausalNetworkPath,
  } = writeAutonomousCausalAlphaNetworkReport(projects);
  const {
    filePath: alphaEvolutionGovernorPath,
    queuePath: alphaEvolutionQueuePath,
  } = writeAlphaEvolutionGovernorReport(projects);
  const {
    filePath: smallCapHunterPath,
  } = writeSmallCapHunterReport(projects);
  const {
    filePath: proofOfAlphaExecutionTwinPath,
  } = writeProofOfAlphaExecutionTwinReport(projects);
  const {
    filePath: organicDemandIntegrityPath,
  } = writeOrganicDemandIntegrityReport(projects);
  const {
    filePath: discoveryTruthPath,
  } = writeDiscoveryTruthReport(meta);
  const {
    filePath: nativeDiscoveryMeshPath,
  } = writeNativeDiscoveryMeshReport(projects, meta);
  const {
    filePath: discoveryDecisionPath,
  } = writeDiscoveryDecisionReport(projects, meta);
  const {
    filePath: preConsensusBreakoutPath,
  } = writePreConsensusBreakoutReport(projects);
  const {
    filePath: preBreakoutRadarPath,
  } = writePreBreakoutRadarReport(projects);
  const {
    filePath: sniperReportPath,
  } = writeSniperReport(projects);
  const {
    filePath: universeLedgerPath,
  } = writeUniverseLedgerReport(meta);
  const {
    filePath: integrityStackPath,
    report: integrityStack,
  } = writeIntegrityStackReport(projects, meta);
  const {
    filePath: institutionalDataProvenancePath,
  } = writeInstitutionalDataProvenanceReport(projects);
  const {
    filePath: progressiveOpportunitiesPath,
    institutionalRankingPath,
    bestAvailablePath,
    emergingRadarPath,
    executionReadyPath,
    blockedProjectsPath,
    debugProgressiveLadderPath,
    debugIdentityConflictsPath,
    debugExecutionProofPath,
    debugBlockReasonsPath,
    debugStageHealthPath,
  } = writeProgressiveOpportunityReport(projects);
  const {
    bestOpportunityNowPath,
    topFiveOpportunitiesPath,
    timeHorizonLeadersPath,
    opportunityLaneLeadersPath,
    finalistComparisonPath,
    crawlerChangesPath,
    localAIChiefJudgmentPath,
  } = writeMarketOpportunityReports(projects);
  const {
    top10Path: top10BreakoutPath,
    htmlPath: top10BreakoutHtmlPath,
    csvPath: top10BreakoutCsvPath,
    explanationsPath: top10BreakoutExplanationsPath,
    excludedPath: top10ExcludedFinalistsPath,
    bestNowPath: top10BestOpportunityNowPath,
  } = writeTop10BreakoutReports(projects, meta);
  const {
    filePath: marketOpportunityLearningPath,
  } = writeMarketOpportunityLearningReport(projects, meta);
  const {
    filePath: sevenDayTenXResearchPath,
  } = writeSevenDayTenXResearchReport(projects);
  const {
    filePath: scannerVNextPath,
  } = writeScannerVNextReport(projects);
  const {
    filePath: capitalMigrationCorePath,
  } = writeCapitalMigrationReport(projects);
  const {
    chainCapitalRotationPath,
    narrativeCapitalRotationPath,
    marketCapRotationPath,
    capitalOutflowWatchPath,
  } = writeCapitalRotationReports(projects);
  const {
    filePath: pipelineStageHealthPath,
  } = writePipelineStageHealthReport(projects);
  const {
    filePath: exactOutcomeHorizonLabPath,
  } = writeExactOutcomeLabReport(projects);
  const {
    filePath: mathematicalValidationPath,
  } = writeMathematicalValidationReport(meta);
  const {
    filePath: engineDataReadinessPath,
  } = writeEngineDataReadinessReport(projects);
  const {
    routeUniversePath,
    alternativeRoutesPath,
    userAccessibilityRankingPath,
    venueCoverageHealthPath,
  } = writeRouteAccessibilityReports(projects, meta);
  const {
    dataStarvationRootCausePath,
    dataStarvationByChainPath,
    dataStarvationByProviderPath,
    dataStarvationByEnginePath,
    dataStarvationByFieldPath,
  } = writeDataStarvationRootCauseReports(projects, meta);
  const {
    filePath: starvationRescueQueuePath,
    report: starvationRescueQueue,
  } = writeStarvationRescueQueueReport(projects, meta);
  const {
    filePath: recoveredOpportunityWatchlistPath,
    recoveryPath: starvationRecoveryResultsPath,
  } = writeRecoveredOpportunityWatchlistReport(projects, meta);
  const {
    filePath: firstSeenOpportunitiesPath,
  } = writeFirstSeenOpportunityReport(projects, meta);
  const {
    filePath: missedWinnerReplayPath,
  } = writeMissedWinnerReplayReport(projects, meta);
  const {
    filePath: earlyAsymmetryRankingPath,
    preBreakoutSequencePath,
    earlyOpportunityOutcomesPath,
  } = writeEarlyAsymmetryReport(projects, meta);
  const {
    aliasResolutionSummaryPath,
    aliasResolutionConflictsPath,
    providerVocabularyCoveragePath,
    unresolvedFieldVerbiagePath,
    rejectedAliasCandidatesPath,
    aliasStarvationRecoveriesPath,
  } = writeAliasResolutionReports(projects, meta);
  const {
    filePath: advertisedCategoryCoveragePath,
  } = writeAdvertisedCategoryCoverageReport(projects, meta);
  const {
    filePath: alphaTruthKernelPath,
  } = writeAlphaTruthKernelReport(projects, meta);
  const {
    filePath: opModeReadinessPath,
    report: opModeReadiness,
  } = writeOpModeReadinessReport();
  const {
    filePath: evidenceKernelPath,
  } = writeEvidenceCalibratedKernelReport(projects, {
    ...meta,
    opModeReadiness,
    integrityStack,
  });
  const {
    filePath: sourceRouterPath,
  } = writeSourceRouterReport();
  const {
    filePath: engineAuditPath,
  } = writeEngineAuditReport();
  const {
    alertsPath,
    briefPath,
    alerts,
    brief,
  } = writeWatchtowerReports(projects);
  const {
    filePath: watchtowerPerformancePath,
    report: watchtowerPerformance,
  } = writeWatchtowerPerformanceReport();
  const {
    filePath: localAIResearchPath,
  } = writeLocalAIResearchReport();

  return {
    htmlPath,
    jsonPath,
    csvPath,
    quantumFieldPath,
    quantumSuiteHealthPath,
    quantumReasoningBrainPath,
    calibrationPath,
    prePumpPatternPath,
    institutionalVNextPath,
    stateOfArtPath,
    aiCouncilPath,
    agentPerformancePath,
    researchOSPath,
    alphaLabPath,
    simulationBrainPath,
    outcomeJudgePath,
    catalystRadarPath,
    dossierSwarmPath,
    roadmapPath,
    commandCenterPath,
    commanderPath,
    alphaInvestigatorPath,
    warRoomPath,
    strategyLabPath,
    causalBrainPath,
    alphaOSPath,
    alphaDashboardV2Path,
    paperLabPath,
    weightOptimizerPath,
    sourceTruthPath,
    githubProPath,
    autonomousResearchPath,
    breakoutBrainPath,
    highTechAlphaStackPath,
    selfEvolvingAlphaOSPath,
    alphaThesesPath,
    alphaContractsPath,
    alphaContractLeaderboardPath,
    alphaContractReceiptsPath,
    alphaKnowledgeGraphPath,
    causalMarketTwinPath,
    autonomousCausalNetworkPath,
    alphaEvolutionGovernorPath,
    alphaEvolutionQueuePath,
    smallCapHunterPath,
    proofOfAlphaExecutionTwinPath,
    organicDemandIntegrityPath,
    discoveryTruthPath,
    nativeDiscoveryMeshPath,
    discoveryDecisionPath,
    preConsensusBreakoutPath,
    preBreakoutRadarPath,
    sniperReportPath,
    universeLedgerPath,
    integrityStackPath,
    institutionalDataProvenancePath,
    progressiveOpportunitiesPath,
    institutionalRankingPath,
    bestAvailablePath,
    emergingRadarPath,
    executionReadyPath,
    blockedProjectsPath,
    debugProgressiveLadderPath,
    debugIdentityConflictsPath,
    debugExecutionProofPath,
    debugBlockReasonsPath,
    debugStageHealthPath,
    bestOpportunityNowPath,
    top10BestOpportunityNowPath,
    topFiveOpportunitiesPath,
    top10BreakoutPath,
    top10BreakoutHtmlPath,
    top10BreakoutCsvPath,
    top10BreakoutExplanationsPath,
    top10ExcludedFinalistsPath,
    timeHorizonLeadersPath,
    opportunityLaneLeadersPath,
    finalistComparisonPath,
    crawlerChangesPath,
    localAIChiefJudgmentPath,
    marketOpportunityLearningPath,
    sevenDayTenXResearchPath,
    scannerVNextPath,
    capitalMigrationCorePath,
    chainCapitalRotationPath,
    narrativeCapitalRotationPath,
    marketCapRotationPath,
    capitalOutflowWatchPath,
    pipelineStageHealthPath,
    exactOutcomeHorizonLabPath,
    mathematicalValidationPath,
    engineDataReadinessPath,
    routeUniversePath,
    alternativeRoutesPath,
    userAccessibilityRankingPath,
    venueCoverageHealthPath,
    dataStarvationRootCausePath,
    dataStarvationByChainPath,
    dataStarvationByProviderPath,
    dataStarvationByEnginePath,
    dataStarvationByFieldPath,
    starvationRescueQueuePath,
    starvationRecoveryResultsPath,
    recoveredOpportunityWatchlistPath,
    firstSeenOpportunitiesPath,
    missedWinnerReplayPath,
    earlyAsymmetryRankingPath,
    preBreakoutSequencePath,
    earlyOpportunityOutcomesPath,
    aliasResolutionSummaryPath,
    aliasResolutionConflictsPath,
    providerVocabularyCoveragePath,
    unresolvedFieldVerbiagePath,
    rejectedAliasCandidatesPath,
    aliasStarvationRecoveriesPath,
    advertisedCategoryCoveragePath,
    alphaTruthKernelPath,
    opModeReadinessPath,
    evidenceKernelPath,
    sourceRouterPath,
    engineAuditPath,
    alertsPath,
    briefPath,
    watchtowerPerformancePath,
    localAIResearchPath,
    watchlistPath,
    summaryPath,
    watchlistCount: watchlist.length,
    alertCount: alerts.length,
    criticalAlertCount: alerts.filter((alert) => alert.severity === "Critical").length,
    highAlertCount: alerts.filter((alert) => alert.severity === "High").length,
    dailyBrief: brief.brief,
    watchtowerHitRate: watchtowerPerformance.hitRate,
    watchtowerEvaluatedAlerts: watchtowerPerformance.evaluatedAlerts,
    watchtowerPendingAlerts: watchtowerPerformance.pendingAlerts,
    starvationRescueCandidateCount: starvationRescueQueue.rescueCandidates || 0,
  };
}
