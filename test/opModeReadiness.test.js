import test from "node:test";
import assert from "node:assert/strict";

import {
  buildFreeCoverageReadiness,
  buildKeyReadiness,
  buildNativeReadiness,
  buildOpModeReadiness,
  buildSupabaseReadiness,
} from "../src/ops/opModeReadiness.js";

test("OP mode key readiness reports missing groups without exposing values", () => {
  const readiness = buildKeyReadiness({
    OPENAI_API_KEY: "sk-test",
    BIRDEYE_API_KEY: "birdeye-test",
    GITHUB_TOKEN: "github-test",
  });

  assert.ok(readiness.score > 0);
  assert.equal(readiness.groups.find((group) => group.id === "ai").status, "READY");
  assert.equal(readiness.groups.find((group) => group.id === "developer").status, "READY");
  assert.equal(readiness.groups.find((group) => group.id === "social-news").status, "MISSING");
  assert.equal(JSON.stringify(readiness).includes("sk-test"), false);
});

test("OP mode explorer readiness treats Etherscan V2 as multi-chain EVM coverage", () => {
  const readiness = buildKeyReadiness({
    ETHERSCAN_API_KEY: "etherscan-v2-secret",
    SOLSCAN_API_KEY: "solscan-secret",
  });
  const explorer = readiness.groups.find((group) => group.id === "explorer");

  assert.equal(explorer.status, "READY");
  assert.equal(explorer.presentRequired, 2);
  assert.equal(JSON.stringify(readiness).includes("etherscan-v2-secret"), false);
  assert.equal(JSON.stringify(readiness).includes("solscan-secret"), false);
});

test("OP mode explorer readiness accepts legacy chain explorer keys as EVM fallback", () => {
  const readiness = buildKeyReadiness({
    BASESCAN_API_KEY: "base-secret",
    SOLSCAN_API_KEY: "solscan-secret",
  });
  const explorer = readiness.groups.find((group) => group.id === "explorer");

  assert.equal(explorer.status, "READY");
  assert.deepEqual(explorer.items[0].presentKeys, ["BASESCAN_API_KEY"]);
  assert.equal(JSON.stringify(readiness).includes("base-secret"), false);
});

test("OP mode native readiness requires protocol identifiers and RPC access", () => {
  const readiness = buildNativeReadiness({
    NATIVE_PUBLIC_RPC_FALLBACKS: "false",
    BASE_AERODROME_FACTORY: "0xFactory",
    BASE_RPC_URL: "https://base.example",
    BASE_AERODROME_POOL_CREATED_TOPIC0:
      "0x783cca1c0412dd0d695e784568c98b25e9f8e00ae1352967ec6f45493ed1c2c",
    SOLANA_PUMP_FUN_PROGRAM: "pump-program",
  });

  const aerodrome = readiness.protocols.find((protocol) => protocol.id === "base-aerodrome-v2");
  const pump = readiness.protocols.find((protocol) => protocol.id === "solana-pump-migrations");

  assert.equal(aerodrome.status, "LIVE_READY");
  assert.equal(pump.status, "MISSING_RPC");
  assert.ok(readiness.liveReadyProtocols >= 1);
});

test("OP mode native readiness discounts public fallback RPC compared with dedicated RPC", () => {
  const publicOnly = buildNativeReadiness({});
  const withDedicatedBaseRpc = buildNativeReadiness({ BASE_RPC_URL: "https://base.example" });
  const rawPublicRatio = Math.round((publicOnly.liveReadyProtocols / publicOnly.totalProtocols) * 100);

  assert.ok(publicOnly.liveReadyPublicRpcProtocols > 0);
  assert.ok(publicOnly.score < rawPublicRatio);
  assert.ok(withDedicatedBaseRpc.score > publicOnly.score);
});

test("OP mode free coverage reports the public-source floor separately from premium keys", () => {
  const readiness = buildFreeCoverageReadiness();
  const market = readiness.groups.find((group) => group.id === "market-universe");
  const exchanges = readiness.groups.find((group) => group.id === "exchange-routes");
  const research = readiness.groups.find((group) => group.id === "research-discovery");
  const safety = readiness.groups.find((group) => group.id === "safety-contract");

  assert.equal(readiness.status, "READY");
  assert.ok(readiness.score >= 90);
  assert.equal(market.status, "READY");
  assert.equal(exchanges.status, "READY");
  assert.equal(research.status, "READY");
  assert.equal(safety.status, "READY");
  assert.equal(market.sources.some((source) => source.name === "defiLlamaYields" && source.enabled), true);
  assert.equal(research.sources.some((source) => source.name === "githubProjectDiscovery" && source.enabled), true);
  assert.equal(safety.sources.some((source) => source.name === "sourcify" && source.enabled), true);
});

test("OP mode readiness produces next actions for weak setup", () => {
  const readiness = buildOpModeReadiness({
    env: {},
    dataDir: "/tmp/crypto-launch-intelligence-missing-data",
    repoRoot: process.cwd(),
  });

  assert.equal(readiness.status, "SETUP_REQUIRED");
  assert.equal(readiness.freeCoverage.status, "READY");
  assert.ok(readiness.nextActions.length > 0);
  assert.ok(readiness.datasets.missingCriticalDatasets.length > 0);
});

test("OP mode Supabase readiness reports setup without exposing secrets", () => {
  const readiness = buildSupabaseReadiness({
    SUPABASE_ENABLED: "true",
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SECRET_KEY: "service-secret",
    SUPABASE_PUBLISHABLE_KEY: "public-secret",
    SUPABASE_JWKS_URL: "https://example.supabase.co/auth/v1/.well-known/jwks.json",
  });

  assert.equal(readiness.status, "READY");
  assert.equal(readiness.hasKey, true);
  assert.equal(readiness.keyType, "secret");
  assert.equal(readiness.serverWriteCapable, true);
  assert.equal(readiness.hasJwksUrl, true);
  assert.equal(JSON.stringify(readiness).includes("service-secret"), false);
});

test("OP mode Supabase readiness does not mark publishable-only keys as write-ready", () => {
  const readiness = buildSupabaseReadiness({
    SUPABASE_ENABLED: "true",
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_PUBLISHABLE_KEY: "public-secret",
  });

  assert.equal(readiness.status, "INCOMPLETE");
  assert.equal(readiness.hasKey, true);
  assert.equal(readiness.serverWriteCapable, false);
  assert.ok(readiness.missing.some((item) => item.includes("server write key")));
  assert.equal(JSON.stringify(readiness).includes("public-secret"), false);
});
