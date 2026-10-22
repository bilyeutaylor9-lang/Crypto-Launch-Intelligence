import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  buildQualificationFailureMicroscope,
  traceQualificationCandidate,
  runQualificationFailureMicroscope,
  writeQualificationFailureMicroscope,
} from "../src/diagnostics/qualificationFailureMicroscope.js";

const NOW = "2026-10-21T00:06:00.000Z";
const CUTOFF = "2026-10-21T00:06:43.878Z";
const GENERATED = "2026-10-21T00:09:29.042Z";
const clock = () => NOW;
const expiredClock = () => GENERATED;
const token = `0x${"a".repeat(40)}`, pool = `0x${"b".repeat(40)}`;
function project(proof = {}, extra = {}) {
  return { chain: "base", tokenAddress: token, poolAddress: pool, deepEvaluationState: "DEEP_EVALUATED",
    executionProof: { chainId: "base", contractAddress: token, pairAddress: pool,
      buyQuoteVerified: true, sellQuoteVerified: true, quoteTimestamp: "2026-10-21T00:05:43.126Z",
      quoteExpiresAt: "2026-10-21T00:06:13.126Z", quoteFreshnessSeconds: 2, sourceTimestamp: null, ...proof }, ...extra };
}
const freshness = (candidate = project(), options = { clock }) => traceQualificationCandidate(candidate, options).productionGates.QUOTE_FRESHNESS;

// Timing/identity patterns preserved from three original observed recoveries;
// these are fixtures, never a live request or a new market-source assertion.
const realRows = [
  ["tSATdGGSLYBVCrm3pXiib8NmzKcB1iUdjRRseNGssxu", "HBYptNEWREPFK2UmaVtfg8Mfp9D8Xye41Ueo9wZo9oX4", "126", 2],
  ["Ag5mMdBSxm8J893RazD9PGkxWKJ5o3UKdWW4ZmJAey9w", "HndPW2ZkqvoQyZcjEdnP56scNG9SadoSiT9gdjZasgiy", "769", 1],
  ["G8aVC4nk5oPWzTHp4PDm3kAuixCebv9WRQMD93h9pump", "D7rYGDh5RyP4UXPtW2dSUvg8BYkdPSB1ZdAdBKW1zqnX", "457", 2],
].map(([address, pair, ms, age]) => project({ chainId: "solana", contractAddress: address, pairAddress: pair,
  quoteTimestamp: `2026-10-21T00:05:43.${ms}Z`, quoteExpiresAt: `2026-10-21T00:06:13.${ms}Z`,
  quoteFreshnessSeconds: age, verifiedAt: "2026-10-21T00:05:45.188Z" }, { chain: "solana", tokenAddress: address, poolAddress: pair }));

test("three real recovery timing patterns fail freshness at both the frozen cutoff and later generation", () => {
  const original = structuredClone(realRows);
  for (const asOf of [CUTOFF, GENERATED]) {
    const report = buildQualificationFailureMicroscope(realRows, { clock: expiredClock, asOf });
    assert.equal(report.productionGateCounts.QUOTE_FRESHNESS.pass, 0);
    assert.equal(report.productionGateCounts.QUOTE_FRESHNESS.fail, 3);
    assert.equal(report.productionGateCounts.BUY_QUOTE.pass, 3, "historical quote verification is separate from freshness");
    assert.equal(report.productionGateCounts.SELL_QUOTE.pass, 3);
    assert.ok(report.candidates.every(row => /declared expiry/.test(row.productionGates.QUOTE_FRESHNESS.reason)));
  }
  assert.deepEqual(realRows, original);
});

