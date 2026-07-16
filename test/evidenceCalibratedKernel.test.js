import test from "node:test";
import assert from "node:assert/strict";

import {
  analyzeEvidenceCalibratedKernel,
  analyzeEvidenceCalibratedProject,
  auditProjectContracts,
  buildAdvancedBrainKernel,
  buildEvidenceLedger,
  buildSourceHealthKernel,
  runKernelFixtureAudit,
} from "../src/kernel/evidenceCalibratedKernel.js";
import { getEngineContracts } from "../src/kernel/engineContractManifest.js";
import {
  buildInstitutionalDataProvenanceLedger,
  summarizeInstitutionalDataProvenance,
} from "../src/kernel/institutionalDataProvenanceLedger.js";

const FIXTURE_NOW = new Date().toISOString();

function strongProject() {
  const evidence = getEngineContracts().map((contract) => ({
    engine: contract.id,
    source: contract.id,
    family: contract.phase,
    signal: `${contract.id} contract evidence`,
    score: 82,
    confidence: 0.82,
  }));

  return {
    name: "Kernel Alpha",
    symbol: "KALPHA",
    chain: "base",
    address: "0xkernelalpha",
    pairAddress: "0xkernelpair",
    source: "dexscreener",
    discoverySources: ["dexscreener", "github", "coingecko", "base-rpc"],
    discoveredAt: FIXTURE_NOW,
    projectIdentity: { score: 88, evidence: ["address", "github", "domain"] },
    projectIdentityVerdict: "Identity Resolved",
    identityResolutionScore: 88,
    identityRiskScore: 5,
    sourceTruthScore: 84,
    sourceTruthVerdict: "Verified Source Stack",
    sourceTruth: { sources: [{ source: "dexscreener" }, { source: "github" }, { source: "coingecko" }] },
    liquidityUsd: 900000,
    volume24h: 180000,
    marketCap: 42000000,
    fdv: 52000000,
    circulatingSupply: 420000000,
    totalSupply: 520000000,
    valuationSources: [
      { source: "dexscreener", type: "marketCap", value: 42000000 },
      { source: "coingecko", type: "marketCap", value: 43000000 },
      { source: "geckoterminal", type: "fdv", value: 52000000 },
    ],
    activeLiquidityTruthScore: 82,
    activeLiquidityTruthVerdict: "Usable Exit Liquidity Confirmed",
    organicBuyerScore: 78,
    organicBuyerVerdict: "First Real Buyers Confirmed",
    buyerRetentionScore: 72,
    holderGrowthScore: 70,
    walletClusterScore: 74,
    walletClusterRiskScore: 10,
    walletClusterVerdict: "Clean Wallet Cluster",
    smartWalletScore: 74,
    smartWalletArrivalScore: 72,
    smartMoneyAccumulationScore: 76,
    instantSafetyStatus: "PASS",
    instantSafetyScore: 90,
    instantSafetyRiskScore: 4,
    organicDemandFirewallStatus: "PASS",
    organicDemandFirewallScore: 84,
    organicDemandVerdict: "Organic Demand Confirmed",
    organicEconomicIntegrityScore: 82,
    economicIntegrityRiskScore: 8,
    githubRepo: "kernel/alpha",
    githubProScore: 76,
    githubProVerdict: "Healthy Builder Signal",
    developerActivityScore: 75,
    roadmap: "mainnet, integrations, liquidity expansion",
    description: "Infrastructure project with verified roadmap",
    roadmapProfitabilityScore: 74,
    roadmapCatalystVerdict: "bullish",
    roadmapMilestones: [{ title: "mainnet" }, { title: "integration" }],
    catalystScore: 75,
    catalystCalendarScore: 70,
    liveCatalystRadarScore: 72,
    narrativeScore: 75,
    narrativeForecastScore: 74,
    narrativeHeatScore: 70,
    discoveryPriorityScore: 82,
    discoveryDecisionScore: 84,
    discoveryDecisionTier: "PASS",
    sniperEvidenceFamilySummary: { liquidity: { score: 82, evidence: ["usable liquidity"] } },
    sniperEvidenceConfidence: 84,
    sniperState: "ARMED",
    sniperIntegrityScore: 86,
    sniperIntegrityBlockers: [],
    purchaseRouteConfirmed: true,
    executionTwinVerdict: "Route Verified",
    executionTwinScore: 82,
    executionRoute: "MetaMask",
    progressiveOpportunityScore: 86,
    trustScore: 84,
    executionScore: 80,
    moneyRankScore: 83,
    moneyRankEligible: true,
    opportunityEvidenceCoverage: 88,
    opportunityRankingTier: "SNIPER_READY",
    bestAvailableEligible: true,
    missingEvidence: [],
    alphaEvolutionGovernorScore: 84,
    alphaEvolutionGovernorVerdict: "Governor Promote",
    pipelineScore: 86,
    institutionalScore: 85,
    finalQualified: true,
    finalState: "PROMOTED",
    calibrationScore: 70,
    outcomeLearningScore: 68,
    riskScore: 8,
    trapRiskScore: 4,
    sellPressureScore: 18,
    evidence,
  };
}

