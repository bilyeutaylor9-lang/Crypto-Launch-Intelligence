import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { resolveStrictCandidateGate } from "../src/execution/routeResolver.js";
import { isLiveExecutionReady, routeQuoteFresh } from "../src/execution/routeTruthV2.js";
import { analyzeFinalSelectionIntegrity } from "../src/engines/finalSelectionIntegrityEngine.js";
import { compactProjectForReportWriters } from "../src/reports/reportPayloadCompactor.js";
import { writeJsonReport } from "../src/reports/jsonReportEngine.js";
import { buildTop10CandidateInput } from "../src/reports/top10BreakoutReportEngine.js";
import { summarizeEvidenceFunnel } from "../src/kernel/evidenceFunnelSummary.js";
import { createEvidenceFunnelSnapshot, getFrozenEvidenceFunnel } from "../src/reports/evidenceFunnelSnapshot.js";

const CUTOFF = "2026-10-18T15:17:23.109Z";
const ISSUED = "2026-10-18T15:17:00.000Z";
const EXPIRES = "2026-10-18T15:18:00.000Z";
const BUDGET = 22_582;
const BUDGET_CASES = [BUDGET, 8_000].flatMap(budget =>
  [false, true].map(boundedWriter => ({ budget, boundedWriter })));
const SCALARS = [
  "dexName", "venue", "riskScore", "finalIdentityState", "liveActionStatus", "researchScore",
  "executionScore", "finalDecisionScore", "pipelineScore", "legacyFinalSelectionState",
  "legacyFinalSelectionQualified", "legacyFinalIntegrityScore", "legacyFinalIntegrityVerdict",
  "legacyFinalDecisionScore", "legacyFinalAuthorityEngine", "legacyFinalIntegritySource",
  "finalIntegrityPipelineScore", "finalIntegrityScoreSource", "finalAuthorityEngine",
];

