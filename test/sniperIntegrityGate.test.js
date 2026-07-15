import test from "node:test";
import assert from "node:assert/strict";

import { analyzeSniperEvidenceFamilies } from "../src/engines/sniperEvidenceFamilyEngine.js";
import { analyzeSniperIntegrityGate, analyzeSniperIntegrityGateBatch } from "../src/engines/sniperIntegrityGateEngine.js";
import { analyzeSniperLifecycleState } from "../src/engines/sniperLifecycleStateEngine.js";
import { createSniperOutcomeLabels } from "../src/engines/sniperOutcomeLabelEngine.js";
import { analyzeSniperPointInTime, validatePointInTimeObservation } from "../src/engines/sniperPointInTimeEngine.js";
import { buildSniperReport } from "../src/reports/sniperReportEngine.js";
import { writeHtmlReport } from "../src/reports/htmlReportEngine.js";
import { writeJsonReport } from "../src/reports/jsonReportEngine.js";

function baseProject(overrides = {}) {
  return {
    name: "Sniper Alpha",
    symbol: "SNA",
    chain: "base",
    chainId: "base",
    contractAddress: "0x0000000000000000000000000000000000000a11",
    pairAddress: "0x0000000000000000000000000000000000000b11",
    priceUsd: 0.42,
    priceSource: "dex",
    identityVerified: true,
    contractVerified: true,
    chainVerified: true,
    liquidityVerified: true,
    contractSafetyPassed: true,
    purchaseRouteConfirmed: true,
    executionRouteAvailable: true,
    finalIdentityState: "VERIFIED_CONTRACT",
    finalSelectionState: "QUALIFIED",
    finalSelectionQualified: true,
    finalIntegrityScore: 86,
    sourceTruthScore: 82,
    sourceReliabilityScore: 80,
    dataConfidenceScore: 84,
    liquidityUsd: 480_000,
    hardExitLiquidityUsd: 210_000,
    liquidityFormationScore: 86,
    liquidityExpansionScore: 82,
    activeLiquidityTruthScore: 84,
    liquidityQualityScore: 82,
    liquidityPersistenceScore: 82,
    numberOfLiquidityAdds: 4,
    numberOfLiquidityRemovals: 0,
    lockedLiquidityPct: 72,
    stablecoinLiquidityPct: 68,
    exitLiquidityScore: 80,
    uniqueBuyers24h: 240,
    returningBuyerPct: 72,
    repeatBuyerGrowth: 66,
    buyersHoldingAfter24hPct: 78,
    buyerRetentionScore: 80,
    organicBuyerScore: 82,
    organicDemandScore: 78,
    unrelatedBuyerClusters: 78,
    smartWalletAccumulationScore: 84,
    smartMoneyAccumulationScore: 82,
    smartWalletPerformanceScore: 80,
    smartWalletDiversityScore: 76,
    smartWalletHistoricalEdge: 78,
    unrelatedSmartWalletCount: 4,
    smartWalletHoldRatePct: 82,
    developerActivityScore: 84,
    githubProScore: 82,
    githubVelocityScore: 78,
    releaseAcceleration: 74,
    activeContributors: 76,
    commitQualityScore: 80,
    originalCodeRatio: 82,
    productDeliveryScore: 78,
    sdkDevelopment: 76,
    apiDevelopment: 72,
    contractDeployments: 78,
    adoptionAccelerationScore: 82,
    realAdoptionScore: 80,
    userQualityScore: 78,
    retentionScore: 76,
    userRetention7d: 74,
    protocolRevenueGrowthPct: 62,
    revenueQualityScore: 70,
    narrativeHeatScore: 56,
    narrativeEmergenceScore: 64,
    narrativePersistence: 62,
    xSocialScore: 24,
    socialAccelerationScore: 20,
    marketAwarenessScore: 24,
    priceChange24h: 4,
    priceChange7d: 7,
    preBreakoutMomentumScore: 72,
    preBreakoutMomentumStage: "CONFIRMED_EARLY",
    catalystQualityScore: 78,
    liveCatalystRadarScore: 78,
    catalystTimeline: [
      {
        catalystType: "Product activation",
        expectedDate: "2026-09-01",
        sourceConfidence: "High",
        verificationSources: ["official docs"],
      },
    ],
    tokenomicsScore: 70,
    tokenValueCaptureScore: 72,
    valueCaptureScore: 72,
    tokenReceivesRevenue: true,
    tokenRequiredForFees: true,
    circulatingSupplyConfidence: 82,
    holderDistributionScore: 74,
    holderGrowthScore: 72,
    holderRetention: 70,
    top10HolderPct: 34,
    riskScore: 18,
    washTradingRiskScore: 8,
    fakeVolumeRiskScore: 8,
    botClusterRiskScore: 8,
    sybilRiskScore: 8,
    insiderDistributionRisk: 8,
    tokenUnlockRiskScore: 12,
    vestingPressureScore: 12,
    antiManipulationConfidenceScore: 88,
    signalPersistenceScore: 82,
    observationTimestamp: "2026-07-14T00:00:00.000Z",
    sourceTimestamp: "2026-07-14T00:00:00.000Z",
    signalHistory: [
      { timestamp: "2026-07-11T00:00:00.000Z", liquidityFormationScore: 64, developerActivityScore: 60, adoptionAccelerationScore: 58 },
      { timestamp: "2026-07-12T00:00:00.000Z", liquidityFormationScore: 72, smartWalletAccumulationScore: 68, developerActivityScore: 70, adoptionAccelerationScore: 66 },
      { timestamp: "2026-07-13T00:00:00.000Z", liquidityFormationScore: 82, smartWalletAccumulationScore: 78, developerActivityScore: 82, adoptionAccelerationScore: 78, preBreakoutMomentumScore: 45 },
    ],
    ...overrides,
  };
}

