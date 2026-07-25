import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  analyzeCanonicalExecutionRoute,
  analyzeCanonicalExecutionRouteBatch,
} from "../src/engines/canonicalExecutionRouteEngine.js";
import { analyzeExecutionProofBatch } from "../src/engines/executionProofEngine.js";
import {
  analyzeSmallCapHunterBatch,
  summarizeSmallCapHunter,
} from "../src/engines/smallCapHunterEngine.js";
import { analyzeRouteAccessibilityBatch } from "../src/engines/routeAccessibilityEngine.js";
import {
  analyzeProofOfAlphaExecutionTwinBatch,
  summarizeProofOfAlphaExecutionTwin,
} from "../src/engines/proofOfAlphaExecutionTwinEngine.js";
import {
  analyzeOrganicDemandIntegrity,
  summarizeOrganicDemandIntegrity,
} from "../src/engines/organicDemandIntegrityEngine.js";
import {
  analyzeQuantumOutcomeField,
  normalizeScenarioCount,
} from "../src/engines/quantumOutcomeFieldEngine.js";
import { analyzeQuantumReasoningBrain } from "../src/engines/quantumReasoningBrainEngine.js";
import { summarizeQuantumSuiteHealth } from "../src/engines/quantumSuiteHealthEngine.js";
import { writeSmallCapHunterReport } from "../src/reports/smallCapHunterReportEngine.js";
import { writeProofOfAlphaExecutionTwinReport } from "../src/reports/proofOfAlphaExecutionTwinReportEngine.js";
import { writeOrganicDemandIntegrityReport } from "../src/reports/organicDemandIntegrityReportEngine.js";
import { writeQuantumFieldReport } from "../src/reports/quantumFieldReportEngine.js";
import { writeQuantumSuiteHealthReport } from "../src/reports/quantumSuiteHealthReportEngine.js";
import { writeProgressiveOpportunityReport } from "../src/reports/progressiveOpportunityReportEngine.js";
import { writeEngineDataReadinessReport } from "../src/reports/engineDataReadinessReportEngine.js";
import { writeCapitalMigrationReport } from "../src/reports/capitalMigrationReportEngine.js";
import { writeCapitalRotationReports } from "../src/reports/capitalRotationReportEngine.js";
import { writePipelineStageHealthReport } from "../src/reports/pipelineStageHealthReportEngine.js";
import { writeExactOutcomeLabReport } from "../src/reports/exactOutcomeLabReportEngine.js";
import { writeMathematicalValidationReport } from "../src/reports/mathematicalValidationReportEngine.js";
import { writeRouteAccessibilityReports } from "../src/reports/routeAccessibilityReportEngine.js";
import { writeAdvertisedCategoryCoverageReport } from "../src/reports/advertisedCategoryCoverageReportEngine.js";
import { writeCrawlerReports } from "../src/reports/webCrawlerReportEngine.js";
import { writeUtilityQualityReport } from "../src/reports/utilityQualityReportEngine.js";
import { writeHighUpsideScalpReport } from "../src/reports/highUpsideScalpReportEngine.js";
import { writeScalpMicrostructureReport } from "../src/reports/scalpMicrostructureReportEngine.js";
import { writeHottestTenNowReport } from "../src/reports/hottestTenNowReportEngine.js";
import { buildPipelineStageHealth } from "../src/kernel/pipelineReliabilityKernel.js";
import {
  REQUIRED_REPORT_FILES,
  validateReportContracts,
} from "../src/reports/reportContractValidator.js";
import { publishGithubPagesDashboard } from "../src/reports/githubPagesPublisher.js";
import { sanitizeReportValue } from "../src/reports/reportValueSanitizer.js";

const NOW = new Date().toISOString();
const CONTRACT_A = "0x1111111111111111111111111111111111111111";
const CONTRACT_B = "0x3333333333333333333333333333333333333333";
const PAIR_A = "0x2222222222222222222222222222222222222222";
const PAIR_B = "0x4444444444444444444444444444444444444444";

function finiteWalk(value, label = "value") {
  if (typeof value === "number") assert.equal(Number.isFinite(value), true, `${label} must be finite`);
  if (Array.isArray(value)) value.forEach((item, index) => finiteWalk(item, `${label}[${index}]`));
  if (value && typeof value === "object") {
    Object.entries(value).forEach(([key, nested]) => finiteWalk(nested, `${label}.${key}`));
  }
}

