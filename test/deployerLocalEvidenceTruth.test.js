import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createActiveEvidenceExecutionState, executeActiveEvidenceProviderRequests } from "../src/data/activeEvidenceProviderExecutor.js";
import { normalizeBlockscoutSecurityEvidence } from "../src/data/security/blockscoutConnector.js";
import { sourcesForField } from "../src/data/enrichmentSourceRegistry.js";
import { analyzeActiveEvidenceRecoveryBatch } from "../src/engines/activeEvidenceRecoveryEngine.js";
import { evaluateEvidenceFreshness } from "../src/data/evidenceFreshnessPolicy.js";

const NOW = Date.parse("2026-10-22T22:00:00Z");
const TOKEN = `0x${"1".repeat(40)}`;
const CREATOR = `0x${"2".repeat(40)}`;
const OTHER = `0x${"3".repeat(40)}`;
const TX = `0x${"a".repeat(64)}`;
const PROJECT = { chain: "base", tokenAddress: TOKEN };
const CACHE_FILE = path.resolve("data/security-evidence-cache.json");
const CREATOR_FIELDS = ["creatorAddress", "deployerAddress", "creator", "deployer"];
let signature = 0;

test.beforeEach(t => {
  t.mock.method(globalThis, "fetch", async () => assert.fail("Live HTTP is forbidden"));
  t.mock.method(fs, "writeFileSync", () => assert.fail("Runtime writes are forbidden"));
});

function evidence(patch = {}) {
  return { ...normalizeBlockscoutSecurityEvidence({ address_hash: TOKEN, is_verified: true,
    creator_address_hash: CREATOR, creation_tx_hash: TX, creation_block_number: "12" },
  { hash: TOKEN }, { chain: "base", address: TOKEN }),
  observedAt: new Date(NOW - 60000).toISOString(), ...patch };
}

function virtualCache(t, item, source = "blockscout", entryPatch = {}) {
  const entries = { [`${source}:base:${TOKEN}`]: { cachedAtMs: NOW - 1000, value: item, ...entryPatch } };
  const serial = BigInt(++signature);
  const originalRead = fs.readFileSync;
  const originalStat = fs.statSync;
  t.mock.method(Date, "now", () => NOW);
  t.mock.method(fs, "mkdirSync", directory => {
    assert.equal(path.resolve(directory), path.dirname(CACHE_FILE));
  });
  t.mock.method(fs, "statSync", (file, ...args) => path.resolve(file) === CACHE_FILE
    ? { dev: 1n, ino: serial, size: 1n, mtimeNs: serial, ctimeNs: serial }
    : originalStat(file, ...args));
  t.mock.method(fs, "readFileSync", (file, ...args) => path.resolve(file) === CACHE_FILE
    ? JSON.stringify(entries) : originalRead(file, ...args));
}

async function recover(project = PROJECT, options = {}, fields = CREATOR_FIELDS) {
  const state = createActiveEvidenceExecutionState({ maxProviderRequests: 0, now: () => NOW });
  const deadline = state.deadlineAt;
  const result = await executeActiveEvidenceProviderRequests(project, fields.map(field => ({ field,
    item: { canonicalField: field, targetSources: sourcesForField(field, project) },
  })), { now: () => NOW, nativeDeploymentHistory: false, env: {}, ...options }, state);
  assert.equal(state.requestsUsed, 0);
  assert.equal(state.deadlineAt, deadline);
  return result;
}

test("native DEPLOYER dispatch reuses the exact SECURITY Blockscout cache with no budget or new clock", async t => {
  const item = evidence();
  virtualCache(t, item);
  const result = await recover();
  for (const field of CREATOR_FIELDS) {
    const observed = result.observations.find(row => row.field === field);
    assert.equal(observed?.value, CREATOR);
    assert.equal(observed.source, "blockscout");
    assert.equal(observed.sourceTimestamp, item.observedAt);
    assert.equal(observed.chain, "base");
    assert.equal(observed.tokenAddress, TOKEN);
    assert.equal(observed.confidence, item.confidence / 100);
  }
  assert.ok(result.attempts.some(row => row.provider === "blockscout" && row.status === "LOCAL_EVIDENCE_AVAILABLE"));
  assert.equal(result.observations.find(row => row.field === "deploymentTransactionHash")?.value, TX);
  assert.equal(result.observations.find(row => row.field === "creationBlockNumber")?.value, 12);
  for (const field of ["walletAgeDays", "priorDeployments", "deployerHistory", "honeypotDetected",
    "liveExecutionReady", "finalSelectionQualified"]) assert.equal(result.observations.some(row => row.field === field), false);
});

