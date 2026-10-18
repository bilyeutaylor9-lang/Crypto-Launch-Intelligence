import test, { after, mock } from "node:test";
import assert from "node:assert/strict";
import { analyzeContractAuthorityRisk, analyzeContractAuthorityRiskBatch } from "../src/engines/contractAuthorityRiskEngine.js";

const NOW = Date.parse("2026-10-18T08:30:00.000Z");
const TOKEN = "0x1111111111111111111111111111111111111111";
mock.method(globalThis, "fetch", async () => assert.fail("Live providers are forbidden in this test."));
after(() => mock.restoreAll());

function summary(overrides = {}) {
  return { status: "EVIDENCE_AVAILABLE", verifiedSource: true, knownProviders: ["test-security"],
    testedChecks: ["source", "mint authority"], unknownChecks: [], confidence: 90,
    sourceTimestamps: { "test-security": new Date(NOW).toISOString() }, ...overrides };
}

function project(overrides = {}) {
  return { chain: "base", tokenAddress: TOKEN, deepEvaluationState: "DEEP_EVALUATED", ...overrides };
}

function options(calls, overrides = {}) {
  return { collectSecurityEvidence: true, now: () => NOW,
    securityEvidence: { useCache: false, providers: [async (candidate) => {
      calls.push(candidate.tokenAddress);
      return { provider: "test-security", status: "EVIDENCE_AVAILABLE", chain: candidate.chain,
        address: candidate.tokenAddress, responseIdentityVerified: true, verifiedSource: true,
        observedAt: new Date(NOW).toISOString(), testedChecks: ["source", "mint authority"],
        riskFindings: [], confidence: 90 };
    }] }, ...overrides };
}

test("UNKNOWN and partial existing summaries do not suppress an explicitly enabled bounded recovery", async () => {
  for (const previous of [summary({ status: "UNKNOWN", verifiedSource: false }),
    summary({ unknownChecks: ["mint authority"] })]) {
    const calls = [];
    const [result] = await analyzeContractAuthorityRiskBatch([project({ securityEvidenceSummary: previous })], options(calls));
    assert.equal(calls.length, 1);
    assert.equal(result.safetyRecoveryAttempted, true);
    assert.equal(result.safetyRecoveryDeferred, false);
  }
});

test("fresh complete summaries avoid acquisition while stale, future and missing timestamps refresh", async () => {
  const calls = [];
  await analyzeContractAuthorityRisk(project({ securityEvidenceSummary: summary() }), options(calls));
  assert.equal(calls.length, 0);
  for (const sourceTimestamps of [{}, { provider: "invalid" },
    { provider: new Date(NOW + 1).toISOString() },
    { provider: new Date(NOW - 6 * 60 * 60 * 1000 - 1).toISOString() }]) {
    await analyzeContractAuthorityRisk(project({ securityEvidenceSummary: summary({ sourceTimestamps }) }), options(calls));
  }
  assert.equal(calls.length, 4);
});

test("deferred candidates and ambiguous exact identities cannot trigger collection", async () => {
  const calls = [];
  const candidates = [project({ deepEvaluationState: "DEFERRED_BEFORE_DEEP" }),
    project({ chainId: "bsc" }), project({ tokenAddress: "bad" }),
    project({ contractAddress: "0x2222222222222222222222222222222222222222" }),
    project({ canonicalIdentityHardBlock: true })];
  const results = await analyzeContractAuthorityRiskBatch(candidates, options(calls));
  assert.equal(calls.length, 0);
  assert.ok(results.every((result) => result.safetyRecoveryAttempted === false));
  assert.ok(results.every((result) => result.safetyRecoveryDeferred === false));
});

test("priority limits and exact-identity deduplication still apply to unknown summaries", async () => {
  const calls = [];
  const candidates = Array.from({ length: 20 }, (_, index) => project({
    tokenAddress: `0x${String(index + 1).padStart(40, "0")}`,
    researchOpportunityScore: 20 - index,
    securityEvidenceSummary: summary({ status: "UNKNOWN" }),
  }));
  candidates[1].tokenAddress = candidates[0].tokenAddress;
  const results = await analyzeContractAuthorityRiskBatch(candidates, options(calls, { maxSecurityRecoveryCandidates: 3 }));
  assert.equal(calls.length, 3);
  assert.equal(results.filter((result) => result.safetyRecoveryAttempted).length, 3);
  assert.equal(results.filter((result) => result.safetyRecoveryDeferred).length, 17);
  assert.deepEqual(calls, [candidates[0].tokenAddress, candidates[2].tokenAddress, candidates[3].tokenAddress]);
});

test("Solana mint identities differing by case remain separate recovery identities", async () => {
  const calls = [];
  const mint = "3HLhtXNCVh1VbCrpwACoZWwHoNeoCB7hRAPcYN2jjUiL";
  const other = mint.replace("H", "h");
  const candidates = [mint, other].map((tokenAddress) => project({ chain: "solana", tokenAddress }));
  const results = await analyzeContractAuthorityRiskBatch(candidates, options(calls));
  assert.equal(calls.length, 2);
  assert.ok(results.every((result) => result.safetyRecoveryAttempted === true));
});

test("a failed refresh retains original risks and timestamps without clearing missing proof", async () => {
  const oldTime = new Date(NOW - 7 * 60 * 60 * 1000).toISOString();
  const previous = summary({ proxy: true, unknownChecks: ["goplus.cannot_sell_all"],
    sourceTimestamps: { blockscout: oldTime } });
  const optionsWithFailure = options([], { securityEvidence: { providers: [async () => ({
    provider: "blockscout", status: "UNKNOWN", observedAt: new Date(NOW).toISOString(),
    verifiedSource: false, warnings: ["provider unavailable"], confidence: 0,
  })] } });
  const result = await analyzeContractAuthorityRisk(project({ securityEvidenceSummary: previous }), optionsWithFailure);
  assert.equal(result.securityEvidenceSummary.proxy, true);
  assert.equal(result.securityEvidenceSummary.sourceTimestamps.blockscout, oldTime);
  assert.ok(result.securityEvidenceSummary.unknownChecks.includes("goplus.cannot_sell_all"));
  assert.equal(result.contractSafetyVerified, false);
  assert.notEqual(result.safetyProofStatus, "SAFETY_VERIFIED_CLEAN");
});

test("disabled collection cannot turn stale complete evidence into current verified safety", async () => {
  const calls = [];
  const stale = summary({ sourceTimestamps: { provider: new Date(NOW - 7 * 60 * 60 * 1000).toISOString() } });
  const result = await analyzeContractAuthorityRisk(project({ securityEvidenceSummary: stale }),
    options(calls, { collectSecurityEvidence: false }));
  assert.equal(calls.length, 0);
  assert.equal(result.contractSafetyVerified, false);
});
