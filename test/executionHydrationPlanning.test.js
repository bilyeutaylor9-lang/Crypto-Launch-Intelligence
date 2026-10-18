import test from "node:test";
import assert from "node:assert/strict";
import { analyzeActiveEvidenceRecoveryBatch, buildActiveEvidenceRecoveryWaves } from "../src/engines/activeEvidenceRecoveryEngine.js";
import { sourcesForField } from "../src/data/enrichmentSourceRegistry.js";
import { decisionCompleteProject } from "./fixtures/decisionCompleteProject.js";
import { analyzeExecutionProofRecoveryBatch } from "../src/engines/executionProofRecoveryEngine.js";

function quoteMissing(overrides = {}) {
  const project = decisionCompleteProject();
  return { ...project, ...overrides, executionProof: { ...project.executionProof,
    liveExecutionReady: false, buyQuoteVerified: false, sellQuoteVerified: false,
    executionProofState: "BUY_QUOTE_REQUIRED", routeTruthStatus: "BUY_QUOTE_REQUIRED",
    ...overrides.executionProof } };
}

test("actual missing execution proof creates a fresh wave 3 plan without a manifest input gap", () => {
  const project = quoteMissing();
  const result = buildActiveEvidenceRecoveryWaves([project], { freeOnly: true });
  assert.equal(result.waves.WAVE1.length, 0);
  assert.equal(result.waves.WAVE2.length, 0);
  assert.equal(result.waves.WAVE3.length, 1);
  assert.deepEqual(new Set(result.waves.WAVE3[0].entries.map((item) => item.field)),
    new Set(["purchaseRouteConfirmed", "sellRouteAvailable", "quoteTimestamp", "slippagePct"]));
  for (const entry of result.waves.WAVE3[0].entries) {
    assert.equal(entry.item.requiresFreshObservation, true);
    assert.equal(entry.coreEvidence, true);
    assert.deepEqual(entry.item.targetSources.map((item) => item.source), ["LI.FI keyless quote"]);
  }
});

test("wave 3 proof recovery honors execution priority and candidate limit", () => {
  const projects = [10, 80, 40].map((score) => quoteMissing({ symbol: `P${score}`, preliminaryOpportunityScore: score }));
  const result = buildActiveEvidenceRecoveryWaves(projects, { wave3Max: 1 });
  assert.equal(result.waves.WAVE3.length, 1);
  assert.equal(result.waves.WAVE3[0].project.symbol, "P80");
});

test("unrecoverable identity does not consume a top execution slot or disappear from diagnostics", async () => {
  const conflicting = quoteMissing({ preliminaryOpportunityScore: 99,
    finalContractAddress: "0x9999999999999999999999999999999999999999" });
  const valid = quoteMissing({ preliminaryOpportunityScore: 10 });
  const plan = buildActiveEvidenceRecoveryWaves([conflicting, valid], { wave3Max: 1 });
  assert.equal(plan.waves.WAVE3.length, 1);
  assert.equal(plan.waves.WAVE3[0].projectIndex, 1);
  assert.equal(plan.executionIdentityDeferredCandidates, 1);
  const [result] = await analyzeActiveEvidenceRecoveryBatch([conflicting], { wave1Max: 0, wave2Max: 0,
    providers: { fetch: async () => assert.fail("Conflicting identity must not request quotes") } });
  assert.equal(result.activeEvidenceRecovery.executionIdentityDeferred, true);
  assert.equal(result.activeEvidenceRecovery.providerExecution.requestsUsed, 0);
  assert.equal(result.activeEvidenceRecovery.batchSummary.executionIdentityDeferredCandidates, 1);
});

test("explicit CEX identity cannot fall back to DEX probes without an exact supported venue market", () => {
  const project = quoteMissing({ executionProof: { routeType: "CEX" } });
  assert.equal(buildActiveEvidenceRecoveryWaves([project]).waves.WAVE3.length, 0);
});

