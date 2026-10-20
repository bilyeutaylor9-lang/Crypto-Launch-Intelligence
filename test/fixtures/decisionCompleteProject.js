import { analyzeExecutionProof } from "../../src/engines/executionProofEngine.js";

export function decisionCompleteProject(overrides = {}) {
  const contractAddress = "0x0000000000000000000000000000000000000cea";
  const pairAddress = "0x0000000000000000000000000000000000000cab";
  return analyzeExecutionProof({
    name: "Verified Test Project", symbol: "VTP", chain: "base", contractAddress, pairAddress,
    deepEvaluationState: "DEEP_EVALUATED", coreEvidenceState: "CORE_EVIDENCE_READY",
    coreEvidenceCoveragePct: 92, advisoryEvidenceCoveragePct: 50, finalSelectionState: "RESEARCH_ONLY",
    strictIdentityVerified: true, identityVerified: true, contractVerified: true,
    safetyProofStatus: "VERIFIED_SAFE", instantSafetyStatus: "PASS", testedChecks: ["honeypot", "mint authority", "freeze authority"],
    securityEvidenceSources: ["exact-test-provider"], regionStatus: "CONFIRMED_AVAILABLE",
    priceUsd: 1, liquidityUsd: 250000, orderBookDepthUsd: 25000,
    quoteAgeSeconds: 30, estimatedSlippagePct: 1, buyTaxPct: 0, sellTaxPct: 0,
    canonicalExecutionRoute: { routeType: "DEX", status: "VERIFIED", routeTruthStatus: "LIVE_EXECUTION_READY",
      chain: "base", contractAddress, pairAddress, exactIdentityVerified: true,
      buyQuoteVerified: true, sellQuoteVerified: true, quoteAgeSeconds: 30,
      liquidityUsd: 250000, estimatedSlippagePct: 1, regionStatus: "CONFIRMED_AVAILABLE" },
    ...overrides,
  });
}
