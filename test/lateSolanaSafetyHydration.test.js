import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  analyzeActiveEvidenceRecoveryBatch,
  buildActiveEvidenceRecoveryWaves,
  createActiveEvidenceRecoveryState,
} from "../src/engines/activeEvidenceRecoveryEngine.js";
import { attachCanonicalIdentity } from "../src/identity/canonicalIdentityResolver.js";
import { analyzeExecutionProof } from "../src/engines/executionProofEngine.js";
import { analyzeCanonicalExecutionRoute } from "../src/engines/canonicalExecutionRouteEngine.js";
import { analyzeContractAuthorityRisk } from "../src/engines/contractAuthorityRiskEngine.js";
import { routeQuoteFresh } from "../src/execution/routeTruthV2.js";

const NOW = Date.parse("2026-10-18T07:00:00Z");
const MINT = "3HLhtXNCVh1VbCrpwACoZWwHoNeoCB7hRAPcYN2jjUiL";
const OTHER = "66wLt8u1BmvqWb2Wks7NiVeuvNC9NsmrDUVu777YuHzW";
const POOL = "DN5Eq6ELcvUcC69VNbNW5pNbnt3bvtVGfHpBWb8pAcoF";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const GENESIS = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";

test.beforeEach((t) => {
  t.mock.timers.enable({ apis: ["Date"], now: NOW });
  let forbiddenCalls = 0;
  const forbidden = () => { forbiddenCalls++; throw new Error("Live HTTP and artifact writes are forbidden"); };
  t.mock.method(globalThis, "fetch", forbidden);
  for (const name of ["writeFileSync", "appendFileSync", "mkdirSync", "renameSync", "unlinkSync", "rmSync", "copyFileSync",
    "writeFile", "appendFile", "mkdir", "rename", "unlink", "rm", "copyFile", "createWriteStream"])
    t.mock.method(fs, name, forbidden);
  for (const name of ["writeFile", "appendFile", "mkdir", "rename", "unlink", "rm", "copyFile"])
    t.mock.method(fs.promises, name, forbidden);
  t.after(() => assert.equal(forbiddenCalls, 0, "No live HTTP or filesystem writes may be attempted"));
});

function snapshot(patch = {}, rpcPatch = {}, mint = MINT) {
  const blockTimestamp = Math.floor(Date.now() / 1000) - 1;
  const sourceTimestamp = new Date(blockTimestamp * 1000).toISOString();
  return { provider: "solana-rpc-rugcheck", status: "EVIDENCE_AVAILABLE", chain: "solana", address: mint,
    responseIdentityVerified: true, identityVerifiedOnChain: true, snapshotTimestampVerified: true, verifiedSource: true,
    observedAt: new Date().toISOString(), sourceTimestamp, mintRisk: false, freezeRisk: false,
    testedChecks: ["mint-account identity", "mint authority", "freeze authority"],
    raw: { rpc: { genesisHash: GENESIS, ownerProgram: PROGRAM, observedSlot: 1234, blockTimestamp,
      sourceTimestamp, mintAuthority: null, freezeAuthority: null, ...rpcPatch } }, ...patch };
}

function candidate(evidence = [snapshot()], patch = {}) {
  return analyzeExecutionProof(attachCanonicalIdentity({ name: "Late Solana", symbol: "LATE", chain: "solana",
    tokenAddress: MINT, contractAddress: MINT, poolAddress: POOL, source: "raydium",
    priceUsd: 1, liquidityUsd: 200000, deepEvaluationState: "DEEP_EVALUATED",
    mintAuthorityEnabled: false, freezeAuthorityEnabled: false, instantSafetyStatus: "PASS",
    securityEvidence: evidence, ...patch }));
}

