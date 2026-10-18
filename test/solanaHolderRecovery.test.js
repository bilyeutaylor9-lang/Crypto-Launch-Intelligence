import test from "node:test";
import assert from "node:assert/strict";
import { normalizeRugCheckFullReport, getRugCheckFullTokenEvidence, getSolanaSecurityEvidence } from "../src/data/security/solanaSecurityConnector.js";
import { securityHolderObservations, securityWalletEvidencePatch } from "../src/data/security/securityWalletEvidence.js";
import { createActiveEvidenceExecutionState, executeActiveEvidenceProviderRequests } from "../src/data/activeEvidenceProviderExecutor.js";
import { analyzeActiveEvidenceRecoveryBatch } from "../src/engines/activeEvidenceRecoveryEngine.js";
import { analyzeOrganicBuyerClassifier } from "../src/engines/organicBuyerClassifierEngine.js";
import { analyzeWalletCluster } from "../src/engines/walletClusterEngine.js";
import { routeMissingEvidence } from "../src/data/targetedEnrichmentRouter.js";

const MINT = "E6vtwCUtcNJdQEPGY8vWKahtu2sfwxQ4j68pUKm7pump";
const ACCOUNT = "5wHAdpzn8zYstzGYPX5GqWCuE3J4MEfqWGFYvzy2i4Am";
const OWNER = "oNGuqAfmXVwPRHZhkMqku4wsXFBs8vEYHm4XTSNDZ8i";
const PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
const project = { chain: "solana", tokenAddress: MINT };
const now = new Date();
const observedAt = new Date(now.getTime() - 60000).toISOString();
const report = { mint: MINT, tokenProgram: PROGRAM, topHolders: [{ address: ACCOUNT, owner: OWNER, amount: 12 }],
  totalHolders: 120, risks: [], rugged: false, mintAuthority: null, freezeAuthority: null,
  detectedAt: "2026-10-01T00:00:00Z" };
const evidence = () => normalizeRugCheckFullReport(report, project, { observedAt });
const request = (field) => ({ field, item: { canonicalField: field, targetSources: [{ source: "RugCheck" }] } });

test("Solana samples use token owners, never token accounts, buyers or fresh-snapshot claims", () => {
  const result = evidence();
  assert.deepEqual(result.wallets, [OWNER]);
  assert.deepEqual(result.holderAddresses, [OWNER]);
  assert.equal(result.holderCount, 120);
  assert.equal(result.solanaHolderAccounts[0].accountAddress, ACCOUNT);
  assert.equal(result.snapshotTimestampVerified, false);
  assert.equal(result.identityVerifiedOnChain, false);
  const observations = securityHolderObservations(project, [result], { now });
  assert.equal(observations.length, 2);
  for (const observation of observations) {
    assert.equal(observation.sourceTimestamp, observedAt);
    assert.equal(observation.providerReportDetectedAt, report.detectedAt);
    assert.equal(observation.buyerClassificationAvailable, false);
    assert.equal(observation.holderAddressSemantics, "TOKEN_ACCOUNT_OWNER");
  }
  const scored = analyzeWalletCluster(analyzeOrganicBuyerClassifier({ ...project, ...securityWalletEvidencePatch(project, [result], { now }) }));
  assert.equal(scored.organicBuyerScore, null);
  assert.equal(scored.walletClusterScore, null);
  assert.equal(scored.creator, undefined);
});

test("foreign, case-folded, conflicting and symbol-only identities remain unknown", () => {
  for (const changes of [{ mint: ACCOUNT }, { mint: MINT.toLowerCase() }, { tokenProgram: OWNER }]) {
    assert.equal(normalizeRugCheckFullReport({ ...report, ...changes }, project).status, "UNKNOWN");
  }
  for (const candidate of [{ symbol: "TEST" }, { ...project, chain: "base" },
    { ...project, network: "base" }, { ...project, contractAddress: ACCOUNT }]) {
    assert.equal(normalizeRugCheckFullReport(report, candidate).status, "UNKNOWN");
  }
});

test("missing, zero and malformed ownership never manufactures a sample or buyer count", () => {
  for (const holder of [{ address: ACCOUNT, amount: 12 }, { address: ACCOUNT, owner: OWNER, amount: 0 },
    { address: ACCOUNT, owner: ACCOUNT, amount: 12 }, { address: ACCOUNT, owner: "bad", amount: 12 }]) {
    const result = normalizeRugCheckFullReport({ ...report, topHolders: [holder] }, project, { observedAt });
    assert.deepEqual(securityHolderObservations(project, [result], { now }), []);
    assert.equal(result.uniqueBuyers24h, undefined);
  }
});

test("unsafe numeric balances cannot become exact token quantities", () => {
  const result = normalizeRugCheckFullReport({ ...report, topHolders: [{ address: ACCOUNT, owner: OWNER, amount: 1e20 }] }, project);
  assert.equal(result.solanaHolderAccounts[0].tokenAmountRaw, null);
  assert.equal(result.solanaHolderAccounts[0].balancePrecisionVerified, false);
});

test("stale, future, foreign and unverified cache observations cannot hydrate inputs", () => {
  for (const patch of [{ observedAt: new Date(now.getTime() - 86400000).toISOString() },
    { observedAt: new Date(now.getTime() + 86400000).toISOString() }, { responseIdentityVerified: false },
    { schemaVersion: undefined }, { address: ACCOUNT }, { chain: "base" }, { confidence: 0.1 }]) {
    assert.deepEqual(securityHolderObservations(project, [{ ...evidence(), ...patch }], { now }), []);
  }
});