test("the existing Blockscout deployer cache remains reusable", async t => {
  virtualCache(t, evidence({ provider: "blockscout-deployer" }), "blockscout-deployer");
  assert.equal((await recover()).observations.find(row => row.field === "creatorAddress")?.value, CREATOR);
});

for (const [label, patch, entryPatch] of [
  ["stale observation", { observedAt: new Date(NOW - 7 * 3600000).toISOString() }],
  ["future observation", { observedAt: new Date(NOW + 1).toISOString() }],
  ["missing observation", { observedAt: null }],
  ["invalid observation", { observedAt: "invalid" }],
  ["expired cache receipt", {}, { cachedAtMs: NOW - 7 * 3600000 }],
  ["future cache receipt", {}, { cachedAtMs: NOW + 1 }],
  ["wrong chain", { chain: "ethereum" }],
  ["wrong token", { address: OTHER }],
  ["UNKNOWN", { status: "UNKNOWN" }],
  ["rejected identity", { responseIdentityVerified: false }],
  ["contradictory token alias", { tokenAddress: OTHER }],
  ["foreign raw identity", { raw: { contract: { address_hash: OTHER }, addressInfo: { hash: TOKEN } } }],
]) {
  test(`Blockscout SECURITY cache ${label} cannot supply creator evidence`, async t => {
    virtualCache(t, evidence(patch), "blockscout", entryPatch);
    assert.deepEqual((await recover()).observations, []);
  });
}

test("disabled cache cannot be used as a creator acquisition bypass", async t => {
  virtualCache(t, evidence());
  assert.deepEqual((await recover(PROJECT, { useCache: false })).observations, []);
});

test("the configured security cache TTL is respected without refreshing evidence clocks", async t => {
  virtualCache(t, evidence());
  assert.deepEqual((await recover(PROJECT, { cacheTtlMs: 59999 })).observations, []);
});

test("existing deployer-cache precedence is unchanged when SECURITY also has a creator record", async t => {
  const cached = evidence();
  const readCachedSecurityEvidence = source => source === "blockscout-deployer"
    ? { ...cached, provider: source } : source === "blockscout" ? { ...cached, creatorAddress: OTHER } : null;
  const result = await recover(PROJECT, { readCachedSecurityEvidence });
  const observation = result.observations.find(row => row.field === "creatorAddress");
  assert.equal(observation.value, CREATOR);
  assert.equal(observation.source, "blockscout-deployer");
});

for (const clockField of ["observedAt", "sourceTimestamp"]) {
  for (const futureMs of [0, 1]) {
    test(`cached creator ${clockField} is ${futureMs ? "rejected when future" : "accepted when current"} at validation after cache read`, async () => {
      let now = NOW;
      let reads = 0;
      let cached;
      let original;
      const state = createActiveEvidenceExecutionState({ maxProviderRequests: 0,
        timeBudgetMs: 1000, now: () => now });
      const deadline = state.deadlineAt;
      const result = await executeActiveEvidenceProviderRequests(PROJECT, [{ field: "creatorAddress" }], {
        now: () => now, nativeDeploymentHistory: false, env: {},
        readCachedSecurityEvidence: source => {
          if (source !== "goplus") return null;
          reads++;
          now += 20;
          cached = { provider: "goplus", status: "EVIDENCE_AVAILABLE", responseIdentityVerified: true,
            chain: "base", address: TOKEN, creatorAddress: CREATOR, confidence: 80,
            [clockField]: new Date(now + futureMs).toISOString() };
          original = structuredClone(cached);
          return cached;
        },
      }, state);
      assert.equal(reads, 1);
      assert.equal(now, NOW + 20);
      assert.equal(state.requestsUsed, 0);
      assert.equal(state.deadlineAt, deadline);
      assert.deepEqual(cached, original);
      if (futureMs) {
        assert.deepEqual(result.observations, []);
        assert.equal(result.attempts.some(row => row.status === "LOCAL_EVIDENCE_AVAILABLE"), false);
      } else {
        const observed = result.observations.find(row => row.field === "creatorAddress");
        assert.equal(observed?.value, CREATOR);
        assert.equal(observed.sourceTimestamp, cached[clockField]);
        assert.equal(observed.source, "goplus");
        assert.equal(result.attempts[0].status, "LOCAL_EVIDENCE_AVAILABLE");
      }
    });
  }
}

