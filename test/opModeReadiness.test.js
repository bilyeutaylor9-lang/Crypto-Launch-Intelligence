import test from "node:test";
import assert from "node:assert/strict";

import {
  buildKeyReadiness,
  buildNativeReadiness,
  buildOpModeReadiness,
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
    BASE_AERODROME_FACTORY: "0xFactory",
    BASE_RPC_URL: "https://base.example",
    SOLANA_PUMP_FUN_PROGRAM: "pump-program",
  });

  const aerodrome = readiness.protocols.find((protocol) => protocol.id === "base-aerodrome-v2");
  const pump = readiness.protocols.find((protocol) => protocol.id === "solana-pump-migrations");

  assert.equal(aerodrome.status, "LIVE_READY");
  assert.equal(pump.status, "MISSING_RPC");
  assert.ok(readiness.liveReadyProtocols >= 1);
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
