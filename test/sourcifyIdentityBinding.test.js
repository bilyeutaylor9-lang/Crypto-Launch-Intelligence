import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { normalizeSourcifyContract, getSourcifySecurityEvidence } from "../src/data/security/sourcifyV2Connector.js";
import { summarizeSecurityEvidence } from "../src/data/security/securityEvidenceUtils.js";
import { executeActiveEvidenceProviderRequests } from "../src/data/activeEvidenceProviderExecutor.js";
import { collectAliasCandidates, resolveCanonicalAliases } from "../src/data/canonicalAliasResolver.js";

const TOKEN = `0x${"a".repeat(40)}`;
const OTHER = `0x${"b".repeat(40)}`;
const CREATOR = `0x${"c".repeat(40)}`;
const raw = patch => ({ match: "exact_match", deployment: { deployer: CREATOR }, ...patch });
const legacy = patch => ({ provider: "sourcify-v2", status: "EVIDENCE_AVAILABLE", chain: "base", address: TOKEN,
  creatorAddress: CREATOR, verifiedSource: true, confidence: 90, observedAt: new Date().toISOString(), raw: raw(patch) });

for (const patch of [{ address: OTHER }, { chainId: 1 }, { chain: "ethereum" }, { contractAddress: OTHER },
  { address: TOKEN, tokenAddress: OTHER }, { address: "SAME_SYMBOL" }, { chain_id: 999999 },
  { network: "solana" }, { address: [] }, { address: "" }]) {
  test(`response normalization rejects contradictory or malformed binding: ${JSON.stringify(patch)}`, () => {
    const result = normalizeSourcifyContract(raw(patch), { chain: "base", address: TOKEN });
    assert.equal(result.status, "UNKNOWN");
    assert.equal(result.confidence, 0);
    assert.notEqual(result.verifiedSource, true);
    assert.equal(result.creatorAddress, undefined);
    assert.equal(result.responseIdentityVerified, false);
    assert.deepEqual(result.raw, raw(patch));
  });
}

test("bound metadata preserves exact identities, endpoint-scoped responses and distinct creators", () => {
  for (const patch of [{}, { address: TOKEN, chainId: 8453 },
    { address: `0x${"A".repeat(40)}`, chain: "BASE" }, { contract_address: TOKEN, chain_id: "8453" }]) {
    const result = normalizeSourcifyContract(raw(patch), { chain: "base", address: TOKEN });
    assert.equal(result.status, "EVIDENCE_AVAILABLE");
    assert.equal(result.creatorAddress, CREATOR);
    assert.equal(result.address, TOKEN);
  }
  assert.equal(normalizeSourcifyContract(raw({ deployment: {} }), { chain: "base", address: TOKEN }).creatorAddress, null);
});

test("live response normalization cannot bind another contract's creator to the requested token", async t => {
  t.mock.method(globalThis, "fetch", async url => {
    assert.ok(String(url).includes(`/8453/${TOKEN}?fields=deployment`));
    return { ok: true, json: async () => raw({ address: OTHER, chainId: 1 }) };
  });
  const result = await getSourcifySecurityEvidence({ chain: "base", tokenAddress: TOKEN }, { useCache: false });
  assert.equal(result.status, "UNKNOWN");
  assert.equal(result.creatorAddress, undefined);
});

test("legacy conflicting creator envelopes cannot promote local or injected provider observations", async t => {
  t.mock.method(globalThis, "fetch", async () => assert.fail("No live requests"));
  for (const local of [false, true]) for (const provider of ["sourcify-v2", undefined, "blockscout"]) {
    const evidence = { ...legacy({ address: OTHER }), provider };
    const result = await executeActiveEvidenceProviderRequests({ chain: "base", tokenAddress: TOKEN,
      ...(local ? { sourcifyDeployerEvidence: evidence } : {}) },
    [{ field: "creator", item: { targetSources: [{ source: "block explorers" }] } }], {
      useCache: false, nativeDeploymentHistory: false, maxProviderRequests: local ? 0 : 2,
      providers: { getSourcifyDeployerEvidence: async () => evidence,
        getBlockscoutDeployerEvidence: async () => ({ status: "UNKNOWN" }) },
    });
    assert.equal(result.observations.some(item => ["creator", "creatorAddress", "deployer"].includes(item.field)), false);
  }
});

