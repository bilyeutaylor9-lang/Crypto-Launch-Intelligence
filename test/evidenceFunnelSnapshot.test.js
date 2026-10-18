import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createEvidenceFunnelSnapshot, getFrozenEvidenceFunnel } from "../src/reports/evidenceFunnelSnapshot.js";
import { compactMetaForReportWriters, compactProjectsForReportWriters } from "../src/reports/reportPayloadCompactor.js";
import { hasVerifiedExecutionRoute, summarizeEvidenceFunnel } from "../src/kernel/evidenceFunnelSummary.js";
import { isLiveExecutionReady } from "../src/execution/routeTruthV2.js";
import { writeJsonReport } from "../src/reports/jsonReportEngine.js";

const CUTOFF = "2026-10-14T13:22:10.200Z";
const ISSUED = "2026-10-14T13:22:00.000Z";
const EXPIRES = "2026-10-14T13:23:00.000Z";
const META = { scanRunId: "scan-05ca1cb6", dataCutoffTimestamp: CUTOFF };
const POLICY = summarizeEvidenceFunnel([]).policy;

function project(id = "A") {
  const identity = { chain: "solana", tokenAddress: `MintCase${id}`, poolAddress: `PoolCase${id}` };
  const buyQuote = { verified: true, timestamp: ISSUED, expiresAt: EXPIRES };
  const sellQuote = { verified: true, timestamp: ISSUED, expiresAt: EXPIRES };
  const route = { ...identity, routeType: "DEX", routeTruthStatus: "LIVE_EXECUTION_READY",
    exactIdentityVerified: true, buyQuoteVerified: true, sellQuoteVerified: true,
    quoteAgeSeconds: 0, quoteTimestamp: ISSUED, quoteExpiresAt: EXPIRES,
    liquidityUsd: 250_000, estimatedRoundTripSlippagePct: 1, buyQuote, sellQuote };
  return {
    ...identity, deepEvaluationState: "DEEP_EVALUATED", coreEvidenceState: "CORE_EVIDENCE_READY",
    coreEvidenceCoveragePct: 92, advisoryEvidenceCoveragePct: 50, finalSelectionState: "RESEARCH_ONLY",
    finalSelectionQualified: false, engineDataReadiness: { status: "CORE_READY", coreDataStarved: false,
      coreEvidenceCoveragePct: 92, advisoryEvidenceCoveragePct: 50, advisoryGapCount: 0 },
    canonicalExecutionRoute: route,
    executionProof: { ...route, executionProofState: "LIVE_EXECUTION_READY", liveExecutionReady: true,
      safetyVerified: true, quoteVerified: true, slippageIsHeuristic: false,
      transferTaxEvidenceRequired: false, authorityEvidenceRequired: false, userAccessEvidenceRequired: false,
      quoteFreshnessSeconds: 10.2 },
  };
}

// The scan's canonical output at CUTOFF, not a report-time rerun of route checks.
function scanSummary(count = 1) {
  return { standardCandidates: count, deepDeferred: 0, deepEvaluated: count,
    coreEvidenceReady: count, coreEvidencePartial: 0, coreDataStarved: 0, coreEvidenceUnknown: 0,
    advisoryDataGaps: 0, verifiedRoutes: count, fullyQualified: 0, deterministicallyBlocked: 0,
    coreEvidenceCoveragePct: 92, advisoryEvidenceCoveragePct: 50, coreDataStarvedPct: 0,
    healthyCoreEvidence: true, healthyDecisionEvidence: true, decisionEvidenceComplete: count,
    conclusivelyRejected: 0, unresolvedDecisionEvidence: 0, decisionProofMissingFields: {},
    insufficientEvidenceCandidates: 0, selectionOutcome: "NO_EDGE_FOUND", emptyResultLabel: "NO_FULLY_QUALIFIED_MOVE", policy: POLICY };
}

function capture(rows = [project()], summary = scanSummary()) {
  const snapshot = createEvidenceFunnelSnapshot(rows, summary, META);
  assert.ok(snapshot, "valid historical scan must be captured without report-time route revalidation");
  return { rows, snapshot, meta: { ...META, evidenceFunnelSnapshot: snapshot } };
}

