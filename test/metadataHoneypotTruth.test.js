import test from "node:test";
import assert from "node:assert/strict";
import { normalizeSourcifyContract } from "../src/data/security/sourcifyV2Connector.js";
import { normalizeBlockscoutSecurityEvidence } from "../src/data/security/blockscoutConnector.js";
import { normalizeEtherscanV2SecurityEvidence } from "../src/data/security/etherscanV2Connector.js";
import { normalizeGoPlusTokenSecurity } from "../src/data/security/goplusSecurityConnector.js";
import { getSolanaSecurityEvidence } from "../src/data/security/solanaSecurityConnector.js";
import { securityObservationIsCurrent, summarizeSecurityEvidence } from "../src/data/security/securityEvidenceUtils.js";
import { applyCanonicalAliases, resolveCanonicalAliases } from "../src/data/canonicalAliasResolver.js";

const TOKEN = `0x${"1".repeat(40)}`;
const CREATOR = `0x${"2".repeat(40)}`;
const IMPLEMENTATION = `0x${"3".repeat(40)}`;
const TX = `0x${"a".repeat(64)}`;
const META = { chain: "base", chainId: "8453", address: TOKEN };
const MINT = "So11111111111111111111111111111111111111112";
const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const GENESIS = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";
const NOW = Date.parse("2026-10-19T10:00:00Z");

test.beforeEach((t) => {
  let networkCalls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    networkCalls++;
    throw new Error("Live HTTP is forbidden in metadata honeypot tests");
  });
  t.after(() => assert.equal(networkCalls, 0));
});

function assertMetadataOnly(result, confidence) {
  assert.equal(result.status, "EVIDENCE_AVAILABLE");
  assert.equal(result.verifiedSource, true);
  assert.equal(result.creatorAddress, CREATOR);
  assert.equal(result.honeypot, null, "Source and creator metadata do not establish a negative honeypot test");
  assert.equal(result.confidence, confidence);
  for (const field of ["ownerRisk", "mintRisk", "freezeRisk", "blacklistRisk", "highTaxRisk", "malicious"]) {
    assert.equal(result[field], false, `${field} is outside this honeypot-only change`);
  }
}

test("Sourcify verified source and creator proof remain known while honeypot is unknown", () => {
  const raw = { address: TOKEN, chainId: 8453, match: "exact_match", creationMatch: "perfect",
    deployment: { deployer: CREATOR, transactionHash: TX, blockNumber: "12345" } };
  const snapshot = structuredClone(raw);
  const result = normalizeSourcifyContract(raw, META);
  assertMetadataOnly(result, 90);
  assert.equal(result.exactMatch, true);
  assert.equal(result.deploymentTransactionHash, TX);
  assert.equal(result.creationBlockNumber, 12345);
  assert.equal(result.proxy, false);
  assert.deepEqual(result.riskFindings, []);
  assert.deepEqual(result.warnings, []);
  assert.strictEqual(result.raw, raw);
  assert.deepEqual(raw, snapshot);
});

test("Sourcify's current response identity guard still rejects foreign metadata", () => {
  for (const patch of [{ address: CREATOR }, { chainId: 1 }, { address: TOKEN, tokenAddress: CREATOR }]) {
    const raw = { match: "exact_match", deployment: { deployer: CREATOR }, ...patch };
    const result = normalizeSourcifyContract(raw, META);
    assert.equal(result.status, "UNKNOWN");
    assert.equal(result.responseIdentityVerified, false);
    assert.equal(result.creatorAddress, undefined);
    assert.notEqual(result.verifiedSource, true);
    assert.notEqual(result.honeypot, false);
    assert.equal(result.confidence, 0);
    assert.strictEqual(result.raw, raw);
  }
});

test("Blockscout keeps verified source, deployment and proxy risk without claiming a negative honeypot test", () => {
  const contract = { is_verified: true, name: "MetadataToken", is_proxy: true,
    implementation_address: IMPLEMENTATION, creator_address_hash: CREATOR,
    creation_tx_hash: TX, creation_block_number: "12345", creation_timestamp: NOW / 1000 };
  const addressInfo = { hash: TOKEN };
  const result = normalizeBlockscoutSecurityEvidence(contract, addressInfo, META);
  assertMetadataOnly(result, 78);
  assert.equal(result.proxy, true);
  assert.equal(result.implementationAddress, IMPLEMENTATION);
  assert.equal(result.deploymentTransactionHash, TX);
  assert.equal(result.creationBlockNumber, 12345);
  assert.equal(result.contractCreationTimestamp, new Date(NOW).toISOString());
  assert.deepEqual(result.riskFindings, ["Blockscout shows proxy or implementation indirection."]);
  assert.strictEqual(result.raw.contract, contract);
  assert.strictEqual(result.raw.addressInfo, addressInfo);
});

