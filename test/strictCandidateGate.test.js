import test from "node:test";
import assert from "node:assert/strict";

import { resolveStrictCandidateGate } from "../src/execution/routeResolver.js";
import { summarizeHottestTenNow } from "../src/reports/hottestTenNowReportEngine.js";

const BASE_USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
const TOKEN_A = "0x1111111111111111111111111111111111111111";
const TOKEN_B = "0x3333333333333333333333333333333333333333";
const POOL_A = "0x2222222222222222222222222222222222222222";
const POOL_B = "0x4444444444444444444444444444444444444444";

function verifiedCandidate(overrides = {}) {
  return {
    name: "Agent Utility Network",
    tokenName: "Agent Utility Network",
    symbol: "AGENT",
    chain: "base",
    chainId: 8453,
    contractAddress: TOKEN_A,
    tokenAddress: TOKEN_A,
    pairAddress: POOL_A,
    poolAddress: POOL_A,
    dexName: "Aerodrome",
    dex: "Aerodrome",
    baseTokenAddress: TOKEN_A,
    quoteTokenAddress: BASE_USDC,
    quoteAsset: "USDC",
    discoverySources: ["dexscreener", "geckoterminal"],
    source: "dexscreener",
    priceUsd: 0.004,
    marketCap: 3_000_000,
    liquidityUsd: 220_000,
    dexLiquidityUsd: 220_000,
    volume24h: 130_000,
    volume24hUsd: 130_000,
    routeTruthStatus: "LIVE_EXECUTION_READY",
    executionProofState: "LIVE_EXECUTION_READY",
    buyQuoteVerified: true,
    sellQuoteVerified: true,
    quoteAgeSeconds: 30,
    estimatedRoundTripSlippagePct: 0.8,
    slippageIsHeuristic: false,
    exactIdentityVerified: true,
    regionStatus: "CONFIRMED_AVAILABLE",
    utilityClassification: "REAL_UTILITY",
    utilityQualityScore: 84,
    realUtilityScore: 82,
    sevenDayTenXScore: 86,
    preBreakoutRadarScore: 82,
    preConsensusBreakoutScore: 80,
    earlyAsymmetryResearchPriorityScore: 84,
    capitalMigrationScore: 82,
    buyerBreadthAccelerationScore: 84,
    liquidityFormationScore: 84,
    sourceTruthScore: 84,
    sourceReliabilityScore: 82,
    evidenceCoverageScore: 82,
    trapRiskScore: 4,
    contractAuthorityRiskScore: 4,
    liquidityControlRiskScore: 5,
    washTradingRiskScore: 5,
    walletClusterRiskScore: 6,
    sellPressureScore: 8,
    ...overrides,
  };
}

test("SOL on Base/BSC does not merge with native SOL and is quarantined without wrapper proof", () => {
  const nativeSol = resolveStrictCandidateGate({
    name: "Solana",
    symbol: "SOL",
    chain: "solana",
  });
  const imitationSol = resolveStrictCandidateGate(verifiedCandidate({
    name: "Solana",
    symbol: "SOL",
    chain: "bsc",
    chainId: 56,
    contractAddress: TOKEN_B,
    tokenAddress: TOKEN_B,
    pairAddress: POOL_B,
    poolAddress: POOL_B,
    dexName: "PancakeSwap",
    dex: "PancakeSwap",
    baseTokenAddress: TOKEN_B,
    quoteTokenAddress: "0x55d398326f99059ff775485246999027b3197955",
    quoteAsset: "USDT",
  }));

  assert.equal(nativeSol.strictCandidateLane, "MARKET_BENCHMARK");
  assert.equal(imitationSol.strictCandidateLane, "QUARANTINED_IDENTITY_OR_ROUTE");
  assert.equal(imitationSol.candidateQuarantineReason, "NATIVE_ASSET_MISMATCH");
  assert.notEqual(imitationSol.canonicalId, nativeSol.canonicalId);
});

test("identical symbols on the same chain stay separated by canonical contract id", () => {
  const first = resolveStrictCandidateGate(verifiedCandidate({ symbol: "AGENT", contractAddress: TOKEN_A, tokenAddress: TOKEN_A, pairAddress: POOL_A, poolAddress: POOL_A }));
  const second = resolveStrictCandidateGate(verifiedCandidate({ symbol: "AGENT", contractAddress: TOKEN_B, tokenAddress: TOKEN_B, pairAddress: POOL_B, poolAddress: POOL_B, baseTokenAddress: TOKEN_B }));

  assert.equal(first.strictRankEligible, true);
  assert.equal(second.strictRankEligible, true);
  assert.notEqual(first.canonicalId, second.canonicalId);
  assert.equal(first.canonicalId, `8453:${TOKEN_A}`);
  assert.equal(second.canonicalId, `8453:${TOKEN_B}`);
});

test("symbol-only projects cannot enter hottest-ten ranked opportunity lanes", () => {
  const report = summarizeHottestTenNow([
    verifiedCandidate({
      symbol: "PONS",
      name: "Pons",
      chain: "robinhood-chain",
      contractAddress: null,
      tokenAddress: null,
      pairAddress: null,
      poolAddress: null,
      baseTokenAddress: null,
    }),
  ]);

  assert.equal(report.topTenResearchWorthy.length, 0);
  assert.equal(report.quarantinedIdentityOrRoute[0].quarantineReason, "CONTRACT_MISSING");
});

test("unsupported chains are quarantined before ranking", () => {
  const gate = resolveStrictCandidateGate(verifiedCandidate({
    chain: "gaming",
    chainId: "gaming",
  }));

  assert.equal(gate.strictRankEligible, false);
  assert.equal(gate.candidateQuarantineReason, "UNSUPPORTED_CHAIN");
});

test("missing sell route blocks promotion even when the project has strong opportunity signals", () => {
  const report = summarizeHottestTenNow([
    verifiedCandidate({
      symbol: "NOSALE",
      routeTruthStatus: "BUY_QUOTE_VERIFIED",
      executionProofState: "BUY_QUOTE_VERIFIED",
      sellQuoteVerified: false,
    }),
  ]);

  assert.equal(report.topTenResearchWorthy.length, 0);
  assert.equal(report.quarantinedIdentityOrRoute[0].quarantineReason, "SELL_ROUTE_FAILED");
});

test("unknown region produces an explicit quarantine reason", () => {
  const gate = resolveStrictCandidateGate(verifiedCandidate({
    regionStatus: "UNKNOWN",
  }));

  assert.equal(gate.strictRankEligible, false);
  assert.equal(gate.candidateQuarantineReason, "REGION_UNVERIFIED");
  assert.ok(gate.candidateQuarantineReasons.includes("REGION_UNVERIFIED"));
});

test("established native assets stay in market benchmark lane", () => {
  for (const asset of [
    { symbol: "ETH", chain: "ethereum" },
    { symbol: "BNB", chain: "bsc" },
    { symbol: "SOL", chain: "solana" },
    { symbol: "BTC", chain: "bitcoin" },
  ]) {
    const gate = resolveStrictCandidateGate(asset);
    assert.equal(gate.strictCandidateLane, "MARKET_BENCHMARK");
    assert.equal(gate.strictRankEligible, false);
  }
});
