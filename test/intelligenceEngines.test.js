import test from "node:test";
import assert from "node:assert/strict";

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

test("AI ecosystem council selects one best available strong-buy candidate when no true strong buy exists", () => {
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
    (project) => project.aiEcosystemVerdict === "Best Available Strong Buy Candidate"
  );

  assert.equal(selected.name, "BetterSetup");
  assert.match(selected.aiEcosystemCaveat, /manual confirmation/);
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
    aiEcosystemVerdict: "Best Available Strong Buy Candidate",
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

  assert.equal(result.strongBuyLifecycleStage, "Pre-Strong Buy");
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
