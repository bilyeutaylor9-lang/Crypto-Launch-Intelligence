import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { attachCanonicalIdentity, resolveCanonicalIdentity } from "../src/identity/canonicalIdentityResolver.js";
import { analyzeFinalSelectionIntegrity } from "../src/engines/finalSelectionIntegrityEngine.js";
import { analyzeExecutionProof } from "../src/engines/executionProofEngine.js";
import { shouldRerunEngineForEvidenceFamilies } from "../src/intelligencePipeline.js";
import { compactProjectForReportWriters } from "../src/reports/reportPayloadCompactor.js";
import { buildTop10CandidateInput } from "../src/reports/top10BreakoutReportEngine.js";
import { writeJsonReport } from "../src/reports/jsonReportEngine.js";

const MINT = "3HLhtXNCVh1VbCrpwACoZWwHoNeoCB7hRAPcYN2jjUiL";
const POOL = "DN5Eq6ELcvUcC69VNbNW5pNbnt3bvtVGfHpBWb8pAcoF";
const GENESIS = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";
const PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

function evidence(patch = {}, rpcPatch = {}) {
  const blockTimestamp = Math.floor(Date.now() / 1000) - 1;
  const sourceTimestamp = new Date(blockTimestamp * 1000).toISOString();
  return { provider: "solana-rpc-rugcheck", status: "EVIDENCE_AVAILABLE", chain: "solana", address: MINT,
    responseIdentityVerified: true, identityVerifiedOnChain: true, snapshotTimestampVerified: true, verifiedSource: true,
    sourceTimestamp, observedAt: new Date().toISOString(),
    testedChecks: ["mint-account identity", "mint authority", "freeze authority"], mintRisk: false, freezeRisk: false,
    raw: { rpc: { genesisHash: GENESIS, observedSlot: 1234, ownerProgram: PROGRAM,
      sourceTimestamp, blockTimestamp, mintAuthority: null, freezeAuthority: null, ...rpcPatch } }, ...patch };
}

function candidate(item = evidence(), patch = {}) {
  return { name: "Exact Mint", symbol: "MINT", chain: "solana", tokenAddress: MINT,
    poolAddress: POOL, securityEvidence: [item], ...patch };
}

test("trusted mainnet mint-account proof establishes only scoped chain-token identity with provenance", () => {
  const item = evidence();
  const project = attachCanonicalIdentity(candidate(item));
  assert.equal(project.identityStatus, "VERIFIED");
  assert.equal(project.canonicalIdentity.verificationScope, "SOLANA_MINT_ACCOUNT");
  const source = project.canonicalIdentity.sourceIdentities.find((row) => row.source === "solana-rpc-mint-account");
  assert.equal(source.address, MINT);
  assert.equal(source.sourceTimestamp, item.sourceTimestamp);
  assert.equal(source.verificationScope, "SOLANA_MINT_ACCOUNT");
  assert.equal(source.observedSlot, 1234);
  assert.notEqual(project.sourceCodeVerified, true);
  assert.equal(analyzeFinalSelectionIntegrity(project).finalIdentityState, "VERIFIED_CONTRACT");
  assert.equal(analyzeFinalSelectionIntegrity(project).finalSelectionQualified, false);
});

test("mismatched or incomplete mint attestations cannot establish identity from summary flags", () => {
  const invalid = [
    evidence({ provider: "unknown-provider" }), evidence({ status: "UNKNOWN" }),
    evidence({ chain: "base" }), evidence({ address: MINT.toLowerCase() }),
    evidence({ responseIdentityVerified: false }), evidence({ identityVerifiedOnChain: false }),
    evidence({ verifiedSource: false }),
    evidence({ snapshotTimestampVerified: false }), evidence({ testedChecks: ["mint authority"] }),
    evidence({}, { genesisHash: "devnet" }), evidence({}, { ownerProgram: "11111111111111111111111111111111" }),
    evidence({}, { observedSlot: "1234" }), evidence({}, { observedSlot: -1 }),
    evidence({}, { blockTimestamp: null }), evidence({}, { mintAuthority: "not-a-wallet" }),
    evidence({}, { mintAuthority: "So11111111111111111111111111111111111111112" }),
    evidence({}, { freezeAuthority: "So11111111111111111111111111111111111111112" }),
    evidence({}, { sourceTimestamp: "invalid" }), evidence({ raw: null }),
    evidence({ sourceTimestamp: new Date(Date.now() - 301000).toISOString() }),
    evidence({ sourceTimestamp: new Date(Date.now() + 60000).toISOString() }),
  ];
  for (const item of invalid) assert.notEqual(resolveCanonicalIdentity(candidate(item)).identityStatus, "VERIFIED", JSON.stringify(item));
  for (const patch of [{ chainId: "base" }, { contractAddress: "So11111111111111111111111111111111111111112" },
    { finalContractAddress: MINT.toLowerCase() }, { canonicalAddress: "broken" }]) {
    assert.notEqual(resolveCanonicalIdentity(candidate(evidence(), patch)).identityStatus, "VERIFIED", JSON.stringify(patch));
  }
});

test("fresh active authorities prove account identity but never clean safety or a qualified pick", () => {
  const item = evidence({ mintRisk: true }, { mintAuthority: "So11111111111111111111111111111111111111112" });
  const project = attachCanonicalIdentity(candidate(item));
  assert.equal(project.identityStatus, "VERIFIED");
  const execution = analyzeExecutionProof(project);
  assert.equal(execution.executionProof.authoritySafetyClean, false);
  assert.equal(execution.executionProof.liveExecutionReady, false);
  assert.equal(analyzeFinalSelectionIntegrity(execution).finalSelectionQualified, false);
});