test("wallet routing is chain-specific and unsupported Solana transactions remain unavailable", () => {
  assert.deepEqual(routeMissingEvidence({ canonicalField: "wallets" }, { chain: "solana" }).targetSources.map((item) => item.source), ["RugCheck"]);
  assert.equal(routeMissingEvidence({ canonicalField: "walletTransactions" }, { chain: "solana" }).recoverable, false);
  assert.equal(routeMissingEvidence({ canonicalField: "wallets" }, { chain: "base" }).targetSources.some((item) => item.source === "RugCheck"), false);
});

test("active recovery invokes the Solana provider with one request and original provenance", async () => {
  let calls = 0;
  const state = createActiveEvidenceExecutionState({ maxProviderRequests: 1 });
  const result = await executeActiveEvidenceProviderRequests(project, [request("wallets")], {
    now: () => now.getTime(), useCache: false, walletHistory: false,
    providers: { getSolanaWalletEvidence: async (candidate) => { calls++; assert.equal(candidate.tokenAddress, MINT); return evidence(); } },
  }, state);
  assert.equal(calls, 1);
  assert.equal(state.requestsUsed, 1);
  assert.deepEqual(result.observations.find((item) => item.field === "wallets").value, [OWNER]);
  assert.equal(result.observations[0].sourceTimestamp, observedAt);
  assert.equal(result.projectPatch.solanaWalletEvidence.address, MINT);
});

test("cached exact owner samples can hydrate at zero budget without refreshing timestamps", async () => {
  let calls = 0;
  const state = createActiveEvidenceExecutionState({ maxProviderRequests: 0 });
  const result = await executeActiveEvidenceProviderRequests({ ...project, solanaWalletEvidence: evidence() }, [request("wallets")], {
    now: () => now.getTime(), useCache: false, walletHistory: false,
    providers: { getSolanaWalletEvidence: async () => { calls++; return evidence(); } },
  }, state);
  assert.equal(calls, 0);
  assert.equal(state.requestsUsed, 0);
  assert.equal(result.observations[0].sourceTimestamp, observedAt);
});

test("zero provider budget cannot be bypassed by stale cached owner samples", async () => {
  let calls = 0;
  const result = await executeActiveEvidenceProviderRequests({ ...project,
    solanaWalletEvidence: { ...evidence(), observedAt: new Date(now.getTime() - 86400000).toISOString() } }, [request("wallets")], {
    now: () => now.getTime(), useCache: false, walletHistory: false,
    providers: { getSolanaWalletEvidence: async () => { calls++; return evidence(); } },
  }, createActiveEvidenceExecutionState({ maxProviderRequests: 0 }));
  assert.equal(calls, 0);
  assert.equal(result.observations.length, 0);
});

test("full collector uses the existing exact report path and fails closed on transport errors", async () => {
  let path;
  const result = await getRugCheckFullTokenEvidence(project, { useCache: false,
    fetchJson: async (url) => { path = url; return report; } });
  assert.equal(path, `https://api.rugcheck.xyz/v1/tokens/${MINT}/report`);
  assert.equal(result.status, "EVIDENCE_AVAILABLE");
  const failed = await getRugCheckFullTokenEvidence(project, { useCache: false,
    fetchJson: async () => { throw new Error("HTTP 403"); } });
  assert.equal(failed.status, "UNKNOWN");
  assert.equal(failed.providerFailure, true);
});

test("Solana safety rejects non-mint RPC accounts and never treats missing report fields as clean", async () => {
  for (const incomplete of [{ ...report, risks: undefined }, { ...report, mintAuthority: "" }, { ...report, freezeAuthority: undefined }]) {
    const result = await getSolanaSecurityEvidence(project, { useCache: false, fetchJson: async (_url, init) => init.method === "POST"
      ? { result: { value: { owner: PROGRAM, data: { parsed: { type: "account", info: { mintAuthority: null, freezeAuthority: null } } } } } }
      : incomplete });
    assert.equal(result.status, "UNKNOWN");
  }
});

test("active raw mint and freeze authorities remain risks without provider labels", async () => {
  const result = await getSolanaSecurityEvidence(project, { useCache: false, fetchJson: async (_url, init) => {
    if (init.method === "POST") throw new Error("RPC unavailable");
    return { ...report, mintAuthority: OWNER, freezeAuthority: OWNER };
  } });
  assert.equal(result.status, "RISK_REVIEW");
  assert.equal(result.mintRisk, true);
  assert.equal(result.freezeRisk, true);
  assert.equal(result.raw.rugCheck.score, null);
  assert.deepEqual(securityHolderObservations(project, [result]).map((item) => item.field), ["holderAddresses", "wallets"]);
});

test("wave 2 limits actual Solana hydration and marks changed wallet dependencies", async () => {
  let calls = 0;
  const candidates = [2, 1].map((score, index) => ({ ...project, projectId: `sol-${index}`, valueOfInformationScore: score,
    dataStarvationStatus: "CORE_DATA_STARVED", starvationRecoveryPlan: { items: [
      { canonicalField: "wallets", evidenceFamily: "WALLETS", targetSources: [{ source: "RugCheck" }], recoveryDisposition: "RAW_RECOVERABLE" },
    ] } }));
  const results = await analyzeActiveEvidenceRecoveryBatch(candidates, { wave1Max: 0, wave2Max: 1, wave3Max: 0,
    maxProviderRequests: 1, useCache: false, walletHistory: false,
    providers: { getSolanaWalletEvidence: async () => { calls++; return evidence(); } } });
  assert.equal(calls, 1);
  assert.equal(results.filter((item) => item.wallets?.length).length, 1);
  assert.deepEqual(results[0].wallets, [OWNER]);
  assert.ok(results[0].activeEvidenceRecovery.changedEvidenceFamilies.includes("WALLETS"));
});