function options(calls, patch = {}, rpc = {}) {
  return { now: () => Date.now(), maxRequests: 12, timeBudgetMs: 23 * 60 * 1000,
    concurrency: 1, wave1Max: 0, wave2Max: 0, wave3Max: 1, freeOnly: true, walletHistory: false,
    providerTimeoutMs: 500,
    securityEvidence: { useCache: false, solanaRpcUrl: "https://rpc.invalid",
      fetchJson: async (url, init = {}) => {
        const request = init.method === "POST" ? JSON.parse(init.body) : null;
        calls.push(request?.method || "RugCheck");
        assert.ok(init.signal && !init.signal.aborted);
        if (!request) return { mint: rpc.reportMint || MINT, tokenProgram: PROGRAM,
          mintAuthority: null, freezeAuthority: null, risks: [], rugged: rpc.rugged || false, topHolders: [] };
        rpc.onRequest?.(request.method);
        if (rpc.fail) throw new Error("Injected RPC unavailable");
        if (request.method === "getGenesisHash") return { result: rpc.genesis || GENESIS };
        if (request.method === "getBlockTime") return { result: Object.hasOwn(rpc, "time") ? rpc.time : Math.floor(Date.now() / 1000) - 1 };
        assert.equal(request.method, "getAccountInfo");
        assert.equal(request.params[0], rpc.mint || MINT);
        return { result: { context: { slot: 2345 }, value: { owner: rpc.owner || PROGRAM,
          data: { parsed: { type: "mint", info: { isInitialized: true, mintAuthority: rpc.mintAuthority || null,
            freezeAuthority: rpc.freezeAuthority || null, decimals: 9, supply: "1000000000" } } } } } };
      } },
    executionRecovery: { env: {}, jupiterApiKey: "", zeroxApiKey: "", lifiEnabled: false,
      raydiumEnabled: true, tradeSizesUsd: [25],
      raydiumRateBudget: { startedAt: null, requests: 0, retryAt: 0 },
      fetchJson: async (url, init) => {
        calls.push("quote");
        assert.equal(init.adapter, "raydium");
        assert.ok(init.signal && !init.signal.aborted);
        const params = new URL(url).searchParams;
        const inputMint = params.get("inputMint"), outputMint = params.get("outputMint");
        return { success: true, id: `quote-${calls.length}`, data: { swapType: "BaseIn", inputMint, outputMint,
          inputAmount: params.get("amount"), outputAmount: inputMint === USDC ? "1000000000" : "24750000",
          otherAmountThreshold: inputMint === USDC ? "990000000" : "24502500", slippageBps: 100,
          routePlan: [{ poolId: POOL, inputMint, outputMint }] } };
      } }, ...patch };
}

async function rerun(project) {
  const identity = attachCanonicalIdentity(project);
  const safety = await analyzeContractAuthorityRisk(identity, { collectSecurityEvidence: false });
  return analyzeExecutionProof(analyzeCanonicalExecutionRoute(safety));
}

test("17-minute shared-state delay refreshes paired raw safety before late quotes and dependent reruns", async (t) => {
  const calls = [], opts = options(calls);
  const state = createActiveEvidenceRecoveryState(opts);
  const initial = candidate();
  const original = structuredClone(initial);
  const [early] = await analyzeActiveEvidenceRecoveryBatch([initial], { ...opts, executionState: state, wave3Max: 0 });
  t.mock.timers.tick(17 * 60 * 1000);
  assert.equal(attachCanonicalIdentity(early).identityStatus, "PROBABLE_MATCH");
  assert.equal(analyzeExecutionProof(early).executionProof.authorityEvidenceVerified, false);
  const [late] = await analyzeActiveEvidenceRecoveryBatch([early], { ...opts, executionState: state, resumeRecovery: true });
  assert.deepEqual(calls.slice(0, 4).sort(), ["getGenesisHash", "getAccountInfo", "getBlockTime", "RugCheck"].sort());
  assert.deepEqual(calls.slice(4), ["quote", "quote"]);
  assert.equal(state.requestsUsed, 6);
  assert.equal(state.deadlineAt, NOW + 23 * 60 * 1000);
  assert.equal(late.activeEvidenceRecovery.recoverySessionId, state.recoverySessionId);
  assert.deepEqual(late.activeEvidenceRecovery.waves, ["WAVE3"]);
  assert.ok(late.activeEvidenceRecovery.changedEvidenceFamiliesThisPhase.includes("SECURITY"));
  assert.ok(late.activeEvidenceRecovery.attemptedFields.includes("mintAuthorityEnabled"));
  assert.ok(late.securityEvidence.some((item) => item.raw?.rpc?.observedSlot === 2345));
  assert.equal(late.liveExecutionReady, initial.liveExecutionReady, "Acquisition must not forge derived readiness");
  const verified = await rerun(late);
  assert.equal(verified.identityStatus, "VERIFIED");
  assert.equal(verified.executionProof.authorityEvidenceVerified, true);
  assert.equal(verified.executionProof.authoritySafetyClean, true);
  assert.equal(routeQuoteFresh(verified), true);
  assert.equal(verified.executionProof.liveExecutionReady, true);
  assert.deepEqual(initial, original);
});

