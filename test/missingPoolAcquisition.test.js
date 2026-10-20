import test from "node:test";
import assert from "node:assert/strict";
import { analyzeCanonicalExecutionRoute } from "../src/engines/canonicalExecutionRouteEngine.js";
import { analyzeActiveEvidenceRecoveryBatch, buildActiveEvidenceRecoveryWaves } from "../src/engines/activeEvidenceRecoveryEngine.js";

const TOKEN = "0x1111111111111111111111111111111111111111";
const POOL = "0x2222222222222222222222222222222222222222";
const USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
function candidate(patch = {}) {
  return { name: "Exact Aggregate Asset", symbol: "EAA", source: "coingecko", dex: "market-aggregate",
    chain: "base", tokenAddress: TOKEN, contractAddress: TOKEN, deepEvaluationState: "DEEP_EVALUATED",
    executionProof: { routeType: "UNKNOWN", safetyVerified: true, exactIdentityVerified: false,
      buyQuoteVerified: false, sellQuoteVerified: false }, ...patch };
}

test("missing exact pool schedules cheap Wave1 metadata without requiring a manifest starvation item", () => {
  const waves = buildActiveEvidenceRecoveryWaves([candidate()]).waves;
  assert.equal(waves.WAVE1.length, 1);
  assert.deepEqual(waves.WAVE1[0].entries.map((entry) => entry.field), ["poolAddress"]);
  assert.equal(waves.WAVE1[0].entries[0].item.recoveryDisposition, "RAW_RECOVERABLE");
  assert.equal(waves.WAVE3.length, 0);
});

test("aggregate metadata can acquire an exact pool and raw transaction companions without quotes or wallet RPC", async (t) => {
  t.mock.method(globalThis, "fetch", async () => assert.fail("No live HTTP allowed"));
  let calls = 0;
  const raw = analyzeCanonicalExecutionRoute(candidate());
  const [result] = await analyzeActiveEvidenceRecoveryBatch([raw], {
    wave1Max: 1, wave2Max: 0, wave3Max: 0, maxProviderRequests: 1, useCache: false, walletHistory: false,
    providers: { getTokenPairs: async (chain, token) => {
      calls++;
      assert.equal(chain, "base"); assert.equal(token, TOKEN);
      return [{ chainId: "base", pairAddress: POOL, dexId: "aerodrome",
        baseToken: { address: TOKEN, symbol: "EAA" }, quoteToken: { address: USDC, symbol: "USDC" },
        priceUsd: "1", liquidity: { usd: 200000 }, volume: { h24: 100000 }, txns: { h24: { buys: 10, sells: 4 } } }];
    } },
  });
  assert.equal(calls, 1);
  assert.equal(result.poolAddress, POOL);
  assert.equal(result.buyTransactions24h, 10);
  assert.equal(result.sellTransactions24h, 4);
  assert.equal(result.fieldProvenance.poolAddress.source, "dexscreener");
  assert.ok(result.activeEvidenceRecovery.changedEvidenceFamilies.includes("MARKET") ||
    result.activeEvidenceRecovery.changedEvidenceFamilies.includes("IDENTITY"));
  assert.notEqual(result.finalSelectionQualified, true);
  assert.notEqual(result.buyQuoteVerified, true);
  assert.equal(buildActiveEvidenceRecoveryWaves([result]).waves.WAVE3.length, 1);
});

test("real CEX, deferred, conflicting, malformed and existing pool identities cannot be silently replaced", () => {
  for (const patch of [{ executionProof: undefined }, { executionProof: {} },
    { executionProof: { ...candidate().executionProof, routeType: "CEX" } },
    { deepEvaluationState: "DEFERRED_BEFORE_DEEP" }, { poolAddress: POOL }, { poolAddress: "malformed-pool" },
    { finalPairAddress: POOL }, { verifiedPairAddress: POOL }, { primaryPool: POOL }, { pair: { address: POOL } },
    { canonicalExecutionRoute: { routeType: "CEX" } }, { routeType: "CEX" },
    { chainId: "ethereum" }, { canonicalChainId: "ethereum" }, { normalizedChain: "ethereum" },
    { baseToken: { chain: "ethereum", address: TOKEN } }, { baseTokenAddress: USDC },
    { verifiedContractAddress: USDC }, { contractAddress: "0x3333333333333333333333333333333333333333" },
    { tokenAddress: "invalid", contractAddress: "invalid" }, { honeypotDetected: true }]) {
    assert.equal(buildActiveEvidenceRecoveryWaves([candidate(patch)]).waves.WAVE1.length, 0, JSON.stringify(patch));
  }
});

test("an UNKNOWN proof cannot mask a recognized CEX route and trigger an on-chain pool or quote probe", () => {
  const staleQuotePlan = { canonicalField: "quoteTimestamp", recoverable: true,
    targetSources: [{ source: "LI.FI keyless quote" }], evidenceClass: "CORE" };
  for (const poolAddress of [undefined, POOL]) for (const plan of [{},
    { targetedEnrichmentPlan: { items: [staleQuotePlan] } },
    { starvationRecoveryPlan: { items: [staleQuotePlan] } },
    { valueOfInformationItems: [staleQuotePlan] }]) {
    const raw = analyzeCanonicalExecutionRoute(candidate({ source: "coinbase", exchange: "coinbase",
      marketPair: "EAAUSD", poolAddress, ...plan }));
    assert.equal(raw.canonicalExecutionRoute.routeType, "CEX");
    const waves = buildActiveEvidenceRecoveryWaves([raw]).waves;
    assert.equal(waves.WAVE1.length, 0);
    assert.equal(waves.WAVE3.length, 0);
  }
});

test("a foreign token pair and exhausted budget never establish an exact pool", async (t) => {
  t.mock.method(globalThis, "fetch", async () => assert.fail("No live HTTP allowed"));
  for (const maxProviderRequests of [0, 1]) {
    let calls = 0;
    const [result] = await analyzeActiveEvidenceRecoveryBatch([candidate()], {
      wave2Max: 0, wave3Max: 0, maxProviderRequests, useCache: false, walletHistory: false,
      providers: { getTokenPairs: async () => { calls++; return [{ chainId: "base", pairAddress: POOL,
        baseToken: { address: USDC }, quoteToken: { address: TOKEN }, liquidity: { usd: 100000 } }]; } },
    });
    assert.ok(calls <= maxProviderRequests);
    assert.notEqual(result.poolAddress, POOL);
    assert.notEqual(result.finalSelectionQualified, true);
  }
});