function heavyCandidate(index, pressure = "characters") {
  const tokenAddress = `0x${(index + 100).toString(16).padStart(40, "0")}`;
  const poolAddress = `0x${(index + 200).toString(16).padStart(40, "0")}`;
  const route = {
    chain: "base", tokenAddress, poolAddress, baseTokenAddress: tokenAddress,
    quoteTokenAddress: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
    venue: "0x", routeType: "DEX_AGGREGATOR", exactIdentityVerified: true,
    buyQuoteVerified: true, sellQuoteVerified: true, quoteTimestamp: ISSUED, quoteExpiresAt: EXPIRES,
    lastVerifiedAt: ISSUED, liquidityUsd: 150_000, volume24hUsd: 80_000,
    orderBookDepthVerified: true, verifiedDepthSource: "LIVE-BUY-SELL-QUOTE",
    verifiedTradeSizeUsd: 100, estimatedRoundTripSlippagePct: 1.2, slippageIsHeuristic: false,
    provenance: ["synthetic-pinned-quotes"], supportingSources: ["synthetic-pinned-quotes"],
  };
  const walletTransactions = Array.from({ length: 40 }, (_, i) => ({
    transactionHash: `synthetic-${i}`, tokenAddress, poolAddress, chain: "base", timestamp: ISSUED,
    tokenAmountRaw: "5", currentHoldingVerified: false, tradeClassification: "UNKNOWN",
    provider: pressure === "characters" ? "p".repeat(1_400) : "rpc-wallets",
  }));
  const nodePressure = Object.fromEntries(Array.from({ length: 80 }, (_, i) => [
    `field${i}`, Array.from({ length: 12 }, () => ({ observed: false })),
  ]));
  return {
    ...route, name: `Bounded Decision ${index}`, tokenName: `Bounded Decision ${index}`, symbol: `BD${index}`,
    contractAddress: tokenAddress, pairAddress: poolAddress, contractVerified: true, chainVerified: true,
    identityVerified: true, purchaseRouteConfirmed: true, canonicalExecutionRoute: route,
    // A supported nested venue must not replace the rejection-driving root venue.
    dexName: "unmapped-root-venue", venue: "0x",
    walletTransactions, rpcWalletEvidence: { provider: "rpc-wallets", sourceTimestamp: ISSUED, walletTransactions },
    fieldProvenance: pressure === "nodes" ? nodePressure : {
      walletTransactions: { source: "rpc-wallets", sourceTimestamp: ISSUED, value: walletTransactions },
    },
    canonicalAliasProvenance: { walletTransactions: { source: "original-rpc-wallets", sourceTimestamp: ISSUED } },
    pipelineScore: [14.7519, 14.0175, 17.5229, 16.5444][index],
    riskScore: [35, 42, 51, 88][index], finalIdentityState: "VERIFIED_CONTRACT",
    liveActionStatus: "BLOCKED", researchScore: 21 + index, executionScore: index === 0 ? 0 : 25,
    finalDecisionScore: [14.7519, 14.0175, 17.5229, 16.5444][index],
    finalSelectionState: "BLOCKED", finalSelectionQualified: false,
    finalIntegrityVerdict: "Blocked By Final Integrity", finalIntegrityScore: 42,
    finalBlockingReasons: ["Current score is below the final-selection minimum."],
    legacyFinalSelectionState: "BLOCKED", legacyFinalSelectionQualified: false,
    legacyFinalIntegrityScore: 58, legacyFinalIntegrityVerdict: "Blocked By Final Integrity",
    legacyFinalDecisionScore: [21, 21, 23, 0][index],
    legacyFinalBlockingReasons: [`Pipeline score ${[21, 21, 23, 0][index]} is below required minimum 60.`],
    legacyFinalWarningReasons: ["Canonical utility evidence is incomplete."], legacyFinalSelectionReasons: [],
    legacyFinalAuthorityEngine: "Final Selection Integrity", legacyFinalIntegritySource: "PRE_GUARDED_CANONICAL_PASS",
    finalIntegrityPipelineScore: [14.7519, 14.0175, 17.5229, 16.5444][index],
    finalIntegrityScoreSource: "FINAL_SELECTION_INTEGRITY_AT_GUARDED_SCORE", finalAuthorityEngine: "Guarded Live Ranking",
    liveRankingMissingEvidence: Array.from({ length: 12 }, () => "m".repeat(1_400)),
  };
}

function gateDecision(project) {
  const strict = resolveStrictCandidateGate(project);
  const final = analyzeFinalSelectionIntegrity(project);
  return {
    strictIdentityVerified: strict.strictIdentityVerified, strictRouteVerified: strict.strictRouteVerified,
    strictRankEligible: strict.strictRankEligible, dexName: strict.dexName,
    candidateQuarantineReasons: strict.candidateQuarantineReasons,
    finalSelectionState: final.finalSelectionState, finalSelectionQualified: final.finalSelectionQualified,
    finalBlockingReasons: final.finalBlockingReasons,
  };
}