for (const [label, patch] of [
  ["contract address hash", { contract: { address_hash: OTHER } }],
  ["address response hash", { addressInfo: { hash: OTHER } }],
  ["conflicting raw alias", { contract: { address: OTHER } }],
  ["malformed raw alias", { addressInfo: { address_hash: "invalid" } }],
]) {
  test(`Blockscout ${label} contradicting its envelope cannot promote another contract's creator`, async () => {
    const base = evidence();
    const item = { ...base, raw: { contract: { ...base.raw.contract, ...patch.contract },
      addressInfo: { ...base.raw.addressInfo, ...patch.addressInfo } } };
    const project = { ...PROJECT, securityEvidence: [item] };
    const before = structuredClone(project);
    const result = await recover(project, { useCache: false });
    assert.deepEqual(result.observations, []);
    assert.deepEqual(project, before);
  });
}

test("a native Blockscout-normalized foreign response cannot enter DEPLOYER as an exact creator", async () => {
  const item = normalizeBlockscoutSecurityEvidence({ address_hash: OTHER, is_verified: true,
    creator_address_hash: CREATOR }, { hash: OTHER }, { chain: "base", address: TOKEN });
  const result = await recover({ ...PROJECT, securityEvidence: [item] }, { useCache: false });
  assert.deepEqual(result.observations, []);
});

test("exact unverified-source metadata retains raw creator identity without claiming verified source", async () => {
  const item = evidence({ verifiedSource: false });
  const before = structuredClone(item);
  const result = await recover({ ...PROJECT, blockscoutDeployerEvidence: item }, { useCache: false });
  assert.equal(result.observations.find(row => row.field === "creatorAddress")?.value, CREATOR);
  assert.deepEqual(item, before);
  assert.equal(item.verifiedSource, false);
});

test("case-insensitive exact EVM raw identity remains usable", async () => {
  const item = evidence();
  item.raw.contract.address_hash = TOKEN.toUpperCase().replace("0X", "0x");
  const result = await recover({ ...PROJECT, securityEvidence: [item] }, { useCache: false });
  assert.equal(result.observations.find(row => row.field === "creatorAddress")?.value, CREATOR);
});

async function activeAttached(item) {
  const project = { ...PROJECT, blockscoutDeployerEvidence: item, targetedEnrichmentPlan: { items: [{
    canonicalField: "creatorAddress", recoverable: true, evidenceClass: "CORE", requiresFreshObservation: true,
    targetSources: [{ source: "block explorers" }],
  }] } };
  const original = structuredClone(project);
  const [result] = await analyzeActiveEvidenceRecoveryBatch([project], { now: () => NOW,
    useCache: false, nativeDeploymentHistory: false, env: {}, maxProviderRequests: 0,
    wave1Max: 1, wave2Max: 0, wave3Max: 0, concurrency: 1 });
  assert.deepEqual(project, original);
  assert.equal(result.activeEvidenceRecovery.batchSummary.providerRequestsUsed, 0);
  return result;
}

for (const [label, clock] of [
  ["missing", undefined], ["null", null], ["blank", ""], ["whitespace", " "],
  ["invalid", "invalid"], ["future", new Date(NOW + 60000).toISOString()],
]) {
  test(`attached ${label} clock cannot be replaced with a current provider receipt`, async () => {
    const item = evidence({ observedAt: clock });
    const result = await recover({ ...PROJECT, blockscoutDeployerEvidence: item }, { useCache: false });
    assert.deepEqual(result.observations, []);
    const active = await activeAttached(item);
    assert.equal(active.creatorAddress, undefined);
    assert.equal(active.fieldProvenance?.creatorAddress, undefined);
    assert.equal(active.activeEvidenceRecovery.recoveredFields.includes("creatorAddress"), false);
    assert.deepEqual(active.blockscoutDeployerEvidence, item);
  });
}

