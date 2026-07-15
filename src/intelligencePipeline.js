import { analyzeRichTokenIntelligenceBatch } from "./engines/richTokenIntelligenceEngine.js";
import { analyzeInfrastructureNarrativeBatch } from "./engines/infrastructureNarrativeEngine.js";
import { analyzeMarketRankBatch } from "./engines/marketRankingEngine.js";

import { analyzeNarratives } from "./engines/narrativeEngine.js";
import { analyzeNarrativeForecastBatch } from "./engines/narrativeForecastEngine.js";
import { analyzeNarrativeLaunchStakingBatch } from "./engines/narrativeLaunchStakingEngine.js";

import { analyzeDeveloperActivityBatch } from "./engines/developerActivityEngine.js";
import { analyzeGithubBatch } from "./engines/githubQualityEngine.js";
import { analyzeCommunityGrowthBatch } from "./engines/communityGrowthEngine.js";
import { analyzeSocialAccelerationBatch } from "./engines/socialAccelerationEngine.js";
import { analyzeXSocialIntelligenceBatch } from "./engines/xSocialIntelligenceEngine.js";
import { analyzeExternalIntelligenceBatch } from "./engines/externalIntelligenceEngine.js";
import { analyzeWebResearchAgentBatch } from "./engines/webResearchAgentEngine.js";
import { analyzeRoadmapCatalystProfitBatch } from "./engines/roadmapCatalystProfitEngine.js";
import { analyzeLiquidityBatch } from "./engines/liquidityIntelligenceEngine.js";
import { analyzeHolderGrowthBatch } from "./engines/holderGrowthEngine.js";
import { analyzeWhaleActivityBatch } from "./engines/whaleActivityEngine.js";
import { analyzeSmartWalletBatch } from "./engines/smartWalletEngine.js";
import { analyzeSmartWalletPerformanceBatch } from "./engines/smartWalletPerformanceEngine.js";
import { analyzeSmartMoneyAccumulationBatch } from "./engines/smartMoneyAccumulationEngine.js";

import { analyzeExchangeProbabilityBatch } from "./engines/exchangeProbabilityEngine.js";
import { analyzeCatalystsBatch } from "./engines/catalystEngine.js";
import { analyzeCatalystCalendarBatch } from "./engines/catalystCalendarEngine.js";
import { analyzeTokenomicsBatch } from "./engines/tokenomicsEngine.js";
import { analyzeFundingBackersBatch } from "./engines/fundingBackerEngine.js";
import { analyzePartnershipsBatch } from "./engines/partnershipEngine.js";
import { analyzeEcosystemIntegrationBatch } from "./engines/ecosystemIntegrationEngine.js";

import { analyzeBaselineBatch } from "./engines/baselineEngine.js";
import { analyzeVelocityBatch } from "./engines/velocityEngine.js";
import { analyzeAccelerationBatch } from "./engines/accelerationEngine.js";
import { analyzeTrendChangeBatch } from "./engines/trendChangeEngine.js";
import { analyzeMomentumCompressionBatch } from "./engines/momentumCompressionEngine.js";
import { analyzeCapitalFlowBatch } from "./engines/capitalFlowEngine.js";
import { analyzeBuyPressureBatch } from "./engines/buyPressureEngine.js";
import { analyzeSellPressureBatch } from "./engines/sellPressureEngine.js";
import { analyzeRelativeStrengthBatch } from "./engines/relativeStrengthEngine.js";
import { analyzeSmartMoneyRotationBatch } from "./engines/smartMoneyRotationEngine.js";
import { analyzeOpportunityTimingBatch } from "./engines/opportunityTimingEngine.js";
import { analyzeEarlyBreakoutBatch } from "./engines/earlyBreakoutEngine.js";
import { analyzeVolatilityExpansionBatch } from "./engines/volatilityExpansionEngine.js";
import { analyzeLiquidityExpansionBatch } from "./engines/liquidityExpansionEngine.js";
import { analyzeMomentumShiftBatch } from "./engines/momentumShiftEngine.js";
import { analyzeInstitutionalLearningBatch } from "./engines/institutionalLearningEngine.js";
import { analyzeOutcomeLearningBatch } from "./engines/outcomeLearningEngine.js";
import { analyzePrePumpPatternBatch } from "./engines/prePumpPatternEngine.js";
import { analyzeSignalCombinationsBatch } from "./engines/signalCombinationEngine.js";
import { analyzeOutcomeCalibrationBatch } from "./engines/outcomeCalibrationEngine.js";
import { analyzeQuantumOutcomeFieldBatch } from "./engines/quantumOutcomeFieldEngine.js";
import { analyzeAIResearchAnalystBatch } from "./engines/aiResearchAnalystEngine.js";
import { analyzeInstitutionalVNextBatch } from "./engines/institutionalVNextEngine.js";
import { analyzeOpportunityProofBatch } from "./engines/opportunityProofEngine.js";
import { analyzeNarrativeHeatIndexBatch } from "./engines/narrativeHeatIndexEngine.js";
import { analyzeProjectChangeBatch } from "./engines/projectChangeDetectionEngine.js";
import { analyzeTrapRiskBatch } from "./engines/trapRiskEngine.js";
import { analyzeSourceReliabilityBatch } from "./engines/sourceReliabilityEngine.js";
import { analyzeSourceTruthBatch } from "./engines/sourceTruthEngine.js";
import { analyzeGithubIntelligenceProBatch } from "./engines/githubIntelligenceProEngine.js";
import { analyzeOrganicDemandIntegrityBatch } from "./engines/organicDemandIntegrityEngine.js";
import { analyzeActiveLiquidityTruthBatch } from "./engines/activeLiquidityTruthEngine.js";
import { analyzeOrganicBuyerClassifierBatch } from "./engines/organicBuyerClassifierEngine.js";
import { analyzeDeployerReputationBatch } from "./engines/deployerReputationEngine.js";
import { analyzeProjectIdentityBatch } from "./engines/projectIdentityEngine.js";
import { analyzeWalletClusterBatch } from "./engines/walletClusterEngine.js";
import { analyzeBundledLaunchBatch } from "./engines/bundledLaunchEngine.js";
import { analyzeWashTradingBatch } from "./engines/washTradingEngine.js";
import { analyzeSmartWalletArrivalBatch } from "./engines/smartWalletArrivalEngine.js";
import { analyzeBuyerRetentionBatch } from "./engines/buyerRetentionEngine.js";
import { analyzeOrganicBuyerBatch } from "./engines/organicBuyerEngine.js";
import { analyzeInstantSafetyGateBatch } from "./engines/instantSafetyGateEngine.js";
import { analyzeCandidateLifecycleBatch } from "./engines/candidateLifecycleEngine.js";
import { analyzeDiscoveryDecisionBatch } from "./engines/discoveryDecisionEngine.js";
import { analyzeMissedWinnerLabBatch } from "./engines/missedWinnerLabEngine.js";
import { analyzeConfidenceAdjustedRankBatch } from "./engines/confidenceAdjustedRankEngine.js";
import { analyzeAIEcosystemCouncilBatch } from "./engines/aiEcosystemCouncilEngine.js";
import { analyzeResearchOperatingSystemBatch } from "./engines/researchOperatingSystemEngine.js";
import { analyzeAutonomousAlphaLabBatch } from "./engines/autonomousAlphaLabEngine.js";
import { analyzeQuantumReasoningBrainBatch } from "./engines/quantumReasoningBrainEngine.js";
import { analyzeWorldModelBrainBatch } from "./engines/worldModelBrainEngine.js";
import { analyzeAutonomousMarketScientistBatch } from "./engines/autonomousMarketScientistEngine.js";
import { analyzeSelfTrainingMarketSimulationBrainBatch } from "./engines/selfTrainingMarketSimulationBrainEngine.js";
import { analyzeAutonomousOutcomeJudgeBatch } from "./engines/autonomousOutcomeJudgeEngine.js";
import { analyzeLiveCatalystRadarBatch } from "./engines/liveCatalystRadarEngine.js";
import { analyzeProjectDossierSwarmBatch } from "./engines/projectDossierSwarmEngine.js";
import { analyzeAIResearchCommanderBatch } from "./engines/aiResearchCommanderEngine.js";
import { analyzeAutonomousAlphaInvestigatorBatch } from "./engines/autonomousAlphaInvestigatorEngine.js";
import { analyzeAIPortfolioWarRoomBatch } from "./engines/aiPortfolioWarRoomEngine.js";
import { analyzeAutonomousStrategyLabBatch } from "./engines/autonomousStrategyLabEngine.js";
import { analyzeCausalAlphaBrainBatch } from "./engines/causalAlphaBrainEngine.js";
import { analyzeAutonomousAlphaOSBatch } from "./engines/autonomousAlphaOSEngine.js";
import { analyzePaperTradingOutcomeLabBatch } from "./engines/paperTradingOutcomeLabEngine.js";
import { analyzeAutoLearningWeightOptimizerBatch } from "./engines/autoLearningWeightOptimizerEngine.js";
import { analyzeBreakoutBrainBatch } from "./engines/breakoutBrainEngine.js";
import { analyzeAutonomousResearchOrchestratorBatch } from "./engines/autonomousResearchOrchestratorEngine.js";
import { analyzeHighTechAlphaStackBatch } from "./engines/highTechAlphaStackEngine.js";
import { analyzeSelfEvolvingAlphaOSBatch } from "./engines/selfEvolvingAlphaOSEngine.js";
import { analyzeProofCarryingAlphaContractBatch } from "./engines/proofCarryingAlphaContractEngine.js";
import { analyzeAutonomousAlphaKnowledgeGraphBatch } from "./engines/autonomousAlphaKnowledgeGraphEngine.js";
import { analyzeCausalMarketTwinBatch } from "./engines/causalMarketTwinEngine.js";
import { analyzeAutonomousCausalAlphaNetworkBatch } from "./engines/autonomousCausalAlphaNetworkEngine.js";
import { analyzeAlphaEvolutionGovernorBatch } from "./engines/alphaEvolutionGovernorEngine.js";
import { analyzeSmallCapHunterBatch } from "./engines/smallCapHunterEngine.js";
import { analyzeProofOfAlphaExecutionTwinBatch } from "./engines/proofOfAlphaExecutionTwinEngine.js";
import { analyzeQuietAccumulationBatch } from "./engines/quietAccumulationEngine.js";
import { analyzePreBreakoutMomentumBatch } from "./engines/preBreakoutMomentumEngine.js";
import { analyzeInformationAdvantageBatch } from "./engines/informationAdvantageEngine.js";
import { analyzeDistressedMicrocapTrapBatch } from "./engines/distressedMicrocapTrapEngine.js";
import { analyzePreConsensusBreakoutHunterBatch } from "./engines/preConsensusBreakoutHunterEngine.js";
import {
  analyzeFinalSelectionIntegrityBatch,
  validateFinalSelectionInvariants,
} from "./engines/finalSelectionIntegrityEngine.js";
import { analyzeSniperOutcomeLabelsBatch } from "./engines/sniperOutcomeLabelEngine.js";
import { analyzeSniperPointInTimeBatch } from "./engines/sniperPointInTimeEngine.js";
import { analyzeSniperLifecycleStateBatch } from "./engines/sniperLifecycleStateEngine.js";
import { analyzeSniperEvidenceFamiliesBatch } from "./engines/sniperEvidenceFamilyEngine.js";
import {
  analyzeSniperIntegrityGateBatch,
  validateSniperIntegrityInvariants,
} from "./engines/sniperIntegrityGateEngine.js";
import { analyzeInstitutionalDataProvenanceBatch } from "./kernel/institutionalDataProvenanceLedger.js";

import { prePumpDetectionEngine } from "./engines/prePumpDetectionEngine.js";

import { saveScanMemory } from "./learning/scanMemoryStore.js";
import { saveProjectWatchlist } from "./learning/projectWatchlistStore.js";
import { saveOutcomeSnapshots } from "./learning/outcomeSnapshotStore.js";
import { saveInternetResearchMemory } from "./learning/internetResearchMemoryStore.js";
import { saveAgentCouncilMemory } from "./learning/agentPerformanceMemoryStore.js";
import { saveStrategyMemory } from "./learning/strategyMemoryStore.js";
import { savePaperTradingOutcomes } from "./learning/paperTradingOutcomeStore.js";
import { saveAutonomousResearchMemory } from "./learning/autonomousResearchMemoryStore.js";
import { saveAlphaContracts } from "./learning/alphaContractStore.js";
import { saveAlphaEvolutionMemory } from "./learning/alphaEvolutionMemoryStore.js";
import { saveAlphaKnowledgeGraph } from "./learning/alphaKnowledgeGraphStore.js";
import { saveCausalAlphaEvents } from "./learning/causalAlphaEventLake.js";

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

function normalizeEngineOutput(output, fallback = []) {
  if (Array.isArray(output)) return output;
  if (Array.isArray(output?.results)) return output.results;
  if (Array.isArray(output?.projects)) return output.projects;
  if (Array.isArray(output?.data)) return output.data;
  if (Array.isArray(output?.tokens)) return output.tokens;
  if (Array.isArray(output?.candidates)) return output.candidates;
  return fallback;
}

function engineTimeoutEnvName(name = "") {
  return `${String(name || "ENGINE")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")}_TIMEOUT_MS`;
}

function engineTimeoutMs(name = "", options = {}) {
  const explicit = num(options.timeoutMs);
  if (explicit > 0) return explicit;

  const scoped = num(process.env[engineTimeoutEnvName(name)]);
  if (scoped > 0) return scoped;

  const global = num(process.env.ENGINE_TIMEOUT_MS);
  if (global > 0) return global;

  return 0;
}

function withEngineTimeout(promise, timeoutMs = 0, name = "Engine") {
  if (!timeoutMs) return promise;

  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${name} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}

export async function runEngine(name, engine, projects, options = {}) {
  const safeProjects = Array.isArray(projects)
    ? projects
    : normalizeEngineOutput(projects, []);

  try {
    if (typeof engine !== "function") {
      console.log(`Skipping ${name}: engine not found`);
      return safeProjects;
    }

    console.log(`Running ${name}...`);

    const timeoutMs = engineTimeoutMs(name, options);
    const output = await withEngineTimeout(engine(safeProjects, options), timeoutMs, name);
    return normalizeEngineOutput(output, safeProjects);
  } catch (error) {
    console.log(`${name} failed: ${error.message}`);
    return safeProjects;
  }
}

