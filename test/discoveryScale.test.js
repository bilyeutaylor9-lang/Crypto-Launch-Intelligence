import test from "node:test";
import assert from "node:assert/strict";

import { resolveDiscoveryLimits } from "../src/discoveryManager.js";
import {
  attachProjectIdentity,
  buildProjectIdentityGraph,
  identityKeyForProject,
} from "../src/discovery/projectIdentityGraph.js";

test("wide discovery profile targets 39,000 candidates", () => {
  const limits = resolveDiscoveryLimits({ wideScan: true, targetCandidates: 39_000 });

  assert.equal(limits.targetCandidates, 39_000);
  assert.equal(limits.wideLimit, 39_000);
  assert.equal(limits.scanLimit, 39_000);
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
