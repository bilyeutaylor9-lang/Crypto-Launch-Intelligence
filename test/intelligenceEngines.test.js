import test from "node:test";
import assert from "node:assert/strict";

import { analyzeNarrativeLaunchStaking } from "../src/engines/narrativeLaunchStakingEngine.js";
import { analyzeOpportunityProof } from "../src/engines/opportunityProofEngine.js";

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
