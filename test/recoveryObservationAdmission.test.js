import test from "node:test";
import assert from "node:assert/strict";
import { analyzeDataStarvationRootCause } from "../src/engines/dataStarvationRootCauseEngine.js";
import { evaluateEngineDataReadiness } from "../src/engines/engineDataReadinessEngine.js";
import { analyzeActiveEvidenceRecoveryBatch, buildActiveEvidenceRecoveryWaves } from "../src/engines/activeEvidenceRecoveryEngine.js";
import { getEngineContracts } from "../src/kernel/engineContractManifest.js";

const TOKEN = `0x${"1".repeat(40)}`;
const POOL = `0x${"2".repeat(40)}`;
const CONTRACT = getEngineContracts().find(contract => contract.id === "liquidityControlRisk");
const options = { wave1Max: 1, wave2Max: 0, wave3Max: 0, maxProviderRequests: 10, timeBudgetMs: 60000 };
const demand = project => project.starvationRecoveryPlan.items.some(item => item.canonicalField === "liquidityUsd");
const queued = project => buildActiveEvidenceRecoveryWaves([project], options).waves.WAVE1
  .flatMap(candidate => candidate.entries).some(entry => entry.field === "liquidityUsd");

function protocolLiquidity() {
  return {
    chain: "base", tokenAddress: TOKEN, poolAddress: POOL, source: "defillama",
    deepEvaluationState: "DEEP_EVALUATED", marketData: { liquidityUsd: 250000 },
    fieldProvenance: { liquidityUsd: { source: "defillama", confidence: 0,
      sourceTimestamp: new Date(Date.now() - 300000).toISOString(), verificationStatus: "OBSERVED" } },
  };
}

function plan(project) {
  return analyzeDataStarvationRootCause(project, { contracts: [CONTRACT], disableSemanticScan: true });
}

test.beforeEach(t => {
  const network = t.mock.method(globalThis, "fetch", () => assert.fail("Recovery admission fixtures must not use HTTP"));
  t.after(() => assert.equal(network.mock.callCount(), 0));
});

test("rejected protocol TVL remains queued as real pool-liquidity acquisition", () => {
  const project = protocolLiquidity(), before = structuredClone(project);
  const planned = plan(project);
  assert.equal(planned.canonicalAliases.liquidityUsd, null);
  assert.equal(evaluateEngineDataReadiness(planned, CONTRACT).status, "DATA_STARVED");
  assert.equal(demand(planned), true);
  assert.equal(queued(planned), true);
  assert.deepEqual(project, before);
});

test("failed acquisition cannot relabel rejected raw liquidity as locally recovered", async () => {
  const planned = plan(protocolLiquidity()), before = structuredClone(planned);
  let calls = 0;
  const [result] = await analyzeActiveEvidenceRecoveryBatch([planned], { ...options,
    providers: { getTokenPairs: async (chain, token) => {
      calls++;
      assert.equal(chain, "base");
      assert.equal(token, TOKEN);
      return [];
    }, getGeckoPoolByAddress: async () => null },
  });
  assert.equal(calls, 1);
  assert.equal(demand(result), true);
  assert.equal(result.canonicalAliases.liquidityUsd, null);
  assert.ok(!result.activeEvidenceRecovery.recoveredFields.includes("liquidityUsd"));
  assert.ok(result.activeEvidenceRecovery.unrecoveredFields.includes("liquidityUsd"));
  assert.equal(result.fieldProvenance.liquidityUsd.confidence, 0);
  assert.equal(evaluateEngineDataReadiness(result, CONTRACT).status, "DATA_STARVED");
  assert.deepEqual(planned, before);
});

test("actual exact pool liquidity replaces rejected protocol TVL through the provider path", async () => {
  const planned = plan(protocolLiquidity());
  let calls = 0;
  const [result] = await analyzeActiveEvidenceRecoveryBatch([planned], { ...options,
    providers: { getTokenPairs: async () => {
      calls++;
      return [{ chainId: "base", pairAddress: POOL,
        baseToken: { address: TOKEN, symbol: "TEST" },
        quoteToken: { address: `0x${"3".repeat(40)}`, symbol: "USDC" },
        liquidity: { usd: 125000 }, volume: { h24: 50000 }, priceUsd: "0.42" }];
    } },
  });
  assert.equal(calls, 1);
  assert.equal(result.liquidityUsd, 125000);
  assert.equal(result.canonicalAliases.liquidityUsd, 125000);
  assert.equal(result.fieldProvenance.liquidityUsd.source, "dexscreener");
  assert.equal(demand(result), false);
  assert.equal(result.executionProofVerified, undefined);
  assert.equal(result.fullyQualified, undefined);
});

