import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { writeJsonReport } from "../src/reports/jsonReportEngine.js";

import {
  compactProjectForReportWriters,
  compactValueForReport,
} from "../src/reports/reportPayloadCompactor.js";

const TOKEN = "3HLhtXNCVh1VbCrpwACoZWwHoNeoCB7hRAPcYN2jjUiL";
const POOL = "DN5Eq6ELcvUcC69VNbNW5pNbnt3bvtVGfHpBWb8pAcoF";
const OWNER = "DJsZxM4LKDSZEEjE6RL8s7WAT8hUE4gtuuJKooEyhBhw";
const SOURCE_TIMESTAMP = "2026-10-18T05:45:04.000Z";
const OBSERVED_AT = "2026-10-18T05:45:06.213Z";
const ENDPOINT = "c435df749406f944b6b20fa241d14e1158411b01d2440a5291756ef4c689d3ce";
const RAW_FIELDS = ["wallets", "walletTransactions", "walletParticipationHistory"];

// The proof and events are inlined from the executor live probe. Alias metadata
// models an earlier observation; no artifacts, providers or report writers run.
function solanaProject() {
  const event = {
    signature: "3y8x7AyRWddecZXgup1zhVzQS6asK3RWxwRYyuhasE3tpWNY6iyWaF9PPEEB8keWksCicpm35NaShCnCCSk6bn37",
    transactionHash: "3y8x7AyRWddecZXgup1zhVzQS6asK3RWxwRYyuhasE3tpWNY6iyWaF9PPEEB8keWksCicpm35NaShCnCCSk6bn37",
    slot: 457991453,
    timestamp: "2026-10-17T09:45:01.000Z",
    tokenAddress: TOKEN,
    poolAddress: POOL,
    accountAddress: "FKsR5tNivdTdtj5AFvGFDH7TRQkekfkTkTV7E7v9ZqfS",
    ownerAddress: OWNER,
    tokenAmountBeforeRaw: "5352402656813",
    tokenAmountAfterRaw: "0",
    tokenDeltaRaw: "-5352402656813",
    decimals: 6,
    tokenProgram: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
    direction: "BALANCE_CHANGE",
    role: "TOKEN_ACCOUNT_OWNER_AT_TRANSACTION",
    tradeClassification: "UNKNOWN",
    smartWallet: null,
    currentHoldingVerified: false,
  };
  const samples = { wallets: [OWNER], walletTransactions: [event], walletParticipationHistory: [event] };
  const transferCoverage = {
    sampled: true,
    complete24h: false,
    observedSlot: 458323177,
    observedBlockTimestamp: 1792302304,
    fromTimestamp: "2026-10-17T05:45:04.000Z",
    toTimestamp: SOURCE_TIMESTAMP,
    semantics: "CONFIRMED_OWNER_BALANCE_CHANGE_SAMPLE_NOT_TRADES_OR_CURRENT_HOLDINGS",
  };
  const common = {
    source: "solana-rpc-wallets",
    sourceTimestamp: SOURCE_TIMESTAMP,
    confidence: 0.85,
    verificationStatus: "VERIFIED_PROVIDER_OBSERVATION",
    recoveryRun: true,
    chain: "solana",
    tokenAddress: TOKEN,
    poolAddress: POOL,
    exactPoolIdentity: true,
    transferCoverage,
    rpcEndpointId: ENDPOINT,
    completeHolderCoverage: false,
    buyerClassificationAvailable: false,
    currentHoldingVerified: false,
    sourceTimestampMeaning: "PINNED_CONFIRMED_HEAD_FOR_HISTORICAL_OWNER_CHANGE_SAMPLE_NOT_INDIVIDUAL_TRADE_TIME",
  };
  return {
    name: "AGENT",
    symbol: "AGENT",
    chain: "solana",
    tokenAddress: TOKEN,
    poolAddress: POOL,
    ...samples,
    fieldProvenance: Object.fromEntries(RAW_FIELDS.map((field) => [field, { field, value: samples[field], ...common }])),
    canonicalAliasProvenance: {
      wallets: {
        canonicalField: "wallets",
        canonicalValue: samples.wallets,
        resolvedValue: samples.wallets,
        originalValue: samples.wallets,
        originalField: "wallets",
        originalPath: "wallets",
        sourceField: "wallets",
        sourcePath: "wallets",
        sourceProvider: "original-wallet-provider",
        sourceTimestamp: "2026-10-17T09:45:01.000Z",
        timestamp: "2026-10-17T09:45:01.000Z",
        confidence: 0.72,
        validationStatus: "VALID",
        normalizationRule: "EXACT_ALIAS:array",
        conflictStatus: "NO_CONFLICT",
        conflicts: [],
        parsedMarketPair: null,
        holderSampleOnly: true,
        completeHolderCoverage: false,
        buyerClassificationAvailable: false,
      },
    },
    solanaRpcWalletEvidence: {
      provider: "solana-rpc-wallets",
      status: "EVIDENCE_AVAILABLE",
      chain: "solana",
      tokenAddress: TOKEN,
      poolAddress: POOL,
      exactTokenIdentity: true,
      exactPoolIdentity: true,
      genesisHash: "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d",
      observedAt: OBSERVED_AT,
      sourceTimestamp: SOURCE_TIMESTAMP,
      confidence: 0.85,
      verificationStatus: "VERIFIED_PROVIDER_OBSERVATION",
      ...samples,
      transferCoverage,
      providerFailure: false,
      providerFailureCode: null,
      warnings: ["Exact pool/mint transaction-owner participation only; no current holders, daily buyer totals, swaps, smart labels, deployer roles or execution proof are inferred."],
      rpcEndpointId: ENDPOINT,
      rpcEndpointAttempts: [{ endpointId: ENDPOINT, status: "EVIDENCE_AVAILABLE", providerFailure: false }],
    },
    activeEvidenceRecovery: { status: "RECOVERED", recoveredFields: [...RAW_FIELDS] },
  };
}

