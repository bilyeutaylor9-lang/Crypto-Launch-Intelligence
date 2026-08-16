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
import { writeThreeClockEdgeReport } from "./threeClockEdgeReportEngine.js";
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
import { writeEngineDataContractHealthReport } from "./engineDataContractHealthReportEngine.js";
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
import { writeCrawlerReports } from "./webCrawlerReportEngine.js";
import { writeUtilityQualityReport } from "./utilityQualityReportEngine.js";
import { writeHighUpsideScalpReport } from "./highUpsideScalpReportEngine.js";
import { writeScalpMicrostructureReport } from "./scalpMicrostructureReportEngine.js";
import { writeHottestTenNowReport } from "./hottestTenNowReportEngine.js";
import { writeDailyCapitalMoveReport } from "./dailyCapitalMoveReportEngine.js";
import { writeDailyRecoveryQueueReport } from "./dailyRecoveryQueueReportEngine.js";
import { writeDailySourceGapReport } from "./dailySourceGapReportEngine.js";
import { writeExecutionProofRecoveryReport } from "./executionProofRecoveryReportEngine.js";
import { writeSystemReadinessReport } from "./systemReadinessReportEngine.js";
import { writeDecisionReportCompactionAudit } from "./decisionReportCompactionAuditEngine.js";
import { writeScanArtifactManifest } from "./scanArtifactManifestReportEngine.js";
import { writeGuardedLiveRankingReports } from "../ranking/guardedLiveRankingEngine.js";
import { writeExplosionReadinessReport } from "./explosionReadinessReportEngine.js";
import { REQUIRED_REPORT_FILES } from "./reportContractValidator.js";
import { sanitizeReportJsonFiles } from "./reportValueSanitizer.js";
import {
  compactMetaForReportWriters,
  compactProjectsForReportWriters,
} from "./reportPayloadCompactor.js";

