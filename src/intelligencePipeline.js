// src/intelligencePipeline.js

/**
 * Crypto Launch Intelligence
 * Master Intelligence Pipeline
 *
 * Purpose:
 * Runs all active engines in the correct order so every project
 * becomes a full intelligence profile.
 */

import { analyzeRichTokenIntelligenceBatch } from "./engines/richTokenIntelligenceEngine.js";

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

export function runIntelligencePipeline(projects = []) {
  let results = [...projects];

  results = analyzeRichTokenIntelligenceBatch(results);

  results = analyzeNarratives(results);
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

  return results.sort((a, b) => {
    const scoreA =
      Number(a.richTokenScore || 0) +
      Number(a.momentumShiftScore || 0) +
      Number(a.narrativeScore || 0) +
      Number(a.liquidityScore || 0);

    const scoreB =
      Number(b.richTokenScore || 0) +
      Number(b.momentumShiftScore || 0) +
      Number(b.narrativeScore || 0) +
      Number(b.liquidityScore || 0);

    return scoreB - scoreA;
  });
}

export function summarizePipelineResults(results = []) {
  return {
    scannedProjects: results.length,
    topProject: results[0] || null,
    highRichTokenCount: results.filter(p => p.richTokenScore >= 70).length,
    highMomentumCount: results.filter(p => p.momentumShiftScore >= 70).length,
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
