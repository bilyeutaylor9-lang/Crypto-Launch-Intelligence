import test from "node:test";
import assert from "node:assert/strict";
import { getBlockscoutWalletEvidence } from "../src/data/blockscoutWalletConnector.js";
import {
  createActiveEvidenceExecutionState,
  executeActiveEvidenceProviderRequests,
} from "../src/data/activeEvidenceProviderExecutor.js";

const NOW = Date.parse("2026-10-23T12:00:00Z");
const TOKENS = [1, 2, 3, 4].map((digit) => `0x${String(digit).repeat(40)}`);
const HOLDER = `0x${"9".repeat(40)}`;
const ROOT = "https://explorer.invalid";
const PROJECT = { chain: "bsc", tokenAddress: TOKENS[0] };

test.beforeEach((t) => {
  let unexpectedHttp = 0;
  t.mock.method(globalThis, "fetch", async () => {
    unexpectedHttp++;
    throw new Error("Live HTTP is forbidden in wallet availability tests");
  });
  t.after(() => assert.equal(unexpectedHttp, 0));
});

function httpError(status, message = "Fixture endpoint unavailable") {
  return Object.assign(new Error(message), { status });
}

function endpoint(url) {
  return url.includes("/transfers?") ? "transfers" : url.endsWith("/holders") ? "holders" : "token";
}

function endpoints(cheap) {
  return cheap ? ["holders", "token"] : ["transfers", "holders", "token"];
}

function transport(t, mode, respond, calls) {
  const request = async (url, init) => {
    calls.push({ url, init });
    return respond(url);
  };
  if (mode === "default") {
    t.mock.method(globalThis, "fetch", async (url, init) => {
      const value = await request(url, init);
      if (value instanceof Error && !value.status) throw value;
      return new Response(JSON.stringify(value instanceof Error ? {} : value), {
        status: value instanceof Error ? value.status : 200,
      });
    });
    return {};
  }
  return { fetchJson: async (url, init) => {
    const value = await request(url, init);
    if (value instanceof Error) throw value;
    return value;
  } };
}

function assertNoTrades(result) {
  assert.deepEqual(result.tradeCoverage, { available: false, status: "UNKNOWN" });
  for (const field of ["buyerAddresses", "sellerAddresses", "uniqueBuyers24h", "buyTransactions24h",
    "sellTransactions24h", "buyVolumeUsd", "sellVolumeUsd", "smartWallets", "trackedWallets",
    "smartWalletBuys24h", "smartWalletSells24h", "smartWalletBuyCount", "smartWalletSellCount",
    "smartWalletBuyVolumeUsd", "smartWalletSellVolumeUsd"]) assert.equal(result[field], null, field);
}

function assertUnknown(result) {
  assert.equal(result.status, "UNKNOWN");
  assert.equal(result.holderCount, null);
  for (const field of ["holderAddresses", "wallets", "walletTransactions", "walletParticipationHistory"]) {
    assert.deepEqual(result[field], [], field);
  }
  assert.deepEqual(result.transferCoverage, { available: false, complete24h: false, observedTransfers24h: null });
  assertNoTrades(result);
}

function payload(name, token = TOKENS[0]) {
  if (name === "holders") return { items: [{ address: HOLDER, value: "5" }] };
  if (name === "token") return { address_hash: token, holders_count: "12" };
  return { items: [{ token: { address_hash: token, decimals: "0" },
    from: { hash: TOKENS[3] }, to: { hash: HOLDER }, value: "5",
    timestamp: new Date(NOW - 60_000).toISOString() }] };
}

