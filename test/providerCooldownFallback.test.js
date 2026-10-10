import test from "node:test";
import assert from "node:assert/strict";
import { createGoPlusRequestLimiter } from "../src/data/security/goplusRequestLimiter.js";
import { createActiveEvidenceExecutionState, executeActiveEvidenceProviderRequests, recoverDeployerEvidence } from "../src/data/activeEvidenceProviderExecutor.js";
import { getGoPlusSecurityEvidence } from "../src/data/security/goplusSecurityConnector.js";
import { getFreeSecurityEvidence } from "../src/data/security/freeSecurityEvidenceConnector.js";

const tokenAddress = "0x1111111111111111111111111111111111111111";
const creatorAddress = "0x2222222222222222222222222222222222222222";

test("cooldown skips do not sleep, reserve quota or prevent subsequent paced calls", async () => {
  let now = 1000;
  const waits = [];
  const limiter = createGoPlusRequestLimiter({ now: () => now, sleep: async (ms) => { waits.push(ms); now += ms; } });
  await limiter();
  limiter.defer();
  assert.deepEqual(await Promise.all([limiter({ waitForCooldown: false }), limiter({ waitForCooldown: false })]), [false, false]);
  assert.deepEqual(waits, []);
  assert.equal(limiter.cooldownUntil(), 62000);
  now = 62000;
  assert.equal(await limiter({ waitForCooldown: false }), true);
  assert.equal(await limiter({ waitForCooldown: false }), true);
  assert.deepEqual(waits, [2100]);
});

test("creator recovery reaches exact independent fallback during GoPlus cooldown", async () => {
  let now = 1000;
  const limiter = createGoPlusRequestLimiter({ now: () => now, sleep: async () => { throw new Error("must not wait for cooldown"); } });
  limiter.defer();
  const state = createActiveEvidenceExecutionState({ now: () => now, timeBudgetMs: 1000, maxProviderRequests: 1 });
  const result = await recoverDeployerEvidence({ chain: "base", tokenAddress }, ["creator"], {
    preferGoPlusDeployer: true, defaultGoPlusDeployerProvider: true,
    getGoPlusDeployerEvidence: async () => { throw new Error("must not call cooled provider"); },
    useSourcifyDeployerFallback: true,
    getSourcifyDeployerEvidence: async () => ({ chain: "base", address: tokenAddress, creatorAddress }),
  }, { goPlusRateLimiter: limiter }, state);
  assert.equal(result.observations.find((row) => row.field === "creator")?.value, creatorAddress);
  assert.deepEqual(result.attempts.map((row) => row.status), ["PROVIDER_COOLDOWN", "SUCCESS"]);
  assert.equal(result.attempts[0].retryAt, new Date(62000).toISOString());
  assert.equal(state.requestsUsed, 1);
  assert.equal(state.timeBudgetExceeded, false);
});

test("recovery deadlines still take precedence over cooldown skips", async () => {
  const limiter = createGoPlusRequestLimiter({ now: () => 1000 });
  limiter.defer();
  const state = createActiveEvidenceExecutionState({ now: () => 1000, timeBudgetMs: 0 });
  const result = await recoverDeployerEvidence({ chain: "base", tokenAddress }, ["creator"], {
    preferGoPlusDeployer: true, defaultGoPlusDeployerProvider: true,
    getGoPlusDeployerEvidence: async () => { throw new Error("must not run"); },
    useSourcifyDeployerFallback: true,
    getSourcifyDeployerEvidence: async () => { throw new Error("must not run"); },
    getBlockscoutDeployerEvidence: async () => { throw new Error("must not run"); },
  }, { goPlusRateLimiter: limiter }, state);
  assert.equal(result.attempts[0].status, "TIME_BUDGET_EXHAUSTED");
  assert.ok(result.attempts.every((row) => ["TIME_BUDGET_EXHAUSTED", "PROVIDER_UNAVAILABLE"].includes(row.status)));
  assert.equal(state.requestsUsed, 0);
  assert.equal(state.timeBudgetExceeded, true);
});

test("security cooldown leaves GoPlus unknown but retains independent explorer proof", async (t) => {
  t.mock.method(globalThis, "fetch", async () => { throw new Error("No HTTP request allowed"); });
  let calls = 0;
  const result = await getFreeSecurityEvidence({ chain: "base", tokenAddress }, {
    useCache: false, goPlusCooldownSkipped: true,
    providers: [getGoPlusSecurityEvidence, async () => { calls++;
      return { provider: "independent-explorer", status: "EVIDENCE_AVAILABLE", confidence: 0.8,
        chain: "base", address: tokenAddress, contractVerified: true, riskFindings: [], warnings: [] }; }],
  });
  assert.equal(calls, 1);
  assert.equal(result.evidence[0].status, "UNKNOWN");
  assert.equal(result.evidence[0].providerCooldown, true);
  assert.equal(result.evidence[1].contractVerified, true);
  assert.equal(result.status, "EVIDENCE_AVAILABLE");
});

test("active security executor runs its combined collector during cooldown", async () => {
  const limiter = createGoPlusRequestLimiter({ now: () => 1000, sleep: async () => { throw new Error("must not sleep"); } });
  limiter.defer();
  let calls = 0;
  const state = createActiveEvidenceExecutionState({ now: () => 1000, timeBudgetMs: 1000, maxProviderRequests: 4 });
  const result = await executeActiveEvidenceProviderRequests({ chain: "base", tokenAddress },
    [{ field: "contractVerified", item: { targetSources: [{ source: "goplus" }] } }], {
      goPlusRateLimiter: limiter,
      securityEvidence: { useCache: false, providers: [getGoPlusSecurityEvidence, async () => { calls++;
        return { provider: "sourcify-v2", chain: "base", address: tokenAddress, status: "EVIDENCE_AVAILABLE",
          confidence: 0.8, verifiedSource: true, observedAt: new Date().toISOString(), riskFindings: [], warnings: [] }; }] },
    }, state);
  assert.equal(calls, 1);
  assert.equal(state.requestsUsed, 4);
  assert.equal(result.attempts[0].status, "SUCCESS");
  assert.equal(result.observations.find((row) => row.field === "contractVerified")?.value, true);
  assert.equal(result.projectPatch.freeSecurityEvidence.evidence[0].status, "UNKNOWN");
});
