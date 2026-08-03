import test from "node:test";
import assert from "node:assert/strict";
import { runSlippageSensitivity, simulatePortfolio } from "../src/backtest/portfolioSimulationEngine.js";

function row(routeReady) {
  return {
    identityKey: "base:0x1111111111111111111111111111111111111111",
    scannedAt: "2026-01-01T00:00:00Z",
    score: 90,
    buyQuoteVerified: routeReady,
    sellQuoteVerified: routeReady,
    outcome: {
      status: "RESOLVED",
      exitObservedAt: "2026-01-08T00:00:00Z",
      returnAt168hPct: 80,
      maximumAdverseExcursionPct: -10,
      liquiditySurvived: true,
      targets: {
        plus100Within168h: { hit: true, observedAt: "2026-01-04T00:00:00Z" },
      },
    },
  };
}

test("strict simulation abstains without historical two-way route proof", () => {
  const result = simulatePortfolio([row(false)], { scorer: (item) => item.score, strict: true });
  assert.equal(result.status, "NO_ACTIONABLE_SELECTIONS");
  assert.equal(result.netReturnPct, null);
});

test("research and strict simulations remain separately labeled", () => {
  const sensitivity = runSlippageSensitivity([row(true)], { scorer: (item) => item.score });
  assert.equal(sensitivity.length, 4);
  assert.equal(sensitivity[0].strict.simulationType, "STRICT_VERIFIED_ROUTE");
  assert.equal(sensitivity[0].researchOnly.simulationType, "RESEARCH_ONLY_UNVERIFIED_ROUTE_ALLOWED");
  assert.ok(sensitivity[0].strict.netReturnPct > sensitivity.at(-1).strict.netReturnPct);
});
