import test from "node:test";
import assert from "node:assert/strict";

import {
  analyzeExecutionProofRecoveryBatch,
} from "../src/engines/executionProofRecoveryEngine.js";
import { analyzeExecutionProofBatch } from "../src/engines/executionProofEngine.js";
import { analyzeRouteAccessibilityBatch, summarizeRouteAccessibility } from "../src/engines/routeAccessibilityEngine.js";
import { summarizeExecutionProofRecovery } from "../src/reports/executionProofRecoveryReportEngine.js";
import { writeRouteAccessibilityReports } from "../src/reports/routeAccessibilityReportEngine.js";
import { summarizeDailySourceGaps } from "../src/reports/dailySourceGapReportEngine.js";

const NOW = new Date("2026-07-26T12:00:00.000Z");
const SOL_TOKEN = "So11111111111111111111111111111111111111112";
const SOL_POOL = "11111111111111111111111111111111";
const EVM_TOKEN = "0x1111111111111111111111111111111111111111";
const EVM_POOL = "0x2222222222222222222222222222222222222222";

function solProject(overrides = {}) {
  return {
    symbol: "SOLX",
    name: "Solana Utility",
    chain: "solana",
    tokenAddress: SOL_TOKEN,
    poolAddress: SOL_POOL,
    priceUsd: 0.004,
    liquidityUsd: 180_000,
    identityVerified: true,
    contractVerified: true,
    instantSafetyStatus: "PASS",
    highUpsideScalpScore: 88,
    earlyAsymmetryResearchPriorityScore: 86,
    capitalMigrationScore: 82,
    ...overrides,
  };
}

function evmProject(overrides = {}) {
  return {
    symbol: "EVX",
    name: "EVM Utility",
    chain: "base",
    tokenAddress: EVM_TOKEN,
    contractAddress: EVM_TOKEN,
    poolAddress: EVM_POOL,
    priceUsd: 0.006,
    liquidityUsd: 260_000,
    identityVerified: true,
    contractVerified: true,
    instantSafetyStatus: "PASS",
    highUpsideScalpScore: 82,
    earlyAsymmetryResearchPriorityScore: 80,
    capitalMigrationScore: 77,
    ...overrides,
  };
}

function jupiterMock({ sellSucceeds = true } = {}) {
  return async (url) => {
    const parsed = new URL(url);
    const inputMint = parsed.searchParams.get("inputMint");
    if (inputMint === SOL_TOKEN && !sellSucceeds) {
      return { outAmount: "0", routePlan: [] };
    }
    if (inputMint === SOL_TOKEN) {
      return {
        outAmount: "24900000",
        priceImpactPct: "0.21",
        routePlan: [{ swapInfo: { ammKey: SOL_POOL, label: "Raydium" } }],
      };
    }
    return {
      outAmount: "1000000000",
      priceImpactPct: "0.19",
      routePlan: [{ swapInfo: { ammKey: SOL_POOL, label: "Raydium" } }],
    };
  };
}