test("aggregate RugCheck risk does not invalidate unchanged RPC mint identity or erase adverse safety", () => {
  const item = evidence({ mintRisk: true, freezeRisk: true });
  const project = attachCanonicalIdentity(candidate(item));
  assert.equal(project.identityStatus, "VERIFIED");
  assert.equal(project.securityEvidence[0].mintRisk, true);
  assert.equal(project.securityEvidence[0].freezeRisk, true);
  const execution = analyzeExecutionProof(project);
  assert.equal(execution.executionProof.authoritySafetyClean, false);
  assert.equal(execution.executionProof.liveExecutionReady, false);
  assert.equal(analyzeFinalSelectionIntegrity(execution).finalSelectionQualified, false);
});

test("direct final selection rechecks scoped mint expiry without an identity-engine rerun", (t) => {
  const original = analyzeFinalSelectionIntegrity(attachCanonicalIdentity(candidate()));
  const copies = [original, compactProjectForReportWriters(original), buildTop10CandidateInput([original]).projects[0]];
  const now = Date.now();
  t.mock.method(Date, "now", () => now + 301000);
  for (const project of copies) {
    const current = analyzeFinalSelectionIntegrity(project);
    assert.equal(current.finalIdentityState, "PROBABLE_MATCH");
    assert.equal(current.contractVerified, false);
    assert.equal(current.chainVerified, false);
    assert.equal(current.finalSelectionQualified, false);
    assert.notEqual(current.canonicalIdentity.identityStatus, "VERIFIED");
  }
});

test("derived final flags cannot perpetuate an expired scoped mint-account proof", () => {
  const original = analyzeFinalSelectionIntegrity(attachCanonicalIdentity(candidate()));
  assert.equal(original.contractVerified, true);
  const expired = evidence();
  expired.sourceTimestamp = new Date(Date.now() - 301000).toISOString();
  expired.raw.rpc.sourceTimestamp = expired.sourceTimestamp;
  expired.raw.rpc.blockTimestamp = Date.parse(expired.sourceTimestamp) / 1000;
  const current = attachCanonicalIdentity({ ...original, solanaMintAccountEvidence: null, securityEvidence: [expired] });
  assert.notEqual(current.identityStatus, "VERIFIED");
  assert.equal(analyzeFinalSelectionIntegrity(current).contractVerified, false);
  assert.notEqual(attachCanonicalIdentity(current).identityStatus, "VERIFIED");
  for (const compacted of [compactProjectForReportWriters(original), buildTop10CandidateInput([original]).projects[0]]) {
    assert.equal(compacted.identityVerificationScope, "SOLANA_MINT_ACCOUNT");
    assert.equal(attachCanonicalIdentity({ ...compacted, canonicalIdentity: undefined, securityEvidence: undefined }).identityStatus, "VERIFIED");
    const withoutRaw = { ...compacted, canonicalIdentity: undefined, securityEvidence: undefined, solanaMintAccountEvidence: undefined };
    assert.notEqual(attachCanonicalIdentity(withoutRaw).identityStatus, "VERIFIED");
  }
});

test("security recovery schedules the project identity producer but unrelated market recovery does not", () => {
  assert.equal(shouldRerunEngineForEvidenceFamilies("Project Identity Graph", ["SECURITY"]), true);
  assert.equal(shouldRerunEngineForEvidenceFamilies("Project Identity Graph", ["MARKET"]), false);
});

test("bounded JSON retains the scoped mint proof without raw graphs and expiry still applies", (t) => {
  const reportsDir = fs.mkdtempSync(path.join(os.tmpdir(), "scoped-mint-report-"));
  t.after(() => fs.rmSync(reportsDir, { recursive: true, force: true }));
  for (const key of ["REPORT_MAX_TOTAL_PROJECT_PAYLOAD_CHARS", "REPORT_MAX_PROJECT_PAYLOAD_CHARS"]) {
    const previous = process.env[key];
    process.env[key] = "8000";
    t.after(() => { if (previous === undefined) delete process.env[key]; else process.env[key] = previous; });
  }
  const project = analyzeFinalSelectionIntegrity(attachCanonicalIdentity(candidate()));
  const before = structuredClone(project);
  const copies = [];
  for (const input of [project, compactProjectForReportWriters(project), buildTop10CandidateInput([project]).projects[0]]) {
    const file = writeJsonReport([{ ...input, providerNoise: "x".repeat(50000) }], { reportsDir });
    const [saved] = JSON.parse(fs.readFileSync(file, "utf8")).projects;
    assert.equal(saved.identityVerificationScope, "SOLANA_MINT_ACCOUNT");
    assert.equal(saved.solanaMintAccountEvidence.genesisHash, GENESIS);
    assert.equal(saved.solanaMintAccountEvidence.ownerProgram, PROGRAM);
    assert.equal(saved.solanaMintAccountEvidence.raw, undefined);
    assert.equal(attachCanonicalIdentity(saved).identityStatus, "VERIFIED");
    assert.equal(saved.finalSelectionQualified, false);
    copies.push(saved);
  }
  assert.deepEqual(project, before);
  const now = Date.now();
  t.mock.method(Date, "now", () => now + 301000);
  for (const saved of copies) assert.notEqual(attachCanonicalIdentity(saved).identityStatus, "VERIFIED");
});