function filler(count = 140) {
  return Object.fromEntries(Array.from({ length: count }, (_, index) => [`filler${index}`, index]));
}

function freezeTree(value, seen = new WeakSet()) {
  if (!value || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) freezeTree(child, seen);
  return Object.freeze(value);
}

test("actual Solana executor shape retains exact raw events, proof and original provenance", () => {
  const project = solanaProject();
  const compacted = compactProjectForReportWriters(project);

  assert.deepEqual(compacted.wallets, project.wallets);
  assert.deepEqual(compacted.walletTransactions, project.walletTransactions);
  assert.deepEqual(compacted.walletParticipationHistory, project.walletParticipationHistory);
  assert.deepEqual(compacted.solanaRpcWalletEvidence, project.solanaRpcWalletEvidence);
  assert.deepEqual(compacted.canonicalAliasProvenance, project.canonicalAliasProvenance);
  assert.deepEqual(compacted.activeEvidenceRecovery.recoveredFields, RAW_FIELDS);
  for (const field of RAW_FIELDS) {
    const { value, ...originalProvenance } = project.fieldProvenance[field];
    const { value: sample, ...retainedProvenance } = compacted.fieldProvenance[field];
    assert.deepEqual(retainedProvenance, originalProvenance);
    if (field === "wallets") assert.deepEqual(sample, value);
    else assert.deepEqual(sample, ["[nested data omitted from report]"]);
  }
  assert.notEqual(compacted.walletTransactions[0].timestamp, SOURCE_TIMESTAMP);
  assert.equal(compacted.walletTransactions[0].tradeClassification, "UNKNOWN");
  assert.equal(compacted.walletTransactions[0].smartWallet, null);
  assert.equal(compacted.walletTransactions[0].currentHoldingVerified, false);
  for (const field of ["uniqueBuyers24h", "smartWallets", "accountType", "holderCount", "currentHoldingVerified"]) {
    assert.equal(Object.hasOwn(compacted, field), false);
    assert.equal(Object.hasOwn(compacted.solanaRpcWalletEvidence, field), false);
  }
});

test("the JSON writer retains the actual recovered proof after both serialization passes", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "cli-wallet-proof-report-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const first = compactProjectForReportWriters({ ...filler(), ...solanaProject(),
    finalSelectionState: "RESEARCH_ONLY", finalSelectionQualified: false,
    bulkyOptionalResearch: "x".repeat(200000) });
  const file = writeJsonReport([first], { reportsDir: directory, codeCommitSha: "fixture-only" });
  const report = JSON.parse(fs.readFileSync(file, "utf8"));
  const [project] = report.projects;
  assert.deepEqual(project.wallets, [OWNER]);
  assert.equal(project.fieldProvenance.wallets.sourceTimestamp, SOURCE_TIMESTAMP);
  assert.equal(project.canonicalAliasProvenance.wallets.sourceTimestamp, "2026-10-17T09:45:01.000Z");
  assert.equal(project.solanaRpcWalletEvidence.provider, "solana-rpc-wallets");
  assert.equal(project.solanaRpcWalletEvidence.walletTransactions[0].tokenAmountAfterRaw, "0");
  assert.equal(project.solanaRpcWalletEvidence.walletTransactions[0].currentHoldingVerified, false);
  assert.equal(project.solanaRpcWalletEvidence.walletTransactions[0].timestamp, "2026-10-17T09:45:01.000Z");
  assert.equal(project.finalSelectionQualified, false);
  assert.ok(fs.statSync(file).size < 100000);
});

