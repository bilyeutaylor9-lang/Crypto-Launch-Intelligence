import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import { setTimeout } from "node:timers/promises";
import { analyzeFinalSelectionIntegrity } from "../src/engines/finalSelectionIntegrityEngine.js";
import { finalizeExecutionPublicationSnapshot, revalidateExecutionAtPublication, revalidateExecutionPublicationBoundary } from "../src/execution/executionPublicationBoundary.js";
import { hasFreshTokenAuthorityEvidence, isLiveExecutionReady, routeQuoteFresh } from "../src/execution/routeTruthV2.js";
import { attachCandidateTruthState } from "../src/kernel/candidateTruthState.js";
import { summarizeEvidenceFunnel } from "../src/kernel/evidenceFunnelSummary.js";
import { decisionCompleteProject } from "./fixtures/decisionCompleteProject.js";
import { buildGuardedLiveRanking } from "../src/ranking/guardedLiveRankingEngine.js";

const rankingOptions = {
  policy: {source: "test", winnerPublished: false, bestModel: null, adequateModels: [], rejectionReasons: []},
  env: {LIVE_RANKING_MIN_SCORE: "70", LIVE_RANKING_MIN_MICRO_COVERAGE: "0.6"},
};

function rankingFixture(lifetimeMs) {
  return {...publicationFixture(lifetimeMs), pipelineScore: 84,
    rawEvidence: Object.fromEntries(["independentBuyerAccelerationScore", "qualifiedSmartWalletFlowScore",
      "liquidityFormationScore", "relativeStrengthScore", "volumeAccelerationScore", "verifiedCatalystScore",
      "safetyScore"].map(key => [key, 95])),
    utilityQualityScore: 90, realUtilityQualified: true, utilityClassification: "REAL_UTILITY",
    utilityEvidenceFamilies: ["PRODUCT", "DEVELOPMENT", "ADOPTION"], researchOpportunityScore: 95,
    researchOpportunityCoverage: {observedComponentCount: 8, expectedComponentCount: 10, coveragePct: 80}};
}

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

test("snapshot projection cannot publish a flag that expires while ranking is computed", async () => {
  const project = selectedFixture(1000);
  const original = JSON.stringify(project);
  const rawEvidence = evidenceBytes(project);
  let passes = 0;
  const snapshot = await finalizeExecutionPublicationSnapshot([project], async projects => {
    passes++;
    const summary = summarizeEvidenceFunnel(projects);
    if (passes === 1) {
      assert.equal(summary.verifiedRoutes, 1);
      await setTimeout(Math.max(1, Date.parse(project.quoteExpiresAt) - Date.now() + 15));
    }
    return {projects, summary, completedAt: "1900-01-01T00:00:00.000Z"};
  });
  assert.equal(snapshot.executionPublicationPasses, 2);
  assert.equal(passes, 2);
  assertDemoted(snapshot.projects[0]);
  assert.equal(snapshot.summary.verifiedRoutes, 0);
  assert.equal(snapshot.summary.fullyQualified, 0);
  assert.ok(Date.parse(snapshot.completedAt) > Date.parse(project.quoteExpiresAt));
  assert.ok(Date.parse(snapshot.completedAt) <= Date.now());
  assert.equal(evidenceBytes(snapshot.projects[0]), rawEvidence);
  assert.equal(JSON.stringify(project), original);
});

test("a fresh snapshot closes in one pass without manufacturing a qualified candidate", async () => {
  const project = {...publicationFixture(), finalSelectionQualified: false};
  const before = JSON.stringify(project);
  const snapshot = await finalizeExecutionPublicationSnapshot([project], projects => ({
    projects, summary: summarizeEvidenceFunnel(projects),
  }));
  assert.equal(snapshot.executionPublicationPasses, 1);
  assert.equal(snapshot.projects[0], project);
  assert.equal(snapshot.summary.verifiedRoutes, 1);
  assert.equal(snapshot.summary.fullyQualified, 0);
  assert.equal(JSON.stringify(project), before);
});

