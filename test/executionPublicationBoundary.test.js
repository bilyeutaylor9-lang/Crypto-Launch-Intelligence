import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import { setTimeout } from "node:timers/promises";
import { analyzeFinalSelectionIntegrity } from "../src/engines/finalSelectionIntegrityEngine.js";
import { revalidateExecutionAtPublication, revalidateExecutionPublicationBoundary } from "../src/execution/executionPublicationBoundary.js";
import { hasFreshTokenAuthorityEvidence, isLiveExecutionReady, routeQuoteFresh } from "../src/execution/routeTruthV2.js";
import { attachCandidateTruthState } from "../src/kernel/candidateTruthState.js";
import { summarizeEvidenceFunnel } from "../src/kernel/evidenceFunnelSummary.js";
import { decisionCompleteProject } from "./fixtures/decisionCompleteProject.js";

function publicationFixture(lifetimeMs = 60_000) {
  const timestamp = new Date().toISOString();
  const expiresAt = new Date(Date.now() + lifetimeMs).toISOString();
  const timing = {
    quoteTimestamp: timestamp, quoteExpiresAt: expiresAt,
    buyQuote: { quoteId: "original-buy-id", verified: true, timestamp, expiresAt,
      amountIn: "100000000", amountOut: "99999000000000000000", source: "exact-provider" },
    sellQuote: { quoteId: "original-sell-id", verified: true, timestamp, expiresAt,
      amountIn: "99999000000000000000", amountOut: "99000000", source: "exact-provider" },
  };
  const base = decisionCompleteProject({ ...timing, quoteAgeSeconds: 0,
    source: "dexscreener", pipelineScore: 82, marketCap: 22_000_000, riskScore: 18,
    trapRiskScore: 12, dex: "Uniswap", quoteAsset: "USDC" });
  base.canonicalExecutionRoute = { ...base.canonicalExecutionRoute, ...timing, quoteAsset: "USDC", venue: "Uniswap" };
  base.executionProof = { ...base.executionProof, ...timing,
    authorityEvidenceSourceTimestamp: timestamp,
    authorityEvidenceSources: ["original-authority-snapshot"],
    provenance: { source: "exact-provider", observedAt: timestamp } };
  return attachCandidateTruthState(base);
}

function selectedFixture(lifetimeMs) {
  const final = analyzeFinalSelectionIntegrity(publicationFixture(lifetimeMs));
  assert.equal(final.finalSelectionQualified, true, JSON.stringify(final.finalWarningReasons));
  return { ...final, finalProjectExecutionReadiness: "FINAL_PROJECT_EXECUTION_READY",
    executionProof: { ...final.executionProof, finalProjectExecutionReadiness: "FINAL_PROJECT_EXECUTION_READY" } };
}

function evidenceBytes(project) {
  const { executionStatus, executionProofState, routeTruthStatus, liveExecutionReady,
    routeExecutionReadiness, finalProjectExecutionReadiness, executionProofActionability,
    executionReady, executionRouteAvailable, executionProofVerified, ...proofEvidence } = project.executionProof;
  return JSON.stringify({ proofEvidence, canonicalExecutionRoute: project.canonicalExecutionRoute,
    executionProofRecoveryRoute: project.executionProofRecoveryRoute,
    executionRoutes: project.executionRoutes, buyQuote: project.buyQuote, sellQuote: project.sellQuote,
    quoteTimestamp: project.quoteTimestamp, quoteExpiresAt: project.quoteExpiresAt,
    contractAddress: project.contractAddress, chain: project.chain, pairAddress: project.pairAddress });
}

function assertDemoted(project) {
  assert.equal(project.liveExecutionReady, false);
  assert.equal(project.executionProof.liveExecutionReady, false);
  assert.notEqual(project.executionProofState, "LIVE_EXECUTION_READY");
  assert.notEqual(project.executionProof.executionProofState, "LIVE_EXECUTION_READY");
  assert.notEqual(project.executionProof.executionProofActionability, "LIVE_EXECUTION_READY");
  assert.equal(project.routeExecutionReadiness, "ROUTE_NOT_READY");
  assert.equal(project.finalProjectExecutionReadiness, "FINAL_PROJECT_NOT_READY");
  assert.equal(project.executionProof.finalProjectExecutionReadiness, "FINAL_PROJECT_NOT_READY");
  assert.equal(project.finalSelectionQualified, false);
  assert.notEqual(project.finalSelectionState, "QUALIFIED");
  assert.equal(project.finalCandidateSelected, false);
  assert.equal(project.executionVerifiedSelected, false);
}

