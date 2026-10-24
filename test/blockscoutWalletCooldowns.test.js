import test from "node:test";
import assert from "node:assert/strict";
import { fetchJson } from "../src/data/security/securityEvidenceUtils.js";
import { getBlockscoutWalletEvidence } from "../src/data/blockscoutWalletConnector.js";
import { createActiveEvidenceExecutionState, executeActiveEvidenceProviderRequests } from "../src/data/activeEvidenceProviderExecutor.js";

const NOW = Date.parse("2026-10-23T12:00:00Z");
const ROOT = "https://explorer.invalid";
const TOKEN = `0x${"1".repeat(40)}`;
const HOLDER = `0x${"2".repeat(40)}`;
const PROJECT = { chain: "bsc", tokenAddress: TOKEN };
const iso = (ms) => new Date(ms).toISOString();

test.beforeEach((t) => {
  let unexpectedHttp = 0;
  t.mock.method(globalThis, "fetch", async () => {
    unexpectedHttp++;
    throw new Error("Live HTTP forbidden in wallet cooldown tests");
  });
  t.after(() => assert.equal(unexpectedHttp, 0));
});

function response(status, retryAfter = null, body = {}) {
  return new Response(JSON.stringify(body), { status,
    headers: retryAfter === null ? {} : { "retry-after": retryAfter } });
}

function limited(ms = 120_000, fields = {}) {
  return Object.assign(new Error("Fixture HTTP 404 message is not a status"), {
    status: 429, retryAfterMs: ms, ...fields,
  });
}

function success(url) {
  if (url.includes("/transfers?")) return { items: [] };
  if (url.endsWith("/holders")) return { items: [{ address: HOLDER, value: "5" }] };
  return { address_hash: TOKEN, holders_count: "12" };
}

function fixture(cheap, respond, overrides = {}) {
  let now = NOW;
  const calls = [];
  const evidence = [];
  const options = { env: {}, now: () => now, useCache: false, walletHistory: false,
    blockscoutBaseUrl: ROOT, maxProviderRequests: 50,
    useCheapBlockscoutHolderMetadata: true, useGoPlusWalletFallback: false, useRpcWalletFallback: false,
    blockscoutMetadataRateLimiter: async () => true,
    fetchJson: async (url, init) => { calls.push({ url, init }); return respond(url, init); },
    ...overrides,
    providers: { getBlockscoutWalletEvidence: async (project, config) => {
      const result = await getBlockscoutWalletEvidence(project, config);
      evidence.push(result);
      return result;
    } },
  };
  const state = createActiveEvidenceExecutionState(options);
  const execute = (project = PROJECT, patch = {}) => executeActiveEvidenceProviderRequests(project,
    [{ field: "holderAddresses", item: { cheapHolderMetadataOnly: cheap,
      targetSources: [{ source: "Blockscout" }] } }], { ...options, ...patch }, state);
  return { options, state, calls, evidence, execute, setNow: (value) => { now = value; } };
}

test("default security JSON transport preserves real Retry-After headers and response receipt clock", async (t) => {
  for (const [header, expected] of [["120", 120_000], ["1.5", 1500],
    [new Date(NOW + 180_000).toUTCString(), 180_000], ["invalid", null], [null, null], ["-7", null]]) {
    t.mock.method(globalThis, "fetch", async () => response(429, header));
    await assert.rejects(fetchJson(`${ROOT}/token`, { now: () => NOW }), (error) => {
      assert.equal(error.status, 429);
      assert.equal(error.url, `${ROOT}/token`);
      assert.equal(error.retryAfter, header);
      assert.equal(error.retryAfterMs, expected);
      assert.equal(error.receivedAt, iso(NOW));
      return true;
    });
  }
});

