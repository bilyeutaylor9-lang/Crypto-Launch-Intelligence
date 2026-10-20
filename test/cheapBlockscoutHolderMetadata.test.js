import test from "node:test";
import assert from "node:assert/strict";
import { getBlockscoutWalletEvidence } from "../src/data/blockscoutWalletConnector.js";
import { createActiveEvidenceExecutionState, executeActiveEvidenceProviderRequests } from "../src/data/activeEvidenceProviderExecutor.js";
import { BLOCKSCOUT_DEFAULTS } from "../src/data/security/securityEvidenceUtils.js";
import { getGoPlusSecurityEvidence } from "../src/data/security/goplusSecurityConnector.js";
import { createGoPlusRequestLimiter } from "../src/data/security/goplusRequestLimiter.js";

const NOW = Date.parse("2026-10-19T10:00:00Z");
const TOKEN = `0x${"1".repeat(40)}`;
const POOL = `0x${"2".repeat(40)}`;
const HOLDER = `0x${"3".repeat(40)}`;
const OTHER = `0x${"4".repeat(40)}`;
const ROOT = "https://explorer.invalid";
const PROJECT = { symbol: "SAME", chain: "base", tokenAddress: TOKEN, poolAddress: POOL };
const REQUESTS = [{ field: "holderAddresses", item: { cheapHolderMetadataOnly: true,
  targetSources: [{ source: "GoPlus" }] } }];

test.beforeEach((t) => {
  let unexpectedHttp = 0;
  t.mock.method(globalThis, "fetch", async () => {
    unexpectedHttp++;
    throw new Error("Live HTTP is forbidden in cheap holder tests");
  });
  t.after(() => assert.equal(unexpectedHttp, 0));
});

function fixture(calls, payload = {}) {
  return async (url, options) => {
    calls.push({ url, options });
    const response = url.endsWith("/holders")
      ? (payload.holders ?? { items: [{ address: HOLDER, value: "5" }] })
      : url.endsWith(TOKEN) ? (payload.token ?? { address_hash: TOKEN, holders_count: "12" })
        : new Error(`Unexpected explorer endpoint: ${url}`);
    if (response instanceof Error) throw response;
    return response;
  };
}

function goPlusProof(project = PROJECT, patch = {}) {
  return { provider: "goplus", status: "EVIDENCE_AVAILABLE", chain: project.chain, address: project.tokenAddress,
    responseIdentityVerified: true, confidence: 85, observedAt: new Date(NOW).toISOString(),
    raw: { holders: [{ address: OTHER, balance: "1" }] }, ...patch };
}

function options(calls, patch = {}) {
  return { now: () => NOW, env: {}, useCache: false, walletHistory: false,
    useCheapBlockscoutHolderMetadata: true, fetchJson: fixture(calls),
    providers: {
      getGoPlusWalletEvidence: async (project) => goPlusProof(project),
      getRpcWalletEvidence: async () => assert.fail("Cheap holder recovery cannot invoke RPC"),
    }, ...patch };
}

function holder(result, field = "holderAddresses") {
  return result.observations.find((item) => item.field === field);
}

function assertHolderOnly(result) {
  assert.ok(result.observations.every((item) => ["wallets", "holderAddresses", "holderCount"].includes(item.field)));
  assert.equal(result.attempts.some((item) => /rpc|wallet-history/i.test(item.provider)), false);
  for (const field of ["liveExecutionReady", "finalSelectionQualified", "purchaseRouteConfirmed", "sellRouteAvailable"]) {
    assert.equal(result.projectPatch[field], undefined);
  }
}