function weightedInstitutionalScore(project = {}) {
  const prePumpScore = num(project.prePump?.score);

  const weights = [
    { score: project.marketRankScore, weight: 1.2 },
    { score: project.richTokenScore, weight: 0.9 },
    { score: project.infrastructureNarrativeScore, weight: 0.9 },
    { score: project.narrativeScore, weight: 0.8 },
    { score: project.narrativeForecastScore, weight: 1.0 },
    { score: project.narrativeLaunchStakingScore, weight: 1.0 },
    { score: project.narrativeHeatScore, weight: 0.8 },
    { score: project.launchReadinessScore, weight: 0.7 },
    { score: project.stakingMomentumScore, weight: 0.7 },
    { score: project.xSocialScore, weight: 0.8 },
    { score: project.externalSignalScore, weight: 0.8 },
    { score: project.institutionalWatchScore, weight: 0.9 },
    { score: project.learningEdgeScore, weight: 0.7 },
    { score: project.outcomeLearningScore, weight: 0.9 },
    { score: project.prePumpPatternScore, weight: 1.0 },
    { score: project.signalCombinationScore, weight: 1.0 },
    { score: project.calibrationScore, weight: 0.7 },
    { score: project.quantumOpportunityScore, weight: 0.9 },
    { score: project.aiAnalystScore, weight: 0.9 },
    { score: project.institutionalVNextScore, weight: 1.2 },
    { score: project.institutionalConfidenceScore, weight: 0.9 },
    { score: project.sourceReliabilityScore, weight: 0.4 },
    { score: project.sourceTruthScore, weight: 0.7 },
    { score: project.githubProScore, weight: 0.6 },
    { score: project.organicEconomicIntegrityScore, weight: 0.9 },
    { score: project.nativeDiscoveryScore, weight: 1.0 },
    { score: project.activeLiquidityTruthScore, weight: 0.9 },
    { score: project.organicBuyerScore, weight: 0.9 },
    { score: project.deployerReputationScore, weight: 0.7 },
    { score: project.identityResolutionScore, weight: 0.6 },
    { score: project.organicDemandFirewallScore, weight: 1.0 },
    { score: project.instantSafetyScore, weight: 1.0 },
    { score: project.candidateLifecycleReadinessScore, weight: 0.7 },
    { score: project.discoveryDecisionScore, weight: 1.3 },
    { score: project.developerActivityScore ?? project.developerScore, weight: 0.7 },
    { score: project.githubScore ?? project.githubQualityScore, weight: 0.5 },
    { score: project.communityGrowthScore ?? project.communityScore, weight: 0.6 },
    { score: project.socialAccelerationScore, weight: 0.7 },
    { score: project.liquidityScore, weight: 0.9 },
    { score: project.liquidityExpansionScore, weight: 0.8 },
    { score: project.holderGrowthScore, weight: 0.8 },
    { score: project.whaleScore ?? project.whaleActivityScore, weight: 0.8 },
    { score: project.smartWalletScore, weight: 0.8 },
    { score: project.smartWalletPerformanceScore, weight: 0.9 },
    { score: project.smartMoneyAccumulationScore, weight: 1.1 },
    { score: project.smartMoneyRotationScore, weight: 0.9 },
    { score: project.exchangeProbabilityScore, weight: 0.8 },
    { score: project.catalystScore, weight: 0.9 },
    { score: project.catalystCalendarScore, weight: 0.8 },
    { score: project.tokenomicsScore, weight: 0.6 },
    { score: project.fundingBackerScore, weight: 0.6 },
    { score: project.partnershipScore, weight: 0.5 },
    { score: project.ecosystemIntegrationScore, weight: 0.6 },
    { score: project.baselineScore, weight: 0.8 },
    { score: project.velocityScore, weight: 0.8 },
    { score: project.accelerationScore, weight: 0.9 },
    { score: project.trendChangeScore, weight: 0.7 },
    { score: project.momentumCompressionScore, weight: 0.7 },
    { score: project.capitalFlowScore, weight: 1.0 },
    { score: project.buyPressureScore, weight: 0.9 },
    { score: project.relativeStrengthScore, weight: 0.8 },
    { score: project.opportunityTimingScore, weight: 0.8 },
    { score: project.earlyBreakoutScore, weight: 0.9 },
    { score: project.volatilityExpansionScore, weight: 0.6 },
    { score: project.momentumShiftScore, weight: 1.1 },
    { score: prePumpScore, weight: 1.4 },
  ];

  const active = weights.filter((item) => num(item.score) > 0);

  if (!active.length) return 0;

  const weightedTotal = active.reduce(
    (sum, item) => sum + num(item.score) * item.weight,
    0
  );

  const weightTotal = active.reduce((sum, item) => sum + item.weight, 0);

  let score = weightedTotal / weightTotal;

  if (project.prePump?.status === "ALREADY_PUMPED") score -= 25;
  if (project.prePump?.status === "LATE_CHASE") score -= 18;
  if (num(project.sellPressureScore) >= 75) score -= 8;
  if (num(project.stakingRiskScore) >= 70) score -= 10;
  if (num(project.trapRiskScore) >= 60) score -= 10;
  if (num(project.riskScore) >= 70) score -= 12;
  if (num(project.riskScore) >= 85) score -= 20;
  if (num(project.liquidityControlRisk) >= 70) score -= 8;
  if (num(project.deployerRiskScore) >= 70) score -= 12;
  if (num(project.instantSafetyRiskScore) >= 70) score -= 16;
  if (num(project.organicDemandFirewallRisk) >= 70) score -= 12;
  if (num(project.activityAuthenticityRiskScore) >= 70) score -= 12;
  if (num(project.supplyIntegrityRiskScore) >= 70) score -= 12;
  if (num(project.identityRiskScore) >= 70) score -= 9;

  if (num(project.smartMoneyAccumulationScore) >= 80 && prePumpScore >= 70) {
    score += 5;
  }

  if (num(project.catalystScore) >= 70 && num(project.narrativeForecastScore) >= 70) {
    score += 4;
  }

  if (num(project.buyPressureScore) >= 70 && num(project.capitalFlowScore) >= 70) {
    score += 4;
  }

  if (
    num(project.nativeDiscoveryScore) >= 70 &&
    num(project.organicBuyerScore) >= 65 &&
    num(project.activeLiquidityTruthScore) >= 55
  ) {
    score += 5;
  }

  if (
    project.discoveryDecisionTier === "PASS" &&
    project.instantSafetyStatus === "PASS" &&
    ["PASS", "WATCH"].includes(project.organicDemandFirewallStatus)
  ) {
    score += 6;
  }

  if (
    num(project.launchReadinessScore) >= 70 &&
    num(project.stakingMomentumScore) >= 60 &&
    num(project.stakingRiskScore) < 50
  ) {
    score += 4;
  }

  return Math.round(clamp(score));
}

function weightedAverage(items = []) {
  const active = items.filter((item) => num(item.score) > 0);

  if (!active.length) return 0;

  const weightedTotal = active.reduce(
    (sum, item) => sum + num(item.score) * item.weight,
    0
  );
  const weightTotal = active.reduce((sum, item) => sum + item.weight, 0);

  return Math.round(clamp(weightedTotal / weightTotal));
}

function buildSignalProfile(project = {}) {
  const prePumpScore = num(project.prePump?.score);

  const clusters = {
    narrative: weightedAverage([
      { score: project.narrativeScore, weight: 0.9 },
      { score: project.narrativeForecastScore, weight: 1.1 },
      { score: project.infrastructureNarrativeScore, weight: 0.9 },
      { score: project.narrativeLaunchStakingScore, weight: 1.0 },
      { score: project.narrativeHeatScore, weight: 0.9 },
    ]),
    launch: weightedAverage([
      { score: project.launchReadinessScore, weight: 1.1 },
      { score: project.stakingMomentumScore, weight: 0.8 },
      { score: project.exchangeProbabilityScore, weight: 0.8 },
      { score: project.catalystCalendarScore, weight: 0.9 },
      { score: project.nativeDiscoveryScore, weight: 1.1 },
      { score: project.candidateLifecycleReadinessScore, weight: 0.8 },
    ]),
    market: weightedAverage([
      { score: project.marketRankScore, weight: 1.2 },
      { score: project.richTokenScore, weight: 0.8 },
      { score: project.relativeStrengthScore, weight: 0.9 },
      { score: prePumpScore, weight: 1.0 },
    ]),
    momentum: weightedAverage([
      { score: project.velocityScore, weight: 0.8 },
      { score: project.accelerationScore, weight: 1.0 },
      { score: project.trendChangeScore, weight: 0.8 },
      { score: project.momentumCompressionScore, weight: 0.8 },
      { score: project.momentumShiftScore, weight: 1.2 },
      { score: project.earlyBreakoutScore, weight: 1.0 },
      { score: project.volatilityExpansionScore, weight: 0.7 },
    ]),
    flows: weightedAverage([
      { score: project.capitalFlowScore, weight: 1.1 },
      { score: project.buyPressureScore, weight: 1.0 },
      { score: project.liquidityScore, weight: 0.9 },
      { score: project.liquidityExpansionScore, weight: 0.8 },
      { score: project.activeLiquidityTruthScore, weight: 1.0 },
      { score: project.organicBuyerScore, weight: 0.9 },
      { score: project.organicDemandFirewallScore, weight: 1.1 },
      { score: project.instantSafetyScore, weight: 0.8 },
    ]),
    smartMoney: weightedAverage([
      { score: project.whaleScore ?? project.whaleActivityScore, weight: 0.9 },
      { score: project.smartWalletScore, weight: 0.9 },
      { score: project.smartWalletPerformanceScore, weight: 1.0 },
      { score: project.smartMoneyAccumulationScore, weight: 1.2 },
      { score: project.smartMoneyRotationScore, weight: 0.9 },
    ]),
    fundamentals: weightedAverage([
      { score: project.tokenomicsScore, weight: 0.9 },
      { score: project.fundingBackerScore, weight: 0.8 },
      { score: project.partnershipScore, weight: 0.7 },
      { score: project.ecosystemIntegrationScore, weight: 0.9 },
      { score: project.baselineScore, weight: 0.8 },
      { score: project.organicEconomicIntegrityScore, weight: 1.0 },
      { score: project.deployerReputationScore, weight: 0.8 },
      { score: project.identityResolutionScore, weight: 0.7 },
      { score: project.discoveryDecisionScore, weight: 0.9 },
    ]),
    devCommunity: weightedAverage([
      { score: project.developerActivityScore ?? project.developerScore, weight: 0.9 },
      { score: project.githubScore ?? project.githubQualityScore, weight: 0.7 },
      { score: project.communityGrowthScore ?? project.communityScore, weight: 0.9 },
      { score: project.socialAccelerationScore, weight: 0.9 },
      { score: project.holderGrowthScore, weight: 0.8 },
    ]),
    socialIntelligence: weightedAverage([
      { score: project.xSocialScore, weight: 1.0 },
      { score: project.xSocialVelocityScore, weight: 0.9 },
      { score: project.xFounderSignalScore, weight: 0.7 },
      { score: project.xInstitutionalAttentionScore, weight: 1.0 },
      { score: project.institutionalWatchScore, weight: 1.0 },
      { score: project.externalSignalScore, weight: 0.9 },
    ]),
    learning: weightedAverage([
      { score: project.learningEdgeScore, weight: 1.0 },
      { score: project.institutionalLearning?.learningEdgeScore, weight: 1.0 },
      { score: project.outcomeLearningScore, weight: 1.2 },
      { score: project.prePumpPatternScore, weight: 1.2 },
      { score: project.projectChangeScore, weight: 0.8 },
    ]),
    prePumpPattern: weightedAverage([
      { score: project.prePumpPatternScore, weight: 1.0 },
      { score: project.prePumpPatternMatchPct, weight: 0.8 },
      { score: 50 + num(project.prePumpPatternEdge), weight: 0.7 },
    ]),
    signalCombos: weightedAverage([
      { score: project.signalCombinationScore, weight: 1.2 },
      { score: 50 + num(project.signalCombinationEdge), weight: 0.8 },
    ]),
    calibration: weightedAverage([
      { score: project.calibrationScore, weight: 1.0 },
      { score: 50 + num(project.calibrationAdjustment) * 3, weight: 0.8 },
    ]),
    analyst: weightedAverage([
      { score: project.aiAnalystScore, weight: 1.0 },
      { score: project.aiDecision === "Priority Watch" ? 85 : project.aiDecision === "Reject" ? 20 : 50, weight: 0.5 },
    ]),
    institutionalVNext: weightedAverage([
      { score: project.institutionalVNextScore, weight: 1.1 },
      { score: project.institutionalConfidenceScore, weight: 0.9 },
      { score: project.evidenceQualityScore, weight: 0.7 },
    ]),
    quantumField: weightedAverage([
      { score: project.quantumOpportunityScore, weight: 1.0 },
      { score: project.quantumOutcomeField?.positiveProbability, weight: 0.7 },
      { score: project.quantumOutcomeField?.doubleProbability, weight: 0.5 },
    ]),
    risk: weightedAverage([
      { score: project.riskScore, weight: 1.2 },
      { score: project.sellPressureScore, weight: 0.9 },
      { score: project.stakingRiskScore, weight: 0.8 },
      { score: project.trapRiskScore, weight: 1.2 },
      { score: project.xBotRiskScore, weight: 0.6 },
      { score: project.externalRiskScore, weight: 0.7 },
      { score: project.economicIntegrityRiskScore, weight: 1.2 },
      { score: project.activityAuthenticityRiskScore, weight: 1.0 },
      { score: project.supplyIntegrityRiskScore, weight: 1.0 },
      { score: project.liquidityControlRisk, weight: 1.0 },
      { score: project.deployerRiskScore, weight: 1.0 },
      { score: project.instantSafetyRiskScore, weight: 1.3 },
      { score: project.organicDemandFirewallRisk, weight: 1.1 },
      { score: project.identityRiskScore, weight: 0.8 },
      { score: project.walletClusterRiskScore, weight: 0.8 },
      { score: project.washTradingRiskScore, weight: 0.8 },
      { score: project.bundledLaunchRiskScore, weight: 0.7 },
    ]),
  };

  const rankedClusters = Object.entries(clusters)
    .filter(([name, score]) => name !== "risk" && score > 0)
    .map(([name, score]) => ({ name, score }))
    .sort((a, b) => b.score - a.score);

  return {
    ...clusters,
    rankedClusters,
    strongestCluster: rankedClusters[0]?.name || "none",
    activeClusterCount: rankedClusters.filter((cluster) => cluster.score >= 55).length,
    eliteClusterCount: rankedClusters.filter((cluster) => cluster.score >= 75).length,
  };
}

function buildAlphaTags(project = {}, profile = {}) {
  const tags = [];

  if (profile.narrative >= 75) tags.push("Narrative Leader");
  if (profile.launch >= 70) tags.push("Launch Window");
  if (profile.market >= 75) tags.push("Market Ranked");
  if (profile.momentum >= 70) tags.push("Momentum Shift");
  if (profile.flows >= 70) tags.push("Capital Flow");
  if (profile.smartMoney >= 70) tags.push("Smart Money");
  if (profile.fundamentals >= 70) tags.push("Fundamental Support");
  if (profile.devCommunity >= 70) tags.push("Builder/Community Strength");
  if (profile.socialIntelligence >= 70) tags.push("X/Social Acceleration");
  if (profile.signalCombos >= 70) tags.push("Winning Signal Recipe");
  if (num(project.calibrationAdjustment) >= 5) tags.push("Calibrated Edge");
  if (num(project.externalSignalScore) >= 65) tags.push("External Confirmation");
  if (project.aiDecision === "Priority Watch") tags.push("AI Analyst Priority");
  if (num(project.institutionalVNextScore) >= 75) tags.push("Institutional vNext Edge");
  if (project.institutionalConfidenceLevel === "Institutional") tags.push("Institutional Confidence");
  if (num(project.smartMoneyConvictionScore) >= 70) tags.push("Smart Money Conviction");
  if (num(project.institutionalWatchScore) >= 65) tags.push("Institutional Attention");
  if (num(project.learningEdgeScore) >= 70) tags.push("Learning Edge");
  if (num(project.outcomeLearningScore) >= 70) tags.push("Outcome-Memory Winner Fit");
  if (num(project.prePumpPatternEdge) >= 12) tags.push("Pre-Breakout Pattern Match");
  if (num(project.quantumOpportunityScore) >= 70) tags.push("Quantum Upside Field");
  if (num(project.prePump?.score) >= 70) tags.push("Pre-Pump Candidate");
  if (num(project.narrativeLaunchStakingScore) >= 70) tags.push("Launch/Staking Setup");
  if (num(project.narrativeHeatScore) >= 65) tags.push("Narrative Heat");
  if (["accelerating", "improving"].includes(project.projectChangeState)) tags.push("Improving Since Last Scan");
  if (project.organicDemandVerdict === "Organic Demand Confirmed") tags.push("Organic Demand Confirmed");
  if (project.organicDemandVerdict === "Tradable Anomaly / Verify Organic Demand") tags.push("Tradable Anomaly");
  if (num(project.nativeDiscoveryScore) >= 70) tags.push("Native Launch Mesh");
  if (project.organicBuyerVerdict === "First Real Buyers Confirmed") tags.push("First Real Buyers");
  if (project.activeLiquidityTruthVerdict === "Usable Exit Liquidity Confirmed") tags.push("Usable Liquidity");
  if (project.deployerReputationVerdict === "Constructive Deployer History") tags.push("Constructive Deployer");
  if (project.projectIdentityVerdict === "Identity Resolved") tags.push("Identity Resolved");
  if (project.instantSafetyStatus === "PASS") tags.push("Safety Gate Passed");
  if (project.organicDemandFirewallStatus === "PASS") tags.push("Organic Demand Firewall Passed");
  if (project.discoveryDecisionTier === "PASS") tags.push("Discovery Decision Pass");
  if (["EARLY_TRACTION", "VALIDATED_GROWTH"].includes(project.candidateLifecycleStage)) {
    tags.push("Lifecycle-Adjusted Candidate");
  }

  return tags;
}