test("proof valid in the pipeline expires during persistence before publication, without clock overrides", async () => {
  const project = selectedFixture(1000);
  const inputBytes = JSON.stringify(project);
  const originalEvidence = evidenceBytes(project);
  assert.equal(isLiveExecutionReady(project), true);
  assert.equal(revalidateExecutionAtPublication(project).finalSelectionQualified, true);
  await setTimeout(Math.max(1, Date.parse(project.quoteExpiresAt) - Date.now() + 10));
  assert.equal(routeQuoteFresh(project), false);
  // Reproduce retained booleans at the actual later publication boundary.
  assert.equal(project.executionProof.liveExecutionReady, true);
  const retainedNegative = { ...project, liveExecutionReady: false, finalSelectionQualified: false,
    finalSelectionState: "INSUFFICIENT_DATA" };
  const rows = [project, project, project, retainedNegative];
  assert.equal(rows.filter((row) => row.liveExecutionReady === true).length, 3);
  assert.equal(rows.filter((row) => row.executionProof.liveExecutionReady === true).length, 4);
  const publications = revalidateExecutionPublicationBoundary(rows);
  const [published] = publications;
  for (const row of publications) assertDemoted(row);
  assertDemoted(published);
  assert.notEqual(published.executionReadinessState, "READY");
  assert.notEqual(published.tradabilityState, "EXECUTION_READY");
  assert.equal(published.candidateProofState.globalRoute.quoteFresh, false);
  assert.equal(published.executionProofVerified, false);
  assert.equal(published.executionRouteAvailable, false);
  assert.equal(evidenceBytes(published), originalEvidence);
  assert.equal(JSON.stringify(project), inputBytes);
  assert.equal(published.buyQuote, project.buyQuote);
  assert.equal(published.executionProof.sellQuote, project.executionProof.sellQuote);
  assert.equal(published.canonicalExecutionRoute, project.canonicalExecutionRoute);
  assert.equal(published.executionProof.verifiedAt, project.executionProof.verifiedAt);
  const funnel = summarizeEvidenceFunnel(publications);
  assert.equal(funnel.verifiedRoutes, 0);
  assert.equal(funnel.fullyQualified, 0);
  assert.equal(funnel.selectionOutcome, "DATA_DEGRADED");
});

test("fresh independent route proof is retained without forcing final qualification", () => {
  const project = publicationFixture();
  const unrelatedExpiredRoute = { chain: "base", contractAddress: "0x0000000000000000000000000000000000000123",
    pairAddress: "0x0000000000000000000000000000000000000456",
    quoteTimestamp: new Date(Date.now() - 60_000).toISOString(), quoteExpiresAt: new Date(Date.now() - 30_000).toISOString() };
  project.executionRoutes = [unrelatedExpiredRoute];
  project.finalSelectionQualified = false;
  assert.equal(isLiveExecutionReady(project), true);
  const published = revalidateExecutionAtPublication(project);
  assert.equal(published, project);
  assert.equal(published.liveExecutionReady, true);
  assert.equal(published.executionProof.liveExecutionReady, true);
  assert.equal(published.finalSelectionQualified, false);
  assert.equal(published.finalSelectionState, "RESEARCH_ONLY");
  assert.equal(summarizeEvidenceFunnel([published]).verifiedRoutes, 1);
  assert.equal(summarizeEvidenceFunnel([published]).fullyQualified, 0);
});

