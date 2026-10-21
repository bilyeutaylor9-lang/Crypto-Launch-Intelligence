import test, { after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const originalCwd = process.cwd();
const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "project-change-identity-"));
process.chdir(fixtureRoot);
const { createScanRecord, getProjectHistory, getProjectHistories, loadScanMemory, primeScanMemory } = await import("../src/learning/scanMemoryStore.js");
const { exactScanHistoryIdentity } = await import("../src/identity/exactScanHistoryIdentity.js");
const { analyzeProjectChangeBatch } = await import("../src/engines/projectChangeDetectionEngine.js");
const { analyzeConfidenceAdjustedRankBatch } = await import("../src/engines/confidenceAdjustedRankEngine.js");

const NOW = "2026-10-20T12:00:00.000Z";
const EARLY = "2026-10-20T10:00:00.000Z";
const PRIOR = "2026-10-20T11:00:00.000Z";
const FUTURE = "2026-10-20T13:00:00.000Z";
const clock = () => Date.parse(NOW);
const options = { clock };
const token = `0x${"a".repeat(40)}`;
const otherToken = `0x${"b".repeat(40)}`;
const poolA = `0x${"1".repeat(40)}`;
const poolB = `0x${"2".repeat(40)}`;
const solA = "9a98oQHtxfqmr4EyzsP6wfw69uYAK3JbUeVEuNW1pump";
const solB = "9A98oQHtxfqmr4EyzsP6wfw69uYAK3JbUeVEuNW1pump";
const project = (values = {}) => ({ chain: "base", tokenAddress: token, pipelineScore: 50, riskScore: 0, liquidityUsd: 100, volume24h: 100, ...values });
const record = (values = {}, scannedAt = PRIOR) => createScanRecord(project(values), { scannedAt, clock });
const historyFile = path.join(fixtureRoot, "data", "scan-history.json");
function setHistory(rows = [], primed = []) {
  fs.mkdirSync(path.dirname(historyFile), { recursive: true });
  fs.writeFileSync(historyFile, JSON.stringify(rows));
  primeScanMemory(primed); // Invalidates the local fixture cache as well.
}
function analyze(values = {}, analysisOptions = options) {
  return analyzeProjectChangeBatch([project(values)], analysisOptions)[0];
}
beforeEach(() => setHistory());
after(() => {
  primeScanMemory([]);
  process.chdir(originalCwd);
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
});

test("actual change engine separates case-distinct Solana tokens and changes downstream rank correctly", () => {
  const rows = [record({ chain: "solana", tokenAddress: solA, pipelineScore: 10 }, EARLY), record({ chain: "solana", tokenAddress: solB, pipelineScore: 90 })];
  setHistory(rows);
  const bytesBefore = fs.readFileSync(historyFile);
  const current = project({ chain: "solana", tokenAddress: solA, dataConfidenceScore: 80, sourceReliabilityScore: 80, proofScore: 80, narrativeHeatScore: 80, trapRiskScore: 0 });
  const actual = analyzeProjectChangeBatch([current], options)[0];
  assert.equal(actual.projectChangeScore, 100);
  assert.equal(actual.projectChangeState, "accelerating");
  assert.equal(actual.projectChange.priorScannedAt, EARLY);
  const histories = getProjectHistories([`solana:${solA}`, `solana:${solB}`], 20, options);
  assert.equal(histories.get(`solana:${solA}`).length, 1);
  assert.equal(histories.get(`solana:${solB}`).length, 1);
  assert.equal(getProjectHistory(`solana:${solA}`, 20, options)[0].id, solA);
  const correct = analyzeConfidenceAdjustedRankBatch([actual])[0].confidenceAdjustedScore;
  const contaminated = analyzeConfidenceAdjustedRankBatch([{ ...actual, projectChangeScore: 0 }])[0].confidenceAdjustedScore;
  assert.equal(correct - contaminated, 8);
  assert.deepEqual(fs.readFileSync(historyFile), bytesBefore);
  assert.deepEqual(rows[0].id, solA);
});