function recoveredProfileCandidate() {
  const tokenAddress = "HKZDfZnkHZxd9agRDNPyDv4iT6LmAurJnpRtj9wpump";
  const poolAddress = "23KXjwkcexVwhHqF7Ys7sKyUzC9Ezw7pwKMvPzTPDwqg";
  const quoteTokenAddress = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
  const identity = { chain: "solana", chainId: 101, tokenAddress, contractAddress: tokenAddress,
    baseTokenAddress: tokenAddress, poolAddress, pairAddress: poolAddress, quoteTokenAddress };
  const leg = (inputMint, outputMint, inputAmount, outAmount) => ({
    verified: true, timestamp: ISSUED, expiresAt: EXPIRES, quoteId: `synthetic-${inputAmount}`,
    inputMint, outputMint, inputAmount, outAmount, otherAmountThreshold: outAmount,
    routePoolAddresses: [poolAddress],
  });
  // The adapter's paired raw-leg attestation, not a fabricated safety-ready route.
  const route = { ...identity, venue: "Raydium", routeType: "DEX", source: "raydium",
    executionRecoverySource: "raydium", identityVerificationState: "EXACT_CHAIN_CONTRACT_POOL_ATTESTED",
    exactIdentityVerified: true, buyQuoteVerified: true, sellQuoteVerified: true, quoteVerified: true,
    quoteTimestamp: ISSUED, quoteExpiresAt: EXPIRES, lastVerifiedAt: ISSUED,
    routePoolAddresses: [poolAddress], liquidityUsd: 150_000, volume24hUsd: 80_000,
    verifiedTradeSizeUsd: 25, executableDepthUsd: 25, verifiedDepthSource: "live-buy-sell-quote",
    estimatedRoundTripSlippagePct: 0.4, slippageIsHeuristic: false,
    status: "SELL_QUOTE_VERIFIED", verificationStatus: "PARTIALLY_VERIFIED", supportingSources: ["raydium"],
    buyQuote: leg(quoteTokenAddress, tokenAddress, "25000000", "1000000000"),
    sellQuote: leg(tokenAddress, quoteTokenAddress, "1000000000", "24900000"),
  };
  const base = heavyCandidate(0);
  const walletTransactions = base.walletTransactions.map(event => ({ ...event, ...identity }));
  return { ...base, ...identity, name: "Recovered Profile Alpha", tokenName: "Recovered Profile Alpha", symbol: "RPA",
    routeType: "DEX", dexName: "token-profile", dex: "token-profile", venue: null,
    source: "dexscreener", sources: ["dexscreener", "raydium"], walletTransactions,
    rpcWalletEvidence: undefined,
    solanaRpcWalletEvidence: { provider: "solana-rpc-wallets", sourceTimestamp: ISSUED, walletTransactions },
    fieldProvenance: { walletTransactions: { source: "solana-rpc-wallets", sourceTimestamp: ISSUED, value: walletTransactions } },
    canonicalExecutionRoute: route,
    executionProof: { ...route, executionProofState: "SAFETY_PROOF_REQUIRED", safetyVerified: false },
    executionProofRecoveryRoute: { ...route },
  };
}

function lateProofProfileCandidate() {
  const project = recoveredProfileCandidate();
  const route = project.executionProof;
  // Normalized producer order: current timing and both raw attestations are late.
  project.executionProof = {
    executionStatus: "VERIFIED", verifiedAt: ISSUED, chainId: "solana",
    contractAddress: project.tokenAddress, venue: "Raydium", pairAddress: project.poolAddress,
    quoteAsset: { symbol: "USDC", address: project.quoteTokenAddress }, price: 0.02,
    liquidityUsd: 150_000, volume24hUsd: 80_000,
    estimatedSlippage25: 0.4, estimatedSlippage100: 1, observedSlippagePct: 0.4,
    estimatedRoundTripSlippagePct: 0.4, slippageIsHeuristic: false,
    estimatedSlippage500: 2, estimatedSlippage1000: 3,
    executionProofState: "LIVE_EXECUTION_READY", liveExecutionReady: true,
    routeExecutionReadiness: "ROUTE_EXECUTION_READY", finalProjectExecutionReadiness: "NOT_EVALUATED",
    executionProofActionability: "LIVE_EXECUTION_READY", buyRouteAvailable: true, sellRouteAvailable: true,
    buyQuoteVerified: true, sellQuoteVerified: true, routeTruthStatus: "LIVE_EXECUTION_READY",
    routeKind: "SOLANA", routeType: "DEX", exactIdentityVerified: true, chainVerified: true,
    contractVerified: true, poolRequired: true, poolVerified: true, quoteVerified: true,
    safetyVerified: true, transferTaxEvidenceRequired: false, transferTaxEvidenceVerified: true,
    authorityEvidenceRequired: true, authorityEvidenceVerified: true, authoritySafetyClean: true,
    authorityEvidenceSources: ["synthetic-authority-observation"], authorityEvidenceSourceTimestamp: ISSUED,
    userAccessEvidenceRequired: false, userAccessVerified: true, honeypotEvidence: null, transferTaxEvidence: null,
    quoteFreshnessSeconds: 23.109, quoteTimestamp: ISSUED, quoteExpiresAt: EXPIRES,
    buyQuote: route.buyQuote, sellQuote: route.sellQuote, supportingSources: ["raydium"], failureReasons: [],
  };
  return project;
}

