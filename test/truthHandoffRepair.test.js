import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  attachCandidateTruthState,
  deterministicCandidateBlocks,
} from "../src/kernel/candidateTruthState.js";
import { analyzeAttentionGapV2 } from "../src/engines/attentionGapV2Engine.js";
import { analyzeCandidateDecisionScoring } from "../src/engines/candidateDecisionScoringEngine.js";
import { classifyHighUpsideScalpProject } from "../src/engines/highUpsideScalpClassificationEngine.js";
import { getSolanaSecurityEvidence } from "../src/data/security/solanaSecurityConnector.js";
import {
  DASHBOARD_CRITICAL_REPORT_FILES,
  validateDashboardArtifactConsistency,
} from "../src/reports/reportContractValidator.js";
import {
  finalizeScanArtifactManifestPublication,
  writeScanArtifactManifest,
} from "../src/reports/scanArtifactManifestReportEngine.js";
import { summarizeExecutionProofRecovery } from "../src/reports/executionProofRecoveryReportEngine.js";

const EVM_TOKEN = "0x1111111111111111111111111111111111111111";
const EVM_POOL = "0x2222222222222222222222222222222222222222";
const SOL_TOKEN = "So11111111111111111111111111111111111111112";
const SOL_POOL = "11111111111111111111111111111111";

function verifiedDexCandidate(overrides = {}) {
  return {
    name: "Live Utility",
    symbol: "LIVE",
    chain: "base",
    tokenAddress: EVM_TOKEN,
    contractAddress: EVM_TOKEN,
    poolAddress: EVM_POOL,
    routeType: "DEX_AGGREGATOR",
    exactIdentityVerified: true,
    buyQuoteVerified: true,
    sellQuoteVerified: true,
    quoteAgeSeconds: 30,
    verifiedTradeSizeUsd: 25,
    estimatedRoundTripSlippagePct: 0.9,
    slippageIsHeuristic: false,
    canonicalExecutionRoute: {
      routeType: "DEX_AGGREGATOR",
      chain: "base",
      tokenAddress: EVM_TOKEN,
      poolAddress: EVM_POOL,
      exactIdentityVerified: true,
      buyQuoteVerified: true,
      sellQuoteVerified: true,
      quoteAgeSeconds: 30,
      verifiedTradeSizeUsd: 25,
      verifiedDepthSource: "live-buy-sell-quote",
      estimatedRoundTripSlippagePct: 0.9,
      slippageIsHeuristic: false,
      regionStatus: "UNKNOWN",
    },
    ...overrides,
  };
}

test("live token remains live and research eligible even when legacy researchOnly is true", () => {
  const result = attachCandidateTruthState(
    verifiedDexCandidate({
      researchOnly: true,
      tradableCandidate: false,
      projectLifecycleState: "PRELAUNCH",
      safetyProofStatus: "SAFETY_UNKNOWN",
    })
  );

  assert.equal(result.projectLifecycleState, "LIVE");
  assert.equal(result.researchEligibilityState, "ELIGIBLE");
  assert.notEqual(result.projectLifecycleState, "PRELAUNCH");
});

test("unknown region preserves global DEX route truth but not confirmed user access", () => {
  const result = attachCandidateTruthState(
    verifiedDexCandidate({
      safetyProofStatus: "SAFETY_VERIFIED_CLEAN",
      securityEvidence: [
        {
          provider: "goplus",
          status: "EVIDENCE_AVAILABLE",
          observedAt: new Date().toISOString(),
        },
      ],
    })
  );

  assert.equal(result.candidateProofState.globalRoute.status, "ROUTE_VERIFIED");
  assert.equal(result.candidateProofState.userAccess.status, "UNKNOWN");
  assert.equal(result.executionReadinessState, "EXECUTION_REVIEW");
  assert.equal(result.tradabilityState, "ROUTE_QUOTED");
});

