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
import { normalizeGoPlusTokenSecurity } from "../src/data/security/goplusSecurityConnector.js";
import { normalizeSourcifyContract } from "../src/data/security/sourcifyV2Connector.js";
import { summarizeSecurityEvidence } from "../src/data/security/securityEvidenceUtils.js";
import {
  analyzeContractAuthorityRisk,
  analyzeContractAuthorityRiskBatch,
} from "../src/engines/contractAuthorityRiskEngine.js";
import { analyzeLiquidityControlRisk } from "../src/engines/liquidityControlRiskEngine.js";

const ADDRESS = "0x1111111111111111111111111111111111111111";

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

test("Sourcify normalizer treats exact matches as verified source evidence", () => {
  const result = normalizeSourcifyContract(
    {
      match: "exact_match",
      creationMatch: "perfect",
      runtimeMatch: "perfect",
    },
    { chain: "base", address: ADDRESS }
  );

  assert.equal(result.status, "EVIDENCE_AVAILABLE");
  assert.equal(result.verifiedSource, true);
  assert.equal(result.exactMatch, true);
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

test("Blockscout deployer recovery uses exact address metadata without contract source lookup", async () => {
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
    assert.equal(requestedUrls.length, 1);
    assert.match(requestedUrls[0], new RegExp(`/api/v2/addresses/${ADDRESS}$`, "i"));
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
