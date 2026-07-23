import test from "node:test";
import assert from "node:assert/strict";

import { analyzeSevenDayTenXResearchBatch } from "../src/engines/sevenDayTenXResearchEngine.js";
import { analyzeUtilityQualityBatch } from "../src/engines/utilityQualityEngine.js";
import { summarizeHighUpsideScalpResearch } from "../src/reports/highUpsideScalpReportEngine.js";

const TOKEN = "0x0000000000000000000000000000000000000abc";
const POOL = "0x0000000000000000000000000000000000000def";

function candidate(overrides = {}) {
  return {
    name: "Utility Scalp Candidate",
    symbol: "USC",
    chain: "base",
    tokenAddress: TOKEN,
    contractAddress: TOKEN,
    poolAddress: POOL,
    pairAddress: POOL,
    category: "AI infrastructure",
    description:
      "AI infrastructure protocol with SDK, API, mainnet app, revenue fees, integrations, developer docs and active users.",
    website: "https://utility.example",
    docsUrl: "https://docs.utility.example",
    githubRepo: "https://github.com/utility/protocol",
    discoverySources: ["dexscreener", "geckoterminal", "github", "official-docs"],
    identityVerified: true,
    contractVerified: true,
    chainVerified: true,
    finalIdentityState: "VERIFIED_CONTRACT",
    finalSelectionState: "QUALIFIED",
    purchaseRouteConfirmed: true,
    executionRouteAvailable: true,
    sellRouteAvailable: true,
    executionStatus: "VERIFIED",
    purchaseRoute: { sellable: true },
    proofOfAlphaExecutionTwin: {
      route: { detected: true, sellDetected: true },
      safety: { blockers: [] },
    },
    priceUsd: 0.004,
    priceChange24h: 16,
    priceChange7d: 44,
    marketCap: 2_500_000,
    liquidityUsd: 180_000,
    dexLiquidityUsd: 180_000,
    stableExitLiquidityUsd: 90_000,
    volume24h: 320_000,
    accelerationScore: 82,
    earlyBreakoutScore: 80,
    preBreakoutRadarScore: 82,
    preConsensusBreakoutScore: 80,
    earlyAsymmetryResearchPriorityScore: 84,
    capitalMigrationScore: 78,
    capitalFlowScore: 76,
    buyerBreadthAccelerationScore: 82,
    buyPressureScore: 78,
    liquidityFormationScore: 84,
    liquidityExpansionScore: 80,
    organicBuyerScore: 82,
    buyerRetentionScore: 78,
    organicDemandIntegrityScore: 82,
    smartWalletArrivalScore: 74,
    smartMoneyAccumulationScore: 76,
    catalystScore: 76,
    catalystCalendarScore: 76,
    liveCatalystRadarScore: 78,
    developerActivityScore: 82,
    developerAccelerationScore: 80,
    githubProScore: 78,
    ecosystemIntegrationScore: 78,
    tokenomicsScore: 76,
    sourceTruthScore: 84,
    sourceReliabilityScore: 82,
    institutionalDataProvenanceScore: 80,
    evidenceCoverageScore: 78,
    opportunityEvidenceCoverage: 80,
    instantSafetyStatus: "PASS",
    instantSafetyScore: 92,
    contractAuthoritySafetyScore: 90,
    liquidityControlSafetyScore: 88,
    sniperIntegrityScore: 86,
    finalIntegrityScore: 88,
    contractAuthorityRiskScore: 6,
    liquidityControlRiskScore: 8,
    washTradingRiskScore: 5,
    walletClusterRiskScore: 6,
    deployerRiskScore: 6,
    sellPressureScore: 14,
    securityEvidenceStatus: "EVIDENCE_AVAILABLE",
    contractSafetyVerified: true,
    liveCatalystEvents: [
      {
        type: "Product release",
        expectedDate: new Date(Date.now() + 3 * 86400000).toISOString(),
        verificationSources: ["official docs"],
      },
    ],
    ...overrides,
  };
}

function analyzed(projects = []) {
  return analyzeSevenDayTenXResearchBatch(analyzeUtilityQualityBatch(projects), {
    targetCount: 10,
  });
}

test("high-upside scalp report promotes pre-extension real-utility route-ready candidates", () => {
  const report = summarizeHighUpsideScalpResearch(analyzed([candidate()]));

  assert.equal(report.scalpReadyCount, 1);
  assert.equal(report.topScalpResearchCandidates[0].symbol, "USC");
  assert.equal(report.topScalpResearchCandidates[0].lane, "SCALP_READY_RESEARCH");
  assert.equal(report.topScalpResearchCandidates[0].subCent, true);
});

test("already-10x or late-chase candidates are rejected from scalp-ready lane", () => {
  const report = summarizeHighUpsideScalpResearch(
    analyzed([
      candidate({
        symbol: "CHASE",
        priceChange24h: 240,
        priceChange7d: 980,
      }),
    ])
  );

  assert.equal(report.scalpReadyCount, 0);
  assert.equal(report.lateChaseRejected[0].symbol, "CHASE");
  assert.equal(report.lateChaseRejected[0].lane, "LATE_CHASE_REJECTED");
  assert.ok(report.lateChaseRejected[0].blockers.some((blocker) => /10x|extended/i.test(blocker)));
});

test("meme-only coins are excluded from real-utility scalp lane", () => {
  const report = summarizeHighUpsideScalpResearch(
    analyzed([
      candidate({
        symbol: "MEME",
        category: "meme-token",
        description: "Meme community cat dog culture token with viral posts and no product docs.",
        website: null,
        docsUrl: null,
        githubRepo: null,
        developerActivityScore: 0,
        developerAccelerationScore: 0,
        githubProScore: 0,
        ecosystemIntegrationScore: 0,
        tokenomicsScore: 0,
        narrativeHeatScore: 98,
        socialAccelerationScore: 94,
      }),
    ])
  );

  assert.equal(report.scalpReadyCount, 0);
  assert.equal(report.memeSpeculationExcluded[0].symbol, "MEME");
});