function buildRiskFlags(project = {}, profile = {}) {
  const risks = [];

  if (project.prePump?.status === "ALREADY_PUMPED") risks.push("Already pumped");
  if (project.prePump?.status === "LATE_CHASE") risks.push("Late chase setup");
  if (num(project.riskScore) >= 85) risks.push("Extreme aggregate risk");
  else if (num(project.riskScore) >= 70) risks.push("High aggregate risk");
  if (num(project.sellPressureScore) >= 75) risks.push("Heavy sell pressure");
  if (num(project.stakingRiskScore) >= 70) risks.push("High staking risk");
  if (num(project.trapRiskScore) >= 60) risks.push("High trap risk");
  if (num(project.xBotRiskScore) >= 55) risks.push("Social/bot risk");
  if (num(project.learningEdgeScore) > 0 && num(project.learningEdgeScore) <= 35) {
    risks.push("Negative learning trend");
  }
  if (num(project.quantumOutcomeField?.collapseProbability) >= 35) {
    risks.push("High quantum downside field");
  }
  if (num(project.outcomeTrapRisk) >= 55) risks.push("Resembles prior outcome traps");
  if (num(project.trapPatternMatchPct) >= 65 && num(project.prePumpPatternEdge) <= -8) {
    risks.push("Matches prior dump/trap pattern");
  }
  if ((project.trapSignalCombinations || []).length >= 2) risks.push("Multiple trap signal recipes");
  if (num(project.signalCombinationScore) > 0 && num(project.signalCombinationScore) <= 35) {
    risks.push("Negative signal combination");
  }
  if (num(project.calibrationAdjustment) <= -5) risks.push("Negative outcome calibration");
  if (num(project.externalRiskScore) >= 45) risks.push("External risk language");
  if (project.aiDecision === "Reject") risks.push("AI analyst rejection");
  if (num(project.vestingPressureScore) >= 65) risks.push("High vesting pressure");
  if (num(project.tokenUnlockRiskScore) >= 65) risks.push("Token unlock risk");
  if (num(project.evidenceQualityScore) > 0 && num(project.evidenceQualityScore) < 35) {
    risks.push("Thin evidence quality");
  }
  if (profile.risk >= 70) risks.push("Risk cluster elevated");
  if (num(project.liquidityScore) > 0 && num(project.liquidityScore) < 35) {
    risks.push("Weak liquidity support");
  }
  if (project.organicDemandVerdict === "Institutional Integrity Block") {
    risks.push("Institutional integrity block");
  }
  if (project.organicDemandVerdict === "Tradable Anomaly / Verify Organic Demand") {
    risks.push("Unverified organic demand");
  }
  if (num(project.economicIntegrityRiskScore) >= 75) {
    risks.push("Extreme economic-model risk");
  } else if (num(project.economicIntegrityRiskScore) >= 60) {
    risks.push("Economic verification required");
  }
  if (num(project.activityAuthenticityRiskScore) >= 70) {
    risks.push("Activity authenticity firewall risk");
  }
  if (num(project.supplyIntegrityRiskScore) >= 70) {
    risks.push("Supply integrity firewall risk");
  }
  if ((project.economicIntegrityScoreCapReasons || []).length) {
    risks.push("Economic integrity score cap applied");
  }
  if (project.organicDemandPromotionBlocked) {
    risks.push("Organic demand proof queue unresolved");
  }
  if (num(project.hardExitLiquidityUsd) > 0 && num(project.liquidityUsd ?? project.liquidity) / num(project.hardExitLiquidityUsd) >= 4) {
    risks.push("Hard exit liquidity risk");
  }
  if ((project.economicIntegrityBlockers || []).some((blocker) => /privileged|admin|mint/i.test(blocker))) {
    risks.push("Privileged control risk");
  }
  if (num(project.liquidityControlRisk) >= 75) risks.push("Native liquidity control risk");
  else if (num(project.liquidityControlRisk) >= 60) risks.push("Usable liquidity verification required");
  if (num(project.deployerRiskScore) >= 75) risks.push("Deployer reputation block");
  else if (num(project.deployerRiskScore) >= 60) risks.push("Deployer reputation verification required");
  if (project.organicBuyerVerdict === "Buyer Quality Unproven") risks.push("First-buyer quality unproven");
  if (["CRITICAL", "RESTRICTED"].includes(project.instantSafetyStatus)) {
    risks.push(`Instant safety gate ${String(project.instantSafetyStatus).toLowerCase()}`);
  }
  if (["CRITICAL", "RESTRICTED"].includes(project.organicDemandFirewallStatus)) {
    risks.push(`Organic demand firewall ${String(project.organicDemandFirewallStatus).toLowerCase()}`);
  }
  if (project.projectIdentityVerdict === "Identity Risk") risks.push("Identity graph risk");
  if (num(project.walletClusterRiskScore) >= 70) risks.push("Manipulated wallet cluster risk");
  if (num(project.washTradingRiskScore) >= 70) risks.push("Wash trading risk");
  if (num(project.bundledLaunchRiskScore) >= 70) risks.push("Bundled launch risk");
  if (project.discoveryDecisionTier === "CRITICAL") risks.push("Discovery decision critical block");
  if (project.discoveryDecisionTier === "RESTRICTED") risks.push("Discovery decision restricted");

  return [...new Set(risks)];
}

function gradeForScore(score = 0) {
  if (score >= 85) return "A";
  if (score >= 75) return "B";
  if (score >= 60) return "C";
  if (score >= 40) return "D";
  return "F";
}

function buildSignalGrades(profile = {}) {
  return Object.fromEntries(
    Object.entries(profile)
      .filter(([, value]) => typeof value === "number")
      .map(([name, score]) => [name, gradeForScore(score)])
  );
}

function convictionLevel(score = 0, density = 0, riskFlags = []) {
  if (riskFlags.length >= 3 || riskFlags.includes("Already pumped")) return "Defensive";
  if (score >= 88 && density >= 70 && riskFlags.length <= 1) return "Institutional";
  if (score >= 78 && density >= 55) return "High";
  if (score >= 65 && density >= 40) return "Medium";
  if (score >= 50 || density >= 30) return "Speculative";
  return "Low";
}

function buildExecutionPlan(score = 0, conviction = "Low", risks = []) {
  if (risks.includes("Already pumped") || risks.includes("Late chase setup")) {
    return {
      action: "Avoid Chase",
      sizing: "No new position until reset",
      reviewTrigger: "Re-score after momentum cools or risk flags clear",
    };
  }

  if (risks.length >= 3) {
    return {
      action: "Watch Only",
      sizing: "Research only",
      reviewTrigger: "Wait for risk compression and stronger liquidity confirmation",
    };
  }

  if (conviction === "Institutional" || (conviction === "High" && score >= 80)) {
    return {
      action: "Priority Watch",
      sizing: "Full research allocation",
      reviewTrigger: "Monitor for catalyst confirmation and sell-pressure expansion",
    };
  }

  if (conviction === "Medium") {
    return {
      action: "Watchlist",
      sizing: "Small exploratory allocation only after confirmation",
      reviewTrigger: "Re-score after next catalyst, listing, or liquidity expansion",
    };
  }

  if (conviction === "Speculative") {
    return {
      action: "Speculative Monitor",
      sizing: "Tiny or paper-trade only",
      reviewTrigger: "Needs more cross-signal confirmation",
    };
  }

  return {
    action: "Ignore",
    sizing: "No allocation",
    reviewTrigger: "Needs material signal improvement",
  };
}

function buildResearchChecklist(project = {}, profile = {}) {
  const checklist = [];

  if (profile.narrative >= 60) {
    checklist.push("Validate narrative quality against current sector leaders.");
  }
  if (profile.launch >= 55) {
    checklist.push("Confirm launch dates, token unlocks, staking rules, and exchange/listing timing.");
  }
  if (profile.flows >= 55) {
    checklist.push("Review liquidity depth, pool concentration, and buy/sell transaction mix.");
  }
  if (profile.smartMoney >= 55) {
    checklist.push("Inspect top smart-wallet entries, holding time, and prior wallet hit rate.");
  }
  if (profile.socialIntelligence >= 55) {
    checklist.push("Review official X posts, founder posts, influencer mentions, and bot/spam quality.");
  }
  if (profile.learning >= 60) {
    checklist.push("Compare current thesis against prior watchlist history, outcome matches, and score changes.");
  }
  if (profile.signalCombos >= 60) {
    checklist.push("Validate that active signal combinations are supported by real liquidity, catalysts, and wallet flow.");
  }
  if (num(project.calibrationAdjustment) !== 0) {
    checklist.push("Review calibrated support and warning signals against the current thesis.");
  }
  if (project.prePumpPattern?.matchedFeatures?.length) {
    checklist.push("Compare matched pre-pump pattern features against current liquidity, social, and wallet evidence.");
  }
  if (project.institutionalVNext?.modules?.explainability?.summary) {
    checklist.push("Review vNext explainability summary against raw evidence.");
  }
  if (project.aiThesis?.nextResearchSteps?.length) {
    checklist.push(...project.aiThesis.nextResearchSteps.slice(0, 3));
  }
  if (profile.fundamentals < 45) {
    checklist.push("Manually review tokenomics, backers, audits, and roadmap quality.");
  }
  if (profile.devCommunity < 45) {
    checklist.push("Check GitHub, social growth, community quality, and founder credibility.");
  }
  if (num(project.stakingRiskScore) > 0) {
    checklist.push("Review staking lockups, withdrawal rules, slashing exposure, and APY sustainability.");
  }
  if (project.organicDemandIntegrity) {
    checklist.push("Verify organic demand: DEX swaps, holder balance buckets, hard exit liquidity, admin roles, and real yield after inflation.");
  }
  if ((project.economicIntegrityResearchTasks || []).length) {
    checklist.push(
      ...project.economicIntegrityResearchTasks
        .slice(0, 3)
        .map((task) => `${task.agent || "Research Agent"}: ${task.title}`)
    );
  }
  if (!checklist.length) {
    checklist.push("Wait for stronger cross-signal confirmation before deeper research.");
  }

  return checklist;
}

function buildInvalidationSignals(project = {}, profile = {}) {
  const invalidations = [
    "Pipeline score drops below 55 on the next scan.",
    "Liquidity contracts while sell pressure rises.",
    "Primary catalyst is delayed, cancelled, or already priced in.",
  ];

  if (profile.smartMoney >= 55) {
    invalidations.push("Smart-wallet net flow flips materially negative.");
  }
  if (profile.socialIntelligence >= 55) {
    invalidations.push("Social acceleration fades without matching liquidity, holder, or catalyst confirmation.");
  }
  if (profile.signalCombos >= 55) {
    invalidations.push("Winning signal recipe breaks down or flips into a trap recipe.");
  }
  if (num(project.calibrationAdjustment) > 0) {
    invalidations.push("Calibration support fades or flips negative on the next scan.");
  }
  if (num(project.prePumpPatternEdge) > 0) {
    invalidations.push("Pre-pump pattern edge flips negative or trap match rises above breakout match.");
  }
  if (project.aiDecision && project.aiDecision !== "Pass For Now") {
    invalidations.push("AI analyst decision downgrades after fresh X/news evidence.");
  }
  if (num(project.institutionalVNextScore) >= 60) {
    invalidations.push("Institutional vNext score drops below 50 or evidence quality deteriorates.");
  }
  if (profile.launch >= 55) {
    invalidations.push("Launch or staking terms reveal high dilution, lockup risk, or weak demand.");
  }
  if (num(project.prePump?.score) >= 55) {
    invalidations.push("Pre-pump status changes to late chase or already pumped.");
  }
  if (project.organicDemandIntegrity) {
    invalidations.push("Organic-demand integrity flips to institutional block or hard exit liquidity falls below paper sell-test thresholds.");
  }

  return invalidations;
}

function allocationBucket(score = 0, conviction = "Low", risks = []) {
  if (risks.length >= 3 || conviction === "Defensive") return "Avoid";
  if (conviction === "Institutional" && score >= 88) return "Core Watch";
  if (conviction === "High" && score >= 78) return "Priority Research";
  if (conviction === "Medium" && score >= 65) return "Starter Watch";
  if (conviction === "Speculative") return "Speculative Lab";
  return "Ignore";
}

function buildMarketContext(projects = []) {
  const total = projects.length || 1;
  const average = (selector) =>
    Math.round(
      projects.reduce((sum, project) => sum + num(selector(project)), 0) / total
    );
  const count = (predicate) => projects.filter(predicate).length;

  const avgPipelineScore = average((project) => project.pipelineScore);
  const avgRiskScore = average((project) => project.signalProfile?.risk);
  const highConvictionCount = count((project) =>
    ["Institutional", "High"].includes(project.conviction)
  );
  const defensiveCount = count((project) => project.conviction === "Defensive");
  const healthyBreadthCount = count((project) => num(project.pipelineScore) >= 55);
  const launchBreadthCount = count((project) => num(project.signalProfile?.launch) >= 60);
  const smartMoneyBreadthCount = count((project) => num(project.signalProfile?.smartMoney) >= 60);

  const healthyBreadth = Math.round((healthyBreadthCount / total) * 100);
  const highConvictionBreadth = Math.round((highConvictionCount / total) * 100);
  const defensiveBreadth = Math.round((defensiveCount / total) * 100);

  let regime = "Selective";
  if (avgRiskScore >= 65 || defensiveBreadth >= 20) regime = "Risk-Off";
  else if (healthyBreadth >= 30 && highConvictionBreadth >= 5) regime = "Risk-On";
  else if (healthyBreadth < 10 && highConvictionBreadth < 2) regime = "Thin";

  return {
    regime,
    avgPipelineScore,
    avgRiskScore,
    healthyBreadth,
    highConvictionBreadth,
    defensiveBreadth,
    launchBreadth: Math.round((launchBreadthCount / total) * 100),
    smartMoneyBreadth: Math.round((smartMoneyBreadthCount / total) * 100),
  };
}

function marketAdjustment(project = {}, context = {}) {
  let adjustment = 0;

  if (context.regime === "Risk-On") {
    if (num(project.signalDensityScore) >= 55) adjustment += 3;
    if (["Institutional", "High"].includes(project.conviction)) adjustment += 2;
  }

  if (context.regime === "Selective") {
    if (num(project.signalDensityScore) < 35) adjustment -= 2;
    if (num(project.signalProfile?.risk) < 45 && num(project.signalDensityScore) >= 55) {
      adjustment += 2;
    }
  }

  if (context.regime === "Thin") {
    if (!["Institutional", "High"].includes(project.conviction)) adjustment -= 4;
    if (num(project.signalDensityScore) >= 65) adjustment += 2;
  }

  if (context.regime === "Risk-Off") {
    adjustment -= 6;
    if (num(project.signalProfile?.risk) >= 60) adjustment -= 5;
    if (["Institutional", "High"].includes(project.conviction)) adjustment += 3;
  }

  return adjustment;
}

function enrichWithMarketContext(projects = []) {
  const context = buildMarketContext(projects);

  return projects
    .map((project) => {
      const adjustment = marketAdjustment(project, context);
      const marketAdjustedScore = Math.round(clamp(num(project.pipelineScore) + adjustment));
      const conviction = convictionLevel(
        marketAdjustedScore,
        num(project.signalDensityScore),
        project.riskFlags || []
      );
      const executionPlan = buildExecutionPlan(
        marketAdjustedScore,
        conviction,
        project.riskFlags || []
      );
      const watchlistPriority = Math.round(
        clamp(
          marketAdjustedScore * 0.65 +
            num(project.signalDensityScore) * 0.25 -
            num(project.signalProfile?.risk) * 0.1
        )
      );

      return {
        ...project,
        marketContext: context,
        marketRegime: context.regime,
        marketAdjustment: adjustment,
        marketAdjustedScore,
        pipelineScore: marketAdjustedScore,
        opportunityScore: marketAdjustedScore,
        score: marketAdjustedScore,
        relativeScoreDelta: Math.round(marketAdjustedScore - context.avgPipelineScore),
        conviction,
        executionPlan,
        watchlistPriority,
        allocationBucket: allocationBucket(marketAdjustedScore, conviction, project.riskFlags || []),
        researchChecklist: buildResearchChecklist(project, project.signalProfile || {}),
        invalidationSignals: buildInvalidationSignals(project, project.signalProfile || {}),
      };
    })
    .sort((a, b) => num(b.pipelineScore) - num(a.pipelineScore));
}

function buildOpportunityThesis(project = {}, profile = {}, tags = [], risks = []) {
  const name = project.name || project.symbol || "This project";
  const strengths = profile.rankedClusters
    .slice(0, 3)
    .map((cluster) => `${cluster.name} ${cluster.score}`)
    .join(", ");

  if (!strengths) {
    return `${name} has limited confirmed signal density and should remain low priority until more evidence appears.`;
  }

  const tagText = tags.length ? ` Key tags: ${tags.slice(0, 4).join(", ")}.` : "";
  const riskText = risks.length ? ` Main risk: ${risks[0]}.` : " Main risk: none elevated by the current scoring layer.";

  return `${name} is led by ${strengths}.${tagText}${riskText}`;
}