export function generateReports(projects = [], meta = {}) {
  const precomputedPipelineStageHealth = meta.pipelineStageHealth;
  const fullProjects = Array.isArray(projects) ? projects : [];
  const { filePath: explosionReadinessPath } = writeExplosionReadinessReport(fullProjects, meta);
  const {
    liveCoreRankingJsonPath,
    liveCoreRankingMarkdownPath,
    liveCoreRankingCsvPath,
    microTestWatchlistPath,
  } = writeGuardedLiveRankingReports(fullProjects, meta);
  meta = { ...meta };
  delete meta.pipelineStageHealth;

  projects = compactProjectsForReportWriters(fullProjects);
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
  } = writeAlphaOSReports(projects, meta);
  const {
    filePath: alphaDashboardV2Path,
    paperLabPath,
    weightOptimizerPath,
    sourceTruthPath,
    githubProPath,
  } = writeAlphaDashboardV2Report(fullProjects, meta);
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
    filePath: threeClockEdgePath,
  } = writeThreeClockEdgeReport(projects);
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
  } = writeProgressiveOpportunityReport(fullProjects);
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
    candidateInputPath: top10CandidateInputPath,
    htmlPath: top10BreakoutHtmlPath,
    csvPath: top10BreakoutCsvPath,
    explanationsPath: top10BreakoutExplanationsPath,
    excludedPath: top10ExcludedFinalistsPath,
    bestNowPath: top10BestOpportunityNowPath,
  } = writeTop10BreakoutReports(fullProjects, meta);
  const {
    filePath: marketOpportunityLearningPath,
  } = writeMarketOpportunityLearningReport(projects, meta);
  const {
    filePath: sevenDayTenXResearchPath,
  } = writeSevenDayTenXResearchReport(projects);
  const {
    filePath: scannerVNextPath,
  } = writeScannerVNextReport(fullProjects);
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
  } = writePipelineStageHealthReport(projects, {
    precomputedReport: precomputedPipelineStageHealth,
  });
  const {
    filePath: exactOutcomeHorizonLabPath,
  } = writeExactOutcomeLabReport(projects);
  const {
    filePath: mathematicalValidationPath,
  } = writeMathematicalValidationReport(meta);
  const {
    filePath: engineDataReadinessPath,
  } = writeEngineDataReadinessReport(fullProjects);
  const {
    filePath: engineDataContractHealthPath,
  } = writeEngineDataContractHealthReport(fullProjects, meta);
  const {
    routeUniversePath,
    alternativeRoutesPath,
    userAccessibilityRankingPath,
    venueCoverageHealthPath,
  } = writeRouteAccessibilityReports(fullProjects, meta);
  const {
    filePath: executionProofRecoveryPath,
    report: executionProofRecovery,
  } = writeExecutionProofRecoveryReport(fullProjects, meta);
  const {
    dataStarvationRootCausePath,
    dataStarvationByChainPath,
    dataStarvationByProviderPath,
    dataStarvationByEnginePath,
    dataStarvationByFieldPath,
  } = writeDataStarvationRootCauseReports(fullProjects, meta);
  const {
    filePath: starvationRescueQueuePath,
    report: starvationRescueQueue,
  } = writeStarvationRescueQueueReport(fullProjects, meta);
  const {
    filePath: recoveredOpportunityWatchlistPath,
    recoveryPath: starvationRecoveryResultsPath,
  } = writeRecoveredOpportunityWatchlistReport(fullProjects, meta);
  const {
    filePath: firstSeenOpportunitiesPath,
  } = writeFirstSeenOpportunityReport(fullProjects, meta);
  const {
    filePath: missedWinnerReplayPath,
  } = writeMissedWinnerReplayReport(fullProjects, meta);
  const {
    filePath: earlyAsymmetryRankingPath,
    preBreakoutSequencePath,
    earlyOpportunityOutcomesPath,
  } = writeEarlyAsymmetryReport(fullProjects, meta);
  const {
    aliasResolutionSummaryPath,
    aliasResolutionConflictsPath,
    providerVocabularyCoveragePath,
    unresolvedFieldVerbiagePath,
    rejectedAliasCandidatesPath,
    aliasStarvationRecoveriesPath,
  } = writeAliasResolutionReports(fullProjects, meta);
  const {
    filePath: advertisedCategoryCoveragePath,
  } = writeAdvertisedCategoryCoverageReport(projects, meta);
  const {
    healthPath: crawlerHealthPath,
    markdownPath: crawlerHealthMarkdownPath,
  } = writeCrawlerReports(projects, meta);
  const {
    filePath: utilityQualityPath,
  } = writeUtilityQualityReport(fullProjects, meta);
  const {
    filePath: highUpsideScalpPath,
  } = writeHighUpsideScalpReport(fullProjects, meta);
  const {
    filePath: scalpMicrostructurePath,
  } = writeScalpMicrostructureReport(fullProjects, meta);
  const {
    filePath: hottestTenNowPath,
  } = writeHottestTenNowReport(fullProjects, meta);
  const {
    filePath: dailyCapitalMovePath,
  } = writeDailyCapitalMoveReport(fullProjects, meta);
  const {
    filePath: dailyRecoveryQueuePath,
  } = writeDailyRecoveryQueueReport(fullProjects, meta);
  const {
    filePath: decisionReportCompactionAuditPath,
    markdownPath: decisionReportCompactionAuditMarkdownPath,
  } = writeDecisionReportCompactionAudit(fullProjects, meta);
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
    report: sourceRouter,
  } = writeSourceRouterReport();
  const {
    filePath: dailySourceGapsPath,
    report: dailySourceGaps,
  } = writeDailySourceGapReport({
    ...meta,
    opModeReadiness,
    sourceRouter,
    executionProofRecovery,
  });
  const {
    filePath: engineAuditPath,
  } = writeEngineAuditReport();
  const {
    alertsPath,
    briefPath,
    alerts,
    brief,
  } = writeWatchtowerReports(fullProjects);
  const {
    filePath: watchtowerPerformancePath,
    report: watchtowerPerformance,
  } = writeWatchtowerPerformanceReport();
  const {
    filePath: localAIResearchPath,
  } = writeLocalAIResearchReport();
  const {
    filePath: systemReadinessPath,
  } = writeSystemReadinessReport({
    ...meta,
    opModeReadiness,
    sourceRouter,
    dailySourceGaps,
  });
  const {
    filePath: scanArtifactManifestPath,
  } = writeScanArtifactManifest(meta);

  sanitizeReportJsonFiles(REQUIRED_REPORT_FILES);

  return {
    htmlPath,
    jsonPath,
    csvPath,
    liveCoreRankingJsonPath,
    explosionReadinessPath,
    liveCoreRankingMarkdownPath,
    liveCoreRankingCsvPath,
    microTestWatchlistPath,
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
    threeClockEdgePath,
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
    top10CandidateInputPath,
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
    engineDataContractHealthPath,
    routeUniversePath,
    executionProofRecoveryPath,
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
    crawlerHealthPath,
    crawlerHealthMarkdownPath,
    utilityQualityPath,
    highUpsideScalpPath,
    scalpMicrostructurePath,
    hottestTenNowPath,
    dailyCapitalMovePath,
    dailyRecoveryQueuePath,
    decisionReportCompactionAuditPath,
    decisionReportCompactionAuditMarkdownPath,
    alphaTruthKernelPath,
    opModeReadinessPath,
    evidenceKernelPath,
    sourceRouterPath,
    dailySourceGapsPath,
    engineAuditPath,
    alertsPath,
    briefPath,
    watchtowerPerformancePath,
    localAIResearchPath,
    systemReadinessPath,
    scanArtifactManifestPath,
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
