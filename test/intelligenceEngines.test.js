import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { analyzeNarrativeLaunchStaking } from "../src/engines/narrativeLaunchStakingEngine.js";
import { analyzeOpportunityProof } from "../src/engines/opportunityProofEngine.js";
import { analyzeTrapRisk } from "../src/engines/trapRiskEngine.js";
import { analyzeConfidenceAdjustedRankBatch } from "../src/engines/confidenceAdjustedRankEngine.js";
import { analyzeWebResearchAgentBatch } from "../src/engines/webResearchAgentEngine.js";
import { analyzeAIEcosystemCouncilBatch } from "../src/engines/aiEcosystemCouncilEngine.js";
import { analyzeResearchOperatingSystem } from "../src/engines/researchOperatingSystemEngine.js";
import { analyzeAutonomousAlphaLab } from "../src/engines/autonomousAlphaLabEngine.js";
import { analyzeQuantumReasoningBrain } from "../src/engines/quantumReasoningBrainEngine.js";
import { analyzeWorldModelBrainBatch } from "../src/engines/worldModelBrainEngine.js";
import { analyzeAutonomousMarketScientist } from "../src/engines/autonomousMarketScientistEngine.js";
import { analyzeSelfTrainingMarketSimulationBrainBatch } from "../src/engines/selfTrainingMarketSimulationBrainEngine.js";
import { analyzeAutonomousOutcomeJudgeBatch } from "../src/engines/autonomousOutcomeJudgeEngine.js";
import { analyzeLiveCatalystRadarBatch } from "../src/engines/liveCatalystRadarEngine.js";
import { analyzeProjectDossierSwarmBatch } from "../src/engines/projectDossierSwarmEngine.js";
import { buildCandidateRescueExpansion } from "../src/data/candidateRescueExpansionEngine.js";
import { getSourceRoutingPlan, shouldRunSource } from "../src/data/adaptiveSourceRouter.js";
import { __internetResearchTestHooks } from "../src/data/internetResearchConnector.js";
import { runAIDiscoverySwarm } from "../src/data/aiDiscoverySwarmEngine.js";
import { analyzeRoadmapCatalystProfit } from "../src/engines/roadmapCatalystProfitEngine.js";
import { analyzeAIResearchCommander } from "../src/engines/aiResearchCommanderEngine.js";
import { analyzeAutonomousAlphaInvestigator } from "../src/engines/autonomousAlphaInvestigatorEngine.js";
import { buildAIPortfolioWarRoom } from "../src/engines/aiPortfolioWarRoomEngine.js";
import { analyzeAutonomousStrategyLab } from "../src/engines/autonomousStrategyLabEngine.js";
import { analyzeCausalAlphaBrain } from "../src/engines/causalAlphaBrainEngine.js";
import { analyzeAutonomousAlphaKnowledgeGraph } from "../src/engines/autonomousAlphaKnowledgeGraphEngine.js";
import { analyzeCausalMarketTwin } from "../src/engines/causalMarketTwinEngine.js";
import { analyzeAutonomousAlphaOSBatch } from "../src/engines/autonomousAlphaOSEngine.js";
import { analyzeSourceTruth } from "../src/engines/sourceTruthEngine.js";
import {
  analyzeGithubIntelligencePro,
  summarizeGithubIntelligencePro,
} from "../src/engines/githubIntelligenceProEngine.js";
import { analyzePaperTradingOutcomeLab } from "../src/engines/paperTradingOutcomeLabEngine.js";
import {
  analyzeAutoLearningWeightOptimizerBatch,
  buildAutoLearningWeights,
} from "../src/engines/autoLearningWeightOptimizerEngine.js";
import { analyzeBreakoutBrainBatch } from "../src/engines/breakoutBrainEngine.js";
import { analyzeHighTechAlphaStackBatch } from "../src/engines/highTechAlphaStackEngine.js";
import { analyzeSelfEvolvingAlphaOSBatch } from "../src/engines/selfEvolvingAlphaOSEngine.js";
import { analyzeProofCarryingAlphaContractBatch } from "../src/engines/proofCarryingAlphaContractEngine.js";
import { analyzeAlphaEvolutionGovernorBatch } from "../src/engines/alphaEvolutionGovernorEngine.js";
import { analyzeSmallCapHunterBatch } from "../src/engines/smallCapHunterEngine.js";
import { analyzeProofOfAlphaExecutionTwinBatch } from "../src/engines/proofOfAlphaExecutionTwinEngine.js";
import { analyzeOrganicDemandIntegrity } from "../src/engines/organicDemandIntegrityEngine.js";
import { runNativeDiscoveryMesh } from "../src/data/native/nativeDiscoveryMesh.js";
import { analyzeActiveLiquidityTruth } from "../src/engines/activeLiquidityTruthEngine.js";
import { analyzeOrganicBuyerClassifier } from "../src/engines/organicBuyerClassifierEngine.js";
import { analyzeDeployerReputation } from "../src/engines/deployerReputationEngine.js";
import { analyzeProjectIdentity } from "../src/engines/projectIdentityEngine.js";
import { analyzeWalletCluster } from "../src/engines/walletClusterEngine.js";
import { analyzeBundledLaunch } from "../src/engines/bundledLaunchEngine.js";
import { analyzeWashTrading } from "../src/engines/washTradingEngine.js";
import { analyzeSmartWalletArrival } from "../src/engines/smartWalletArrivalEngine.js";
import { analyzeBuyerRetention } from "../src/engines/buyerRetentionEngine.js";
import { analyzeOrganicBuyer } from "../src/engines/organicBuyerEngine.js";
import { analyzeInstantSafetyGate } from "../src/engines/instantSafetyGateEngine.js";
import { analyzeCandidateLifecycle } from "../src/engines/candidateLifecycleEngine.js";
import { analyzeDiscoveryDecision } from "../src/engines/discoveryDecisionEngine.js";
import { analyzeQuantumOutcomeField } from "../src/engines/quantumOutcomeFieldEngine.js";
import { runEngine } from "../src/intelligencePipeline.js";
import { buildAlphaDashboardV2 } from "../src/reports/alphaDashboardV2ReportEngine.js";
import { getBinanceMarketConfig, getBinanceTickerCandidates } from "../src/data/freeMarketDataConnector.js";
import {
  classifyProviderStatus,
  getBybitProviderResult,
  getCoinCapProviderResult,
  getGeminiTickerCandidates,
} from "../src/data/expandedMarketDataConnector.js";
import { __coinGeckoTestHooks } from "../src/data/coinGeckoConnector.js";
import { __birdeyeTestHooks } from "../src/data/birdeyeConnector.js";

test("narrative launch staking engine detects hot launch and staking setup", () => {
  const result = analyzeNarrativeLaunchStaking({
    name: "AgentPay",
    symbol: "AGP",
    description:
      "AI agents using stablecoin payments with upcoming mainnet, incentivized testnet, airdrop, whitelist, audit complete, launchpad access, liquid staking, restaking, staking rewards, and validator delegation.",
    stakingApy: 18,
    stakingRatio: 42,
  });

  assert.ok(result.narrativeLaunchStakingScore >= 55);
  assert.ok(result.launchReadinessScore > 0);
  assert.ok(result.stakingMomentumScore > 0);
  assert.ok(result.matchedNarratives.some((item) => item.group === "ai"));
  assert.ok(result.launchSignals.some((item) => item.group === "mainnet"));
  assert.ok(result.evidence.some((item) => item.includes("Narrative match")));
});

test("narrative launch staking engine penalizes unsafe staking claims", () => {
  const result = analyzeNarrativeLaunchStaking({
    name: "YieldTrap",
    description: "Guaranteed APY, unaudited staking, withdrawals disabled, 1000% APY.",
    stakingApy: 1000,
    liquidityUsd: 25000,
  });

  assert.ok(result.stakingRiskScore >= 60);
  assert.equal(result.narrativeLaunchStakingTier, "High Risk / Avoid");
});

test("opportunity proof engine produces evidence, risks, breakdown, and summary", () => {
  const result = analyzeOpportunityProof({
    name: "ProofNet",
    pipelineScore: 84,
    signalDensityScore: 72,
    dataConfidenceScore: 68,
    launchReadinessScore: 76,
    stakingMomentumScore: 66,
    prePumpPatternMatchPct: 71,
    signalCombinationScore: 74,
    institutionalVNextScore: 78,
    riskScore: 28,
    signalProfile: {
      narrative: 80,
      launch: 75,
      momentum: 70,
      flows: 68,
      smartMoney: 72,
      risk: 30,
    },
    alphaTags: ["Narrative Leader", "Launch Window"],
    evidence: ["Liquidity increased", "Narrative match: ai", "Smart wallet accumulation signal"],
    riskFlags: [],
  });

  assert.ok(result.proofScore >= 60);
  assert.ok(result.topEvidence.length > 0);
  assert.ok(result.scoreBreakdown.narrative >= 80);
  assert.match(result.whyThisMatters, /ProofNet/);
  assert.ok(result.opportunityProof.summary.length > 0);
});

test("trap risk engine flags thin-liquidity hype setups", () => {
  const result = analyzeTrapRisk({
    name: "HypeThin",
    liquidityUsd: 12000,
    volume24h: 350000,
    sellPressureScore: 78,
    trapPatternMatchPct: 72,
    outcomeTrapRisk: 61,
    proofScore: 28,
    dataConfidenceScore: 31,
  });

  assert.ok(result.trapRiskScore >= 60);
  assert.ok(["High", "Extreme"].includes(result.trapRiskLevel));
  assert.ok(result.riskFlags.some((flag) => flag.includes("trap risk")));
  assert.ok(result.trapRisk.reasons.length > 0);
});

test("confidence-adjusted ranking rewards strong evidence and penalizes traps", () => {
  const results = analyzeConfidenceAdjustedRankBatch([
    {
      name: "CleanSetup",
      pipelineScore: 82,
      dataConfidenceScore: 78,
      sourceReliabilityScore: 72,
      proofScore: 76,
      narrativeHeatScore: 68,
      projectChangeScore: 70,
      trapRiskScore: 8,
      riskScore: 20,
    },
    {
      name: "NoisySetup",
      pipelineScore: 88,
      dataConfidenceScore: 38,
      sourceReliabilityScore: 30,
      proofScore: 34,
      narrativeHeatScore: 80,
      projectChangeScore: 55,
      trapRiskScore: 76,
      riskScore: 65,
    },
  ]);

  assert.equal(results[0].name, "CleanSetup");
  assert.equal(results[0].confidenceAdjustedRank, 1);
  assert.ok(results[0].confidenceAdjustedScore > results[1].confidenceAdjustedScore);
});

test("web research agent builds a priority queue without spending search budget", async () => {
  const results = await analyzeWebResearchAgentBatch(
    [
      {
        name: "LaunchAI",
        symbol: "LAI",
        description: "AI agent token launch with mainnet and airdrop",
        discoveryPriorityScore: 80,
        liquidityUsd: 500000,
        volume24h: 250000,
        discoverySources: ["google-news", "dexscreener"],
      },
      {
        name: "QuietCoin",
        symbol: "QUIET",
        description: "generic market data",
        discoveryPriorityScore: 10,
      },
    ],
    { limit: 0 }
  );

  assert.equal(results[0].name, "LaunchAI");
  assert.ok(results[0].webResearchPriority > results[1].webResearchPriority);
  assert.equal(results[0].webResearchStatus, "QUEUED_NOT_SEARCHED");
  assert.ok(results[0].webResearchPlan.queries.length > 0);
});

