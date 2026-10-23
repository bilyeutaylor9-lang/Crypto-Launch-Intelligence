import test from "node:test";
import assert from "node:assert/strict";
import { securityHolderObservations, securityWalletEvidencePatch } from "../src/data/security/securityWalletEvidence.js";
import { createActiveEvidenceExecutionState, executeActiveEvidenceProviderRequests } from "../src/data/activeEvidenceProviderExecutor.js";
import { evaluateEvidenceFreshness } from "../src/data/evidenceFreshnessPolicy.js";

const NOW = Date.parse("2026-10-22T12:00:00Z");
const TOKEN = `0x${"1".repeat(40)}`;
const POOL = `0x${"2".repeat(40)}`;
const OLD_HOLDER = `0x${"3".repeat(40)}`;
const FRESH_HOLDER = `0x${"4".repeat(40)}`;
const PROJECT = { chain: "base", tokenAddress: TOKEN, poolAddress: POOL };
const FORBIDDEN_FIELDS = ["holderCount", "uniqueBuyers24h", "independentBuyers24h", "uniqueSellers24h",
  "smartWallets", "smartWalletScore", "smartWalletBuyCount", "buyTransactions24h", "walletTransactions"];

function sample(ageMs, address, patch = {}) {
  return { provider: "goplus", status: "EVIDENCE_AVAILABLE", responseIdentityVerified: true,
    chain: "base", address: TOKEN, observedAt: new Date(NOW - ageMs).toISOString(), confidence: 85,
    raw: { holders: [{ address, balance: "1" }] }, ...patch };
}

const old = () => sample(3600000, OLD_HOLDER);
const fresh = () => sample(60000, FRESH_HOLDER, { confidence: 78 });
const collect = (items, options = {}) => securityHolderObservations(PROJECT, items, { now: NOW, ...options });

test("public helper chooses the fresh sample regardless of stale-first ordering", () => {
  const older = old(), newer = fresh();
  const before = structuredClone([older, newer]);
  const forward = collect([older, newer]);
  assert.deepEqual(forward, collect([newer, older]));
  assert.deepEqual(forward.map(item => item.field), ["holderAddresses", "wallets"]);
  for (const item of forward) {
    assert.deepEqual(item.value, [FRESH_HOLDER]);
    assert.equal(item.sourceTimestamp, newer.observedAt);
    assert.equal(item.timestamp, newer.observedAt);
    assert.equal(item.confidence, 0.78);
    assert.equal(item.chain, "base");
    assert.equal(item.tokenAddress, TOKEN);
    assert.equal(item.source, "goplus");
    assert.equal(item.verificationStatus, "VERIFIED_PROVIDER_OBSERVATION");
    assert.equal(item.holderSampleOnly, true);
    assert.equal(item.completeHolderCoverage, false);
    assert.equal(item.buyerClassificationAvailable, false);
    assert.equal(evaluateEvidenceFreshness(item.sourceTimestamp, item.field, new Date(NOW)).status, "CURRENT");
    assert.equal(FORBIDDEN_FIELDS.includes(item.field), false);
  }
  assert.deepEqual([older, newer], before);
});

test("equal timestamps retain the first eligible input without unioning samples", () => {
  const first = fresh(), second = sample(60000, OLD_HOLDER, { confidence: 99 });
  assert.deepEqual(collect([first, second])[0].value, [FRESH_HOLDER]);
  assert.deepEqual(collect([second, first])[0].value, [OLD_HOLDER]);
  assert.equal(collect([first, second])[0].confidence, 0.78);
});

