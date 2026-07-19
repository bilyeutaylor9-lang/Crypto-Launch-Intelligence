import test from "node:test";
import assert from "node:assert/strict";

import {
  getNativeProtocolConfigs,
  resolveNativeRpcUrl,
  summarizeNativeProtocolCoverage,
} from "../src/data/native/nativePoolConfig.js";

const FREE_DEFAULT_UNISWAP_IDS = [
  "ethereum-uniswap-v3",
  "ethereum-uniswap-v2",
  "base-uniswap-v3",
  "base-uniswap-v2",
  "bsc-uniswap-v3",
  "bsc-uniswap-v2",
  "polygon-uniswap-v3",
  "polygon-uniswap-v2",
  "arbitrum-uniswap-v3",
  "arbitrum-uniswap-v2",
  "optimism-uniswap-v3",
  "optimism-uniswap-v2",
  "avalanche-uniswap-v3",
  "avalanche-uniswap-v2",
];

const FREE_DEFAULT_PANCAKE_IDS = [
  "ethereum-pancakeswap-v2",
  "ethereum-pancakeswap-v3",
  "base-pancakeswap-v2",
  "base-pancakeswap-v3",
  "arbitrum-pancakeswap-v2",
  "arbitrum-pancakeswap-v3",
  "bnb-pancakeswap-v2",
  "bnb-pancakeswap-v3",
];

test("native RPC coverage enables verified Uniswap lanes through public fallback RPC", () => {
  const protocols = getNativeProtocolConfigs({ env: {}, usePublicRpcFallbacks: true });
  const configuredIds = new Set(protocols.filter((protocol) => protocol.configured).map((protocol) => protocol.id));

  for (const id of FREE_DEFAULT_UNISWAP_IDS) {
    assert.equal(configuredIds.has(id), true, `${id} should be live through documented defaults`);
  }

  const ethereum = protocols.find((protocol) => protocol.id === "ethereum-uniswap-v3");
  assert.equal(ethereum.factoryAddressSource, "static-default");
  assert.equal(ethereum.eventTopic0Source, "static-default");
  assert.equal(ethereum.rpcSource, "public-fallback");
  assert.equal(ethereum.usesPublicRpcFallback, true);
});

test("native RPC coverage enables verified PancakeSwap lanes through public fallback RPC", () => {
  const protocols = getNativeProtocolConfigs({ env: {}, usePublicRpcFallbacks: true });
  const configuredIds = new Set(protocols.filter((protocol) => protocol.configured).map((protocol) => protocol.id));

  for (const id of FREE_DEFAULT_PANCAKE_IDS) {
    assert.equal(configuredIds.has(id), true, `${id} should be live through documented defaults`);
  }

  const bscV3 = protocols.find((protocol) => protocol.id === "bnb-pancakeswap-v3");
  assert.equal(bscV3.factoryAddress, "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865");
  assert.equal(bscV3.rpcSource, "public-fallback");
});

test("native RPC coverage stays honest when public fallback RPC is disabled", () => {
  const protocols = getNativeProtocolConfigs({ env: {}, usePublicRpcFallbacks: false });
  const ethereum = protocols.find((protocol) => protocol.id === "ethereum-uniswap-v3");

  assert.equal(ethereum.factoryAddressSource, "static-default");
  assert.equal(ethereum.rpcSource, "missing");
  assert.equal(ethereum.rpcUrl, null);
  assert.equal(ethereum.configured, false);
});

test("native RPC coverage requires Solana program identity even when public Solana RPC exists", () => {
  const protocols = getNativeProtocolConfigs({ env: {}, usePublicRpcFallbacks: true });
  const pump = protocols.find((protocol) => protocol.id === "solana-pump-migrations");

  assert.equal(pump.rpcSource, "public-fallback");
  assert.equal(pump.programId, null);
  assert.equal(pump.configured, false);
});

test("native RPC resolution prefers dedicated env RPC over public fallback RPC", () => {
  const protocols = getNativeProtocolConfigs({
    env: { BASE_RPC_URL: "https://base.example" },
    usePublicRpcFallbacks: true,
  });
  const base = protocols.find((protocol) => protocol.id === "base-uniswap-v3");
  const resolved = resolveNativeRpcUrl(base, {
    env: { BASE_RPC_URL: "https://base.example" },
    usePublicRpcFallbacks: true,
  });

  assert.equal(base.rpcSource, "env");
  assert.equal(base.rpcEnvUsed, "BASE_RPC_URL");
  assert.equal(base.rpcUrl, "https://base.example");
  assert.equal(resolved.rpcSource, "env");
});

test("native protocol coverage summary reports public fallback and env RPC separately", () => {
  const summary = summarizeNativeProtocolCoverage({
    env: { BASE_RPC_URL: "https://base.example" },
    usePublicRpcFallbacks: true,
  });

  assert.equal(summary.publicRpcFallbacksEnabled, true);
  assert.ok(summary.configuredWithPublicRpc >= FREE_DEFAULT_UNISWAP_IDS.length - 1);
  assert.ok(summary.configuredWithEnvRpc >= 1);
  assert.ok(summary.byChain.base.configuredWithEnvRpc >= 1);
});