test("same EVM address on different chains never joins; aliases and EVM case canonicalize", () => {
  setHistory([record({ chain: "ethereum", pipelineScore: 10 }, EARLY), record({ chain: "base", pipelineScore: 90 })]);
  const actual = analyze({ chain: "ETH", tokenAddress: `0x${"A".repeat(40)}` });
  assert.equal(actual.projectChangeScore, 100);
  assert.equal(actual.projectChange.historyIdentityKey, `ethereum:${token}`);
  assert.equal(actual.projectChange.priorScannedAt, EARLY);
});

test("chainless ids, symbol-only projects and pool-only projects cannot establish exact attribution", () => {
  setHistory([record({ pipelineScore: 10 })]);
  assert.deepEqual(getProjectHistory(token, 20, options), []);
  for (const value of [{ tokenAddress: token }, { chain: "base", symbol: "SAME" }, { chain: "base", poolAddress: token }]) {
    assert.equal(exactScanHistoryIdentity(value), null);
    assert.equal(analyzeProjectChangeBatch([value], options)[0].projectChange.historyEligibility, "IDENTITY_UNRESOLVED_OR_CONFLICTING");
  }
});

test("conflicting structured identities, ids and aliases are rejected instead of selected", () => {
  const valid = record({ pipelineScore: 40 }, EARLY);
  for (const changes of [
    { id: otherToken }, { id: "0xmalformed" }, { identityKey: `ethereum:${token}` }, { tokenAddress: otherToken },
    { address: otherToken }, { network: "ethereum" }, { chainId: 1 },
    { identityKey: "base:SYMBOL" }, { poolAddress: poolA, pairAddress: poolB },
  ]) {
    setHistory([valid, { ...record({ pipelineScore: 90 }), ...changes }]);
    assert.equal(analyze().projectChangeScore, 70, JSON.stringify(changes));
  }
  assert.equal(analyze({ address: otherToken }).projectChange.historyEligibility, "IDENTITY_UNRESOLVED_OR_CONFLICTING");
});

test("producer preserves id format, supplies exact identity for address-only inputs and rejects alias conflict", () => {
  const addressOnly = createScanRecord({ chain: "base", address: token, pipelineScore: 40 }, { scannedAt: PRIOR, clock });
  assert.equal(addressOnly.id, token);
  assert.equal(addressOnly.identityKey, `base:${token}`);
  assert.equal(addressOnly.pointInTime.identity.tokenAddress, token);
  setHistory([addressOnly]);
  assert.equal(analyze().projectChangeScore, 70);
  const conflicting = record({ address: otherToken, pipelineScore: 90 });
  assert.equal(conflicting.id, otherToken, "diagnostic legacy id is retained, not relabeled");
  assert.equal(conflicting.identityKey, null);
  assert.equal(conflicting.historyIdentityStatus, "UNRESOLVED_OR_CONFLICTING_V1");
  setHistory([record({ pipelineScore: 40 }, EARLY), conflicting]);
  assert.equal(analyze().projectChangeScore, 70);
  for (const identity of [{ chain: "base", baseToken: { address: token } }, { chain: "base", canonicalAddress: token }]) {
    const produced = createScanRecord(identity, { scannedAt: PRIOR, clock });
    assert.equal(produced.id, token);
    assert.equal(produced.identityKey, `base:${token}`);
    assert.equal(exactScanHistoryIdentity(produced).key, `base:${token}`);
  }
});

test("latest prior is chronological, independent of append order, before history limits", () => {
  const rows = [record({ pipelineScore: 40 }), record({ pipelineScore: 0 }, EARLY)];
  setHistory(rows);
  assert.equal(analyze().projectChangeScore, 70);
  assert.equal(getProjectHistory(`base:${token}`, 1, options)[0].scannedAt, PRIOR);
  setHistory(rows.reverse());
  assert.equal(analyze().projectChangeScore, 70);
});

