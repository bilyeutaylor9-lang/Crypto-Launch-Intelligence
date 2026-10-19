import test, { after, mock } from "node:test";
import assert from "node:assert/strict";
import {
  analyzeActiveEvidenceRecoveryBatch,
  buildActiveEvidenceRecoveryWaves,
  createActiveEvidenceRecoveryState,
} from "../src/engines/activeEvidenceRecoveryEngine.js";
import { normalizeGoPlusTokenSecurity } from "../src/data/security/goplusSecurityConnector.js";
import { sourceFamilyForField } from "../src/data/enrichmentSourceRegistry.js";

const TOKEN = "0x1111111111111111111111111111111111111111";
const OTHER = "0x2222222222222222222222222222222222222222";
const MINT = "ARMqZ1YB3ieGXeT6kjA7tC4ynoXGb5SBA6yXuTbs9Cgb";
const NOW = Date.parse("2026-10-18T17:30:00Z");

mock.method(globalThis, "fetch", async () => assert.fail("Live network access is forbidden."));
after(() => mock.restoreAll());

function candidate(overrides = {}) {
  return {
    name: "Safety Recovery Utility", symbol: "SRU", chain: "base", tokenAddress: TOKEN,
    contractAddress: TOKEN, deepEvaluationState: "DEEP_EVALUATED",
    executionProof: {
      routeType: "DEX", exactIdentityVerified: true, safetyVerified: false,
      authorityEvidenceRequired: false, transferTaxEvidenceRequired: true,
      transferTaxEvidenceVerified: false,
    },
    ...overrides,
  };
}

function options(collector, overrides = {}) {
  return {
    wave1Max: 10, wave2Max: 10, wave3Max: 0, concurrency: 1,
    maxProviderRequests: 40, providerTimeoutMs: 250, useCache: false,
    walletHistory: false, freeOnly: true, now: () => NOW,
    providers: { getFreeSecurityEvidence: collector },
    ...overrides,
  };
}

function planned(project, overrides = {}) {
  return buildActiveEvidenceRecoveryWaves([project], options(undefined, overrides)).waves;
}

function fields(waves) {
  return Object.values(waves).flatMap((wave) => wave.flatMap((item) => item.entries.map((entry) => entry.field)));
}

function evidence(project, raw = {}) {
  return normalizeGoPlusTokenSecurity({ result: { [project.tokenAddress]: {
    is_open_source: "1", is_honeypot: "0", is_mintable: "0", is_proxy: "0",
    is_blacklisted: "0", cannot_sell_all: "0", slippage_modifiable: "0",
    transfer_pausable: "0", trading_cooldown: "0", personal_slippage_modifiable: "0",
    hidden_owner: "0", can_take_back_ownership: "0", owner_change_balance: "0",
    buy_tax: "0", sell_tax: "0.01", ...raw,
  } } }, { chain: project.chain, address: project.tokenAddress });
}

function assertNoDerivedPromotion(result, original) {
  assert.deepEqual(result.executionProof, original.executionProof);
  for (const field of ["safetyProofStatus", "safetyProofLane", "contractSafetyVerified",
    "taxesVerified", "transferTaxVerified", "transferTaxEvidenceVerified", "liveExecutionReady",
    "finalSelectionQualified", "authorityEvidenceVerified", "authoritySafetyClean"]) {
    assert.equal(result[field], original[field], field);
  }
}

test("final safety and transfer-tax gaps schedule existing raw security fields without starvation plans", () => {
  for (const chain of ["ethereum", "optimism", "bsc", "polygon", "arbitrum", "avalanche", "base"]) {
    const project = candidate({ chain, honeypotDetected: false, buyTaxPct: 0, sellTaxPct: 0 });
    const original = structuredClone(project);
    const waves = planned(project);
    const requested = fields(waves);
    for (const field of ["honeypotDetected", "sellRestricted", "contractVerified", "buyTaxPct", "sellTaxPct"]) {
      assert.ok(requested.includes(field), `${chain}:${field}`);
    }
    assert.ok(waves.WAVE1.length > 0);
    assert.deepEqual(waves.WAVE2[0].entries.map((entry) => entry.field).sort(), ["buyTaxPct", "sellTaxPct"]);
    for (const entry of Object.values(waves).flat().flatMap((item) => item.entries)) {
      assert.equal(sourceFamilyForField(entry.field), "SECURITY");
      assert.equal(entry.item.recoveryDisposition, "RAW_RECOVERABLE");
      assert.equal(entry.item.requiresFreshObservation, true);
      assert.equal(entry.coreEvidence, true);
      assert.ok(entry.item.targetSources.length > 0);
    }
    assert.deepEqual(project, original);
  }
});