test("cheap metadata pairs share paced admission without changing the request allowance", async () => {
  let now = NOW;
  const times = [];
  const limiter = createGoPlusRequestLimiter({ intervalMs: 440, now: () => now, sleep: async ms => { now += ms; } });
  const calls = [];
  const opts = options(calls, { now: () => now, maxProviderRequests: 6,
    blockscoutMetadataRateLimiter: async () => limiter({ deadlineAt: NOW + 10000 }),
    fetchJson: async url => {
      times.push(now);
      return fixture(calls)(url);
    } });
  const state = createActiveEvidenceExecutionState(opts);
  for (let i = 0; i < 3; i++) await executeActiveEvidenceProviderRequests(PROJECT, REQUESTS, opts, state);
  assert.deepEqual(times, [NOW, NOW, NOW + 440, NOW + 440, NOW + 880, NOW + 880]);
  assert.equal(state.requestsUsed, 6);
  assert.equal(state.maxRequests, 6);
});

test("metadata-only Blockscout requests exactly holders and token metadata, with no transfer or trade evidence", async () => {
  const calls = [];
  const result = await getBlockscoutWalletEvidence(PROJECT, { cheapHolderMetadataOnly: true,
    blockscoutBaseUrl: `${ROOT}/`, fetchJson: fixture(calls), now: () => NOW });
  assert.deepEqual(calls.map((item) => item.url), [
    `${ROOT}/api/v2/tokens/${TOKEN}/holders`, `${ROOT}/api/v2/tokens/${TOKEN}`,
  ]);
  assert.equal(result.exactTokenIdentity, true);
  assert.equal(result.providerFailure, false);
  assert.equal(result.holderCount, 12);
  assert.deepEqual(result.holderAddresses, [HOLDER]);
  assert.deepEqual(result.wallets, [HOLDER]);
  assert.deepEqual(result.walletTransactions, []);
  assert.deepEqual(result.walletParticipationHistory, []);
  assert.deepEqual(result.transferCoverage, { available: false, complete24h: false, observedTransfers24h: null });
  assert.deepEqual(result.tradeCoverage, { available: false, status: "UNKNOWN" });
  for (const field of ["buyerAddresses", "sellerAddresses", "uniqueBuyers24h", "buyTransactions24h", "sellTransactions24h",
    "buyVolumeUsd", "sellVolumeUsd", "smartWallets", "smartWalletBuyCount", "smartWalletSellCount"]) assert.equal(result[field], null);
});

test("normal Blockscout mode still makes three requests including transfers unless the cheap flag is exactly true", async () => {
  for (const cheapHolderMetadataOnly of [undefined, false, "true"]) {
    const calls = [];
    const result = await getBlockscoutWalletEvidence(PROJECT, { cheapHolderMetadataOnly,
      fetchJson: async (url) => {
        calls.push(url);
        if (url.includes("/transfers?")) return { items: [] };
        return url.endsWith("/holders") ? { items: [] } : { address_hash: TOKEN };
      } });
    assert.equal(calls.length, 3);
    assert.equal(calls.filter((url) => url.includes("/transfers?type=ERC-20")).length, 1);
    assert.equal(result.transferCoverage.complete24h, true);
  }
});

test("default cheap recovery is metadata-first, preserves holder provenance, and never touches history or RPC", async () => {
  const calls = [];
  const opts = { now: () => NOW, useCache: false, walletHistory: true,
    env: { BASE_BLOCKSCOUT_URL: ROOT }, fetchJson: fixture(calls) };
  const state = createActiveEvidenceExecutionState({ ...opts, maxProviderRequests: 2000 });
  const result = await executeActiveEvidenceProviderRequests(PROJECT, REQUESTS, opts, state);
  assert.equal(calls.length, 2);
  assert.equal(state.requestsUsed, 2);
  assert.deepEqual(result.attempts.map((item) => [item.provider, item.requestCost]), [["blockscout-wallets", 2]]);
  assert.deepEqual(holder(result).value, [HOLDER]);
  assert.deepEqual(holder(result, "wallets").value, [HOLDER]);
  for (const item of result.observations) {
    assert.equal(item.source, "blockscout-wallets");
    assert.equal(item.sourceTimestamp, new Date(NOW).toISOString());
    assert.equal(item.verificationStatus, "VERIFIED_PROVIDER_OBSERVATION");
    assert.equal(item.recoveryRun, true);
    assert.equal(item.holderSampleOnly, true);
    assert.equal(item.completeHolderCoverage, false);
    assert.equal(item.buyerClassificationAvailable, false);
    assert.equal(item.identityVerifiedOnChain, false);
    assert.equal(item.snapshotTimestampVerified, false);
    assert.equal(item.exactPoolIdentity, false);
    assert.equal(item.sourceTimestampMeaning, "PROVIDER_RECEIPT_TIME_NOT_CHAIN_SNAPSHOT_TIME");
  }
  assert.equal(state.walletHistoryRecords, undefined);
  assertHolderOnly(result);
});

