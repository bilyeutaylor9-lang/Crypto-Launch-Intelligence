import test from "node:test";
import assert from "node:assert/strict";

import {
  analyzeEvidenceCalibratedKernel,
  analyzeEvidenceCalibratedProject,
  auditProjectContracts,
  buildAdvancedBrainKernel,
  buildEvidenceLedger,
  buildSourceHealthKernel,
  runKernelFixtureAudit,
} from "../src/kernel/evidenceCalibratedKernel.js";
import { getEngineContracts } from "../src/kernel/engineContractManifest.js";
import {
  buildInstitutionalDataProvenanceLedger,
  summarizeInstitutionalDataProvenance,
} from "../src/kernel/institutionalDataProvenanceLedger.js";

const FIXTURE_NOW = new Date().toISOString();

function strongProject() {
  const contractAddress = "0x1111111111111111111111111111111111111111";
  const pairAddress = "0x2222222222222222222222222222222222222222";
  const evidence = getEngineContracts().map((contract) => ({
    engine: contract.id,
    source: contract.id,
    family: contract.phase,
    signal: `${contract.id} contract evidence`,
    score: 82,
    confidence: 0.82,
  }));

  return {
    name: "Kernel Alpha",
    symbol: "KALPHA",
    chain: "base",
    address: contractAddress,
    tokenAddress: contractAddress,
    contractAddress,
    pairAddress,
    poolAddress: pairAddress,
    source: "dexscreener",
    dex: "Uniswap",
    discoverySources: ["dexscreener", "github", "coingecko", "base-rpc"],
    discoveredAt: FIXTURE_NOW,
    quoteTimestamp: FIXTURE_NOW,
    projectIdentity: { score: 88, evidence: ["address", "github", "domain"] },
    projectIdentityVerdict: "Identity Resolved",
    identityResolutionScore: 88,
    identityRiskScore: 5,
    sourceTruthScore: 84,
    sourceTruthVerdict: "Verified Source Stack",
    sourceTruth: { sources: [{ source: "dexscreener" }, { source: "github" }, { source: "coingecko" }] },
    sourceReliabilityScore: 82,
    sourceReliability: { score: 82, sources: [{ source: "dexscreener", score: 84 }] },
    richTokenScore: 83,
    richTokenLevel: "institutional watch",
    richTokenIntelligence: { isLiquidEnough: true, isBuyDominant: true, hasTokenAddress: true, hasPairAddress: true },
    richTokenReasons: ["Token has verified liquidity, route identity, and buyer demand."],
    liquidityUsd: 900000,
    dexLiquidityUsd: 900000,
    stableExitLiquidityUsd: 860000,
    previousLiquidityUsd: 620000,
    volume24h: 180000,
    volume24hUsd: 180000,
    priceUsd: 0.12,
    priceChange24h: 8,
    priceChange24hPct: 8,
    priceChange7dPct: 18,
    marketCap: 42000000,
    circulatingMarketCapUsd: 42000000,
    fdv: 52000000,
    circulatingSupply: 420000000,
    totalSupply: 520000000,
    valuationSources: [
      { source: "dexscreener", type: "marketCap", value: 42000000 },
      { source: "coingecko", type: "marketCap", value: 43000000 },
      { source: "geckoterminal", type: "fdv", value: 52000000 },
    ],
    activeLiquidityTruthScore: 82,
    activeLiquidityTruthVerdict: "Usable Exit Liquidity Confirmed",
    organicBuyerScore: 78,
    organicBuyerVerdict: "First Real Buyers Confirmed",
    buyerBreadthAccelerationScore: 82,
    buyPressureScore: 80,
    buyTransactions24h: 320,
    sellTransactions24h: 180,
    uniqueBuyers24h: 240,
    sameBlockBuys: 0,
    bundledTxCount: 0,
    sniperBuyers24h: 4,
    buyVolumeUsd: 112000,
    sellVolumeUsd: 68000,
    buyerRetentionScore: 72,
    holderGrowthScore: 70,
    walletClusterScore: 74,
    walletClusterRiskScore: 10,
    walletClusterVerdict: "Clean Wallet Cluster",
    smartWalletScore: 74,
    smartWalletArrivalScore: 72,
    smartMoneyAccumulationScore: 76,
    instantSafetyStatus: "PASS",
    instantSafetyScore: 90,
    instantSafetyRiskScore: 4,
    securityEvidenceSummary: {
      status: "EVIDENCE_AVAILABLE",
      providers: ["goplus", "sourcify-v2", "blockscout"],
      knownProviders: ["goplus", "sourcify-v2", "blockscout"],
      verifiedSource: true,
      malicious: false,
      honeypot: false,
      proxy: false,
      ownerRisk: false,
      mintRisk: false,
      freezeRisk: false,
      blacklistRisk: false,
      highTaxRisk: false,
      confidence: 86,
      riskFindings: [],
      warnings: [],
    },
    securityEvidence: [
      {
        provider: "goplus",
        status: "EVIDENCE_AVAILABLE",
        verifiedSource: true,
        riskFindings: [],
        warnings: [],
        confidence: 86,
      },
    ],
    contractAuthorityRiskScore: 6,
    contractAuthoritySafetyScore: 94,
    contractAuthorityVerdict: "CONTRACT_EVIDENCE_CLEAN",
    contractSafetyVerified: true,
    deployer: "0x3333333333333333333333333333333333333333",
    deployerHistory: {
      priorDeployments: 4,
      priorRugs: 0,
      successfulLaunches: 3,
      walletAgeDays: 620,
    },
    deployerReputationScore: 82,
    deployerRiskScore: 8,
    deployerReputationVerdict: "Constructive Deployer History",
    bundledLaunchRiskScore: 4,
    bundledLaunchScore: 82,
    bundledLaunchVerdict: "No Dominant Bundle",
    bundledLaunch: { sameBlockBuys: 0, bundledTxCount: 0, totalBuyers: 240, bundleSharePct: 1.67 },
    washTradingRiskScore: 6,
    washTradingScore: 86,
    washTradingVerdict: "No Dominant Wash Pattern",
    washTrading: { buyVolumeUsd: 112000, sellVolumeUsd: 68000, roundTripRatio: 0.607 },
    liquidityControlRiskScore: 8,
    liquidityControlRisk: 8,
    liquidityControlSafetyScore: 92,
    liquidityControlVerdict: "LIQUIDITY_CONTROL_ACCEPTABLE",
    liquidityControlEvidenceVerified: true,
    lpLockedPct: 82,
    lpBurnedPct: 0,
    ownerLpSharePct: 2,
    organicDemandFirewallStatus: "PASS",
    organicDemandFirewallScore: 84,
    organicDemandVerdict: "Organic Demand Confirmed",
    organicEconomicIntegrityScore: 82,
    economicIntegrityRiskScore: 8,
    githubRepo: "kernel/alpha",
    github: "https://github.com/kernel/alpha",
    repository: "kernel/alpha",
    commits30d: 74,
    contributors: 8,
    releases: 2,
    githubQualityScore: 80,
    githubProScore: 76,
    githubProVerdict: "Healthy Builder Signal",
    developerActivityScore: 75,
    developerScore: 75,
    developerActivity: "active",
    velocity: {
      volumeVelocity: 42,
      liquidityVelocity: 34,
      holderVelocity: 26,
      followerVelocity: 18,
      developerVelocity: 22,
      smartWalletVelocity: 24,
    },
    previousVolumeVelocity: 14,
    previousLiquidityVelocity: 12,
    previousHolderVelocity: 9,
    previousFollowerVelocity: 7,
    previousDeveloperVelocity: 8,
    previousSmartWalletVelocity: 6,
    acceleration: {
      volumeAcceleration: 28,
      liquidityAcceleration: 22,
      holderAcceleration: 17,
      followerAcceleration: 11,
      developerAcceleration: 14,
      smartWalletAcceleration: 18,
    },
    accelerationScore: 84,
    accelerationLevel: "strong acceleration",
    liquidityExpansion: {
      currentLiquidity: 900000,
      previousLiquidity: 620000,
      expansionRate: 45,
    },
    liquidityExpansionScore: 86,
    liquidityExpansionLevel: "strong liquidity",
    liquidityFormationScore: 84,
    liquidityFormationState: "ORGANIC_LIQUIDITY_FORMATION",
    momentumShiftScore: 82,
    momentumShiftLevel: "confirmed momentum shift",
    volumeAcceleration: 76,
    developerAccelerationV2Score: 78,
    developerAccelerationV2Status: "REAL_DEVELOPMENT_ACCELERATION",
    socialAccelerationScore: 44,
    quietAccumulationDetected: true,
    quietAccumulationScore: 78,
    quietAccumulation: { detected: true, score: 78, strength: "Strong" },
    preBreakoutMomentumScore: 76,
    preBreakoutMomentumStage: "BREAKOUT_STARTING",
    preBreakoutMomentum: { score: 76, stage: "BREAKOUT_STARTING" },
    informationAdvantageScore: 74,
    estimatedConsensusStage: "SMART_MONEY_EARLY",
    informationAdvantage: { score: 74, stage: "SMART_MONEY_EARLY" },
    smartWalletNoveltyScore: 76,
    smartWalletNoveltyStatus: "MEASURED_UNRELATED_SMART_WALLETS",
    smartWalletNovelty: { qualifiedWalletCount: 4, unrelatedFundingClusterCount: 4 },
    buyerBreadthStatus: "BROAD_BUYER_ACCELERATION",
    walletFlowLane: "BROAD_ACCUMULATION_FLOW",
    walletFlowScore: 78,
    attentionGapV2Score: 73,
    attentionGapV2State: "PROGRESS_EXCEEDS_ATTENTION",
    attentionGapV2Coverage: {
      observedComponentCount: 10,
      expectedComponentCount: 10,
      coveragePct: 100,
      observedValues: {},
      missingValues: [],
      sourceFamilies: ["development", "buyers", "liquidity", "attention"],
    },
    preBreakoutSequenceScore: 84,
    preBreakoutTimingState: "PRE_BREAKOUT",
    timingState: "PRE_BREAKOUT",
    earlyAsymmetryResearchPriorityScore: 86,
    earlyAsymmetryResearchPriorityRawScore: 88,
    earlyAsymmetryCoveragePct: 92,
    earlyAsymmetryConfidenceState: "HIGH",
    roadmap: "mainnet, integrations, liquidity expansion",
    description: "Infrastructure project with verified roadmap",
    roadmapProfitabilityScore: 74,
    roadmapCatalystVerdict: "bullish",
    roadmapMilestones: [{ title: "mainnet" }, { title: "integration" }],
    catalystScore: 75,
    catalystCalendarScore: 70,
    liveCatalystRadarScore: 72,
    narrativeScore: 75,
    narrativeForecastScore: 74,
    narrativeHeatScore: 70,
    discoveryPriorityScore: 82,
    discoveryDecisionScore: 84,
    discoveryDecisionTier: "PASS",
    distressedTrapScore: 0,
    distressedTrapVerdict: "No Distress Trap Detected",
    distressedMicrocapTrap: { score: 0, verdict: "No Distress Trap Detected", block: false },
    preConsensusOpportunityScore: 82,
    preConsensusBreakoutScore: 82,
    signalPersistenceScore: 74,
    antiManipulationConfidenceScore: 88,
    preConsensusBreakout: { score: 82, confidence: "High" },
    preConsensusBreakoutHunter: { score: 82, rank: 1 },
    sniperEvidenceFamilySummary: { liquidity: { score: 82, evidence: ["usable liquidity"] } },
    sniperEvidenceConfidence: 84,
    sniperState: "ARMED",
    sniperIntegrityScore: 86,
    sniperIntegrityBlockers: [],
    canonicalExecutionRoute: {
      status: "VERIFIED",
      venue: "Uniswap",
      routeType: "DEX",
      chain: "base",
      contractAddress,
      pairAddress,
      quoteAsset: "USDC",
      routeUrl: `https://app.uniswap.org/swap?outputCurrency=${contractAddress}`,
      buyRouteAvailable: true,
      sellRouteAvailable: true,
      liquidityUsd: 900000,
      volume24hUsd: 180000,
      priceUsd: 0.12,
      quoteTimestamp: FIXTURE_NOW,
      supportingSources: ["dexscreener", "uniswap"],
      confidence: 92,
      missingEvidence: [],
      failureReasons: [],
    },
    canonicalExecutionRouteStatus: "VERIFIED",
    canonicalExecutionRouteConfidence: 92,
    executionProof: {
      executionStatus: "VERIFIED",
      chainId: "base",
      contractAddress,
      venue: "Uniswap",
      pairAddress,
      quoteAsset: "USDC",
      price: 0.12,
      liquidityUsd: 900000,
      volume24hUsd: 180000,
      buyRouteAvailable: true,
      sellRouteAvailable: true,
      chainVerified: true,
      contractVerified: true,
      poolVerified: true,
      quoteVerified: true,
      safetyVerified: true,
      failureReasons: [],
    },
    executionStatus: "VERIFIED",
    moneyStatus: "VERIFIED",
    moneyScore: 84,
    moneyConfidence: 86,
    moneyEvidence: {
      buyRoute: { value: true, status: "VERIFIED" },
      sellRoute: { value: true, status: "VERIFIED" },
      contract: { value: contractAddress, status: "VERIFIED" },
      pool: { value: pairAddress, status: "VERIFIED" },
    },
    purchaseRouteConfirmed: true,
    smallCapHunterScore: 82,
    smallCapExecutionScore: 82,
    smallCapRiskScore: 6,
    smallCapHunterVerdict: "Top-2 Small-Cap Research Candidate",
    smallCapHunter: {
      score: 82,
      verdict: "Top-2 Small-Cap Research Candidate",
      routeStatus: "VERIFIED",
      missingEvidence: [],
      blockers: [],
      executionReady: true,
      researchOnly: false,
      purchaseRoute: {
        status: "VERIFIED",
        purchasable: true,
        preferredRoute: "Uniswap",
        score: 92,
        buyRouteAvailable: true,
        sellRouteAvailable: true,
        routeType: "DEX",
        chain: "base",
        contract: contractAddress,
        pairAddress,
      },
    },
    executionTwinVerdict: "Route Verified",
    executionTwinScore: 82,
    executionRoute: "MetaMask",
    opportunityTimingScore: 84,
    opportunityTimingLevel: "favorable timing",
    opportunityTimingComponents: {
      notAlreadyPumped: 82,
      liquidityBeforePrice: 86,
      buyersBeforeRetail: 80,
    },
    attentionGapScore: 78,
    attentionGapLevel: "strong attention gap",
    attentionGapComponents: {
      developerVsPrice: 80,
      liquidityVsSocial: 78,
      catalystVsCoverage: 76,
    },
    progressiveOpportunityScore: 86,
    trustScore: 84,
    executionScore: 80,
    moneyRankScore: 83,
    moneyRankEligible: true,
    marketOpportunityRank: 84,
    localAIConsensusScore: 82,
    marketOpportunityLearningScore: 66,
    marketOpportunityLearningConfidence: "LOW_SAMPLE",
    marketOpportunityLearningAdjustment: 1,
    learnedMarketOpportunityRank: 85,
    marketOpportunityLearningHints: ["Timing history is collecting outcome receipts."],
    sevenDayTenXScore: 82,
    sevenDayTenXRawScore: 84,
    sevenDayTenXPenaltyTotal: 2,
    sevenDayTenXVerdict: "Qualified 7-Day Asymmetric Research Candidate",
    sevenDayTenXConfidence: "Medium",
    sevenDayTenXSelectedEligible: true,
    sevenDayTenXModeledScenarioPct: 9.4,
    sevenDayTenXMarketCap: 4_500_000,
    sevenDayTenXLiquidityUsd: 900_000,
    sevenDayTenXBlockers: [],
    sevenDayTenXMissingEvidence: [],
    sevenDayTenX: {
      score: 82,
      verdict: "Qualified 7-Day Asymmetric Research Candidate",
      components: {
        lowCapLeverage: 94,
        sevenDayMomentum: 82,
        nearTermCatalyst: 78,
        organicDemand: 80,
        smartMoneyArrival: 76,
        liquidityTradability: 86,
        evidenceTrust: 84,
        safetyIntegrity: 90,
      },
      blockers: [],
      missingEvidence: [],
    },
    scalpMicrostructureScore: 86,
    scalpMicrostructureLane: "SCALP_ACTIONABLE_RESEARCH",
    scalpResearchQualified: true,
    scalpNoTrade: false,
    scalpEstimatedTotalCostPct: 1.4,
    scalpTradeSizeUsd: 100,
    scalpLiquidityUsd: 900000,
    scalpDepthUsd: 900000,
    scalpTradeSizeToDepthPct: 0.01,
    scalpQuoteAgeSeconds: 60,
    scalpMicrostructureBlockers: [],
    scalpMicrostructureWarnings: [],
    scalpMicrostructure: {
      name: "Scalp Microstructure Engine",
      lane: "SCALP_ACTIONABLE_RESEARCH",
      score: 86,
      tradeSizeUsd: 100,
      liquidityUsd: 900000,
      depthUsd: 900000,
      buyRouteAvailable: true,
      sellRouteAvailable: true,
      quoteAgeSeconds: 60,
      routeCost: { totalCostPct: 1.4, spreadPct: 0.3, roundTripSlippagePct: 0.9, routeFeePct: 0.2 },
      componentScores: { routeScore: 100, depthScore: 100, costScore: 88, extensionScore: 94 },
      blockers: [],
      warnings: [],
    },
    routeAccessibility: {
      globalRouteQualityScore: 92,
      userAccessibilityScore: 88,
      routeTruthStatus: "LIVE_EXECUTION_READY",
      buyQuoteVerified: true,
      sellQuoteVerified: true,
      regionStatus: "CONFIRMED_AVAILABLE",
    },
    globalRouteQualityScore: 92,
    userAccessibilityScore: 88,
    executionReady: true,
    userAccessible: true,
    utilityQualityScore: 82,
    realUtilityScore: 82,
    utilityClassification: "REAL_UTILITY",
    realUtilityQualified: true,
    preBreakoutRadarScore: 84,
    preBreakoutRadarLane: "ARMED",
    preBreakoutRadar: {
      score: 84,
      lane: "ARMED",
      verdict: "Pre-breakout research setup",
    },
    highUpsideScalpScore: 83,
    highUpsideScalpLane: "SCALP_READY_RESEARCH",
    highUpsideScalpDataCoverage: 86,
    candidateProofState: {
      identity: { status: "VERIFIED", chain: "base", tokenAddress: contractAddress, poolAddress: pairAddress },
      safety: { status: "VERIFIED_SAFE", deterministicBlocks: [] },
      globalRoute: {
        status: "ROUTE_VERIFIED",
        buyQuoteVerified: true,
        sellQuoteVerified: true,
        depthVerified: true,
        slippageVerified: true,
        quoteFresh: true,
      },
      userAccess: { status: "CONFIRMED_AVAILABLE", regionStatus: "CONFIRMED_AVAILABLE" },
    },
    projectLifecycleState: "LIVE",
    researchEligibilityState: "ELIGIBLE",
    tradabilityState: "EXECUTION_READY",
    executionReadinessState: "READY",
    researchOpportunityScore: 84,
    researchOpportunityCoverage: { observedComponentCount: 9, expectedComponentCount: 10, coveragePct: 90 },
    executionReadinessScore: 92,
    executionReadinessCoverage: { observedComponentCount: 9, expectedComponentCount: 9, coveragePct: 100 },
    finalDecisionScore: 88,
    finalDecisionScoreState: "CALCULATED",
    dataStarvationStatus: "ENOUGH_EVIDENCE_TO_RANK",
    dataStarvationMissingEvidence: [],
    dataStarvationRootCauses: {},
    starvationRecoveryPlan: { items: [] },
    valueOfInformationScore: 0,
    valueOfInformationItems: [],
    targetedEnrichmentPlan: { items: [] },
    starvationRescueEligible: false,
    starvationRescueScore: 0,
    rescueLane: "DO_NOT_ENRICH",
    researchPriorityScore: 86,
    researchReadinessScore: 86,
    researchReadinessState: "READY_FOR_VERIFIED_RESEARCH",
    researchEligible: true,
    firstSeenOpportunity: { firstSeenAt: FIXTURE_NOW, firstSeenResearchPriority: 86, firstSeenMissingEvidence: [] },
    firstSeenAt: FIXTURE_NOW,
    firstSeenResearchPriority: 86,
    firstSeenSnapshotImmutable: true,
    dailyCapitalMoveScore: 82,
    dailyCapitalMoveLane: "CAPITAL_MOVE_RESEARCH",
    dailyCapitalMoveReason: "Highest evidence-backed candidate for manual capital-move research.",
    dailyCapitalMoveMissingProof: [],
    dailyCapitalMoveMissingProofCount: 0,
    dailyCapitalMoveNextSources: [],
    dailyCapitalMoveConfidence: "HIGH",
    dailyCapitalMoveExecutionReady: true,
    dailyCapitalMoveExecutionTruthState: "LIVE_EXECUTION_READY",
    dailyCapitalMoveSafetyStatus: "NO_DETERMINISTIC_BLOCK",
    timeHorizonScores: {
      "24_72_HOURS": 78,
      "7_14_DAYS": 84,
      "30_90_DAYS": 80,
    },
    opportunityEvidenceRecord: {
      projectKey: "base:0xabc",
      scores: { marketOpportunityRank: 84 },
      evidenceFamilies: [{ family: "liquidity", score: 82 }],
    },
    opportunityEvidenceCoverage: 88,
    opportunityRankingTier: "SNIPER_READY",
    bestAvailableEligible: true,
    missingEvidence: [],
    alphaEvolutionGovernorScore: 84,
    alphaEvolutionGovernorVerdict: "Governor Promote",
    proofOfAlphaExecutionTwinScore: 84,
    proofOfAlphaExecutionTwinVerdict: "Execution-Verified Alpha Candidate",
    proofOfAlphaExecutionTwinRoute: "Uniswap",
    proofOfAlphaExecutionTwin: {
      score: 84,
      verdict: "Execution-Verified Alpha Candidate",
      confidence: "High",
      route: {
        detected: true,
        preferredRoute: "Uniswap",
        status: "VERIFIED",
        confidence: 88,
      },
      quote: {
        liquidityUsd: 900000,
        volume24h: 180000,
        priceUsd: 0.12,
        estimatedSlippagePct: 0.028,
      },
      safety: {
        blockers: [],
        contractKnown: true,
        pairKnown: true,
      },
    },
    pipelineScore: 86,
    institutionalScore: 85,
    finalQualified: true,
    finalState: "PROMOTED",
    calibrationScore: 70,
    outcomeLearningScore: 68,
    riskScore: 8,
    trapRiskScore: 4,
    sellPressureScore: 18,
    evidence,
  };
}