test("required pipeline engines fail closed and write a failure report", async () => {
  const reportPath = "reports/pipeline-failure-report.json";
  if (fs.existsSync(reportPath)) fs.unlinkSync(reportPath);

  await assert.rejects(
    () =>
      runEngine(
        "Execution Proof",
        () => {
          throw new Error("execution provider wrapper crashed");
        },
        [{ name: "Required Failure", symbol: "REQ" }]
      ),
    /Required engine failed: Execution Proof/
  );

  assert.equal(fs.existsSync(reportPath), true);
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  assert.equal(report.pipelineStatus, "FAILED");
  assert.equal(report.failedEngine.engineName, "Execution Proof");
  assert.match(report.failedEngine.failureReason, /execution provider wrapper crashed/);
});

test("AI ecosystem council selects one best available research candidate when no true strong buy exists", () => {
  const results = analyzeAIEcosystemCouncilBatch([
    {
      name: "BetterSetup",
      pipelineScore: 64,
      confidenceAdjustedScore: 62,
      narrativeHeatScore: 75,
      proofScore: 52,
      dataConfidenceScore: 60,
      sourceReliabilityScore: 58,
      trapRiskScore: 18,
      riskScore: 25,
      projectChangeScore: 62,
    },
    {
      name: "WeakerSetup",
      pipelineScore: 42,
      confidenceAdjustedScore: 38,
      narrativeHeatScore: 40,
      proofScore: 30,
      dataConfidenceScore: 35,
      trapRiskScore: 25,
    },
  ]);

  const selected = results.find(
    (project) => project.aiEcosystemVerdict === "Best Available Research Candidate"
  );

  assert.equal(selected.name, "BetterSetup");
  assert.match(selected.aiEcosystemCaveat, /not cleared every required gate/);
  assert.ok(selected.strongBuyEvidenceGate.blockers.length > 0);
  assert.ok(selected.aiDebate.moderator.length > 0);
  assert.ok(selected.whyNow.invalidation.length > 0);
});

test("AI ecosystem council grants true strong buy only when evidence gate clears", () => {
  const [result] = analyzeAIEcosystemCouncilBatch([
    {
      name: "EliteSetup",
      pipelineScore: 88,
      confidenceAdjustedScore: 82,
      narrativeScore: 82,
      narrativeForecastScore: 85,
      narrativeHeatScore: 90,
      infrastructureNarrativeScore: 76,
      liquidityScore: 82,
      liquidityExpansionScore: 80,
      capitalFlowScore: 84,
      buyPressureScore: 80,
      smartMoneyAccumulationScore: 82,
      smartWalletPerformanceScore: 78,
      proofScore: 76,
      dataConfidenceScore: 78,
      sourceReliabilityScore: 72,
      evidenceQualityScore: 74,
      learningEdgeScore: 75,
      outcomeLearningScore: 72,
      prePumpPatternScore: 74,
      projectChangeScore: 72,
      discoverySources: ["dexscreener", "geckoterminal"],
      identityVerified: true,
      contractVerified: true,
      projectIdentityVerdict: "Identity Resolved",
      identityResolutionScore: 92,
      executionProofVerified: true,
      executionStatus: "VERIFIED",
      activeLiquidityTruthScore: 82,
      trapRiskScore: 10,
      riskScore: 18,
      externalRiskScore: 0,
    },
  ]);

  assert.equal(result.aiEcosystemVerdict, "AI Strong Buy");
  assert.equal(result.strongBuyEvidenceGate.readyForTrueStrongBuy, true);
  assert.match(result.aiDebate.moderator, /clears the evidence gate/);
});

test("research operating system builds lifecycle, scenarios, tasks, and red-team review", () => {
  const result = analyzeResearchOperatingSystem({
    name: "ResearchOS",
    aiEcosystemVerdict: "Best Available Research Candidate",
    confidenceAdjustedScore: 62,
    narrativeHeatScore: 82,
    webResearchPriority: 72,
    proofScore: 42,
    trapRiskScore: 18,
    liquidityScore: 36,
    aiEcosystemCouncil: {
      agents: [
        { name: "Narrative Scout", score: 78, stance: "bullish" },
        { name: "Risk Officer", score: 82, stance: "cleared" },
        { name: "Flow Analyst", score: 38, stance: "cautious" },
      ],
    },
  });

  assert.equal(result.strongBuyLifecycleStage, "Research Candidate");
  assert.ok(result.multiTimeframeIntelligence.bestHorizon);
  assert.ok(result.scenarioPlan.bullCase.score >= result.scenarioPlan.bearCase.score);
  assert.ok(result.autonomousResearchTasks.some((task) => task.priority === "High"));
  assert.ok(["Clear", "Challenge", "Block"].includes(result.redTeamReview.status));
});

test("autonomous alpha lab matches strategy hypotheses without requiring live outcomes", () => {
  const result = analyzeAutonomousAlphaLab({
    name: "AlphaLab",
    narrativeHeatScore: 88,
    trapRiskScore: 12,
    confidenceAdjustedScore: 58,
  });

  assert.ok(result.alphaLabStrategies.length > 0);
  assert.ok(result.alphaLabBestStrategy);
  assert.ok(["Cold Start", "Paper Test", "Promote"].includes(result.alphaLabStatus));
});

test("quantum reasoning brain produces probabilities, entropy, and collapse triggers", () => {
  const result = analyzeQuantumReasoningBrain({
    name: "QuantumSetup",
    confidenceAdjustedScore: 68,
    narrativeHeatScore: 84,
    aiEcosystemScore: 70,
    dataConfidenceScore: 62,
    proofScore: 48,
    sourceReliabilityScore: 52,
    trapRiskScore: 22,
    redTeamReview: { score: 18 },
    multiTimeframeIntelligence: { "7d": 66 },
  });

  assert.ok(result.quantumBrainScore >= 0);
  assert.equal(
    result.quantumBullProbability +
      result.quantumBaseProbability +
      result.quantumBearProbability +
      result.quantumBlackSwanProbability,
    100
  );
  assert.ok(result.collapseTriggers.length > 0);
  assert.ok(result.quantumReasoningBrain.summary.length > 0);
});

test("world model brain builds narrative graph and regime context", () => {
  const [result] = analyzeWorldModelBrainBatch([
    {
      name: "BaseAI",
      symbol: "BAI",
      chain: "base",
      description: "Base AI agent token",
      confidenceAdjustedScore: 62,
      narrativeHeatScore: 88,
      proofScore: 55,
      trapRiskScore: 12,
    },
    {
      name: "BaseRWA",
      symbol: "BRWA",
      chain: "base",
      description: "Base RWA tokenized treasury",
      confidenceAdjustedScore: 58,
      narrativeHeatScore: 70,
    },
  ]);

  assert.ok(result.worldModelScore >= 0);
  assert.ok(result.knowledgeGraph.nodes.narratives.includes("ai"));
  assert.ok(result.contagionMap.relatedProjects.length > 0);
  assert.ok(result.marketRegimeGovernor.regime);
});

test("autonomous market scientist adds causal, counterfactual, autopsy, and preference reasoning", () => {
  const result = analyzeAutonomousMarketScientist({
    name: "ScientistSetup",
    confidenceAdjustedScore: 64,
    quantumBrainScore: 60,
    worldModelScore: 58,
    alphaLabScore: 55,
    narrativeHeatScore: 80,
    liquidityScore: 40,
    proofScore: 42,
    sourceReliabilityScore: 38,
    trapRiskScore: 24,
    redTeamReview: { status: "Challenge" },
  });

  assert.ok(result.marketScientistScore >= 0);
  assert.ok(result.causalHypotheses.length > 0);
  assert.ok(result.counterfactualAnalysis.length > 0);
  assert.ok(result.falsePositiveAutopsy.falsePositiveRisk >= 0);
  assert.ok(result.humanPreferenceFit.score >= 0);
});

test("self-training market simulation brain builds analogs, scenarios, and tournament ranking", () => {
  const [result] = analyzeSelfTrainingMarketSimulationBrainBatch([
    {
      name: "SimulationSetup",
      symbol: "SIM",
      confidenceAdjustedScore: 74,
      pipelineScore: 76,
      aiEcosystemScore: 70,
      quantumBrainScore: 66,
      marketScientistScore: 68,
      worldModelScore: 63,
      alphaLabScore: 60,
      narrativeHeatScore: 82,
      narrativeForecastScore: 78,
      liquidityScore: 70,
      liquidityExpansionScore: 66,
      capitalFlowScore: 68,
      buyPressureScore: 64,
      smartMoneyAccumulationScore: 66,
      smartWalletPerformanceScore: 62,
      xSocialScore: 72,
      socialAccelerationScore: 68,
      proofScore: 70,
      evidenceQualityScore: 66,
      sourceReliabilityScore: 68,
      dataConfidenceScore: 72,
      outcomeLearningScore: 62,
      prePumpPatternScore: 64,
      signalCombinationScore: 66,
      calibrationScore: 60,
      trapRiskScore: 16,
      riskScore: 20,
      sellPressureScore: 18,
    },
  ]);

  assert.ok(result.simulationBrainScore > 0);
  assert.ok(result.breakoutProbability30d >= 0);
  assert.ok(result.closestMarketAnalogs.length > 0);
  assert.ok(result.signalMutationTests.length > 0);
  assert.ok(result.engineTournament.agents.length > 0);
  assert.equal(result.simulationPortfolioRank, 1);
  assert.ok(result.selfTrainingMarketSimulationBrain.summary.length > 0);
});

test("autonomous outcome judge grades prior calls and adjusts confidence", () => {
  const snapshots = [
    {
      key: "base:judge",
      timestamp: "2026-07-01T00:00:00.000Z",
      name: "JudgeCoin",
      symbol: "JUDGE",
      chain: "base",
      priceUsd: 1,
      marketCap: 1000000,
      liquidityUsd: 100000,
      volume24h: 50000,
      score: 74,
      riskScore: 20,
      tier: "Watchlist",
      action: null,
    },
  ];
  const memory = [
    {
      id: "base:judge",
      scannedAt: "2026-07-01T00:00:00.000Z",
      market: { priceUsd: 1 },
      scores: { narrativeHeat: 82, liquidityExpansion: 76, trapRisk: 10 },
    },
    {
      id: "base:judge",
      scannedAt: "2026-07-02T00:00:00.000Z",
      market: { priceUsd: 1.3 },
      scores: { narrativeHeat: 80, liquidityExpansion: 78, trapRisk: 12 },
    },
  ];
  const [result] = analyzeAutonomousOutcomeJudgeBatch(
    [
      {
        name: "JudgeCoin",
        symbol: "JUDGE",
        chain: "base",
        priceUsd: 1.35,
        marketCap: 1300000,
        liquidityUsd: 140000,
        volume24h: 80000,
        pipelineScore: 76,
        simulationBrainScore: 64,
        aiEcosystemScore: 62,
        simulationConfidenceScore: 65,
        narrativeHeatScore: 80,
        liquidityExpansionScore: 78,
        trapRiskScore: 12,
      },
    ],
    { snapshots, memory }
  );

  assert.equal(result.outcomeJudgeStatus, "Tracked");
  assert.ok(result.outcomeJudgeScore > 0);
  assert.ok(result.outcomeJudgement.outcome.priceChangePct > 0);
  assert.ok(result.outcomeJudgement.grade.label.length > 0);
  assert.ok(result.outcomeAdjustedConfidenceScore >= 0);
});