test("fresh exact GoPlus cache covers cheap holders before any Blockscout HTTP or limiter reservation", async () => {
  const calls = [];
  const cached = goPlusProof(PROJECT, { observedAt: new Date(NOW - 60_000).toISOString(),
    honeypot: true, raw: { holders: [{ address: OTHER, balance: "1" }], is_honeypot: "1" } });
  let cacheReads = 0;
  const opts = options(calls, { useCache: true, providers: {}, readCachedSecurityEvidence: (...args) => {
    cacheReads++;
    assert.deepEqual(args.slice(0, 3), ["goplus", "base", TOKEN]);
    return cached;
  }, goPlusRateLimiter: async () => assert.fail("Covered cache must not reserve a network slot") });
  const state = createActiveEvidenceExecutionState(opts);
  const result = await executeActiveEvidenceProviderRequests(PROJECT, REQUESTS, opts, state);
  assert.equal(cacheReads, 1);
  assert.equal(calls.length, 0);
  assert.equal(state.requestsUsed, 0);
  assert.deepEqual(holder(result).value, [OTHER]);
  assert.equal(holder(result).source, "goplus");
  assert.equal(holder(result).sourceTimestamp, cached.observedAt);
  assert.equal(result.observations.find((item) => item.field === "honeypotDetected").value, true);
  assert.deepEqual(result.attempts.map((item) => [item.status, item.requestCost]), [["LOCAL_EVIDENCE_AVAILABLE", 0]]);
  assert.ok(result.projectPatch.securityEvidence.includes(cached));
});

test("exact fresh project holder/security payloads are reused without spending or losing adverse companions", async () => {
  const local = goPlusProof(PROJECT, { observedAt: new Date(NOW - 60_000).toISOString(),
    honeypot: true, blacklistRisk: true, mintRisk: true, verifiedSource: false,
    raw: { holders: [{ address: OTHER, balance: "1" }], is_honeypot: "1", is_blacklisted: "1",
      is_mintable: "1", is_open_source: "0" } });
  for (const patch of [{ securityEvidence: [local] }, { freeSecurityEvidence: { evidence: [local] } },
    { goplusWalletEvidence: local }, { goplusDeployerEvidence: local }]) {
    const calls = [];
    const opts = options(calls);
    opts.providers.getGoPlusWalletEvidence = async () => assert.fail("Local payload already covers holders");
    const state = createActiveEvidenceExecutionState(opts);
    const result = await executeActiveEvidenceProviderRequests({ ...PROJECT, ...patch }, REQUESTS, opts, state);
    assert.equal(calls.length, 0);
    assert.equal(state.requestsUsed, 0);
    assert.deepEqual(holder(result).value, [OTHER]);
    assert.equal(holder(result).sourceTimestamp, local.observedAt);
    for (const field of ["honeypotDetected", "sellRestricted", "blacklistEnabled", "mintAuthorityEnabled"]) {
      assert.equal(result.observations.find((item) => item.field === field)?.value, true, field);
    }
    assert.equal(result.observations.find((item) => item.field === "contractVerified").value, false);
    assert.ok(result.projectPatch.securityEvidence.includes(local));
  }
});

