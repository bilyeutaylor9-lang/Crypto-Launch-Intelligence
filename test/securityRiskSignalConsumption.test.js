import test, { after, mock } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { normalizeBlockscoutSecurityEvidence } from "../src/data/security/blockscoutConnector.js";
import { analyzeInstantSafetyGate } from "../src/engines/instantSafetyGateEngine.js";

mock.method(globalThis, "fetch", async () => assert.fail("Live providers are forbidden in this test."));
after(() => mock.restoreAll());

const TOKEN = "0x5a7d6b2f92c77fad6ccabd7ee0624e64907eaf3e";
const IMPLEMENTATION = "0x4fcd824D304e9b1584CdBb582c104BDcbFb11274";
const CREATOR = "0x478A1eBE665396ce0F2F87aB0F057aC273451B92";
const META = { chain: "zksync", address: TOKEN };

// Reduced from the observed Blockscout ZKsync cache, not loaded from live data.
function cachedProxyPayload() {
  return {
    contract: {
      conflicting_implementations: null,
      creation_status: "success",
      implementations: [{ address_hash: IMPLEMENTATION, name: null }],
      proxy_type: "eip1967",
    },
    addressInfo: {
      hash: TOKEN,
      creator_address_hash: CREATOR,
      is_contract: true,
      is_verified: false,
      implementations: [{ address_hash: IMPLEMENTATION, name: null }],
      proxy_type: "eip1967",
    },
  };
}

function normalize(contract = {}, addressInfo = {}) {
  return normalizeBlockscoutSecurityEvidence(contract, { hash: TOKEN, ...addressInfo }, META);
}

test("cached Blockscout proxy risk preserves token identity without inventing source verification", () => {
  const payload = cachedProxyPayload();
  const original = structuredClone(payload);
  const result = normalizeBlockscoutSecurityEvidence(payload.contract, payload.addressInfo, META);
  assert.equal(result.proxy, true);
  assert.equal(result.implementationAddress, IMPLEMENTATION.toLowerCase());
  assert.equal(result.chain, "zksync");
  assert.equal(result.address, TOKEN);
  assert.notEqual(result.address, result.implementationAddress);
  assert.equal(result.creatorAddress, CREATOR.toLowerCase());
  assert.equal(result.verifiedSource, false);
  assert.equal(result.responseIdentityVerified, undefined);
  assert.equal(result.contractSafetyVerified, undefined);
  assert.ok(result.riskFindings.some((reason) => reason.includes("proxy")));
  assert.ok(result.warnings.some((reason) => reason.includes("did not confirm verified source")));
  assert.deepEqual(result.raw, payload);
  assert.deepEqual(payload, original);
});

for (const location of ["contract", "addressInfo"]) {
  test(`Blockscout ${location} proxy_type is risk evidence without an implementation`, () => {
    const payload = { contract: {}, addressInfo: {} };
    payload[location].proxy_type = "eip1967";
    const result = normalize(payload.contract, payload.addressInfo);
    assert.equal(result.proxy, true);
    assert.equal(result.implementationAddress, null);
    assert.equal(result.verifiedSource, false);
  });

  for (const field of ["address", "address_hash"]) {
    test(`Blockscout ${location} implementations[].${field} establishes indirection, not token identity`, () => {
      const payload = { contract: {}, addressInfo: {} };
      payload[location].implementations = [null, { [field]: "bad-address" }, { [field]: IMPLEMENTATION }];
      const result = normalize(payload.contract, payload.addressInfo);
      assert.equal(result.proxy, true);
      assert.equal(result.implementationAddress, IMPLEMENTATION.toLowerCase());
      assert.equal(result.address, TOKEN);
      assert.equal(result.verifiedSource, false);
    });
  }
}