test("fresh exact paired mint-account proof is reused without security RPC", async () => {
  const calls = [];
  const initial = candidate();
  const [result] = await analyzeActiveEvidenceRecoveryBatch([initial], options(calls, { maxRequests: 2 }));
  assert.deepEqual(calls, ["quote", "quote"]);
  assert.equal(result.activeEvidenceRecovery.providerExecution.requestsUsed, 2);
  assert.ok(result.activeEvidenceRecovery.providerAttempts.some((item) => item.status === "LOCAL_EVIDENCE_AVAILABLE"));
  assert.equal((await rerun(result)).executionProof.authorityEvidenceVerified, true);
});

test("proof that expires while a selected candidate is queued is refreshed at dispatch", async (t) => {
  const calls = [];
  const first = candidate();
  const second = candidate([snapshot({}, {}, OTHER)], { tokenAddress: OTHER, contractAddress: OTHER });
  const opts = options(calls, { wave3Max: 2 }, { mint: OTHER, reportMint: OTHER });
  const quote = opts.executionRecovery.fetchJson;
  opts.executionRecovery.fetchJson = async (url, init) => {
    const result = await quote(url, init);
    if (calls.length === 2) t.mock.timers.tick(301000);
    return result;
  };
  assert.equal(buildActiveEvidenceRecoveryWaves([first, second], opts).waves.WAVE3.length, 2);
  const results = await analyzeActiveEvidenceRecoveryBatch([first, second], opts);
  assert.deepEqual(calls.slice(0, 2), ["quote", "quote"]);
  assert.deepEqual(calls.slice(2, 6).sort(), ["getGenesisHash", "getAccountInfo", "getBlockTime", "RugCheck"].sort());
  assert.deepEqual(calls.slice(6), ["quote", "quote"]);
  assert.equal(results[1].activeEvidenceRecovery.providerExecution.requestsUsed, 8);
  assert.equal((await rerun(results[1])).executionProof.authorityEvidenceVerified, true);
});

test("fresh-looking authority flags cannot replace missing or malformed raw mint-account evidence", async () => {
  for (const evidence of [[], [snapshot({}, { genesisHash: "devnet" })],
    [snapshot({ sourceTimestamp: null })], [snapshot({ snapshotTimestampVerified: false })]]) {
    const calls = [];
    const initial = candidate(evidence);
    initial.executionProof = { ...initial.executionProof, authorityEvidenceVerified: true, authoritySafetyClean: true,
      authorityEvidenceSourceTimestamp: new Date().toISOString() };
    const [result] = await analyzeActiveEvidenceRecoveryBatch([initial], options(calls));
    assert.equal(calls.filter((item) => item === "getAccountInfo").length, 1);
    assert.deepEqual(calls.slice(-2), ["quote", "quote"]);
    assert.equal(attachCanonicalIdentity(result).identityStatus, "VERIFIED");
  }
});

test("unavailable, foreign-cluster, foreign-program and stale RPC never reach quotes or become clean proof", async () => {
  for (const rpc of [{ fail: true }, { genesis: "devnet" }, { owner: "11111111111111111111111111111111" },
    { time: NOW / 1000 - 301 }, { time: NOW / 1000 + 1 }, { time: null }, { fail: true, reportMint: OTHER }]) {
    const calls = [];
    const initial = candidate([snapshot({ sourceTimestamp: new Date(NOW - 17 * 60 * 1000).toISOString() })]);
    const [result] = await analyzeActiveEvidenceRecoveryBatch([initial], options(calls, {}, rpc));
    assert.equal(calls.includes("quote"), false);
    assert.equal((await rerun(result)).executionProof.authorityEvidenceVerified, false);
    assert.equal(result.liveExecutionReady, false);
    assert.equal(result.executionProofRecoveryRoute, undefined);
    assert.ok(result.activeEvidenceRecovery.providerAttempts.some((item) => item.status === "SAFETY_UNRESOLVED_OR_BLOCKED"));
  }
});

test("fresh foreign-mint evidence cannot satisfy local reuse", async () => {
  const calls = [];
  const initial = candidate([snapshot({}, {}, OTHER)]);
  const [result] = await analyzeActiveEvidenceRecoveryBatch([initial], options(calls));
  assert.ok(calls.includes("getAccountInfo"));
  assert.equal(attachCanonicalIdentity(result).identityStatus, "VERIFIED");
  assert.ok(result.securityEvidence.every((item) => item.address === MINT));
});

