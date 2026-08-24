import test from "node:test";
import assert from "node:assert/strict";

import { synthesizeEdgeResearchQueue } from "../src/ops/runEdgeOpportunitySynthesis.js";

test("synthesis rewards aligned adaptive and genome evidence", () => {
  const adaptive = {
    candidates: [
      {
        symbol: "A",
        chain: "base",
        tokenAddress: "0x" + "1".repeat(40),
        research: {
          researchPriorityScore: 80,
          verifiedSignals: ["LIQUIDITY_GE_500K"],
        },
      },
      {
        symbol: "B",
        chain: "base",
        tokenAddress: "0x" + "2".repeat(40),
        research: {
          researchPriorityScore: 65,
          verifiedSignals: [],
        },
      },
    ],
  };
  const genome = {
    candidates: [
      {
        identityKey: `base:${"0x" + "1".repeat(40)}`,
        genome: {
          state: "BREAKOUT_GENOME_RESEMBLANCE",
          genomeResearchScore: 78,
          confidence: 0.7,
          confidencePct: 70,
          probability25Pct: 75,
          probability50Pct: 60,
          probability100Pct: 30,
          failureProbabilityPct: 10,
          twoXSimilarityPct: 82,
          breakout50SimilarityPct: 85,
          failureSimilarityPct: 30,
        },
      },
    ],
  };

  const report = synthesizeEdgeResearchQueue(adaptive, genome);
  assert.equal(report.candidates[0].symbol, "A");
  assert.ok(report.candidates[0].combinedResearchScore > report.candidates[1].combinedResearchScore);
  assert.equal(report.policy.automaticTrading, false);
});