test("equal, future and malformed receipts are removed before limiting to an eligible prior", () => {
  const valid = record({ pipelineScore: 40 });
  const invalid = Array.from({ length: 30 }, (_, index) => ({ ...record({ pipelineScore: 0 }), scannedAt: index % 3 === 0 ? NOW : index % 3 === 1 ? FUTURE : "invalid" }));
  setHistory([valid, ...invalid]);
  const result = analyze({ scanTimestamp: NOW });
  assert.equal(result.projectChangeScore, 70);
  assert.equal(getProjectHistory(`base:${token}`, 1, options)[0].scannedAt, PRIOR);
});

test("invalid or contradictory capture and receivedAt clocks cannot become prior evidence", () => {
  const valid = record({ pipelineScore: 40 }, EARLY);
  for (const changes of [
    { scannedAt: null }, { scannedAt: "" }, { scannedAt: false },
    { receivedAt: "invalid" }, { receivedAt: FUTURE },
    { pointInTime: { capturedAt: "invalid" } }, { pointInTime: { capturedAt: FUTURE } },
  ]) {
    setHistory([valid, { ...record({ pipelineScore: 0 }), ...changes }]);
    assert.equal(analyze().projectChangeScore, 70, JSON.stringify(changes));
  }
});

test("future or malformed known source clocks are rejected while a null source clock is valid", () => {
  const valid = record({ pipelineScore: 40 }, EARLY);
  for (const source of [FUTURE, "invalid", "", false]) {
    setHistory([valid, { ...record({ pipelineScore: 0 }), pointInTime: { capturedAt: PRIOR, sourceTimestamp: source, market: { observedAt: source } } }]);
    assert.equal(analyze().projectChangeScore, 70, String(source));
  }
  const noSource = record({ pipelineScore: 40, updatedAt: "2099-01-01T00:00:00.000Z" });
  assert.equal(noSource.pointInTime.sourceTimestamp, null, "metadata updatedAt is not a market clock");
  setHistory([noSource]);
  assert.equal(analyze().projectChangeScore, 70);
});

test("source time after the known body receipt is rejected even if scanner completion is later", () => {
  const futureToReceipt = { ...record({ pipelineScore: 0 }), receivedAt: "2026-10-20T10:30:00.000Z", pointInTime: { capturedAt: PRIOR, sourceTimestamp: "2026-10-20T10:45:00.000Z" } };
  setHistory([record({ pipelineScore: 40 }, EARLY), futureToReceipt]);
  assert.equal(analyze().projectChangeScore, 70);
});

test("producer-to-consumer roundtrip cannot turn a contradictory receipt into a score 70 to 0 regression", () => {
  const input = project({ pipelineScore: 90, receivedAt: "2026-10-20T10:30:00.000Z", observedAt: "2026-10-20T10:45:00.000Z" });
  const original = structuredClone(input);
  const produced = createScanRecord(input, { scannedAt: PRIOR, clock });
  setHistory([record({ pipelineScore: 40 }, EARLY), produced]);
  const bytesBefore = fs.readFileSync(historyFile);
  const actual = analyze();
  assert.equal(actual.projectChangeScore, 70, "the invalid newer record must not replace the valid baseline and produce 0");
  assert.equal(actual.projectChange.scoreDelta, 10);
  assert.equal(actual.projectChange.priorScannedAt, EARLY);
  assert.equal(loadScanMemory().at(-1).historyClockStatus, "INVALID_CAPTURE_V1");
  assert.equal(loadScanMemory().at(-1).receivedAt, input.receivedAt);
  assert.deepEqual(input, original);
  assert.deepEqual(fs.readFileSync(historyFile), bytesBefore);
});