test("wallet retention and existing decision-critical fields survive project and nested key pressure", () => {
  const original = solanaProject();
  const pressure = filler();
  const project = {
    ...pressure,
    ...original,
    sourceTruth: { status: "VERIFIED", independentSources: 3 },
    executionProof: { executionProofState: "RESEARCH_ONLY" },
    engineDataReadiness: { status: "CORE_READY" },
    dataStarvationRootCauses: { RAW_SOURCE_MISSING: 1 },
    targetedEnrichmentPlan: { status: "TARGETED_RECOVERY_AVAILABLE" },
    valueOfInformationPlan: { topField: "holderCount" },
    progressivePipelineStages: { deep: "COMPLETE" },
    fieldProvenance: { ...pressure, ...Object.fromEntries(Object.entries(original.fieldProvenance)
      .map(([field, record]) => [field, { ...pressure, ...record, transferCoverage: { ...pressure, ...record.transferCoverage } }])) },
    canonicalAliasProvenance: { ...pressure, wallets: { ...pressure, ...original.canonicalAliasProvenance.wallets } },
    solanaRpcWalletEvidence: {
      ...pressure,
      ...original.solanaRpcWalletEvidence,
      walletTransactions: [{ ...pressure, ...original.walletTransactions[0] }],
    },
  };
  const compacted = compactProjectForReportWriters(project);
  for (const field of ["sourceTruth", "executionProof", "engineDataReadiness", "dataStarvationRootCauses",
    "targetedEnrichmentPlan", "valueOfInformationPlan", "progressivePipelineStages", "activeEvidenceRecovery"]) {
    assert.deepEqual(compacted[field], original[field] || project[field]);
  }
  assert.deepEqual(compacted.wallets, [OWNER]);
  const event = compacted.solanaRpcWalletEvidence.walletTransactions[0];
  const { reportCompactionOmittedKeys, ...retainedEvent } = event;
  assert.equal(reportCompactionOmittedKeys, 140);
  assert.deepEqual(retainedEvent, original.walletTransactions[0]);
  assert.equal(compacted.solanaRpcWalletEvidence.confidence, 0.85);
  assert.equal(compacted.fieldProvenance.walletTransactions.transferCoverage.sampled, true);
  assert.equal(compacted.fieldProvenance.walletTransactions.currentHoldingVerified, false);
  assert.equal(compacted.canonicalAliasProvenance.wallets.sourceTimestamp, "2026-10-17T09:45:01.000Z");
  assert.equal(compacted.canonicalAliasProvenance.wallets.confidence, 0.72);
  assert.equal(Object.hasOwn(compacted, "filler139"), false);
  assert.equal(Object.hasOwn(compacted.fieldProvenance, "filler139"), false);
  assert.equal(Object.hasOwn(compacted.canonicalAliasProvenance, "filler139"), false);

  const tight = compactProjectForReportWriters(project, { objectKeyLimit: 5 });
  for (const field of ["sourceTruth", "executionProof", "engineDataReadiness", "targetedEnrichmentPlan",
    "valueOfInformationPlan", "progressivePipelineStages", "activeEvidenceRecovery"]) {
    assert.deepEqual(tight[field], original[field] || project[field]);
  }
  assert.deepEqual(tight.wallets, [OWNER]);
  assert.equal(tight.solanaRpcWalletEvidence.tokenAddress, TOKEN);
  assert.equal(tight.solanaRpcWalletEvidence.poolAddress, POOL);
  assert.equal(Object.keys(tight.fieldProvenance).length, 6);
});