test("bounded writer compaction protects decision and provenance scalars beyond the ordinary key cap", () => {
  const filler = Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`filler${i}`, i]));
  const original = heavyCandidate(0);
  const compacted = compactProjectForReportWriters({ ...filler, ...original }, { objectKeyLimit: 3 });
  for (const key of SCALARS) assert.deepEqual(compacted[key], original[key], key);
  assert.equal(Object.hasOwn(compacted, "filler99"), false);
});

for (const pressure of ["characters", "nodes"]) {
  for (const { budget, boundedWriter } of BUDGET_CASES) {
    test(`heavy ${pressure} report retains the cutoff decision from ${boundedWriter ? "bounded" : "raw"} rows at ${budget} chars`, (t) => {
      const original = Array.from({ length: 4 }, (_, i) => heavyCandidate(i, pressure));
      const before = structuredClone(original);
      t.mock.method(Date, "now", () => Date.parse(CUTOFF));
      for (const row of original) {
        assert.equal(routeQuoteFresh(row), true, "fresh only at the frozen cutoff");
        assert.equal(resolveStrictCandidateGate(row).strictRankEligible, false);
        assert.equal(resolveStrictCandidateGate({ ...row, dexName: null }).strictRankEligible, true,
          "omitting the root venue would change the gate outcome");
      }
      const expected = original.map(gateDecision);
      assert.ok(expected.every(decision => decision.finalSelectionQualified === false));
      const reportsDir = fs.mkdtempSync(path.join(os.tmpdir(), "report-decision-truth-"));
      t.after(() => fs.rmSync(reportsDir, { recursive: true, force: true }));
      const env = {
        REPORT_MAX_TOTAL_PROJECT_PAYLOAD_CHARS: String(budget * 4),
        REPORT_MAX_PROJECT_PAYLOAD_CHARS: String(budget),
        REPORT_MIN_PROJECT_PAYLOAD_CHARS: "2048",
      };
      for (const [key, value] of Object.entries(env)) {
        const previous = process.env[key];
        process.env[key] = value;
        t.after(() => { if (previous === undefined) delete process.env[key]; else process.env[key] = previous; });
      }
      const input = boundedWriter ? original.map(row => compactProjectForReportWriters(row)) : original;
      const reportPath = writeJsonReport(input, { reportsDir, scanRunId: "synthetic-decision-cutoff", dataCutoffTimestamp: CUTOFF });
      const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
      assert.equal(report.meta.reportSerialization.projectPayloadCharacterLimit, budget);
      assert.equal(report.meta.reportSerialization.truncatedProjects, 4);
      for (const [i, saved] of report.projects.entries()) {
        for (const key of SCALARS) assert.deepEqual(saved[key], original[i][key], `${i}:${key}`);
        for (const key of ["finalBlockingReasons", "legacyFinalBlockingReasons", "legacyFinalWarningReasons", "legacyFinalSelectionReasons"]) {
          assert.deepEqual(saved[key], original[i][key], `${i}:${key}`);
        }
        assert.deepEqual(gateDecision(saved), expected[i]);
        assert.ok(JSON.stringify(saved).length < 40_000, "decision retention remains bounded");
      }
      assert.deepEqual(original, before);
      t.mock.restoreAll();
      assert.ok(Date.now() > Date.parse(EXPIRES));
      assert.ok(report.projects.every(row => routeQuoteFresh(row) === false), "no current-freshness claim from historical quotes");
    });
  }
}

