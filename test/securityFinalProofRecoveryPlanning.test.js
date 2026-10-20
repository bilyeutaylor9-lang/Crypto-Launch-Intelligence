import test, { after, mock } from "node:test";
import assert from "node:assert/strict";
import {
  analyzeActiveEvidenceRecoveryBatch,
  buildActiveEvidenceRecoveryWaves,
} from "../src/engines/activeEvidenceRecoveryEngine.js";
import { decisionProofAssessment } from "../src/kernel/evidenceFunnelSummary.js";

const NOW = Date.parse("2026-10-18T06:50:00.000Z");
const MINT = "E6vtwCUtcNJdQEPGY8vWKahtu2sfwxQ4j68pUKm7pump";
const OTHER_MINT = "So11111111111111111111111111111111111111112";
const POOL = "5wHAdpzn8zYstzGYPX5GqWCuE3J4MEfqWGFYvzy2i4Am";

mock.method(globalThis, "fetch", async () => assert.fail("Network access is forbidden in this test."));
after(() => mock.restoreAll());

function candidate(overrides = {}) {
  return {
    symbol: "AUTH",
    chain: "solana",
    tokenAddress: MINT,
    contractAddress: MINT,
    poolAddress: POOL,
    deepEvaluationState: "DEEP_EVALUATED",
    mintAuthorityEnabled: false,
    fieldProvenance: { mintAuthorityEnabled: { source: "older-observation", value: false } },
    executionProof: {
      routeType: "DEX",
      exactIdentityVerified: true,
      safetyVerified: false,
      authorityEvidenceRequired: true,
      authorityEvidenceVerified: false,
      authoritySafetyClean: false,
      transferTaxEvidenceRequired: false,
    },
    ...overrides,
  };
}

function securityEvidence(project, overrides = {}) {
  return {
    provider: "solana-rpc-rugcheck",
    status: "EVIDENCE_AVAILABLE",
    chain: "solana",
    address: project.tokenAddress,
    observedAt: new Date(NOW).toISOString(),
    responseIdentityVerified: true,
    verifiedSource: true,
    identityVerifiedOnChain: true,
    mintRisk: false,
    freezeRisk: false,
    testedChecks: ["mint-account identity", "mint authority", "freeze authority"],
    confidence: 90,
    ...overrides,
  };
}

function options(collector, overrides = {}) {
  return {
    wave1Max: 0,
    wave2Max: 10,
    wave3Max: 0,
    concurrency: 1,
    maxProviderRequests: 40,
    providerTimeoutMs: 250,
    useCache: false,
    walletHistory: false,
    freeOnly: true,
    now: () => NOW,
    providers: { getFreeSecurityEvidence: collector },
    ...overrides,
  };
}

function planned(project, overrides = {}) {
  return buildActiveEvidenceRecoveryWaves([project], options(undefined, overrides)).waves.WAVE2;
}

function assertNotPromoted(project, original) {
  assert.deepEqual(project.executionProof, original.executionProof);
  for (const field of ["liveExecutionReady", "executionProofVerified", "contractSafetyVerified",
    "authorityEvidenceVerified", "authoritySafetyClean", "taxesVerified", "transferTaxVerified",
    "safetyProofStatus", "safetyProofLane", "finalSelectionQualified"]) {
    assert.equal(project[field], original[field], field);
  }
  assert.ok(decisionProofAssessment(project).missingFields.includes("TOKEN_AUTHORITY"));
}

test("TOKEN_AUTHORITY plans one fresh raw security field through the existing registry", () => {
  const project = candidate();
  const original = structuredClone(project);
  const waves = planned(project);
  assert.equal(waves.length, 1);
  assert.equal(waves[0].entries.length, 1);
  const entry = waves[0].entries[0];
  assert.equal(entry.field, "mintAuthorityEnabled");
  assert.equal(entry.family, "SECURITY");
  assert.equal(entry.wave, "WAVE2");
  assert.equal(entry.coreEvidence, true);
  assert.equal(entry.item.recoveryDisposition, "RAW_RECOVERABLE");
  assert.equal(entry.item.requiresFreshObservation, true);
  assert.equal(entry.item.requiresAuthorityPair, true);
  assert.equal(entry.item.blockingExecution, true);
  assert.deepEqual(entry.item.targetSources.map((source) => source.source), ["chain RPC"]);
  assert.deepEqual(project, original);
});