test("wrong-identity, unverified, stale, future and low-confidence cache cannot suppress cheap Blockscout recovery", async () => {
  for (const patch of [{ chain: "bsc" }, { address: HOLDER }, { responseIdentityVerified: false },
    { status: "UNKNOWN" }, { confidence: 0.1 }, { observedAt: new Date(NOW + 1).toISOString() },
    { observedAt: new Date(NOW - 7 * 3600_000).toISOString() }]) {
    const calls = [];
    const cached = goPlusProof(PROJECT, { honeypot: true,
      raw: { holders: [{ address: OTHER, balance: "1" }], is_honeypot: "1" }, ...patch });
    const opts = options(calls, { useCache: true, providers: {}, readCachedSecurityEvidence: () => cached });
    const state = createActiveEvidenceExecutionState(opts);
    const result = await executeActiveEvidenceProviderRequests(PROJECT, REQUESTS, opts, state);
    assert.equal(calls.length, 2);
    assert.equal(state.requestsUsed, 2);
    assert.equal(holder(result).source, "blockscout-wallets");
    assert.equal(result.observations.some((item) => item.source === "goplus"), false);
    assert.equal(result.projectPatch.goplusWalletEvidence, undefined);
    assertHolderOnly(result);
  }
});

test("empty local/cache holder samples preserve adverse metadata while unresolved holders use cheap Blockscout", async () => {
  const local = goPlusProof(PROJECT, { honeypot: true, creatorAddress: OTHER,
    raw: { holders: [], is_honeypot: "1", creator_address: OTHER } });
  for (const cached of [false, true]) {
    const calls = [];
    const order = [];
    const opts = options(calls, { useCache: cached, providers: {}, readCachedSecurityEvidence: () => {
      order.push("cache"); return local;
    } });
    const transport = fixture(calls);
    opts.fetchJson = async (...args) => { order.push("blockscout"); return transport(...args); };
    const state = createActiveEvidenceExecutionState(opts);
    const result = await executeActiveEvidenceProviderRequests(cached ? PROJECT : { ...PROJECT, securityEvidence: [local] },
      REQUESTS, opts, state);
    assert.equal(calls.length, 2);
    assert.equal(state.requestsUsed, 2);
    assert.equal(holder(result).source, "blockscout-wallets");
    assert.equal(result.observations.find((item) => item.field === "honeypotDetected").value, true);
    assert.ok(result.projectPatch.securityEvidence.includes(local));
    assert.equal(result.projectPatch.securityEvidence.find((item) => item === local).creatorAddress, OTHER);
    assert.deepEqual(order, cached ? ["cache", "blockscout", "blockscout"] : ["blockscout", "blockscout"]);
    assert.equal(result.attempts.some((item) => /rpc|history/i.test(item.provider)), false);
  }
});

test("local adverse empty-holder metadata survives a later higher-confidence benign GoPlus fallback", async () => {
  const local = goPlusProof(PROJECT, { confidence: 0.5, honeypot: true, creatorAddress: OTHER,
    raw: { holders: [], is_honeypot: "1", creator_address: OTHER } });
  const calls = [];
  const opts = options(calls, { fetchJson: fixture(calls, { holders: { items: [] }, token: {} }) });
  opts.providers.getGoPlusWalletEvidence = async () => goPlusProof(PROJECT, {
    confidence: 0.99, honeypot: false, raw: { holders: [{ address: HOLDER, balance: "1" }], is_honeypot: "0" },
  });
  const state = createActiveEvidenceExecutionState(opts);
  const result = await executeActiveEvidenceProviderRequests({ ...PROJECT, goplusWalletEvidence: local }, REQUESTS, opts, state);
  assert.equal(calls.length, 2);
  assert.equal(state.requestsUsed, 3);
  assert.deepEqual(holder(result).value, [HOLDER]);
  assert.equal(result.observations.find((item) => item.field === "honeypotDetected").value, true);
  assert.ok(result.projectPatch.securityEvidence.includes(local));
  assert.equal(result.projectPatch.securityEvidence.length, 2);
});

