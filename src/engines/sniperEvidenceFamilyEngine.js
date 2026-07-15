import {
  average,
  clamp,
  criticalMissingData,
  EVIDENCE_FAMILIES,
  evidenceScore,
  freshnessFromTimestamp,
  identityState,
  num,
  unique,
  weightedAverage,
} from "../sniper/sniperFramework.js";

function sourceCount(project = {}, names = []) {
  const explicit = num(project.independentSourceCount || project.sourceTruth?.independentSourceCount);
  const fromNames = unique(names.filter((name) => num(project[name]) > 0)).length;
  return Math.max(explicit, fromNames);
}

function family({
  family,
  score,
  confidence = 65,
  freshness = 1,
  sourceCount: sources = 1,
  independentSourceCount = sources,
  supportingEngines = [],
  conflictingEngines = [],
  bullishEvidence = [],
  bearishEvidence = [],
  missingEvidence = [],
  staleEvidence = [],
}) {
  return {
    family,
    familyScore: Math.round(clamp(score)),
    effectiveFamilyScore: evidenceScore(score, confidence, freshness),
    familyConfidence: Math.round(clamp(confidence)),
    freshness,
    sourceCount: sources,
    independentSourceCount,
    supportingEngines: unique(supportingEngines),
    conflictingEngines: unique(conflictingEngines),
    bullishEvidence: unique(bullishEvidence),
    bearishEvidence: unique(bearishEvidence),
    missingEvidence: unique(missingEvidence),
    staleEvidence: unique(staleEvidence),
  };
}

function missingIf(condition, label) {
  return condition ? [label] : [];
}

function liquidityDerived(project = {}) {
  const liquidityFormationScore = clamp(
    average([
      project.liquidityFormationScore,
      project.liquidityExpansionScore,
      project.activeLiquidityTruthScore,
      project.nativeDiscoveryScore,
      num(project.liquidityGrowth24h) > 0 ? clamp(50 + num(project.liquidityGrowth24h)) : 0,
      num(project.liquidityGrowth7d) > 0 ? clamp(45 + num(project.liquidityGrowth7d) * 0.6) : 0,
    ])
  );
  const slippageRisk = Math.max(num(project.estimatedSlippage1k), num(project.estimatedSlippage5k), num(project.executionTwinSlippagePct));
  const concentrationRisk = Math.max(num(project.concentratedLpPct), num(project.largestLpProviderPct), num(project.lpConcentration));
  const liquidityQualityScore = clamp(
    average([
      project.liquidityQualityScore,
      project.exitLiquidityScore,
      project.depthWithin2Pct,
      project.stablecoinLiquidityPct,
      project.lockedLiquidityPct,
      project.protocolOwnedLiquidityPct,
      liquidityFormationScore,
    ]) -
      slippageRisk * 0.8 -
      concentrationRisk * 0.35
  );
  const liquidityPersistenceScore = clamp(
    average([
      project.liquidityPersistenceScore,
      project.signalPersistenceScore,
      num(project.numberOfLiquidityAdds) >= 3 ? 75 : 0,
      num(project.numberOfLiquidityRemovals) === 0 && num(project.numberOfLiquidityAdds) > 0 ? 70 : 0,
    ])
  );
  const exitLiquidityScore = clamp(
    average([
      project.exitLiquidityScore,
      project.hardExitLiquidityUsd >= 25_000 ? 75 : 0,
      project.liquidityUsd >= 100_000 ? 70 : 0,
      liquidityQualityScore,
    ])
  );
  const liquidityManipulationRisk = clamp(
    Math.max(
      num(project.liquidityManipulationRisk),
      num(project.washTradingRiskScore),
      num(project.fakeVolumeRiskScore),
      concentrationRisk,
      num(project.numberOfLiquidityRemovals) > num(project.numberOfLiquidityAdds) ? 75 : 0,
      project.unlockedLiquidity === true ? 70 : 0
    )
  );

  return {
    liquidityFormationScore,
    liquidityQualityScore,
    liquidityPersistenceScore,
    exitLiquidityScore,
    liquidityManipulationRisk,
    liquidityConfidence: clamp(average([liquidityQualityScore, liquidityPersistenceScore, exitLiquidityScore]) - liquidityManipulationRisk * 0.25),
  };
}