test("evidence ledger measures coverage and independent sources", () => {
  const ledger = buildEvidenceLedger(strongProject());

  assert.ok(ledger.evidenceCount >= getEngineContracts().length);
  assert.ok(ledger.uniqueSourceCount >= 5);
  assert.ok(ledger.confirmedFamilies >= 8);
  assert.ok(ledger.evidenceCoverage >= 70);
});

test("institutional provenance ledger scores clean source lineage", () => {
  const provenance = buildInstitutionalDataProvenanceLedger(strongProject(), {
    now: "2026-07-15T01:00:00.000Z",
  });
  const summary = summarizeInstitutionalDataProvenance([strongProject()], {
    now: "2026-07-15T01:00:00.000Z",
  });

  assert.ok(provenance.score >= 75);
  assert.ok(["INSTITUTIONAL_READY", "REVIEW_READY"].includes(provenance.institutionalReadiness));
  assert.ok(provenance.components.sourceAgreement >= 70);
  assert.ok(provenance.sourceSummary.sourceCount >= 3);
  assert.equal(summary.totalProjects, 1);
  assert.ok(summary.averageProvenanceScore >= 75);
});

test("institutional provenance ledger blocks severe source disagreement", () => {
  const conflicted = {
    ...strongProject(),
    symbol: "DISAGREE",
    marketCap: 42000000,
    fdv: 9000000000,
    circulatingSupply: 420000000,
    coinGeckoTotalSupply: 150000,
    valuationSources: [
      { source: "dexscreener", type: "marketCap", value: 42000000 },
      { source: "coingecko", type: "marketCap", value: 320000 },
      { source: "geckoterminal", type: "fdv", value: 9000000000 },
    ],
  };
  const provenance = buildInstitutionalDataProvenanceLedger(conflicted, {
    now: "2026-07-15T01:00:00.000Z",
  });

  assert.equal(provenance.institutionalReadiness, "BLOCKED");
  assert.ok(provenance.components.sourceAgreement < 50);
  assert.ok(provenance.blockers.some((blocker) => /disagreement/i.test(blocker)));
});

test("engine contract audit passes fully evidenced project", () => {
  const audit = auditProjectContracts(strongProject());

  assert.equal(audit.contractFail, 0);
  assert.equal(audit.outputMissing, 0);
  assert.ok(audit.contractPassRate >= 80);
});

test("evidence-calibrated kernel can arm a fully proven setup", () => {
  const analyzed = analyzeEvidenceCalibratedProject(strongProject());

  assert.equal(analyzed.decision.finalDecision, "ARMED");
  assert.equal(analyzed.decision.brainDecision, "ARMED");
  assert.ok(analyzed.advancedBrain.brainScore >= 80);
  assert.ok(analyzed.advancedBrain.metacognition.canPromote);
  assert.ok(analyzed.scoring.finalScore >= 80);
  assert.ok(analyzed.provenance.score >= 75);
  assert.ok(analyzed.scoring.multipliers.provenance >= 1);
  assert.equal(analyzed.decision.promotionRequirements.length, 0);
});