for (const cheap of [true, false]) {
  const label = cheap ? "cheap" : "full";
  const cost = cheap ? 2 : 3;

  test(`${label}: default HTTP parses delta/date headers and conservatively defaults invalid or absent headers`, async (t) => {
    for (const [header, expected] of [["120", 120_000], [new Date(NOW + 180_000).toUTCString(), 180_000],
      ["invalid", 61_000], [null, 61_000], ["-7", 61_000], ["0", 61_000], ["Infinity", 61_000],
      [new Date(NOW - 60_000).toUTCString(), 61_000]]) {
      let httpCalls = 0;
      t.mock.method(globalThis, "fetch", async () => { httpCalls++; return response(429, header); });
      const f = fixture(cheap, () => assert.fail("Must use default HTTP transport"), { fetchJson: undefined });
      const result = await f.execute();
      assert.deepEqual(result.attempts.map(({ status }) => status), ["RATE_LIMITED"]);
      assert.deepEqual(result.observations, []);
      assert.equal(result.attempts[0].retryAt, iso(NOW + expected));
      assert.equal(f.evidence[0].retryAfterMs, expected);
      assert.equal(f.evidence[0].status, "UNKNOWN");
      assert.equal(f.evidence[0].holderCount, null);
      assert.deepEqual(f.evidence[0].wallets, []);
      assert.equal(f.evidence[0].buyTransactions24h, null);
      f.setNow(NOW + expected - 1);
      const blocked = await f.execute();
      assert.deepEqual(blocked.attempts.map(({ status }) => status), ["PROVIDER_COOLDOWN"]);
      assert.equal(httpCalls, cost);
      assert.equal(f.state.requestsUsed, cost);
      assert.equal(f.state.providers.get("blockscout-wallets:bsc").failures, 0);
      f.setNow(NOW + expected);
      t.mock.method(globalThis, "fetch", async (url) => { httpCalls++; return response(200, null, success(url)); });
      const recovered = await f.execute();
      assert.deepEqual(recovered.attempts.map(({ status }) => status), ["SUCCESS"]);
      assert.deepEqual(recovered.observations.find(({ field }) => field === "holderAddresses")?.value, [HOLDER]);
      assert.equal(httpCalls, 2 * cost);
      assert.equal(f.state.requestsUsed, 2 * cost);
    }
  });

  test(`${label}: valid partial HTTP evidence survives 429 and keeps its raw observation clock`, async (t) => {
    t.mock.timers.enable({ apis: ["Date"], now: NOW + 500 });
    const f = fixture(cheap, () => assert.fail("Must use default HTTP transport"), { fetchJson: undefined });
    let httpCalls = 0;
    t.mock.method(globalThis, "fetch", async (url) => {
      httpCalls++;
      return url.endsWith("/holders") ? response(200, null, success(url)) : response(429, "120");
    });
    const result = await f.execute();
    const stamp = cheap ? iso(NOW) : iso(NOW + 500);
    assert.deepEqual(result.attempts.map(({ status }) => status), ["SUCCESS"]);
    assert.deepEqual(result.observations.find(({ field }) => field === "holderAddresses")?.value, [HOLDER]);
    assert.ok(result.observations.every(({ sourceTimestamp }) => sourceTimestamp === stamp));
    assert.equal(result.projectPatch.blockscoutWalletEvidence.observedAt, stamp);
    assert.equal(result.projectPatch.blockscoutWalletEvidence.retryAt, iso(NOW + 120_000));
    assert.equal(result.projectPatch.blockscoutWalletEvidence.providerFailure, false);
    assert.equal(result.projectPatch.blockscoutWalletEvidence.buyTransactions24h, null);
    const original = structuredClone(result.projectPatch.blockscoutWalletEvidence);
    f.setNow(NOW + 60_000);
    const blocked = await f.execute();
    assert.deepEqual(blocked.attempts.map(({ status }) => status), ["PROVIDER_COOLDOWN"]);
    assert.deepEqual(blocked.observations, []);
    assert.deepEqual(result.projectPatch.blockscoutWalletEvidence, original);
    assert.equal(httpCalls, cost);
    assert.equal(f.state.requestsUsed, cost);
  });

  test(`${label}: cooldown follows the actual origin across chains, aliases and modes, but not unrelated origins`, async () => {
    const f = fixture(cheap, (url) => {
      if (new URL(url).origin === ROOT) throw limited();
      return success(url);
    });
    await f.execute();
    for (const chain of ["bnb", "56", "base", "8453", "avalanche"]) {
      const blocked = await f.execute({ ...PROJECT, chain }, { blockscoutBaseUrl: "https://EXPLORER.invalid:443/alias/" });
      assert.deepEqual(blocked.attempts.map(({ status }) => status), ["PROVIDER_COOLDOWN"]);
      assert.deepEqual(blocked.observations, []);
    }
    const alternate = await executeActiveEvidenceProviderRequests(PROJECT,
      [{ field: "holderAddresses", item: { cheapHolderMetadataOnly: !cheap, targetSources: [{ source: "Blockscout" }] } }],
      f.options, f.state);
    assert.deepEqual(alternate.attempts.map(({ status }) => status), ["PROVIDER_COOLDOWN"]);
    assert.equal(f.calls.length, cost);
    for (const origin of ["https://independent.invalid", "https://explorer.invalid:8443"]) {
      const recovered = await f.execute(PROJECT, { blockscoutBaseUrl: origin });
      assert.deepEqual(recovered.attempts.map(({ status }) => status), ["SUCCESS"]);
      assert.deepEqual(recovered.observations.find(({ field }) => field === "holderAddresses")?.value, [HOLDER]);
    }
    assert.equal(f.calls.length, cost * 3);
    assert.equal(f.state.requestsUsed, cost * 3);
  });

  test(`${label}: injected status aliases respect 429, but mixed real outages still count against the circuit`, async () => {
    for (const fields of [{ status: "429" }, { status: undefined, statusCode: 429 },
      { status: undefined, httpStatus: 429 }, { status: undefined, response: { status: 429 } }]) {
      const f = fixture(cheap, () => { throw limited(120_000, fields); });
      const result = await f.execute();
      assert.deepEqual(result.attempts.map(({ status }) => status), ["RATE_LIMITED"]);
      assert.equal((await f.execute()).attempts[0].status, "PROVIDER_COOLDOWN");
    }
    for (const status of [403, 500, 503, null]) {
      const f = fixture(cheap, (url) => {
        if (url.endsWith(TOKEN)) throw Object.assign(new Error("Real outage"), { status });
        throw limited();
      }, { circuitFailureThreshold: 1 });
      const result = await f.execute();
      assert.deepEqual(result.attempts.map(({ status }) => status), ["FAILED"]);
      assert.deepEqual(result.observations, []);
      assert.equal(f.state.providers.get("blockscout-wallets:bsc").failures, 1);
      assert.equal((await f.execute()).attempts[0].status, "CIRCUIT_OPEN");
      assert.equal((await f.execute({ ...PROJECT, chain: "base" })).attempts[0].status, "PROVIDER_COOLDOWN");
      assert.equal(f.calls.length, cost);
    }
  });

  test(`${label}: 404 plus 429 is no outage and successful empty payloads do not fabricate evidence`, async () => {
    for (const emptySuccess of [true, false]) {
      const f = fixture(cheap, (url) => {
        if (url.endsWith(TOKEN)) throw limited();
        if (emptySuccess) return {};
        throw Object.assign(new Error("Token absent"), { status: 404 });
      });
      const result = await f.execute();
      assert.equal(result.attempts[0].status, emptySuccess ? "SUCCESS" : "RATE_LIMITED");
      assert.deepEqual(result.observations, []);
      assert.equal(f.evidence[0].status, "UNKNOWN");
      assert.equal(f.evidence[0].holderCount, null);
      assert.equal(f.evidence[0].buyTransactions24h, null);
      assert.equal((await f.execute()).attempts[0].status, "PROVIDER_COOLDOWN");
    }
  });

  test(`${label}: cooldown expiry cannot reset request allowances or bypass absolute/phase deadlines`, async () => {
    for (const limits of [{ maxProviderRequests: cost }, { phaseRequestLimit: cost }]) {
      const f = fixture(cheap, () => { throw limited(); }, limits);
      await f.execute();
      f.setNow(NOW + 120_000);
      const blocked = await f.execute();
      assert.equal(blocked.attempts[0].status, limits.phaseRequestLimit ? "PHASE_REQUEST_BUDGET_EXHAUSTED" : "REQUEST_BUDGET_EXHAUSTED");
      assert.equal(f.state.requestsUsed, cost);
      assert.equal(f.calls.length, cost);
    }
    for (const limits of [{ timeBudgetMs: 1 }, { phaseDeadlineAt: NOW + 1 }]) {
      const f = fixture(cheap, () => { throw limited(); }, limits);
      await f.execute();
      f.setNow(NOW + 1);
      assert.equal((await f.execute()).attempts[0].status,
        limits.phaseDeadlineAt ? "PHASE_TIME_BUDGET_EXHAUSTED" : "TIME_BUDGET_EXHAUSTED");
      f.setNow(NOW + 120_000);
      assert.equal((await f.execute()).attempts[0].status,
        limits.phaseDeadlineAt ? "PHASE_TIME_BUDGET_EXHAUSTED" : "TIME_BUDGET_EXHAUSTED");
      assert.equal(f.calls.length, cost);
      assert.equal(f.state.requestsUsed, cost);
    }
  });

  test(`${label}: endpoint cooldown is recorded before slow siblings finish, with no receipt-time rebasing`, async () => {
    let release;
    let noteLimited;
    const seenLimited = new Promise((resolve) => { noteLimited = resolve; });
    const held = new Promise((resolve) => { release = resolve; });
    const f = fixture(cheap, async (url) => {
      if (url.endsWith(TOKEN)) { await held; return success(url); }
      noteLimited();
      throw limited(120_000, { receivedAt: iso(NOW) });
    });
    const running = f.execute();
    await seenLimited;
    // Let the rejected endpoint's handler publish the cooldown while metadata is pending.
    await new Promise((resolve) => setImmediate(resolve));
    const blocked = await f.execute({ ...PROJECT, chain: "base" });
    assert.equal(blocked.attempts[0].status, "PROVIDER_COOLDOWN");
    f.setNow(NOW + 30_000);
    release();
    const result = await running;
    assert.equal(result.attempts[0].status, "SUCCESS");
    assert.equal(f.evidence[0].retryAt, iso(NOW + 120_000));
    f.setNow(NOW + 120_000);
    const recovered = await f.execute(PROJECT, { fetchJson: async (url) => success(url) });
    assert.equal(recovered.attempts[0].status, "SUCCESS");
    assert.equal(f.state.requestsUsed, 2 * cost);
    assert.equal(f.calls.length, cost);
  });

  test(`${label}: endpoint Retry-After expiries are merged by absolute deadline, never shortened or rebased`, async () => {
    const f = fixture(cheap, (url) => {
      if (url.endsWith(TOKEN)) {
        f.setNow(NOW + 10_000);
        throw limited(61_000, { receivedAt: iso(NOW + 10_000) });
      }
      throw limited(180_000, { receivedAt: iso(NOW) });
    });
    const result = await f.execute();
    assert.equal(result.attempts[0].status, "RATE_LIMITED");
    assert.equal(result.attempts[0].retryAt, iso(NOW + 180_000));
    f.setNow(NOW + 180_000 - 1);
    const blocked = await f.execute();
    assert.equal(blocked.attempts[0].status, "PROVIDER_COOLDOWN");
    assert.equal(blocked.attempts[0].retryAt, iso(NOW + 180_000));
    f.setNow(NOW + 180_000);
    const recovered = await f.execute(PROJECT, { fetchJson: async (url) => success(url) });
    assert.equal(recovered.attempts[0].status, "SUCCESS");
    assert.equal(f.calls.length, cost);
    assert.equal(f.state.requestsUsed, 2 * cost);
  });
}

