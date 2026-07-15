import test from "node:test";
import assert from "node:assert/strict";

import {
  buildIntegrityStackReport,
} from "../src/reports/integrityStackReportEngine.js";
import { getEngineContracts } from "../src/kernel/engineContractManifest.js";

function provenProject(overrides = {}) {
  const evidence = getEngineContracts().map((contract) => ({
    engine: contract.id,
    source: contract.id,
    family: contract.phase,
    signal: `${contract.id} evidence`,
    score: 84,
    confidence: 0.84,
  }));

  return {
    name: "Integrity Alpha",
    symbol: "INTA",
    chain: "base",
    address: "0xintegrityalpha",
    pairAddress: "0xintegritypool",
    source: "native-discovery-mesh",
    discoverySources: ["native-discovery-mesh", "dexscreener", "github", "coingecko"],
    projectIdentity: { score: 90, evidence: ["address", "github", "domain"] },
    projectIdentityVerdict: "Identity Resolved",
    identityResolutionScore: 90,
    identityRiskScore: 4,
    sourceTruthScore: 86,
    sourceTruthVerdict: "Verified Source Stack",
    sourceTruth: { sources: [{ source: "dexscreener" }, { source: "github" }, { source: "coingecko" }] },
    liquidityUsd: 900000,
    activeLiquidityTruthScore: 84,
    organicBuyerScore: 80,
    buyerRetentionScore: 76,
    holderGrowthScore: 74,
    walletClusterScore: 78,
    walletClusterRiskScore: 8,
    smartWalletScore: 76,
    smartWalletArrivalScore: 74,
    smartMoneyAccumulationScore: 78,
    instantSafetyStatus: "PASS",
    instantSafetyScore: 92,
    instantSafetyRiskScore: 4,
    organicDemandFirewallStatus: "PASS",
    organicDemandFirewallScore: 86,
    organicDemandVerdict: "Organic Demand Confirmed",
    organicEconomicIntegrityScore: 84,
    economicIntegrityRiskScore: 8,
    githubRepo: "integrity/alpha",
    githubProScore: 78,
    developerActivityScore: 76,
    roadmap: "mainnet, native liquidity, integrations",
    roadmapProfitabilityScore: 76,
    roadmapCatalystVerdict: "bullish",
    roadmapMilestones: [{ title: "mainnet" }],
    catalystScore: 78,
    catalystCalendarScore: 74,
    narrativeScore: 77,
    narrativeForecastScore: 76,
    narrativeHeatScore: 73,
    nativeDiscoveryScore: 82,
    discoveryPriorityScore: 84,
    discoveryDecisionScore: 86,
    discoveryDecisionTier: "PASS",
    sniperEvidenceFamilySummary: { liquidity: { score: 82, evidence: ["usable liquidity"] } },
    sniperEvidenceConfidence: 86,
    sniperState: "ARMED",
    sniperQualified: true,
    sniperIntegrityScore: 88,
    sniperBlockingReasons: [],
    purchaseRouteConfirmed: true,
    executionTwinVerdict: "Route Verified",
    executionTwinScore: 84,
    alphaEvolutionGovernorScore: 86,
    alphaEvolutionGovernorVerdict: "Governor Promote",
    pipelineScore: 88,
    institutionalScore: 86,
    finalQualified: true,
    finalState: "PROMOTED",
    finalSelectionQualified: true,
    finalSelectionState: "QUALIFIED",
    finalContractAddress: "0xintegrityalpha",
    calibrationScore: 72,
    outcomeLearningScore: 70,
    riskScore: 6,
    trapRiskScore: 4,
    sellPressureScore: 16,
    evidence,
    ...overrides,
  };
}

function metaFixture() {
  return {
    discovery: {
      universeLedger: {
        savedProjects: 1,
        totals: {
          promoted: 1,
          researchOnly: 0,
          blocked: 0,
          targetMet: false,
          targetShortfall: 38999,
        },
      },
      sourceReports: {
        nativeDiscoveryMesh: {
          status: "SUCCESS",
          enabled: true,
          scannedTokens: 1,
        },
        dexscreener: {
          status: "SUCCESS",
          scannedTokens: 1,
        },
      },
    },
  };
}

test("integrity stack verifies the core institutional safety layers", () => {
  const report = buildIntegrityStackReport([provenProject()], metaFixture());
  const componentIds = report.components.map((component) => component.id);

  assert.equal(report.status, "PASS");
  assert.ok(report.readinessScore >= 90);
  assert.deepEqual(
    [
      "final-selection-integrity",
      "sniper-integrity-gate",
      "evidence-calibrated-kernel",
      "advanced-brain-kernel",
      "universe-ledger",
      "native-discovery-mesh",
      "provider-failure-tests",
      "symbol-collision-protection",
      "report-consistency-tests",
    ].every((id) => componentIds.includes(id)),
    true
  );
});

test("integrity stack catches unprotected report and selection contradictions", () => {
  const report = buildIntegrityStackReport(
    [
      provenProject({
        symbol: "BAD",
        finalSelectionState: "BLOCKED",
        finalSelectionQualified: true,
        aiDecision: "Reject",
      }),
    ],
    metaFixture()
  );

  assert.equal(report.status, "FAIL");
  assert.ok(report.components.some((component) => component.id === "final-selection-integrity" && component.status === "FAIL"));
  assert.ok(report.components.some((component) => component.id === "report-consistency-tests" && component.status === "FAIL"));
});

test("integrity stack reports symbol collision protection", () => {
  const report = buildIntegrityStackReport(
    [
      provenProject({ symbol: "SAME", chain: "base", address: "0xsamebase" }),
      provenProject({ symbol: "SAME", chain: "ethereum", address: "0xsameeth" }),
    ],
    metaFixture()
  );
  const component = report.components.find((item) => item.id === "symbol-collision-protection");

  assert.equal(component.status, "PASS");
  assert.equal(component.metrics.collisionSymbols, 1);
  assert.equal(component.metrics.protectedCollisions, 1);
});