test("evidence ledger measures coverage and independent sources", () => {
  const ledger = buildEvidenceLedger(strongProject());

  assert.ok(ledger.evidenceCount >= getEngineContracts().length);
  assert.ok(ledger.uniqueSourceCount >= 5);
  assert.ok(ledger.confirmedFamilies >= 8);
  assert.ok(ledger.evidenceCoverage >= 70);
});

test("institutional provenance ledger scores clean source lineage", () => {
  const provenance = buildInstitutionalDataProvenanceLedger(strongProject(), {
    now: "2026-07-15T01:00:00.000Z",
  });
  const summary = summarizeInstitutionalDataProvenance([strongProject()], {
    now: "2026-07-15T01:00:00.000Z",
  });

  assert.ok(provenance.score >= 75);
  assert.ok(["INSTITUTIONAL_READY", "REVIEW_READY"].includes(provenance.institutionalReadiness));
  assert.ok(provenance.components.sourceAgreement >= 70);
  assert.ok(provenance.sourceSummary.sourceCount >= 3);
  assert.equal(summary.totalProjects, 1);
  assert.ok(summary.averageProvenanceScore >= 75);
});

test("institutional provenance ledger blocks severe source disagreement", () => {
  const conflicted = {
    ...strongProject(),
    symbol: "DISAGREE",
    marketCap: 42000000,
    fdv: 9000000000,
    circulatingSupply: 420000000,
    coinGeckoTotalSupply: 150000,
    valuationSources: [
      { source: "dexscreener", type: "marketCap", value: 42000000 },
      { source: "coingecko", type: "marketCap", value: 320000 },
      { source: "geckoterminal", type: "fdv", value: 9000000000 },
    ],
  };
  const provenance = buildInstitutionalDataProvenanceLedger(conflicted, {
    now: "2026-07-15T01:00:00.000Z",
  });

  assert.equal(provenance.institutionalReadiness, "BLOCKED");
  assert.ok(provenance.components.sourceAgreement < 50);
  assert.ok(provenance.blockers.some((blocker) => /disagreement/i.test(blocker)));
});