test("project dossier swarm builds specialist agent research packet", () => {
  const [result] = analyzeProjectDossierSwarmBatch(
    [
      {
        name: "DossierCoin",
        symbol: "DOS",
        pipelineRank: 1,
        pipelineScore: 78,
        simulationBrainScore: 66,
        aiEcosystemScore: 68,
        outcomeJudgeScore: 58,
        proofScore: 64,
        tokenomicsScore: 72,
        fundingBackerScore: 60,
        vestingPressureScore: 20,
        tokenUnlockRiskScore: 18,
        liquidityScore: 70,
        liquidityExpansionScore: 68,
        capitalFlowScore: 66,
        buyPressureScore: 64,
        sellPressureScore: 18,
        narrativeHeatScore: 82,
        narrativeForecastScore: 78,
        xSocialScore: 70,
        developerActivityScore: 62,
        githubScore: 58,
        worldModelScore: 60,
        smartMoneyAccumulationScore: 66,
        smartWalletPerformanceScore: 62,
        holderGrowthScore: 64,
        trapRiskScore: 14,
        riskScore: 18,
        falsePositiveSimilarity: 22,
        outcomeLearningScore: 58,
        prePumpPatternScore: 60,
        signalCombinationScore: 62,
      },
    ],
    { limit: 1 }
  );

  assert.ok(result.dossierSwarmScore > 0);
  assert.notEqual(result.dossierSwarmDecision, "Not Dossiered");
  assert.ok(result.projectDossierSwarm.agents.length >= 8);
  assert.ok(result.projectDossierSwarm.mustVerify.length > 0);
  assert.ok(result.projectDossierSwarm.promotionTriggers.length > 0);
  assert.ok(result.projectDossierSwarm.finalMemo.includes("DossierCoin"));
});

test("live catalyst radar detects why-now events and urgency", () => {
  const [result] = analyzeLiveCatalystRadarBatch([
    {
      name: "CatalystCoin",
      symbol: "CAT",
      description:
        "Upcoming mainnet launch with airdrop claim, governance vote, staking rewards, and exchange listing rumors.",
      liquidityExpansionScore: 72,
      socialAccelerationScore: 70,
      smartMoneyAccumulationScore: 66,
      catalystCalendarScore: 76,
      narrativeHeatScore: 80,
    },
  ]);

  assert.ok(result.liveCatalystRadarScore > 0);
  assert.ok(["Critical", "High"].includes(result.liveCatalystUrgency));
  assert.ok(result.liveCatalystEvents.length >= 3);
  assert.ok(result.liveCatalystRadar.summary.length > 0);
});

test("candidate rescue expansion backfills thin discovery pools with clustered candidates", () => {
  const rescue = buildCandidateRescueExpansion(
    [
      {
        name: "ThinAI",
        symbol: "TAI",
        chain: "base",
        description: "AI agent launchpad on Base",
        liquidityUsd: 10000,
        volume24h: 2500,
        discoverySources: ["test"],
      },
    ],
    {
      sourceReports: {
        coingecko: { status: "FAILED" },
        binance: { status: "FAILED" },
      },
    },
    { rescueThreshold: 50, rescueLimit: 20 }
  );

  assert.equal(rescue.report.status, "USED");
  assert.ok(rescue.candidates.length > 0);
  assert.ok(rescue.report.topClusters.length > 0);
  assert.ok(rescue.candidates.some((candidate) => candidate.source === "candidate-rescue"));
});

test("adaptive source router cools down unreliable free providers", () => {
  const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const plan = getSourceRoutingPlan({
    memory: {
      sources: {
        coingecko: {
          source: "coingecko",
          runs: 6,
          successes: 1,
          failures: 5,
          totalCandidates: 200,
          totalDurationMs: 9000,
          lastStatus: "FAILED",
          lastError: "429 rate limit",
          cooldownUntil: future,
        },
      },
      runs: [],
    },
  });

  const coingecko = plan.sources.find((source) => source.source === "coingecko");

  assert.equal(coingecko.decision, "COOLDOWN");
  assert.equal(shouldRunSource(plan, "coingecko"), false);
  assert.ok(plan.skipped.some((source) => source.source === "coingecko"));
  assert.ok(plan.prioritized.includes("dexscreener"));
});

test("free web crawler extracts safe same-domain research links", () => {
  const html = `
    <html>
      <head><title>LaunchAI Docs</title></head>
      <body>
        <a href="/blog/mainnet-launch">Mainnet Launch</a>
        <a href="https://launchai.example/tokenomics">Tokenomics</a>
        <a href="https://x.com/launchai">Social</a>
        <a href="https://other.example/story">Other</a>
        <a href="/logo.png">Logo</a>
      </body>
    </html>
  `;
  const links = __internetResearchTestHooks.extractLinks(html, "https://launchai.example");
  const scored = __internetResearchTestHooks.scoreResearch({
    project: {
      name: "LaunchAI",
      symbol: "LAI",
      description: "AI agent mainnet launch",
    },
    pages: [
      {
        url: "https://launchai.example/blog/mainnet-launch",
        crawlDepth: 1,
        title: "LaunchAI mainnet launch",
        text: "LaunchAI announces AI agent mainnet launch, staking, and ecosystem integrations.",
      },
    ],
  });

  assert.deepEqual(links, [
    "https://launchai.example/blog/mainnet-launch",
    "https://launchai.example/tokenomics",
  ]);
  assert.equal(scored.crawlPageCount, 1);
  assert.ok(scored.signalScore > 0);
  assert.ok(scored.catalystHits.includes("launch"));
});

test("free web crawler seeds multiple roadmap research sources", () => {
  const seeds = __internetResearchTestHooks.roadmapSeedUrls("https://launchai.example");
  const sitemapLinks = __internetResearchTestHooks.parseSitemapLinks(
    `
      <urlset>
        <url><loc>https://launchai.example/roadmap</loc></url>
        <url><loc>https://launchai.example/docs/tokenomics</loc></url>
        <url><loc>https://other.example/roadmap</loc></url>
      </urlset>
    `,
    "https://launchai.example"
  );

  assert.ok(seeds.includes("https://launchai.example/roadmap"));
  assert.ok(seeds.includes("https://launchai.example/docs"));
  assert.deepEqual(sitemapLinks, [
    "https://launchai.example/roadmap",
    "https://launchai.example/docs/tokenomics",
  ]);
});

test("roadmap catalyst profit engine extracts milestones and agent verdict", () => {
  const result = analyzeRoadmapCatalystProfit(
    {
      name: "RoadmapAI",
      symbol: "RAI",
      description: "AI agent protocol",
      internetResearchScore: 72,
      narrativeHeatScore: 80,
      liquidityExpansionScore: 65,
      roadmap:
        "Roadmap: Q3 2026 mainnet launch, September 2026 staking rewards, Coinbase listing soon, and ecosystem integrations.",
      internetResearch: {
        crawlPageCount: 3,
        sourceCount: 4,
        pages: [
          {
            title: "RoadmapAI roadmap",
            text: "Q3 2026 mainnet launch with staking rewards and ecosystem integrations.",
          },
        ],
      },
    },
    { now: "2026-07-10T00:00:00.000Z" }
  );

  assert.ok(result.roadmapMilestones.length >= 2);
  assert.ok(result.roadmapProfitabilityScore > 0);
  assert.ok(result.roadmapProfitabilityAgents.length >= 4);
  assert.ok(result.catalysts.some((catalyst) => catalyst.type === "mainnet"));
  assert.ok(result.fullRoadmap.milestoneCount >= 2);
  assert.ok(result.fullRoadmap.sourceBreakdown.crawledPages >= 1);
});

test("AI discovery swarm adds agent-selected research candidates", () => {
  const swarm = runAIDiscoverySwarm([], { limit: 10, seedLimit: 50, minScore: 10 });

  assert.equal(swarm.report.status, "USED");
  assert.ok(swarm.candidates.length > 0);
  assert.ok(swarm.report.agents.length >= 5);
  assert.ok(swarm.candidates[0].aiDiscoveryAgents.length > 0);
});

test("AI research commander finds missing proof and assigns agents", () => {
  const result = analyzeAIResearchCommander({
    name: "CommanderCoin",
    symbol: "CMD",
    aiEcosystemScore: 68,
    confidenceAdjustedScore: 64,
    catalystCalendarScore: 62,
    webResearchPriority: 70,
    proofScore: 42,
    dataConfidenceScore: 44,
    liquidityScore: 35,
    trapRiskScore: 30,
  });

  assert.ok(result.researchCommanderScore >= 0);
  assert.ok(result.missingEvidence.some((item) => item.id === "roadmap"));
  assert.ok(result.missingEvidence.some((item) => item.id === "github"));
  assert.ok(result.researchAssignments.some((item) => item.agent === "Roadmap Agent"));
  assert.ok(result.aiResearchCommander.nextAction.length > 0);
});

test("autonomous alpha investigator builds case file with specialist agents", () => {
  const result = analyzeAutonomousAlphaInvestigator({
    name: "AlphaCase",
    symbol: "ALPHA",
    aiEcosystemScore: 78,
    confidenceAdjustedScore: 74,
    roadmapProfitabilityScore: 72,
    liveCatalystRadarScore: 70,
    catalystCalendarScore: 68,
    developerActivityScore: 62,
    githubQualityScore: 58,
    tokenomicsScore: 66,
    liquidityExpansionScore: 70,
    liquidityScore: 64,
    capitalFlowScore: 66,
    buyPressureScore: 63,
    narrativeHeatScore: 82,
    internetResearchScore: 68,
    simulationBrainScore: 70,
    breakoutProbability30d: 62,
    expectedReturn30dPct: 38,
    trapRiskScore: 16,
    proofScore: 66,
    dataConfidenceScore: 64,
  });

  assert.ok(result.alphaInvestigatorScore > 0);
  assert.ok(result.alphaInvestigatorAgents.length >= 8);
  assert.ok(result.alphaCaseFile.bullCase.length > 0);
  assert.ok(result.alphaCaseFile.invalidation.length >= 0);
  assert.ok(result.autonomousAlphaInvestigator.selfCorrection.agentWeights);
});

test("AI portfolio war room builds narrative battle map and allocations", () => {
  const { annotated, battlePlan } = buildAIPortfolioWarRoom([
    {
      name: "AgentOne",
      symbol: "AONE",
      chain: "base",
      description: "AI agent launchpad on Base",
      aiEcosystemScore: 76,
      confidenceAdjustedScore: 72,
      alphaInvestigatorScore: 74,
      researchCommanderScore: 70,
      liveCatalystRadarScore: 68,
      narrativeHeatScore: 82,
      liquidityScore: 62,
      dataConfidenceScore: 65,
      trapRiskScore: 18,
    },
    {
      name: "RWATwo",
      symbol: "RWA2",
      chain: "ethereum",
      description: "RWA tokenized treasury protocol",
      aiEcosystemScore: 64,
      confidenceAdjustedScore: 60,
      alphaInvestigatorScore: 58,
      researchCommanderScore: 56,
      narrativeHeatScore: 70,
      trapRiskScore: 28,
    },
  ]);

  assert.equal(annotated.length, 2);
  assert.ok(annotated[0].aiPortfolioWarRoomScore >= 0);
  assert.ok(battlePlan.narrativeBattleMap.length > 0);
  assert.ok(battlePlan.bestInClassBoard.length > 0);
  assert.ok(Object.keys(battlePlan.capitalAllocation).includes("priorityResearch"));
});