test("recovery report distinguishes global route recovery from execution readiness", () => {
  const candidate = attachCandidateTruthState(
    verifiedDexCandidate({
      safetyProofStatus: "SAFETY_VERIFIED_CLEAN",
      securityEvidence: [{ provider: "goplus", observedAt: new Date().toISOString() }],
      executionProofRecovery: {
        attempted: true,
        status: "ROUTE_RECOVERED",
        buyQuoteVerified: true,
        sellQuoteVerified: true,
        newlyPromotedToExecutionReview: true,
      },
    })
  );
  const report = summarizeExecutionProofRecovery([candidate], {
    scanRunId: "scan_recovery_truth",
  });

  assert.equal(report.routesRecovered, 1);
  assert.equal(report.newlyPromotedToExecutionReview, 1);
  assert.equal(report.newlyExecutionReady, 0);
  assert.equal(report.topRecoveredRoutes[0].globalRouteStatus, "ROUTE_VERIFIED");
  assert.equal(report.topRecoveredRoutes[0].executionReadinessState, "EXECUTION_REVIEW");
  assert.equal(report.topRecoveredRoutes[0].executionReady, false);
});

test("unknown safety does not count as observed high-upside safety coverage", () => {
  const result = classifyHighUpsideScalpProject(
    verifiedDexCandidate({
      progressivePipelineStages: ["deep"],
      sevenDayTenXScore: 80,
      preBreakoutRadarScore: 76,
      preConsensusBreakoutScore: 74,
      earlyAsymmetryResearchPriorityScore: 78,
      capitalMigrationScore: 72,
      capitalFlowScore: 70,
      buyerBreadthAccelerationScore: 68,
      liquidityFormationScore: 72,
      utilityQualityScore: 75,
      developerActivityScore: 70,
      sourceTruthScore: 76,
      evidenceCoverageScore: 70,
      instantSafetyScore: 42,
      contractAuthoritySafetyScore: 42,
      safetyProofStatus: "SAFETY_UNKNOWN",
      securityEvidenceStatus: "UNKNOWN",
    })
  );

  assert.equal(result.highUpsideScalpComponentCoverage.safety.available, 0);
  assert.ok(result.highUpsideScalpComponentCoverage.safety.missingFields.length > 0);
  assert.ok(result.highUpsideScalpDataCoverage < 100);
});

test("generic uncertainty remains a warning and cannot become a deterministic block", () => {
  const blocks = deterministicCandidateBlocks({
    finalBlockingReasons: [
      "Insufficient evidence from optional model.",
      "Missing wallet history.",
      "Route pending.",
    ],
  });

  assert.deepEqual(blocks, []);
});

test("Attention Gap V2 keeps absent evidence null with explicit coverage", () => {
  const result = analyzeAttentionGapV2({ symbol: "EMPTY" });

  assert.equal(result.attentionGapV2Score, null);
  assert.equal(result.fundamentalProgressScore, null);
  assert.equal(result.priceAttentionScore, null);
  assert.equal(result.attentionGapV2State, "INSUFFICIENT_DATA");
  assert.equal(result.attentionGapV2Coverage.observedComponentCount, 0);
  assert.ok(result.attentionGapV2Coverage.missingValues.length > 0);
});

test("decision scoring preserves strong route-pending research without inventing a final score", () => {
  const result = analyzeCandidateDecisionScoring(
    verifiedDexCandidate({
      buyQuoteVerified: true,
      sellQuoteVerified: false,
      canonicalExecutionRoute: {
        ...verifiedDexCandidate().canonicalExecutionRoute,
        buyQuoteVerified: true,
        sellQuoteVerified: false,
      },
      safetyProofStatus: "SAFETY_UNKNOWN",
      earlyAsymmetryResearchPriorityScore: 82,
      highUpsideScalpScore: 78,
      preBreakoutRadarScore: 76,
      utilityQualityScore: 79,
      capitalMigrationScore: 74,
      buyerBreadthAccelerationScore: 72,
      liquidityFormationScore: 75,
      developerAccelerationScore: 70,
    })
  );

  assert.ok(result.researchOpportunityScore >= 60);
  assert.equal(result.executionReadinessState, "RESEARCH_ONLY");
  assert.equal(result.finalDecisionScore, null);
  assert.equal(result.finalDecisionScoreState, "NOT_EXECUTION_REVIEW");
  assert.ok(result.executionReadinessCoverage.missingValues.includes("safety"));
});

