src/intelligencePipeline.js

/**
 * Crypto Launch Intelligence
 * Self-Learning Intelligence Pipeline
 *
 * Production Upgrade:
 * - Safe engine execution
 * - Supports sync or async engines
 * - Accepts array output or wrapped outputs: { results }, { projects }, { data }
 * - Does not crash if one engine fails
 * - Adds institutional scoring
 * - Adds tier labels
 * - Saves scan memory safely
 * - Protects summary from non-array input
 */

import { analyzeRichTokenIntelligenceBatch } from "./engines/richTokenIntelligenceEngine.js";
import { analyzeInfrastructureNarrativeBatch } from "./engines/infrastructureNarrativeEngine.js";
import { analyzeMarketRankBatch } from "./engines/marketRankingEngine.js";

import { analyzeNarratives } from "./engines/narrativeEngine.js";
import { analyzeNarrativeForecastBatch } from "./engines/narrativeForecastEngine.js";

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

function num(value) {
  return Number(value || 0);
}

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
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
  const safeProjects = Array.isArray(projects) ? projects : normalizeEngineOutput(projects, []);

  try {
    if (typeof engine !== "function") {
      console.log(`â ï¸ Skipping ${name}: engine not found`);
      return safeProjects;
    }

    console.log(`ð§  Running ${name}...`);

    const output = await engine(safeProjects, options);
    const normalizedOutput = normalizeEngineOutput(output, safeProjects);

    if (!Array.isArray(output)) {
      console.log(`â ï¸ ${name} returned wrapped or invalid output. Normalized safely.`);
    }

    return normalizedOutput;
  } catch (error) {
    console.log(`â ${name} failed: ${error.message}`);
    return safeProjects;
  }
}

function calculatePipelineScore(project = {}) {
  const prePumpScore = num(project.prePump?.score);

  const alreadyPumped =
    project.prePump?.status === "ALREADY_PUMPED" ||
    project.prePump?.status === "LATE_CHASE";

  const baseScore =
    num(project.marketRankScore) * 1.5 +
    num(project.richTokenScore) * 1.1 +
    num(project.infrastructureNarrativeScore) * 1.15 +
    num(project.narrativeScore) +
    num(project.narrativeForecastScore) * 1.3 +
    num(project.developerScore) +
    num(project.githubScore) +
    num(project.communityScore) +
    num(project.socialAccelerationScore) +
    num(project.liquidityScore) +
    num(project.holderGrowthScore) +
    num(project.whaleScore) +
    num(project.smartWalletScore) +
    num(project.relativeStrengthScore) +
    num(project.buyPressureScore) +
    num(project.momentumShiftScore) * 1.35 +
    num(project.smartWalletPerformanceScore) * 1.25 +
    num(project.smartMoneyAccumulationScore) * 1.4 +
    num(project.exchangeProbabilityScore) * 1.1 +
    num(project.catalystScore) +
    num(project.catalystCalendarScore) * 1.2 +
    num(project.tokenomicsScore) +
    num(project.fundingBackerScore) +
    num(project.partnershipScore) +
    num(project.ecosystemIntegrationScore) +
    prePumpScore * 1.75;

  const normalizedScore = baseScore / 26;
  const penalty = alreadyPumped ? 25 : 0;

  return Math.round(clamp(normalizedScore - penalty));
}

function classifyProject(project = {}) {
  const score = num(project.pipelineScore);

  if (project.prePump?.status === "ALREADY_PUMPED") return "Already Pumped";
  if (project.prePump?.status === "LATE_CHASE") return "Late Chase";

  if (score >= 90) return "Institutional Alpha";
  if (score >= 80) return "A+ Opportunity";
  if (score >= 70) return "Strong Watchlist";
  if (score >= 60) return "Early Watchlist";
  if (score >= 45) return "Speculative";

  return "Weak";
}

function addFinalScoring(projects = []) {
  const safeProjects = Array.isArray(projects) ? projects : normalizeEngineOutput(projects, []);

  return safeProjects
    .map(project => {
      const pipelineScore = calculatePipelineScore(project);

      return {
        ...project,
        pipelineScore,
        pipelineTier: classifyProject({
          ...project,
          pipelineScore
        })
      };
    })
    .sort((a, b) => num(b.pipelineScore) - num(a.pipelineScore));
}

export async function runIntelligencePipeline(projects = [], options = {}) {
  let results = Array.isArray(projects) ? [...projects] : normalizeEngineOutput(projects, []);

  results = await runEngine("Rich Token Intelligence", analyzeRichTokenIntelligenceBatch, results);
  results = await runEngine("Narrative Intelligence", analyzeNarratives, results);
  results = await runEngine("Narrative Forecast", analyzeNarrativeForecastBatch, results);
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
      console.log(`â ï¸ Scan memory save failed: ${error.message}`);
    }
  }

  return results;
}

export function summarizePipelineResults(results = []) {
  const safeResults = Array.isArray(results)
    ? results
    : normalizeEngineOutput(results, []);

  const prePumpOpportunities = safeResults.filter(
    p =>
      num(p.prePump?.score) >= 70 &&
      p.prePump?.status !== "ALREADY_PUMPED" &&
      p.prePump?.status !== "LATE_CHASE"
  );

  return {
    scannedProjects: safeResults.length,
    topProject: safeResults[0] || null,

    institutionalAlphaCount: safeResults.filter(p => p.pipelineScore >= 90).length,
    aPlusOpportunityCount: safeResults.filter(p => p.pipelineScore >= 80).length,
    strongWatchlistCount: safeResults.filter(p => p.pipelineScore >= 70).length,

    highMarketRankCount: safeResults.filter(p => p.marketRankScore >= 70).length,
    highRichTokenCount: safeResults.filter(p => p.richTokenScore >= 70).length,
    highMomentumCount: safeResults.filter(p => p.momentumShiftScore >= 70).length,
    highPrePumpCount: prePumpOpportunities.length,

    strongSmartMoneyAccumulationCount: safeResults.filter(
      p => p.smartMoneyAccumulationScore >= 70
    ).length,

    strongSmartWalletPerformanceCount: safeResults.filter(
      p => p.smartWalletPerformanceScore >= 70
    ).length,

    strongNarrativeForecastCount: safeResults.filter(
      p => p.narrativeForecastScore >= 70
    ).length,

    strongCatalystCalendarCount: safeResults.filter(
      p => p.catalystCalendarScore >= 70
    ).length,

    alreadyPumpedCount: safeResults.filter(
      p => p.prePump?.status === "ALREADY_PUMPED"
    ).length,

    lateChaseCount: safeResults.filter(
      p => p.prePump?.status === "LATE_CHASE"
    ).length,

    bestPrePumpOpportunities: prePumpOpportunities.slice(0, 10).map(project => ({
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
      reasons: project.prePump?.reasons || []
    })),

    alerts: safeResults.flatMap(project =>
      (project.alerts || []).map(alert => ({
        project: project.name || project.symbol || "Unknown",
        alert
      }))
    )
  };
}

export default runIntelligencePipeline;
