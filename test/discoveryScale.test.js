import test from "node:test";
import assert from "node:assert/strict";

import { dedupeAndMerge, resolveDiscoveryLimits } from "../src/discoveryManager.js";
import {
  attachProjectIdentity,
  buildProjectIdentityGraph,
  identityKeysForProject,
  identityKeyForProject,
} from "../src/discovery/projectIdentityGraph.js";

test("wide discovery profile targets 39,000 candidates", () => {
  const limits = resolveDiscoveryLimits({ wideScan: true, targetCandidates: 39_000 });

  assert.equal(limits.targetCandidates, 39_000);
  assert.equal(limits.wideLimit, 39_000);
  assert.equal(limits.scanLimit, 39_000);
  assert.equal(limits.maxTokens, 10_000);
  assert.equal(limits.freeLimit, 39_000);
  assert.equal(limits.expandedLimit, 39_000);
  assert.ok(limits.googleNewsLimit >= 1_000);
  assert.ok(limits.githubDiscoveryLimit >= 1_000);
  assert.ok(limits.nativeDiscoveryLimit >= 5_000);
});

test("standard discovery profile stays smaller by default", () => {
  const limits = resolveDiscoveryLimits({ wideScan: false });

  assert.equal(limits.scanLimit, 1_000);
  assert.equal(limits.freeLimit, 100);
  assert.equal(limits.expandedLimit, 100);
});

test("project identity creates stable symbol identities without merging ticker collisions", () => {
  const basePerp = attachProjectIdentity({
    name: "Base Perp",
    symbol: "PERP",
    chain: "base",
    address: "0x0000000000000000000000000000000000000b01",
  });
  const ethereumPerp = attachProjectIdentity({
    name: "Ethereum Perp",
    symbol: "PERP",
    chain: "ethereum",
    address: "0x0000000000000000000000000000000000000e01",
  });
  const basePerpPool = attachProjectIdentity({
    name: "Base Perp Pool",
    symbol: "PERP",
    chain: "base",
    pairAddress: "0x0000000000000000000000000000000000000b02",
  });

  assert.equal(basePerp.symbolIdentityId, ethereumPerp.symbolIdentityId);
  assert.notEqual(basePerp.chainSymbolIdentityId, ethereumPerp.chainSymbolIdentityId);
  assert.equal(basePerp.chainSymbolIdentityId, basePerpPool.chainSymbolIdentityId);
  assert.notEqual(basePerp.symbolInstanceId, basePerpPool.symbolInstanceId);
  assert.notEqual(identityKeyForProject(basePerp), identityKeyForProject(ethereumPerp));
  assert.ok(basePerp.projectIdentity.evidence.includes("symbol"));
});

test("project identity uses provider-scoped ids and market keys before symbol aliases", () => {
  const coinLoreAsset = attachProjectIdentity({
    name: "Provider Alpha",
    symbol: "ALPHA",
    source: "coinlore-assets",
    providerAssetId: "77",
    marketKey: "coinlore-assets:77",
  });
  const coinLoreMover = attachProjectIdentity({
    name: "Provider Alpha",
    symbol: "ALPHA",
    source: "coinlore-movers",
    providerAssetId: "77",
    marketKey: "coinlore-assets:77",
  });
  const sameSymbolOtherProvider = attachProjectIdentity({
    name: "Provider Alpha",
    symbol: "ALPHA",
    source: "coingecko",
    providerAssetId: "77",
    marketKey: "coingecko:77",
  });

  assert.equal(identityKeyForProject(coinLoreAsset), "market:coinlore-assets:77");
  assert.equal(identityKeyForProject(coinLoreAsset), identityKeyForProject(coinLoreMover));
  assert.notEqual(identityKeyForProject(coinLoreAsset), identityKeyForProject(sameSymbolOtherProvider));
  assert.ok(coinLoreAsset.projectIdentity.evidence.includes("marketKey"));
});