test("foreign mint and chain risks cannot veto an exact clean candidate through mixed summaries", async () => {
  for (const foreign of [snapshot({ mintRisk: true }, {}, OTHER), snapshot({ chain: "base", malicious: true })]) {
    const calls = [];
    const initial = candidate([snapshot(), foreign], {
      securityEvidenceSummary: { mintRisk: true, malicious: true },
      freeSecurityEvidence: { evidence: [foreign], summary: { mintRisk: true, malicious: true } },
    });
    const [result] = await analyzeActiveEvidenceRecoveryBatch([initial], options(calls, { maxRequests: 2 }));
    assert.deepEqual(calls, ["quote", "quote"]);
    assert.ok(result.securityEvidence.every(item => item.address === MINT && item.chain === "solana"));
    assert.equal(result.securityEvidenceSummary.mintRisk, false);
    assert.equal(result.securityEvidenceSummary.malicious, false);
    assert.equal((await rerun(result)).executionProof.authoritySafetyClean, true);
  }
});

test("legacy adverse summaries without raw records still block hydration and quotes", async () => {
  for (const patch of [{ mintRisk: true }, { freezeRisk: true }, { malicious: true }]) {
    const calls = [];
    const initial = candidate([], { securityEvidenceSummary: patch });
    const [result] = await analyzeActiveEvidenceRecoveryBatch([initial], options(calls));
    assert.deepEqual(calls, []);
    assert.equal(result.executionProofRecoveryRoute, undefined);
    assert.deepEqual(result.securityEvidenceSummary, patch);
  }
});

test("safety and quotes share the existing request allowance including previously spent requests", async () => {
  for (const remaining of [0, 1, 2, 3, 4, 5, 6]) {
    const calls = [], opts = options(calls, { maxRequests: remaining + 2 });
    const state = createActiveEvidenceRecoveryState(opts);
    state.requestsUsed = 2;
    const [result] = await analyzeActiveEvidenceRecoveryBatch([candidate([])], { ...opts, executionState: state });
    assert.equal(calls.length, remaining);
    assert.equal(state.requestsUsed, remaining + 2);
    assert.equal(state.maxRequests, remaining + 2);
    if (remaining < 4) assert.equal(calls.includes("quote"), false);
    if (remaining < 6) assert.equal(result.executionProofRecoveryRoute, undefined);
    else assert.equal(result.executionProofRecoveryRoute.buyQuoteVerified, true);
  }
});

test("expired or mid-hydration deadlines forbid later dispatch without a new allowance", async () => {
  for (const expireDuringRpc of [false, true]) {
    const calls = [];
    const opts = options(calls, {}, { onRequest: (method) => {
      if (expireDuringRpc && method === "getAccountInfo") state.deadlineAt = Date.now();
    } });
    const state = createActiveEvidenceRecoveryState(opts);
    if (!expireDuringRpc) state.deadlineAt = Date.now();
    const deadline = state.deadlineAt;
    const [result] = await analyzeActiveEvidenceRecoveryBatch([candidate([])], { ...opts, executionState: state });
    assert.equal(calls.includes("quote"), false);
    assert.equal(state.timeBudgetExceeded, true);
    assert.equal(state.deadlineAt, expireDuringRpc ? Date.now() : deadline);
    if (!expireDuringRpc) assert.deepEqual(calls, []);
    assert.equal(result.executionProofRecoveryRoute, undefined);
  }
});

test("security RPC circuits remain shared across selected candidates", async () => {
  const calls = [], opts = options(calls, { circuitFailureThreshold: 1 }, { fail: true });
  const state = createActiveEvidenceRecoveryState(opts);
  await analyzeActiveEvidenceRecoveryBatch([candidate([])], { ...opts, executionState: state });
  const firstRequests = calls.filter((item) => item === "getGenesisHash").length;
  const [second] = await analyzeActiveEvidenceRecoveryBatch([candidate([])], { ...opts, executionState: state });
  assert.equal(firstRequests, 1);
  assert.equal(calls.filter((item) => item === "getGenesisHash").length, 1);
  assert.ok(second.activeEvidenceRecovery.providerAttempts.some((item) => item.status === "CIRCUIT_OPEN"));
  assert.equal(calls.includes("quote"), false);
});