test("BSC and Avalanche use existing default URLs and configured chain/global/explicit URLs take precedence", async () => {
  for (const [chain, config, root] of [
    ["bsc", {}, BLOCKSCOUT_DEFAULTS.bsc], ["avalanche", {}, BLOCKSCOUT_DEFAULTS.avalanche],
    ["base", { env: { BASE_BLOCKSCOUT_URL: ROOT, BLOCKSCOUT_BASE_URL: "https://global.invalid" } }, ROOT],
    ["base", { env: { BLOCKSCOUT_BASE_URL: ROOT } }, ROOT],
    ["base", { blockscoutBaseUrl: ROOT, env: { BASE_BLOCKSCOUT_URL: "https://chain.invalid" } }, ROOT],
    ["linea", { env: { LINEA_BLOCKSCOUT_URL: ROOT } }, ROOT],
  ]) {
    const calls = [];
    const opts = options(calls, config);
    const state = createActiveEvidenceExecutionState(opts);
    const result = await executeActiveEvidenceProviderRequests({ ...PROJECT, chain }, REQUESTS, opts, state);
    assert.deepEqual(calls.map((item) => item.url), [`${root}/api/v2/tokens/${TOKEN}/holders`, `${root}/api/v2/tokens/${TOKEN}`]);
    assert.equal(holder(result).source, "blockscout-wallets");
    assert.equal(state.requestsUsed, 2);
  }
});

test("the two-unit admission is atomic and GoPlus can still use a single remaining request", async () => {
  for (const budget of [0, 1, 2]) {
    const calls = [];
    const opts = options(calls, { walletProviderRequestCost: 1, maxProviderRequests: budget });
    const state = createActiveEvidenceExecutionState(opts);
    const result = await executeActiveEvidenceProviderRequests(PROJECT, REQUESTS, opts, state);
    assert.equal(state.requestsUsed, budget);
    assert.equal(calls.length, budget === 2 ? 2 : 0);
    assert.equal(holder(result)?.source, budget === 2 ? "blockscout-wallets" : budget === 1 ? "goplus" : undefined);
    assert.equal(result.attempts[0].requestCost, budget === 2 ? 2 : 0);
    assertHolderOnly(result);
  }
});

test("cheap recovery cannot exceed the shared 2000-request cap, including fallback", async () => {
  const calls = [];
  const opts = options(calls, { maxProviderRequests: 2000, fetchJson: fixture(calls, { holders: { items: [] } }) });
  const state = createActiveEvidenceExecutionState(opts);
  state.requestsUsed = 1998;
  for (let index = 0; index < 2; index++) {
    const result = await executeActiveEvidenceProviderRequests(PROJECT, REQUESTS, opts, state);
    assert.equal(holder(result), undefined);
    assert.ok(result.attempts.some((item) => item.provider === "goplus-wallets" && item.status === "REQUEST_BUDGET_EXHAUSTED"));
  }
  assert.equal(calls.length, 2);
  assert.equal(state.requestsUsed, 2000);
});

test("conflicting token metadata and conflicting holder-row identities are quarantined before GoPlus fallback", async () => {
  for (const payload of [
    { token: { address_hash: OTHER, holders_count: "12" } },
    { token: { address_hash: TOKEN, address: OTHER, holders_count: "12" } },
    { token: { address_hash: "invalid", holders_count: "12" } },
    { holders: { items: [{ address: HOLDER, value: "5", token_address: OTHER }] } },
    { holders: { items: [{ address: { hash: HOLDER, address: OTHER }, value: "5" }] } },
  ]) {
    const calls = [];
    const opts = options(calls, { fetchJson: fixture(calls, payload) });
    const state = createActiveEvidenceExecutionState(opts);
    const result = await executeActiveEvidenceProviderRequests(PROJECT, REQUESTS, opts, state);
    assert.equal(state.requestsUsed, 3);
    assert.equal(calls.length, 2);
    assert.deepEqual(holder(result).value, [OTHER]);
    assert.equal(holder(result).source, "goplus");
    assert.equal(result.observations.some((item) => item.source === "blockscout-wallets"), false);
    assertHolderOnly(result);
  }
});