test("authority recovery requires a current missing proof, not a safety-only or tax gap", () => {
  for (const proof of [undefined, {}, "[repeated data omitted from report]",
    { authorityEvidenceRequired: false, safetyVerified: false },
    { authorityEvidenceRequired: false, transferTaxEvidenceRequired: true, transferTaxEvidenceVerified: false },
    { authorityEvidenceRequired: true, authorityEvidenceVerified: true, authoritySafetyClean: true,
      authorityEvidenceSourceTimestamp: new Date().toISOString() },
    { authorityEvidenceRequired: true, authorityEvidenceVerified: true, authoritySafetyClean: false }]) {
    assert.deepEqual(planned(candidate({ executionProof: proof })), []);
  }
  const project = candidate();
  assert.deepEqual(planned(candidate({ chain: "base", tokenAddress: "0x1111111111111111111111111111111111111111",
    contractAddress: "0x1111111111111111111111111111111111111111", executionProof: project.executionProof })), []);
});

test("missing, malformed, case-folded and conflicting Solana identities cannot plan authority work", () => {
  for (const patch of [
    { tokenAddress: undefined, contractAddress: undefined },
    { tokenAddress: "bad", contractAddress: "bad" },
    { contractAddress: OTHER_MINT },
    { address: OTHER_MINT },
    { contractAddress: MINT.toLowerCase() },
    { chainId: "base" },
    { canonicalChain: "base" },
    { network: "base" },
    { rawCandidate: { tokenAddress: OTHER_MINT } },
    { marketData: { chain: "base" } },
    { canonicalExecutionRoute: { tokenAddress: OTHER_MINT } },
    { finalContractAddress: OTHER_MINT },
  ]) assert.deepEqual(planned(candidate(patch)), [], JSON.stringify(patch));
});

test("exact chain and mint are sufficient for token-level authority recovery without a pool", () => {
  assert.equal(planned(candidate({ poolAddress: undefined })).length, 1);
});

test("fresh authority work merges with an existing higher-value scalar plan", () => {
  const project = candidate({ targetedEnrichmentPlan: { items: [{
    canonicalField: "mintAuthorityEnabled", valueOfInformationScore: 10,
    targetSources: [{ source: "chain RPC" }], evidenceClass: "CORE",
  }] } });
  const entries = planned(project)[0].entries;
  assert.equal(entries.length, 1);
  assert.equal(entries[0].item.valueOfInformationScore, 10);
  assert.equal(entries[0].item.requiresFreshObservation, true);
  assert.equal(entries[0].item.requiresAuthorityPair, true);
});

test("authority work is bounded by Wave2 selection and does not add EVM or derived fields", () => {
  const projects = [candidate({ valueOfInformationScore: 1 }), candidate({ valueOfInformationScore: 20 })];
  const { waves } = buildActiveEvidenceRecoveryWaves(projects, options(undefined, { wave2Max: 1 }));
  assert.equal(waves.WAVE1.length, 0);
  assert.equal(waves.WAVE3.length, 0);
  assert.equal(waves.WAVE2.length, 1);
  assert.equal(waves.WAVE2[0].projectIndex, 1);
  assert.deepEqual(waves.WAVE2[0].entries.map((entry) => entry.field), ["mintAuthorityEnabled"]);
  assert.deepEqual(planned(candidate(), { wave2Max: 0 }), []);
});

test("deferred and conclusively rejected candidates make no authority collector calls", async () => {
  let calls = 0;
  const projects = [
    candidate({ deepEvaluationState: "DEFERRED_BEFORE_DEEP" }),
    candidate({ deepEvaluationDeferred: true }),
    candidate({ deepEvaluationSelected: false }),
    candidate({ finalSelectionState: "BLOCKED", honeypotDetected: true }),
    candidate({ finalSelectionState: "IDENTITY_CONFLICT", canonicalIdentityHardBlock: true }),
    candidate({ verifiedScam: true }),
    candidate({ executionProof: { ...candidate().executionProof, executionStatus: "CONTRACT_MISMATCH" } }),
    candidate({ executionProof: { ...candidate().executionProof,
      authorityEvidenceVerified: true, authoritySafetyClean: false } }),
  ];
  const result = await analyzeActiveEvidenceRecoveryBatch(projects, options(async () => { calls++; }));
  assert.equal(calls, 0);
  assert.equal(result[0].activeEvidenceRecoveryStatus, "DEFERRED_BEFORE_DEEP");
  assert.equal(result[0].activeEvidenceRecovery.batchSummary.selectedWaveCounts.WAVE2, 0);
});

