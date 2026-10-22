import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createActiveEvidenceExecutionState, executeActiveEvidenceProviderRequests } from "../src/data/activeEvidenceProviderExecutor.js";
import { normalizeBlockscoutSecurityEvidence } from "../src/data/security/blockscoutConnector.js";
import { sourcesForField } from "../src/data/enrichmentSourceRegistry.js";

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