test("unsafe, conflicting, deferred and nonselected candidates never hydrate", async () => {
  const excluded = [
    candidate([], { honeypotDetected: true }), candidate([], { sellRestricted: true }),
    candidate([], { mintAuthorityEnabled: true }), candidate([], { freezeAuthorityEnabled: true }),
    candidate([], { instantSafetyStatus: "CRITICAL" }),
    candidate([], { contractAddress: OTHER }), candidate([], { canonicalIdentityHardBlock: true, identityConflict: true }),
    candidate([], { deepEvaluationState: "DEFERRED_BEFORE_DEEP" }), candidate([], { deepEvaluationDeferred: true }),
    candidate([], { deepEvaluationSelected: false }),
  ];
  for (const initial of excluded) {
    const calls = [];
    await analyzeActiveEvidenceRecoveryBatch([initial], options(calls));
    assert.deepEqual(calls, []);
  }
  const calls = [];
  const high = candidate([], { preliminaryOpportunityScore: 100 });
  const low = candidate([], { tokenAddress: OTHER, contractAddress: OTHER, preliminaryOpportunityScore: 1 });
  const opts = options(calls);
  const selected = buildActiveEvidenceRecoveryWaves([high, low], opts).waves.WAVE3;
  assert.deepEqual(selected.map((item) => item.projectIndex), [0]);
  const results = await analyzeActiveEvidenceRecoveryBatch([high, low], opts);
  assert.equal(calls.filter((item) => item === "getAccountInfo").length, 1);
  assert.equal(results[1].activeEvidenceRecoveryStatus, "NOT_SELECTED");
  assert.deepEqual(results[1].securityEvidence, []);
  const none = [];
  await analyzeActiveEvidenceRecoveryBatch([high], options(none, { wave3Max: 0 }));
  assert.deepEqual(none, []);
});

test("a selected CEX market does not request Solana safety", async () => {
  const calls = [];
  const initial = { ...candidate([]), marketKey: "coinbase:LATEUSD", provider: "coinbase", marketPair: "LATEUSD",
    executionProof: { routeType: "CEX", buyQuoteVerified: false, sellQuoteVerified: false },
    routeType: "CEX" };
  const opts = options(calls, { maxRequests: 0 });
  assert.equal(buildActiveEvidenceRecoveryWaves([initial], opts).waves.WAVE3.length, 1);
  const [result] = await analyzeActiveEvidenceRecoveryBatch([initial], opts);
  assert.deepEqual(calls, []);
  assert.equal(result.activeEvidenceRecovery.attemptedFields.includes("mintAuthorityEnabled"), false);
  assert.ok(result.activeEvidenceRecovery.providerExecution.providers.every((item) => !/security|rugcheck/.test(item.provider)));
});

test("old clean scalars and snapshots cannot mask newly observed mint, freeze or malicious risk", async () => {
  for (const rpc of [{ mintAuthority: OTHER }, { freezeAuthority: OTHER }, { rugged: true }]) {
    const calls = [];
    const old = snapshot({ sourceTimestamp: new Date(NOW - 17 * 60 * 1000).toISOString() });
    const initial = candidate([old], { honeypotDetected: false, sellRestricted: false });
    const [result] = await analyzeActiveEvidenceRecoveryBatch([initial], options(calls, {}, rpc));
    assert.equal(calls.includes("getAccountInfo"), true);
    assert.equal(calls.includes("quote"), false);
    assert.ok(result.securityEvidence.includes(old));
    assert.ok(result.securityEvidence.some((item) => item.mintRisk || item.freezeRisk || item.malicious));
    assert.equal((await rerun(result)).executionProof.liveExecutionReady, false);
    assert.ok(result.activeEvidenceRecovery.changedEvidenceFamiliesThisPhase.includes("SECURITY"));
    if (rpc.mintAuthority) assert.equal(result.mintAuthorityEnabled, true);
  }
});

test("known adverse authority evidence is retained without refresh or quote attempts", async () => {
  for (const patch of [{ mintRisk: true }, { freezeRisk: true }, { malicious: true }]) {
    const calls = [];
    const old = snapshot({ ...patch, sourceTimestamp: new Date(NOW - 17 * 60 * 1000).toISOString() });
    const initial = candidate([old]);
    const [result] = await analyzeActiveEvidenceRecoveryBatch([initial], options(calls));
    assert.deepEqual(calls, []);
    assert.deepEqual(result.securityEvidence, [old]);
    assert.equal(result.executionProofRecoveryRoute, undefined);
  }
});
