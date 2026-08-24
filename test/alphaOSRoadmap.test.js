import test from "node:test";
import assert from "node:assert/strict";

import { buildMarketRegimeBrain, learnRegimeSpecialistReliability } from "../src/production/marketRegimeBrain.js";
import { buildWalletEntityGraph, scoreWalletEntityReputation } from "../src/production/walletEntityIntelligence.js";
import { buildCapitalMigrationForecast } from "../src/production/capitalMigrationForecastEngine.js";
import { estimateOpportunityHalfLife } from "../src/production/opportunityHalfLifeEngine.js";
import { computeExecutionAwareEV } from "../src/production/executionAwareExpectedValue.js";
import { buildNarrativeEvidenceGraph, scoreNarrativePropagation } from "../src/production/narrativeCausalGraph.js";
import { attributeAlpha } from "../src/production/alphaAttributionEngine.js";
import { nextBestResearchAction } from "../src/production/activeResearchController.js";
import { createDigitalTwin, updateDigitalTwin } from "../src/production/digitalTwinEngine.js";
import { replayMarketEvents } from "../src/production/historicalEventReplay.js";
import { generateModelChallengers, evaluateModelChallenger } from "../src/production/modelFactory.js";
import { learnMetaWeights, applyMetaWeights } from "../src/production/metaLearningController.js";
import { buildResearchAgentPacket } from "../src/production/researchAgentNetwork.js";
import { governAlphaOpportunity } from "../src/production/alphaOSGovernor.js";
import { buildAutonomousAlphaOS } from "../src/production/autonomousAlphaOS.js";

const token = (n) => `0x${String(n).padStart(40, "0")}`;

test("regime brain detects broad risk-on expansion", () => {
  const projects = Array.from({ length: 30 }, (_, i) => ({ priceChange24hPct: i < 25 ? 12 : -2, liquidityGrowthPct: 20, volumeAccelerationPct: 30, marketCapUsd: 10_000_000 }));
  const result = buildMarketRegimeBrain({ btcReturn24hPct: 4, stablecoinLiquidityChangePct: 2, dexVolumeChangePct: 30, marketVolatilityPercentile: 40, altBreadthPct: 75 }, projects);
  assert.ok(["LIQUIDITY_EXPANSION_RISK_ON", "TRENDING_RISK_ON"].includes(result.state));
  assert.ok(result.specialistBias.capital >= 1);
});

test("regime specialist reliability favors lower Brier error", () => {
  const rows = [];
  for (let i = 0; i < 40; i += 1) {
    rows.push({ regime: "RISK", expert: "GOOD", probability: i % 2 ? .9 : .1, actual: i % 2 ? 1 : 0 });
    rows.push({ regime: "RISK", expert: "BAD", probability: .5, actual: i % 2 ? 1 : 0 });
  }
  const result = learnRegimeSpecialistReliability(rows, { minimumSamples: 20 });
  assert.ok(result.RISK.GOOD.reliability > result.RISK.BAD.reliability);
});

test("wallet entity graph clusters wallets sharing timed funding source", () => {
  const events = [
    { wallet: "w1", counterparty: "fund", type: "CEX_OUTFLOW", timestamp: "2026-01-01T00:00:00Z", amountUsd: 1000 },
    { wallet: "w2", counterparty: "fund", type: "CEX_OUTFLOW", timestamp: "2026-01-01T00:20:00Z", amountUsd: 1000 },
    { wallet: "w3", counterparty: "other", type: "CEX_OUTFLOW", timestamp: "2026-01-01T00:20:00Z", amountUsd: 1000 },
  ];
  const graph = buildWalletEntityGraph(events, { sharedFundingWindowMinutes: 90 });
  assert.equal(graph.entities.length, 2);
  assert.equal(graph.walletToEntity.w1, graph.walletToEntity.w2);
  assert.notEqual(graph.walletToEntity.w1, graph.walletToEntity.w3);
});