for (const { budget, boundedWriter } of BUDGET_CASES) {
  test(`recovered profile retains Raydium paired-leg proof through ${boundedWriter ? "bounded" : "raw"} report serialization at ${budget} chars`, (t) => {
    const original = recoveredProfileCandidate();
    const before = structuredClone(original);
    t.mock.method(Date, "now", () => Date.parse(CUTOFF));
    const expected = resolveStrictCandidateGate(original);
    assert.equal(expected.dexName, "Raydium");
    assert.equal(expected.strictRankEligible, true);
    assert.equal(isLiveExecutionReady(original), false, "paired quotes do not resolve unknown safety");
    const reportsDir = fs.mkdtempSync(path.join(os.tmpdir(), "report-recovered-profile-"));
    t.after(() => fs.rmSync(reportsDir, { recursive: true, force: true }));
    const previous = process.env.REPORT_MAX_PROJECT_PAYLOAD_CHARS;
    process.env.REPORT_MAX_PROJECT_PAYLOAD_CHARS = String(budget);
    t.after(() => { if (previous === undefined) delete process.env.REPORT_MAX_PROJECT_PAYLOAD_CHARS;
      else process.env.REPORT_MAX_PROJECT_PAYLOAD_CHARS = previous; });
    const input = boundedWriter ? compactProjectForReportWriters(original) : original;
    const file = writeJsonReport([input], { reportsDir, dataCutoffTimestamp: CUTOFF });
    const report = JSON.parse(fs.readFileSync(file, "utf8"));
    const [saved] = report.projects;
    assert.equal(report.meta.reportSerialization.projectPayloadCharacterLimit, budget);
    assert.equal(report.meta.reportSerialization.truncatedProjects, 1);
    assert.equal(saved.dexName, "token-profile", "discovery provenance is not rewritten to a venue");
    assert.equal(resolveStrictCandidateGate(saved).dexName, "Raydium");
    assert.equal(resolveStrictCandidateGate(saved).strictRankEligible, true);
    for (const side of ["buyQuote", "sellQuote"]) {
      assert.deepEqual(saved.executionProof[side], original.executionProof[side], side);
    }
    assert.equal(saved.executionProof.safetyVerified, false);
    assert.equal(saved.finalSelectionQualified, false);
    assert.equal(isLiveExecutionReady(saved), false);
    assert.ok(JSON.stringify(saved).length < 40_000);
    assert.deepEqual(original, before);
    t.mock.restoreAll();
    assert.equal(routeQuoteFresh(saved), false);
    assert.equal(resolveStrictCandidateGate(saved).strictRankEligible, false);
  });
}