function project(overrides = {}) {
  return {
    name: "Repair Candidate",
    symbol: "RPC",
    chain: "base",
    source: "dexscreener",
    dex: "Uniswap",
    discoverySources: ["dexscreener", "geckoterminal"],
    contractAddress: CONTRACT_A,
    tokenAddress: CONTRACT_A,
    address: CONTRACT_A,
    pairAddress: PAIR_A,
    poolAddress: PAIR_A,
    quoteAsset: "USDC",
    routeUrl: `https://dexscreener.com/base/${PAIR_A}`,
    quoteTimestamp: NOW,
    liquidityUsd: 180_000,
    volume24h: 95_000,
    priceUsd: 0.05,
    marketCap: 7_500_000,
    contractVerified: true,
    identityVerified: true,
    projectIdentityVerdict: "Identity Resolved",
    finalIdentityState: "VERIFIED_CONTRACT",
    identityResolutionScore: 88,
    projectIdentityScore: 86,
    sourceTruthScore: 80,
    sourceReliabilityScore: 78,
    proofScore: 72,
    dataConfidenceScore: 74,
    githubProScore: 68,
    roadmapProfitabilityScore: 66,
    narrativeHeatScore: 73,
    narrativeForecastScore: 70,
    momentumShiftScore: 76,
    accelerationScore: 74,
    earlyBreakoutScore: 70,
    buyPressureScore: 72,
    capitalFlowScore: 68,
    smartWalletArrivalScore: 66,
    organicBuyerScore: 64,
    buyerRetentionScore: 62,
    activeLiquidityTruthScore: 78,
    liquidityScore: 76,
    confidenceAdjustedScore: 70,
    aiEcosystemScore: 66,
    alphaEvolutionGovernorScore: 64,
    breakoutBrainScore: 63,
    riskScore: 18,
    trapRiskScore: 12,
    sellPressureScore: 10,
    instantSafetyStatus: "PASS",
    executionRoute: {
      venue: "Uniswap",
      routeType: "DEX",
      chain: "base",
      buyRouteAvailable: true,
      sellRouteAvailable: true,
      buyQuoteVerified: true,
      sellQuoteVerified: true,
      tokenAddress: CONTRACT_A,
      contract: CONTRACT_A,
      poolAddress: PAIR_A,
      pairAddress: PAIR_A,
      routeUrl: `https://app.uniswap.org/swap?outputCurrency=${CONTRACT_A}`,
      quoteAsset: "USDC",
      quoteTimestamp: NOW,
      liquidityUsd: 180_000,
      estimatedRoundTripSlippagePct: 1.1,
      regionStatus: "CONFIRMED_AVAILABLE",
    },
    ...overrides,
  };
}

function routePipeline(projects) {
  return analyzeProofOfAlphaExecutionTwinBatch(
    analyzeSmallCapHunterBatch(
      analyzeRouteAccessibilityBatch(
        analyzeExecutionProofBatch(analyzeCanonicalExecutionRouteBatch(projects))
      )
    )
  );
}

function quantumProject(overrides = {}) {
  return analyzeQuantumReasoningBrain(
    analyzeQuantumOutcomeField(project(overrides), { scenarios: 64 })
  );
}

test("canonical execution route recognizes CEX, EVM DEX, and Solana venues", () => {
  const coinbase = analyzeCanonicalExecutionRoute({
    name: "Coinbase Asset",
    symbol: "CBA",
    source: "coinbase",
    exchange: "Coinbase",
    priceUsd: 1.25,
    marketPair: "CBA-USD",
    executionRoute: {
      venue: "Coinbase",
      routeType: "CEX",
      marketPair: "CBA-USD",
      buyRouteAvailable: true,
      sellRouteAvailable: true,
      buyQuoteVerified: true,
      sellQuoteVerified: true,
      quoteTimestamp: NOW,
    },
  });
  const uniswap = analyzeCanonicalExecutionRoute(project());
  const jupiter = analyzeCanonicalExecutionRoute({
    name: "Solana Asset",
    symbol: "SOLA",
    chain: "solana",
    dex: "Jupiter",
    tokenAddress: "So11111111111111111111111111111111111111112",
    poolAddress: "11111111111111111111111111111111",
    liquidityUsd: 125_000,
    priceUsd: 0.08,
    executionRoute: { venue: "Jupiter", buyRouteAvailable: true, sellRouteAvailable: true, buyQuoteVerified: true, sellQuoteVerified: true, quoteTimestamp: NOW },
  });
  const raydium = analyzeCanonicalExecutionRoute({
    name: "Raydium Asset",
    symbol: "RAYT",
    chain: "solana",
    dex: "Raydium",
    tokenAddress: "So11111111111111111111111111111111111111112",
    poolAddress: "11111111111111111111111111111111",
    liquidityUsd: 95_000,
    priceUsd: 0.04,
    executionRoute: { venue: "Raydium", buyRouteAvailable: true, sellRouteAvailable: true, buyQuoteVerified: true, sellQuoteVerified: true, quoteTimestamp: NOW },
  });

  assert.equal(coinbase.canonicalExecutionRoute.status, "VERIFIED");
  assert.equal(coinbase.canonicalExecutionRoute.routeType, "CEX");
  assert.equal(uniswap.canonicalExecutionRoute.status, "VERIFIED");
  assert.equal(uniswap.canonicalExecutionRoute.venue, "Uniswap");
  assert.equal(jupiter.canonicalExecutionRoute.venue, "Jupiter");
  assert.equal(jupiter.canonicalExecutionRoute.routeType, "AGGREGATOR");
  assert.equal(raydium.canonicalExecutionRoute.venue, "Raydium");
});

