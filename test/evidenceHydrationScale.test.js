import test from "node:test";
import assert from "node:assert/strict";
import { analyzeActiveEvidenceRecoveryBatch } from "../src/engines/activeEvidenceRecoveryEngine.js";
import { summarizeEvidenceFunnel } from "../src/kernel/evidenceFunnelSummary.js";
import { summarizeExecutionProofRecovery } from "../src/reports/executionProofRecoveryReportEngine.js";

test("500 deep and 3500 deferred fixtures enforce Wave3 limits, real request accounting and zero forced picks", async () => {
  const now = new Date();
  const usdc = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
  const poolByToken = new Map();
  const deep = Array.from({ length: 500 }, (_, index) => {
    const tokenAddress = `0x11${index.toString(16).padStart(38, "0")}`;
    const poolAddress = `0x22${index.toString(16).padStart(38, "0")}`;
    poolByToken.set(tokenAddress, poolAddress);
    return { name: `Execution Utility ${index}`, symbol: `EXU${index}`, chain: "base", tokenAddress,
      contractAddress: tokenAddress, poolAddress, priceUsd: 0.006, liquidityUsd: 260000,
      identityVerified: true, contractVerified: true, instantSafetyStatus: "PASS",
      deepEvaluationState: "DEEP_EVALUATED", coreEvidenceState: "CORE_EVIDENCE_READY", coreEvidenceCoveragePct: 91,
      preliminaryOpportunityScore: 500 - index, finalSelectionState: "RESEARCH_ONLY",
      executionProofRecovery: { status: "DEFERRED_TO_WAVE3", attempted: false },
      executionProof: { routeType: "DEX", buyQuoteVerified: false, sellQuoteVerified: false,
        executionProofState: "MARKET_OBSERVED", liveExecutionReady: false } };
  });
  const deferred = Array.from({ length: 3500 }, (_, index) => ({ ...deep[index % 500],
    deepEvaluationState: "DEFERRED_BEFORE_DEEP" }));
  const calledTokens = new Set();
  let calls = 0;
  const result = await analyzeActiveEvidenceRecoveryBatch([...deep, ...deferred], {
    wave1Max: 0, wave2Max: 0, wave3Max: 50, maxProviderRequests: 60, concurrency: 1,
    freeOnly: true, useCache: false, walletHistory: false, now: () => now.getTime(),
    providers: { fetch: async () => assert.fail("This deterministic replay must never access the network") },
    executionRecovery: { env: {}, lifiEnabled: true, lifiApiKey: "", jupiterApiKey: "", zeroxApiKey: "",
      tradeSizesUsd: [25], lifiRateBudget: { windowStartedAtMs: now.getTime(), requests: 0 },
      fetchJson: async (url) => {
        calls++;
        const params = new URL(url).searchParams;
        const from = params.get("fromToken").toLowerCase();
        const to = params.get("toToken").toLowerCase();
        const buy = from === usdc;
        const token = buy ? to : from;
        calledTokens.add(token);
        assert.ok(deep.slice(0, 50).some((candidate) => candidate.tokenAddress === token));
        return { tool: "aerodrome", toolDetails: { name: "Aerodrome" },
          action: { fromChainId: 8453, toChainId: 8453, fromAmount: params.get("fromAmount"),
            fromToken: { chainId: 8453, address: from, decimals: buy ? 6 : 18 },
            toToken: { chainId: 8453, address: to, decimals: buy ? 18 : 6 } },
          estimate: { tool: "aerodrome", toAmount: buy ? "5000000000000000000" : "24750000",
            data: { protocols: [{ poolAddress: poolByToken.get(token) }] } } };
      } },
  });
  assert.equal(calls, 60);
  assert.equal(calledTokens.size, 30);
  assert.equal(result.filter((candidate) => candidate.activeEvidenceRecovery?.waves?.includes("WAVE3")).length, 50);
  assert.equal(result.filter((candidate) => candidate.executionProofRecoveryRoute).length, 30);
  const report = summarizeExecutionProofRecovery(result);
  assert.equal(report.candidatesAttempted, 50);
  assert.equal(report.candidatesWithProviderRequests, 30);
  assert.equal(report.executionProviderRequestsUsed, 60);
  assert.equal(report.routesRecovered, 30);
  assert.equal(report.newlyExecutionReady, 0);
  assert.equal(report.adapterHealth.find((adapter) => adapter.adapter === "lifi").budgetExhausted, 20);
  assert.ok(result.slice(500).every((candidate) => !candidate.activeEvidenceRecovery?.waves?.length));
  for (const candidate of result.filter((item) => item.executionProofRecoveryRoute)) {
    assert.equal(candidate.fieldProvenance.purchaseRouteConfirmed.source, "lifi");
    assert.equal(candidate.fieldProvenance.purchaseRouteConfirmed.sourceTimestamp, now.toISOString());
    assert.equal(candidate.executionProofRecoveryRoute.verificationStatus, "VERIFIED_PROVIDER_OBSERVATION");
  }
  const funnel = summarizeEvidenceFunnel(result);
  assert.equal(funnel.standardCandidates, 4000);
  assert.equal(funnel.deepEvaluated, 500);
  assert.equal(funnel.deepDeferred, 3500);
  assert.equal(funnel.coreDataStarved, 0);
  assert.equal(funnel.insufficientEvidenceCandidates, 500);
  assert.equal(funnel.fullyQualified, 0);
  assert.equal(funnel.selectionOutcome, "DATA_DEGRADED");
});