const invalidSamples = [
  ["UNKNOWN", { status: "UNKNOWN" }],
  ["unverified", { responseIdentityVerified: false }],
  ["foreign chain", { chain: "ethereum" }],
  ["foreign token", { address: OLD_HOLDER }],
  ["foreign provider", { provider: "unknown" }],
  ["future time", { observedAt: new Date(NOW + 1).toISOString() }],
  ["malformed time", { observedAt: "not-a-date" }],
  ["missing time", { observedAt: null }],
  ["low confidence", { confidence: 0.1 }],
  ["string confidence", { confidence: "85" }],
  ["missing holders", { raw: {} }],
  ["malformed holders", { raw: { holders: {} } }],
  ["empty holders", { raw: { holders: [] } }],
  ["invalid address", { raw: { holders: [{ address: "invalid", balance: "1" }] } }],
  ["zero balance", { raw: { holders: [{ address: FRESH_HOLDER, balance: "0" }] } }],
  ["negative balance", { raw: { holders: [{ address: FRESH_HOLDER, balance: "-1" }] } }],
  ["malformed balance", { raw: { holders: [{ address: FRESH_HOLDER, balance: "NaN" }] } }],
];

for (const [label, patch] of invalidSamples) {
  test(`a fresher ${label} sample cannot shadow eligible older evidence`, () => {
    const usable = old(), invalid = sample(1000, FRESH_HOLDER, patch);
    assert.deepEqual(collect([invalid, usable]), collect([usable]));
    assert.deepEqual(collect([usable, invalid]), collect([usable]));
    assert.deepEqual(collect([invalid]), []);
  });
}

test("missing and unknown samples remain empty", () => {
  assert.deepEqual(collect([]), []);
  assert.deepEqual(collect([null, undefined, { status: "UNKNOWN" }]), []);
});

test("the chosen sample preserves balance and participant filtering without borrowing older wallets", () => {
  const newer = sample(1000, FRESH_HOLDER, { raw: { holders: [
    { address: FRESH_HOLDER, balance: "0.0000000000000000000001" },
    { address: FRESH_HOLDER.toUpperCase(), balance: "1" },
    { address: POOL, balance: "2" }, { address: TOKEN, balance: "3" },
    { address: OLD_HOLDER, balance: "0" }, { address: `0x${"0".repeat(40)}`, balance: "1" },
  ] } });
  const observations = collect([old(), newer]);
  assert.deepEqual(observations.find(item => item.field === "holderAddresses").value, [FRESH_HOLDER, POOL, TOKEN]);
  assert.deepEqual(observations.find(item => item.field === "wallets").value, [FRESH_HOLDER]);
  const poolOnly = { ...newer, raw: { holders: [{ address: POOL, balance: "1" }] } };
  assert.deepEqual(collect([old(), poolOnly]).map(item => item.field), ["holderAddresses"]);
});

test("helper cache eligibility does not extend downstream field freshness", () => {
  const older = old();
  const observation = collect([older])[0];
  assert.equal(observation.sourceTimestamp, older.observedAt);
  assert.equal(evaluateEvidenceFreshness(observation.sourceTimestamp, observation.field, new Date(NOW)).status, "STALE_DATA");
  assert.deepEqual(collect([sample(7 * 3600000, OLD_HOLDER)]), []);
  assert.deepEqual(collect([fresh()], { cacheTtlMs: 0 }), []);
  assert.deepEqual(collect([fresh()], { cacheTtlMs: 59999 }), []);
});

test("local wallet patch preserves adverse records and existing observations", () => {
  const adverse = old();
  adverse.honeypot = true;
  adverse.raw.is_honeypot = "1";
  const newer = fresh();
  const project = { ...PROJECT, securityEvidence: [adverse, newer],
    canonicalAliasProvenance: { existing: { source: "existing" } } };
  const before = structuredClone(project);
  const patch = securityWalletEvidencePatch(project, project.securityEvidence, { now: NOW });
  const merged = { ...project, ...patch };
  assert.deepEqual(patch.wallets, [FRESH_HOLDER]);
  assert.equal(patch.canonicalAliasProvenance.wallets.sourceTimestamp, newer.observedAt);
  assert.deepEqual(patch.canonicalAliasProvenance.existing, { source: "existing" });
  assert.equal(merged.securityEvidence, project.securityEvidence);
  assert.equal(merged.securityEvidence[0].honeypot, true);
  assert.deepEqual(project, before);
  for (const field of FORBIDDEN_FIELDS) assert.equal(Object.hasOwn(patch, field), false);
  const existing = securityWalletEvidencePatch({ ...project, wallets: [OLD_HOLDER] }, project.securityEvidence, { now: NOW });
  assert.equal(Object.hasOwn(existing, "wallets"), false);
});