test("cheap request identity conflicts and missing exact identities do not spend or fall back by symbol", async () => {
  for (const project of [
    { symbol: "SAME" }, { chain: "base", symbol: "SAME" }, { ...PROJECT, tokenAddress: "bad" },
    { ...PROJECT, chain: "unknown-chain" }, { ...PROJECT, chain: ["base"] },
    { ...PROJECT, chainId: "ethereum" }, { ...PROJECT, canonicalChainId: "ethereum" },
    { ...PROJECT, contractAddress: OTHER }, { ...PROJECT, tokenAddress: [TOKEN] },
    { ...PROJECT, baseTokenAddress: OTHER }, { ...PROJECT, rawCandidate: { chain: "bsc" } },
    { ...PROJECT, marketData: { tokenAddress: OTHER } },
    { ...PROJECT, executionProof: { baseTokenAddress: OTHER } }, { ...PROJECT, identityConflict: true },
    { ...PROJECT, tokenAddress: `0x${"0".repeat(40)}` },
  ]) {
    const calls = [];
    let fallbackCalls = 0;
    const opts = options(calls);
    opts.providers.getGoPlusWalletEvidence = async () => { fallbackCalls++; return goPlusProof(); };
    const state = createActiveEvidenceExecutionState(opts);
    const result = await executeActiveEvidenceProviderRequests(project, REQUESTS, opts, state);
    const raw = await getBlockscoutWalletEvidence(project, { ...opts, cheapHolderMetadataOnly: true });
    assert.equal(raw.status, "UNKNOWN");
    assert.equal(result.observations.length, 0);
    assert.equal(calls.length, 0);
    assert.equal(fallbackCalls, 0);
    assert.equal(state.requestsUsed, 0);
  }
});

test("URL-absent and unsupported chains incur no Blockscout charge or unsupported GoPlus calls", async () => {
  for (const chain of ["linea", "fantom", "unknown-chain"]) {
    const calls = [];
    const opts = options(calls);
    opts.providers.getGoPlusWalletEvidence = async () => assert.fail("No GoPlus capability for this chain");
    const state = createActiveEvidenceExecutionState(opts);
    const result = await executeActiveEvidenceProviderRequests({ ...PROJECT, chain }, REQUESTS, opts, state);
    assert.equal(calls.length, 0);
    assert.equal(state.requestsUsed, 0);
    assert.equal(result.observations.length, 0);
    assertHolderOnly(result);
  }
});

test("unavailable holder samples stay unknown while genuine GoPlus adverse and creator companions survive", async () => {
  for (const holders of [{}, { items: [] }, { items: [{ address: HOLDER, value: "0" }] }, new Error("Offline holders failure")]) {
    const calls = [];
    const opts = options(calls, { fetchJson: fixture(calls, { holders, token: {} }) });
    opts.providers.getGoPlusWalletEvidence = async () => goPlusProof(PROJECT, {
      honeypot: true, creatorAddress: OTHER, raw: { holders: [], is_honeypot: "1", creator_address: OTHER },
    });
    const state = createActiveEvidenceExecutionState(opts);
    const result = await executeActiveEvidenceProviderRequests(PROJECT, REQUESTS, opts, state);
    assert.equal(holder(result), undefined);
    assert.equal(holder(result, "wallets"), undefined);
    assert.equal(state.requestsUsed, 3);
    assert.equal(result.observations.find((item) => item.field === "honeypotDetected").value, true);
    assert.equal(result.projectPatch.securityEvidence[0].creatorAddress, OTHER);
    assert.equal(result.projectPatch.finalSelectionQualified, undefined);
    assert.equal(result.attempts.some((item) => /rpc|history/i.test(item.provider)), false);
  }
});

test("phase and absolute deadlines skip both providers without charging and clamp admitted HTTP timeouts", async () => {
  for (const limits of [{ deadlineAt: NOW }, { deadlineAt: NOW + 1000, phaseDeadlineAt: NOW }]) {
    const calls = [];
    const opts = options(calls, limits);
    const state = createActiveEvidenceExecutionState(opts);
    const result = await executeActiveEvidenceProviderRequests(PROJECT, REQUESTS, opts, state);
    assert.equal(calls.length, 0);
    assert.equal(state.requestsUsed, 0);
    const status = limits.phaseDeadlineAt ? "PHASE_TIME_BUDGET_EXHAUSTED" : "TIME_BUDGET_EXHAUSTED";
    assert.ok(result.attempts.every((item) => item.status === status));
  }
  const calls = [];
  const opts = options(calls, { deadlineAt: NOW + 1000, phaseDeadlineAt: NOW + 25, providerTimeoutMs: 5000 });
  const result = await executeActiveEvidenceProviderRequests(PROJECT, REQUESTS, opts);
  assert.equal(holder(result).source, "blockscout-wallets");
  assert.deepEqual(calls.map((item) => item.options.timeoutMs), [25, 25]);
});

