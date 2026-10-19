import test from "node:test";
import assert from "node:assert/strict";
import { analyzeActiveEvidenceRecoveryBatch, buildActiveEvidenceRecoveryWaves,
  createActiveEvidenceRecoveryState } from "../src/engines/activeEvidenceRecoveryEngine.js";

function candidate(symbol, score, chain = "solana") {
  const tokenAddress = chain === "solana" ? "ARMqZ1YB3ieGXeT6kjA7tC4ynoXGb5SBA6yXuTbs9Cgb"
    : "0x1111111111111111111111111111111111111111";
  const blockTimestamp = Math.floor(Date.now() / 1000) - 1;
  const sourceTimestamp = new Date(blockTimestamp * 1000).toISOString();
  return { symbol, preliminaryOpportunityScore: score, chain, tokenAddress, contractAddress: tokenAddress,
    poolAddress: chain === "solana" ? "HcX7NPj9sCbcN8A1E9WXZvgzR4A2uUKtrpTiFFUcibM6"
      : "0x2222222222222222222222222222222222222222", priceUsd: 1, liquidityUsd: 100000,
    deepEvaluationState: "DEEP_EVALUATED", executionProof: { routeType: "DEX", safetyVerified: true,
      buyQuoteVerified: false, sellQuoteVerified: false },
    // Scheduling-only fixture: mint identity and paired safety have already been observed.
    ...(chain === "solana" ? { securityEvidence: [{ provider: "solana-rpc-rugcheck", status: "EVIDENCE_AVAILABLE",
      chain, address: tokenAddress, responseIdentityVerified: true, identityVerifiedOnChain: true,
      snapshotTimestampVerified: true, verifiedSource: true, observedAt: new Date().toISOString(), sourceTimestamp,
      mintRisk: false, freezeRisk: false, testedChecks: ["mint-account identity", "mint authority", "freeze authority"],
      raw: { rpc: { genesisHash: "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d",
        ownerProgram: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", observedSlot: 1234,
        blockTimestamp, sourceTimestamp, mintAuthority: null, freezeAuthority: null } },
    }] } : {}) };
}

test("Wave3 freezes the priority-selected set and drains slow providers before short-lived Solana proofs", async (t) => {
  t.mock.method(globalThis, "fetch", async () => assert.fail("No live HTTP allowed"));
  const projects = [candidate("SOL_HIGH", 90), candidate("EVM", 80, "base"),
    candidate("SOL_LOW", 70), candidate("OUTSIDE", 10, "base")];
  const opts = { wave1Max: 0, wave2Max: 0, wave3Max: 3, maxProviderRequests: 10,
    concurrency: 1, freeOnly: true, useCache: false, walletHistory: false };
  const selected = buildActiveEvidenceRecoveryWaves(projects, opts).waves.WAVE3.map((item) => item.projectIndex);
  assert.deepEqual(selected, [0, 1, 2]);
  const order = [];
  const state = createActiveEvidenceRecoveryState(opts);
  const deadline = state.deadlineAt;
  const results = await analyzeActiveEvidenceRecoveryBatch(projects, { ...opts, executionState: state,
    executionRecovery: { env: {}, lifiEnabled: true, tradeSizesUsd: [25],
      lifiApiKey: "", jupiterApiKey: "", zeroxApiKey: "",
      lifiRateBudget: { windowStartedAtMs: Date.now(), requests: 0 }, fetchJson: async (url) => {
        order.push(new URL(url).hostname.includes("li.quest") ? "EVM" : "SOLANA");
        return { success: false, msg: "ROUTE_NOT_FOUND" };
      } },
  });
  assert.equal(order[0], "EVM");
  assert.ok(order.includes("SOLANA"));
  assert.equal(order.slice(order.indexOf("SOLANA")).includes("EVM"), false);
  assert.deepEqual(results.map((result, index) => result.activeEvidenceRecovery.waves?.includes("WAVE3") ? index : null)
    .filter((index) => index !== null), selected);
  assert.ok(state.requestsUsed <= opts.maxProviderRequests);
  assert.equal(state.deadlineAt, deadline);
  assert.equal(results.some((result) => result.buyQuoteVerified === true || result.finalSelectionQualified === true), false);
});
