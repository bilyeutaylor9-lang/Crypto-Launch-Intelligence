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

test("Solana case variants remain distinct exact research identities and join only their own genome", () => {
  const mint = "So11111111111111111111111111111111111111112";
  const variant = "so11111111111111111111111111111111111111112";
  const candidates = [mint, variant].map(tokenAddress => ({ chain: "solana", tokenAddress, symbol: "SAME",
    research: { researchPriorityScore: 80 } }));
  const report = synthesizeEdgeResearchQueue({ candidates }, { candidates: [
    { identityKey: `solana:${mint}`, genome: { state: "BREAKOUT_GENOME_RESEMBLANCE", genomeResearchScore: 90, confidence: 0.8 } },
  ] });
  assert.equal(report.candidates.length, 2);
  const byToken = new Map(report.candidates.map(row => [row.tokenAddress, row]));
  assert.equal(byToken.get(mint).identityKey, `solana:${mint}`);
  assert.equal(byToken.get(variant).identityKey, `solana:${variant}`);
  assert.ok(byToken.get(mint).ignitionGenome);
  assert.equal(byToken.get(variant).ignitionGenome, null);
});

test("duplicate exact routes consume one research slot without merging different pools", () => {
  const tokenAddress = "0x" + "a".repeat(40), pool = "0x" + "b".repeat(40), otherPool = "0x" + "c".repeat(40);
  const row = { chain: "base", tokenAddress, poolAddress: pool, research: { researchPriorityScore: 50 } };
  const report = synthesizeEdgeResearchQueue({ candidates: [row, { ...row, research: { researchPriorityScore: 80 } },
    { ...row, poolAddress: otherPool }] }, { candidates: [{ chain: "base", tokenAddress, poolAddress: pool,
    genome: { state: "BREAKOUT_GENOME_RESEMBLANCE", genomeResearchScore: 90, confidence: 0.9 } }] });
  assert.equal(report.synthesizedCandidates, 2);
  assert.equal(report.duplicateAdaptiveRows, 1);
  assert.equal(report.candidates.find(candidate => candidate.poolAddress === pool).adaptiveResearchScore, 80);
  assert.ok(report.candidates.find(candidate => candidate.poolAddress === pool).ignitionGenome);
  assert.equal(report.candidates.find(candidate => candidate.poolAddress === otherPool).ignitionGenome, null);
});

test("symbol-only and conflicting identities cannot borrow another project's research evidence", () => {
  const tokenAddress = "0x" + "1".repeat(40), other = "0x" + "2".repeat(40);
  const report = synthesizeEdgeResearchQueue({ candidates: [
    { chain: "base", symbol: "ONLY_SYMBOL", research: { researchPriorityScore: 100 } },
    { chain: "base", tokenAddress, identityKey: `base:${other}`, research: { researchPriorityScore: 100 } },
    { chain: "base", tokenAddress, canonicalChain: "bsc", research: { researchPriorityScore: 100 } },
    { chain: "base", tokenAddress, research: { researchPriorityScore: 50 } },
  ] }, { candidates: [{ chain: "base", symbol: "ONLY_SYMBOL", genome: { genomeResearchScore: 100 } }] });
  assert.equal(report.synthesizedCandidates, 1);
  assert.equal(report.rejectedIdentityRows, 4);
  assert.equal(report.candidates[0].identityKey, `base:${tokenAddress}`);
  assert.equal(report.candidates[0].ignitionGenome, null);
});

test("legacy lowercase IDs require independent exact non-EVM address fields", () => {
  const mint = "So11111111111111111111111111111111111111112";
  const report = synthesizeEdgeResearchQueue({ candidates: [{ chain: "solana", tokenAddress: mint,
    identityKey: `solana:${mint.toLowerCase()}`, research: { researchPriorityScore: 80 } }] }, {});
  assert.equal(report.candidates[0].identityKey, `solana:${mint}`);
});