test("fresh proof-owned route evidence is not discarded for missing duplicate raw safety fields", () => {
  const project = publicationFixture();
  for (const key of ["safetyProofStatus", "instantSafetyStatus", "contractSafetyVerified", "canonicalExecutionRoute",
    "buyQuote", "sellQuote", "quoteTimestamp", "quoteExpiresAt"]) delete project[key];
  project.finalSelectionQualified = false;
  assert.equal(isLiveExecutionReady(project), true);
  assert.equal(revalidateExecutionAtPublication(project), project);
});

test("current negative or unknown proof and safety overrule retained execution and selection positives", () => {
  const base = selectedFixture();
  for (const patch of [
    { buyQuoteVerified: false }, { sellQuoteVerified: null }, { exactIdentityVerified: false },
    { safetyVerified: false }, { transferTaxEvidenceVerified: false }, { orderBookDepthVerified: false },
    { slippageIsHeuristic: true }, { authorityEvidenceRequired: true, authorityEvidenceVerified: false },
    { executionProofState: "UNKNOWN", routeTruthStatus: "UNKNOWN", liveExecutionReady: false },
  ]) {
    const project = { ...base, executionProof: { ...base.executionProof, ...patch } };
    const evidence = evidenceBytes(project);
    const published = revalidateExecutionAtPublication(project);
    assertDemoted(published);
    for (const [key, value] of Object.entries(patch)) assert.equal(published.executionProof[key], value, key);
    assert.equal(evidenceBytes(published), evidence);
  }
  for (const patch of [{ honeypotDetected: true }, { sellRestricted: true }, { chainMismatch: true },
    { instantSafetyStatus: "CRITICAL" }]) {
    const published = revalidateExecutionAtPublication({ ...base, ...patch });
    assertDemoted(published);
    assert.notEqual(published.executionReadinessState, "READY");
    assert.notEqual(published.tradabilityState, "EXECUTION_READY");
  }
});

test("authority freshness is checked against the original source time, not proof verifiedAt", () => {
  const base = selectedFixture();
  const sourceTime = new Date(Date.now() - 300_010).toISOString();
  const project = { ...base, executionProof: { ...base.executionProof,
    authorityEvidenceRequired: true, authorityEvidenceVerified: true, authoritySafetyClean: true,
    authorityEvidenceSourceTimestamp: sourceTime } };
  assert.equal(hasFreshTokenAuthorityEvidence(project), false);
  assert.equal(routeQuoteFresh(project), true);
  const evidence = evidenceBytes(project);
  const published = revalidateExecutionAtPublication(project);
  assertDemoted(published);
  assert.equal(published.executionProof.authorityEvidenceSourceTimestamp, sourceTime);
  assert.equal(evidenceBytes(published), evidence);
});

test("current safety veto also demotes a cached verified-safe candidate summary", () => {
  const base = selectedFixture();
  assert.equal(base.candidateProofState.safety.status, "VERIFIED_SAFE");
  const project = {...base, honeypotDetected: true};
  const before = JSON.stringify(project);
  const published = revalidateExecutionAtPublication(project);
  assertDemoted(published);
  assert.equal(published.candidateProofState.safety.status, "BLOCKED");
  assert.ok(published.candidateProofState.safety.deterministicBlocks.length > 0);
  assert.equal(JSON.stringify(project), before);
});

test("fresh route evidence survives qualification demotion from a current final risk veto", () => {
  const project = { ...selectedFixture(), riskScore: 99 };
  const published = revalidateExecutionAtPublication(project);
  assert.equal(published.liveExecutionReady, true);
  assert.equal(published.executionProof.liveExecutionReady, true);
  assert.equal(published.finalSelectionQualified, false);
  assert.equal(published.finalSelectionState, "BLOCKED");
  assert.equal(published.finalCandidateSelected, false);
  assert.equal(published.finalProjectExecutionReadiness, "FINAL_PROJECT_NOT_READY");
  assert.equal(summarizeEvidenceFunnel([published]).verifiedRoutes, 1);
});