function advancedScoreBreakdown(project = {}) {
  const baseScore = weightedInstitutionalScore(project);
  const profile = buildSignalProfile(project);
  const tags = buildAlphaTags(project, profile);
  const risks = buildRiskFlags(project, profile);

  let bonus = 0;
  let penalty = 0;

  if (profile.eliteClusterCount >= 3) bonus += 5;
  if (profile.activeClusterCount >= 5) bonus += 4;
  if (profile.narrative >= 70 && profile.launch >= 60 && profile.momentum >= 60) bonus += 5;
  if (profile.smartMoney >= 70 && profile.flows >= 65) bonus += 4;
  if (profile.fundamentals >= 65 && profile.devCommunity >= 65) bonus += 3;
  if (profile.socialIntelligence >= 70 && profile.learning >= 60) bonus += 4;
  if (profile.signalCombos >= 70 && num(project.outcomeLearningScore) >= 60) bonus += 5;
  if (num(project.prePumpPatternEdge) >= 15 && num(project.prePumpPatternScore) >= 65) bonus += 6;
  else if (num(project.prePumpPatternEdge) >= 8) bonus += 3;
  if ((project.winningSignalCombinations || []).length >= 2 && (project.trapSignalCombinations || []).length === 0) {
    bonus += 4;
  }
  if (num(project.calibrationAdjustment) > 0) bonus += Math.min(12, num(project.calibrationAdjustment));
  if (num(project.externalSignalScore) >= 65 && num(project.externalRiskScore) < 35) bonus += 4;
  if (project.aiDecision === "Priority Watch") bonus += 5;
  if (project.aiDecision === "Watchlist") bonus += 3;
  if (num(project.institutionalVNextScore) >= 75 && num(project.evidenceQualityScore) >= 50) bonus += 7;
  else if (num(project.institutionalVNextScore) >= 60) bonus += 4;
  if (project.institutionalConfidenceLevel === "Institutional") bonus += 5;
  if (num(project.smartMoneyConvictionScore) >= 70 && num(project.liquidityMigrationScore) >= 60) bonus += 5;
  if (profile.quantumField >= 70 && num(project.quantumOutcomeField?.collapseProbability) < 25) bonus += 4;
  if (num(project.institutionalWatchScore) >= 70) bonus += 3;
  if (num(project.learningEdgeScore) >= 75) bonus += 3;
  if (num(project.prePump?.score) >= 70 && profile.risk < 55) bonus += 4;
  if (num(project.narrativeHeatScore) >= 70) bonus += 4;
  if (["accelerating", "improving"].includes(project.projectChangeState)) bonus += 3;
  if (num(project.sourceReliabilityScore) >= 70) bonus += 2;
  if (project.organicDemandVerdict === "Organic Demand Confirmed") bonus += 4;
  if (num(project.nativeDiscoveryScore) >= 75 && num(project.organicBuyerScore) >= 65) bonus += 5;
  if (num(project.activeLiquidityTruthScore) >= 70 && num(project.liquidityControlRisk) < 45) bonus += 4;
  if (num(project.deployerReputationScore) >= 72 && num(project.deployerRiskScore) < 45) bonus += 3;
  if (project.discoveryDecisionTier === "PASS") bonus += 5;
  if (project.instantSafetyStatus === "PASS" && project.organicDemandFirewallStatus === "PASS") bonus += 4;
  if (num(project.candidateLifecycleReadinessScore) >= 80) bonus += 3;

  if (profile.risk >= 85) penalty += 18;
  else if (profile.risk >= 70) penalty += 10;
  else if (profile.risk >= 55) penalty += 4;
  if (project.prePump?.status === "ALREADY_PUMPED") penalty += 16;
  if (project.prePump?.status === "LATE_CHASE") penalty += 10;
  if (num(project.sellPressureScore) >= 85) penalty += 8;
  if (num(project.stakingRiskScore) >= 70) penalty += 8;
  if (num(project.xBotRiskScore) >= 55) penalty += 6;
  if (num(project.learningEdgeScore) > 0 && num(project.learningEdgeScore) <= 35) penalty += 6;
  if (num(project.quantumOutcomeField?.collapseProbability) >= 35) penalty += 8;
  if (num(project.outcomeTrapRisk) >= 60) penalty += 8;
  if (num(project.prePumpPatternEdge) <= -15) penalty += 9;
  else if (num(project.prePumpPatternEdge) <= -8) penalty += 5;
  if ((project.trapSignalCombinations || []).length >= 2) penalty += 9;
  if (num(project.signalCombinationScore) > 0 && num(project.signalCombinationScore) <= 35) penalty += 7;
  if (num(project.calibrationAdjustment) < 0) penalty += Math.min(12, Math.abs(num(project.calibrationAdjustment)));
  if (num(project.externalRiskScore) >= 45) penalty += 6;
  if (project.aiDecision === "Reject") penalty += 10;
  if (num(project.vestingPressureScore) >= 70) penalty += 8;
  if (num(project.tokenUnlockRiskScore) >= 70) penalty += 7;
  if (num(project.evidenceQualityScore) > 0 && num(project.evidenceQualityScore) < 35) penalty += 5;
  if (num(project.trapRiskScore) >= 80) penalty += 14;
  else if (num(project.trapRiskScore) >= 60) penalty += 8;
  if (num(project.sourceReliabilityScore) > 0 && num(project.sourceReliabilityScore) < 40) penalty += 4;
  if (num(project.economicIntegrityPenalty) > 0) penalty += num(project.economicIntegrityPenalty);
  if (num(project.activityAuthenticityRiskScore) >= 70) penalty += 10;
  if (num(project.supplyIntegrityRiskScore) >= 70) penalty += 10;
  if ((project.economicIntegrityScoreCapReasons || []).length) penalty += 6;
  if (project.organicDemandPromotionBlocked) penalty += 12;
  if (project.organicDemandVerdict === "Institutional Integrity Block") penalty += 10;
  if (project.organicDemandVerdict === "Tradable Anomaly / Verify Organic Demand") penalty += 6;
  if (num(project.liquidityControlRisk) >= 75) penalty += 9;
  else if (num(project.liquidityControlRisk) >= 60) penalty += 5;
  if (num(project.deployerRiskScore) >= 75) penalty += 12;
  else if (num(project.deployerRiskScore) >= 60) penalty += 7;
  if (project.organicBuyerVerdict === "Buyer Quality Unproven" && num(project.nativeDiscoveryScore) > 0) penalty += 5;
  if (project.instantSafetyStatus === "CRITICAL") penalty += 28;
  else if (project.instantSafetyStatus === "RESTRICTED") penalty += 16;
  else if (project.instantSafetyStatus === "UNVERIFIED") penalty += 7;
  if (project.organicDemandFirewallStatus === "CRITICAL") penalty += 22;
  else if (project.organicDemandFirewallStatus === "RESTRICTED") penalty += 13;
  if (num(project.walletClusterRiskScore) >= 75) penalty += 9;
  if (num(project.washTradingRiskScore) >= 75) penalty += 9;
  if (num(project.bundledLaunchRiskScore) >= 75) penalty += 8;
  if (project.projectIdentityVerdict === "Identity Risk") penalty += 10;

  const signalDensityScore = clamp(profile.activeClusterCount * 12 + profile.eliteClusterCount * 8);
  const dynamicWeightAdjustment = project.dynamicEngineWeights
    ? Math.round(
        clamp(
          (num(project.dynamicEngineWeights.wallet) - 1) * 8 +
            (num(project.dynamicEngineWeights.liquidity) - 1) * 7 +
            (num(project.dynamicEngineWeights.risk) - 1) * -7 +
            (num(project.dynamicEngineWeights.launch) - 1) * 5,
          -8,
          8
        )
      )
    : 0;
  const riskAdjustedScore = Math.round(clamp(baseScore + bonus + dynamicWeightAdjustment - penalty));
  const signalGrades = buildSignalGrades(profile);
  const conviction = convictionLevel(riskAdjustedScore, signalDensityScore, risks);
  const executionPlan = buildExecutionPlan(riskAdjustedScore, conviction, risks);
  const thesis = buildOpportunityThesis(project, profile, tags, risks);

  return {
    baseScore,
    bonus,
    penalty,
    dynamicWeightAdjustment,
    riskAdjustedScore,
    signalDensityScore: Math.round(signalDensityScore),
    signalProfile: profile,
    signalGrades,
    alphaTags: tags,
    riskFlags: risks,
    conviction,
    executionPlan,
    opportunityThesis: thesis,
  };
}

function classifyProject(project = {}) {
  const score = num(project.pipelineScore);

  if (project.organicDemandVerdict === "Institutional Integrity Block") return "Integrity Block";
  if (project.instantSafetyStatus === "CRITICAL") return "Critical Safety Block";
  if (project.discoveryDecisionTier === "CRITICAL") return "Critical Discovery Block";
  if (project.instantSafetyStatus === "RESTRICTED" || project.discoveryDecisionTier === "RESTRICTED") return "Restricted Research";
  if (project.prePump?.status === "ALREADY_PUMPED") return "Already Pumped";
  if (project.prePump?.status === "LATE_CHASE") return "Late Chase";
  if (num(project.stakingRiskScore) >= 70) return "High Staking Risk";
  if (num(project.trapRiskScore) >= 70) return "High Trap Risk";
  if (num(project.riskAdjustedScore) >= 85 && num(project.signalDensityScore) >= 60) {
    return "High Conviction";
  }

  if (score >= 95) return "Institutional Alpha";
  if (score >= 90) return "Elite Opportunity";
  if (score >= 85) return "A+ Opportunity";
  if (score >= 80) return "Strong Watchlist";
  if (score >= 70) return "Watchlist";
  if (score >= 55) return "Early Candidate";
  return "Low Priority";
}

function confidenceForProject(project = {}) {
  const evidenceCount = Array.isArray(project.evidence) ? project.evidence.length : 0;
  const score = num(project.pipelineScore);
  const density = num(project.signalDensityScore);
  const riskFlags = Array.isArray(project.riskFlags) ? project.riskFlags.length : 0;
  const dataConfidenceScore = num(project.dataConfidenceScore);

  if (score >= 85 && density >= 65 && evidenceCount >= 8 && riskFlags <= 1 && dataConfidenceScore >= 70) return "High";
  if (score >= 70 && density >= 45 && evidenceCount >= 5 && dataConfidenceScore >= 50) return "Medium";
  if (score >= 55 || density >= 35 || dataConfidenceScore >= 35) return "Developing";
  return "Low";
}

function confidenceLabel(score = 0) {
  if (score >= 80) return "High";
  if (score >= 58) return "Medium";
  if (score >= 35) return "Developing";
  return "Low";
}

function buildDataConfidence(project = {}, breakdown = {}) {
  const evidenceCount = Array.isArray(project.evidence) ? project.evidence.length : 0;
  const liveMarket =
    num(project.priceUsd ?? project.price) > 0 ||
    num(project.liquidityUsd ?? project.liquidity) > 0 ||
    num(project.volume24h ?? project.volume) > 0;
  const externalConnected =
    project.externalIntelligence?.status?.x === "SUCCESS" ||
    project.externalIntelligence?.status?.news === "SUCCESS";
  const patternExamples = num(project.prePumpPattern?.databaseExamples);
  const calibrationExamples = num(project.outcomeCalibration?.totalExamples);
  const historicalExamples = Math.max(patternExamples, calibrationExamples, num(project.outcomeLearning?.sampleSize));
  const sourceCount = [
    liveMarket,
    externalConnected,
    num(project.developerActivityScore ?? project.developerScore) > 0,
    num(project.liquidityScore) > 0,
    num(project.xSocialScore) > 0,
    num(project.smartMoneyAccumulationScore) > 0,
    num(project.catalystScore) > 0,
    num(project.nativeDiscoveryScore) > 0,
    num(project.activeLiquidityTruthScore) > 0,
    num(project.organicBuyerScore) > 0,
    num(project.identityResolutionScore) > 0,
    num(project.instantSafetyScore) > 0,
    num(project.organicDemandFirewallScore) > 0,
    num(project.discoveryDecisionScore) > 0,
    historicalExamples >= 8,
  ].filter(Boolean).length;
  const penalty =
    project.prePumpPatternConfidence === "Cold Start" && historicalExamples < 8
      ? 8
      : 0;
  const score = Math.round(
    clamp(
      sourceCount * 10 +
        Math.min(20, evidenceCount * 1.4) +
        Math.min(20, historicalExamples / 5) +
        num(breakdown.signalDensityScore) * 0.15 -
        penalty
    )
  );

  return {
    dataConfidenceScore: score,
    dataConfidence: confidenceLabel(score),
    dataConfidenceBreakdown: {
      sourceCount,
      evidenceCount,
      liveMarket,
      externalConnected,
      historicalExamples,
      patternExamples,
      calibrationExamples,
      signalDensityScore: breakdown.signalDensityScore || 0,
    },
  };
}

function addFinalScoring(projects = []) {
  const safeProjects = Array.isArray(projects)
    ? projects
    : normalizeEngineOutput(projects, []);

  const scoredProjects = safeProjects
    .map((project) => {
      const breakdown = advancedScoreBreakdown(project);
      const dataConfidence = buildDataConfidence(project, breakdown);
      const pipelineScore = breakdown.riskAdjustedScore;
      const enrichedProject = {
        ...project,
        ...breakdown,
        ...dataConfidence,
        rawPipelineScore: breakdown.baseScore,
        pipelineScore,
        opportunityScore: pipelineScore,
        score: pipelineScore,
      };
      const pipelineTier = classifyProject(enrichedProject);
      const pipelineConfidence = confidenceForProject(enrichedProject);

      return {
        ...enrichedProject,
        pipelineTier,
        tier: pipelineTier,
        pipelineConfidence,
        confidence: pipelineConfidence,
      };
    })
    .sort((a, b) => num(b.pipelineScore) - num(a.pipelineScore));

  const marketAdjustedProjects = enrichWithMarketContext(scoredProjects);
  const total = marketAdjustedProjects.length;

  return marketAdjustedProjects
    .map((project, index) => ({
      ...project,
      pipelineRank: index + 1,
      pipelinePercentile:
        total <= 1 ? 100 : Math.round(((total - index) / total) * 100),
    }))
    .map((project) => ({
      ...project,
      pipelineTier: classifyProject(project),
      tier: classifyProject(project),
      pipelineConfidence: confidenceForProject(project),
      confidence: confidenceForProject(project),
    }));
}