test("one validated clock reference governs all rows and honestly labels historical as-of", () => {
  let calls = 0;
  const report = buildQualificationFailureMicroscope(realRows, { clock: () => { calls++; return GENERATED; }, asOf: NOW });
  assert.equal(calls, 1);
  assert.equal(report.generatedAt, GENERATED);
  assert.equal(report.asOfTimestamp, NOW);
  assert.equal(report.freshnessTemporalScope, "EXPLICIT_HISTORICAL_AS_OF");
  assert.equal(report.productionGateCounts.QUOTE_FRESHNESS.pass, 3);
  assert.ok(report.candidates.every(row => row.productionGates.QUOTE_FRESHNESS.evidence.asOfTimestamp === NOW));
  assert.equal(report.candidates[0].productionGates.QUOTE_FRESHNESS.evidence.quoteAgeSeconds, 16.874);
});

test("sticky true and cached ages cannot revive expired quotes or override an older conservative age", () => {
  assert.equal(freshness(project({ quoteFresh: true }), { clock: expiredClock }).status, "FAIL");
  assert.equal(freshness(project({ quoteFresh: true, quoteFreshnessSeconds: 10_000 })).status, "FAIL");
  assert.equal(freshness(project({ quoteFresh: true, quoteFreshnessSeconds: 0 })).evidence.quoteAgeSeconds, 16.874);
});

test("missing absolute quote time remains unknown despite positive flags or cached ages", () => {
  const candidate = project({ quoteFresh: true });
  delete candidate.executionProof.quoteTimestamp;
  assert.equal(freshness(candidate).status, "UNKNOWN");
  delete candidate.executionProof.quoteExpiresAt;
  assert.equal(freshness(candidate).status, "UNKNOWN");
  assert.equal(freshness({ quoteFresh: true, quoteAgeSeconds: 0 }).status, "UNKNOWN");
});

test("future, malformed and explicitly null absolute quote clocks cannot be rescued", () => {
  for (const quoteTimestamp of ["2026-10-21T00:06:01.000Z", "invalid", null, false, "", "2026-02-30T00:05:43.000Z", "2026-10-21T00:05:43"]) {
    assert.equal(freshness(project({ quoteTimestamp, quoteFresh: true })).status, "FAIL", String(quoteTimestamp));
  }
  for (const quoteExpiresAt of [NOW, "invalid", null, false, "", "2026-10-21T00:05:00.000Z"]) {
    assert.equal(freshness(project({ quoteExpiresAt, quoteFresh: true })).status, "FAIL", String(quoteExpiresAt));
  }
});

test("valid absolute timestamps and null independent market source clock can pass without a declared expiry", () => {
  const candidate = project({ quoteTimestamp: "2026-10-21T02:05:43.126+02:00", quoteFreshnessSeconds: null });
  delete candidate.executionProof.quoteExpiresAt;
  const gate = freshness(candidate);
  assert.equal(gate.status, "PASS");
  assert.equal(gate.evidence.quoteAgeSeconds, 16.874);
  assert.equal(candidate.executionProof.sourceTimestamp, null);
  assert.equal(freshness(project(), { now: new Date(NOW) }).status, "PASS");
});

test("earliest applicable buy/sell expiry and equality are binding, not the outer later expiry", () => {
  for (const expiresAt of [NOW, "2026-10-21T00:05:59.999Z"]) {
    const candidate = project({ buyQuote: { timestamp: "2026-10-21T00:05:43.126Z", expiresAt },
      sellQuote: { timestamp: "2026-10-21T00:05:44.000Z", expiresAt: "2026-10-21T00:06:14.000Z" } });
    assert.equal(freshness(candidate).status, "FAIL");
  }
  const candidate = project({}, { canonicalExecutionRoute: { chain: "base", tokenAddress: token, poolAddress: pool,
    quoteTimestamp: "2026-10-21T00:05:43.126Z", quoteExpiresAt: NOW } });
  assert.equal(freshness(candidate).status, "FAIL", "an applicable copy cannot erase an earlier deadline");
});