test("Etherscan keeps verified ABI, source and creator proof while metadata-only honeypot is unknown", () => {
  const abi = JSON.stringify([{ type: "function", name: "transfer" }, { type: "event", name: "Transfer" }]);
  const raw = { sourceCode: { status: "1", message: "OK", result: [{ ContractName: "MetadataToken",
    SourceCode: "contract MetadataToken {}", ABI: abi, Proxy: "1", Implementation: IMPLEMENTATION }] },
  creation: { status: "1", result: [{ contractAddress: TOKEN, contractCreator: CREATOR,
    txHash: TX, blockNumber: "12345", timestamp: String(NOW / 1000) }] } };
  const snapshot = structuredClone(raw);
  const result = normalizeEtherscanV2SecurityEvidence(raw, META);
  assertMetadataOnly(result, 88);
  assert.equal(result.exactMatch, true);
  assert.equal(result.abiAvailable, true);
  assert.equal(result.abiFunctionCount, 1);
  assert.equal(result.abiEventCount, 1);
  assert.equal(result.proxy, true);
  assert.equal(result.implementationAddress, IMPLEMENTATION);
  assert.equal(result.creationTxHash, TX);
  assert.equal(result.creationBlockNumber, 12345);
  assert.equal(result.creationTimestamp, NOW / 1000);
  assert.equal(result.raw.source.SourceCodeLength, raw.sourceCode.result[0].SourceCode.length);
  assert.equal(result.raw.source.AbiLength, abi.length);
  assert.equal(result.raw.creation.contractCreator, CREATOR);
  assert.deepEqual(result.riskFindings, ["Etherscan V2 shows proxy or implementation indirection."]);
  assert.deepEqual(raw, snapshot);
});

function goPlus(item) {
  return normalizeGoPlusTokenSecurity({ result: { [TOKEN]: item } }, META);
}

test("source verification alone cannot become a negative honeypot summary or alias", () => {
  const evidence = normalizeSourcifyContract({ match: "exact_match", address: TOKEN, chainId: 8453,
    deployment: { deployer: CREATOR } }, META);
  const summary = summarizeSecurityEvidence([evidence]);
  assert.equal(summary.verifiedSource, true);
  assert.equal(summary.honeypot, null);
  assert.equal(summary.honeypotNegativeVerified, false);
  const result = resolveCanonicalAliases({ chain: "base", tokenAddress: TOKEN,
    sourcifyDeployerEvidence: evidence, securityEvidenceSummary: summary },
  { fields: ["honeypotDetected", "contractVerified", "deployer"] }).resolved;
  assert.equal(result.honeypotDetected, null);
  assert.equal(result.contractVerified, true);
  assert.equal(result.deployer, CREATOR);
});

test("legacy metadata risk absence and incomplete GoPlus payloads cannot replay a false honeypot alias", () => {
  for (const provider of ["sourcify-v2", "blockscout", "etherscan-v2", "rugcheck-solana-full", "goplus"]) {
    const evidence = { provider, status: "EVIDENCE_AVAILABLE", chain: "base", address: TOKEN,
      observedAt: new Date().toISOString(), confidence: 85, responseIdentityVerified: true,
      honeypot: false, verifiedSource: true, raw: {} };
    const project = { chain: "base", tokenAddress: TOKEN, legacySecurityEnvelope: evidence };
    assert.equal(resolveCanonicalAliases(project, { fields: ["honeypotDetected"] }).resolved.honeypotDetected, null, provider);
    assert.equal(summarizeSecurityEvidence([evidence]).honeypot, null, provider);
  }
});

test("actual exact GoPlus negative probes retain false, provenance and safe summary aliases", () => {
  const evidence = goPlus({ is_honeypot: "0", is_open_source: "1" });
  const summary = summarizeSecurityEvidence([evidence]);
  assert.equal(summary.honeypot, false);
  assert.equal(summary.honeypotNegativeVerified, true);
  assert.deepEqual(summary.honeypotNegativeEvidence.map(value => [value.chain, value.tokenAddress]), [["base", TOKEN]]);
  assert.equal(summary.honeypotNegativeEvidence[0].sourceTimestamp, evidence.observedAt);
  const project = { chain: "base", tokenAddress: TOKEN, securityEvidenceSummary: summary };
  assert.equal(resolveCanonicalAliases(project, { fields: ["honeypotDetected"] }).resolved.honeypotDetected, false);
});