test("bare denials with unknown authority proof still receive selected raw recovery", async () => {
  let calls = 0;
  const projects = [candidate({ finalSelectionState: "BLOCKED" }),
    candidate({ finalSelectionState: "IDENTITY_CONFLICT" }),
    candidate({ executionProof: { ...candidate().executionProof, executionStatus: "REJECTED" } })];
  const recovered = await analyzeActiveEvidenceRecoveryBatch(projects, options(async (project) => {
    calls++;
    return { evidence: [securityEvidence(project)] };
  }));
  assert.equal(calls, 3);
  for (const [index, project] of recovered.entries()) {
    assert.equal(project.securityEvidence[0].responseIdentityVerified, true);
    assert.equal(project.securityEvidence[0].address, MINT);
    assertNotPromoted(project, projects[index]);
  }
});

test("an existing scalar cannot suppress invocation of the paired collector", async () => {
  let calls = 0;
  const project = candidate();
  const [result] = await analyzeActiveEvidenceRecoveryBatch([project], options(async (input) => {
    calls++;
    assert.equal(input.chain, "solana");
    assert.equal(input.tokenAddress, MINT);
    return { evidence: [securityEvidence(input)] };
  }));
  assert.equal(calls, 1);
  assert.deepEqual(result.securityEvidence[0].testedChecks, ["mint-account identity", "mint authority", "freeze authority"]);
  assert.equal(result.fieldProvenance.mintAuthorityEnabled.source, "solana-rpc-rugcheck");
  assert.equal(result.activeEvidenceRecovery.providerExecution.requestsUsed, 4);
  assert.deepEqual(result.activeEvidenceRecovery.changedEvidenceFamilies, ["SECURITY"]);
  assertNotPromoted(result, project);
});

test("paired patch-only acquisition marks SECURITY changed without claiming a recovered scalar", async () => {
  let calls = 0;
  const project = candidate();
  const [result] = await analyzeActiveEvidenceRecoveryBatch([project], options(async (input) => {
    calls++;
    return { evidence: [securityEvidence(input, { mintRisk: undefined })] };
  }));
  assert.equal(calls, 1);
  assert.deepEqual(result.activeEvidenceRecovery.recoveredFields, []);
  assert.deepEqual(result.activeEvidenceRecovery.unrecoveredFields, ["mintAuthorityEnabled"]);
  assert.deepEqual(result.activeEvidenceRecovery.changedEvidenceFamilies, ["SECURITY"]);
  assert.equal(result.fieldProvenance.mintAuthorityEnabled.source, "older-observation");
  assertNotPromoted(result, project);
});

test("unknown collector results leave the final proof and raw field unresolved", async () => {
  let calls = 0;
  const project = candidate();
  const [result] = await analyzeActiveEvidenceRecoveryBatch([project], options(async () => {
    calls++;
    return { status: "UNKNOWN", evidence: [{ provider: "solana-rpc-rugcheck", status: "UNKNOWN",
      chain: "solana", address: MINT, warnings: ["RPC unavailable"] }] };
  }));
  assert.equal(calls, 1);
  assert.deepEqual(result.activeEvidenceRecovery.recoveredFields, []);
  assert.deepEqual(result.activeEvidenceRecovery.unrecoveredFields, ["mintAuthorityEnabled"]);
  assert.equal(result.activeEvidenceRecoveryStatus, "NO_RECOVERY");
  assertNotPromoted(result, project);
});

test("changed UNKNOWN security evidence reruns dependencies only for selected Wave2 candidates", async () => {
  let calls = 0;
  const projects = [candidate({ valueOfInformationScore: 20 }),
    candidate({ tokenAddress: OTHER_MINT, contractAddress: OTHER_MINT }),
    candidate({ deepEvaluationState: "DEFERRED_BEFORE_DEEP" })];
  const result = await analyzeActiveEvidenceRecoveryBatch(projects, options(async (input) => {
    calls++;
    return { status: "UNKNOWN", evidence: [{ provider: "solana-rpc-rugcheck", status: "UNKNOWN",
      chain: "solana", address: input.tokenAddress, observedAt: new Date(NOW).toISOString(),
      testedChecks: ["mint-account identity"], warnings: ["Freeze authority unavailable"] }] };
  }, { wave2Max: 1 }));
  assert.equal(calls, 1);
  assert.deepEqual(result[0].activeEvidenceRecovery.changedEvidenceFamilies, ["SECURITY"]);
  assert.deepEqual(result[0].activeEvidenceRecovery.recoveredFields, []);
  assert.deepEqual(result[0].activeEvidenceRecovery.unrecoveredFields, ["mintAuthorityEnabled"]);
  assert.equal(result[0].activeEvidenceRecoveryStatus, "NO_RECOVERY");
  assert.equal(result[0].securityEvidence[0].status, "UNKNOWN");
  assert.equal(result[1].activeEvidenceRecoveryStatus, "NOT_SELECTED");
  assert.equal(result[2].activeEvidenceRecoveryStatus, "DEFERRED_BEFORE_DEEP");
  assert.deepEqual(result[1].activeEvidenceRecovery.changedEvidenceFamilies ?? [], []);
  assert.deepEqual(result[2].activeEvidenceRecovery.changedEvidenceFamilies ?? [], []);
  result.forEach((project, index) => assertNotPromoted(project, projects[index]));
});

