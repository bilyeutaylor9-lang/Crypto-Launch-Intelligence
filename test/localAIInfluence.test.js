import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";

import {
  advancedScoreBreakdown,
  addFinalScoring,
  localAIInfluence,
} from "../src/intelligencePipeline.js";
import { analyzeFinalSelectionIntegrityBatch } from "../src/engines/finalSelectionIntegrityEngine.js";
import { analyzeSniperIntegrityGateBatch } from "../src/engines/sniperIntegrityGateEngine.js";
import { writeHtmlReport } from "../src/reports/htmlReportEngine.js";
import { writeJsonReport } from "../src/reports/jsonReportEngine.js";

function scoredProject(overrides = {}) {
  return {
    name: "Local AI Score Fixture",
    symbol: "LAI",
    chain: "base",
    contractAddress: "0x0000000000000000000000000000000000000a11",
    permanentProjectKey: "base:0x0000000000000000000000000000000000000a11",
    identityVerified: true,
    contractVerified: true,
    chainVerified: true,
    liquidityUsd: 250_000,
    marketRankScore: 70,
    richTokenScore: 70,
    sourceTruthScore: 75,
    instantSafetyStatus: "PASS",
    organicDemandFirewallStatus: "PASS",
    discoveryDecisionTier: "PASS",
    localAIStatus: "COMPLETE",
    localAIVerdict: "EVIDENCE_SUPPORTED",
    localAIConfidence: 100,
    localAICoverage: 100,
    ...overrides,
  };
}

test("complete evidence-supported research can add no more than six score points", () => {
  const baseline = advancedScoreBreakdown(
    scoredProject({ localAIStatus: "", localAIVerdict: "" })
  );
  const influenced = advancedScoreBreakdown(scoredProject());

  assert.equal(influenced.localAIAdjustment, 6);
  assert.ok(influenced.localAIAdjustment <= 6);
  assert.equal(influenced.riskAdjustedScore, baseline.riskAdjustedScore + 6);
});

test("high-risk local research can subtract no more than ten score points", () => {
  const influence = localAIInfluence(
    scoredProject({ localAIVerdict: "HIGH_RISK", localAIConfidence: 100, localAICoverage: 100 })
  );

  assert.equal(influence.localAIAdjustment, -10);
  assert.ok(influence.localAIAdjustment >= -10);
  assert.equal(influence.localAIInfluenceStatus, "NEGATIVE");
});

test("environment settings cannot widen the local AI hard caps", () => {
  const priorBoost = process.env.LOCAL_AI_MAX_SCORE_BOOST;
  const priorPenalty = process.env.LOCAL_AI_MAX_SCORE_PENALTY;
  process.env.LOCAL_AI_MAX_SCORE_BOOST = "99";
  process.env.LOCAL_AI_MAX_SCORE_PENALTY = "99";

  try {
    const positive = localAIInfluence(scoredProject());
    const negative = localAIInfluence(scoredProject({ localAIVerdict: "HIGH_RISK" }));

    assert.equal(positive.localAIAdjustment, 6);
    assert.equal(negative.localAIAdjustment, -10);
  } finally {
    if (priorBoost === undefined) delete process.env.LOCAL_AI_MAX_SCORE_BOOST;
    else process.env.LOCAL_AI_MAX_SCORE_BOOST = priorBoost;
    if (priorPenalty === undefined) delete process.env.LOCAL_AI_MAX_SCORE_PENALTY;
    else process.env.LOCAL_AI_MAX_SCORE_PENALTY = priorPenalty;
  }
});

test("low-quality or partial positive local research cannot boost a score", () => {
  const lowQuality = localAIInfluence(
    scoredProject({ localAIConfidence: 64, localAICoverage: 100 })
  );
  const partial = localAIInfluence(scoredProject({ localAIStatus: "PARTIAL" }));

  assert.equal(lowQuality.localAIAdjustment, 0);
  assert.equal(lowQuality.localAIInfluenceStatus, "LOW_QUALITY_POSITIVE_BLOCKED");
  assert.equal(partial.localAIAdjustment, 0);
  assert.equal(partial.localAIInfluenceStatus, "PARTIAL_RESEARCH_POSITIVE_BLOCKED");
});

test("deterministic danger prevents positive local AI influence and still blocks selection", () => {
  const unsafe = scoredProject({
    identityConflict: true,
    chainIdentityStatus: "mismatched",
    washTradingRiskScore: 85,
    pipelineScore: 95,
    purchaseRoute: { purchasable: true, preferredRoute: "MetaMask", status: "Available Route Detected" },
  });
  const influence = localAIInfluence(unsafe);
  const [finalized] = analyzeFinalSelectionIntegrityBatch([unsafe]);
  const [sniper] = analyzeSniperIntegrityGateBatch([finalized]);

  assert.equal(influence.localAIAdjustment, 0);
  assert.equal(influence.localAIInfluenceStatus, "DETERMINISTIC_BLOCK");
  assert.notEqual(finalized.finalSelectionState, "QUALIFIED");
  assert.notEqual(sniper.sniperState, "ARMED");
});

test("unavailable or incomplete local research leaves scoring unchanged", () => {
  const unavailable = localAIInfluence(scoredProject({ localAIStatus: "UNAVAILABLE", localAIVerdict: "" }));
  const incomplete = localAIInfluence(scoredProject({ localAIVerdict: "EVIDENCE_INCOMPLETE", localAIConfidence: 0, localAICoverage: 0 }));

  assert.equal(unavailable.localAIAdjustment, 0);
  assert.equal(unavailable.localAIInfluenceStatus, "NO_COMPLETED_RESEARCH");
  assert.equal(incomplete.localAIAdjustment, 0);
});

test("reports preserve the local AI verdict, evidence quality, and adjustment", () => {
  const [project] = addFinalScoring([scoredProject()]);
  const jsonPath = writeJsonReport([project], { test: "local-ai-influence" });
  const htmlPath = writeHtmlReport([project]);
  const saved = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  const html = fs.readFileSync(htmlPath, "utf8");

  assert.equal(saved.projects[0].localAIVerdict, "EVIDENCE_SUPPORTED");
  assert.equal(saved.projects[0].localAIAdjustment, 6);
  assert.match(html, /Local AI Verdict/);
  assert.match(html, /EVIDENCE_SUPPORTED/);
});
