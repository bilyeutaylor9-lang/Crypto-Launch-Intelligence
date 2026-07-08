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

import { prePumpDetectionEngine } from "./engines/prePumpDetectionEngine.js";

import { saveScanMemory } from "./learning/scanMemoryStore.js";

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
    { score: project.launchReadinessScore, weight: 0.7 },
    { score: project.stakingMomentumScore, weight: 0.7 },
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
    risk: weightedAverage([
      { score: project.riskScore, weight: 1.2 },
      { score: project.sellPressureScore, weight: 0.9 },
      { score: project.stakingRiskScore, weight: 0.8 },
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
  if (num(project.prePump?.score) >= 70) tags.push("Pre-Pump Candidate");
  if (num(project.narrativeLaunchStakingScore) >= 70) tags.push("Launch/Staking Setup");

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
  if (num(project.prePump?.score) >= 70 && profile.risk < 55) bonus += 4;

  if (profile.risk >= 85) penalty += 18;
  else if (profile.risk >= 70) penalty += 10;
  else if (profile.risk >= 55) penalty += 4;
  if (project.prePump?.status === "ALREADY_PUMPED") penalty += 16;
  if (project.prePump?.status === "LATE_CHASE") penalty += 10;
  if (num(project.sellPressureScore) >= 85) penalty += 8;
  if (num(project.stakingRiskScore) >= 70) penalty += 8;

  const signalDensityScore = clamp(profile.activeClusterCount * 12 + profile.eliteClusterCount * 8);
  const riskAdjustedScore = Math.round(clamp(baseScore + bonus - penalty));
  const signalGrades = buildSignalGrades(profile);
  const conviction = convictionLevel(riskAdjustedScore, signalDensityScore, risks);
  const executionPlan = buildExecutionPlan(riskAdjustedScore, conviction, risks);
  const thesis = buildOpportunityThesis(project, profile, tags, risks);

  return {
    baseScore,
    bonus,
    penalty,
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

  if (score >= 85 && density >= 65 && evidenceCount >= 8 && riskFlags <= 1) return "High";
  if (score >= 70 && density >= 45 && evidenceCount >= 5) return "Medium";
  if (score >= 55 || density >= 35) return "Developing";
  return "Low";
}

function addFinalScoring(projects = []) {
  const safeProjects = Array.isArray(projects)
    ? projects
    : normalizeEngineOutput(projects, []);

  const scoredProjects = safeProjects
    .map((project) => {
      const breakdown = advancedScoreBreakdown(project);
      const pipelineScore = breakdown.riskAdjustedScore;
      const enrichedProject = {
        ...project,
        ...breakdown,
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

  const total = scoredProjects.length;

  return scoredProjects.map((project, index) => ({
    ...project,
    pipelineRank: index + 1,
    pipelinePercentile:
      total <= 1 ? 100 : Math.round(((total - index) / total) * 100),
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

  results = addFinalScoring(results);

  if (options.saveMemory !== false) {
    try {
      await saveScanMemory(results);
    } catch (error) {
      console.log(`Scan memory save failed: ${error.message}`);
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

  return {
    scannedProjects: safeResults.length,
    topProject: safeResults[0] || null,

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