test("real ranking honors current final vetoes and publication converges without losing a verified route", async () => {
  for (const veto of [{aiDecision: "Reject"}, {allocationBucket: "Defensive Avoid"},
    ...[false, null, "UNKNOWN"].map(value => ({finalSelectionQualified: value, finalSelectionState: "UNKNOWN"})),
    {finalSelectionState: "UNKNOWN"}]) {
    const project = {...rankingFixture(), ...veto};
    const before = JSON.stringify(project);
    const snapshot = await finalizeExecutionPublicationSnapshot([project], projects => {
      const ranked = buildGuardedLiveRanking(projects, rankingOptions);
      return {projects: ranked.ranked, summary: ranked.summary};
    }, {maxPasses: 3});
    assert.equal(snapshot.executionPublicationPasses, 1);
    assert.equal(snapshot.projects[0].liveExecutionReady, true);
    assert.equal(snapshot.projects[0].finalSelectionQualified, false);
    assert.notEqual(snapshot.projects[0].liveActionStatus, "MICRO_TEST_ELIGIBLE");
    assert.equal(snapshot.summary.verifiedRoutes, 1);
    assert.equal(snapshot.summary.fullyQualified, 0);
    assert.equal(JSON.stringify(project), before);
  }
});

test("publication retries use original scorer inputs even when another candidate expires", async () => {
  const short = rankingFixture(1000);
  const unchanged = {name: "Unchanged research candidate", symbol: "URC", pipelineScore: 84,
    researchOpportunityScore: 80, researchOpportunityCoverage: {coveragePct: 80}, utilityQualityScore: 80,
    realUtilityQualified: true, utilityClassification: "REAL_UTILITY",
    utilityEvidenceFamilies: ["PRODUCT", "DEVELOPMENT", "ADOPTION"]};
  const options = {...rankingOptions, env: {}};
  const expected = buildGuardedLiveRanking([unchanged], options).ranked[0];
  const before = JSON.stringify([short, unchanged]);
  let passes = 0;
  const snapshot = await finalizeExecutionPublicationSnapshot([short, unchanged], async projects => {
    const ranking = buildGuardedLiveRanking(projects, options);
    if (++passes === 1) await setTimeout(Math.max(1, Date.parse(short.quoteExpiresAt) - Date.now() + 15));
    return {projects: ranking.ranked, summary: ranking.summary};
  });
  const actual = snapshot.projects.find(project => project.symbol === unchanged.symbol);
  assert.equal(snapshot.executionPublicationPasses, 2);
  assert.equal(actual.pipelineScore, expected.pipelineScore);
  assert.equal(actual.legacyProductionScore, 84);
  assert.deepEqual(actual.rawEvidence, expected.rawEvidence);
  assert.equal(JSON.stringify([short, unchanged]), before);
});

test("fresh complete evidence remains eligible after canonical final integrity checks", async () => {
  const snapshot = await finalizeExecutionPublicationSnapshot([rankingFixture()], projects => {
    const ranking = buildGuardedLiveRanking(projects, rankingOptions);
    return {projects: ranking.ranked, summary: ranking.summary};
  });
  assert.equal(snapshot.executionPublicationPasses, 1);
  assert.equal(snapshot.projects[0].liveActionStatus, "MICRO_TEST_ELIGIBLE");
  assert.equal(snapshot.summary.fullyQualified, 1);
});

test("a lower guarded score clears inherited selectors before snapshot projection closes", async () => {
  const project = analyzeFinalSelectionIntegrity({...rankingFixture(), researchOpportunityScore: 50});
  assert.equal(project.finalSelectionQualified, true);
  assert.equal(project.finalCandidateSelected, true);
  const before = JSON.stringify(project);
  const snapshot = await finalizeExecutionPublicationSnapshot([project], projects => {
    const ranking = buildGuardedLiveRanking(projects, {...rankingOptions, env: {
      LIVE_RANKING_MODEL: "research", LIVE_RANKING_MIN_SCORE: "40", LIVE_RANKING_MIN_MICRO_COVERAGE: "0.6",
    }});
    return {projects: ranking.ranked, summary: ranking.summary};
  }, {maxPasses: 3});
  assert.equal(snapshot.executionPublicationPasses, 1);
  assert.equal(snapshot.projects[0].liveExecutionReady, true);
  assert.equal(snapshot.projects[0].finalSelectionQualified, false);
  assert.equal(snapshot.projects[0].finalCandidateSelected, false);
  assert.equal(snapshot.projects[0].executionVerifiedSelected, false);
  assert.equal(snapshot.projects[0].finalSelectionState, "BLOCKED");
  assert.equal(snapshot.summary.verifiedRoutes, 1);
  assert.equal(snapshot.summary.fullyQualified, 0);
  assert.equal(JSON.stringify(project), before);
});

