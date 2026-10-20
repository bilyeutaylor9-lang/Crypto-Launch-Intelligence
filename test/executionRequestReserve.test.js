import assert from "node:assert/strict";
import test from "node:test";
import { createActiveEvidenceRecoveryState, reserveExecutionRecoveryWindow } from "../src/engines/activeEvidenceRecoveryEngine.js";
import { executeActiveEvidenceProviderRequests, mapWithBoundedConcurrency } from "../src/data/activeEvidenceProviderExecutor.js";

const NOW = Date.parse("2026-10-19T20:00:00.000Z");
const TOKEN = "0x1111111111111111111111111111111111111111";
const CREATOR = "0xdddddddddddddddddddddddddddddddddddddddd";
const POOL = "0x2222222222222222222222222222222222222222";
const options = () => ({ now: () => NOW, maxProviderRequests: 8, timeBudgetMs: 23 * 60000,
  executionReserveRequests: 2, useCache: false, nativeDeploymentHistory: false, walletHistory: false });

test("raw recovery reserves selected execution request units without increasing any allowance", () => {
  const state = createActiveEvidenceRecoveryState({ now: () => NOW, maxProviderRequests: 2000 });
  const deadline = state.deadlineAt;
  const raw = reserveExecutionRecoveryWindow(state);
  assert.equal(raw.phaseRequestLimit, 1800);
  assert.equal(state.executionRequestsReserved, 200);
  assert.equal(state.requestsUsed, 0);
  assert.equal(state.maxRequests, 2000);
  assert.equal(state.deadlineAt, deadline);
});

test("request reservations respect remaining allowance, disabled waves and tighter caller limits", () => {
  const state = createActiveEvidenceRecoveryState(options());
  state.requestsUsed = 4;
  assert.equal(reserveExecutionRecoveryWindow(state, options()).phaseRequestLimit, 7);
  assert.equal(state.executionRequestsReserved, 1);
  assert.equal(reserveExecutionRecoveryWindow(state, { ...options(), phaseRequestLimit: 5 }).phaseRequestLimit, 5);
  assert.equal(reserveExecutionRecoveryWindow(state, { ...options(), wave3Max: 0 }).phaseRequestLimit, undefined);
  assert.equal(state.executionRequestsReserved, 0);
  assert.equal(state.requestsUsed, 4);
  assert.equal(state.maxRequests, 8);
});

test("raw concurrency cannot spend the quote reserve, which remains usable by actual paired quote calls", async t => {
  t.mock.method(globalThis, "fetch", async () => assert.fail("No live network calls"));
  const opts = options();
  const state = createActiveEvidenceRecoveryState(opts);
  const rawOptions = { ...opts, ...reserveExecutionRecoveryWindow(state, opts), providers: {
    getSourcifySecurityEvidence: async project => ({ provider: "sourcify-v2", status: "EVIDENCE_AVAILABLE",
      chain: "base", address: project.tokenAddress, creatorAddress: CREATOR, confidence: 0.9,
      observedAt: new Date(NOW).toISOString() }),
    getBlockscoutDeployerEvidence: async () => assert.fail("No fallback needed"),
  } };
  const rows = await mapWithBoundedConcurrency(Array.from({ length: 10 }, (_, index) => ({ chain: "base",
    tokenAddress: `0x11${(index + 1).toString(16).padStart(38, "0")}` })), 6,
  project => executeActiveEvidenceProviderRequests(project, [{ field: "creator", item: {
    canonicalField: "creator", targetSources: [{ source: "block explorers" }] } }], rawOptions, state));
  assert.equal(state.requestsUsed, 6);
  assert.ok(rows.some(row => row.attempts.some(attempt => attempt.status === "PHASE_REQUEST_BUDGET_EXHAUSTED")));
  assert.equal(state.phaseRequestBudgetExceeded, true);
  assert.ok(state.phaseRequestBudgetSkippedCalls > 0);
  assert.ok([...state.providers.values()].every(provider => provider.failures === 0 && provider.circuitOpen === false));
  let quoteCalls = 0;
  const recovered = await executeActiveEvidenceProviderRequests({ chain: "base", tokenAddress: TOKEN, poolAddress: POOL,
    priceUsd: 0.006, liquidityUsd: 260000, identityVerified: true, contractVerified: true, instantSafetyStatus: "PASS" },
  ["purchaseRouteConfirmed", "sellRouteAvailable"].map(field => ({ field, item: { canonicalField: field,
    requiresFreshObservation: true, targetSources: [{ source: "LI.FI keyless quote" }] } })), { ...opts, executionRecovery: {
    enabled: true, env: {}, lifiEnabled: true, lifiApiKey: "", jupiterApiKey: "", zeroxApiKey: "",
    tradeSizesUsd: [25], lifiRateBudget: { windowStartedAtMs: NOW, requests: 0 },
    fetchJson: async url => {
      quoteCalls++;
      const params = new URL(url).searchParams, chainId = Number(params.get("fromChain"));
      const buy = params.get("toToken").toLowerCase() === TOKEN;
      return { tool: "aerodrome", toolDetails: { name: "Aerodrome" },
        action: { fromChainId: chainId, toChainId: chainId, fromAmount: params.get("fromAmount"),
          fromToken: { chainId, address: params.get("fromToken"), decimals: buy ? 6 : 18 },
          toToken: { chainId, address: params.get("toToken"), decimals: buy ? 18 : 6 } },
        estimate: { tool: "aerodrome", toAmount: buy ? "5000000000000000000" : "24750000",
          data: { protocols: [{ poolAddress: POOL }] } } };
    },
  } }, state);
  assert.equal(quoteCalls, 2);
  assert.equal(state.requestsUsed, 8);
  assert.equal(state.maxRequests, 8);
  assert.equal(recovered.observations.find(row => row.field === "purchaseRouteConfirmed")?.value, true);
  assert.equal(recovered.projectPatch.liveExecutionReady, undefined);
  assert.equal(recovered.projectPatch.finalSelectionQualified, undefined);
});