test("Solana buy and sell Jupiter quotes promote a candidate to depth-verified route state", async () => {
  const [recovered] = await analyzeExecutionProofRecoveryBatch([solProject()], {
    fetchJson: jupiterMock(),
    now: () => NOW,
    maxCandidates: 25,
  });

  assert.equal(recovered.executionProofRecovery.status, "ROUTE_RECOVERED");
  assert.equal(recovered.buyQuoteVerified, true);
  assert.equal(recovered.sellQuoteVerified, true);
  assert.equal(recovered.routeTruthStatus, "SELL_QUOTE_VERIFIED");
  assert.equal(recovered.executionProofRecoveryRoute.venue, "Jupiter");
  assert.equal(recovered.executionProofRecoveryRoute.executableDepthUsd, 25);
  assert.equal(recovered.executionProofRecoveryRoute.verifiedTradeSizeUsd, 25);
  assert.equal(recovered.canonicalExecutionRoute.executableDepthUsd, 25);
  assert.equal(recovered.canonicalExecutionRoute.quoteTokenAddress, "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
  assert.equal(recovered.canonicalExecutionRoute.slippageIsHeuristic, false);

  const [proof] = analyzeExecutionProofBatch([recovered]);
  assert.equal(proof.executionProofState, "ORDER_BOOK_DEPTH_VERIFIED");

  const routeSummary = summarizeRouteAccessibility(analyzeRouteAccessibilityBatch([recovered]));
  assert.ok(routeSummary.routeCount > 0);
});

test("buy quote without sell quote remains research-only", async () => {
  const [recovered] = await analyzeExecutionProofRecoveryBatch([solProject()], {
    fetchJson: jupiterMock({ sellSucceeds: false }),
    now: () => NOW,
  });

  assert.equal(recovered.executionProofRecovery.status, "BUY_ONLY_ROUTE");
  assert.equal(recovered.executionProofRecovery.buyQuoteVerified, true);
  assert.equal(recovered.sellQuoteVerified, undefined);
  assert.equal(recovered.executionProofRecoveryRoute, undefined);
});

test("stale quote blocks execution readiness even when route fields are otherwise strong", () => {
  const [proof] = analyzeExecutionProofBatch([
    evmProject({
      routeTruthStatus: "LIVE_EXECUTION_READY",
      buyQuoteVerified: true,
      sellQuoteVerified: true,
      quoteAgeSeconds: 7_200,
      estimatedRoundTripSlippagePct: 1.1,
      orderBookDepthUsd: 75_000,
      sellSimulationPassed: true,
      taxesVerified: true,
    }),
  ]);

  assert.notEqual(proof.executionProofState, "LIVE_EXECUTION_READY");
  assert.equal(proof.liveExecutionReady, false);
  assert.ok(proof.executionProof.failureReasons.some((reason) => /quote/i.test(reason)));
});

test("heuristic slippage never becomes live execution proof", () => {
  const [proof] = analyzeExecutionProofBatch([
    evmProject({
      routeTruthStatus: "LIVE_EXECUTION_READY",
      buyQuoteVerified: true,
      sellQuoteVerified: true,
      quoteAgeSeconds: 30,
      orderBookDepthUsd: 75_000,
      sellSimulationPassed: true,
      taxesVerified: true,
    }),
  ]);

  assert.notEqual(proof.executionProofState, "LIVE_EXECUTION_READY");
  assert.equal(proof.executionProof.slippageIsHeuristic, true);
});

test("missing optional 0x key creates an optional source gap, not a fatal candidate penalty", async () => {
  const [recovered] = await analyzeExecutionProofRecoveryBatch([evmProject()], {
    fetchJson: async () => {
      throw new Error("provider unavailable in unit test");
    },
    zeroxApiKey: "",
    now: () => NOW,
  });
  const recoveryReport = summarizeExecutionProofRecovery([recovered]);
  const sourceGaps = summarizeDailySourceGaps({
    sourceProbes: {
      dexscreener: { status: "success", lastCandidateCount: 8 },
      geckoterminal: { status: "success", pools: 3 },
    },
    executionProofRecovery: recoveryReport,
  });

  assert.equal(recovered.executionProofRecovery.status, "NO_ROUTE_RECOVERED");
  assert.ok(recovered.executionProofRecovery.optionalSourceGaps.some((gap) => gap.missingKey === "ZEROX_API_KEY"));
  assert.equal(sourceGaps.optionalMissingKeyCount, 1);
  assert.equal(sourceGaps.availableCount >= 2, true);
  assert.equal(sourceGaps.status, "SOURCE_HEALTH_OK");
});

test("CEX order-book depth does not prove token contract identity by itself", async () => {
  const [recovered] = await analyzeExecutionProofRecoveryBatch([
    {
      symbol: "BOOK",
      name: "Book Only",
      marketPair: "BOOKUSDT",
      priceUsd: 0.01,
      liquidityUsd: 0,
      highUpsideScalpScore: 75,
    },
  ], {
    fetchJson: async () => ({
      bids: [["0.0100", "10000"]],
      asks: [["0.0102", "10000"]],
    }),
    now: () => NOW,
  });
  const [proof] = analyzeExecutionProofBatch([recovered]);

  assert.equal(recovered.executionProofRecovery.status, "ROUTE_RECOVERED");
  assert.equal(recovered.executionProofRecoveryRoute.routeType, "CEX");
  assert.equal(recovered.executionProofRecoveryRoute.orderBookDepthVerified, true);
  assert.equal(proof.executionProof.contractVerified, false);
  assert.equal(proof.executionProofState, "MARKET_OBSERVED");
});

test("recovery respects max candidates and concurrency", async () => {
  let active = 0;
  let maxActive = 0;
  const recovered = await analyzeExecutionProofRecoveryBatch([
    solProject({ symbol: "ONE", tokenAddress: "So11111111111111111111111111111111111111112" }),
    solProject({ symbol: "TWO", tokenAddress: "So11111111111111111111111111111111111111113" }),
    solProject({ symbol: "THREE", tokenAddress: "So11111111111111111111111111111111111111114" }),
  ], {
    maxCandidates: 2,
    concurrency: 1,
    fetchJson: async (url) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return jupiterMock()(url);
    },
    now: () => NOW,
  });

  assert.equal(recovered.filter((project) => project.executionProofRecovery.attempted).length, 2);
  assert.equal(recovered.filter((project) => project.executionProofRecovery.status === "NOT_SELECTED").length, 1);
  assert.equal(maxActive, 1);
});

test("recovery timeout produces a safe no-route result", async () => {
  const [recovered] = await analyzeExecutionProofRecoveryBatch([solProject()], {
    timeoutMs: 5,
    requestTimeoutMs: 50,
    fetchJson: async (_url, init = {}) => {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, 100);
        init.signal?.addEventListener("abort", () => {
          clearTimeout(timer);
          reject(new Error("aborted by timeout"));
        }, { once: true });
      });
      return { outAmount: "1", routePlan: [{ swapInfo: { ammKey: SOL_POOL } }] };
    },
    now: () => NOW,
  });

  assert.equal(recovered.executionProofRecovery.attempted, true);
  assert.equal(recovered.executionProofRecovery.status, "NO_ROUTE_RECOVERED");
  assert.ok(recovered.executionProofRecovery.executionRecoveryFailures.some((failure) => /timeout|aborted/i.test(failure)));
});

test("route-universe report re-analyzes recovered routes when canonicalRoutes are absent", async () => {
  const [recovered] = await analyzeExecutionProofRecoveryBatch([solProject()], {
    fetchJson: jupiterMock(),
    now: () => NOW,
  });
  delete recovered.canonicalRoutes;

  const { report } = writeRouteAccessibilityReports([recovered], {
    scanRunId: "execution-proof-recovery-route-report-test",
  });

  assert.ok(report.routeCount > 0);
  assert.ok(report.routeUniverse.some((route) => route.venue === "Jupiter"));
});
