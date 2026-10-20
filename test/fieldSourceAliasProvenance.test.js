import test from "node:test";
import assert from "node:assert/strict";

import { applyCanonicalAliases, collectAliasCandidates, resolveCanonicalAliases } from "../src/data/canonicalAliasResolver.js";

const owner = "DJsZxM4LKDSZEEjE6RL8s7WAT8hUE4gtuuJKooEyhBhw";
const sourceTimestamp = "2026-10-18T06:37:30.000Z";

test("recovered wallet aliases credit the observation provider, not discovery", () => {
  const project = {
    source: "dexscreener", chain: "solana", wallets: [owner],
    fieldProvenance: { wallets: { source: "solana-rpc-wallets", sourceTimestamp } },
    canonicalAliasProvenance: { wallets: { sourceProvider: "dexscreener" } },
  };
  const options = { fields: ["wallets"], sourceProvider: "dexscreener", disableSemanticScan: true };
  const normalized = applyCanonicalAliases(project, options);
  const repeated = applyCanonicalAliases(normalized, options);
  for (const result of [normalized, repeated]) {
    assert.deepEqual(result.wallets, [owner]);
    assert.equal(result.canonicalAliasProvenance.wallets.sourceProvider, "solana-rpc-wallets");
    assert.equal(result.canonicalAliasProvenance.wallets.provider, "solana-rpc-wallets");
    assert.equal(result.canonicalAliasProvenance.wallets.sourceTimestamp, sourceTimestamp);
    assert.equal(result.smartWalletScore, undefined);
  }
  assert.equal(project.canonicalAliasProvenance.wallets.sourceProvider, "dexscreener");
});

test("each field keeps its own provider in a mixed-source project", () => {
  const { resolved, provenance } = resolveCanonicalAliases({
    source: "coingecko", chain: "base", liquidityUsd: 25000, holderCount: 15,
    fieldProvenance: {
      liquidityUsd: { sourceProvider: "Dex Screener", sourceTimestamp },
      holderCount: { provider: "Go Plus", sourceTimestamp },
    },
  }, { fields: ["liquidityUsd", "holderCount"], disableSemanticScan: true });
  assert.equal(resolved.liquidityUsd, 25000);
  assert.equal(resolved.holderCount, 15);
  assert.equal(provenance.liquidityUsd.sourceProvider, "dexscreener");
  assert.equal(provenance.holderCount.sourceProvider, "goplus");
});

test("field-specific aliases use their own raw-path source", () => {
  const { resolved, provenance } = resolveCanonicalAliases({
    source: "dexscreener", chain: "solana", raw: { owners: [owner] },
    fieldProvenance: { "raw.owners": { source: "solana-rpc-wallets", sourceTimestamp } },
  }, { fields: ["wallets"] });
  assert.deepEqual(resolved.wallets, [owner]);
  assert.equal(provenance.wallets.sourcePath, "raw.owners");
  assert.equal(provenance.wallets.sourceProvider, "solana-rpc-wallets");
});

test("field provider semantics still reject protocol TVL as token liquidity", () => {
  const project = {
    source: "dexscreener", liquidityUsd: 250000,
    fieldProvenance: { liquidityUsd: { source: "defillama", sourceTimestamp } },
  };
  const { resolved } = resolveCanonicalAliases(project, { fields: ["liquidityUsd"], disableSemanticScan: true });
  assert.equal(resolved.liquidityUsd, null);
  const [rejected] = collectAliasCandidates(project, "liquidityUsd", { disableSemanticScan: true });
  assert.equal(rejected.sourceProvider, "defillama");
  assert.equal(rejected.validationStatus, "REJECTED_ALIAS");
  assert.match(rejected.validationReason, /TVL cannot prove executable token liquidity/);
});

test("absent or malformed field sources preserve explicit provider fallback", () => {
  for (const metadata of [{}, { source: null }, { source: false }, { source: {} }, { source: " " }]) {
    const { provenance } = resolveCanonicalAliases({
      source: "coingecko", priceUsd: 1, fieldProvenance: { priceUsd: metadata },
    }, { fields: ["priceUsd"], sourceProvider: "dexscreener", disableSemanticScan: true });
    assert.equal(provenance.priceUsd.sourceProvider, "dexscreener");
  }
});
