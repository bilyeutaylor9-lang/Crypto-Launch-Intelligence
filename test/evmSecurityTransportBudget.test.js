import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const executor = new URL("../src/data/activeEvidenceProviderExecutor.js", import.meta.url).href;
const goPlusLimiter = new URL("../src/data/security/goplusRequestLimiter.js", import.meta.url).href;

function scenario(t, body) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "cli-security-transport-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", `
    import assert from "node:assert/strict";
    const { createActiveEvidenceExecutionState, executeActiveEvidenceProviderRequests } = await import(${JSON.stringify(executor)});
    const { createGoPlusRequestLimiter } = await import(${JSON.stringify(goPlusLimiter)});
    const TOKEN = "0x1111111111111111111111111111111111111111";
    const CREATOR = "0x2222222222222222222222222222222222222222";
    const candidate = { chain: "base", tokenAddress: TOKEN };
    const requests = [{ field: "contractVerified", item: { targetSources: [{ source: "explorer" }] } }];
    const calls = [];
    let slots = 0;
    const limiter = Object.assign(async () => { slots++; return true; }, { defer() {}, cooldownUntil: () => 0 });
    function payload(url) {
      const parsed = new URL(url);
      if (parsed.hostname === "api.gopluslabs.io") return { result: { [TOKEN]: { is_open_source: "1", is_honeypot: "0" } } };
      if (parsed.hostname === "sourcify.dev") return { chainId: "8453", address: TOKEN, match: "exact_match", deployment: { deployer: CREATOR, blockNumber: "123" } };
      if (parsed.hostname.includes("etherscan")) {
        const action = parsed.searchParams.get("action");
        return action === "getsourcecode" ? { status: "1", result: [{ SourceCode: "contract Test {}", ContractName: "Test", ABI: "[]" }] }
          : action === "getabi" ? { status: "1", result: "[]" }
          : { status: "1", result: [{ contractCreator: CREATOR }] };
      }
      if (parsed.pathname.includes("smart-contracts")) return { hash: TOKEN, is_verified: true, name: "Test" };
      if (parsed.pathname.includes("addresses")) return { hash: TOKEN, is_verified: true };
      throw new Error("Unexpected fixture endpoint");
    }
    let transport = async (url, init = {}) => { calls.push({ url, signal: init.signal }); return payload(url); };
    globalThis.fetch = async (url, init) => ({ ok: true, status: 200, json: () => transport(url, init), headers: new Headers() });
    const options = { maxRequests: 20, providerTimeoutMs: 500, goPlusRateLimiter: limiter,
      securityEvidence: { useCache: false, env: { ETHERSCAN_API_KEY: "fixture-not-a-real-key" },
        fetchJson: (...args) => transport(...args) } };
    ${body.toString()}
    await run();
  `], { cwd: directory, encoding: "utf8", timeout: 15_000 });
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

test("native EVM security charges all seven cold HTTP requests when Etherscan is configured", (t) => scenario(t, async function run() {
  const state = createActiveEvidenceExecutionState(options);
  const result = await executeActiveEvidenceProviderRequests(candidate, requests, options, state);
  assert.equal(calls.length, 7);
  assert.equal(state.requestsUsed, calls.length);
  assert.equal(result.attempts.filter(item => item.status === "SUCCESS").length, 7);
  assert.equal(slots, 1);
  assert.equal(result.observations.find(item => item.field === "contractVerified")?.value, true);
}));

test("parallel explorer requests cannot cross a smaller shared request cap", (t) => scenario(t, async function run() {
  options.maxRequests = 4;
  const state = createActiveEvidenceExecutionState(options);
  const result = await executeActiveEvidenceProviderRequests(candidate, requests, options, state);
  assert.equal(calls.length, 4);
  assert.equal(state.requestsUsed, 4);
  assert.ok(result.attempts.some(item => item.status === "REQUEST_BUDGET_EXHAUSTED"));
}));

test("missing Etherscan configuration costs no requests or provider failures", (t) => scenario(t, async function run() {
  options.securityEvidence.env = {};
  const state = createActiveEvidenceExecutionState(options);
  const result = await executeActiveEvidenceProviderRequests(candidate, requests, options, state);
  assert.equal(calls.length, 4);
  assert.equal(state.requestsUsed, 4);
  assert.ok(!result.attempts.some(item => item.provider === "etherscan-security"));
}));

test("cache-only security reuse consumes neither quota nor a GoPlus slot", (t) => scenario(t, async function run() {
  options.securityEvidence.useCache = true;
  const state = createActiveEvidenceExecutionState(options);
  const first = await executeActiveEvidenceProviderRequests(candidate, requests, options, state);
  const firstCount = calls.length;
  const second = await executeActiveEvidenceProviderRequests(candidate, requests, options, state);
  assert.equal(firstCount, 7);
  assert.equal(calls.length, firstCount);
  assert.equal(state.requestsUsed, firstCount);
  assert.equal(slots, 1);
  assert.equal(second.observations.find(item => item.field === "contractVerified")?.value, true);
  assert.deepEqual(second.observations.map(item => item.sourceTimestamp), first.observations.map(item => item.sourceTimestamp));
}));