for (const mode of ["default", "injected"]) {
  for (const cheap of [true, false]) {
    const label = `${mode} ${cheap ? "two-request cheap" : "three-request full"}`;

    test(`${label}: all HTTP 404 endpoints are unavailable candidate evidence`, async (t) => {
      const calls = [];
      const result = await getBlockscoutWalletEvidence(PROJECT, {
        blockscoutBaseUrl: `${ROOT}/`, cheapHolderMetadataOnly: cheap, now: () => NOW, timeoutMs: 1234,
        ...transport(t, mode, () => httpError(404), calls),
      });
      assert.deepEqual(calls.map(({ url }) => url), endpoints(cheap).map((name) =>
        `${ROOT}/api/v2/tokens/${TOKENS[0]}${name === "token" ? "" :
          name === "transfers" ? "/transfers?type=ERC-20" : "/holders"}`));
      assert.ok(calls.every(({ init }) => mode === "default"
        ? init.signal instanceof AbortSignal && init.method === "GET" : init.timeoutMs === 1234));
      assert.equal(result.providerFailure, false);
      assert.equal(result.candidateEvidenceUnavailable, true);
      assert.equal(typeof result.reason, "string");
      assert.equal(result.warnings.filter((warning) => warning.includes("request failed:")).length, cheap ? 2 : 3);
      assertUnknown(result);
    });

    test(`${label}: outages and mixed 404 errors remain provider failures`, async (t) => {
      for (const status of [403, 429, 500, 503, null]) {
        for (const mixed of [false, true]) {
          const calls = [];
          const result = await getBlockscoutWalletEvidence(PROJECT, {
            blockscoutBaseUrl: ROOT, cheapHolderMetadataOnly: cheap, now: () => NOW,
            ...transport(t, mode, (url) => mixed && endpoint(url) !== "token" ? httpError(404)
              : status === null ? new Error("Transport failed for token 404") : httpError(status, "HTTP 404 in message"), calls),
          });
          assert.equal(calls.length, cheap ? 2 : 3);
          assert.equal(result.providerFailure, true, `${status}, mixed=${mixed}`);
          if (status === 429) {
            assert.equal(result.rateLimited, true);
            assert.ok(result.retryAfterMs >= 61_000);
          }
          assert.notEqual(result.candidateEvidenceUnavailable, true, `${status}, mixed=${mixed}`);
          assertUnknown(result);
        }
      }
    });

    test(`${label}: valid partial payloads survive unavailable or failing companion endpoints`, async (t) => {
      for (const successful of endpoints(cheap)) {
        for (const status of [404, 403, 429, 503, null]) {
          const calls = [];
          const result = await getBlockscoutWalletEvidence(PROJECT, {
            blockscoutBaseUrl: ROOT, cheapHolderMetadataOnly: cheap, now: () => NOW,
            ...transport(t, mode, (url) => endpoint(url) === successful ? payload(successful)
              : status === null ? new Error("Connection reset") : httpError(status), calls),
          });
          assert.equal(calls.length, cheap ? 2 : 3);
          assert.equal(result.providerFailure, false);
          assert.notEqual(result.candidateEvidenceUnavailable, true);
          assert.equal(result.status, "EVIDENCE_AVAILABLE");
          assert.equal(result.holderCount, successful === "token" ? 12 : null);
          assert.deepEqual(result.holderAddresses, successful === "holders" ? [HOLDER] : []);
          assert.equal(result.walletTransactions.length, successful === "transfers" ? 1 : 0);
          assert.deepEqual(result.walletParticipationHistory, result.walletTransactions);
          assert.equal(result.transferCoverage.available, successful === "transfers");
          if (status === 429) assert.equal(result.rateLimited, true);
          assertNoTrades(result);
        }
      }
    });
  }
}

