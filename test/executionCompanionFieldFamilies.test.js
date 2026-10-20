import test from "node:test";
import assert from "node:assert/strict";
import {
  recoveryDispositionForField,
  sourceFamilyForField,
  sourcesForField,
} from "../src/data/enrichmentSourceRegistry.js";
import { routeMissingEvidence } from "../src/data/targetedEnrichmentRouter.js";
import {
  createActiveEvidenceExecutionState,
  executeActiveEvidenceProviderRequests,
} from "../src/data/activeEvidenceProviderExecutor.js";
import {
  analyzeActiveEvidenceRecoveryBatch,
  buildActiveEvidenceRecoveryWaves,
} from "../src/engines/activeEvidenceRecoveryEngine.js";

const NOW = new Date("2026-10-18T09:45:00.000Z");
const COMPANIONS = ["executableDepthUsd", "verifiedTradeSizeUsd"];
const QUOTE_FIELDS = ["purchaseRouteConfirmed", "sellRouteAvailable", "quoteTimestamp", "slippagePct"];
const SOL_TOKEN = "66wLt8u1BmvqWb2Wks7NiVeuvNC9NsmrDUVu777YuHzW";
const SOL_POOL = "GJ2uhUVnzBj96uxp5b2hX9oJ9k6jX5DnwxYxPneNHfNe";
const SOL_USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const EVM_TOKEN = "0x1111111111111111111111111111111111111111";
const EVM_POOL = "0x2222222222222222222222222222222222222222";
const FIXTURES = [
  { provider: "raydium", source: "Raydium Trade API", chain: "solana", token: SOL_TOKEN, pool: SOL_POOL },
  { provider: "lifi", source: "LI.FI keyless quote", chain: "base", token: EVM_TOKEN, pool: EVM_POOL },
];

test.beforeEach((t) => {
  t.mock.method(globalThis, "fetch", async () => assert.fail("Provider HTTP is forbidden in these regressions"));
});

function candidate(fixture, overrides = {}) {
  return { name: "Execution companion fixture", symbol: "ECF", chain: fixture.chain,
    tokenAddress: fixture.token, contractAddress: fixture.token, poolAddress: fixture.pool,
    deepEvaluationState: "DEEP_EVALUATED", ...overrides };
}

function quote(fixture, url) {
  const params = new URL(url).searchParams;
  if (fixture.provider === "raydium") {
    const inputMint = params.get("inputMint");
    const outputMint = params.get("outputMint");
    const buy = inputMint === SOL_USDC;
    return { id: `fixture-${inputMint}-${outputMint}`, success: true, data: {
      swapType: "BaseIn", chainId: "solana", inputMint, outputMint, inputAmount: params.get("amount"),
      outputAmount: buy ? "1500000000" : "24750000",
      otherAmountThreshold: buy ? "1485000000" : "24502500", slippageBps: 100, priceImpactPct: 0.01,
      routePlan: [{ poolId: fixture.pool, inputMint, outputMint }],
    } };
  }
  const buy = params.get("toToken").toLowerCase() === fixture.token;
  const chainId = Number(params.get("fromChain"));
  return { tool: "aerodrome", action: { fromChainId: chainId, toChainId: chainId,
    fromAmount: params.get("fromAmount"),
    fromToken: { chainId, address: params.get("fromToken"), decimals: buy ? 6 : 18 },
    toToken: { chainId, address: params.get("toToken"), decimals: buy ? 18 : 6 } },
    estimate: { tool: "aerodrome", toAmount: buy ? "5000000000000000000" : "24750000",
      data: { protocols: [{ poolAddress: fixture.pool }] } } };
}

function options(fetchJson) {
  return { now: () => NOW.getTime(), maxRequests: 14, concurrency: 1, providerTimeoutMs: 500,
    wave1Max: 0, wave2Max: 0, wave3Max: 7, freeOnly: true, walletHistory: false, useCache: false,
    executionRecovery: { env: {}, enabled: true, lifiEnabled: true, raydiumEnabled: true,
      lifiApiKey: "", jupiterApiKey: "", zeroxApiKey: "", tradeSizesUsd: [25], fetchJson,
      raydiumRateBudget: { startedAt: null, requests: 0, retryAt: 0 },
      lifiRateBudget: { windowStartedAtMs: NOW.getTime(), requests: 0 } } };
}

function requests(fields, fixture) {
  return fields.map((field) => ({ field, item: { canonicalField: field, requiresFreshObservation: true,
    ...routeMissingEvidence({ canonicalField: field }, { chain: fixture.chain, routeType: "DEX", freeOnly: true }) } }));
}