test("autonomous strategy lab selects a paper strategy and plan", () => {
  const result = analyzeAutonomousStrategyLab({
    name: "StrategyCoin",
    symbol: "STRAT",
    roadmapProfitabilityScore: 74,
    liveCatalystRadarScore: 72,
    catalystCalendarScore: 68,
    narrativeHeatScore: 82,
    proofScore: 70,
    dataConfidenceScore: 66,
    sourceReliabilityScore: 64,
    liquidityExpansionScore: 66,
    capitalFlowScore: 62,
    buyPressureScore: 60,
    trapRiskScore: 12,
    sellPressureScore: 18,
    simulationBrainScore: 68,
    breakoutProbability30d: 61,
    expectedReturn30dPct: 34,
  });

  assert.ok(result.strategyLabScore > 0);
  assert.ok(result.bestAutonomousStrategy);
  assert.ok(result.strategyTournament.length >= 5);
  assert.ok(result.paperTradingPlan.entryTriggers.length > 0);
  assert.ok(["Paper Strong Buy Candidate", "Priority Paper Trade", "Strategy Watch"].includes(result.strategyLabVerdict));
});

test("causal alpha brain builds graph, drivers, and counterfactuals", () => {
  const result = analyzeCausalAlphaBrain({
    name: "CausalCoin",
    symbol: "CAUSE",
    strategyLabScore: 76,
    paperTradeScore: 70,
    liveCatalystRadarScore: 74,
    catalystCalendarScore: 70,
    roadmapProfitabilityScore: 68,
    liquidityExpansionScore: 72,
    liquidityScore: 66,
    capitalFlowScore: 68,
    buyPressureScore: 65,
    smartMoneyAccumulationScore: 66,
    narrativeHeatScore: 80,
    simulationBrainScore: 72,
    breakoutProbability30d: 63,
    proofScore: 72,
    dataConfidenceScore: 70,
    sourceReliabilityScore: 68,
    evidenceQualityScore: 66,
    trapRiskScore: 12,
    riskScore: 18,
  });

  assert.ok(result.causalAlphaScore > 0);
  assert.ok(result.causalSignalGraph.nodes.length > 0);
  assert.ok(result.causalSignalGraph.edges.length > 0);
  assert.ok(result.causalAlphaDrivers.length > 0);
  assert.ok(result.causalCounterfactuals.length > 0);
});

test("autonomous alpha knowledge graph links identity, sources, narratives, and memory", () => {
  const project = {
    name: "GraphAlpha",
    symbol: "GRAPH",
    chain: "base",
    description: "Base AI agent token with roadmap and GitHub proof",
    discoverySources: ["dexscreener", "github", "roadmap"],
    sourceTruthScore: 72,
    proofScore: 70,
    dataConfidenceScore: 68,
    evidenceQualityScore: 66,
    githubProScore: 74,
    roadmapProfitabilityScore: 70,
    liveCatalystRadarScore: 68,
    causalAlphaScore: 72,
    simulationBrainScore: 66,
    autonomousAlphaOSScore: 70,
    narrativeHeatScore: 82,
    liquidityExpansionScore: 64,
    trapRiskScore: 12,
    evidence: [{ engine: "Source Truth", signal: "verified", score: 72 }],
    githubIntelligencePro: {
      repository: "https://github.com/example/graph-alpha",
    },
  };
  const peer = {
    name: "BaseAgentPeer",
    symbol: "BAP",
    chain: "base",
    description: "Base AI project",
    confidenceAdjustedScore: 64,
    sourceTruthScore: 60,
  };
  const result = analyzeAutonomousAlphaKnowledgeGraph(project, {
    projects: [project, peer],
    memory: {
      projects: {},
      indexes: {
        chains: { base: { count: 2, projects: ["base:graph", "base:peer"] } },
        narratives: { ai: { count: 2, projects: ["base:graph", "base:peer"] } },
        sources: { github: { count: 1, projects: ["base:graph"] } },
        repositories: {},
      },
    },
  });

  assert.ok(result.alphaKnowledgeGraphScore > 0);
  assert.ok(result.alphaKnowledgeGraph.graph.nodes.length > 0);
  assert.ok(result.alphaKnowledgeGraph.graph.edges.length > 0);
  assert.ok(result.alphaKnowledgeGraph.graph.scanNeighbors.length > 0);
  assert.ok(result.alphaKnowledgeGraph.missingProof.length < 5);
  assert.ok(result.evidence.some((item) => item.engine === "Autonomous Alpha Knowledge Graph"));
});

test("causal market twin creates scenario probabilities and expected value", () => {
  const graphResult = analyzeAutonomousAlphaKnowledgeGraph(
    {
      name: "TwinAlpha",
      symbol: "TWIN",
      chain: "ethereum",
      description: "AI restaking project with strong catalyst, liquidity, source truth, and GitHub evidence",
      discoverySources: ["coingecko", "dexscreener", "github", "roadmap"],
      alphaKnowledgeGraphScore: 74,
      alphaKnowledgeGraphConfidenceScore: 68,
      causalAlphaScore: 76,
      causalAlphaConfidenceScore: 66,
      simulationBrainScore: 72,
      breakoutBrainScore: 70,
      autonomousAlphaOSScore: 73,
      selfEvolvingAlphaOSScore: 71,
      sourceTruthScore: 78,
      proofScore: 74,
      dataConfidenceScore: 70,
      evidenceQualityScore: 72,
      liveCatalystRadarScore: 76,
      roadmapProfitabilityScore: 74,
      catalystCalendarScore: 70,
      liquidityExpansionScore: 72,
      liquidityScore: 66,
      capitalFlowScore: 68,
      buyPressureScore: 66,
      narrativeHeatScore: 82,
      narrativeForecastScore: 76,
      smartMoneyAccumulationScore: 64,
      exchangeProbabilityScore: 62,
      trapRiskScore: 10,
      riskScore: 12,
      sellPressureScore: 14,
      evidence: [{ engine: "Proof", signal: "strong", score: 74 }],
    },
    {
      projects: [],
      memory: { projects: {}, indexes: { chains: {}, narratives: {}, sources: {}, repositories: {} } },
    }
  );
  const result = analyzeCausalMarketTwin(graphResult, {
    projects: [graphResult],
    regime: {
      state: "Narrative Risk-On",
      avgHeat: 80,
      avgLiquidity: 65,
      avgRisk: 12,
      avgProof: 74,
      bias: "Allow stronger narrative upside when liquidity confirms.",
    },
  });
  const probabilityTotal = result.causalMarketTwin.scenarios.reduce(
    (sum, scenario) => sum + scenario.probability,
    0
  );

  assert.equal(probabilityTotal, 100);
  assert.ok(result.causalMarketTwinScore > 0);
  assert.ok(result.causalMarketTwinExpectedReturnPct > 0);
  assert.ok(result.causalMarketTwin.scenarios.length >= 6);
  assert.ok(result.causalMarketTwin.bestScenario);
  assert.ok(result.causalMarketTwin.experiments.length > 0);
  assert.ok(result.evidence.some((item) => item.engine === "Causal Market Twin"));
});

test("autonomous alpha OS produces a final operating verdict and best available fallback", () => {
  const results = analyzeAutonomousAlphaOSBatch([
    {
      name: "OSCoin",
      symbol: "OS",
      causalAlphaScore: 74,
      causalAlphaConfidenceScore: 64,
      causalAlphaVerdict: "Causal Priority Research",
      strategyLabScore: 72,
      strategyLabVerdict: "Priority Paper Trade",
      paperTradeScore: 70,
      simulationBrainScore: 68,
      breakoutProbability30d: 60,
      expectedReturn30dPct: 28,
      aiPortfolioWarRoomScore: 66,
      alphaInvestigatorScore: 64,
      liveCatalystRadarScore: 68,
      proofScore: 66,
      dataConfidenceScore: 64,
      sourceReliabilityScore: 62,
      trapRiskScore: 16,
      sellPressureScore: 18,
      causalSignalGraph: {
        primaryDriver: { label: "Why-Now Catalyst", score: 74 },
      },
      bestAutonomousStrategy: { name: "Roadmap Catalyst Confirmation" },
      paperTradingPlan: { entryTriggers: ["Catalyst confirmed"] },
    },
    {
      name: "WeakOS",
      symbol: "WOS",
      causalAlphaScore: 42,
      strategyLabScore: 38,
      simulationBrainScore: 35,
      proofScore: 32,
      trapRiskScore: 22,
    },
  ]);

  assert.equal(results[0].autonomousAlphaOSRank, 1);
  assert.ok(results[0].autonomousAlphaOSScore > results[1].autonomousAlphaOSScore);
  assert.ok(results[0].autonomousAlphaOSCouncil.agents.length >= 6);
  assert.ok(results[0].autonomousAlphaOSNextActions.length > 0);
  assert.ok(
    [
      "OS Strong Buy Research Candidate",
      "OS Best Available Candidate",
      "OS Priority Research",
      "OS Paper Trade",
    ].includes(results[0].autonomousAlphaOSVerdict)
  );
});

test("source truth engine verifies projects with multiple trusted source groups", () => {
  const result = analyzeSourceTruth(
    {
      name: "TruthCoin",
      symbol: "TRUTH",
      source: "CoinGecko",
      discoverySources: ["DexScreener", "GitHub Project Discovery", "Google News Discovery"],
      proofScore: 80,
      evidenceQualityScore: 74,
      dataConfidenceScore: 72,
      sourceReliabilityScore: 76,
      internetResearchScore: 70,
      roadmapProfitabilityScore: 68,
      githubProScore: 66,
      externalRiskScore: 16,
      trapRiskScore: 12,
    },
    {
      router: {
        sources: [
          { source: "coingecko", trustScore: 86 },
          { source: "dexscreener", trustScore: 82 },
          { source: "githubProjectDiscovery", trustScore: 78 },
          { source: "googleNewsDiscovery", trustScore: 74 },
        ],
      },
    }
  );

  assert.ok(result.sourceTruthScore >= 70);
  assert.equal(result.sourceTruthVerdict, "Verified Source Stack");
  assert.equal(result.sourceTruth.sourceCount, 4);
  assert.equal(result.sourceTruth.strongestSource.source, "coingecko");
  assert.ok(result.evidence.some((item) => item.engine === "Source Truth Engine"));
});

test("github intelligence pro scores repository activity and builder quality", () => {
  const result = analyzeGithubIntelligencePro({
    name: "BuilderCoin",
    symbol: "BUILD",
    repository: "https://github.com/example/buildercoin",
    githubStars: 1500,
    githubForks: 240,
    commits30d: 34,
    contributors: 18,
    releases: 5,
    githubPushedAt: new Date().toISOString(),
    developerActivityScore: 82,
    sourceTruthScore: 76,
  });

  assert.ok(result.githubProScore >= 75);
  assert.equal(result.githubProVerdict, "Elite Builder Signal");
  assert.equal(result.githubIntelligencePro.risks.length, 0);
  assert.ok(result.evidence.some((item) => item.engine === "GitHub Intelligence Pro"));
});

test("github intelligence pro accepts raw GitHub API repository fields", () => {
  const result = analyzeGithubIntelligencePro({
    name: "RawRepoCoin",
    symbol: "RAW",
    full_name: "example/rawrepocoin",
    html_url: "https://github.com/example/rawrepocoin",
    stargazers_count: 900,
    forks_count: 140,
    open_issues_count: 24,
    pushed_at: new Date().toISOString(),
    language: "TypeScript",
    commits30d: 22,
    contributorsCount: 12,
    releases: 3,
  });
  const summary = summarizeGithubIntelligencePro([result, { name: "NoRepo" }]);

  assert.ok(result.githubProScore > 0);
  assert.equal(result.githubIntelligencePro.repository, "https://github.com/example/rawrepocoin");
  assert.equal(result.githubIntelligencePro.stars, 900);
  assert.equal(summary.repoProjects, 1);
  assert.equal(summary.missingRepoProjects, 1);
  assert.equal(summary.diagnostics.status, "REPO_SIGNALS_FOUND");
  assert.equal(summary.topRepositories[0].repository, "https://github.com/example/rawrepocoin");
});