test("tax-only and safety-only gaps schedule only their applicable raw fields", () => {
  const project = candidate();
  const taxOnly = candidate({ executionProof: { ...project.executionProof, safetyVerified: true } });
  assert.deepEqual(fields(planned(taxOnly)).sort(), ["buyTaxPct", "sellTaxPct"]);
  const safetyOnly = candidate({ executionProof: { ...project.executionProof, transferTaxEvidenceVerified: true } });
  assert.deepEqual(fields(planned(safetyOnly)).sort(), ["contractVerified", "honeypotDetected", "sellRestricted"]);
});

test("undefined safety results with an unknown snapshot still schedule and invoke raw collection", async () => {
  let calls = 0;
  const project = candidate({ executionProof: {
    routeType: "DEX", buyQuoteVerified: false, sellQuoteVerified: false,
  } });
  assert.deepEqual(fields(planned(project)).sort(), ["contractVerified", "honeypotDetected", "sellRestricted"]);
  const [result] = await analyzeActiveEvidenceRecoveryBatch([project], options(async () => {
    calls++;
    return { status: "UNKNOWN", evidence: [] };
  }));
  assert.equal(calls, 1);
  assert.equal(result.honeypotDetected, undefined);
  assertNoDerivedPromotion(result, project);
});

test("Solana safety recovery never schedules EVM source-code or transfer-tax fields", () => {
  const project = candidate({ chain: "solana", tokenAddress: MINT, contractAddress: MINT });
  assert.deepEqual(fields(planned(project)).sort(), ["honeypotDetected", "sellRestricted"]);
});

test("explorer-only chains can recover source metadata but not unsupported tax or honeypot proof", () => {
  assert.deepEqual(fields(planned(candidate({ chain: "zksync" }))), ["contractVerified"]);
});

test("absent, malformed, unsupported, conflicting and CEX identities cannot synthesize security work", () => {
  for (const patch of [
    { executionProof: undefined }, { executionProof: {} }, { executionProof: "omitted" },
    { chain: "unsupported-chain" }, { chain: "linea" }, { chain: "scroll" }, { chain: "gnosis" },
    { chain: "sui", tokenAddress: TOKEN },
    { tokenAddress: undefined, contractAddress: undefined }, { tokenAddress: "bad", contractAddress: "bad" },
    { tokenAddress: "0x0000000000000000000000000000000000000000", contractAddress: "0x0000000000000000000000000000000000000000" },
    { contractAddress: OTHER }, { address: OTHER }, { canonicalAddress: OTHER }, { finalContractAddress: OTHER },
    { chainId: "ethereum" }, { canonicalChain: "ethereum" }, { finalChain: "ethereum" },
    { rawCandidate: { tokenAddress: OTHER } }, { marketData: { chain: "ethereum" } },
    { canonicalExecutionRoute: { contractAddress: OTHER } }, { executionProofRecoveryRoute: { tokenAddress: OTHER } },
    { executionProof: { ...candidate().executionProof, contractAddress: OTHER } },
    { executionProof: { ...candidate().executionProof, routeType: "CEX" } },
  ]) assert.deepEqual(fields(planned(candidate(patch))), [], JSON.stringify(patch));
});

test("resolved, deferred and deterministically rejected candidates make no security collector calls", async () => {
  let calls = 0;
  const project = candidate();
  const projects = [
    candidate({ executionProof: { ...project.executionProof, safetyVerified: true, transferTaxEvidenceVerified: true } }),
    candidate({ deepEvaluationState: "DEFERRED_BEFORE_DEEP" }),
    candidate({ deepEvaluationDeferred: true }), candidate({ deepEvaluationSelected: false }),
    candidate({ canonicalIdentityHardBlock: true }), candidate({ chainMismatch: true }),
    candidate({ honeypotDetected: true }), candidate({ sellRestricted: true }), candidate({ verifiedScam: true }),
  ];
  const results = await analyzeActiveEvidenceRecoveryBatch(projects, options(async () => { calls++; }));
  assert.equal(calls, 0);
  results.forEach((result, index) => assertNoDerivedPromotion(result, projects[index]));
});

test("gap requests merge freshness into an existing higher-value raw plan without duplication", () => {
  const project = candidate({ targetedEnrichmentPlan: { items: [{
    canonicalField: "buyTaxPct", valueOfInformationScore: 10,
    targetSources: [{ source: "GoPlus" }], evidenceClass: "CORE",
  }] } });
  const entries = planned(project).WAVE2[0].entries;
  assert.equal(entries.filter((entry) => entry.field === "buyTaxPct").length, 1);
  assert.equal(entries.find((entry) => entry.field === "buyTaxPct").item.valueOfInformationScore, 10);
  assert.equal(entries.find((entry) => entry.field === "buyTaxPct").item.requiresFreshObservation, true);
});