test("project identity exposes every strong join anchor without using symbol aliases", () => {
  const project = attachProjectIdentity({
    name: "Utility Alpha",
    symbol: "UALPHA",
    chain: "base",
    tokenAddress: "0x00000000000000000000000000000000000000a1",
    pairAddress: "0x00000000000000000000000000000000000000b1",
    coinGeckoId: "utility-alpha",
    marketKey: "coingecko:utility-alpha",
  });
  const keys = identityKeysForProject(project);

  assert.ok(keys.includes("base:token:0x00000000000000000000000000000000000000a1"));
  assert.ok(keys.includes("base:pool:0x00000000000000000000000000000000000000b1"));
  assert.ok(keys.includes("asset:coingecko:utility-alpha"));
  assert.ok(!keys.some((key) => key.includes("ualpha")));
});

test("discovery merge joins exact contract evidence while preserving executable identity", () => {
  const merged = dedupeAndMerge([
    {
      name: "Utility Alpha",
      symbol: "UALPHA",
      chain: "base",
      tokenAddress: "0x00000000000000000000000000000000000000a1",
      coinGeckoId: "utility-alpha",
      marketKey: "coingecko:utility-alpha",
      source: "coingecko-list",
    },
    {
      name: "Utility Alpha",
      symbol: "UALPHA",
      chain: "base",
      tokenAddress: "0x00000000000000000000000000000000000000a1",
      pairAddress: "0x00000000000000000000000000000000000000b1",
      source: "dexscreener",
      liquidityUsd: 250_000,
    },
    {
      name: "Utility Alpha",
      symbol: "UALPHA",
      coinGeckoId: "utility-alpha",
      marketKey: "coingecko:utility-alpha",
      source: "coingecko",
      marketCap: 4_000_000,
    },
  ]);

  assert.equal(merged.length, 1);
  assert.equal(merged[0].chain, "base");
  assert.equal(merged[0].tokenAddress, "0x00000000000000000000000000000000000000a1");
  assert.equal(merged[0].pairAddress, "0x00000000000000000000000000000000000000b1");
  assert.equal(merged[0].liquidityUsd, 250_000);
  assert.equal(merged[0].marketCap, 4_000_000);
  assert.deepEqual(new Set(merged[0].discoverySources), new Set(["coingecko-list", "dexscreener", "coingecko"]));
});

test("entity evidence can enrich a contract through a shared external id without becoming the instrument identity", () => {
  const [merged] = dedupeAndMerge([
    {
      name: "Utility Alpha",
      symbol: "UALPHA",
      chain: "base",
      tokenAddress: "0x00000000000000000000000000000000000000a1",
      coinGeckoId: "utility-alpha",
      marketKey: "coingecko:utility-alpha",
      source: "coingecko-list",
    },
    {
      name: "Utility Alpha Protocol",
      symbol: "UALPHA",
      chain: "base",
      coinGeckoId: "utility-alpha",
      marketKey: "defillama:utility-alpha",
      source: "defillama",
      researchOnly: true,
      tradableCandidate: false,
      tvl: 12_000_000,
    },
  ]);

  assert.equal(merged.tokenAddress, "0x00000000000000000000000000000000000000a1");
  assert.equal(merged.tvl, 12_000_000);
  assert.ok(merged.discoverySources.includes("defillama"));
});

test("entity ids never collapse conflicting exact contracts", () => {
  const merged = dedupeAndMerge([
    {
      name: "Utility Alpha Base",
      symbol: "UALPHA",
      chain: "base",
      tokenAddress: "0x00000000000000000000000000000000000000a1",
      coinGeckoId: "utility-alpha",
      marketKey: "base:utility-alpha",
    },
    {
      name: "Utility Alpha Ethereum",
      symbol: "UALPHA",
      chain: "ethereum",
      tokenAddress: "0x00000000000000000000000000000000000000e1",
      coinGeckoId: "utility-alpha",
      marketKey: "ethereum:utility-alpha",
    },
  ]);

  assert.equal(merged.length, 2);
});