test("paper trading outcome lab promotes strategies with confirmed paper outcomes", () => {
  const result = analyzePaperTradingOutcomeLab(
    {
      name: "PaperCoin",
      symbol: "PAPER",
      bestAutonomousStrategy: {
        id: "roadmap_catalyst_confirmation",
        name: "Roadmap Catalyst Confirmation",
      },
      paperTradeScore: 78,
      causalAlphaScore: 76,
      autonomousAlphaOSScore: 74,
      proofScore: 72,
      trapRiskScore: 10,
      sellPressureScore: 12,
    },
    {
      summary: {
        totalRecords: 40,
        evaluatedRecords: 28,
        winRate: 64,
        averageReturnPct: 24,
        strategies: [
          {
            id: "roadmap_catalyst_confirmation",
            name: "Roadmap Catalyst Confirmation",
            evaluated: 24,
            winRate: 67,
            lossRate: 21,
            avgReturnPct: 31,
          },
        ],
      },
    }
  );

  assert.ok(result.paperOutcomeLabScore >= 70);
  assert.equal(result.paperOutcomeLabVerdict, "Promote Strategy Weight");
  assert.equal(result.paperStrategyWinRate, 67);
  assert.ok(result.evidence.some((item) => item.engine === "Paper Trading Outcome Lab"));
});

test("auto-learning weight optimizer creates dynamic weights and ranks stronger setups", () => {
  const projects = [
    {
      name: "WeightCoin",
      symbol: "WGT",
      strategyLabScore: 82,
      causalAlphaScore: 78,
      simulationBrainScore: 75,
      proofScore: 80,
      sourceTruthScore: 76,
      githubProScore: 72,
      autonomousAlphaOSScore: 79,
      trapRiskScore: 10,
      sellPressureScore: 12,
      riskScore: 14,
    },
    {
      name: "ThinWeight",
      symbol: "THIN",
      strategyLabScore: 30,
      causalAlphaScore: 28,
      simulationBrainScore: 24,
      proofScore: 26,
      sourceTruthScore: 30,
      githubProScore: 0,
      autonomousAlphaOSScore: 32,
      trapRiskScore: 72,
      sellPressureScore: 66,
      riskScore: 64,
    },
  ];
  const optimizer = buildAutoLearningWeights(projects, {
    totalRecords: 30,
    evaluatedRecords: 20,
    winRate: 65,
    averageReturnPct: 18,
  });
  const results = analyzeAutoLearningWeightOptimizerBatch(projects);

  assert.ok(optimizer.weights.strategy > 1);
  assert.ok(optimizer.families.length >= 6);
  assert.ok(results[0].autoLearningWeightScore > results[1].autoLearningWeightScore);
  assert.ok(["Weight-Optimized Priority", "Weight-Optimized Watch"].includes(results[0].autoLearningWeightVerdict));
});

test("alpha dashboard v2 rolls up paper, source, github, and weight intelligence", () => {
  const dashboard = buildAlphaDashboardV2([
    {
      name: "DashboardCoin",
      symbol: "DASH",
      chain: "base",
      pipelineScore: 82,
      autonomousAlphaOSScore: 78,
      autonomousAlphaOSRank: 1,
      autonomousAlphaOSVerdict: "OS Priority Research",
      autoLearningWeightScore: 80,
      paperOutcomeLabScore: 74,
      paperOutcomeLabVerdict: "Promote Strategy Weight",
      paperStrategyWinRate: 63,
      sourceTruthScore: 77,
      sourceTruthVerdict: "Verified Source Stack",
      githubProScore: 72,
      githubProVerdict: "Healthy Builder Signal",
      trapRiskScore: 14,
      sellPressureScore: 16,
      sourceTruth: {
        sources: [{ source: "coingecko", trustScore: 86 }],
      },
      githubIntelligencePro: {
        risks: [],
      },
    },
  ]);

  assert.equal(dashboard.totalProjects, 1);
  assert.equal(dashboard.topCandidates[0].symbol, "DASH");
  assert.equal(dashboard.counts.verifiedSourceStacks, 1);
  assert.equal(dashboard.counts.healthyGithubSignals, 1);
  assert.ok(dashboard.operatorNotes.length > 0);
});

test("breakout brain runs thousands of simulations and always selects top three best available projects", () => {
  const results = analyzeBreakoutBrainBatch(
    [
      {
        name: "BreakoutOne",
        symbol: "BO",
        narrativeHeatScore: 88,
        catalystCalendarScore: 82,
        earlyBreakoutScore: 80,
        liquidityExpansionScore: 76,
        smartMoneyAccumulationScore: 78,
        proofScore: 74,
        dataConfidenceScore: 72,
        sourceReliabilityScore: 70,
        trapRiskScore: 10,
      },
      {
        name: "BreakoutTwo",
        symbol: "BT",
        narrativeHeatScore: 78,
        catalystCalendarScore: 72,
        momentumShiftScore: 74,
        buyPressureScore: 70,
        smartWalletPerformanceScore: 68,
        proofScore: 66,
        dataConfidenceScore: 62,
        trapRiskScore: 18,
      },
      {
        name: "BreakoutThree",
        symbol: "BTH",
        narrativeHeatScore: 70,
        liveCatalystRadarScore: 68,
        accelerationScore: 66,
        capitalFlowScore: 62,
        proofScore: 58,
        trapRiskScore: 22,
      },
      {
        name: "WeakBreakout",
        symbol: "WB",
        narrativeHeatScore: 30,
        proofScore: 20,
        trapRiskScore: 50,
      },
    ],
    { simulations: 1200, minSelections: 3 }
  );

  const selected = results.filter((project) => project.breakoutBrainSelected);

  assert.equal(selected.length, 3);
  assert.ok(selected.every((project) => project.breakoutMonteCarlo.simulations >= 1000));
  assert.deepEqual(
    selected.map((project) => project.breakoutBrainSelectionRank).sort((a, b) => a - b),
    [1, 2, 3]
  );
  assert.ok(selected[0].breakoutProbabilitySoon >= 0);
  assert.ok(selected[0].evidence.some((item) => item.engine === "Breakout Brain Engine"));
});

test("quantum outcome field defaults to thousands of deterministic scenarios", () => {
  const result = analyzeQuantumOutcomeField({
    name: "QuantumDefault",
    symbol: "QD",
    narrativeHeatScore: 80,
    catalystScore: 72,
    momentumShiftScore: 70,
    liquidityScore: 68,
    smartMoneyAccumulationScore: 66,
    riskScore: 20,
  });

  assert.ok(result.quantumOutcomeField.scenarioCount >= 2000);
  assert.ok(result.quantumOpportunityScore >= 0);
});

test("high-tech alpha stack runs ten advanced modules and ranks stronger projects", () => {
  const results = analyzeHighTechAlphaStackBatch([
    {
      name: "HighTechOne",
      symbol: "HT1",
      pipelineScore: 82,
      aiEcosystemScore: 78,
      autonomousAlphaOSScore: 80,
      breakoutBrainScore: 76,
      breakoutProbabilitySoon: 42,
      simulationBrainScore: 74,
      causalAlphaScore: 72,
      proofScore: 76,
      sourceTruthScore: 74,
      dataConfidenceScore: 72,
      liquidityScore: 70,
      liquidityExpansionScore: 72,
      capitalFlowScore: 70,
      buyPressureScore: 68,
      catalystCalendarScore: 74,
      liveCatalystRadarScore: 72,
      narrativeHeatScore: 80,
      smartMoneyAccumulationScore: 74,
      trapRiskScore: 10,
      riskScore: 16,
      sellPressureScore: 12,
    },
    {
      name: "HighTechWeak",
      symbol: "HTW",
      pipelineScore: 38,
      proofScore: 22,
      sourceTruthScore: 20,
      liquidityScore: 18,
      narrativeHeatScore: 72,
      xBotRiskScore: 62,
      trapRiskScore: 70,
      riskScore: 68,
      sellPressureScore: 64,
    },
  ]);

  assert.equal(results[0].highTechAlphaStack.moduleCount, 10);
  assert.ok(results[0].highTechAlphaScore > results[1].highTechAlphaScore);
  assert.equal(results[0].highTechAlphaRank, 1);
  assert.equal(Object.keys(results[0].highTechModuleScores).length, 10);
  assert.ok(results[0].evidence.some((item) => item.engine === "High-Tech Alpha Stack Engine"));
});

test("self-evolving alpha OS builds thesis, agent society, and ranks stronger projects", () => {
  const results = analyzeSelfEvolvingAlphaOSBatch([
    {
      name: "AlphaMax",
      symbol: "AMAX",
      chain: "base",
      pipelineScore: 82,
      confidenceAdjustedScore: 78,
      highTechAlphaScore: 80,
      breakoutBrainScore: 76,
      autonomousAlphaOSScore: 78,
      autonomousResearchScore: 74,
      autonomousResearchConfidence: 70,
      sourceTruthScore: 76,
      proofScore: 78,
      narrativeHeatScore: 82,
      liveCatalystRadarScore: 76,
      catalystCalendarScore: 72,
      roadmapProfitabilityScore: 70,
      liquidityScore: 72,
      liquidityExpansionScore: 74,
      capitalFlowScore: 70,
      buyPressureScore: 68,
      smartMoneyAccumulationScore: 72,
      githubProScore: 66,
      developerActivityScore: 64,
      trapRiskScore: 8,
      riskScore: 14,
      sellPressureScore: 12,
      source: "test",
      discoverySources: ["dexscreener", "github"],
      githubIntelligencePro: { repository: "https://github.com/example/alphamax" },
    },
    {
      name: "RiskMax",
      symbol: "RISK",
      chain: "ethereum",
      pipelineScore: 55,
      highTechAlphaScore: 34,
      sourceTruthScore: 22,
      proofScore: 18,
      narrativeHeatScore: 75,
      trapRiskScore: 82,
      sellPressureScore: 75,
      falsePositiveSimilarity: 70,
      xBotRiskScore: 68,
    },
  ]);

  assert.ok(results[0].selfEvolvingAlphaOSScore > results[1].selfEvolvingAlphaOSScore);
  assert.equal(results[0].selfEvolvingAlphaOSRank, 1);
  assert.ok(results[0].selfEvolvingAlphaOS.identityGraph.identityCount > 0);
  assert.ok(results[0].selfEvolvingAlphaOS.worldModel.nodes.length > 0);
  assert.ok(results[0].selfEvolvingAlphaOS.hypothesisLab.hypotheses.length >= 4);
  assert.ok(results[0].selfEvolvingAlphaOS.agentSociety.agents.length >= 6);
  assert.ok(results[0].alphaThesis.whyNow.length > 0);
  assert.ok(results[1].selfEvolvingAlphaOS.alphaAutopsy.riskScore >= 60);
  assert.ok(results[0].evidence.some((item) => item.engine === "Self-Evolving Alpha OS"));
});