test("Blockscout retains existing proxy flags and scalar implementation forms", () => {
  for (const [contract, addressInfo] of [
    [{ is_proxy: true }, {}],
    [{}, { is_proxy: "1" }],
    [{ implementation_address: IMPLEMENTATION }, {}],
    [{}, { implementation_address: IMPLEMENTATION }],
  ]) {
    const result = normalize(contract, addressInfo);
    assert.equal(result.proxy, true);
    assert.equal(result.verifiedSource, false);
    assert.ok(result.riskFindings.some((reason) => reason.includes("proxy")));
    assert.equal(result.implementationAddress,
      contract.implementation_address || addressInfo.implementation_address ? IMPLEMENTATION.toLowerCase() : null);
  }
});

test("Blockscout skips invalid implementation pointers rather than hiding a valid fallback", () => {
  const result = normalize({
    implementation_address: "not-an-address",
    implementations: [{ address: "0x1234", address_hash: IMPLEMENTATION }],
  });
  assert.equal(result.implementationAddress, IMPLEMENTATION.toLowerCase());
  assert.equal(result.proxy, true);
  assert.equal(result.verifiedSource, false);
});

test("Blockscout false flags cannot mask a valid observed implementation", () => {
  const result = normalize({ is_proxy: false, proxy_type: null }, {
    is_proxy: false, proxy_type: "none", implementations: [{ address_hash: IMPLEMENTATION }],
  });
  assert.equal(result.proxy, true);
  assert.equal(result.implementationAddress, IMPLEMENTATION.toLowerCase());
  assert.equal(result.verifiedSource, false);
});

test("Blockscout malformed legacy indirection stays risky without exposing a fabricated address", () => {
  const result = normalize({ implementation_address: "invalid-provider-pointer" });
  assert.equal(result.implementationAddress, null);
  assert.equal(result.proxy, true);
  assert.ok(result.riskFindings.some((reason) => reason.includes("proxy")));
  assert.equal(result.verifiedSource, false);
});

test("Blockscout exposes no implementation for malformed or zero scalar addresses", () => {
  for (const value of [null, undefined, "", "null", "unknown", "0x1234", "0x" + "g".repeat(40),
    "0x" + "0".repeat(40), 123, {}, [IMPLEMENTATION]]) {
    const result = normalize({ is_proxy: true, implementation_address: value });
    assert.equal(result.implementationAddress, null, String(value));
    assert.equal(result.proxy, true);
    assert.equal(result.verifiedSource, false);
  }
});

test("Blockscout missing and malformed implementation lists cannot fabricate an address", () => {
  for (const implementations of [undefined, null, {}, "unknown", [], [null], [{ address_hash: null }],
    [{ address_hash: "bad-address" }], [{ address: "0x" + "0".repeat(40) }]]) {
    const result = normalize({ implementations });
    assert.equal(result.implementationAddress, null);
    assert.equal(result.proxy, false);
    assert.equal(result.verifiedSource, false);
  }
});

test("Blockscout null and placeholder proxy types do not invent observed proxy risk", () => {
  for (const proxy_type of [undefined, null, "", " ", "null", " NULL ", "undefined", "none", "unknown", "false", "0",
    false, true, 1, {}, ["eip1967"]]) {
    const result = normalize({ proxy_type }, { proxy_type });
    assert.equal(result.proxy, false, String(proxy_type));
    assert.equal(result.implementationAddress, null);
    assert.equal(result.verifiedSource, false);
  }
});

test("Blockscout observed proxy risk does not suppress an independently verified source flag", () => {
  const result = normalize({ is_verified: true, proxy_type: "eip1967" });
  assert.equal(result.verifiedSource, true);
  assert.equal(result.proxy, true);
  assert.equal(result.implementationAddress, null);
});

test("Blockscout absence of contract metadata remains UNKNOWN, never clean", () => {
  const result = normalizeBlockscoutSecurityEvidence({}, {}, META);
  assert.equal(result.status, "UNKNOWN");
  assert.notEqual(result.verifiedSource, true);
  assert.equal(result.address, TOKEN);
});