for (const budget of [BUDGET, 8_000]) {
  test(`Top10 late producer proof survives projection then JSON at ${budget} chars`, (t) => {
    t.mock.method(Date, "now", () => Date.parse(CUTOFF));
    const original = lateProofProfileCandidate();
    const before = structuredClone(original);
    assert.ok(Object.keys(original.executionProof).indexOf("quoteTimestamp") >= 40);
    assert.equal(resolveStrictCandidateGate(original).strictRankEligible, true);
    const [project] = JSON.parse(JSON.stringify(buildTop10CandidateInput([original]))).projects;
    assert.equal(resolveStrictCandidateGate(project).dexName, "Raydium");
    assert.equal(resolveStrictCandidateGate(project).strictRankEligible, true);
    for (const field of ["chainId", "contractAddress", "pairAddress", "quoteTimestamp", "quoteExpiresAt",
      "authorityEvidenceSourceTimestamp", "authorityEvidenceRequired", "authorityEvidenceVerified",
      "authoritySafetyClean", "userAccessEvidenceRequired", "userAccessVerified", "buyQuote", "sellQuote"]) {
      assert.deepEqual(project.executionProof[field], original.executionProof[field], field);
    }
    const reportsDir = fs.mkdtempSync(path.join(os.tmpdir(), "top10-proof-budget-"));
    t.after(() => fs.rmSync(reportsDir, { recursive: true, force: true }));
    const previous = process.env.REPORT_MAX_PROJECT_PAYLOAD_CHARS;
    process.env.REPORT_MAX_PROJECT_PAYLOAD_CHARS = String(budget);
    t.after(() => { if (previous === undefined) delete process.env.REPORT_MAX_PROJECT_PAYLOAD_CHARS;
      else process.env.REPORT_MAX_PROJECT_PAYLOAD_CHARS = previous; });
    const file = writeJsonReport([project], { reportsDir, dataCutoffTimestamp: CUTOFF });
    const [saved] = JSON.parse(fs.readFileSync(file, "utf8")).projects;
    assert.equal(resolveStrictCandidateGate(saved).dexName, "Raydium");
    assert.equal(resolveStrictCandidateGate(saved).strictRankEligible, true);
    assert.equal(saved.finalSelectionQualified, false);
    assert.deepEqual(original, before);
    t.mock.restoreAll();
    assert.equal(isLiveExecutionReady(saved), false);
    assert.equal(resolveStrictCandidateGate(saved).strictRankEligible, false);
  });
}

test("Top10 proof projection retains unknown, expired and foreign current denials over recovered routes", (t) => {
  t.mock.method(Date, "now", () => Date.parse(CUTOFF));
  const foreignMint = "hKZDfZnkHZxd9agRDNPyDv4iT6LmAurJnpRtj9wpump";
  const cases = [
    proof => { proof.executionStatus = "UNKNOWN"; },
    proof => { proof.sellQuoteVerified = false; },
    proof => { proof.quoteExpiresAt = ISSUED; },
    proof => { proof.quote = { sell: { verified: true, timestamp: ISSUED, expiresAt: ISSUED } }; },
    proof => { proof.quotes = { buy: { verified: true, timestamp: ISSUED, expiresAt: ISSUED } }; },
    proof => { proof.chainId = "base"; },
    proof => { proof.contractAddress = foreignMint; },
    proof => { proof.pairAddress = "BPM1GwKB5xfjDLY1ftZ4o3M1AMxmMs9BbgfDoLPgGh2K"; },
    proof => { proof.verifiedContractAddress = foreignMint; },
    proof => { proof.normalizedChain = "base"; },
    proof => { proof.buyQuote = { ...proof.buyQuote, fromToken: { address: foreignMint } }; },
    proof => { proof.sellQuote = { ...proof.sellQuote, inputMint: foreignMint }; },
    proof => { proof.buyQuote = null; proof.sellQuote = null; },
  ];
  for (const [index, change] of cases.entries()) {
    const original = lateProofProfileCandidate();
    change(original.executionProof);
    assert.equal(resolveStrictCandidateGate(original).strictRankEligible, false, `input ${index}`);
    const [saved] = JSON.parse(JSON.stringify(buildTop10CandidateInput([original]))).projects;
    assert.equal(resolveStrictCandidateGate(saved).strictRankEligible, false, `projection ${index}`);
    assert.equal(saved.finalSelectionQualified, false);
  }
});

test("Top10 proof projection bounds normalized fields and excludes raw provider graphs", () => {
  const original = lateProofProfileCandidate();
  original.executionProof.providerPayload = { body: "x".repeat(500_000) };
  original.executionProof.unrelatedGraph = { body: "x".repeat(500_000) };
  original.executionProof.buyQuote.raw = { body: "x".repeat(500_000) };
  original.executionProof.supportingSources = Array.from({ length: 50 }, () => "s".repeat(5000));
  const [saved] = buildTop10CandidateInput([original]).projects;
  assert.equal(saved.executionProof.providerPayload, undefined);
  assert.equal(saved.executionProof.unrelatedGraph, undefined);
  assert.equal(saved.executionProof.buyQuote.raw, undefined);
  assert.ok(saved.executionProof.supportingSources.length <= 9);
  assert.ok(saved.executionProof.supportingSources[0].length <= 1000);
  assert.ok(JSON.stringify(saved.executionProof).length < 20_000);
});