test("proof-carrying alpha contracts create falsifiable receipts and rank stronger projects", () => {
  const results = analyzeProofCarryingAlphaContractBatch([
    {
      name: "ReceiptAlpha",
      symbol: "RCA",
      chain: "base",
      pipelineScore: 82,
      confidenceAdjustedScore: 78,
      selfEvolvingAlphaOSScore: 84,
      highTechAlphaScore: 82,
      breakoutBrainScore: 78,
      aiEcosystemScore: 76,
      autonomousAlphaOSScore: 74,
      sourceTruthScore: 80,
      proofScore: 78,
      liveCatalystRadarScore: 76,
      liquidityExpansionScore: 72,
      narrativeHeatScore: 82,
      githubProScore: 70,
      developerActivityScore: 66,
      trapRiskScore: 8,
      riskScore: 14,
      sellPressureScore: 10,
      source: "test",
      discoverySources: ["dexscreener", "github"],
      alphaThesis: {
        summary: "ReceiptAlpha has a catalyst-backed liquidity and builder thesis.",
      },
      selfEvolvingAlphaOS: {
        agentSociety: {
          agents: [
            { name: "Narrative Scout", vote: "Support", score: 82 },
            { name: "Risk Officer", vote: "Cleared", score: 78 },
          ],
        },
      },
      evidence: [{ engine: "Source Truth", signal: "verified source stack", score: 80 }],
    },
    {
      name: "RiskReceipt",
      symbol: "RISK",
      chain: "ethereum",
      pipelineScore: 52,
      highTechAlphaScore: 24,
      sourceTruthScore: 22,
      proofScore: 18,
      narrativeHeatScore: 72,
      trapRiskScore: 82,
      riskScore: 78,
      sellPressureScore: 75,
      falsePositiveSimilarity: 70,
    },
  ]);

  assert.equal(results[0].proofCarryingAlphaContractRank, 1);
  assert.ok(results[0].proofCarryingAlphaContract.contractId);
  assert.ok(results[0].proofCarryingAlphaContract.mustHappen.length >= 4);
  assert.ok(results[0].proofCarryingAlphaContract.invalidatesIf.length >= 3);
  assert.ok(results[0].alphaContractReceipt.mustProve.length > 0);
  assert.ok(results[0].proofCarryingAlphaContract.supportingEngines.length > 0);
  assert.ok(results[1].proofCarryingAlphaContractScore < results[0].proofCarryingAlphaContractScore);
  assert.ok(results[0].evidence.some((item) => item.engine === "Proof-Carrying Alpha Contract"));
});

test("alpha evolution governor fuses contracts, outcomes, sources, agents, and risk into an operating queue", () => {
  const results = analyzeAlphaEvolutionGovernorBatch([
    {
      name: "GovernorAlpha",
      symbol: "GOV",
      chain: "base",
      pipelineScore: 82,
      proofCarryingAlphaContractScore: 78,
      proofCarryingAlphaContractVerdict: "Proof-Carrying Alpha Candidate",
      proofCarryingAlphaContract: {
        projectKey: "base:gov",
        mustHappen: [{ id: "score_holds" }, { id: "evidence_confirms" }],
        invalidatesIf: [{ id: "risk_spike" }, { id: "liquidity_break" }],
        latestGrade: { confirmationRate: 82 },
        historySummary: { winRate: 66 },
        sources: ["dexscreener", "github", "google-news"],
        agentVotes: [
          { agent: "Risk", score: 82 },
          { agent: "Catalyst", score: 78 },
        ],
      },
      alphaContractReceipt: { mustProve: ["score holds"], invalidationRules: ["risk spike"] },
      outcomeJudgeScore: 72,
      paperOutcomeLabScore: 68,
      outcomeLearningScore: 70,
      calibrationScore: 66,
      sourceTruthScore: 78,
      proofScore: 76,
      evidenceQualityScore: 72,
      dataConfidenceScore: 74,
      aiEcosystemScore: 76,
      selfEvolvingAlphaOSScore: 78,
      autonomousAlphaOSScore: 74,
      autonomousResearchConfidence: 72,
      dossierSwarmScore: 70,
      liveCatalystRadarScore: 74,
      roadmapProfitabilityScore: 68,
      githubProScore: 70,
      discoverySources: ["dexscreener", "github", "news", "website"],
      evidence: [{ engine: "Source Truth", signal: "verified", score: 78 }],
      trapRiskScore: 8,
      riskScore: 14,
      sellPressureScore: 10,
    },
    {
      name: "GovernorRisk",
      symbol: "RISK",
      chain: "ethereum",
      proofCarryingAlphaContractScore: 28,
      proofCarryingAlphaContractVerdict: "Weak Contract",
      sourceTruthScore: 20,
      proofScore: 18,
      dataConfidenceScore: 24,
      aiEcosystemScore: 30,
      redTeamReview: { status: "Block" },
      trapRiskScore: 86,
      riskScore: 82,
      sellPressureScore: 78,
      falsePositiveSimilarity: 75,
    },
  ]);

  assert.equal(results[0].alphaEvolutionGovernorRank, 1);
  assert.ok(results[0].alphaEvolutionGovernorScore > results[1].alphaEvolutionGovernorScore);
  assert.ok(["Governor Promote", "Governor Priority Research"].includes(results[0].alphaEvolutionGovernorVerdict));
  assert.equal(results[1].alphaEvolutionGovernorVerdict, "Governor Risk Block");
  assert.ok(results[0].alphaEvolutionGovernor.actionPlan.nextSteps.length > 0);
  assert.ok(results[0].alphaEvolutionGovernor.upgradeDirectives.length >= 5);
  assert.ok(results[1].alphaEvolutionGovernor.blockers.length >= 2);
  assert.ok(results[0].evidence.some((item) => item.engine === "Alpha Evolution Governor"));
});

test("small cap hunter selects two research candidates and blocks the obvious risk trap", () => {
  const results = analyzeSmallCapHunterBatch(
    [
      {
        name: "BuilderMicro",
        symbol: "BLDR",
        chain: "base",
        address: "0x000000000000000000000000000000000000b1d2",
        pairAddress: "0x000000000000000000000000000000000000b1d3",
        source: "dexscreener-search",
        dex: "uniswap",
        discoverySources: ["dexscreener-search", "github"],
        marketCap: 12_000_000,
        liquidityUsd: 240_000,
        volume24h: 420_000,
        sourceTruthScore: 78,
        proofScore: 74,
        evidenceQualityScore: 70,
        dataConfidenceScore: 72,
        githubProScore: 76,
        roadmapProfitabilityScore: 68,
        alphaKnowledgeGraphScore: 74,
        prePump: { score: 73 },
        prePumpPatternScore: 70,
        narrativeHeatScore: 75,
        liveCatalystRadarScore: 72,
        breakoutBrainScore: 78,
        momentumShiftScore: 66,
        aiEcosystemScore: 75,
        autonomousAlphaOSScore: 72,
        alphaEvolutionGovernorScore: 74,
        alphaEvolutionGovernorVerdict: "Governor Priority Research",
        riskScore: 18,
        trapRiskScore: 10,
        sellPressureScore: 16,
      },
      {
        name: "StructureSmall",
        symbol: "STRC",
        chain: "coinbase",
        source: "coinbase",
        exchange: "Coinbase",
        url: "https://www.coinbase.com/price/strc",
        marketCap: 54_000_000,
        liquidityUsd: 115_000,
        volume24h: 180_000,
        sourceTruthScore: 64,
        proofScore: 66,
        evidenceQualityScore: 62,
        dataConfidenceScore: 60,
        githubProScore: 59,
        roadmapProfitabilityScore: 65,
        alphaKnowledgeGraphScore: 63,
        prePump: { score: 61 },
        prePumpPatternScore: 58,
        narrativeForecastScore: 64,
        catalystCalendarScore: 67,
        earlyBreakoutScore: 63,
        aiEcosystemScore: 65,
        autonomousAlphaOSScore: 61,
        causalMarketTwinScore: 63,
        riskScore: 25,
        trapRiskScore: 19,
        sellPressureScore: 22,
      },
      {
        name: "NoRouteAlpha",
        symbol: "NORT",
        chain: "research",
        marketCap: 8_000_000,
        liquidityUsd: 350_000,
        volume24h: 500_000,
        sourceTruthScore: 80,
        proofScore: 80,
        evidenceQualityScore: 78,
        dataConfidenceScore: 76,
        githubProScore: 75,
        roadmapProfitabilityScore: 74,
        alphaKnowledgeGraphScore: 76,
        prePump: { score: 80 },
        prePumpPatternScore: 78,
        narrativeHeatScore: 78,
        liveCatalystRadarScore: 76,
        breakoutBrainScore: 80,
        aiEcosystemScore: 78,
        autonomousAlphaOSScore: 76,
        riskScore: 12,
        trapRiskScore: 10,
        sellPressureScore: 10,
      },
      {
        name: "TrapMicro",
        symbol: "TRAP",
        chain: "ethereum",
        address: "0x0000000000000000000000000000000000007a9a",
        source: "dexscreener-search",
        dex: "uniswap",
        marketCap: 4_000_000,
        liquidityUsd: 180_000,
        volume24h: 900_000,
        sourceTruthScore: 30,
        proofScore: 24,
        evidenceQualityScore: 26,
        prePump: { score: 82 },
        narrativeHeatScore: 86,
        aiEcosystemScore: 45,
        riskScore: 84,
        trapRiskScore: 91,
        sellPressureScore: 86,
        redTeamReview: { status: "Block" },
      },
    ],
    { budgetUsd: 100, targetCount: 2 }
  );
  const selected = results.filter((project) => project.smallCapHunterSelected);
  const trap = results.find((project) => project.symbol === "TRAP");
  const noRoute = results.find((project) => project.symbol === "NORT");

  assert.equal(selected.length, 2);
  assert.deepEqual(
    selected.map((project) => project.smallCapHunterSelectionRank),
    [1, 2]
  );
  assert.equal(noRoute.smallCapHunterVerdict, "Top-2 Small-Cap Research Candidate");
  assert.equal(noRoute.smallCapHunterSelected, true);
  assert.equal(noRoute.smallCapHunter.executionReady, false);
  assert.equal(noRoute.smallCapHunter.researchOnly, true);
  assert.equal(noRoute.smallCapHunter.routeStatus, "NO_ROUTE");
  assert.equal(trap.smallCapHunterVerdict, "Small-Cap Risk Block");
  assert.equal(trap.smallCapHunterSelected, false);
  assert.equal(selected[0].smallCapHunter.paperPlan.totalPaperBudgetUsd, 100);
  assert.ok(selected.some((project) => project.smallCapHunter.purchaseRoute.preferredRoute !== "Unavailable"));
  assert.ok(selected[0].smallCapHunter.warnings.some((warning) => warning.includes("Research only")));
  assert.ok(selected.every((project) => project.alphaTags.includes("Top-2 Small-Cap Research Candidate")));
  assert.ok(selected.every((project) => project.smallCapPreHitPressureScore > 0));
  assert.ok(selected.every((project) => project.smallCapHunter.preHitPressure));
});

test("engine watchdog returns the last safe project list when a brain step stalls", async () => {
  const projects = [{ name: "Watchdog Token", symbol: "DOG", chain: "base" }];
  const startedAt = Date.now();
  const results = await runEngine(
    "World Model Brain",
    () => new Promise(() => {}),
    projects,
    { timeoutMs: 5 }
  );

  assert.equal(results[0].name, projects[0].name);
  assert.equal(results[0].symbol, projects[0].symbol);
  assert.equal(results[0].chain, projects[0].chain);
  assert.equal(results[0].engineResults.worldModelBrain.status, "FAILED");
  assert.match(results[0].engineResults.worldModelBrain.failureReason, /timed out/i);
  assert.equal(results[0].engineHealth.enginesFailed, 1);
  assert.ok(Date.now() - startedAt < 500);
});

