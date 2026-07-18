import test from "node:test";
import assert from "node:assert/strict";

import { normalizeBlockscoutSecurityEvidence } from "../src/data/security/blockscoutConnector.js";
import { getFreeSecurityEvidence } from "../src/data/security/freeSecurityEvidenceConnector.js";
import { normalizeGoPlusTokenSecurity } from "../src/data/security/goplusSecurityConnector.js";
import { normalizeSourcifyContract } from "../src/data/security/sourcifyV2Connector.js";
import { summarizeSecurityEvidence } from "../src/data/security/securityEvidenceUtils.js";
import { analyzeContractAuthorityRisk } from "../src/engines/contractAuthorityRiskEngine.js";
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
