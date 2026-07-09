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
import { analyzeConfidenceAdjustedRankBatch } from "./engines/confidenceAdjustedRankEngine.js";
import { analyzeAIEcosystemCouncilBatch } from "./engines/aiEcosystemCouncilEngine.js";
import { analyzeResearchOperatingSystemBatch } from "./engines/researchOperatingSystemEngine.js";
import { analyzeAutonomousAlphaLabBatch } from "./engines/autonomousAlphaLabEngine.js";
import { analyzeQuantumReasoningBrainBatch } from "./engines/quantumReasoningBrainEngine.js";
import { analyzeWorldModelBrainBatch } from "./engines/worldModelBrainEngine.js";
import { analyzeAutonomousMarketScientistBatch } from "./engines/autonomousMarketScientistEngine.js";
import { analyzeSelfTrainingMarketSimulationBrainBatch } from "./engines/selfTrainingMarketSimulationBrainEngine.js";
import { analyzeAutonomousOutcomeJudgeBatch } from "./engines/autonomousOutcomeJudgeEngine.js";
import { analyzeProjectDossierSwarmBatch } from "./engines/projectDossierSwarmEngine.js";

import { prePumpDetectionEngine } from "./engines/prePumpDetectionEngine.js";

import { saveScanMemory } from "./learning/scanMemoryStore.js";
import { saveProjectWatchlist } from "./learning/projectWatchlistStore.js";
import { saveOutcomeSnapshots } from "./learning/outcomeSnapshotStore.js";
import { saveInternetResearchMemory } from "./learning/internetResearchMemoryStore.js";
import { saveAgentCouncilMemory } from "./learning/agentPerformanceMemoryStore.js";

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

async function runEngine(name, engine, projects, options = {}) {
  const safeProjects = Array.isArray(projects)
    ? projects
    : normalizeEngineOutput(projects, []);

  try {
    if (typeof engine !== "function") {
      console.log(`Skipping ${name}: engine not found`);
      return safeProjects;
    }

    console.log(`Running ${name}...`);

    const output = await engine(safeProjects, options);
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
  results = await runEngine("External Intelligence", analyzeExternalIntelligenceBatch, results, options.externalIntelligence || {});
  results = await runEngine("Web Research Agent", analyzeWebResearchAgentBatch, results, options.webResearchAgent || {});
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

  results = addFinalScoring(results);
  results = analyzeProjectChangeBatch(results);
  results = analyzeOpportunityProofBatch(results);
  results = analyzeTrapRiskBatch(results);
  results = analyzeConfidenceAdjustedRankBatch(results);
  results = analyzeAIEcosystemCouncilBatch(results);
  results = analyzeResearchOperatingSystemBatch(results);
  results = analyzeAutonomousAlphaLabBatch(results);
  results = analyzeQuantumReasoningBrainBatch(results);
  results = analyzeWorldModelBrainBatch(results);
  results = analyzeAutonomousMarketScientistBatch(results);
  results = analyzeSelfTrainingMarketSimulationBrainBatch(results);
  results = analyzeAutonomousOutcomeJudgeBatch(results, options.outcomeJudge || {});
  results = analyzeProjectDossierSwarmBatch(results, options.dossierSwarm || {});

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