test("huge wallet samples and unexpected provider bodies remain bounded and count omissions", () => {
  const project = solanaProject();
  const huge = "x".repeat(500_000);
  const event = { ...filler(), ...project.walletTransactions[0], raw: { huge }, providerPayload: { huge }, note: huge };
  project.wallets = Array(5_000).fill(OWNER);
  project.walletTransactions = Array(5_000).fill(event);
  project.walletParticipationHistory = project.walletTransactions;
  Object.assign(project.solanaRpcWalletEvidence, {
    wallets: project.wallets,
    walletTransactions: project.walletTransactions,
    walletParticipationHistory: project.walletTransactions,
    warnings: Array(500).fill(huge),
    raw: { huge },
    providerPayload: { huge },
    unexpected: { huge, nested: Array(5_000).fill({ huge }) },
  });
  project.canonicalAliasProvenance.wallets.originalValue = project.wallets;
  const compacted = compactProjectForReportWriters(project);
  for (const field of RAW_FIELDS) {
    for (const container of [compacted, compacted.solanaRpcWalletEvidence]) {
      assert.equal(container[field].length, 13);
      assert.equal(container[field][12], "[4988 additional items omitted from report]");
    }
  }
  assert.equal(compacted.solanaRpcWalletEvidence.warnings.length, 13);
  assert.equal(compacted.solanaRpcWalletEvidence.warnings[12], "[488 additional items omitted from report]");
  assert.ok(compacted.solanaRpcWalletEvidence.warnings[0].length <= 1_500);
  assert.ok(compacted.solanaRpcWalletEvidence.reportCompactionOmittedKeys >= 3);
  assert.equal(compacted.walletTransactions[0].reportCompactionOmittedKeys, 143);
  assert.equal(Object.hasOwn(compacted.walletTransactions[0], "raw"), false);
  assert.equal(Object.hasOwn(compacted.solanaRpcWalletEvidence, "unexpected"), false);
  assert.ok(Buffer.byteLength(JSON.stringify(compacted)) < 100_000);
});

test("explicit array, string, object-key and absolute depth limits still apply", () => {
  const project = solanaProject();
  project.wallets = Array(10).fill("a".repeat(200));
  const compacted = compactProjectForReportWriters(project, {
    arrayLimit: 2, stringLimit: 96, objectKeyLimit: 8, depthLimit: 3,
  });
  assert.equal(compacted.wallets.length, 3);
  assert.equal(compacted.wallets[2], "[8 additional items omitted from report]");
  assert.ok(compacted.wallets[0].length <= 96);
  assert.ok(Object.keys(compacted.solanaRpcWalletEvidence).length <= 9);
  assert.equal(compacted.fieldProvenance.wallets.transferCoverage, undefined);

  const shallow = compactProjectForReportWriters(project, { depthLimit: 2 });
  assert.equal(shallow.walletTransactions[0], "[nested data omitted from report]");
  assert.equal(shallow.solanaRpcWalletEvidence.transferCoverage, "[nested data omitted from report]");
  assert.equal(shallow.solanaRpcWalletEvidence.walletTransactions, "[nested data omitted from report]");
  assert.equal(shallow.fieldProvenance.wallets, "[nested data omitted from report]");
});

test("shared frozen samples are copied without mutation or repeated-reference erasure", () => {
  const project = solanaProject();
  const before = structuredClone(project);
  assert.strictEqual(project.walletTransactions[0], project.walletParticipationHistory[0]);
  assert.strictEqual(project.walletTransactions, project.solanaRpcWalletEvidence.walletTransactions);
  assert.strictEqual(project.wallets, project.fieldProvenance.wallets.value);
  freezeTree(project);

  const compacted = compactProjectForReportWriters(project);
  assert.deepEqual(project, before);
  assert.notStrictEqual(compacted.walletTransactions[0], project.walletTransactions[0]);
  assert.deepEqual(compacted.solanaRpcWalletEvidence.walletTransactions, project.walletTransactions);
  assert.deepEqual(compacted.solanaRpcWalletEvidence.walletParticipationHistory, project.walletTransactions);
  assert.deepEqual(compacted.canonicalAliasProvenance.wallets.originalValue, [OWNER]);
  assert.strictEqual(compactProjectForReportWriters(compacted), compacted);
});

test("shared provenance maps retain original wallet metadata in both report fields", () => {
  const project = solanaProject();
  project.canonicalAliasProvenance = project.fieldProvenance;
  const compacted = compactProjectForReportWriters(freezeTree(project));
  assert.deepEqual(compacted.canonicalAliasProvenance, compacted.fieldProvenance);
  assert.equal(compacted.canonicalAliasProvenance.walletTransactions.confidence, 0.85);
  assert.equal(compacted.canonicalAliasProvenance.walletTransactions.sourceTimestamp, SOURCE_TIMESTAMP);
  assert.equal(compacted.canonicalAliasProvenance.walletTransactions.currentHoldingVerified, false);
});

test("conflicted aliases remain conflicted and conflict samples respect the absolute depth bound", () => {
  const project = solanaProject();
  Object.assign(project.canonicalAliasProvenance.wallets, {
    validationStatus: "CONFLICTED",
    conflictStatus: "SOURCE_CONFLICT",
    conflicts: Array(20).fill({ sourceProvider: "other-provider", confidence: 0.4 }),
  });
  const compacted = compactProjectForReportWriters(project);
  const provenance = compacted.canonicalAliasProvenance.wallets;
  assert.equal(provenance.validationStatus, "CONFLICTED");
  assert.equal(provenance.conflictStatus, "SOURCE_CONFLICT");
  assert.equal(provenance.conflicts.length, 13);
  assert.equal(provenance.conflicts[0], "[nested data omitted from report]");
  assert.equal(provenance.conflicts[12], "[8 additional items omitted from report]");
});