test("a different exact quote or pool cannot replace or poison the selected proof's timing", () => {
  const differentQuote = { chain: "base", tokenAddress: token, poolAddress: pool,
    quoteTimestamp: "2026-10-21T00:05:00.000Z", quoteExpiresAt: "2026-10-21T00:05:30.000Z" };
  assert.equal(freshness(project({}, { canonicalExecutionRoute: differentQuote })).status, "PASS");
  const differentPool = { ...differentQuote, poolAddress: `0x${"c".repeat(40)}`, quoteTimestamp: "2026-10-21T00:05:43.126Z" };
  assert.equal(freshness(project({}, { canonicalExecutionRoute: differentPool })).status, "PASS");
  const invalidOwner = project({ quoteTimestamp: null }, { canonicalExecutionRoute: { ...differentQuote, quoteTimestamp: "2026-10-21T00:05:43.126Z", quoteExpiresAt: "2026-10-21T00:06:13.126Z" } });
  assert.equal(freshness(invalidOwner).status, "FAIL", "a lower-priority clock cannot repair an explicitly invalid owner");
});

test("nested false and negative quote proof are not rescued by outer positive flags", () => {
  const positiveOuter = { quoteFresh: true, candidateProofState: { globalRoute: { quoteFresh: true, buyQuoteVerified: true } } };
  assert.equal(freshness(project({ quoteFresh: false }, positiveOuter)).status, "FAIL");
  for (const status of ["STALE_QUOTE", "UNVERIFIED", "NOT_VERIFIED"]) assert.equal(freshness(project({ status }, positiveOuter)).status, "FAIL", status);
  assert.equal(freshness(project({ buyQuote: { timestamp: "2026-10-21T00:05:43.126Z", verified: false } }, positiveOuter)).status, "FAIL");
  const trace = traceQualificationCandidate(project({ buyQuoteVerified: false }, positiveOuter), { clock });
  assert.notEqual(trace.productionGates.BUY_QUOTE.status, "PASS");
});

test("an authoritative negative proof without timing cannot be skipped for a lower clock owner", () => {
  const candidate = { executionProof: { executionProofState: "STALE_QUOTE", buyQuoteVerified: true, sellQuoteVerified: true },
    quoteTimestamp: "2026-10-21T00:05:43.000Z", quoteExpiresAt: "2026-10-21T00:06:13.000Z", quoteFresh: true };
  assert.equal(freshness(candidate).status, "FAIL");
});

test("authoritative global-route negative cannot be skipped, but does not poison a newer owning proof", () => {
  const lower = { status: "STALE_QUOTE", buyQuoteVerified: true, sellQuoteVerified: true, quoteFresh: false };
  const candidate = { candidateProofState: { globalRoute: lower }, quoteTimestamp: "2026-10-21T00:05:43.000Z", quoteExpiresAt: "2026-10-21T00:06:13.000Z" };
  assert.equal(freshness(candidate).status, "FAIL");
  assert.equal(freshness(project({}, { candidateProofState: { globalRoute: lower } })).status, "PASS");
});

test("source-level quoteRequestedAt cannot follow quoteReceivedAt", () => {
  const candidate = project({ quoteRequestedAt: "2026-10-21T00:05:44.000Z", quoteReceivedAt: "2026-10-21T00:05:43.000Z" });
  assert.equal(freshness(candidate).status, "FAIL");
  candidate.executionProof.quoteRequestedAt = "2026-10-21T00:05:40.000Z";
  candidate.executionProof.quoteReceivedAt = "2026-10-21T00:05:44.500Z";
  assert.equal(freshness(candidate).status, "PASS");
  assert.equal(freshness(candidate).evidence.quoteAgeSeconds, 20);
  const alias = project({ executionQuoteTimestamp: "2026-10-21T00:05:44.000Z", quoteReceivedAt: "2026-10-21T00:05:43.000Z" });
  delete alias.executionProof.quoteTimestamp;
  assert.equal(freshness(alias).status, "FAIL", "the executionQuoteTimestamp alias obeys the same receipt order");
});

test("contradictory request/receipt order is invalid and conservative request time controls age", () => {
  const candidate = project({ buyQuote: { requestedAt: "2026-10-21T00:05:44.000Z", receivedAt: "2026-10-21T00:05:43.000Z" } });
  assert.equal(freshness(candidate).status, "FAIL");
  candidate.executionProof.buyQuote = { requestedAt: "2026-10-21T00:05:40.000Z", receivedAt: "2026-10-21T00:05:43.000Z" };
  assert.equal(freshness(candidate).evidence.quoteAgeSeconds, 20);
});

