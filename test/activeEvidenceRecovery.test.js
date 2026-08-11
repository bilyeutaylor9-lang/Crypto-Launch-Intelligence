import test from "node:test";
import assert from "node:assert/strict";

import { analyzeActiveEvidenceRecoveryBatch } from "../src/engines/activeEvidenceRecoveryEngine.js";

const EVM = "0x1111111111111111111111111111111111111111";
const POOL = "0x2222222222222222222222222222222222222222";

test("active evidence recovery promotes observed raw evidence without weakening gates", async () => {
  const [project] = await analyzeActiveEvidenceRecoveryBatch([
    {
      name: "Recovered Utility",
      symbol: "RUTL",
      chain: "base",
      rawCandidate: {
        tokenAddress: EVM,
        pairAddress: POOL,
      },
      marketData: {
        liquidityUsd: 125000,
      },
      targetedEnrichmentPlan: {
        items: [
          { canonicalField: "tokenAddress", recoverable: true, valueOfInformationScore: 0.9, targetSources: [{ source: "DexScreener" }] },
          { canonicalField: "poolAddress", recoverable: true, valueOfInformationScore: 0.8, targetSources: [{ source: "DexScreener" }] },
          { canonicalField: "liquidityUsd", recoverable: true, valueOfInformationScore: 0.7, targetSources: [{ source: "DexScreener" }] },
        ],
      },
    },
  ]);

  assert.equal(project.activeEvidenceRecoveryStatus, "RECOVERED");
  assert.equal(project.tokenAddress, EVM);
  assert.equal(project.poolAddress, POOL);
  assert.equal(project.liquidityUsd, 125000);
  assert.deepEqual(project.activeEvidenceRecovery.recoveredFields, ["tokenAddress", "poolAddress", "liquidityUsd"]);
});

test("active evidence recovery leaves missing or zero-valued market evidence unrecovered", async () => {
  const [project] = await analyzeActiveEvidenceRecoveryBatch([
    {
      name: "Still Missing",
      symbol: "MISS",
      chain: "base",
      liquidityUsd: 0,
      targetedEnrichmentPlan: {
        items: [
          { canonicalField: "liquidityUsd", recoverable: true, valueOfInformationScore: 0.9, targetSources: [{ source: "DexScreener" }] },
          { canonicalField: "priceUsd", recoverable: true, valueOfInformationScore: 0.8, targetSources: [{ source: "CoinGecko" }] },
        ],
      },
    },
  ], {
    providers: {
      searchDexPairs: async () => [],
    },
  });

  assert.equal(project.activeEvidenceRecoveryStatus, "NO_RECOVERY");
  assert.equal(project.liquidityUsd, 0);
  assert.deepEqual(project.activeEvidenceRecovery.recoveredFields, []);
  assert.deepEqual(project.activeEvidenceRecovery.unrecoveredFields, ["liquidityUsd", "priceUsd"]);
});

test("active evidence recovery invokes exact DexScreener lookup and records provenance", async () => {
  let calls = 0;
  const [project] = await analyzeActiveEvidenceRecoveryBatch([{
    name: "Provider Recovered",
    symbol: "PRV",
    chain: "base",
    tokenAddress: EVM,
    targetedEnrichmentPlan: {
      items: [
        { canonicalField: "poolAddress", recoverable: true, valueOfInformationScore: 0.9, targetSources: [{ source: "DexScreener" }] },
        { canonicalField: "liquidityUsd", recoverable: true, valueOfInformationScore: 0.8, targetSources: [{ source: "DexScreener" }] },
      ],
    },
  }], {
    providers: {
      getTokenPairs: async (chain, address) => {
        calls += 1;
        assert.equal(chain, "base");
        assert.equal(address, EVM);
        return [{
          chainId: "base",
          pairAddress: POOL,
          baseToken: { address: EVM, symbol: "PRV", name: "Provider Recovered" },
          quoteToken: { address: "0x3333333333333333333333333333333333333333", symbol: "USDC" },
          liquidity: { usd: 240000 },
          volume: { h24: 81000 },
          priceUsd: "0.42",
        }];
      },
    },
    now: () => new Date("2026-08-10T12:00:00.000Z"),
  });

  assert.equal(calls, 1);
  assert.equal(project.activeEvidenceRecoveryStatus, "RECOVERED");
  assert.equal(project.poolAddress, POOL);
  assert.equal(project.liquidityUsd, 240000);
  assert.equal(project.fieldProvenance.liquidityUsd.source, "dexscreener");
  assert.equal(project.fieldProvenance.liquidityUsd.recoveryRun, true);
  assert.equal(project.fieldProvenance.liquidityUsd.identityMatchMode, "exact-address");
});

test("one unambiguous DexScreener match retains companion identity and market evidence", async () => {
  const [project] = await analyzeActiveEvidenceRecoveryBatch([{
    name: "Companion Evidence",
    symbol: "CMP",
    targetedEnrichmentPlan: {
      items: [
        { canonicalField: "tokenAddress", recoverable: true, valueOfInformationScore: 0.9, targetSources: [{ source: "DexScreener" }] },
      ],
    },
  }], {
    providers: {
      searchDexPairs: async () => [{
        chainId: "base",
        pairAddress: POOL,
        baseToken: { address: EVM, symbol: "CMP", name: "Companion Evidence" },
        quoteToken: { address: "0x3333333333333333333333333333333333333333", symbol: "USDC" },
        liquidity: { usd: 240000 },
        volume: { h24: 81000 },
        priceUsd: "0.42",
      }],
    },
  });

  assert.equal(project.activeEvidenceRecoveryStatus, "RECOVERED");
  assert.equal(project.chain, "base");
  assert.equal(project.tokenAddress, EVM);
  assert.equal(project.poolAddress, POOL);
  assert.equal(project.liquidityUsd, 240000);
  assert.equal(project.volume24hUsd, 81000);
  assert.equal(project.fieldProvenance.poolAddress.identityMatchMode, "strict-unambiguous-search");
});

test("active evidence recovery fails closed on ambiguous symbol-only results", async () => {
  const secondToken = "0x4444444444444444444444444444444444444444";
  const pair = (tokenAddress, pairAddress) => ({
    chainId: "base",
    pairAddress,
    baseToken: { address: tokenAddress, symbol: "SAME", name: "Same Name" },
    quoteToken: { address: "0x3333333333333333333333333333333333333333", symbol: "USDC" },
    liquidity: { usd: 100000 },
    priceUsd: "0.1",
  });
  const [project] = await analyzeActiveEvidenceRecoveryBatch([{
    name: "Same Name",
    symbol: "SAME",
    targetedEnrichmentPlan: {
      items: [
        { canonicalField: "tokenAddress", recoverable: true, valueOfInformationScore: 0.9, targetSources: [{ source: "DexScreener" }] },
        { canonicalField: "liquidityUsd", recoverable: true, valueOfInformationScore: 0.8, targetSources: [{ source: "DexScreener" }] },
      ],
    },
  }], {
    providers: {
      searchDexPairs: async () => [
        pair(EVM, POOL),
        pair(secondToken, "0x5555555555555555555555555555555555555555"),
      ],
    },
  });

  assert.equal(project.activeEvidenceRecoveryStatus, "NO_RECOVERY");
  assert.equal(project.tokenAddress, undefined);
  assert.equal(project.liquidityUsd, undefined);
  assert.ok(project.activeEvidenceRecovery.providerAttempts.some((attempt) => attempt.status === "AMBIGUOUS_OR_NO_EXACT_MATCH"));
});