test("native security starts no transport when its request cap is zero", (t) => scenario(t, async function run() {
  options.maxRequests = 0;
  const state = createActiveEvidenceExecutionState(options);
  const result = await executeActiveEvidenceProviderRequests(candidate, requests, options, state);
  assert.equal(calls.length, 0);
  assert.equal(slots, 0);
  assert.equal(state.requestsUsed, 0);
  assert.deepEqual(result.observations, []);
  assert.deepEqual(result.projectPatch, {});
  assert.deepEqual(result.changedEvidenceFamilies, []);
}));

test("raw security cannot consume the request allowance reserved for later proof", (t) => scenario(t, async function run() {
  options.phaseRequestLimit = 2;
  const state = createActiveEvidenceExecutionState(options);
  const result = await executeActiveEvidenceProviderRequests(candidate, requests, options, state);
  assert.equal(calls.length, 2);
  assert.equal(state.requestsUsed, 2);
  assert.equal(state.phaseRequestBudgetExceeded, true);
  assert.ok(result.attempts.some(item => item.status === "PHASE_REQUEST_BUDGET_EXHAUSTED"));
  assert.equal(result.attempts.reduce((sum, item) => sum + item.requestCost, 0), 2);
  assert.equal(result.attempts.reduce((sum, item) => sum + item.httpRequests, 0), 2);
}));

test("expired absolute security deadline admits neither HTTP nor limiter work", (t) => scenario(t, async function run() {
  options.now = () => 1000;
  options.deadlineAt = 1000;
  const state = createActiveEvidenceExecutionState(options);
  const result = await executeActiveEvidenceProviderRequests(candidate, requests, options, state);
  assert.equal(calls.length, 0);
  assert.equal(slots, 0);
  assert.equal(state.requestsUsed, 0);
  assert.equal(state.timeBudgetExceeded, true);
  assert.deepEqual(result.observations, []);
}));

test("queued native security cannot dispatch after its phase deadline", (t) => scenario(t, async function run() {
  options.now = () => 1000;
  options.phaseDeadlineAt = 1100;
  options.deadlineAt = 2000;
  const state = createActiveEvidenceExecutionState(options);
  state.now = () => state.requestsUsed > 0 ? 1100 : 1000;
  const result = await executeActiveEvidenceProviderRequests(candidate, requests, options, state);
  assert.equal(calls.length, 0);
  assert.equal(state.phaseTimeBudgetExceeded, true);
  assert.equal(state.timeBudgetExceeded, false);
  assert.deepEqual(result.observations, []);
  assert.ok([...state.providers.values()].every(item => item.failures === 0));
}));

test("GoPlus cooldown cannot suppress independent explorer requests or establish honeypot safety", (t) => scenario(t, async function run() {
  options.goPlusRateLimiter = Object.assign(async () => false, { cooldownUntil: () => Date.now() + 61000 });
  const state = createActiveEvidenceExecutionState(options);
  const result = await executeActiveEvidenceProviderRequests(candidate, [...requests, { field: "honeypotDetected" }], options, state);
  assert.equal(calls.length, 6);
  assert.equal(state.requestsUsed, 6);
  assert.ok(result.attempts.some(item => item.provider === "goplus-security" && item.status === "PROVIDER_COOLDOWN"));
  assert.equal(result.observations.find(item => item.field === "contractVerified")?.value, true);
  assert.ok(!result.observations.some(item => item.field === "honeypotDetected"));
}));

test("native security circuit breakers isolate a failed provider across exact candidates", (t) => scenario(t, async function run() {
  options.circuitFailureThreshold = 1;
  const normal = transport;
  transport = async (url, init) => {
    if (new URL(url).hostname === "api.gopluslabs.io") { calls.push({ url }); throw new Error("fixture outage"); }
    return normal(url, init);
  };
  const state = createActiveEvidenceExecutionState(options);
  await executeActiveEvidenceProviderRequests(candidate, requests, options, state);
  const second = await executeActiveEvidenceProviderRequests(candidate, requests, options, state);
  assert.equal(calls.filter(item => item.url.includes("api.gopluslabs.io")).length, 1);
  assert.equal(state.requestsUsed, calls.length);
  assert.ok(second.attempts.some(item => item.provider === "goplus-security" && item.status === "CIRCUIT_OPEN"));
  assert.ok(second.attempts.some(item => item.provider === "sourcify-security" && item.status === "SUCCESS"));
}));