test("flat price with accelerating liquidity, buyers, developers, and users can become ARMED", () => {
  const result = analyzeSniperIntegrityGate(baseProject());
  assert.equal(result.sniperState, "ARMED");
  assert.equal(result.sniperQualified, true);
});

test("price up 200 percent with no fundamental improvement is blocked as late chase", () => {
  const result = analyzeSniperIntegrityGate(
    baseProject({
      priceChange7d: 220,
      preBreakoutMomentumStage: "ALREADY_PUMPED",
      developerActivityScore: 5,
      adoptionAccelerationScore: 5,
      liquidityFormationScore: 8,
      smartWalletAccumulationScore: 0,
    })
  );
  assert.equal(result.sniperQualified, false);
  assert.ok(result.sniperBlockingReasons.some((reason) => /Late-chase|already-pumped/i.test(reason)));
});

test("several unrelated proven wallets produce a strong smart-wallet family", () => {
  const result = analyzeSniperEvidenceFamilies(baseProject({ unrelatedSmartWalletCount: 5 }));
  assert.ok(result.sniperEvidenceFamilies.SMART_WALLETS.familyScore >= 70);
});

test("related insider wallets disguised as smart wallets are penalized", () => {
  const result = analyzeSniperIntegrityGate(
    baseProject({
      sameFunderConnections: 88,
      insiderAccumulationRisk: 82,
      insiderDistributionRisk: 70,
    })
  );
  assert.equal(result.sniperQualified, false);
  assert.ok(result.sniperBlockingReasons.some((reason) => /Insider/i.test(reason)));
});

test("organic buyer growth raises organic buyer confidence", () => {
  const result = analyzeSniperEvidenceFamilies(baseProject({ returningBuyerPct: 84, buyersHoldingAfter24hPct: 86 }));
  assert.ok(result.organicBuyerConfidenceScore >= 70);
});

test("sybil buyer growth lowers organic buyer confidence", () => {
  const result = analyzeSniperEvidenceFamilies(baseProject({ sybilBuyerPct: 92, sameFunderBuyerPct: 88 }));
  assert.ok(result.organicBuyerConfidenceScore < 60);
});

test("real adoption with user retention strengthens adoption family", () => {
  const result = analyzeSniperEvidenceFamilies(baseProject({ userRetention7d: 85, returningUsers: 82 }));
  assert.ok(result.sniperEvidenceFamilies.ADOPTION.familyScore >= 70);
});

test("incentive-only fake adoption is penalized", () => {
  const result = analyzeSniperEvidenceFamilies(baseProject({ incentiveDependenceRisk: 95, rewardDrivenActivityPct: 90 }));
  assert.ok(result.realAdoptionScore < 60);
});