test("Wave3 is selected again after Wave1 recovers an exact missing pool", async () => {
  const token = "0x1111111111111111111111111111111111111111";
  const pool = "0x2222222222222222222222222222222222222222";
  const usdc = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
  const candidate = { name: "Hydrated Utility", symbol: "HYU", chain: "base", tokenAddress: token,
    contractAddress: token, identityVerified: true, contractVerified: true, instantSafetyStatus: "PASS",
    liquidityUsd: 260000, priceUsd: 0.006, deepEvaluationState: "DEEP_EVALUATED",
    executionProof: { routeType: "DEX", buyQuoteVerified: false, sellQuoteVerified: false },
    targetedEnrichmentPlan: { items: [{ canonicalField: "poolAddress", recoverable: true,
      evidenceClass: "CORE", targetSources: [{ source: "DexScreener" }] }] } };
  assert.equal(buildActiveEvidenceRecoveryWaves([candidate]).waves.WAVE3.length, 0);
  let quotes = 0;
  const [result] = await analyzeActiveEvidenceRecoveryBatch([candidate], {
    wave1Max: 1, wave2Max: 0, wave3Max: 1, maxProviderRequests: 5, useCache: false, walletHistory: false,
    providers: { fetch: async () => assert.fail("Deterministic fixture must not access the network"),
      getTokenPairs: async () => [{ chainId: "base", pairAddress: pool,
        baseToken: { address: token, symbol: "HYU", name: "Hydrated Utility" },
        quoteToken: { address: usdc, symbol: "USDC" }, liquidity: { usd: 260000 },
        volume: { h24: 100000 }, priceUsd: "0.006" }] },
    executionRecovery: { env: {}, lifiApiKey: "", jupiterApiKey: "", zeroxApiKey: "", tradeSizesUsd: [25],
      lifiRateBudget: { windowStartedAtMs: Date.now(), requests: 0 }, fetchJson: async (url) => {
        quotes++;
        const params = new URL(url).searchParams;
        const buy = params.get("toToken").toLowerCase() === token;
        return { tool: "aerodrome", action: { fromChainId: 8453, toChainId: 8453,
          fromAmount: params.get("fromAmount"),
          fromToken: { chainId: 8453, address: params.get("fromToken"), decimals: buy ? 6 : 18 },
          toToken: { chainId: 8453, address: params.get("toToken"), decimals: buy ? 18 : 6 } },
          estimate: { tool: "aerodrome", toAmount: buy ? "5000000000000000000" : "24750000",
            data: { protocols: [{ poolAddress: pool }] } } };
      } },
  });
  assert.equal(quotes, 2);
  assert.equal(result.executionProofRecoveryRoute.poolAddress, pool);
  assert.deepEqual(result.activeEvidenceRecovery.waves, ["WAVE1", "WAVE3"]);
  assert.equal(result.activeEvidenceRecovery.batchSummary.executionIdentityDeferredCandidates, 0);
  assert.equal(result.activeEvidenceRecovery.batchSummary.selectedWaveCounts.WAVE3, 1);
});

test("deferred, conclusively rejected and already quoted candidates do not receive fresh quote plans", () => {
  const candidates = [quoteMissing({ deepEvaluationState: "DEFERRED_BEFORE_DEEP" }),
    quoteMissing({ honeypotDetected: true, finalSelectionState: "BLOCKED" }), decisionCompleteProject(),
    decisionCompleteProject({ instantSafetyStatus: "UNKNOWN", safetyProofStatus: "UNKNOWN" })];
  assert.equal(buildActiveEvidenceRecoveryWaves(candidates).waves.WAVE3.length, 0);
});

test("Solana keyless mode does not route quotes to EVM or unimplemented providers", () => {
  const project = { chain: "solana", tokenAddress: "E6vtwCUtcNJdQEPGY8vWKahtu2sfwxQ4j68pUKm7pump",
    poolAddress: "So11111111111111111111111111111111111111112",
    deepEvaluationState: "DEEP_EVALUATED", executionProof: { routeType: "DEX", liveExecutionReady: false,
      executionProofState: "MARKET_OBSERVED", buyQuoteVerified: false, sellQuoteVerified: false } };
  assert.equal(buildActiveEvidenceRecoveryWaves([project], { freeOnly: true }).waves.WAVE3.length, 0);
  const keyed = buildActiveEvidenceRecoveryWaves([project], { freeOnly: false });
  assert.equal(keyed.waves.WAVE3.length, 1);
  assert.ok(keyed.waves.WAVE3[0].entries.every((entry) =>
    entry.item.targetSources.every((source) => source.source === "Jupiter (API key required)")));
});

test("CEX proof recovery uses implemented public order books rather than DEX adapters", () => {
  const project = quoteMissing({ exchange: "coinbase", marketPair: "BTCUSD", executionProof: { routeType: "CEX" } });
  const result = buildActiveEvidenceRecoveryWaves([project]);
  assert.equal(result.waves.WAVE3.length, 1);
  assert.ok(result.waves.WAVE3[0].entries.every((entry) =>
    entry.item.targetSources.every((source) => source.source === "CEX public order books")));
});

test("registry does not advertise unimplemented quote and bridge recovery", () => {
  const sources = sourcesForField("purchaseRouteConfirmed").map((source) => source.source);
  assert.equal(sources.includes("Uniswap quote adapters"), false);
  assert.equal(sources.includes("bridge quote adapters"), false);
  assert.equal(sourcesForField("bridgeRequired").length, 0);
});

test("normal pipeline deferral preserves raw route evidence and makes no unbudgeted quote call", async () => {
  const project = quoteMissing();
  const [deferred] = await analyzeExecutionProofRecoveryBatch([project], { deferToActiveEvidence: true,
    fetchJson: async () => { assert.fail("Quote acquisition must wait for the Wave3 request budget"); } });
  assert.equal(deferred.executionProofRecovery.status, "DEFERRED_TO_WAVE3");
  assert.equal(deferred.executionProofRecovery.attempted, false);
  assert.equal(deferred.executionProofRecoveryStage.attemptedCandidates, 0);
  assert.equal(deferred.canonicalExecutionRoute, project.canonicalExecutionRoute);
  assert.equal(buildActiveEvidenceRecoveryWaves([deferred]).waves.WAVE3.length, 1);
});