test("HTTP 429 preserves Retry-After and rate-limit provenance without consuming subsequent quota", (t) => scenario(t, async function run() {
  delete options.securityEvidence.fetchJson;
  const now = Date.now();
  options.now = () => now;
  let deferredMs = 0;
  options.goPlusRateLimiter = Object.assign(async () => true, {
    defer(ms) { deferredMs = ms; }, cooldownUntil: () => now + deferredMs,
  });
  globalThis.fetch = async (url, init) => {
    calls.push({ url, signal: init.signal });
    const rateLimited = new URL(url).hostname === "api.gopluslabs.io";
    return { ok: !rateLimited, status: rateLimited ? 429 : 200,
      headers: new Headers(rateLimited ? { "retry-after": "120" } : {}), json: async () => payload(url) };
  };
  const state = createActiveEvidenceExecutionState(options);
  const first = await executeActiveEvidenceProviderRequests(candidate, [...requests, { field: "honeypotDetected" }], options, state);
  const second = await executeActiveEvidenceProviderRequests(candidate, requests, options, state);
  assert.equal(deferredMs, 120000);
  assert.equal(calls.filter(item => item.url.includes("api.gopluslabs.io")).length, 1);
  assert.equal(state.requestsUsed, calls.length);
  const provider = [...state.providers.values()].find(item => item.provider === "goplus-security");
  assert.equal(provider.rateLimitResponses, 1);
  assert.equal(provider.failures, 0);
  assert.equal(provider.cooldownUntil, now + 120000);
  assert.ok(first.attempts.some(item => item.status === "RATE_LIMITED"));
  assert.ok(first.projectPatch.securityEvidence.some(item => item.provider === "goplus" && item.httpStatus === 429 && item.rateLimited));
  assert.ok(!first.observations.some(item => item.field === "honeypotDetected"));
  assert.ok(second.attempts.some(item => item.provider === "goplus-security" && item.status === "PROVIDER_COOLDOWN"));
  assert.ok(calls.every(item => item.signal instanceof AbortSignal));
}));

test("failed explorer siblings are settled before the security report is returned", (t) => scenario(t, async function run() {
  options.maxRequests = 4;
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  transport = async (url, init) => {
    calls.push({ url, signal: init.signal });
    const action = new URL(url).searchParams.get("action");
    if (action === "getabi") throw new Error("fixture ABI outage");
    if (action) await gate;
    return payload(url);
  };
  const state = createActiveEvidenceExecutionState(options);
  let finished = false;
  const pending = executeActiveEvidenceProviderRequests(candidate, requests, options, state).then(result => { finished = true; return result; });
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(finished, false);
  release();
  const result = await pending;
  assert.equal(calls.length, 4);
  assert.equal(state.requestsUsed, 4);
  assert.equal(result.attempts.filter(item => item.requestCost === 1).length, 4);
}));

test("timed-out native HTTP requests are aborted and counted, never promoted", (t) => scenario(t, async function run() {
  options.maxRequests = 2;
  options.providerTimeoutMs = 250;
  let aborted = 0;
  transport = (url, init) => new Promise((_, reject) => {
    calls.push({ url, signal: init.signal });
    init.signal.addEventListener("abort", () => { aborted++; reject(new Error("fixture abort")); }, { once: true });
  });
  const state = createActiveEvidenceExecutionState(options);
  const result = await executeActiveEvidenceProviderRequests(candidate, requests, options, state);
  assert.equal(calls.length, 2);
  assert.equal(aborted, 2);
  assert.equal(state.requestsUsed, 2);
  assert.deepEqual(result.observations, []);
}));

test("custom security providers retain their explicit legacy budget contract", (t) => scenario(t, async function run() {
  options.securityProviderRequestCost = 2;
  options.securityEvidence.providers = [async () => ({ provider: "custom", status: "UNKNOWN" })];
  const state = createActiveEvidenceExecutionState(options);
  const result = await executeActiveEvidenceProviderRequests(candidate, requests, options, state);
  assert.equal(calls.length, 0);
  assert.equal(state.requestsUsed, 2);
  assert.equal(result.attempts.length, 1);
  assert.equal(result.attempts[0].provider, "free-security");
  assert.deepEqual(result.observations, []);
}));

test("another token's GoPlus record cannot become native safety evidence", (t) => scenario(t, async function run() {
  const normal = transport;
  transport = async (url, init) => new URL(url).hostname === "api.gopluslabs.io"
    ? { result: { [CREATOR]: { is_open_source: "1", is_honeypot: "0" } } } : normal(url, init);
  const state = createActiveEvidenceExecutionState(options);
  const result = await executeActiveEvidenceProviderRequests(candidate, [...requests, { field: "honeypotDetected" }], options, state);
  assert.ok(!result.observations.some(item => item.field === "honeypotDetected"));
  assert.equal(result.projectPatch.securityEvidence.find(item => item.provider === "goplus").status, "UNKNOWN");
}));