function assertProvenance(record, fixture, token = fixture.token) {
  assert.equal(record.source, fixture.provider);
  assert.equal(record.sourceTimestamp, NOW.toISOString());
  assert.equal(record.verificationStatus, "VERIFIED_PROVIDER_OBSERVATION");
  assert.equal(record.confidence, 0.9);
  assert.equal(record.chain, fixture.chain);
  assert.equal(record.tokenAddress, token);
  assert.equal(record.poolAddress, fixture.pool);
  assert.equal(record.identityMatchMode, "exact-chain-contract-pool");
  assert.equal(record.recoveryRun, true);
}

test("quote depth and size are raw EXECUTION fields with only implemented, applicable sources", () => {
  for (const field of COMPANIONS) {
    assert.equal(sourceFamilyForField(field), "EXECUTION");
    for (const routeType of ["DEX", "DEX_AGGREGATOR", "AGGREGATOR"]) {
      assert.deepEqual(sourcesForField(field, { chain: "solana", routeType }).map((source) => source.source),
        ["Raydium Trade API", "Jupiter (API key required)"]);
      assert.deepEqual(sourcesForField(field, { chain: "base", routeType }).map((source) => source.source),
        ["LI.FI keyless quote", "0x Swap API"]);
    }
    assert.deepEqual(sourcesForField(field, { chain: "solana", routeType: "CEX" }).map((source) => source.source),
      ["CEX public order books"]);
    assert.deepEqual(sourcesForField(field, { chain: "bitcoin", routeType: "DEX" }), []);
    assert.deepEqual(sourcesForField(field, { chain: "solana", routeType: "BRIDGE" }), []);
    assert.equal(recoveryDispositionForField(field, { chain: "solana" }), "RAW_RECOVERABLE");
    assert.equal(recoveryDispositionForField(field, { chain: "bitcoin" }), "UNAVAILABLE_WITH_CURRENT_PROVIDERS");
    assert.equal(recoveryDispositionForField(field, { chain: "solana", applicability: "NOT_APPLICABLE" }), "NOT_APPLICABLE");
    const routed = routeMissingEvidence({ canonicalField: field }, { chain: "solana", freeOnly: true });
    assert.equal(routed.evidenceFamily, "EXECUTION");
    assert.equal(routed.recomputeAfterRecovery, false);
    assert.deepEqual(routed.targetSources.map((source) => source.source), ["Raydium Trade API"]);
  }
});

for (const fixture of FIXTURES) {
  test(`${fixture.source}: companion-only requests use the real active executor and preserve raw provenance`, async () => {
    const calls = [];
    const opts = options(async (url, init) => {
      assert.equal(init.adapter, fixture.provider);
      calls.push(url);
      return quote(fixture, url);
    });
    const original = candidate(fixture);
    const snapshot = structuredClone(original);
    const state = createActiveEvidenceExecutionState(opts);
    const result = await executeActiveEvidenceProviderRequests(original, requests(COMPANIONS, fixture), opts, state);
    assert.equal(calls.length, 2);
    assert.equal(state.requestsUsed, 2);
    const buy = new URL(calls[0]).searchParams;
    const sell = new URL(calls[1]).searchParams;
    assert.equal(buy.get(fixture.provider === "raydium" ? "amount" : "fromAmount"), "25000000");
    assert.equal(sell.get(fixture.provider === "raydium" ? "amount" : "fromAmount"),
      fixture.provider === "raydium" ? "1500000000" : "5000000000000000000");
    for (const field of COMPANIONS) {
      const observation = result.observations.find((item) => item.field === field);
      assert.ok(observation, field);
      assert.equal(observation.value, 25);
      assertProvenance(observation, fixture);
    }
    assert.ok(result.observations.every((item) => sourceFamilyForField(item.field) === "EXECUTION"));
    assert.deepEqual(Object.keys(result.projectPatch), ["executionProofRecoveryRoute"]);
    const route = result.projectPatch.executionProofRecoveryRoute;
    assert.equal(route.verifiedDepthSource, "live-buy-sell-quote");
    assert.equal(route.buyQuoteVerified, true);
    assert.equal(route.sellQuoteVerified, true);
    for (const field of ["executionScore", "liveExecutionReady", "finalSelectionQualified", "strictRankEligible",
      "safetyVerified", "taxesVerified", "executionProofState", "routeTruthStatus"]) {
      assert.equal(Object.hasOwn(route, field), false, field);
    }
    assert.deepEqual(original, snapshot);
  });

  test(`${fixture.source}: wrong-chain responses on either quote leg never promote companion evidence`, async () => {
    for (const badLeg of [1, 2]) {
      let calls = 0;
      const opts = options(async (url) => {
        const response = quote(fixture, url);
        if (++calls === badLeg) {
          if (fixture.provider === "raydium") response.data.chainId = "base";
          else response.action.toToken.chainId = 1;
        }
        return response;
      });
      const result = await executeActiveEvidenceProviderRequests(candidate(fixture), requests(COMPANIONS, fixture), opts);
      assert.equal(calls, badLeg);
      assert.deepEqual(result.observations, []);
      assert.deepEqual(result.projectPatch, {});
    }
  });
}

