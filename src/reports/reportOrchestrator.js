import { writeJsonReport } from "./jsonReportEngine.js";
import { writeCsvReport } from "./csvExportEngine.js";
import { writeWatchlist } from "./watchlistEngine.js";
import { writeSummaryReport } from "./summaryReportEngine.js";
import { writeHtmlReport } from "./htmlReportEngine.js";
import { writeQuantumFieldReport } from "./quantumFieldReportEngine.js";
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
import { writeSniperReport } from "./sniperReportEngine.js";
import { writeUniverseLedgerReport } from "./universeLedgerReportEngine.js";
import { writeSourceRouterReport } from "../data/adaptiveSourceRouter.js";

export function generateReports(projects = [], meta = {}) {
  const jsonPath = writeJsonReport(projects, meta);
  const csvPath = writeCsvReport(projects);
  const { filePath: watchlistPath, watchlist } = writeWatchlist(projects);
  const summaryPath = writeSummaryReport(projects);
  const htmlPath = writeHtmlReport(projects);
  const quantumFieldPath = writeQuantumFieldReport(projects);
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
    filePath: sniperReportPath,
  } = writeSniperReport(projects);
  const {
    filePath: universeLedgerPath,
  } = writeUniverseLedgerReport(meta);
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

  return {
    htmlPath,
    jsonPath,
    csvPath,
    quantumFieldPath,
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
    sniperReportPath,
    universeLedgerPath,
    sourceRouterPath,
    engineAuditPath,
    alertsPath,
    briefPath,
    watchtowerPerformancePath,
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
  };
}
