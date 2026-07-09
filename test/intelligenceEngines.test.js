import test from "node:test";
import assert from "node:assert/strict";

import { analyzeNarrativeLaunchStaking } from "../src/engines/narrativeLaunchStakingEngine.js";
import { analyzeOpportunityProof } from "../src/engines/opportunityProofEngine.js";
import { analyzeTrapRisk } from "../src/engines/trapRiskEngine.js";
import { analyzeConfidenceAdjustedRankBatch } from "../src/engines/confidenceAdjustedRankEngine.js";
import { analyzeWebResearchAgentBatch } from "../src/engines/webResearchAgentEngine.js";
import { analyzeAIEcosystemCouncilBatch } from "../src/engines/aiEcosystemCouncilEngine.js";

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