test("producer rejects original invalid receipt and capture clocks before a supplied save time can replace them", () => {
  const receipt = "2026-10-20T10:30:00.000Z";
  const source = "2026-10-20T10:45:00.000Z";
  for (const values of [
    ...[-1, false, "", "invalid", "2026-02-30T10:00:00.000Z", FUTURE].map(receivedAt => ({ receivedAt })),
    { scannedAt: false }, { scanTimestamp: "invalid" }, { scanTimestamp: FUTURE },
    { pointInTime: { capturedAt: "invalid" } }, { pointInTime: { capturedAt: FUTURE } },
    { scannedAt: receipt, observedAt: source }, { scanTimestamp: receipt, observedAt: source },
    { pointInTime: { capturedAt: receipt }, observedAt: source },
    { historyClockStatus: "INVALID_CAPTURE_V1" },
  ]) {
    const input = project({ pipelineScore: 90, ...values });
    const original = structuredClone(input);
    const produced = record(input);
    const roundtripped = JSON.parse(JSON.stringify(produced));
    assert.equal(roundtripped.historyClockStatus, "INVALID_CAPTURE_V1", JSON.stringify(values));
    assert.equal(createScanRecord(roundtripped, { scannedAt: NOW, clock }).historyClockStatus, "INVALID_CAPTURE_V1", "resaving cannot clear invalidity");
    setHistory([record({ pipelineScore: 40 }, EARLY), roundtripped]);
    assert.equal(analyze().projectChangeScore, 70, JSON.stringify(values));
    assert.deepEqual(input, original);
  }
});

test("producer retains a valid original receipt independently of save time through the actual history consumer", () => {
  const receivedAt = "2026-10-20T10:30:00.000Z";
  const produced = record({ pipelineScore: 40, receivedAt, observedAt: "2026-10-20T10:15:00.000Z" });
  setHistory([produced]);
  const loaded = loadScanMemory()[0];
  assert.equal(loaded.receivedAt, receivedAt);
  assert.equal(loaded.scannedAt, PRIOR);
  assert.equal(loaded.historyClockStatus, "VALID_CAPTURE_V1");
  assert.equal(analyze().projectChangeScore, 70);
});

test("producer leaves absent and null receipts unknown instead of inventing the save timestamp", () => {
  for (const values of [{}, { receivedAt: null }, { receivedAt: undefined }]) {
    const produced = record({ pipelineScore: 40, ...values });
    setHistory([produced]);
    const loaded = loadScanMemory()[0];
    assert.equal(loaded.receivedAt, null);
    assert.equal(loaded.historyClockStatus, "VALID_CAPTURE_V1");
    assert.equal(analyze().projectChangeScore, 70, "unknown receipt retains the existing capture eligibility policy");
  }
});

test("producer does not erase malformed explicit source clocks into an eligible null clock", () => {
  for (const observedAt of [FUTURE, "invalid", false, ""]) {
    const malformed = record({ observedAt, pipelineScore: 0 });
    assert.equal(malformed.historyClockStatus, "INVALID_CAPTURE_V1");
    setHistory([record({ pipelineScore: 40 }, EARLY), malformed]);
    assert.equal(analyze().projectChangeScore, 70);
  }
});

test("malformed or future explicit current capture/source clocks fail closed", () => {
  setHistory([record({ pipelineScore: 0 })]);
  for (const values of [{ scanTimestamp: "invalid" }, { scannedAt: FUTURE }, { observedAt: FUTURE }, { receivedAt: false }, { sourceTimestamp: "invalid" }]) {
    const result = analyze(values);
    assert.equal(result.projectChangeScore, 50);
    assert.equal(result.projectChange.historyEligibility, "INVALID_CURRENT_CLOCK");
  }
});

test("invalid injected clock/asOf and producer capture time are rejected, not replaced by live now", () => {
  for (const bad of [null, undefined, false, NaN, Infinity, 1e100, "invalid", "", "2026-02-30T11:00:00.000Z", "2026-10-20T11:00:00", {}]) {
    assert.throws(() => analyze({}, { clock: () => bad }), /clock/i);
    assert.throws(() => getProjectHistory(`base:${token}`, 20, { clock, asOf: bad }), /asOf/i);
    assert.throws(() => createScanRecord(project(), { scannedAt: bad, clock }), /asOf/i);
  }
  assert.throws(() => analyze({}, { clock: "invalid" }), /clock/i);
  assert.throws(() => analyze({}, { clock, asOf: FUTURE }), /asOf/i);
});