test("negative probes and summaries for another token cannot clear this candidate's honey status", () => {
  const evidence = goPlus({ is_honeypot: "0" });
  for (const patch of [{ chain: "ethereum" }, { address: CREATOR }]) {
    const foreign = { ...evidence, ...patch };
    const project = { chain: "base", tokenAddress: TOKEN, securityEvidenceSummary: summarizeSecurityEvidence([foreign]),
      goplusDeployerEvidence: foreign };
    assert.equal(resolveCanonicalAliases(project, { fields: ["honeypotDetected"] }).resolved.honeypotDetected, null);
  }
});

test("genuine adverse honeypot evidence survives metadata-only and unknown companions", () => {
  const adverse = goPlus({ is_honeypot: "1" });
  const summary = summarizeSecurityEvidence([adverse, { provider: "sourcify-v2", status: "UNKNOWN", honeypot: false }]);
  assert.equal(summary.honeypot, true);
  assert.equal(summary.honeypotNegativeVerified, false);
  assert.equal(resolveCanonicalAliases({ chain: "base", tokenAddress: TOKEN, securityEvidenceSummary: summary },
    { fields: ["honeypotDetected"] }).resolved.honeypotDetected, true);
});

test("flattened legacy metadata aliases are quarantined without erasing a newer verified observation", () => {
  const project = { chain: "base", tokenAddress: TOKEN, honeypotDetected: false,
    canonicalAliasProvenance: { honeypotDetected: { sourcePath: "sourcifyDeployerEvidence.honeypot" } },
    sourcifyDeployerEvidence: { provider: "sourcify-v2", status: "EVIDENCE_AVAILABLE", chain: "base", address: TOKEN,
      honeypot: false, raw: {} } };
  const unknown = applyCanonicalAliases(project, { fields: ["honeypotDetected"] });
  assert.equal(unknown.honeypotDetected, null);
  assert.equal(unknown.canonicalAliases.honeypotDetected, null);
  const current = applyCanonicalAliases({ ...project, fieldProvenance: { honeypotDetected: {
    source: "goplus", verificationStatus: "VERIFIED_PROVIDER_OBSERVATION", value: false } } }, { fields: ["honeypotDetected"] });
  assert.equal(current.honeypotDetected, false);
});

test("malformed and unbound legacy negative summaries remain UNKNOWN without throwing", () => {
  for (const value of [undefined, {}, [null], [{ chain: "base", tokenAddress: TOKEN }]]) {
    const project = { chain: "base", tokenAddress: TOKEN, securityEvidenceSummary: { honeypot: false,
      providers: ["goplus"], honeypotNegativeVerified: true, honeypotNegativeEvidence: value } };
    assert.equal(resolveCanonicalAliases(project, { fields: ["honeypotDetected"] }).resolved.honeypotDetected, null);
  }
});

test("negative-probe timestamps must be current observations, not refreshed cache receipt times", () => {
  const stamp = new Date(NOW).toISOString();
  assert.equal(securityObservationIsCurrent(stamp, 1000, NOW + 1000), true);
  assert.equal(securityObservationIsCurrent(stamp, 1000, NOW + 1001), false);
  assert.equal(securityObservationIsCurrent(stamp, 1000, NOW - 1), false);
  for (const value of [null, undefined, "not-a-time", NOW]) {
    assert.equal(securityObservationIsCurrent(value, 1000, NOW), false);
  }
});

test("GoPlus missing and invalid honeypot values remain unknown without losing source or creator metadata", () => {
  for (const value of [undefined, null, "", "UNKNOWN", "null", "none", "false", "true", "yes", "no",
    " 0 ", "0.0", 2, -1, [], [0], {}]) {
    const item = { is_open_source: "1", creator_address: CREATOR, holder_count: "12",
      ...(value === undefined ? {} : { is_honeypot: value }) };
    const result = goPlus(item);
    assert.equal(result.status, "EVIDENCE_AVAILABLE");
    assert.equal(result.honeypot, null);
    assert.equal(result.verifiedSource, true);
    assert.equal(result.creatorAddress, CREATOR);
    assert.equal(result.holderCount, 12);
    assert.equal(result.responseIdentityVerified, true);
    assert.equal(result.confidence, 78);
    assert.deepEqual(result.riskFindings, []);
    assert.strictEqual(result.raw, item);
  }
});