for (const [sourceProvider, sourcePath] of [["dexscreener", "marketData.liquidityUsd"], ["defillama", "pool.liquidity.usd"]]) {
test(`valid canonical-only ${sourceProvider} liquidity retains its original validation context`, async () => {
  const stamp = new Date(Date.now() - 300000).toISOString();
  const project = { chain: "base", tokenAddress: TOKEN, poolAddress: POOL,
    canonicalAliases: { liquidityUsd: 125000 },
    canonicalAliasProvenance: { liquidityUsd: { sourceProvider, sourcePath,
      sourceTimestamp: stamp, confidence: 0.83, validationStatus: "VALID" } },
    targetedEnrichmentPlan: { items: [{ canonicalField: "liquidityUsd", recoverable: true,
      targetSources: [{ source: "DexScreener" }] }] },
  };
  let calls = 0;
  assert.equal(queued(project), false);
  const [result] = await analyzeActiveEvidenceRecoveryBatch([project], { ...options, maxProviderRequests: 0,
    providers: { getTokenPairs: async () => { calls++; return []; } },
  });
  assert.equal(calls, 0);
  assert.equal(result.liquidityUsd, undefined);
  assert.equal(result.canonicalAliases.liquidityUsd, 125000);
  assert.equal(result.canonicalAliasProvenance.liquidityUsd.sourceTimestamp, stamp);
  assert.equal(result.canonicalAliasProvenance.liquidityUsd.confidence, 0.83);
  assert.equal(result.canonicalAliasProvenance.liquidityUsd.sourcePath, sourcePath);
  assert.deepEqual(result.targetedEnrichmentPlan.items, []);
  assert.ok(!result.activeEvidenceRecovery.recoveredFields.includes("liquidityUsd"));
  assert.equal(result.activeEvidenceRecovery.batchSummary.providerRequestsUsed, 0);
  assert.equal(result.executionProofVerified, undefined);
});
}

test("observed zero transaction counts remain zero without manufacturing demand or a pick", async () => {
  const [result] = await analyzeActiveEvidenceRecoveryBatch([{ chain: "base", tokenAddress: TOKEN, poolAddress: POOL,
    buyTransactions24h: 0, sellTransactions24h: 0,
    targetedEnrichmentPlan: { items: ["buyTransactions24h", "sellTransactions24h"].map(canonicalField => ({
      canonicalField, recoverable: true, targetSources: [{ source: "DexScreener" }],
    })) },
  }], { ...options, providers: { getTokenPairs: async () => assert.fail("Known zero counts need no lookup") } });
  assert.equal(result.buyTransactions24h, 0);
  assert.equal(result.sellTransactions24h, 0);
  assert.equal(result.executionProofVerified, undefined);
  assert.equal(result.fullyQualified, undefined);
});

test("rejected liquidity stays pending when the unchanged provider budget is exhausted", async () => {
  const [result] = await analyzeActiveEvidenceRecoveryBatch([plan(protocolLiquidity())], { ...options,
    maxProviderRequests: 0,
    providers: { getTokenPairs: async () => assert.fail("A zero request budget must not dispatch") },
  });
  assert.equal(demand(result), true);
  assert.ok(!result.activeEvidenceRecovery.recoveredFields.includes("liquidityUsd"));
  assert.ok(result.activeEvidenceRecovery.providerAttempts.some(attempt => attempt.status === "REQUEST_BUDGET_EXHAUSTED"));
  assert.equal(result.activeEvidenceRecovery.batchSummary.providerRequestsUsed, 0);
});

test("stale and conflicted observations still require fresh acquisition", () => {
  for (const rootCause of ["STALE_DATA", "CONFLICTED_DATA"]) {
    const project = { chain: "base", tokenAddress: TOKEN, poolAddress: POOL, source: "dexscreener", liquidityUsd: 125000,
      targetedEnrichmentPlan: { items: [{ canonicalField: "liquidityUsd", rootCause, recoverable: true,
        targetSources: [{ source: "DexScreener" }] }] },
    };
    assert.equal(queued(project), true);
  }
});

test("metadata-only negative safety flags cannot retire a real security acquisition demand", () => {
  const waves = buildActiveEvidenceRecoveryWaves([{ chain: "base", tokenAddress: TOKEN, poolAddress: POOL,
    source: "blockscout", honeypotDetected: false,
    targetedEnrichmentPlan: { items: [{ canonicalField: "honeypotDetected", recoverable: true,
      targetSources: [{ source: "GoPlus" }] }] },
  }], options);
  assert.ok(waves.waves.WAVE1.some(candidate => candidate.entries.some(entry => entry.field === "honeypotDetected")));
  assert.equal(waves.waves.WAVE1[0].project.canonicalAliases.honeypotDetected, null);
});

test("local promotion preserves zero confidence and cannot inflate invalid confidence", async () => {
  for (const [confidence, expected] of [[0, 0], [0.4, 0.4], [40, 0.4], ["0", 0],
    [true, 0], ["UNKNOWN", 0], [101, 0], [NaN, 0], [Infinity, 0], [-1, 0], [undefined, 0.65]]) {
    const stamp = new Date(Date.now() - 300000).toISOString();
    const input = { chain: "base", tokenAddress: TOKEN, poolAddress: POOL, source: "dexscreener",
      marketData: { liquidityUsd: 125000 },
      fieldProvenance: { liquidityUsd: { source: "dexscreener", sourceTimestamp: stamp, confidence,
        verificationStatus: "OBSERVED" } },
      targetedEnrichmentPlan: { items: [{ canonicalField: "liquidityUsd", recoverable: true,
        targetSources: [{ source: "DexScreener" }] }] },
    };
    const before = structuredClone(input);
    const [result] = await analyzeActiveEvidenceRecoveryBatch([input], { ...options, maxProviderRequests: 0 });
    assert.equal(result.liquidityUsd, 125000);
    assert.equal(result.fieldProvenance.liquidityUsd.confidence, expected);
    assert.equal(result.fieldProvenance.liquidityUsd.sourceTimestamp, stamp);
    assert.equal(result.fieldProvenance.liquidityUsd.verificationStatus, "OBSERVED");
    assert.equal(result.activeEvidenceRecovery.batchSummary.providerRequestsUsed, 0);
    assert.equal(result.executionProofVerified, undefined);
    assert.deepEqual(input, before);
  }
});