test("invalid internal phase caps fail closed without widening the absolute budget", () => {
  for (const phaseRequestLimit of [NaN, Infinity, -1, null, "unlimited"]) {
    const state = createActiveEvidenceRecoveryState(options());
    const raw = reserveExecutionRecoveryWindow(state, { ...options(), phaseRequestLimit });
    assert.equal(raw.phaseRequestLimit, 0);
    assert.equal(state.requestsUsed, 0);
    assert.equal(state.maxRequests, 8);
  }
});

test("queued limiter admissions recheck the raw request cap before dispatch", async t => {
  let httpCalls = 0;
  const admissions = [];
  t.mock.method(globalThis, "fetch", async url => {
    httpCalls++;
    assert.ok(String(url).includes(`/token_security/56?contract_addresses=${TOKEN}`));
    return { ok: true, json: async () => ({ result: { [TOKEN]: { holders: [{ address: CREATOR, balance: "1" }] } } }) };
  });
  const opts = { ...options(), now: Date.now, phaseRequestLimit: 1,
    useCheapBlockscoutHolderMetadata: false, useRpcWalletFallback: false,
    goPlusRateLimiter: () => new Promise(resolve => admissions.push(resolve)) };
  const state = createActiveEvidenceRecoveryState(opts);
  const work = mapWithBoundedConcurrency([1, 2], 2, () => executeActiveEvidenceProviderRequests({
    chain: "bsc", tokenAddress: TOKEN,
  }, [{ field: "holderAddresses", item: { canonicalField: "holderAddresses", cheapHolderMetadataOnly: true,
    targetSources: [{ source: "GoPlus" }] } }], opts, state));
  try {
    for (let step = 0; step < 100 && admissions.length < 2; step++) {
      await new Promise(resolve => setImmediate(resolve));
    }
    assert.equal(admissions.length, 2);
  } finally {
    for (const release of admissions) release(true);
  }
  const results = await work;
  assert.equal(httpCalls, 1);
  assert.equal(state.requestsUsed, 1);
  assert.equal(state.maxRequests, 8);
  assert.ok(results.some(row => row.attempts.some(attempt => attempt.status === "PHASE_REQUEST_BUDGET_EXHAUSTED")));
  assert.ok([...state.providers.values()].every(provider => provider.failures === 0 && provider.circuitOpen === false));
});

test("zero and explicitly disabled request reserves never manufacture quota", () => {
  for (const maxProviderRequests of [0, 1, 2]) {
    const state = createActiveEvidenceRecoveryState({ ...options(), maxProviderRequests });
    const raw = reserveExecutionRecoveryWindow(state, { ...options(), executionReserveRequests: 0 });
    assert.equal(raw.phaseRequestLimit, undefined);
    assert.equal(state.maxRequests, maxProviderRequests);
    assert.equal(state.requestsUsed, 0);
  }
});
