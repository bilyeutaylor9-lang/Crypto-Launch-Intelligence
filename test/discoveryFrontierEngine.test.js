import test from "node:test";
import assert from "node:assert/strict";

import { buildDiscoveryFrontier, normalizeDiscoveryChain } from "../src/discovery/discoveryFrontierEngine.js";

const sourceManifest = [
  {
    id: "dexscreener",
    candidateGenerator: true,
    status: "IMPLEMENTED",
    chains: ["base", "solana"],
  },
  {
    id: "geckoterminal",
    candidateGenerator: true,
    status: "IMPLEMENTED",
    chains: ["base", "solana"],
  },
  {
    id: "nativeDiscoveryMesh",
    candidateGenerator: true,
    status: "IMPLEMENTED",
    chains: ["base", "solana"],
  },
  {
    id: "solanaProgramEvents",
    candidateGenerator: true,
    status: "PLANNED",
    chains: ["solana"],
  },
];

test("discovery frontier distinguishes real chain observations from declared routes", () => {
  const frontier = buildDiscoveryFrontier({
    projects: [
      {
        chain: "base",
        address: "0x1111111111111111111111111111111111111111",
        source: "dexscreener",
        discoverySources: ["dexscreener", "gecko-terminal", "native-discovery-mesh"],
      },
      {
        chain: "base",
        address: "0x2222222222222222222222222222222222222222",
        source: "geckoterminal",
        discoverySources: ["geckoterminal"],
      },
    ],
    sourceManifest,
    sourceReports: {
      dexscreener: { status: "SUCCESS", attempted: true, scannedTokens: 12 },
      geckoterminal: { status: "SUCCESS", attempted: true, scannedTokens: 9 },
      nativeDiscoveryMesh: { status: "SUCCESS", attempted: true, scannedTokens: 1 },
    },
    nativeCoverage: {
      totalProtocols: 4,
      configuredProtocols: 2,
      unconfiguredProtocols: 2,
      byChain: {
        base: { total: 2, configured: 2, protocols: ["base-a", "base-b"] },
        solana: { total: 2, configured: 0, protocols: ["solana-a", "solana-b"] },
      },
    },
  });

  const base = frontier.chains.find((chain) => chain.chain === "base");
  const solana = frontier.chains.find((chain) => chain.chain === "solana");

  assert.equal(frontier.targetChainCount, 2);
  assert.equal(frontier.observedChainCount, 1);
  assert.equal(frontier.scopeCoveragePct, 50);
  assert.equal(base.state, "NATIVE_OBSERVED");
  assert.equal(base.uniqueIdentityCount, 2);
  assert.deepEqual(base.observedSources, ["dexscreener", "geckoterminal", "nativeDiscoveryMesh"]);
  assert.equal(solana.state, "NO_LIVE_CANDIDATES");
  assert.equal(solana.nativeProtocolCoverage.configured, 0);
  assert.ok(frontier.criticalGaps.some((gap) => gap.chain === "solana" && gap.code === "NO_LIVE_CANDIDATES"));
  assert.ok(frontier.criticalGaps.some((gap) => gap.chain === "solana" && gap.code === "NATIVE_ROUTE_UNCONFIGURED"));
});

test("discovery frontier normalizes common chain aliases without creating fake coverage", () => {
  const frontier = buildDiscoveryFrontier({
    projects: [
      {
        chain: "bnb",
        address: "0x3333333333333333333333333333333333333333",
        source: "dexscreener",
      },
    ],
    sourceManifest: [
      { id: "dexscreener", candidateGenerator: true, status: "IMPLEMENTED", chains: ["bsc"] },
    ],
    nativeCoverage: { totalProtocols: 0, configuredProtocols: 0, unconfiguredProtocols: 0, byChain: {} },
  });

  assert.equal(normalizeDiscoveryChain("bnb"), "bsc");
  assert.deepEqual(frontier.chains.map((chain) => chain.chain), ["bsc"]);
  assert.equal(frontier.chains[0].state, "SINGLE_SOURCE_OBSERVED");
});