test("malformed explicit now/clock/asOf/maxAge are rejected even for empty builds", () => {
  for (const value of [undefined, null, false, NaN, Infinity, "invalid", "", "2026-02-30T00:00:00.000Z", "2026-10-21T00:06:00"]) {
    assert.throws(() => buildQualificationFailureMicroscope([], { now: value }), /now/i);
    assert.throws(() => buildQualificationFailureMicroscope([], { clock: () => value }), /clock/i);
    assert.throws(() => buildQualificationFailureMicroscope([], { clock, asOf: value }), /asOf/i);
  }
  for (const value of [0, -1, null, false, "", NaN, Infinity, "invalid"]) assert.throws(() => freshness(project(), { clock, maxQuoteAgeSeconds: value }), /maxQuoteAgeSeconds/i);
  assert.throws(() => freshness(project(), { clock: null }), /clock/i);
  assert.throws(() => freshness(project(), { clock, now: GENERATED }), /conflicts/i);
  assert.throws(() => freshness(project(), { clock, asOf: GENERATED }), /asOf/i);
});

function withCache(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "qualification-clock-cache-"));
  try { run(path.join(root, "microscope.json")); }
  finally { fs.rmSync(root, { recursive: true, force: true }); }
}
const projected = { meta: { scanRunId: "same-scan" }, projects: [{ chain: "base", tokenAddress: token }] };

test("a legacy same-scan FULL_SCAN schema1 cache cannot bypass repaired clock policy", () => withCache(reportFile => {
  const legacy = { ...buildQualificationFailureMicroscope([project()], { clock }), schemaVersion: 1,
    sourceMode: "FULL_SCAN", scanRunId: "same-scan" };
  delete legacy.freshnessClockPolicy;
  fs.writeFileSync(reportFile, JSON.stringify(legacy));
  const rebuilt = runQualificationFailureMicroscope({ payload: projected, reportFile, clock: expiredClock });
  assert.equal(rebuilt.sourceMode, "REPORT_PROJECTION");
  assert.equal(rebuilt.productionGateCounts.QUOTE_FRESHNESS.pass, 0);
  assert.equal(rebuilt.schemaVersion, 2);
  assert.equal(rebuilt.asOfTimestamp, GENERATED);
}));

test("same-scan full proof is preserved only as an honestly timestamped historical diagnostic", () => withCache(reportFile => {
  const full = writeQualificationFailureMicroscope([project()], { scanRunId: "same-scan" }, { reportFile, clock });
  const originalBytes = fs.readFileSync(reportFile);
  assert.equal(full.productionGateCounts.QUOTE_FRESHNESS.pass, 1);
  const frozen = runQualificationFailureMicroscope({ payload: projected, reportFile, clock: expiredClock });
  assert.equal(frozen.sourceMode, "FULL_SCAN");
  assert.equal(frozen.freshnessTemporalScope, "FROZEN_FULL_SCAN_AS_OF");
  assert.equal(frozen.generatedAt, NOW);
  assert.equal(frozen.asOfTimestamp, NOW);
  assert.equal(frozen.cacheReusedAt, GENERATED);
  assert.equal(frozen.candidates[0].productionGates.QUOTE_FRESHNESS.evidence.asOfTimestamp, NOW);
  assert.equal(buildQualificationFailureMicroscope([project()], { clock: expiredClock }).productionGateCounts.QUOTE_FRESHNESS.fail, 1);
  assert.deepEqual(fs.readFileSync(reportFile), originalBytes, "valid cache reuse is read-only, preserving all full-proof bytes");
  assert.throws(() => runQualificationFailureMicroscope({ payload: projected, reportFile, clock: () => null }), /clock/i);
}));