test("wallet reputation requires forward history", () => {
  const entity = { entityId: "entity:x" };
  const report = scoreWalletEntityReputation(entity, [{ entityId: "entity:x", returnPct: 50 }]);
  assert.equal(report.state, "INSUFFICIENT_FORWARD_HISTORY");
});

test("capital migration forecast recognizes destination", () => {
  const current = [{ identityKey: "base:a", chain: "base", capitalMigrationScore: 90, capitalIntentGraphScore: 80, capitalFlowBaseline: { netFlowUsd: 900000 }, narratives: ["ai"] }];
  const result = buildCapitalMigrationForecast(current, [], { now: "2026-01-02T00:00:00Z" });
  assert.ok(result.candidates[0].capitalMigrationForecastScore > 60);
});

test("half life marks older opportunity as more consumed", () => {
  const history = [
    { identityKey: "base:a", observedAt: "2026-01-01T00:00:00Z", combinedResearchScore: 80 },
    { identityKey: "base:a", observedAt: "2026-01-01T03:00:00Z", combinedResearchScore: 60 },
    { identityKey: "base:a", observedAt: "2026-01-01T06:00:00Z", combinedResearchScore: 40 },
  ];
  const result = estimateOpportunityHalfLife({ identityKey: "base:a" }, history, { now: "2026-01-01T06:00:00Z" });
  assert.ok(result.opportunityConsumedPct > 40);
});

test("execution-aware EV penalizes failed routes", () => {
  const good = computeExecutionAwareEV({ probability25Pct: 70, probability50Pct: 50, probability100Pct: 20, probabilityLoss20Pct: 10, liquidityUsd: 1_000_000, routeTruthStatus: "VERIFIED", estimatedRoundTripSlippagePct: 1 });
  const bad = computeExecutionAwareEV({ probability25Pct: 70, probability50Pct: 50, probability100Pct: 20, probabilityLoss20Pct: 10, liquidityUsd: 1_000_000, routeTruthStatus: "FAILED", estimatedRoundTripSlippagePct: 1 });
  assert.ok(good.captureableExpectedValuePct > bad.captureableExpectedValuePct);
  assert.equal(bad.state, "EXECUTION_BLOCKED");
});

test("narrative graph keeps causal claim disabled", () => {
  const project = { identityKey: "base:a", chain: "base", symbol: "A", narratives: ["ai"], catalysts: [{ title: "launch", verified: true, announcedAt: "2026-01-01T00:00:00Z" }], capitalMigrationForecastScore: 80, attentionGapScore: 80, priceChange24hPct: 5 };
  const graph = buildNarrativeEvidenceGraph([project]);
  const score = scoreNarrativePropagation(project, graph);
  assert.equal(score.causalClaimAllowed, false);
  assert.ok(score.narrativePropagationScore > 40);
});

test("alpha attribution sums to realized return", () => {
  const result = attributeAlpha({ regimeCompatibilityScore: 80, walletEntityScore: 70, capitalMigrationForecastScore: 75, multiscaleGenomeScore: 80, narrativePropagationScore: 65, executionAwareEV: { routeQuality: .9 }, adaptiveResearchScore: 70 }, { realizedReturnPct: 50 });
  const sum = result.components.reduce((a, b) => a + (b.attributedRealizedReturnPct || 0), 0) + (result.unexplainedRealizedReturnPct || 0);
  assert.ok(Math.abs(sum - 50) < 0.02);
});

test("active research prioritizes missing exact identity", () => {
  const plan = nextBestResearchAction({ symbol: "A", combinedResearchScore: 64, confidencePct: 20 });
  assert.equal(plan.rankedActions.find((a) => a.evidenceFamily === "IDENTITY").missing, true);
});