test("canonical execution route refuses research-seed pair IDs and token/pool collisions", () => {
  const syntheticPair = analyzeCanonicalExecutionRoute(
    project({
      pairAddress: "research-seed-pair-123",
      poolAddress: "research-seed-pool-123",
      executionRoute: {
        venue: "Uniswap",
        buyRouteAvailable: true,
        sellRouteAvailable: true,
        contract: CONTRACT_A,
        pairAddress: "research-seed-pair-123",
      },
    })
  );
  const collision = analyzeCanonicalExecutionRoute(
    project({
      pairAddress: CONTRACT_A,
      poolAddress: CONTRACT_A,
      executionRoute: {
        venue: "Uniswap",
        buyRouteAvailable: true,
        sellRouteAvailable: true,
        contract: CONTRACT_A,
        pairAddress: CONTRACT_A,
      },
    })
  );

  assert.equal(syntheticPair.canonicalExecutionRoute.pairAddress, null);
  assert.notEqual(syntheticPair.canonicalExecutionRoute.status, "VERIFIED");
  assert.equal(collision.canonicalExecutionRoute.pairAddress, null);
  assert.notEqual(collision.canonicalExecutionRoute.status, "VERIFIED");
  assert.ok(collision.canonicalExecutionRoute.failureReasons.some((reason) => reason.includes("identical")));
});

test("small-cap report returns top two research candidates without pretending routes are verified", () => {
  const routed = routePipeline([
    project({
      symbol: "R1",
      source: "research-seed",
      dex: "",
      contractAddress: null,
      tokenAddress: null,
      address: null,
      pairAddress: null,
      poolAddress: null,
      executionRoute: null,
    }),
    project({
      symbol: "R2",
      source: "google-news",
      dex: "",
      contractAddress: null,
      tokenAddress: null,
      address: null,
      pairAddress: null,
      poolAddress: null,
      executionRoute: null,
      marketCap: 12_000_000,
    }),
  ]);
  const report = summarizeSmallCapHunter(routed);

  assert.equal(report.topTwoResearch.length, 2);
  assert.equal(report.topTwo.length, 2);
  assert.equal(report.topTwoExecutionReady.length, 0);
  assert.deepEqual(report.topTwoResearch.map((item) => item.executionReady), [false, false]);
  assert.ok(report.topTwoResearch.every((item) => item.researchOnly));
  assert.ok(report.topTwoResearch.every((item) => item.routeStatus !== "VERIFIED"));
});

