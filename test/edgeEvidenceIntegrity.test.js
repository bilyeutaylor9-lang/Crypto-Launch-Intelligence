import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { selectMatchedControls, __matchedControlHooks, canonicalEdgeIdentity } from "../src/learning/matchedControlSelector.js";
import { appendEdgeProductionEpisodes, buildFrozenEdgeProductionEpisode, freezeEdgeProductionEpisodes,
  loadEdgeProductionEpisodes } from "../src/learning/edgeProductionEpisodeStore.js";
import { buildEdgeEvidenceHealth, findExactEdgeOutcome } from "../src/learning/edgeEvidenceHealthGovernor.js";
import { buildEdgeEvidenceOutcomeLab, resolveTerminal168Outcome } from "../src/learning/edgeEvidenceOutcomeLab.js";
import { buildEdgeMechanismContrast } from "../src/learning/edgeMechanismContrastLab.js";

const NOW = "2026-10-17T00:00:00.000Z";
const SIGNAL = "2026-01-01T00:00:00.000Z";
const address = (value) => `0x${value.toString(16).padStart(40, "0")}`;
const healthy = { state: "AUTOPILOT_EVIDENCE_HEALTHY" };

function costProof(tokenAddress, poolAddress, observedAt, cost = 100) {
  const quote = (side) => ({ provider: "FIXTURE_PAIRED_QUOTE", capturedAt: observedAt,
    requestedNotionalUsd: 100, allInCostBps: cost / 2, priceImpactBps: 10,
    poolAddress, routeIdentityVerified: true, outputTokenAmount: side === "BUY" ? 100 : null,
    inputTokenAmount: side === "SELL" ? 100 : null, quoteId: `${tokenAddress}-${side}` });
  return { schemaVersion: 1, kind: "PAIRED_EXECUTABLE_QUOTES_V1", provider: "FIXTURE_PAIRED_QUOTE",
    observedAt, identityKey: `base:${tokenAddress}`, routeKey: `base:${tokenAddress}:${poolAddress}`,
    quoteSkewMs: 0, entryQuote: quote("BUY"), exitQuote: quote("SELL") };
}

function observation(index, overrides = {}) {
  const row = { chain: "base", tokenAddress: address(index), poolAddress: address(index + 10000),
    identityKey: `base:${address(index)}`, observedAt: SIGNAL, priceUsd: 1, treatment: false,
    signalDefinitionVersion: "INTEGRITY_FIXTURE_V1", codeCommitSha: "fixed-code", scanRunId: "same-scan",
    marketCapUsd: 1000000, liquidityUsd: 100000, volume24hUsd: 100000,
    productionScore: 70, riskScore: 0, priceChange24hPct: 0, evidenceCoveragePct: 80,
    supplyVacuumSupported: true, sellerExhaustionScore: 70, roundTripExecutionCostBps: 100, ...overrides };
  return { ...row, executionCostProvenance: costProof(row.tokenAddress, row.poolAddress, row.observedAt) };
}

function episode(index, overrides = {}, parent = null) {
  const row = observation(index, { treatment: !parent, ...overrides });
  const frozen = buildFrozenEdgeProductionEpisode(row, { now: row.observedAt,
    role: parent ? "CONTROL_MATCHED" : "TREATMENT", parentTreatmentEpisodeId: parent });
  assert.ok(frozen);
  return frozen;
}

function outcome(row, hours = 168, price = 1.11) {
  const at = new Date(Date.parse(row.signalObservedAt) + hours * 3600000).toISOString();
  return { observationId: `${row.episodeId}:${hours}h`, episodeId: row.episodeId,
    chain: row.chain, tokenAddress: row.tokenAddress, poolAddress: row.poolAddress,
    role: row.role, parentTreatmentEpisodeId: row.parentTreatmentEpisodeId,
    horizonHours: hours, targetAt: at, observedAt: at, priceUsd: price,
    provenance: { source: "OFFLINE_FIXTURE", verificationStatus: "EXACT_BASE_TOKEN_POOL_MATCH", sourceTimestamp: at } };
}

