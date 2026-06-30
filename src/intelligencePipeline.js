// src/intelligencePipeline.js

/**
 * Crypto Launch Intelligence
 * Self-Learning Intelligence Pipeline
 *
 * Purpose:
 * Runs all active engines in the correct order so every project
 * becomes a full intelligence profile.
 */

import { analyzeRichTokenIntelligenceBatch } from "./engines/richTokenIntelligenceEngine.js";
import { analyzeInfrastructureNarrativeBatch } from "./engines/infrastructureNarrativeEngine.js";
import { analyzeMarketRankBatch } from "./engines/marketRankingEngine.js";

import { analyzeNarratives } from "./engines/narrativeEngine.js";
import { analyzeDeveloperActivityBatch } from "./engines/developerActivityEngine.js";
import { analyzeGithubBatch } from "./engines/githubQualityEngine.js";
import { analyzeCommunityGrowthBatch } from "./engines/communityGrowthEngine.js";
import { analyzeSocialAccelerationBatch } from "./engines/socialAccelerationEngine.js";
import { analyzeLiquidityBatch } from "./engines/liquidityIntelligenceEngine.js";
import { analyzeHolderGrowthBatch } from "./engines/holderGrowthEngine.js";
import { analyzeWhaleActivityBatch } from "./engines/whaleActivityEngine.js";
import { analyzeSmartWalletBatch } from "./engines/smartWalletEngine.js";
import { analyzeExchangeProbabilityBatch } from "./engines/exchangeProbabilityEngine.js";
import { analyzeCatalystsBatch } from "./engines/catalystEngine.js";
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

function calculatePipelineScore(project = {}) {
  return (
    Number(project.marketRankScore || 0) * 1.5 +
    Number(project.richTokenScore || 0) +
    Number(project.infrastructureNarrativeScore || 0) +
    Number(project.momentumShiftScore || 0) +
    Number(project.narrativeScore || 0) +
    Number(project.liquidityScore || 0) +
    Number(project.relativeStrengthScore || 0) +
    Number(project.buyPressureScore || 0)
  );
}

export function runIntelligencePipeline(projects = []) {
  let results = [...projects];

  results = analyzeRichTokenIntelligenceBatch(results);
  results = analyzeNarratives(results);
  results = analyzeInfrastructureNarrativeBatch(results);

  results = analyzeDeveloperActivityBatch(results);
  results = analyzeGithubBatch(results);
  results = analyzeCommunityGrowthBatch(results);
  results = analyzeSocialAccelerationBatch(results);
  results = analyzeLiquidityBatch(results);
  results = analyzeHolderGrowthBatch(results);
  results = analyzeWhaleActivityBatch(results);
  results = analyzeSmartWalletBatch(results);
  results = analyzeExchangeProbabilityBatch(results);
  results = analyzeCatalystsBatch(results);
  results = analyzeTokenomicsBatch(results);
  results = analyzeFundingBackersBatch(results);
  results = analyzePartnershipsBatch(results);
  results = analyzeEcosystemIntegrationBatch(results);

  results = analyzeBaselineBatch(results);
  results = analyzeVelocityBatch(results);
  results = analyzeAccelerationBatch(results);
  results = analyzeTrendChangeBatch(results);
  results = analyzeMomentumCompressionBatch(results);
  results = analyzeCapitalFlowBatch(results);
  results = analyzeBuyPressureBatch(results);
  results = analyzeSellPressureBatch(results);
  results = analyzeRelativeStrengthBatch(results);
  results = analyzeSmartMoneyRotationBatch(results);
  results = analyzeOpportunityTimingBatch(results);
  results = analyzeEarlyBreakoutBatch(results);
  results = analyzeVolatilityExpansionBatch(results);
  results = analyzeLiquidityExpansionBatch(results);
  results = analyzeMomentumShiftBatch(results);

  results = analyzeMarketRankBatch(results);

  return results
    .map(project => ({
      ...project,
      pipelineScore: calculatePipelineScore(project)
    }))
    .sort((a, b) => b.pipelineScore - a.pipelineScore);
}

export function summarizePipelineResults(results = []) {
  return {
    scannedProjects: results.length,
    topProject: results[0] || null,
    highMarketRankCount: results.filter(p => p.marketRankScore >= 70).length,
    highRichTokenCount: results.filter(p => p.richTokenScore >= 70).length,
    highMomentumCount: results.filter(p => p.momentumShiftScore >= 70).length,
    strongInfrastructureNarrativeCount: results.filter(
      p => p.infrastructureNarrativeScore >= 70
    ).length,
    strongNarrativeCount: results.filter(p => p.narrativeScore >= 70).length,
    strongLiquidityCount: results.filter(p => p.liquidityScore >= 70).length,
    alerts: results.flatMap(project =>
      (project.alerts || []).map(alert => ({
        project: project.name || project.symbol || "Unknown",
        alert
      }))
    )
  };
}