export async function runIntelligencePipeline(projects = [], options = {}) {
  const freeOnly = options.freeOnly ?? process.env.FREE_ONLY_MODE === "true";
  let results = Array.isArray(projects)
    ? [...projects]
    : normalizeEngineOutput(projects, []);

  results = await runEngine("Rich Token Intelligence", analyzeRichTokenIntelligenceBatch, results);
  results = await runEngine("Narrative Intelligence", analyzeNarratives, results);
  results = await runEngine("Narrative Forecast", analyzeNarrativeForecastBatch, results);
  results = await runEngine(
    "Narrative Launch + Staking",
    analyzeNarrativeLaunchStakingBatch,
    results
  );
  results = await runEngine("Infrastructure Narrative", analyzeInfrastructureNarrativeBatch, results);

  results = await runEngine("Developer Activity", analyzeDeveloperActivityBatch, results);
  results = await runEngine("GitHub Quality", analyzeGithubBatch, results);
  results = await runEngine("Community Growth", analyzeCommunityGrowthBatch, results);
  results = await runEngine("Social Acceleration", analyzeSocialAccelerationBatch, results);
  results = await runEngine("External Intelligence", analyzeExternalIntelligenceBatch, results, {
    ...(options.externalIntelligence || {}),
    freeOnly,
  });
  results = await runEngine("Web Research Agent", analyzeWebResearchAgentBatch, results, options.webResearchAgent || {});
  results = await runEngine("Roadmap Catalyst Profit", analyzeRoadmapCatalystProfitBatch, results, options.roadmapCatalystProfit || {});
  results = await runEngine("X Social Intelligence", analyzeXSocialIntelligenceBatch, results);
  results = await runEngine("Liquidity Intelligence", analyzeLiquidityBatch, results);
  results = await runEngine("Holder Growth", analyzeHolderGrowthBatch, results);
  results = await runEngine("Whale Activity", analyzeWhaleActivityBatch, results);

  results = await runEngine("Smart Wallet", analyzeSmartWalletBatch, results);
  results = await runEngine("Smart Wallet Performance", analyzeSmartWalletPerformanceBatch, results);
  results = await runEngine("Smart Money Accumulation", analyzeSmartMoneyAccumulationBatch, results);

  results = await runEngine("Exchange Probability", analyzeExchangeProbabilityBatch, results);
  results = await runEngine("Catalysts", analyzeCatalystsBatch, results);
  results = await runEngine("Catalyst Calendar", analyzeCatalystCalendarBatch, results);

  results = await runEngine("Tokenomics", analyzeTokenomicsBatch, results);
  results = await runEngine("Funding Backers", analyzeFundingBackersBatch, results);
  results = await runEngine("Partnerships", analyzePartnershipsBatch, results);
  results = await runEngine("Ecosystem Integration", analyzeEcosystemIntegrationBatch, results);

  results = await runEngine("Baseline", analyzeBaselineBatch, results);
  results = await runEngine("Velocity", analyzeVelocityBatch, results);
  results = await runEngine("Acceleration", analyzeAccelerationBatch, results);
  results = await runEngine("Trend Change", analyzeTrendChangeBatch, results);
  results = await runEngine("Momentum Compression", analyzeMomentumCompressionBatch, results);
  results = await runEngine("Capital Flow", analyzeCapitalFlowBatch, results);
  results = await runEngine("Buy Pressure", analyzeBuyPressureBatch, results);
  results = await runEngine("Sell Pressure", analyzeSellPressureBatch, results);
  results = await runEngine("Relative Strength", analyzeRelativeStrengthBatch, results);
  results = await runEngine("Smart Money Rotation", analyzeSmartMoneyRotationBatch, results);
  results = await runEngine("Opportunity Timing", analyzeOpportunityTimingBatch, results);
  results = await runEngine("Early Breakout", analyzeEarlyBreakoutBatch, results);
  results = await runEngine("Volatility Expansion", analyzeVolatilityExpansionBatch, results);
  results = await runEngine("Liquidity Expansion", analyzeLiquidityExpansionBatch, results);
  results = await runEngine("Momentum Shift", analyzeMomentumShiftBatch, results);

  results = await runEngine("Pre-Pump Detection", prePumpDetectionEngine, results, options.prePump || {});
  results = await runEngine("Market Rank", analyzeMarketRankBatch, results);
  results = await runEngine("Institutional Learning", analyzeInstitutionalLearningBatch, results);
  results = await runEngine("Outcome Learning", analyzeOutcomeLearningBatch, results);
  results = await runEngine("Pre-Pump Pattern Database", analyzePrePumpPatternBatch, results);
  results = await runEngine("Signal Combination Learning", analyzeSignalCombinationsBatch, results);
  results = await runEngine("Quantum Outcome Field", analyzeQuantumOutcomeFieldBatch, results, options.quantumField || {});
  results = await runEngine("Outcome Calibration", analyzeOutcomeCalibrationBatch, results);
  results = await runEngine("Narrative Heat Index", analyzeNarrativeHeatIndexBatch, results);
  results = await runEngine("AI Research Analyst", analyzeAIResearchAnalystBatch, results);
  results = await runEngine("Institutional vNext", analyzeInstitutionalVNextBatch, results);
  results = await runEngine("Source Reliability", analyzeSourceReliabilityBatch, results);
  results = await runEngine("Source Truth", analyzeSourceTruthBatch, results);
  results = await runEngine("GitHub Intelligence Pro", analyzeGithubIntelligenceProBatch, results);
  results = await runEngine("Project Identity Graph", analyzeProjectIdentityBatch, results);
  results = await runEngine("Active Liquidity Truth", analyzeActiveLiquidityTruthBatch, results);
  results = await runEngine("Organic Buyer Classifier", analyzeOrganicBuyerClassifierBatch, results);
  results = await runEngine("Deployer Reputation", analyzeDeployerReputationBatch, results);
  results = await runEngine("Wallet Cluster", analyzeWalletClusterBatch, results);
  results = await runEngine("Bundled Launch", analyzeBundledLaunchBatch, results);
  results = await runEngine("Wash Trading", analyzeWashTradingBatch, results);
  results = await runEngine("Smart Wallet Arrival", analyzeSmartWalletArrivalBatch, results);
  results = await runEngine("Buyer Retention", analyzeBuyerRetentionBatch, results);
  results = await runEngine("Organic Buyer Firewall", analyzeOrganicBuyerBatch, results);
  results = await runEngine("Instant Safety Gate", analyzeInstantSafetyGateBatch, results);
  results = await runEngine("Organic Demand Integrity", analyzeOrganicDemandIntegrityBatch, results);
  results = await runEngine("Candidate Lifecycle", analyzeCandidateLifecycleBatch, results);
  results = await runEngine("Discovery Decision", analyzeDiscoveryDecisionBatch, results);
  results = await runEngine("Missed Winner Lab", analyzeMissedWinnerLabBatch, results, options.missedWinnerLab || {});

  results = await runEngine("Final Scoring", addFinalScoring, results);
  results = await runEngine("Project Change Detection", analyzeProjectChangeBatch, results);
  results = await runEngine("Opportunity Proof", analyzeOpportunityProofBatch, results);
  results = await runEngine("Trap Risk", analyzeTrapRiskBatch, results);
  results = await runEngine("Confidence-Adjusted Rank", analyzeConfidenceAdjustedRankBatch, results);
  results = await runEngine("AI Ecosystem Council", analyzeAIEcosystemCouncilBatch, results);
  results = await runEngine("Research Operating System", analyzeResearchOperatingSystemBatch, results);
  results = await runEngine("Autonomous Alpha Lab", analyzeAutonomousAlphaLabBatch, results);
  results = await runEngine("Quantum Reasoning Brain", analyzeQuantumReasoningBrainBatch, results);
  results = await runEngine("World Model Brain", analyzeWorldModelBrainBatch, results, {
    timeoutMs: num(process.env.WORLD_MODEL_BRAIN_TIMEOUT_MS || 15000),
  });
  results = await runEngine("Autonomous Market Scientist", analyzeAutonomousMarketScientistBatch, results);
  results = await runEngine("Self-Training Market Simulation Brain", analyzeSelfTrainingMarketSimulationBrainBatch, results);
  results = await runEngine("Autonomous Outcome Judge", analyzeAutonomousOutcomeJudgeBatch, results, options.outcomeJudge || {});
  results = await runEngine("Live Catalyst Radar", analyzeLiveCatalystRadarBatch, results);
  results = await runEngine("Project Dossier Swarm", analyzeProjectDossierSwarmBatch, results, options.dossierSwarm || {});
  results = await runEngine("AI Research Commander", analyzeAIResearchCommanderBatch, results);
  results = await runEngine("Autonomous Alpha Investigator", analyzeAutonomousAlphaInvestigatorBatch, results);
  results = await runEngine("AI Portfolio War Room", analyzeAIPortfolioWarRoomBatch, results);
  results = await runEngine("Autonomous Strategy Lab", analyzeAutonomousStrategyLabBatch, results);
  results = await runEngine("Causal Alpha Brain", analyzeCausalAlphaBrainBatch, results);
  results = await runEngine("Autonomous Alpha OS", analyzeAutonomousAlphaOSBatch, results);
  results = await runEngine("Paper Trading Outcome Lab", analyzePaperTradingOutcomeLabBatch, results);
  results = await runEngine("Auto-Learning Weight Optimizer", analyzeAutoLearningWeightOptimizerBatch, results);
  results = await runEngine("Breakout Brain", analyzeBreakoutBrainBatch, results, options.breakoutBrain || {});
  results = await runEngine("Autonomous Research Orchestrator", analyzeAutonomousResearchOrchestratorBatch, results, options.autonomousResearch || {});
  results = await runEngine("High-Tech Alpha Stack", analyzeHighTechAlphaStackBatch, results);
  results = await runEngine("Self-Evolving Alpha OS", analyzeSelfEvolvingAlphaOSBatch, results);
  results = await runEngine("Proof-Carrying Alpha Contract", analyzeProofCarryingAlphaContractBatch, results);
  results = await runEngine("Autonomous Alpha Knowledge Graph", analyzeAutonomousAlphaKnowledgeGraphBatch, results);
  results = await runEngine("Causal Market Twin", analyzeCausalMarketTwinBatch, results);
  results = await runEngine("Autonomous Causal Alpha Network", analyzeAutonomousCausalAlphaNetworkBatch, results);
  results = await runEngine("Alpha Evolution Governor", analyzeAlphaEvolutionGovernorBatch, results);
  results = await runEngine("Small Cap Hunter", analyzeSmallCapHunterBatch, results, options.smallCapHunter || {});
  results = await runEngine("Proof of Alpha Execution Twin", analyzeProofOfAlphaExecutionTwinBatch, results, options.executionTwin || {});
  results = await runEngine("Quiet Accumulation", analyzeQuietAccumulationBatch, results);
  results = await runEngine("Pre-Breakout Momentum", analyzePreBreakoutMomentumBatch, results);
  results = await runEngine("Information Advantage", analyzeInformationAdvantageBatch, results);
  results = await runEngine("Distressed Microcap Trap", analyzeDistressedMicrocapTrapBatch, results);
  results = await runEngine("Pre-Consensus Breakout Hunter", analyzePreConsensusBreakoutHunterBatch, results, options.preConsensusBreakoutHunter || {});
  results = await runEngine("Final Selection Integrity", analyzeFinalSelectionIntegrityBatch, results, options.finalSelectionIntegrity || {});
  results = await runEngine("Sniper Outcome Labels", analyzeSniperOutcomeLabelsBatch, results, options.sniperOutcomeLabels || {});
  results = await runEngine("Sniper Point-in-Time Dataset", analyzeSniperPointInTimeBatch, results, options.sniperPointInTime || {});
  results = await runEngine("Sniper Lifecycle State", analyzeSniperLifecycleStateBatch, results);
  results = await runEngine("Sniper Evidence Families", analyzeSniperEvidenceFamiliesBatch, results);
  results = await runEngine("Sniper Integrity Gate", analyzeSniperIntegrityGateBatch, results, options.sniperIntegrity || {});
  results = await runEngine("Institutional Data Provenance", analyzeInstitutionalDataProvenanceBatch, results, options.institutionalDataProvenance || {});

  const finalIntegrity = validateFinalSelectionInvariants(results);
  if (finalIntegrity.status !== "PASS") {
    const warning = `Final selection integrity warning: ${finalIntegrity.violationCount} invariant violation(s) detected.`;
    if (options.strictFinalSelectionIntegrity) {
      throw new Error(warning);
    }
    console.log(warning);
  }

  const sniperIntegrity = validateSniperIntegrityInvariants(results);
  if (sniperIntegrity.status !== "PASS") {
    const warning = `Sniper integrity warning: ${sniperIntegrity.violationCount} invariant violation(s) detected.`;
    if (options.strictSniperIntegrity) {
      throw new Error(warning);
    }
    console.log(warning);
  }

  if (options.saveMemory !== false) {
    try {
      await saveScanMemory(results);
    } catch (error) {
      console.log(`Scan memory save failed: ${error.message}`);
    }

    try {
      await saveProjectWatchlist(results);
    } catch (error) {
      console.log(`Project watchlist save failed: ${error.message}`);
    }

    try {
      await saveOutcomeSnapshots(results);
    } catch (error) {
      console.log(`Outcome snapshot save failed: ${error.message}`);
    }

    try {
      saveInternetResearchMemory(results);
    } catch (error) {
      console.log(`Internet research memory save failed: ${error.message}`);
    }

    try {
      saveAgentCouncilMemory(results);
    } catch (error) {
      console.log(`Agent council memory save failed: ${error.message}`);
    }

    try {
      saveStrategyMemory(results);
    } catch (error) {
      console.log(`Strategy memory save failed: ${error.message}`);
    }

    try {
      savePaperTradingOutcomes(results);
    } catch (error) {
      console.log(`Paper trading outcome save failed: ${error.message}`);
    }

    try {
      saveAutonomousResearchMemory(results);
    } catch (error) {
      console.log(`Autonomous research memory save failed: ${error.message}`);
    }

    try {
      saveAlphaContracts(results);
    } catch (error) {
      console.log(`Alpha contract memory save failed: ${error.message}`);
    }

    try {
      saveAlphaKnowledgeGraph(results);
    } catch (error) {
      console.log(`Alpha knowledge graph save failed: ${error.message}`);
    }

    try {
      saveCausalAlphaEvents(results);
    } catch (error) {
      console.log(`Causal alpha event lake save failed: ${error.message}`);
    }

    try {
      saveAlphaEvolutionMemory(results);
    } catch (error) {
      console.log(`Alpha evolution memory save failed: ${error.message}`);
    }
  }

  return results;
}