test("digital twin captures material state transition", () => {
  const first = createDigitalTwin({ identityKey: "base:a", priceUsd: 1, liquidityUsd: 100000, globalMarketRegimeState: "A" }, { observedAt: "2026-01-01T00:00:00Z" });
  const next = updateDigitalTwin(first, { identityKey: "base:a", priceUsd: 1.5, liquidityUsd: 150000, globalMarketRegimeState: "B" }, { observedAt: "2026-01-01T01:00:00Z" });
  assert.ok(next.materialChanges.length >= 3);
  assert.equal(next.version, 2);
});

test("historical replay rejects future events beyond cutoff", () => {
  const report = replayMarketEvents([{ type: "BUY", timestamp: "2026-01-02T00:00:00Z", identityKey: "base:a" }], (state) => ({ n: (state.n || 0) + 1 }), {}, { cutoff: "2026-01-01T00:00:00Z" });
  assert.equal(report.audit.replayedEvents, 0);
  assert.equal(report.audit.rejected.length, 1);
});

test("model factory freezes challengers and never auto promotes", () => {
  const challengers = generateModelChallengers({ now: "2026-01-01T00:00:00Z" });
  assert.ok(challengers.length >= 10);
  const evaluated = evaluateModelChallenger(challengers[0], [], { minimumForwardSamples: 1 });
  assert.equal(evaluated.automaticPromotion, false);
});

test("meta learner gives greater weight to accurate expert", () => {
  const rows = [];
  for (let i = 0; i < 120; i += 1) {
    const actual = i % 2;
    rows.push({ regime: "R", expert: "GOOD", probability: actual ? .9 : .1, actual });
    rows.push({ regime: "R", expert: "BAD", probability: actual ? .2 : .8, actual });
  }
  const meta = learnMetaWeights(rows, "R");
  assert.ok(meta.weights.GOOD > meta.weights.BAD);
  const combined = applyMetaWeights([{ name: "GOOD", probability: .8 }, { name: "BAD", probability: .2 }], meta);
  assert.ok(combined.probability > .5);
});

test("research agent network is structured and non-trading", () => {
  const packet = buildResearchAgentPacket({ identityKey: "base:a", regimeCompatibilityScore: 80, walletEntityScore: 75, capitalMigrationForecastScore: 70 });
  assert.equal(packet.policy.noAgentCanTrade, true);
  assert.ok(packet.supportCount >= 3);
});

test("alpha governor cannot influence production without verified edge and readiness", () => {
  const packet = buildResearchAgentPacket({ identityKey: "base:a", regimeCompatibilityScore: 90, walletEntityScore: 90, capitalMigrationForecastScore: 90, multiscaleGenomeScore: 90, narrativePropagationScore: 80, executionAwareEV: { captureableExpectedValuePct: 30 } });
  const result = governAlphaOpportunity({ combinedResearchScore: 90, regimeCompatibilityScore: 90, executionAwareEV: { captureableExpectedValuePct: 30 }, opportunityHalfLife: { lateChaseProbabilityPct: 10 }, agentPacket: packet }, { edgeVerification: { edgeState: "NO_VERIFIED_EDGE" }, productionReadiness: { state: "NOT_PRODUCTION_READY" } });
  assert.equal(result.productionRankingInfluenceAllowed, false);
  assert.equal(result.canaryEligibility, false);
});

test("Autonomous Alpha OS remains research-only", () => {
  const result = buildAutonomousAlphaOS({ projects: [{ identityKey: "base:a", chain: "base", tokenAddress: token(1), symbol: "A", capitalMigrationScore: 80, priceUsd: 1, liquidityUsd: 500000, probability25Pct: 60, probability50Pct: 40, probability100Pct: 15, probabilityLoss20Pct: 10 }] }, { now: "2026-01-01T00:00:00Z" });
  assert.equal(result.system, "CLI_5_AUTONOMOUS_ALPHA_OS");
  assert.equal(result.policy.automaticTrading, false);
  assert.equal(result.policy.automaticPromotion, false);
});