test("late cheap responses are not promoted and deadline expiry does not trip the circuit", async () => {
  let now = NOW;
  const calls = [];
  const opts = options(calls, { now: () => now, deadlineAt: NOW + 1000, phaseDeadlineAt: NOW + 10 });
  const transport = fixture(calls);
  opts.fetchJson = async (...args) => { const value = await transport(...args); now = NOW + 10; return value; };
  const state = createActiveEvidenceExecutionState(opts);
  const result = await executeActiveEvidenceProviderRequests(PROJECT, REQUESTS, opts, state);
  assert.equal(result.observations.length, 0);
  assert.equal(state.requestsUsed, 2);
  assert.equal(state.providers.get("blockscout-wallets:base").failures, 0);
  assert.equal(state.providers.get("blockscout-wallets:base").circuitOpen, false);
  assert.ok(result.attempts.every((item) => item.status === "PHASE_TIME_BUDGET_EXHAUSTED"));
});

test("a stalled metadata transport is bounded by the phase deadline and cannot start GoPlus or RPC afterward", async () => {
  const calls = [];
  const opts = options(calls, { now: Date.now, providerTimeoutMs: 8000 });
  opts.fetchJson = async (url) => { calls.push(url); return new Promise(() => {}); };
  const state = createActiveEvidenceExecutionState(opts);
  opts.phaseDeadlineAt = Date.now() + 30;
  state.deadlineAt = opts.phaseDeadlineAt + 1000;
  const result = await executeActiveEvidenceProviderRequests(PROJECT, REQUESTS, opts, state);
  assert.equal(calls.length, 2);
  assert.equal(state.requestsUsed, 2);
  assert.equal(result.observations.length, 0);
  assert.ok(result.attempts.every((item) => item.status === "PHASE_TIME_BUDGET_EXHAUSTED"));
  assert.equal(state.providers.get("blockscout-wallets:base").failures, 0);
  assertHolderOnly(result);
});

test("two-endpoint transport failure opens the existing chain circuit without suppressing GoPlus fallback", async () => {
  const calls = [];
  const opts = options(calls, { circuitFailureThreshold: 1, fetchJson: fixture(calls, {
    holders: new Error("Offline explorer outage"), token: new Error("Offline explorer outage"),
  }) });
  const state = createActiveEvidenceExecutionState(opts);
  for (let index = 0; index < 2; index++) {
    const result = await executeActiveEvidenceProviderRequests(PROJECT, REQUESTS, opts, state);
    assert.equal(holder(result).source, "goplus");
    assert.equal(result.attempts[0].status, index ? "CIRCUIT_OPEN" : "FAILED");
    assert.equal(result.attempts[0].requestCost, index ? 0 : 2);
    assertHolderOnly(result);
  }
  assert.equal(calls.length, 2);
  assert.equal(state.requestsUsed, 4);
});

test("custom wallet providers retain GoPlus-only cheap behavior until the new option explicitly opts in", async () => {
  const calls = [];
  const opts = options(calls);
  delete opts.useCheapBlockscoutHolderMetadata;
  let explorerCalls = 0;
  opts.providers.getBlockscoutWalletEvidence = async (project, config) => {
    explorerCalls++;
    assert.equal(config.cheapHolderMetadataOnly, true);
    return getBlockscoutWalletEvidence(project, config);
  };
  const first = await executeActiveEvidenceProviderRequests(PROJECT, REQUESTS, opts);
  assert.equal(explorerCalls, 0);
  assert.equal(holder(first).source, "goplus");
  const second = await executeActiveEvidenceProviderRequests(PROJECT, REQUESTS, { ...opts, useCheapBlockscoutHolderMetadata: true });
  assert.equal(explorerCalls, 1);
  assert.equal(holder(second).source, "blockscout-wallets");
  assert.equal(calls.length, 2);
});