function checkCachedEvidence(t, provider, value, assertions) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "blockscout-risk-cache-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const moduleUrl = new URL("../src/data/security/blockscoutConnector.js", import.meta.url).href;
  const utilsUrl = new URL("../src/data/security/securityEvidenceUtils.js", import.meta.url).href;
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", `
    import assert from "node:assert/strict";
    import fs from "node:fs";
    Date.now = () => Date.parse("2026-10-18T08:20:00.000Z");
    let networkCalls = 0;
    globalThis.fetch = async () => { networkCalls++; assert.fail("Network access is forbidden."); };
    const { getBlockscoutSecurityEvidence, getBlockscoutDeployerEvidence } = await import(${JSON.stringify(moduleUrl)});
    const { getCachedSecurityEvidence } = await import(${JSON.stringify(utilsUrl)});
    const provider = ${JSON.stringify(provider)};
    const original = ${JSON.stringify(value)};
    const entry = { cachedAt: "2026-10-18T06:37:25.021Z",
      cachedAtMs: Date.parse("2026-10-18T06:37:25.021Z"), value: original };
    const key = provider + ":zksync:" + ${JSON.stringify(TOKEN)};
    fs.mkdirSync("data");
    const bytes = JSON.stringify({ [key]: entry });
    fs.writeFileSync("data/security-evidence-cache.json", bytes);
    const collect = provider === "blockscout" ? getBlockscoutSecurityEvidence : getBlockscoutDeployerEvidence;
    const read = () => collect({ chain: "zksync", tokenAddress: ${JSON.stringify(TOKEN)} });
    ${assertions}
    assert.equal(networkCalls, 0);
    assert.equal(fs.readFileSync("data/security-evidence-cache.json", "utf8"), bytes);
  `], { cwd: dir, env: {}, encoding: "utf8", timeout: 10_000 });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
}

function legacyCachedProxy(provider) {
  return {
    provider,
    status: "EVIDENCE_AVAILABLE",
    observedAt: "2026-10-18T06:37:25.020Z",
    sourceTimestamp: "2026-10-18T06:37:24.000Z",
    chain: "zksync",
    address: TOKEN,
    verifiedSource: false,
    proxy: false,
    implementationAddress: null,
    riskFindings: [],
    warnings: ["Blockscout did not confirm verified source code."],
    confidence: 48,
    raw: cachedProxyPayload(),
  };
}

for (const provider of ["blockscout", "blockscout-deployer"]) {
  test(`${provider} re-parses cached proxy risk without refreshing timestamps or cache bytes`, (t) => {
    checkCachedEvidence(t, provider, legacyCachedProxy(provider), `
      const result = await read();
      assert.equal(result.proxy, true);
      assert.equal(result.implementationAddress, ${JSON.stringify(IMPLEMENTATION.toLowerCase())});
      assert.equal(result.observedAt, original.observedAt);
      assert.equal(result.sourceTimestamp, original.sourceTimestamp);
      assert.equal(result.address, original.address);
      assert.equal(result.chain, original.chain);
      assert.equal(result.provider, provider);
      assert.equal(result.verifiedSource, false);
      assert.equal(result.confidence, original.confidence);
      assert.ok(result.riskFindings.some((reason) => reason.includes("proxy")));
      assert.deepEqual(result.raw, original.raw);
      assert.deepEqual(await read(), result);
    `);
  });

  test(`${provider} never invents a missing source timestamp on cache reuse`, (t) => {
    const value = legacyCachedProxy(provider);
    delete value.sourceTimestamp;
    checkCachedEvidence(t, provider, value, `
      const result = await read();
      assert.equal(result.proxy, true);
      assert.equal(result.observedAt, original.observedAt);
      assert.equal(Object.hasOwn(result, "sourceTimestamp"), false);
    `);
  });

  test(`${provider} UNKNOWN cached evidence is not upgraded from retained raw fields`, (t) => {
    const value = legacyCachedProxy(provider);
    value.status = "UNKNOWN";
    value.raw.contract.is_verified = true;
    checkCachedEvidence(t, provider, value, `assert.deepEqual(await read(), original);`);
  });

  test(`${provider} rejects mismatched identity and malformed cached raw records`, (t) => {
    const other = "0x1111111111111111111111111111111111111111";
    for (const patch of [
      { provider: "sourcify-v2" }, { chain: "base" }, { address: other }, { address: null },
      { raw: null }, { raw: [] }, { raw: { contract: null, addressInfo: { hash: TOKEN } } },
      { raw: { contract: {}, addressInfo: {} } },
      { raw: { ...cachedProxyPayload(), addressInfo: { hash: other } } },
      { raw: { ...cachedProxyPayload(), contract: { hash: other, proxy_type: "eip1967" } } },
    ]) {
      checkCachedEvidence(t, provider, { ...legacyCachedProxy(provider), ...patch }, `
        const result = await read();
        assert.equal(result.status, "UNKNOWN");
        assert.notEqual(result.verifiedSource, true);
        assert.notEqual(result.proxy, true);
        assert.equal(result.implementationAddress ?? null, null);
        assert.equal(result.observedAt, original.observedAt);
        assert.equal(result.sourceTimestamp, original.sourceTimestamp);
      `);
    }
  });

  test(`${provider} cache re-parsing cannot upgrade source verification or remove existing risks`, (t) => {
    const value = legacyCachedProxy(provider);
    value.raw.contract.is_verified = true;
    value.mintRisk = true;
    value.riskFindings = ["Existing observed authority risk."];
    checkCachedEvidence(t, provider, value, `
      const result = await read();
      assert.equal(result.proxy, true);
      assert.equal(result.verifiedSource, false);
      assert.equal(result.mintRisk, true);
      assert.ok(result.riskFindings.includes("Existing observed authority risk."));
      assert.deepEqual(result.warnings, original.warnings);
      assert.equal(result.observedAt, original.observedAt);
      assert.equal(result.sourceTimestamp, original.sourceTimestamp);
    `);
  });

  test(`${provider} invalid observation timestamps remain cache misses, not refreshed proof`, (t) => {
    for (const observedAt of [null, "invalid", "2026-10-18T09:00:00.000Z", "2026-10-17T01:00:00.000Z"]) {
      checkCachedEvidence(t, provider, { ...legacyCachedProxy(provider), observedAt }, `
        assert.equal(getCachedSecurityEvidence(provider, "zksync", ${JSON.stringify(TOKEN)}), null);
      `);
    }
  });
}

for (const [canonicalField, check, reason, identity, source] of [
  ["mintAuthorityEnabled", "mintAuthority", "mint authority active",
    { chain: "bsc", tokenAddress: "0xc07e1300dc138601fa6b0b59f8d0fa477e690589" }, "goplus"],
  ["freezeAuthorityEnabled", "pauseAuthority", "pause authority active",
    { chain: "solana", tokenAddress: "E6vtwCUtcNJdQEPGY8vWKahtu2sfwxQ4j68pUKm7pump" }, "solana-rpc-rugcheck"],
]) {
  test(`Instant Safety consumes observed ${canonicalField} without promoting the candidate`, () => {
    const project = {
      ...identity,
      [canonicalField]: true,
      fieldProvenance: { [canonicalField]: { source, verificationStatus: "VERIFIED_PROVIDER_OBSERVATION" } },
    };
    const original = structuredClone(project);
    const result = analyzeInstantSafetyGate(project);
    assert.equal(result.instantSafetyGate.checks[check], true);
    assert.equal(result.instantSafetyStatus, "RESTRICTED");
    assert.ok(result.instantSafetyGate.restrictedReasons.includes(reason));
    assert.equal(result.instantSafetyGate.hardCapTier, "Research Only");
    assert.equal(result.contractSafetyVerified, undefined);
    assert.equal(result.tokenAddress, project.tokenAddress);
    assert.deepEqual(project, original);
  });

  test(`Instant Safety ${canonicalField} false, null or unproven values never establish PASS`, () => {
    for (const value of [undefined, null, false, 0, 1, "", "false", "true", "1", "unknown", {}, []]) {
      const result = analyzeInstantSafetyGate({ [canonicalField]: value });
      assert.equal(result.instantSafetyGate.checks[check], false, String(value));
      assert.equal(result.instantSafetyStatus, "UNVERIFIED");
      assert.equal(result.instantSafetyGate.hardCapTier, "Watch Only");
    }
    const result = analyzeInstantSafetyGate({ [canonicalField]: false,
      fieldProvenance: { [canonicalField]: { source: "goplus" } } });
    assert.equal(result.instantSafetyStatus, "UNVERIFIED");
  });

  test(`Instant Safety ${canonicalField} cannot be masked by legacy false flags or clean simulation`, () => {
    const result = analyzeInstantSafetyGate({
      [canonicalField]: true,
      mintAuthority: false,
      canMint: false,
      pauseAuthority: false,
      canPause: false,
      buySimulationPassed: true,
      sellSimulationPassed: true,
      ownerRenounced: true,
      lpLocked: true,
    });
    assert.equal(result.instantSafetyStatus, "RESTRICTED");
    assert.ok(result.instantSafetyGate.restrictedReasons.includes(reason));
  });
}

test("Instant Safety canonical false values cannot weaken existing restrictions or critical blocks", () => {
  for (const legacy of [
    { mintAuthority: true }, { canMint: "1" }, { pauseAuthority: true }, { canPause: "enabled" },
    { proxyUpgradeable: true }, { liquidityRemovalCapability: true }, { buyTaxPct: 20 },
    { blacklistAuthority: true }, { hiddenTransferRestriction: true }, { sellSimulationPassed: false },
  ]) {
    const before = analyzeInstantSafetyGate(legacy);
    const after = analyzeInstantSafetyGate({ ...legacy, mintAuthorityEnabled: false, freezeAuthorityEnabled: false });
    assert.equal(after.instantSafetyStatus, before.instantSafetyStatus);
    assert.equal(after.instantSafetyRiskScore, before.instantSafetyRiskScore);
    assert.deepEqual(after.instantSafetyGate.criticalReasons, before.instantSafetyGate.criticalReasons);
    assert.deepEqual(after.instantSafetyGate.restrictedReasons, before.instantSafetyGate.restrictedReasons);
  }
});

test("Instant Safety active mint and freeze authorities preserve critical precedence and existing weights", () => {
  const result = analyzeInstantSafetyGate({ mintAuthorityEnabled: true, freezeAuthorityEnabled: true,
    sellSimulationPassed: false });
  const legacy = analyzeInstantSafetyGate({ mintAuthority: true, pauseAuthority: true, sellSimulationPassed: false });
  assert.equal(result.instantSafetyStatus, "CRITICAL");
  assert.equal(result.instantSafetyRiskScore, legacy.instantSafetyRiskScore);
  assert.deepEqual(result.instantSafetyGate.restrictedReasons, ["mint authority active", "pause authority active"]);
  assert.equal(result.instantSafetyGate.hardCapTier, "Do Not Promote");
});

test("Instant Safety retains existing simulation-based qualification without inventing canonical proof", () => {
  const result = analyzeInstantSafetyGate({ buySimulationPassed: true, sellSimulationPassed: true });
  assert.equal(result.instantSafetyStatus, "PASS");
  assert.equal(result.mintAuthorityEnabled, undefined);
  assert.equal(result.freezeAuthorityEnabled, undefined);
  assert.equal(result.contractSafetyVerified, undefined);
});
