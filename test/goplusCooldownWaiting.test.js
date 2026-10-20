import test from "node:test";
import assert from "node:assert/strict";
import {
  createActiveEvidenceExecutionState,
  executeActiveEvidenceProviderRequests,
  recoverDeployerEvidence,
  recoverWalletEvidence,
} from "../src/data/activeEvidenceProviderExecutor.js";
import { createGoPlusRequestLimiter } from "../src/data/security/goplusRequestLimiter.js";
import { analyzeActiveEvidenceRecoveryBatch } from "../src/engines/activeEvidenceRecoveryEngine.js";

const NOW = Date.parse("2026-10-18T05:00:00Z");
const TOKEN = `0x${"1".repeat(40)}`;
const HOLDER = `0x${"2".repeat(40)}`;
const project = { chain: "base", tokenAddress: TOKEN };
const kinds = ["deployer", "wallet", "security"];

function fixture(kind, extra = {}) {
  let now = NOW;
  const counts = { provider: 0, explorer: 0, rpc: 0 };
  const waits = [];
  const cost = kind === "security" ? 4 : 1;
  const state = createActiveEvidenceExecutionState({
    now: () => now, timeBudgetMs: extra.timeBudgetMs ?? 1000, maxProviderRequests: cost,
  });
  const limiter = createGoPlusRequestLimiter({
    now: () => now,
    sleep: async (ms) => {
      assert.equal(state.requestsUsed, 0, "waiting must not reserve request budget");
      waits.push(ms);
      now += ms;
      extra.duringWait?.(state);
    },
  });
  limiter.defer(100);
  const proof = {
    provider: "goplus", status: "EVIDENCE_AVAILABLE", chain: "base", address: TOKEN,
    creatorAddress: HOLDER, observedAt: new Date(NOW).toISOString(), confidence: 85,
    responseIdentityVerified: true, honeypot: false,
    raw: { holders: [{ address: HOLDER, balance: "1" }], is_honeypot: "0" },
  };
  const acquire = async () => { counts.provider++; return extra.result ?? proof; };
  const providers = {
    preferGoPlusDeployer: true, defaultGoPlusDeployerProvider: true,
    getGoPlusDeployerEvidence: acquire,
    getBlockscoutDeployerEvidence: async () => { counts.explorer++; return { status: "UNKNOWN" }; },
    useGoPlusWalletFallback: true, defaultGoPlusWalletProvider: true,
    getGoPlusWalletEvidence: acquire,
    getBlockscoutWalletEvidence: async () => { counts.explorer++; return { status: "UNKNOWN" }; },
    useRpcWalletFallback: true,
    getRpcWalletEvidence: async () => { counts.rpc++; return { status: "UNKNOWN" }; },
  };
  const options = {
    now: () => now, useCache: false, walletHistory: false,
    goPlusRateLimiter: limiter, waitForGoPlusCooldown: extra.waitForGoPlusCooldown ?? true,
    securityEvidence: { useCache: false, providers: [async (_project, providerOptions) => {
      assert.equal(providerOptions.goPlusRequestSlotReserved, true);
      assert.equal(providerOptions.goPlusCooldownSkipped, false);
      return acquire();
    }] },
  };
  const run = () => kind === "deployer"
    ? recoverDeployerEvidence(project, ["creator"], providers, options, state)
    : kind === "wallet"
      ? recoverWalletEvidence(project, ["wallets", "holderAddresses"], providers, options, state)
      : executeActiveEvidenceProviderRequests(project, [
        { field: "honeypotDetected", item: { targetSources: [{ source: "GoPlus" }] } },
      ], options, state);
  return { run, state, waits, counts, options, cost, limiter };
}