function buyerDerived(project = {}) {
  const organicBuyerConfidenceScore = clamp(
    average([
      project.organicBuyerConfidenceScore,
      project.organicBuyerScore,
      project.buyerRetentionScore,
      project.buyPressurePersistence,
      project.returningBuyerPct,
      project.buyersHoldingAfter24hPct,
      project.unrelatedBuyerClusters,
      project.netNewHolderGrowth,
    ]) -
      Math.max(num(project.sameFunderBuyerPct), num(project.botBuyerPct), num(project.sybilBuyerPct)) * 0.65
  );

  return {
    organicBuyerConfidenceScore,
    sybilBuyerRisk: clamp(Math.max(num(project.sybilBuyerPct), num(project.botBuyerPct), num(project.sameFunderBuyerPct))),
  };
}

function smartWalletDerived(project = {}) {
  const insiderRisk = Math.max(num(project.insiderAccumulationRisk), num(project.insiderWalletSharePct), num(project.sameFunderConnections));
  const smartWalletAccumulationScore = clamp(
    average([
      project.smartWalletAccumulationScore,
      project.smartMoneyAccumulationScore,
      project.smartWalletPerformanceScore,
      project.smartWalletScore,
      project.smartWalletHoldRatePct,
      project.repeatabilityScore,
    ]) - insiderRisk * 0.45
  );
  const smartWalletDiversityScore = clamp(
    average([
      project.smartWalletDiversityScore,
      project.unrelatedSmartWalletCount >= 3 ? 85 : 0,
      project.unrelatedBuyerClusters,
      100 - num(project.sameFunderConnections),
    ])
  );
  const smartWalletHistoricalEdge = clamp(
    average([
      project.smartWalletHistoricalEdge,
      project.smartWalletPerformanceScore,
      project.profitableTradePct,
      project.profitableLaunchPct,
      project.repeatabilityScore,
    ])
  );

  return {
    smartWalletAccumulationScore,
    smartWalletDiversityScore,
    smartWalletHistoricalEdge,
    insiderAccumulationRisk: clamp(insiderRisk),
    insiderDistributionRisk: clamp(Math.max(num(project.insiderDistributionRisk), num(project.teamSellingRiskScore), num(project.sellPressureScore))),
    walletSignalConfidence: clamp(average([smartWalletAccumulationScore, smartWalletDiversityScore, smartWalletHistoricalEdge]) - insiderRisk * 0.25),
  };
}

function developerDerived(project = {}) {
  const developerAccelerationScore = clamp(
    average([
      project.developerAccelerationScore,
      project.developerActivityScore,
      project.githubProScore,
      project.githubVelocityScore,
      project.releaseAcceleration,
      project.activeContributors,
    ])
  );
  const developerQualityScore = clamp(
    average([
      project.developerQualityScore,
      project.commitQualityScore,
      project.originalCodeRatio,
      project.pullRequestMergeRate,
      project.issueResolutionRate,
      project.testCoverageChange,
    ]) - num(project.forkSimilarityScore) * 0.35
  );
  const productDeliveryScore = clamp(
    average([
      project.productDeliveryScore,
      project.sdkDevelopment,
      project.apiDevelopment,
      project.contractDeployments,
      project.auditFixes,
      project.mainnetPreparation,
      project.releaseCount,
    ])
  );
  const spamRisk = Math.max(num(project.commitSpamRisk), num(project.generatedCommitRisk), project.documentationOnlyActivity ? 70 : 0);

  return {
    developerAccelerationScore,
    productDeliveryScore,
    developerQualityScore,
    developmentAuthenticityScore: clamp(average([developerAccelerationScore, developerQualityScore, productDeliveryScore]) - spamRisk * 0.45),
    developerSignalConfidence: clamp(average([developerAccelerationScore, developerQualityScore]) - spamRisk * 0.35),
  };
}