test("explicit cheap options bypass history and ignore injected transaction, swap and smart-wallet companions", async () => {
  const opts = options([], { cheapHolderMetadataOnly: true, walletHistory: true });
  opts.providers.getBlockscoutWalletEvidence = async () => ({ status: "EVIDENCE_AVAILABLE", exactTokenIdentity: true,
    chain: "base", tokenAddress: TOKEN, observedAt: new Date(NOW).toISOString(), holderAddresses: [HOLDER], wallets: [HOLDER],
    walletTransactions: [{ from: HOLDER }], walletParticipationHistory: [{ wallet: HOLDER }], buyerAddresses: [HOLDER],
    uniqueBuyers24h: 1, smartWallets: [HOLDER], smartWalletBuyCount: 1 });
  const state = createActiveEvidenceExecutionState(opts);
  const result = await executeActiveEvidenceProviderRequests(PROJECT,
    ["holderAddresses", "walletTransactions", "walletParticipationHistory"].map((field) => ({ field })), opts, state);
  assert.equal(state.walletHistoryRecords, undefined);
  assert.equal(state.requestsUsed, 2);
  assertHolderOnly(result);
});

test("injected cheap metadata still requires exact nonconflicting response identity and a current nonfuture receipt", async () => {
  for (const patch of [{ exactTokenIdentity: false }, { chain: "bsc" }, { tokenAddress: OTHER },
    { address: OTHER }, { chainId: 1 }, { status: "UNKNOWN" }, { observedAt: null },
    { observedAt: new Date(NOW + 1).toISOString() }, { observedAt: new Date(NOW - 7 * 3600_000).toISOString() }]) {
    const opts = options([]);
    opts.providers.getBlockscoutWalletEvidence = async () => ({ status: "EVIDENCE_AVAILABLE", exactTokenIdentity: true,
      chain: "base", tokenAddress: TOKEN, holderAddresses: [HOLDER], wallets: [HOLDER],
      observedAt: new Date(NOW).toISOString(), ...patch });
    const state = createActiveEvidenceExecutionState(opts);
    const result = await executeActiveEvidenceProviderRequests(PROJECT, REQUESTS, opts, state);
    assert.equal(holder(result).source, "goplus");
    assert.deepEqual(holder(result).value, [OTHER]);
    assert.equal(state.requestsUsed, 3);
    assert.equal(result.observations.some((item) => item.source === "blockscout-wallets"), false);
    assertHolderOnly(result);
  }
});

test("GoPlus rate-limit/cooldown admission is unchanged after an empty cheap Blockscout sample", async (t) => {
  let httpCalls = 0;
  t.mock.method(globalThis, "fetch", async () => { httpCalls++; return { ok: false, status: 429 }; });
  const limiter = createGoPlusRequestLimiter({ now: () => NOW,
    sleep: async () => assert.fail("Cheap fallback cannot wait through cooldown") });
  const calls = [];
  const opts = options(calls, { fetchJson: fixture(calls, { holders: { items: [] }, token: {} }), goPlusRateLimiter: limiter });
  opts.providers.getGoPlusWalletEvidence = getGoPlusSecurityEvidence;
  const state = createActiveEvidenceExecutionState(opts);
  for (let index = 0; index < 2; index++) {
    const result = await executeActiveEvidenceProviderRequests(PROJECT, REQUESTS, opts, state);
    assert.equal(holder(result), undefined);
    assert.equal(result.attempts.find((item) => item.provider === "goplus-wallets").status,
      index ? "PROVIDER_COOLDOWN" : "RATE_LIMITED");
    assertHolderOnly(result);
  }
  assert.equal(httpCalls, 1);
  assert.equal(calls.length, 4);
  assert.equal(state.requestsUsed, 5);
});