test("evidence-calibrated kernel blocks high raw score with critical safety risk", () => {
  const trap = {
    ...strongProject(),
    name: "Kernel Trap",
    symbol: "KTRAP",
    instantSafetyStatus: "CRITICAL",
    instantSafetyRiskScore: 94,
    walletClusterRiskScore: 88,
    washTradingRiskScore: 86,
    riskScore: 92,
    sourceTruthScore: 25,
    evidence: [{ engine: "hype", source: "social", family: "narrative", signal: "viral", score: 91 }],
  };
  const analyzed = analyzeEvidenceCalibratedProject(trap);

  assert.equal(analyzed.decision.finalDecision, "BLOCKED");
  assert.equal(analyzed.decision.brainDecision, "BLOCKED");
  assert.ok(analyzed.advancedBrain.contradictionMap.maxSeverity >= 75);
  assert.ok(analyzed.decision.blockers.some((blocker) => /safety|risk|wallet/i.test(blocker)));
  assert.ok(analyzed.scoring.finalScore < analyzed.scoring.rawSignalScore);
});

test("advanced brain demotes narrative heat without market proof", () => {
  const hype = {
    ...strongProject(),
    name: "Narrative Mirage",
    symbol: "MIRAGE",
    liquidityUsd: 16000,
    activeLiquidityTruthScore: 12,
    organicBuyerScore: 10,
    sourceTruthScore: 24,
    narrativeScore: 96,
    narrativeForecastScore: 94,
    narrativeHeatScore: 96,
    xSocialScore: 92,
    pipelineScore: 91,
    evidence: [
      {
        engine: "narrative",
        source: "x-social",
        family: "narrative",
        signal: "viral narrative",
        score: 96,
        confidence: 0.72,
      },
    ],
  };
  const analyzed = analyzeEvidenceCalibratedProject(hype);

  assert.ok(analyzed.advancedBrain.contradictionMap.contradictions.some((item) => item.type === "NARRATIVE_WITHOUT_MARKET_PROOF"));
  assert.equal(analyzed.advancedBrain.regime, "THIN_LIQUIDITY_HYPE");
  assert.notEqual(analyzed.decision.brainDecision, "ARMED");
});

test("advanced brain exposes confidence bands and pressure model", () => {
  const analyzed = analyzeEvidenceCalibratedProject(strongProject());
  const rebuilt = buildAdvancedBrainKernel(
    strongProject(),
    analyzed.scoring,
    analyzed.ledger,
    {
      ...analyzed.contractAudit,
      finalDecisionWarnings: [],
      blockingFailures: [],
    },
    analyzed.decision
  );

  assert.ok(rebuilt.confidenceBand.low <= analyzed.scoring.finalScore);
  assert.ok(rebuilt.confidenceBand.high >= analyzed.scoring.finalScore);
  assert.ok(rebuilt.pressure.promotionPressure > rebuilt.pressure.demotionPressure);
  assert.ok(rebuilt.metacognition.strongestSupport.length > 0);
});

test("source health kernel summarizes provider attempts and usable evidence", () => {
  const analyzed = analyzeEvidenceCalibratedProject(strongProject());
  const sourceHealth = buildSourceHealthKernel([analyzed], {
    discovery: {
      sourceReports: {
        dexscreener: { status: "SUCCESS", scannedTokens: 12, durationMs: 100 },
        coingecko: { status: "FAILED", error: "429 rate limit" },
        birdeye: { status: "SKIPPED", error: "missing BIRDEYE_API_KEY" },
      },
    },
  });

  assert.ok(sourceHealth.sourcesConfigured > 0);
  assert.equal(sourceHealth.sourcesSucceeded, 1);
  assert.equal(sourceHealth.sourcesRateLimited, 1);
  assert.ok(sourceHealth.sourcesWithUsableEvidence >= 1);
});

test("kernel report includes manifest audit, fixture audit, and learning loop", () => {
  const report = analyzeEvidenceCalibratedKernel([strongProject()], {
    discovery: {
      sourceReports: {
        dexscreener: { status: "SUCCESS", scannedTokens: 1 },
      },
    },
  });
  const fixtureAudit = runKernelFixtureAudit();

  assert.equal(report.engineManifestAudit.status, "PASS");
  assert.equal(report.fixtureAudit.failed.length, 0);
  assert.equal(fixtureAudit.failed.length, 0);
  assert.ok(report.learningLoop.tracks.includes("maxUpside7d"));
  assert.equal(report.summary.brain.armed, 1);
  assert.ok(report.summary.brain.averageBrainScore >= 80);
  assert.ok(report.summary.averageProvenanceScore >= 75);
  assert.ok(report.topDecisions[0].provenance.score >= 75);
});
