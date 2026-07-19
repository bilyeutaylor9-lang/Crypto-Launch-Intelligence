import test from "node:test";
import assert from "node:assert/strict";

import {
  buildEvidenceLineage,
  analyzeEvidenceLineageCorrelation,
} from "../src/kernel/evidenceLineageCorrelationGovernor.js";
import { judgePointInTimeOutcomeV2 } from "../src/kernel/pointInTimeOutcomeJudgeV2.js";
import {
  buildAlphaTruthReceipt,
  buildAlphaTruthKernelReport,
  persistAlphaTruthMemory,
} from "../src/kernel/alphaTruthKernel.js";
import { analyzeFinalSelectionIntegrity } from "../src/engines/finalSelectionIntegrityEngine.js";

test("evidence lineage excludes internal AI and caps correlated momentum evidence", () => {
  const lineage = buildEvidenceLineage({
    symbol: "CORR",
    accelerationScore: 90,
    earlyBreakoutScore: 88,
    preBreakoutMomentumScore: 86,
    momentumShiftScore: 84,
    volatilityExpansionScore: 82,
    aiEcosystemScore: 92,
    autonomousAlphaOSScore: 91,
    evidence: [
      { engine: "AI Council", source: "ai-council", family: "ai", score: 90 },
      { engine: "Momentum", source: "dexscreener", family: "momentum", score: 88 },
    ],
  });

  assert.equal(lineage.status, "QUORUM_INCOMPLETE");
  assert.ok(lineage.internalOpinionCount >= 2);
  assert.ok(lineage.correlationPenalty > 0);
  assert.ok(lineage.correlatedGroups.includes("price-volume-momentum"));
  assert.ok(!lineage.requiredQuorum.confirmedGroups.includes("internal-ai-opinion"));
});

test("evidence lineage passes only with multiple independent proof families", () => {
  const result = analyzeEvidenceLineageCorrelation({
    identityResolutionScore: 90,
    securityEvidenceScore: 88,
    liquidityControlSafetyScore: 82,
    executionTwinScore: 80,
    activeLiquidityTruthScore: 78,
    organicBuyerScore: 75,
    githubProScore: 72,
    sourceTruthScore: 80,
    source: "dexscreener",
  });

  assert.equal(result.evidenceLineageQualified, true);
  assert.equal(result.evidenceLineageStatus, "QUORUM_PASSED");
  assert.ok(result.effectiveIndependentEvidenceCount >= 4);
});

test("final selection cannot qualify when independent evidence quorum fails", () => {
  const result = analyzeFinalSelectionIntegrity({
    name: "ThinProof",
    symbol: "THIN",
    chain: "base",
    contractAddress: "0x1111111111111111111111111111111111111111",
    pairAddress: "0x2222222222222222222222222222222222222222",
    source: "dexscreener",
    pipelineScore: 82,
    liquidityUsd: 150000,
    purchaseRouteConfirmed: true,
    executionRouteAvailable: true,
    executionProof: { executionStatus: "VERIFIED" },
    contractVerified: true,
    chainVerified: true,
    evidenceLineageQualified: false,
    evidenceLineageMissingRequiredGroups: ["contract-security", "organic-demand|smart-wallets|developer-activity|catalyst-roadmap"],
    effectiveIndependentEvidenceCount: 1,
    evidenceCorrelationPenalty: 18,
  });

  assert.equal(result.finalSelectionQualified, false);
  assert.equal(result.finalSelectionState, "INSUFFICIENT_DATA");
  assert.ok(result.finalWarningReasons.some((reason) => reason.includes("Independent evidence quorum is incomplete")));
});