test("injected structured HTTP statuses take precedence over message text", async () => {
  for (const cheap of [true, false]) {
    for (const fields of [{ status: 404 }, { status: "404" }, { statusCode: 404 }, { httpStatus: 404 },
      { response: { status: 404 } }]) {
      const result = await getBlockscoutWalletEvidence(PROJECT, {
        blockscoutBaseUrl: ROOT, cheapHolderMetadataOnly: cheap,
        fetchJson: async () => { throw Object.assign(new Error("HTTP 503"), fields); },
      });
      assert.equal(result.providerFailure, false);
      assert.equal(result.candidateEvidenceUnavailable, true);
      assertUnknown(result);
    }
    for (const fields of [{}, { status: 403 }, { statusCode: 429 }, { httpStatus: 503 },
      { response: { status: 500 } }, { status: 503, statusCode: 404 },
      { status: "invalid", response: { status: 404 } }]) {
      const result = await getBlockscoutWalletEvidence(PROJECT, {
        blockscoutBaseUrl: ROOT, cheapHolderMetadataOnly: cheap,
        fetchJson: async () => { throw Object.assign(new Error("Request failed: 404"), fields); },
      });
      assert.equal(result.providerFailure, true);
      assert.notEqual(result.candidateEvidenceUnavailable, true);
      assertUnknown(result);
    }
  }
});

function executorFixture(cheap, respond, limits = {}) {
  const calls = [];
  const evidence = [];
  const options = { now: () => NOW, env: {}, useCache: false, walletHistory: false,
    blockscoutBaseUrl: ROOT, useCheapBlockscoutHolderMetadata: true,
    useGoPlusWalletFallback: false, useRpcWalletFallback: false,
    maxProviderRequests: 4 * (cheap ? 2 : 3), ...limits,
    fetchJson: async (url) => {
      calls.push(url);
      const value = respond(url);
      if (value instanceof Error) throw value;
      return value;
    },
    providers: { getBlockscoutWalletEvidence: async (project, config) => {
      const result = await getBlockscoutWalletEvidence(project, config);
      evidence.push(result);
      return result;
    } },
  };
  const state = createActiveEvidenceExecutionState(options);
  const requests = [{ field: "holderAddresses", item: { cheapHolderMetadataOnly: cheap,
    targetSources: [{ source: "Blockscout" }] } }];
  const execute = (tokenAddress = TOKENS[0]) => executeActiveEvidenceProviderRequests(
    { ...PROJECT, tokenAddress }, requests, options, state);
  return { calls, evidence, options, state, execute };
}