for (const field of ["observedAt", "sourceTimestamp"]) {
  test(`an attached original ${field} clock is retained through raw and active promotion`, async () => {
    const timestamp = new Date(NOW - 60000).toISOString();
    const item = evidence({ observedAt: undefined, [field]: timestamp });
    const result = await recover({ ...PROJECT, blockscoutDeployerEvidence: item }, { useCache: false });
    assert.equal(result.observations.find(row => row.field === "creatorAddress").sourceTimestamp, timestamp);
    const active = await activeAttached(item);
    assert.equal(active.creatorAddress, CREATOR);
    assert.equal(active.fieldProvenance.creatorAddress.sourceTimestamp, timestamp);
    assert.equal(evaluateEvidenceFreshness(timestamp, "creatorAddress", new Date(NOW)).status, "CURRENT");
  });
}

test("immutable attached creator facts retain their stale clock without a new six-hour cap", async () => {
  const timestamp = new Date(NOW - 2 * 86400000).toISOString();
  const item = evidence({ observedAt: timestamp });
  const result = await recover({ ...PROJECT, blockscoutDeployerEvidence: item }, { useCache: false });
  assert.equal(result.observations.find(row => row.field === "creatorAddress").sourceTimestamp, timestamp);
  const active = await activeAttached(item);
  assert.equal(active.creatorAddress, CREATOR);
  const provenance = active.fieldProvenance.creatorAddress;
  assert.equal(provenance.sourceTimestamp, timestamp);
  assert.equal(evaluateEvidenceFreshness(provenance.sourceTimestamp, "creatorAddress", new Date(NOW)).status, "STALE_DATA");
});

test("freshly acquired custom provider responses keep their existing source-clock semantics", async () => {
  for (const clock of [{ observedAt: new Date(NOW - 60000).toISOString() },
    { observedAt: undefined, sourceTimestamp: new Date(NOW - 120000).toISOString() },
    { observedAt: undefined }]) {
    let calls = 0;
    const state = createActiveEvidenceExecutionState({ maxProviderRequests: 1, now: () => NOW });
    const before = Date.now();
    const result = await executeActiveEvidenceProviderRequests(PROJECT, [{ field: "creatorAddress" }], {
      useCache: false, nativeDeploymentHistory: false, env: {}, now: () => NOW,
      providers: { getBlockscoutDeployerEvidence: async () => { calls++; return evidence(clock); } },
    }, state);
    const timestamp = result.observations.find(row => row.field === "creatorAddress").sourceTimestamp;
    if (clock.observedAt || clock.sourceTimestamp) assert.equal(timestamp, clock.observedAt || clock.sourceTimestamp);
    else assert.ok(Date.parse(timestamp) >= before && Date.parse(timestamp) <= Date.now());
    assert.equal(calls, 1);
    assert.equal(state.requestsUsed, 1);
  }
});

test("rejected attached clocks cannot prevent an independent newly acquired creator response", async () => {
  const attached = evidence({ observedAt: undefined });
  const before = structuredClone(attached);
  const acquired = evidence();
  let calls = 0;
  const state = createActiveEvidenceExecutionState({ maxProviderRequests: 1, now: () => NOW });
  const result = await executeActiveEvidenceProviderRequests({ ...PROJECT, blockscoutDeployerEvidence: attached },
    [{ field: "creatorAddress" }], { now: () => NOW, useCache: false, nativeDeploymentHistory: false, env: {},
      providers: { getBlockscoutDeployerEvidence: async () => { calls++; return acquired; } },
    }, state);
  assert.equal(calls, 1);
  assert.equal(state.requestsUsed, 1);
  assert.equal(result.observations.find(row => row.field === "creatorAddress").sourceTimestamp, acquired.observedAt);
  assert.deepEqual(attached, before);
});

test("attached clock validation applies to both security containers without borrowing an invalid preferred clock", async () => {
  for (const patch of [item => ({ securityEvidence: [item] }), item => ({ freeSecurityEvidence: { evidence: [item] } })]) {
    const invalid = evidence({ observedAt: "invalid", sourceTimestamp: new Date(NOW - 60000).toISOString() });
    assert.deepEqual((await recover({ ...PROJECT, ...patch(invalid) }, { useCache: false })).observations, []);
    const valid = evidence({ observedAt: undefined, sourceTimestamp: new Date(NOW - 60000).toISOString() });
    const result = await recover({ ...PROJECT, ...patch(valid) }, { useCache: false });
    assert.equal(result.observations.find(row => row.field === "creatorAddress").sourceTimestamp, valid.sourceTimestamp);
  }
});
