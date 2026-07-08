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

function classifyProject(project = {}) {
  const score = num(project.pipelineScore);

  if (project.prePump?.status === "ALREADY_PUMPED") return "Already Pumped";
  if (project.prePump?.status === "LATE_CHASE") return "Late Chase";
  if (num(project.stakingRiskScore) >= 70) return "High Staking Risk";

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

  if (score >= 85 && evidenceCount >= 8) return "High";
  if (score >= 70 && evidenceCount >= 5) return "Medium";
  if (score >= 55) return "Developing";
  return "Low";
}

function addFinalScoring(projects = []) {
  const safeProjects = Array.isArray(projects)
    ? projects
    : normalizeEngineOutput(projects, []);

  return safeProjects
    .map((project) => {
      const pipelineScore = weightedInstitutionalScore(project);
      const pipelineTier = classifyProject({ ...project, pipelineScore });
      const pipelineConfidence = confidenceForProject({ ...project, pipelineScore });

      return {
        ...project,
        pipelineScore,
        opportunityScore: pipelineScore,
        score: pipelineScore,
        pipelineTier,
        tier: pipelineTier,
        pipelineConfidence,
        confidence: pipelineConfidence,
      };
    })
    .sort((a, b) => num(b.pipelineScore) - num(a.pipelineScore));
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
