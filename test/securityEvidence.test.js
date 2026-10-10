import test from "node:test";
import assert from "node:assert/strict";

import {
  getBlockscoutDeployerEvidence,
  normalizeBlockscoutSecurityEvidence,
} from "../src/data/security/blockscoutConnector.js";
import {
  buildEtherscanV2Url,
  getEtherscanV2SecurityEvidence,
  normalizeEtherscanV2SecurityEvidence,
} from "../src/data/security/etherscanV2Connector.js";
import { getFreeSecurityEvidence } from "../src/data/security/freeSecurityEvidenceConnector.js";
import { getGoPlusSecurityEvidence, normalizeGoPlusTokenSecurity } from "../src/data/security/goplusSecurityConnector.js";
import { normalizeSourcifyContract } from "../src/data/security/sourcifyV2Connector.js";
import { boolFlag, cacheKey, summarizeSecurityEvidence } from "../src/data/security/securityEvidenceUtils.js";
import { createGoPlusRequestLimiter } from "../src/data/security/goplusRequestLimiter.js";
import {
  analyzeContractAuthorityRisk,
  analyzeContractAuthorityRiskBatch,
} from "../src/engines/contractAuthorityRiskEngine.js";
import { analyzeLiquidityControlRisk } from "../src/engines/liquidityControlRiskEngine.js";
import { buildCandidateProofState } from "../src/kernel/candidateTruthState.js";

const ADDRESS = "0x1111111111111111111111111111111111111111";

test("provider placeholder flags remain unknown rather than clean negatives", () => {
  for (const value of [null, undefined, "", "null", "undefined", "none", "UNKNOWN", " NULL "]) {
    assert.equal(boolFlag(value), null);
    const summary = summarizeSecurityEvidence([{ provider: "goplus", status: "EVIDENCE_AVAILABLE",
      responseIdentityVerified: true, raw: { is_honeypot: value } }]);
    assert.ok(summary.unknownChecks.includes("goplus.is_honeypot"));
    assert.ok(!summary.testedChecks.includes("goplus.is_honeypot"));
    const proof = buildCandidateProofState({ instantSafetyStatus: "PASS", securityEvidenceSummary: summary });
    assert.notEqual(proof.safety.status, "VERIFIED_SAFE");
  }
  for (const value of [false, 0, "0", "false", "no"]) assert.equal(boolFlag(value), false);
  for (const value of [true, 1, "1", "true", "yes"]) assert.equal(boolFlag(value), true);
});

test("GoPlus response identity preserves Solana case and EVM case-insensitivity", () => {
  const mint = "So11111111111111111111111111111111111111112";
  const record = { is_open_source: "1", is_honeypot: "0" };
  assert.equal(normalizeGoPlusTokenSecurity({ result: { [mint.toLowerCase()]: record } },
    { chain: "solana", address: mint }).status, "UNKNOWN");
  assert.equal(normalizeGoPlusTokenSecurity({ result: { [mint]: record } },
    { chain: "solana", address: mint }).responseIdentityVerified, true);
  const evm = `0x${"ab".repeat(20)}`;
  assert.equal(normalizeGoPlusTokenSecurity({ result: { [evm.toUpperCase()]: record } },
    { chain: "base", address: evm }).responseIdentityVerified, true);
});

test("GoPlus quota waits stop at the recovery deadline without spending a slot", async () => {
  let now = 0;
  const limiter = createGoPlusRequestLimiter({ now: () => now, sleep: async (ms) => { now += ms; } });
  assert.equal(await limiter(), true);
  limiter.defer();
  assert.equal(await limiter({ deadlineAt: 100 }), false);
  assert.equal(now, 100);
  assert.equal(await limiter(), true);
  assert.equal(now, 61000);
});