function cohort(count = 30, year = 2026) {
  const episodes = [], outcomes = [];
  for (let i = 0; i < count; i++) {
    const at = new Date(Date.UTC(year, 0, 1 + i * 3)).toISOString();
    const treatment = episode(i + 1, { observedAt: at });
    const control = episode(i + 1001, { observedAt: at }, treatment.episodeId);
    episodes.push(treatment, control);
    for (const hours of [6, 24, 72, 168]) outcomes.push(outcome(treatment, hours), outcome(control, hours, 1));
  }
  return { episodes, outcomes };
}

function lab(episodes, outcomes, health = healthy, options = {}) {
  return buildEdgeEvidenceOutcomeLab(episodes, outcomes, health, { now: NOW, bootstrapReplicates: 500, ...options });
}

test("malformed outcome prices cannot inflate exact observation coverage", () => {
  const row = episode(1);
  for (const value of [true, false, [], [1], {}, Infinity, "Infinity", "", " ", null, undefined]) {
    const invalid = { ...outcome(row), priceUsd: value };
    const observations = [6, 24, 72].map((hours) => outcome(row, hours)).concat(invalid);
    assert.equal(findExactEdgeOutcome(row, 168, observations, { now: NOW }), null);
    const health = buildEdgeEvidenceHealth([row], observations, { now: NOW, minMatureOutcomes: 1 });
    assert.equal(health.byHorizon["168h"].resolved, 0);
    assert.equal(health.state, "AUTOPILOT_EVIDENCE_COVERAGE_BLOCKED");
  }
});

test("null, empty and whitespace numerics stay missing instead of matching observed zero risk", () => {
  for (const missing of [null, "", " ", undefined, false, []]) {
    assert.equal(__matchedControlHooks.bounded(missing), null);
    assert.equal(__matchedControlHooks.logFeature(missing), null);
  }
  assert.equal(__matchedControlHooks.bounded(0), 0);
  const treated = observation(1, { treatment: true });
  const unknown = observation(2, { riskScore: null });
  const measured = observation(3, { riskScore: 1 });
  assert.ok(__matchedControlHooks.featureDistance(treated, unknown) > __matchedControlHooks.featureDistance(treated, measured));
  assert.equal(selectMatchedControls(treated, [unknown, measured], { now: NOW, maxControls: 1 })[0].tokenAddress, measured.tokenAddress);
});

test("all conflicting chain, token and pool aliases fail closed at freeze and consumption", () => {
  for (const patch of [{ network: "bsc" }, { chainId: 56 }, { canonicalChain: "ethereum" },
    { contractAddress: address(2) }, { canonicalAddress: address(2) }, { finalContractAddress: address(2) },
    { address: address(2) }, { baseToken: { address: address(2) } }, { pairAddress: address(102) },
    { primaryTradablePool: address(102) }, { poolAddress: "invalid" }]) {
    assert.equal(buildFrozenEdgeProductionEpisode(observation(1, patch), { role: "TREATMENT", now: NOW }), null);
    const frozen = { ...episode(1), ...patch };
    assert.equal(findExactEdgeOutcome(frozen, 168, [outcome(frozen)], { now: NOW }), null);
    assert.equal(lab([frozen], [outcome(frozen)]).records.length, 0);
  }
  assert.ok(canonicalEdgeIdentity(observation(1, { network: "8453", chainId: "0x2105" })));
});

test("canonical identities override supplied keys and prohibit same-token controls across pools", () => {
  const treated = observation(1, { treatment: true, identityKey: "forged-treatment-key" });
  const self = observation(1, { identityKey: "forged-other-key", poolAddress: address(50000) });
  assert.deepEqual(selectMatchedControls(treated, [self], { now: NOW }), []);
  const controls = selectMatchedControls(treated, [observation(2, { identityKey: "forged-third-key" })], { now: NOW });
  assert.equal(controls[0].identityKey, `base:${address(2)}`);
  const frozen = freezeEdgeProductionEpisodes([treated, self], { existingEpisodes: [], now: NOW });
  assert.equal(frozen.length, 0);
  assert.equal(buildFrozenEdgeProductionEpisode(treated, { role: "TREATMENT", now: NOW }).identityKey, `base:${address(1)}`);
  const bscTreatment = observation(1, { chain: "bsc", treatment: true });
  const bscControl = observation(2, { chain: "bsc" });
  assert.equal(selectMatchedControls(bscTreatment, [bscControl], { now: NOW })[0].identityKey, `bsc:${address(2)}`);
  assert.deepEqual(selectMatchedControls(treated, [bscControl], { now: NOW }), []);
  assert.equal(buildFrozenEdgeProductionEpisode(bscTreatment, { role: "TREATMENT", now: NOW }), null);
});