for (const cheap of [true, false]) {
  const cost = cheap ? 2 : 3;
  const label = cheap ? "cheap" : "full";

  test(`${label} executor: three missing BSC tokens do not block a supported fourth token`, async () => {
    const fixture = executorFixture(cheap, (url) => url.includes(TOKENS[3])
      ? payload(endpoint(url), TOKENS[3]) : httpError(404));
    assert.equal(fixture.state.circuitFailureThreshold, 3);
    for (const token of TOKENS.slice(0, 3)) {
      const result = await fixture.execute(token);
      assert.deepEqual(result.observations, []);
      assert.deepEqual(result.attempts.map(({ status }) => status), ["NO_CANDIDATE_EVIDENCE"]);
      assert.ok(!result.projectPatch.blockscoutWalletEvidence?.status ||
        result.projectPatch.blockscoutWalletEvidence.status === "UNKNOWN");
      assertUnknown(fixture.evidence.at(-1));
      assert.equal(fixture.state.providers.get("blockscout-wallets:bsc").failures, 0);
      assert.equal(fixture.state.providers.get("blockscout-wallets:bsc").circuitOpen, false);
    }
    const supported = await fixture.execute(TOKENS[3]);
    assert.deepEqual(supported.attempts.map(({ status }) => status), ["SUCCESS"]);
    assert.deepEqual(supported.observations.find(({ field }) => field === "holderAddresses")?.value, [HOLDER]);
    assert.equal(supported.projectPatch.blockscoutWalletEvidence.status, "EVIDENCE_AVAILABLE");
    assert.equal(fixture.calls.length, 4 * cost);
    assert.equal(fixture.state.requestsUsed, 4 * cost);
    const health = fixture.state.providers.get("blockscout-wallets:bsc");
    assert.equal(health.attempts, 4);
    assert.equal(health.noDataResponses, 3);
    assert.equal(health.successes, 1);
    assert.equal(health.failures, 0);
    assert.equal(health.circuitOpen, false);
    const exhausted = await fixture.execute(TOKENS[3]);
    assert.deepEqual(exhausted.attempts.map(({ status }) => status), ["REQUEST_BUDGET_EXHAUSTED"]);
    assert.deepEqual(exhausted.observations, []);
    assert.equal(fixture.calls.length, 4 * cost);
    assert.equal(fixture.state.requestsUsed, fixture.state.maxRequests);
  });

  test(`${label} executor: 403, server, mixed and transport failures still open the circuit`, async () => {
    for (const failure of [403, 503, "mixed", "transport"]) {
      const fixture = executorFixture(cheap, (url) => failure === "transport" ? new Error("Connection reset")
        : failure === "mixed" ? httpError(endpoint(url) === "token" ? 503 : 404) : httpError(failure));
      for (const token of TOKENS.slice(0, 3)) {
        const result = await fixture.execute(token);
        assert.deepEqual(result.attempts.map(({ status }) => status), ["FAILED"], String(failure));
        assert.deepEqual(result.observations, []);
        assertUnknown(fixture.evidence.at(-1));
      }
      const blocked = await fixture.execute(TOKENS[3]);
      assert.deepEqual(blocked.attempts.map(({ status }) => status), ["CIRCUIT_OPEN"], String(failure));
      assert.deepEqual(blocked.observations, []);
      assert.equal(fixture.calls.length, 3 * cost);
      assert.equal(fixture.state.requestsUsed, 3 * cost);
      const health = fixture.state.providers.get("blockscout-wallets:bsc");
      assert.equal(health.failures, 3);
      assert.equal(health.circuitOpen, true);
      assert.equal(health.noDataResponses, undefined);
    }
  });

  test(`${label} executor: 429 responses cool down without opening the outage circuit`, async () => {
    const fixture = executorFixture(cheap, () => httpError(429));
    const limited = await fixture.execute();
    assert.deepEqual(limited.attempts.map(({ status }) => status), ["RATE_LIMITED"]);
    assert.deepEqual(limited.observations, []);
    for (const token of TOKENS.slice(1)) {
      const blocked = await fixture.execute(token);
      assert.deepEqual(blocked.attempts.map(({ status }) => status), ["PROVIDER_COOLDOWN"]);
      assert.deepEqual(blocked.observations, []);
    }
    const health = fixture.state.providers.get("blockscout-wallets:bsc");
    assert.equal(health.failures, 0);
    assert.equal(health.circuitOpen, false);
    assert.equal(health.rateLimitResponses, 1);
    assert.equal(fixture.calls.length, cost);
    assert.equal(fixture.state.requestsUsed, cost);
  });

  test(`${label} executor: no-data batches still consume allowance and cannot bypass request or time budgets`, async () => {
    for (const maxProviderRequests of [0, cost - 1, cost + 1]) {
      const fixture = executorFixture(cheap, () => httpError(404), { maxProviderRequests });
      if (maxProviderRequests >= cost) {
        const missing = await fixture.execute();
        assert.deepEqual(missing.attempts.map(({ status }) => status), ["NO_CANDIDATE_EVIDENCE"]);
      }
      const blocked = await fixture.execute(TOKENS[3]);
      assert.deepEqual(blocked.attempts.map(({ status }) => status), ["REQUEST_BUDGET_EXHAUSTED"]);
      assert.deepEqual(blocked.observations, []);
      assert.equal(fixture.calls.length, maxProviderRequests >= cost ? cost : 0);
      assert.equal(fixture.state.requestsUsed, fixture.calls.length);
      assert.ok(fixture.state.requestsUsed <= fixture.state.maxRequests);
    }
    const fixture = executorFixture(cheap, () => httpError(404), { timeBudgetMs: 0 });
    const expired = await fixture.execute();
    assert.deepEqual(expired.attempts.map(({ status }) => status), ["TIME_BUDGET_EXHAUSTED"]);
    assert.deepEqual(expired.observations, []);
    assert.equal(fixture.calls.length, 0);
    assert.equal(fixture.state.requestsUsed, 0);
  });
}