for (const { budget, boundedWriter } of BUDGET_CASES) {
  test(`valid frozen proof frame survives ${boundedWriter ? "bounded" : "raw"} serialization at ${budget} chars`, (t) => {
    const original = { ...recoveredProfileCandidate(),
      deepEvaluationState: "DEEP_EVALUATED", coreEvidenceState: "CORE_EVIDENCE_READY",
      coreEvidenceCoveragePct: 92, advisoryEvidenceCoveragePct: 0,
      pipelineScore: 75, finalDecisionScore: 75, finalIntegrityPipelineScore: 75, finalSelectionState: "RESEARCH_ONLY",
      finalIntegrityVerdict: "Research Only - Not Actionable", finalBlockingReasons: [],
      liveActionStatus: "RESEARCH_WATCHLIST",
    };
    original.executionProof = { ...original.executionProof,
      executionProofState: "LIVE_EXECUTION_READY", routeTruthStatus: "LIVE_EXECUTION_READY",
      liveExecutionReady: true, safetyVerified: true, transferTaxEvidenceRequired: false,
      authorityEvidenceRequired: false, userAccessEvidenceRequired: false,
    };
    const before = structuredClone(original);
    t.mock.method(Date, "now", () => Date.parse(CUTOFF));
    assert.equal(isLiveExecutionReady(original), true, "synthetic historical proof is valid only at cutoff");
    const summary = summarizeEvidenceFunnel([original]);
    assert.equal(summary.verifiedRoutes, 1);
    assert.equal(summary.fullyQualified, 0);
    const meta = { scanRunId: "synthetic-budget-frozen-frame", dataCutoffTimestamp: CUTOFF };
    meta.evidenceFunnelSnapshot = createEvidenceFunnelSnapshot([original], summary, meta);
    assert.ok(meta.evidenceFunnelSnapshot, "frame is valid before any serialization");
    t.mock.restoreAll();
    assert.equal(isLiveExecutionReady(original), false);

    const reportsDir = fs.mkdtempSync(path.join(os.tmpdir(), "report-budget-frozen-frame-"));
    t.after(() => fs.rmSync(reportsDir, { recursive: true, force: true }));
    const previous = process.env.REPORT_MAX_PROJECT_PAYLOAD_CHARS;
    process.env.REPORT_MAX_PROJECT_PAYLOAD_CHARS = String(budget);
    t.after(() => { if (previous === undefined) delete process.env.REPORT_MAX_PROJECT_PAYLOAD_CHARS;
      else process.env.REPORT_MAX_PROJECT_PAYLOAD_CHARS = previous; });
    const input = boundedWriter ? compactProjectForReportWriters(original) : original;
    const file = writeJsonReport([input], { ...meta, reportsDir });
    const report = JSON.parse(fs.readFileSync(file, "utf8"));
    assert.equal(report.meta.reportSerialization.projectPayloadCharacterLimit, budget);
    const frozen = getFrozenEvidenceFunnel(report.projects, report.meta);
    assert.ok(frozen, "budget compaction must preserve the valid frozen cohort fingerprint");
    assert.equal(frozen.verifiedRoutes, 1);
    assert.equal(frozen.fullyQualified, 0);
    assert.equal(frozen.evidenceBasis, "FROZEN_SCAN");
    assert.equal(frozen.asOfTimestamp, CUTOFF);
    assert.equal(report.projects[0].finalSelectionQualified, false);
    assert.equal(isLiveExecutionReady(report.projects[0]), false, "historical frame never refreshes an expired route");
    assert.ok(JSON.stringify(report.projects[0]).length < budget * 2);
    assert.deepEqual(original, before);
  });
}