test("expired-now quotes retain six frozen historical counters without becoming current route proof", (t) => {
  const nowFunction = Date.now;
  assert.ok(Date.parse(ISSUED) <= Date.parse(CUTOFF) && Date.parse(CUTOFF) < Date.parse(EXPIRES));
  assert.ok(Date.now() > Date.parse(EXPIRES));
  const rows = Array.from({ length: 6 }, (_, index) => project(String(index)));
  const before = structuredClone(rows);
  assert.ok(rows.every((row) => isLiveExecutionReady(row) === false && hasVerifiedExecutionRoute(row) === false));
  assert.equal(summarizeEvidenceFunnel(rows).verifiedRoutes, 0);
  const { snapshot, meta } = capture(rows, scanSummary(6));
  assert.equal(snapshot.schemaVersion, 1);
  assert.equal(snapshot.runId, META.scanRunId);
  assert.equal(snapshot.cutoff, CUTOFF);
  assert.match(snapshot.cohortFingerprint, /^[a-f0-9]{64}$/);
  const directory = mkdtempSync(path.join(tmpdir(), "evidence-funnel-snapshot-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, "meta.json");
  writeFileSync(file, JSON.stringify(meta));
  const frozen = getFrozenEvidenceFunnel(rows, JSON.parse(readFileSync(file, "utf8")));
  assert.equal(frozen.verifiedRoutes, 6);
  assert.equal(frozen.evidenceBasis, "FROZEN_SCAN");
  assert.equal(frozen.asOfTimestamp, CUTOFF);
  assert.ok(rows.every((row) => isLiveExecutionReady(row) === false && hasVerifiedExecutionRoute(row) === false));
  assert.deepEqual(rows, before, "provider timestamps and all other input fields remain untouched");
  assert.strictEqual(Date.now, nowFunction);
});

test("snapshot and reader results are immutable detached canonical summary clones", () => {
  const summary = scanSummary();
  const { rows, snapshot, meta } = capture([project()], summary);
  assert.notStrictEqual(snapshot.summary, summary);
  assert.notStrictEqual(snapshot.summary.decisionProofMissingFields, summary.decisionProofMissingFields);
  summary.verifiedRoutes = 0;
  summary.decisionProofMissingFields.IDENTITY = 1;
  assert.equal(snapshot.summary.verifiedRoutes, 1);
  assert.deepEqual(snapshot.summary.decisionProofMissingFields, {});
  assert.ok(Object.isFrozen(snapshot) && Object.isFrozen(snapshot.summary) && Object.isFrozen(snapshot.summary.decisionProofMissingFields));
  assert.throws(() => { snapshot.summary.verifiedRoutes = 99; }, TypeError);
  const frozen = getFrozenEvidenceFunnel(rows, meta);
  assert.ok(Object.isFrozen(frozen) && Object.isFrozen(frozen.decisionProofMissingFields));
  assert.notStrictEqual(frozen, snapshot.summary);
  assert.notStrictEqual(frozen.decisionProofMissingFields, snapshot.summary.decisionProofMissingFields);
});

test("a final policy rejection does not erase independently verified historical route evidence", () => {
  const blocked = {...project(), finalSelectionState: "BLOCKED", riskScore: 99};
  const summary = {...scanSummary(), deterministicallyBlocked: 1, conclusivelyRejected: 1, decisionEvidenceComplete: 0};
  const {meta} = capture([blocked], summary);
  const frozen = getFrozenEvidenceFunnel([blocked], meta);
  assert.equal(frozen.verifiedRoutes, 1);
  assert.equal(frozen.fullyQualified, 0);
  assert.equal(isLiveExecutionReady(blocked), false);
});

test("stored positives cannot claim quotes observed later than cutoff or expired before it", () => {
  for (const patch of [{quoteTimestamp: EXPIRES}, {quoteExpiresAt: ISSUED}, {quoteExpiresAt: null}]) {
    const p = project();
    Object.assign(p.executionProof, patch);
    assert.equal(createEvidenceFunnelSnapshot([p], scanSummary(), META), null);
  }
  for (const sourceTime of [EXPIRES, null, "2026-10-14T13:16:00.000Z"]) {
    const p = project();
    Object.assign(p.executionProof, {authorityEvidenceRequired: true, authorityEvidenceVerified: true,
      authoritySafetyClean: true, authorityEvidenceSourceTimestamp: sourceTime});
    assert.equal(createEvidenceFunnelSnapshot([p], scanSummary(), META), null);
  }
});

test("dense row and JSON compaction preserve the complete snapshot cohort projection", () => {
  const dense = {...Object.fromEntries(Array.from({length: 1800}, (_, i) => [`advisoryMetric${i}`, "x".repeat(100)])),
    ...project()};
  const {meta} = capture([dense], scanSummary());
  const compacted = compactProjectsForReportWriters([dense]);
  assert.equal(compacted[0].coreEvidenceState, "CORE_EVIDENCE_READY");
  assert.equal(compacted[0].coreEvidenceCoveragePct, 92);
  assert.equal(compacted[0].advisoryEvidenceCoveragePct, 50);
  assert.equal(getFrozenEvidenceFunnel(compacted, compactMetaForReportWriters(meta))?.verifiedRoutes, 1);
  const directory = mkdtempSync(path.join(tmpdir(), "dense-funnel-json-"));
  const cwd = process.cwd();
  try {
    process.chdir(directory);
    const file = writeJsonReport(compacted, compactMetaForReportWriters(meta));
    const report = JSON.parse(readFileSync(file, "utf8"));
    assert.equal(report.projects[0].coreEvidenceState, "CORE_EVIDENCE_READY");
    assert.equal(getFrozenEvidenceFunnel(report.projects, report.meta)?.verifiedRoutes, 1);
  } finally {
    process.chdir(cwd);
    rmSync(directory, {recursive: true, force: true});
  }
});

test("identity case, authoritative proof, raw hard blocks and selection changes invalidate the cohort", () => {
  const { rows, meta } = capture();
  const changes = [
    (p) => { p.tokenAddress = p.tokenAddress.toLowerCase(); },
    (p) => { p.poolAddress = "OtherPool"; },
    (p) => { p.chain = "base"; },
    (p) => { p.executionProof.tokenAddress = "OtherMint"; },
    (p) => { p.canonicalExecutionRoute.poolAddress = "OtherPool"; },
    ...["exactIdentityVerified", "buyQuoteVerified", "sellQuoteVerified", "safetyVerified", "liveExecutionReady"]
      .flatMap((field) => [false, null].map((value) => (p) => { p.executionProof[field] = value; })),
    (p) => { p.executionProof.routeTruthStatus = "REJECTED"; },
    (p) => { p.executionProof.slippageIsHeuristic = true; },
    (p) => { p.executionProof.orderBookDepthVerified = false; },
    (p) => { p.executionProof.authorityEvidenceRequired = true; p.executionProof.authorityEvidenceVerified = false; },
    (p) => { p.executionProof.userAccessEvidenceRequired = true; p.executionProof.userAccessVerified = false; },
    (p) => { p.executionProof.transferTaxEvidenceRequired = true; p.executionProof.transferTaxEvidenceVerified = false; },
    (p) => { p.executionProof.quoteExpiresAt = "2026-10-14T13:22:01.000Z"; },
    (p) => { p.executionProof.authorityEvidenceSourceTimestamp = ISSUED; },
    (p) => { p.executionProof.buyQuote.verified = false; },
    (p) => { p.sellRestricted = true; },
    (p) => { p.blacklistEnabled = true; },
    (p) => { p.canonicalIdentityHardBlock = true; },
    (p) => { p.honeypotDetected = true; },
    (p) => { p.finalBlockingReasons = ["Confirmed honeypot evidence."]; },
    (p) => { p.hardBlockers = ["Contract mismatch"]; },
    (p) => { p.finalSelectionState = "QUALIFIED"; },
    (p) => { p.finalSelectionQualified = true; },
    (p) => { p.deepEvaluationState = "DEFERRED_BEFORE_DEEP"; },
    (p) => { p.engineDataReadiness.coreDataStarved = true; },
    (p) => { p.advisoryDataGaps = true; },
    (p) => { p.coreEvidenceCoveragePct = 91; },
  ];
  changes.forEach((change, index) => {
    const changed = structuredClone(rows);
    change(changed[0]);
    assert.equal(getFrozenEvidenceFunnel(changed, meta), null, `change ${index}`);
  });
  assert.equal(getFrozenEvidenceFunnel([], meta), null);
  assert.equal(getFrozenEvidenceFunnel([...rows, ...rows], meta), null);
});

test("row ordering, bounded compaction, shared quotes and JSON round trips preserve the frame", () => {
  const rows = [project("A"), project("B")];
  rows[0].executionProofRecoveryRoute = { ...rows[0].canonicalExecutionRoute };
  rows[1].rawProviderPayload = { giant: "x".repeat(50_000) };
  const { snapshot, meta } = capture(rows, scanSummary(2));
  const compacted = compactProjectsForReportWriters([...rows].reverse());
  assert.equal(compacted[1].canonicalExecutionRoute.buyQuote, "[repeated data omitted from report]");
  const compactMeta = compactMetaForReportWriters(meta);
  assert.ok(compactMeta.evidenceFunnelSnapshot);
  const frozen = getFrozenEvidenceFunnel(JSON.parse(JSON.stringify(compacted)), JSON.parse(JSON.stringify(compactMeta)));
  assert.ok(frozen);
  assert.equal(frozen.verifiedRoutes, 2);
  assert.equal(frozen.asOfTimestamp, CUTOFF);
  assert.equal(createEvidenceFunnelSnapshot(compacted, scanSummary(2), META).cohortFingerprint, snapshot.cohortFingerprint);
  assert.equal(createEvidenceFunnelSnapshot([...rows].reverse(), scanSummary(2), META).cohortFingerprint, snapshot.cohortFingerprint);
  assert.equal(getFrozenEvidenceFunnel(compacted.slice(1), compactMeta), null, "truncated cohorts never reuse the full count");
});

test("only bounded primitive evidence is inspected, not large metadata or derived snapshots", () => {
  const { rows, meta } = capture();
  const graph = {};
  Object.defineProperty(graph, "doNotRead", { enumerable: true, get() { throw new Error("metadata graph traversed"); } });
  graph.cycle = graph;
  rows[0].rawProviderPayload = graph;
  rows[0].candidateProofState = graph;
  rows[0].evidence = graph;
  meta.discovery = graph;
  assert.equal(getFrozenEvidenceFunnel(rows, meta).verifiedRoutes, 1);
  rows[0].executionProof.buyQuoteVerified = graph;
  assert.equal(getFrozenEvidenceFunnel(rows, meta), null);
});

test("missing, invalid, future and mismatched scan metadata fail closed with the documented aliases", () => {
  const { rows, snapshot, meta } = capture();
  for (const invalid of [undefined, null, [], {}, { runId: "x" }, { completedAt: CUTOFF },
    { ...META, scanRunId: "" }, { ...META, scanRunId: 42 },
    ...["invalid", "2026-02-30T13:22:10.200Z", "2026-10-14", false, 123, {}, new Date(CUTOFF),
      new Date(Date.now() + 60_000).toISOString()].map((dataCutoffTimestamp) => ({ ...META, dataCutoffTimestamp }))]) {
    assert.equal(createEvidenceFunnelSnapshot(rows, scanSummary(), invalid), null);
    assert.equal(getFrozenEvidenceFunnel(rows, { ...invalid, evidenceFunnelSnapshot: snapshot }), null);
  }
  for (const changed of [{ ...meta, scanRunId: "other-run" },
    { ...meta, dataCutoffTimestamp: "2026-10-14T13:22:11.200Z" },
    { ...meta, evidenceFunnelSnapshot: { ...snapshot, schemaVersion: 2 } },
    { ...meta, evidenceFunnelSnapshot: { ...snapshot, cohortFingerprint: "not-a-hash" } }]) {
    assert.equal(getFrozenEvidenceFunnel(rows, changed), null);
  }
  assert.equal(getFrozenEvidenceFunnel(rows, META), null);
  const aliases = { runId: META.scanRunId, completedAt: CUTOFF };
  assert.deepEqual(createEvidenceFunnelSnapshot(rows, scanSummary(), aliases), snapshot);
  assert.ok(getFrozenEvidenceFunnel(rows, { ...aliases, evidenceFunnelSnapshot: snapshot }));
  assert.equal(getFrozenEvidenceFunnel(rows, { ...meta, runId: "ignored-alias", completedAt: "invalid" }).verifiedRoutes, 1);
});

test("canonical arithmetic, count types, percentages and decision states are validated on capture and read", () => {
  const { rows, snapshot, meta } = capture();
  const bad = [
    ...["standardCandidates", "deepDeferred", "deepEvaluated", "coreEvidenceReady", "coreEvidencePartial",
      "coreDataStarved", "coreEvidenceUnknown", "advisoryDataGaps", "deterministicallyBlocked", "conclusivelyRejected"]
      .map((field) => ({ [field]: scanSummary()[field] + 1 })),
    ...[-1, 0.5, 2, "1", null, NaN, Infinity].map((verifiedRoutes) => ({ verifiedRoutes })),
    { fullyQualified: 1 }, { decisionEvidenceComplete: 0 }, { unresolvedDecisionEvidence: 1 },
    { insufficientEvidenceCandidates: 1 }, { coreEvidenceCoveragePct: 101 },
    { coreEvidenceCoveragePct: 91 }, { advisoryEvidenceCoveragePct: -1 }, { coreDataStarvedPct: 1 },
    { healthyCoreEvidence: false }, { healthyDecisionEvidence: false }, { healthyDecisionEvidence: "true" },
    { selectionOutcome: "EDGE_FOUND" }, { emptyResultLabel: "NO_VERIFIED_ROUTE" },
    { decisionProofMissingFields: { IDENTITY: 1 } }, { decisionProofMissingFields: { UNKNOWN: 1 } },
    { decisionProofMissingFields: { SAFETY: 0 } }, { policy: {} }, { inventedPositive: 1 },
  ];
  bad.forEach((patch, index) => {
    const invalid = { ...scanSummary(), ...patch };
    assert.equal(createEvidenceFunnelSnapshot(rows, invalid, META), null, `capture ${index}`);
    assert.equal(getFrozenEvidenceFunnel(rows, { ...meta, evidenceFunnelSnapshot: { ...snapshot, summary: invalid } }), null, `read ${index}`);
  });
  const missing = scanSummary();
  delete missing.verifiedRoutes;
  assert.equal(createEvidenceFunnelSnapshot(rows, missing, META), null);
});

test("unknown or derived positive flags never supply an authoritative positive bound", () => {
  for (const p of [
    { ...project(), executionProof: undefined, executionProofVerified: true, liveExecutionReady: true },
    { ...project(), executionProof: {} },
    { ...project(), executionProof: { liveExecutionReady: true, executionProofState: "LIVE_EXECUTION_READY" } },
    { ...project(), honeypotDetected: true },
    { ...project(), executionProof: { ...project().executionProof, buyQuoteVerified: false } },
    { ...project(), executionProof: { ...project().executionProof, liquidityUsd: null } },
  ]) {
    assert.equal(createEvidenceFunnelSnapshot([p], scanSummary(), META), null);
  }
  const unknown = { chain: "solana", tokenAddress: "UnknownMint", poolAddress: "UnknownPool",
    deepEvaluationState: "DEEP_EVALUATED", coreEvidenceState: "CORE_EVIDENCE_UNKNOWN" };
  const summary = summarizeEvidenceFunnel([unknown]);
  const { meta } = capture([unknown], summary);
  assert.equal(getFrozenEvidenceFunnel([unknown], meta).verifiedRoutes, 0);
});

test("progressive deferred, selected-for-deep, unclassified and legacy rows use kernel denominators", () => {
  const rows = [
    { chain: "solana", tokenAddress: "UnknownMint", poolAddress: "UnknownPool", deepEvaluationState: "DEEP_EVALUATED" },
    { deepEvaluationState: "DEEP_EVALUATED", finalSelectionState: "BLOCKED", honeypotDetected: true,
      coreEvidenceState: "CORE_EVIDENCE_READY", coreEvidenceCoveragePct: 90 },
    { deepEvaluationState: "DEFERRED_BEFORE_DEEP", coreEvidenceState: "CORE_READY" },
    { deepEvaluationState: "SELECTED_FOR_DEEP" },
    { name: "Not evaluated" },
  ];
  const summary = summarizeEvidenceFunnel(rows);
  assert.equal(summary.standardCandidates, 5);
  assert.equal(summary.deepEvaluated, 2);
  assert.equal(summary.deepDeferred, 1);
  const { meta } = capture(rows, summary);
  assert.deepEqual(getFrozenEvidenceFunnel(rows, meta), { ...summary, evidenceBasis: "FROZEN_SCAN", asOfTimestamp: CUTOFF });
  const legacy = rows.map(({ deepEvaluationState, ...row }) => row);
  const legacySummary = summarizeEvidenceFunnel(legacy);
  assert.equal(legacySummary.deepEvaluated, 5);
  assert.ok(createEvidenceFunnelSnapshot(legacy, legacySummary, META));
  const empty = summarizeEvidenceFunnel([]);
  assert.ok(createEvidenceFunnelSnapshot([], empty, META));
});
