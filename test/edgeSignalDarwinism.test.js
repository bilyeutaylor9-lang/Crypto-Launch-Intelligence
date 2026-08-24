import test from "node:test";
import assert from "node:assert/strict";

import {
  buildEdgeSignalDarwinism,
  classifyEpisodeOutcome,
  extractEdgeSignalKeys,
} from "../src/learning/edgeSignalDarwinism.js";

function episode(index, overrides = {}) {
  return {
    episodeId: `e-${index}`,
    role: "TREATMENT",
    signalPriceUsd: 1,
    frozenRoundTripExecutionCostBps: 100,
    signalDefinitionVersion: "TEST_V1",
    frozenFeatures: {
      liquidityUsd: 600_000,
      volume24hUsd: 2_000_000,
      marketCapUsd: 8_000_000,
      evidenceCoveragePct: 80,
      productionScore: 75,
      riskScore: 20,
      supplyVacuumSupported: true,
      globalMarketRegimeState: "RISK_ON",
    },
    ...overrides,
  };
}

function outcome(index, priceUsd, horizonHours = 24) {
  return {
    observationId: `o-${index}`,
    episodeId: `e-${index}`,
    horizonHours,
    priceUsd,
    observedAt: "2026-01-02T00:00:00.000Z",
    provenance: { verificationStatus: "EXACT_BASE_TOKEN_POOL_MATCH" },
  };
}

test("extracts aligned research signals from frozen episode features", () => {
  const keys = extractEdgeSignalKeys(episode(1));
  assert.ok(keys.includes("LIQUIDITY_GE_500K"));
  assert.ok(keys.includes("VOLUME_24H_GE_1M"));
  assert.ok(keys.includes("MARKET_CAP_LE_10M"));
  assert.ok(keys.includes("MARKET_REGIME:RISK_ON"));
});

test("classifies fixed-horizon net return after execution costs", () => {
  const row = classifyEpisodeOutcome(episode(1), outcome(1, 1.30));
  assert.equal(row.outcomeClass, "WIN");
  assert.equal(Number(row.netReturnPct.toFixed(2)), 29);
});

test("never uses non-exact outcome evidence", () => {
  const episodes = [episode(1)];
  const outcomes = [{
    ...outcome(1, 1.50),
    provenance: { verificationStatus: "SYMBOL_MATCH" },
  }];
  const report = buildEdgeSignalDarwinism(episodes, outcomes);
  assert.equal(report.matureTreatmentEpisodes, 0);
});

test("large strong sample can become evidence-verified", () => {
  const episodes = [];
  const outcomes = [];
  for (let i = 0; i < 80; i += 1) {
    episodes.push(episode(i));
    outcomes.push(outcome(i, i < 60 ? 1.30 : 0.80));
  }
  const report = buildEdgeSignalDarwinism(episodes, outcomes, {
    now: "2026-01-03T00:00:00.000Z",
  });
  const liquidity = report.signals.find((row) => row.signal === "LIQUIDITY_GE_500K");
  assert.ok(liquidity);
  assert.equal(liquidity.rankingEligible, true);
  assert.ok(["VERIFIED", "PRODUCTION_ELIGIBLE"].includes(liquidity.state));
});