test("raw WALLETS executor reuses the newer sample without calls and retains adverse security companions", async () => {
  let calls = 0;
  const forbidden = async () => { calls++; throw new Error("Provider calls are forbidden in this fixture"); };
  const adverse = old();
  adverse.honeypot = true;
  adverse.raw.is_honeypot = "1";
  const newer = fresh();
  newer.honeypot = false;
  newer.raw.is_honeypot = "0";
  const project = { ...PROJECT, securityEvidence: [adverse, newer] };
  const before = structuredClone(project);
  const options = { now: () => NOW, useCache: false, walletHistory: false, useRpcWalletFallback: false,
    maxProviderRequests: 4, providers: { getGoPlusWalletEvidence: forbidden,
      getBlockscoutWalletEvidence: forbidden, getRpcWalletEvidence: forbidden, getFreeSecurityEvidence: forbidden } };
  const state = createActiveEvidenceExecutionState(options);
  const deadline = state.deadlineAt;
  const result = await executeActiveEvidenceProviderRequests(project, ["wallets", "holderAddresses", "honeypotDetected"].map(field => ({
    field, item: { canonicalField: field, targetSources: [{ source: "GoPlus" }] },
  })), options, state);
  assert.equal(calls, 0);
  assert.equal(state.requestsUsed, 0);
  assert.equal(state.deadlineAt, deadline);
  assert.deepEqual(result.attempts.map(item => [item.provider, item.status]), [
    ["existing-security-evidence", "LOCAL_EVIDENCE_AVAILABLE"],
  ]);
  for (const field of ["wallets", "holderAddresses"]) {
    const observation = result.observations.find(item => item.field === field);
    assert.deepEqual(observation.value, [FRESH_HOLDER]);
    assert.equal(observation.sourceTimestamp, project.securityEvidence[1].observedAt);
  }
  for (const field of FORBIDDEN_FIELDS) assert.equal(result.observations.some(item => item.field === field), false);
  assert.equal(result.observations.find(item => item.field === "honeypotDetected").value, true);
  assert.ok(result.projectPatch.securityEvidence.includes(adverse));
  assert.ok(result.projectPatch.securityEvidence.includes(newer));
  assert.deepEqual(project, before);
  assert.equal(project.securityEvidence[0].honeypot, true);
});

test("raw wallet recovery still rejects a locally cached sample after its field freshness expires", async () => {
  const options = { now: () => NOW, useCache: false, walletHistory: false, useRpcWalletFallback: false,
    maxProviderRequests: 0, providers: {
      getGoPlusWalletEvidence: async () => assert.fail("No request budget"),
      getBlockscoutWalletEvidence: async () => assert.fail("No request budget"),
    } };
  const state = createActiveEvidenceExecutionState(options);
  const result = await executeActiveEvidenceProviderRequests({ ...PROJECT, securityEvidence: [old()] }, [{
    field: "wallets", item: { targetSources: [{ source: "GoPlus" }] },
  }], options, state);
  assert.equal(result.observations.some(item => ["wallets", "holderAddresses"].includes(item.field)), false);
  assert.equal(state.requestsUsed, 0);
});

const MINT = "E6vtwCUtcNJdQEPGY8vWKahtu2sfwxQ4j68pUKm7pump";
const ACCOUNT = "5wHAdpzn8zYstzGYPX5GqWCuE3J4MEfqWGFYvzy2i4Am";
const OWNER = "oNGuqAfmXVwPRHZhkMqku4wsXFBs8vEYHm4XTSNDZ8i";
const NEW_OWNER = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const SOLANA_PROJECT = { chain: "solana", tokenAddress: MINT };
function solanaSample(ageMs, ownerAddress, patch = {}) {
  return { provider: "rugcheck-solana-full", schemaVersion: 1, status: "EVIDENCE_AVAILABLE",
    chain: "solana", address: MINT, responseIdentityVerified: true, confidence: 0.85,
    observedAt: new Date(NOW - ageMs).toISOString(), providerReportDetectedAt: "2026-10-01T00:00:00Z",
    raw: { mint: MINT }, solanaHolderAccounts: [{ accountAddress: ACCOUNT, ownerAddress,
      positiveBalanceReported: true }], ...patch };
}
const collectSolana = items => securityHolderObservations(SOLANA_PROJECT, items, { now: NOW });
const wrap = (report, ageMs) => ({ provider: "solana-rpc-rugcheck", chain: "solana", address: MINT,
  observedAt: new Date(NOW - ageMs).toISOString(), raw: { rugCheck: { holderEvidence: report } } });