test("actual strict GoPlus zero and one flags preserve known negatives and adverse positives", () => {
  for (const [values, expected] of [[[false, 0, "0"], false], [[true, 1, "1"], true]]) {
    for (const value of values) {
      const item = { is_open_source: "1", is_honeypot: value, creator_address: CREATOR };
      const result = goPlus(item);
      assert.equal(result.honeypot, expected);
      assert.equal(result.confidence, expected ? 86 : 78);
      assert.equal(result.riskFindings.includes("GoPlus honeypot signal is active."), expected);
      assert.equal(result.verifiedSource, true);
      assert.equal(result.creatorAddress, CREATOR);
      assert.equal(result.chain, META.chain);
      assert.equal(result.address, TOKEN);
      assert.equal(result.responseIdentityVerified, true);
      assert.strictEqual(result.raw, item);
    }
  }
});

test("changing GoPlus honeypot semantics does not change other adversity, taxes or identity fields", () => {
  for (const [is_honeypot, expected] of [[undefined, null], ["invalid", null], ["0", false], ["1", true]]) {
    const item = { is_honeypot, is_open_source: "1", creator_address: CREATOR, owner_address: CREATOR,
      is_mintable: "1", transfer_pausable: "1", is_blacklisted: "1", malicious_address: "1", is_proxy: "1",
      buy_tax: "0.12", sell_tax: "0.18", holder_count: "12", lp_holder_count: "3" };
    const snapshot = structuredClone(item);
    const result = goPlus(item);
    assert.equal(result.honeypot, expected);
    for (const field of ["ownerRisk", "mintRisk", "freezeRisk", "blacklistRisk", "highTaxRisk", "malicious", "proxy", "verifiedSource"]) {
      assert.equal(result[field], true, field);
    }
    assert.equal(result.buyTaxPct, 12);
    assert.equal(result.sellTaxPct, 18);
    assert.equal(result.holderCount, 12);
    assert.equal(result.lpHolderCount, 3);
    assert.equal(result.creatorAddress, CREATOR);
    assert.equal(result.ownerAddress, CREATOR);
    assert.equal(result.responseIdentityVerified, true);
    assert.equal(result.confidence, 86);
    assert.strictEqual(result.raw, item);
    assert.deepEqual(item, snapshot);
  }
});

for (const rugged of [false, true, null]) {
  test(`offline Solana ${rugged === null ? "mint-only" : rugged ? "rugged" : "clean mint"} evidence does not invent a negative EVM honeypot result`, async () => {
    const calls = [];
    const result = await getSolanaSecurityEvidence({ chain: "solana", tokenAddress: MINT }, {
      useCache: false, now: () => NOW, solanaRpcUrl: "https://rpc.invalid",
      fetchJson: async (url, init) => {
        if (init.method !== "POST") {
          calls.push("rugcheck");
          if (rugged === null) throw new Error("Offline fixture: no RugCheck report");
          return { mint: MINT, tokenProgram: TOKEN_PROGRAM, topHolders: [], totalHolders: 0,
            risks: [], rugged, score: 1, mintAuthority: null, freezeAuthority: null };
        }
        const { method } = JSON.parse(init.body);
        calls.push(method);
        assert.equal(url, "https://rpc.invalid");
        const results = { getGenesisHash: GENESIS, getBlockTime: NOW / 1000,
          getAccountInfo: { context: { slot: 123 }, value: { executable: false, owner: TOKEN_PROGRAM,
            data: { parsed: { type: "mint", info: { isInitialized: true, mintAuthority: null,
              freezeAuthority: null, decimals: 9, supply: "100" } } } } } };
        assert.ok(Object.hasOwn(results, method));
        return { result: results[method] };
      },
    });
    assert.equal(calls.length, 4);
    assert.equal(result.verifiedSource, true);
    assert.equal(result.identityVerifiedOnChain, true);
    assert.equal(result.responseIdentityVerified, true);
    assert.equal(result.snapshotTimestampVerified, true);
    assert.equal(result.sourceTimestamp, new Date(NOW).toISOString());
    assert.equal(result.malicious, rugged === true);
    assert.equal(result.honeypot, rugged === true ? true : null);
    assert.equal(result.status, rugged === true ? "RISK_REVIEW" : "EVIDENCE_AVAILABLE");
    assert.equal(result.confidence, rugged === null ? 82 : 90);
    for (const field of ["mintRisk", "freezeRisk", "blacklistRisk", "ownerRisk", "highTaxRisk"]) assert.equal(result[field], false);
    assert.deepEqual(result.testedChecks, ["mint-account identity", "mint authority", "freeze authority",
      ...(rugged === null ? [] : ["RugCheck risk report"])]);
    assert.equal(result.raw.rpc.genesisHash, GENESIS);
    if (rugged !== null) assert.equal(result.raw.rugCheck.rugged, rugged);
  });
}