test("GoPlus normalizer flags honeypot, mint, blacklist, and high tax risks", () => {
  const result = normalizeGoPlusTokenSecurity(
    {
      result: {
        [ADDRESS.toLowerCase()]: {
          is_open_source: "1",
          is_honeypot: "1",
          is_mintable: "1",
          is_blacklisted: "1",
          buy_tax: "0.12",
          sell_tax: "0.18",
          owner_address: "0x2222222222222222222222222222222222222222",
          holder_count: "1050",
        },
      },
    },
    { chain: "base", address: ADDRESS }
  );

  assert.equal(result.status, "EVIDENCE_AVAILABLE");
  assert.equal(result.honeypot, true);
  assert.equal(result.mintRisk, true);
  assert.equal(result.blacklistRisk, true);
  assert.equal(result.highTaxRisk, true);
  assert.equal(result.verifiedSource, true);
  assert.ok(result.riskFindings.length >= 4);
});

test("GoPlus request pacing reserves distinct slots across simultaneous callers", async () => {
  const delays = [];
  let now = 1000;
  const limiter = createGoPlusRequestLimiter({ now: () => now, sleep: async (ms) => { delays.push(ms); now += ms; } });
  await Promise.all([limiter(), limiter(), limiter()]);
  assert.deepEqual(delays, [2100, 2100]);
  limiter.defer();
  await limiter();
  assert.equal(delays.at(-1), 61000);
});

test("GoPlus API-level rate rejection remains a provider failure", async (t) => {
  t.mock.method(globalThis, "fetch", async () => ({
    ok: true, json: async () => ({ code: 4029, message: "Too many requests", result: {} }),
  }));
  const result = await getGoPlusSecurityEvidence(
    { chain: "base", tokenAddress: "0x1111111111111111111111111111111111111111" },
    { useCache: false, goPlusRequestSlotReserved: true, goPlusRateLimiter: { defer() {} } }
  );
  assert.equal(result.status, "UNKNOWN");
  assert.equal(result.providerFailure, true);
  assert.equal(result.rateLimited, true);
  assert.notEqual(result.verifiedSource, true);
});

test("GoPlus never promotes another contract's creator or safety record", () => {
  const requested = "0x1111111111111111111111111111111111111111";
  const other = "0x2222222222222222222222222222222222222222";
  const raw = { result: { [other]: { creator_address: other, is_open_source: "1", is_honeypot: "0" } } };
  const mismatch = normalizeGoPlusTokenSecurity(raw, { chain: "base", address: requested });
  assert.equal(mismatch.status, "UNKNOWN");
  assert.equal(mismatch.creatorAddress, undefined);
  assert.notEqual(mismatch.verifiedSource, true);
  assert.equal(normalizeGoPlusTokenSecurity(raw, { chain: "base" }).status, "UNKNOWN");
});

test("Sourcify normalizer treats exact matches as verified source evidence", () => {
  const result = normalizeSourcifyContract(
    {
      match: "exact_match",
      creationMatch: "perfect",
      runtimeMatch: "perfect",
      deployment: {
        deployer: "0x2222222222222222222222222222222222222222",
        transactionHash: `0x${"ab".repeat(32)}`,
        blockNumber: "12345",
      },
    },
    { chain: "base", address: ADDRESS }
  );

  assert.equal(result.status, "EVIDENCE_AVAILABLE");
  assert.equal(result.verifiedSource, true);
  assert.equal(result.exactMatch, true);
  assert.equal(result.creatorAddress, "0x2222222222222222222222222222222222222222");
  assert.equal(result.deploymentTransactionHash, `0x${"ab".repeat(32)}`);
  assert.equal(result.creationBlockNumber, 12345);
  assert.equal(result.riskFindings.length, 0);
});

test("Blockscout normalizer preserves proxy and implementation evidence", () => {
  const result = normalizeBlockscoutSecurityEvidence(
    {
      is_verified: true,
      is_proxy: true,
      implementation_address: "0x3333333333333333333333333333333333333333",
      name: "ProxyToken",
    },
    { hash: ADDRESS },
    { chain: "base", address: ADDRESS }
  );

  assert.equal(result.status, "EVIDENCE_AVAILABLE");
  assert.equal(result.verifiedSource, true);
  assert.equal(result.proxy, true);
  assert.match(result.implementationAddress, /^0x3333/);
  assert.ok(result.riskFindings.some((item) => item.includes("proxy")));
});