test("existing collector observations retain exact provenance and do not synthesize final proof", async () => {
  let calls = 0;
  const project = candidate({ honeypotDetected: false, buyTaxPct: 9, sellTaxPct: 9 });
  const [result] = await analyzeActiveEvidenceRecoveryBatch([project], options(async (input) => {
    calls++;
    assert.equal(input.chain, "base");
    assert.equal(input.tokenAddress, TOKEN);
    return { evidence: [evidence(input)] };
  }));
  assert.ok(calls > 0);
  assert.equal(result.buyTaxPct, 0);
  assert.equal(result.sellTaxPct, 1);
  assert.equal(result.fieldProvenance.buyTaxPct.source, "goplus");
  assert.equal(result.fieldProvenance.buyTaxPct.tokenAddress, TOKEN);
  assert.equal(result.fieldProvenance.buyTaxPct.chain, "base");
  assert.ok(result.activeEvidenceRecovery.changedEvidenceFamilies.includes("SECURITY"));
  assertNoDerivedPromotion(result, project);
});

test("unknown or wrong-token collector results cannot manufacture raw taxes or safety", async () => {
  for (const collector of [
    async () => ({ status: "UNKNOWN", evidence: [] }),
    async (input) => ({ evidence: [evidence({ ...input, tokenAddress: OTHER })] }),
    async (input) => ({ evidence: [evidence(input, { buy_tax: "", sell_tax: "" })] }),
  ]) {
    const project = candidate();
    const [result] = await analyzeActiveEvidenceRecoveryBatch([project], options(collector));
    assert.equal(result.buyTaxPct, undefined);
    assert.equal(result.sellTaxPct, undefined);
    assertNoDerivedPromotion(result, project);
  }
});

test("wave and per-candidate limits bound synthesized security requests", async () => {
  const project = candidate();
  assert.deepEqual(fields(planned(project, { wave1Max: 0, wave2Max: 0 })), []);
  const projects = [project, candidate({ tokenAddress: OTHER, contractAddress: OTHER, valueOfInformationScore: 50 })];
  const waves = buildActiveEvidenceRecoveryWaves(projects, options(undefined, {
    wave1Max: 1, wave2Max: 1, maxFieldsPerCandidate: 1,
  })).waves;
  for (const wave of [waves.WAVE1, waves.WAVE2]) {
    assert.equal(wave.length, 1);
    assert.equal(wave[0].projectIndex, 1);
    assert.equal(wave[0].entries.length, 1);
  }
});

test("request and time budgets prevent security dispatch without changing missing proof", async () => {
  for (const limits of [{ maxProviderRequests: 0 }, { timeBudgetMs: 0 }]) {
    let calls = 0;
    const project = candidate();
    const [result] = await analyzeActiveEvidenceRecoveryBatch([project], options(async () => { calls++; }, limits));
    assert.equal(calls, 0);
    assert.equal(result.activeEvidenceRecovery.providerExecution.requestsUsed, 0);
    assert.ok(result.activeEvidenceRecovery.providerAttempts.some((attempt) =>
      ["REQUEST_BUDGET_EXHAUSTED", "TIME_BUDGET_EXHAUSTED"].includes(attempt.status)));
    assertNoDerivedPromotion(result, project);
  }
});

test("security recovery obeys the existing chain-scoped circuit breaker", async () => {
  let calls = 0;
  const projects = [candidate(), candidate({ tokenAddress: OTHER, contractAddress: OTHER }), candidate({ chain: "bsc" })];
  const results = await analyzeActiveEvidenceRecoveryBatch(projects, options(async (input) => {
    calls++;
    if (input.chain === "base") throw new Error("Injected security failure");
    return { evidence: [evidence(input)] };
  }, { circuitFailureThreshold: 1 }));
  assert.equal(calls, 2);
  assert.ok(results[1].activeEvidenceRecovery.providerAttempts.some((attempt) => attempt.status === "CIRCUIT_OPEN"));
  assert.equal(results[2].sellTaxPct, 1);
  results.forEach((result, index) => assertNoDerivedPromotion(result, projects[index]));
});

test("resumed safety and tax recovery cannot reset the shared request allowance or deadline", async () => {
  let calls = 0;
  const opts = options(async () => { calls++; return { status: "UNKNOWN", evidence: [] }; }, { maxProviderRequests: 4 });
  const state = createActiveEvidenceRecoveryState(opts);
  const deadline = state.deadlineAt;
  const first = await analyzeActiveEvidenceRecoveryBatch([candidate()], { ...opts, executionState: state });
  const [result] = await analyzeActiveEvidenceRecoveryBatch(first, {
    ...opts, executionState: state, resumeRecovery: true, maxProviderRequests: 999,
  });
  assert.equal(calls, 1);
  assert.equal(state.maxRequests, 4);
  assert.equal(state.requestsUsed, 4);
  assert.equal(state.deadlineAt, deadline);
  assert.ok(result.activeEvidenceRecovery.providerAttempts.some((attempt) => attempt.status === "REQUEST_BUDGET_EXHAUSTED"));
  assertNoDerivedPromotion(result, first[0]);
});