test("verified small-cap candidates appear in execution-ready output", () => {
  const routed = routePipeline([
    project({ symbol: "EXEC1" }),
    project({
      symbol: "EXEC2",
      contractAddress: CONTRACT_B,
      tokenAddress: CONTRACT_B,
      address: CONTRACT_B,
      pairAddress: PAIR_B,
      poolAddress: PAIR_B,
      executionRoute: {
        venue: "Uniswap",
        routeType: "DEX",
        chain: "base",
        buyRouteAvailable: true,
        sellRouteAvailable: true,
        buyQuoteVerified: true,
        sellQuoteVerified: true,
        tokenAddress: CONTRACT_B,
        contract: CONTRACT_B,
        poolAddress: PAIR_B,
        pairAddress: PAIR_B,
        routeUrl: `https://app.uniswap.org/swap?outputCurrency=${CONTRACT_B}`,
        quoteAsset: "USDC",
        quoteTimestamp: NOW,
        liquidityUsd: 180_000,
        estimatedRoundTripSlippagePct: 1.1,
        regionStatus: "CONFIRMED_AVAILABLE",
      },
    }),
  ]);
  const smallCap = summarizeSmallCapHunter(routed);
  const executionTwin = summarizeProofOfAlphaExecutionTwin(routed);

  assert.equal(smallCap.topTwoExecutionReady.length, 2);
  assert.ok(smallCap.topTwoExecutionReady.every((item) => item.executionReady));
  assert.ok(smallCap.topTwoExecutionReady.every((item) => item.routeStatus === "VERIFIED"));
  assert.ok(executionTwin.verifiedCount >= 1);
  assert.ok(Array.isArray(executionTwin.topExecutionResearchCandidates));
  assert.ok(executionTwin.reasonSummary.topReason);
});

test("execution twin returns research candidates when no route is verified", () => {
  const routed = routePipeline([
    project({
      symbol: "NOROUTE",
      source: "research-seed",
      dex: "",
      contractAddress: null,
      tokenAddress: null,
      address: null,
      pairAddress: null,
      poolAddress: null,
      executionRoute: null,
    }),
  ]);
  const report = summarizeProofOfAlphaExecutionTwin(routed);

  assert.equal(report.verifiedCount, 0);
  assert.equal(report.topVerifiedExecutions.length, 0);
  assert.ok(report.noRouteCount >= 1);
  assert.equal(report.topExecutionResearchCandidates[0].verdict, "RESEARCH_ONLY_ROUTE_UNVERIFIED");
  assert.ok(report.reasonSummary.topReason.includes("route-unverified"));
});