test("engine contract audit passes fully evidenced project", () => {
  const audit = auditProjectContracts(strongProject());

  assert.equal(audit.contractFail, 0);
  assert.equal(audit.outputMissing, 0);
  assert.ok(audit.contractPassRate >= 80);
});

test("evidence-calibrated kernel can arm a fully proven setup", () => {
  const analyzed = analyzeEvidenceCalibratedProject(strongProject());

  assert.equal(analyzed.decision.finalDecision, "ARMED");
  assert.equal(analyzed.decision.brainDecision, "ARMED");
  assert.ok(analyzed.advancedBrain.brainScore >= 80);
  assert.ok(analyzed.advancedBrain.metacognition.canPromote);
  assert.ok(analyzed.scoring.finalScore >= 80);
  assert.ok(analyzed.provenance.score >= 75);
  assert.ok(analyzed.scoring.multipliers.provenance >= 1);
  assert.equal(analyzed.decision.promotionRequirements.length, 0);
});

test("evidence-calibrated kernel blocks high raw score with critical safety risk", () => {
  const trap = {
    ...strongProject(),
    name: "Kernel Trap",
    symbol: "KTRAP",
    instantSafetyStatus: "CRITICAL",
    instantSafetyRiskScore: 94,
    walletClusterRiskScore: 88,
    washTradingRiskScore: 86,
    riskScore: 92,
    sourceTruthScore: 25,
    evidence: [{ engine: "hype", source: "social", family: "narrative", signal: "viral", score: 91 }],
  };
  const analyzed = analyzeEvidenceCalibratedProject(trap);

  assert.equal(analyzed.decision.finalDecision, "BLOCKED");
  assert.equal(analyzed.decision.brainDecision, "BLOCKED");
  assert.ok(analyzed.advancedBrain.contradictionMap.maxSeverity >= 75);
  assert.ok(analyzed.decision.blockers.some((blocker) => /safety|risk|wallet/i.test(blocker)));
  assert.ok(analyzed.scoring.finalScore < analyzed.scoring.rawSignalScore);
});