for (const kind of kinds) {
  test(`${kind}: opt-in waits within the existing cooldown and budget`, async () => {
    const f = fixture(kind);
    const deadline = f.state.deadlineAt;
    const result = await f.run();
    assert.deepEqual(f.waits, [100]);
    assert.equal(f.counts.provider, 1);
    assert.equal(f.state.requestsUsed, f.cost);
    assert.equal(f.state.deadlineAt, deadline);
    assert.equal(f.state.timeBudgetExceeded, false);
    assert.ok(result.attempts.some((item) => item.status === "SUCCESS"));
    assert.ok(result.observations.length > 0);
    assert.equal(f.counts.explorer, 0);
    assert.equal(f.counts.rpc, 0);
    for (const field of ["uniqueBuyers24h", "independentBuyers24h", "smartWallets", "smartWalletScore"]) {
      assert.equal(result.observations.some((item) => item.field === field), false);
    }
  });

  test(`${kind}: cooldown waiting stops at the absolute deadline without dispatch`, async () => {
    const f = fixture(kind, { timeBudgetMs: 50 });
    const result = await f.run();
    assert.deepEqual(f.waits, [50]);
    assert.equal(f.counts.provider, 0);
    assert.equal(f.state.requestsUsed, 0);
    assert.equal(f.state.timeBudgetExceeded, true);
    assert.equal(result.attempts[0].status, "TIME_BUDGET_EXHAUSTED");
    assert.deepEqual(result.observations, []);
    assert.equal(f.counts.explorer, 0);
    assert.equal(f.counts.rpc, 0);
  });

  test(`${kind}: an already expired deadline never enters the limiter`, async () => {
    const f = fixture(kind, { timeBudgetMs: 0 });
    const result = await f.run();
    assert.deepEqual(f.waits, []);
    assert.equal(f.counts.provider, 0);
    assert.equal(f.state.requestsUsed, 0);
    assert.equal(result.attempts[0].status, "TIME_BUDGET_EXHAUSTED");
    assert.deepEqual(result.observations, []);
  });

  test(`${kind}: budget consumed during the wait prevents dispatch`, async () => {
    const f = fixture(kind, { duringWait: (state) => { state.requestsUsed = state.maxRequests; } });
    const result = await f.run();
    assert.deepEqual(f.waits, [100]);
    assert.equal(f.counts.provider, 0);
    assert.equal(f.state.requestsUsed, f.cost);
    assert.equal(result.attempts[0].status, "REQUEST_BUDGET_EXHAUSTED");
    assert.deepEqual(result.observations, []);
    assert.equal(f.counts.explorer, 0);
    assert.equal(f.counts.rpc, 0);
  });

  test(`${kind}: exhausted budget never waits or dispatches`, async () => {
    const f = fixture(kind);
    f.state.requestsUsed = f.state.maxRequests;
    const result = await f.run();
    assert.deepEqual(f.waits, []);
    assert.equal(f.counts.provider, 0);
    assert.equal(f.state.requestsUsed, f.cost);
    assert.equal(result.attempts[0].status, "REQUEST_BUDGET_EXHAUSTED");
    assert.deepEqual(result.observations, []);
  });

  test(`${kind}: a circuit opened during waiting is preserved and blocks dispatch`, async () => {
    const provider = kind === "security" ? "free-security" : `goplus-${kind === "wallet" ? "wallets" : "deployer"}`;
    const key = `${provider}:base`;
    const f = fixture(kind, { duringWait: (state) => {
      state.providers.get(key).circuitOpen = true;
    } });
    const result = await f.run();
    assert.deepEqual(f.waits, [100]);
    assert.equal(f.counts.provider, 0);
    assert.equal(f.state.requestsUsed, 0);
    assert.equal(f.state.providers.get(key).circuitOpen, true);
    assert.equal(result.attempts[0].status, "CIRCUIT_OPEN");
    assert.deepEqual(result.observations, []);
  });
}

test("unknown GoPlus responses after waiting never become positive evidence", async () => {
  for (const kind of kinds) {
    const f = fixture(kind, { result: { provider: "goplus", status: "UNKNOWN" } });
    const result = await f.run();
    assert.deepEqual(f.waits, [100]);
    assert.equal(f.counts.provider, 1);
    assert.equal(f.state.requestsUsed, f.cost);
    assert.deepEqual(result.observations, []);
    assert.equal(f.counts.rpc, 0);
  }
});

test("direct helper waiting requires literal true; omitted and truthy options remain nonblocking", async () => {
  for (const kind of ["deployer", "wallet"]) {
    for (const value of [undefined, false, "true", 1]) {
      const f = fixture(kind);
      f.options.waitForGoPlusCooldown = value;
      const result = await f.run();
      assert.deepEqual(f.waits, []);
      assert.equal(f.counts.provider, 0);
      assert.equal(result.attempts[0].status, "PROVIDER_COOLDOWN");
      assert.deepEqual(result.observations, []);
    }
  }
});

test("bounded batch recovery opts into shared cooldown waiting without requiring a caller override", async () => {
  const f = fixture("security");
  delete f.options.waitForGoPlusCooldown;
  const [result] = await analyzeActiveEvidenceRecoveryBatch([{ ...project,
    poolAddress: HOLDER, deepEvaluationState: "DEEP_EVALUATED",
    executionProof: { routeType: "DEX", safetyVerified: false, transferTaxEvidenceVerified: true },
  }], { ...f.options, executionState: f.state, wave2Max: 0, wave3Max: 0 });
  assert.deepEqual(f.waits, [100]);
  assert.equal(f.counts.provider, 1);
  assert.equal(f.state.requestsUsed, 4);
  assert.equal(result.honeypotDetected, false);
  assert.notEqual(result.finalSelectionQualified, true);
});