test("meaningful developer acceleration improves development authenticity", () => {
  const result = analyzeSniperEvidenceFamilies(baseProject({ releaseAcceleration: 90, originalCodeRatio: 88 }));
  assert.ok(result.developmentAuthenticityScore >= 70);
});

test("commit spam suppresses developer authenticity", () => {
  const result = analyzeSniperEvidenceFamilies(baseProject({ commitSpamRisk: 95, documentationOnlyActivity: true }));
  assert.ok(result.developmentAuthenticityScore < 65);
});

test("verified catalyst receives strong catalyst family score", () => {
  const result = analyzeSniperEvidenceFamilies(baseProject());
  assert.ok(result.sniperEvidenceFamilies.CATALYSTS.familyScore >= 70);
});

test("listing rumor does not score like verified operational evidence", () => {
  const result = analyzeSniperEvidenceFamilies(
    baseProject({
      catalystQualityScore: 0,
      liveCatalystRadarScore: 0,
      catalystTimeline: [{ catalystType: "Listing rumor", sourceConfidence: "Low", sourceType: "rumor" }],
    })
  );
  assert.ok(result.sniperEvidenceFamilies.CATALYSTS.familyScore < 60);
});

test("healthy liquidity formation creates a strong liquidity family", () => {
  const result = analyzeSniperEvidenceFamilies(baseProject());
  assert.ok(result.sniperEvidenceFamilies.LIQUIDITY.familyScore >= 70);
});

test("temporary removable liquidity is penalized", () => {
  const result = analyzeSniperIntegrityGate(
    baseProject({
      unlockedLiquidity: true,
      numberOfLiquidityAdds: 1,
      numberOfLiquidityRemovals: 3,
      liquidityManipulationRisk: 92,
      exitLiquidityScore: 20,
      hardExitLiquidityUsd: 5_000,
    })
  );
  assert.equal(result.sniperQualified, false);
  assert.ok(result.sniperBlockingReasons.some((reason) => /exit liquidity|Liquidity/i.test(reason)));
});

test("symbol collision keeps permanent project identities separate", () => {
  const first = analyzeSniperPointInTime(baseProject({ symbol: "PERP", chain: "base", contractAddress: "0x0000000000000000000000000000000000000b01" }));
  const second = analyzeSniperPointInTime(baseProject({ symbol: "PERP", chain: "ethereum", contractAddress: "0x0000000000000000000000000000000000000e01" }));
  assert.notEqual(first.pointInTimeObservation.projectId, second.pointInTimeObservation.projectId);
});

test("missing contract blocks ARMED state", () => {
  const result = analyzeSniperIntegrityGate(baseProject({ contractAddress: "", finalContractAddress: "", address: "", tokenAddress: "" }));
  assert.equal(result.sniperQualified, false);
  assert.ok(result.sniperBlockingReasons.some((reason) => /contract|Critical data/i.test(reason)));
});

test("unverified purchase route blocks ARMED state", () => {
  const result = analyzeSniperIntegrityGate(baseProject({ purchaseRouteConfirmed: false, purchaseRoute: { purchasable: false } }));
  assert.equal(result.sniperQualified, false);
  assert.ok(result.sniperBlockingReasons.some((reason) => /Purchase route/i.test(reason)));
});

test("critical token unlock blocks ARMED state", () => {
  const result = analyzeSniperIntegrityGate(baseProject({ tokenUnlockRiskScore: 90 }));
  assert.equal(result.sniperQualified, false);
  assert.ok(result.sniperBlockingReasons.some((reason) => /unlock/i.test(reason)));
});

test("good project with poor token value capture receives tokenomics warning pressure", () => {
  const result = analyzeSniperIntegrityGate(
    baseProject({
      valueCaptureScore: 5,
      tokenValueCaptureScore: 5,
      tokenomicsScore: 5,
      tokenReceivesRevenue: false,
      tokenRequiredForFees: false,
    })
  );
  assert.ok(result.sniperEvidenceFamilies.TOKENOMICS.familyScore < 45);
  assert.ok(result.sniperWarningReasons.some((reason) => /value capture/i.test(reason)));
});