test("shared pool evidence cannot collapse conflicting token contracts", () => {
  const pool = "0x00000000000000000000000000000000000000b1";
  const merged = dedupeAndMerge([
    {
      name: "Pool Base Asset",
      symbol: "BASEA",
      chain: "base",
      tokenAddress: "0x00000000000000000000000000000000000000a1",
      pairAddress: pool,
      source: "dexscreener",
    },
    {
      name: "Pool Quote Asset",
      symbol: "QUOTEA",
      chain: "base",
      tokenAddress: "0x00000000000000000000000000000000000000a2",
      pairAddress: pool,
      source: "geckoterminal",
    },
  ]);

  assert.equal(merged.length, 2);
});

test("one exact token can safely collect evidence from multiple pools", () => {
  const tokenAddress = "0x00000000000000000000000000000000000000a1";
  const merged = dedupeAndMerge([
    {
      name: "Multi Pool Utility",
      symbol: "MPU",
      chain: "base",
      tokenAddress,
      pairAddress: "0x00000000000000000000000000000000000000b1",
      source: "dexscreener",
      liquidityUsd: 100_000,
    },
    {
      name: "Multi Pool Utility",
      symbol: "MPU",
      chain: "base",
      tokenAddress,
      pairAddress: "0x00000000000000000000000000000000000000b2",
      source: "geckoterminal",
      volume24h: 50_000,
    },
  ]);

  assert.equal(merged.length, 1);
  assert.equal(merged[0].liquidityUsd, 100_000);
  assert.equal(merged[0].volume24h, 50_000);
  assert.deepEqual(new Set(merged[0].poolAddresses), new Set([
    "0x00000000000000000000000000000000000000b1",
    "0x00000000000000000000000000000000000000b2",
  ]));
});

test("discovery merge preserves missing market evidence as unknown", () => {
  const [merged] = dedupeAndMerge([{
    name: "Identity Only Utility",
    symbol: "IOU",
    chain: "base",
    tokenAddress: "0x00000000000000000000000000000000000000a1",
    coinGeckoId: "identity-only-utility",
    source: "coingecko-list",
  }]);

  assert.equal(merged.priceUsd, null);
  assert.equal(merged.liquidityUsd, null);
  assert.equal(merged.volume24h, null);
  assert.equal(merged.marketCap, null);
  assert.equal(merged.valuationDisagreement, null);
});

test("project identity graph exposes symbol identity edges", () => {
  const graph = buildProjectIdentityGraph([
    {
      name: "Symbol Alpha",
      symbol: "SYN",
      chain: "base",
      address: "0xsyn",
    },
  ]);

  assert.equal(graph.nodes[0].symbol, "SYN");
  assert.ok(graph.nodes[0].symbolIdentityId);
  assert.ok(graph.edges.some((edge) => edge.type === "symbolIdentity" && edge.symbol === "SYN"));
  assert.ok(graph.edges.some((edge) => edge.type === "chainSymbolIdentity" && edge.chain === "base"));
  assert.ok(graph.edges.some((edge) => edge.type === "symbolInstance"));
});

test("project identity graph rejects fake address anchors", () => {
  const enriched = attachProjectIdentity({
    name: "Fake Address Alpha",
    symbol: "FAA",
    chain: "gaming",
    address: "coingecko:fake-address-alpha",
    tokenAddress: "FAA",
    pairAddress: "https://dexscreener.com/base/faa",
    deployerAddress: "github",
  });
  const graph = buildProjectIdentityGraph([enriched]);

  assert.equal(enriched.projectIdentity.chain, "unknown");
  assert.deepEqual(enriched.projectIdentity.tokenContracts, []);
  assert.deepEqual(enriched.projectIdentity.poolAddresses, []);
  assert.deepEqual(enriched.projectIdentity.deployerWallets, []);
  assert.equal(identityKeyForProject(enriched), "unknown:alias:fake address alpha:faa");
  assert.ok(!graph.edges.some((edge) => edge.type === "tokenContract"));
});
