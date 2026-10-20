import test from "node:test";
import assert from "node:assert/strict";
import { securityHolderObservations, securityWalletEvidencePatch } from "../src/data/security/securityWalletEvidence.js";

const TOKEN = `0x${"1".repeat(40)}`;
const POOL = `0x${"2".repeat(40)}`;
const HOLDER = `0x${"3".repeat(40)}`;
const OTHER = `0x${"4".repeat(40)}`;
const ZERO = `0x${"0".repeat(40)}`;
const project = { chain: "base", tokenAddress: TOKEN, poolAddress: POOL };
const options = { now: new Date("2026-10-10T12:00:00Z"), cacheTtlMs: 6 * 60 * 60 * 1000 };
const evidence = {
  provider: "goplus", status: "EVIDENCE_AVAILABLE", responseIdentityVerified: true,
  chain: "base", address: TOKEN, observedAt: "2026-10-10T11:00:00Z", confidence: 85,
};
const report = (holders, changes = {}) => ({ ...evidence, raw: { holders }, ...changes });

test("explicit zero and negative GoPlus balances cannot supply holder or wallet evidence", () => {
  for (const balance of [0, -0, -1, -0.001, "0", "00", "0.000", " 0 ", "-0", "-1", "-0.001"]) {
    const item = report([{ address: HOLDER, balance }]);
    assert.deepEqual(securityHolderObservations(project, [item], options), [], String(balance));
    assert.deepEqual(securityWalletEvidencePatch(project, [item], options), {}, String(balance));
  }
});

test("malformed and coercible GoPlus balances are rejected without numeric coercion", () => {
  for (const balance of [
    null, undefined, true, false, [], [0], [1], ["1"], {}, { value: 1 },
    NaN, Infinity, -Infinity, "", " ", "NaN", "Infinity", "1e3", "0x1",
    "1,000", "1 token", "1.2.3", "+1", "--1",
  ]) {
    const item = report([{ address: HOLDER, balance }]);
    assert.deepEqual(securityHolderObservations(project, [item], options), [], String(balance));
    assert.deepEqual(securityWalletEvidencePatch(project, [item], options), {}, String(balance));
  }
});

test("positive decimal GoPlus balances stay raw provider samples, including extreme decimal strings", () => {
  for (const balance of [
    1, 0.001, Number.MIN_VALUE, "1", "0001.000", "0.001", ".5", " 1.25 ",
    "9007199254740993.123456789", "9".repeat(400), `0.${"0".repeat(400)}1`,
  ]) {
    const item = report([{ address: HOLDER, balance }]);
    const observations = securityHolderObservations(project, [item], options);
    assert.deepEqual(observations.map(({ field, value }) => ({ field, value })), [
      { field: "holderAddresses", value: [HOLDER] }, { field: "wallets", value: [HOLDER] },
    ], String(balance));
    for (const observation of observations) {
      assert.equal(observation.source, "goplus");
      assert.equal(observation.sourceTimestamp, evidence.observedAt);
      assert.equal(observation.confidence, 0.85);
      assert.equal(observation.verificationStatus, "VERIFIED_PROVIDER_OBSERVATION");
      assert.equal(observation.chain, "base");
      assert.equal(observation.tokenAddress, TOKEN);
      assert.equal(observation.holderSampleOnly, true);
      assert.equal(observation.completeHolderCoverage, false);
      assert.equal(observation.buyerClassificationAvailable, false);
      assert.notEqual(observation.identityVerifiedOnChain, true);
      assert.notEqual(observation.snapshotTimestampVerified, true);
    }
    const patch = securityWalletEvidencePatch(project, [item], options);
    for (const field of ["holderCount", "uniqueBuyers24h", "independentBuyers24h", "smartWallets", "smartWalletScore", "contractSafetyVerified"]) {
      assert.equal(patch[field], undefined);
    }
  }
});

test("omitted optional balances preserve provider-listed-holder semantics without mutating payloads", () => {
  const holder = Object.freeze({ address: HOLDER });
  const item = Object.freeze(report(Object.freeze([holder])));
  const observations = securityHolderObservations(project, [item], options);
  assert.deepEqual(observations.map(({ value }) => value), [[HOLDER], [HOLDER]]);
  assert.equal(Object.hasOwn(holder, "balance"), false);
});

test("mixed holders filter invalid balances before deduplication and retain pool and token exclusions", () => {
  const item = report([
    { address: HOLDER, balance: "0" }, { address: OTHER, balance: false },
    { address: HOLDER.toUpperCase(), balance: "0.0001" }, { address: HOLDER },
    { address: POOL, balance: "2" }, { address: TOKEN, balance: "3" },
    { address: ZERO, balance: "4" }, { address: "invalid", balance: "5" },
    null, [], true,
  ]);
  const observations = securityHolderObservations(project, [item], options);
  assert.deepEqual(observations[0].value, [HOLDER, POOL, TOKEN]);
  assert.deepEqual(observations[1].value, [HOLDER]);
  const patch = securityWalletEvidencePatch(project, [item], options);
  assert.deepEqual(patch.wallets, [HOLDER]);
  assert.deepEqual(securityHolderObservations({ chain: "base", tokenAddress: TOKEN, pairAddress: POOL }, [item], options)[1].value, [HOLDER]);
  assert.equal(securityWalletEvidencePatch({ ...project, wallets: [OTHER] }, [item], options).wallets, undefined);
});

test("positive balances do not bypass identity, response, freshness, or confidence gates", () => {
  for (const changes of [
    { provider: "other" }, { status: "UNKNOWN" }, { responseIdentityVerified: false },
    { responseIdentityVerified: "true" }, { responseIdentityVerified: undefined },
    { chain: "ethereum" }, { address: OTHER }, { address: undefined },
    { observedAt: "2026-10-09T00:00:00Z" }, { observedAt: "2026-10-11T00:00:00Z" },
    { observedAt: "invalid" }, { confidence: 0.49 }, { confidence: "85" }, { confidence: NaN },
  ]) {
    assert.deepEqual(securityHolderObservations(project, [report([{ address: HOLDER, balance: "1" }], changes)], options), []);
  }
  const item = report([{ address: HOLDER, balance: "1" }]);
  for (const changes of [{ canonicalChain: "ethereum" }, { contractAddress: OTHER }, { chain: "solana" }]) {
    assert.deepEqual(securityHolderObservations({ ...project, ...changes }, [item], options), []);
  }
  assert.deepEqual(securityHolderObservations(project, [item], { ...options, cacheTtlMs: 0 }), []);
});

test("an all-rejected payload does not block a later valid GoPlus holder sample", () => {
  const observations = securityHolderObservations(project, [
    report([{ address: OTHER, balance: "0" }]), report([{ address: HOLDER, balance: "1" }]),
  ], options);
  assert.deepEqual(observations.map(({ value }) => value), [[HOLDER], [HOLDER]]);
});