test("same scan ID does not bypass age limits; controls are unique and conflicting snapshots are excluded", () => {
  const treated = observation(1, { treatment: true, observedAt: "2026-01-10T00:00:00Z" });
  assert.deepEqual(selectMatchedControls(treated, [observation(2)], { now: NOW, maxControlAgeHours: 2 }), []);
  const a = observation(2), b = observation(3);
  const selected = selectMatchedControls(observation(1, { treatment: true }), [a, a, a, b], { now: NOW, maxControls: 3 });
  assert.equal(selected.length, 2);
  assert.equal(new Set(selected.map((row) => row.identityKey)).size, 2);
  const conflict = { ...a, riskScore: 50 };
  assert.deepEqual(selectMatchedControls(observation(1), [a, conflict], { now: NOW }), []);
  assert.deepEqual(selectMatchedControls(observation(1), [observation(2, { observedAt: "2099-01-01" })], { now: NOW }), []);
});

test("append deduplicates one batch and refuses contradictory content without changing prior bytes", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "edge-integrity-"));
  try {
    const file = path.join(directory, "episodes.jsonl"), row = episode(1);
    const result = appendEdgeProductionEpisodes([row, structuredClone(row)], { file, now: NOW });
    assert.equal(result.saved, 1);
    assert.equal(result.duplicates, 1);
    const before = fs.readFileSync(file, "utf8");
    assert.throws(() => appendEdgeProductionEpisodes([{ ...row, signalPriceUsd: 2 }], { file, now: NOW }), /Conflicting immutable/);
    assert.equal(fs.readFileSync(file, "utf8"), before);
    const fresh = path.join(directory, "conflict.jsonl");
    assert.throws(() => appendEdgeProductionEpisodes([row, { ...row, signalPriceUsd: 2 }], { file: fresh, now: NOW }), /Conflicting immutable/);
    assert.equal(fs.existsSync(fresh), false);
    assert.equal(loadEdgeProductionEpisodes({ file }).length, 1);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test("repeating ten existing pairs cannot turn twenty unique pairs into a verified thirty-pair edge", () => {
  const data = cohort(20);
  const rows = [...data.episodes, ...structuredClone(data.episodes.slice(0, 20))];
  const report = lab(rows, data.outcomes);
  assert.equal(report.byHorizon["168h"].matchedPairs, 20);
  assert.equal(report.verification.state, "EDGE_NOT_YET_VERIFIED");
  assert.equal(report.integrity.duplicateEpisodes, 20);
  assert.equal(buildEdgeEvidenceHealth(rows, data.outcomes, { now: NOW }).exactBaseEpisodes, 40);
});

test("corrupt JSONL and invalid append batches fail closed without erasing legacy bytes", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "edge-corruption-"));
  try {
    const file = path.join(directory, "episodes.jsonl"), row = episode(1);
    const legacy = { ...row, schemaVersion: 1 };
    delete legacy.freezeProvenance;
    for (const corrupt of ["{broken-json", "null", "42", '"not-an-episode"', "[]"]) {
      const bytes = `${JSON.stringify(legacy)}\n${corrupt}\n`;
      fs.writeFileSync(file, bytes);
      assert.throws(() => loadEdgeProductionEpisodes({ file }), /edge episode JSONL/);
      assert.throws(() => appendEdgeProductionEpisodes([episode(2)], { file, now: NOW }), /edge episode JSONL/);
      assert.equal(fs.readFileSync(file, "utf8"), bytes);
    }
    const bytes = `${JSON.stringify(legacy)}\n`;
    fs.writeFileSync(file, bytes);
    for (const invalid of [null, {}, "bad-batch", [null], [42], [{}], [row, {}]]) {
      assert.throws(() => appendEdgeProductionEpisodes(invalid, { file, now: NOW }), /batch/);
      assert.equal(fs.readFileSync(file, "utf8"), bytes);
    }
    assert.throws(() => appendEdgeProductionEpisodes([episode(2)], { file, now: NOW, maxBytes: Buffer.byteLength(bytes) }), /byte budget/);
    assert.equal(fs.readFileSync(file, "utf8"), bytes);
    appendEdgeProductionEpisodes([episode(2)], { file, now: NOW });
    assert.ok(fs.readFileSync(file, "utf8").startsWith(bytes));
    assert.deepEqual(loadEdgeProductionEpisodes({ file })[0], legacy);
    assert.throws(() => appendEdgeProductionEpisodes([], { file, now: NOW, maxBytes: Buffer.byteLength(bytes) }), /bounded append verification/);
    fs.writeFileSync(file, JSON.stringify(legacy));
    appendEdgeProductionEpisodes([episode(2)], { file, now: NOW });
    assert.equal(loadEdgeProductionEpisodes({ file }).length, 2);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test("conflicting episode duplicates stay excluded and block certification regardless of input order", () => {
  const data = cohort();
  const conflict = { ...data.episodes[0], signalPriceUsd: 0.1 };
  for (const rows of [[...data.episodes, conflict], [conflict, ...data.episodes]]) {
    const report = lab(rows, data.outcomes);
    assert.equal(report.state, "AUTOPILOT_EVIDENCE_COVERAGE_BLOCKED");
    assert.ok(report.integrity.conflictingEpisodeIds.includes(conflict.episodeId));
    assert.ok(!report.records.some((row) => row.episode.episodeId === conflict.episodeId));
  }
});

test("changing supplied episode IDs cannot count the same canonical observation as another sample", () => {
  const row = episode(1), duplicate = { ...row, episodeId: "another-id-for-the-same-measurement", identityKey: "forged-project" };
  const report = lab([row, duplicate], [outcome(row), outcome(duplicate)]);
  assert.equal(report.records.length, 0);
  assert.equal(report.byHorizon["168h"].matchedPairs, 0);
  assert.equal(report.integrity.conflictingEpisodeIds.length, 2);
});

test("conflicting exact outcome duplicates or aliases never choose an arbitrary winning price", () => {
  const row = episode(1), point = outcome(row);
  assert.ok(findExactEdgeOutcome(row, 168, [point, structuredClone(point)], { now: NOW }));
  for (const patch of [{ priceUsd: 20 }, { contractAddress: address(2) }, { network: "bsc" }, { observedAt: "2099-01-01" }]) {
    assert.equal(findExactEdgeOutcome(row, 168, [point, { ...point, ...patch }], { now: NOW }), null);
    assert.equal(lab([row], [point, { ...point, ...patch }]).records[0].outcomes["168h"].netReturnPct, null);
  }
  assert.equal(findExactEdgeOutcome(row, 168, [{ ...point, pairAddress: address(3) }], { now: NOW }), null);
  for (const priceUsd of [true, [], "", null, "Infinity"]) {
    assert.equal(findExactEdgeOutcome(row, 168, [{ ...point, priceUsd }], { now: NOW }), null);
  }
});

test("future episode, freeze and outcome timestamps cannot create health or edge evidence as of the report", () => {
  const future = cohort(30, 2099);
  const report = lab(future.episodes, future.outcomes);
  assert.notEqual(report.verification.state, "VERIFIED_MATCHED_NET_EDGE");
  assert.equal(report.byHorizon["168h"].matchedPairs, 0);
  assert.notEqual(buildEdgeEvidenceHealth(future.episodes, future.outcomes, { now: NOW }).state, "AUTOPILOT_EVIDENCE_HEALTHY");
  for (const patch of [{ observedAt: "2099-01-01" }, { scannedAt: "2099-01-01" }, { frozenAt: "2099-01-01" }]) {
    assert.equal(buildFrozenEdgeProductionEpisode(observation(1, patch), { role: "TREATMENT", now: NOW }), null);
  }
  const row = episode(1), point = outcome(row, 6);
  assert.equal(findExactEdgeOutcome(row, 6, [point], { now: SIGNAL }), null);
  assert.equal(findExactEdgeOutcome(row, 6, [{ ...point, provenance: { ...point.provenance, sourceTimestamp: "2099-01-01" } }], { now: NOW }), null);
  for (const patch of [{ frozenAt: "2099-01-01" }, { observedAt: "2099-01-01" },
    { freezeProvenance: { kind: "CAPTURED_AT_FREEZE_V1", capturedAt: "2099-01-01" } }]) {
    assert.equal(lab([{ ...row, ...patch }], [point]).records.length, 0);
  }
});

test("new captures record actual freeze time; historical records are retained without invented prospective proof", () => {
  const captured = buildFrozenEdgeProductionEpisode(observation(1), { role: "TREATMENT", now: NOW });
  assert.equal(captured.frozenAt, NOW);
  assert.notEqual(captured.frozenAt, captured.signalObservedAt);
  assert.equal(captured.freezeProvenance.capturedAt, NOW);
  assert.equal(findExactEdgeOutcome(captured, 168, [outcome(captured)], { now: NOW }), null);
  const legacy = episode(1);
  legacy.schemaVersion = 1;
  delete legacy.freezeProvenance;
  const before = structuredClone(legacy);
  const record = lab([legacy], [outcome(legacy)]).records[0];
  assert.equal(record.outcomes["168h"].grossReturnPct, 11);
  assert.equal(record.outcomes["168h"].netReturnPct, null);
  assert.equal(record.freezeTimeProvenanceStatus, "LEGACY_FREEZE_TIME_UNPROVEN");
  assert.equal(record.episode.freezeProvenance, undefined);
  assert.deepEqual(legacy, before);
});

test("negative, missing and unproven costs cannot convert a gross loss into a positive net outcome", () => {
  for (const patch of [{ frozenRoundTripExecutionCostBps: -1000 }, { frozenRoundTripExecutionCostBps: null },
    { frozenRoundTripExecutionCostBps: " " }, { executionCostProvenance: null },
    { executionCostProvenance: "SYNTHETIC_FROZEN_ESTIMATE" }]) {
    const row = { ...episode(1), ...patch };
    const result = lab([row], [outcome(row, 168, 0.98)]).records[0].outcomes["168h"];
    assert.equal(result.grossReturnPct, -2);
    assert.equal(result.netReturnPct, null);
    assert.equal(result.state, "GROSS_OUTCOME_ONLY_EXECUTION_COST_UNKNOWN");
  }
  const valid = episode(1);
  assert.equal(lab([valid], [outcome(valid, 168, 0.98)]).records[0].outcomes["168h"].netReturnPct, -3);
});

test("a delayed actual freeze cannot certify modeled net even before the first six-hour target", () => {
  for (const lagMs of [30_001, 2 * 3_600_000]) {
    const row = episode(1);
    row.frozenAt = new Date(Date.parse(SIGNAL) + lagMs).toISOString();
    row.freezeProvenance.capturedAt = row.frozenAt;
    const before = structuredClone(row);
    const report = lab([row], [outcome(row, 6), outcome(row)]);
    for (const horizon of ["6h", "168h"]) {
      const measured = report.records[0].outcomes[horizon];
      assert.equal(measured.grossReturnPct, 11);
      assert.equal(measured.netReturnPct, null);
      assert.equal(measured.executionCostUnknownReason, "ACTUAL_FREEZE_AFTER_ENTRY_CAPTURE_WINDOW");
    }
    assert.notEqual(report.verification.state, "VERIFIED_MATCHED_NET_EDGE");
    assert.deepEqual(row, before);
  }
  const boundary = episode(1);
  boundary.frozenAt = new Date(Date.parse(SIGNAL) + 30_000).toISOString();
  boundary.freezeProvenance.capturedAt = boundary.frozenAt;
  assert.equal(lab([boundary], [outcome(boundary)]).records[0].outcomes["168h"].netReturnPct, 10);
});

test("paired quote provenance must match identity, time, provider, notional and numeric costs", () => {
  const changes = [
    (p) => { p.identityKey = `base:${address(2)}`; }, (p) => { p.routeKey = "base:wrong-route"; },
    (p) => { p.observedAt = "2099-01-01"; }, (p) => { p.entryQuote.capturedAt = "2099-01-01"; },
    (p) => { p.entryQuote.provider = "other"; }, (p) => { p.exitQuote.requestedNotionalUsd = 200; },
    (p) => { p.entryQuote.allInCostBps = -1000; }, (p) => { p.entryQuote.allInCostBps = null; },
    (p) => { p.entryQuote.poolAddress = address(2); }, (p) => { p.entryQuote.routeIdentityVerified = false; },
    (p) => { delete p.entryQuote.routeIdentityVerified; }, (p) => { p.entryQuote.routeIdentityVerified = null; },
    (p) => { p.exitQuote.routeIdentityVerified = "true"; }, (p) => { delete p.exitQuote.routeIdentityVerified; },
    (p) => { p.entryQuote.allInCostBps = 1; }, (p) => { p.entryQuote.outputTokenAmount = null; },
  ];
  for (const mutate of changes) {
    const row = episode(1);
    mutate(row.executionCostProvenance);
    assert.equal(lab([row], [outcome(row)]).records[0].outcomes["168h"].netReturnPct, null);
  }
});

test("explicit healthy supplied state and fresh healthy coverage of the actual evaluated cohort are both required", () => {
  const data = cohort();
  const actualHealth = buildEdgeEvidenceHealth(data.episodes, data.outcomes, { now: NOW });
  assert.equal(actualHealth.state, "AUTOPILOT_EVIDENCE_HEALTHY");
  assert.equal(lab(data.episodes, data.outcomes, actualHealth).verification.state, "VERIFIED_MATCHED_NET_EDGE");
  for (const supplied of [null, {}, { state: "UNKNOWN" }, { state: "AUTOPILOT_EVIDENCE_WARMING" }, { state: "AUTOPILOT_EVIDENCE_COVERAGE_BLOCKED" }]) {
    const report = lab(data.episodes, data.outcomes, supplied);
    assert.equal(report.verification.state, "EDGE_NOT_YET_VERIFIED");
    assert.ok(report.verification.blockers.some((reason) => reason.startsWith("EVIDENCE_")));
  }
  const partial = data.outcomes.filter((row) => row.horizonHours === 168);
  const stale = lab(data.episodes, partial, actualHealth);
  assert.equal(stale.byHorizon["168h"].matchedPairs, 30);
  assert.equal(stale.cohortEvidenceHealthState, "AUTOPILOT_EVIDENCE_COVERAGE_BLOCKED");
  assert.notEqual(stale.verification.state, "VERIFIED_MATCHED_NET_EDGE");
});

test("defensive pairing excludes same-token and stale controls even when directly supplied as frozen episodes", () => {
  const treated = episode(1, { observedAt: "2026-01-10T00:00:00Z" });
  for (const control of [episode(1, { observedAt: treated.signalObservedAt, poolAddress: address(50000) }, treated.episodeId),
    episode(2, {}, treated.episodeId)]) {
    const report = lab([treated, control], [outcome(treated), outcome(control)]);
    assert.equal(report.byHorizon["168h"].matchedPairs, 0);
  }
  const retrospective = episode(2, { observedAt: treated.signalObservedAt }, treated.episodeId);
  retrospective.frozenAt = "2026-01-11T00:00:00Z";
  retrospective.freezeProvenance.capturedAt = retrospective.frozenAt;
  assert.equal(lab([treated, retrospective], [outcome(treated), outcome(retrospective)]).byHorizon["168h"].matchedPairs, 0);
});

test("mechanism contrast deduplicates samples, rejects contradictions and requires unique projects in each arm", () => {
  const episodes = Array.from({ length: 15 }, (_, i) => episode(i + 1, { sellerExhaustionScore: i < 10 ? 70 : 20 }));
  const outcomes = episodes.flatMap((row, i) => [6, 24, 72, 168].map((hours) => outcome(row, hours, i < 10 ? 1.2 : 0.8)));
  const report = lab(episodes, outcomes);
  const doubled = buildEdgeMechanismContrast({ records: [...report.records, ...structuredClone(report.records.slice(10))] }, { now: NOW });
  const seller = doubled.contrasts.find((row) => row.key === "sellerExhaustion");
  assert.equal(seller.weakSamples, 5);
  assert.equal(seller.weakUniqueProjects, 5);
  assert.equal(seller.state, "MECHANISM_CONTRAST_INSUFFICIENT_EVIDENCE");
  const conflict = structuredClone(report.records[0]);
  conflict.outcomes["168h"].netReturnPct = 1000;
  const contradictory = buildEdgeMechanismContrast({ records: [...report.records, conflict] }, { now: NOW });
  assert.ok(contradictory.integrity.conflictingEpisodeIds.includes(conflict.episode.episodeId));
  assert.equal(contradictory.treatmentRecords, 14);
  const alias = structuredClone(report.records[0]);
  alias.episode.episodeId = "new-id-for-same-canonical-measurement";
  for (const [horizon, point] of Object.entries(alias.outcomes)) point.observationId = `${alias.episode.episodeId}:${horizon}`;
  const renamed = buildEdgeMechanismContrast({ records: [...report.records, alias] }, { now: NOW });
  assert.equal(renamed.treatmentRecords, 14);
  assert.equal(renamed.integrity.conflictingEpisodeIds.length, 2);
  const laterWeak = episodes.slice(10).map((row, i) => episode(i + 11, {
    observedAt: "2026-01-04T00:00:00Z", sellerExhaustionScore: 20 }));
  const laterReport = lab(laterWeak, laterWeak.map((row) => outcome(row, 168, 0.8)));
  const repeatedProjects = buildEdgeMechanismContrast({ records: [...report.records, ...laterReport.records] }, { now: NOW });
  const repeatedSeller = repeatedProjects.contrasts.find((row) => row.key === "sellerExhaustion");
  assert.equal(repeatedSeller.weakSamples, 10);
  assert.equal(repeatedSeller.weakUniqueProjects, 5);
  assert.equal(repeatedSeller.state, "MECHANISM_CONTRAST_INSUFFICIENT_EVIDENCE");
  const future = buildEdgeMechanismContrast(report, { now: SIGNAL });
  assert.equal(future.treatmentRecords, 0);
  assert.equal(future.state, "MECHANISM_CONTRASTS_COLLECTING");
});

test("missing outcomes remain unknown and all existing non-promotion flags stay unchanged", () => {
  const row = episode(1), report = lab([row], []);
  assert.equal(resolveTerminal168Outcome(row, [], { now: NOW }).plus25BeforeMinus15, null);
  assert.equal(report.records[0].outcomes["168h"].netReturnPct, null);
  assert.equal(report.rankingInfluence, false);
  assert.equal(report.scoringInfluence, false);
  assert.equal(report.automaticProductionPromotion, false);
  assert.equal(report.verification.productionPromotionAllowed, false);
});

test("sparse threshold checkpoints and terminal flat prices never prove actual intraperiod barrier order", () => {
  const row = episode(1);
  for (const [points, checkpointLabel] of [
    [[outcome(row, 6, 1.3)], true],
    [[outcome(row, 6, 0.8)], false],
    [[outcome(row, 168, 1.05)], false],
    [[outcome(row, 6, 1.3), outcome(row, 24, 0.8)], true],
  ]) {
    const terminal = resolveTerminal168Outcome(row, points, { now: NOW });
    assert.equal(terminal.plus25BeforeMinus15, null);
    assert.equal(terminal.observedCheckpointPlus25BeforeMinus15, checkpointLabel);
    assert.equal(terminal.state, "UNKNOWN_INTRAPERIOD_PATH_UNOBSERVED");
    const report = lab([row], points);
    assert.equal(report.treatmentTerminal168.resolvedLabels, 0);
    assert.equal(report.treatmentTerminal168.hitRatePct, null);
    assert.equal(report.returnMeasurementBasis, "FIXED_HORIZON_MARK_PRICE_WITH_MODELED_FROZEN_PAIRED_QUOTE_COST_NOT_REALIZED_TRADING_PNL");
    assert.equal(report.realizedTradingPnl, false);
  }
  const terminal = lab([row], [outcome(row, 168, 1.2)]).records[0].outcomes["168h"];
  assert.equal(terminal.grossReturnPct, 20);
  assert.equal(terminal.netReturnPct, 19);
  assert.equal(terminal.realizedTradingPnl, false);
  assert.match(terminal.executionCostLimitation, /not realized exit fills/);
});