test("execution-only JSON transports are not reused by EVM security", (t) => scenario(t, async function run() {
  delete options.securityEvidence.fetchJson;
  let executionCalls = 0;
  options.providers = { fetchJson: async () => { executionCalls++; throw new Error("execution-only transport"); } };
  const state = createActiveEvidenceExecutionState(options);
  const result = await executeActiveEvidenceProviderRequests(candidate, requests, options, state);
  assert.equal(executionCalls, 0);
  assert.equal(calls.length, 7);
  assert.equal(state.requestsUsed, 7);
  assert.equal(result.observations.find(item => item.field === "contractVerified")?.value, true);
}));

test("native security preserves shorter connector timeouts within its global allowance", (t) => scenario(t, async function run() {
  options.securityEvidence.timeoutMs = 10;
  const timeouts = [];
  const normal = transport;
  transport = async (url, init) => { timeouts.push(init.timeoutMs); return normal(url, init); };
  const state = createActiveEvidenceExecutionState(options);
  await executeActiveEvidenceProviderRequests(candidate, requests, options, state);
  assert.equal(timeouts.length, 7);
  assert.ok(timeouts.every(timeout => timeout > 0 && timeout <= 10));
}));

test("ordinary 404 metadata lookups stay UNKNOWN without disabling native metadata providers", (t) => scenario(t, async function run() {
  options.securityEvidence.env = {};
  options.circuitFailureThreshold = 1;
  transport = async (url, init) => {
    calls.push({ url, signal: init.signal });
    const error = new Error("fixture no metadata"); error.status = 404; throw error;
  };
  const state = createActiveEvidenceExecutionState(options);
  for (let index = 0; index < 4; index++) {
    const result = await executeActiveEvidenceProviderRequests(candidate, requests, options, state);
    assert.deepEqual(result.observations, []);
    assert.ok(result.attempts.every(item => item.status === "NO_CANDIDATE_EVIDENCE"));
  }
  assert.equal(calls.length, 16);
  assert.equal(state.requestsUsed, 16);
  assert.ok([...state.providers.values()].every(item => item.failures === 0 && item.circuitOpen === false));
}));

test("an arbitrarily large Retry-After cannot corrupt serialized provider cooldowns", (t) => scenario(t, async function run() {
  let now = Date.now();
  options.now = () => now;
  options.goPlusRateLimiter = createGoPlusRequestLimiter({ now: () => now, sleep: async ms => { now += ms; } });
  const normal = transport;
  transport = async (url, init) => {
    if (new URL(url).hostname !== "api.gopluslabs.io") return normal(url, init);
    calls.push({ url, signal: init.signal });
    const error = new Error("fixture rate limit"); error.status = 429; error.retryAfterMs = 1e30; throw error;
  };
  const state = createActiveEvidenceExecutionState(options);
  await executeActiveEvidenceProviderRequests(candidate, requests, options, state);
  const second = await executeActiveEvidenceProviderRequests(candidate, requests, options, state);
  const cooldown = second.attempts.find(item => item.provider === "goplus-security");
  assert.equal(cooldown.status, "PROVIDER_COOLDOWN");
  assert.ok(Number.isFinite(Date.parse(cooldown.retryAt)));
  assert.equal(options.goPlusRateLimiter.cooldownUntil(), 8_640_000_000_000_000);
  const before = calls.length;
  const wallet = await executeActiveEvidenceProviderRequests(candidate, [{ field: "holderAddresses", item: {
    cheapHolderMetadataOnly: true, targetSources: [{ source: "GoPlus" }],
  } }], { ...options, cheapHolderMetadataOnly: true, useCheapBlockscoutHolderMetadata: false, walletHistory: false }, state);
  assert.equal(calls.length, before);
  const walletCooldown = wallet.attempts.find(item => item.provider === "goplus-wallets");
  assert.equal(walletCooldown.status, "PROVIDER_COOLDOWN");
  assert.ok(Number.isFinite(Date.parse(walletCooldown.retryAt)));
  assert.equal(state.requestsUsed, calls.length);
}));

test("current cached security proof can be reused at zero remaining request budget", (t) => scenario(t, async function run() {
  options.securityEvidence.useCache = true;
  await executeActiveEvidenceProviderRequests(candidate, requests, options);
  options.maxRequests = 0;
  const state = createActiveEvidenceExecutionState(options);
  const before = calls.length;
  const result = await executeActiveEvidenceProviderRequests(candidate, requests, options, state);
  assert.equal(calls.length, before);
  assert.equal(state.requestsUsed, 0);
  assert.equal(slots, 1);
  assert.equal(result.observations.find(item => item.field === "contractVerified")?.value, true);
}));
