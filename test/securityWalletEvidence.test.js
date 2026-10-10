import test from "node:test";
import assert from "node:assert/strict";
import { securityHolderObservations, securityWalletEvidencePatch } from "../src/data/security/securityWalletEvidence.js";
import { createActiveEvidenceExecutionState, executeActiveEvidenceProviderRequests } from "../src/data/activeEvidenceProviderExecutor.js";
import { analyzeContractAuthorityRisk } from "../src/engines/contractAuthorityRiskEngine.js";

const TOKEN = `0x${"1".repeat(40)}`;
const POOL = `0x${"2".repeat(40)}`;
const HOLDER = `0x${"3".repeat(40)}`;
const project = { chain: "base", tokenAddress: TOKEN, poolAddress: POOL };
const now = new Date("2026-10-10T12:00:00Z");
const evidence = {
  provider: "goplus", status: "EVIDENCE_AVAILABLE", responseIdentityVerified: true,
  chain: "base", address: TOKEN, observedAt: "2026-10-10T11:00:00Z", confidence: 85,
  raw: { holders: [{ address: HOLDER }, { address: HOLDER.toUpperCase() }, { address: POOL },
    { address: TOKEN }, { address: `0x${"0".repeat(40)}` }, { address: "invalid" }] },
};

test("exact security holder samples retain provenance without claiming buyer or full holder coverage", () => {
  const observations = securityHolderObservations(project, [evidence], { now });
  assert.deepEqual(observations.map((item) => item.field), ["holderAddresses", "wallets"]);
  assert.deepEqual(observations[0].value, [HOLDER, POOL, TOKEN]);
  assert.deepEqual(observations[1].value, [HOLDER]);
  for (const item of observations) {
    assert.equal(item.source, "goplus");
    assert.equal(item.sourceTimestamp, evidence.observedAt);
    assert.equal(item.confidence, 0.85);
    assert.equal(item.verificationStatus, "VERIFIED_PROVIDER_OBSERVATION");
    assert.equal(item.tokenAddress, TOKEN);
    assert.equal(item.chain, "base");
    assert.equal(item.holderSampleOnly, true);
    assert.equal(item.completeHolderCoverage, false);
    assert.equal(item.buyerClassificationAvailable, false);
  }
  const patch = securityWalletEvidencePatch(project, [evidence], { now });
  assert.deepEqual(patch.wallets, [HOLDER]);
  assert.equal(patch.canonicalAliasProvenance.wallets.sourceTimestamp, evidence.observedAt);
  for (const field of ["uniqueBuyers24h", "holderCount", "independentBuyers24h", "smartWallets", "smartWalletScore"]) {
    assert.equal(patch[field], undefined);
  }
});

test("unverified, mismatched, stale, future, malformed and low-confidence holder samples stay unknown", () => {
  for (const changes of [
    { responseIdentityVerified: false }, { provider: "unknown" }, { status: "UNKNOWN" },
    { chain: "ethereum" }, { address: HOLDER }, { observedAt: "2026-10-09T00:00:00Z" },
    { observedAt: "2026-10-11T00:00:00Z" }, { observedAt: null },
    { confidence: 0.1 }, { confidence: "85" }, { raw: { holders: [] } },
    { raw: { holders: [{ address: "0xdead" }] } },
  ]) assert.deepEqual(securityHolderObservations(project, [{ ...evidence, ...changes }], { now }), []);
  assert.deepEqual(securityHolderObservations({ symbol: "TEST" }, [evidence], { now }), []);
  assert.deepEqual(securityHolderObservations({ ...project, chain: "solana" }, [evidence], { now }), []);
  assert.deepEqual(securityHolderObservations({ ...project, contractAddress: HOLDER }, [evidence], { now }), []);
  assert.deepEqual(securityHolderObservations({ ...project, canonicalChain: "ethereum" }, [evidence], { now }), []);
  assert.deepEqual(securityHolderObservations(project, [evidence], { now, cacheTtlMs: 0 }), []);
});