test("an unchanged UNKNOWN security patch does not manufacture a changed family", async () => {
  let calls = 0;
  const evidence = { provider: "solana-rpc-rugcheck", status: "UNKNOWN", chain: "solana", address: MINT,
    observedAt: new Date(NOW).toISOString(), testedChecks: [], warnings: ["RPC unavailable"] };
  const project = candidate({ securityEvidence: [evidence] });
  const [result] = await analyzeActiveEvidenceRecoveryBatch([project], options(async () => {
    calls++;
    return { status: "UNKNOWN", evidence: [{ ...evidence }] };
  }));
  assert.equal(calls, 1);
  assert.deepEqual(result.activeEvidenceRecovery.changedEvidenceFamilies, []);
  assert.deepEqual(result.activeEvidenceRecovery.recoveredFields, []);
  assertNotPromoted(result, project);
});

test("foreign security responses cannot recover an authority input", async () => {
  let calls = 0;
  const project = candidate();
  const [result] = await analyzeActiveEvidenceRecoveryBatch([project], options(async () => {
    calls++;
    return { evidence: [securityEvidence({ tokenAddress: OTHER_MINT })] };
  }));
  assert.equal(calls, 1);
  assert.deepEqual(result.activeEvidenceRecovery.recoveredFields, []);
  assert.deepEqual(result.securityEvidence, []);
  assertNotPromoted(result, project);
});

test("unsafe paired observations remain raw risk evidence and never set pass flags", async () => {
  let calls = 0;
  const project = candidate();
  const [result] = await analyzeActiveEvidenceRecoveryBatch([project], options(async (input) => {
    calls++;
    return { evidence: [securityEvidence(input, { status: "RISK_REVIEW", mintRisk: true, freezeRisk: true })] };
  }));
  assert.equal(calls, 1);
  assert.equal(result.mintAuthorityEnabled, true);
  assert.equal(result.securityEvidence[0].freezeRisk, true);
  assertNotPromoted(result, project);
});

test("authority requests respect the existing shared provider budget", async () => {
  for (const maxProviderRequests of [0, 3, 4]) {
    let calls = 0;
    const project = candidate();
    const [result] = await analyzeActiveEvidenceRecoveryBatch([project], options(async (input) => {
      calls++;
      return { evidence: [securityEvidence(input)] };
    }, { maxProviderRequests }));
    assert.equal(calls, maxProviderRequests < 4 ? 0 : 1);
    assert.equal(result.activeEvidenceRecovery.providerExecution.requestsUsed, calls * 4);
    if (!calls) assert.ok(result.activeEvidenceRecovery.providerAttempts.some((item) => item.status === "REQUEST_BUDGET_EXHAUSTED"));
    assertNotPromoted(result, project);
  }
});

test("authority requests respect the shared provider circuit", async () => {
  let calls = 0;
  const projects = [candidate(), candidate({ tokenAddress: OTHER_MINT, contractAddress: OTHER_MINT })];
  const result = await analyzeActiveEvidenceRecoveryBatch(projects, options(async () => {
    calls++;
    throw new Error("Injected security provider failure");
  }, { circuitFailureThreshold: 1 }));
  assert.equal(calls, 1);
  assert.equal(result[0].activeEvidenceRecovery.providerExecution.requestsUsed, 4);
  assert.ok(result[0].activeEvidenceRecovery.providerAttempts.some((item) => item.status === "FAILED"));
  assert.ok(result[1].activeEvidenceRecovery.providerAttempts.some((item) => item.status === "CIRCUIT_OPEN"));
  result.forEach((project, index) => assertNotPromoted(project, projects[index]));
});

test("expired recovery time budget prevents authority collector invocation", async () => {
  let calls = 0;
  const project = candidate();
  const [result] = await analyzeActiveEvidenceRecoveryBatch([project], options(async () => { calls++; }, { timeBudgetMs: 0 }));
  assert.equal(calls, 0);
  assert.ok(result.activeEvidenceRecovery.providerAttempts.some((item) => item.status === "TIME_BUDGET_EXHAUSTED"));
  assertNotPromoted(result, project);
});