test("existing negative and UNKNOWN flags are never promoted by revalidation", () => {
  const base = selectedFixture();
  for (const value of [false, null, "UNKNOWN"]) {
    const project = { ...base, liveExecutionReady: value, finalSelectionQualified: false,
      finalSelectionState: "UNKNOWN", executionVerifiedSelected: false };
    const published = revalidateExecutionAtPublication(project);
    assert.equal(published.liveExecutionReady, value);
    assert.equal(published.executionProof.liveExecutionReady, true);
    assert.equal(published.finalSelectionQualified, false);
    assert.equal(published.finalSelectionState, "UNKNOWN");
    assert.equal(published.executionVerifiedSelected, false);
  }
  const project = { ...base, executionProof: { ...base.executionProof, liveExecutionReady: null } };
  const published = revalidateExecutionAtPublication(project);
  assert.equal(published.liveExecutionReady, false);
  assert.equal(published.executionProof.liveExecutionReady, null);
  assert.equal(published.finalSelectionQualified, false);
});

test("deferred-before-deep candidates are excluded without evaluating or changing them", () => {
  const project = { deepEvaluationState: "DEFERRED_BEFORE_DEEP",
    get executionProof() { throw new Error("deferred execution proof must not be read"); } };
  assert.equal(revalidateExecutionPublicationBoundary([project])[0], project);
  assert.deepEqual(revalidateExecutionPublicationBoundary(null), []);
});

test("publication revalidation uses no transport calls and adds no replacement raw proof", (t) => {
  let transportCalls = 0;
  const forbidden = () => { transportCalls += 1; throw new Error("transport forbidden"); };
  t.mock.method(globalThis, "fetch", forbidden);
  for (const transport of [http, https]) {
    t.mock.method(transport, "request", forbidden);
    t.mock.method(transport, "get", forbidden);
  }
  t.mock.method(net, "connect", forbidden);
  t.mock.method(net, "createConnection", forbidden);
  const project = { liveExecutionReady: true, finalSelectionState: "QUALIFIED", finalSelectionQualified: true };
  const published = revalidateExecutionAtPublication(project);
  assert.equal(published.liveExecutionReady, false);
  assert.equal(published.finalSelectionQualified, false);
  assert.equal(Object.hasOwn(published, "executionProof"), false);
  assert.equal(transportCalls, 0);
});

test("entry point revalidates before the frozen snapshot, with prospective capture and alpha truth still afterward", () => {
  const source = fs.readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  const boundary = source.indexOf("results = revalidateExecutionPublicationBoundary(results)");
  const capture = source.indexOf("reportMeta.forwardEvidence = await runForwardEvidenceCapture");
  const persistence = source.indexOf("const alphaTruth = persistAlphaTruthMemory(results, reportMeta)");
  const ranking = source.indexOf("let guardedLiveRanking = buildGuardedLiveRanking(results");
  const semantic = source.indexOf("const scannerSemanticHealth = buildScannerSemanticHealth(results");
  const cutoff = source.indexOf("const completedAt = new Date().toISOString()");
  const memory = source.indexOf("const supabaseMemoryPath = writeSupabaseMemoryReport(supabaseMemory)");
  assert.ok(memory >= 0 && memory < boundary && boundary < ranking && ranking < semantic && semantic < cutoff);
  assert.ok(cutoff < capture && capture < persistence);
  assert.match(source.slice(capture, persistence), /now: completedAt/);
  assert.match(source.slice(cutoff, capture), /completedAt,\s+dataCutoffTimestamp: completedAt/);
});

test("offline baseline traverses the same publication stage without fixture, clock or network changes", () => {
  const source = fs.readFileSync(new URL("../src/ops/runOfflineScannerSmoke.js", import.meta.url), "utf8");
  const pipeline = source.indexOf("let results = await runIntelligencePipeline(");
  const boundary = source.indexOf("results = revalidateExecutionPublicationBoundary(results)");
  const ranking = source.indexOf("const ranked = buildGuardedLiveRanking(results");
  const semantic = source.indexOf("const semantic = buildScannerSemanticHealth(ranked");
  assert.ok(pipeline >= 0 && pipeline < boundary && boundary < ranking && ranking < semantic);
  assert.equal(source.slice(boundary, ranking).trim(), "results = revalidateExecutionPublicationBoundary(results);");
});