export function summarizePipelineResults(results = []) {
  const safeResults = Array.isArray(results)
    ? results
    : normalizeEngineOutput(results, []);

  const prePumpOpportunities = safeResults.filter(
    (p) =>
      num(p.prePump?.score) >= 70 &&
      p.prePump?.status !== "ALREADY_PUMPED" &&
      p.prePump?.status !== "LATE_CHASE"
  );

  const launchStakingOpportunities = safeResults.filter(
    (p) =>
      num(p.narrativeLaunchStakingScore) >= 70 &&
      num(p.stakingRiskScore) < 70
  );
  const highConvictionOpportunities = safeResults.filter(
    (p) => ["Institutional", "High"].includes(p.conviction) && num(p.pipelineScore) >= 70
  );
  const defensiveProjects = safeResults.filter((p) => p.conviction === "Defensive");
  const smartMoneyFlowSetups = safeResults.filter(
    (p) =>
      num(p.signalProfile?.smartMoney) >= 65 &&
      num(p.signalProfile?.flows) >= 65 &&
      num(p.signalProfile?.risk) < 70
  );
  const narrativeMomentumSetups = safeResults.filter(
    (p) =>
      num(p.signalProfile?.narrative) >= 65 &&
      num(p.signalProfile?.momentum) >= 65 &&
      num(p.signalProfile?.risk) < 70
  );
  const marketContext = safeResults[0]?.marketContext || buildMarketContext(safeResults);
  const priorityResearch = safeResults.filter(
    (p) => ["Core Watch", "Priority Research"].includes(p.allocationBucket)
  );
  const socialAccelerationSetups = safeResults.filter((p) => num(p.xSocialScore) >= 65);
  const positiveLearningSetups = safeResults.filter((p) => num(p.learningEdgeScore) >= 70);
  const acceleratingWatchedProjects = safeResults.filter(
    (p) =>
      p.projectWatchChange?.scoreTrend === "accelerating" ||
      p.institutionalLearning?.scoreDelta >= 8
  );
  const quantumUpsideSetups = safeResults.filter(
    (p) =>
      num(p.quantumOpportunityScore) >= 70 &&
      num(p.quantumOutcomeField?.collapseProbability) < 35
  );
  const quantumFragileSetups = safeResults.filter(
    (p) =>
      p.quantumFieldState === "Fragile Field" ||
      num(p.quantumOutcomeField?.collapseProbability) >= 35
  );
  const outcomeMemoryWinners = safeResults.filter((p) => num(p.outcomeLearningScore) >= 70);
  const outcomeMemoryTraps = safeResults.filter((p) => num(p.outcomeTrapRisk) >= 55);
  const winningComboSetups = safeResults.filter(
    (p) =>
      num(p.signalCombinationScore) >= 70 &&
      (p.winningSignalCombinations || []).length > (p.trapSignalCombinations || []).length
  );
  const trapComboSetups = safeResults.filter((p) => (p.trapSignalCombinations || []).length > 0);
  const calibratedEdgeSetups = safeResults.filter((p) => num(p.calibrationAdjustment) >= 5);
  const calibratedWarningSetups = safeResults.filter((p) => num(p.calibrationAdjustment) <= -5);
  const aiPrioritySetups = safeResults.filter((p) => p.aiDecision === "Priority Watch");
  const aiRejectedSetups = safeResults.filter((p) => p.aiDecision === "Reject");
  const externalConfirmedSetups = safeResults.filter((p) => num(p.externalSignalScore) >= 65);
  const preBreakoutPatternSetups = safeResults.filter((p) => num(p.prePumpPatternEdge) >= 12);
  const trapPatternSetups = safeResults.filter(
    (p) => num(p.trapPatternMatchPct) >= 65 && num(p.prePumpPatternEdge) <= -8
  );
  const lowConfidenceHighScores = safeResults.filter(
    (p) => num(p.pipelineScore) >= 70 && ["Low", "Developing"].includes(p.dataConfidence)
  );
  const institutionalVNextSetups = safeResults.filter((p) => num(p.institutionalVNextScore) >= 70);
  const institutionalConfidenceSetups = safeResults.filter(
    (p) => ["Institutional", "High"].includes(p.institutionalConfidenceLevel)
  );
  const highVestingPressureSetups = safeResults.filter((p) => num(p.vestingPressureScore) >= 65);
  const proofBackedSetups = safeResults.filter((p) => num(p.proofScore) >= 70);
  const thinProofSetups = safeResults.filter((p) =>
    ["Thin", "Developing"].includes(p.proofStrength)
  );
  const hotNarrativeSetups = safeResults.filter((p) => num(p.narrativeHeatScore) >= 65);
  const improvingProjects = safeResults.filter((p) =>
    ["accelerating", "improving"].includes(p.projectChangeState)
  );
  const highTrapRiskSetups = safeResults.filter((p) => num(p.trapRiskScore) >= 60);
  const reliableSourceSetups = safeResults.filter((p) => num(p.sourceReliabilityScore) >= 70);
  const aiStrongBuySetups = safeResults.filter((p) =>
    ["AI Strong Buy", "Best Available Strong Buy Candidate"].includes(p.aiEcosystemVerdict)
  );
  const preStrongBuySetups = safeResults.filter((p) => p.strongBuyLifecycleStage === "Pre-Strong Buy");
  const highDisagreementSetups = safeResults.filter((p) => p.aiDisagreement?.level === "High");
  const redTeamBlocks = safeResults.filter((p) => p.redTeamReview?.status === "Block");
  const alphaLabMatches = safeResults.filter((p) => (p.alphaLabStrategies || []).length > 0);
  const simulationStrongBuySetups = safeResults.filter(
    (p) => p.simulationDecision === "Simulation Strong Buy Candidate"
  );
  const simulationPrioritySetups = safeResults.filter(
    (p) => p.simulationDecision === "Simulation Priority Watch"
  );
  const adversarialSimulationBlocks = safeResults.filter(
    (p) => p.adversarialSimulationReview?.status === "Block"
  );
  const trackedOutcomeJudgements = safeResults.filter((p) => p.outcomeJudgeStatus === "Tracked");
  const outcomeUpgrades = safeResults.filter((p) => num(p.outcomeRealityAdjustment) > 0);
  const outcomeDowngrades = safeResults.filter((p) => num(p.outcomeRealityAdjustment) < 0);
  const dossieredProjects = safeResults.filter((p) => p.projectDossierSwarm);
  const dossierPrioritySetups = safeResults.filter((p) => p.dossierSwarmDecision === "Dossier Priority");
  const researchPriorityDossiers = safeResults.filter((p) => p.dossierSwarmDecision === "Research Priority");
  const urgentCatalystSetups = safeResults.filter((p) =>
    ["Critical", "High", "Risk-Critical"].includes(p.liveCatalystUrgency)
  );
  const strategyStrongBuySetups = safeResults.filter((p) => p.strategyLabVerdict === "Paper Strong Buy Candidate");
  const strategyPrioritySetups = safeResults.filter((p) => p.strategyLabVerdict === "Priority Paper Trade");
  const causalStrongBuySetups = safeResults.filter((p) => p.causalAlphaVerdict === "Causal Strong Buy Candidate");
  const causalPrioritySetups = safeResults.filter((p) => p.causalAlphaVerdict === "Causal Priority Research");
  const alphaOSStrongBuySetups = safeResults.filter((p) => p.autonomousAlphaOSVerdict === "OS Strong Buy Research Candidate");
  const alphaOSBestAvailableSetups = safeResults.filter((p) => p.autonomousAlphaOSVerdict === "OS Best Available Candidate");
  const alphaOSPrioritySetups = safeResults.filter((p) => p.autonomousAlphaOSVerdict === "OS Priority Research");
  const alphaOSPaperSetups = safeResults.filter((p) => p.autonomousAlphaOSVerdict === "OS Paper Trade");
  const paperOutcomePromotions = safeResults.filter((p) => p.paperOutcomeLabVerdict === "Promote Strategy Weight");
  const paperOutcomeDowngrades = safeResults.filter((p) => p.paperOutcomeLabVerdict === "Strategy Needs Downgrade");
  const verifiedSourceStacks = safeResults.filter((p) => p.sourceTruthVerdict === "Verified Source Stack");
  const weakSourceStacks = safeResults.filter((p) => p.sourceTruthVerdict === "Weak Source Stack");
  const eliteGithubSignals = safeResults.filter((p) => p.githubProVerdict === "Elite Builder Signal");
  const healthyGithubSignals = safeResults.filter((p) => p.githubProVerdict === "Healthy Builder Signal");
  const weightOptimizedPriority = safeResults.filter((p) => p.autoLearningWeightVerdict === "Weight-Optimized Priority");
  const breakoutBrainSelections = safeResults.filter((p) => p.breakoutBrainSelected);
  const topBreakoutBrainSetups = [...safeResults]
    .sort((a, b) => num(b.breakoutBrainScore) - num(a.breakoutBrainScore))
    .slice(0, 10);
  const highTechAlphaCandidates = safeResults.filter((p) => p.highTechAlphaVerdict === "High-Tech Alpha Candidate");
  const highTechPriorityResearch = safeResults.filter((p) => p.highTechAlphaVerdict === "High-Tech Priority Research");
  const topHighTechAlphaSetups = [...safeResults]
    .sort((a, b) => num(b.highTechAlphaScore) - num(a.highTechAlphaScore))
    .slice(0, 10);
  const selfEvolvingAlphaCandidates = safeResults.filter(
    (p) => p.selfEvolvingAlphaOSDecision === "Self-Evolving Alpha Candidate"
  );
  const selfEvolvingPriorityResearch = safeResults.filter(
    (p) => p.selfEvolvingAlphaOSDecision === "Priority Research"
  );
  const selfEvolvingResearchBlocks = safeResults.filter(
    (p) => p.selfEvolvingAlphaOSDecision === "Research Block"
  );
  const topSelfEvolvingAlphaSetups = [...safeResults]
    .sort((a, b) => num(b.selfEvolvingAlphaOSScore) - num(a.selfEvolvingAlphaOSScore))
    .slice(0, 10);
  const proofContractCandidates = safeResults.filter(
    (p) => p.proofCarryingAlphaContractVerdict === "Proof-Carrying Alpha Candidate"
  );
  const accountablePriorityContracts = safeResults.filter(
    (p) => p.proofCarryingAlphaContractVerdict === "Accountable Priority Research"
  );
  const invalidatedContracts = safeResults.filter(
    (p) => p.proofCarryingAlphaContractVerdict === "Invalidation Hit"
  );
  const topProofContracts = [...safeResults]
    .sort((a, b) => num(b.proofCarryingAlphaContractScore) - num(a.proofCarryingAlphaContractScore))
    .slice(0, 10);
  const alphaKnowledgeGraphCandidates = safeResults.filter(
    (p) => p.alphaKnowledgeGraphVerdict === "Knowledge Graph Alpha Candidate"
  );
  const alphaKnowledgeGraphPriority = safeResults.filter(
    (p) => p.alphaKnowledgeGraphVerdict === "Knowledge Graph Priority Research"
  );
  const alphaKnowledgeGraphRiskBlocks = safeResults.filter(
    (p) => p.alphaKnowledgeGraphVerdict === "Knowledge Graph Risk Block"
  );
  const topAlphaKnowledgeGraphSetups = [...safeResults]
    .sort((a, b) => num(b.alphaKnowledgeGraphScore) - num(a.alphaKnowledgeGraphScore))
    .slice(0, 10);
  const causalMarketTwinStrongBuy = safeResults.filter(
    (p) => p.causalMarketTwinVerdict === "Twin Strong Buy Research Candidate"
  );
  const causalMarketTwinPriority = safeResults.filter(
    (p) => p.causalMarketTwinVerdict === "Twin Priority Research"
  );
  const causalMarketTwinRiskBlocks = safeResults.filter(
    (p) => p.causalMarketTwinVerdict === "Twin Risk Block"
  );
  const topCausalMarketTwinSetups = [...safeResults]
    .sort((a, b) => num(b.causalMarketTwinScore) - num(a.causalMarketTwinScore))
    .slice(0, 10);
  const causalNetworkArmed = safeResults.filter((p) => p.autonomousCausalProjectState === "ARMED");
  const causalNetworkPriority = safeResults.filter(
    (p) => p.autonomousCausalNetworkVerdict === "Causal Network Priority Research"
  );
  const causalNetworkBlocks = safeResults.filter((p) => p.autonomousCausalProjectState === "BLOCKED");
  const causalNetworkLowFragility = safeResults.filter((p) => p.causalEvidenceFragility === "Low");
  const topCausalNetworkSetups = [...safeResults]
    .filter((p) => p.autonomousCausalAlphaNetwork)
    .sort((a, b) => num(b.autonomousCausalNetworkScore) - num(a.autonomousCausalNetworkScore))
    .slice(0, 10);
  const alphaGovernorPromotes = safeResults.filter(
    (p) => p.alphaEvolutionGovernorVerdict === "Governor Promote"
  );
  const alphaGovernorPriority = safeResults.filter(
    (p) => p.alphaEvolutionGovernorVerdict === "Governor Priority Research"
  );
  const alphaGovernorRechecks = safeResults.filter(
    (p) => p.alphaEvolutionGovernorVerdict === "Governor Recheck Soon"
  );
  const alphaGovernorEvidenceGaps = safeResults.filter(
    (p) => p.alphaEvolutionGovernorVerdict === "Governor Evidence Gap"
  );
  const alphaGovernorRiskBlocks = safeResults.filter(
    (p) => p.alphaEvolutionGovernorVerdict === "Governor Risk Block"
  );
  const topAlphaGovernorSetups = [...safeResults]
    .sort((a, b) => num(b.alphaEvolutionGovernorScore) - num(a.alphaEvolutionGovernorScore))
    .slice(0, 10);
  const smallCapHunterSelections = safeResults.filter((p) => p.smallCapHunterSelected);
  const smallCapHunterWatch = safeResults.filter((p) => p.smallCapHunterVerdict === "Small-Cap Watch");
  const smallCapHunterRiskBlocks = safeResults.filter((p) => p.smallCapHunterVerdict === "Small-Cap Risk Block");
  const smallCapHunterPurchaseRouteBlocks = safeResults.filter((p) => p.smallCapHunterVerdict === "Small-Cap Purchase Route Block");
  const topSmallCapHunterSetups = [...safeResults]
    .filter((p) => p.smallCapHunter)
    .sort((a, b) => num(b.smallCapHunterScore) - num(a.smallCapHunterScore))
    .slice(0, 10);
  const executionTwinSelections = safeResults.filter((p) => p.proofOfAlphaExecutionTwinSelected);
  const executionTwinRouteBlocks = safeResults.filter((p) => p.proofOfAlphaExecutionTwinVerdict === "Execution Route Block");
  const executionTwinSafetyBlocks = safeResults.filter((p) => p.proofOfAlphaExecutionTwinVerdict === "Execution Safety Block");
  const executionTwinLiquidityBlocks = safeResults.filter((p) => p.proofOfAlphaExecutionTwinVerdict === "Execution Liquidity Block");
  const topExecutionTwinSetups = [...safeResults]
    .filter((p) => p.proofOfAlphaExecutionTwin)
    .sort((a, b) => num(b.proofOfAlphaExecutionTwinScore) - num(a.proofOfAlphaExecutionTwinScore))
    .slice(0, 10);
  const finalQualifiedCandidates = safeResults.filter((p) => p.finalSelectionState === "QUALIFIED");
  const finalResearchOnlyCandidates = safeResults.filter((p) => p.finalSelectionState === "RESEARCH_ONLY");
  const finalBlockedCandidates = safeResults.filter((p) => p.finalSelectionState === "BLOCKED");
  const finalIdentityConflicts = safeResults.filter((p) => p.finalSelectionState === "IDENTITY_CONFLICT");
  const finalInsufficientData = safeResults.filter((p) => p.finalSelectionState === "INSUFFICIENT_DATA");
  const finalIntegrityDeselections = safeResults.filter((p) =>
    (p.selectionAuditTrail || []).some((entry) => entry.engine === "Final Selection Integrity")
  );
  const preConsensusAnalyzed = safeResults.filter((p) => p.preConsensusBreakoutHunter);
  const exceptionalPreConsensus = safeResults.filter((p) => p.preConsensusTier === "Exceptional Pre-Consensus Candidate");
  const highConvictionPreConsensus = safeResults.filter((p) => p.preConsensusTier === "High-Conviction Research Candidate");
  const quietAccumulationDetected = safeResults.filter((p) => p.quietAccumulationDetected);
  const alreadyPumpedPreConsensus = safeResults.filter((p) =>
    ["ALREADY_PUMPED", "LATE_CHASE"].includes(p.preBreakoutMomentumStage)
  );
  const blockedPreConsensus = safeResults.filter((p) => (p.preConsensusHardBlockers || []).length > 0);
  const sniperAnalyzed = safeResults.filter((p) => p.sniperIntegrityGate);
  const armedSniperCandidates = safeResults.filter((p) => p.sniperQualified && p.sniperState === "ARMED");
  const sniperQuietAccumulation = safeResults.filter((p) => p.sniperState === "QUIET_ACCUMULATION");
  const sniperFundamentalsAccelerating = safeResults.filter((p) => p.sniperState === "FUNDAMENTALS_ACCELERATING");
  const sniperLateChase = safeResults.filter((p) => p.sniperState === "LATE_CHASE");
  const sniperDistressed = safeResults.filter((p) => ["DISTRESSED", "RECOVERY_ATTEMPT"].includes(p.sniperState));
  const sniperBlocked = safeResults.filter((p) => (p.sniperBlockingReasons || []).length > 0);
  const sniperInsufficientData = safeResults.filter((p) => p.sniperDataStatus === "INSUFFICIENT");
  const organicDemandConfirmed = safeResults.filter((p) => p.organicDemandVerdict === "Organic Demand Confirmed");
  const organicIntegrityBlocks = safeResults.filter((p) => p.organicDemandVerdict === "Institutional Integrity Block");
  const tradableAnomalies = safeResults.filter((p) => p.organicDemandVerdict === "Tradable Anomaly / Verify Organic Demand");
  const economicVerificationRequired = safeResults.filter((p) => p.organicDemandVerdict === "Economic Verification Required");
  const topOrganicIntegrityRisks = [...safeResults]
    .filter((p) => p.organicDemandIntegrity)
    .sort((a, b) => num(b.economicIntegrityRiskScore) - num(a.economicIntegrityRiskScore))
    .slice(0, 10);
  const autonomousResearchPriority = safeResults.filter((p) => p.autonomousResearchVerdict === "Research-Verified Priority");
  const autonomousResearchIncomplete = safeResults.filter((p) => p.autonomousResearchVerdict === "Evidence Incomplete");
  const autonomousResearchBlocked = safeResults.filter((p) => p.autonomousResearchVerdict === "Blocked By Research Risk");
  const topConfidenceAdjusted = [...safeResults]
    .sort((a, b) => num(b.confidenceAdjustedScore) - num(a.confidenceAdjustedScore))
    .slice(0, 10);

  return {
    scannedProjects: safeResults.length,
    topProject: safeResults[0] || null,
    marketContext,
    marketRegime: marketContext.regime,

    institutionalAlphaCount: safeResults.filter((p) => p.pipelineScore >= 95).length,
    eliteOpportunityCount: safeResults.filter((p) => p.pipelineScore >= 90).length,
    aPlusOpportunityCount: safeResults.filter((p) => p.pipelineScore >= 85).length,
    strongWatchlistCount: safeResults.filter((p) => p.pipelineScore >= 80).length,
    watchlistCount: safeResults.filter((p) => p.pipelineScore >= 70).length,

    highMarketRankCount: safeResults.filter((p) => p.marketRankScore >= 70).length,
    highRichTokenCount: safeResults.filter((p) => p.richTokenScore >= 70).length,
    highMomentumCount: safeResults.filter((p) => p.momentumShiftScore >= 70).length,
    highPrePumpCount: prePumpOpportunities.length,
    highNarrativeLaunchStakingCount: launchStakingOpportunities.length,
    highStakingRiskCount: safeResults.filter((p) => p.stakingRiskScore >= 70).length,
    highConvictionCount: highConvictionOpportunities.length,
    defensiveCount: defensiveProjects.length,
    smartMoneyFlowSetupCount: smartMoneyFlowSetups.length,
    narrativeMomentumSetupCount: narrativeMomentumSetups.length,
    priorityResearchCount: priorityResearch.length,
    coreWatchCount: safeResults.filter((p) => p.allocationBucket === "Core Watch").length,
    starterWatchCount: safeResults.filter((p) => p.allocationBucket === "Starter Watch").length,
    speculativeLabCount: safeResults.filter((p) => p.allocationBucket === "Speculative Lab").length,
    socialAccelerationSetupCount: socialAccelerationSetups.length,
    positiveLearningSetupCount: positiveLearningSetups.length,
    acceleratingWatchedProjectCount: acceleratingWatchedProjects.length,
    quantumUpsideSetupCount: quantumUpsideSetups.length,
    quantumFragileSetupCount: quantumFragileSetups.length,
    outcomeMemoryWinnerFitCount: outcomeMemoryWinners.length,
    outcomeMemoryTrapFitCount: outcomeMemoryTraps.length,
    winningSignalCombinationCount: winningComboSetups.length,
    trapSignalCombinationCount: trapComboSetups.length,
    calibratedEdgeCount: calibratedEdgeSetups.length,
    calibratedWarningCount: calibratedWarningSetups.length,
    aiPriorityCount: aiPrioritySetups.length,
    aiRejectedCount: aiRejectedSetups.length,
    externalConfirmedCount: externalConfirmedSetups.length,
    preBreakoutPatternCount: preBreakoutPatternSetups.length,
    trapPatternCount: trapPatternSetups.length,
    lowConfidenceHighScoreCount: lowConfidenceHighScores.length,
    institutionalVNextCount: institutionalVNextSetups.length,
    institutionalConfidenceCount: institutionalConfidenceSetups.length,
    highVestingPressureCount: highVestingPressureSetups.length,
    proofBackedCount: proofBackedSetups.length,
    thinProofCount: thinProofSetups.length,
    hotNarrativeCount: hotNarrativeSetups.length,
    improvingProjectCount: improvingProjects.length,
    highTrapRiskCount: highTrapRiskSetups.length,
    reliableSourceCount: reliableSourceSetups.length,
    aiStrongBuyCount: aiStrongBuySetups.length,
    preStrongBuyCount: preStrongBuySetups.length,
    highDisagreementCount: highDisagreementSetups.length,
    redTeamBlockCount: redTeamBlocks.length,
    alphaLabMatchCount: alphaLabMatches.length,
    simulationStrongBuyCount: simulationStrongBuySetups.length,
    simulationPriorityCount: simulationPrioritySetups.length,
    adversarialSimulationBlockCount: adversarialSimulationBlocks.length,
    trackedOutcomeJudgementCount: trackedOutcomeJudgements.length,
    outcomeUpgradeCount: outcomeUpgrades.length,
    outcomeDowngradeCount: outcomeDowngrades.length,
    dossieredProjectCount: dossieredProjects.length,
    dossierPriorityCount: dossierPrioritySetups.length,
    researchPriorityDossierCount: researchPriorityDossiers.length,
    urgentCatalystCount: urgentCatalystSetups.length,
    strategyStrongBuyCount: strategyStrongBuySetups.length,
    strategyPriorityCount: strategyPrioritySetups.length,
    causalStrongBuyCount: causalStrongBuySetups.length,
    causalPriorityCount: causalPrioritySetups.length,
    alphaOSStrongBuyCount: alphaOSStrongBuySetups.length,
    alphaOSBestAvailableCount: alphaOSBestAvailableSetups.length,
    alphaOSPriorityCount: alphaOSPrioritySetups.length,
    alphaOSPaperTradeCount: alphaOSPaperSetups.length,
    paperOutcomePromotionCount: paperOutcomePromotions.length,
    paperOutcomeDowngradeCount: paperOutcomeDowngrades.length,
    verifiedSourceStackCount: verifiedSourceStacks.length,
    weakSourceStackCount: weakSourceStacks.length,
    eliteGithubSignalCount: eliteGithubSignals.length,
    healthyGithubSignalCount: healthyGithubSignals.length,
    weightOptimizedPriorityCount: weightOptimizedPriority.length,
    breakoutBrainSelectionCount: breakoutBrainSelections.length,
    breakoutBrainHighProbabilityCount: safeResults.filter((p) => num(p.breakoutProbabilitySoon) >= 40).length,
    highTechAlphaCandidateCount: highTechAlphaCandidates.length,
    highTechPriorityResearchCount: highTechPriorityResearch.length,
    selfEvolvingAlphaCandidateCount: selfEvolvingAlphaCandidates.length,
    selfEvolvingPriorityResearchCount: selfEvolvingPriorityResearch.length,
    selfEvolvingResearchBlockCount: selfEvolvingResearchBlocks.length,
    proofCarryingAlphaCandidateCount: proofContractCandidates.length,
    accountablePriorityContractCount: accountablePriorityContracts.length,
    alphaContractInvalidationCount: invalidatedContracts.length,
    alphaKnowledgeGraphCandidateCount: alphaKnowledgeGraphCandidates.length,
    alphaKnowledgeGraphPriorityCount: alphaKnowledgeGraphPriority.length,
    alphaKnowledgeGraphRiskBlockCount: alphaKnowledgeGraphRiskBlocks.length,
    causalMarketTwinStrongBuyCount: causalMarketTwinStrongBuy.length,
    causalMarketTwinPriorityCount: causalMarketTwinPriority.length,
    causalMarketTwinRiskBlockCount: causalMarketTwinRiskBlocks.length,
    causalNetworkArmedCount: causalNetworkArmed.length,
    causalNetworkPriorityCount: causalNetworkPriority.length,
    causalNetworkBlockCount: causalNetworkBlocks.length,
    causalNetworkLowFragilityCount: causalNetworkLowFragility.length,
    alphaGovernorPromoteCount: alphaGovernorPromotes.length,
    alphaGovernorPriorityCount: alphaGovernorPriority.length,
    alphaGovernorRecheckCount: alphaGovernorRechecks.length,
    alphaGovernorEvidenceGapCount: alphaGovernorEvidenceGaps.length,
    alphaGovernorRiskBlockCount: alphaGovernorRiskBlocks.length,
    smallCapHunterSelectedCount: smallCapHunterSelections.length,
    smallCapHunterWatchCount: smallCapHunterWatch.length,
    smallCapHunterRiskBlockCount: smallCapHunterRiskBlocks.length,
    smallCapHunterPurchaseRouteBlockCount: smallCapHunterPurchaseRouteBlocks.length,
    executionTwinSelectedCount: executionTwinSelections.length,
    executionTwinRouteBlockCount: executionTwinRouteBlocks.length,
    executionTwinSafetyBlockCount: executionTwinSafetyBlocks.length,
    executionTwinLiquidityBlockCount: executionTwinLiquidityBlocks.length,
    finalQualifiedCandidateCount: finalQualifiedCandidates.length,
    finalResearchOnlyCandidateCount: finalResearchOnlyCandidates.length,
    finalBlockedCandidateCount: finalBlockedCandidates.length,
    finalIdentityConflictCount: finalIdentityConflicts.length,
    finalInsufficientDataCount: finalInsufficientData.length,
    finalIntegrityDeselectionCount: finalIntegrityDeselections.length,
    preConsensusAnalyzedCount: preConsensusAnalyzed.length,
    exceptionalPreConsensusCount: exceptionalPreConsensus.length,
    highConvictionPreConsensusCount: highConvictionPreConsensus.length,
    quietAccumulationDetectedCount: quietAccumulationDetected.length,
    alreadyPumpedPreConsensusCount: alreadyPumpedPreConsensus.length,
    blockedPreConsensusCount: blockedPreConsensus.length,
    sniperAnalyzedCount: sniperAnalyzed.length,
    armedSniperCandidateCount: armedSniperCandidates.length,
    sniperQuietAccumulationCount: sniperQuietAccumulation.length,
    sniperFundamentalsAcceleratingCount: sniperFundamentalsAccelerating.length,
    sniperLateChaseCount: sniperLateChase.length,
    sniperDistressedCount: sniperDistressed.length,
    sniperBlockedCount: sniperBlocked.length,
    sniperInsufficientDataCount: sniperInsufficientData.length,
    organicDemandConfirmedCount: organicDemandConfirmed.length,
    organicIntegrityBlockCount: organicIntegrityBlocks.length,
    tradableAnomalyCount: tradableAnomalies.length,
    economicVerificationRequiredCount: economicVerificationRequired.length,
    autonomousResearchPriorityCount: autonomousResearchPriority.length,
    autonomousResearchIncompleteCount: autonomousResearchIncomplete.length,
    autonomousResearchBlockedCount: autonomousResearchBlocked.length,

    topNarrativeHeatMap: safeResults[0]?.narrativeHeatIndex?.marketHeatMap || [],
    topConfidenceAdjustedSetups: topConfidenceAdjusted.map((project) => ({
      rank: project.confidenceAdjustedRank || 0,
      name: project.name || "Unknown",
      symbol: project.symbol || "Unknown",
      pipelineScore: project.pipelineScore || 0,
      confidenceAdjustedScore: project.confidenceAdjustedScore || 0,
      sourceReliabilityScore: project.sourceReliabilityScore || 0,
      trapRiskScore: project.trapRiskScore || 0,
      narrativeHeatScore: project.narrativeHeatScore || 0,
      projectChangeState: project.projectChangeState || "unknown",
    })),
    topAIStrongBuySetups: aiStrongBuySetups.slice(0, 10).map((project) => ({
      rank: project.pipelineRank || 0,
      name: project.name || "Unknown",
      symbol: project.symbol || "Unknown",
      pipelineScore: project.pipelineScore || 0,
      confidenceAdjustedScore: project.confidenceAdjustedScore || 0,
      aiEcosystemScore: project.aiEcosystemScore || 0,
      aiEcosystemVerdict: project.aiEcosystemVerdict || "Unknown",
      caveat: project.aiEcosystemCaveat || "",
      conversation: project.aiEcosystemCouncil?.conversation || [],
      whyNow: project.whyNow || {},
      strongBuyEvidenceGate: project.strongBuyEvidenceGate || {},
    })),
    topResearchOSSetups: safeResults.slice(0, 10).map((project) => ({
      rank: project.pipelineRank || 0,
      name: project.name || "Unknown",
      symbol: project.symbol || "Unknown",
      lifecycleStage: project.strongBuyLifecycleStage || "Unknown",
      bestHorizon: project.multiTimeframeIntelligence?.bestHorizon || "Unknown",
      redTeamStatus: project.redTeamReview?.status || "Unknown",
      disagreement: project.aiDisagreement?.level || "Unknown",
      alphaLabStatus: project.alphaLabStatus || "Unknown",
      scenarioPlan: project.scenarioPlan || {},
    })),
    topSimulationBrainSetups: [...safeResults]
      .sort((a, b) => num(b.simulationBrainScore) - num(a.simulationBrainScore))
      .slice(0, 10)
      .map((project) => ({
        rank: project.simulationPortfolioRank || 0,
        name: project.name || "Unknown",
        symbol: project.symbol || "Unknown",
        simulationBrainScore: project.simulationBrainScore || 0,
        simulationDecision: project.simulationDecision || "Unknown",
        breakoutProbability30d: project.breakoutProbability30d || 0,
        expectedReturn30dPct: project.expectedReturn30dPct || 0,
        bearCaseDrawdownPct: project.bearCaseDrawdownPct || 0,
        closestMarketAnalogs: project.closestMarketAnalogs || [],
        tournamentConsensus: project.engineTournament?.consensus || "Unknown",
        adversarialStatus: project.adversarialSimulationReview?.status || "Unknown",
      })),
    topOutcomeJudgeSetups: [...safeResults]
      .sort((a, b) => num(b.outcomeJudgeScore) - num(a.outcomeJudgeScore))
      .slice(0, 10)
      .map((project) => ({
        rank: project.pipelineRank || 0,
        name: project.name || "Unknown",
        symbol: project.symbol || "Unknown",
        outcomeJudgeScore: project.outcomeJudgeScore || 0,
        outcomeJudgeStatus: project.outcomeJudgeStatus || "Unknown",
        outcomeJudgeVerdict: project.outcomeJudgeVerdict || "Unknown",
        outcomeRealityAdjustment: project.outcomeRealityAdjustment || 0,
        outcomeAdjustedConfidence: project.outcomeAdjustedConfidence || "Unknown",
        summary: project.outcomeJudgement?.summary || "",
      })),
    topDossierSwarmSetups: [...safeResults]
      .filter((project) => project.projectDossierSwarm)
      .sort((a, b) => num(b.dossierSwarmScore) - num(a.dossierSwarmScore))
      .slice(0, 10)
      .map((project) => ({
        rank: project.pipelineRank || 0,
        name: project.name || "Unknown",
        symbol: project.symbol || "Unknown",
        dossierSwarmScore: project.dossierSwarmScore || 0,
        dossierSwarmDecision: project.dossierSwarmDecision || "Unknown",
        consensus: project.dossierSwarmConsensus || "",
        keyBullCase: project.projectDossierSwarm?.keyBullCase || "",
        keyBearCase: project.projectDossierSwarm?.keyBearCase || "",
        mustVerify: project.projectDossierSwarm?.mustVerify || [],
      })),
    topCatalystRadarSetups: [...safeResults]
      .filter((project) => num(project.liveCatalystRadarScore) > 0)
      .sort((a, b) => num(b.liveCatalystRadarScore) - num(a.liveCatalystRadarScore))
      .slice(0, 10)
      .map((project) => ({
        rank: project.pipelineRank || 0,
        name: project.name || "Unknown",
        symbol: project.symbol || "Unknown",
        liveCatalystRadarScore: project.liveCatalystRadarScore || 0,
        urgency: project.liveCatalystUrgency || "Low",
        action: project.liveCatalystAction || "No immediate action",
        topEvent: project.liveCatalystEvents?.[0] || null,
      })),
    topAutonomousAlphaOSSetups: [...safeResults]
      .sort((a, b) => num(b.autonomousAlphaOSScore) - num(a.autonomousAlphaOSScore))
      .slice(0, 10)
      .map((project) => ({
        rank: project.autonomousAlphaOSRank || 0,
        name: project.name || "Unknown",
        symbol: project.symbol || "Unknown",
        autonomousAlphaOSScore: project.autonomousAlphaOSScore || 0,
        verdict: project.autonomousAlphaOSVerdict || "Unknown",
        mode: project.autonomousAlphaOSMode || "Unknown",
        consensus: project.autonomousAlphaOSCouncil?.consensus || "Unknown",
        causalAlphaScore: project.causalAlphaScore || 0,
        strategyLabScore: project.strategyLabScore || 0,
        bestStrategy: project.bestAutonomousStrategy?.name || "No Strategy",
        primaryDriver: project.causalSignalGraph?.primaryDriver?.label || "Unknown",
        nextActions: project.autonomousAlphaOSNextActions || [],
      })),
    topAlphaDashboardV2Setups: [...safeResults]
      .sort(
        (a, b) =>
          num(b.autoLearningWeightScore || b.autonomousAlphaOSScore) -
          num(a.autoLearningWeightScore || a.autonomousAlphaOSScore)
      )
      .slice(0, 10)
      .map((project) => ({
        rank: project.autonomousAlphaOSRank || project.pipelineRank || 0,
        name: project.name || "Unknown",
        symbol: project.symbol || "Unknown",
        autoLearningWeightScore: project.autoLearningWeightScore || 0,
        paperOutcomeLabScore: project.paperOutcomeLabScore || 0,
        sourceTruthScore: project.sourceTruthScore || 0,
        githubProScore: project.githubProScore || 0,
        alphaOSVerdict: project.autonomousAlphaOSVerdict || "Unknown",
        strategy: project.bestAutonomousStrategy?.name || "No Strategy",
        causalDriver: project.causalSignalGraph?.primaryDriver?.label || "Unknown",
      })),
    topAutonomousResearchSetups: [...safeResults]
      .sort((a, b) => num(b.autonomousResearchScore) - num(a.autonomousResearchScore))
      .slice(0, 10)
      .map((project) => ({
        rank: project.autonomousAlphaOSRank || project.pipelineRank || 0,
        name: project.name || "Unknown",
        symbol: project.symbol || "Unknown",
        autonomousResearchScore: project.autonomousResearchScore || 0,
        verdict: project.autonomousResearchVerdict || "Unknown",
        confidence: project.autonomousResearchConfidence || 0,
        unansweredQuestions: project.autonomousResearchOrchestrator?.unansweredQuestions || [],
        contradictions: project.autonomousResearchOrchestrator?.contradictions || [],
        searchesPerformed: project.autonomousResearchOrchestrator?.searchesPerformed || [],
      })),
    topBreakoutBrainSetups: topBreakoutBrainSetups.map((project) => ({
      rank: project.breakoutBrainRank || 0,
      selected: Boolean(project.breakoutBrainSelected),
      selectionRank: project.breakoutBrainSelectionRank || null,
      name: project.name || "Unknown",
      symbol: project.symbol || "Unknown",
      chain: project.chain || "unknown",
      breakoutBrainScore: project.breakoutBrainScore || 0,
      breakoutProbabilitySoon: project.breakoutProbabilitySoon || 0,
      doubleProbability: project.breakoutMonteCarlo?.doubleProbability || 0,
      collapseProbability: project.breakoutMonteCarlo?.collapseProbability || 0,
      expectedReturn30dPct: project.breakoutExpectedReturn30dPct || 0,
      confidence: project.breakoutBrainConfidence || "Unknown",
      decision: project.breakoutBrainDecision || "Unknown",
      simulations: project.breakoutMonteCarlo?.simulations || 0,
      topDrivers: project.breakoutMonteCarlo?.topDrivers || [],
      riskControls: project.breakoutMonteCarlo?.riskControls || [],
    })),
    topHighTechAlphaSetups: topHighTechAlphaSetups.map((project) => ({
      rank: project.highTechAlphaRank || 0,
      name: project.name || "Unknown",
      symbol: project.symbol || "Unknown",
      chain: project.chain || "unknown",
      highTechAlphaScore: project.highTechAlphaScore || 0,
      verdict: project.highTechAlphaVerdict || "Unknown",
      confidence: project.highTechAlphaConfidence || "Unknown",
      commandDecision: project.highTechAlphaStack?.commandDecision || "",
      strongestModules: project.highTechAlphaStack?.strongestModules || [],
      weakestModules: project.highTechAlphaStack?.weakestModules || [],
      blockers: project.highTechAlphaStack?.blockers || [],
      moduleScores: project.highTechModuleScores || {},
    })),
    topSelfEvolvingAlphaSetups: topSelfEvolvingAlphaSetups.map((project) => ({
      rank: project.selfEvolvingAlphaOSRank || 0,
      name: project.name || "Unknown",
      symbol: project.symbol || "UNKNOWN",
      chain: project.chain || "unknown",
      score: project.selfEvolvingAlphaOSScore || 0,
      decision: project.selfEvolvingAlphaOSDecision || "Unknown",
      confidence: project.selfEvolvingAlphaOSConfidence || "Unknown",
      thesis: project.alphaThesis || null,
      committeeDecision: project.selfEvolvingAlphaOS?.agentSociety?.committeeDecision || "Unknown",
      worldModelScore: project.selfEvolvingAlphaOS?.worldModel?.score || 0,
      autopsyRisk: project.selfEvolvingAlphaOS?.alphaAutopsy?.riskScore || 0,
      activeExperiments: project.selfEvolvingAlphaOS?.experimentLab?.activeExperiments || [],
    })),
    topProofCarryingAlphaContracts: topProofContracts.map((project) => ({
      rank: project.proofCarryingAlphaContractRank || 0,
      name: project.name || "Unknown",
      symbol: project.symbol || "UNKNOWN",
      chain: project.chain || "unknown",
      score: project.proofCarryingAlphaContractScore || 0,
      verdict: project.proofCarryingAlphaContractVerdict || "Unknown",
      confidence: project.proofCarryingAlphaContract?.confidenceNow || "Unknown",
      contractId: project.proofCarryingAlphaContract?.contractId || "",
      thesis: project.proofCarryingAlphaContract?.thesis || "",
      latestGrade: project.proofCarryingAlphaContract?.latestGrade || null,
      mustHappen: project.proofCarryingAlphaContract?.mustHappen || [],
      invalidatesIf: project.proofCarryingAlphaContract?.invalidatesIf || [],
      supportingEngines: project.proofCarryingAlphaContract?.supportingEngines || [],
    })),
    topAlphaKnowledgeGraphSetups: topAlphaKnowledgeGraphSetups.map((project) => ({
      rank: project.pipelineRank || 0,
      name: project.name || "Unknown",
      symbol: project.symbol || "UNKNOWN",
      chain: project.chain || "unknown",
      score: project.alphaKnowledgeGraphScore || 0,
      confidence: project.alphaKnowledgeGraphConfidence || "Unknown",
      verdict: project.alphaKnowledgeGraphVerdict || "Unknown",
      dominantRelation: project.alphaKnowledgeGraph?.dominantRelation || "Unknown",
      memoryScans: project.alphaKnowledgeGraph?.memoryContext?.scans || 0,
      nodes: project.alphaKnowledgeGraph?.graph?.nodes?.length || 0,
      edges: project.alphaKnowledgeGraph?.graph?.edges?.length || 0,
      missingProof: project.alphaKnowledgeGraph?.missingProof || [],
    })),
    topCausalMarketTwinSetups: topCausalMarketTwinSetups.map((project) => ({
      rank: project.pipelineRank || 0,
      name: project.name || "Unknown",
      symbol: project.symbol || "UNKNOWN",
      chain: project.chain || "unknown",
      score: project.causalMarketTwinScore || 0,
      confidence: project.causalMarketTwinConfidence || "Unknown",
      verdict: project.causalMarketTwinVerdict || "Unknown",
      expectedReturnPct: project.causalMarketTwinExpectedReturnPct || 0,
      upsideProbability: project.causalMarketTwinUpsideProbability || 0,
      downsideProbability: project.causalMarketTwinDownsideProbability || 0,
      primaryCausalDriver: project.causalMarketTwin?.primaryCausalDriver || "Unknown",
      bestScenario: project.causalMarketTwin?.bestScenario || null,
      worstScenario: project.causalMarketTwin?.worstScenario || null,
      experiments: project.causalMarketTwin?.experiments || [],
    })),
    topCausalNetworkSetups: topCausalNetworkSetups.map((project) => ({
      rank: project.autonomousCausalNetworkRank || 0,
      name: project.name || "Unknown",
      symbol: project.symbol || "UNKNOWN",
      chain: project.chain || "unknown",
      state: project.autonomousCausalProjectState || "Unknown",
      score: project.autonomousCausalNetworkScore || 0,
      confidence: project.autonomousCausalNetworkConfidence || "Unknown",
      verdict: project.autonomousCausalNetworkVerdict || "Unknown",
      sequenceScore: project.autonomousCausalAlphaNetwork?.causalSequence?.sequenceScore || 0,
      patternSuccessRate: project.causalPatternSuccessRate || 0,
      patternSampleSize: project.causalPatternSampleSize || 0,
      evidenceFragility: project.causalEvidenceFragility || "Unknown",
      weakestDependency: project.autonomousCausalAlphaNetwork?.counterfactual?.weakestDependency || "unknown",
      nextRequiredConfirmation: project.autonomousCausalAlphaNetwork?.hypothesis?.nextRequiredConfirmation || "",
      invalidations: project.autonomousCausalAlphaNetwork?.hypothesis?.invalidations || [],
    })),
    topAlphaEvolutionGovernorSetups: topAlphaGovernorSetups.map((project) => ({
      rank: project.alphaEvolutionGovernorRank || 0,
      name: project.name || "Unknown",
      symbol: project.symbol || "UNKNOWN",
      chain: project.chain || "unknown",
      score: project.alphaEvolutionGovernorScore || 0,
      verdict: project.alphaEvolutionGovernorVerdict || "Unknown",
      action: project.alphaEvolutionGovernor?.actionPlan?.primaryAction || "Review",
      reviewCadence: project.alphaEvolutionGovernor?.actionPlan?.reviewCadence || "",
      moduleScores: project.alphaEvolutionGovernor?.moduleScores || {},
      blockers: project.alphaEvolutionGovernor?.blockers || [],
      missingProof: project.alphaEvolutionGovernor?.missingProof || [],
      upgradeDirectives: project.alphaEvolutionGovernor?.upgradeDirectives || [],
    })),
    topSmallCapHunterSetups: topSmallCapHunterSetups.map((project) => ({
      selectionRank: project.smallCapHunterSelectionRank || null,
      selected: Boolean(project.smallCapHunterSelected),
      name: project.name || "Unknown",
      symbol: project.symbol || "UNKNOWN",
      chain: project.chain || "unknown",
      score: project.smallCapHunterScore || 0,
      verdict: project.smallCapHunterVerdict || "Unknown",
      finalSelectionState: project.finalSelectionState || "UNKNOWN",
      finalIntegrityVerdict: project.finalIntegrityVerdict || "Unknown",
      finalBlockingReasons: project.finalBlockingReasons || [],
      finalWarningReasons: project.finalWarningReasons || [],
      marketCap: project.smallCapMarketCap || 0,
      capBand: project.smallCapBand || "Unknown",
      structureScore: project.smallCapStructureScore || 0,
      upsideScore: project.smallCapUpsideScore || 0,
      executionScore: project.smallCapExecutionScore || 0,
      riskScore: project.smallCapRiskScore || 0,
      purchaseRoute: project.smallCapHunter?.purchaseRoute || {},
      paperPlan: project.smallCapHunter?.paperPlan || {},
      reasons: project.smallCapHunter?.reasons || [],
      warnings: project.smallCapHunter?.warnings || [],
    })),
    topExecutionTwinSetups: topExecutionTwinSetups.map((project) => ({
      rank: project.proofOfAlphaExecutionTwinRank || null,
      selected: Boolean(project.proofOfAlphaExecutionTwinSelected),
      name: project.name || "Unknown",
      symbol: project.symbol || "UNKNOWN",
      chain: project.chain || "unknown",
      score: project.proofOfAlphaExecutionTwinScore || 0,
      verdict: project.proofOfAlphaExecutionTwinVerdict || "Unknown",
      finalSelectionState: project.finalSelectionState || "UNKNOWN",
      finalIntegrityVerdict: project.finalIntegrityVerdict || "Unknown",
      finalBlockingReasons: project.finalBlockingReasons || [],
      finalWarningReasons: project.finalWarningReasons || [],
      confidence: project.proofOfAlphaExecutionTwinConfidence || "Unknown",
      route: project.proofOfAlphaExecutionTwinRoute || "Unavailable",
      slippagePct: project.proofOfAlphaExecutionTwinSlippagePct ?? null,
      quote: project.proofOfAlphaExecutionTwin?.quote || {},
      safety: project.proofOfAlphaExecutionTwin?.safety || {},
      paperExecution: project.proofOfAlphaExecutionTwin?.paperExecution || {},
    })),
    topOrganicIntegrityRisks: topOrganicIntegrityRisks.map((project) => ({
      name: project.name || "Unknown",
      symbol: project.symbol || "UNKNOWN",
      chain: project.chain || "unknown",
      score: project.organicEconomicIntegrityScore || 0,
      verdict: project.organicDemandVerdict || "Unknown",
      organicDemandScore: project.organicDemandScore || 0,
      economicSustainabilityScore: project.economicSustainabilityScore || 0,
      riskScore: project.economicIntegrityRiskScore || 0,
      penalty: project.economicIntegrityPenalty || 0,
      hardExitLiquidityUsd: project.hardExitLiquidityUsd || 0,
      promotionBlocked: Boolean(project.organicDemandPromotionBlocked),
      manualReviewLabel: project.organicDemandManualReviewLabel || "Unknown",
      researchTaskCount: (project.economicIntegrityResearchTasks || []).length,
      researchTasks: (project.economicIntegrityResearchTasks || []).slice(0, 5),
      blockers: project.economicIntegrityBlockers || [],
    })),

    strongSmartMoneyAccumulationCount: safeResults.filter(
      (p) => p.smartMoneyAccumulationScore >= 70
    ).length,

    strongSmartWalletPerformanceCount: safeResults.filter(
      (p) => p.smartWalletPerformanceScore >= 70
    ).length,

    strongNarrativeForecastCount: safeResults.filter(
      (p) => p.narrativeForecastScore >= 70
    ).length,

    strongCatalystCalendarCount: safeResults.filter(
      (p) => p.catalystCalendarScore >= 70
    ).length,

    alreadyPumpedCount: safeResults.filter(
      (p) => p.prePump?.status === "ALREADY_PUMPED"
    ).length,

    lateChaseCount: safeResults.filter(
      (p) => p.prePump?.status === "LATE_CHASE"
    ).length,

    bestNarrativeLaunchStakingOpportunities: launchStakingOpportunities
      .slice(0, 10)
      .map((project) => ({
        name: project.name || "Unknown",
        symbol: project.symbol || "Unknown",
        pipelineTier: project.pipelineTier || "Unknown",
        pipelineScore: project.pipelineScore || 0,
        narrativeLaunchStakingScore: project.narrativeLaunchStakingScore || 0,
        narrativeLaunchStakingTier: project.narrativeLaunchStakingTier || "Unknown",
        launchReadinessScore: project.launchReadinessScore || 0,
        stakingMomentumScore: project.stakingMomentumScore || 0,
        stakingRiskScore: project.stakingRiskScore || 0,
        launchSignals: project.launchSignals || [],
        stakingSignals: project.stakingSignals || [],
      })),

    bestHighConvictionOpportunities: highConvictionOpportunities
      .slice(0, 10)
      .map((project) => ({
        rank: project.pipelineRank || 0,
        name: project.name || "Unknown",
        symbol: project.symbol || "Unknown",
        pipelineScore: project.pipelineScore || 0,
        rawPipelineScore: project.rawPipelineScore || 0,
        conviction: project.conviction || "Unknown",
        action: project.executionPlan?.action || "Unknown",
        sizing: project.executionPlan?.sizing || "Unknown",
        alphaTags: project.alphaTags || [],
        riskFlags: project.riskFlags || [],
        thesis: project.opportunityThesis || "",
      })),

    priorityResearchQueue: priorityResearch.slice(0, 15).map((project) => ({
      rank: project.pipelineRank || 0,
      name: project.name || "Unknown",
      symbol: project.symbol || "Unknown",
      pipelineScore: project.pipelineScore || 0,
      watchlistPriority: project.watchlistPriority || 0,
      allocationBucket: project.allocationBucket || "Unknown",
      conviction: project.conviction || "Unknown",
      action: project.executionPlan?.action || "Unknown",
      reviewTrigger: project.executionPlan?.reviewTrigger || "",
      checklist: project.researchChecklist || [],
      invalidationSignals: project.invalidationSignals || [],
    })),

    bestSelfLearningSetups: positiveLearningSetups.slice(0, 10).map((project) => ({
      rank: project.pipelineRank || 0,
      name: project.name || "Unknown",
      symbol: project.symbol || "Unknown",
      pipelineScore: project.pipelineScore || 0,
      learningEdgeScore: project.learningEdgeScore || 0,
      scoreDelta: project.institutionalLearning?.scoreDelta || 0,
      scanCount: project.institutionalLearning?.scanCount || 0,
      summary: project.institutionalLearning?.summary || "",
    })),

    bestQuantumOutcomeFields: quantumUpsideSetups.slice(0, 10).map((project) => ({
      rank: project.pipelineRank || 0,
      name: project.name || "Unknown",
      symbol: project.symbol || "Unknown",
      pipelineScore: project.pipelineScore || 0,
      quantumOpportunityScore: project.quantumOpportunityScore || 0,
      fieldState: project.quantumFieldState || "Unknown",
      expectedReturnPct: project.quantumOutcomeField?.expectedReturnPct || 0,
      bestCaseReturnPct: project.quantumOutcomeField?.bestCaseReturnPct || 0,
      baseCaseReturnPct: project.quantumOutcomeField?.baseCaseReturnPct || 0,
      worstCaseReturnPct: project.quantumOutcomeField?.worstCaseReturnPct || 0,
      positiveProbability: project.quantumOutcomeField?.positiveProbability || 0,
      collapseProbability: project.quantumOutcomeField?.collapseProbability || 0,
      asymmetryRatio: project.quantumOutcomeField?.asymmetryRatio || 0,
    })),

    bestOutcomeLearningSetups: outcomeMemoryWinners.slice(0, 10).map((project) => ({
      rank: project.pipelineRank || 0,
      name: project.name || "Unknown",
      symbol: project.symbol || "Unknown",
      pipelineScore: project.pipelineScore || 0,
      outcomeLearningScore: project.outcomeLearningScore || 0,
      estimatedWinRate: project.outcomeLearning?.estimatedWinRate || 0,
      trapRisk: project.outcomeTrapRisk || 0,
      summary: project.outcomeLearning?.summary || "",
      topMatches: project.outcomeLearning?.topMatches || [],
    })),

    bestSignalCombinationSetups: winningComboSetups.slice(0, 10).map((project) => ({
      rank: project.pipelineRank || 0,
      name: project.name || "Unknown",
      symbol: project.symbol || "Unknown",
      pipelineScore: project.pipelineScore || 0,
      signalCombinationScore: project.signalCombinationScore || 0,
      edge: project.signalCombinationEdge || 0,
      winningCombinations: (project.winningSignalCombinations || []).map((combo) => combo.name),
      trapCombinations: (project.trapSignalCombinations || []).map((combo) => combo.name),
      summary: project.signalCombinations?.summary || "",
    })),

    bestCalibratedSetups: calibratedEdgeSetups.slice(0, 10).map((project) => ({
      rank: project.pipelineRank || 0,
      name: project.name || "Unknown",
      symbol: project.symbol || "Unknown",
      pipelineScore: project.pipelineScore || 0,
      calibrationAdjustment: project.calibrationAdjustment || 0,
      calibrationScore: project.calibrationScore || 0,
      calibrationConfidence: project.calibrationConfidence || "Unknown",
      supportSignals: (project.calibrationSignals || []).slice(0, 5),
      warningSignals: (project.calibrationRiskSignals || []).slice(0, 5),
      summary: project.outcomeCalibration?.summary || "",
    })),

    bestAIAnalystSetups: aiPrioritySetups.slice(0, 10).map((project) => ({
      rank: project.pipelineRank || 0,
      name: project.name || "Unknown",
      symbol: project.symbol || "Unknown",
      pipelineScore: project.pipelineScore || 0,
      aiAnalystScore: project.aiAnalystScore || 0,
      decision: project.aiDecision || "Unknown",
      confidence: project.aiConfidence || "Unknown",
      bullCase: project.aiThesis?.bullCase || [],
      bearCase: project.aiThesis?.bearCase || [],
      memo: project.aiThesis?.memo || "",
    })),

    bestPreBreakoutPatternSetups: preBreakoutPatternSetups.slice(0, 10).map((project) => ({
      rank: project.pipelineRank || 0,
      name: project.name || "Unknown",
      symbol: project.symbol || "Unknown",
      pipelineScore: project.pipelineScore || 0,
      confidence: project.confidence || "Unknown",
      dataConfidence: project.dataConfidence || "Unknown",
      prePumpPatternScore: project.prePumpPatternScore || 0,
      breakoutMatchPct: project.prePumpPatternMatchPct || 0,
      trapMatchPct: project.trapPatternMatchPct || 0,
      edge: project.prePumpPatternEdge || 0,
      patternConfidence: project.prePumpPatternConfidence || "Unknown",
      matchedFeatures: project.prePumpPattern?.matchedFeatures || [],
      summary: project.prePumpPattern?.summary || "",
    })),

    bestInstitutionalVNextSetups: institutionalVNextSetups.slice(0, 10).map((project) => ({
      rank: project.pipelineRank || 0,
      name: project.name || "Unknown",
      symbol: project.symbol || "Unknown",
      pipelineScore: project.pipelineScore || 0,
      institutionalVNextScore: project.institutionalVNextScore || 0,
      institutionalConfidenceScore: project.institutionalConfidenceScore || 0,
      institutionalConfidenceLevel: project.institutionalConfidenceLevel || "Unknown",
      evidenceQualityScore: project.evidenceQualityScore || 0,
      monteCarloV2Score: project.monteCarloV2Score || 0,
      smartMoneyConvictionScore: project.smartMoneyConvictionScore || 0,
      liquidityMigrationScore: project.liquidityMigrationScore || 0,
      vestingPressureScore: project.vestingPressureScore || 0,
      explainabilitySummary: project.explainabilitySummary || "",
    })),

    highScoreLowConfidenceWarnings: lowConfidenceHighScores.slice(0, 10).map((project) => ({
      rank: project.pipelineRank || 0,
      name: project.name || "Unknown",
      symbol: project.symbol || "Unknown",
      pipelineScore: project.pipelineScore || 0,
      confidence: project.confidence || "Unknown",
      dataConfidence: project.dataConfidence || "Unknown",
      dataConfidenceScore: project.dataConfidenceScore || 0,
      breakdown: project.dataConfidenceBreakdown || {},
    })),

    bestSmartMoneyFlowSetups: smartMoneyFlowSetups.slice(0, 10).map((project) => ({
      rank: project.pipelineRank || 0,
      name: project.name || "Unknown",
      symbol: project.symbol || "Unknown",
      pipelineScore: project.pipelineScore || 0,
      smartMoneyScore: project.signalProfile?.smartMoney || 0,
      flowsScore: project.signalProfile?.flows || 0,
      riskScore: project.signalProfile?.risk || 0,
      action: project.executionPlan?.action || "Unknown",
    })),

    bestNarrativeMomentumSetups: narrativeMomentumSetups.slice(0, 10).map((project) => ({
      rank: project.pipelineRank || 0,
      name: project.name || "Unknown",
      symbol: project.symbol || "Unknown",
      pipelineScore: project.pipelineScore || 0,
      narrativeScore: project.signalProfile?.narrative || 0,
      momentumScore: project.signalProfile?.momentum || 0,
      riskScore: project.signalProfile?.risk || 0,
      action: project.executionPlan?.action || "Unknown",
    })),

    bestPrePumpOpportunities: prePumpOpportunities.slice(0, 10).map((project) => ({
      name: project.name || "Unknown",
      symbol: project.symbol || "Unknown",
      pipelineTier: project.pipelineTier || "Unknown",
      pipelineScore: project.pipelineScore || 0,
      prePumpScore: project.prePump?.score || 0,
      prePumpStatus: project.prePump?.status || "UNKNOWN",
      smartMoneyAccumulationScore: project.smartMoneyAccumulationScore || 0,
      smartWalletPerformanceScore: project.smartWalletPerformanceScore || 0,
      catalystCalendarScore: project.catalystCalendarScore || 0,
      narrativeForecastScore: project.narrativeForecastScore || 0,
      reasons: project.prePump?.reasons || [],
    })),

    alerts: safeResults.flatMap((project) =>
      (project.alerts || []).map((alert) => ({
        project: project.name || project.symbol || "Unknown",
        alert,
      }))
    ),
  };
}

export default runIntelligencePipeline;
