import test from "node:test";
import assert from "node:assert/strict";

import {
  analyzeScalpMicrostructure,
  analyzeScalpMicrostructureBatch,
  summarizeScalpMicrostructure,
} from "../src/engines/scalpMicrostructureEngine.js";

function candidate(overrides = {}) {
  return {
    name: "Microstructure Candidate",
    symbol: "MICRO",
    chain: "base",
    tokenAddress: "0x00000000000000000000000000000000000000aa",
    poolAddress: "0x00000000000000000000000000000000000000bb",
    purchaseRouteConfirmed: true,
    executionRouteAvailable: true,
    sellRouteAvailable: true,
    executionStatus: "VERIFIED",
    quoteAgeSeconds: 45,
    priceUsd: 0.004,
    priceChange24hPct: 18,
    priceChange7dPct: 64,
    liquidityUsd: 240_000,
    stableExitLiquidityUsd: 160_000,
    marketCap: 3_400_000,
    spreadPct: 0.35,
    estimatedRoundTripSlippagePct: 1.2,
    estimatedGasUsd: 0.2,
    estimatedFeesUsd: 0.05,
    capitalMigrationScore: 82,
    capitalFlowScore: 78,
    buyerBreadthAccelerationScore: 84,
    buyPressureScore: 80,
    liquidityFormationScore: 86,
    liquidityExpansionScore: 82,
    organicBuyerScore: 84,
    buyerRetentionScore: 80,
    organicDemandIntegrityScore: 82,
    sourceTruthScore: 86,
    sourceReliabilityScore: 84,
    institutionalDataProvenanceScore: 82,
    evidenceCoverageScore: 80,
    opportunityEvidenceCoverage: 82,
    contractAuthorityRiskScore: 4,
    liquidityControlRiskScore: 6,
    washTradingRiskScore: 5,
    walletClusterRiskScore: 6,
    deployerRiskScore: 5,
    sellPressureScore: 12,
    ...overrides,
  };
}

test("scalp microstructure qualifies only route-verified, low-cost, pre-extension setups", () => {
  const result = analyzeScalpMicrostructure(candidate());

  assert.equal(result.scalpMicrostructureLane, "SCALP_ACTIONABLE_RESEARCH");
  assert.equal(result.scalpResearchQualified, true);
  assert.equal(result.scalpNoTrade, false);
  assert.ok(result.scalpMicrostructureScore >= 78);
  assert.ok(result.scalpEstimatedTotalCostPct < 3);
});

test("scalp microstructure rejects already-extended late-chase moves", () => {
  const result = analyzeScalpMicrostructure(
    candidate({
      symbol: "CHASE",
      priceChange24hPct: 180,
      priceChange7dPct: 780,
      sevenDayTenXLateChaseStatus: "ALREADY_10X",
    })
  );

  assert.equal(result.scalpMicrostructureLane, "SCALP_NO_TRADE_LATE_CHASE");
  assert.equal(result.scalpNoTrade, true);
  assert.ok(result.scalpMicrostructureBlockers.includes("SCALP_LATE_CHASE_OR_ALREADY_EXTENDED"));
});

test("scalp microstructure rejects routes without a verified sell path", () => {
  const result = analyzeScalpMicrostructure(
    candidate({
      symbol: "NOSALE",
      sellRouteAvailable: false,
      executionStatus: "PARTIALLY_VERIFIED",
      proofOfAlphaExecutionTwin: { route: { detected: true, sellDetected: false } },
    })
  );

  assert.equal(result.scalpMicrostructureLane, "SCALP_NO_TRADE_ROUTE_BLOCK");
  assert.equal(result.scalpResearchQualified, false);
  assert.ok(result.scalpMicrostructureBlockers.includes("SCALP_BUY_AND_SELL_ROUTE_NOT_VERIFIED"));
});

test("scalp microstructure treats non-danger final blocks as missing route proof", () => {
  const result = analyzeScalpMicrostructure(
    candidate({
      symbol: "PROOF",
      finalSelectionState: "BLOCKED",
      finalSelectionBlockers: ["EXECUTION_EVIDENCE_MISSING", "SNIPER_EVIDENCE_FAMILY_QUORUM_MISSING"],
      sellRouteAvailable: false,
      executionStatus: "MARKET_OBSERVED",
    })
  );

  assert.equal(result.scalpMicrostructureLane, "SCALP_NO_TRADE_ROUTE_BLOCK");
  assert.ok(result.scalpMicrostructureBlockers.includes("SCALP_BUY_AND_SELL_ROUTE_NOT_VERIFIED"));
  assert.equal(result.scalpMicrostructureBlockers.includes("SCALP_SAFETY_BLOCK"), false);
});

test("scalp microstructure rejects thin or expensive routes for the intended trade size", () => {
  const thin = analyzeScalpMicrostructure(candidate({ symbol: "THIN", liquidityUsd: 4_000, stableExitLiquidityUsd: 4_000 }));
  const costly = analyzeScalpMicrostructure(
    candidate({
      symbol: "COST",
      spreadPct: 3,
      estimatedRoundTripSlippagePct: 8,
      estimatedGasUsd: 3,
      estimatedFeesUsd: 1,
    })
  );

  assert.equal(thin.scalpMicrostructureLane, "SCALP_NO_TRADE_THIN_LIQUIDITY");
  assert.equal(costly.scalpMicrostructureLane, "SCALP_NO_TRADE_HIGH_COST");
});

test("scalp microstructure report separates actionable research, watchlist, and no-trade lanes", () => {
  const analyzed = analyzeScalpMicrostructureBatch([
    candidate({ symbol: "GOOD" }),
    candidate({
      symbol: "WATCH",
      quoteAgeSeconds: 1200,
      liquidityUsd: 38_000,
      stableExitLiquidityUsd: 38_000,
      priceChange24hPct: 62,
      priceChange7dPct: 168,
    }),
    candidate({ symbol: "BAD", honeypotDetected: true }),
  ]);
  const report = summarizeScalpMicrostructure(analyzed, { scanRunId: "test-run" });

  assert.equal(report.status, "PASS");
  assert.equal(report.actionableResearchCount, 1);
  assert.equal(report.noTradeCount, 1);
  assert.equal(report.topScalpMicrostructureResearch[0].symbol, "GOOD");
  assert.equal(report.noTradeLanes[0].symbol, "BAD");
  assert.match(report.disclaimer, /not financial advice/i);
});