test("same-time conflicting records are excluded deterministically; identical copies deduplicate", () => {
  const older = record({ pipelineScore: 40 }, EARLY);
  const first = record({ pipelineScore: 0 });
  const second = record({ pipelineScore: 90 });
  setHistory([older, first, second]);
  assert.equal(analyze().projectChangeScore, 70);
  setHistory([second, first, older]);
  assert.equal(analyze().projectChangeScore, 70);
  const reordered = Object.fromEntries(Object.entries(first).reverse());
  setHistory([first, reordered], [structuredClone(first)]);
  assert.equal(getProjectHistory(`base:${token}`, 20, options).length, 1);
  assert.equal(analyze().projectChangeScore, 100);
});

test("canonical sparse primed history is actually used by the change engine without invented risk", () => {
  const primed = { id: `base:${token}`, identityKey: `base:${token}`, chain: "base", scannedAt: PRIOR, source: "supabase-remote-memory", scores: { pipeline: 40, opportunity: 40 } };
  setHistory([], [primed]);
  assert.equal(loadScanMemory().length, 1);
  const actual = analyze({ riskScore: 40 });
  assert.equal(actual.projectChangeScore, 70);
  assert.equal(actual.projectChangeState, "improving");
  assert.equal(actual.projectChange.riskDelta, null);
  assert.equal(actual.projectChange.liquidityChangePct, null);
  assert.equal(actual.projectChange.volumeChangePct, null);
  setHistory([], [{ ...primed, chain: "unknown" }]);
  assert.equal(analyze().projectChangeScore, 70, "the explicit canonical token key supplies chain; unknown metadata is not a conflicting chain assertion");
  setHistory([], [{ ...primed, chain: "ethereum" }]);
  assert.equal(analyze().projectChangeState, "new", "a conflicting known chain cannot be overwritten by the key");
});

test("bounded primed union does not evict a usable local prior before identity filtering", () => {
  const previous = process.env.MAX_SCAN_MEMORY_LOAD_RECORDS;
  process.env.MAX_SCAN_MEMORY_LOAD_RECORDS = "2";
  try {
    setHistory([record({ pipelineScore: 40 })], [record({ tokenAddress: otherToken }), record({ tokenAddress: `0x${"c".repeat(40)}` })]);
    assert.equal(loadScanMemory().some((row) => row.tokenAddress === token), false, "legacy combined view is bounded independently");
    assert.equal(analyze().projectChangeScore, 70, "eligible local record remains queryable");
  } finally {
    if (previous === undefined) delete process.env.MAX_SCAN_MEMORY_LOAD_RECORDS;
    else process.env.MAX_SCAN_MEMORY_LOAD_RECORDS = previous;
  }
});

test("missing/null/empty/boolean measurements on either side do not become measured zeros", () => {
  for (const missing of [undefined, null, "", " ", false, true, NaN]) {
    const sparse = { id: token, identityKey: `base:${token}`, chain: "base", tokenAddress: token, scannedAt: PRIOR, scores: { pipeline: missing, risk: missing }, market: { liquidityUsd: missing, volume24h: missing } };
    setHistory([sparse]);
    let result = analyze({ riskScore: 40 });
    assert.equal(result.projectChangeScore, 50);
    assert.equal(result.projectChangeState, "stable");
    for (const field of ["scoreDelta", "riskDelta", "liquidityChangePct", "volumeChangePct"]) assert.equal(result.projectChange[field], null, field);
    setHistory([record({ pipelineScore: 40, riskScore: 30 })]);
    result = analyze({ pipelineScore: missing, riskScore: missing, liquidityUsd: missing, volume24h: missing });
    assert.equal(result.projectChangeScore, 50);
    for (const field of ["scoreDelta", "riskDelta", "liquidityChangePct", "volumeChangePct"]) assert.equal(result.projectChange[field], null, field);
  }
});