test("advanced brain demotes narrative heat without market proof", () => {
  const hype = {
    ...strongProject(),
    name: "Narrative Mirage",
    symbol: "MIRAGE",
    liquidityUsd: 16000,
    activeLiquidityTruthScore: 12,
    organicBuyerScore: 10,
    sourceTruthScore: 24,
    narrativeScore: 96,
    narrativeForecastScore: 94,
    narrativeHeatScore: 96,
    xSocialScore: 92,
    pipelineScore: 91,
    evidence: [
      {
        engine: "narrative",
        source: "x-social",
        family: "narrative",
        signal: "viral narrative",
        score: 96,
        confidence: 0.72,
      },
    ],
  };
  const analyzed = analyzeEvidenceCalibratedProject(hype);

  assert.ok(analyzed.advancedBrain.contradictionMap.contradictions.some((item) => item.type === "NARRATIVE_WITHOUT_MARKET_PROOF"));
  assert.equal(analyzed.advancedBrain.regime, "THIN_LIQUIDITY_HYPE");
  assert.notEqual(analyzed.decision.brainDecision, "ARMED");
});

test("advanced brain exposes confidence bands and pressure model", () => {
  const analyzed = analyzeEvidenceCalibratedProject(strongProject());
  const rebuilt = buildAdvancedBrainKernel(
    strongProject(),
    analyzed.scoring,
    analyzed.ledger,
    {
      ...analyzed.contractAudit,
      finalDecisionWarnings: [],
      blockingFailures: [],
    },
    analyzed.decision
  );

  assert.ok(rebuilt.confidenceBand.low <= analyzed.scoring.finalScore);
  assert.ok(rebuilt.confidenceBand.high >= analyzed.scoring.finalScore);
  assert.ok(rebuilt.pressure.promotionPressure > rebuilt.pressure.demotionPressure);
  assert.ok(rebuilt.metacognition.strongestSupport.length > 0);
});