test("point-in-time outcome V2 labels executable price loss even when liquidity rises", () => {
  const outcome = judgePointInTimeOutcomeV2(
    {
      projectKey: "base:0xabc",
      decisionAt: "2026-07-01T00:00:00.000Z",
      marketSnapshot: { priceUsd: 1 },
      executionSnapshot: { slippagePct: 2, sellTaxPct: 1 },
      scannerScoreAtDecision: 95,
    },
    [
      { observedAt: "2026-07-02T00:30:00.000Z", priceUsd: 0.75, liquidityUsd: 180000 },
    ]
  );

  const label24h = outcome.labels.find((label) => label.horizon === "24h");
  assert.equal(label24h.status, "LABELED");
  assert.equal(label24h.label, "LOSS");
  assert.ok(label24h.netExecutableReturnPct < -20);
  assert.equal(label24h.usedScannerScoreAsOutcome, false);
});

test("point-in-time outcome V2 leaves out-of-window snapshots missing", () => {
  const outcome = judgePointInTimeOutcomeV2(
    {
      projectKey: "base:0xabc",
      decisionAt: "2026-07-01T00:00:00.000Z",
      priceUsd: 1,
    },
    [
      { observedAt: "2026-07-04T00:00:00.000Z", priceUsd: 1.8, liquidityUsd: 90000 },
    ]
  );

  const label24h = outcome.labels.find((label) => label.horizon === "24h");
  assert.equal(label24h.status, "MISSING_SNAPSHOT_WITHIN_TOLERANCE");
  assert.equal(label24h.netExecutableReturnPct, null);
});

test("alpha truth receipt is immutable proof carrying metadata without forcing picks", () => {
  const evidenceLineage = {
    status: "QUORUM_PASSED",
    effectiveIndependentEvidenceCount: 4,
    weightedIndependentScore: 80,
    correlationPenalty: 0,
    internalOpinionCount: 1,
    groups: [{ group: "contract-security", cappedContribution: 88, averageConfidence: 0.88, status: "CONFIRMED" }],
    warnings: ["1 internal AI opinion signals excluded from independent evidence count."],
    requiredQuorum: { passed: true, missingRequiredGroups: [] },
  };
  const receipt = buildAlphaTruthReceipt(
    {
      name: "ProofAlpha",
      symbol: "PAL",
      chain: "base",
      finalChain: "base",
      contractAddress: "0x1111111111111111111111111111111111111111",
      finalContractAddress: "0x1111111111111111111111111111111111111111",
      pairAddress: "0x2222222222222222222222222222222222222222",
      finalPairAddress: "0x2222222222222222222222222222222222222222",
      finalSelectionState: "QUALIFIED",
      finalSelectionQualified: true,
      identityVerified: true,
      chainVerified: true,
      contractVerified: true,
      contractSafetyVerified: true,
      liquidityControlSafetyScore: 86,
      purchaseRouteConfirmed: true,
      executionRouteAvailable: true,
      executionProof: { executionStatus: "VERIFIED" },
      pipelineScore: 84,
      liquidityUsd: 250000,
      priceUsd: 0.02,
      evidenceLineage,
    },
    1,
    { runId: "scan_test", completedAt: "2026-07-01T00:00:00.000Z" }
  );

  assert.equal(receipt.truthStatus, "PROOF_CARRYING_CANDIDATE");
  assert.equal(receipt.outcomeV2.status, "PENDING");
  assert.ok(receipt.receiptId);
  assert.ok(receipt.receiptHash);

  const report = buildAlphaTruthKernelReport([receipt], { runId: "scan_test" }, { limit: 1, outcomeRows: [] });
  assert.equal(report.summary.forcedPickPolicy, "NEVER_FORCE_PICK");
});

test("alpha truth persistence can run in report-only mode for tests", () => {
  const result = persistAlphaTruthMemory(
    [{ name: "ReportOnly", symbol: "RPT", pipelineScore: 50 }],
    { runId: "scan_report_only", completedAt: "2026-07-01T00:00:00.000Z" },
    { persist: false, outcomeRows: [] }
  );

  assert.equal(result.persistence.status, "SKIPPED");
  assert.equal(result.report.receipts.length, 1);
});