test("producer nullable measurements prevent legacy zero display defaults from fabricating deltas", () => {
  const sparse = createScanRecord({ chain: "base", tokenAddress: token }, { scannedAt: PRIOR, clock });
  assert.equal(sparse.scores.pipeline, 0, "legacy display compatibility");
  assert.equal(sparse.market.liquidityUsd, 0);
  assert.deepEqual(sparse.historyMeasurements, { pipelineScore: null, riskScore: null, liquidityUsd: null, volume24hUsd: null });
  setHistory([sparse]);
  const actual = analyze({ riskScore: 40 });
  assert.equal(actual.projectChangeScore, 50);
  assert.equal(actual.projectChange.scoreDelta, null);
  assert.equal(actual.projectChange.riskDelta, null);
});

test("complete-input formulas and finite numeric strings retain their original result", () => {
  setHistory([record({ pipelineScore: 40, riskScore: 20, liquidityUsd: 100, volume24h: 200 })]);
  const actual = analyze({ pipelineScore: "45", riskScore: "10", liquidityUsd: "110", volume24h: "240" });
  assert.equal(actual.projectChangeScore, 73);
  assert.equal(actual.projectChangeState, "improving");
  assert.equal(actual.projectChange.scoreDelta, 5);
  assert.equal(actual.projectChange.riskDelta, -10);
  assert.equal(actual.projectChange.liquidityChangePct, 10);
  assert.equal(actual.projectChange.volumeChangePct, 20);
  const measuredZero = analyze({ liquidityUsd: 0, volume24h: 0 });
  assert.equal(measuredZero.projectChange.liquidityChangePct, 0);
  assert.equal(measuredZero.projectChange.volumeChangePct, 0);
});

test("known pool mismatch or unknown counterpart cannot supply pool-specific liquidity or volume change", () => {
  for (const [priorPool, currentPool] of [[poolA, poolB], [null, poolA], [poolA, null]]) {
    setHistory([record({ poolAddress: priorPool })]);
    const actual = analyze({ poolAddress: currentPool, liquidityUsd: 1000, volume24h: 1000 });
    assert.equal(actual.projectChangeScore, 50);
    assert.equal(actual.projectChange.marketScopeComparable, false);
    assert.equal(actual.projectChange.liquidityChangePct, null);
    assert.equal(actual.projectChange.volumeChangePct, null);
  }
  setHistory([record({ poolAddress: poolA })]);
  const actual = analyze({ poolAddress: poolA, liquidityUsd: 110, volume24h: 120 });
  assert.equal(actual.projectChange.marketScopeComparable, true);
  assert.equal(actual.projectChange.liquidityChangePct, 10);
  assert.equal(actual.projectChange.volumeChangePct, 20);
});

test("Solana pool case remains exact independently of token equality", () => {
  setHistory([record({ chain: "solana", tokenAddress: solA, poolAddress: solA })]);
  const actual = analyze({ chain: "solana", tokenAddress: solA, poolAddress: solB, liquidityUsd: 1000, volume24h: 1000 });
  assert.equal(actual.projectChangeScore, 50);
  assert.equal(actual.projectChange.marketScopeComparable, false);
});

test("same token with different current cutoffs gets the correct prior for each observation", () => {
  const later = { ...record({ pipelineScore: 10 }), scannedAt: FUTURE, pointInTime: { capturedAt: FUTURE, sourceTimestamp: null } };
  setHistory([record({ pipelineScore: 40 }), later]);
  const results = analyzeProjectChangeBatch([project({ scanTimestamp: NOW }), project({ scanTimestamp: "2026-10-20T14:00:00.000Z" })], { clock: () => Date.parse("2026-10-20T14:00:00.000Z") });
  assert.equal(results[0].projectChangeScore, 70);
  assert.equal(results[1].projectChangeScore, 100);
  assert.equal(getProjectHistory(project({ scanTimestamp: NOW }), 1, { clock: () => Date.parse("2026-10-20T14:00:00.000Z") })[0].scannedAt, PRIOR);
});

test("the current run cannot serve as its own historical baseline", () => {
  setHistory([record({ pipelineScore: 40, scanRunId: "prior-run" }, EARLY), record({ pipelineScore: 0, scanRunId: "current-run" })]);
  const actual = analyze({}, { clock, scanRunId: "current-run" });
  assert.equal(actual.projectChangeScore, 70);
  assert.equal(actual.projectChange.priorScannedAt, EARLY);
});