function adoptionDerived(project = {}) {
  const realAdoptionScore = clamp(
    average([
      project.realAdoptionScore,
      project.adoptionAccelerationScore,
      project.userQualityScore,
      project.retentionScore,
      project.buyerRetentionScore,
      project.uniqueActiveWallets,
      project.returningUsers,
      project.integrationCount,
      project.apiUsage,
    ]) - Math.max(num(project.incentiveDependenceRisk), num(project.sybilRiskScore), num(project.washTradingRiskScore)) * 0.4
  );

  return {
    realAdoptionScore,
    adoptionAccelerationScore: clamp(average([project.adoptionAccelerationScore, realAdoptionScore])),
    userQualityScore: clamp(average([project.userQualityScore, project.userRetention7d, project.returningUsers, project.buyerRetentionScore])),
    retentionScore: clamp(average([project.retentionScore, project.userRetention1d, project.userRetention7d, project.userRetention30d])),
    revenueQualityScore: clamp(average([project.revenueQualityScore, project.protocolFees, project.protocolRevenue, project.protocolRevenueGrowthPct])),
    incentiveDependenceRisk: clamp(Math.max(num(project.incentiveDependenceRisk), num(project.airdropFarmerPct), num(project.rewardDrivenActivityPct))),
  };
}

function narrativeDerived(project = {}) {
  const socialRisk = Math.max(num(project.influencerConcentration), num(project.paidPromotionProbability), num(project.socialAccelerationScore) > 80 && num(project.priceChange7d) > 80 ? 65 : 0);
  const narrativeEmergenceScore = clamp(
    average([
      project.narrativeEmergenceScore,
      project.narrativeHeatScore,
      project.narrativeForecastScore,
      project.developerMentions,
      project.researchMentions,
      project.grantActivity,
      project.hackathonActivity,
      project.integrationsInCategory,
    ]) - socialRisk * 0.3
  );

  return {
    narrativeEmergenceScore,
    narrativeSaturationScore: clamp(Math.max(num(project.narrativeSaturationScore), num(project.narrativeSaturation), socialRisk)),
    narrativeAuthenticityScore: clamp(average([narrativeEmergenceScore, project.narrativePersistence, project.researchMentions]) - socialRisk * 0.45),
    narrativeTimingScore: clamp(project.informationAdvantageScore || (100 - Math.max(num(project.marketAwarenessScore), num(project.xSocialScore)))),
    narrativeConfidence: clamp(average([narrativeEmergenceScore, project.sourceTruthScore, project.sourceReliabilityScore]) - socialRisk * 0.25),
  };
}

function catalystDerived(project = {}) {
  const catalysts = project.catalystTimeline || project.liveCatalystEvents || project.catalysts || [];
  const verified = catalysts.filter((item) =>
    ["High", "Verified", "Official"].includes(item.sourceConfidence || item.dateConfidence || item.confidence)
  ).length;
  const rumor = catalysts.filter((item) => String(item.sourceConfidence || item.sourceType || "").toLowerCase().includes("rumor")).length;
  const catalystQualityScore = clamp(
    average([
      project.catalystQualityScore,
      project.liveCatalystRadarScore,
      project.catalystCalendarScore,
      project.catalystScore,
      verified ? 75 + verified * 5 : 0,
    ]) - rumor * 20 - num(project.catalystFailureRisk) * 0.4 - num(project.alreadyPricedInScore) * 0.35
  );

  return {
    catalystQualityScore,
    catalystFailureRisk: clamp(Math.max(num(project.catalystFailureRisk), rumor ? 55 : 0)),
    verifiedCatalystCount: verified,
  };
}