test("Blockscout deployer recovery checks address and smart-contract metadata", async () => {
  const originalFetch = globalThis.fetch;
  const requestedUrls = [];
  globalThis.fetch = async (url) => {
    requestedUrls.push(String(url));
    return new Response(JSON.stringify({
      hash: ADDRESS,
      creator_address_hash: "0x2222222222222222222222222222222222222222",
      creation_transaction_hash: `0x${"ab".repeat(32)}`,
      is_contract: true,
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    const result = await getBlockscoutDeployerEvidence(
      { chain: "base", tokenAddress: ADDRESS },
      { useCache: false }
    );
    assert.equal(result.status, "EVIDENCE_AVAILABLE");
    assert.equal(result.address, ADDRESS);
    assert.equal(result.creatorAddress, "0x2222222222222222222222222222222222222222");
    assert.equal(result.provider, "blockscout-deployer");
    assert.equal(requestedUrls.length, 2);
    assert.ok(requestedUrls.some((url) => new RegExp(`/api/v2/addresses/${ADDRESS}$`, "i").test(url)));
    assert.ok(requestedUrls.some((url) => new RegExp(`/api/v2/smart-contracts/${ADDRESS}$`, "i").test(url)));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Etherscan V2 normalizer preserves ABI, source, creator, and proxy proof without storing giant blobs", () => {
  const result = normalizeEtherscanV2SecurityEvidence(
    {
      sourceCode: {
        status: "1",
        message: "OK",
        result: [
          {
            SourceCode: "contract TestToken { function totalSupply() public view returns (uint256) {} }",
            ABI: JSON.stringify([
              { type: "function", name: "totalSupply", inputs: [], outputs: [] },
              { type: "event", name: "Transfer", inputs: [] },
            ]),
            ContractName: "TestToken",
            CompilerVersion: "v0.8.24+commit.e11b9ed9",
            CompilerType: "solc",
            OptimizationUsed: "1",
            LicenseType: "MIT",
            Proxy: "1",
            Implementation: "0x3333333333333333333333333333333333333333",
          },
        ],
      },
      abi: {
        status: "1",
        message: "OK",
        result: JSON.stringify([{ type: "function", name: "balanceOf", inputs: [], outputs: [] }]),
      },
      creation: {
        status: "1",
        message: "OK",
        result: [
          {
            contractAddress: ADDRESS,
            contractCreator: "0x2222222222222222222222222222222222222222",
            txHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            blockNumber: "123",
            timestamp: "1710000000",
            creationBytecode: `0x${"11".repeat(2048)}`,
          },
        ],
      },
    },
    { chain: "base", chainId: "8453", address: ADDRESS }
  );

  assert.equal(result.status, "EVIDENCE_AVAILABLE");
  assert.equal(result.provider, "etherscan-v2");
  assert.equal(result.verifiedSource, true);
  assert.equal(result.abiAvailable, true);
  assert.equal(result.abiFunctionCount, 1);
  assert.equal(result.abiEventCount, 0);
  assert.equal(result.proxy, true);
  assert.equal(result.implementationAddress, "0x3333333333333333333333333333333333333333");
  assert.equal(result.creatorAddress, "0x2222222222222222222222222222222222222222");
  assert.equal(result.creationBlockNumber, 123);
  assert.equal(result.raw.source.SourceCodeLength > 0, true);
  assert.equal(result.raw.source.SourceCode, undefined);
  assert.equal(result.raw.source.ABI, undefined);
  assert.equal(result.raw.creation.creationBytecode, undefined);
});

test("Etherscan V2 connector requires a configured key and sanitized V2 contract URL", async () => {
  const result = await getEtherscanV2SecurityEvidence(
    { symbol: "NOKEY", chain: "base", address: ADDRESS },
    { env: {}, useCache: false }
  );
  const url = buildEtherscanV2Url({
    chainId: "8453",
    action: "getcontractcreation",
    address: ADDRESS,
    apiKey: "test-key",
  });

  assert.equal(result.status, "UNKNOWN");
  assert.ok(result.warnings.some((warning) => warning.includes("ETHERSCAN_API_KEY")));
  assert.match(url, /chainid=8453/);
  assert.match(url, /action=getcontractcreation/);
  assert.match(url, /contractaddresses=0x1111111111111111111111111111111111111111/);
});

test("free security connector degrades to UNKNOWN when providers have no evidence", async () => {
  const result = await getFreeSecurityEvidence(
    { symbol: "NOADDR", chain: "base" },
    {
      providers: [
        async () => ({ provider: "mock-a", status: "UNKNOWN", warnings: ["no address"], riskFindings: [], confidence: 0 }),
        async () => ({ provider: "mock-b", status: "UNKNOWN", warnings: ["no match"], riskFindings: [], confidence: 0 }),
      ],
    }
  );

  assert.equal(result.status, "UNKNOWN");
  assert.equal(result.summary.status, "UNKNOWN");
  assert.deepEqual(result.summary.knownProviders, []);
});

test("contract authority risk never treats missing evidence as safe", async () => {
  const result = await analyzeContractAuthorityRisk({
    symbol: "UNKNOWN",
    chain: "base",
    address: ADDRESS,
    pipelineScore: 82,
  });

  assert.equal(result.securityEvidenceStatus, "UNKNOWN");
  assert.equal(result.contractSafetyVerified, false);
  assert.equal(result.contractAuthorityVerdict, "SECURITY_UNKNOWN_REVIEW");
  assert.ok(result.contractAuthorityRiskScore >= 50);
});

test("contract authority risk blocks malicious or honeypot evidence", async () => {
  const securityEvidenceSummary = summarizeSecurityEvidence([
    {
      provider: "goplus",
      responseIdentityVerified: true,
      status: "EVIDENCE_AVAILABLE",
      verifiedSource: true,
      malicious: true,
      honeypot: true,
      blacklistRisk: true,
      riskFindings: ["Honeypot.", "Malicious."],
      warnings: [],
      confidence: 92,
    },
  ]);
  const result = await analyzeContractAuthorityRisk({
    symbol: "BAD",
    securityEvidenceSummary,
  });

  assert.equal(result.contractAuthorityVerdict, "BLOCK_CONTRACT_RISK");
  assert.equal(result.contractSafetyVerified, false);
  assert.ok(result.contractAuthorityRiskScore >= 80);
});

test("UNKNOWN and incomplete verified-source evidence cannot produce clean contract safety", async () => {
  for (const item of [
    { provider: "goplus", status: "UNKNOWN", verifiedSource: true },
    { provider: "goplus", status: "EVIDENCE_AVAILABLE", responseIdentityVerified: true,
      verifiedSource: true, confidence: 90, raw: { is_open_source: "1" } },
  ]) {
    const summary = summarizeSecurityEvidence([item]);
    const result = await analyzeContractAuthorityRisk({ securityEvidenceSummary: summary });
    assert.equal(result.contractSafetyVerified, false);
    assert.equal(result.contractAuthoritySafetyScore, 42);
    assert.notEqual(result.safetyProofStatus, "SAFETY_VERIFIED_CLEAN");
  }
});

test("complete observed safety checks retain clean qualification", async () => {
  const raw = Object.fromEntries(["is_open_source", "is_honeypot", "is_mintable", "is_proxy", "is_blacklisted", "cannot_sell_all", "slippage_modifiable", "transfer_pausable", "trading_cooldown", "personal_slippage_modifiable", "hidden_owner", "can_take_back_ownership", "owner_change_balance", "buy_tax", "sell_tax"].map((key) => [key, "0"]));
  raw.is_open_source = "1";
  const summary = summarizeSecurityEvidence([{ provider: "goplus", status: "EVIDENCE_AVAILABLE",
    responseIdentityVerified: true, verifiedSource: true, confidence: 90, raw }]);
  const result = await analyzeContractAuthorityRisk({ securityEvidenceSummary: summary,
    riskFlags: ["Contract authority evidence missing", "Unrelated observed danger"] });
  assert.equal(result.contractSafetyVerified, true);
  assert.equal(result.safetyProofStatus, "SAFETY_VERIFIED_CLEAN");
  assert.deepEqual(result.riskFlags, ["Unrelated observed danger"]);
});

test("security cache keys preserve Solana case and normalize EVM case", () => {
  assert.notEqual(cacheKey("goplus", "solana", "AbCd"), cacheKey("goplus", "solana", "abcd"));
  assert.equal(cacheKey("goplus", "base", "0xABCD"), cacheKey("goplus", "base", "0xabcd"));
});

test("safety trace contains observed check names rather than whole provider payloads", () => {
  const evidence = { provider: "goplus", status: "EVIDENCE_AVAILABLE", responseIdentityVerified: true,
    chain: "ethereum", address: "0xb62132e35a6c13ee1ee0f84dc5d40bad8d815206",
    raw: { is_honeypot: "0", holders: [{ address: ADDRESS }] } };
  const summary = summarizeSecurityEvidence([evidence]);
  const proof = buildCandidateProofState({ securityEvidence: [evidence], securityEvidenceSummary: summary });
  assert.deepEqual(proof.safety.testedChecks, ["goplus.is_honeypot"]);
  assert.ok(!JSON.stringify(proof.safety.testedChecks).includes(ADDRESS));
  assert.equal(evidence.raw.holders[0].address, ADDRESS);
});

test("instant safety PASS cannot override unknown contract safety checks", () => {
  const proof = buildCandidateProofState({ instantSafetyStatus: "PASS", securityEvidenceSources: ["goplus"],
    testedChecks: ["goplus.is_honeypot"], unknownChecks: ["goplus.is_mintable"] });
  assert.equal(proof.safety.status, "PARTIAL");
  assert.deepEqual(proof.safety.unknownChecks, ["goplus.is_mintable"]);
});

test("contract authority safety recovery is priority bounded and de-duplicated", async () => {
  let providerCalls = 0;
  const projects = Array.from({ length: 1_500 }, (_, index) => ({
    symbol: `SAFE${index}`,
    chain: "base",
    tokenAddress: `0x${String(index + 1).padStart(40, "0")}`,
    researchOpportunityScore: 2_000 - index,
  }));
  projects[2].tokenAddress = projects[0].tokenAddress;

  const results = await analyzeContractAuthorityRiskBatch(projects, {
    collectSecurityEvidence: true,
    maxSecurityRecoveryCandidates: 25,
    securityEvidenceConcurrency: 2,
    securityEvidenceRequestTimeoutMs: 100,
    securityEvidence: {
      providers: [
        async () => {
          providerCalls += 1;
          return {
            provider: "mock-security",
            status: "EVIDENCE_AVAILABLE",
            verifiedSource: true,
            riskFindings: [],
            warnings: [],
            confidence: 90,
            observedAt: new Date().toISOString(),
          };
        },
      ],
    },
  });

  assert.equal(providerCalls, 25);
  assert.equal(results.filter((project) => project.safetyRecoveryAttempted).length, 25);
  assert.equal(results.filter((project) => project.safetyRecoveryDeferred).length, 1_475);
  assert.equal(results[0].safetyProofStatus, "SAFETY_VERIFIED_CLEAN");
  assert.equal(results[2].safetyRecoveryAttempted, false);
  assert.equal(results[2].safetyProofStatus, "SAFETY_UNKNOWN");
});

test("liquidity control risk flags LP removal and concentrated LP ownership", () => {
  const result = analyzeLiquidityControlRisk({
    symbol: "LPX",
    liquidityUsd: 18000,
    lpLockedPct: 0,
    lpBurnedPct: 0,
    ownerLpSharePct: 48,
    lpRemovalUsd: 75000,
    securityEvidenceSummary: { status: "UNKNOWN" },
  });

  assert.ok(result.liquidityControlRiskScore >= 75);
  assert.equal(result.liquidityControlVerdict, "BLOCK_LIQUIDITY_CONTROL");
  assert.ok(result.riskFlags.some((flag) => flag.includes("liquidity control")));
});