test("seven exact Raydium BUY+SELL recoveries report EXECUTION 56 with no UNKNOWN companion bucket", async () => {
  const fixture = FIXTURES[0];
  let calls = 0;
  const opts = options(async (url, init) => {
    assert.equal(init.adapter, "raydium");
    calls++;
    return quote(fixture, url);
  });
  const projects = Array.from({ length: 7 }, (_, index) => {
    const token = `${SOL_TOKEN.slice(0, -1)}${index + 1}`;
    return candidate(fixture, { tokenAddress: token, contractAddress: token,
      targetedEnrichmentPlan: { items: requests(QUOTE_FIELDS, fixture).map((request) => request.item) } });
  });
  const snapshot = structuredClone(projects);
  const recovered = await analyzeActiveEvidenceRecoveryBatch(projects, opts);
  assert.equal(calls, 14);
  for (const project of recovered) {
    const report = project.activeEvidenceRecovery;
    assert.deepEqual(report.batchSummary.recoveredFieldsByFamily, { EXECUTION: 56 });
    assert.equal(Object.hasOwn(report.batchSummary.recoveredFieldsByFamily, "UNKNOWN"), false);
    assert.deepEqual(report.changedEvidenceFamilies, ["EXECUTION"]);
    assert.equal(report.batchSummary.providerRequestsUsed, 14);
    assert.deepEqual(new Set(report.attemptedFields), new Set(QUOTE_FIELDS));
    assert.equal(report.recoveredFields.length, 8);
    for (const field of COMPANIONS) {
      assert.equal(project[field], 25);
      assert.equal(report.attemptedFields.includes(field), false);
      assertProvenance(project.fieldProvenance[field], fixture, project.tokenAddress);
      assert.equal(project.fieldProvenance[field].value, 25);
    }
    for (const field of ["executionScore", "liveExecutionReady", "finalSelectionQualified", "strictRankEligible", "safetyVerified"]) {
      assert.equal(Object.hasOwn(project, field), false, field);
    }
  }
  assert.deepEqual(projects, snapshot);
});

test("derived scores and unsupported fields never become companion provider requests or recovered observations", async () => {
  const fixture = FIXTURES[0];
  const derived = ["executionScore", "executionProofState", "finalSelectionQualified"];
  const unsupported = ["bridgeRequired", "executionStatus", "unsupportedQuoteDepthUsd"];
  for (const field of derived) {
    assert.equal(sourceFamilyForField(field), "DERIVED");
    assert.equal(recoveryDispositionForField(field), "DERIVED_RECOMPUTE");
    assert.deepEqual(sourcesForField(field), []);
  }
  for (const field of unsupported) {
    assert.equal(recoveryDispositionForField(field), "UNAVAILABLE_WITH_CURRENT_PROVIDERS");
    assert.deepEqual(sourcesForField(field), []);
  }
  const entries = requests([...derived, ...unsupported], fixture);
  const project = candidate(fixture, { targetedEnrichmentPlan: { items: entries.map((entry) => entry.item) } });
  assert.equal(buildActiveEvidenceRecoveryWaves([project]).waves.WAVE3.length, 0);
  const opts = options(async () => assert.fail("Derived and unsupported fields must not request provider evidence"));
  const state = createActiveEvidenceExecutionState(opts);
  const result = await executeActiveEvidenceProviderRequests(project, entries, opts, state);
  assert.equal(state.requestsUsed, 0);
  assert.deepEqual(result.observations, []);
  assert.deepEqual(result.projectPatch, {});
});

test("companion requests retain exact-identity and observed transfer-restriction gates", async () => {
  const fixture = FIXTURES[0];
  const opts = options(async () => assert.fail("Blocked companion acquisition must not reach a provider"));
  for (const overrides of [{ chain: "base" }, { canonicalChain: "base" }, { sellRestricted: true }]) {
    const state = createActiveEvidenceExecutionState(opts);
    const result = await executeActiveEvidenceProviderRequests(candidate(fixture, overrides), requests(COMPANIONS, fixture), opts, state);
    assert.equal(state.requestsUsed, 0);
    assert.deepEqual(result.observations, []);
    assert.deepEqual(result.projectPatch, {});
  }
});