test("pipeline funnels proof and execution data into AI, final integrity, and ranking", () => {
  const source = fs.readFileSync(path.resolve("src/intelligencePipeline.js"), "utf8");
  const canonical = source.indexOf('runEngine("Canonical Execution Route"');
  const proof = source.indexOf('runEngine("Execution Proof"');
  const accessibility = source.indexOf('runEngine("Route Accessibility"');
  const observation = source.indexOf('runEngine("Capital Flow Observation"');
  const baseline = source.indexOf('runEngine("Capital Flow Baseline"');
  const migration = source.indexOf('runEngine("Capital Migration Core"');
  const smallCap = source.indexOf('runEngine("Small Cap Hunter"');
  const twin = source.indexOf('runEngine("Proof of Alpha Execution Twin"');
  const council = source.indexOf('runEngine("AI Ecosystem Council"');
  const breakout = source.indexOf('runEngine("Breakout Brain"');
  const governor = source.indexOf('runEngine("Alpha Evolution Governor"');
  const finalIntegrity = source.indexOf('runEngine("Final Selection Integrity"');
  const preBreakout = source.indexOf('runEngine("Pre-Breakout Radar"');
  const progressiveRanking = source.indexOf('runEngine("Progressive Opportunity Ranking"');
  const smallCapRuns = source.match(/runEngine\("Small Cap Hunter"/g) || [];
  const executionTwinRuns = source.match(/runEngine\("Proof of Alpha Execution Twin"/g) || [];

  assert.ok(canonical > -1);
  assert.ok(proof > canonical);
  assert.ok(accessibility > proof);
  assert.ok(observation > accessibility);
  assert.ok(baseline > observation);
  assert.ok(migration > baseline);
  assert.ok(council > proof);
  assert.ok(breakout > council);
  assert.ok(smallCap > breakout);
  assert.ok(twin > smallCap);
  assert.ok(governor > twin);
  assert.equal(smallCapRuns.length, 1);
  assert.equal(executionTwinRuns.length, 1);
  assert.ok(finalIntegrity > governor);
  assert.ok(preBreakout > finalIntegrity);
  assert.ok(progressiveRanking > preBreakout);
});

test("organic report uses explicit zeroes and opens missing-input research tasks", () => {
  const analyzed = analyzeOrganicDemandIntegrity({
    name: "Thin Organic Inputs",
    symbol: "TOI",
    chain: "base",
    liquidityUsd: 0,
    volume24h: 0,
  });
  const report = summarizeOrganicDemandIntegrity([analyzed]);

  assert.equal(report.institutionalBlocks, 0);
  assert.equal(report.confirmedOrganicDemand, 0);
  assert.equal(report.tradableAnomalies, 0);
  assert.equal(report.verificationRequired, 0);
  assert.equal(typeof report.manualReviewRequired, "number");
  assert.equal(typeof report.openResearchTasks, "number");
  assert.ok(report.organicInputCoveragePct >= 0);
  assert.ok(report.missingInputFamilies.includes("holders"));
  assert.ok(analyzed.economicIntegrityResearchTasks.some((task) => task.id === "collect-holders"));
});

test("quantum suite values are finite, probabilities sum to 100, and simulations are deterministic", () => {
  assert.equal(normalizeScenarioCount(0), 2048);
  assert.equal(normalizeScenarioCount(-5), 2048);
  assert.equal(normalizeScenarioCount("bad"), 2048);

  const first = quantumProject({ symbol: "QNT" });
  const second = quantumProject({ symbol: "QNT" });
  const total = Object.values(first.quantumReasoningBrain.probabilities).reduce((sum, value) => sum + value, 0);
  const health = summarizeQuantumSuiteHealth([first]);

  assert.equal(JSON.stringify(first.quantumOutcomeField), JSON.stringify(second.quantumOutcomeField));
  assert.equal(total, 100);
  assert.equal(health.status, "PASS");
  assert.equal(health.deterministicChecks[0].status, "PASS");
  finiteWalk(first.quantumOutcomeField, "quantumOutcomeField");
  finiteWalk(first.quantumReasoningBrain, "quantumReasoningBrain");
});

test("mandatory report contracts are generated and validate", () => {
  const processed = routePipeline([quantumProject({ symbol: "GEN" })]);
  const organic = processed.map(analyzeOrganicDemandIntegrity);

  writeSmallCapHunterReport(processed);
  writeProofOfAlphaExecutionTwinReport(processed);
  writeOrganicDemandIntegrityReport(organic);
  writeQuantumFieldReport(processed);
  writeQuantumSuiteHealthReport(processed);
  writeProgressiveOpportunityReport(processed);
  writeEngineDataReadinessReport(processed);
  writeCapitalMigrationReport(processed);
  writeCapitalRotationReports(processed);
  writePipelineStageHealthReport(processed);
  writeExactOutcomeLabReport(processed, { observations: [] });
  writeMathematicalValidationReport();
  writeRouteAccessibilityReports(processed);
  writeAdvertisedCategoryCoverageReport(processed);
  writeCrawlerReports(processed);
  writeUtilityQualityReport(processed);
  writeHighUpsideScalpReport(processed);
  writeScalpMicrostructureReport(processed);
  writeHottestTenNowReport(processed);

  for (const fileName of REQUIRED_REPORT_FILES) {
    assert.equal(fs.existsSync(path.resolve("reports", fileName)), true, `${fileName} should exist`);
  }
  assert.equal(validateReportContracts().status, "PASS");
});

test("pipeline stage health aggregates progressive stage engine records across projects", () => {
  const engineRecord = (engineName, status = "SUCCESS") => ({
    engineName,
    status,
    criticality: "REQUIRED",
    durationMs: 5,
  });
  const broadProject = project({
    symbol: "BROAD",
    engineResults: {
      projectIdentityGraph: engineRecord("Project Identity Graph"),
      instantSafetyGate: engineRecord("Instant Safety Gate"),
    },
  });
  const stagedProject = project({
    symbol: "STAGE",
    canonicalExecutionRoute: { venue: "Uniswap", routeStatus: "VERIFIED" },
    canonicalExecutionRouteStatus: "VERIFIED",
    executionProof: { status: "VERIFIED" },
    executionStatus: "VERIFIED",
    researchEligible: true,
    capitalFlowBaseline: { status: "OBSERVED" },
    capitalMigrationScore: 42,
    finalSelectionState: "BLOCKED",
    finalSelectionQualified: false,
    engineResults: {
      canonicalExecutionRoute: engineRecord("Canonical Execution Route"),
      executionProof: engineRecord("Execution Proof"),
      routeAccessibility: engineRecord("Route Accessibility"),
      capitalFlowBaseline: engineRecord("Capital Flow Baseline"),
      capitalMigrationCore: engineRecord("Capital Migration Core"),
      finalSelectionIntegrity: engineRecord("Final Selection Integrity"),
    },
  });

  const health = buildPipelineStageHealth([broadProject, stagedProject]);
  const byName = new Map(health.stages.map((stage) => [stage.engineName, stage]));

  assert.equal(byName.get("Canonical Execution Route").engineStatus, "PASS");
  assert.equal(byName.get("Canonical Execution Route").projectsProcessed, 1);
  assert.equal(byName.get("Execution Proof").engineStatus, "PASS");
  assert.equal(byName.get("Capital Migration Core").engineStatus, "PASS");
  assert.equal(health.skippedMandatoryStages.includes("Canonical Execution Route"), false);
});

test("report contract validator rejects non-finite report values", () => {
  const reportsDir = fs.mkdtempSync(path.join(os.tmpdir(), "cli-report-contract-"));

  for (const fileName of REQUIRED_REPORT_FILES) {
    fs.writeFileSync(path.join(reportsDir, fileName), JSON.stringify({ ok: true }));
  }
  assert.equal(validateReportContracts({ reportsDir }).status, "PASS");

  fs.writeFileSync(path.join(reportsDir, REQUIRED_REPORT_FILES[0]), JSON.stringify({ score: "NaN" }));
  const failed = validateReportContracts({ reportsDir });
  assert.equal(failed.status, "FAIL");
  assert.ok(failed.errors.some((error) => error.includes("non-finite")));
});

test("report sanitizer removes provider placeholder strings before public validation", () => {
  const sanitized = sanitizeReportValue({
    name: "N/A",
    symbol: "NaN",
    nested: [{ value: "Infinity" }, { value: "-Infinity" }],
  });

  assert.equal(sanitized.name, "Unknown");
  assert.equal(sanitized.symbol, "UNKNOWN");
  assert.equal(sanitized.nested[0].value, "Unknown");
  assert.equal(sanitized.nested[1].value, "Unknown");
});

test("public dashboard validates reports and contains no literal N/A", () => {
  const reportsDir = fs.mkdtempSync(path.join(os.tmpdir(), "cli-dashboard-reports-"));
  const docsDir = fs.mkdtempSync(path.join(os.tmpdir(), "cli-dashboard-docs-"));

  const fixtures = {
    "small-cap-hunter.json": {
      huntedProjects: 2,
      selectedCount: 2,
      executionReadyCount: 0,
      topTwoResearch: [
        { symbol: "R1", routeStatus: "NO_ROUTE" },
        { symbol: "R2", routeStatus: "NO_ROUTE" },
      ],
      topTwoExecutionReady: [],
    },
    "proof-of-alpha-execution-twin.json": {
      twinProjects: 2,
      verifiedCount: 0,
      partiallyVerifiedCount: 0,
      providerUnavailableCount: 0,
      noRouteCount: 2,
      topVerifiedExecutions: [],
      topExecutionResearchCandidates: [{ symbol: "R1", routeStatus: "NO_ROUTE" }],
      reasonSummary: { topReason: "No execution-verified routes were available; research candidates are route-unverified." },
    },
    "organic-demand-integrity.json": {
      analyzedProjects: 2,
      institutionalBlocks: 0,
      confirmedOrganicDemand: 0,
      tradableAnomalies: 0,
      verificationRequired: 0,
      manualReviewRequired: 2,
      openResearchTasks: 6,
      organicInputCoveragePct: 25,
      missingInputFamilies: ["holders"],
    },
    "quantum-field.json": {
      totalProjects: 2,
      projectedProjects: 2,
      topFields: [{ name: "N/A", symbol: "NaN", chain: "base" }],
    },
    "quantum-reasoning-brain.json": {
      totalProjects: 2,
      reasoningBrainsCompleted: 2,
      topQuantumReasoningStates: [{ name: "NaN", symbol: "N/A", chain: "base" }],
    },
    "quantum-suite-health.json": {
      status: "PASS",
      projectsExpected: 2,
      outcomeFieldsCompleted: 2,
      reasoningBrainsCompleted: 2,
      averageInputCoverage: 100,
      topQuantumReasoningStates: [],
    },
    "debug-execution-proof.json": { stageMetadata: { attemptedCandidates: 2, verifiedCandidates: 0 } },
    "debug-stage-health.json": { stageStatus: "COMPLETE", executionChecksVerified: 0, providerFailures: 0 },
    "report.json": { totalProjects: 2, projects: [] },
    "engine-audit.json": { auditName: "Engine Implementation Completeness Audit", totalEngines: 144 },
    "engine-data-readiness.json": {
      averageCoverage: 65,
      coreReady: 1,
      coreDataStarved: 1,
      topMissingInputs: [{ fields: "contractAddress or tokenAddress", count: 2 }],
      mostReadyProjects: [{ name: "N/A", symbol: "NaN", score: 50 }],
    },
    "route-universe.json": {
      status: "OK",
      routeCount: 2,
      executionReadyCount: 1,
      userAccessibleCount: 1,
      researchEligibleCount: 2,
      routes: [],
      prohibitedOutputs: ["NOT ON COINBASE = REJECTED", "NOT ON METAMASK = REJECTED"],
    },
    "alternative-execution-routes.json": {
      status: "OK",
      routeCount: 2,
      executionReadyCount: 1,
      userAccessibleCount: 1,
      researchEligibleCount: 2,
      routes: [],
      prohibitedOutputs: ["NOT ON COINBASE = REJECTED", "NOT ON METAMASK = REJECTED"],
    },
    "user-accessibility-ranking.json": {
      status: "OK",
      routeCount: 2,
      executionReadyCount: 1,
      userAccessibleCount: 1,
      researchEligibleCount: 2,
      topProjectsByOpportunity: [{ symbol: "R1", opportunityRank: 1, accessibilityRank: 2 }],
      topProjectsByUserAccessibility: [{ symbol: "R2", opportunityRank: 2, accessibilityRank: 1 }],
      prohibitedOutputs: ["NOT ON COINBASE = REJECTED", "NOT ON METAMASK = REJECTED"],
    },
    "venue-coverage-health.json": {
      status: "OK",
      routeCount: 2,
      executionReadyCount: 1,
      userAccessibleCount: 1,
      researchEligibleCount: 2,
      venueCoverageHealth: [{ venue: "Uniswap", routes: 1, verifiedRoutes: 1, executionReadyRoutes: 1, regionRestricted: 0 }],
      prohibitedOutputs: ["NOT ON COINBASE = REJECTED", "NOT ON METAMASK = REJECTED"],
    },
    "capital-migration-core.json": {
      status: "OK",
      counts: { confirmedEarlyFlow: 0, earlyFlowResearch: 1 },
      topCandidates: [{ symbol: "R1", lane: "EARLY_FLOW_RESEARCH", score: 48 }],
    },
    "chain-capital-rotation.json": {
      projectsAnalyzed: 2,
      topChainReceivingCapital: { chain: "base", netFlowUsd: 1200 },
      chainRotation: [],
    },
    "narrative-capital-rotation.json": {
      projectsAnalyzed: 2,
      topNarrativeReceivingCapital: { narrative: "ai", netFlowUsd: 1200 },
      narrativeRotation: [],
    },
    "market-cap-rotation.json": {
      projectsAnalyzed: 2,
      fastestImprovingMarketCapBucket: { marketCapBucket: "micro-cap", netFlowUsd: 1200 },
      marketCapRotation: [],
    },
    "capital-outflow-watch.json": {
      projectsAnalyzed: 2,
      outflowWatch: [],
      reason: "NO_CAPITAL_OUTFLOW_DETECTED",
    },
    "pipeline-stage-health.json": {
      status: "PASS",
      mandatoryStageFailures: 0,
      skippedMandatoryStages: [],
      stages: [],
    },
    "mathematical-validation.json": {
      status: "PASS_WITH_LIMITATIONS",
      warnings: [],
      uncalibratedOutputs: [],
    },
    "exact-outcome-horizon-lab.json": {
      status: "INSUFFICIENT_SAMPLE",
      sampleState: "INSUFFICIENT_SAMPLE",
      predictionsEvaluated: 0,
    },
    "institutional-ranking.json": {
      counts: { moneyRanked: 0, executionReady: 0 },
      institutionalMoneyRank: [],
    },
    "high-upside-scalp-research.json": {
      status: "PASS",
      mode: "HIGH_UPSIDE_SCALP_RESEARCH",
      disclaimer: "Research output only. Not financial advice, not a buy/sell recommendation, and not a profit guarantee.",
      projectsAnalyzed: 2,
      scalpReadyCount: 1,
      highUpsideWatchCount: 1,
      lateChaseRejectedCount: 1,
      memeSpeculationExcludedCount: 0,
      topScalpResearchCandidates: [
        {
          rank: 1,
          symbol: "UTIL",
          chain: "base",
          lane: "SCALP_READY_RESEARCH",
          highUpsideScalpScore: 82,
          priceUsd: 0.0042,
          priceChange24hPct: 18,
          priceChange7dPct: 64,
          liquidityUsd: 120000,
          routeReady: true,
        },
      ],
      highUpsideWatchlist: [
        {
          rank: 1,
          symbol: "WATCH",
          chain: "solana",
          lane: "HIGH_UPSIDE_WATCH",
          highUpsideScalpScore: 68,
          priceUsd: 0.0065,
          priceChange24hPct: 9,
          priceChange7dPct: 42,
          liquidityUsd: 84000,
          routeReady: false,
        },
      ],
    },
    "scalp-microstructure.json": {
      status: "PASS",
      mode: "SCALP_MICROSTRUCTURE_RESEARCH",
      projectsAnalyzed: 2,
      actionableResearchCount: 1,
      watchlistCount: 1,
      noTradeCount: 1,
      topScalpMicrostructureResearch: [
        {
          rank: 1,
          symbol: "UTIL",
          chain: "base",
          scalpMicrostructureLane: "SCALP_ACTIONABLE_RESEARCH",
          scalpMicrostructureScore: 84,
          scalpEstimatedTotalCostPct: 1.7,
          scalpTradeSizeUsd: 100,
          scalpLiquidityUsd: 120000,
          buyRouteAvailable: true,
          sellRouteAvailable: true,
        },
      ],
      scalpWatchlist: [],
      noTradeLanes: [
        {
          rank: 1,
          symbol: "LATE",
          chain: "base",
          scalpMicrostructureLane: "SCALP_NO_TRADE_LATE_CHASE",
          scalpMicrostructureScore: 20,
          blockers: ["SCALP_LATE_CHASE_OR_ALREADY_EXTENDED"],
        },
      ],
    },
    "hottest-ten-now.json": {
      status: "PASS",
      mode: "ALWAYS_HIGH_UPSIDE_CURRENT_MOMENT",
      disclaimer: "Research output only. Not financial advice, not a buy/sell recommendation, and not a profit guarantee.",
      projectsAnalyzed: 2,
      targetCount: 10,
      qualifiedNowCount: 1,
      returnedCount: 1,
      shortfallToTen: 9,
      notForced: true,
      topTenHighestRatedNow: [
        {
          rank: 1,
          symbol: "UTIL",
          chain: "base",
          lane: "CURRENT_HIGH_UPSIDE_RESEARCH",
          hottestTenNowScore: 86,
          priceUsd: 0.0042,
          priceChange24hPct: 18,
          priceChange7dPct: 64,
          liquidityUsd: 120000,
          buySellRouteVerified: true,
        },
      ],
      watchlistNeedsMoreConfirmation: [],
      rejectedOrNotCurrent: [],
    },
  };

  for (const [fileName, value] of Object.entries(fixtures)) {
    fs.writeFileSync(path.join(reportsDir, fileName), JSON.stringify(value, null, 2));
  }

  const result = publishGithubPagesDashboard({ reportsDir, docsDir });
  const html = fs.readFileSync(path.join(docsDir, "index.html"), "utf8");
  const quantumField = JSON.parse(fs.readFileSync(path.join(docsDir, "quantum-field.json"), "utf8"));
  const quantumReasoning = JSON.parse(fs.readFileSync(path.join(docsDir, "quantum-reasoning-brain.json"), "utf8"));

  assert.equal(result.validation.status, "PASS");
  assert.equal(html.includes("N/A"), false);
  assert.equal(quantumField.topFields[0].name, "Unknown");
  assert.equal(quantumField.topFields[0].symbol, "UNKNOWN");
  assert.equal(quantumReasoning.topQuantumReasoningStates[0].name, "Unknown");
  assert.equal(quantumReasoning.topQuantumReasoningStates[0].symbol, "UNKNOWN");
  assert.ok(html.includes("Top 10 Current Research Board"));
  assert.ok(html.includes("Top 10 Current Research"));
  assert.ok(html.includes("Scan Truth"));
  assert.ok(html.includes("Need Confirmation"));
  assert.ok(html.includes("UTIL"));
  assert.equal(html.includes("<iframe"), false);
  assert.ok(result.copiedFiles.includes("high-upside-scalp-research.json"));
  assert.ok(result.copiedFiles.includes("scalp-microstructure.json"));
  assert.ok(result.copiedFiles.includes("hottest-ten-now.json"));
  assert.equal(fs.existsSync(path.join(docsDir, "high-upside-scalp-research.json")), true);
  assert.equal(fs.existsSync(path.join(docsDir, "scalp-microstructure.json")), true);
  assert.equal(fs.existsSync(path.join(docsDir, "hottest-ten-now.json")), true);
});