test("Solana chooses the newest eligible owner report in either order without mutating snapshots", () => {
  const older = solanaSample(3600000, OWNER), newer = solanaSample(60000, NEW_OWNER);
  const before = structuredClone([older, newer]);
  const result = collectSolana([older, newer]);
  assert.deepEqual(result, collectSolana([newer, older]));
  for (const item of result) {
    assert.deepEqual(item.value, [NEW_OWNER]);
    assert.equal(item.sourceTimestamp, newer.observedAt);
    assert.equal(item.tokenAddress, MINT);
    assert.equal(item.holderAddressSemantics, "TOKEN_ACCOUNT_OWNER");
    assert.equal(item.providerReportDetectedAt, newer.providerReportDetectedAt);
    assert.equal(item.confidence, 0.85);
    assert.equal(item.holderSampleOnly, true);
    assert.equal(item.completeHolderCoverage, false);
    assert.equal(item.buyerClassificationAvailable, false);
    assert.equal(item.snapshotTimestampVerified, false);
    assert.equal(item.identityVerifiedOnChain, false);
    assert.equal(FORBIDDEN_FIELDS.includes(item.field), false);
  }
  assert.deepEqual([older, newer], before);
});

test("wrapped Solana evidence orders by inner report time, not newer wrapper receipt", () => {
  const older = wrap(solanaSample(3600000, OWNER), 1);
  const newer = wrap(solanaSample(60000, NEW_OWNER), 30000);
  const result = collectSolana([older, newer]);
  assert.deepEqual(result, collectSolana([newer, older]));
  assert.deepEqual(result[0].value, [NEW_OWNER]);
  assert.equal(result[0].sourceTimestamp, newer.raw.rugCheck.holderEvidence.observedAt);
});

test("Solana equal report times retain the first eligible input", () => {
  const first = solanaSample(60000, OWNER), second = solanaSample(60000, NEW_OWNER);
  assert.deepEqual(collectSolana([first, second])[0].value, [OWNER]);
  assert.deepEqual(collectSolana([second, first])[0].value, [NEW_OWNER]);
});

for (const [label, patch] of [
  ["unknown", { status: "UNKNOWN" }], ["unverified", { responseIdentityVerified: false }],
  ["case-folded mint", { address: MINT.toLowerCase() }], ["foreign raw mint", { raw: { mint: ACCOUNT } }],
  ["case-folded raw mint", { raw: { mint: MINT.toLowerCase() } }], ["foreign chain", { chain: "base" }],
  ["future", { observedAt: new Date(NOW + 1).toISOString() }], ["invalid time", { observedAt: "invalid" }],
  ["missing time", { observedAt: null }], ["low confidence", { confidence: 0.1 }],
  ["empty owners", { solanaHolderAccounts: [] }],
  ["token account as owner", { solanaHolderAccounts: [{ accountAddress: ACCOUNT, ownerAddress: ACCOUNT, positiveBalanceReported: true }] }],
  ["nonpositive balance", { solanaHolderAccounts: [{ accountAddress: ACCOUNT, ownerAddress: OWNER, positiveBalanceReported: false }] }],
]) {
  test(`fresher Solana ${label} evidence cannot shadow a valid older owner sample`, () => {
    const older = solanaSample(3600000, OWNER), invalid = solanaSample(1000, NEW_OWNER, patch);
    assert.deepEqual(collectSolana([older, invalid]), collectSolana([older]));
    assert.deepEqual(collectSolana([invalid, older]), collectSolana([older]));
    assert.deepEqual(collectSolana([invalid]), []);
    assert.deepEqual(collectSolana([wrap(invalid, 1), older]), collectSolana([older]));
  });
}