test("UNKNOWN and empty proof remains unknown without synthesized observations", () => {
  const proof = {
    provider: "solana-rpc-wallets", status: "UNKNOWN", chain: "solana", tokenAddress: TOKEN,
    poolAddress: POOL, exactTokenIdentity: false, observedAt: OBSERVED_AT,
    providerFailure: true, providerFailureCode: "STALE_RPC_HEAD",
    wallets: [], walletTransactions: [], walletParticipationHistory: [], warnings: ["Solana RPC head is stale."],
  };
  const compacted = compactProjectForReportWriters({ solanaRpcWalletEvidence: proof });
  assert.deepEqual(compacted.solanaRpcWalletEvidence, proof);
  for (const field of [...RAW_FIELDS, "uniqueBuyers24h", "smartWallets", "currentHoldingVerified"]) {
    assert.equal(Object.hasOwn(compacted, field), false);
  }
  for (const field of ["holderCount", "uniqueBuyers24h", "smartWallets", "currentHoldingVerified"]) {
    assert.equal(Object.hasOwn(compacted.solanaRpcWalletEvidence, field), false);
  }
});

test("EVM raw samples keep null event times, unknown roles and pinned balance provenance", () => {
  const token = `0x${"1".repeat(40)}`;
  const wallet = `0x${"3".repeat(40)}`;
  const event = { transactionHash: `0x${"a".repeat(64)}`, logIndex: "0x0", blockNumber: 256,
    timestamp: null, from: `0x${"2".repeat(40)}`, to: wallet, tokenAmountRaw: "5",
    tokenAddress: token, direction: "TRANSFER", smartWallet: null };
  const balance = { address: wallet, tokenAddress: token, chain: "base", balanceRaw: "5",
    observedBlockNumber: 256, observedBlockTimestamp: 1792302304, blockHash: `0x${"b".repeat(64)}`,
    method: "balanceOf", accountType: "UNKNOWN", role: "UNKNOWN" };
  const proof = {
    provider: "rpc-wallets", status: "EVIDENCE_AVAILABLE", chain: "base", tokenAddress: token,
    sourceTimestamp: SOURCE_TIMESTAMP, confidence: 0.85,
    wallets: [wallet], holderAddresses: [wallet], walletTransactions: [event], walletParticipationHistory: [event],
    holderBalanceEvidence: [balance], holderCount: null, uniqueBuyers24h: null, smartWallets: null,
    transferCoverage: { sampled: true, complete24h: false, fromBlock: 1, toBlock: 256, observedBlockTimestamp: 1792302304 },
    holderCoverage: { sampled: true, complete: false, balanceProbeAttempts: 1, balanceResponsesReceived: 1,
      semantics: "CONTRACT_REPORTED_POSITIVE_BALANCES_AT_PINNED_BLOCK_NOT_HOLDER_CENSUS" },
  };
  const compacted = compactProjectForReportWriters({ ...filler(), holderAddresses: [wallet],
    holderBalanceEvidence: [balance], walletTransactions: [event], rpcWalletEvidence: proof });
  assert.deepEqual(compacted.rpcWalletEvidence, proof);
  assert.deepEqual(compacted.holderAddresses, [wallet]);
  assert.deepEqual(compacted.holderBalanceEvidence, [balance]);
  assert.deepEqual(compacted.walletTransactions, [event]);
  assert.equal(compacted.holderBalanceEvidence[0].accountType, "UNKNOWN");
});

test("unrelated heavy payloads, nesting and repeated-reference compaction are unchanged", () => {
  const shared = { status: "ORIGINAL" };
  const input = { raw: { enormous: "x".repeat(500_000) }, first: shared, second: shared,
    unrelated: { a: { b: { c: { value: "too deep" } } } } };
  const compacted = compactProjectForReportWriters(input);
  assert.deepEqual(compacted.raw, { omittedFromReport: true, originalType: "object" });
  assert.deepEqual(compacted.first, { status: "ORIGINAL" });
  assert.equal(compacted.second, "[repeated data omitted from report]");
  assert.equal(compacted.unrelated.a.b.c, "[nested data omitted from report]");
  const standalone = compactValueForReport({ solanaRpcWalletEvidence: { ...filler(), provider: "late-provider" } });
  assert.equal(standalone.solanaRpcWalletEvidence.provider, undefined);
});