test("security holder reuse preserves existing wallet observations", () => {
  const existing = [`0x${"4".repeat(40)}`];
  const patch = securityWalletEvidencePatch({ ...project, wallets: existing }, [evidence], { now });
  assert.equal(patch.wallets, undefined);
  assert.deepEqual(patch.holderAddresses, [HOLDER, POOL, TOKEN]);
});

test("existing exact holder payload hydrates raw wallet evidence without a provider request", async () => {
  const options = { now, maxProviderRequests: 0 };
  const state = createActiveEvidenceExecutionState(options);
  const result = await executeActiveEvidenceProviderRequests({ ...project, securityEvidence: [evidence] }, [], options, state);
  assert.deepEqual(result.observations.find((item) => item.field === "wallets").value, [HOLDER]);
  assert.equal(state.requestsUsed, 0);
  assert.deepEqual(result.attempts, []);
});

const request = (field, source) => ({ field, item: { canonicalField: field, targetSources: [{ source }] } });

test("creator recovery forwards raw holders and avoids a redundant wallet RPC", async () => {
  let calls = 0;
  const state = createActiveEvidenceExecutionState({ maxProviderRequests: 1 });
  const result = await executeActiveEvidenceProviderRequests(project,
    [request("creator", "security providers"), request("wallets", "chain RPC")], {
      now, providers: {
        getGoPlusDeployerEvidence: async () => { calls += 1; return { ...evidence, creatorAddress: HOLDER }; },
        getRpcWalletEvidence: async () => { throw new Error("holder companion must avoid redundant RPC"); },
      },
    }, state);
  assert.equal(calls, 1);
  assert.equal(state.requestsUsed, 1);
  assert.deepEqual(result.observations.find((item) => item.field === "wallets").value, [HOLDER]);
  assert.deepEqual(result.attempts.map((item) => item.provider), ["goplus-deployer"]);
});

test("fresh security recovery forwards raw holder companions without extra requests", async () => {
  let calls = 0;
  const state = createActiveEvidenceExecutionState({ maxProviderRequests: 4 });
  const result = await executeActiveEvidenceProviderRequests(project, [request("honeypotDetected", "GoPlus")], {
    now, providers: { getFreeSecurityEvidence: async () => {
      calls += 1;
      return { evidence: [{ ...evidence, honeypot: false, raw: { ...evidence.raw, is_honeypot: "0" } }] };
    } },
  }, state);
  assert.equal(calls, 1);
  assert.equal(state.requestsUsed, 4);
  assert.deepEqual(result.observations.find((item) => item.field === "wallets").value, [HOLDER]);
  assert.equal(result.observations.find((item) => item.field === "honeypotDetected").value, false);
});

test("contract security engine exposes existing holder samples but retains unknown safety gates", async () => {
  const result = await analyzeContractAuthorityRisk({ ...project, securityEvidence: [evidence] }, { now, collectSecurityEvidence: false });
  assert.deepEqual(result.wallets, [HOLDER]);
  assert.equal(result.canonicalAliasProvenance.wallets.completeHolderCoverage, false);
  assert.equal(result.contractSafetyVerified, false);
  assert.equal(result.uniqueBuyers24h, undefined);
});

test("fresh security recovery rejects wrong identity and legacy unverified GoPlus payloads", async () => {
  for (const changes of [{ address: HOLDER }, { chain: "ethereum" }, { responseIdentityVerified: false }, { address: undefined }]) {
    const result = await executeActiveEvidenceProviderRequests(project, [request("honeypotDetected", "GoPlus")], {
      now: () => now.getTime(), maxProviderRequests: 4, providers: { getFreeSecurityEvidence: async () => ({
        evidence: [{ ...evidence, honeypot: false, raw: { ...evidence.raw, is_honeypot: "0" }, ...changes }],
      }) },
    });
    assert.deepEqual(result.observations, []);
    assert.deepEqual(result.projectPatch.securityEvidence, []);
  }
});