test("distressed delisted token is blocked", () => {
  const result = analyzeSniperIntegrityGate(
    baseProject({
      distressedTrapBlock: true,
      priceDrawdownPct: 96,
      majorExchangeDelisted: true,
      finalSelectionQualified: false,
      finalSelectionState: "BLOCKED",
    })
  );
  assert.equal(result.sniperQualified, false);
  assert.equal(result.sniperState, "DISTRESSED");
});

test("legitimate neglected recovery is classified as recovery attempt until fully qualified", () => {
  const result = analyzeSniperIntegrityGate(
    baseProject({
      legitimateReacceleration: true,
      preConsensusCandidateType: "NEGLECTED_REACCELERATION",
      finalSelectionQualified: false,
      finalSelectionState: "RESEARCH_ONLY",
    })
  );
  assert.equal(result.sniperState, "RECOVERY_ATTEMPT");
});

test("already-pumped token cannot become ARMED", () => {
  const result = analyzeSniperIntegrityGate(baseProject({ preBreakoutMomentumStage: "ALREADY_PUMPED" }));
  assert.equal(result.sniperQualified, false);
});

test("late-chase influencer spike is blocked", () => {
  const result = analyzeSniperIntegrityGate(
    baseProject({
      preBreakoutMomentumStage: "LATE_CHASE",
      xSocialScore: 95,
      socialAccelerationScore: 95,
      influencerConcentration: 92,
    })
  );
  assert.equal(result.sniperState, "LATE_CHASE");
});

test("quiet accumulation across several scans creates sequence features", () => {
  const result = analyzeSniperLifecycleState(baseProject());
  assert.equal(result.sniperSignalSequence.liquidityLedPrice, true);
  assert.ok(result.sniperPersistentScanCount >= 3);
});

test("candidate becoming ARMED requires final sniper gate", () => {
  const result = analyzeSniperIntegrityGate(baseProject());
  assert.equal(result.sniperQualified, true);
  assert.equal(result.sniperIntegrityGate.qualified, true);
});

test("ARMED candidate becoming invalidated is deselected", () => {
  const result = analyzeSniperIntegrityGate(baseProject({ aiDecision: "Reject" }));
  assert.equal(result.sniperQualified, false);
  assert.ok(result.sniperBlockingReasons.some((reason) => /rejected/i.test(reason)));
});

test("no qualified candidates report does not force a pick", () => {
  const projects = analyzeSniperIntegrityGateBatch([
    baseProject({ finalSelectionQualified: false, finalSelectionState: "BLOCKED" }),
    baseProject({ symbol: "LATE", preBreakoutMomentumStage: "ALREADY_PUMPED" }),
  ]);
  const report = buildSniperReport(projects);
  assert.equal(report.armedSniperCandidates.length, 0);
});

test("historical leakage prevention catches future listing input", () => {
  const result = analyzeSniperPointInTime(
    baseProject({
      observationTimestamp: "2026-07-14T00:00:00.000Z",
      majorExchangeListed: true,
      majorExchangeListedAt: "2026-07-20T00:00:00.000Z",
    })
  );
  const validation = validatePointInTimeObservation(result);
  assert.equal(validation.status, "FAIL");
});

test("dashboard and JSON reports preserve sniper fields consistently", () => {
  const project = analyzeSniperIntegrityGate(baseProject());
  const htmlPath = writeHtmlReport([project]);
  const jsonPath = writeJsonReport([project]);
  assert.ok(htmlPath.endsWith("report.html"));
  assert.ok(jsonPath.endsWith("report.json"));
  const report = buildSniperReport([project]);
  assert.equal(report.armedSniperCandidates[0].symbol, project.symbol);
});

test("confidence calibration refuses probabilities with insufficient samples", () => {
  const result = analyzeSniperIntegrityGate(baseProject({ comparableSampleSize: 4 }));
  assert.equal(result.sniperCalibration.insufficientData, true);
  assert.match(result.sniperCalibration.message, /insufficient comparable/i);
});

test("outcome label marks sniper success only when upside arrives before major drawdown with liquidity", () => {
  const labels = createSniperOutcomeLabels(
    baseProject({
      maximumReturn30d: 125,
      maximumDrawdown30d: 18,
      liquidityAfter30d: 100_000,
      outcomeObserved: true,
    })
  );
  assert.equal(labels.primarySniperOutcomeLabel, "SNIPER_SUCCESS");
});