test("queued metadata admission rechecks a newly recorded origin cooldown before charging or dispatching", async () => {
  let release;
  let queued;
  const entered = new Promise((resolve) => { queued = resolve; });
  const wait = new Promise((resolve) => { release = resolve; });
  const f = fixture(true, () => { throw limited(); });
  const running = f.execute(PROJECT, { blockscoutMetadataRateLimiter: async () => { queued(); await wait; return true; } });
  await entered;
  await f.execute({ ...PROJECT, chain: "base" });
  release();
  const skipped = await running;
  assert.equal(skipped.attempts[0].status, "PROVIDER_COOLDOWN");
  assert.equal(skipped.attempts[0].requestCost, 0);
  assert.equal(f.calls.length, 2);
  assert.equal(f.state.requestsUsed, 2);
});

test("late responses retain server cooldown but cannot promote expired evidence", async () => {
  const f = fixture(true, async (url) => {
    f.setNow(NOW + 1000);
    if (url.endsWith("/holders")) return success(url);
    throw limited(120_000, { receivedAt: iso(NOW) });
  }, { phaseDeadlineAt: NOW + 1000 });
  const late = await f.execute();
  assert.equal(late.attempts[0].status, "PHASE_TIME_BUDGET_EXHAUSTED");
  assert.deepEqual(late.observations, []);
  const nextPhase = await f.execute(PROJECT, { phaseDeadlineAt: NOW + 200_000 });
  assert.equal(nextPhase.attempts[0].status, "PROVIDER_COOLDOWN");
  assert.equal(f.state.requestsUsed, 2);
  assert.equal(f.calls.length, 2);
});

test("huge injected Retry-After values remain serializable without shortening or extra HTTP", async () => {
  const f = fixture(true, () => { throw limited(1e30); });
  const result = await f.execute();
  assert.equal(result.attempts[0].retryAt, iso(8_640_000_000_000_000));
  assert.equal((await f.execute()).attempts[0].status, "PROVIDER_COOLDOWN");
  assert.equal(f.calls.length, 2);
});