test("proof of alpha execution twin selects route-verified paper executions and blocks unsafe paths", () => {
  const results = analyzeProofOfAlphaExecutionTwinBatch(
    [
      {
        name: "MetaRoute",
        symbol: "META",
        chain: "base",
        address: "0x0000000000000000000000000000000000000aaa",
        pairAddress: "0x0000000000000000000000000000000000000aab",
        liquidityUsd: 260_000,
        volume24h: 410_000,
        priceUsd: 0.25,
        sourceTruthScore: 78,
        proofScore: 76,
        evidenceQualityScore: 74,
        dataConfidenceScore: 72,
        proofCarryingAlphaContractScore: 74,
        alphaEvolutionGovernorScore: 76,
        autonomousAlphaOSScore: 72,
        causalMarketTwinScore: 70,
        breakoutBrainScore: 78,
        smallCapHunterScore: 82,
        smallCapHunterVerdict: "Top-2 Small-Cap Research Candidate",
        smallCapHunter: {
          purchaseRoute: {
            purchasable: true,
            preferredRoute: "MetaMask",
            status: "Available Route Detected",
            score: 70,
            routes: [{ type: "MetaMask", contract: "0x0000000000000000000000000000000000000aaa", pairAddress: "0x0000000000000000000000000000000000000aab" }],
          },
        },
        riskScore: 16,
        trapRiskScore: 10,
        sellPressureScore: 14,
      },
      {
        name: "CoinRoute",
        symbol: "COIN",
        chain: "coinbase",
        liquidityUsd: 500_000,
        volume24h: 700_000,
        priceUsd: 1.5,
        sourceTruthScore: 72,
        proofScore: 70,
        evidenceQualityScore: 70,
        dataConfidenceScore: 72,
        proofCarryingAlphaContractScore: 70,
        alphaEvolutionGovernorScore: 72,
        autonomousAlphaOSScore: 70,
        causalMarketTwinScore: 68,
        smallCapHunterScore: 76,
        smallCapHunter: {
          purchaseRoute: {
            purchasable: true,
            preferredRoute: "Coinbase",
            status: "Available Route Detected",
            score: 72,
            routes: [{ type: "Coinbase" }],
          },
        },
        riskScore: 20,
        trapRiskScore: 14,
        sellPressureScore: 12,
      },
      {
        name: "NoRoute",
        symbol: "NORT",
        chain: "research",
        liquidityUsd: 600_000,
        volume24h: 800_000,
        proofCarryingAlphaContractScore: 82,
        alphaEvolutionGovernorScore: 82,
        autonomousAlphaOSScore: 82,
        smallCapHunterScore: 82,
        riskScore: 10,
      },
      {
        name: "UnsafeRoute",
        symbol: "RISK",
        chain: "base",
        address: "0x0000000000000000000000000000000000000bad",
        liquidityUsd: 300_000,
        volume24h: 500_000,
        sourceTruthScore: 80,
        proofScore: 80,
        smallCapHunter: {
          purchaseRoute: {
            purchasable: true,
            preferredRoute: "MetaMask",
            status: "Available Route Detected",
            score: 70,
            routes: [{ type: "MetaMask", contract: "0x0000000000000000000000000000000000000bad" }],
          },
        },
        alphaEvolutionGovernorScore: 80,
        riskScore: 85,
        trapRiskScore: 88,
      },
    ],
    { budgetUsd: 100, targetCount: 2 }
  );
  const selected = results.filter((project) => project.proofOfAlphaExecutionTwinSelected);
  const noRoute = results.find((project) => project.symbol === "NORT");
  const unsafe = results.find((project) => project.symbol === "RISK");

  assert.equal(selected.length, 2);
  assert.deepEqual(
    selected.map((project) => project.proofOfAlphaExecutionTwinRank),
    [1, 2]
  );
  assert.ok(selected.every((project) => project.proofOfAlphaExecutionTwinVerdict === "Execution-Verified Alpha Candidate"));
  assert.deepEqual(
    selected.map((project) => project.proofOfAlphaExecutionTwinRoute).sort(),
    ["Coinbase", "MetaMask"]
  );
  assert.equal(noRoute.proofOfAlphaExecutionTwinVerdict, "RESEARCH_ONLY_ROUTE_UNVERIFIED");
  assert.equal(unsafe.proofOfAlphaExecutionTwinVerdict, "Execution Safety Block");
  assert.ok(selected[0].proofOfAlphaExecutionTwin.paperExecution.reviewWindows.includes("30d"));
});

test("organic demand integrity downgrades LGNS-style big-number anomalies", () => {
  const result = analyzeOrganicDemandIntegrity({
    name: "Large Numbers Protocol",
    symbol: "LGNSX",
    chain: "polygon",
    description:
      "Algorithmic non-stablecoin with compounding staking, referral rewards, rank rewards, withdrawal pool income, mint role and setRatio controls.",
    liquidityUsd: 240_700_000,
    volume24h: 20_200_000,
    stablecoinReservesUsd: 80_000_000,
    protocolOwnedLiquidityPct: 90,
    liquidityProviders: 30,
    holders: 2_450_000,
    uniqueBuyers24h: 120,
    uniqueTraders24h: 2_100,
    activeHolders30d: 1_000,
    holdersOver100Usd: 500,
    transactions24h: 635_000,
    approvalTransactions24h: 320_000,
    transferTransactions24h: 250_000,
    rewardClaims24h: 48_000,
    buyTransactions24h: 900,
    sellTransactions24h: 700,
    top50WalletTransactionPct: 82,
    repeatWalletTransactionPct: 76,
    circularFlowRiskScore: 74,
    sameSizeTradePct: 63,
    topPoolVolumePct: 94,
    repetitiveTransactionScore: 80,
    dailyYieldPct: 0.9,
    contractFunctions: ["mint", "grantRole", "revokeRole", "setRatio", "setMainPair", "burnFrom"],
    marketCap: 389_000_000,
    dexScreenerMarketCap: 5_000_000_000,
    geckoTerminalFdv: 8_160_000_000,
    coinGeckoFdv: 324_000,
    bitgetTotalSupply: 3_410_000_000,
    coinGeckoTotalSupply: 150_000,
    coinMarketCapSupplyUnavailable: true,
    circulatingSupply: 0,
    sourceTruthScore: 48,
  });

  assert.equal(result.organicDemandVerdict, "Institutional Integrity Block");
  assert.ok(result.economicIntegrityRiskScore >= 70);
  assert.ok(result.economicIntegrityPenalty >= 18);
  assert.ok(result.organicEconomicIntegrityScore <= 42);
  assert.ok(result.activityAuthenticityRiskScore >= 70);
  assert.ok(result.supplyIntegrityRiskScore >= 70);
  assert.ok(result.economicIntegrityScoreCapReasons.some((reason) => /activity|supply|market/i.test(reason)));
  assert.ok(result.economicIntegrityBlockers.some((blocker) => blocker.includes("Yield")));
  assert.ok(result.economicIntegrityBlockers.some((blocker) => blocker.includes("Displayed liquidity")));
  assert.ok(result.economicIntegrityBlockers.some((blocker) => blocker.includes("Activity authenticity")));
  assert.ok(result.economicIntegrityBlockers.some((blocker) => blocker.includes("Supply or valuation")));
  assert.equal(result.organicDemandStrongBuyEligible, false);
  assert.equal(result.organicDemandPromotionBlocked, true);
  assert.match(result.organicDemandManualReviewLabel, /manual investigation required/i);
  assert.ok(result.economicIntegrityResearchTasks.length >= 5);
  assert.ok(result.economicIntegrityResearchTasks.some((task) => task.id === "verify-activity-authenticity"));
  assert.ok(result.economicIntegrityResearchTasks.some((task) => task.id === "reconcile-supply-valuation"));
  assert.ok(result.economicIntegrityResearchTasks.some((task) => task.priority === "critical"));
  assert.ok(result.organicDemandIntegrity.requiredProof.some((proof) => proof.includes("Unique trader ratio")));
  assert.ok(result.organicDemandIntegrity.requiredProof.some((proof) => proof.includes("Cross-source")));
});

test("organic demand integrity can confirm cleaner economic demand", () => {
  const result = analyzeOrganicDemandIntegrity({
    name: "CleanFlow",
    symbol: "FLOWX",
    chain: "base",
    liquidityUsd: 2_500_000,
    volume24h: 1_200_000,
    stablecoinReservesUsd: 1_300_000,
    hardExitLiquidityUsd: 1_250_000,
    protocolOwnedLiquidityPct: 8,
    liquidityProviders: 160,
    lpLocked: true,
    pairAgeHours: 240,
    holders: 35_000,
    uniqueBuyers24h: 3_000,
    uniqueTraders24h: 4_200,
    activeHolders30d: 4_500,
    holdersOver10Usd: 12_000,
    holdersOver100Usd: 4_000,
    holdersOver1000Usd: 900,
    swapTransactions24h: 6_000,
    buyTransactions24h: 3_400,
    sellTransactions24h: 2_600,
    approvalTransactions24h: 800,
    transferTransactions24h: 1_200,
    top50WalletTransactionPct: 18,
    repeatWalletTransactionPct: 14,
    ownerRenounced: true,
    marketCap: 42_000_000,
    circulatingSupply: 420_000_000,
    totalSupply: 500_000_000,
    maxSupply: 500_000_000,
    sourceTruthScore: 78,
  });

  assert.equal(result.organicDemandVerdict, "Organic Demand Confirmed");
  assert.equal(result.organicDemandStrongBuyEligible, true);
  assert.equal(result.organicDemandPromotionBlocked, false);
  assert.equal(result.organicDemandManualReviewLabel, "Organic demand verified");
  assert.equal(result.economicIntegrityResearchTasks.length, 0);
  assert.ok(result.organicEconomicIntegrityScore >= 75);
  assert.ok(result.economicIntegrityRiskScore < 45);
});

test("native discovery mesh converts pool lifecycle events into early candidates", async () => {
  const tokenAddress = "0x1111111111111111111111111111111111111111";
  const poolAddress = "0x2222222222222222222222222222222222222222";
  const events = [
    {
      eventType: "TOKEN_DEPLOYED",
      chain: "base",
      protocol: "aerodrome",
      tokenAddress,
      deployer: "0xdeployer",
      transactionHash: "0xaaa",
      timestamp: "2026-07-10T00:00:00.000Z",
      evidenceConfidence: 70,
    },
    {
      eventType: "POOL_CREATED",
      chain: "base",
      protocol: "aerodrome",
      tokenAddress,
      poolAddress,
      transactionHash: "0xbbb",
      timestamp: "2026-07-10T00:03:00.000Z",
      evidenceConfidence: 72,
    },
    {
      eventType: "FIRST_LIQUIDITY_ADDED",
      chain: "base",
      protocol: "aerodrome",
      tokenAddress,
      poolAddress,
      transactionHash: "0xccc",
      timestamp: "2026-07-10T00:05:00.000Z",
      displayedLiquidityUsd: 280000,
      activeLiquidityUsd: 210000,
      stableExitLiquidityUsd: 125000,
      evidenceConfidence: 74,
    },
    {
      eventType: "FIRST_SWAP",
      chain: "base",
      protocol: "aerodrome",
      tokenAddress,
      poolAddress,
      transactionHash: "0xddd",
      timestamp: "2026-07-10T00:08:00.000Z",
      buyVolumeUsd: 42000,
      sellVolumeUsd: 9000,
      evidenceConfidence: 76,
    },
    {
      eventType: "FIRST_EXTERNAL_BUYER",
      chain: "base",
      protocol: "aerodrome",
      tokenAddress,
      poolAddress,
      transactionHash: "0xeee",
      timestamp: "2026-07-10T00:10:00.000Z",
      uniqueBuyers: 42,
      independentBuyers: 34,
      sameFunderBuyers: 3,
      sniperBuyers: 4,
      buyVolumeUsd: 62000,
      sellVolumeUsd: 12000,
      evidenceConfidence: 78,
    },
    {
      eventType: "BUYER_MILESTONE",
      chain: "base",
      protocol: "aerodrome",
      tokenAddress,
      poolAddress,
      transactionHash: "0xfff",
      timestamp: "2026-07-10T00:16:00.000Z",
      uniqueBuyers: 58,
      independentBuyers: 49,
      sameFunderBuyers: 4,
      sniperBuyers: 5,
      evidenceConfidence: 80,
    },
  ];

  const result = await runNativeDiscoveryMesh({ events, persist: false, skipStore: true });
  const candidate = result.candidates[0];

  assert.ok(candidate);
  assert.equal(candidate.source, "native-discovery-mesh");
  assert.equal(candidate.discoveryLane, "new-pool");
  assert.ok(candidate.nativeDiscoveryScore >= 60);
  assert.equal(candidate.nativeLifecycleStage, "BUYER_MILESTONE");
  assert.ok(candidate.independentBuyers24h >= 49);
});

