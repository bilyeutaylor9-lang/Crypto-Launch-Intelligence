import test from "node:test";
import assert from "node:assert/strict";

import {
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

test("OP mode readiness produces next actions for weak setup", () => {
  const readiness = buildOpModeReadiness({
    env: {},
    dataDir: "/tmp/crypto-launch-intelligence-missing-data",
    repoRoot: process.cwd(),
  });

  assert.equal(readiness.status, "SETUP_REQUIRED");
  assert.ok(readiness.nextActions.length > 0);
  assert.ok(readiness.datasets.missingCriticalDatasets.length > 0);
});

test("OP mode Supabase readiness reports setup without exposing secrets", () => {
  const readiness = buildSupabaseReadiness({
    SUPABASE_ENABLED: "true",
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service-secret",
  });

  assert.equal(readiness.status, "READY");
  assert.equal(readiness.hasKey, true);
  assert.equal(JSON.stringify(readiness).includes("service-secret"), false);
});