test("security summaries cannot borrow verified source or adverse flags from a contradictory response", () => {
  const foreign = { ...legacy({ chainId: 1 }), malicious: true, riskFindings: ["foreign-contract-risk"] };
  const summary = summarizeSecurityEvidence([foreign]);
  assert.equal(summary.status, "UNKNOWN");
  assert.equal(summary.verifiedSource, false);
  assert.equal(summary.malicious, false);
  assert.deepEqual(summary.riskFindings, []);
  assert.ok(summary.warnings.some(value => /identity conflicts/.test(value)));
  const adverse = { provider: "goplus", status: "EVIDENCE_AVAILABLE", responseIdentityVerified: true,
    malicious: true, honeypot: true, confidence: 80, raw: {} };
  const retained = summarizeSecurityEvidence([adverse, foreign]);
  assert.equal(retained.malicious, true);
  assert.equal(retained.honeypot, true);
});

test("source-only legacy Sourcify envelopes receive the same summary identity quarantine", () => {
  const evidence = { ...legacy({ address: OTHER }), provider: undefined, source: "sourcify-v2",
    malicious: true, riskFindings: ["foreign-contract-risk"] };
  const summary = summarizeSecurityEvidence([evidence]);
  assert.equal(summary.status, "UNKNOWN");
  assert.equal(summary.verifiedSource, false);
  assert.equal(summary.confidence, 0);
  assert.equal(summary.malicious, false);
  assert.deepEqual(summary.riskFindings, []);
});

test("retained rejected raw metadata cannot re-enter creator evidence through semantic aliases", () => {
  const evidence = normalizeSourcifyContract(raw({ address: OTHER }), { chain: "base", address: TOKEN });
  const project = { chain: "base", tokenAddress: TOKEN, sourcifyDeployerEvidence: evidence };
  const result = resolveCanonicalAliases(project,
    { fields: ["creator", "deployer", "creatorAddress", "deployerAddress"] });
  assert.ok(Object.values(result.resolved).every(value => value === null));
  assert.ok(collectAliasCandidates(project, "deployer").some(record => record.validationStatus === "REJECTED_ALIAS" &&
    record.normalizationRule === "sourcify-unverified-or-contradictory-identity"));
  assert.equal(evidence.raw.deployment.deployer, CREATOR, "Raw audit evidence is retained, not erased");
});

test("semantic aliases retain valid bound creator observations but reject foreign envelopes", () => {
  const valid = legacy({ address: TOKEN, chainId: 8453 });
  assert.equal(resolveCanonicalAliases({ chain: "base", tokenAddress: TOKEN, sourcifyDeployerEvidence: valid },
    { fields: ["deployer"] }).resolved.deployer, CREATOR);
  for (const patch of [{ ...valid, chain: "ethereum", raw: raw({ chainId: 1 }) },
    { ...valid, status: "UNKNOWN" }]) {
    assert.equal(resolveCanonicalAliases({ chain: "base", tokenAddress: TOKEN, sourcifyDeployerEvidence: patch },
      { fields: ["deployer"] }).resolved.deployer, null);
  }
});