test("decision scoring only calculates a final score after execution review truth exists", () => {
  const result = analyzeCandidateDecisionScoring(
    verifiedDexCandidate({
      safetyProofStatus: "SAFETY_VERIFIED_CLEAN",
      securityEvidence: [{ provider: "goplus", observedAt: new Date().toISOString() }],
      earlyAsymmetryResearchPriorityScore: 82,
      highUpsideScalpScore: 78,
      utilityQualityScore: 79,
      capitalMigrationScore: 74,
    })
  );

  assert.equal(result.executionReadinessState, "EXECUTION_REVIEW");
  assert.ok(result.finalDecisionScore > 0);
  assert.equal(result.finalDecisionScoreState, "CALCULATED");
});

test("Solana safety recovery uses mint authority checks without EVM source fields", async () => {
  const result = await getSolanaSecurityEvidence(
    {
      symbol: "SOLSAFE",
      chain: "solana",
      tokenAddress: SOL_TOKEN,
      poolAddress: SOL_POOL,
    },
    {
      fetchJson: async (_url, init = {}) => {
        if (init.method === "POST") {
          return {
            result: {
              value: {
                owner: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
                data: {
                  parsed: {
                    info: {
                      mintAuthority: null,
                      freezeAuthority: null,
                      decimals: 9,
                      supply: "1000000000",
                    },
                  },
                },
              },
            },
          };
        }
        return { score: 1, rugged: false, risks: [] };
      },
    }
  );

  assert.equal(result.status, "EVIDENCE_AVAILABLE");
  assert.equal(result.identityVerifiedOnChain, true);
  assert.equal(result.mintRisk, false);
  assert.equal(result.freezeRisk, false);
  assert.ok(result.testedChecks.includes("mint authority"));
});

test("critical dashboard artifacts require one non-null scan identity and matching hashes", () => {
  const reportsDir = fs.mkdtempSync(path.join(os.tmpdir(), "truth-manifest-reports-"));
  const docsDir = fs.mkdtempSync(path.join(os.tmpdir(), "truth-manifest-docs-"));
  const scanRunId = "scan_truth_handoff";

  for (const fileName of DASHBOARD_CRITICAL_REPORT_FILES) {
    fs.writeFileSync(
      path.join(reportsDir, fileName),
      JSON.stringify({
        generatedAt: new Date().toISOString(),
        scanRunId,
        status: "PASS",
        projectsAnalyzed: 100,
      })
    );
    fs.copyFileSync(path.join(reportsDir, fileName), path.join(docsDir, fileName));
  }

  const { report: manifest } = writeScanArtifactManifest(
    { scanRunId, codeCommitSha: "test-sha" },
    { reportsDir }
  );
  fs.copyFileSync(
    path.join(reportsDir, "scan-artifact-manifest.json"),
    path.join(docsDir, "scan-artifact-manifest.json")
  );
  const { report: finalized } = finalizeScanArtifactManifestPublication({ reportsDir, docsDir });
  fs.copyFileSync(
    path.join(reportsDir, "scan-artifact-manifest.json"),
    path.join(docsDir, "scan-artifact-manifest.json")
  );
  const validation = validateDashboardArtifactConsistency({ reportsDir, docsDir });

  assert.equal(manifest.status, "COMPLETE");
  assert.equal(finalized.status, "COMPLETE");
  assert.ok(finalized.dashboardPublicationTimestamp);
  assert.equal(validation.status, "PASS");
  assert.deepEqual(validation.reportScanRunIds, [scanRunId]);
});

test("dashboard consistency rejects matching anonymous artifacts", () => {
  const reportsDir = fs.mkdtempSync(path.join(os.tmpdir(), "truth-anonymous-reports-"));
  const docsDir = fs.mkdtempSync(path.join(os.tmpdir(), "truth-anonymous-docs-"));
  const fileName = "top-10-breakout-picks.json";
  const anonymous = JSON.stringify({ status: "PASS", projectsAnalyzed: 1 });
  fs.writeFileSync(path.join(reportsDir, fileName), anonymous);
  fs.writeFileSync(path.join(docsDir, fileName), anonymous);

  const validation = validateDashboardArtifactConsistency({
    reportsDir,
    docsDir,
    files: [fileName],
  });

  assert.equal(validation.status, "FAIL");
  assert.ok(validation.errors.some((error) => error.includes("scanRunId missing")));
});