test("native liquidity, buyer, and deployer engines score fresh pool quality", () => {
  const baseProject = {
    symbol: "NATIVE",
    liquidityUsd: 1_000_000,
    protocolControlledLiquidityPct: 72,
    nativeLifecycle: {
      buyerState: {
        uniqueBuyers: 80,
        independentBuyers: 62,
        sameFunderBuyers: 6,
        sniperBuyers: 8,
        buyVolumeUsd: 180000,
        sellVolumeUsd: 45000,
      },
      liquidityState: {
        displayedLiquidityUsd: 1_000_000,
        activeLiquidityUsd: 520_000,
        stableExitLiquidityUsd: 240_000,
      },
      deployerNetFlow: -16000,
    },
    deployerHistory: {
      priorDeployments: 8,
      successfulLaunches: 3,
      walletAgeDays: 420,
      priorRugs: 0,
      lpRemovalHistory: 0,
    },
  };
  const liquidity = analyzeActiveLiquidityTruth(baseProject);
  const buyers = analyzeOrganicBuyerClassifier(baseProject);
  const deployer = analyzeDeployerReputation(baseProject);
  const riskyDeployer = analyzeDeployerReputation({
    ...baseProject,
    deployerHistory: {
      priorDeployments: 12,
      successfulLaunches: 1,
      walletAgeDays: 14,
      priorRugs: 2,
      lpRemovalHistory: 1,
      reusedBytecodeRisk: 85,
      fundingSourceRisk: 75,
    },
  });

  assert.ok(liquidity.activeLiquidityTruth.sellTests.some((testItem) => testItem.sellUsd === 1_000_000));
  assert.ok(liquidity.liquidityControlRisk >= 45);
  assert.ok(buyers.organicBuyerScore >= 65);
  assert.equal(buyers.organicBuyerVerdict, "First Real Buyers Confirmed");
  assert.ok(deployer.deployerReputationScore >= 60);
  assert.equal(riskyDeployer.deployerReputationVerdict, "Deployer Risk Block");
  assert.ok(riskyDeployer.deployerRiskScore >= 75);
});

test("discovery decision engine passes clean organic early pools and caps critical safety failures", () => {
  const clean = {
    name: "Clean Native Launch",
    symbol: "CNL",
    chain: "base",
    address: "0x1111111111111111111111111111111111111111",
    website: "https://cleannative.example",
    twitter: "https://x.com/cleannative",
    deployer: "0xdeployer",
    liquidityUsd: 420000,
    nativeDiscoveryScore: 82,
    discoveryPriorityScore: 78,
    sourceTruthScore: 72,
    organicBuyerScore: 78,
    activeLiquidityTruthScore: 74,
    liquidityControlRisk: 22,
    deployerReputationScore: 76,
    deployerRiskScore: 18,
    buySimulationPassed: true,
    sellSimulationPassed: true,
    buyTaxPct: 1,
    sellTaxPct: 1,
    ownerRenounced: true,
    lpLocked: true,
    uniqueBuyers24h: 220,
    independentBuyers24h: 174,
    sameFunderBuyers24h: 18,
    sniperBuyers24h: 12,
    deployerConnectedBuyers: 4,
    repeatBuyers24h: 38,
    smartWalletBuyers: 5,
    catalystScore: 72,
    launchReadinessScore: 68,
    githubProScore: 66,
    tokenomicsScore: 62,
    nativeLifecycleStage: "BUYER_MILESTONE",
    nativeLifecycle: {
      firstSeenAt: new Date().toISOString(),
      currentStage: "BUYER_MILESTONE",
      buyerState: {
        uniqueBuyers: 220,
        independentBuyers: 174,
        sameFunderBuyers: 18,
        sniperBuyers: 12,
      },
    },
  };
  const cleanDecision = [
    analyzeProjectIdentity,
    analyzeOrganicBuyerClassifier,
    analyzeWalletCluster,
    analyzeBundledLaunch,
    analyzeWashTrading,
    analyzeSmartWalletArrival,
    analyzeBuyerRetention,
    analyzeOrganicBuyer,
    analyzeInstantSafetyGate,
    analyzeCandidateLifecycle,
    analyzeDiscoveryDecision,
  ].reduce((project, engine) => engine(project), clean);

  assert.equal(cleanDecision.instantSafetyStatus, "PASS");
  assert.equal(cleanDecision.organicDemandFirewallStatus, "PASS");
  assert.equal(cleanDecision.discoveryDecisionTier, "PASS");
  assert.ok(cleanDecision.discoveryDecisionScore >= 70);
  assert.equal(cleanDecision.candidateLifecycleStage, "EARLY_TRACTION");
  assert.ok(cleanDecision.projectIdentityGraph.walletGraph.buyerBreakdown.independentBuyers >= 170);

  const unsafe = analyzeDiscoveryDecision(
    analyzeCandidateLifecycle(
      analyzeInstantSafetyGate(
        analyzeOrganicBuyer(
          analyzeWashTrading(
            analyzeBundledLaunch(
              analyzeWalletCluster(
                analyzeOrganicBuyerClassifier(
                  analyzeProjectIdentity({
                    ...clean,
                    symbol: "BAD",
                    sellSimulationPassed: false,
                    honeypotRiskScore: 95,
                    hiddenTransferRestriction: true,
                    blacklistAuthority: true,
                    ownerRenounced: false,
                    lpLocked: false,
                    sameFunderBuyers24h: 150,
                    sniperBuyers24h: 60,
                    independentBuyers24h: 10,
                    deployerConnectedBuyers: 55,
                    washTradeWallets: 20,
                    buyVolumeUsd: 100000,
                    sellVolumeUsd: 98000,
                  })
                )
              )
            )
          )
        )
      )
    )
  );

  assert.equal(unsafe.instantSafetyStatus, "CRITICAL");
  assert.ok(["CRITICAL", "RESTRICTED"].includes(unsafe.discoveryDecisionTier));
  assert.ok(unsafe.discoveryDecisionScore <= 44);
});

test("provider status classification handles auth, rate limits, region blocks, and outages", () => {
  assert.equal(classifyProviderStatus({ status: 401 }), "authentication_required");
  assert.equal(classifyProviderStatus({ status: 429 }), "rate_limited");
  assert.equal(classifyProviderStatus({ status: 451 }), "region_blocked");
  assert.equal(classifyProviderStatus({ message: "fetch failed" }), "temporarily_unavailable");
});

test("CoinGecko demo key headers and pacing are configurable", () => {
  const oldDemoKey = process.env.COINGECKO_DEMO_API_KEY;
  const oldDelay = process.env.COINGECKO_DELAY_MS;
  const oldRpm = process.env.COINGECKO_REQUESTS_PER_MINUTE;

  process.env.COINGECKO_DEMO_API_KEY = "demo-key";
  process.env.COINGECKO_REQUESTS_PER_MINUTE = "60";
  delete process.env.COINGECKO_DELAY_MS;

  assert.equal(__coinGeckoTestHooks.coinGeckoHeaders()["x-cg-demo-api-key"], "demo-key");
  assert.ok(__coinGeckoTestHooks.requestDelayMs() >= 1000);
  assert.equal(__coinGeckoTestHooks.requestDelayMs({ delayMs: 123 }), 123);

  if (oldDemoKey === undefined) delete process.env.COINGECKO_DEMO_API_KEY;
  else process.env.COINGECKO_DEMO_API_KEY = oldDemoKey;
  if (oldDelay === undefined) delete process.env.COINGECKO_DELAY_MS;
  else process.env.COINGECKO_DELAY_MS = oldDelay;
  if (oldRpm === undefined) delete process.env.COINGECKO_REQUESTS_PER_MINUTE;
  else process.env.COINGECKO_REQUESTS_PER_MINUTE = oldRpm;
});

test("Binance routes to Binance.US in US mode and keeps liquidity separate from volume", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () => ({
    ok: true,
    json: async () => [
      {
        symbol: "BTCUSDT",
        lastPrice: "65000",
        quoteVolume: "1234567",
        priceChangePercent: "2.5",
      },
    ],
  });

  try {
    const config = getBinanceMarketConfig({ region: "US" });
    const [candidate] = await getBinanceTickerCandidates({ region: "US", limit: 1 });

    assert.equal(config.source, "binance-us");
    assert.equal(config.exchange, "Binance.US");
    assert.equal(candidate.source, "binance-us");
    assert.equal(candidate.exchange, "Binance.US");
    assert.equal(candidate.baseSymbol, "BTC");
    assert.equal(candidate.quoteSymbol, "USDT");
    assert.equal(candidate.pairAddress, null);
    assert.equal(candidate.liquidityUsd, null);
    assert.equal(candidate.volume24h, 1234567);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("CoinCap V3 reports missing key without attempting a request", async () => {
  const result = await getCoinCapProviderResult({ apiKey: "" });

  assert.equal(result.status, "authentication_required");
  assert.equal(result.attempted, false);
  assert.deepEqual(result.candidates, []);
});

test("Bybit reports US region block without attempting a request", async () => {
  const result = await getBybitProviderResult({ region: "US" });

  assert.equal(result.status, "region_blocked");
  assert.equal(result.attempted, false);
  assert.deepEqual(result.candidates, []);
});

test("Gemini uses bulk price feed and avoids fake liquidity", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () => ({
    ok: true,
    json: async () => [
      {
        pair: "BTCUSD",
        price: "65000",
        percentChange24h: "1.2",
      },
    ],
  });

  try {
    const [candidate] = await getGeminiTickerCandidates({ limit: 1 });

    assert.equal(candidate.source, "gemini");
    assert.equal(candidate.exchange, "Gemini");
    assert.equal(candidate.pairAddress, null);
    assert.equal(candidate.liquidityUsd, null);
    assert.equal(candidate.volume24h, null);
    assert.equal(candidate.marketCap, null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Birdeye clamps trending limits and explains access errors", () => {
  assert.equal(__birdeyeTestHooks.birdeyeLimit(500), 50);
  assert.match(
    __birdeyeTestHooks.friendlyBirdeyeError(403, "forbidden", "https://example.com"),
    /key may not have access/
  );
});
