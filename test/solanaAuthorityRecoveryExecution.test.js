import test from "node:test";
import assert from "node:assert/strict";
import { createActiveEvidenceExecutionState, executeActiveEvidenceProviderRequests } from "../src/data/activeEvidenceProviderExecutor.js";

const NOW = Date.parse("2026-10-18T07:00:00Z");
const MINT = "So11111111111111111111111111111111111111112";
const PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const GENESIS = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";
const candidate = { chain: "solana", tokenAddress: MINT, mintAuthorityEnabled: false,
  securityEvidence: [{ provider: "solana-rpc-rugcheck", chain: "solana", address: MINT,
    status: "EVIDENCE_AVAILABLE", observedAt: new Date(NOW).toISOString(),
    mintRisk: false, freezeRisk: false, identityVerifiedOnChain: false, testedChecks: ["RugCheck risk report"] }] };
const requests = [{ field: "mintAuthorityEnabled", item: { canonicalField: "mintAuthorityEnabled",
  requiresAuthorityPair: true, requiresFreshObservation: true, targetSources: [{ source: "chain rpc" }] } }];

function options(maxRequests, calls, failRpc = false) {
  return { maxRequests, now: () => NOW, providerTimeoutMs: 500, circuitFailureThreshold: 1,
    securityEvidence: { useCache: false, solanaRpcUrl: "https://rpc.invalid", solanaRpcUrls: ["https://other.invalid"],
      fetchJson: async (url, init = {}) => {
        calls.push({ url, method: init.method === "POST" ? JSON.parse(init.body).method : "RugCheck" });
        if (init.method !== "POST") return { mint: MINT, tokenProgram: PROGRAM,
          mintAuthority: null, freezeAuthority: null, risks: [], rugged: false, topHolders: [] };
        assert.ok(init.signal);
        if (failRpc) throw new Error("RPC unavailable");
        const { method } = JSON.parse(init.body);
        if (method === "getGenesisHash") return { result: GENESIS };
        if (method === "getBlockTime") return { result: NOW / 1000 - 2 };
        assert.equal(method, "getAccountInfo");
        return { result: { context: { slot: 12345 }, value: { owner: PROGRAM,
          data: { parsed: { type: "mint", info: { isInitialized: true, mintAuthority: null,
            freezeAuthority: null, decimals: 9, supply: "1000000000" } } } } } };
      } },
  };
}

test("paired authority recovery bypasses an existing scalar and charges each real HTTP/RPC method", async () => {
  for (const maximum of [0, 1, 2, 3, 4]) {
    const calls = [];
    const opts = options(maximum, calls);
    const state = createActiveEvidenceExecutionState(opts);
    const result = await executeActiveEvidenceProviderRequests(candidate, requests, opts, state);
    assert.equal(calls.length, maximum);
    assert.equal(state.requestsUsed, maximum);
    if (maximum < 4) assert.deepEqual(result.observations, []);
    else {
      const observed = result.observations.find(x => x.field === "mintAuthorityEnabled");
      assert.equal(observed.value, false);
      assert.equal(observed.sourceTimestamp, "2026-10-18T06:59:58.000Z");
      assert.ok(result.projectPatch.securityEvidence.some(x => x.identityVerifiedOnChain === true));
      assert.deepEqual(result.changedEvidenceFamilies, ["SECURITY"]);
      assert.equal(result.projectPatch.liveExecutionReady, undefined);
    }
  }
});

test("unavailable RPC leaves paired authority UNKNOWN despite a complete RugCheck report", async () => {
  const calls = [];
  const opts = options(20, calls, true);
  const state = createActiveEvidenceExecutionState(opts);
  const first = await executeActiveEvidenceProviderRequests(candidate, requests, opts, state);
  assert.deepEqual(first.observations, []);
  assert.deepEqual(first.changedEvidenceFamilies, ["SECURITY"]);
  assert.ok(first.projectPatch.securityEvidence.every(x => x.identityVerifiedOnChain !== true));
  const second = await executeActiveEvidenceProviderRequests(candidate, requests, opts, state);
  assert.deepEqual(second.observations, []);
  assert.equal(calls.filter(x => x.method === "getGenesisHash").length, 2);
  assert.ok(second.attempts.some(x => x.status === "CIRCUIT_OPEN"));
  assert.equal(state.requestsUsed, calls.length);
});

test("unreported security booleans do not become clean negatives", async () => {
  const result = await executeActiveEvidenceProviderRequests({ chain: "solana", tokenAddress: MINT }, [
    { field: "mintAuthorityEnabled", item: { canonicalField: "mintAuthorityEnabled", targetSources: [{ source: "chain rpc" }] } },
  ], { maxRequests: 4, providers: { getFreeSecurityEvidence: async () => ({
    evidence: [{ provider: "solana-rpc-rugcheck", chain: "solana", address: MINT, status: "EVIDENCE_AVAILABLE" }],
  }) } });
  assert.deepEqual(result.observations, []);
});

test("queued security RPC cannot start HTTP after its shared deadline expires", async () => {
  const calls = [];
  const opts = options(8, calls);
  const state = createActiveEvidenceExecutionState(opts);
  state.deadlineAt = NOW + 100;
  state.now = () => state.requestsUsed > 0 ? state.deadlineAt : NOW;
  const result = await executeActiveEvidenceProviderRequests(candidate, requests, opts, state);
  assert.equal(calls.length, 0);
  assert.equal(state.timeBudgetExceeded, true);
  assert.deepEqual(result.observations, []);
});