test("source health kernel summarizes provider attempts and usable evidence", () => {
  const analyzed = analyzeEvidenceCalibratedProject(strongProject());
  const sourceHealth = buildSourceHealthKernel([analyzed], {
    discovery: {
      sourceReports: {
        dexscreener: { status: "SUCCESS", scannedTokens: 12, durationMs: 100 },
        coingecko: { status: "FAILED", error: "429 rate limit" },
        birdeye: { status: "SKIPPED", error: "missing BIRDEYE_API_KEY" },
      },
    },
  });

  assert.ok(sourceHealth.sourcesConfigured > 0);
  assert.equal(sourceHealth.sourcesSucceeded, 1);
  assert.equal(sourceHealth.sourcesRateLimited, 1);
  assert.ok(sourceHealth.sourcesWithUsableEvidence >= 1);
});

test("kernel report includes manifest audit, fixture audit, and learning loop", () => {
  const report = analyzeEvidenceCalibratedKernel([strongProject()], {
    discovery: {
      sourceReports: {
        dexscreener: { status: "SUCCESS", scannedTokens: 1 },
      },
    },
  });
  const fixtureAudit = runKernelFixtureAudit();

  assert.equal(report.engineManifestAudit.status, "PASS");
  assert.equal(report.fixtureAudit.failed.length, 0);
  assert.equal(fixtureAudit.failed.length, 0);
  assert.ok(report.learningLoop.tracks.includes("maxUpside7d"));
  assert.equal(report.summary.brain.armed, 1);
  assert.ok(report.summary.brain.averageBrainScore >= 80);
  assert.ok(report.summary.averageProvenanceScore >= 75);
  assert.ok(report.topDecisions[0].provenance.score >= 75);
});