function tokenValueDerived(project = {}) {
  const valueCaptureScore = clamp(
    average([
      project.valueCaptureScore,
      project.tokenValueCaptureScore,
      project.tokenomicsScore,
      project.tokenReceivesRevenue ? 75 : 0,
      project.tokenReceivesBuybacks ? 70 : 0,
      project.tokenBurnMechanism ? 60 : 0,
      project.tokenRequiredForFees ? 65 : 0,
      project.tokenRequiredForSecurity ? 65 : 0,
    ]) -
      Math.max(num(project.tokenUnlockRiskScore), num(project.vestingPressureScore), num(project.insiderUnlockExposure)) * 0.4 -
      (num(project.fdv) > 0 && num(project.marketCap) > 0 && num(project.fdv) / Math.max(num(project.marketCap), 1) > 12 ? 18 : 0)
  );

  return {
    valueCaptureScore,
    tokenUtilityConfidence: clamp(average([project.tokenUtilityConfidence, valueCaptureScore, project.sourceTruthScore])),
  };
}

export function buildSniperEvidenceFamilies(project = {}) {
  const liquidity = liquidityDerived(project);
  const buyers = buyerDerived(project);
  const wallets = smartWalletDerived(project);
  const developers = developerDerived(project);
  const adoption = adoptionDerived(project);
  const narrative = narrativeDerived(project);
  const catalysts = catalystDerived(project);
  const tokenValue = tokenValueDerived(project);
  const missingCriticalData = criticalMissingData(project);
  const freshness = freshnessFromTimestamp(project.sourceTimestamp || project.marketDataTimestamp || project.observationTimestamp || project.scanTimestamp);
  const idState = identityState(project);
  const manipulationRisk = Math.max(
    num(project.washTradingRiskScore),
    num(project.botClusterRiskScore),
    num(project.sybilRiskScore),
    num(project.fakeVolumeRiskScore),
    num(project.bundledLaunchRiskScore),
    wallets.insiderDistributionRisk
  );

  const families = {
    IDENTITY: family({
      family: "IDENTITY",
      score: ["VERIFIED_CONTRACT", "VERIFIED_EXCHANGE_ASSET", "VERIFIED_PRELAUNCH_PROJECT"].includes(idState) ? 90 : idState === "PROBABLE_MATCH" ? 60 : 20,
      confidence: average([project.finalIntegrityScore, project.identityResolutionScore, project.sourceTruthScore]) || 60,
      freshness,
      sourceCount: sourceCount(project, ["contractAddress", "coinGeckoId", "exchangeAssetId", "officialWebsite", "githubOrg"]),
      supportingEngines: ["projectIdentityGraph", "finalSelectionIntegrity", "sourceTruth"],
      bearishEvidence: ["CONFLICTED_IDENTITY", "IMPERSONATION_RISK", "SYMBOL_ONLY", "UNRESOLVED"].includes(idState) ? [`Identity state: ${idState}`] : [],
      missingEvidence: missingIf(missingCriticalData.includes("identity"), "Verified identity"),
    }),
    CONTRACT_SAFETY: family({
      family: "CONTRACT_SAFETY",
      score: clamp(100 - Math.max(num(project.honeypotRiskScore), num(project.contractRiskScore), project.honeypotDetected ? 100 : 0)),
      confidence: project.contractVerified || project.contractSafetyPassed ? 80 : 55,
      freshness,
      supportingEngines: ["instantSafetyGate", "organicDemandIntegrity", "finalSelectionIntegrity"],
      bearishEvidence: project.honeypotDetected ? ["Honeypot detected"] : [],
      missingEvidence: missingIf(missingCriticalData.includes("contractSafety"), "Contract safety proof"),
    }),
    LIQUIDITY: family({
      family: "LIQUIDITY",
      score: average([liquidity.liquidityFormationScore, liquidity.liquidityQualityScore, liquidity.liquidityPersistenceScore, liquidity.exitLiquidityScore]),
      confidence: liquidity.liquidityConfidence,
      freshness,
      independentSourceCount: sourceCount(project, ["liquidityUsd", "hardExitLiquidityUsd", "activeLiquidityTruthScore", "nativeDiscoveryScore"]),
      supportingEngines: ["liquidityExpansion", "activeLiquidityTruth", "nativeDiscoveryMesh"],
      bearishEvidence: liquidity.liquidityManipulationRisk >= 60 ? ["Liquidity manipulation risk"] : [],
      missingEvidence: missingIf(missingCriticalData.includes("liquidity"), "Verified liquidity"),
    }),
    ORGANIC_BUYERS: family({
      family: "ORGANIC_BUYERS",
      score: buyers.organicBuyerConfidenceScore,
      confidence: clamp(average([buyers.organicBuyerConfidenceScore, project.buyerRetentionScore, project.organicDemandScore])),
      freshness,
      supportingEngines: ["organicBuyerClassifier", "buyerRetention", "organicDemandIntegrity"],
      bearishEvidence: buyers.sybilBuyerRisk >= 55 ? ["Sybil or same-funder buyer risk"] : [],
    }),
    SMART_WALLETS: family({
      family: "SMART_WALLETS",
      score: average([wallets.smartWalletAccumulationScore, wallets.smartWalletDiversityScore, wallets.smartWalletHistoricalEdge]),
      confidence: wallets.walletSignalConfidence,
      freshness,
      supportingEngines: ["smartWallet", "smartMoneyAccumulation", "smartWalletPerformance"],
      bearishEvidence: wallets.insiderAccumulationRisk >= 55 ? ["Wallet activity may be insider/related"] : [],
    }),
    HOLDER_DISTRIBUTION: family({
      family: "HOLDER_DISTRIBUTION",
      score: clamp(average([project.holderDistributionScore, project.holderGrowthScore, project.holderRetention, project.distributionImprovementRate, 100 - num(project.top10HolderPct)])),
      confidence: project.circulatingSupplyConfidence || project.supplyDataConfidence || 55,
      freshness,
      supportingEngines: ["holderGrowth", "walletCluster"],
      bearishEvidence: num(project.top10HolderPct) >= 65 || num(project.deployerHoldingPct) >= 20 ? ["Concentrated or deployer-heavy supply"] : [],
      missingEvidence: missingIf(missingCriticalData.includes("holderDistribution"), "Holder distribution"),
    }),
    DEVELOPMENT: family({
      family: "DEVELOPMENT",
      score: average([developers.developerAccelerationScore, developers.developerQualityScore, developers.developmentAuthenticityScore]),
      confidence: developers.developerSignalConfidence,
      freshness,
      supportingEngines: ["developerActivity", "githubQuality", "githubIntelligencePro"],
      bearishEvidence: developers.developmentAuthenticityScore < 35 && developers.developerAccelerationScore > 0 ? ["Developer activity quality is weak"] : [],
    }),
    PRODUCT_DELIVERY: family({
      family: "PRODUCT_DELIVERY",
      score: developers.productDeliveryScore,
      confidence: clamp(average([developers.productDeliveryScore, developers.developmentAuthenticityScore, project.sourceTruthScore])),
      freshness,
      supportingEngines: ["roadmapCatalystProfit", "liveCatalystRadar", "githubIntelligencePro"],
    }),
    ADOPTION: family({
      family: "ADOPTION",
      score: average([adoption.realAdoptionScore, adoption.userQualityScore, adoption.retentionScore]),
      confidence: clamp(average([adoption.realAdoptionScore, adoption.userQualityScore, project.organicDemandScore])),
      freshness,
      supportingEngines: ["organicDemandIntegrity", "buyerRetention", "ecosystemIntegration"],
      bearishEvidence: adoption.incentiveDependenceRisk >= 60 ? ["Usage appears incentive-dependent"] : [],
    }),
    REVENUE: family({
      family: "REVENUE",
      score: adoption.revenueQualityScore,
      confidence: clamp(average([adoption.revenueQualityScore, project.sourceTruthScore])),
      freshness,
      supportingEngines: ["organicDemandIntegrity", "tokenomics", "ecosystemIntegration"],
    }),
    NARRATIVE: family({
      family: "NARRATIVE",
      score: average([narrative.narrativeEmergenceScore, narrative.narrativeAuthenticityScore, narrative.narrativeTimingScore]),
      confidence: narrative.narrativeConfidence,
      freshness,
      supportingEngines: ["narrativeHeatIndex", "narrativeForecast", "infrastructureNarrative"],
      bearishEvidence: narrative.narrativeSaturationScore >= 70 ? ["Narrative saturation or manufactured attention risk"] : [],
    }),
    CATALYSTS: family({
      family: "CATALYSTS",
      score: catalysts.catalystQualityScore,
      confidence: clamp(average([catalysts.catalystQualityScore, project.sourceTruthScore, project.sourceReliabilityScore])),
      freshness,
      supportingEngines: ["liveCatalystRadar", "catalystCalendar", "roadmapCatalystProfit"],
      bearishEvidence: catalysts.catalystFailureRisk >= 55 ? ["Catalyst failure or rumor risk"] : [],
    }),
    TOKENOMICS: family({
      family: "TOKENOMICS",
      score: tokenValue.valueCaptureScore,
      confidence: tokenValue.tokenUtilityConfidence,
      freshness,
      supportingEngines: ["tokenomics", "vestingPressure", "narrativeLaunchStaking"],
      bearishEvidence: num(project.tokenUnlockRiskScore) >= 70 ? ["Critical unlock pressure"] : [],
      missingEvidence: missingIf(missingCriticalData.includes("supplyData"), "Supply data"),
    }),
    MARKET_STRUCTURE: family({
      family: "MARKET_STRUCTURE",
      score: clamp(average([project.preBreakoutMomentumScore, project.relativeStrengthScore, project.volatilityCompressionScore, project.sellAbsorption, 100 - Math.max(num(project.preBreakoutChasePenalty), num(project.sellPressureScore))])),
      confidence: project.preBreakoutMomentumStage ? 70 : 55,
      freshness,
      supportingEngines: ["preBreakoutMomentum", "relativeStrength", "momentumCompression"],
      bearishEvidence: ["ALREADY_PUMPED", "LATE_CHASE", "DISTRIBUTION"].includes(project.preBreakoutMomentumStage) ? [`Price structure: ${project.preBreakoutMomentumStage}`] : [],
    }),
    MARKET_REGIME: family({
      family: "MARKET_REGIME",
      score: project.regimeCompatibilityScore || project.marketRegimeScore || 55,
      confidence: project.regimeConfidence || 60,
      freshness,
      supportingEngines: ["preConsensusBreakoutHunter", "worldModelBrain", "causalMarketTwin"],
    }),
    MANIPULATION_RISK: family({
      family: "MANIPULATION_RISK",
      score: clamp(100 - manipulationRisk),
      confidence: clamp(average([project.antiManipulationConfidenceScore, project.organicIntegrityScore, 100 - manipulationRisk])),
      freshness,
      supportingEngines: ["washTrading", "walletCluster", "bundledLaunch", "organicDemandIntegrity"],
      bearishEvidence: manipulationRisk >= 55 ? ["Manipulation risk is elevated"] : [],
    }),
  };

  const familyList = EVIDENCE_FAMILIES.map((name) => families[name]);
  const leadingFamilies = ["LIQUIDITY", "ORGANIC_BUYERS", "SMART_WALLETS", "DEVELOPMENT", "PRODUCT_DELIVERY", "ADOPTION", "REVENUE", "CATALYSTS"];
  const onChainFamilies = ["CONTRACT_SAFETY", "LIQUIDITY", "ORGANIC_BUYERS", "SMART_WALLETS", "HOLDER_DISTRIBUTION", "ADOPTION"];
  const productFamilies = ["DEVELOPMENT", "PRODUCT_DELIVERY", "ADOPTION", "REVENUE"];
  const independentLeadingFamiliesAtOrAbove70 = familyList.filter(
    (item) => leadingFamilies.includes(item.family) && item.familyScore >= 70 && item.familyConfidence >= 60
  );
  const totalFamiliesAtOrAbove55 = familyList.filter((item) => item.familyScore >= 55 && item.familyConfidence >= 50);
  const evidenceConfidence = Math.round(
    clamp(
      average(familyList.map((item) => item.familyConfidence)) -
        missingCriticalData.length * 4 -
        familyList.filter((item) => item.bearishEvidence.length).length * 1.5
    )
  );
  const dataFreshness = Math.round(clamp(average(familyList.map((item) => item.freshness * 100))));
  const sourceAgreement = Math.round(
    clamp(100 - familyList.filter((item) => item.conflictingEngines.length || item.bearishEvidence.length).length * 5)
  );
  const fundamentalAccelerationScore = average([
    developers.developerAccelerationScore,
    developers.productDeliveryScore,
    adoption.realAdoptionScore,
    adoption.revenueQualityScore,
    liquidity.liquidityFormationScore,
    buyers.organicBuyerConfidenceScore,
    wallets.smartWalletAccumulationScore,
  ]);
  const priceRecognitionScore = clamp(average([project.priceRecognitionScore, Math.max(num(project.priceChange24h), num(project.priceChange7d))]));
  const socialRecognitionScore = clamp(average([project.socialRecognitionScore, project.xSocialScore, project.socialAccelerationScore]));
  const exchangeRecognitionScore = clamp(average([project.exchangeRecognitionScore, project.exchangeProbabilityScore, project.majorExchangeListed ? 90 : 0]));
  const preConsensusGapScore = clamp(
    fundamentalAccelerationScore +
      liquidity.liquidityFormationScore * 0.18 +
      wallets.smartWalletAccumulationScore * 0.14 +
      catalysts.catalystQualityScore * 0.08 -
      priceRecognitionScore * 0.32 -
      socialRecognitionScore * 0.24 -
      narrative.narrativeSaturationScore * 0.18
  );

  return {
    families,
    familyList,
    derived: {
      ...liquidity,
      ...buyers,
      ...wallets,
      ...developers,
      ...adoption,
      ...narrative,
      ...catalysts,
      ...tokenValue,
      fundamentalAccelerationScore,
      priceRecognitionScore,
      socialRecognitionScore,
      exchangeRecognitionScore,
      preConsensusGapScore,
      preConsensusGapConfidence: clamp(average([evidenceConfidence, dataFreshness, sourceAgreement])),
    },
    summary: {
      independentLeadingFamiliesAtOrAbove70: independentLeadingFamiliesAtOrAbove70.map((item) => item.family),
      totalFamiliesAtOrAbove55: totalFamiliesAtOrAbove55.map((item) => item.family),
      onChainConfirmingFamilies: familyList.filter((item) => onChainFamilies.includes(item.family) && item.familyScore >= 55).map((item) => item.family),
      productConfirmingFamilies: familyList.filter((item) => productFamilies.includes(item.family) && item.familyScore >= 55).map((item) => item.family),
      evidenceConfidence,
      dataFreshness,
      sourceAgreement,
      missingCriticalData,
    },
  };
}

export function analyzeSniperEvidenceFamilies(project = {}) {
  const model = buildSniperEvidenceFamilies(project);

  return {
    ...project,
    ...model.derived,
    sniperEvidenceFamilies: model.families,
    sniperEvidenceFamilyList: model.familyList,
    sniperEvidenceFamilySummary: model.summary,
    sniperEvidenceConfidence: model.summary.evidenceConfidence,
    sniperDataFreshness: model.summary.dataFreshness,
    sniperSourceAgreement: model.summary.sourceAgreement,
    sniperMissingCriticalData: model.summary.missingCriticalData,
  };
}

export function analyzeSniperEvidenceFamiliesBatch(projects = []) {
  return (Array.isArray(projects) ? projects : []).map(analyzeSniperEvidenceFamilies);
}