test("valid full-proof cache reuse does not publish or downgrade on an injected write failure", () => withCache(reportFile => {
  writeQualificationFailureMicroscope([project()], { scanRunId: "same-scan" }, { reportFile, clock });
  const originalBytes = fs.readFileSync(reportFile);
  const originalWrite = fs.writeFileSync;
  let writes = 0;
  fs.writeFileSync = function (...args) { if (args[0] === reportFile) { writes++; throw Object.assign(new Error("fixture EIO"), { code: "EIO" }); } return originalWrite.apply(this, args); };
  try {
    assert.equal(runQualificationFailureMicroscope({ payload: projected, reportFile, clock: expiredClock }).sourceMode, "FULL_SCAN");
  } finally { fs.writeFileSync = originalWrite; }
  assert.equal(writes, 0);
  assert.deepEqual(fs.readFileSync(reportFile), originalBytes);
}));

test("cache EIO/EACCES read failures propagate without writing a weaker projection", () => withCache(reportFile => {
  writeQualificationFailureMicroscope([project()], { scanRunId: "same-scan" }, { reportFile, clock });
  const originalBytes = fs.readFileSync(reportFile), originalRead = fs.readFileSync, originalWrite = fs.writeFileSync;
  let writes = 0;
  for (const code of ["EIO", "EACCES"]) {
    fs.readFileSync = function (...args) { if (args[0] === reportFile) throw Object.assign(new Error(`fixture ${code}`), { code }); return originalRead.apply(this, args); };
    fs.writeFileSync = function (...args) { if (args[0] === reportFile) writes++; return originalWrite.apply(this, args); };
    try {
      assert.throws(() => runQualificationFailureMicroscope({ payload: projected, reportFile, clock: expiredClock }), error => error.code === code);
    } finally { fs.readFileSync = originalRead; fs.writeFileSync = originalWrite; }
    assert.equal(writes, 0);
    assert.deepEqual(fs.readFileSync(reportFile), originalBytes);
  }
}));

test("input storage read failures cannot replace the existing full-proof cache with an empty diagnostic", () => withCache(reportFile => {
  const inputFile = path.join(path.dirname(reportFile), "report.json");
  fs.writeFileSync(inputFile, JSON.stringify(projected));
  writeQualificationFailureMicroscope([project()], { scanRunId: "same-scan" }, { reportFile, clock });
  const originalBytes = fs.readFileSync(reportFile), originalRead = fs.readFileSync, originalWrite = fs.writeFileSync;
  let writes = 0;
  for (const code of ["EIO", "EACCES"]) {
    fs.readFileSync = function (...args) { if (args[0] === inputFile) throw Object.assign(new Error(`fixture ${code}`), { code }); return originalRead.apply(this, args); };
    fs.writeFileSync = function (...args) { if (args[0] === reportFile) writes++; return originalWrite.apply(this, args); };
    try {
      assert.throws(() => runQualificationFailureMicroscope({ inputFile, reportFile, clock: expiredClock }), error => error.code === code);
    } finally { fs.readFileSync = originalRead; fs.writeFileSync = originalWrite; }
    assert.equal(writes, 0);
    assert.deepEqual(fs.readFileSync(reportFile), originalBytes);
  }
}));

test("cached clock policy cannot bypass changed limits, malformed reference or an explicit different asOf", () => withCache(reportFile => {
  const full = writeQualificationFailureMicroscope([project()], { scanRunId: "same-scan" }, { reportFile, clock });
  for (const changes of [{ maxQuoteAgeSeconds: 1 }, { asOf: GENERATED }]) {
    fs.writeFileSync(reportFile, JSON.stringify(full));
    assert.equal(runQualificationFailureMicroscope({ payload: projected, reportFile, clock: expiredClock, ...changes }).sourceMode, "REPORT_PROJECTION");
  }
  fs.writeFileSync(reportFile, JSON.stringify({ ...full, asOfTimestamp: "invalid" }));
  assert.equal(runQualificationFailureMicroscope({ payload: projected, reportFile, clock: expiredClock }).sourceMode, "REPORT_PROJECTION");
}));