test("expiry during ranking cannot hide the outer retry behind cleared readiness flags", async () => {
  const RealDate = globalThis.Date;
  let now = RealDate.now();
  let deadline;
  const clock = () => {
    const stack = new Error().stack || "";
    if (deadline && stack.includes("scoreCandidate") && stack.includes("revalidateExecutionAtPublication")) now = deadline + 1;
    return now;
  };
  globalThis.Date = class extends RealDate {
    constructor(...args) { super(...(args.length ? args : [clock()])); }
    static now() { return clock(); }
  };
  try {
    const project = rankingFixture(30_000);
    deadline = Date.parse(project.quoteExpiresAt);
    let calls = 0;
    const snapshot = await finalizeExecutionPublicationSnapshot([project], projects => {
      const ranking = buildGuardedLiveRanking(projects, {...rankingOptions, env: {...rankingOptions.env,
        MICRO_TEST_MODE: "true", MICRO_TEST_BANKROLL_USD: "1000"}});
      if (++calls === 1) now = deadline + 1;
      return {projects: ranking.ranked, summary: ranking.summary};
    });
    assert.equal(snapshot.executionPublicationPasses, 2);
    assert.equal(snapshot.projects[0].liveExecutionReady, false);
    assert.equal(snapshot.projects[0].executionProof.liveExecutionReady, false);
    assert.notEqual(snapshot.projects[0].liveActionStatus, "MICRO_TEST_ELIGIBLE");
    assert.equal(snapshot.summary.microTestEligible, 0);
    assert.equal(snapshot.summary.fullyQualified, 0);
    assert.equal(snapshot.projects[0].microTestPlan.maximumExperimentAllocationUsd, null);
    assert.equal(snapshot.projects[0].microTestPlan.label, "NOT_ELIGIBLE");
  } finally { globalThis.Date = RealDate; }
});

test("unstable or incomplete snapshot projections fail closed within the pass budget", async () => {
  let calls = 0;
  await assert.rejects(finalizeExecutionPublicationSnapshot([{}], projects => {
    calls++;
    return {projects: projects.map(project => ({...project, liveExecutionReady: true}))};
  }, {maxPasses: 2}), /did not stabilize/);
  assert.equal(calls, 2);
  await assert.rejects(finalizeExecutionPublicationSnapshot([{}], () => ({projects: []})), /complete candidate universe/);
  for (const maxPasses of [0, -1, 1.5, 17, "UNKNOWN"]) {
    await assert.rejects(finalizeExecutionPublicationSnapshot([], () => ({projects: []}), {maxPasses}), RangeError);
  }
  await assert.rejects(finalizeExecutionPublicationSnapshot([], null), TypeError);
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
  const boundary = source.indexOf("let publication = await finalizeExecutionPublicationSnapshot(results");
  const capture = source.indexOf("reportMeta.forwardEvidence = await runForwardEvidenceCapture");
  const persistence = source.indexOf("const alphaTruth = persistAlphaTruthMemory(results, reportMeta)");
  const ranking = source.indexOf("const guardedLiveRanking = buildGuardedLiveRanking(currentProjects");
  const semantic = source.indexOf("scannerSemanticHealth: buildScannerSemanticHealth(ranked");
  const cutoff = source.indexOf("const completedAt = publication.completedAt");
  const memory = source.indexOf("const supabaseMemoryPath = writeSupabaseMemoryReport(supabaseMemory)");
  assert.ok(memory >= 0 && memory < boundary && boundary < ranking && ranking < semantic && semantic < cutoff);
  assert.ok(cutoff < capture && capture < persistence);
  assert.match(source.slice(capture, persistence), /now: completedAt/);
  assert.match(source.slice(cutoff, capture), /completedAt,\s+dataCutoffTimestamp: completedAt/);
});

test("offline baseline traverses the same publication stage without fixture, clock or network changes", () => {
  const source = fs.readFileSync(new URL("../src/ops/runOfflineScannerSmoke.js", import.meta.url), "utf8");
  const pipeline = source.indexOf("const results = await runIntelligencePipeline(");
  const boundary = source.indexOf("const publication = await finalizeExecutionPublicationSnapshot(results");
  const ranking = source.indexOf("const ranked = buildGuardedLiveRanking(currentProjects");
  const semantic = source.indexOf("semantic: buildScannerSemanticHealth(ranked");
  assert.ok(pipeline >= 0 && pipeline < boundary && boundary < ranking && ranking < semantic);
  assert.match(source.slice(boundary, ranking), /finalizeExecutionPublicationSnapshot\(results, currentProjects =>/);
});