test("semantic creator binding checks every supported project identity form and conflicting declarations", () => {
  const identities = [{ finalContractAddress: TOKEN }, { canonicalAddress: TOKEN }, { verifiedContractAddress: TOKEN },
    { baseTokenAddress: TOKEN }, { baseToken: { address: TOKEN, chain: "base" } },
    { rawCandidate: { address: TOKEN } }, { marketData: { tokenAddress: TOKEN } },
    { canonicalExecutionRoute: { contractAddress: TOKEN, chain: "base" } },
    { executionProofRecoveryRoute: { tokenAddress: TOKEN, chain: "base" } },
    { executionProof: { contractAddress: TOKEN, chain: "base" } }];
  const valid = legacy({ address: TOKEN, chainId: 8453 });
  const foreign = { ...legacy({ address: OTHER, chainId: 8453 }), address: OTHER };
  const resolve = (identity, evidence) => resolveCanonicalAliases({ chain: "base", ...identity,
    sourcifyDeployerEvidence: evidence }, { fields: ["deployer"] }).resolved.deployer;
  for (const identity of identities) {
    assert.equal(resolve(identity, valid), CREATOR, JSON.stringify(identity));
    assert.equal(resolve(identity, foreign), null, JSON.stringify(identity));
    assert.equal(resolve(identity, { ...foreign, provider: undefined }), null, JSON.stringify(identity));
  }
  assert.equal(resolve({ tokenAddress: TOKEN, canonicalAddress: OTHER }, valid), null);
  for (const identity of [{ canonicalChain: "base", canonicalAddress: TOKEN },
    { marketData: { chain: "base", tokenAddress: TOKEN } }]) {
    assert.equal(resolve({ ...identity, chain: undefined }, valid), CREATOR);
    assert.equal(resolve({ ...identity, chain: undefined }, { ...valid, chain: "ethereum", raw: raw({ chainId: 1 }) }), null);
  }
});

test("persisted security cache rejects contradictory raw and outer bindings without deleting or refreshing records", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "cli-sourcify-identity-"));
  fs.mkdirSync(path.join(directory, "data"));
  const url = new URL("../src/data/security/securityEvidenceUtils.js", import.meta.url).href;
  try {
    execFileSync(process.execPath, ["--input-type=module", "-e", `
      import fs from 'node:fs';
      import assert from 'node:assert/strict';
      import {getCachedSecurityEvidence} from ${JSON.stringify(url)};
      const token = ${JSON.stringify(TOKEN)}, other = ${JSON.stringify(OTHER)};
      const stamp = new Date(Date.now()-1000).toISOString();
      const entry = raw => ({cachedAtMs:Date.now()-1000,value:{provider:'sourcify-v2',chain:'base',address:token,
        status:'EVIDENCE_AVAILABLE',verifiedSource:true,observedAt:stamp,raw}});
      const key = 'sourcify-v2:base:'+token;
      const file = 'data/security-evidence-cache.json';
      for(const value of [entry({address:other,chainId:8453}), {...entry({address:token}),value:{...entry({}).value,address:other}}]) {
        fs.writeFileSync(file,JSON.stringify({[key]:value}));
        const bytes = fs.readFileSync(file,'utf8');
        assert.equal(getCachedSecurityEvidence('sourcify-v2','base',token),null);
        assert.equal(fs.readFileSync(file,'utf8'),bytes);
      }
      fs.writeFileSync(file,JSON.stringify({[key]:entry({address:token,chainId:8453})}));
      assert.equal(getCachedSecurityEvidence('sourcify-v2','base',token).observedAt,stamp);
      for(const provider of ['sourcify-v2','blockscout','etherscan-v2','rugcheck-solana-full','goplus']) {
        const cacheKey = provider+':base:'+token;
        const record = {cachedAtMs:Date.now()-1000,value:{provider,chain:'base',address:token,
          status:'EVIDENCE_AVAILABLE',confidence:85,observedAt:stamp,honeypot:false,raw:{}}};
        fs.writeFileSync(file,JSON.stringify({[cacheKey]:record}));
        const bytes = fs.readFileSync(file,'utf8');
        const observed = getCachedSecurityEvidence(provider,'base',token);
        assert.equal(observed.honeypot,null);
        assert.equal(observed.observedAt,stamp);
        assert.equal(fs.readFileSync(file,'utf8'),bytes);
      }
    `], { cwd: directory, stdio: "pipe" });
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
